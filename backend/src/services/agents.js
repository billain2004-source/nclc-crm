// AI agents. Every agent: loads a record the user can access -> builds a minimal input ->
// calls llmRouter.callLLM -> validates the JSON answer -> stores an agent_runs row with the
// PROPOSED changes (status pending_approval). Nothing touches CRM data until a user approves.
const { pool } = require('../db');
const { HttpError, ROLES } = require('../utils');
const { callLLM } = require('./llmRouter');

// ---------------- helpers ----------------
const daysBetween = (a, b = new Date()) => (a ? Math.round((b - new Date(String(a).replace(' ', 'T') + (String(a).length <= 10 ? 'T00:00:00Z' : 'Z'))) / 86400000) : null);
const sqlNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const strList = (v, max = 5) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split('\n') : [])
  .map((s) => String(s).replace(/^[-*•\s]+/, '').trim()).filter(Boolean).slice(0, max).map((s) => s.slice(0, 240));

function parseJsonLoose(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The AI reply did not contain a JSON object');
  return JSON.parse(t.slice(start, end + 1));
}

const SENIOR = /\b(ceo|cfo|cto|coo|cio|chief|founder|owner|president|vp|vice president|director|head)\b/i;

// ---------------- entity loaders (enforce firm + team-user scope) ----------------
async function loadLead(req, id) {
  const tu = req.user.role === ROLES.TU;
  const [[l]] = await pool.query(
    `SELECT l.*, CONCAT(l.first_name, ' ', l.last_name) AS full_name, u.name AS owner_name
       FROM leads l LEFT JOIN users u ON u.id = l.owner_id
      WHERE l.id = ? AND l.firm_id = ?${tu ? ' AND l.owner_id = ?' : ''}`, [id, req.firmId, ...(tu ? [req.user.id] : [])]);
  if (!l) throw new HttpError(404, 'Lead not found (or you do not have access to it)');
  return { ...l, _label: `${l.full_name}${l.company_name ? ` · ${l.company_name}` : ''}` };
}

async function loadDeal(req, id) {
  const tu = req.user.role === ROLES.TU;
  const [[d]] = await pool.query(
    `SELECT d.*, s.name AS stage_name, s.is_won, s.is_lost, c.name AS company_name, c.industry AS company_industry,
            CONCAT(ct.first_name, ' ', ct.last_name) AS contact_name, ct.email AS contact_email, ct.job_title AS contact_title,
            u.name AS owner_name
       FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id
       LEFT JOIN companies c ON c.id = d.company_id LEFT JOIN contacts ct ON ct.id = d.contact_id LEFT JOIN users u ON u.id = d.owner_id
      WHERE d.id = ? AND d.firm_id = ?${tu ? ' AND d.owner_id = ?' : ''}`, [id, req.firmId, ...(tu ? [req.user.id] : [])]);
  if (!d) throw new HttpError(404, 'Deal not found (or you do not have access to it)');
  const [tasks] = await pool.query(
    'SELECT title, type, status, priority, due_date FROM tasks WHERE deal_id = ? AND firm_id = ? ORDER BY due_date IS NULL, due_date LIMIT 20', [id, req.firmId]);
  return { ...d, tasks, _label: d.name };
}

const LOADERS = { lead: loadLead, deal: loadDeal };

// ---------------- agent definitions ----------------
const JSON_RULE = 'Reply with ONLY a JSON object, no markdown fences and no text before or after it.';

const leadScoring = {
  code: 'lead_scoring',
  name: 'Lead scoring',
  description: 'Scores a lead 0-100 for fit and buying intent, with reasons and a suggested next action.',
  entities: ['lead'],
  taskType: 'text',
  writes: 'leads.score (after approval)',
  editable: ['score', 'rating', 'next_action'],
  buildInput(l) {
    return {
      lead: {
        job_title: l.job_title, company_name: l.company_name, source: l.source, status: l.status, current_score: l.score,
        estimated_value: l.estimated_value, currency: l.currency_code, country: l.country_code,
        has_email: !!l.email, has_phone: !!l.phone, notes: l.notes ? String(l.notes).slice(0, 1000) : null,
        days_since_created: daysBetween(l.created_at), days_since_updated: daysBetween(l.updated_at),
      },
    };
  },
  system: 'You are a B2B sales lead-scoring assistant inside a CRM. Score each lead from 0 to 100 for fit and buying intent, using seniority of the job title, completeness of contact data, lead source quality, qualification status, estimated deal value and recency. Be calibrated: 80+ = hot, 50-79 = warm, below 50 = cold.',
  prompt: (input) => `Score this lead.\n${JSON.stringify(input)}\n\n${JSON_RULE}\nShape: {"score": <integer 0-100>, "rating": "hot" | "warm" | "cold", "reasons": [<up to 4 short reasons>], "next_action": "<one concrete next step>"}`,
  mock(input) {
    const l = input.lead;
    let s = 20; const reasons = [];
    if (SENIOR.test(l.job_title || '')) { s += 20; reasons.push(`Senior decision-maker (${l.job_title})`); }
    if (l.has_email) s += 8; if (l.has_phone) s += 7;
    if (l.has_email && l.has_phone) reasons.push('Complete contact details');
    const src = String(l.source || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'); // lookup code (v1 stored labels)
    if (['referral', 'partner'].includes(src)) { s += 15; reasons.push(`High-intent source: ${l.source}`); } else if (['website', 'webinar', 'trade_show'].includes(src)) { s += 8; reasons.push(`Inbound source: ${l.source}`); }
    const statusPts = { qualified: 15, contacted: 6, new: 0, unqualified: -30 }[l.status] ?? 0;
    s += statusPts; if (statusPts) reasons.push(`Status is ${l.status}`);
    if (Number(l.estimated_value) > 0) { const v = Math.min(15, Math.round(Math.log10(Number(l.estimated_value)) * 3)); s += v; }
    if (l.days_since_updated > 30) { s -= 10; reasons.push(`No update for ${l.days_since_updated} days`); }
    const score = clampInt(s, 0, 100);
    const rating = score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold';
    const next = rating === 'hot' ? 'Call this week to book a demo and confirm budget.' : rating === 'warm' ? 'Send a tailored case study and propose a discovery call.' : 'Add to a nurture sequence and re-check in 30 days.';
    return JSON.stringify({ score, rating, reasons: reasons.slice(0, 4), next_action: next });
  },
  validate(o) {
    const score = clampInt(o.score, 0, 100);
    const rating = ['hot', 'warm', 'cold'].includes(String(o.rating).toLowerCase()) ? String(o.rating).toLowerCase() : score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold';
    return { score, rating, reasons: strList(o.reasons, 4), next_action: String(o.next_action || '').slice(0, 300) };
  },
  propose(out, l) {
    return [{ op: 'update', table: 'leads', id: l.id, set: { score: out.score }, summary: `Change lead score from ${l.score} to ${out.score}` }];
  },
};

const followupEmail = {
  code: 'followup_email',
  name: 'Follow-up email draft',
  description: 'Drafts a short, personalised follow-up email for a lead or deal. On approval it is saved as an Email task with the draft, ready to send.',
  entities: ['lead', 'deal'],
  taskType: 'text',
  writes: 'new tasks row (type email) with the draft (after approval); no email is sent',
  editable: ['subject', 'body'],
  buildInput(e, req, entityType) {
    const sender = { name: req.user.name };
    if (entityType === 'lead') {
      return {
        kind: 'lead', sender,
        recipient: { first_name: e.first_name, job_title: e.job_title, company: e.company_name },
        context: { status: e.status, source: e.source, notes: e.notes ? String(e.notes).slice(0, 800) : null, estimated_value: e.estimated_value, currency: e.currency_code },
      };
    }
    return {
      kind: 'deal', sender,
      recipient: { first_name: e.contact_name ? e.contact_name.split(' ')[0] : null, job_title: e.contact_title, company: e.company_name },
      context: {
        deal: e.name, stage: e.stage_name, amount: e.amount, currency: e.currency_code, expected_close_date: e.expected_close_date,
        open_tasks: e.tasks.filter((t) => t.status !== 'done').map((t) => t.title).slice(0, 5),
      },
    };
  },
  system: 'You write concise, friendly, professional B2B sales follow-up emails for a CRM user. 80-150 words, plain text, one clear call to action, no invented facts, prices or promises. Sign off with the sender\'s name.',
  prompt: (input) => `Draft a follow-up email.\n${JSON.stringify(input)}\n\n${JSON_RULE}\nShape: {"subject": "<max 80 chars>", "body": "<plain-text email>"}`,
  mock(input) {
    const r = input.recipient; const c = input.context; const hi = `Hi ${r.first_name || 'there'},`;
    const subject = input.kind === 'deal' ? `Next steps on ${c.deal}` : `Following up${r.company ? ` - ${r.company}` : ''}`;
    const middle = input.kind === 'deal'
      ? `Thanks again for your time on ${c.deal}. We're currently at the ${c.stage} stage, and I'd like to make sure we have everything you need to move forward${c.expected_close_date ? ` ahead of ${c.expected_close_date}` : ''}.${c.open_tasks.length ? ` On our side, next up is: ${c.open_tasks[0].toLowerCase()}.` : ''}`
      : `I wanted to follow up on your recent interest${r.company ? ` on behalf of ${r.company}` : ''}. Based on what we know so far, I think we could help${r.job_title ? ` with the priorities a ${r.job_title} usually has` : ''}.`;
    const body = `${hi}\n\n${middle}\n\nWould you have 20 minutes this week for a quick call? Let me know a time that suits you.\n\nBest regards,\n${input.sender.name}`;
    return JSON.stringify({ subject, body });
  },
  validate(o) {
    const subject = String(o.subject || '').trim().slice(0, 150);
    const body = String(o.body || '').trim().slice(0, 5000);
    if (!subject || !body) throw new Error('The AI reply is missing a subject or body');
    return { subject, body };
  },
  propose(out, e, req, entityType) {
    const due = new Date(); due.setUTCDate(due.getUTCDate() + 1); due.setUTCHours(9, 0, 0, 0);
    const to = entityType === 'lead' ? e.email : e.contact_email;
    return [{
      op: 'insert', table: 'tasks',
      set: {
        title: `Send email: ${out.subject}`.slice(0, 200), type: 'email', priority: 'medium', status: 'open',
        description: `To: ${to || '(no email address on file)'}\nSubject: ${out.subject}\n\n${out.body}\n\n(Drafted by AI, approved in NCLC CRM. Not sent automatically.)`,
        due_date: due.toISOString().slice(0, 19).replace('T', ' '),
        contact_id: entityType === 'deal' ? e.contact_id || null : null, deal_id: entityType === 'deal' ? e.id : null,
      },
      summary: `Create an Email task "${out.subject}" due tomorrow, assigned to the approver`,
    }];
  },
};

const dealSummary = {
  code: 'deal_summary',
  name: 'Deal summary & risk',
  description: 'Summarises a deal, rates its risk (low/medium/high), lists risks and next steps. On approval the summary is appended to the deal description.',
  entities: ['deal'],
  taskType: 'text',
  writes: 'deals.description - summary appended (after approval)',
  editable: ['summary', 'risk_level', 'risks', 'next_steps'],
  buildInput(d) {
    const open = d.tasks.filter((t) => t.status !== 'done');
    return {
      deal: {
        name: d.name, stage: d.stage_name, status: d.status, probability: d.probability, amount: d.amount, currency: d.currency_code,
        expected_close_date: d.expected_close_date, days_to_close: d.expected_close_date ? -daysBetween(d.expected_close_date) : null,
        days_since_updated: daysBetween(d.updated_at), company: d.company_name, industry: d.company_industry,
        has_primary_contact: !!d.contact_name, contact_title: d.contact_title, description: d.description ? String(d.description).slice(0, 1500) : null,
      },
      tasks: {
        open: open.length, overdue: open.filter((t) => t.due_date && daysBetween(t.due_date) > 0).length, done: d.tasks.length - open.length,
        items: d.tasks.slice(0, 10).map((t) => ({ title: t.title, type: t.type, status: t.status, due: t.due_date })),
      },
    };
  },
  system: 'You are a sales-operations analyst. Summarise CRM deals for a sales manager in plain English and flag risks honestly. Use only the data given.',
  prompt: (input) => `Summarise this deal and assess its risk.\n${JSON.stringify(input)}\n\n${JSON_RULE}\nShape: {"summary": "<2-4 sentences>", "risk_level": "low" | "medium" | "high", "risks": [<up to 4 short risks>], "next_steps": [<up to 4 concrete next steps>]}`,
  mock(input) {
    const d = input.deal; const t = input.tasks; const risks = []; let pts = 0;
    if (d.status !== 'open') {
      return JSON.stringify({ summary: `${d.name} is closed (${d.status}) at ${d.stage}. Amount ${d.amount} ${d.currency}.`, risk_level: 'low', risks: [], next_steps: d.status === 'won' ? ['Hand over to onboarding', 'Ask for a referral'] : ['Record the loss reason', 'Plan a re-engagement in 6 months'] });
    }
    if (t.overdue) { pts += 2; risks.push(`${t.overdue} overdue task(s)`); }
    if (d.days_to_close !== null && d.days_to_close < 0) { pts += 2; risks.push(`Expected close date passed ${-d.days_to_close} day(s) ago`); }
    else if (d.days_to_close !== null && d.days_to_close <= 14 && d.probability < 50) { pts += 2; risks.push(`Closes in ${d.days_to_close} days but only ${d.probability}% likely`); }
    if (!d.has_primary_contact) { pts += 1; risks.push('No primary contact linked'); }
    if (d.days_since_updated > 21) { pts += 1; risks.push(`No activity for ${d.days_since_updated} days`); }
    if (!t.open) { pts += 1; risks.push('No open next-step task'); }
    const risk_level = pts >= 3 ? 'high' : pts >= 1 ? 'medium' : 'low';
    const summary = `${d.name}${d.company ? ` with ${d.company}` : ''} is in ${d.stage} (${d.probability}% probability) for ${d.amount} ${d.currency}${d.expected_close_date ? `, expected to close ${d.expected_close_date}` : ''}. There are ${t.open} open and ${t.done} completed task(s).`;
    const next_steps = [
      ...(t.overdue ? ['Clear the overdue tasks this week'] : []),
      ...(!d.has_primary_contact ? ['Link the main decision-maker as primary contact'] : []),
      ...(d.days_to_close !== null && d.days_to_close < 0 ? ['Agree a realistic new close date with the customer'] : []),
      'Confirm budget, timeline and decision process with the buyer',
    ].slice(0, 4);
    return JSON.stringify({ summary, risk_level, risks: risks.slice(0, 4), next_steps });
  },
  validate(o) {
    const summary = String(o.summary || '').trim().slice(0, 1500);
    if (!summary) throw new Error('The AI reply is missing the summary');
    const risk_level = ['low', 'medium', 'high'].includes(String(o.risk_level).toLowerCase()) ? String(o.risk_level).toLowerCase() : 'medium';
    return { summary, risk_level, risks: strList(o.risks, 4), next_steps: strList(o.next_steps, 4) };
  },
  propose(out, d, req) {
    const lines = [
      `[AI deal summary · ${sqlNow().slice(0, 10)} · approved by ${req.user.name}]`,
      `Risk: ${out.risk_level.toUpperCase()}`,
      out.summary,
      ...(out.risks.length ? ['Risks:', ...out.risks.map((r) => `- ${r}`)] : []),
      ...(out.next_steps.length ? ['Next steps:', ...out.next_steps.map((r) => `- ${r}`)] : []),
    ];
    return [{ op: 'append', table: 'deals', id: d.id, column: 'description', text: lines.join('\n'), summary: 'Append the AI summary to the deal description' }];
  },
};

const AGENTS = Object.fromEntries([leadScoring, followupEmail, dealSummary].map((a) => [a.code, a]));

function publicAgent(a) {
  return { code: a.code, name: a.name, description: a.description, entities: a.entities, task_type: a.taskType, writes: a.writes, editable: a.editable };
}

// ---------------- run / approve / reject ----------------
function formatRun(r) {
  if (!r) return r;
  const parse = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);
  return {
    ...r, input_json: parse(r.input_json), output_json: parse(r.output_json), proposed_changes: parse(r.proposed_changes), attempts_json: parse(r.attempts_json),
    agent_name: AGENTS[r.agent]?.name || r.agent,
  };
}

const RUN_SELECT = `SELECT r.*, cu.name AS created_by_name, ru.name AS reviewed_by_name
  FROM agent_runs r LEFT JOIN users cu ON cu.id = r.created_by LEFT JOIN users ru ON ru.id = r.reviewed_by`;

async function loadRun(req, id) {
  const tu = req.user.role === ROLES.TU;
  const [[r]] = await pool.query(`${RUN_SELECT} WHERE r.id = ? AND r.firm_id = ?${tu ? ' AND r.created_by = ?' : ''}`, [id, req.firmId, ...(tu ? [req.user.id] : [])]);
  if (!r) throw new HttpError(404, 'Agent run not found');
  return formatRun(r);
}

async function runAgent(req, code, entityType, entityId) {
  const def = AGENTS[code];
  if (!def) throw new HttpError(404, 'Unknown agent');
  if (!def.entities.includes(entityType)) throw new HttpError(400, `${def.name} works on: ${def.entities.join(', ')}`);
  const entity = await LOADERS[entityType](req, entityId);
  const input = def.buildInput(entity, req, entityType);

  const row = {
    firm_id: req.firmId, agent: code, entity_type: entityType, entity_id: entity.id, entity_label: String(entity._label || '').slice(0, 200),
    task_type: def.taskType, input_json: JSON.stringify(input), created_by: req.user.id,
  };
  const t0 = Date.now();
  try {
    const out = await callLLM(def.taskType, {
      system: def.system, prompt: def.prompt(input), maxTokens: 2000, mock: () => def.mock(input),
    }, { firmId: req.firmId, userId: req.user.id, source: `agent:${code}` });
    Object.assign(row, {
      key_id: out.key.id, key_name: out.key.name, provider: out.key.provider, model: out.model,
      attempts_json: JSON.stringify(out.attempts), latency_ms: Date.now() - t0,
    });
    let parsed;
    try {
      parsed = def.validate(parseJsonLoose(out.text));
    } catch (e) {
      row.status = 'failed';
      row.error = `Could not use the AI reply: ${e.message}`.slice(0, 500);
      row.output_json = JSON.stringify({ raw: String(out.text || '').slice(0, 4000) });
    }
    if (parsed) {
      row.status = 'pending_approval';
      row.output_json = JSON.stringify(parsed);
      row.proposed_changes = JSON.stringify(def.propose(parsed, entity, req, entityType));
    }
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    Object.assign(row, { status: 'failed', error: e.message.slice(0, 500), attempts_json: e.attempts ? JSON.stringify(e.attempts) : null, latency_ms: Date.now() - t0 });
  }
  const [r] = await pool.query('INSERT INTO agent_runs SET ?', [row]);
  return loadRun(req, r.insertId);
}

function canReview(req, run) {
  return run.created_by === req.user.id || [ROLES.SA, ROLES.FA, ROLES.MG].includes(req.user.role);
}

async function approveRun(req, id, { output, note } = {}) {
  const run = await loadRun(req, id);
  if (run.status !== 'pending_approval') throw new HttpError(400, `This run is ${run.status.replace('_', ' ')} and cannot be approved`);
  if (!canReview(req, run)) throw new HttpError(403, 'Only the person who ran the agent or a Manager/Admin can approve it');
  const def = AGENTS[run.agent];
  const entity = await LOADERS[run.entity_type](req, run.entity_id); // re-checks access, uses fresh data

  let final = run.output_json;
  if (output && typeof output === 'object') {
    const edited = { ...final };
    for (const f of def.editable) if (output[f] !== undefined) edited[f] = output[f];
    try { final = def.validate(edited); } catch (e) { throw new HttpError(400, e.message); }
  }
  const changes = def.propose(final, entity, req, run.entity_type);

  const conn = await pool.getConnection();
  const applied = [];
  try {
    await conn.beginTransaction();
    for (const c of changes) {
      if (c.op === 'update') {
        await conn.query(`UPDATE ${c.table} SET ? WHERE id = ? AND firm_id = ?`, [c.set, c.id, req.firmId]);
        applied.push(`${c.table} #${c.id} updated`);
      } else if (c.op === 'append') {
        await conn.query(`UPDATE ${c.table} SET ${c.column} = CONCAT(COALESCE(${c.column}, ''), IF(COALESCE(${c.column}, '') = '', '', '\n\n'), ?) WHERE id = ? AND firm_id = ?`, [c.text, c.id, req.firmId]);
        applied.push(`${c.table} #${c.id} ${c.column} appended`);
      } else if (c.op === 'insert') {
        const [ins] = await conn.query(`INSERT INTO ${c.table} SET ?`, [{ ...c.set, firm_id: req.firmId, assigned_to: req.user.id, created_by: req.user.id }]);
        applied.push(`${c.table} #${ins.insertId} created`);
      }
    }
    await conn.query(
      `UPDATE agent_runs SET status = 'approved', output_json = ?, proposed_changes = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ?, applied_result = ?
        WHERE id = ? AND status = 'pending_approval'`,
      [JSON.stringify(final), JSON.stringify(changes), req.user.id, note ? String(note).slice(0, 255) : null, applied.join('; ').slice(0, 255), run.id]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return loadRun(req, run.id);
}

async function rejectRun(req, id, { note } = {}) {
  const run = await loadRun(req, id);
  if (run.status !== 'pending_approval') throw new HttpError(400, `This run is ${run.status.replace('_', ' ')} and cannot be rejected`);
  if (!canReview(req, run)) throw new HttpError(403, 'Only the person who ran the agent or a Manager/Admin can reject it');
  await pool.query("UPDATE agent_runs SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ?",
    [req.user.id, note ? String(note).slice(0, 255) : null, run.id]);
  return loadRun(req, run.id);
}

async function listRuns(req) {
  const tu = req.user.role === ROLES.TU;
  const where = ['r.firm_id = ?'];
  const params = [req.firmId];
  if (tu) { where.push('r.created_by = ?'); params.push(req.user.id); }
  for (const k of ['agent', 'status', 'entity_type', 'entity_id']) {
    if (req.query[k]) { where.push(`r.${k} = ?`); params.push(req.query[k]); }
  }
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const [rows] = await pool.query(`${RUN_SELECT} WHERE ${where.join(' AND ')} ORDER BY r.id DESC LIMIT ?`, [...params, limit]);
  const [counts] = await pool.query(`SELECT r.status, COUNT(*) AS n FROM agent_runs r WHERE ${where.slice(0, tu ? 2 : 1).join(' AND ')} GROUP BY r.status`, params.slice(0, tu ? 2 : 1));
  return { data: rows.map(formatRun), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
}

module.exports = { AGENTS, publicAgent, runAgent, approveRun, rejectRun, listRuns, loadRun, parseJsonLoose };

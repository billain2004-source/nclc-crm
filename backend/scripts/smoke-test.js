// End-to-end API smoke test: logins, role enforcement, tenant isolation, currency conversion,
// pipeline rules, lead conversion and help text. Run with the API running:  npm run test:api
const BASE = process.env.API_URL || 'http://localhost:4000/api';
let pass = 0, fail = 0;
const results = [];

function check(name, cond, detail = '') {
  if (cond) { pass++; results.push(`  PASS  ${name}`); } else { fail++; results.push(`  FAIL  ${name} ${detail}`); }
}

async function call(path, { token, firm, method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (firm) headers['X-Firm-Id'] = String(firm);
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

async function login(email, password) {
  const r = await call('/auth/login', { method: 'POST', body: { email, password } });
  check(`login ${email}`, r.status === 200 && r.data.token, `status=${r.status}`);
  return r.data || {};
}

(async () => {
  const h = await call('/health');
  check('health endpoint', h.status === 200 && h.data.ok, JSON.stringify(h.data));

  const bad = await call('/auth/login', { method: 'POST', body: { email: 'admin@northwind.example', password: 'wrong' } });
  check('wrong password rejected (401)', bad.status === 401);
  check('no token rejected (401)', (await call('/contacts')).status === 401);

  const sa = await login('superadmin@nclc-crm.example', 'Super@123');
  const fa = await login('admin@northwind.example', 'Demo@123');
  const mg = await login('manager@sahyadri.example', 'Demo@123');
  const tu = await login('sales1@lakeshore.example', 'Demo@123');
  await login('sales2@marinabay.example', 'Demo@123');

  // ---- Super Admin
  const firms = await call('/firms', { token: sa.token });
  check('SA lists firms (>=3)', firms.status === 200 && firms.data.data.length >= 3, `n=${firms.data?.data?.length}`);
  const currencies = new Set(firms.data.data.map((f) => f.base_currency));
  check('firms use different base currencies', currencies.size >= 3, [...currencies].join(','));
  const nw = firms.data.data.find((f) => f.name.startsWith('Northwind'));
  const sh = firms.data.data.find((f) => f.name.startsWith('Sahyadri'));
  check('SA needs firm context for module data (400)', (await call('/contacts', { token: sa.token })).status === 400);
  const saContacts = await call('/contacts', { token: sa.token, firm: sh.id });
  check('SA reads a firm with X-Firm-Id', saContacts.status === 200 && saContacts.data.total >= 10);

  // ---- Seed volume per module (Firm Admin view)
  for (const m of ['contacts', 'companies', 'leads', 'deals', 'tasks']) {
    const r = await call(`/${m}`, { token: fa.token });
    check(`seed: ${m} has 10+ rows`, r.status === 200 && r.data.total >= 10, `total=${r.data?.total}`);
  }
  const users = await call('/users', { token: fa.token });
  const roles = new Set(users.data.data.map((u) => u.role));
  check('firm has users at firm_admin/manager/team_user', ['firm_admin', 'manager', 'team_user'].every((r) => roles.has(r)));

  // ---- Firm suspension blocks sign-in (then restore)
  const mb = firms.data.data.find((f) => f.name.startsWith('Marina'));
  await call(`/firms/${mb.id}`, { token: sa.token, method: 'PUT', body: { status: 'suspended' } });
  check('suspended firm user cannot sign in (403)', (await call('/auth/login', { method: 'POST', body: { email: 'sales2@marinabay.example', password: 'Demo@123' } })).status === 403);
  await call(`/firms/${mb.id}`, { token: sa.token, method: 'PUT', body: { status: 'active' } });
  check('re-activated firm user can sign in', (await call('/auth/login', { method: 'POST', body: { email: 'sales2@marinabay.example', password: 'Demo@123' } })).status === 200);

  // ---- Tenant isolation
  const shContact = saContacts.data.data[0];
  check('FA cannot read another firm\'s contact (404)', (await call(`/contacts/${shContact.id}`, { token: fa.token })).status === 404);
  check('FA cannot update another firm\'s contact', (await call(`/contacts/${shContact.id}`, { token: fa.token, method: 'PUT', body: { first_name: 'Hacked' } })).status === 404);
  check('FA X-Firm-Id header is ignored', (await call('/contacts', { token: fa.token, firm: sh.id })).data.data.every((c) => !c.email || !c.email.includes('sahyadri')));
  const nwCompany = (await call('/companies', { token: fa.token })).data.data[0];
  const cross = await call('/contacts', { token: mg.token, method: 'POST', body: { first_name: 'X', last_name: 'Y', company_id: nwCompany.id } });
  check('cannot link a record to another firm\'s company (400)', cross.status === 400, `status=${cross.status}`);

  // ---- Role enforcement
  check('FA cannot manage firms (403)', (await call('/firms', { token: fa.token })).status === 403);
  check('Manager cannot manage users (403)', (await call('/users', { token: mg.token })).status === 403);
  check('Team user cannot manage users (403)', (await call('/users', { token: tu.token })).status === 403);
  check('Team user cannot add exchange rates (403)', (await call('/ref/exchange-rates', { token: tu.token, method: 'POST', body: { currency_code: 'EUR', rate_per_usd: 1 } })).status === 403);
  const tuLeads = await call('/leads', { token: tu.token, firm: 999 });
  check('Team user sees only own leads', tuLeads.data.data.length > 0 && tuLeads.data.data.every((l) => l.owner_id === tu.user.id));
  const tuDeals = await call('/deals', { token: tu.token });
  check('Team user sees only own deals', tuDeals.data.data.every((d) => d.owner_id === tu.user.id));
  const tuContacts = await call('/contacts', { token: tu.token });
  check('Team user cannot delete contacts (403)', (await call(`/contacts/${tuContacts.data.data[0].id}`, { token: tu.token, method: 'DELETE' })).status === 403);
  const otherUser = (await call('/users/lookup', { token: tu.token })).data.find((u) => u.id !== tu.user.id);
  const assign = await call('/tasks', { token: tu.token, method: 'POST', body: { title: 'x', assigned_to: otherUser.id } });
  check('Team user cannot assign tasks to others (403)', assign.status === 403);
  check('FA cannot create a super admin (403)', (await call('/users', { token: fa.token, method: 'POST', body: { name: 'x', email: 'x@x.example', role: 'super_admin', password: 'Password1' } })).status === 403);

  // ---- CRUD as Manager
  const created = await call('/contacts', { token: mg.token, method: 'POST', body: { first_name: 'Smoke', last_name: 'Test', email: 'smoke@test.example' } });
  check('Manager creates contact', created.status === 201 && created.data.owner_id === mg.user.id);
  const upd = await call(`/contacts/${created.data.id}`, { token: mg.token, method: 'PUT', body: { job_title: 'QA' } });
  check('Manager updates contact', upd.status === 200 && upd.data.job_title === 'QA');
  check('Manager deletes contact', (await call(`/contacts/${created.data.id}`, { token: mg.token, method: 'DELETE' })).status === 200);
  check('required field validation (400)', (await call('/contacts', { token: mg.token, method: 'POST', body: { first_name: 'A' } })).status === 400);

  // ---- Currency conversion (Northwind = GBP, has EUR/USD deals)
  const nwDeals = (await call('/deals', { token: fa.token, pageSize: 100 })).data.data;
  const foreign = nwDeals.find((d) => d.currency_code !== 'GBP');
  check('foreign-currency deal exists', !!foreign);
  if (foreign) {
    const rates = Object.fromEntries((await call('/ref/currencies', { token: fa.token })).data.map((c) => [c.code, Number(c.rate_per_usd)]));
    const expect = Math.round(foreign.amount * (rates.GBP / rates[foreign.currency_code]) * 100) / 100;
    check(`deal ${foreign.currency_code}->GBP conversion`, Math.abs(foreign.amount_base - expect) < 0.02 && foreign.base_currency === 'GBP', `${foreign.amount_base} vs ${expect}`);
  }

  // ---- Pipeline rules
  const stages = (await call('/firm/stages', { token: mg.token })).data;
  const newDeal = await call('/deals', { token: mg.token, method: 'POST', body: { name: 'Smoke deal', amount: 1000, currency_code: 'USD' } });
  check('deal defaults to first stage + its probability', newDeal.status === 201 && newDeal.data.stage_id === stages[0].id && newDeal.data.probability === stages[0].probability);
  const won = stages.find((s) => s.is_won);
  const moved = await call(`/deals/${newDeal.data.id}`, { token: mg.token, method: 'PUT', body: { stage_id: won.id } });
  check('moving to Closed Won sets status=won, probability=100', moved.data.status === 'won' && moved.data.probability === 100);
  check('deal amount_base in INR', moved.data.base_currency === 'INR' && moved.data.amount_base > 1000);
  const board = await call('/deals/board', { token: mg.token });
  check('board returns all stages', board.status === 200 && board.data.stages.length === stages.length);
  await call(`/deals/${newDeal.data.id}`, { token: mg.token, method: 'DELETE' });

  // ---- Lead conversion
  const lead = await call('/leads', { token: mg.token, method: 'POST', body: { first_name: 'Conv', last_name: 'Lead', company_name: 'Smoke Convert Co', estimated_value: 5000 } });
  check('setting status=converted directly is blocked (400)', (await call(`/leads/${lead.data.id}`, { token: mg.token, method: 'PUT', body: { status: 'converted' } })).status === 400);
  const conv = await call(`/leads/${lead.data.id}/convert`, { token: mg.token, method: 'POST', body: { create_deal: true } });
  check('lead converts to company + contact + deal', conv.status === 200 && conv.data.contact_id && conv.data.company_id && conv.data.deal_id);
  check('converted lead cannot be converted again', (await call(`/leads/${lead.data.id}/convert`, { token: mg.token, method: 'POST', body: {} })).status === 400);
  await call(`/deals/${conv.data.deal_id}`, { token: mg.token, method: 'DELETE' });
  await call(`/contacts/${conv.data.contact_id}`, { token: mg.token, method: 'DELETE' });
  await call(`/companies/${conv.data.company_id}`, { token: mg.token, method: 'DELETE' });
  await call(`/leads/${lead.data.id}`, { token: mg.token, method: 'DELETE' });

  // ---- Dashboard
  for (const [name, u] of [['FA', fa], ['MG', mg], ['TU', tu]]) {
    const d = await call('/dashboard', { token: u.token });
    check(`dashboard (${name})`, d.status === 200 && d.data.by_stage.length === 6 && d.data.firm.base_currency);
  }
  check('dashboard (SA with firm)', (await call('/dashboard', { token: sa.token, firm: nw.id })).status === 200);

  // ---- Help text
  const pub = await call('/help/public');
  check('public help available (login page)', pub.status === 200 && pub.data.login);
  const help = await call('/help', { token: fa.token });
  check('help has 30+ sections', Object.keys(help.data).length >= 30, `n=${Object.keys(help.data).length}`);
  check('Northwind sees its firm override for "deals"', help.data.deals?.scope === 'firm');
  const shHelp = await call('/help', { token: mg.token });
  check('other firms see the global "deals" help', shHelp.data.deals?.scope === 'global');
  check('Manager cannot edit help (403)', (await call('/help/contacts', { token: mg.token, method: 'PUT', body: { title: 'x', body: 'y' } })).status === 403);
  check('Team user cannot edit help (403)', (await call('/help/contacts', { token: tu.token, method: 'PUT', body: { title: 'x', body: 'y' } })).status === 403);
  const faEdit = await call('/help/tasks', { token: fa.token, method: 'PUT', body: { title: 'Tasks (NW)', body: 'Smoke override' } });
  check('Firm Admin saves a firm override', faEdit.status === 200 && faEdit.data.scope === 'firm' && faEdit.data.updated_by_name === fa.user.name);
  check('override does not leak to other firms', (await call('/help', { token: mg.token })).data.tasks.title !== 'Tasks (NW)');
  await call('/help/tasks', { token: fa.token, method: 'DELETE' });
  check('reset restores global text', (await call('/help', { token: fa.token })).data.tasks.scope === 'global');
  const orig = pub.data['admin.help'];
  const saEdit = await call('/help/admin.help', { token: sa.token, method: 'PUT', body: { title: orig.title, body: orig.body } });
  check('Super Admin edits global help', saEdit.status === 200 && saEdit.data.scope === 'global');

  // ================= Part B - Stage 1: Settings > API Keys + llmRouter failover =================
  check('Manager cannot open API keys (403)', (await call('/ai/keys', { token: mg.token })).status === 403);
  check('Team user cannot open API keys (403)', (await call('/ai/keys', { token: tu.token })).status === 403);
  const faKeys = await call('/ai/keys', { token: fa.token, firm: sh.id });
  check('FA lists own firm keys only (X-Firm-Id ignored)', faKeys.status === 200 && faKeys.data.scope === 'firm' && faKeys.data.firm_id === nw.id);
  check('FA cannot switch to platform scope', (await call('/ai/keys?scope=platform', { token: fa.token })).data.scope === 'firm');
  const rawKeys = JSON.stringify(faKeys.data);
  check('key list never contains key_enc or a full key', !rawKeys.includes('key_enc') && !rawKeys.includes('mock-demo') && faKeys.data.data.every((k) => /^.{4}$/.test(k.key_last4)));
  const types = (await call('/ai/task-types', { token: fa.token })).data;
  check('task types table has text/image/audio/embedding', ['text', 'image', 'audio', 'embedding'].every((c) => types.some((t) => t.code === c)));
  check('FA cannot add task types (403)', (await call('/ai/task-types', { token: fa.token, method: 'POST', body: { code: 'x_type', name: 'X' } })).status === 403);
  check('key without value rejected (400)', (await call('/ai/keys', { token: fa.token, method: 'POST', body: { name: 'x', provider: 'mock', task_type: 'text' } })).status === 400);
  const secretValue = 'mock-smoke-secret-value-7788';
  const added = await call('/ai/keys', { token: fa.token, method: 'POST', body: { name: 'Smoke key', provider: 'mock', task_type: 'text', priority: 5, key: secretValue } });
  check('FA adds a key; response shows only last 4', added.status === 201 && added.data.key_last4 === '7788' && !JSON.stringify(added.data).includes(secretValue));
  const nwFailKey = faKeys.data.data.find((k) => k.key_last4 === '9429');
  check('seeded Northwind rate-limit demo key is primary', nwFailKey && nwFailKey.is_primary === 1);
  if (nwFailKey.status !== 'active') await call(`/ai/keys/${nwFailKey.id}/reset`, { token: fa.token, method: 'POST' });

  const try1 = await call('/ai/try', { token: fa.token, method: 'POST', body: { task_type: 'text', prompt: 'hi' } });
  check('callLLM fails over from the 429 key to the next key', try1.status === 200 && try1.data.attempts[0].ok === false && try1.data.attempts[0].error_type === 'rate_limit' && try1.data.key.id !== nwFailKey.id,
    JSON.stringify(try1.data).slice(0, 200));
  check('next key by priority is the firm smoke key', try1.data.key?.id === added.data.id);
  const afterTry = (await call('/ai/keys', { token: fa.token })).data.data.find((k) => k.id === nwFailKey.id);
  check('429 key marked exhausted with timestamp + auto-reset time', afterTry.status === 'exhausted' && afterTry.exhausted_at && afterTry.resets_at);
  const log1 = (await call('/ai/usage', { token: fa.token })).data;
  check('usage log has switch + exhausted events', log1.data.some((l) => l.event === 'switch' && l.key_id === nwFailKey.id && l.to_key_id === added.data.id) && log1.data.some((l) => l.event === 'exhausted' && l.key_id === nwFailKey.id));
  check('usage log never contains key values', !JSON.stringify(log1).includes(secretValue) && !JSON.stringify(log1).includes('mock-demo'));
  const try2 = await call('/ai/try', { token: fa.token, method: 'POST', body: { task_type: 'text' } });
  check('exhausted key is skipped on the next call', try2.status === 200 && try2.data.attempts.length === 1 && try2.data.key.id === added.data.id);
  await call(`/ai/keys/${added.data.id}`, { token: fa.token, method: 'PUT', body: { status: 'disabled' } });
  const try3 = await call('/ai/try', { token: fa.token, method: 'POST', body: { task_type: 'text' } });
  check('falls back to platform keys when firm keys are unavailable', try3.status === 200 && try3.data.key.scope === 'platform');
  const reset = await call(`/ai/keys/${nwFailKey.id}/reset`, { token: fa.token, method: 'POST' });
  check('manual reset reactivates an exhausted key', reset.status === 200 && reset.data.status === 'active' && !reset.data.exhausted_at);
  const t1 = await call(`/ai/keys/${nwFailKey.id}/test`, { token: fa.token, method: 'POST' });
  check('Test key reports failure and exhausts a 429 key', t1.status === 200 && t1.data.ok === false && t1.data.exhausted && t1.data.key.status === 'exhausted');
  await call(`/ai/keys/${nwFailKey.id}/reset`, { token: fa.token, method: 'POST' });
  await call(`/ai/keys/${added.data.id}`, { token: fa.token, method: 'PUT', body: { status: 'active' } });
  const t2 = await call(`/ai/keys/${added.data.id}/test`, { token: fa.token, method: 'POST' });
  check('Test key succeeds on a working key', t2.data.ok === true && t2.data.sample === 'OK');
  const prim = await call(`/ai/keys/${added.data.id}/primary`, { token: fa.token, method: 'POST' });
  const afterPrim = (await call('/ai/keys', { token: fa.token })).data.data.filter((k) => k.task_type === 'text' && k.is_primary);
  check('only one primary key per task type', prim.status === 200 && afterPrim.length === 1 && afterPrim[0].id === added.data.id);
  await call(`/ai/keys/${nwFailKey.id}/primary`, { token: fa.token, method: 'POST' });
  const shKey = await call('/ai/keys', { token: sa.token, firm: sh.id, method: 'POST', body: { name: 'SH smoke', provider: 'mock', task_type: 'image', key: 'mock-sh-smoke-0001' } });
  check('FA cannot read or edit another firm\'s key (404)', (await call(`/ai/keys/${shKey.data.id}`, { token: fa.token, method: 'PUT', body: { name: 'x' } })).status === 404
    && (await call(`/ai/keys/${shKey.data.id}/test`, { token: fa.token, method: 'POST' })).status === 404);
  await call(`/ai/keys/${shKey.data.id}`, { token: sa.token, firm: sh.id, method: 'DELETE' });
  const plat = await call('/ai/keys?scope=platform', { token: sa.token, firm: nw.id });
  check('SA sees platform keys', plat.data.scope === 'platform' && plat.data.data.length >= 5 && plat.data.data.every((k) => k.firm_id === null));
  check('unknown task type rejected (400)', (await call('/ai/try', { token: fa.token, method: 'POST', body: { task_type: 'nope' } })).status === 400);
  check('FA deletes a key', (await call(`/ai/keys/${added.data.id}`, { token: fa.token, method: 'DELETE' })).status === 200);

  // ================= Part B - Stage 2: AI agents (approval required) =================
  const agentList = await call('/agents', { token: tu.token });
  check('3 agents available', agentList.status === 200 && ['lead_scoring', 'followup_email', 'deal_summary'].every((c) => agentList.data.some((a) => a.code === c)));
  const mgLead = (await call('/leads?status=new', { token: mg.token })).data.data[0];
  const run1 = await call('/agents/lead_scoring/run', { token: mg.token, method: 'POST', body: { entity_type: 'lead', entity_id: mgLead.id } });
  check('lead scoring run is pending approval with key + proposal', run1.status === 201 && run1.data.status === 'pending_approval' && run1.data.key_name && run1.data.proposed_changes?.[0]?.table === 'leads'
    && Number.isInteger(run1.data.output_json.score), JSON.stringify(run1.data).slice(0, 200));
  check('agent input omits names/emails (data minimisation)', !JSON.stringify(run1.data.input_json).includes(mgLead.email) && !JSON.stringify(run1.data.input_json).includes(mgLead.last_name));
  check('nothing written before approval', (await call(`/leads/${mgLead.id}`, { token: mg.token })).data.score === mgLead.score);
  const ap1 = await call(`/agents/runs/${run1.data.id}/approve`, { token: mg.token, method: 'POST', body: { output: { score: 77 }, note: 'smoke' } });
  check('approve applies the (edited) score', ap1.status === 200 && ap1.data.status === 'approved' && (await call(`/leads/${mgLead.id}`, { token: mg.token })).data.score === 77);
  check('approved run cannot be approved again (400)', (await call(`/agents/runs/${run1.data.id}/approve`, { token: mg.token, method: 'POST' })).status === 400);
  await call(`/leads/${mgLead.id}`, { token: mg.token, method: 'PUT', body: { score: mgLead.score } });
  const run2 = await call('/agents/lead_scoring/run', { token: mg.token, method: 'POST', body: { entity_type: 'lead', entity_id: mgLead.id } });
  const rj = await call(`/agents/runs/${run2.data.id}/reject`, { token: mg.token, method: 'POST', body: { note: 'not now' } });
  check('reject leaves the record unchanged', rj.data.status === 'rejected' && (await call(`/leads/${mgLead.id}`, { token: mg.token })).data.score === mgLead.score);
  // Northwind: its primary key simulates 429 -> agent run records failover
  if (nwFailKey) await call(`/ai/keys/${nwFailKey.id}/reset`, { token: fa.token, method: 'POST' });
  const nwDeal = nwDeals.find((d) => d.status === 'open');
  const run3 = await call('/agents/deal_summary/run', { token: fa.token, method: 'POST', body: { entity_type: 'deal', entity_id: nwDeal.id } });
  check('agent run records failover attempts and the key used', run3.data.status === 'pending_approval' && run3.data.attempts_json.length >= 2 && run3.data.attempts_json[0].ok === false && run3.data.key_name !== 'Northwind key (simulates rate limit)');
  const descBefore = (await call(`/deals/${nwDeal.id}`, { token: fa.token })).data.description;
  await call(`/agents/runs/${run3.data.id}/approve`, { token: fa.token, method: 'POST' });
  const descAfter = (await call(`/deals/${nwDeal.id}`, { token: fa.token })).data.description;
  check('deal summary appended to description on approval', descAfter.startsWith(descBefore || '') && descAfter.includes('[AI deal summary'));
  await call(`/deals/${nwDeal.id}`, { token: fa.token, method: 'PUT', body: { description: descBefore } });
  const run4 = await call('/agents/followup_email/run', { token: fa.token, method: 'POST', body: { entity_type: 'deal', entity_id: nwDeal.id } });
  check('follow-up email draft has subject + body', run4.data.status === 'pending_approval' && run4.data.output_json.subject && run4.data.output_json.body);
  const ap4 = await call(`/agents/runs/${run4.data.id}/approve`, { token: fa.token, method: 'POST', body: { output: { subject: 'Smoke follow-up' } } });
  const emailTask = (await call(`/tasks?deal_id=${nwDeal.id}&q=Smoke follow-up`, { token: fa.token })).data.data[0];
  check('approved email becomes an Email task (not sent)', ap4.data.status === 'approved' && emailTask && emailTask.type === 'email' && emailTask.assigned_to === fa.user.id);
  if (emailTask) await call(`/tasks/${emailTask.id}`, { token: fa.token, method: 'DELETE' });
  check('agent on the wrong record type rejected (400)', (await call('/agents/deal_summary/run', { token: fa.token, method: 'POST', body: { entity_type: 'lead', entity_id: 1 } })).status === 400);
  const otherLead = (await call('/leads', { token: sa.token, firm: tuLeads.data.data[0].firm_id })).data.data.find((l) => l.owner_id !== tu.user.id);
  check('team user cannot run an agent on someone else\'s lead (404)', (await call('/agents/lead_scoring/run', { token: tu.token, method: 'POST', body: { entity_type: 'lead', entity_id: otherLead.id } })).status === 404);
  const tuRun = await call('/agents/lead_scoring/run', { token: tu.token, method: 'POST', body: { entity_type: 'lead', entity_id: tuLeads.data.data[0].id } });
  check('team user runs an agent on own lead', tuRun.status === 201 && tuRun.data.status === 'pending_approval');
  const tuRuns = await call('/agents/runs?status=', { token: tu.token });
  check('team user sees only own runs', tuRuns.data.data.length > 0 && tuRuns.data.data.every((r) => r.created_by === tu.user.id));
  check('team user rejects own run', (await call(`/agents/runs/${tuRun.data.id}/reject`, { token: tu.token, method: 'POST' })).data.status === 'rejected');
  check('other firm cannot see a run (404)', (await call(`/agents/runs/${run1.data.id}`, { token: fa.token })).status === 404);

  // ================= Part B - Stage 4: relationship fixes =================
  const mgCompanies = (await call('/companies?pageSize=100', { token: mg.token })).data.data;
  const mgContacts = (await call('/contacts?pageSize=100', { token: mg.token })).data.data;
  const ctA = mgContacts.find((c) => c.company_id);
  const otherCo = mgCompanies.find((c) => c.id !== ctA.company_id);
  check('deal contact must work at the deal company (400)', (await call('/deals', { token: mg.token, method: 'POST', body: { name: 'Mismatch', company_id: otherCo.id, contact_id: ctA.id } })).status === 400);
  const okDeal = await call('/deals', { token: mg.token, method: 'POST', body: { name: 'Match', company_id: ctA.company_id, contact_id: ctA.id } });
  check('deal with matching company + contact is accepted', okDeal.status === 201);
  await call(`/deals/${okDeal.data.id}`, { token: mg.token, method: 'DELETE' });
  check('invalid firm time zone rejected (400)', (await call('/firm', { token: fa.token, method: 'PUT', body: { timezone: 'Mars/Olympus' } })).status === 400);
  check('valid IANA time zone accepted', (await call('/firm', { token: fa.token, method: 'PUT', body: { timezone: 'Europe/London' } })).status === 200);
  const fkLead = await call('/leads', { token: mg.token, method: 'POST', body: { first_name: 'Fk', last_name: 'Check', company_name: 'FK Check Co' } });
  const fkConv = await call(`/leads/${fkLead.data.id}/convert`, { token: mg.token, method: 'POST', body: { create_deal: true } });
  await call(`/deals/${fkConv.data.deal_id}`, { token: mg.token, method: 'DELETE' });
  check('deleting a converted deal clears leads.converted_deal_id (FK)', (await call(`/leads/${fkLead.data.id}`, { token: mg.token })).data.converted_deal_id === null);
  await call(`/contacts/${fkConv.data.contact_id}`, { token: mg.token, method: 'DELETE' });
  await call(`/companies/${fkConv.data.company_id}`, { token: mg.token, method: 'DELETE' });
  await call(`/leads/${fkLead.data.id}`, { token: mg.token, method: 'DELETE' });

  // ================= Part B - Stage 5: dropdown values from tables =================
  const lkAll = await call('/lookups', { token: mg.token });
  check('GET /lookups returns all 9 lists to any user', lkAll.status === 200 && lkAll.data.lists.length === 9);
  check('lead_status values come from lookup_values', (lkAll.data.values.lead_status || []).map((v) => v.code).join() === 'new,contacted,qualified,unqualified,converted');
  check('Manager cannot edit dropdown values (403)', (await call('/lookups/lead_source/values', { token: mg.token, method: 'POST', body: { label: 'Nope' } })).status === 403);
  check('invalid lead source rejected by API (400)', (await call('/leads', { token: mg.token, method: 'POST', body: { first_name: 'Lk', last_name: 'Bad', source: 'carrier_pigeon' } })).status === 400);
  check('invalid task priority rejected by API (400)', (await call('/tasks', { token: mg.token, method: 'POST', body: { title: 'Lk', priority: 'urgent' } })).status === 400);
  // Firm Admin adds a firm-only value, uses it, relabels it, and tries to delete it while in use
  const addV = await call('/lookups/lead_source/values', { token: fa.token, method: 'POST', body: { label: 'Smoke Fair' } });
  check('Firm Admin adds a firm-only value (code from label)', addV.status === 201 && addV.data.code === 'smoke_fair' && addV.data.scope === 'firm_only');
  check('duplicate code rejected (409)', (await call('/lookups/lead_source/values', { token: fa.token, method: 'POST', body: { label: 'Smoke Fair' } })).status === 409);
  const lkLead = await call('/leads', { token: fa.token, method: 'POST', body: { first_name: 'Lk', last_name: 'Fair', source: 'smoke_fair' } });
  check('record can use the new value', lkLead.status === 201 && lkLead.data.source === 'smoke_fair');
  check('value in use cannot be deleted (409)', (await call('/lookups/lead_source/values/smoke_fair', { token: fa.token, method: 'DELETE' })).status === 409);
  await call('/lookups/lead_source/values/smoke_fair', { token: fa.token, method: 'PUT', body: { is_active: false } });
  check('deactivated value rejected for new records (400)', (await call('/leads', { token: fa.token, method: 'POST', body: { first_name: 'Lk', last_name: 'Two', source: 'smoke_fair' } })).status === 400);
  check('existing record keeps a deactivated value on edit', (await call(`/leads/${lkLead.data.id}`, { token: fa.token, method: 'PUT', body: { source: 'smoke_fair', notes: 'edited' } })).status === 200);
  // Other firms do not see this firm's value
  const otherLk = await call('/lookups/lead_source', { token: tu.token });
  check('firm-only value is invisible to other firms', !otherLk.data.values.some((v) => v.code === 'smoke_fair'));
  // Firm override of a global label, then reset to default
  const relabel = await call('/lookups/lead_status/values/qualified', { token: fa.token, method: 'PUT', body: { label: 'Sales Qualified' } });
  check('Firm Admin relabels a default value (firm override)', relabel.status === 200 && relabel.data.label === 'Sales Qualified' && relabel.data.scope === 'override');
  check('other firms still see the default label', (await call('/lookups/lead_status', { token: tu.token })).data.values.find((v) => v.code === 'qualified').label === 'Qualified');
  check('system value cannot be deactivated (400)', (await call('/lookups/lead_status/values/converted', { token: fa.token, method: 'PUT', body: { is_active: false } })).status === 400);
  check('fixed list rejects new values (400)', (await call('/lookups/deal_status/values', { token: fa.token, method: 'POST', body: { label: 'Paused' } })).status === 400);
  check('Firm Admin cannot edit global defaults (403)', (await call('/lookups/lead_status/values/new', { token: fa.token, method: 'PUT', body: { label: 'X', scope: 'global' } })).status === 403);
  check('Firm Admin cannot edit firm status list (403)', (await call('/lookups/firm_status/values/active', { token: fa.token, method: 'PUT', body: { label: 'Live' } })).status === 403);
  const reorder = await call('/lookups/task_priority/reorder', { token: fa.token, method: 'POST', body: { codes: ['low', 'medium', 'high'] } });
  check('reorder saves the new order for the firm', reorder.status === 200 && reorder.data.map((v) => v.code).join() === 'low,medium,high');
  check('dashboard uses lookup labels', (await call('/dashboard', { token: fa.token })).data.leads_by_status.some((s) => s.label === 'Sales Qualified'));
  // Clean up: reset overrides, delete the test lead and the firm-only value
  await call('/lookups/lead_status/values/qualified', { token: fa.token, method: 'DELETE' });
  for (const c of ['low', 'medium', 'high']) await call(`/lookups/task_priority/values/${c}`, { token: fa.token, method: 'DELETE' });
  await call(`/leads/${lkLead.data.id}`, { token: fa.token, method: 'DELETE' });
  check('unused firm-only value can be deleted', (await call('/lookups/lead_source/values/smoke_fair', { token: fa.token, method: 'DELETE' })).status === 200);
  check('reset restores the default label', (await call('/lookups/lead_status', { token: fa.token })).data.values.find((v) => v.code === 'qualified').label === 'Qualified');
  // Super Admin edits a global default and restores it
  const g1 = await call('/lookups/task_type/values/meeting', { token: sa.token, method: 'PUT', body: { label: 'Meeting (global test)', scope: 'global' } });
  check('Super Admin edits a global default', g1.status === 200 && (await call('/lookups/task_type', { token: tu.token })).data.values.find((v) => v.code === 'meeting').label === 'Meeting (global test)');
  await call('/lookups/task_type/values/meeting', { token: sa.token, method: 'PUT', body: { label: 'Meeting', scope: 'global' } });

  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// Settings > API Keys: AI task types, encrypted provider keys, usage log. Super Admin + Firm Admin only.
// Full keys are write-only: responses contain key_last4, never key_enc or the plain key.
const express = require('express');
const { pool } = require('../db');
const { ah, HttpError, ROLES } = require('../utils');
const { requireRole } = require('../middleware/auth');
const { encrypt, last4 } = require('../services/secrets');
const { PROVIDERS } = require('../services/providers');
const { callLLM, testKey, resetDueKeys, logUsage } = require('../services/llmRouter');

const router = express.Router();
router.use(requireRole(ROLES.SA, ROLES.FA));

const KEY_COLS = `k.id, k.firm_id, k.name, k.provider, k.model, k.task_type, k.priority, k.status, k.is_primary, k.key_last4,
  k.usage_count, k.success_count, k.failure_count, k.last_used_at, k.last_error, k.exhausted_at, k.created_at, k.updated_at,
  t.name AS task_type_name, t.reset_minutes, cu.name AS created_by_name, uu.name AS updated_by_name`;
const KEY_FROM = `FROM api_keys k JOIN ai_task_types t ON t.code = k.task_type
  LEFT JOIN users cu ON cu.id = k.created_by LEFT JOIN users uu ON uu.id = k.updated_by`;

// Which key scope does this request work on? Firm Admin: always their firm.
// Super Admin: ?scope=platform (firm_id NULL) or the selected firm (default).
function scopeOf(req) {
  if (req.user.role === ROLES.FA) return { firmId: req.user.firm_id, scope: 'firm' };
  const s = req.body?.scope || req.query.scope;
  if (s === 'platform' || !req.firmId) return { firmId: null, scope: 'platform' };
  return { firmId: req.firmId, scope: 'firm' };
}

function withReset(row) {
  if (row.status !== 'exhausted' || !row.exhausted_at || !row.reset_minutes) return { ...row, resets_at: null };
  const t = new Date(String(row.exhausted_at).replace(' ', 'T') + 'Z').getTime() + row.reset_minutes * 60000;
  return { ...row, resets_at: new Date(t).toISOString().slice(0, 19).replace('T', ' ') };
}

async function loadKey(req, id, { withSecret = false } = {}) {
  const [[k]] = await pool.query(`SELECT ${KEY_COLS}${withSecret ? ', k.key_enc' : ''} ${KEY_FROM} WHERE k.id = ?`, [id]);
  if (!k) throw new HttpError(404, 'API key not found');
  if (req.user.role === ROLES.FA && k.firm_id !== req.user.firm_id) throw new HttpError(404, 'API key not found');
  return k;
}

async function validTaskType(code) {
  const [[t]] = await pool.query('SELECT code, is_active FROM ai_task_types WHERE code = ?', [code]);
  if (!t) throw new HttpError(400, 'Choose a valid task type');
  return t;
}

async function setPrimary(conn, k) {
  await conn.query('UPDATE api_keys SET is_primary = 0 WHERE firm_id <=> ? AND task_type = ? AND id <> ?', [k.firm_id, k.task_type, k.id]);
  await conn.query('UPDATE api_keys SET is_primary = 1 WHERE id = ?', [k.id]);
}

function cleanKeyInput(body, isNew) {
  const out = {};
  if (body.name !== undefined) {
    out.name = String(body.name || '').trim();
    if (!out.name) throw new HttpError(400, 'Name is required');
    if (out.name.length > 100) throw new HttpError(400, 'Name is too long (100 characters max)');
  } else if (isNew) throw new HttpError(400, 'Name is required');
  if (body.provider !== undefined || isNew) {
    if (!PROVIDERS[body.provider]) throw new HttpError(400, `Provider must be one of: ${Object.keys(PROVIDERS).join(', ')}`);
    out.provider = body.provider;
  }
  if (body.model !== undefined) out.model = String(body.model || '').trim().slice(0, 100) || null;
  if (body.task_type !== undefined || isNew) {
    if (!body.task_type) throw new HttpError(400, 'Task type is required');
    out.task_type = body.task_type;
  }
  if (body.priority !== undefined && body.priority !== '' && body.priority !== null) {
    const p = parseInt(body.priority, 10);
    if (!(p >= 1 && p <= 999)) throw new HttpError(400, 'Priority must be a number from 1 (highest) to 999');
    out.priority = p;
  }
  if (body.status !== undefined) {
    if (!['active', 'disabled'].includes(body.status) && body.status !== 'exhausted') throw new HttpError(400, 'Status must be active or disabled');
    out.status = body.status;
    if (body.status === 'active') out.exhausted_at = null;
  }
  const key = body.key === undefined || body.key === null ? '' : String(body.key).trim();
  if (key) {
    if (key.length < 8 || key.length > 1000) throw new HttpError(400, 'The API key looks wrong (8-1000 characters expected)');
    if (/\s/.test(key)) throw new HttpError(400, 'The API key must not contain spaces');
    out.key_enc = encrypt(key);
    out.key_last4 = last4(key);
  } else if (isNew) throw new HttpError(400, 'API key is required');
  return out;
}

// ---------- Reference: providers + task types ----------
router.get('/providers', (req, res) => {
  res.json(Object.entries(PROVIDERS).map(([code, p]) => ({ code, label: p.label, task_types: Object.keys(p.tasks), default_models: p.tasks })));
});

router.get('/task-types', ah(async (req, res) => {
  const { firmId } = scopeOf(req);
  const [rows] = await pool.query(
    `SELECT t.*,
       (SELECT COUNT(*) FROM api_keys k WHERE k.task_type = t.code AND k.firm_id <=> ?) AS key_count,
       (SELECT COUNT(*) FROM api_keys k WHERE k.task_type = t.code AND k.firm_id <=> ? AND k.status = 'active') AS active_count,
       (SELECT k.name FROM api_keys k WHERE k.task_type = t.code AND k.firm_id <=> ? AND k.is_primary = 1 LIMIT 1) AS primary_key_name,
       (SELECT k.status FROM api_keys k WHERE k.task_type = t.code AND k.firm_id <=> ? AND k.is_primary = 1 LIMIT 1) AS primary_key_status,
       (SELECT COUNT(*) FROM api_keys k WHERE k.task_type = t.code AND k.firm_id IS NULL AND k.status = 'active') AS platform_active_count
     FROM ai_task_types t ORDER BY t.sort_order, t.name`, [firmId, firmId, firmId, firmId]);
  res.json(rows);
}));

const TT_CODE = /^[a-z][a-z0-9_]{1,31}$/;
router.post('/task-types', requireRole(ROLES.SA), ah(async (req, res) => {
  const { code, name, description, reset_minutes = 60, sort_order = 0 } = req.body || {};
  if (!TT_CODE.test(String(code || ''))) throw new HttpError(400, 'Code must be 2-32 lowercase letters, digits or _ and start with a letter');
  if (!String(name || '').trim()) throw new HttpError(400, 'Name is required');
  await pool.query('INSERT INTO ai_task_types (code, name, description, reset_minutes, sort_order) VALUES (?,?,?,?,?)',
    [code, String(name).trim().slice(0, 80), description ? String(description).slice(0, 255) : null, Math.max(0, parseInt(reset_minutes, 10) || 0), parseInt(sort_order, 10) || 0]);
  res.status(201).json({ ok: true });
}));

router.put('/task-types/:code', requireRole(ROLES.SA), ah(async (req, res) => {
  const b = req.body || {};
  const data = {};
  if (b.name !== undefined) { data.name = String(b.name).trim().slice(0, 80); if (!data.name) throw new HttpError(400, 'Name is required'); }
  if (b.description !== undefined) data.description = b.description ? String(b.description).slice(0, 255) : null;
  if (b.reset_minutes !== undefined) data.reset_minutes = Math.max(0, parseInt(b.reset_minutes, 10) || 0);
  if (b.sort_order !== undefined) data.sort_order = parseInt(b.sort_order, 10) || 0;
  if (b.is_active !== undefined) data.is_active = b.is_active ? 1 : 0;
  if (!Object.keys(data).length) return res.json({ ok: true });
  const [r] = await pool.query('UPDATE ai_task_types SET ? WHERE code = ?', [data, req.params.code]);
  if (!r.affectedRows) throw new HttpError(404, 'Task type not found');
  res.json({ ok: true });
}));

// ---------- Keys ----------
router.get('/keys', ah(async (req, res) => {
  const { firmId, scope } = scopeOf(req);
  const where = ['k.firm_id <=> ?'];
  const params = [firmId];
  if (req.query.task_type) { where.push('k.task_type = ?'); params.push(req.query.task_type); }
  const [rows] = await pool.query(`SELECT ${KEY_COLS} ${KEY_FROM} WHERE ${where.join(' AND ')}
    ORDER BY t.sort_order, k.task_type, k.is_primary DESC, k.priority, k.id`, params);
  // Firm Admins also see (read-only) how many platform fallback keys exist per task type
  const [[platform]] = await pool.query("SELECT COUNT(*) AS n FROM api_keys WHERE firm_id IS NULL AND status = 'active'");
  res.json({ scope, firm_id: firmId, platform_active_keys: platform.n, data: rows.map(withReset) });
}));

router.post('/keys', ah(async (req, res) => {
  const { firmId } = scopeOf(req);
  const data = cleanKeyInput(req.body || {}, true);
  const tt = await validTaskType(data.task_type);
  if (!tt.is_active) throw new HttpError(400, 'That task type is switched off');
  if (data.priority === undefined) data.priority = 10;
  if (data.status === 'exhausted') data.status = 'active';
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('INSERT INTO api_keys SET ?', [{ ...data, firm_id: firmId, created_by: req.user.id, updated_by: req.user.id }]);
    // First key of a task type (in this scope) becomes primary automatically
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM api_keys WHERE firm_id <=> ? AND task_type = ? AND is_primary = 1', [firmId, data.task_type]);
    if (req.body.is_primary || !n) await setPrimary(conn, { id: r.insertId, firm_id: firmId, task_type: data.task_type });
    await conn.commit();
    res.status(201).json(withReset(await loadKey(req, r.insertId)));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

router.put('/keys/:id', ah(async (req, res) => {
  const k = await loadKey(req, req.params.id);
  const data = cleanKeyInput(req.body || {}, false);
  if (data.task_type && data.task_type !== k.task_type) {
    await validTaskType(data.task_type);
    data.is_primary = 0; // primary flag belongs to the old task type
  }
  if (data.status === 'exhausted' && k.status !== 'exhausted') delete data.status; // only the router marks keys exhausted
  if (data.key_enc && k.status === 'exhausted' && data.status === undefined) { data.status = 'active'; data.exhausted_at = null; } // new key value
  data.updated_by = req.user.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE api_keys SET ? WHERE id = ?', [data, k.id]);
    if (req.body.is_primary) await setPrimary(conn, { id: k.id, firm_id: k.firm_id, task_type: data.task_type || k.task_type });
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  if (data.status === 'active' && k.status === 'exhausted') {
    await logUsage({ firm_id: k.firm_id, key_id: k.id, task_type: data.task_type || k.task_type, event: 'reset', source: 'manual', user_id: req.user.id, message: 'Reactivated by an administrator' });
  }
  res.json(withReset(await loadKey(req, k.id)));
}));

router.delete('/keys/:id', ah(async (req, res) => {
  const k = await loadKey(req, req.params.id);
  await pool.query('DELETE FROM api_keys WHERE id = ?', [k.id]);
  // Keep a primary key per task type when others remain
  const [[next]] = await pool.query(
    "SELECT id FROM api_keys WHERE firm_id <=> ? AND task_type = ? ORDER BY status = 'active' DESC, priority, id LIMIT 1", [k.firm_id, k.task_type]);
  if (k.is_primary && next) await pool.query('UPDATE api_keys SET is_primary = 1 WHERE id = ?', [next.id]);
  res.json({ ok: true });
}));

router.post('/keys/:id/primary', ah(async (req, res) => {
  const k = await loadKey(req, req.params.id);
  await setPrimary(pool, k);
  res.json(withReset(await loadKey(req, k.id)));
}));

router.post('/keys/:id/reset', ah(async (req, res) => {
  const k = await loadKey(req, req.params.id);
  if (k.status !== 'exhausted') throw new HttpError(400, 'Only exhausted keys can be reset');
  await pool.query("UPDATE api_keys SET status = 'active', exhausted_at = NULL, updated_by = ? WHERE id = ?", [req.user.id, k.id]);
  await logUsage({ firm_id: k.firm_id, key_id: k.id, task_type: k.task_type, event: 'reset', source: 'manual', user_id: req.user.id, message: 'Reset manually' });
  res.json(withReset(await loadKey(req, k.id)));
}));

router.post('/keys/reset-exhausted', ah(async (req, res) => {
  const { firmId } = scopeOf(req);
  const [rows] = await pool.query("SELECT id, firm_id, task_type FROM api_keys WHERE firm_id <=> ? AND status = 'exhausted'", [firmId]);
  for (const k of rows) {
    await pool.query("UPDATE api_keys SET status = 'active', exhausted_at = NULL, updated_by = ? WHERE id = ?", [req.user.id, k.id]);
    await logUsage({ firm_id: k.firm_id, key_id: k.id, task_type: k.task_type, event: 'reset', source: 'manual', user_id: req.user.id, message: 'Reset manually (all exhausted)' });
  }
  res.json({ ok: true, reset: rows.length });
}));

router.post('/keys/:id/test', ah(async (req, res) => {
  await loadKey(req, req.params.id); // access check
  const [[k]] = await pool.query('SELECT id, firm_id, name, provider, model, task_type, key_enc FROM api_keys WHERE id = ?', [req.params.id]);
  const result = await testKey(k, { userId: req.user.id });
  res.json({ ...result, key: withReset(await loadKey(req, k.id)) });
}));

// ---------- Usage ----------
router.get('/usage', ah(async (req, res) => {
  const { firmId } = scopeOf(req);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  // Firm scope: everything the firm's AI calls did (including calls served by platform keys).
  // Platform scope: platform-level events plus every firm call that used a platform key.
  const scopeSql = firmId
    ? 'l.firm_id = ?'
    : '(l.firm_id IS NULL OR l.key_id IN (SELECT id FROM api_keys WHERE firm_id IS NULL) OR l.to_key_id IN (SELECT id FROM api_keys WHERE firm_id IS NULL))';
  const where = [scopeSql];
  const params = firmId ? [firmId] : [];
  if (req.query.key_id) { where.push('(l.key_id = ? OR l.to_key_id = ?)'); params.push(req.query.key_id, req.query.key_id); }
  if (req.query.event) { where.push('l.event = ?'); params.push(req.query.event); }
  const [rows] = await pool.query(
    `SELECT l.id, l.key_id, l.to_key_id, l.task_type, l.event, l.http_status, l.error_type, l.message, l.source, l.latency_ms, l.created_at,
            k.name AS key_name, k.key_last4, (k.firm_id IS NULL) AS key_is_platform, tk.name AS to_key_name, u.name AS user_name
       FROM api_key_usage_log l
       LEFT JOIN api_keys k ON k.id = l.key_id
       LEFT JOIN api_keys tk ON tk.id = l.to_key_id
       LEFT JOIN users u ON u.id = l.user_id
      WHERE ${where.join(' AND ')} ORDER BY l.id DESC LIMIT ?`, [...params, limit]);
  const [summary] = await pool.query(
    `SELECT l.event, COUNT(*) AS n FROM api_key_usage_log l WHERE ${scopeSql} AND l.created_at >= NOW() - INTERVAL 30 DAY GROUP BY l.event`,
    firmId ? [firmId] : []);
  res.json({ data: rows, last30d: Object.fromEntries(summary.map((s) => [s.event, s.n])) });
}));

// Send one request through llmRouter.callLLM exactly as an AI feature would (with failover),
// so admins can see which key answers. Scope: the firm's keys + platform keys (or platform only).
router.post('/try', ah(async (req, res) => {
  const { firmId } = scopeOf(req);
  const taskType = String(req.body?.task_type || 'text');
  const prompt = String(req.body?.prompt || 'Say hello to the NCLC CRM team in one short sentence.').slice(0, 2000);
  const payload = taskType === 'embedding' ? { input: prompt } : taskType === 'audio' ? { text: prompt } : { prompt, maxTokens: 300, mock: () => `Hello from the mock provider! (prompt: "${prompt.slice(0, 60)}")` };
  const out = await callLLM(taskType, payload, { firmId, userId: req.user.id, source: 'settings:try' });
  const result = out.text !== undefined ? out.text : out.vectors ? `${out.vectors.length} vector(s), ${out.vectors[0]?.length || 0} dimensions` : out.images ? `${out.images.length} image(s) returned` : 'audio returned';
  res.json({ result: String(result).slice(0, 2000), model: out.model, key: out.key, attempts: out.attempts });
}));

// Run the scheduled reset check now (Super Admin) - handy after changing a reset window
router.post('/reset-sweep', requireRole(ROLES.SA), ah(async (req, res) => res.json({ reset: await resetDueKeys('manual-sweep') })));

module.exports = router;

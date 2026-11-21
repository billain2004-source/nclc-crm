// llmRouter.callLLM(taskType, payload, ctx) - the ONE entry point every AI feature uses.
//
// Key selection for (firm, task type):
//   1. the firm's own keys, then 2. platform keys (firm_id NULL, managed by the Super Admin);
//   within each group: primary key first, then priority ASC (1 = highest), then id.
//   Disabled and exhausted keys are skipped. Exhausted keys whose reset window has passed are
//   reactivated first (ai_task_types.reset_minutes; 0 = manual reset only).
// Failover: any failure moves on to the next key. Quota / rate-limit / auth failures
//   (HTTP 429, 402, 401, 403, or a provider message saying quota/key invalid) also mark the key
//   "exhausted" with a timestamp. Every call, failure, exhaustion and switch is written to
//   api_key_usage_log. Key material never leaves this module except inside the provider request.
const { pool } = require('../db');
const { HttpError } = require('../utils');
const { decrypt, redact } = require('./secrets');
const { callProvider, ProviderError } = require('./providers');

const EXHAUST_STATUS = { 429: 'rate_limit', 402: 'quota', 401: 'auth', 403: 'auth' };
const QUOTA_TEXT = /quota|exceeded|insufficient[_ ](credit|balance|funds)|billing|resource[_ ]exhausted|api key not valid|invalid api key|invalid x-api-key/i;

function classify(err) {
  if (err instanceof ProviderError) {
    if (EXHAUST_STATUS[err.status]) return { type: EXHAUST_STATUS[err.status], exhaust: true };
    if (err.type === 'refusal') return { type: 'refusal', exhaust: false };
    if (err.status === 400 && QUOTA_TEXT.test(err.message)) return { type: 'auth', exhaust: true };
    if (err.type) return { type: err.type, exhaust: false };
    if (err.status >= 500) return { type: 'server_error', exhaust: false };
    return { type: 'request_error', exhaust: false };
  }
  return { type: 'internal', exhaust: false };
}

async function logUsage(row) {
  try {
    await pool.query('INSERT INTO api_key_usage_log SET ?', [{
      firm_id: row.firm_id ?? null, key_id: row.key_id ?? null, to_key_id: row.to_key_id ?? null,
      task_type: row.task_type, event: row.event, http_status: row.http_status ?? null,
      error_type: row.error_type ?? null, message: row.message ? redact(row.message) : null,
      source: row.source ? String(row.source).slice(0, 64) : null, latency_ms: row.latency_ms ?? null, user_id: row.user_id ?? null,
    }]);
  } catch (e) {
    console.error('[llmRouter] could not write usage log:', e.code || e.message);
  }
}

// Reactivate exhausted keys whose reset window has passed. Returns the number reset.
async function resetDueKeys(source = 'schedule') {
  const [due] = await pool.query(
    `SELECT k.id, k.firm_id, k.task_type FROM api_keys k JOIN ai_task_types t ON t.code = k.task_type
      WHERE k.status = 'exhausted' AND t.reset_minutes > 0
        AND (k.exhausted_at IS NULL OR k.exhausted_at <= NOW() - INTERVAL t.reset_minutes MINUTE)`);
  for (const k of due) {
    const [r] = await pool.query("UPDATE api_keys SET status = 'active', exhausted_at = NULL WHERE id = ? AND status = 'exhausted'", [k.id]);
    if (r.affectedRows) await logUsage({ firm_id: k.firm_id, key_id: k.id, task_type: k.task_type, event: 'reset', source, message: 'Reset window passed - key reactivated' });
  }
  return due.length;
}

async function candidateKeys(firmId, taskType) {
  const [rows] = await pool.query(
    `SELECT id, firm_id, name, provider, model, task_type, priority, is_primary, key_enc
       FROM api_keys
      WHERE task_type = ? AND status = 'active' AND (firm_id = ? OR firm_id IS NULL)
      ORDER BY firm_id IS NULL ASC, is_primary DESC, priority ASC, id ASC`,
    [taskType, firmId || 0]);
  return rows;
}

const publicKey = (k) => ({ id: k.id, name: k.name, provider: k.provider, model: k.model, scope: k.firm_id ? 'firm' : 'platform' });

async function runWithKey(k, taskType, payload) {
  let apiKey;
  try {
    apiKey = decrypt(k.key_enc);
  } catch {
    throw new ProviderError(null, 'Stored key cannot be decrypted (was APP_ENC_KEY changed?)', { type: 'decrypt' });
  }
  try {
    return await callProvider({ provider: k.provider, model: k.model, apiKey, taskType, payload });
  } catch (e) {
    if (e instanceof ProviderError) e.message = redact(e.message, apiKey);
    else e.message = redact(e.message || 'Unexpected error', apiKey);
    throw e;
  } finally {
    apiKey = null;
  }
}

/**
 * Call an AI provider for a task type with automatic key failover.
 * @param {string} taskType  ai_task_types.code, e.g. 'text', 'image', 'audio', 'embedding'
 * @param {object} payload   text: { system, prompt | messages, maxTokens, mock() }; embedding: { input };
 *                           image: { prompt, size }; audio: { text, voice }
 * @param {object} ctx       { firmId, userId, source } - source names the feature (e.g. 'agent:lead_scoring')
 * @returns {Promise<object>} provider output (text / vectors / images / audio) + { key, model, attempts }
 */
async function callLLM(taskType, payload = {}, ctx = {}) {
  const [[tt]] = await pool.query('SELECT code, name, is_active FROM ai_task_types WHERE code = ?', [taskType]);
  if (!tt) throw new HttpError(400, `Unknown AI task type "${taskType}"`);
  if (!tt.is_active) throw new HttpError(400, `AI task type "${tt.name}" is switched off`);

  await resetDueKeys('auto');
  const keys = await candidateKeys(ctx.firmId, taskType);
  if (!keys.length) throw new HttpError(503, `No active API key for task type "${tt.name}". Add one in Settings > API Keys (or reset an exhausted key).`);

  const base = { firm_id: ctx.firmId || null, task_type: taskType, source: ctx.source || null, user_id: ctx.userId || null };
  const attempts = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const t0 = Date.now();
    try {
      const out = await runWithKey(k, taskType, payload);
      const latency = Date.now() - t0;
      await pool.query('UPDATE api_keys SET usage_count = usage_count + 1, success_count = success_count + 1, last_used_at = NOW() WHERE id = ?', [k.id]);
      await logUsage({ ...base, key_id: k.id, event: 'success', latency_ms: latency, message: `${k.provider}/${out.model}` });
      attempts.push({ key_id: k.id, key_name: k.name, ok: true, latency_ms: latency });
      return { ...out, key: publicKey(k), attempts };
    } catch (e) {
      const latency = Date.now() - t0;
      const cls = classify(e);
      const msg = redact(e.message);
      attempts.push({ key_id: k.id, key_name: k.name, ok: false, http_status: e.status ?? null, error_type: cls.type, message: msg });
      await pool.query('UPDATE api_keys SET usage_count = usage_count + 1, failure_count = failure_count + 1, last_used_at = NOW(), last_error = ? WHERE id = ?',
        [`${e.status ? `HTTP ${e.status} ` : ''}${cls.type}: ${msg}`.slice(0, 255), k.id]);
      await logUsage({ ...base, key_id: k.id, event: 'failure', http_status: e.status, error_type: cls.type, message: msg, latency_ms: latency });
      if (cls.exhaust) {
        await pool.query("UPDATE api_keys SET status = 'exhausted', exhausted_at = NOW() WHERE id = ?", [k.id]);
        await logUsage({ ...base, key_id: k.id, event: 'exhausted', http_status: e.status, error_type: cls.type, message: `Marked exhausted after ${cls.type}` });
      }
      if (e.fatal || cls.type === 'internal') {
        if (cls.type === 'internal') console.error('[llmRouter] internal error:', redact(e.stack || e.message));
        throw new HttpError(502, `AI request failed: ${msg}`);
      }
      const next = keys[i + 1];
      if (next) {
        await logUsage({ ...base, key_id: k.id, to_key_id: next.id, event: 'switch', http_status: e.status, error_type: cls.type,
          message: `Switched from "${k.name}" to "${next.name}" after ${cls.type}` });
      }
    }
  }
  await logUsage({ ...base, event: 'all_failed', message: `All ${keys.length} key(s) failed` });
  const last = attempts[attempts.length - 1];
  const err = new HttpError(502, `All ${keys.length} API key(s) for "${tt.name}" failed. Last error: ${last.message}`);
  err.attempts = attempts;
  throw err;
}

const TEST_PAYLOAD = {
  text: { prompt: 'Reply with the single word OK.', maxTokens: 50, mock: () => 'OK' },
  embedding: { input: 'NCLC CRM key test' },
  image: { prompt: 'A small blue square', size: '1024x1024' },
  audio: { text: 'Test' },
};

// Test one specific key (no failover). Updates status: exhausting failures mark it exhausted,
// a success reactivates an exhausted key.
async function testKey(keyRow, ctx = {}) {
  const t0 = Date.now();
  const base = { firm_id: keyRow.firm_id, key_id: keyRow.id, task_type: keyRow.task_type, source: 'test', user_id: ctx.userId || null };
  try {
    const out = await runWithKey(keyRow, keyRow.task_type, TEST_PAYLOAD[keyRow.task_type] || TEST_PAYLOAD.text);
    const latency = Date.now() - t0;
    await pool.query(
      `UPDATE api_keys SET last_used_at = NOW(), last_error = NULL,
         status = IF(status = 'exhausted', 'active', status), exhausted_at = IF(status = 'active', NULL, exhausted_at) WHERE id = ?`, [keyRow.id]);
    await logUsage({ ...base, event: 'test_ok', latency_ms: latency, message: `${keyRow.provider}/${out.model}` });
    const sample = out.text !== undefined ? String(out.text).slice(0, 80) : out.vectors ? `${out.vectors[0]?.length || 0}-dim vector` : out.images ? 'image returned' : 'audio returned';
    return { ok: true, latency_ms: latency, model: out.model, sample };
  } catch (e) {
    const cls = classify(e);
    const msg = redact(e.message);
    await pool.query('UPDATE api_keys SET last_error = ? WHERE id = ?', [`${e.status ? `HTTP ${e.status} ` : ''}${cls.type}: ${msg}`.slice(0, 255), keyRow.id]);
    if (cls.exhaust) await pool.query("UPDATE api_keys SET status = 'exhausted', exhausted_at = NOW() WHERE id = ? AND status <> 'disabled'", [keyRow.id]);
    await logUsage({ ...base, event: 'test_fail', http_status: e.status, error_type: cls.type, message: msg, latency_ms: Date.now() - t0 });
    return { ok: false, http_status: e.status ?? null, error_type: cls.type, message: msg, exhausted: cls.exhaust };
  }
}

let sweepTimer = null;
function startResetSweep(minutes) {
  if (sweepTimer || !(minutes > 0)) return;
  sweepTimer = setInterval(() => resetDueKeys('schedule').catch((e) => console.error('[llmRouter] reset sweep failed:', e.code || e.message)), minutes * 60 * 1000);
  sweepTimer.unref();
}

module.exports = { callLLM, testKey, resetDueKeys, startResetSweep, logUsage, classify };

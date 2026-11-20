// Context help text. firm_id = 0 is the global default; a firm row overrides it.
const express = require('express');
const { pool } = require('../db');
const { ah, HttpError, ROLES } = require('../utils');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const KEY_RE = /^[a-z0-9_.-]{2,64}$/;

async function loadHelp(firmId) {
  const [rows] = await pool.query(
    `SELECT h.section_key, h.title, h.body, h.firm_id, h.updated_at, u.name AS updated_by_name
       FROM help_text h LEFT JOIN users u ON u.id = h.updated_by
      WHERE h.firm_id IN (0, ?) ORDER BY h.section_key, h.firm_id`, [firmId || 0]);
  const map = {};
  for (const r of rows) {
    // firm rows come after global rows (ORDER BY firm_id) and therefore override them
    map[r.section_key] = { ...r, scope: r.firm_id ? 'firm' : 'global' };
  }
  return map;
}

// Public: global help only (used by the login page)
router.get('/public', ah(async (req, res) => res.json(await loadHelp(0))));

router.use(authenticate);

router.get('/', ah(async (req, res) => res.json(await loadHelp(req.firmId))));

// Firm Admin -> writes a firm override. Super Admin -> writes the global default,
// or the selected firm's override when scope = 'firm'.
function targetFirm(req) {
  if (req.user.role === ROLES.FA) return req.user.firm_id;
  const scope = req.body?.scope || req.query.scope;
  if (scope === 'firm') {
    if (!req.firmId) throw new HttpError(400, 'Select a firm to edit firm-specific help');
    return req.firmId;
  }
  return 0;
}

router.put('/:key', requireRole(ROLES.SA, ROLES.FA), ah(async (req, res) => {
  const key = req.params.key;
  if (!KEY_RE.test(key)) throw new HttpError(400, 'Invalid section key');
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  if (!title || !body) throw new HttpError(400, 'Title and body are required');
  if (title.length > 150) throw new HttpError(400, 'Title is too long (150 characters max)');
  const firmId = targetFirm(req);
  await pool.query(
    `INSERT INTO help_text (firm_id, section_key, title, body, updated_by) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [firmId, key, title, body, req.user.id]);
  const map = await loadHelp(req.firmId || firmId);
  res.json(map[key]);
}));

// Remove a firm override (falls back to the global text). Super Admin with no scope deletes the global row.
router.delete('/:key', requireRole(ROLES.SA, ROLES.FA), ah(async (req, res) => {
  const firmId = targetFirm(req);
  await pool.query('DELETE FROM help_text WHERE firm_id = ? AND section_key = ?', [firmId, req.params.key]);
  res.json({ ok: true });
}));

module.exports = router;

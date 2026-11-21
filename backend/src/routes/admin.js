// Users, Firms, current-firm settings and pipeline stages.
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { ah, HttpError, ROLES, pick, assertTimezone } = require('../utils');
const { assertValues } = require('../services/lookups');
const { requireRole, requireFirm } = require('../middleware/auth');
const { getFirm } = require('../services/currency');

const DEFAULT_STAGES = [
  ['Prospecting', 1, 10, 0, 0],
  ['Qualification', 2, 25, 0, 0],
  ['Proposal', 3, 50, 0, 0],
  ['Negotiation', 4, 75, 0, 0],
  ['Closed Won', 5, 100, 1, 0],
  ['Closed Lost', 6, 0, 0, 1],
];

async function createDefaultStages(conn, firmId) {
  for (const [name, sort, prob, won, lost] of DEFAULT_STAGES) {
    await conn.query('INSERT INTO pipeline_stages (firm_id, name, sort_order, probability, is_won, is_lost) VALUES (?,?,?,?,?,?)',
      [firmId, name, sort, prob, won, lost]);
  }
}

// ======================= Users =======================
const users = express.Router();

// Lightweight list for owner/assignee dropdowns (any role, current firm)
users.get('/lookup', requireFirm, ah(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, role FROM users WHERE firm_id = ? AND is_active = 1 ORDER BY name', [req.firmId]);
  res.json(rows);
}));

users.use(requireRole(ROLES.SA, ROLES.FA));

function userScope(req) {
  // Firm Admin -> own firm. Super Admin -> selected firm, or all firms when none selected.
  if (req.user.role === ROLES.FA) return { sql: 'u.firm_id = ?', params: [req.user.firm_id] };
  if (req.firmId && req.query.all !== '1') return { sql: 'u.firm_id = ?', params: [req.firmId] };
  return { sql: '1=1', params: [] };
}

users.get('/', ah(async (req, res) => {
  const s = userScope(req);
  const where = [s.sql];
  const params = [...s.params];
  const q = String(req.query.q || '').trim();
  if (q) { where.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (req.query.role) { where.push('u.role = ?'); params.push(req.query.role); }
  const [rows] = await pool.query(
    `SELECT u.id, u.firm_id, u.name, u.email, u.role, u.phone, u.is_active, u.last_login_at, u.created_at, u.updated_at, f.name AS firm_name
       FROM users u LEFT JOIN firms f ON f.id = u.firm_id
      WHERE ${where.join(' AND ')}
      ORDER BY f.name IS NULL DESC, f.name, FIELD(u.role,'super_admin','firm_admin','manager','team_user'), u.name`, params);
  res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
}));

function validateRole(req, role) {
  const allowed = req.user.role === ROLES.SA ? Object.values(ROLES) : [ROLES.FA, ROLES.MG, ROLES.TU];
  if (!allowed.includes(role)) throw new HttpError(403, 'You cannot assign that role');
}

users.post('/', ah(async (req, res) => {
  const data = pick(req.body, ['name', 'email', 'role', 'phone', 'is_active']);
  if (!data.name || !data.email || !data.role) throw new HttpError(400, 'Name, email and role are required');
  const password = String(req.body.password || '');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  validateRole(req, data.role);
  data.email = String(data.email).trim().toLowerCase();
  if (data.role === ROLES.SA) data.firm_id = null;
  else if (req.user.role === ROLES.FA) data.firm_id = req.user.firm_id;
  else {
    data.firm_id = req.body.firm_id || req.firmId;
    if (!data.firm_id) throw new HttpError(400, 'Choose a firm for this user');
  }
  data.password_hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query('INSERT INTO users SET ?', [data]);
  res.status(201).json({ id: r.insertId });
}));

async function loadManagedUser(req, id) {
  const [[u]] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) throw new HttpError(404, 'User not found');
  if (req.user.role === ROLES.FA && (u.firm_id !== req.user.firm_id || u.role === ROLES.SA)) throw new HttpError(404, 'User not found');
  return u;
}

users.put('/:id', ah(async (req, res) => {
  const u = await loadManagedUser(req, req.params.id);
  const data = pick(req.body, ['name', 'email', 'role', 'phone', 'is_active']);
  if (data.email) data.email = String(data.email).trim().toLowerCase();
  if (data.role && data.role !== u.role) {
    if (u.id === req.user.id) throw new HttpError(400, 'You cannot change your own role');
    validateRole(req, data.role);
    if ((data.role === ROLES.SA) !== (u.role === ROLES.SA)) throw new HttpError(400, 'Super Admin role cannot be swapped with a firm role');
  }
  if (u.id === req.user.id && data.is_active !== undefined && !Number(data.is_active)) throw new HttpError(400, 'You cannot deactivate yourself');
  if (req.body.password) {
    if (String(req.body.password).length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    data.password_hash = await bcrypt.hash(String(req.body.password), 10);
  }
  if (req.user.role === ROLES.SA && req.body.firm_id && u.role !== ROLES.SA) data.firm_id = req.body.firm_id;
  if (Object.keys(data).length) await pool.query('UPDATE users SET ? WHERE id = ?', [data, u.id]);
  res.json({ ok: true });
}));

users.delete('/:id', ah(async (req, res) => {
  const u = await loadManagedUser(req, req.params.id);
  if (u.id === req.user.id) throw new HttpError(400, 'You cannot delete yourself');
  await pool.query('DELETE FROM users WHERE id = ?', [u.id]);
  res.json({ ok: true });
}));

// ======================= Firms (Super Admin) =======================
const firms = express.Router();
firms.use(requireRole(ROLES.SA));

firms.get('/', ah(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT f.*, c.name AS country_name,
      (SELECT COUNT(*) FROM users u WHERE u.firm_id = f.id) AS user_count,
      (SELECT COUNT(*) FROM contacts x WHERE x.firm_id = f.id) AS contact_count,
      (SELECT COUNT(*) FROM deals d WHERE d.firm_id = f.id) AS deal_count
    FROM firms f JOIN countries c ON c.code = f.country_code ORDER BY f.name`);
  res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
}));

const FIRM_FIELDS = ['name', 'country_code', 'base_currency', 'timezone', 'domain', 'status'];

firms.post('/', ah(async (req, res) => {
  const data = pick(req.body, FIRM_FIELDS);
  if (!data.name || !data.country_code || !data.base_currency) throw new HttpError(400, 'Name, country and base currency are required');
  assertTimezone(data.timezone);
  await assertValues(0, data, { status: 'firm_status' });
  const { admin_name, admin_email, admin_password } = req.body;
  if (admin_email && String(admin_password || '').length < 8) throw new HttpError(400, 'Admin password must be at least 8 characters');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('INSERT INTO firms SET ?', [data]);
    await createDefaultStages(conn, r.insertId);
    if (admin_email) {
      await conn.query('INSERT INTO users SET ?', [{
        firm_id: r.insertId, name: admin_name || 'Firm Admin', email: String(admin_email).toLowerCase().trim(),
        role: ROLES.FA, password_hash: await bcrypt.hash(String(admin_password), 10),
      }]);
    }
    await conn.commit();
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

firms.put('/:id', ah(async (req, res) => {
  const data = pick(req.body, FIRM_FIELDS);
  assertTimezone(data.timezone);
  await assertValues(0, data, { status: 'firm_status' });
  const [r] = await pool.query('UPDATE firms SET ? WHERE id = ?', [data, req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Firm not found');
  res.json({ ok: true });
}));

// ======================= Current firm settings =======================
const firm = express.Router();
firm.use(requireFirm);
firm.get('/', ah(async (req, res) => res.json(await getFirm(req.firmId))));
firm.put('/', requireRole(ROLES.SA, ROLES.FA), ah(async (req, res) => {
  const data = pick(req.body, ['name', 'country_code', 'base_currency', 'timezone', 'domain']);
  assertTimezone(data.timezone);
  if (Object.keys(data).length) await pool.query('UPDATE firms SET ? WHERE id = ?', [data, req.firmId]);
  res.json(await getFirm(req.firmId));
}));
firm.get('/stages', ah(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM pipeline_stages WHERE firm_id = ? ORDER BY sort_order', [req.firmId]);
  res.json(rows);
}));
firm.put('/stages/:id', requireRole(ROLES.SA, ROLES.FA), ah(async (req, res) => {
  const data = pick(req.body, ['name', 'probability']);
  if (data.probability !== undefined) data.probability = Math.max(0, Math.min(100, Number(data.probability) || 0));
  const [r] = await pool.query('UPDATE pipeline_stages SET ? WHERE id = ? AND firm_id = ?', [data, req.params.id, req.firmId]);
  if (!r.affectedRows) throw new HttpError(404, 'Stage not found');
  res.json({ ok: true });
}));

module.exports = { users, firms, firm, createDefaultStages, DEFAULT_STAGES };

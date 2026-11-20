const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../db');
const { ah, HttpError, ROLES } = require('../utils');
const { authenticate } = require('../middleware/auth');
const { getFirm } = require('../services/currency');

const router = express.Router();

router.post('/login', ah(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw new HttpError(400, 'Email and password are required');

  const [rows] = await pool.query(
    `SELECT u.*, f.status AS firm_status FROM users u LEFT JOIN firms f ON f.id = u.firm_id WHERE u.email = ?`,
    [email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new HttpError(401, 'Invalid email or password');
  if (!user.is_active) throw new HttpError(403, 'Your account is inactive. Contact your administrator.');
  if (user.role !== ROLES.SA && user.firm_status !== 'active') throw new HttpError(403, 'Your firm is suspended. Contact support.');

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  const token = jwt.sign({ sub: user.id, role: user.role, firm_id: user.firm_id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, firm_id: user.firm_id },
    firm: user.firm_id ? await getFirm(user.firm_id) : null,
  });
}));

router.get('/me', authenticate, ah(async (req, res) => {
  res.json({ user: req.user, firm: req.firmId ? await getFirm(req.firmId) : null });
}));

router.post('/change-password', authenticate, ah(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || String(new_password).length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
  const [[u]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(String(current_password || ''), u.password_hash))) throw new HttpError(400, 'Current password is incorrect');
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(String(new_password), 10), req.user.id]);
  res.json({ ok: true });
}));

module.exports = router;

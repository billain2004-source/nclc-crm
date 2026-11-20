// Countries, currencies and exchange rates (global reference data).
const express = require('express');
const { pool } = require('../db');
const { ah, HttpError, ROLES } = require('../utils');
const { requireRole } = require('../middleware/auth');
const { getLatestRates, convert } = require('../services/currency');

const router = express.Router();

router.get('/countries', ah(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM countries ORDER BY name');
  res.json(rows);
}));

router.get('/currencies', ah(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT c.*, er.rate_per_usd, er.effective_date
      FROM currencies c
      LEFT JOIN exchange_rates er ON er.currency_code = c.code
       AND er.effective_date = (SELECT MAX(effective_date) FROM exchange_rates x WHERE x.currency_code = c.code)
     ORDER BY c.code`);
  res.json(rows);
}));

router.post('/currencies', requireRole(ROLES.SA), ah(async (req, res) => {
  const { code, name, symbol, decimals = 2, rate_per_usd } = req.body || {};
  if (!/^[A-Z]{3}$/.test(String(code || ''))) throw new HttpError(400, 'Currency code must be 3 capital letters (ISO 4217)');
  if (!name || !symbol) throw new HttpError(400, 'Name and symbol are required');
  await pool.query('INSERT INTO currencies (code, name, symbol, decimals) VALUES (?,?,?,?)', [code, name, symbol, decimals]);
  if (rate_per_usd) {
    await pool.query('INSERT INTO exchange_rates (currency_code, rate_per_usd, effective_date, source, created_by) VALUES (?,?,CURDATE(),?,?)',
      [code, rate_per_usd, 'manual', req.user.id]);
  }
  res.status(201).json({ ok: true });
}));

router.put('/currencies/:code', requireRole(ROLES.SA), ah(async (req, res) => {
  const { name, symbol, is_active } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name;
  if (symbol !== undefined) data.symbol = symbol;
  if (is_active !== undefined) data.is_active = is_active ? 1 : 0;
  if (req.params.code === 'USD' && data.is_active === 0) throw new HttpError(400, 'USD is the pivot currency and cannot be deactivated');
  await pool.query('UPDATE currencies SET ? WHERE code = ?', [data, req.params.code]);
  res.json({ ok: true });
}));

router.get('/exchange-rates', ah(async (req, res) => {
  const params = [];
  let where = '1=1';
  if (req.query.currency) { where = 'er.currency_code = ?'; params.push(req.query.currency); }
  const [rows] = await pool.query(
    `SELECT er.*, u.name AS created_by_name FROM exchange_rates er LEFT JOIN users u ON u.id = er.created_by
      WHERE ${where} ORDER BY er.effective_date DESC, er.currency_code LIMIT 300`, params);
  res.json(rows);
}));

router.post('/exchange-rates', requireRole(ROLES.SA), ah(async (req, res) => {
  const { currency_code, rate_per_usd, effective_date, source } = req.body || {};
  if (!currency_code || !(Number(rate_per_usd) > 0)) throw new HttpError(400, 'Currency and a positive rate are required');
  if (currency_code === 'USD' && Number(rate_per_usd) !== 1) throw new HttpError(400, 'USD rate is always 1');
  await pool.query(
    `INSERT INTO exchange_rates (currency_code, rate_per_usd, effective_date, source, created_by)
     VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE rate_per_usd = VALUES(rate_per_usd), source = VALUES(source), created_by = VALUES(created_by)`,
    [currency_code, rate_per_usd, effective_date || new Date().toISOString().slice(0, 10), source || 'manual', req.user.id]);
  res.status(201).json({ ok: true });
}));

router.get('/convert', ah(async (req, res) => {
  const rates = await getLatestRates();
  const { amount, from, to } = req.query;
  res.json({ amount: Number(amount), from, to, result: convert(Number(amount), from, to, rates) });
}));

module.exports = router;

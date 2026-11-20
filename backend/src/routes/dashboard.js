const express = require('express');
const { pool } = require('../db');
const { ah, ROLES } = require('../utils');
const { requireFirm } = require('../middleware/auth');
const { getLatestRates, convert, getFirm } = require('../services/currency');

const router = express.Router();

router.get('/', requireFirm, ah(async (req, res) => {
  const firmId = req.firmId;
  const isTeam = req.user.role === ROLES.TU;
  const own = isTeam ? ' AND owner_id = ?' : '';
  const ownP = isTeam ? [req.user.id] : [];
  const [firm, rates] = await Promise.all([getFirm(firmId), getLatestRates()]);
  const base = firm.base_currency;

  const [[counts]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM contacts  WHERE firm_id = ?) AS contacts,
       (SELECT COUNT(*) FROM companies WHERE firm_id = ?) AS companies,
       (SELECT COUNT(*) FROM leads WHERE firm_id = ? AND status IN ('new','contacted','qualified')${own}) AS open_leads,
       (SELECT COUNT(*) FROM deals WHERE firm_id = ? AND status = 'open'${own}) AS open_deals`,
    [firmId, firmId, firmId, ...ownP, firmId, ...ownP]);

  const [stages] = await pool.query('SELECT id, name, sort_order, probability, is_won, is_lost FROM pipeline_stages WHERE firm_id = ? ORDER BY sort_order', [firmId]);
  const [deals] = await pool.query(
    `SELECT d.id, d.name, d.amount, d.currency_code, d.probability, d.status, d.stage_id, d.closed_at, d.expected_close_date, d.owner_id, d.updated_at,
            u.name AS owner_name, c.name AS company_name
       FROM deals d LEFT JOIN users u ON u.id = d.owner_id LEFT JOIN companies c ON c.id = d.company_id
      WHERE d.firm_id = ?${isTeam ? ' AND d.owner_id = ?' : ''}`, [firmId, ...ownP]);

  let openValue = 0, weighted = 0, wonValue = 0, wonCount = 0, lostCount = 0;
  const byStage = Object.fromEntries(stages.map((s) => [s.id, { ...s, count: 0, value: 0 }]));
  const byOwner = {};
  for (const d of deals) {
    const v = convert(d.amount, d.currency_code, base, rates) || 0;
    d.amount_base = v;
    byStage[d.stage_id].count += 1;
    byStage[d.stage_id].value += v;
    if (d.status === 'open') {
      openValue += v;
      weighted += (v * d.probability) / 100;
      const k = d.owner_name || 'Unassigned';
      byOwner[k] = (byOwner[k] || 0) + v;
    } else if (d.status === 'won') { wonValue += v; wonCount += 1; } else { lostCount += 1; }
  }

  const [leadStatus] = await pool.query(`SELECT status, COUNT(*) AS count FROM leads WHERE firm_id = ?${own} GROUP BY status`, [firmId, ...ownP]);
  const [leadSource] = await pool.query(`SELECT COALESCE(source,'Unknown') AS source, COUNT(*) AS count FROM leads WHERE firm_id = ?${own} GROUP BY source ORDER BY count DESC`, [firmId, ...ownP]);

  const taskScope = isTeam ? ' AND (t.assigned_to = ? OR t.created_by = ?)' : '';
  const taskP = isTeam ? [req.user.id, req.user.id] : [];
  const [[taskCounts]] = await pool.query(
    `SELECT SUM(t.status <> 'done' AND t.due_date < NOW()) AS overdue,
            SUM(t.status <> 'done' AND DATE(t.due_date) = CURDATE()) AS due_today,
            SUM(t.status <> 'done') AS open_total
       FROM tasks t WHERE t.firm_id = ?${taskScope}`, [firmId, ...taskP]);
  const [upcoming] = await pool.query(
    `SELECT t.id, t.title, t.type, t.priority, t.status, t.due_date, u.name AS assigned_name
       FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.firm_id = ? AND t.status <> 'done'${taskScope}
        AND t.due_date <= DATE_ADD(NOW(), INTERVAL 7 DAY)
      ORDER BY t.due_date ASC LIMIT 8`, [firmId, ...taskP]);

  const round = (n) => Math.round(n * 100) / 100;
  res.json({
    firm: { id: firm.id, name: firm.name, base_currency: base, currency_symbol: firm.currency_symbol },
    scope: isTeam ? 'mine' : 'firm',
    counts: { ...counts },
    pipeline: {
      open_value: round(openValue),
      weighted_value: round(weighted),
      won_value: round(wonValue),
      won_count: wonCount,
      lost_count: lostCount,
      win_rate: wonCount + lostCount ? Math.round((wonCount / (wonCount + lostCount)) * 100) : null,
    },
    by_stage: Object.values(byStage).map((s) => ({ ...s, value: round(s.value) })),
    by_owner: Object.entries(byOwner).map(([name, value]) => ({ name, value: round(value) })).sort((a, b) => b.value - a.value),
    leads_by_status: leadStatus,
    leads_by_source: leadSource,
    tasks: { overdue: Number(taskCounts.overdue || 0), due_today: Number(taskCounts.due_today || 0), open_total: Number(taskCounts.open_total || 0), upcoming },
    recent_deals: deals.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 5)
      .map((d) => ({ id: d.id, name: d.name, company_name: d.company_name, amount: d.amount, currency_code: d.currency_code, amount_base: d.amount_base, status: d.status })),
  });
}));

module.exports = router;

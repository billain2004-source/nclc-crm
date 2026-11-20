// Contacts, Companies, Leads, Deals and Tasks routers built on the CRUD factory.
const { crudRouter } = require('./crudFactory');
const { pool } = require('../db');
const { ah, HttpError, ROLES } = require('../utils');
const { getLatestRates, convert, getFirm } = require('../services/currency');

const ALL = [ROLES.SA, ROLES.FA, ROLES.MG, ROLES.TU];
const NOT_TEAM = [ROLES.SA, ROLES.FA, ROLES.MG];

// Adds <field>_base (amount converted to the firm's base currency) to every row.
function moneyDecorator(amountField, currencyField) {
  return async (rows, req) => {
    if (!rows.length) return rows;
    const [rates, firm] = await Promise.all([getLatestRates(), getFirm(req.firmId)]);
    const base = firm.base_currency;
    return rows.map((r) => ({
      ...r,
      base_currency: base,
      [`${amountField}_base`]: convert(r[amountField], r[currencyField] || base, base, rates),
    }));
  };
}

// ---------------- Contacts ----------------
const contacts = crudRouter({
  table: 'contacts',
  fields: ['company_id', 'first_name', 'last_name', 'email', 'phone', 'mobile', 'job_title', 'lifecycle_stage', 'city', 'country_code', 'notes', 'owner_id'],
  required: ['first_name', 'last_name'],
  searchCols: ['t.first_name', 't.last_name', 't.email', 't.phone', 'c.name', 't.job_title'],
  selectSql: `t.*, CONCAT(t.first_name, ' ', t.last_name) AS full_name, c.name AS company_name, u.name AS owner_name`,
  fromSql: `FROM contacts t LEFT JOIN companies c ON c.id = t.company_id LEFT JOIN users u ON u.id = t.owner_id`,
  filters: { company_id: 't.company_id', owner_id: 't.owner_id', lifecycle_stage: 't.lifecycle_stage' },
  ownerCol: 'owner_id',
  deleteRoles: NOT_TEAM,
  defaultSort: 't.last_name ASC',
});

// ---------------- Companies ----------------
const companies = crudRouter({
  table: 'companies',
  fields: ['name', 'domain', 'industry', 'phone', 'email', 'city', 'country_code', 'employees', 'annual_revenue', 'currency_code', 'description', 'owner_id'],
  required: ['name'],
  searchCols: ['t.name', 't.domain', 't.industry', 't.city'],
  selectSql: `t.*, u.name AS owner_name,
    (SELECT COUNT(*) FROM contacts x WHERE x.company_id = t.id) AS contact_count,
    (SELECT COUNT(*) FROM deals d WHERE d.company_id = t.id) AS deal_count`,
  fromSql: `FROM companies t LEFT JOIN users u ON u.id = t.owner_id`,
  filters: { industry: 't.industry', owner_id: 't.owner_id', country_code: 't.country_code' },
  ownerCol: 'owner_id',
  deleteRoles: NOT_TEAM,
  defaultSort: 't.name ASC',
  decorate: moneyDecorator('annual_revenue', 'currency_code'),
});

// ---------------- Leads ----------------
const leads = crudRouter({
  table: 'leads',
  fields: ['first_name', 'last_name', 'email', 'phone', 'company_name', 'job_title', 'source', 'status', 'score', 'estimated_value', 'currency_code', 'country_code', 'notes', 'owner_id'],
  required: ['first_name', 'last_name'],
  searchCols: ['t.first_name', 't.last_name', 't.email', 't.company_name', 't.source'],
  selectSql: `t.*, CONCAT(t.first_name, ' ', t.last_name) AS full_name, u.name AS owner_name`,
  fromSql: `FROM leads t LEFT JOIN users u ON u.id = t.owner_id`,
  filters: { status: 't.status', source: 't.source', owner_id: 't.owner_id' },
  ownerCol: 'owner_id',
  teamScope: { sql: 't.owner_id = ?', params: (u) => [u.id] },
  deleteRoles: ALL,
  decorate: moneyDecorator('estimated_value', 'currency_code'),
  beforeSave: async (data, req, existing) => {
    if (data.status === 'converted' && (!existing || existing.status !== 'converted')) {
      throw new HttpError(400, 'Use the Convert action to convert a lead');
    }
    if (existing && existing.status === 'converted' && data.status && data.status !== 'converted') {
      throw new HttpError(400, 'A converted lead cannot change status');
    }
    if (data.score !== undefined && data.score !== null) data.score = Math.max(0, Math.min(100, Number(data.score) || 0));
    return data;
  },
  extend: (router, { findOne }) => {
    // Convert lead -> Company (optional) + Contact + Deal (optional)
    router.post('/:id/convert', ah(async (req, res) => {
      const lead = await findOne(req, req.params.id);
      if (lead.status === 'converted') throw new HttpError(400, 'Lead is already converted');
      const { create_deal = true, deal_name, amount, currency_code, stage_id, expected_close_date } = req.body || {};
      const firm = await getFirm(req.firmId);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        let companyId = null;
        if (lead.company_name) {
          const [found] = await conn.query('SELECT id FROM companies WHERE firm_id = ? AND name = ? LIMIT 1', [req.firmId, lead.company_name]);
          if (found.length) companyId = found[0].id;
          else {
            const [c] = await conn.query('INSERT INTO companies SET ?', [{
              firm_id: req.firmId, name: lead.company_name, country_code: lead.country_code,
              currency_code: lead.currency_code || firm.base_currency, owner_id: lead.owner_id,
            }]);
            companyId = c.insertId;
          }
        }
        const [ct] = await conn.query('INSERT INTO contacts SET ?', [{
          firm_id: req.firmId, company_id: companyId, first_name: lead.first_name, last_name: lead.last_name,
          email: lead.email, phone: lead.phone, job_title: lead.job_title, lifecycle_stage: 'opportunity',
          country_code: lead.country_code, owner_id: lead.owner_id, notes: lead.notes,
        }]);
        let dealId = null;
        if (create_deal) {
          let stage;
          if (stage_id) {
            const [s] = await conn.query('SELECT * FROM pipeline_stages WHERE id = ? AND firm_id = ?', [stage_id, req.firmId]);
            if (!s.length) throw new HttpError(400, 'Invalid stage');
            stage = s[0];
          } else {
            const [s] = await conn.query('SELECT * FROM pipeline_stages WHERE firm_id = ? ORDER BY sort_order LIMIT 1', [req.firmId]);
            stage = s[0];
          }
          const [d] = await conn.query('INSERT INTO deals SET ?', [{
            firm_id: req.firmId, name: deal_name || `${lead.company_name || lead.full_name} - New deal`,
            company_id: companyId, contact_id: ct.insertId, stage_id: stage.id,
            amount: amount ?? lead.estimated_value ?? 0,
            currency_code: currency_code || lead.currency_code || firm.base_currency,
            probability: stage.probability, status: stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open',
            expected_close_date: expected_close_date || null, lead_id: lead.id, owner_id: lead.owner_id,
          }]);
          dealId = d.insertId;
        }
        await conn.query(
          `UPDATE leads SET status = 'converted', converted_contact_id = ?, converted_company_id = ?, converted_deal_id = ?, converted_at = NOW()
            WHERE id = ? AND firm_id = ?`,
          [ct.insertId, companyId, dealId, lead.id, req.firmId]
        );
        await conn.commit();
        res.json({ ok: true, contact_id: ct.insertId, company_id: companyId, deal_id: dealId });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }));
  },
});

// ---------------- Deals ----------------
const DEAL_SELECT = `t.*, s.name AS stage_name, s.sort_order AS stage_order, c.name AS company_name,
  CONCAT(ct.first_name, ' ', ct.last_name) AS contact_name, u.name AS owner_name`;
const DEAL_FROM = `FROM deals t
  JOIN pipeline_stages s ON s.id = t.stage_id
  LEFT JOIN companies c ON c.id = t.company_id
  LEFT JOIN contacts ct ON ct.id = t.contact_id
  LEFT JOIN users u ON u.id = t.owner_id`;
const dealDecorator = async (rows, req) => {
  const out = await moneyDecorator('amount', 'currency_code')(rows, req);
  return out.map((r) => ({ ...r, weighted_base: r.amount_base == null ? null : Math.round(r.amount_base * r.probability) / 100 }));
};

const deals = crudRouter({
  table: 'deals',
  fields: ['name', 'company_id', 'contact_id', 'stage_id', 'amount', 'currency_code', 'probability', 'expected_close_date', 'description', 'owner_id'],
  required: ['name'],
  searchCols: ['t.name', 'c.name', 'ct.first_name', 'ct.last_name'],
  selectSql: DEAL_SELECT,
  fromSql: DEAL_FROM,
  filters: { stage_id: 't.stage_id', status: 't.status', owner_id: 't.owner_id', company_id: 't.company_id' },
  ownerCol: 'owner_id',
  teamScope: { sql: 't.owner_id = ?', params: (u) => [u.id] },
  deleteRoles: ALL,
  decorate: dealDecorator,
  beforeSave: async (data, req, existing) => {
    if (!existing) {
      if (!data.currency_code) data.currency_code = (await getFirm(req.firmId)).base_currency;
      if (!data.stage_id) {
        const [s] = await pool.query('SELECT id FROM pipeline_stages WHERE firm_id = ? ORDER BY sort_order LIMIT 1', [req.firmId]);
        data.stage_id = s[0].id;
      }
    }
    if (data.amount !== undefined && data.amount !== null && Number(data.amount) < 0) throw new HttpError(400, 'Amount cannot be negative');
    const stageChanged = data.stage_id !== undefined && (!existing || String(data.stage_id) !== String(existing.stage_id));
    if (stageChanged) {
      const [s] = await pool.query('SELECT * FROM pipeline_stages WHERE id = ? AND firm_id = ?', [data.stage_id, req.firmId]);
      if (!s.length) throw new HttpError(400, 'Invalid stage');
      const stage = s[0];
      const probabilityExplicit = data.probability !== undefined && data.probability !== null &&
        (!existing ? true : String(data.probability) !== String(existing.probability));
      // Business rule: stage change resets probability to the stage default (closed stages are always 100/0)
      if (!probabilityExplicit || stage.is_won || stage.is_lost) data.probability = stage.probability;
      data.status = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open';
      data.closed_at = stage.is_won || stage.is_lost ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
    }
    if (data.probability !== undefined && data.probability !== null) data.probability = Math.max(0, Math.min(100, Number(data.probability) || 0));
    return data;
  },
  extend: (router, { scope, decorate }) => {
    // Kanban board: all stages with the deals in each
    router.get('/board', ah(async (req, res) => {
      const [stages] = await pool.query('SELECT * FROM pipeline_stages WHERE firm_id = ? ORDER BY sort_order', [req.firmId]);
      const { where, params } = scope(req);
      if (req.query.owner_id) { where.push('t.owner_id = ?'); params.push(req.query.owner_id); }
      const [rows] = await pool.query(`SELECT ${DEAL_SELECT} ${DEAL_FROM} WHERE ${where.join(' AND ')} ORDER BY t.updated_at DESC`, params);
      const dealsDecorated = await decorate(rows, req);
      const firm = await getFirm(req.firmId);
      res.json({
        base_currency: firm.base_currency,
        stages: stages.map((s) => {
          const items = dealsDecorated.filter((d) => d.stage_id === s.id);
          return { ...s, deals: items, total_base: items.reduce((a, d) => a + (d.amount_base || 0), 0) };
        }),
      });
    }));
  },
});

// ---------------- Tasks ----------------
const tasks = crudRouter({
  table: 'tasks',
  fields: ['title', 'description', 'type', 'priority', 'status', 'due_date', 'assigned_to', 'contact_id', 'deal_id'],
  required: ['title'],
  searchCols: ['t.title', 't.description', 'd.name', 'ct.first_name', 'ct.last_name'],
  selectSql: `t.*, au.name AS assigned_name, cu.name AS created_by_name,
    CONCAT(ct.first_name, ' ', ct.last_name) AS contact_name, d.name AS deal_name`,
  fromSql: `FROM tasks t
    LEFT JOIN users au ON au.id = t.assigned_to
    LEFT JOIN users cu ON cu.id = t.created_by
    LEFT JOIN contacts ct ON ct.id = t.contact_id
    LEFT JOIN deals d ON d.id = t.deal_id`,
  filters: { status: 't.status', priority: 't.priority', type: 't.type', assigned_to: 't.assigned_to', deal_id: 't.deal_id', contact_id: 't.contact_id' },
  ownerCol: 'assigned_to',
  createdByCol: 'created_by',
  teamScope: { sql: '(t.assigned_to = ? OR t.created_by = ?)', params: (u) => [u.id, u.id] },
  deleteRoles: ALL,
  defaultSort: "t.status = 'done' ASC, t.due_date IS NULL ASC, t.due_date ASC",
  extraWhere: (req, where) => {
    if (req.query.due === 'overdue') where.push("t.status <> 'done' AND t.due_date < NOW()");
    if (req.query.due === 'today') where.push('DATE(t.due_date) = CURDATE()');
    if (req.query.due === 'week') where.push("t.status <> 'done' AND t.due_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)");
    if (req.query.open === '1') where.push("t.status <> 'done'");
  },
  beforeSave: async (data, req, existing) => {
    if (data.due_date) data.due_date = String(data.due_date).replace('T', ' ').slice(0, 19);
    if (data.status !== undefined) {
      if (data.status === 'done' && (!existing || existing.status !== 'done')) data.completed_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      if (data.status !== 'done') data.completed_at = null;
    }
    return data;
  },
});

module.exports = { contacts, companies, leads, deals, tasks };

// Generic, firm-scoped CRUD router used by Contacts, Companies, Leads, Deals and Tasks.
// Security rules enforced here (server side):
//   * every query is filtered by t.firm_id = req.firmId (tenant isolation)
//   * Team Users only see rows matched by cfg.teamScope (e.g. their own leads/deals/tasks)
//   * Team Users can't assign records to other users
//   * referenced ids (company_id, contact_id, ...) must belong to the same firm
//   * delete is limited to cfg.deleteRoles
//   * dropdown columns (cfg.lookups: column -> lookup list) must hold an active value from lookup_values
const express = require('express');
const { pool } = require('../db');
const { ah, HttpError, ROLES, pick } = require('../utils');
const { requireFirm } = require('../middleware/auth');
const { assertValues } = require('../services/lookups');

const REF_TABLES = {
  company_id: 'companies',
  contact_id: 'contacts',
  deal_id: 'deals',
  stage_id: 'pipeline_stages',
  owner_id: 'users',
  assigned_to: 'users',
};

async function checkRefs(firmId, data) {
  for (const [col, table] of Object.entries(REF_TABLES)) {
    const v = data[col];
    if (v === undefined || v === null || v === '') continue;
    const extra = table === 'users' ? ' AND is_active = 1' : '';
    const [r] = await pool.query(`SELECT id FROM ${table} WHERE id = ? AND firm_id = ?${extra}`, [v, firmId]);
    if (!r.length) throw new HttpError(400, `Invalid ${col.replace('_id', '').replace('_', ' ')}: not found in this firm`);
  }
}

function crudRouter(cfg) {
  const {
    table, fields, required = [], searchCols = [], selectSql, fromSql,
    filters = {}, ownerCol, teamScope, deleteRoles, defaultSort = 't.updated_at DESC',
    createdByCol, beforeSave, decorate, extraWhere, extend, lookups = {},
  } = cfg;

  const router = express.Router();
  router.use(requireFirm);

  function scope(req) {
    const where = ['t.firm_id = ?'];
    const params = [req.firmId];
    if (req.user.role === ROLES.TU && teamScope) {
      where.push(teamScope.sql);
      params.push(...teamScope.params(req.user));
    }
    return { where, params };
  }

  async function findOne(req, id) {
    const { where, params } = scope(req);
    const [rows] = await pool.query(
      `SELECT ${selectSql} ${fromSql} WHERE ${where.join(' AND ')} AND t.id = ?`,
      [...params, id]
    );
    if (!rows.length) throw new HttpError(404, 'Record not found (or you do not have access to it)');
    return decorate ? (await decorate(rows, req))[0] : rows[0];
  }

  const helpers = { scope, findOne, decorate };
  if (extend) extend(router, helpers);

  router.get('/', ah(async (req, res) => {
    const { where, params } = scope(req);
    const q = String(req.query.q || '').trim();
    if (q && searchCols.length) {
      where.push('(' + searchCols.map((c) => `${c} LIKE ?`).join(' OR ') + ')');
      searchCols.forEach(() => params.push(`%${q}%`));
    }
    for (const [key, col] of Object.entries(filters)) {
      const v = req.query[key];
      if (v !== undefined && v !== '') { where.push(`${col} = ?`); params.push(v); }
    }
    if (req.query.mine === '1' && ownerCol) { where.push(`t.${ownerCol} = ?`); params.push(req.user.id); }
    if (extraWhere) extraWhere(req, where, params);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const sortable = new Set(['id', 'created_at', 'updated_at', ...fields]);
    let order = defaultSort;
    if (req.query.sort && sortable.has(req.query.sort)) {
      order = `t.${req.query.sort} ${req.query.dir === 'asc' ? 'ASC' : 'DESC'}`;
    }
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${fromSql} WHERE ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT ${selectSql} ${fromSql} WHERE ${whereSql} ORDER BY ${order}, t.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    const data = decorate ? await decorate(rows, req) : rows;
    res.json({ data, total, page, pageSize });
  }));

  router.get('/:id', ah(async (req, res) => res.json(await findOne(req, req.params.id))));

  router.post('/', ah(async (req, res) => {
    let data = pick(req.body, fields);
    for (const f of required) {
      if (data[f] === undefined || data[f] === null || String(data[f]).trim() === '') throw new HttpError(400, `${f.replace(/_/g, ' ')} is required`);
    }
    if (ownerCol) {
      if (req.user.role === ROLES.TU) {
        if (data[ownerCol] && Number(data[ownerCol]) !== req.user.id) throw new HttpError(403, 'Team users cannot assign records to other users');
        data[ownerCol] = req.user.id;
      } else if (!data[ownerCol]) {
        data[ownerCol] = req.user.role === ROLES.SA ? null : req.user.id;
      }
    }
    if (beforeSave) data = await beforeSave(data, req, null);
    await assertValues(req.firmId, data, lookups);
    await checkRefs(req.firmId, data);
    data.firm_id = req.firmId;
    if (createdByCol) data[createdByCol] = req.user.id;
    const [r] = await pool.query(`INSERT INTO ${table} SET ?`, [data]);
    res.status(201).json(await findOne(req, r.insertId));
  }));

  router.put('/:id', ah(async (req, res) => {
    const existing = await findOne(req, req.params.id);
    let data = pick(req.body, fields);
    for (const f of required) {
      if (f in data && (data[f] === null || String(data[f]).trim() === '')) throw new HttpError(400, `${f.replace(/_/g, ' ')} is required`);
    }
    if (ownerCol && req.user.role === ROLES.TU && data[ownerCol] !== undefined) {
      const newOwner = data[ownerCol] === null ? null : Number(data[ownerCol]);
      const oldOwner = existing[ownerCol] === null ? null : Number(existing[ownerCol]);
      if (newOwner !== oldOwner && newOwner !== req.user.id) throw new HttpError(403, 'Team users cannot assign records to other users');
    }
    if (beforeSave) data = await beforeSave(data, req, existing);
    await assertValues(req.firmId, data, lookups, existing);
    const changedRefs = {};
    for (const col of Object.keys(REF_TABLES)) {
      if (data[col] !== undefined && String(data[col]) !== String(existing[col])) changedRefs[col] = data[col];
    }
    await checkRefs(req.firmId, changedRefs);
    if (Object.keys(data).length) {
      await pool.query(`UPDATE ${table} SET ? WHERE id = ? AND firm_id = ?`, [data, req.params.id, req.firmId]);
    }
    res.json(await findOne(req, req.params.id));
  }));

  router.delete('/:id', ah(async (req, res) => {
    if (deleteRoles && !deleteRoles.includes(req.user.role)) throw new HttpError(403, 'Your role cannot delete these records');
    await findOne(req, req.params.id);
    await pool.query(`DELETE FROM ${table} WHERE id = ? AND firm_id = ?`, [req.params.id, req.firmId]);
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { crudRouter, checkRefs };

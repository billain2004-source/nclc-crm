// Dropdown values (lookup_lists / lookup_values).
// Effective values for a firm = global rows (firm_id 0) merged with that firm's rows by code:
// a firm row overrides label / sort_order / is_active; a firm row with a new code is a firm-only value.
const { pool } = require('../db');
const { HttpError } = require('../utils');

// Where each list is stored (used for "in use" counts and delete protection)
const USAGE = {
  lead_status: ['leads', 'status'],
  lead_source: ['leads', 'source'],
  contact_lifecycle: ['contacts', 'lifecycle_stage'],
  company_industry: ['companies', 'industry'],
  task_type: ['tasks', 'type'],
  task_priority: ['tasks', 'priority'],
  task_status: ['tasks', 'status'],
  deal_status: ['deals', 'status'],
  firm_status: ['firms', 'status'],
};

async function getLists(db = pool) {
  const [rows] = await db.query('SELECT * FROM lookup_lists ORDER BY sort_order, name');
  return rows;
}

async function getList(code, db = pool) {
  const [[row]] = await db.query('SELECT * FROM lookup_lists WHERE code = ?', [code]);
  if (!row) throw new HttpError(404, `Unknown dropdown list "${code}"`);
  return row;
}

// Returns { list_code: [{ code, label, sort_order, is_active, is_system, scope, default_label }] }
async function getValues(firmId, listCode = null, db = pool) {
  const fid = Number(firmId) || 0;
  const params = [fid];
  let where = 'firm_id IN (0, ?)';
  if (listCode) { where += ' AND list_code = ?'; params.push(listCode); }
  const [rows] = await db.query(`SELECT * FROM lookup_values WHERE ${where} ORDER BY firm_id`, params);
  const merged = {};
  for (const r of rows) {
    const k = `${r.list_code}|${r.code}`;
    const g = merged[k];
    if (r.firm_id === 0 || !g) {
      merged[k] = {
        list_code: r.list_code, code: r.code, label: r.label, sort_order: r.sort_order, is_active: !!r.is_active,
        is_system: !!r.is_system, scope: r.firm_id === 0 ? 'global' : 'firm_only',
        default_label: r.firm_id === 0 ? r.label : null, default_active: r.firm_id === 0 ? !!r.is_active : null,
        default_sort: r.firm_id === 0 ? r.sort_order : null,
      };
    } else {
      // firm override of a global value
      Object.assign(g, { label: r.label, sort_order: r.sort_order, is_active: !!r.is_active, scope: 'override' });
    }
  }
  const out = {};
  for (const v of Object.values(merged)) (out[v.list_code] ||= []).push(v);
  for (const l of Object.values(out)) l.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
  return listCode ? out[listCode] || [] : out;
}

// Counts of each code in use for a firm (firmId 0 = all firms)
async function usageCounts(firmId, listCode) {
  const u = USAGE[listCode];
  if (!u) return {};
  const [table, col] = u;
  const firmCol = table === 'firms' ? 'id' : 'firm_id';
  const [rows] = await pool.query(
    `SELECT ${col} AS code, COUNT(*) AS n FROM ${table} ${firmId ? `WHERE ${firmCol} = ?` : ''} GROUP BY ${col}`, firmId ? [firmId] : []);
  return Object.fromEntries(rows.map((r) => [r.code, Number(r.n)]));
}

// Validates dropdown fields of a record before saving. `fields` maps column -> list code.
// New values must be an active code for the firm; an unchanged value is always accepted
// (records keep a value even after it is deactivated). Empty strings become NULL.
async function assertValues(firmId, data, fields, existing = null) {
  const lists = {};
  for (const [col, listCode] of Object.entries(fields)) {
    if (!(col in data)) continue;
    if (data[col] === '' || data[col] === undefined) data[col] = null;
    const v = data[col];
    if (v === null) continue;
    if (existing && String(existing[col]) === String(v)) continue;
    lists[listCode] ||= await getValues(firmId, listCode);
    const hit = lists[listCode].find((x) => x.code === String(v));
    if (!hit) throw new HttpError(400, `"${v}" is not a valid ${col.replace(/_/g, ' ')} (see Settings > Dropdown Values)`);
    if (!hit.is_active) throw new HttpError(400, `"${hit.label}" is no longer an active ${col.replace(/_/g, ' ')}`);
  }
  return data;
}

module.exports = { USAGE, getLists, getList, getValues, usageCounts, assertValues };

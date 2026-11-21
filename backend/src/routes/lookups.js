// /api/lookups - dropdown values for forms and filters, and Settings > Dropdown Values.
//   GET  /                         every list with its effective values for the current firm (all users)
//   GET  /:list?usage=1            one list (+ in-use counts; admins)
//   POST /:list/values             add a value               (Firm Admin: firm scope; Super Admin: scope global|firm)
//   PUT  /:list/values/:code       relabel / reorder / (de)activate
//   POST /:list/reorder            { codes: [...] } in the new order
//   DELETE /:list/values/:code     firm scope: remove the firm override (back to default) or an unused firm-only value
//                                  global scope: remove an unused, non-system global value
const express = require('express');
const { pool } = require('../db');
const { ah, HttpError, ROLES } = require('../utils');
const { requireRole } = require('../middleware/auth');
const { getLists, getList, getValues, usageCounts } = require('../services/lookups');
const { slugCode } = require('../../db/seedLookups');

const router = express.Router();
const ADMINS = requireRole(ROLES.SA, ROLES.FA);

router.get('/', ah(async (req, res) => {
  const [lists, values] = await Promise.all([getLists(), getValues(req.firmId)]);
  res.json({ lists, values });
}));

router.get('/:list', ah(async (req, res) => {
  const list = await getList(req.params.list);
  const values = await getValues(req.firmId, list.code);
  if (req.query.usage === '1' && [ROLES.SA, ROLES.FA].includes(req.user.role)) {
    const counts = await usageCounts(req.firmId || 0, list.code);
    for (const v of values) v.in_use = counts[v.code] || 0;
  }
  res.json({ list, values });
}));

// Resolves which rows an admin request edits: 'global' (firm_id 0, Super Admin only) or the current firm.
function resolveScope(req, list) {
  const wanted = req.body?.scope || req.query.scope || (req.user.role === ROLES.SA && !req.firmId ? 'global' : 'firm');
  if (!['global', 'firm'].includes(wanted)) throw new HttpError(400, 'scope must be "global" or "firm"');
  if (wanted === 'global') {
    if (req.user.role !== ROLES.SA) throw new HttpError(403, 'Only the Super Admin can change the default values');
    return 0;
  }
  if (!req.firmId) throw new HttpError(400, 'Select a firm first (or edit the global defaults)');
  if (!list.firm_editable && req.user.role !== ROLES.SA) throw new HttpError(403, `"${list.name}" can only be changed by the Super Admin`);
  return req.firmId;
}

async function findValue(firmId, listCode, code) {
  const v = (await getValues(firmId, listCode)).find((x) => x.code === code);
  if (!v) throw new HttpError(404, `Value "${code}" not found in this list`);
  return v;
}

function cleanLabel(label) {
  const l = String(label ?? '').trim();
  if (!l) throw new HttpError(400, 'Label is required');
  if (l.length > 100) throw new HttpError(400, 'Label must be 100 characters or fewer');
  return l;
}

// Writes a row for (scopeFirm, list, code), copying is_system from the global row.
async function upsert(scopeFirm, listCode, code, fields, userId) {
  const [[row]] = await pool.query('SELECT id FROM lookup_values WHERE firm_id = ? AND list_code = ? AND code = ?', [scopeFirm, listCode, code]);
  if (row) {
    await pool.query('UPDATE lookup_values SET ?, updated_by = ? WHERE id = ?', [fields, userId, row.id]);
  } else {
    const [[g]] = await pool.query('SELECT label, sort_order, is_active, is_system FROM lookup_values WHERE firm_id = 0 AND list_code = ? AND code = ?', [listCode, code]);
    await pool.query('INSERT INTO lookup_values SET ?', [{
      firm_id: scopeFirm, list_code: listCode, code, label: g?.label ?? code, sort_order: g?.sort_order ?? 0,
      is_active: g ? g.is_active : 1, is_system: g ? g.is_system : 0, ...fields, updated_by: userId,
    }]);
  }
}

router.post('/:list/values', ADMINS, ah(async (req, res) => {
  const list = await getList(req.params.list);
  const scopeFirm = resolveScope(req, list);
  if (!list.allow_custom) throw new HttpError(400, `"${list.name}" has fixed values; you can only change labels and order`);
  const label = cleanLabel(req.body.label);
  const code = slugCode(req.body.code || label);
  if (!code) throw new HttpError(400, 'Code must contain letters or digits');
  const existing = await getValues(scopeFirm, list.code);
  if (existing.some((v) => v.code === code)) throw new HttpError(409, `The code "${code}" already exists in this list`);
  const sort = req.body.sort_order !== undefined && req.body.sort_order !== '' ? Number(req.body.sort_order)
    : Math.max(0, ...existing.map((v) => v.sort_order)) + 10;
  await pool.query('INSERT INTO lookup_values SET ?', [{
    firm_id: scopeFirm, list_code: list.code, code, label, sort_order: sort, is_active: 1, is_system: 0, updated_by: req.user.id,
  }]);
  res.status(201).json(await findValue(scopeFirm, list.code, code));
}));

router.put('/:list/values/:code', ADMINS, ah(async (req, res) => {
  const list = await getList(req.params.list);
  const scopeFirm = resolveScope(req, list);
  const current = await findValue(scopeFirm, list.code, req.params.code);
  const fields = {};
  if (req.body.label !== undefined) fields.label = cleanLabel(req.body.label);
  if (req.body.sort_order !== undefined && req.body.sort_order !== '') fields.sort_order = Number(req.body.sort_order) || 0;
  if (req.body.is_active !== undefined) {
    fields.is_active = req.body.is_active === true || req.body.is_active === 1 || req.body.is_active === '1' ? 1 : 0;
    if (!fields.is_active && current.is_system) throw new HttpError(400, `"${current.label}" is used by the system and cannot be deactivated`);
  }
  if (!Object.keys(fields).length) throw new HttpError(400, 'Nothing to change');
  await upsert(scopeFirm, list.code, current.code, fields, req.user.id);
  res.json(await findValue(scopeFirm, list.code, current.code));
}));

router.post('/:list/reorder', ADMINS, ah(async (req, res) => {
  const list = await getList(req.params.list);
  const scopeFirm = resolveScope(req, list);
  const codes = Array.isArray(req.body.codes) ? req.body.codes.map(String) : [];
  const values = await getValues(scopeFirm, list.code);
  const known = new Set(values.map((v) => v.code));
  if (!codes.length || codes.some((c) => !known.has(c))) throw new HttpError(400, 'codes must list values of this list');
  const ordered = [...codes, ...values.map((v) => v.code).filter((c) => !codes.includes(c))];
  for (const [i, code] of ordered.entries()) {
    const sort = (i + 1) * 10;
    if (values.find((v) => v.code === code).sort_order !== sort) await upsert(scopeFirm, list.code, code, { sort_order: sort }, req.user.id);
  }
  res.json(await getValues(scopeFirm, list.code));
}));

router.delete('/:list/values/:code', ADMINS, ah(async (req, res) => {
  const list = await getList(req.params.list);
  const scopeFirm = resolveScope(req, list);
  const code = req.params.code;
  const [[own]] = await pool.query('SELECT * FROM lookup_values WHERE firm_id = ? AND list_code = ? AND code = ?', [scopeFirm, list.code, code]);
  if (!own) throw new HttpError(404, scopeFirm ? 'This firm has no override for that value' : 'Value not found');
  const [[global]] = scopeFirm
    ? await pool.query('SELECT id FROM lookup_values WHERE firm_id = 0 AND list_code = ? AND code = ?', [list.code, code])
    : [[own]];
  const removesValue = !scopeFirm || !global; // otherwise it only resets a firm override to the default
  if (removesValue) {
    if (own.is_system) throw new HttpError(400, 'System values cannot be deleted');
    const used = (await usageCounts(scopeFirm, list.code))[code] || 0;
    if (used) throw new HttpError(409, `"${own.label}" is used by ${used} record(s); deactivate it instead`);
  }
  if (scopeFirm) await pool.query('DELETE FROM lookup_values WHERE id = ?', [own.id]);
  else await pool.query('DELETE FROM lookup_values WHERE list_code = ? AND code = ?', [list.code, code]); // global + all firm overrides
  res.json({ ok: true, reset_to_default: !removesValue });
}));

module.exports = router;

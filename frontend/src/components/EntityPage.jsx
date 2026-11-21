// Generic list + create/edit form used by every CRM module.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { HelpIcon } from '../help';
import Modal from './Modal';

export function Field({ f, value, onChange }) {
  const common = { id: `f_${f.name}`, value: value ?? '', disabled: f.disabled, required: f.required, onChange: (e) => onChange(f.name, e.target.value) };
  let input;
  if (f.type === 'select') {
    input = (
      <select {...common}>
        {!f.required && <option value="">{f.placeholder || '— None —'}</option>}
        {f.required && (value === '' || value == null) && <option value="">Select…</option>}
        {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else if (f.type === 'textarea') {
    input = <textarea rows={f.rows || 3} {...common} />;
  } else if (f.type === 'checkbox') {
    input = <input type="checkbox" id={common.id} checked={!!Number(value)} disabled={f.disabled} onChange={(e) => onChange(f.name, e.target.checked ? 1 : 0)} />;
  } else {
    input = <input type={f.type || 'text'} {...common} min={f.min} max={f.max} step={f.step} placeholder={f.placeholder} autoComplete={f.autoComplete} />;
  }
  return (
    <label className={`field ${f.full ? 'full' : ''} ${f.type === 'checkbox' ? 'checkbox' : ''}`} htmlFor={common.id}>
      <span>{f.label}{f.required ? ' *' : ''}</span>
      {input}
      {f.hint && <small className="muted">{f.hint}</small>}
    </label>
  );
}

export function EntityForm({ title, helpKey, groups, initial, onSubmit, onDelete, onClose, extra, wide }) {
  const [values, setValues] = useState(initial);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (name, v) => setValues((s) => ({ ...s, [name]: v }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await onSubmit(values); } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  async function del() {
    if (!confirm('Delete this record? This cannot be undone.')) return;
    setBusy(true); setErr('');
    try { await onDelete(); } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  const resolved = typeof groups === 'function' ? groups(values) : groups;
  return (
    <Modal title={title} help={helpKey && <HelpIcon k={helpKey} />} onClose={onClose} wide={wide}>
      <form onSubmit={submit}>
        {resolved.map((g) => (
          <fieldset key={g.title} className="group">
            <legend>{g.title} {g.help && <HelpIcon k={g.help} label={g.title} />}</legend>
            <div className="form">
              {g.fields.filter((f) => !f.hidden).map((f) => <Field key={f.name} f={f} value={values[f.name]} onChange={set} />)}
            </div>
          </fieldset>
        ))}
        {extra}
        {err && <div className="error">{err}</div>}
        <div className="form-actions">
          {onDelete && <button type="button" className="btn danger" onClick={del} disabled={busy}>Delete</button>}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

const PAGE_SIZE = 25;

export default function EntityPage({
  title, helpKey, endpoint, columns, filters = [], formGroups, formHelp, defaults = {}, singular,
  canCreate = true, canDelete = () => true, rowActions, toolbar, toForm = (r) => r, fromForm = (v) => v,
  reloadSignal, emptyText = 'No records found.', rowClass, formExtra,
}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [fv, setFv] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api(endpoint, { params: { q, page, pageSize: PAGE_SIZE, ...fv } });
      setRows(r.data); setTotal(r.total); setError('');
    } catch (ex) { setError(ex.message); } finally { setLoading(false); }
  }, [endpoint, q, page, fv]);

  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q, reloadSignal]);

  async function save(values) {
    const body = fromForm(values);
    if (editing.id) await api(`${endpoint}/${editing.id}`, { method: 'PUT', body });
    else await api(endpoint, { method: 'POST', body });
    setEditing(null);
    load();
  }
  async function remove() {
    await api(`${endpoint}/${editing.id}`, { method: 'DELETE' });
    setEditing(null);
    load();
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const name = singular || title.replace(/s$/, '');

  return (
    <div className="page">
      <div className="page-head">
        <h1>{title} {helpKey && <HelpIcon k={helpKey} label={title} />}</h1>
        <div className="page-actions">
          {toolbar}
          {canCreate && <button className="btn primary" onClick={() => setEditing({ ...defaults })}>+ New {name.toLowerCase()}</button>}
        </div>
      </div>

      <div className="filters">
        <input className="search" placeholder={`Search ${title.toLowerCase()}…`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search" />
        {filters.map((f) => (
          <select key={f.key} value={fv[f.key] || ''} aria-label={f.label} onChange={(e) => { setFv((s) => ({ ...s, [f.key]: e.target.value })); setPage(1); }}>
            <option value="">{f.label}: All</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <span className="muted count">{total} {total === 1 ? 'record' : 'records'}</span>
      </div>

      {error && <div className="error">{error}</div>}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr>{columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'right' : ''}>{c.label}</th>)}{rowActions && <th />}</tr></thead>
          <tbody>
            {loading && !rows.length && <tr><td colSpan={columns.length + 1} className="muted center">Loading…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={columns.length + 1} className="muted center">{emptyText}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className={`clickable ${rowClass ? rowClass(r) : ''}`} onClick={() => setEditing(r)}>
                {columns.map((c) => <td key={c.key} className={c.align === 'right' ? 'right' : ''}>{c.render ? c.render(r, load) : (r[c.key] ?? '—')}</td>)}
                {rowActions && <td className="right nowrap" onClick={(e) => e.stopPropagation()}>{rowActions(r, load)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Prev</button>
          <span className="muted">Page {page} of {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next ›</button>
        </div>
      )}

      {editing && (
        <EntityForm
          title={editing.id ? `Edit ${name.toLowerCase()}` : `New ${name.toLowerCase()}`}
          helpKey={formHelp || helpKey}
          groups={formGroups}
          initial={editing.id ? toForm(editing) : editing}
          onSubmit={save}
          onDelete={editing.id && canDelete(editing) ? remove : null}
          onClose={() => setEditing(null)}
          extra={formExtra && editing.id ? formExtra(editing, () => { setEditing(null); load(); }) : null}
        />
      )}
    </div>
  );
}

// Settings > Dropdown Values: edit the choice lists used by forms and filters (lookup_lists / lookup_values).
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { HelpIcon } from '../../help';
import { invalidateDropdowns } from '../../dropdowns';

const SCOPE_PILL = { global: ['Default', ''], override: ['Firm override', 'st-qualified'], firm_only: ['Firm only', 'st-contacted'] };

export default function Dropdowns() {
  const { user, firm } = useAuth();
  const isSA = user.role === 'super_admin';
  const [scope, setScope] = useState(isSA && !firm ? 'global' : 'firm');
  const [lists, setLists] = useState([]);
  const [listCode, setListCode] = useState('lead_status');
  const [list, setList] = useState(null);
  const [rows, setRows] = useState([]);
  const [adding, setAdding] = useState({ label: '', code: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Super Admin "global" scope reads the defaults; send no firm header by asking for scope=global on writes.
  const viewingGlobal = scope === 'global';
  const editable = list && (isSA || list.firm_editable);

  const load = useCallback(async () => {
    setErr('');
    try {
      const [all, one] = await Promise.all([
        api('/lookups'),
        api(`/lookups/${listCode}`, { params: { usage: 1, ...(viewingGlobal ? { scope: 'global' } : {}) } }),
      ]);
      setLists(all.lists);
      setList(one.list);
      // In global scope show the default (firm_id 0) values, not the current firm's overrides
      setRows(viewingGlobal
        ? one.values.filter((v) => v.scope !== 'firm_only').map((v) => ({ ...v, label: v.default_label, is_active: v.default_active, sort_order: v.default_sort, scope: 'global', draft: v.default_label }))
        : one.values.map((v) => ({ ...v, draft: v.label })));
    } catch (e) { setErr(e.message); }
  }, [listCode, viewingGlobal]);
  useEffect(() => { load(); }, [load, firm?.id]);

  async function run(fn, okMsg) {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); setMsg(okMsg); invalidateDropdowns(); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const body = (extra) => ({ ...extra, scope });
  const url = (code) => `/lookups/${listCode}/values/${encodeURIComponent(code)}`;

  const save = (r) => run(() => api(url(r.code), { method: 'PUT', body: body({ label: r.draft }) }), `Saved "${r.draft}".`);
  const toggle = (r) => run(() => api(url(r.code), { method: 'PUT', body: body({ is_active: !r.is_active }) }), `"${r.label}" ${r.is_active ? 'deactivated' : 'activated'}.`);
  const remove = (r) => {
    const reset = !viewingGlobal && r.scope === 'override';
    if (!window.confirm(reset ? `Reset "${r.label}" to the default label, order and status?` : `Delete "${r.label}"? This cannot be undone.`)) return;
    run(() => api(`${url(r.code)}?scope=${scope}`, { method: 'DELETE' }), reset ? `"${r.label}" reset to default.` : `"${r.label}" deleted.`);
  };
  const move = (i, dir) => {
    const codes = rows.map((r) => r.code);
    const j = i + dir;
    if (j < 0 || j >= codes.length) return;
    [codes[i], codes[j]] = [codes[j], codes[i]];
    run(() => api(`/lookups/${listCode}/reorder`, { method: 'POST', body: body({ codes }) }), 'Order saved.');
  };
  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await api(`/lookups/${listCode}/values`, { method: 'POST', body: body({ label: adding.label, code: adding.code || undefined }) });
      setAdding({ label: '', code: '' });
    }, `Added "${adding.label}".`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dropdown values <HelpIcon k="settings.lookups" label="Dropdown values" /></h1>
        {isSA && (
          <div className="page-actions">
            <div className="seg" role="tablist" aria-label="Scope">
              <button className={!viewingGlobal ? 'on' : ''} disabled={!firm} onClick={() => setScope('firm')} title={firm ? '' : 'Select a firm first'}>This firm</button>
              <button className={viewingGlobal ? 'on' : ''} onClick={() => setScope('global')}>Global defaults</button>
            </div>
            <HelpIcon k="settings.lookups.scope" />
          </div>
        )}
      </div>
      <p className="note">
        {viewingGlobal
          ? <>Editing the <b>global defaults</b> that every firm starts with. Firms that changed a value keep their own version.</>
          : <>Editing values for <b>{firm?.name}</b>. Changes apply to this firm only; “Reset” brings back the default. <HelpIcon k="settings.lookups.scope" /></>}
        {' '}Records store the <b>code</b>; only the label is shown, so renaming is always safe.
      </p>
      {msg && <div className="ok">{msg}</div>}
      {err && <div className="error">{err}</div>}

      <div className="split">
        <nav className="card list-picker" aria-label="Dropdown lists">
          {lists.map((l) => (
            <button key={l.code} className={l.code === listCode ? 'on' : ''} onClick={() => { setListCode(l.code); setMsg(''); setErr(''); }}>
              {l.name}<small className="muted">{l.used_by}</small>
            </button>
          ))}
        </nav>

        <section className="card grow">
          {list && <>
            <h2 className="card-title">{list.name} <HelpIcon k="settings.lookups.values" />
              <span className="card-meta">
                {!list.allow_custom && <span className="badge">Fixed values</span>}
                {!list.firm_editable && <span className="badge">Super Admin only</span>}
              </span>
            </h2>
            {list.description && <p className="muted small">{list.description}</p>}
            {!editable && <p className="note">Only the Super Admin can change this list.</p>}
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Order</th><th>Label</th><th>Code</th><th>Scope</th><th>Status</th><th className="right">In use</th><th /></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.code} className={r.is_active ? '' : 'row-done'}>
                      <td className="nowrap">
                        <button className="btn sm ghost" aria-label={`Move ${r.label} up`} disabled={!editable || busy || i === 0} onClick={() => move(i, -1)}>▲</button>
                        <button className="btn sm ghost" aria-label={`Move ${r.label} down`} disabled={!editable || busy || i === rows.length - 1} onClick={() => move(i, 1)}>▼</button>
                      </td>
                      <td>
                        <input value={r.draft} aria-label={`Label for ${r.code}`} disabled={!editable} maxLength={100}
                          onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, draft: e.target.value } : x)))} />
                        {!viewingGlobal && r.scope === 'override' && r.default_label !== r.label && <div className="muted small">Default: {r.default_label}</div>}
                      </td>
                      <td><code>{r.code}</code>{r.is_system && <span className="pill" title="Used by the program: can be renamed and moved, not deactivated">System</span>}</td>
                      <td><span className={`pill ${SCOPE_PILL[r.scope][1]}`}>{SCOPE_PILL[r.scope][0]}</span></td>
                      <td><span className={`pill ${r.is_active ? 'st-active' : 'st-disabled'}`}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td className="right">{viewingGlobal ? '—' : r.in_use ?? 0}</td>
                      <td className="right nowrap">
                        {editable && <>
                          <button className="btn sm" disabled={busy || r.draft === r.label || !r.draft.trim()} onClick={() => save(r)}>Save</button>{' '}
                          {!r.is_system && <button className="btn sm ghost" disabled={busy} onClick={() => toggle(r)}>{r.is_active ? 'Deactivate' : 'Activate'}</button>}{' '}
                          {!viewingGlobal && r.scope === 'override' && <button className="btn sm ghost" disabled={busy} onClick={() => remove(r)}>Reset</button>}
                          {!r.is_system && (viewingGlobal || r.scope === 'firm_only') && <button className="btn sm ghost danger" disabled={busy} onClick={() => remove(r)}>Delete</button>}
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editable && list.allow_custom ? (
              <form className="add-row" onSubmit={add}>
                <b>Add a value</b> <HelpIcon k="settings.lookups.add" />
                <input placeholder="Label, e.g. Nurturing" aria-label="New label" value={adding.label} maxLength={100} required
                  onChange={(e) => setAdding({ ...adding, label: e.target.value })} />
                <input placeholder="Code (optional)" aria-label="New code" value={adding.code} maxLength={40}
                  onChange={(e) => setAdding({ ...adding, code: e.target.value })} />
                <button className="btn primary" disabled={busy || !adding.label.trim()}>+ Add {viewingGlobal ? 'default value' : `for ${firm?.name}`}</button>
              </form>
            ) : editable ? <p className="muted small">This list has fixed values: you can change labels and order only.</p> : null}
          </>}
        </section>
      </div>
    </div>
  );
}

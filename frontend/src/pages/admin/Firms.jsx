import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { HelpIcon } from '../../help';
import { EntityForm } from '../../components/EntityPage';
import { date } from '../../format';
import { opts, useLookups } from '../../lookups';
import { useDropdowns } from '../../dropdowns';

export default function Firms() {
  const { reloadFirms, selectFirm, firm } = useAuth();
  const lk = useLookups(['countries', 'currencies']);
  const dd = useDropdowns();
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api('/firms').then((r) => setRows(r.data)).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const groups = (v) => [
    { title: 'Firm details', help: 'admin.firms.form', fields: [
      { name: 'name', label: 'Firm name', required: true, full: true },
      { name: 'country_code', label: 'Country', type: 'select', required: true, options: opts.countries(lk.countries) },
      { name: 'base_currency', label: 'Base currency', type: 'select', required: true, options: opts.currencies(lk.currencies) },
      { name: 'timezone', label: 'Time zone', type: 'select', required: true, options: opts.timezones(v.timezone) },
      { name: 'domain', label: 'Email domain', placeholder: 'firm.example' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: dd.options('firm_status', v.status) },
    ] },
    ...(!v.id ? [{ title: 'First Firm Admin (optional)', help: 'admin.users.form', fields: [
      { name: 'admin_name', label: 'Admin name' },
      { name: 'admin_email', label: 'Admin email', type: 'email' },
      { name: 'admin_password', label: 'Admin password', type: 'password', hint: 'At least 8 characters', autoComplete: 'new-password' },
    ] }] : []),
  ];

  async function save(v) {
    if (v.id) await api(`/firms/${v.id}`, { method: 'PUT', body: v });
    else await api('/firms', { method: 'POST', body: v });
    setEditing(null);
    await load();
    await reloadFirms();
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Firms <HelpIcon k="admin.firms" label="Firms" /></h1>
        <button className="btn primary" onClick={() => setEditing({ status: 'active', timezone: 'UTC' })}>+ New firm</button>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Firm</th><th>Country</th><th>Base currency</th><th>Status</th><th className="right">Users</th><th className="right">Contacts</th><th className="right">Deals</th><th>Created</th><th /></tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} className="clickable" onClick={() => setEditing(f)}>
                <td><b>{f.name}</b><div className="muted small">{f.domain}</div></td>
                <td>{f.country_name}</td>
                <td>{f.base_currency}</td>
                <td><span className={`pill st-${f.status}`}>{dd.label('firm_status', f.status)}</span></td>
                <td className="right">{f.user_count}</td>
                <td className="right">{f.contact_count}</td>
                <td className="right">{f.deal_count}</td>
                <td>{date(f.created_at)}</td>
                <td className="right" onClick={(e) => e.stopPropagation()}>
                  {String(firm?.id) === String(f.id) ? <span className="muted small">Current</span> : <button className="btn sm" onClick={() => selectFirm(f.id)}>Open</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <EntityForm title={editing.id ? 'Edit firm' : 'New firm'} helpKey="admin.firms" groups={groups} initial={editing} onSubmit={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

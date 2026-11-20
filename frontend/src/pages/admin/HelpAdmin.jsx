import { useState } from 'react';
import { useAuth } from '../../auth';
import { HelpEditor, HelpIcon, useHelp } from '../../help';
import { dateTime } from '../../format';

export default function HelpAdmin() {
  const { help } = useHelp();
  const { user, firm } = useAuth();
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const items = Object.values(help)
    .filter((h) => !q || `${h.section_key} ${h.title} ${h.body}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.section_key.localeCompare(b.section_key));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Help text <HelpIcon k="admin.help" label="Help text" /></h1>
        <span className="muted">
          {user.role === 'super_admin' ? `Editing defaults for all firms, or overrides for ${firm?.name || 'the selected firm'}` : `Overrides apply to ${firm?.name} only`}
        </span>
      </div>
      <div className="filters">
        <input className="search" placeholder="Search help text…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search help" />
        <span className="muted count">{items.length} sections</span>
      </div>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Section key</th><th>Title</th><th>Text</th><th>Scope</th><th>Last updated</th></tr></thead>
          <tbody>
            {items.map((h) => (
              <tr key={h.section_key} className="clickable" onClick={() => setEditing(h)}>
                <td><code>{h.section_key}</code></td>
                <td><b>{h.title}</b></td>
                <td className="clip">{h.body}</td>
                <td><span className={`pill ${h.scope === 'firm' ? 'st-qualified' : ''}`}>{h.scope === 'firm' ? 'Firm override' : 'Default'}</span></td>
                <td className="nowrap">{h.updated_by_name || 'system'}<div className="muted small">{dateTime(h.updated_at)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <HelpEditor sectionKey={editing.section_key} current={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

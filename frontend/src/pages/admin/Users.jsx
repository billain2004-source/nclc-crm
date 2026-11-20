import EntityPage from '../../components/EntityPage';
import { useAuth } from '../../auth';
import { HelpIcon } from '../../help';
import { ROLE_LABELS, dateTime } from '../../format';

export default function Users() {
  const { user, firms, firm } = useAuth();
  const isSA = user.role === 'super_admin';
  const roleOptions = Object.entries(ROLE_LABELS)
    .filter(([k]) => isSA || k !== 'super_admin')
    .map(([value, label]) => ({ value, label }));

  const groups = (v) => [
    { title: 'User account', help: 'admin.users.form', fields: [
      { name: 'name', label: 'Full name', required: true },
      { name: 'email', label: 'Email (login)', type: 'email', required: true },
      { name: 'phone', label: 'Phone' },
      { name: 'role', label: 'Role', type: 'select', required: true, options: roleOptions, disabled: v.id === user.id },
      ...(isSA && v.role !== 'super_admin' ? [{ name: 'firm_id', label: 'Firm', type: 'select', required: true, options: firms.map((f) => ({ value: f.id, label: f.name })) }] : []),
      { name: 'password', label: v.id ? 'New password (leave blank to keep)' : 'Password', type: 'password', required: !v.id, autoComplete: 'new-password', hint: 'At least 8 characters' },
      { name: 'is_active', label: 'Active (can sign in)', type: 'checkbox', disabled: v.id === user.id },
    ] },
  ];

  return (
    <div>
      <EntityPage
        title="Users" helpKey="admin.users" endpoint="/users"
        defaults={{ role: 'team_user', is_active: 1, firm_id: firm?.id || '' }}
        toForm={(r) => ({ ...r, password: '' })}
        fromForm={(v) => { const out = { ...v }; if (!out.password) delete out.password; return out; }}
        canDelete={(r) => r.id !== user.id}
        toolbar={<span className="muted small">Roles explained <HelpIcon k="roles" label="Roles & permissions" /></span>}
        filters={[{ key: 'role', label: 'Role', options: roleOptions }]}
        columns={[
          { key: 'name', label: 'Name', render: (r) => <><b>{r.name}</b>{r.id === user.id && <span className="muted small"> (you)</span>}</> },
          { key: 'email', label: 'Email' },
          ...(isSA ? [{ key: 'firm_name', label: 'Firm', render: (r) => r.firm_name || <i className="muted">All firms</i> }] : []),
          { key: 'role', label: 'Role', render: (r) => <span className={`pill role-${r.role}`}>{ROLE_LABELS[r.role]}</span> },
          { key: 'is_active', label: 'Status', render: (r) => (r.is_active ? <span className="pill st-active">Active</span> : <span className="pill st-lost">Inactive</span>) },
          { key: 'last_login_at', label: 'Last login', render: (r) => dateTime(r.last_login_at) },
        ]}
        formGroups={groups}
      />
    </div>
  );
}

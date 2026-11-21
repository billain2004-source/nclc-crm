import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
import { ROLE_LABELS } from '../format';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/contacts', label: 'Contacts', icon: '👤' },
  { to: '/companies', label: 'Companies', icon: '🏢' },
  { to: '/leads', label: 'Leads', icon: '✦' },
  { to: '/deals', label: 'Deals', icon: '◎' },
  { to: '/tasks', label: 'Tasks', icon: '✓' },
  { to: '/ai/agents', label: 'AI agents', icon: '✨' },
];

export default function Layout() {
  const { user, firm, firms, selectFirm, logout, can } = useAuth();
  const admin = [
    can.superAdmin && { to: '/admin/firms', label: 'Firms' },
    can.admin && { to: '/admin/users', label: 'Users' },
    { to: '/admin/currencies', label: 'Currencies' },
    can.editHelp && { to: '/admin/help', label: 'Help text' },
  ].filter(Boolean);
  // Settings menu: Super Admin and Firm Admin only
  const settings = can.admin ? [
    { to: '/settings/firm', label: 'Firm settings' },
    { to: '/settings/api-keys', label: 'API Keys' },
    { to: '/settings/dropdowns', label: 'Dropdown values' },
  ] : [];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="logo">N</span> NCLC CRM</div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="nav-ic" aria-hidden>{n.icon}</span>{n.label}
            </NavLink>
          ))}
          <div className="nav-section">Admin</div>
          {admin.map((n) => <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>{n.label}</NavLink>)}
          {settings.length > 0 && <div className="nav-section">Settings</div>}
          {settings.map((n) => <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>{n.label}</NavLink>)}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="firm-info">
            {can.superAdmin ? (
              <label className="firm-switch">
                <span className="muted">Working in firm</span>
                <select value={firm?.id || ''} onChange={(e) => selectFirm(e.target.value)}>
                  {firms.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.base_currency})</option>)}
                </select>
              </label>
            ) : (
              <span className="firm-name">{firm?.name}</span>
            )}
            {firm && <span className="chip" title="Base currency">{firm.country_name} · {firm.base_currency} {firm.currency_symbol}</span>}
          </div>
          <div className="user-info">
            <span className="avatar" aria-hidden>{user.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
            <span className="user-meta"><b>{user.name}</b><small>{ROLE_LABELS[user.role]}</small></span>
            <button className="btn ghost sm" onClick={logout}>Sign out</button>
          </div>
        </header>
        <main className="content">
          {firm ? <Outlet /> : <div className="page"><p className="muted">No firm selected. Create a firm in Admin › Firms.</p><Outlet /></div>}
        </main>
      </div>
    </div>
  );
}

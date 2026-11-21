import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { HelpProvider } from './help';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Companies from './pages/Companies';
import Leads from './pages/Leads';
import Deals from './pages/Deals';
import Tasks from './pages/Tasks';
import Firms from './pages/admin/Firms';
import Users from './pages/admin/Users';
import Currencies from './pages/admin/Currencies';
import HelpAdmin from './pages/admin/HelpAdmin';
import FirmSettings from './pages/admin/FirmSettings';
import ApiKeys from './pages/settings/ApiKeys';
import AgentRuns from './pages/AgentRuns';
import './styles.css';

const ADMINS = ['super_admin', 'firm_admin'];

function Guard({ allow, children }) {
  const { user } = useAuth();
  if (allow && !allow.includes(user.role)) return <div className="page"><div className="error">You do not have access to this page.</div></div>;
  return children;
}

function App() {
  const { user, firm, ready } = useAuth();
  if (!ready) return <div className="splash">Loading…</div>;
  if (!user) {
    return (
      <HelpProvider publicOnly>
        <Routes><Route path="*" element={<Login />} /></Routes>
      </HelpProvider>
    );
  }
  const needFirm = (el) => (firm ? el : null);
  return (
    <HelpProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={needFirm(<Dashboard />)} />
          <Route path="contacts" element={needFirm(<Contacts />)} />
          <Route path="companies" element={needFirm(<Companies />)} />
          <Route path="leads" element={needFirm(<Leads />)} />
          <Route path="deals" element={needFirm(<Deals />)} />
          <Route path="tasks" element={needFirm(<Tasks />)} />
          <Route path="ai/agents" element={needFirm(<AgentRuns />)} />
          <Route path="admin/firms" element={<Guard allow={['super_admin']}><Firms /></Guard>} />
          <Route path="admin/users" element={<Guard allow={['super_admin', 'firm_admin']}><Users /></Guard>} />
          <Route path="admin/currencies" element={<Currencies />} />
          <Route path="admin/help" element={<Guard allow={['super_admin', 'firm_admin']}><HelpAdmin /></Guard>} />
          <Route path="admin/settings" element={<Navigate to="/settings/firm" replace />} />
          <Route path="settings/firm" element={<Guard allow={ADMINS}>{needFirm(<FirmSettings />)}</Guard>} />
          <Route path="settings/api-keys" element={<Guard allow={ADMINS}><ApiKeys /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HelpProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

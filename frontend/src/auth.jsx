import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, session } from './api';
import { setFirmLocale } from './format';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [firm, setFirm] = useState(null);
  const [firms, setFirms] = useState([]);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    session.setToken(null);
    session.setFirm(null);
    setUser(null);
    setFirm(null);
  }, []);

  useEffect(() => { session.onUnauthorized(logout); }, [logout]);

  const loadSuperAdminFirms = useCallback(async () => {
    const r = await api('/firms');
    setFirms(r.data);
    let id = session.firmId;
    if (!id || !r.data.some((f) => String(f.id) === String(id))) id = r.data[0]?.id;
    session.setFirm(id);
    setFirm(id ? await api('/firm') : null);
  }, []);

  useEffect(() => {
    (async () => {
      if (!session.token) { setReady(true); return; }
      try {
        const me = await api('/auth/me');
        setUser(me.user);
        if (me.user.role === 'super_admin') await loadSuperAdminFirms();
        else setFirm(me.firm);
      } catch {
        logout();
      } finally {
        setReady(true);
      }
    })();
  }, [loadSuperAdminFirms, logout]);

  async function login(email, password) {
    session.setFirm(null);
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    session.setToken(r.token);
    setUser(r.user);
    if (r.user.role === 'super_admin') await loadSuperAdminFirms();
    else setFirm(r.firm);
  }

  async function selectFirm(id) {
    session.setFirm(id);
    setFirm(await api('/firm'));
  }

  async function refreshFirm() {
    setFirm(await api('/firm'));
    if (user?.role === 'super_admin') setFirms((await api('/firms')).data);
  }

  setFirmLocale(firm?.country_code); // format money/dates for the active firm's country

  const role = user?.role;
  const can = {
    admin: role === 'super_admin' || role === 'firm_admin',
    superAdmin: role === 'super_admin',
    manage: role !== 'team_user', // reassign, delete contacts/companies
    editHelp: role === 'super_admin' || role === 'firm_admin',
  };

  return (
    <AuthCtx.Provider value={{ user, firm, firms, ready, login, logout, selectFirm, refreshFirm, reloadFirms: loadSuperAdminFirms, can }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

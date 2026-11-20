import { useState } from 'react';
import { useAuth } from '../auth';
import { HelpIcon } from '../help';

const DEMO = [
  ['Super Admin', 'superadmin@nclc-crm.example', 'Super@123'],
  ['Firm Admin (UK)', 'admin@northwind.example', 'Demo@123'],
  ['Manager (India)', 'manager@sahyadri.example', 'Demo@123'],
  ['Team User (US)', 'sales1@lakeshore.example', 'Demo@123'],
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await login(email, password); } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <form className="login card" onSubmit={submit}>
        <div className="brand big"><span className="logo">N</span> NCLC CRM</div>
        <h1>Sign in <HelpIcon k="login" label="Signing in" /></h1>
        <label className="field full"><span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus />
        </label>
        <label className="field full"><span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="demo">
          <div className="muted">Demo accounts (click to fill):</div>
          {DEMO.map(([r, e, p]) => (
            <button type="button" key={e} className="demo-row" onClick={() => { setEmail(e); setPassword(p); }}>
              <b>{r}</b><span>{e}</span>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}

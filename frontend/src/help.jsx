// Context help: loads help_text once per firm and renders a "?" icon with a popover.
// Firm Admin / Super Admin get an "Edit" button that saves back to the help_text table.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import Modal from './components/Modal';
import { dateTime } from './format';

const HelpCtx = createContext({ help: {}, reload: () => {} });

export function HelpProvider({ children, publicOnly = false }) {
  const { user, firm } = useAuth();
  const [help, setHelp] = useState({});
  const reload = useCallback(async () => {
    try {
      setHelp(await api(publicOnly || !user ? '/help/public' : '/help'));
    } catch { /* help is optional */ }
  }, [publicOnly, user]);
  useEffect(() => { reload(); }, [reload, firm?.id]);
  return <HelpCtx.Provider value={{ help, reload }}>{children}</HelpCtx.Provider>;
}

export const useHelp = () => useContext(HelpCtx);

export function HelpIcon({ k, label }) {
  const { help } = useHelp();
  const { can, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);
  const h = help[k];

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <span className="help" ref={ref}>
      <button type="button" className="help-btn" aria-label={`Help: ${h?.title || label || k}`} aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}>?</button>
      {open && (
        <div className="help-pop" role="dialog" onClick={(e) => e.stopPropagation()}>
          <div className="help-pop-title">{h?.title || label || 'Help'}</div>
          <div className="help-pop-body">{h?.body || 'No help text has been written for this section yet.'}</div>
          <div className="help-pop-foot">
            <span className="muted">
              {h ? <>{h.scope === 'firm' ? 'Firm-specific' : 'Default'} · {h.updated_by_name || 'system'} · {dateTime(h.updated_at)}</> : <code>{k}</code>}
            </span>
            {user && can.editHelp && <button type="button" className="btn-link" onClick={() => { setOpen(false); setEditing(true); }}>Edit</button>}
          </div>
        </div>
      )}
      {editing && <HelpEditor sectionKey={k} current={h} onClose={() => setEditing(false)} />}
    </span>
  );
}

export function HelpEditor({ sectionKey, current, onClose }) {
  const { reload } = useHelp();
  const { user, firm } = useAuth();
  const isSA = user.role === 'super_admin';
  const [title, setTitle] = useState(current?.title || '');
  const [body, setBody] = useState(current?.body || '');
  const [scope, setScope] = useState(isSA ? (current?.scope === 'firm' ? 'firm' : 'global') : 'firm');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api(`/help/${encodeURIComponent(sectionKey)}`, { method: 'PUT', body: { title, body, scope } });
      await reload();
      onClose();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }
  async function reset() {
    if (!confirm('Remove the firm-specific text and use the default?')) return;
    setBusy(true);
    try {
      await api(`/help/${encodeURIComponent(sectionKey)}`, { method: 'DELETE', params: { scope: 'firm' } });
      await reload();
      onClose();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={`Edit help: ${sectionKey}`} onClose={onClose}>
      <form onSubmit={save} className="form">
        {isSA ? (
          <label className="field full">
            <span>Applies to</span>
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="global">All firms (global default)</option>
              {firm && <option value="firm">Only {firm.name} (override)</option>}
            </select>
          </label>
        ) : (
          <p className="note full">Your changes apply to <b>{firm?.name}</b> only and override the default text.</p>
        )}
        <label className="field full"><span>Title *</span><input value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} required /></label>
        <label className="field full"><span>Help text *</span><textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} required /></label>
        {err && <div className="error full">{err}</div>}
        <div className="form-actions full">
          {current?.scope === 'firm' && <button type="button" className="btn ghost" onClick={reset} disabled={busy}>Reset to default</button>}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

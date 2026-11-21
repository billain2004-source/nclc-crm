// Settings > API Keys: per-task-type AI keys with failover, test, reset and a usage log.
// Keys are write-only: the API returns only the last 4 characters.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { HelpIcon } from '../../help';
import { EntityForm } from '../../components/EntityPage';
import Modal from '../../components/Modal';
import { dateTime, label } from '../../format';

const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled' }];
const EVENT_LABEL = {
  success: 'Call OK', failure: 'Call failed', exhausted: 'Marked exhausted', switch: 'Switched key',
  reset: 'Reset', test_ok: 'Test OK', test_fail: 'Test failed', all_failed: 'All keys failed',
};
const EVENT_CLASS = { success: 'st-done', test_ok: 'st-done', reset: 'st-new', failure: 'st-lost', test_fail: 'st-lost', all_failed: 'st-lost', exhausted: 'st-exhausted', switch: 'st-contacted' };

function TaskTypeEditor({ initial, onClose, onSaved }) {
  const isNew = !initial.code_locked;
  const groups = [{ title: 'Task type', help: 'settings.task_types', fields: [
    { name: 'code', label: 'Code (stable, used by features)', required: true, disabled: !isNew, placeholder: 'e.g. text' },
    { name: 'name', label: 'Name', required: true },
    { name: 'reset_minutes', label: 'Auto-reset exhausted keys after (minutes)', type: 'number', min: 0, hint: '0 = only reset manually' },
    { name: 'sort_order', label: 'Sort order', type: 'number' },
    { name: 'description', label: 'Description', full: true },
    ...(!isNew ? [{ name: 'is_active', label: 'Active (AI features may use this task type)', type: 'checkbox' }] : []),
  ] }];
  async function save(v) {
    if (isNew) await api('/ai/task-types', { method: 'POST', body: v });
    else await api(`/ai/task-types/${initial.code}`, { method: 'PUT', body: v });
    onSaved();
  }
  return <EntityForm title={isNew ? 'New task type' : `Edit task type: ${initial.name}`} helpKey="settings.task_types" groups={groups} initial={initial} onSubmit={save} onClose={onClose} />;
}

function TestResult({ result, onClose }) {
  return (
    <Modal title={`Test: ${result.key.name}`} help={<HelpIcon k="settings.api_keys.test" />} onClose={onClose}>
      {result.ok ? (
        <div className="ok">Key works. {result.model} answered in {result.latency_ms} ms{result.sample ? <>: <code>{result.sample}</code></> : null}</div>
      ) : (
        <div className="error">
          Test failed{result.http_status ? ` (HTTP ${result.http_status})` : ''}: {label(result.error_type)}. {result.message}
          {result.exhausted && <div className="small">The key has been marked <b>exhausted</b>. Calls skip it until it is reset.</div>}
        </div>
      )}
      <p className="muted small">Status now: <b>{label(result.key.status)}</b>. Every test is recorded in the usage log.</p>
      <div className="form-actions"><span className="spacer" /><button className="btn primary" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

export default function ApiKeys() {
  const { user, firm } = useAuth();
  const isSA = user.role === 'super_admin';
  const [scope, setScope] = useState('firm');
  const [keys, setKeys] = useState({ data: [] });
  const [types, setTypes] = useState([]);
  const [providers, setProviders] = useState([]);
  const [usage, setUsage] = useState({ data: [], last30d: {} });
  const [editing, setEditing] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [k, t, u] = await Promise.all([
        api('/ai/keys', { params: { scope } }), api('/ai/task-types', { params: { scope } }), api('/ai/usage', { params: { scope, limit: 60 } }),
      ]);
      setKeys(k); setTypes(t); setUsage(u); setErr('');
    } catch (e) { setErr(e.message); }
  }, [scope]);
  useEffect(() => { load(); }, [load, firm?.id]);
  useEffect(() => { api('/ai/providers').then(setProviders).catch(() => {}); }, []);

  const providerOf = (code) => providers.find((p) => p.code === code);
  const keyGroups = (v) => {
    const p = providerOf(v.provider);
    const defaultModel = p?.default_models?.[v.task_type] || p?.default_models?.text;
    return [
      { title: 'Key details', help: 'settings.api_keys.form', fields: [
        { name: 'name', label: 'Name', required: true, placeholder: 'e.g. OpenAI production key' },
        { name: 'provider', label: 'Provider', type: 'select', required: true, options: providers.map((x) => ({ value: x.code, label: x.label })) },
        { name: 'task_type', label: 'Task type', type: 'select', required: true, options: types.filter((t) => t.is_active || t.code === v.task_type).map((t) => ({ value: t.code, label: t.name })),
          hint: p && v.task_type && !p.task_types.includes(v.task_type) ? `${p.label} has no ${v.task_type} model; its text model will be used` : undefined },
        { name: 'model', label: 'Model', placeholder: defaultModel ? `default: ${defaultModel}` : 'provider default' },
        { name: 'key', label: v.id ? `API key (stored: ••••${v.key_last4}) – leave blank to keep` : 'API key', type: 'password', required: !v.id, autoComplete: 'off', full: true,
          hint: 'Encrypted with AES-256-GCM before it is saved. Only the last 4 characters are ever shown again.' },
      ] },
      { title: 'Failover', help: 'settings.api_keys.failover', fields: [
        { name: 'priority', label: 'Priority (1 = tried first)', type: 'number', min: 1, max: 999 },
        { name: 'status', label: 'Status', type: 'select', required: true, options: v.status === 'exhausted' ? [{ value: 'exhausted', label: 'Exhausted (save as Active to reset)' }, ...STATUS_OPTIONS] : STATUS_OPTIONS },
        { name: 'is_primary', label: 'Primary key for this task type (always tried first)', type: 'checkbox', full: true },
      ] },
    ];
  };

  async function saveKey(v) {
    const body = { name: v.name, provider: v.provider, task_type: v.task_type, model: v.model, priority: v.priority, status: v.status, is_primary: !!Number(v.is_primary), scope };
    if (v.key) body.key = v.key;
    if (v.id) await api(`/ai/keys/${v.id}`, { method: 'PUT', body });
    else await api('/ai/keys', { method: 'POST', body });
    setEditing(null); setMsg(v.id ? 'Key updated.' : 'Key added.'); load();
  }
  async function removeKey() {
    await api(`/ai/keys/${editing.id}`, { method: 'DELETE' });
    setEditing(null); setMsg('Key deleted.'); load();
  }
  async function act(k, action) {
    setBusy(`${action}${k.id}`); setErr(''); setMsg('');
    try {
      if (action === 'test') setTestResult(await api(`/ai/keys/${k.id}/test`, { method: 'POST' }));
      if (action === 'primary') { await api(`/ai/keys/${k.id}/primary`, { method: 'POST' }); setMsg(`"${k.name}" is now the primary ${k.task_type_name} key.`); }
      if (action === 'reset') { await api(`/ai/keys/${k.id}/reset`, { method: 'POST' }); setMsg(`"${k.name}" reset to active.`); }
      if (action === 'toggle') { await api(`/ai/keys/${k.id}`, { method: 'PUT', body: { status: k.status === 'disabled' ? 'active' : 'disabled' } }); }
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  }
  async function tryRoute(t) {
    setBusy(`try${t.code}`); setErr(''); setMsg('');
    try {
      const r = await api('/ai/try', { method: 'POST', body: { scope, task_type: t.code } });
      const failed = r.attempts.filter((a) => !a.ok);
      setMsg(`${t.name}: answered by "${r.key.name}" (${r.key.scope}, ${r.model})${failed.length ? ` after failing over from ${failed.map((a) => `"${a.key_name}" (${a.error_type})`).join(', ')}` : ''}. Reply: ${r.result}`);
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); load(); }
  }
  async function resetAll() {
    setErr(''); setMsg('');
    try { const r = await api('/ai/keys/reset-exhausted', { method: 'POST', body: { scope } }); setMsg(`${r.reset} exhausted key(s) reset.`); load(); } catch (e) { setErr(e.message); }
  }

  const exhaustedCount = keys.data.filter((k) => k.status === 'exhausted').length;
  const scopeName = scope === 'platform' ? 'Platform (all firms)' : firm?.name;

  return (
    <div className="page">
      <div className="page-head">
        <h1>API Keys <HelpIcon k="settings.api_keys" label="API Keys" /></h1>
        <div className="page-actions">
          {isSA && (
            <div className="seg" role="tablist" aria-label="Key scope">
              <button className={scope === 'firm' ? 'on' : ''} onClick={() => setScope('firm')}>This firm</button>
              <button className={scope === 'platform' ? 'on' : ''} onClick={() => setScope('platform')}>Platform keys</button>
            </div>
          )}
          {exhaustedCount > 0 && <button className="btn" onClick={resetAll}>Reset {exhaustedCount} exhausted</button>}
          <button className="btn primary" onClick={() => setEditing({ provider: 'openai', task_type: types[0]?.code || 'text', priority: 10, status: 'active', is_primary: 0 })}>+ Add key</button>
        </div>
      </div>
      <p className="note">
        Keys for <b>{scopeName}</b>. Each AI call tries {scope === 'platform' ? 'the firm\'s own keys first, then these platform keys' : 'this firm\'s keys first, then platform keys set by the Super Admin'}:
        primary key first, then by priority. Keys that hit a quota, rate limit or auth error are marked <b>exhausted</b> and skipped until reset.
        {scope === 'firm' && <> Platform fallback keys currently active: <b>{keys.platform_active_keys ?? 0}</b>.</>}
      </p>
      {msg && <div className="ok">{msg}</div>}
      {err && <div className="error">{err}</div>}

      <section className="card">
        <h2 className="card-title">Active key per task type <HelpIcon k="settings.task_types" /></h2>
        <div className="kpis">
          {types.map((t) => (
            <div key={t.code} className="kpi" style={{ opacity: t.is_active ? 1 : 0.55 }}>
              <div className="kpi-title">{t.name} <code className="muted">{t.code}</code></div>
              <div className="kpi-sub" style={{ marginTop: 6 }}>
                {t.primary_key_name ? <>★ <b>{t.primary_key_name}</b> <span className={`pill st-${t.primary_key_status}`}>{label(t.primary_key_status)}</span></> : <span className="muted">No primary key</span>}
              </div>
              <div className="kpi-sub muted">{t.active_count}/{t.key_count} keys active{scope === 'firm' ? ` · ${t.platform_active_count} platform fallback` : ''}</div>
              <div className="kpi-sub muted">Auto-reset: {t.reset_minutes ? `${t.reset_minutes} min` : 'manual only'}{!t.is_active && ' · switched off'}</div>
              <div className="kpi-sub" style={{ marginTop: 6, display: 'flex', gap: 10 }}>
                {t.is_active && <button className="btn-link small" onClick={() => tryRoute(t)} disabled={busy === `try${t.code}`}>{busy === `try${t.code}` ? 'Calling…' : 'Try routing'}</button>}
                {isSA && <button className="btn-link small" onClick={() => setEditingType({ ...t, code_locked: true })}>Edit</button>}
              </div>
            </div>
          ))}
        </div>
        {isSA && <div style={{ marginTop: 10 }}><button className="btn sm" onClick={() => setEditingType({ reset_minutes: 60, sort_order: types.length + 1 })}>+ Add task type</button></div>}
      </section>

      <section className="card table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Task type</th><th>Provider / model</th><th className="right">Priority</th><th>Status</th><th>Key</th><th className="right">Calls (ok / failed)</th><th>Last used</th><th /></tr></thead>
          <tbody>
            {!keys.data.length && <tr><td colSpan={9} className="muted center">No keys in this scope yet. Click “+ Add key”.</td></tr>}
            {keys.data.map((k) => (
              <tr key={k.id} className={`clickable ${k.status === 'disabled' ? 'row-done' : ''}`} onClick={() => setEditing({ ...k, key: '' })}>
                <td>{k.is_primary ? <span title="Primary key for this task type">★ </span> : null}<b>{k.name}</b>{k.last_error && <div className="muted small clip" title={k.last_error} style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.last_error}</div>}</td>
                <td>{k.task_type_name}</td>
                <td>{providerOf(k.provider)?.label || k.provider}<div className="muted small">{k.model || 'default model'}</div></td>
                <td className="right">{k.priority}</td>
                <td>
                  <span className={`pill st-${k.status}`}>{label(k.status)}</span>
                  {k.status === 'exhausted' && <div className="muted small">{k.resets_at ? `auto-reset ${dateTime(k.resets_at)}` : 'manual reset'}</div>}
                </td>
                <td><code>••••{k.key_last4}</code></td>
                <td className="right nowrap">{k.usage_count} <span className="muted small">({k.success_count} / {k.failure_count})</span></td>
                <td className="nowrap">{dateTime(k.last_used_at)}</td>
                <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                  <button className="btn sm" disabled={busy === `test${k.id}`} onClick={() => act(k, 'test')}>{busy === `test${k.id}` ? 'Testing…' : 'Test key'}</button>{' '}
                  {k.status === 'exhausted' && <><button className="btn sm" onClick={() => act(k, 'reset')}>Reset</button>{' '}</>}
                  {!k.is_primary && <><button className="btn sm ghost" onClick={() => act(k, 'primary')}>Make primary</button>{' '}</>}
                  <button className="btn sm ghost" onClick={() => act(k, 'toggle')}>{k.status === 'disabled' ? 'Enable' : 'Disable'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="card-title">Usage log <HelpIcon k="settings.api_usage" />
          <span className="card-meta">
            {['success', 'failure', 'switch', 'exhausted'].map((e) => <span key={e} className="chip">{EVENT_LABEL[e]} (30 days): {usage.last30d?.[e] || 0}</span>)}
            <button className="btn sm ghost" onClick={load}>Refresh</button>
          </span>
        </h2>
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>When</th><th>Event</th><th>Task</th><th>Key</th><th>Details</th><th>Source</th><th className="right">ms</th></tr></thead>
            <tbody>
              {!usage.data.length && <tr><td colSpan={7} className="muted center">No AI calls yet.</td></tr>}
              {usage.data.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap">{dateTime(l.created_at)}</td>
                  <td><span className={`pill ${EVENT_CLASS[l.event] || ''}`}>{EVENT_LABEL[l.event] || l.event}</span></td>
                  <td>{l.task_type}</td>
                  <td className="nowrap">{l.key_name ? <>{l.key_name}{l.key_is_platform ? <span className="muted small"> (platform)</span> : null}</> : <span className="muted">—</span>}{l.to_key_name && <> → {l.to_key_name}</>}</td>
                  <td className="small">{l.http_status ? `HTTP ${l.http_status} · ` : ''}{l.error_type ? `${label(l.error_type)} · ` : ''}{l.message}</td>
                  <td className="small">{l.source || '—'}{l.user_name && <div className="muted">{l.user_name}</div>}</td>
                  <td className="right">{l.latency_ms ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <EntityForm title={editing.id ? `Edit key: ${editing.name}` : `New API key (${scopeName})`} helpKey="settings.api_keys.form" groups={keyGroups}
          initial={editing} onSubmit={saveKey} onDelete={editing.id ? removeKey : null} onClose={() => setEditing(null)} />
      )}
      {editingType && <TaskTypeEditor initial={editingType} onClose={() => setEditingType(null)} onSaved={() => { setEditingType(null); load(); }} />}
      {testResult && <TestResult result={testResult} onClose={() => setTestResult(null)} />}
    </div>
  );
}

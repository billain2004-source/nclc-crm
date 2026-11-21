// AI agent UI: a button that runs an agent on a record, and a review modal where the user edits,
// approves (applies the change) or rejects the proposal. Nothing is written without approval.
import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { HelpIcon } from '../help';
import Modal from './Modal';
import { dateTime, label } from '../format';

const HELP = { lead_scoring: 'ai.lead_scoring', followup_email: 'ai.followup_email', deal_summary: 'ai.deal_summary' };
const lines = (v) => (Array.isArray(v) ? v.join('\n') : v || '');
const toList = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

export function AgentButton({ agent, entityType, entityId, children, className = 'btn sm', onDone }) {
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(null);
  const [decided, setDecided] = useState(false);
  const [err, setErr] = useState('');
  async function go(e) {
    e.preventDefault(); e.stopPropagation();
    setBusy(true); setErr(''); setDecided(false);
    try { setRun(await api(`/agents/${agent}/run`, { method: 'POST', body: { entity_type: entityType, entity_id: entityId } })); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }
  return (
    <>
      <button type="button" className={`${className} ai-btn`} onClick={go} disabled={busy} title={err || undefined}>{busy ? 'Thinking…' : children}</button>
      {err && !run && <Modal title="AI agent" onClose={() => setErr('')}><div className="error">{err}</div></Modal>}
      {run && <AgentRunModal run={run} onDone={() => setDecided(true)}
        onClose={() => { setRun(null); if (decided && onDone) onDone(); }} />}
    </>
  );
}

function OutputEditor({ run, v, set, readOnly }) {
  const o = v;
  if (run.agent === 'lead_scoring') {
    return (
      <div className="form">
        <label className="field"><span>Score (0–100)</span><input type="number" min={0} max={100} value={o.score} disabled={readOnly} onChange={(e) => set('score', e.target.value)} /></label>
        <label className="field"><span>Rating</span>
          <select value={o.rating} disabled={readOnly} onChange={(e) => set('rating', e.target.value)}>{['hot', 'warm', 'cold'].map((r) => <option key={r} value={r}>{label(r)}</option>)}</select>
        </label>
        <div className="field full"><span>Reasons</span><ul style={{ margin: 0 }}>{(o.reasons || []).map((r) => <li key={r}>{r}</li>)}</ul></div>
        <label className="field full"><span>Suggested next action (not saved to the record)</span><input value={o.next_action} disabled={readOnly} onChange={(e) => set('next_action', e.target.value)} /></label>
      </div>
    );
  }
  if (run.agent === 'followup_email') {
    return (
      <div className="form">
        <label className="field full"><span>Subject</span><input value={o.subject} disabled={readOnly} onChange={(e) => set('subject', e.target.value)} /></label>
        <label className="field full"><span>Email body</span><textarea rows={10} value={o.body} disabled={readOnly} onChange={(e) => set('body', e.target.value)} /></label>
      </div>
    );
  }
  if (run.agent === 'deal_summary') {
    return (
      <div className="form">
        <label className="field"><span>Risk level</span>
          <select value={o.risk_level} disabled={readOnly} onChange={(e) => set('risk_level', e.target.value)}>{['low', 'medium', 'high'].map((r) => <option key={r} value={r}>{label(r)}</option>)}</select>
        </label>
        <label className="field full"><span>Summary</span><textarea rows={4} value={o.summary} disabled={readOnly} onChange={(e) => set('summary', e.target.value)} /></label>
        <label className="field"><span>Risks (one per line)</span><textarea rows={4} value={lines(o.risks)} disabled={readOnly} onChange={(e) => set('risks', e.target.value)} /></label>
        <label className="field"><span>Next steps (one per line)</span><textarea rows={4} value={lines(o.next_steps)} disabled={readOnly} onChange={(e) => set('next_steps', e.target.value)} /></label>
      </div>
    );
  }
  return <pre className="ai-out">{JSON.stringify(o, null, 2)}</pre>;
}

export function AgentRunModal({ run: initial, onClose, onDone }) {
  const { user } = useAuth();
  const [run, setRun] = useState(initial);
  const [v, setV] = useState(initial.output_json || {});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pending = run.status === 'pending_approval';
  const canReview = run.created_by === user.id || user.role !== 'team_user';
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));

  async function decide(action) {
    setBusy(true); setErr('');
    try {
      const output = run.agent === 'deal_summary' ? { ...v, risks: toList(lines(v.risks)), next_steps: toList(lines(v.next_steps)) } : v;
      const r = await api(`/agents/runs/${run.id}/${action}`, { method: 'POST', body: { output, note } });
      setRun(r);
      if (onDone) onDone(r);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const failedOver = (run.attempts_json || []).filter((a) => !a.ok);
  return (
    <Modal title={`${run.agent_name}: ${run.entity_label || `${run.entity_type} #${run.entity_id}`}`} help={<HelpIcon k={HELP[run.agent] || 'ai.agents'} />} onClose={onClose} wide>
      <div className="ai-meta">
        <span className={`pill st-${run.status}`}>{label(run.status)}</span>
        {run.key_name && <span className="chip" title="API key used">Key: {run.key_name}</span>}
        {run.model && <span className="chip">{run.provider} · {run.model}</span>}
        {run.latency_ms != null && <span className="chip">{run.latency_ms} ms</span>}
        <span className="chip">Run by {run.created_by_name} · {dateTime(run.created_at)}</span>
      </div>
      {failedOver.length > 0 && <p className="note small">Failover: {failedOver.map((a) => `"${a.key_name}" failed (${label(a.error_type)})`).join(', ')}{run.key_name ? `, then "${run.key_name}" answered.` : '.'}</p>}
      {run.status === 'failed' && <div className="error">{run.error}</div>}
      {run.status !== 'failed' && <OutputEditor run={run} v={v} set={set} readOnly={!pending || !canReview} />}

      {run.proposed_changes && (
        <div className="note" style={{ marginTop: 12 }}>
          <b>{pending ? 'Approving will:' : 'Changes:'}</b>
          <ul style={{ margin: '4px 0 0' }}>{run.proposed_changes.map((c, i) => <li key={i}>{c.summary}</li>)}</ul>
          {run.applied_result && <div className="small muted">Applied: {run.applied_result}</div>}
        </div>
      )}
      {!pending && run.reviewed_by_name && <p className="muted small">{label(run.status)} by {run.reviewed_by_name} · {dateTime(run.reviewed_at)}{run.review_note ? ` — “${run.review_note}”` : ''}</p>}
      {pending && canReview && <label className="field full"><span>Note (optional)</span><input value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} /></label>}
      {err && <div className="error">{err}</div>}
      <div className="form-actions">
        <span className="muted small">{pending ? (canReview ? 'Edit the proposal if needed, then approve or reject. Nothing is saved until you approve.' : 'Waiting for the person who ran it or a Manager to approve.') : ''}</span>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>{pending ? 'Decide later' : 'Close'}</button>
        {pending && canReview && <>
          <button type="button" className="btn danger" disabled={busy} onClick={() => decide('reject')}>Reject</button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => decide('approve')}>{busy ? 'Saving…' : 'Approve & apply'}</button>
        </>}
      </div>
    </Modal>
  );
}

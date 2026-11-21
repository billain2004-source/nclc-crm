// AI agent runs: history and approval queue (Team Users see their own runs).
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { HelpIcon } from '../help';
import { AgentRunModal } from '../components/Agents';
import { dateTime, label } from '../format';

const STATUSES = ['pending_approval', 'approved', 'rejected', 'failed'];

function preview(r) {
  const o = r.output_json || {};
  if (r.status === 'failed') return r.error;
  if (r.agent === 'lead_scoring') return `Score ${o.score} (${o.rating}) – ${o.next_action || ''}`;
  if (r.agent === 'followup_email') return o.subject;
  if (r.agent === 'deal_summary') return `${label(o.risk_level)} risk – ${o.summary || ''}`;
  return '';
}

export default function AgentRuns() {
  const { firm } = useAuth();
  const [agents, setAgents] = useState([]);
  const [runs, setRuns] = useState({ data: [], counts: {} });
  const [f, setF] = useState({ status: 'pending_approval', agent: '' });
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api('/agents/runs', { params: f }).then(setRuns).catch((e) => setErr(e.message)), [f]);
  useEffect(() => { load(); }, [load, firm?.id]);
  useEffect(() => { api('/agents').then(setAgents).catch(() => {}); }, []);

  return (
    <div className="page">
      <div className="page-head"><h1>AI agents <HelpIcon k="ai.agents" label="AI agents" /></h1></div>
      <div className="kpis" style={{ marginBottom: 16 }}>
        {agents.map((a) => (
          <div key={a.code} className="kpi">
            <div className="kpi-title">{a.name}</div>
            <div className="kpi-sub" style={{ marginTop: 4 }}>{a.description}</div>
            <div className="kpi-sub muted" style={{ marginTop: 4 }}>Runs on: {a.entities.join(', ')} · task type: {a.task_type}</div>
          </div>
        ))}
      </div>
      <p className="muted small">Run agents from the Leads and Deals pages (✨ buttons). Every result waits here for approval. Nothing is written to your records until someone approves it.</p>
      <div className="filters">
        <select value={f.status} onChange={(e) => setF((s) => ({ ...s, status: e.target.value }))} aria-label="Status">
          <option value="">Status: All</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)} ({runs.counts?.[s] || 0})</option>)}
        </select>
        <select value={f.agent} onChange={(e) => setF((s) => ({ ...s, agent: e.target.value }))} aria-label="Agent">
          <option value="">Agent: All</option>
          {agents.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
        </select>
        <span className="muted count">{runs.data.length} runs</span>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>When</th><th>Agent</th><th>Record</th><th>Result</th><th>Key used</th><th>Status</th><th>By</th></tr></thead>
          <tbody>
            {!runs.data.length && <tr><td colSpan={7} className="muted center">No agent runs match these filters.</td></tr>}
            {runs.data.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                <td className="nowrap">{dateTime(r.created_at)}</td>
                <td>{r.agent_name}</td>
                <td>{r.entity_label}<div className="muted small">{label(r.entity_type)} #{r.entity_id}</div></td>
                <td className="clip">{preview(r)}</td>
                <td className="small">{r.key_name || '—'}{r.model && <div className="muted">{r.model}</div>}</td>
                <td><span className={`pill st-${r.status}`}>{label(r.status)}</span></td>
                <td className="small">{r.created_by_name}{r.reviewed_by_name && <div className="muted">reviewed: {r.reviewed_by_name}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <AgentRunModal run={open} onClose={() => { setOpen(null); load(); }} onDone={() => load()} />}
    </div>
  );
}

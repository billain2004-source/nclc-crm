import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { HelpIcon } from '../help';
import { compactMoney, dateTime, isOverdue, money } from '../format';
import { useDropdowns } from '../dropdowns';

// Single-series horizontal bars: one sequential hue, rounded data end, hover tooltip.
function BarList({ items, format, empty = 'No data yet.' }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <div className="barlist" role="table">
      {items.map((it, idx) => (
        <div key={it.label} className="bar-row" role="row" onMouseEnter={() => setHover(idx)} onMouseLeave={() => setHover(null)}>
          <span className="bar-label" role="cell">{it.label}</span>
          <span className="bar-track" role="cell">
            <span className="bar-fill" style={{ width: `${Math.max(it.value ? 1.5 : 0, (it.value / max) * 100)}%` }} />
            {hover === idx && <span className="bar-tip">{it.tip || `${it.label}: ${format(it.value)}`}</span>}
          </span>
          <span className="bar-value" role="cell">{format(it.value)}{it.sub && <small className="muted"> · {it.sub}</small>}</span>
        </div>
      ))}
    </div>
  );
}

function Kpi({ title, value, sub }) {
  return (
    <div className="kpi">
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub muted">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { firm, user } = useAuth();
  const dd = useDropdowns();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setD(null);
    api('/dashboard').then(setD).catch((e) => setErr(e.message));
  }, [firm?.id]);

  if (err) return <div className="page"><div className="error">{err}</div></div>;
  if (!d) return <div className="page"><p className="muted">Loading dashboard…</p></div>;
  const cur = d.firm.base_currency;
  const m = (v) => money(v, cur);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dashboard <HelpIcon k="dashboard" label="Dashboard" /></h1>
        <span className="muted">{d.scope === 'mine' ? `Your figures, ${user.name}` : d.firm.name} · all amounts in {cur}</span>
      </div>

      <section className="card">
        <h2 className="card-title">Key metrics <HelpIcon k="dashboard.kpis" /></h2>
        <div className="kpis">
          <Kpi title="Open pipeline" value={compactMoney(d.pipeline.open_value, cur)} sub={`${d.counts.open_deals} open deals`} />
          <Kpi title="Weighted forecast" value={compactMoney(d.pipeline.weighted_value, cur)} sub="value × probability" />
          <Kpi title="Won" value={compactMoney(d.pipeline.won_value, cur)} sub={`${d.pipeline.won_count} deals won`} />
          <Kpi title="Win rate" value={d.pipeline.win_rate == null ? '—' : `${d.pipeline.win_rate}%`} sub={`${d.pipeline.won_count} won / ${d.pipeline.lost_count} lost`} />
          <Kpi title="Open leads" value={d.counts.open_leads} sub="not unqualified or converted" />
          <Kpi title="Contacts · Companies" value={`${d.counts.contacts} · ${d.counts.companies}`} />
        </div>
      </section>

      <div className="grid2">
        <section className="card">
          <h2 className="card-title">Pipeline by stage <HelpIcon k="dashboard.pipeline" /></h2>
          <BarList format={m} items={d.by_stage.map((s) => ({ label: s.name, value: s.value, sub: `${s.count} deal${s.count === 1 ? '' : 's'}`, tip: `${s.name}: ${m(s.value)} across ${s.count} deal(s), ${s.probability}% probability` }))} />
        </section>
        <section className="card">
          <h2 className="card-title">
            Upcoming tasks <HelpIcon k="dashboard.tasks" />
            <span className="card-meta">
              {d.tasks.overdue > 0 && <span className="badge red">⚠ {d.tasks.overdue} overdue</span>}
              <span className="badge">{d.tasks.due_today} due today</span>
            </span>
          </h2>
          {d.tasks.upcoming.length ? (
            <ul className="task-list">
              {d.tasks.upcoming.map((t) => (
                <li key={t.id} className={isOverdue(t.due_date, t.status) ? 'overdue' : ''}>
                  <span className={`pill ${t.priority}`}>{dd.label('task_priority', t.priority)}</span>
                  <span className="grow">{t.title}<small className="muted"> · {t.assigned_name || 'Unassigned'}</small></span>
                  <span className="nowrap muted">{isOverdue(t.due_date, t.status) ? '⚠ ' : ''}{dateTime(t.due_date)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Nothing due in the next 7 days.</p>}
          <Link to="/tasks" className="btn-link">All tasks →</Link>
        </section>
      </div>

      <div className="grid2">
        <section className="card">
          <h2 className="card-title">Leads by source <HelpIcon k="dashboard.leads" /></h2>
          <BarList format={(v) => `${v}`} items={d.leads_by_source.map((s) => ({ label: s.label, value: s.count, tip: `${s.label}: ${s.count} lead(s)` }))} />
          <div className="status-row">
            {d.leads_by_status.map((s) => <span key={s.status} className={`pill st-${s.status}`}>{s.label}: {s.count}</span>)}
          </div>
        </section>
        {d.scope === 'firm' ? (
          <section className="card">
            <h2 className="card-title">Open pipeline by owner <HelpIcon k="dashboard.owners" /></h2>
            <BarList format={m} items={d.by_owner.map((o) => ({ label: o.name, value: o.value }))} />
          </section>
        ) : (
          <section className="card">
            <h2 className="card-title">My recent deals <HelpIcon k="dashboard.owners" /></h2>
            <RecentDeals deals={d.recent_deals} cur={cur} dd={dd} />
          </section>
        )}
      </div>

      {d.scope === 'firm' && (
        <section className="card">
          <h2 className="card-title">Recently updated deals</h2>
          <RecentDeals deals={d.recent_deals} cur={cur} dd={dd} />
        </section>
      )}
    </div>
  );
}

function RecentDeals({ deals, cur, dd }) {
  if (!deals.length) return <p className="muted">No deals yet.</p>;
  return (
    <table className="table compact">
      <thead><tr><th>Deal</th><th>Status</th><th className="right">Amount</th><th className="right">In {cur}</th></tr></thead>
      <tbody>
        {deals.map((x) => (
          <tr key={x.id}>
            <td>{x.name}<div className="muted small">{x.company_name}</div></td>
            <td><span className={`pill st-${x.status}`}>{dd.label('deal_status', x.status)}</span></td>
            <td className="right">{money(x.amount, x.currency_code)}</td>
            <td className="right">{money(x.amount_base, cur)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

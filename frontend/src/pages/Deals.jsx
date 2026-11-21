import { useCallback, useEffect, useState } from 'react';
import EntityPage, { EntityForm } from '../components/EntityPage';
import { api } from '../api';
import { useAuth } from '../auth';
import { HelpIcon } from '../help';
import { compactMoney, date, money } from '../format';
import { opts, useLookups } from '../lookups';
import { useDropdowns } from '../dropdowns';
import { AgentButton } from '../components/Agents';

function DealAgents({ deal, onDone }) {
  return (
    <div className="note">
      <b>AI agents</b> <HelpIcon k="ai.agents" /> <span className="muted small">Results need your approval before anything is saved.</span>
      <div className="page-actions" style={{ marginTop: 6 }}>
        <AgentButton agent="deal_summary" entityType="deal" entityId={deal.id} onDone={onDone}>✨ Summarise deal & risks</AgentButton>
        <AgentButton agent="followup_email" entityType="deal" entityId={deal.id} onDone={onDone}>✨ Draft follow-up email</AgentButton>
      </div>
    </div>
  );
}

function useDealForm() {
  const { can } = useAuth();
  const lk = useLookups(['users', 'companies', 'contacts', 'stages', 'currencies']);
  const groups = (v) => [
    { title: 'Deal details', help: 'deals.basic', fields: [
      { name: 'name', label: 'Deal name', required: true, full: true },
      { name: 'owner_id', label: 'Owner', type: 'select', options: opts.users(lk.users), disabled: !can.manage },
      { name: 'expected_close_date', label: 'Expected close', type: 'date' },
      { name: 'description', label: 'Description', type: 'textarea', full: true },
    ] },
    { title: 'Amount & currency', help: 'deals.amount', fields: [
      { name: 'amount', label: 'Amount', type: 'number', min: 0, step: '0.01', required: true },
      { name: 'currency_code', label: 'Currency', type: 'select', required: true, options: opts.currencies(lk.currencies) },
    ] },
    { title: 'Stage & probability', help: 'deals.stage', fields: [
      { name: 'stage_id', label: 'Stage', type: 'select', required: true, options: opts.stages(lk.stages) },
      { name: 'probability', label: 'Probability %', type: 'number', min: 0, max: 100, hint: 'Resets to the stage default when the stage changes' },
    ] },
    { title: 'Related records', help: 'deals.relations', fields: [
      { name: 'company_id', label: 'Company', type: 'select', options: opts.companies(lk.companies) },
      { name: 'contact_id', label: 'Primary contact', type: 'select',
        options: opts.contacts(v.company_id ? lk.contacts.filter((c) => String(c.company_id) === String(v.company_id)) : lk.contacts) },
    ] },
  ];
  return { lk, groups };
}

const amountCell = (r) => (
  <span className="nowrap">
    {money(r.amount, r.currency_code)}
    {r.currency_code !== r.base_currency && <div className="muted small">≈ {money(r.amount_base, r.base_currency)}</div>}
  </span>
);

function Board({ onEdit, signal }) {
  const { firm } = useAuth();
  const [board, setBoard] = useState(null);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api('/deals/board').then(setBoard).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load, signal, firm?.id]);

  async function drop(stageId) {
    setOver(null);
    if (!drag || drag.stage_id === stageId) return;
    try {
      await api(`/deals/${drag.id}`, { method: 'PUT', body: { stage_id: stageId } });
      load();
    } catch (e) { setErr(e.message); }
    setDrag(null);
  }

  if (!board) return <p className="muted">Loading board…</p>;
  return (
    <>
      {err && <div className="error">{err}</div>}
      <div className="board">
        {board.stages.map((s) => (
          <div key={s.id} className={`col ${over === s.id ? 'over' : ''} ${s.is_won ? 'won' : ''} ${s.is_lost ? 'lost' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(null)} onDrop={() => drop(s.id)}>
            <div className="col-head">
              <b>{s.name}</b> <span className="muted">{s.probability}%</span>
              <div className="muted small">{s.deals.length} deal{s.deals.length === 1 ? '' : 's'} · {compactMoney(s.total_base, board.base_currency)}</div>
            </div>
            {s.deals.map((d) => (
              <div key={d.id} className="deal-card" draggable onDragStart={() => setDrag(d)} onDragEnd={() => setDrag(null)} onClick={() => onEdit(d)}>
                <div className="deal-name">{d.name}</div>
                <div className="muted small">{d.company_name || '—'}</div>
                <div className="deal-foot">
                  <span>{amountCell(d)}</span>
                  <span className="muted small">{d.owner_name?.split(' ')[0]}</span>
                </div>
                {d.expected_close_date && d.status === 'open' && <div className="muted small">Close {date(d.expected_close_date)}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export default function Deals() {
  const { user, firm } = useAuth();
  const [view, setView] = useState(() => { try { return localStorage.getItem('nclc_deals_view') || 'board'; } catch { return 'board'; } });
  const [editing, setEditing] = useState(null);
  const [signal, setSignal] = useState(0);
  const { lk, groups } = useDealForm();
  const dd = useDropdowns();
  const defaults = { currency_code: firm.base_currency, stage_id: lk.stages[0]?.id || '', amount: '', owner_id: user.role === 'super_admin' ? '' : user.id };

  function switchView(v) { setView(v); try { localStorage.setItem('nclc_deals_view', v); } catch { /* ignore */ } }
  const toggle = (
    <div className="seg" role="tablist">
      <button className={view === 'board' ? 'on' : ''} onClick={() => switchView('board')}>Board</button>
      <button className={view === 'list' ? 'on' : ''} onClick={() => switchView('list')}>List</button>
    </div>
  );

  async function save(v) {
    if (editing.id) await api(`/deals/${editing.id}`, { method: 'PUT', body: v });
    else await api('/deals', { method: 'POST', body: v });
    setEditing(null); setSignal((s) => s + 1);
  }
  async function remove() {
    await api(`/deals/${editing.id}`, { method: 'DELETE' });
    setEditing(null); setSignal((s) => s + 1);
  }

  if (view === 'list') {
    return (
      <EntityPage
        title="Deals" helpKey="deals" endpoint="/deals" toolbar={toggle} reloadSignal={signal}
        defaults={defaults} formGroups={groups}
        formExtra={(d, closeAndReload) => <DealAgents deal={d} onDone={closeAndReload} />}
        rowActions={(r, reload) => <AgentButton agent="deal_summary" entityType="deal" entityId={r.id} className="btn sm ghost" onDone={reload}>✨ AI summary</AgentButton>}
        filters={[
          { key: 'stage_id', label: 'Stage', options: opts.stages(lk.stages) },
          { key: 'status', label: 'Status', options: dd.filter('deal_status') },
          ...(user.role !== 'team_user' ? [{ key: 'owner_id', label: 'Owner', options: opts.users(lk.users) }] : []),
        ]}
        columns={[
          { key: 'name', label: 'Deal', render: (r) => <><b>{r.name}</b><div className="muted small">{r.company_name}</div></> },
          { key: 'stage_name', label: 'Stage' },
          { key: 'status', label: 'Status', render: (r) => <span className={`pill st-${r.status}`}>{dd.label('deal_status', r.status)}</span> },
          { key: 'amount', label: 'Amount', align: 'right', render: amountCell },
          { key: 'probability', label: 'Prob.', align: 'right', render: (r) => `${r.probability}%` },
          { key: 'expected_close_date', label: 'Close date', render: (r) => date(r.expected_close_date) },
          { key: 'owner_name', label: 'Owner' },
        ]}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Deals <HelpIcon k="deals" label="Deals" /> <HelpIcon k="deals.board" label="Pipeline board" /></h1>
        <div className="page-actions">{toggle}<button className="btn primary" onClick={() => setEditing({ ...defaults })}>+ New deal</button></div>
      </div>
      <p className="muted small">Drag a card to another stage to move it. Amounts in other currencies show their {firm.base_currency} equivalent.</p>
      <Board onEdit={setEditing} signal={signal} />
      {editing && (
        <EntityForm title={editing.id ? 'Edit deal' : 'New deal'} helpKey="deals" groups={groups} initial={editing}
          onSubmit={save} onDelete={editing.id ? remove : null} onClose={() => setEditing(null)}
          extra={editing.id ? <DealAgents deal={editing} onDone={() => { setEditing(null); setSignal((s) => s + 1); }} /> : null} />
      )}
    </div>
  );
}

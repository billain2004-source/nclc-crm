import { useState } from 'react';
import EntityPage, { Field } from '../components/EntityPage';
import Modal from '../components/Modal';
import { api } from '../api';
import { useAuth } from '../auth';
import { HelpIcon } from '../help';
import { label, money } from '../format';
import { opts, useLookups } from '../lookups';
import { AgentButton } from '../components/Agents';

const STATUSES = ['new', 'contacted', 'qualified', 'unqualified'];
export const SOURCES = ['Website', 'Referral', 'LinkedIn', 'Trade Show', 'Cold Call', 'Email Campaign', 'Partner', 'Webinar'];

function ConvertModal({ lead, stages, currencies, onClose, onDone }) {
  const [v, setV] = useState({
    create_deal: 1, deal_name: `${lead.company_name || lead.full_name} - New deal`,
    amount: lead.estimated_value ?? '', currency_code: lead.currency_code || '', stage_id: stages[1]?.id || stages[0]?.id || '',
    expected_close_date: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await api(`/leads/${lead.id}/convert`, { method: 'POST', body: { ...v, create_deal: !!v.create_deal } });
      onDone();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title={`Convert lead: ${lead.full_name}`} help={<HelpIcon k="leads.convert" />} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="note">This creates {lead.company_name ? <>the company <b>{lead.company_name}</b> (if new), </> : null}a contact for <b>{lead.full_name}</b>, and optionally a deal.</p>
        <div className="form">
          <Field f={{ name: 'create_deal', label: 'Also create a deal', type: 'checkbox', full: true }} value={v.create_deal} onChange={set} />
          {!!v.create_deal && <>
            <Field f={{ name: 'deal_name', label: 'Deal name', required: true, full: true }} value={v.deal_name} onChange={set} />
            <Field f={{ name: 'amount', label: 'Amount', type: 'number', min: 0, step: '0.01' }} value={v.amount} onChange={set} />
            <Field f={{ name: 'currency_code', label: 'Currency', type: 'select', options: opts.currencies(currencies) }} value={v.currency_code} onChange={set} />
            <Field f={{ name: 'stage_id', label: 'Stage', type: 'select', required: true, options: opts.stages(stages.filter((s) => !s.is_lost)) }} value={v.stage_id} onChange={set} />
            <Field f={{ name: 'expected_close_date', label: 'Expected close', type: 'date' }} value={v.expected_close_date} onChange={set} />
          </>}
        </div>
        {err && <div className="error">{err}</div>}
        <div className="form-actions"><span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Converting…' : 'Convert lead'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Leads() {
  const { can, user, firm } = useAuth();
  const lk = useLookups(['users', 'countries', 'currencies', 'stages']);
  const [converting, setConverting] = useState(null);
  const [signal, setSignal] = useState(0);

  const groups = (v) => [
    { title: 'Lead details', help: 'leads.basic', fields: [
      { name: 'first_name', label: 'First name', required: true },
      { name: 'last_name', label: 'Last name', required: true },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone' },
      { name: 'company_name', label: 'Company name' },
      { name: 'job_title', label: 'Job title' },
      { name: 'country_code', label: 'Country', type: 'select', options: opts.countries(lk.countries) },
    ] },
    { title: 'Qualification', help: 'leads.qualification', fields: [
      { name: 'source', label: 'Source', type: 'select', options: SOURCES.map((s) => ({ value: s, label: s })) },
      { name: 'status', label: 'Status', type: 'select', required: true, disabled: v.status === 'converted',
        options: opts.list(v.status === 'converted' ? ['converted'] : STATUSES) },
      { name: 'score', label: 'Score (0–100)', type: 'number', min: 0, max: 100 },
      { name: 'owner_id', label: 'Owner', type: 'select', options: opts.users(lk.users), disabled: !can.manage },
    ] },
    { title: 'Estimated value', help: 'leads.value', fields: [
      { name: 'estimated_value', label: 'Estimated value', type: 'number', min: 0, step: '0.01' },
      { name: 'currency_code', label: 'Currency', type: 'select', options: opts.currencies(lk.currencies) },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true },
    ] },
  ];

  return (
    <>
      <EntityPage
        title="Leads" helpKey="leads" endpoint="/leads" reloadSignal={signal}
        defaults={{ status: 'new', score: 50, currency_code: firm.base_currency, country_code: firm.country_code, owner_id: user.role === 'super_admin' ? '' : user.id }}
        fromForm={(v) => { const { status, ...rest } = v; return status === 'converted' ? rest : v; }}
        filters={[
          { key: 'status', label: 'Status', options: opts.list([...STATUSES, 'converted']) },
          { key: 'source', label: 'Source', options: SOURCES.map((s) => ({ value: s, label: s })) },
          ...(can.manage ? [{ key: 'owner_id', label: 'Owner', options: opts.users(lk.users) }] : []),
        ]}
        columns={[
          { key: 'full_name', label: 'Name', render: (r) => <><b>{r.full_name}</b><div className="muted small">{r.email}</div></> },
          { key: 'company_name', label: 'Company' },
          { key: 'source', label: 'Source' },
          { key: 'status', label: 'Status', render: (r) => <span className={`pill st-${r.status}`}>{label(r.status)}</span> },
          { key: 'score', label: 'Score', align: 'right', render: (r) => <span className="score"><span style={{ width: `${r.score}%` }} />{r.score}</span> },
          { key: 'estimated_value', label: `Est. value (${firm.base_currency})`, align: 'right', render: (r) => (
            <span title={`Original: ${money(r.estimated_value, r.currency_code)}`}>{money(r.estimated_value_base, r.base_currency)}{r.currency_code !== r.base_currency && r.estimated_value ? <small className="muted"> ({r.currency_code})</small> : null}</span>
          ) },
          { key: 'owner_name', label: 'Owner' },
        ]}
        rowActions={(r, reload) => (
          <>
            <AgentButton agent="lead_scoring" entityType="lead" entityId={r.id} className="btn sm ghost" onDone={reload}>✨ AI score</AgentButton>{' '}
            {r.status === 'converted'
              ? <span className="muted small">Converted</span>
              : <button className="btn sm" onClick={() => setConverting(r)}>Convert</button>}
          </>
        )}
        formExtra={(r, closeAndReload) => (
          <div className="note">
            <b>AI agents</b> <HelpIcon k="ai.agents" /> <span className="muted small">Results need your approval before anything is saved.</span>
            <div className="page-actions" style={{ marginTop: 6 }}>
              <AgentButton agent="lead_scoring" entityType="lead" entityId={r.id} onDone={closeAndReload}>✨ Score this lead</AgentButton>
              <AgentButton agent="followup_email" entityType="lead" entityId={r.id} onDone={closeAndReload}>✨ Draft follow-up email</AgentButton>
            </div>
          </div>
        )}
        formGroups={groups}
      />
      {converting && (
        <ConvertModal lead={converting} stages={lk.stages} currencies={lk.currencies}
          onClose={() => setConverting(null)}
          onDone={() => { setConverting(null); setSignal((s) => s + 1); }} />
      )}
    </>
  );
}

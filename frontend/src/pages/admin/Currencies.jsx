import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { HelpIcon } from '../../help';
import { EntityForm } from '../../components/EntityPage';
import { date, money } from '../../format';

export default function Currencies() {
  const { can, firm } = useAuth();
  const [currencies, setCurrencies] = useState([]);
  const [history, setHistory] = useState([]);
  const [countries, setCountries] = useState([]);
  const [rateForm, setRateForm] = useState(null);
  const [curForm, setCurForm] = useState(null);
  const [conv, setConv] = useState({ amount: 1000, from: 'USD', to: firm?.base_currency || 'USD' });
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [c, h, co] = await Promise.all([api('/ref/currencies'), api('/ref/exchange-rates'), api('/ref/countries')]);
      setCurrencies(c); setHistory(h); setCountries(co);
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rate = (code) => Number(currencies.find((c) => c.code === code)?.rate_per_usd || 0);
  const converted = rate(conv.from) && rate(conv.to) ? (Number(conv.amount) * rate(conv.to)) / rate(conv.from) : null;
  const base = firm?.base_currency;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Currencies &amp; exchange rates <HelpIcon k="admin.currencies" label="Currencies" /></h1>
        {can.superAdmin && (
          <div className="page-actions">
            <button className="btn" onClick={() => setCurForm({ decimals: 2 })}>+ Currency</button>
            <button className="btn primary" onClick={() => setRateForm({ currency_code: '', effective_date: new Date().toISOString().slice(0, 10) })}>+ Exchange rate</button>
          </div>
        )}
      </div>
      {err && <div className="error">{err}</div>}

      <div className="grid2">
        <section className="card">
          <h2 className="card-title">Latest rates</h2>
          <table className="table compact">
            <thead><tr><th>Code</th><th>Currency</th><th className="right">Per 1 USD</th>{base && <th className="right">1 unit in {base}</th>}<th>Since</th></tr></thead>
            <tbody>
              {currencies.map((c) => (
                <tr key={c.code} className={c.code === base ? 'row-highlight' : ''}>
                  <td><b>{c.code}</b> {c.symbol}</td>
                  <td>{c.name}{!c.is_active && <span className="muted"> (inactive)</span>}</td>
                  <td className="right">{c.rate_per_usd != null ? Number(c.rate_per_usd).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}</td>
                  {base && <td className="right">{rate(base) && c.rate_per_usd ? (rate(base) / c.rate_per_usd).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}</td>}
                  <td>{date(c.effective_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div>
          <section className="card">
            <h2 className="card-title">Converter</h2>
            <div className="converter">
              <input type="number" value={conv.amount} aria-label="Amount" onChange={(e) => setConv({ ...conv, amount: e.target.value })} />
              <select value={conv.from} aria-label="From" onChange={(e) => setConv({ ...conv, from: e.target.value })}>{currencies.map((c) => <option key={c.code}>{c.code}</option>)}</select>
              <span>→</span>
              <select value={conv.to} aria-label="To" onChange={(e) => setConv({ ...conv, to: e.target.value })}>{currencies.map((c) => <option key={c.code}>{c.code}</option>)}</select>
            </div>
            <div className="kpi-value">{converted == null ? '—' : money(converted, conv.to)}</div>
            <small className="muted">amount × rate({conv.to}) ÷ rate({conv.from})</small>
          </section>
          <section className="card">
            <h2 className="card-title">Countries</h2>
            <div className="chips">{countries.map((c) => <span key={c.code} className="chip">{c.name} · {c.currency_code}</span>)}</div>
          </section>
        </div>
      </div>

      <section className="card">
        <h2 className="card-title">Rate history</h2>
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Date</th><th>Currency</th><th className="right">Per 1 USD</th><th>Source</th><th>Entered by</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}><td>{date(h.effective_date)}</td><td>{h.currency_code}</td><td className="right">{Number(h.rate_per_usd).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td><td>{h.source}</td><td>{h.created_by_name || 'system'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {rateForm && (
        <EntityForm title="New exchange rate" helpKey="admin.currencies" initial={rateForm} onClose={() => setRateForm(null)}
          groups={[{ title: 'Exchange rate', help: 'admin.rates.form', fields: [
            { name: 'currency_code', label: 'Currency', type: 'select', required: true, options: currencies.filter((c) => c.code !== 'USD').map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })) },
            { name: 'rate_per_usd', label: 'Units per 1 USD', type: 'number', step: '0.000001', min: 0, required: true },
            { name: 'effective_date', label: 'Effective date', type: 'date', required: true },
            { name: 'source', label: 'Source', placeholder: 'e.g. Central bank' },
          ] }]}
          onSubmit={async (v) => { await api('/ref/exchange-rates', { method: 'POST', body: v }); setRateForm(null); load(); }} />
      )}
      {curForm && (
        <EntityForm title="New currency" helpKey="admin.currencies" initial={curForm} onClose={() => setCurForm(null)}
          groups={[{ title: 'Currency', help: 'admin.currencies', fields: [
            { name: 'code', label: 'ISO code', required: true, placeholder: 'e.g. NZD' },
            { name: 'name', label: 'Name', required: true },
            { name: 'symbol', label: 'Symbol', required: true },
            { name: 'decimals', label: 'Decimals', type: 'number', min: 0, max: 4 },
            { name: 'rate_per_usd', label: 'Initial rate per 1 USD', type: 'number', step: '0.000001', min: 0 },
          ] }]}
          onSubmit={async (v) => { await api('/ref/currencies', { method: 'POST', body: { ...v, code: String(v.code || '').toUpperCase() } }); setCurForm(null); load(); }} />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { HelpIcon } from '../../help';
import { Field } from '../../components/EntityPage';
import { opts, useLookups } from '../../lookups';

export default function FirmSettings() {
  const { firm, refreshFirm } = useAuth();
  const lk = useLookups(['countries', 'currencies']);
  const [v, setV] = useState(firm);
  const [stages, setStages] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setV(firm); api('/firm/stages').then(setStages).catch(() => {}); }, [firm]);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));

  async function save(e) {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      await api('/firm', { method: 'PUT', body: v });
      await refreshFirm();
      setMsg('Settings saved.');
    } catch (ex) { setErr(ex.message); }
  }
  async function saveStage(s) {
    setErr(''); setMsg('');
    try {
      await api(`/firm/stages/${s.id}`, { method: 'PUT', body: { name: s.name, probability: s.probability } });
      setMsg(`Stage "${s.name}" saved.`);
    } catch (ex) { setErr(ex.message); }
  }

  return (
    <div className="page">
      <div className="page-head"><h1>Firm settings <HelpIcon k="settings.firm" label="Firm settings" /></h1></div>
      {msg && <div className="ok">{msg}</div>}
      {err && <div className="error">{err}</div>}
      <form className="card" onSubmit={save}>
        <fieldset className="group">
          <legend>Firm profile <HelpIcon k="settings.firm" /></legend>
          <div className="form">
            <Field f={{ name: 'name', label: 'Firm name', required: true, full: true }} value={v.name} onChange={set} />
            <Field f={{ name: 'country_code', label: 'Country', type: 'select', required: true, options: opts.countries(lk.countries) }} value={v.country_code} onChange={set} />
            <Field f={{ name: 'base_currency', label: 'Base currency', type: 'select', required: true, options: opts.currencies(lk.currencies) }} value={v.base_currency} onChange={set} />
            <Field f={{ name: 'timezone', label: 'Time zone', type: 'select', required: true, options: opts.timezones(v.timezone) }} value={v.timezone} onChange={set} />
            <Field f={{ name: 'domain', label: 'Email domain' }} value={v.domain} onChange={set} />
          </div>
        </fieldset>
        <div className="form-actions"><span className="spacer" /><button className="btn primary">Save settings</button></div>
      </form>

      <section className="card">
        <h2 className="card-title">Pipeline stages <HelpIcon k="settings.stages" /></h2>
        <table className="table compact">
          <thead><tr><th>#</th><th>Stage name</th><th>Default probability %</th><th>Type</th><th /></tr></thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={s.id}>
                <td>{s.sort_order}</td>
                <td><input value={s.name} aria-label="Stage name" onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
                <td><input type="number" min={0} max={100} value={s.probability} aria-label="Probability" disabled={!!(s.is_won || s.is_lost)}
                  onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, probability: e.target.value } : x)))} /></td>
                <td>{s.is_won ? 'Won' : s.is_lost ? 'Lost' : 'Open'}</td>
                <td className="right"><button className="btn sm" onClick={() => saveStage(s)}>Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

import EntityPage from '../components/EntityPage';
import { useAuth } from '../auth';
import { money } from '../format';
import { opts, useLookups } from '../lookups';
import { useDropdowns } from '../dropdowns';

export default function Companies() {
  const { can, user, firm } = useAuth();
  const lk = useLookups(['users', 'countries', 'currencies']);
  const dd = useDropdowns();
  const groups = (v) => [
    { title: 'Company details', help: 'companies.basic', fields: [
      { name: 'name', label: 'Company name', required: true, full: true },
      { name: 'domain', label: 'Website domain', placeholder: 'example.com' },
      { name: 'industry', label: 'Industry', type: 'select', options: dd.options('company_industry', v.industry) },
    ] },
    { title: 'Location & contact', help: 'companies.location', fields: [
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'city', label: 'City' },
      { name: 'country_code', label: 'Country', type: 'select', options: opts.countries(lk.countries) },
    ] },
    { title: 'Size & revenue', help: 'companies.financials', fields: [
      { name: 'employees', label: 'Employees', type: 'number', min: 0 },
      { name: 'annual_revenue', label: 'Annual revenue', type: 'number', min: 0, step: '0.01' },
      { name: 'currency_code', label: 'Revenue currency', type: 'select', options: opts.currencies(lk.currencies) },
    ] },
    { title: 'Ownership & notes', help: 'companies.ownership', fields: [
      { name: 'owner_id', label: 'Owner', type: 'select', options: opts.users(lk.users), disabled: !can.manage },
      { name: 'description', label: 'Description', type: 'textarea', full: true },
    ] },
  ];
  return (
    <EntityPage
      title="Companies" singular="Company" helpKey="companies" endpoint="/companies"
      defaults={{ currency_code: firm.base_currency, country_code: firm.country_code, owner_id: user.role === 'super_admin' ? '' : user.id }}
      canDelete={() => can.manage}
      filters={[
        { key: 'industry', label: 'Industry', options: dd.filter('company_industry') },
        { key: 'owner_id', label: 'Owner', options: opts.users(lk.users) },
      ]}
      columns={[
        { key: 'name', label: 'Company', render: (r) => <><b>{r.name}</b><div className="muted small">{r.domain}</div></> },
        { key: 'industry', label: 'Industry', render: (r) => dd.label('company_industry', r.industry) },
        { key: 'city', label: 'City' },
        { key: 'employees', label: 'Employees', align: 'right', render: (r) => r.employees?.toLocaleString() ?? '—' },
        { key: 'annual_revenue', label: `Revenue (${firm.base_currency})`, align: 'right', render: (r) => (
          <span title={r.currency_code !== r.base_currency ? `Original: ${money(r.annual_revenue, r.currency_code)}` : ''}>
            {money(r.annual_revenue_base, r.base_currency)}{r.currency_code !== r.base_currency && r.annual_revenue ? <small className="muted"> ({r.currency_code})</small> : null}
          </span>
        ) },
        { key: 'contact_count', label: 'Contacts', align: 'right' },
        { key: 'deal_count', label: 'Deals', align: 'right' },
        { key: 'owner_name', label: 'Owner' },
      ]}
      formGroups={groups}
    />
  );
}

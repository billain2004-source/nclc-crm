import EntityPage from '../components/EntityPage';
import { useAuth } from '../auth';
import { opts, useLookups } from '../lookups';
import { useDropdowns } from '../dropdowns';

export default function Contacts() {
  const { can, user } = useAuth();
  const lk = useLookups(['users', 'companies', 'countries']);
  const dd = useDropdowns();
  const groups = (v) => [
    { title: 'Contact details', help: 'contacts.basic', fields: [
      { name: 'first_name', label: 'First name', required: true },
      { name: 'last_name', label: 'Last name', required: true },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone' },
      { name: 'mobile', label: 'Mobile' },
      { name: 'city', label: 'City' },
      { name: 'country_code', label: 'Country', type: 'select', options: opts.countries(lk.countries) },
    ] },
    { title: 'Company & role', help: 'contacts.work', fields: [
      { name: 'company_id', label: 'Company', type: 'select', options: opts.companies(lk.companies) },
      { name: 'job_title', label: 'Job title' },
    ] },
    { title: 'Lifecycle & ownership', help: 'contacts.ownership', fields: [
      { name: 'lifecycle_stage', label: 'Lifecycle stage', type: 'select', required: true, options: dd.options('contact_lifecycle', v.lifecycle_stage) },
      { name: 'owner_id', label: 'Owner', type: 'select', options: opts.users(lk.users), disabled: !can.manage },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true },
    ] },
  ];
  return (
    <EntityPage
      title="Contacts" helpKey="contacts" endpoint="/contacts"
      defaults={{ lifecycle_stage: 'lead', owner_id: user.role === 'super_admin' ? '' : user.id }}
      canDelete={() => can.manage}
      filters={[
        { key: 'lifecycle_stage', label: 'Stage', options: dd.filter('contact_lifecycle') },
        { key: 'owner_id', label: 'Owner', options: opts.users(lk.users) },
      ]}
      columns={[
        { key: 'full_name', label: 'Name', render: (r) => <b>{r.full_name}</b> },
        { key: 'company_name', label: 'Company' },
        { key: 'job_title', label: 'Job title' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'lifecycle_stage', label: 'Stage', render: (r) => <span className={`pill lc-${r.lifecycle_stage}`}>{dd.label('contact_lifecycle', r.lifecycle_stage)}</span> },
        { key: 'owner_name', label: 'Owner' },
      ]}
      formGroups={groups}
    />
  );
}

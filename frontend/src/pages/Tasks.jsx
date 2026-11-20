import EntityPage from '../components/EntityPage';
import { api } from '../api';
import { useAuth } from '../auth';
import { dateTime, fromLocalInput, isOverdue, label, toLocalInput } from '../format';
import { opts, useLookups } from '../lookups';

const TYPES = ['call', 'email', 'meeting', 'todo'];
const PRIORITIES = ['high', 'medium', 'low'];
const STATUSES = ['open', 'in_progress', 'done'];
const TYPE_ICON = { call: '📞', email: '✉', meeting: '👥', todo: '☐' };

export default function Tasks() {
  const { can, user } = useAuth();
  const lk = useLookups(['users', 'contacts', 'deals']);
  const groups = [
    { title: 'Task details', help: 'tasks.basic', fields: [
      { name: 'title', label: 'Title', required: true, full: true },
      { name: 'type', label: 'Type', type: 'select', required: true, options: opts.list(TYPES) },
      { name: 'description', label: 'Description', type: 'textarea', full: true },
    ] },
    { title: 'Schedule & priority', help: 'tasks.schedule', fields: [
      { name: 'due_date', label: 'Due', type: 'datetime-local' },
      { name: 'priority', label: 'Priority', type: 'select', required: true, options: opts.list(PRIORITIES) },
      { name: 'status', label: 'Status', type: 'select', required: true, options: opts.list(STATUSES) },
      { name: 'assigned_to', label: 'Assigned to', type: 'select', options: opts.users(lk.users), disabled: !can.manage },
    ] },
    { title: 'Related records', help: 'tasks.links', fields: [
      { name: 'contact_id', label: 'Contact', type: 'select', options: opts.contacts(lk.contacts) },
      { name: 'deal_id', label: 'Deal', type: 'select', options: opts.deals(lk.deals) },
    ] },
  ];

  async function toggleDone(r, reload) {
    await api(`/tasks/${r.id}`, { method: 'PUT', body: { status: r.status === 'done' ? 'open' : 'done' } });
    reload();
  }

  return (
    <EntityPage
      title="Tasks" helpKey="tasks" endpoint="/tasks"
      defaults={{ type: 'todo', priority: 'medium', status: 'open', assigned_to: user.role === 'super_admin' ? '' : user.id }}
      toForm={(r) => ({ ...r, due_date: toLocalInput(r.due_date) })}
      fromForm={(v) => ({ ...v, due_date: fromLocalInput(v.due_date) })}
      rowClass={(r) => (isOverdue(r.due_date, r.status) ? 'row-overdue' : r.status === 'done' ? 'row-done' : '')}
      filters={[
        { key: 'status', label: 'Status', options: opts.list(STATUSES) },
        { key: 'priority', label: 'Priority', options: opts.list(PRIORITIES) },
        { key: 'due', label: 'Due', options: [{ value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'Next 7 days' }] },
        ...(can.manage ? [{ key: 'assigned_to', label: 'Assignee', options: opts.users(lk.users) }] : []),
      ]}
      columns={[
        { key: 'done', label: '', render: (r, reload) => (
          <input type="checkbox" aria-label="Mark done" checked={r.status === 'done'} onClick={(e) => e.stopPropagation()} onChange={() => toggleDone(r, reload)} />
        ) },
        { key: 'title', label: 'Task', render: (r) => <><span aria-hidden>{TYPE_ICON[r.type]} </span><b>{r.title}</b>{(r.contact_name || r.deal_name) && <div className="muted small">{[r.contact_name, r.deal_name].filter(Boolean).join(' · ')}</div>}</> },
        { key: 'priority', label: 'Priority', render: (r) => <span className={`pill ${r.priority}`}>{label(r.priority)}</span> },
        { key: 'status', label: 'Status', render: (r) => <span className={`pill st-${r.status}`}>{label(r.status)}</span> },
        { key: 'due_date', label: 'Due', render: (r) => <span className="nowrap">{isOverdue(r.due_date, r.status) ? '⚠ ' : ''}{dateTime(r.due_date)}</span> },
        { key: 'assigned_name', label: 'Assigned to' },
      ]}
      formGroups={groups}
    />
  );
}

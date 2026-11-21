// Dropdown lists and their global default values (firm_id = 0).
// Idempotent: lists/values are inserted only when missing, so labels, order and active flags
// edited in Settings > Dropdown Values are never overwritten by a re-run.
// is_system values are referenced by business logic (defaults, lead conversion, dashboard,
// AI agents): they can be relabelled and reordered but not deactivated or deleted.

// [code, name, used_by, allow_custom, firm_editable, description]
const LISTS = [
  ['lead_status', 'Lead status', 'leads.status', 1, 1, 'Where a lead is in qualification. "Converted" is set only by the Convert action.'],
  ['lead_source', 'Lead source', 'leads.source', 1, 1, 'Where the lead came from.'],
  ['contact_lifecycle', 'Contact lifecycle stage', 'contacts.lifecycle_stage', 1, 1, 'Relationship stage of a contact.'],
  ['company_industry', 'Company industry', 'companies.industry', 1, 1, 'Industry of a company.'],
  ['task_type', 'Task type', 'tasks.type', 1, 1, 'Kind of activity.'],
  ['task_priority', 'Task priority', 'tasks.priority', 1, 1, 'How urgent a task is.'],
  ['task_status', 'Task status', 'tasks.status', 1, 1, 'Progress of a task. "Done" sets the completion time.'],
  ['deal_status', 'Deal status', 'deals.status', 0, 1, 'Fixed values, derived from the pipeline stage (won / lost flags). Only labels and order can change.'],
  ['firm_status', 'Firm status', 'firms.status', 0, 0, 'Fixed values used for tenant access. Super Admin only.'],
];

// list -> [code, label, is_system]
const VALUES = {
  lead_status: [['new', 'New', 1], ['contacted', 'Contacted', 0], ['qualified', 'Qualified', 0], ['unqualified', 'Unqualified', 1], ['converted', 'Converted', 1]],
  lead_source: [['website', 'Website'], ['referral', 'Referral'], ['linkedin', 'LinkedIn'], ['trade_show', 'Trade Show'], ['cold_call', 'Cold Call'],
    ['email_campaign', 'Email Campaign'], ['partner', 'Partner'], ['webinar', 'Webinar']],
  contact_lifecycle: [['subscriber', 'Subscriber'], ['lead', 'Lead', 1], ['opportunity', 'Opportunity', 1], ['customer', 'Customer'], ['evangelist', 'Evangelist'], ['other', 'Other']],
  company_industry: ['Agriculture', 'Construction', 'Education', 'Energy', 'Financial Services', 'Food & Beverage', 'Healthcare', 'Hospitality',
    'Insurance', 'Logistics', 'Manufacturing', 'Media', 'Retail', 'Technology', 'Other'].map((l) => [slugCode(l), l]),
  task_type: [['call', 'Call'], ['email', 'Email', 1], ['meeting', 'Meeting'], ['todo', 'To-do', 1]],
  task_priority: [['high', 'High'], ['medium', 'Medium', 1], ['low', 'Low']],
  task_status: [['open', 'Open', 1], ['in_progress', 'In Progress'], ['done', 'Done', 1]],
  deal_status: [['open', 'Open', 1], ['won', 'Won', 1], ['lost', 'Lost', 1]],
  firm_status: [['active', 'Active', 1], ['suspended', 'Suspended', 1]],
};

// Lists whose v1 data stored the label text: convert stored labels to stable codes.
const NORMALISE = { lead_source: ['leads', 'source'], company_industry: ['companies', 'industry'] };

function slugCode(s) {
  return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

async function seedLookups(conn, log = console.log) {
  let lists = 0;
  let values = 0;
  for (const [i, [code, name, usedBy, allowCustom, firmEditable, description]] of LISTS.entries()) {
    const [r] = await conn.query(
      'INSERT IGNORE INTO lookup_lists (code, name, description, used_by, allow_custom, firm_editable, sort_order) VALUES (?,?,?,?,?,?,?)',
      [code, name, description, usedBy, allowCustom, firmEditable, (i + 1) * 10]);
    lists += r.affectedRows;
    for (const [j, [vCode, label, system = 0]] of VALUES[code].entries()) {
      const [v] = await conn.query(
        'INSERT IGNORE INTO lookup_values (firm_id, list_code, code, label, sort_order, is_system) VALUES (0,?,?,?,?,?)',
        [code, vCode, label, (j + 1) * 10, system]);
      values += v.affectedRows;
    }
  }
  let normalised = 0;
  for (const [list, [table, col]] of Object.entries(NORMALISE)) {
    for (const [vCode, label] of VALUES[list]) {
      const [u] = await conn.query(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ? AND BINARY ${col} <> BINARY ?` /* case-insensitive collation */, [vCode, label, vCode]);
      normalised += u.affectedRows;
    }
  }
  log(`Dropdown values: ${lists} list(s) and ${values} value(s) added${normalised ? `, ${normalised} stored label(s) converted to codes` : ''}.`);
}

module.exports = { seedLookups, slugCode, LISTS, VALUES };

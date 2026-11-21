// Idempotent schema changes for databases created by an earlier version.
// New tables come from schema.sql (CREATE TABLE IF NOT EXISTS); this file handles ALTERs.
// Every step checks information_schema first, so `npm run db:setup` can be re-run safely.

async function columnType(conn, table, column) {
  const [[r]] = await conn.query(
    'SELECT COLUMN_TYPE AS t FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?', [table, column]);
  return r ? r.t : null;
}
async function hasConstraint(conn, table, name) {
  const [[r]] = await conn.query(
    'SELECT COUNT(*) AS n FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?', [table, name]);
  return r.n > 0;
}
async function hasIndex(conn, table, name) {
  const [[r]] = await conn.query(
    'SELECT COUNT(*) AS n FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?', [table, name]);
  return r.n > 0;
}

// [description, check(conn) -> true when the change is still needed, sql]
const STEPS = [
  // ---- Part B Stage 4: missing foreign keys found by scripts/inspect-db.js ----
  ['FK leads.converted_deal_id -> deals.id (ON DELETE SET NULL)',
    async (c) => !(await hasConstraint(c, 'leads', 'fk_leads_deal')),
    [`UPDATE leads l LEFT JOIN deals d ON d.id = l.converted_deal_id SET l.converted_deal_id = NULL
       WHERE l.converted_deal_id IS NOT NULL AND d.id IS NULL`,
    'ALTER TABLE leads ADD CONSTRAINT fk_leads_deal FOREIGN KEY (converted_deal_id) REFERENCES deals(id) ON DELETE SET NULL']],
  ['FK exchange_rates.created_by -> users.id (ON DELETE SET NULL)',
    async (c) => !(await hasConstraint(c, 'exchange_rates', 'fk_rates_user')),
    [`UPDATE exchange_rates e LEFT JOIN users u ON u.id = e.created_by SET e.created_by = NULL
       WHERE e.created_by IS NOT NULL AND u.id IS NULL`,
    'ALTER TABLE exchange_rates ADD CONSTRAINT fk_rates_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL']],
  // ---- Part B Stage 5: dropdown columns become table-driven (lookup_values) ----
  ...[['leads', 'status', 'new'], ['tasks', 'type', 'todo'], ['tasks', 'priority', 'medium'], ['tasks', 'status', 'open']].map(([t, col, def]) => [
    `${t}.${col}: ENUM -> VARCHAR(40) (values now come from lookup_values)`,
    async (c) => /^enum/i.test((await columnType(c, t, col)) || ''),
    `ALTER TABLE ${t} MODIFY ${col} VARCHAR(40) NOT NULL DEFAULT '${def}'`,
  ]),
];

async function migrate(conn, log = console.log) {
  let applied = 0;
  for (const [desc, needed, sql] of STEPS) {
    if (await needed(conn)) {
      for (const s of [].concat(sql)) await conn.query(s);
      log(`  migration: ${desc}`);
      applied++;
    }
  }
  log(applied ? `Applied ${applied} migration step(s).` : 'Schema is up to date (no migrations needed).');
}

module.exports = { migrate, STEPS, columnType, hasConstraint, hasIndex };

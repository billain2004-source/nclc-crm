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
const STEPS = [];

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

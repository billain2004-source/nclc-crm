// Exports the live database as two SQL files for backups:
//   db_schema.sql  - CREATE TABLE statements (SHOW CREATE TABLE) for every table
//   db_data.sql    - INSERT statements for all business data
// API key material is NEVER exported:
//   - api_keys:          structure only, no rows (encrypted keys stay out of backups)
//   - api_key_usage_log: no rows (operational log that references keys)
//   - agent_runs.key_id: written as NULL (the referenced key rows are not exported)
// Usage: node scripts/export-sql.js <output-folder>
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

const NO_DATA = new Set(['api_keys', 'api_key_usage_log']);
const NULL_COLUMNS = { agent_runs: ['key_id'] };

(async () => {
  const outDir = path.resolve(process.argv[2] || '.');
  fs.mkdirSync(outDir, { recursive: true });
  const conn = await mysql.createConnection({ ...config.db, dateStrings: true, timezone: 'Z' });
  await conn.query("SET time_zone = '+00:00'");
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const [tables] = await conn.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name", [config.db.database]);

  const head = (what) => [
    `-- NCLC CRM ${what} - exported ${stamp} from database \`${config.db.database}\``,
    '-- API keys are never exported: api_keys and api_key_usage_log have no rows here; agent_runs.key_id is NULL.',
    '-- Import order: db_schema.sql, then db_data.sql (into an empty database).',
    'SET NAMES utf8mb4;', "SET time_zone = '+00:00';", 'SET FOREIGN_KEY_CHECKS = 0;', '',
  ].join('\n');

  let schema = head('schema');
  let data = head('data');
  const counts = [];
  for (const { t } of tables) {
    const [[row]] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
    schema += `DROP TABLE IF EXISTS \`${t}\`;\n${row['Create Table'].replace(/ AUTO_INCREMENT=\d+/, '')};\n\n`;
    if (NO_DATA.has(t)) { data += `-- ${t}: contents intentionally not exported\n\n`; counts.push(`${t}: skipped (no key data in backups)`); continue; }
    const [rows] = await conn.query(`SELECT * FROM \`${t}\``);
    counts.push(`${t}: ${rows.length}`);
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const nulls = new Set(NULL_COLUMNS[t] || []);
    data += `-- ${t} (${rows.length} rows)\n`;
    for (let i = 0; i < rows.length; i += 100) {
      const values = rows.slice(i, i + 100).map((r) => cols.map((c) => {
        if (nulls.has(c)) return null;
        const v = r[c];
        return v !== null && typeof v === 'object' && !Buffer.isBuffer(v) ? JSON.stringify(v) : v;
      }));
      data += conn.format(`INSERT INTO ?? (${cols.map((c) => conn.escapeId(c)).join(', ')}) VALUES ?;`, [t, values]) + '\n';
    }
    data += '\n';
  }
  schema += 'SET FOREIGN_KEY_CHECKS = 1;\n';
  data += 'SET FOREIGN_KEY_CHECKS = 1;\n';
  fs.writeFileSync(path.join(outDir, 'db_schema.sql'), schema, 'utf8');
  fs.writeFileSync(path.join(outDir, 'db_data.sql'), data, 'utf8');
  await conn.end();
  console.log(`Exported ${tables.length} tables to ${outDir}`);
  for (const c of counts) console.log(`  ${c}`);
})().catch((e) => {
  console.error('Export failed:', e.message);
  process.exit(1);
});

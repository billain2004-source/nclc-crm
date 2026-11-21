// Creates the database (from .env DB_NAME), applies db/schema.sql and seeds demo data.
//   node scripts/init-db.js          -> create if missing, seed only when empty (safe to re-run)
//   node scripts/init-db.js --reset  -> DROP the database and rebuild it from scratch
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');
const { seed, syncHelp } = require('../db/seed');
const { seedAi } = require('../db/seedAi');
const { migrate } = require('../db/migrate');

(async () => {
  const reset = process.argv.includes('--reset');
  const { database, ...server } = config.db;
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('DB_NAME may only contain letters, digits and underscores');

  const conn = await mysql.createConnection({ ...server, multipleStatements: true, timezone: 'Z' });
  await conn.query("SET time_zone = '+00:00'"); // store all timestamps in UTC (see src/db.js)
  if (reset) {
    console.log(`Dropping database ${database} ...`);
    await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
  }
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${database}\``);

  // Strip the CREATE DATABASE / USE lines so DB_NAME from .env is honoured
  const sql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8')
    .split('\n').filter((l) => !/^\s*(CREATE DATABASE|USE)\b/i.test(l)).join('\n');
  await conn.query(sql);
  console.log('Schema applied.');
  await migrate(conn);

  await conn.beginTransaction();
  try {
    await seed(conn);
    await syncHelp(conn);
    await seedAi(conn);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  }

  const [tables] = await conn.query(`
    SELECT table_name AS t, table_rows AS r FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`, [database]);
  for (const t of tables) {
    const [[{ c }]] = await conn.query(`SELECT COUNT(*) AS c FROM \`${t.t}\``);
    console.log(`  ${t.t.padEnd(18)} ${c} rows`);
  }
  await conn.end();
  console.log('Database ready.');
})().catch((e) => {
  console.error('DB init failed:', e.message);
  process.exit(1);
});

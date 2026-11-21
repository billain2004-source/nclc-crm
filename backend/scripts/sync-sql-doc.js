// Regenerates documents/create_tables.sql from backend/db/schema.sql (the source of truth).
// Usage: node scripts/sync-sql-doc.js
const fs = require('fs');
const path = require('path');

const pad = (n) => String(n).padStart(2, '0');
const ist = new Date(Date.now() + 330 * 60000);
const stamp = `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())} IST (UTC+05:30)`;
const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
const header = [
  '-- =====================================================================',
  '-- Document: create_tables.sql v2.0',
  `-- Last updated: ${stamp}`,
  '-- Source of truth: backend/db/schema.sql (this file is a copy for documentation)',
  '-- Run:  mysql -u <user> -p < create_tables.sql   (or: cd backend; npm run db:setup)',
  '-- Existing v1 databases: run `npm run db:migrate` (backend/db/migrate.js applies the ALTERs).',
  '-- =====================================================================',
  '', '',
].join('\n');
fs.writeFileSync(path.join(__dirname, '../../documents/create_tables.sql'), header + schema, 'utf8');
console.log(`documents/create_tables.sql regenerated (${stamp})`);

// Inspects the live database: tables, columns, primary keys, foreign keys, indexes,
// plus data-integrity checks (dangling references and cross-firm links that FKs cannot catch).
// Usage: node scripts/inspect-db.js [--md out.md]   (prints a Markdown report)
const fs = require('fs');
const mysql = require('mysql2/promise');
const config = require('../src/config');

// [description, SQL returning a count of offending rows]
const INTEGRITY = [
  ['leads.converted_deal_id points to a missing deal', 'SELECT COUNT(*) n FROM leads l LEFT JOIN deals d ON d.id = l.converted_deal_id WHERE l.converted_deal_id IS NOT NULL AND d.id IS NULL'],
  ['exchange_rates.created_by points to a missing user', 'SELECT COUNT(*) n FROM exchange_rates e LEFT JOIN users u ON u.id = e.created_by WHERE e.created_by IS NOT NULL AND u.id IS NULL'],
  ['help_text firm override for a missing firm', 'SELECT COUNT(*) n FROM help_text h LEFT JOIN firms f ON f.id = h.firm_id WHERE h.firm_id <> 0 AND f.id IS NULL'],
  ['contacts.company_id in another firm', 'SELECT COUNT(*) n FROM contacts x JOIN companies c ON c.id = x.company_id WHERE c.firm_id <> x.firm_id'],
  ['deals.company_id in another firm', 'SELECT COUNT(*) n FROM deals x JOIN companies c ON c.id = x.company_id WHERE c.firm_id <> x.firm_id'],
  ['deals.contact_id in another firm', 'SELECT COUNT(*) n FROM deals x JOIN contacts c ON c.id = x.contact_id WHERE c.firm_id <> x.firm_id'],
  ['deals.stage_id in another firm', 'SELECT COUNT(*) n FROM deals x JOIN pipeline_stages s ON s.id = x.stage_id WHERE s.firm_id <> x.firm_id'],
  ['deals.contact_id works at a different company than deals.company_id', 'SELECT COUNT(*) n FROM deals x JOIN contacts c ON c.id = x.contact_id WHERE x.company_id IS NOT NULL AND c.company_id IS NOT NULL AND c.company_id <> x.company_id'],
  ['tasks.contact_id / deal_id in another firm', 'SELECT COUNT(*) n FROM tasks t LEFT JOIN contacts c ON c.id = t.contact_id LEFT JOIN deals d ON d.id = t.deal_id WHERE (c.id IS NOT NULL AND c.firm_id <> t.firm_id) OR (d.id IS NOT NULL AND d.firm_id <> t.firm_id)'],
  ['owner / assignee user in another firm', `SELECT (SELECT COUNT(*) FROM contacts x JOIN users u ON u.id = x.owner_id WHERE u.firm_id <> x.firm_id)
     + (SELECT COUNT(*) FROM companies x JOIN users u ON u.id = x.owner_id WHERE u.firm_id <> x.firm_id)
     + (SELECT COUNT(*) FROM leads x JOIN users u ON u.id = x.owner_id WHERE u.firm_id <> x.firm_id)
     + (SELECT COUNT(*) FROM deals x JOIN users u ON u.id = x.owner_id WHERE u.firm_id <> x.firm_id)
     + (SELECT COUNT(*) FROM tasks x JOIN users u ON u.id = x.assigned_to WHERE u.firm_id <> x.firm_id) AS n`],
  ['deals.status inconsistent with stage (won/lost flags)', "SELECT COUNT(*) n FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id WHERE d.status <> IF(s.is_won, 'won', IF(s.is_lost, 'lost', 'open'))"],
  ['converted leads missing converted_at', "SELECT COUNT(*) n FROM leads WHERE status = 'converted' AND converted_at IS NULL"],
  ['tasks done without completed_at', "SELECT COUNT(*) n FROM tasks WHERE status = 'done' AND completed_at IS NULL"],
  ['agent_runs pointing at a missing record', `SELECT COUNT(*) n FROM agent_runs r
     LEFT JOIN leads l ON r.entity_type = 'lead' AND l.id = r.entity_id
     LEFT JOIN deals d ON r.entity_type = 'deal' AND d.id = r.entity_id
     WHERE (r.entity_type = 'lead' AND l.id IS NULL) OR (r.entity_type = 'deal' AND d.id IS NULL)`],
];

(async () => {
  const conn = await mysql.createConnection(config.db);
  const db = config.db.database;
  const [tables] = await conn.query(
    "SELECT table_name AS t, table_comment AS c FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name", [db]);
  const [cols] = await conn.query(
    `SELECT table_name AS t, column_name AS name, column_type AS type, is_nullable AS nullable, column_default AS def, column_key AS k, extra
       FROM information_schema.columns WHERE table_schema = ? ORDER BY table_name, ordinal_position`, [db]);
  const [fks] = await conn.query(
    `SELECT k.table_name AS t, k.column_name AS col, k.referenced_table_name AS rt, k.referenced_column_name AS rc, k.constraint_name AS name,
            r.delete_rule AS on_delete, r.update_rule AS on_update
       FROM information_schema.key_column_usage k
       JOIN information_schema.referential_constraints r ON r.constraint_schema = k.table_schema AND r.constraint_name = k.constraint_name
      WHERE k.table_schema = ? AND k.referenced_table_name IS NOT NULL ORDER BY k.table_name, k.column_name`, [db]);
  const [idx] = await conn.query(
    `SELECT table_name AS t, index_name AS name, non_unique AS non_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
       FROM information_schema.statistics WHERE table_schema = ? GROUP BY table_name, index_name, non_unique ORDER BY table_name, index_name`, [db]);

  const out = [];
  out.push(`Live database \`${db}\`: ${tables.length} tables, ${cols.length} columns, ${fks.length} foreign keys, ${idx.length} indexes.`, '');
  for (const { t } of tables) {
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    const pk = cols.filter((c) => c.t === t && c.k === 'PRI').map((c) => c.name).join(', ');
    out.push(`### ${t}`, `Rows: ${n} · PK: \`${pk}\``, '', '| Column | Type | Null | Default | Key / extra |', '|---|---|---|---|---|');
    for (const c of cols.filter((x) => x.t === t)) {
      const fk = fks.find((f) => f.t === t && f.col === c.name);
      const key = [c.k === 'PRI' ? 'PK' : c.k === 'UNI' ? 'UNIQUE' : c.k === 'MUL' ? 'INDEX' : '', fk ? `FK → ${fk.rt}.${fk.rc} (del: ${fk.on_delete})` : '', c.extra].filter(Boolean).join(' · ');
      out.push(`| ${c.name} | ${c.type} | ${c.nullable === 'YES' ? 'yes' : 'no'} | ${c.def === null ? '' : `\`${c.def}\``} | ${key} |`);
    }
    const ti = idx.filter((i) => i.t === t);
    out.push('', `Indexes: ${ti.map((i) => `\`${i.name}\`(${i.cols})${i.non_unique ? '' : ' unique'}`).join(', ')}`, '');
  }
  out.push('### Foreign keys', '', '| Table.column | → References | ON DELETE | ON UPDATE | Constraint |', '|---|---|---|---|---|');
  for (const f of fks) out.push(`| ${f.t}.${f.col} | ${f.rt}.${f.rc} | ${f.on_delete} | ${f.on_update} | ${f.name} |`);
  out.push('', '### Integrity checks', '', '| Check | Offending rows |', '|---|---|');
  for (const [desc, sql] of INTEGRITY) {
    const [[{ n }]] = await conn.query(sql);
    out.push(`| ${desc} | ${Number(n) === 0 ? '0 ✓' : `**${n}**`} |`);
  }
  await conn.end();
  const md = out.join('\n');
  const i = process.argv.indexOf('--md');
  if (i > 0) { fs.writeFileSync(process.argv[i + 1], md, 'utf8'); console.log(`Report written to ${process.argv[i + 1]}`); } else console.log(md);
})().catch((e) => { console.error('inspect failed:', e.message); process.exit(1); });

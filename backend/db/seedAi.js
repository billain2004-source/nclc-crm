// AI task types + FAKE placeholder keys. No real provider key is ever seeded.
// The "mock" provider answers locally (no network); a key containing "fail-429" simulates a rate limit,
// so the Northwind demo key shows failover: it gets exhausted and the call switches to a platform key.
const { encrypt, last4 } = require('../src/services/secrets');

const TASK_TYPES = [
  ['text', 'Text (LLM)', 'Chat / completion models: scoring, summaries, email drafts.', 60, 1],
  ['image', 'Image', 'Image generation.', 60, 2],
  ['audio', 'Audio', 'Text-to-speech and audio models.', 60, 3],
  ['embedding', 'Embedding', 'Vector embeddings for search and duplicate detection.', 60, 4],
];

// [name, provider, task_type, priority, is_primary, status, fake key]
const PLATFORM_KEYS = [
  ['Demo text key A (mock)', 'mock', 'text', 1, 1, 'active', 'mock-demo-text-key-A-0001'],
  ['Demo text key B (mock)', 'mock', 'text', 2, 0, 'active', 'mock-demo-text-key-B-0002'],
  ['Demo image key (mock)', 'mock', 'image', 1, 1, 'active', 'mock-demo-image-key-0003'],
  ['Demo audio key (mock)', 'mock', 'audio', 1, 1, 'active', 'mock-demo-audio-key-0004'],
  ['Demo embedding key (mock)', 'mock', 'embedding', 1, 1, 'active', 'mock-demo-embed-key-0005'],
  ['OpenAI - replace with your key', 'openai', 'text', 50, 0, 'disabled', 'sk-PLACEHOLDER-not-a-real-key-0000'],
];

async function seedAi(conn, log = console.log) {
  for (const [code, name, description, reset, sort] of TASK_TYPES) {
    await conn.query('INSERT IGNORE INTO ai_task_types (code, name, description, reset_minutes, sort_order) VALUES (?,?,?,?,?)', [code, name, description, reset, sort]);
  }
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM api_keys');
  if (n > 0) return;
  const [[sa]] = await conn.query("SELECT id FROM users WHERE role = 'super_admin' ORDER BY id LIMIT 1");
  for (const [name, provider, task, prio, primary, status, key] of PLATFORM_KEYS) {
    await conn.query('INSERT INTO api_keys SET ?', [{
      firm_id: null, name, provider, task_type: task, priority: prio, is_primary: primary, status,
      key_enc: encrypt(key), key_last4: last4(key), created_by: sa?.id || null, updated_by: sa?.id || null,
    }]);
  }
  const [[nw]] = await conn.query("SELECT id FROM firms WHERE name = 'Northwind Traders Ltd'");
  if (nw) {
    const [[admin]] = await conn.query("SELECT id FROM users WHERE email = 'admin@northwind.example'");
    const key = 'mock-demo-fail-429-key-9429';
    await conn.query('INSERT INTO api_keys SET ?', [{
      firm_id: nw.id, name: 'Northwind key (simulates rate limit)', provider: 'mock', task_type: 'text', priority: 1, is_primary: 1,
      status: 'active', key_enc: encrypt(key), key_last4: last4(key), created_by: admin?.id || null, updated_by: admin?.id || null,
    }]);
  }
  log(`Seeded ${TASK_TYPES.length} AI task types and ${PLATFORM_KEYS.length + (nw ? 1 : 0)} placeholder API keys (fake values, mock provider).`);
}

module.exports = { seedAi, TASK_TYPES };

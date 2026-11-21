// AES-256-GCM encryption for provider API keys stored in api_keys.key_enc.
// Format (base64): v1:<iv 12 bytes>:<auth tag 16 bytes>:<ciphertext>
// The master key comes from APP_ENC_KEY in .env (64 hex chars; any other string is hashed with SHA-256).
const crypto = require('crypto');
const config = require('../config');

const MASTER = /^[0-9a-fA-F]{64}$/.test(config.appEncKey)
  ? Buffer.from(config.appEncKey, 'hex')
  : crypto.createHash('sha256').update(config.appEncKey, 'utf8').digest();

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(stored) {
  const [v, iv, tag, data] = String(stored).split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Stored key has an unknown format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

const last4 = (plain) => String(plain).slice(-4);

// Remove anything that looks like a secret from text before it is stored, logged or returned.
function redact(text, ...knownSecrets) {
  let out = String(text ?? '');
  for (const s of knownSecrets) if (s && String(s).length >= 4) out = out.split(String(s)).join('[redacted]');
  out = out
    .replace(/\b(?:sk-ant-|sk-or-v1-|sk-proj-|sk-|gsk_|xai-|AIza|mock-)[A-Za-z0-9_\-]{6,}/g, '[redacted]')
    .replace(/\b[Bb]earer\s+[A-Za-z0-9._\-]{8,}/g, 'Bearer [redacted]')
    .replace(/([?&](?:key|api_key|apikey)=)[^&\s]+/gi, '$1[redacted]');
  return out.slice(0, 250);
}

module.exports = { encrypt, decrypt, last4, redact };

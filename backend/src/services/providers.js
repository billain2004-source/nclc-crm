// Provider adapters used by llmRouter. Each adapter takes ONE decrypted key and either returns a
// normalised result or throws a ProviderError with the HTTP status, so the router can classify it.
// Keys are only ever placed in request headers - never in URLs, logs or error messages.
const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk').default;
const config = require('../config');

class ProviderError extends Error {
  constructor(status, message, { type, fatal = false } = {}) {
    super(message);
    this.status = status ?? null;
    this.type = type || null;
    this.fatal = fatal; // true = do not try other keys (the request itself is the problem)
  }
}

// provider -> supported task types + default model per task type
const PROVIDERS = {
  openai: { label: 'OpenAI', tasks: { text: 'gpt-4o-mini', image: 'gpt-image-1', audio: 'tts-1', embedding: 'text-embedding-3-small' } },
  anthropic: { label: 'Anthropic (Claude)', tasks: { text: 'claude-opus-5-5' } },
  gemini: { label: 'Google Gemini', tasks: { text: 'gemini-2.0-flash', embedding: 'text-embedding-004' } },
  openrouter: { label: 'OpenRouter', tasks: { text: 'openrouter/auto' } },
  groq: { label: 'Groq', tasks: { text: 'llama-3.1-8b-instant' } },
  mock: { label: 'Mock (demo / testing - no network)', tasks: { text: 'mock-text', image: 'mock-image', audio: 'mock-audio', embedding: 'mock-embed' } },
};

const OPENAI_BASES = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
};

// Claude models that accept the server-side refusal fallback (see claude-api guidance)
const CLAUDE_FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-2', 'claude-fable-5-1']);

function textMessages(payload) {
  if (Array.isArray(payload.messages) && payload.messages.length) return payload.messages;
  return [{ role: 'user', content: String(payload.prompt || '') }];
}

async function httpJson(url, { headers, body, signal, binary = false }) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new ProviderError(null, 'Provider did not respond in time', { type: 'timeout' });
    throw new ProviderError(null, `Network error: ${e.cause?.code || e.message}`, { type: 'network' });
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error?.message || j.error?.status || j.message || (typeof j.error === 'string' ? j.error : msg);
    } catch { /* non-JSON error body */ }
    throw new ProviderError(res.status, msg);
  }
  if (binary) return Buffer.from(await res.arrayBuffer());
  return res.json();
}

// ---------------- OpenAI-compatible (OpenAI, OpenRouter, Groq) ----------------
async function callOpenAICompatible({ provider, model, apiKey, taskType, payload, signal }) {
  const base = OPENAI_BASES[provider];
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (taskType === 'text') {
    const messages = [...(payload.system ? [{ role: 'system', content: payload.system }] : []), ...textMessages(payload)];
    const j = await httpJson(`${base}/chat/completions`, { headers, signal, body: { model, messages } });
    return { text: j.choices?.[0]?.message?.content ?? '', usage: j.usage || null };
  }
  if (taskType === 'embedding') {
    const j = await httpJson(`${base}/embeddings`, { headers, signal, body: { model, input: payload.input } });
    return { vectors: (j.data || []).map((d) => d.embedding), usage: j.usage || null };
  }
  if (taskType === 'image') {
    const j = await httpJson(`${base}/images/generations`, { headers, signal, body: { model, prompt: payload.prompt, size: payload.size || '1024x1024', n: 1 } });
    const d = j.data?.[0] || {};
    return { images: [d.b64_json ? { b64: d.b64_json } : { url: d.url }] };
  }
  if (taskType === 'audio') {
    const buf = await httpJson(`${base}/audio/speech`, { headers, signal, binary: true, body: { model, voice: payload.voice || 'alloy', input: payload.text || payload.prompt } });
    return { audio: { mime: 'audio/mpeg', b64: buf.toString('base64') } };
  }
  throw new ProviderError(null, `${PROVIDERS[provider].label} does not support task type "${taskType}"`, { type: 'unsupported' });
}

// ---------------- Anthropic (official SDK) ----------------
async function callAnthropic({ model, apiKey, taskType, payload }) {
  if (taskType !== 'text') throw new ProviderError(null, `Anthropic does not support task type "${taskType}"`, { type: 'unsupported' });
  // maxRetries: 0 -> the router decides what happens on 429/5xx (fail over to the next key)
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: config.llmTimeoutMs });
  const params = {
    model,
    max_tokens: payload.maxTokens || 16000,
    messages: textMessages(payload),
    ...(payload.system ? { system: payload.system } : {}),
  };
  let response;
  try {
    response = CLAUDE_FALLBACK_MODELS.has(model)
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ProviderError(null, 'Provider did not respond in time', { type: 'timeout' });
    if (e instanceof Anthropic.APIConnectionError) throw new ProviderError(null, 'Network error contacting Anthropic', { type: 'network' });
    if (e instanceof Anthropic.APIError) throw new ProviderError(e.status, e.error?.error?.message || e.message);
    throw e;
  }
  if (response.stop_reason === 'refusal') {
    throw new ProviderError(200, `The model declined this request${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}`, { type: 'refusal', fatal: true });
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text, usage: response.usage || null };
}

// ---------------- Google Gemini ----------------
async function callGemini({ model, apiKey, taskType, payload, signal }) {
  const base = 'https://generativelanguage.googleapis.com/v1beta/models';
  const headers = { 'x-goog-api-key': apiKey };
  if (taskType === 'text') {
    const contents = textMessages(payload).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));
    const body = { contents, ...(payload.system ? { systemInstruction: { parts: [{ text: payload.system }] } } : {}) };
    const j = await httpJson(`${base}/${encodeURIComponent(model)}:generateContent`, { headers, signal, body });
    return { text: (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''), usage: j.usageMetadata || null };
  }
  if (taskType === 'embedding') {
    const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];
    const vectors = [];
    for (const text of inputs) {
      const j = await httpJson(`${base}/${encodeURIComponent(model)}:embedContent`, { headers, signal, body: { content: { parts: [{ text: String(text) }] } } });
      vectors.push(j.embedding?.values || []);
    }
    return { vectors };
  }
  throw new ProviderError(null, `Gemini does not support task type "${taskType}"`, { type: 'unsupported' });
}

// ---------------- Mock (offline demo / tests) ----------------
// The key value controls behaviour so failover can be demonstrated without real keys:
//   contains "fail-429" -> rate limited, "fail-402" -> quota, "fail-401" -> invalid key,
//   "fail-403" -> quota exceeded (403), "fail-500" -> server error. Anything else succeeds.
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
async function callMock({ apiKey, taskType, payload }) {
  const m = /fail-(\d{3})/.exec(apiKey);
  if (m) {
    const status = Number(m[1]);
    const msg = { 429: 'Rate limit reached (simulated)', 402: 'Insufficient credit (simulated)', 401: 'Invalid API key (simulated)', 403: 'Quota exceeded (simulated)', 500: 'Upstream server error (simulated)' }[status] || 'Simulated failure';
    throw new ProviderError(status, msg);
  }
  if (taskType === 'text') return { text: typeof payload.mock === 'function' ? payload.mock() : `[mock reply] ${String(payload.prompt || '').slice(0, 120)}` };
  if (taskType === 'embedding') {
    const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];
    return { vectors: inputs.map((t) => [...crypto.createHash('sha256').update(String(t)).digest()].slice(0, 8).map((b) => Math.round((b / 255) * 1000) / 1000)) };
  }
  if (taskType === 'image') return { images: [{ b64: TINY_PNG }] };
  if (taskType === 'audio') return { audio: { mime: 'audio/wav', b64: '' } };
  return { text: `[mock reply for task type ${taskType}]` };
}

async function callProvider({ provider, model, apiKey, taskType, payload }) {
  const def = PROVIDERS[provider];
  if (!def) throw new ProviderError(null, `Unknown provider "${provider}"`, { type: 'unsupported' });
  // Custom task types are served with the provider's text model
  const kind = def.tasks[taskType] ? taskType : 'text';
  const useModel = model || def.tasks[kind];
  if (!def.tasks[kind]) throw new ProviderError(null, `${def.label} does not support task type "${taskType}"`, { type: 'unsupported' });
  const signal = AbortSignal.timeout(config.llmTimeoutMs);
  const args = { provider, model: useModel, apiKey, taskType: kind, payload, signal };
  let out;
  if (provider === 'mock') out = await callMock(args);
  else if (provider === 'anthropic') out = await callAnthropic(args);
  else if (provider === 'gemini') out = await callGemini(args);
  else out = await callOpenAICompatible(args);
  return { ...out, model: useModel };
}

module.exports = { PROVIDERS, ProviderError, callProvider };

// Thin fetch wrapper: adds the JWT and (for the Super Admin) the selected firm header.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } },
};

let token = store.get('nclc_token');
let firmId = store.get('nclc_firm');
let onUnauthorized = () => {};

export const session = {
  get token() { return token; },
  get firmId() { return firmId; },
  setToken(t) { token = t; store.set('nclc_token', t); },
  setFirm(id) { firmId = id ? String(id) : null; store.set('nclc_firm', firmId); },
  onUnauthorized(fn) { onUnauthorized = fn; },
};

export async function api(path, { method = 'GET', body, params } = {}) {
  let url = '/api' + path;
  if (params) {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const qs = new URLSearchParams(clean).toString();
    if (qs) url += '?' + qs;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (firmId) headers['X-Firm-Id'] = firmId;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

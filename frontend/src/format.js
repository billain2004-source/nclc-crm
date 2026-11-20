// Numbers and dates follow the current firm's country (en-GB, en-IN, en-US, en-SG ...),
// so a UK firm sees £300,000 and an Indian firm sees ₹3,00,000 regardless of browser locale.
let LOCALE;
export function setFirmLocale(countryCode) {
  const candidate = countryCode ? `en-${countryCode}` : undefined;
  try { LOCALE = candidate && Intl.NumberFormat.supportedLocalesOf([candidate]).length ? candidate : undefined; } catch { LOCALE = undefined; }
}

export function money(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return '—';
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency || ''} ${Number(amount).toLocaleString()}`;
  }
}

export function compactMoney(amount, currency) {
  if (amount === null || amount === undefined) return '—';
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  } catch {
    return money(amount, currency);
  }
}

export function date(v) {
  if (!v) return '—';
  const dateOnly = String(v).length <= 10;
  const d = new Date(String(v).replace(' ', 'T') + (dateOnly ? 'T00:00:00Z' : 'Z'));
  if (isNaN(d)) return v;
  // date-only values (e.g. expected close date) are calendar dates: render them in UTC so they never shift a day
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric', ...(dateOnly ? { timeZone: 'UTC' } : {}) });
}

export function dateTime(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return v;
  return d.toLocaleString(LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function isOverdue(due, status) {
  if (!due || status === 'done') return false;
  return new Date(String(due).replace(' ', 'T') + 'Z') < new Date();
}

// For <input type="datetime-local"> (local time) <-> DB value (UTC 'YYYY-MM-DD HH:MM:SS')
export function toLocalInput(v) {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
}

export const ROLE_LABELS = { super_admin: 'Super Admin', firm_admin: 'Firm Admin', manager: 'Manager', team_user: 'Team User' };
export const label = (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Wrap async route handlers so rejected promises reach the error middleware (Express 4).
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ROLES = Object.freeze({
  SA: 'super_admin',
  FA: 'firm_admin',
  MG: 'manager',
  TU: 'team_user',
});

function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (body[f] !== undefined) out[f] = body[f] === '' ? null : body[f];
  }
  return out;
}

// IANA time zone check (e.g. "Europe/London", "Asia/Kolkata", "UTC")
function assertTimezone(tz) {
  if (tz === undefined) return;
  try {
    if (!tz) throw new Error();
    new Intl.DateTimeFormat('en', { timeZone: String(tz) }).format();
  } catch {
    throw new HttpError(400, `"${tz}" is not a valid time zone (use an IANA name such as Europe/London)`);
  }
}

module.exports = { HttpError, ah, ROLES, pick, assertTimezone };

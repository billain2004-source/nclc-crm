const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../db');
const { HttpError, ah, ROLES } = require('../utils');

// Verifies the JWT, reloads the user (so deactivation takes effect immediately)
// and resolves the firm context:
//   - firm users are always locked to their own firm_id
//   - the Super Admin picks a firm with the X-Firm-Id header (optional)
const authenticate = ah(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Not signed in');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again');
  }

  const [rows] = await pool.query(
    `SELECT u.id, u.firm_id, u.name, u.email, u.role, u.is_active, f.status AS firm_status
       FROM users u LEFT JOIN firms f ON f.id = u.firm_id WHERE u.id = ?`,
    [payload.sub]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw new HttpError(401, 'Account is inactive');
  if (user.role !== ROLES.SA && user.firm_status !== 'active') throw new HttpError(403, 'Your firm is suspended');

  req.user = { id: user.id, firm_id: user.firm_id, name: user.name, email: user.email, role: user.role };

  if (user.role === ROLES.SA) {
    const h = req.headers['x-firm-id'];
    req.firmId = null;
    if (h) {
      const [f] = await pool.query('SELECT id FROM firms WHERE id = ?', [Number(h)]);
      if (!f.length) throw new HttpError(400, 'Selected firm does not exist');
      req.firmId = f[0].id;
    }
  } else {
    req.firmId = user.firm_id;
  }
  next();
});

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission for this action'));
  next();
};

const requireFirm = (req, res, next) => {
  if (!req.firmId) return next(new HttpError(400, 'Select a firm first'));
  next();
};

module.exports = { authenticate, requireRole, requireFirm };

const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  dateStrings: true,
  timezone: 'Z',
});

// All timestamps are stored in UTC. MySQL fills CURRENT_TIMESTAMP / NOW() using the *session*
// time zone (the server's local zone by default), so force every pooled session to UTC.
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

module.exports = { pool };

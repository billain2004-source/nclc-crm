// Loads configuration from the project-root .env file. No credentials are hardcoded here.
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../../.env');
if (!fs.existsSync(envPath)) {
  console.error(`\n[config] Missing ${envPath}\n  Copy .env.example to .env and fill in your MySQL credentials.\n`);
  process.exit(1);
}
require('dotenv').config({ path: envPath });

function required(name) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    console.error(`[config] Environment variable ${name} is required (set it in .env)`);
    process.exit(1);
  }
  return v;
}

module.exports = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER'),
    // An empty password is allowed for local installs that have none, but it must be declared in .env
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'nclc_crm',
  },
  apiPort: Number(process.env.API_PORT || 4000),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
};

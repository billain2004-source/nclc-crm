const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { pool } = require('./db');
const { authenticate } = require('./middleware/auth');
const { ah } = require('./utils');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.clientOrigins }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', ah(async (req, res) => {
  const [[r]] = await pool.query('SELECT COUNT(*) AS firms FROM firms');
  res.json({ ok: true, database: config.db.database, firms: r.firms, time: new Date().toISOString() });
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/help', require('./routes/help')); // has its own public + authenticated routes

app.use('/api', authenticate);
const modules = require('./routes/modules');
const admin = require('./routes/admin');
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/contacts', modules.contacts);
app.use('/api/companies', modules.companies);
app.use('/api/leads', modules.leads);
app.use('/api/deals', modules.deals);
app.use('/api/tasks', modules.tasks);
app.use('/api/users', admin.users);
app.use('/api/firms', admin.firms);
app.use('/api/firm', admin.firm);
app.use('/api/ref', require('./routes/reference'));
app.use('/api/ai', require('./routes/aiKeys'));
app.use('/api/agents', require('./routes/agents'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Optional: serve the built frontend (npm run build in /frontend) from the same port.
const dist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A record with this value already exists' });
  if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'This record is in use and cannot be deleted' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'A referenced value (e.g. country or currency) is invalid' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

app.listen(config.apiPort, () => {
  console.log(`NCLC CRM API listening on http://localhost:${config.apiPort} (db: ${config.db.database})`);
  // Reactivate exhausted AI keys once their task type's reset window has passed
  require('./services/llmRouter').startResetSweep(config.keyResetSweepMinutes);
});

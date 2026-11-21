// Realistic demo data: reference data, 4 firms in different countries/currencies,
// users at every role, 12+ rows per module per firm, and default help text.
const bcrypt = require('bcryptjs');
const helpSeed = require('./helpSeed');
const { DEFAULT_STAGES } = require('../src/routes/admin');

const SUPER_ADMIN = { name: 'Platform Super Admin', email: 'superadmin@nclc-crm.example', password: 'Super@123' };
const DEMO_PASSWORD = 'Demo@123';

const CURRENCIES = [
  ['USD', 'US Dollar', '$', 2], ['EUR', 'Euro', '€', 2], ['GBP', 'British Pound', '£', 2],
  ['INR', 'Indian Rupee', '₹', 2], ['SGD', 'Singapore Dollar', 'S$', 2], ['JPY', 'Japanese Yen', '¥', 0],
  ['AUD', 'Australian Dollar', 'A$', 2], ['CAD', 'Canadian Dollar', 'C$', 2], ['AED', 'UAE Dirham', 'AED', 2],
  ['ZAR', 'South African Rand', 'R', 2], ['CHF', 'Swiss Franc', 'CHF', 2], ['CNY', 'Chinese Yuan', '¥', 2],
];
const COUNTRIES = [
  ['US', 'United States', 'USD', '+1'], ['GB', 'United Kingdom', 'GBP', '+44'], ['IN', 'India', 'INR', '+91'],
  ['SG', 'Singapore', 'SGD', '+65'], ['DE', 'Germany', 'EUR', '+49'], ['FR', 'France', 'EUR', '+33'],
  ['NL', 'Netherlands', 'EUR', '+31'], ['JP', 'Japan', 'JPY', '+81'], ['AU', 'Australia', 'AUD', '+61'],
  ['CA', 'Canada', 'CAD', '+1'], ['AE', 'United Arab Emirates', 'AED', '+971'], ['ZA', 'South Africa', 'ZAR', '+27'],
  ['CH', 'Switzerland', 'CHF', '+41'], ['CN', 'China', 'CNY', '+86'],
];
// Demo rates (units per 1 USD). Two dates so the rate history is visible.
const RATES = {
  '2026-10-01': { USD: 1, EUR: 0.87, GBP: 0.75, INR: 88.2, SGD: 1.29, JPY: 149.5, AUD: 1.52, CAD: 1.39, AED: 3.6725, ZAR: 17.6, CHF: 0.8, CNY: 7.13 },
  '2026-11-01': { USD: 1, EUR: 0.86, GBP: 0.76, INR: 88.6, SGD: 1.3, JPY: 152.0, AUD: 1.53, CAD: 1.4, AED: 3.6725, ZAR: 17.4, CHF: 0.8, CNY: 7.12 },
};

const FIRMS = [
  {
    name: 'Northwind Traders Ltd', country: 'GB', currency: 'GBP', tz: 'Europe/London', domain: 'northwind.example', phone: '+44 20',
    users: [['Oliver Bennett', 'admin', 'firm_admin'], ['Charlotte Hughes', 'manager', 'manager'], ['Harry Clarke', 'sales1', 'team_user'], ['Amelia Wright', 'sales2', 'team_user']],
    first: ['James', 'Sophie', 'William', 'Emily', 'George', 'Grace', 'Thomas', 'Lucy', 'Jack', 'Hannah', 'Daniel', 'Isabelle', 'Samuel', 'Ella', 'Henry'],
    last: ['Taylor', 'Brown', 'Evans', 'Walker', 'Robinson', 'Thompson', 'White', 'Edwards', 'Green', 'Hall', 'Wood', 'Harris', 'Lewis', 'Martin', 'Cooper'],
    cities: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Bristol', 'Edinburgh'],
    companies: [['Thames Valley Foods', 'Food & Beverage'], ['Pennine Engineering', 'Manufacturing'], ['Cotswold Retail Group', 'Retail'], ['Mersey Logistics', 'Logistics'],
      ['Highland Energy plc', 'Energy'], ['Kingsbridge Bank', 'Financial Services'], ['Albion Health Trust', 'Healthcare'], ['Brightwater Software', 'Technology'],
      ['Oakfield Construction', 'Construction'], ['Severn Media', 'Media'], ['Lakeland Hotels', 'Hospitality'], ['Clydeside Shipping', 'Logistics']],
    altCurrencies: ['EUR', 'USD'],
  },
  {
    name: 'Sahyadri Tech Solutions Pvt Ltd', country: 'IN', currency: 'INR', tz: 'Asia/Kolkata', domain: 'sahyadri.example', phone: '+91 20',
    users: [['Rajesh Kulkarni', 'admin', 'firm_admin'], ['Priya Deshpande', 'manager', 'manager'], ['Amit Patil', 'sales1', 'team_user'], ['Sneha Joshi', 'sales2', 'team_user']],
    first: ['Arjun', 'Kavya', 'Rohan', 'Ananya', 'Vikram', 'Meera', 'Siddharth', 'Pooja', 'Aditya', 'Neha', 'Karthik', 'Divya', 'Rahul', 'Ishita', 'Manoj'],
    last: ['Sharma', 'Iyer', 'Reddy', 'Nair', 'Mehta', 'Gupta', 'Shah', 'Rao', 'Banerjee', 'Kapoor', 'Menon', 'Verma', 'Pillai', 'Chopra', 'Agarwal'],
    cities: ['Pune', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Chennai', 'New Delhi'],
    companies: [['Deccan Pharma Ltd', 'Healthcare'], ['Konkan Agro Industries', 'Agriculture'], ['Indus Fintech Pvt Ltd', 'Financial Services'], ['Ganga Textiles', 'Manufacturing'],
      ['Malabar Spices Export', 'Food & Beverage'], ['Vindhya Infra Projects', 'Construction'], ['Narmada Power Corp', 'Energy'], ['Cauvery Software Labs', 'Technology'],
      ['Himalaya Retail Chain', 'Retail'], ['Godavari Logistics', 'Logistics'], ['Aravalli EdTech', 'Education'], ['Brahmaputra Hotels', 'Hospitality']],
    altCurrencies: ['USD', 'AED'],
  },
  {
    name: 'Lakeshore Analytics Inc', country: 'US', currency: 'USD', tz: 'America/Chicago', domain: 'lakeshore.example', phone: '+1 312',
    users: [['Michael Carter', 'admin', 'firm_admin'], ['Jennifer Lopez-Reyes', 'manager', 'manager'], ['Brian Mitchell', 'sales1', 'team_user'], ['Ashley Turner', 'sales2', 'team_user']],
    first: ['Ethan', 'Olivia', 'Noah', 'Ava', 'Liam', 'Mia', 'Mason', 'Chloe', 'Logan', 'Madison', 'Lucas', 'Abigail', 'Ryan', 'Natalie', 'Tyler'],
    last: ['Johnson', 'Williams', 'Miller', 'Davis', 'Anderson', 'Jackson', 'Moore', 'Martinez', 'Thomas', 'Garcia', 'Clark', 'Rodriguez', 'Young', 'King', 'Scott'],
    cities: ['Chicago', 'Austin', 'Denver', 'Boston', 'Seattle', 'Atlanta'],
    companies: [['Prairie Health Systems', 'Healthcare'], ['Great Lakes Manufacturing', 'Manufacturing'], ['Summit Financial Group', 'Financial Services'], ['Redwood Retail Co', 'Retail'],
      ['Bluegrass Energy', 'Energy'], ['Cascade Cloud Inc', 'Technology'], ['Lone Star Logistics', 'Logistics'], ['Liberty Insurance Partners', 'Insurance'],
      ['Golden Gate Media', 'Media'], ['Rocky Mountain Builders', 'Construction'], ['Atlantic Edu Network', 'Education'], ['Magnolia Hospitality', 'Hospitality']],
    altCurrencies: ['CAD', 'EUR'],
  },
  {
    name: 'Marina Bay Logistics Pte Ltd', country: 'SG', currency: 'SGD', tz: 'Asia/Singapore', domain: 'marinabay.example', phone: '+65 6',
    users: [['Tan Wei Ming', 'admin', 'firm_admin'], ['Lim Hui Ling', 'manager', 'manager'], ['Rahim Ismail', 'sales1', 'team_user'], ['Chloe Ng', 'sales2', 'team_user']],
    first: ['Wei Jie', 'Mei Ling', 'Arun', 'Siti', 'Jun Hao', 'Priya', 'Kai Xuan', 'Nurul', 'Daniel', 'Hui Min', 'Farhan', 'Xin Yi', 'Marcus', 'Aisyah', 'Ryan'],
    last: ['Tan', 'Lim', 'Lee', 'Ng', 'Wong', 'Goh', 'Chua', 'Koh', 'Teo', 'Ong', 'Rahman', 'Kumar', 'Chen', 'Yeo', 'Sim'],
    cities: ['Singapore', 'Jurong', 'Tampines', 'Woodlands'],
    companies: [['Sentosa Marine Supplies', 'Logistics'], ['Orchard Fashion House', 'Retail'], ['Raffles Medical Devices', 'Healthcare'], ['Changi Air Cargo', 'Logistics'],
      ['Merlion Fintech', 'Financial Services'], ['Straits Petrochemicals', 'Energy'], ['Bukit Timah Builders', 'Construction'], ['Clarke Quay F&B Group', 'Food & Beverage'],
      ['Temasek Robotics', 'Technology'], ['Jurong Port Services', 'Logistics'], ['Kallang Learning Hub', 'Education'], ['Sentosa Resorts Group', 'Hospitality']],
    altCurrencies: ['USD', 'AUD'],
  },
];

const JOB_TITLES = ['CEO', 'CFO', 'Head of Procurement', 'IT Director', 'Operations Manager', 'Marketing Director', 'Purchasing Manager', 'VP Sales', 'Finance Manager', 'CTO', 'Project Manager', 'Office Manager'];
const LIFECYCLE = ['subscriber', 'lead', 'opportunity', 'customer', 'customer', 'evangelist', 'opportunity', 'lead'];
// Stored as stable lookup codes (labels live in lookup_values; see seedLookups.js).
// Company industries are written as labels here and converted to codes by seedLookups().
const SOURCES = ['website', 'referral', 'linkedin', 'trade_show', 'cold_call', 'email_campaign', 'partner', 'webinar'];
const LEAD_STATUSES = ['new', 'new', 'contacted', 'contacted', 'qualified', 'qualified', 'unqualified', 'new', 'contacted', 'qualified', 'new', 'contacted'];
const DEAL_PRODUCTS = ['Annual Platform Licence', 'Implementation Services', 'Analytics Add-on', 'Support Renewal', 'Enterprise Upgrade', 'Pilot Project', 'Training Package', 'Data Migration', 'Multi-site Rollout', 'Consulting Retainer', 'Integration Bundle', 'Expansion Seats'];
// stage index (0-based into DEFAULT_STAGES) for the 12 demo deals per firm
const DEAL_STAGE_IDX = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 2];
const DEAL_USD = [18000, 42000, 9500, 65000, 27000, 120000, 15000, 54000, 33000, 76000, 21000, 48000];
const TASK_TEMPLATES = [
  ['call', 'Discovery call with {c}'], ['email', 'Send proposal to {c}'], ['meeting', 'Product demo for {co}'], ['todo', 'Prepare quote for {co}'],
  ['call', 'Follow up on pricing with {c}'], ['email', 'Share case study with {c}'], ['meeting', 'Quarterly business review - {co}'], ['todo', 'Update CRM notes for {co}'],
  ['call', 'Contract negotiation call - {co}'], ['email', 'Send onboarding pack to {c}'], ['meeting', 'Site visit at {co}'], ['todo', 'Check credit terms for {co}'],
  ['call', 'Renewal reminder call - {c}'], ['email', 'Thank-you note to {c}'],
];
// due date offsets in days from "now" (negative = overdue) and statuses
const TASK_DUE = [-5, -2, -1, 0, 0, 1, 2, 3, 5, 7, 10, 14, -8, 4];
const TASK_STATUS = ['open', 'open', 'in_progress', 'open', 'in_progress', 'open', 'open', 'open', 'open', 'open', 'open', 'open', 'done', 'done'];
const PRIORITY = ['high', 'medium', 'low'];

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20); }
function sqlDateTime(d) { return d.toISOString().slice(0, 19).replace('T', ' '); }
function addDays(days, hour = 10) { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); d.setUTCHours(hour, 0, 0, 0); return d; }
function roundNice(n) { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1)); return Math.round(n / p) * p; }

async function seed(conn, log = console.log) {
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM firms');
  if (n > 0) { log('Seed skipped: data already present.'); return false; }

  for (const c of CURRENCIES) await conn.query('INSERT IGNORE INTO currencies (code, name, symbol, decimals) VALUES (?,?,?,?)', c);
  for (const c of COUNTRIES) await conn.query('INSERT IGNORE INTO countries (code, name, currency_code, phone_code) VALUES (?,?,?,?)', c);
  for (const [date, rates] of Object.entries(RATES)) {
    for (const [code, rate] of Object.entries(rates)) {
      await conn.query('INSERT IGNORE INTO exchange_rates (currency_code, rate_per_usd, effective_date, source) VALUES (?,?,?,?)', [code, rate, date, 'Demo seed rate']);
    }
  }
  const latest = RATES['2026-11-01'];

  const saHash = await bcrypt.hash(SUPER_ADMIN.password, 10);
  const [sa] = await conn.query('INSERT INTO users (firm_id, name, email, password_hash, role) VALUES (NULL,?,?,?,?)', [SUPER_ADMIN.name, SUPER_ADMIN.email, saHash, 'super_admin']);
  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const f of FIRMS) {
    const [fr] = await conn.query('INSERT INTO firms (name, country_code, base_currency, timezone, domain) VALUES (?,?,?,?,?)', [f.name, f.country, f.currency, f.tz, f.domain]);
    const firmId = fr.insertId;

    const stageIds = [];
    for (const [name, sort, prob, won, lost] of DEFAULT_STAGES) {
      const [s] = await conn.query('INSERT INTO pipeline_stages (firm_id, name, sort_order, probability, is_won, is_lost) VALUES (?,?,?,?,?,?)', [firmId, name, sort, prob, won, lost]);
      stageIds.push({ id: s.insertId, prob, won, lost });
    }

    const userIds = {};
    for (const [name, local, role] of f.users) {
      const [u] = await conn.query('INSERT INTO users (firm_id, name, email, password_hash, role, phone) VALUES (?,?,?,?,?,?)',
        [firmId, name, `${local}@${f.domain}`, demoHash, role, `${f.phone} ${4000 + Math.floor(Math.random() * 5000)}`]);
      userIds[role] = userIds[role] || [];
      userIds[role].push(u.insertId);
    }
    const sellers = [userIds.manager[0], ...userIds.team_user];
    const owner = (i) => sellers[i % sellers.length];

    // Companies
    const companyIds = [];
    for (let i = 0; i < f.companies.length; i++) {
      const [name, industry] = f.companies[i];
      const cur = i % 5 === 4 ? f.altCurrencies[0] : f.currency;
      const revenueUsd = [2.5e6, 14e6, 6e6, 48e6, 120e6, 9e6, 31e6, 4e6, 75e6, 18e6, 3.2e6, 22e6][i];
      const [c] = await conn.query('INSERT INTO companies SET ?', [{
        firm_id: firmId, name, domain: `${slug(name)}.example`, industry, phone: `${f.phone} ${5000 + i * 37}`,
        email: `info@${slug(name)}.example`, city: f.cities[i % f.cities.length], country_code: f.country,
        employees: [45, 320, 150, 1200, 4800, 210, 760, 60, 2500, 400, 85, 610][i],
        annual_revenue: roundNice(revenueUsd * latest[cur]), currency_code: cur,
        description: `${industry} company based in ${f.cities[i % f.cities.length]}.`, owner_id: owner(i),
      }]);
      companyIds.push(c.insertId);
    }

    // Contacts (15)
    const contactIds = [];
    for (let i = 0; i < 15; i++) {
      const first = f.first[i]; const last = f.last[i];
      const coIdx = i % companyIds.length;
      const coName = f.companies[coIdx][0];
      const [c] = await conn.query('INSERT INTO contacts SET ?', [{
        firm_id: firmId, company_id: companyIds[coIdx], first_name: first, last_name: last,
        email: `${slug(first)}.${slug(last)}@${slug(coName)}.example`, phone: `${f.phone} ${6000 + i * 53}`,
        mobile: i % 3 === 0 ? `${f.phone} 9${100 + i * 7}` : null, job_title: JOB_TITLES[i % JOB_TITLES.length],
        lifecycle_stage: LIFECYCLE[i % LIFECYCLE.length], city: f.cities[i % f.cities.length], country_code: f.country,
        notes: i % 4 === 0 ? 'Prefers email. Key decision-maker.' : null, owner_id: owner(i),
      }]);
      contactIds.push(c.insertId);
    }

    // Leads (12)
    for (let i = 0; i < 12; i++) {
      const first = f.first[14 - i]; const last = f.last[(i + 5) % 15];
      const company = `${f.cities[i % f.cities.length]} ${['Traders', 'Systems', 'Ventures', 'Partners', 'Holdings', 'Enterprises'][i % 6]}`;
      const cur = i % 4 === 3 ? f.altCurrencies[0] : f.currency;
      await conn.query('INSERT INTO leads SET ?', [{
        firm_id: firmId, first_name: first, last_name: last, email: `${slug(first)}@${slug(company)}.example`,
        phone: `${f.phone} ${7000 + i * 41}`, company_name: company, job_title: JOB_TITLES[(i + 3) % JOB_TITLES.length],
        source: SOURCES[i % SOURCES.length], status: LEAD_STATUSES[i], score: [35, 62, 48, 80, 91, 70, 15, 40, 55, 85, 22, 66][i],
        estimated_value: roundNice([12000, 30000, 8000, 55000, 24000, 90000, 5000, 16000, 40000, 70000, 11000, 26000][i] * latest[cur]),
        currency_code: cur, country_code: f.country, owner_id: owner(i + 1),
        notes: i % 3 === 0 ? `Came in via ${SOURCES[i % SOURCES.length].replace(/_/g, ' ')}; interested in a demo.` : null,
      }]);
    }

    // Deals (12)
    const dealIds = [];
    for (let i = 0; i < 12; i++) {
      const st = stageIds[DEAL_STAGE_IDX[i]];
      const cur = i % 4 === 1 ? f.altCurrencies[i % 8 === 1 ? 0 : 1] : f.currency;
      const coIdx = i % companyIds.length;
      const closed = st.won || st.lost;
      const [d] = await conn.query('INSERT INTO deals SET ?', [{
        firm_id: firmId, name: `${f.companies[coIdx][0]} - ${DEAL_PRODUCTS[i]}`, company_id: companyIds[coIdx],
        contact_id: contactIds[i % contactIds.length], stage_id: st.id, amount: roundNice(DEAL_USD[i] * latest[cur]), currency_code: cur,
        probability: st.prob, status: st.won ? 'won' : st.lost ? 'lost' : 'open',
        expected_close_date: sqlDateTime(addDays(closed ? -10 - i : 7 + i * 6)).slice(0, 10),
        closed_at: closed ? sqlDateTime(addDays(-10 - i)) : null,
        description: `${DEAL_PRODUCTS[i]} for ${f.companies[coIdx][0]}.`, owner_id: owner(i),
      }]);
      dealIds.push(d.insertId);
    }

    // Tasks (14)
    for (let i = 0; i < TASK_TEMPLATES.length; i++) {
      const [type, tpl] = TASK_TEMPLATES[i];
      const ci = i % contactIds.length;
      const coName = f.companies[ci % companyIds.length][0];
      const status = TASK_STATUS[i];
      await conn.query('INSERT INTO tasks SET ?', [{
        firm_id: firmId, title: tpl.replace('{c}', `${f.first[ci]} ${f.last[ci]}`).replace('{co}', coName),
        description: i % 2 === 0 ? 'Agenda: requirements, timeline, budget, next steps.' : null,
        type, priority: PRIORITY[i % 3], status, due_date: sqlDateTime(addDays(TASK_DUE[i], 9 + (i % 6))),
        completed_at: status === 'done' ? sqlDateTime(addDays(TASK_DUE[i] + 1)) : null,
        assigned_to: owner(i), contact_id: contactIds[ci], deal_id: i < dealIds.length ? dealIds[i] : null,
        created_by: i % 2 === 0 ? userIds.manager[0] : owner(i),
      }]);
    }
    log(`Seeded firm "${f.name}" (${f.country}/${f.currency})`);
  }

  // Global help text
  for (const [key, title, body] of helpSeed) {
    await conn.query('INSERT IGNORE INTO help_text (firm_id, section_key, title, body, updated_by) VALUES (0,?,?,?,?)', [key, title, body, sa.insertId]);
  }
  // A firm-specific override to demonstrate the feature (Northwind = firm 1)
  const [[nw]] = await conn.query('SELECT id FROM firms WHERE name = ?', ['Northwind Traders Ltd']);
  const [[nwAdmin]] = await conn.query("SELECT id FROM users WHERE email = 'admin@northwind.example'");
  await conn.query('INSERT IGNORE INTO help_text (firm_id, section_key, title, body, updated_by) VALUES (?,?,?,?,?)', [nw.id, 'deals',
    'Deals (Northwind playbook)',
    'Northwind rule: every deal over £50,000 needs a Manager review before moving to Negotiation. Use the Board to drag deals between stages. Amounts in EUR/USD are converted to GBP automatically.\n\n(This is a firm-specific override of the global help text, edited by the Firm Admin.)',
    nwAdmin.id]);
  log(`Seeded ${helpSeed.length} help text entries.`);
  return true;
}

// Keep help text complete on existing databases (adds any new keys without touching edited ones)
async function syncHelp(conn) {
  const [[sa]] = await conn.query("SELECT id FROM users WHERE role = 'super_admin' ORDER BY id LIMIT 1");
  for (const [key, title, body] of helpSeed) {
    await conn.query('INSERT IGNORE INTO help_text (firm_id, section_key, title, body, updated_by) VALUES (0,?,?,?,?)', [key, title, body, sa ? sa.id : null]);
  }
}

module.exports = { seed, syncHelp, SUPER_ADMIN, DEMO_PASSWORD, FIRMS };

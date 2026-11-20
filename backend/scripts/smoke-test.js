// End-to-end API smoke test: logins, role enforcement, tenant isolation, currency conversion,
// pipeline rules, lead conversion and help text. Run with the API running:  npm run test:api
const BASE = process.env.API_URL || 'http://localhost:4000/api';
let pass = 0, fail = 0;
const results = [];

function check(name, cond, detail = '') {
  if (cond) { pass++; results.push(`  PASS  ${name}`); } else { fail++; results.push(`  FAIL  ${name} ${detail}`); }
}

async function call(path, { token, firm, method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (firm) headers['X-Firm-Id'] = String(firm);
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

async function login(email, password) {
  const r = await call('/auth/login', { method: 'POST', body: { email, password } });
  check(`login ${email}`, r.status === 200 && r.data.token, `status=${r.status}`);
  return r.data || {};
}

(async () => {
  const h = await call('/health');
  check('health endpoint', h.status === 200 && h.data.ok, JSON.stringify(h.data));

  const bad = await call('/auth/login', { method: 'POST', body: { email: 'admin@northwind.example', password: 'wrong' } });
  check('wrong password rejected (401)', bad.status === 401);
  check('no token rejected (401)', (await call('/contacts')).status === 401);

  const sa = await login('superadmin@nclc-crm.example', 'Super@123');
  const fa = await login('admin@northwind.example', 'Demo@123');
  const mg = await login('manager@sahyadri.example', 'Demo@123');
  const tu = await login('sales1@lakeshore.example', 'Demo@123');
  await login('sales2@marinabay.example', 'Demo@123');

  // ---- Super Admin
  const firms = await call('/firms', { token: sa.token });
  check('SA lists firms (>=3)', firms.status === 200 && firms.data.data.length >= 3, `n=${firms.data?.data?.length}`);
  const currencies = new Set(firms.data.data.map((f) => f.base_currency));
  check('firms use different base currencies', currencies.size >= 3, [...currencies].join(','));
  const nw = firms.data.data.find((f) => f.name.startsWith('Northwind'));
  const sh = firms.data.data.find((f) => f.name.startsWith('Sahyadri'));
  check('SA needs firm context for module data (400)', (await call('/contacts', { token: sa.token })).status === 400);
  const saContacts = await call('/contacts', { token: sa.token, firm: sh.id });
  check('SA reads a firm with X-Firm-Id', saContacts.status === 200 && saContacts.data.total >= 10);

  // ---- Seed volume per module (Firm Admin view)
  for (const m of ['contacts', 'companies', 'leads', 'deals', 'tasks']) {
    const r = await call(`/${m}`, { token: fa.token });
    check(`seed: ${m} has 10+ rows`, r.status === 200 && r.data.total >= 10, `total=${r.data?.total}`);
  }
  const users = await call('/users', { token: fa.token });
  const roles = new Set(users.data.data.map((u) => u.role));
  check('firm has users at firm_admin/manager/team_user', ['firm_admin', 'manager', 'team_user'].every((r) => roles.has(r)));

  // ---- Firm suspension blocks sign-in (then restore)
  const mb = firms.data.data.find((f) => f.name.startsWith('Marina'));
  await call(`/firms/${mb.id}`, { token: sa.token, method: 'PUT', body: { status: 'suspended' } });
  check('suspended firm user cannot sign in (403)', (await call('/auth/login', { method: 'POST', body: { email: 'sales2@marinabay.example', password: 'Demo@123' } })).status === 403);
  await call(`/firms/${mb.id}`, { token: sa.token, method: 'PUT', body: { status: 'active' } });
  check('re-activated firm user can sign in', (await call('/auth/login', { method: 'POST', body: { email: 'sales2@marinabay.example', password: 'Demo@123' } })).status === 200);

  // ---- Tenant isolation
  const shContact = saContacts.data.data[0];
  check('FA cannot read another firm\'s contact (404)', (await call(`/contacts/${shContact.id}`, { token: fa.token })).status === 404);
  check('FA cannot update another firm\'s contact', (await call(`/contacts/${shContact.id}`, { token: fa.token, method: 'PUT', body: { first_name: 'Hacked' } })).status === 404);
  check('FA X-Firm-Id header is ignored', (await call('/contacts', { token: fa.token, firm: sh.id })).data.data.every((c) => !c.email || !c.email.includes('sahyadri')));
  const nwCompany = (await call('/companies', { token: fa.token })).data.data[0];
  const cross = await call('/contacts', { token: mg.token, method: 'POST', body: { first_name: 'X', last_name: 'Y', company_id: nwCompany.id } });
  check('cannot link a record to another firm\'s company (400)', cross.status === 400, `status=${cross.status}`);

  // ---- Role enforcement
  check('FA cannot manage firms (403)', (await call('/firms', { token: fa.token })).status === 403);
  check('Manager cannot manage users (403)', (await call('/users', { token: mg.token })).status === 403);
  check('Team user cannot manage users (403)', (await call('/users', { token: tu.token })).status === 403);
  check('Team user cannot add exchange rates (403)', (await call('/ref/exchange-rates', { token: tu.token, method: 'POST', body: { currency_code: 'EUR', rate_per_usd: 1 } })).status === 403);
  const tuLeads = await call('/leads', { token: tu.token, firm: 999 });
  check('Team user sees only own leads', tuLeads.data.data.length > 0 && tuLeads.data.data.every((l) => l.owner_id === tu.user.id));
  const tuDeals = await call('/deals', { token: tu.token });
  check('Team user sees only own deals', tuDeals.data.data.every((d) => d.owner_id === tu.user.id));
  const tuContacts = await call('/contacts', { token: tu.token });
  check('Team user cannot delete contacts (403)', (await call(`/contacts/${tuContacts.data.data[0].id}`, { token: tu.token, method: 'DELETE' })).status === 403);
  const otherUser = (await call('/users/lookup', { token: tu.token })).data.find((u) => u.id !== tu.user.id);
  const assign = await call('/tasks', { token: tu.token, method: 'POST', body: { title: 'x', assigned_to: otherUser.id } });
  check('Team user cannot assign tasks to others (403)', assign.status === 403);
  check('FA cannot create a super admin (403)', (await call('/users', { token: fa.token, method: 'POST', body: { name: 'x', email: 'x@x.example', role: 'super_admin', password: 'Password1' } })).status === 403);

  // ---- CRUD as Manager
  const created = await call('/contacts', { token: mg.token, method: 'POST', body: { first_name: 'Smoke', last_name: 'Test', email: 'smoke@test.example' } });
  check('Manager creates contact', created.status === 201 && created.data.owner_id === mg.user.id);
  const upd = await call(`/contacts/${created.data.id}`, { token: mg.token, method: 'PUT', body: { job_title: 'QA' } });
  check('Manager updates contact', upd.status === 200 && upd.data.job_title === 'QA');
  check('Manager deletes contact', (await call(`/contacts/${created.data.id}`, { token: mg.token, method: 'DELETE' })).status === 200);
  check('required field validation (400)', (await call('/contacts', { token: mg.token, method: 'POST', body: { first_name: 'A' } })).status === 400);

  // ---- Currency conversion (Northwind = GBP, has EUR/USD deals)
  const nwDeals = (await call('/deals', { token: fa.token, pageSize: 100 })).data.data;
  const foreign = nwDeals.find((d) => d.currency_code !== 'GBP');
  check('foreign-currency deal exists', !!foreign);
  if (foreign) {
    const rates = Object.fromEntries((await call('/ref/currencies', { token: fa.token })).data.map((c) => [c.code, Number(c.rate_per_usd)]));
    const expect = Math.round(foreign.amount * (rates.GBP / rates[foreign.currency_code]) * 100) / 100;
    check(`deal ${foreign.currency_code}->GBP conversion`, Math.abs(foreign.amount_base - expect) < 0.02 && foreign.base_currency === 'GBP', `${foreign.amount_base} vs ${expect}`);
  }

  // ---- Pipeline rules
  const stages = (await call('/firm/stages', { token: mg.token })).data;
  const newDeal = await call('/deals', { token: mg.token, method: 'POST', body: { name: 'Smoke deal', amount: 1000, currency_code: 'USD' } });
  check('deal defaults to first stage + its probability', newDeal.status === 201 && newDeal.data.stage_id === stages[0].id && newDeal.data.probability === stages[0].probability);
  const won = stages.find((s) => s.is_won);
  const moved = await call(`/deals/${newDeal.data.id}`, { token: mg.token, method: 'PUT', body: { stage_id: won.id } });
  check('moving to Closed Won sets status=won, probability=100', moved.data.status === 'won' && moved.data.probability === 100);
  check('deal amount_base in INR', moved.data.base_currency === 'INR' && moved.data.amount_base > 1000);
  const board = await call('/deals/board', { token: mg.token });
  check('board returns all stages', board.status === 200 && board.data.stages.length === stages.length);
  await call(`/deals/${newDeal.data.id}`, { token: mg.token, method: 'DELETE' });

  // ---- Lead conversion
  const lead = await call('/leads', { token: mg.token, method: 'POST', body: { first_name: 'Conv', last_name: 'Lead', company_name: 'Smoke Convert Co', estimated_value: 5000 } });
  check('setting status=converted directly is blocked (400)', (await call(`/leads/${lead.data.id}`, { token: mg.token, method: 'PUT', body: { status: 'converted' } })).status === 400);
  const conv = await call(`/leads/${lead.data.id}/convert`, { token: mg.token, method: 'POST', body: { create_deal: true } });
  check('lead converts to company + contact + deal', conv.status === 200 && conv.data.contact_id && conv.data.company_id && conv.data.deal_id);
  check('converted lead cannot be converted again', (await call(`/leads/${lead.data.id}/convert`, { token: mg.token, method: 'POST', body: {} })).status === 400);
  await call(`/deals/${conv.data.deal_id}`, { token: mg.token, method: 'DELETE' });
  await call(`/contacts/${conv.data.contact_id}`, { token: mg.token, method: 'DELETE' });
  await call(`/companies/${conv.data.company_id}`, { token: mg.token, method: 'DELETE' });
  await call(`/leads/${lead.data.id}`, { token: mg.token, method: 'DELETE' });

  // ---- Dashboard
  for (const [name, u] of [['FA', fa], ['MG', mg], ['TU', tu]]) {
    const d = await call('/dashboard', { token: u.token });
    check(`dashboard (${name})`, d.status === 200 && d.data.by_stage.length === 6 && d.data.firm.base_currency);
  }
  check('dashboard (SA with firm)', (await call('/dashboard', { token: sa.token, firm: nw.id })).status === 200);

  // ---- Help text
  const pub = await call('/help/public');
  check('public help available (login page)', pub.status === 200 && pub.data.login);
  const help = await call('/help', { token: fa.token });
  check('help has 30+ sections', Object.keys(help.data).length >= 30, `n=${Object.keys(help.data).length}`);
  check('Northwind sees its firm override for "deals"', help.data.deals?.scope === 'firm');
  const shHelp = await call('/help', { token: mg.token });
  check('other firms see the global "deals" help', shHelp.data.deals?.scope === 'global');
  check('Manager cannot edit help (403)', (await call('/help/contacts', { token: mg.token, method: 'PUT', body: { title: 'x', body: 'y' } })).status === 403);
  check('Team user cannot edit help (403)', (await call('/help/contacts', { token: tu.token, method: 'PUT', body: { title: 'x', body: 'y' } })).status === 403);
  const faEdit = await call('/help/tasks', { token: fa.token, method: 'PUT', body: { title: 'Tasks (NW)', body: 'Smoke override' } });
  check('Firm Admin saves a firm override', faEdit.status === 200 && faEdit.data.scope === 'firm' && faEdit.data.updated_by_name === fa.user.name);
  check('override does not leak to other firms', (await call('/help', { token: mg.token })).data.tasks.title !== 'Tasks (NW)');
  await call('/help/tasks', { token: fa.token, method: 'DELETE' });
  check('reset restores global text', (await call('/help', { token: fa.token })).data.tasks.scope === 'global');
  const orig = pub.data['admin.help'];
  const saEdit = await call('/help/admin.help', { token: sa.token, method: 'PUT', body: { title: orig.title, body: orig.body } });
  check('Super Admin edits global help', saEdit.status === 200 && saEdit.data.scope === 'global');

  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

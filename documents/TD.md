# NCLC CRM — Technical & Functional Design (TD)

> **Document:** TD v1.0 · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30) · **Related:** [TRD](TRD.md), [API Reference](API_Reference.md), [ER Diagram](ER_Diagram.md)

## 1. Architecture
```
Browser (React SPA, :5173)
   │  fetch /api/*  (Authorization: Bearer <JWT>, X-Firm-Id for Super Admin)
   ▼
Vite dev proxy ──► Express API (:4000)
                     ├─ authenticate  (JWT → reload user → resolve req.firmId)
                     ├─ requireRole / requireFirm
                     ├─ routes: auth, help, dashboard, contacts, companies, leads, deals, tasks,
                     │          users, firms, firm (settings + stages), ref (countries/currencies/rates)
                     └─ mysql2 pool (session time_zone = UTC)
                              ▼
                        MySQL 8 · nclc_crm
```

### 1.1 Source layout
```
nclc-crm/
├─ .env.example / .env          configuration (never commit .env)
├─ backend/
│  ├─ db/schema.sql             DDL (copied to documents/create_tables.sql)
│  ├─ db/seed.js, helpSeed.js   demo data + default help text
│  ├─ scripts/init-db.js        create/seed (idempotent) · --reset rebuilds
│  ├─ scripts/smoke-test.js     60-check API regression test
│  └─ src/
│     ├─ server.js              Express app, route mounting, error handler
│     ├─ config.js, db.js       .env loading, MySQL pool
│     ├─ utils.js               HttpError, async wrapper, ROLES, pick()
│     ├─ middleware/auth.js     authenticate, requireRole, requireFirm
│     ├─ services/currency.js   latest rates, convert(), getFirm()
│     └─ routes/                crudFactory.js, modules.js, admin.js, auth.js, help.js, dashboard.js, reference.js
├─ frontend/src/
│  ├─ api.js, auth.jsx, help.jsx, lookups.js, format.js
│  ├─ components/               Layout, Modal, EntityPage (generic list + form)
│  └─ pages/                    Dashboard, Contacts, Companies, Leads, Deals, Tasks, Login, admin/*
├─ scripts/start.ps1, stop.ps1  start/stop both servers
└─ documents/                   this documentation set
```

## 2. Multi-tenancy design
- **Model:** shared database and shared schema, with a `firm_id` discriminator on every business table (`companies, contacts, leads, deals, tasks, pipeline_stages, users`). `help_text.firm_id` uses `0` for global rows.
- **Context resolution** (`middleware/auth.js`):
  - Firm users: `req.firmId = users.firm_id` (from the DB, never from the client).
  - Super Admin: `req.firmId = X-Firm-Id` header (validated to exist). It is `null` when absent, and module routes then return `400 Select a firm first`.
- **Enforcement:** `crudFactory` adds `t.firm_id = ?` to every SELECT/UPDATE/DELETE and sets `firm_id` on INSERT. `checkRefs()` verifies that any `company_id, contact_id, deal_id, stage_id, owner_id, assigned_to` belongs to the same firm, which stops cross-tenant linking.
- **Cascade:** deleting a firm cascades to all its data via FKs. The UI only *suspends* firms; it never deletes them.

## 3. Role-based access control (RBAC)
| Capability | Super Admin | Firm Admin | Manager | Team User |
|---|:-:|:-:|:-:|:-:|
| Manage firms (create, edit, suspend) | ✔ | — | — | — |
| Switch into any firm | ✔ | — | — | — |
| Manage users | ✔ all | ✔ own firm (not SA) | — | — |
| Firm settings & pipeline stages | ✔ | ✔ | — | — |
| Add currencies / exchange rates | ✔ | — | — | — |
| View currencies & rates | ✔ | ✔ | ✔ | ✔ |
| Edit help text | ✔ global or firm | ✔ firm override | — | — |
| Contacts / Companies: view, create, edit | ✔ | ✔ | ✔ | ✔ |
| Contacts / Companies: delete | ✔ | ✔ | ✔ | — |
| Leads / Deals: scope | firm | firm | firm | **own only** (`owner_id = me`) |
| Tasks: scope | firm | firm | firm | **assigned to me or created by me** |
| Assign/reassign owner or assignee to others | ✔ | ✔ | ✔ | — (403) |
| Convert lead | ✔ | ✔ | ✔ | ✔ (own leads) |
| Dashboard scope | selected firm | firm | firm | own leads/deals/tasks |

Implementation points: `requireRole()` on users/firms/rates/help writes; `teamScope` and the owner checks in `crudFactory`; `deleteRoles` per module.

## 4. Business logic

### 4.1 Currency conversion
- `exchange_rates.rate_per_usd` = units of the currency per 1 USD (USD = 1). History is kept per `effective_date`.
- `getLatestRates()` takes the row with the max `effective_date` per currency.
- `convert(amount, from, to) = round2(amount × rate[to] / rate[from])`. It returns `null` if either rate is missing.
- The API adds `<field>_base` and `base_currency` to deals (`amount_base`, `weighted_base`), leads (`estimated_value_base`) and companies (`annual_revenue_base`).
- The dashboard converts every deal to the firm base currency before aggregating.
- Changing a firm's base currency changes only how amounts are displayed and summed. Stored deal amounts and currencies never change.

### 4.2 Deals and pipeline
- Each firm has its own `pipeline_stages`. The six defaults are created with the firm: Prospecting 10, Qualification 25, Proposal 50, Negotiation 75, Closed Won 100 (`is_won`), Closed Lost 0 (`is_lost`).
- **Create:** the default currency is the firm base and the default stage is the first stage. Probability is the stage default unless the user gives one.
- **Stage change:** probability resets to the stage default unless the user changed probability in the same request. A won or lost stage always forces 100 or 0. `status` = won/lost/open, and `closed_at` is set when closing and cleared when reopening.
- Weighted value = `amount_base × probability / 100`.
- **Board:** `GET /deals/board` returns stages with their deals and `total_base`. Drag and drop calls `PUT /deals/:id {stage_id}`.

### 4.3 Leads
- Statuses: new → contacted → qualified / unqualified → converted.
- `converted` can only be set by `POST /leads/:id/convert`, which runs in one transaction:
  1. If `company_name` is set, find a company with that name in the firm or create one.
  2. Create a contact (lifecycle `opportunity`) with the lead's details and owner.
  3. Optionally create a deal (default name `<company> - New deal`, amount = estimated value, chosen stage, `lead_id` link).
  4. Mark the lead `converted` and store the converted ids and `converted_at`.
- A converted lead can't be converted again or have its status changed.
- Score is clamped to 0–100.

### 4.4 Tasks
- Type: call/email/meeting/todo. Priority: low/medium/high. Status: open/in_progress/done.
- Setting `done` stamps `completed_at`. Moving away from `done` clears it.
- Overdue = `status <> 'done' AND due_date < NOW()` (UTC). Filters: `due=overdue|today|week`, `open=1`.
- Default sort: open tasks first, then soonest due.

### 4.5 Ownership rules
- On create, the owner/assignee defaults to the creator (Super Admin: none).
- A Team User can't set an owner/assignee other than themselves. On update they may leave an existing owner unchanged.
- Owner/assignee must be an **active** user of the same firm.

### 4.6 Help text
- `GET /api/help` returns a map `section_key → {title, body, scope, updated_by_name, updated_at}`, where firm rows override global rows.
- `GET /api/help/public` returns global rows only, for the login page.
- `PUT /api/help/:key`: a Firm Admin writes `firm_id = own firm`. The Super Admin writes `firm_id = 0` (global), or the selected firm's override when `scope = "firm"`. It upserts on `(firm_id, section_key)` and stamps `updated_by`/`updated_at`.
- `DELETE /api/help/:key` removes a firm override, so the firm falls back to global.
- UI: `<HelpIcon k="...">` renders the "?" button and popover. Editors see **Edit**, which opens `HelpEditor`. Admin › Help text lists all sections.
- 41 section keys cover every page header, dashboard card and form field group (see [Tables Used](Tables_Used.md#help_text)).

### 4.7 Authentication flow
1. `POST /auth/login`: bcrypt compare, then check that the user is active and the firm is active (unless Super Admin). Updates `last_login_at` and returns `{token, user, firm}`.
2. The SPA stores the token in `localStorage` (`nclc_token`) and the Super Admin's selected firm in `nclc_firm`.
3. Every request re-validates the token and reloads the user. Any 401 logs the user out on the client.

## 5. Frontend design
- `AuthProvider` holds the user, the current firm and (Super Admin only) the firm list. It sets the number/date locale from the firm country (`en-GB`, `en-IN`, ...).
- `HelpProvider` loads help once per firm.
- `EntityPage` is a generic list (search, filters, paging, row click to edit) with an `EntityForm` modal. The form groups (fieldsets), each with its own help key, are passed in by each page.
- The Deals page has a Board/List toggle (the choice is remembered per browser). Leads has a **Convert** row action. Tasks has a done checkbox and overdue highlighting.
- The Dashboard has KPI tiles, single-series bar lists (one sequential hue, hover tooltips), upcoming tasks and recent deals.

## 6. Error handling
`HttpError(status, message)` → JSON `{error}`. MySQL `ER_DUP_ENTRY` → 409. A referenced or invalid FK → 400 or 409. Anything else → 500 "Internal server error" (logged).

## 7. Known limitations / future work
- No audit log or record history; no attachments; no email integration.
- "Due today" uses the UTC date.
- Exchange rates are manual; a scheduled import from a rates API could be added.
- Pipeline stages can be renamed and re-weighted, but not added or removed, in v1.

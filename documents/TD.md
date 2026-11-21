# NCLC CRM — Technical & Functional Design (TD)

> **Document:** TD v1.1 · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30) · **Related:** [TRD](TRD.md), [API Reference](API_Reference.md), [ER Diagram](ER_Diagram.md), [Data Relationships](Data_Relationships.md), [AI Agents](AI_Agents.md)

## 1. Architecture
```
Browser (React SPA, :5173)
   │  fetch /api/*  (Authorization: Bearer <JWT>, X-Firm-Id for Super Admin)
   ▼
Vite dev proxy ──► Express API (:4000)
                     ├─ authenticate  (JWT → reload user → resolve req.firmId)
                     ├─ requireRole / requireFirm
                     ├─ routes: auth, help, dashboard, contacts, companies, leads, deals, tasks,
                     │          users, firms, firm (settings + stages), ref (countries/currencies/rates),
                     │          lookups (dropdown values), ai (keys/task types/usage), agents   ← v1.1
                     ├─ services/llmRouter ──► providers (OpenAI, Anthropic SDK, Gemini, OpenRouter, Groq, mock)
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
│  ├─ db/seedAi.js, seedLookups.js  AI task types + fake keys; dropdown lists/values (v1.1)
│  ├─ db/migrate.js             idempotent ALTERs for existing databases (v1.1)
│  ├─ scripts/init-db.js        create/migrate/seed (idempotent) · --reset rebuilds
│  ├─ scripts/smoke-test.js     130-check API regression test
│  ├─ scripts/inspect-db.js     schema + integrity report; export-sql.js (backup SQL); sync-sql-doc.js
│  └─ src/
│     ├─ server.js              Express app, route mounting, error handler
│     ├─ config.js, db.js       .env loading, MySQL pool
│     ├─ utils.js               HttpError, async wrapper, ROLES, pick()
│     ├─ middleware/auth.js     authenticate, requireRole, requireFirm
│     ├─ services/currency.js   latest rates, convert(), getFirm()
│     ├─ services/secrets.js, providers.js, llmRouter.js, agents.js, lookups.js   (v1.1)
│     └─ routes/                crudFactory.js, modules.js, admin.js, auth.js, help.js, dashboard.js, reference.js,
│                               lookups.js, aiKeys.js, agents.js (v1.1)
├─ frontend/src/
│  ├─ api.js, auth.jsx, help.jsx, lookups.js, dropdowns.js (v1.1), format.js
│  ├─ components/               Layout, Modal, EntityPage (generic list + form), Agents (v1.1)
│  └─ pages/                    Dashboard, Contacts, Companies, Leads, Deals, Tasks, AgentRuns, Login, admin/*, settings/*
├─ scripts/start.ps1, stop.ps1  start/stop both servers
├─ scripts/setup.ps1, setup.sh, backup.ps1   developer setup and backup (v1.1)
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
| Settings › API Keys (v1.1) | ✔ platform + firm | ✔ own firm | — | — |
| AI task types (v1.1) | ✔ | view | — | — |
| Settings › Dropdown values (v1.1) | ✔ global + firm | ✔ own firm (not `firm_status`) | — | — |
| Run AI agents (v1.1) | ✔ | ✔ | ✔ | ✔ on own records |
| Approve/reject agent runs (v1.1) | ✔ | ✔ | ✔ | own runs |

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
- Statuses (lookup list `lead_status`): new → contacted → qualified / unqualified → converted, plus any firm-defined statuses. "Open" means not `unqualified` and not `converted`.
- `converted` can only be set by `POST /leads/:id/convert`, which runs in one transaction:
  1. If `company_name` is set, find a company with that name in the firm or create one.
  2. Create a contact (lifecycle `opportunity`) with the lead's details and owner.
  3. Optionally create a deal (default name `<company> - New deal`, amount = estimated value, chosen stage, `lead_id` link).
  4. Mark the lead `converted` and store the converted ids and `converted_at`.
- A converted lead can't be converted again or have its status changed.
- Score is clamped to 0–100.

### 4.4 Tasks
- Type, priority and status come from lookup lists `task_type`, `task_priority` and `task_status`. Defaults: call/email/meeting/todo, high/medium/low, open/in_progress/done. Firms can add values. `done` and `open` are system values.
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
- 55 section keys cover every page header, dashboard card, form field group and Settings page (see [Tables Used](Tables_Used.md#help_text)).

### 4.8 Dropdown values (v1.1)
- **Data:** `lookup_lists` (one row per dropdown) and `lookup_values` (`firm_id 0` = global default; firm rows override label/order/active by `code`, or add firm-only codes).
- **Effective list for a firm** (`services/lookups.getValues`): global rows merged with that firm's rows, sorted by `sort_order`, then label. Each value reports `scope` = global / override / firm_only.
- **Validation** (`assertValues`, wired through `crudRouter({ lookups: { column: list } })` and the firm routes): a new or changed value must be an *active* code for the firm. An unchanged value is accepted even if deactivated. Empty → NULL.
- **Rules:**
  - `is_system` values (defaults and codes the program uses: `new`, `unqualified`, `converted`, `lead`, `opportunity`, `email`, `todo`, `medium`, `open`, `done`, deal and firm statuses) can be relabelled and reordered but not deactivated or deleted.
  - Lists with `allow_custom = 0` (deal_status, firm_status) accept no new codes.
  - `firm_editable = 0` (firm_status) is Super Admin only.
  - A value in use can't be deleted (409); deactivate it instead.
  - **Role names are deliberately not a lookup**, because permissions depend on them.
- **Frontend:** `useDropdowns()` loads `GET /api/lookups` once per firm (cached; refreshed after edits). `options(list, current)` returns active values plus the record's current value (marked "inactive" if needed), and `label(list, code)` renders pills and columns.

### 4.9 AI keys and routing (v1.1)
- **Storage:** `api_keys.key_enc` = AES-256-GCM (`v1:iv:tag:ciphertext`, key = `APP_ENC_KEY`, 32 bytes hex). Only `key_last4` is ever returned. `secrets.redact()` strips known keys and key-like patterns from every stored or logged message.
- **`llmRouter.callLLM(taskType, payload, ctx)`:**
  1. Load active keys for the task type: the firm's keys, then platform keys (`firm_id NULL`). Within each group, the primary key first, then `priority` ascending.
  2. Call the provider adapter (timeout `LLM_TIMEOUT_MS`).
  3. On HTTP 429/402/401/403 (or a 400 that mentions quota or an invalid key), set the key `exhausted` with `exhausted_at`, log `exhausted` and `switch`, and try the next key. Other errors log `failure` and try the next key. Fatal errors, such as a model refusal, stop immediately.
  4. On success, update the counters and log `success`. If every key fails, log `all_failed` and return 502 with `attempts[]`. With no keys at all, return 503.
- **Reset:** an exhausted key becomes active again after `ai_task_types.reset_minutes`. This is checked lazily on each call and by a sweep every `AI_KEY_RESET_SWEEP_MINUTES`. Manual reset and "reset all" are also available.
- **Adapters:** OpenAI-compatible (OpenAI, OpenRouter, Groq), Gemini, Anthropic (official SDK, SDK retries off so the router sees 429s), and `mock` (offline; key text such as `fail-429` simulates errors for demos and tests).

### 4.10 AI agents (v1.1)
- **Run:**
  1. `runAgent` checks access to the lead or deal (the same scope rules as the module).
  2. It builds a minimal input; lead scoring sends no names or emails.
  3. It calls `callLLM('text')`, parses and validates the JSON, and stores an `agent_runs` row with status `pending_approval`. The row holds `output_json`, `proposed_changes` (`update` / `append` / `insert` operations) and `attempts_json`.
  4. **Nothing is written to CRM tables at this point.**
- **Approve** (creator, Manager, Firm Admin or Super Admin): accepts optional edits to the editable fields, re-checks access, applies the changes in one transaction, and records `reviewed_by`, `reviewed_at` and `applied_result`. **Reject** writes nothing.
- **What each agent changes:**
  - `lead_scoring` updates `leads.score`.
  - `followup_email` inserts an *Email* task due tomorrow at 09:00 UTC, assigned to the approver. The email is not sent.
  - `deal_summary` appends a dated, signed note to `deals.description`.

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
- Pipeline stages can be renamed and re-weighted, but not added or removed (still true in v1.1; stages are already table-driven per firm).
- AI agents have been tested with the offline mock provider. Real providers need a real key entered in Settings › API Keys.

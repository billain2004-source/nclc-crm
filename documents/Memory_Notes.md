# NCLC CRM — Memory Notes

> **Document:** Memory Notes v1.1 · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30)

Working notes for whoever picks up this project next: decisions, gotchas and the current state.

## Current state (after Part B, 2026-11-21 14:16 IST)
- Part A (6 stages) and Part B (5 stages + final) delivered. Servers are started with `scripts\start.ps1`: app :5173, API :4000. They run as background node processes and stop when the machine restarts. Run `start.ps1` again after a reboot.
- DB `nclc_crm`: 18 tables, 50 FKs. Seeded with 4 firms, 17 users, 48 companies, 60 contacts, 48 leads, 48 deals, 56 tasks, 55 help entries, 4 AI task types, fake mock API keys only, 9 dropdown lists / 49 values.
- `npm run test:api`: 130/130. Code on GitHub: `billain2004-source/nclc-crm` (`main`).
- Demo logins are in [User_Manual.md](User_Manual.md) §2. Setup from scratch: [Setup_Guide.md](Setup_Guide.md).

## Part B decisions
| Decision | Why |
|---|---|
| One `llmRouter.callLLM(taskType, payload, ctx)` for every AI call | Failover, logging and key handling live in one place |
| Key order: firm keys → platform keys (`firm_id NULL`); within each, primary first then `priority` ASC | Firms can bring their own keys, and the Super Admin provides a fallback |
| Exhaust on 429/402/401/403 (and 400 that mentions quota/invalid key); other errors just try the next key | Matches the brief; doesn't burn keys on transient 5xx |
| AES-256-GCM, stored as `v1:iv:tag:ciphertext`; only `key_last4` is returned; `secrets.redact()` scrubs every error message | Keys can't leak through the API, the logs or the usage log. **Losing `APP_ENC_KEY` means re-entering every key.** |
| `mock` provider (offline, simulates `fail-429` etc. from the key text) | Demo and tests work without real keys or internet |
| Anthropic adapter uses the official `@anthropic-ai/sdk` (pinned 1.12.0), default model `claude-opus-5-5`, `maxRetries: 0` | The router does its own failover; SDK retries would hide 429s |
| Agents only *propose* changes (`agent_runs.proposed_changes`); approval re-checks access and applies them in a transaction | "Everything an agent writes needs user approval first" |
| Dropdowns: `lookup_values.firm_id = 0` global + firm rows that override by `code` | Same pattern as `help_text`; UNIQUE (firm_id, list_code, code) works because 0 is not NULL |
| Records store the **code**; the UI shows the label | Renaming never breaks data, business rules key on codes |
| `is_system` values can't be deactivated; `deal_status` / `firm_status` are fixed lists (labels only); role names not in lookups | Program logic depends on them (defaults, convert, done, dashboard, permissions) |
| `deals.status` and `firms.status` stay ENUM; `leads.status`, `tasks.type/priority/status` became VARCHAR | Only lists that allow custom values needed to change type |
| Schema changes for existing DBs go in `backend/db/migrate.js` STEPS (checked against `information_schema`) | `schema.sql` is `CREATE TABLE IF NOT EXISTS`, so ALTERs need a separate, idempotent path |

## Key decisions
| Decision | Why |
|---|---|
| Shared schema with a `firm_id` discriminator | Simplest multi-tenancy for MySQL on localhost. Enforced centrally in `crudFactory.js`. |
| Super Admin picks a firm with the `X-Firm-Id` header | Keeps one code path for all module routes. The header is ignored for other roles. |
| Rates stored as "units per 1 USD" | One pivot currency, so any cross rate = rate(to)/rate(from). History by effective date. |
| `help_text.firm_id = 0` for global rows (not NULL) | Lets UNIQUE(firm_id, section_key) work for upserts. MySQL treats NULLs as distinct. |
| ~~`leads.converted_deal_id` has no FK~~ **Reversed in Part B Stage 4** | The circular-dependency worry only affects table creation order. The FK (ON DELETE SET NULL) is now added by `migrate.js` after both tables exist. Without it, deleting a converted deal left a dangling id. |
| Team User can't delete contacts or companies | Protects shared firm data. They can delete their own leads, deals and tasks. |
| Generic `EntityPage` / `crudRouter` | Five modules share one list/form/CRUD implementation, so rules stay consistent. |
| Number/date locale follows the firm's country | The browser locale (en-IN here) made UK figures show as "£3L". Firm locale is clearer. |

## Gotchas found and fixed
1. **Timezone drift (+5:30):** MySQL `CURRENT_TIMESTAMP`/`NOW()` used the server's IST session zone while the app treats values as UTC, so help "updated at" showed 5½ h ahead. **Fix:** every pooled connection and `init-db` run `SET time_zone = '+00:00'`. The DB was rebuilt with `db:reset`.
2. **Indian-locale formatting for a UK firm:** compact numbers rendered in lakh ("£3L"). **Fix:** `setFirmLocale()` in `format.js` is called from `AuthProvider`.
3. **Date-only values shifting a day:** `expected_close_date` parsed as UTC midnight could show the previous day west of UTC. **Fix:** format date-only values with `timeZone: 'UTC'`.
4. **Node not installed:** a portable Node 22.11.0 was unpacked to `C:\Users\billa\tools\node`. Scripts fall back to it when `node` isn't on PATH.

### Part B gotchas
5. **Case-insensitive collation:** while converting stored labels to codes, `WHERE source <> 'website'` treated `'Website'` as equal, so only 23 of 96 rows changed. **Fix:** compare with `BINARY` in `seedLookups.js`.
6. **Scope downgrade bug:** a Firm Admin sending `scope: "global"` to the dropdown API was silently saved as a firm override. The smoke test caught it. **Fix:** an explicit global request from a non-Super-Admin is now 403.
7. **PowerShell and background servers:** never pipe `scripts\start.ps1` output, or use `Start-Process -Wait` on it. The child node processes keep the pipe or process open and the command hangs. Start it with `Start-Process` (no `-Wait`) and poll `/api/health`.
8. **Commit messages in PowerShell 5.1:** piping a here-string into `git commit -F -` didn't work (it was treated as a pathspec). Write the message to a file and use `git commit -F <file>`. Commits carry no Co-Authored-By/attribution lines (user requirement).
9. **Portable Git:** at `C:\Users\billa\tools\git\cmd`. GitHub sign-in is cached by Git Credential Manager (`git-credential-manager github login --browser`).
10. **Vite build check:** build into a scratch folder (`vite build --outDir <tmp>`), not `frontend/dist`. The API serves `dist` when it exists, which would hide the dev server.
11. **Backups never contain key data:** `export-sql.js` skips `api_keys` and `api_key_usage_log` and nulls `agent_runs.key_id`; `backup.ps1` stops if it finds `.env` or `v1:` ciphertext. After a restore, re-enter real keys (or run `db:setup` to re-add the placeholders).

## Where things live
- Business rules: `backend/src/routes/modules.js` (deal stage/probability, lead conversion, tasks), `crudFactory.js` (tenancy, ownership, delete roles).
- Role checks: `middleware/auth.js`, `routes/admin.js`, `routes/help.js`, `routes/reference.js`.
- Help content: `backend/db/helpSeed.js` (add new keys there; `npm run db:setup` inserts missing ones without overwriting edits).
- UI help component: `frontend/src/help.jsx` (`<HelpIcon k="section.key" />`).
- AI: `backend/src/services/llmRouter.js` (routing, failover, reset sweep), `providers.js` (adapters), `secrets.js` (encryption/redaction), `agents.js` (agent definitions, approve/reject); routes `routes/aiKeys.js`, `routes/agents.js`. Add an agent: see [AI_Agents.md](AI_Agents.md).
- Dropdowns: `backend/db/seedLookups.js` (lists and default values), `src/services/lookups.js` (merge + `assertValues`), `routes/lookups.js`; frontend `src/dropdowns.js` (`useDropdowns()`), page `pages/settings/Dropdowns.jsx`. To validate a new column, add it to `lookups: { column: 'list_code' }` in its `crudRouter` config.
- DB tooling: `scripts/inspect-db.js` (structure + integrity), `scripts/export-sql.js` (backup SQL), `scripts/sync-sql-doc.js` (regenerates `documents/create_tables.sql` from `schema.sql`), `db/migrate.js`.

## Restart check log (Stage 5)
2026-11-21 01:56–01:57 IST
1. **Before:** recorded row counts for 5 modules × 4 firms (260 rows). The Firm Admin saved a marker help edit on `tasks` (Northwind).
2. **Stop:** `scripts\stop.ps1` killed both node processes. Ports 4000/5173 were no longer listening, no node processes remained, and `/api/health` was unreachable.
3. **Start:** `scripts\start.ps1` brought both servers up within a few seconds.
4. **After:** 260/260 rows identical (0 mismatches). 41 help sections present and the marker edit intact (then reset). `npm run test:api` 60/60 passed. Headless UI walkthrough for all four roles showed 0 console errors.
5. **Breakages:** none at restart. (The UTC timestamp bug was found and fixed earlier, before this check.)

Stage 6: all 17 demo logins verified at 01:57 IST against the running servers.

## Part B final check
2026-11-21 14:16 IST. `stop.ps1` closed ports 4000/5173 and `start.ps1` brought both back. `npm run test:api` passed 130/130. A headless Edge walkthrough for SA/FA/MG/TU covered every page, including Settings › API Keys and Dropdown values, with 0 console errors. All 17 logins verified at 14:18.

## Ideas / backlog
- More agents from [AI_Agents.md](AI_Agents.md) (enrichment, duplicate detection, data-quality checks).
- Real-provider integration test once a real key is available (all automated tests use the offline mock provider).
- Pipeline stages are already per firm in `pipeline_stages`; adding/removing stages from the UI is still open.
- Audit log / activity timeline per record; notes and attachments.
- Custom pipeline stages (add/remove), multiple pipelines.
- Email/calendar sync; import from CSV; reports builder.
- Live exchange-rate import; rate locking per deal at close.

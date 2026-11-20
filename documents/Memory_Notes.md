# NCLC CRM — Memory Notes

> **Document:** Memory Notes v1.0 · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30)

Working notes for whoever picks up this project next: decisions, gotchas and the current state.

## Current state
- All six stages delivered. Servers are started with `scripts\start.ps1`: app :5173, API :4000. They run as background node processes and stop when the machine restarts. Run `start.ps1` again after a reboot.
- DB `nclc_crm` seeded: 4 firms, 17 users, 48 companies, 60 contacts, 48 leads, 48 deals, 56 tasks, 41 global help entries + 1 firm override.
- Demo logins are in [User_Manual.md](User_Manual.md) §2.

## Key decisions
| Decision | Why |
|---|---|
| Shared schema with a `firm_id` discriminator | Simplest multi-tenancy for MySQL on localhost. Enforced centrally in `crudFactory.js`. |
| Super Admin picks a firm with the `X-Firm-Id` header | Keeps one code path for all module routes. The header is ignored for other roles. |
| Rates stored as "units per 1 USD" | One pivot currency, so any cross rate = rate(to)/rate(from). History by effective date. |
| `help_text.firm_id = 0` for global rows (not NULL) | Lets UNIQUE(firm_id, section_key) work for upserts. MySQL treats NULLs as distinct. |
| `leads.converted_deal_id` has no FK | `deals.lead_id → leads` already exists. A second FK would create a circular dependency. |
| Team User can't delete contacts or companies | Protects shared firm data. They can delete their own leads, deals and tasks. |
| Generic `EntityPage` / `crudRouter` | Five modules share one list/form/CRUD implementation, so rules stay consistent. |
| Number/date locale follows the firm's country | The browser locale (en-IN here) made UK figures show as "£3L". Firm locale is clearer. |

## Gotchas found and fixed
1. **Timezone drift (+5:30):** MySQL `CURRENT_TIMESTAMP`/`NOW()` used the server's IST session zone while the app treats values as UTC, so help "updated at" showed 5½ h ahead. **Fix:** every pooled connection and `init-db` run `SET time_zone = '+00:00'`. The DB was rebuilt with `db:reset`.
2. **Indian-locale formatting for a UK firm:** compact numbers rendered in lakh ("£3L"). **Fix:** `setFirmLocale()` in `format.js` is called from `AuthProvider`.
3. **Date-only values shifting a day:** `expected_close_date` parsed as UTC midnight could show the previous day west of UTC. **Fix:** format date-only values with `timeZone: 'UTC'`.
4. **Node not installed:** a portable Node 22.11.0 was unpacked to `C:\Users\billa\tools\node`. Scripts fall back to it when `node` isn't on PATH.

## Where things live
- Business rules: `backend/src/routes/modules.js` (deal stage/probability, lead conversion, tasks), `crudFactory.js` (tenancy, ownership, delete roles).
- Role checks: `middleware/auth.js`, `routes/admin.js`, `routes/help.js`, `routes/reference.js`.
- Help content: `backend/db/helpSeed.js` (add new keys there; `npm run db:setup` inserts missing ones without overwriting edits).
- UI help component: `frontend/src/help.jsx` (`<HelpIcon k="section.key" />`).

## Restart check log (Stage 5)
2026-11-21 01:56–01:57 IST
1. **Before:** recorded row counts for 5 modules × 4 firms (260 rows). The Firm Admin saved a marker help edit on `tasks` (Northwind).
2. **Stop:** `scripts\stop.ps1` killed both node processes. Ports 4000/5173 were no longer listening, no node processes remained, and `/api/health` was unreachable.
3. **Start:** `scripts\start.ps1` brought both servers up within a few seconds.
4. **After:** 260/260 rows identical (0 mismatches). 41 help sections present and the marker edit intact (then reset). `npm run test:api` 60/60 passed. Headless UI walkthrough for all four roles showed 0 console errors.
5. **Breakages:** none at restart. (The UTC timestamp bug was found and fixed earlier, before this check.)

Stage 6: all 17 demo logins verified at 01:57 IST against the running servers.

## Ideas / backlog
- Audit log / activity timeline per record; notes and attachments.
- Custom pipeline stages (add/remove), multiple pipelines.
- Email/calendar sync; import from CSV; reports builder.
- Live exchange-rate import; rate locking per deal at close.

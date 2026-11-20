# NCLC CRM — Technical Requirements Document (TRD)

> **Document:** TRD v1.0 · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30) · **Related:** [BRD](BRD.md), [TD](TD.md)

## 1. Technology stack
| Layer | Technology | Version |
|---|---|---|
| Frontend | React (single-page app), React Router | 18.3.1 / 6.28.0 |
| Build / dev server | Vite (+ @vitejs/plugin-react) | 5.4.11 |
| Backend | Node.js + Express | Node 18+ (tested on 22.11.0), Express 4.21.1 |
| Database | MySQL (InnoDB, utf8mb4) on localhost | 8.0 |
| DB driver | mysql2 (promise pool) | 3.11.4 |
| Auth | JSON Web Tokens (jsonwebtoken), bcryptjs | 9.0.2 / 2.4.3 |
| Config | dotenv (`.env` at project root) | 16.4.5 |

## 2. Technical requirements
| ID | Requirement |
|---|---|
| TR-01 | DB credentials, JWT secret, ports and CORS origin come **only** from `.env`. `.env` is git-ignored and `.env.example` is provided. |
| TR-02 | Database name `nclc_crm` (configurable via `DB_NAME`). Schema in `backend/db/schema.sql` = `documents/create_tables.sql`. |
| TR-03 | Every tenant-owned table has a `firm_id INT UNSIGNED NOT NULL` column with an index and an FK to `firms(id) ON DELETE CASCADE`. |
| TR-04 | The API resolves the firm context per request: firm users always use their own `users.firm_id`. The Super Admin passes `X-Firm-Id`. Client-supplied firm ids are ignored for non-Super-Admins. |
| TR-05 | Every CRUD query includes `firm_id = ?`. Every referenced id (company, contact, deal, stage, owner, assignee) is verified to belong to the same firm before insert/update. |
| TR-06 | Role checks are enforced in Express middleware and route logic (403 on violation). The UI hides actions as a convenience only. |
| TR-07 | Passwords are hashed with bcrypt (cost 10). Tokens are signed HS256 with an 8h default expiry. The user record is re-read on every request, so deactivation and firm suspension take effect immediately. |
| TR-08 | All SQL uses parameter placeholders. Sort columns are whitelisted. |
| TR-09 | Money is stored as `DECIMAL(16,2)` with an ISO-4217 currency code. Rates are stored as `DECIMAL(18,6)` units per USD, with history by `effective_date`. |
| TR-10 | All timestamps are stored in **UTC**: each DB session runs `SET time_zone = '+00:00'`. The browser converts to local time for display. |
| TR-11 | List endpoints page results (`page`, `pageSize` ≤ 500, default 25) and return `{data,total,page,pageSize}`. |
| TR-12 | Help text is stored in `help_text(firm_id, section_key, title, body, updated_by, updated_at)`. `firm_id = 0` is the global default, and a firm row overrides it. |
| TR-13 | DB setup is idempotent (`npm run db:setup`). A destructive rebuild needs the explicit `npm run db:reset`. |
| TR-14 | Data must persist across server restarts (MySQL). The servers hold no in-memory state except the stateless JWT. |
| TR-15 | The frontend dev server proxies `/api` to the backend, so the browser uses a single origin. CORS is limited to `CLIENT_ORIGIN`. |
| TR-16 | Responsive layout down to phone width (sidebar collapses to a top bar below 900px). |

## 3. Environments and ports
| Component | URL | Notes |
|---|---|---|
| Frontend (Vite dev) | http://localhost:5173 | Proxies `/api` → :4000 |
| Backend API | http://localhost:4000/api | Health: `/api/health` |
| MySQL | localhost:3306 | DB `nclc_crm` |
| Optional single-port mode | http://localhost:4000 | After `npm run build` in `/frontend`, Express serves `frontend/dist` |

## 4. Non-functional targets
- API p95 < 300 ms on seed volumes; list pages paged at 25 rows.
- No secrets in source control; no hardcoded passwords other than documented demo seed accounts.
- Error responses are JSON `{ "error": "message" }` with correct HTTP status codes (400/401/403/404/409/500). Internal errors are logged server-side and never leak SQL.

## 5. Constraints and assumptions
- Single MySQL instance on localhost; a shared schema with a `firm_id` discriminator (no schema-per-tenant).
- Exchange rates are maintained manually by the Super Admin (no live feed in v1). Seed rates are demo values.
- Windows was the target dev OS (PowerShell start/stop scripts), but the code is cross-platform.

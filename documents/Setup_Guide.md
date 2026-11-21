# NCLC CRM — Developer Setup Guide

> **Document:** Setup Guide v1.0 · **Last updated:** 2026-11-21 14:55 IST (UTC+05:30)

How another developer gets NCLC CRM running from the Git repository. Expect 10–15 minutes.

## 1. Prerequisites
| Tool | Version | Notes |
|---|---|---|
| Node.js | 18 or later (tested with **22.11.0**) | Includes npm. `node -v` to check. |
| MySQL Server | 8.0 | Running on `localhost:3306` with a user that can create databases. |
| Git | any recent | To clone the repository. |
| PowerShell 5.1+ (Windows) or bash (macOS/Linux) | | For the helper scripts. |

Free ports: **4000** (API) and **5173** (web app).

## 2. Clone
```bash
git clone https://github.com/billain2004-source/nclc-crm.git
cd nclc-crm
```

## 3. Quick setup (recommended)
Windows:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```
macOS / Linux:
```bash
chmod +x scripts/setup.sh && ./scripts/setup.sh
```
The script:
1. checks Node 18+,
2. runs `npm ci` in `backend/` and `frontend/` (exact versions from the lock files),
3. creates `.env` from `.env.example` and generates a random `JWT_SECRET` and `APP_ENC_KEY`. Values you have already set are never overwritten.
4. prints the next steps. It never generates or prints your MySQL password.

Then open `.env`, set `DB_USER` and `DB_PASSWORD`, and create the database:
```powershell
cd backend
npm run db:setup
```
Windows alternative: `scripts\setup.ps1 -InitDb` installs and creates the database in one go once `.env` has your DB credentials.

## 4. Manual setup (what the script does)
```bash
cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
cp .env.example .env        # Windows: copy .env.example .env
```
Edit `.env`:

| Variable | Example | Purpose |
|---|---|---|
| `DB_HOST`, `DB_PORT` | `localhost`, `3306` | MySQL server |
| `DB_USER`, `DB_PASSWORD` | `root`, *(yours)* | MySQL login. **You type this. It is never committed.** |
| `DB_NAME` | `nclc_crm` | Database name |
| `API_PORT` | `4000` | Backend port |
| `JWT_SECRET` | 64 random hex chars | Signs login tokens |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS origin |
| `APP_ENC_KEY` | 64 random hex chars | AES-256-GCM key that encrypts AI provider API keys. **Back it up.** If it changes, stored keys can't be decrypted and must be re-entered. |
| `AI_KEY_RESET_SWEEP_MINUTES` | `5` | How often exhausted AI keys are checked for automatic reset |
| `LLM_TIMEOUT_MS` | `60000` | Timeout per AI provider call |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## 5. Create the database
**Option A (recommended): one command**
```bash
cd backend
npm run db:setup      # create DB if missing, apply schema + migrations, seed demo data (safe to re-run)
npm run db:reset      # DROP and rebuild from scratch (destroys data)
npm run db:migrate    # same as db:setup; use after pulling new code
```
**Option B: from the SQL file, then seed**
```bash
mysql -u root -p < documents/create_tables.sql     # creates nclc_crm and every table
cd backend && npm run db:setup                     # loads the seed data (tables already exist)
```
The seed loads 4 demo firms (GB/GBP, IN/INR, US/USD, SG/SGD), 17 users, 12–15 rows per module, help text, 4 AI task types and **fake placeholder API keys only** (mock provider, which works offline). No real API key is ever seeded.

## 6. Run
Windows (background, logs in `.\logs`):
```powershell
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
powershell -ExecutionPolicy Bypass -File scripts\stop.ps1
```
Any OS (two terminals):
```bash
cd backend  && npm start      # or: npm run dev (auto-restart on change)
cd frontend && npm run dev
```
Open **http://localhost:5173**. API health: http://localhost:4000/api/health.

## 7. Sign in (demo data)
| Role | Email | Password |
|---|---|---|
| Super Admin | superadmin@nclc-crm.example | Super@123 |
| Firm Admin | admin@northwind.example | Demo@123 |
| Manager | manager@sahyadri.example | Demo@123 |
| Team User | sales1@lakeshore.example | Demo@123 |

The full list for all 4 firms is in [User_Manual.md](User_Manual.md) §2.

## 8. Verify
```bash
cd backend
npm run test:api      # API smoke test against the running server (all checks must pass)
```

## 9. Adding real AI keys (optional)
Sign in as Firm Admin or Super Admin, go to **Settings > API Keys**, then **+ Add key**. Pick the provider (OpenAI, Anthropic, Gemini, OpenRouter, Groq), the task type and the key, then **Test key**. Keys are encrypted with `APP_ENC_KEY` and only the last 4 characters are shown. See [AI_Agents.md](AI_Agents.md).

## 10. Backup
```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
```
This creates `backups/nclc-crm-backup-YYYYMMDD-HHmm.zip`, which contains:
- `backend/`, `frontend/`, `documents/`, `scripts/`, `README.md`, `.env.example`, `.gitignore`
- `database/db_schema.sql` (live `SHOW CREATE TABLE` for every table) and `database/db_data.sql` (all business data)

It excludes `node_modules`, `.env`, logs, `dist`, `.git` and earlier backups. It never includes API key data: `api_keys` and `api_key_usage_log` rows are not exported, and `agent_runs.key_id` is written as NULL. The script stops if it finds a `.env` or an encrypted key in the staging folder.

Restore a backup into an empty database:
```bash
mysql -u root -p -e "CREATE DATABASE nclc_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql -u root -p nclc_crm < database/db_schema.sql
mysql -u root -p nclc_crm < database/db_data.sql
```
Then re-enter the AI provider keys in Settings > API Keys (`npm run db:setup` re-adds the placeholder keys if the table is empty).

## 11. Troubleshooting
| Symptom | Fix |
|---|---|
| `[config] Environment variable APP_ENC_KEY is required` | Run the setup script or add `APP_ENC_KEY` to `.env` (see §4). |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER`/`DB_PASSWORD` in `.env`. |
| Times are 5:30 h off | Already handled: DB sessions use UTC (`src/db.js`). Don't remove it. |
| "Stored key cannot be decrypted" in the API Keys page | `APP_ENC_KEY` changed. Restore the old value or re-enter the keys. |
| Port 4000/5173 in use | `scripts\stop.ps1`, or change `API_PORT` and the Vite proxy in `frontend/vite.config.js`. |
| `node` not found (Windows, this machine) | A portable Node is at `C:\Users\billa\tools\node`. The scripts fall back to it automatically. |

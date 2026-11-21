# NCLC CRM — Deployment & Operations Notes

> **Document:** Deployment Notes v1.1 · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30) · **Developer setup from GitHub:** [Setup_Guide.md](Setup_Guide.md)

## 1. Prerequisites
| Item | Version | Notes on this machine |
|---|---|---|
| Node.js | 18+ (tested 22.11.0) | Portable copy at `C:\Users\billa\tools\node` (not on PATH). `scripts\start.ps1` falls back to it. |
| MySQL Server | 8.0 | Windows service `MySQL80`, localhost:3306 |
| Browser | any modern browser | Tested with Microsoft Edge (headless) |

To use the portable Node in a shell: `$env:Path = "C:\Users\billa\tools\node;" + $env:Path`.

## 2. First-time setup
```powershell
cd C:\Users\billa\nclc-crm
copy .env.example .env            # then edit DB_USER / DB_PASSWORD (and JWT_SECRET)
cd backend;  npm install;  npm run db:setup   # creates nclc_crm, tables, demo data, help text
cd ..\frontend;  npm install
cd ..;  powershell -ExecutionPolicy Bypass -File scripts\start.ps1
```
`db:setup` is idempotent:
- It creates missing tables and applies pending migrations (`db/migrate.js`).
- It seeds only an empty database.
- It adds any missing help keys, AI task types and dropdown values without overwriting edited ones.

`db:migrate` is the same command, to run after pulling new code. `db:reset` **drops and rebuilds** the database (all data lost).
Shortcut (v1.1): `scripts\setup.ps1` (or `scripts/setup.sh`) installs dependencies and creates `.env` with a random `JWT_SECRET` and `APP_ENC_KEY`.

## 3. Configuration (`.env`)
| Key | Example | Purpose |
|---|---|---|
| DB_HOST / DB_PORT | localhost / 3306 | MySQL server |
| DB_USER / DB_PASSWORD | root / (secret) | **Never commit.** Read only from `.env`. |
| DB_NAME | nclc_crm | Database name |
| API_PORT | 4000 | Express port |
| JWT_SECRET | long random string | Token signing key. Changing it signs everyone out. |
| JWT_EXPIRES_IN | 8h | Session length |
| CLIENT_ORIGIN | http://localhost:5173 | CORS allow-list (comma separated) |
| APP_ENC_KEY | 64 hex chars | **v1.1, required.** AES-256-GCM key for stored AI keys. Back it up separately from the database; if it is lost, every API key must be re-entered. |
| AI_KEY_RESET_SWEEP_MINUTES | 5 | How often exhausted AI keys are checked for automatic reset |
| LLM_TIMEOUT_MS | 60000 | Timeout per AI provider call |

## 4. Running
| Action | Command |
|---|---|
| Start both servers (background, logs in `logs\`) | `powershell -ExecutionPolicy Bypass -File scripts\start.ps1` |
| Stop both servers | `powershell -ExecutionPolicy Bypass -File scripts\stop.ps1` |
| Backend only (foreground) | `cd backend; npm start` (or `npm run dev` for auto-reload) |
| Frontend only (foreground) | `cd frontend; npm run dev` |
| API regression test | `cd backend; npm run test:api` (API must be running) |
| Health check | http://localhost:4000/api/health |

Logs: `logs\backend.log`, `logs\backend.err.log`, `logs\frontend.log`, `logs\frontend.err.log`.

## 5. Production build (single port)
```powershell
cd frontend; npm run build          # creates frontend/dist
cd ..\backend; npm start            # Express serves dist + API on :4000
```
Then open http://localhost:4000. Set `CLIENT_ORIGIN` to the public URL. Put it behind HTTPS (IIS/nginx reverse proxy). Run the API under a service manager (NSSM / pm2 / systemd).

## 6. Production hardening checklist
- [ ] Create a dedicated MySQL user with rights on `nclc_crm` only (not root).
- [ ] Set a new 48+ character `JWT_SECRET`.
- [ ] Change or remove all demo accounts (`Demo@123`, `Super@123`), or start from `db:setup` with a custom seed.
- [ ] Enable HTTPS. Consider httpOnly cookies instead of localStorage tokens.
- [ ] Add rate limiting on `/api/auth/login`.
- [ ] Schedule backups (see §7).
- [ ] Replace demo exchange rates with a real feed or regular manual updates.
- [ ] Generate a new `APP_ENC_KEY` for production, store it in a secrets manager, and delete the demo mock keys in Settings › API Keys.
- [ ] Keep `.env`, `backups/` and logs out of Git (already in `.gitignore`; check with `git ls-files`).

## 7. Backup & restore
**Code + documents + data, without secrets (v1.1):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1   # → backups\nclc-crm-backup-YYYYMMDD-HHmm.zip
```
- **Contents:** source code, documents, `database/db_schema.sql` and `database/db_data.sql`.
- **Excluded:** node_modules, `.env*`, logs, dist and `.git`.
- **Never contains API key data:** `api_keys` and `api_key_usage_log` rows are skipped, and `agent_runs.key_id` is set to NULL. The script stops if it finds `.env` or encrypted key text.
- Restore steps are in [Setup_Guide.md](Setup_Guide.md) §10. Tested 2026-11-21: all business tables restored with identical row counts.

**Full database dump** (includes the encrypted API keys, so treat it as a secret):
```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u root -p nclc_crm > nclc_crm_backup.sql
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p nclc_crm < nclc_crm_backup.sql
```

## 7a. Source control
GitHub: `https://github.com/billain2004-source/nclc-crm` (branch `main`). On this machine Git is portable at `C:\Users\billa\tools\git\cmd`.

## 8. Troubleshooting
| Problem | Cause / fix |
|---|---|
| `[config] Missing .env` | Copy `.env.example` to `.env`. |
| `Access denied for user` | Wrong `DB_USER`/`DB_PASSWORD` in `.env`. |
| Port 4000 / 5173 in use | Run `scripts\stop.ps1`, or find the process: `Get-NetTCPConnection -LocalPort 4000`. |
| Times off by the server's UTC offset | All sessions must run in UTC (`src/db.js` sets `time_zone='+00:00'`). Rows created before that fix need `db:reset`. |
| Blank page at :5173 | Check `logs\frontend.err.log`. Run `npm install` in `frontend`. |
| `APP_ENC_KEY is required` | Add it to `.env` (`scripts\setup.ps1` generates one). |
| "Stored key cannot be decrypted" | `APP_ENC_KEY` changed. Restore the old value or re-enter the keys. |
| Errors about unknown columns or ENUM values after pulling | Run `cd backend; npm run db:migrate`. |
| A shell command hangs after `start.ps1` | Don't pipe its output or use `Start-Process -Wait`; the node children keep it open. |

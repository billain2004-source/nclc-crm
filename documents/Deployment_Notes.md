# NCLC CRM — Deployment & Operations Notes

> **Document:** Deployment Notes v1.0 · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30)

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
`db:setup` is idempotent: it creates missing tables, seeds only an empty database, and adds any missing help keys without overwriting edited ones.
`db:reset` **drops and rebuilds** the database (all data lost).

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
- [ ] Schedule backups: `mysqldump -u <user> -p nclc_crm > backup.sql`.
- [ ] Replace demo exchange rates with a real feed or regular manual updates.

## 7. Backup & restore
```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u root -p nclc_crm > nclc_crm_backup.sql
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p nclc_crm < nclc_crm_backup.sql
```

## 8. Troubleshooting
| Problem | Cause / fix |
|---|---|
| `[config] Missing .env` | Copy `.env.example` to `.env`. |
| `Access denied for user` | Wrong `DB_USER`/`DB_PASSWORD` in `.env`. |
| Port 4000 / 5173 in use | Run `scripts\stop.ps1`, or find the process: `Get-NetTCPConnection -LocalPort 4000`. |
| Times off by the server's UTC offset | All sessions must run in UTC (`src/db.js` sets `time_zone='+00:00'`). Rows created before that fix need `db:reset`. |
| Blank page at :5173 | Check `logs\frontend.err.log`. Run `npm install` in `frontend`. |

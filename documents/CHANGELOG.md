# NCLC CRM — Changelog

> **Document:** Changelog · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30)

## v1.1.0 — 2026-11-21 (Part B)
**Added**
- **Settings menu** (Super Admin, Firm Admin): Firm settings (moved from `/admin/settings`), **API Keys**, **Dropdown values**.
- **API Keys:** many keys per task type (`ai_task_types`: text, image, audio, embedding, editable), primary + priority, firm and platform scopes. AES-256-GCM encryption with `APP_ENC_KEY`; only the last 4 characters are ever shown. Test key, usage counts, `api_key_usage_log`. Automatic failover on 429/402/401/403, exhausted keys reset on a schedule or by hand.
- **`llmRouter.callLLM(taskType, payload)`**: the one entry point for all AI. Adapters for OpenAI, Anthropic (official SDK), Gemini, OpenRouter, Groq and an offline mock provider.
- **AI agents** with mandatory human approval: lead scoring, follow-up email draft, deal summary. Also `agent_runs` and the AI agents page. [AI_Agents.md](AI_Agents.md) maps 12 automatable CRM tasks.
- **Dropdown values:** `lookup_lists` / `lookup_values` (9 lists, 49 values) with firm overrides, firm-only values, order, active flag, editable labels and stable codes. All forms and filters load from `GET /api/lookups`, and the API validates against the tables.
- Setup scripts (`scripts/setup.ps1`, `setup.sh`), [Setup_Guide.md](Setup_Guide.md), backup script (`scripts/backup.ps1` + `backend/scripts/export-sql.js`, never exports API key data), `npm run db:migrate`, `backend/db/migrate.js`.
- `backend/scripts/inspect-db.js` (schema + integrity report), [Data_Relationships.md](Data_Relationships.md).
- 14 new help sections. The API smoke test grows from 60 to 130 checks.

**Changed**
- `leads.status`, `tasks.type/priority/status`: ENUM → VARCHAR(40), values from `lookup_values`.
- `leads.source` and `companies.industry` now store codes (`trade_show`) instead of labels (`Trade Show`); existing rows converted.
- Dashboard "open leads" = not unqualified/converted (was a fixed list), and labels come from lookups.
- Firm time zone is chosen from a list of IANA zones.

**Fixed**
- Missing FK `leads.converted_deal_id → deals` (deleting a converted deal left a dangling id) and `exchange_rates.created_by → users`.
- The API accepted a deal contact from a different company than the deal's company.
- The API accepted any text as a firm time zone.

## v1.0.0 — 2026-11-21
**Added**
- Multi-tenant CRM (firms) with Super Admin, Firm Admin, Manager and Team User roles enforced in the API.
- Modules: Dashboard, Contacts, Companies, Leads (with conversion), Deals (Kanban board + list), Tasks.
- Countries, currencies, exchange rates with history. Base-currency conversion everywhere.
- Context help: 41 sections, "?" on every page, card and form group, editable by Firm Admin (firm override) and Super Admin (global or firm).
- Admin: firms, users, currencies/rates, help text, firm settings and pipeline stages.
- Seed data: 4 firms (GB/GBP, IN/INR, US/USD, SG/SGD), 17 users, 12–15 rows per module per firm.
- API smoke test (60 checks), start/stop scripts, full documentation set.

**Fixed during build**
- Timestamps were stored in the server's local time (IST) but read as UTC → DB sessions forced to UTC.
- Money/date formatting now follows the firm's country rather than the browser locale.
- Date-only values no longer shift by a day across time zones.

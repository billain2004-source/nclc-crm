# NCLC CRM — Prompt History

> **Document:** Prompt History v1.1 · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30)

A record of the instructions that shaped this project, in order.

## Prompt 1 — 2026-11-21 (session start)
The first message arrived truncated (`h> to..."`). The assistant asked for the full request.

## Prompt 2 — 2026-11-21 (main brief)
> Build "NCLC CRM", a multi-tenant HubSpot-style CRM, in this folder. Work in stages and confirm each stage works before moving on.
>
> **STAGE 1 - RESEARCH + BRD:** Search the web for similar products (HubSpot, Zoho CRM, Salesforce, Pipedrive) and note their core modules. Write documents/BRD.md based on that research.
>
> **STAGE 2 - APP:** Stack: React (Vite) frontend, Node + Express backend, MySQL on localhost, database name nclc_crm. Read DB credentials from a .env file (create .env.example and ask me to fill in .env; never hardcode the password).
> - Multi-tenant: many firms (companies), every table scoped by firm_id.
> - 4 login levels: Super Admin (manages all firms), Firm Admin, Manager, Team User, with role-based access enforced in the backend.
> - Multi-country and multi-currency: countries, currencies and exchange rates tables; each firm has a base currency; deals/amounts show in the firm's currency with conversion.
> - Modules: Contacts, Companies, Leads, Deals/Pipeline, Tasks, Dashboard.
> - Prefill realistic seed data in every section (at least 3 firms in different countries and currencies, users at every role, 10+ rows per module).
>
> **STAGE 3 - HELP TEXT:** Add a "?" icon to every section and field group. Store help text in a help_text table (section_key, title, body, updated_by, updated_at). Firm Admin and Super Admin can edit help text from the UI. Prefill help text for every section.
>
> **STAGE 4 - DOCUMENTS:** In /documents create: BRD, TRD, TD (technical and functional design with business logic), use cases, user stories, user manual, tables used, create-table SQL (.sql), prompt history, memory notes, test cases, plus anything else a project like this should have (e.g. API reference, ER diagram, deployment notes). Put the date and time of last update in the header of every document. The user manual must list all URLs and login details for every level.
>
> **STAGE 5 - RESTART CHECK:** Stop all servers, restart them, and confirm login, data and help text still work. Fix anything that breaks.
>
> **STAGE 6 - SERVERS:** Start backend and frontend, then update the URLs and demo logins in the user manual. Show me a summary of URLs and logins.

## Prompt 3 — 2026-11-21
> done

(The user had filled in `DB_PASSWORD` in `.env`. The database was then created and seeded.)

## Prompt 4 — 2026-11-21 13:08 IST
> yo move to my hub

The assistant asked what "hub" meant.

## Prompt 5 — 2026-11-21 13:09 IST
> move to my github

The repository was initialised and pushed to `https://github.com/billain2004-source/nclc-crm` (branch `main`). A first `git push` from the terminal failed ("terminal prompts disabled"), so sign-in was done once through Git Credential Manager in the browser.

## Prompt 6 — 2026-11-21 13:34 IST (Part B brief)
> Part B for NCLC CRM. Work in stages, confirm each works, and update every document in /documents with a new date-time header at the end.
>
> **STAGE 1 - SETTINGS > API KEYS**
> - Add a Settings menu (Super Admin and Firm Admin only) with an "API Keys" page.
> - Users can add many API keys (name, provider, key, task type, priority, status) and mark one active per task type.
> - Task types: text, image, audio, embedding (editable list, stored in a table). Each task type has its own active key (text -> llm1, image -> llm2, etc).
> - Automatic failover: when a call fails with quota, rate-limit or auth errors (429, 402, 401/403 quota-exceeded), mark that key "exhausted" with a timestamp and retry with the next key by priority for the same task type. Log every switch in an api_key_usage_log table. Show usage counts and status in the UI. Exhausted keys reset on a configurable schedule or manually.
> - Security: encrypt keys at rest (AES-256-GCM, with APP_ENC_KEY in .env), show only the last 4 characters in the UI, never return full keys from the API, never write keys to logs, and seed NO real keys (use fake placeholders). Add a "Test key" button.
> - Build one backend service, llmRouter.callLLM(taskType, payload), that all AI features use.
>
> **STAGE 2 - AI AGENTS**
> - Create documents/AI_Agents.md: which CRM roles and tasks can be automated with LLM agents (lead scoring, contact/company enrichment, deal-risk summaries, follow-up email drafting, task prioritisation, meeting-note summarising, duplicate detection, help-text drafting, data-quality checks, currency/rate anomaly alerts), with a description, inputs, outputs, human-approval step and the task type/key each uses.
> - Implement 3 agents that use llmRouter: lead scoring, follow-up email draft, deal summary. Each has a button in the UI and an agent_runs table (input, output, key used, status). Everything an agent writes needs user approval first.
>
> **STAGE 3 - BACKUP AND GIT**
> - Create a script and documents/Setup_Guide.md so another developer can set up the project: prerequisites, clone, npm install, .env.example, create DB from create_tables.sql plus seed, run commands.
> - Create a code and documents backup zip that EXCLUDES node_modules, .env, logs, build output, and any API key data. Keep a DB schema + seed SQL but never export the api_keys table contents.
> - Update .gitignore, confirm with `git ls-files` that .env and keys are not tracked, commit, and push to my GitHub repo. Do NOT add Co-Authored-By or any Claude attribution lines to commits.
>
> **STAGE 4 - TABLES AND RELATIONSHIPS CHECK**
> - Inspect the live nclc_crm database: list all tables, columns, PKs, FKs and indexes.
> - Create documents/Data_Relationships.md and update ER_Diagram.md: for every screen and form field, map frontend field -> API endpoint -> table.column, and list any mismatches or missing FKs. Fix real mismatches and report what changed.
>
> **STAGE 5 - DROPDOWNS FROM TABLES**
> - Find every hard-coded dropdown/select in the frontend and backend validation (stages, statuses, industries, priorities, task types, lead sources, etc).
> - Move them to lookup_lists and lookup_values tables (firm-level overrides allowed, sort order, active flag, label editable, stable code kept for business logic).
> - Add Settings > Dropdown Values to add, edit, reorder and deactivate values, and make all forms load from the API. Prefill with the current values. Keep role names fixed because permissions depend on them.
> - Add help text for every new Settings page.
>
> **FINAL:** restart both servers, run the API smoke tests, update User_Manual.md (URLs, logins, new Settings screens), Test_Cases.md, Prompt_History.md and Memory_Notes.md with new timestamps, and show a summary.

## How each prompt was handled
| Stage | Outcome |
|---|---|
| GitHub | Pushed to `billain2004-source/nclc-crm` (initial commit `441ab5d`) |
| B1 | Settings › API Keys, `api_keys` / `ai_task_types` / `api_key_usage_log`, AES-256-GCM, failover, reset sweep, Test key, `llmRouter.callLLM` |
| B2 | [AI_Agents.md](AI_Agents.md); lead scoring, follow-up email and deal summary agents with approval; `agent_runs`; AI agents page |
| B3 | `scripts/setup.ps1`/`setup.sh`, [Setup_Guide.md](Setup_Guide.md), `scripts/backup.ps1` + `export-sql.js` (no key data); restore tested; `.gitignore` checked with `git ls-files`; pushed without attribution lines |
| B4 | `scripts/inspect-db.js`; [Data_Relationships.md](Data_Relationships.md); 2 FKs added, deal contact/company and time zone validation; [ER_Diagram.md](ER_Diagram.md) v1.1 |
| B5 | `lookup_lists`/`lookup_values`, 9 lists / 49 values, Settings › Dropdown values, forms and API validation driven by tables; role names stay fixed |
| FINAL | Restarted 14:16 IST; 130/130 API checks; UI walkthrough clean; all documents re-stamped |
| | **Part A (prompts 1–3):** |
| 1 | Web research on HubSpot, Zoho, Salesforce and Pipedrive → [BRD.md](BRD.md) |
| 2 | Backend + frontend built. `.env.example` created, `.env` filled by the user. DB seeded. 58-check API test passed. UI verified headlessly. |
| 3 | `help_text` table, 41 sections, "?" icons, firm overrides, UI editor |
| 4 | This documentation set |
| 5 | Restart check. Results in [Test Cases](Test_Cases.md) and [Memory Notes](Memory_Notes.md). |
| 6 | Servers started. URLs and logins confirmed in the [User Manual](User_Manual.md). |

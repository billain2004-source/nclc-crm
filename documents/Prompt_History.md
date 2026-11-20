# NCLC CRM — Prompt History

> **Document:** Prompt History v1.0 · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30)

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

## How each prompt was handled
| Stage | Outcome |
|---|---|
| 1 | Web research on HubSpot, Zoho, Salesforce and Pipedrive → [BRD.md](BRD.md) |
| 2 | Backend + frontend built. `.env.example` created, `.env` filled by the user. DB seeded. 58-check API test passed. UI verified headlessly. |
| 3 | `help_text` table, 41 sections, "?" icons, firm overrides, UI editor |
| 4 | This documentation set |
| 5 | Restart check. Results in [Test Cases](Test_Cases.md) and [Memory Notes](Memory_Notes.md). |
| 6 | Servers started. URLs and logins confirmed in the [User Manual](User_Manual.md). |

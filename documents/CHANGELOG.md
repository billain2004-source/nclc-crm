# NCLC CRM — Changelog

> **Document:** Changelog · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30)

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

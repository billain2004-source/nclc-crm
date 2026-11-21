# NCLC CRM — Data Relationships

> **Document:** Data Relationships v1.0 · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30) · **Related:** [ER Diagram](ER_Diagram.md), [Tables Used](Tables_Used.md), [API Reference](API_Reference.md)

How every screen and form field reaches the database: **screen → field → API endpoint → `table.column`**. It also lists the relationship problems found by inspecting the live database and what was changed (Part B, Stage 4).

## 1. How this was checked
`backend/scripts/inspect-db.js` reads `information_schema` from the live database and prints every table, column, primary key, foreign key and index, plus 14 data-integrity checks that foreign keys cannot express (cross-firm links, dangling ids, status consistency):
```bash
cd backend
node scripts/inspect-db.js              # Markdown report to the console
node scripts/inspect-db.js --md out.md  # ... or to a file
```
**Live database after the changes:** 18 tables, 223 columns, 50 foreign keys, 73 indexes. All 14 integrity checks return 0 offending rows.

| Area | Tables |
|---|---|
| Tenancy and users | `firms`, `users` |
| CRM records | `companies`, `contacts`, `leads`, `deals`, `tasks`, `pipeline_stages` |
| Reference data (global) | `currencies`, `countries`, `exchange_rates` |
| Configuration | `help_text`, `lookup_lists`, `lookup_values`, `ai_task_types` |
| AI | `api_keys`, `api_key_usage_log`, `agent_runs` |

## 2. Foreign keys (50)
| From | To | On delete |
|---|---|---|
| `*.firm_id` (users, companies, contacts, leads, deals, tasks, pipeline_stages, api_keys, api_key_usage_log, agent_runs) | `firms.id` | CASCADE |
| `companies.owner_id`, `contacts.owner_id`, `leads.owner_id`, `deals.owner_id`, `tasks.assigned_to`, `tasks.created_by` | `users.id` | SET NULL |
| `contacts.company_id`, `deals.company_id`, `leads.converted_company_id` | `companies.id` | SET NULL |
| `deals.contact_id`, `tasks.contact_id`, `leads.converted_contact_id` | `contacts.id` | SET NULL |
| `deals.lead_id` | `leads.id` | SET NULL |
| **`leads.converted_deal_id`** *(new)* | `deals.id` | SET NULL |
| `tasks.deal_id` | `deals.id` | SET NULL |
| `deals.stage_id` | `pipeline_stages.id` | NO ACTION (blocks the delete) |
| `*.currency_code`, `firms.base_currency`, `countries.currency_code`, `exchange_rates.currency_code` | `currencies.code` | NO ACTION (blocks the delete) |
| `*.country_code`, `firms.country_code` | `countries.code` | NO ACTION (blocks the delete) |
| **`exchange_rates.created_by`** *(new)* | `users.id` | SET NULL |
| `help_text.updated_by`, **`lookup_values.updated_by`** *(new table)* | `users.id` | SET NULL |
| **`lookup_values.list_code`** *(new table)* | `lookup_lists.code` | CASCADE (ON UPDATE CASCADE) |
| `api_keys.task_type`, `agent_runs.task_type` | `ai_task_types.code` | NO ACTION (ON UPDATE CASCADE) |
| `api_keys.created_by/updated_by`, `api_key_usage_log.user_id`, `agent_runs.created_by/reviewed_by` | `users.id` | SET NULL |
| `api_key_usage_log.key_id/to_key_id`, `agent_runs.key_id` | `api_keys.id` | SET NULL |

**Relationships that cannot be foreign keys, and how they are protected instead:**
| Column | Why no FK | Protection |
|---|---|---|
| `help_text.firm_id`, `lookup_values.firm_id` | `0` means "global default", and no firm has id 0 | Integrity check in `inspect-db.js`; API writes only the current firm or 0 (Super Admin) |
| `users.firm_id` | `NULL` for the Super Admin | FK still present (NULL is allowed) |
| `agent_runs.entity_id` | Points to a lead **or** a deal (`entity_type`) | Access re-checked on approval; integrity check |
| `leads.status`, `leads.source`, `contacts.lifecycle_stage`, `companies.industry`, `tasks.type/priority/status` | Value must be active **for the firm** (global or firm-only value), which a FK cannot express | API validation against `lookup_values` (`services/lookups.js → assertValues`) |
| Same-firm references (e.g. a deal's company must be in the deal's firm) | A FK checks existence, not tenancy | `crudFactory.checkRefs` + integrity checks |

## 3. Screen → field → API → table.column
All CRM endpoints are under `/api` and are scoped to the current firm (`firm_id`). "Dropdown" means the options come from `GET /api/lookups` (table `lookup_values`).

### Login
| Field | API | Column |
|---|---|---|
| Email, Password | `POST /auth/login` | `users.email`, `users.password_hash` (bcrypt) |

### Dashboard (`/`)
| Widget | API | Source |
|---|---|---|
| KPIs, pipeline by stage, by owner, recent deals | `GET /dashboard` | `deals.*`, `pipeline_stages.*`, `users.name`, converted with `exchange_rates` |
| Open leads | ″ | `leads.status NOT IN ('unqualified','converted')` |
| Leads by source / status | ″ | `leads.source`, `leads.status`, labels from `lookup_values` |
| Upcoming tasks | ″ | `tasks.*` |

### Contacts (`/contacts`)
| Field | API | Column |
|---|---|---|
| First name, Last name, Email, Phone, Mobile, City | `GET/POST/PUT/DELETE /contacts[/:id]` | `contacts.first_name`, `last_name`, `email`, `phone`, `mobile`, `city` |
| Country | ″ (options `GET /ref/countries`) | `contacts.country_code` → `countries.code` |
| Company | ″ (options `GET /companies`) | `contacts.company_id` → `companies.id` |
| Job title, Notes | ″ | `contacts.job_title`, `contacts.notes` |
| Lifecycle stage (dropdown) | ″ | `contacts.lifecycle_stage` ← list `contact_lifecycle` |
| Owner | ″ (options `GET /users/lookup`) | `contacts.owner_id` → `users.id` |

### Companies (`/companies`)
| Field | API | Column |
|---|---|---|
| Company name, Website domain, Phone, Email, City, Employees, Description | `/companies[/:id]` | `companies.name`, `domain`, `phone`, `email`, `city`, `employees`, `description` |
| Industry (dropdown) | ″ | `companies.industry` ← list `company_industry` |
| Country | ″ | `companies.country_code` → `countries.code` |
| Annual revenue, Revenue currency | ″ | `companies.annual_revenue`, `companies.currency_code` → `currencies.code` |
| Owner | ″ | `companies.owner_id` → `users.id` |

### Leads (`/leads`)
| Field | API | Column |
|---|---|---|
| First/Last name, Email, Phone, Company name, Job title, Notes | `/leads[/:id]` | `leads.first_name`, `last_name`, `email`, `phone`, `company_name`, `job_title`, `notes` |
| Country | ″ | `leads.country_code` → `countries.code` |
| Source (dropdown) | ″ | `leads.source` ← list `lead_source` |
| Status (dropdown) | ″ | `leads.status` ← list `lead_status` (`converted` only via Convert) |
| Score | ″ (or AI agent `lead_scoring`, after approval) | `leads.score` |
| Owner | ″ | `leads.owner_id` → `users.id` |
| Estimated value, Currency | ″ | `leads.estimated_value`, `leads.currency_code` → `currencies.code` |
| **Convert** dialog: deal name, amount, currency, stage, expected close | `POST /leads/:id/convert` | inserts `companies`, `contacts`, `deals`; sets `leads.status`, `converted_company_id`, `converted_contact_id`, `converted_deal_id`, `converted_at`; `deals.lead_id` |

### Deals (`/deals`, board and list)
| Field | API | Column |
|---|---|---|
| Deal name, Expected close, Description | `/deals[/:id]`, `GET /deals/board` | `deals.name`, `expected_close_date`, `description` |
| Owner | ″ | `deals.owner_id` → `users.id` |
| Amount, Currency | ″ | `deals.amount`, `deals.currency_code` → `currencies.code` |
| Stage | ″ (options `GET /firm/stages`) | `deals.stage_id` → `pipeline_stages.id`; sets `deals.status`, `probability`, `closed_at` |
| Probability | ″ | `deals.probability` |
| Company | ″ | `deals.company_id` → `companies.id` |
| Primary contact | ″ (options filtered to the company) | `deals.contact_id` → `contacts.id` (**API now checks the contact works at the deal's company**) |
| Status filter / pill | ″ | `deals.status` (derived from stage); labels from list `deal_status` |
| AI summary | `POST /agents/deal_summary/run`, approve | appends to `deals.description` |

### Tasks (`/tasks`)
| Field | API | Column |
|---|---|---|
| Title, Description | `/tasks[/:id]` | `tasks.title`, `tasks.description` |
| Type, Priority, Status (dropdowns) | ″ | `tasks.type`, `priority`, `status` ← lists `task_type`, `task_priority`, `task_status`; `status = done` sets `tasks.completed_at` |
| Due | ″ | `tasks.due_date` (UTC) |
| Assigned to | ″ | `tasks.assigned_to` → `users.id`; `tasks.created_by` set by the API |
| Contact, Deal | ″ | `tasks.contact_id` → `contacts.id`, `tasks.deal_id` → `deals.id` |
| AI follow-up email | `POST /agents/followup_email/run`, approve | inserts `tasks` (type `email`) |

### AI agents (`/ai/agents`)
| Field | API | Column |
|---|---|---|
| Run list, status filter | `GET /agents/runs` | `agent_runs.*` |
| Approve / Reject, edited output, note | `POST /agents/runs/:id/approve`, `/reject` | `agent_runs.status`, `output_json`, `reviewed_by`, `reviewed_at`, `review_note`, `applied_result` |

### Admin: Users (`/admin/users`)
| Field | API | Column |
|---|---|---|
| Name, Email, Phone | `/users[/:id]` | `users.name`, `email`, `phone` |
| Role | ″ | `users.role` (fixed ENUM; permissions depend on it) |
| Firm | ″ | `users.firm_id` → `firms.id` |
| Password | ″ | `users.password_hash` |
| Active | ″ | `users.is_active` |

### Admin: Firms (`/admin/firms`, Super Admin)
| Field | API | Column |
|---|---|---|
| Firm name, Email domain | `/firms[/:id]` | `firms.name`, `firms.domain` |
| Country, Base currency | ″ | `firms.country_code` → `countries.code`, `firms.base_currency` → `currencies.code` |
| Time zone (dropdown of IANA zones) | ″ | `firms.timezone` (**API now rejects invalid zones**) |
| Status (dropdown) | ″ | `firms.status` ← list `firm_status` |
| First Firm Admin name/email/password | `POST /firms` | inserts `users` (role `firm_admin`) and default `pipeline_stages` |

### Admin: Currencies (`/admin/currencies`)
| Field | API | Column |
|---|---|---|
| Code, Name, Symbol, Decimals | `POST/PUT /ref/currencies` | `currencies.code`, `name`, `symbol`, `decimals` |
| Rate per USD, Effective date, Source | `POST /ref/exchange-rates` | `exchange_rates.rate_per_usd`, `effective_date`, `source`, `created_by` → `users.id` |
| Converter | `GET /ref/convert` | `exchange_rates` (latest per currency) |

### Admin: Help text (`/admin/help`)
| Field | API | Column |
|---|---|---|
| Title, Body | `PUT /help/:key`, `DELETE /help/:key` | `help_text.title`, `body`, `firm_id` (0 = global), `section_key`, `updated_by` |

### Settings: Firm settings (`/settings/firm`)
| Field | API | Column |
|---|---|---|
| Firm name, Country, Base currency, Time zone, Email domain | `PUT /firm` | `firms.*` (same rules as Firms) |
| Stage name, Default probability | `PUT /firm/stages/:id` | `pipeline_stages.name`, `pipeline_stages.probability` |

### Settings: API Keys (`/settings/api-keys`)
| Field | API | Column |
|---|---|---|
| Name, Provider, Task type, Model, Priority, Status, Primary | `/ai/keys[/:id]` | `api_keys.name`, `provider`, `task_type` → `ai_task_types.code`, `model`, `priority`, `status`, `is_primary` |
| Key | ″ (write only) | `api_keys.key_enc` (AES-256-GCM), `api_keys.key_last4` |
| Test key, Reset, Make primary | `POST /ai/keys/:id/test`, `/reset`, `/primary` | `api_keys.status`, `exhausted_at`, `usage_count`, `success_count`, `failure_count`, `last_used_at`, `last_error`; `api_key_usage_log` |
| Task types (code, name, reset minutes, order, active) | `/ai/task-types` | `ai_task_types.*` |
| Usage log | `GET /ai/usage` | `api_key_usage_log.*` |

### Settings: Dropdown values (`/settings/dropdowns`)
| Field | API | Column |
|---|---|---|
| List picker | `GET /lookups` | `lookup_lists.*` |
| Label, Active, Order | `PUT /lookups/:list/values/:code`, `POST /lookups/:list/reorder` | `lookup_values.label`, `is_active`, `sort_order` (firm row = override) |
| Add value (label, code) | `POST /lookups/:list/values` | new `lookup_values` row |
| Reset / Delete | `DELETE /lookups/:list/values/:code` | removes the firm override or an unused value |
| In use | `GET /lookups/:list?usage=1` | count of the code in the business table |

## 4. Problems found and what changed
| # | Problem (found by) | Risk | Change |
|---|---|---|---|
| 1 | `leads.converted_deal_id` had no FK (inspection) | Deleting a converted deal left the lead pointing to a missing deal | Added `fk_leads_deal` → `deals.id` **ON DELETE SET NULL** (migration cleans dangling ids first). Smoke test deletes a converted deal and checks the id becomes NULL. |
| 2 | `exchange_rates.created_by` had no FK (inspection) | Rate history could reference deleted users | Added `fk_rates_user` → `users.id` ON DELETE SET NULL |
| 3 | The deal form limits **Primary contact** to the chosen company, but the API accepted any contact (field-to-API mapping) | Inconsistent data through the API or the board | API rejects a contact who works at a different company (400) |
| 4 | Firm **Time zone** was free text (field-to-column mapping) | Typos such as `Europe/Londn` break date handling | API validates IANA names; the forms use a dropdown |
| 5 | `leads.status`, `tasks.type/priority/status` were ENUMs duplicated in the UI (Stage 5) | Lists could not be changed without code | Converted to `VARCHAR(40)`; values in `lookup_values`, validated by the API |
| 6 | `leads.source` and `companies.industry` stored display labels (Stage 5) | Renaming a label would orphan records | Stored values converted to stable codes (96 rows); labels come from `lookup_values` |
| 7 | Dashboard "open leads" hard-coded `IN ('new','contacted','qualified')` | New custom statuses would be missed | Now `NOT IN ('unqualified','converted')` |

Checked and **already correct**: tenant FKs (`firm_id` → `firms` CASCADE) on every firm table, all currency/country references, task/deal/contact links, and no cross-firm references in the data (all integrity checks 0).

## 5. Migrations
Changes to existing databases are applied by `backend/db/migrate.js` (run by `npm run db:setup` / `npm run db:migrate`). Each step checks `information_schema` first, so re-running is safe. New installs get the same structure from `schema.sql` plus migrations.

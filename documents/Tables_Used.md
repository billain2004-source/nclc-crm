# NCLC CRM — Tables Used (Data Dictionary)

> **Document:** Tables Used v1.1 · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30) · **DDL:** [create_tables.sql](create_tables.sql) · **Diagram:** [ER_Diagram.md](ER_Diagram.md) · **Field mapping:** [Data_Relationships.md](Data_Relationships.md)

Database `nclc_crm`, MySQL 8, InnoDB, `utf8mb4_unicode_ci`. All `DATETIME` values are UTC. **18 tables, 50 foreign keys** (live inspection, 2026-11-21).

| # | Table | Scope | Purpose | Seed rows |
|---|---|---|---|---|
| 1 | `currencies` | global | ISO-4217 currencies | 12 |
| 2 | `countries` | global | Countries with default currency | 14 |
| 3 | `exchange_rates` | global | Rate per USD with history | 24 (2 dates × 12) |
| 4 | `firms` | tenant root | Tenant companies | 4 |
| 5 | `users` | firm (SA: none) | Logins and roles | 17 |
| 6 | `companies` | firm | Accounts / organisations | 48 (12/firm) |
| 7 | `contacts` | firm | People | 60 (15/firm) |
| 8 | `pipeline_stages` | firm | Deal stages | 24 (6/firm) |
| 9 | `leads` | firm | Unqualified prospects | 48 (12/firm) |
| 10 | `deals` | firm | Opportunities | 48 (12/firm) |
| 11 | `tasks` | firm | Activities / to-dos | 56 (14/firm) |
| 12 | `help_text` | global (firm_id 0) + firm overrides | Context help | 55 global + 1 override |
| 13 | `lookup_lists` | global | Dropdown lists (v1.1) | 9 |
| 14 | `lookup_values` | global (firm_id 0) + firm overrides / firm-only | Dropdown values (v1.1) | 49 global |
| 15 | `ai_task_types` | global | AI task types: text, image, audio, embedding (v1.1) | 4 |
| 16 | `api_keys` | platform (`firm_id NULL`) or firm | Encrypted AI provider keys (v1.1) | 7 **fake** placeholder keys (5 offline mock + 1 disabled "OpenAI - replace with your key" on the platform, 1 Northwind mock key that simulates a 429) |
| 17 | `api_key_usage_log` | platform or firm | Every AI call, switch, reset and test (v1.1) | 0 (grows with use) |
| 18 | `agent_runs` | firm | AI agent proposals and approvals (v1.1) | 0 (grows with use) |

---

### currencies
| Column | Type | Null | Notes |
|---|---|---|---|
| code | CHAR(3) PK | N | ISO code, e.g. GBP |
| name | VARCHAR(64) | N | |
| symbol | VARCHAR(8) | N | |
| decimals | TINYINT | N | default 2 |
| is_active | TINYINT(1) | N | default 1 |
| created_at | DATETIME | N | |

### countries
| Column | Type | Null | Notes |
|---|---|---|---|
| code | CHAR(2) PK | N | ISO-3166 alpha-2 |
| name | VARCHAR(80) | N | |
| currency_code | CHAR(3) FK→currencies | N | default currency |
| phone_code | VARCHAR(8) | Y | |

### exchange_rates
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INT UNSIGNED PK AI | N | |
| currency_code | CHAR(3) FK→currencies | N | |
| rate_per_usd | DECIMAL(18,6) | N | units per 1 USD |
| effective_date | DATE | N | UNIQUE(currency_code, effective_date) |
| source | VARCHAR(64) | Y | |
| created_by | INT UNSIGNED FK→users SET NULL | Y | user id (FK added in v1.1) |
| created_at | DATETIME | N | |

### firms
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INT UNSIGNED PK AI | N | |
| name | VARCHAR(150) UNIQUE | N | |
| country_code | CHAR(2) FK→countries | N | |
| base_currency | CHAR(3) FK→currencies | N | |
| timezone | VARCHAR(64) | N | default UTC; must be an IANA name (API check, v1.1) |
| domain | VARCHAR(120) | Y | |
| status | ENUM('active','suspended') | N | labels from lookup list `firm_status` (fixed values) |
| created_at / updated_at | DATETIME | N | |

### users
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INT UNSIGNED PK AI | N | |
| firm_id | INT UNSIGNED FK→firms CASCADE | Y | NULL = Super Admin |
| name | VARCHAR(120) | N | |
| email | VARCHAR(160) UNIQUE | N | login |
| password_hash | VARCHAR(100) | N | bcrypt |
| role | ENUM('super_admin','firm_admin','manager','team_user') | N | fixed on purpose (permissions depend on it; not a lookup list) |
| phone | VARCHAR(40) | Y | |
| is_active | TINYINT(1) | N | |
| last_login_at | DATETIME | Y | |
| created_at / updated_at | DATETIME | N | |

### companies
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INT UNSIGNED PK AI | N | |
| firm_id | FK→firms CASCADE | N | index (firm_id, name) |
| name | VARCHAR(150) | N | |
| domain, phone, email, city | VARCHAR | Y | |
| industry | VARCHAR(80) | Y | code from lookup list `company_industry` (e.g. `financial_services`) |
| country_code | CHAR(2) FK→countries | Y | |
| employees | INT UNSIGNED | Y | |
| annual_revenue | DECIMAL(16,2) | Y | in currency_code |
| currency_code | CHAR(3) FK→currencies | Y | |
| description | TEXT | Y | |
| owner_id | FK→users SET NULL | Y | |
| created_at / updated_at | DATETIME | N | |

### contacts
| Column | Type | Null | Notes |
|---|---|---|---|
| id | PK AI | N | |
| firm_id | FK→firms CASCADE | N | |
| company_id | FK→companies SET NULL | Y | |
| first_name, last_name | VARCHAR(80) | N | |
| email, phone, mobile, job_title, city | VARCHAR | Y | |
| lifecycle_stage | VARCHAR(32) | N | code from lookup list `contact_lifecycle` (default `lead`) |
| country_code | FK→countries | Y | |
| notes | TEXT | Y | |
| owner_id | FK→users SET NULL | Y | |
| created_at / updated_at | DATETIME | N | |

### pipeline_stages
| Column | Type | Null | Notes |
|---|---|---|---|
| id | PK AI | N | |
| firm_id | FK→firms CASCADE | N | UNIQUE(firm_id, name) |
| name | VARCHAR(60) | N | |
| sort_order | TINYINT | N | |
| probability | TINYINT UNSIGNED | N | default % |
| is_won / is_lost | TINYINT(1) | N | closing stages |

### leads
| Column | Type | Null | Notes |
|---|---|---|---|
| id | PK AI | N | |
| firm_id | FK→firms CASCADE | N | index (firm_id, status) |
| first_name, last_name | VARCHAR(80) | N | |
| email, phone, company_name, job_title | VARCHAR | Y | |
| source | VARCHAR(40) | Y | code from lookup list `lead_source` (e.g. `trade_show`) |
| status | VARCHAR(40) | N | lookup list `lead_status`, default `new` (was ENUM in v1.0; `converted` set only by conversion) |
| score | TINYINT UNSIGNED | N | 0–100 |
| estimated_value | DECIMAL(16,2) | Y | |
| currency_code | FK→currencies | Y | |
| country_code | FK→countries | Y | |
| notes | TEXT | Y | |
| owner_id | FK→users SET NULL | Y | |
| converted_contact_id / converted_company_id | FK SET NULL | Y | set by conversion |
| converted_deal_id | INT UNSIGNED FK→deals SET NULL | Y | FK `fk_leads_deal` added in v1.1 by `migrate.js` |
| converted_at | DATETIME | Y | |
| created_at / updated_at | DATETIME | N | |

### deals
| Column | Type | Null | Notes |
|---|---|---|---|
| id | PK AI | N | |
| firm_id | FK→firms CASCADE | N | index (firm_id, status) |
| name | VARCHAR(150) | N | |
| company_id / contact_id | FK SET NULL | Y | contact must work at the company (API check, v1.1) |
| stage_id | FK→pipeline_stages | N | |
| amount | DECIMAL(16,2) | N | in currency_code |
| currency_code | FK→currencies | N | |
| probability | TINYINT UNSIGNED | N | % |
| status | ENUM('open','won','lost') | N | derived from stage; labels from lookup list `deal_status` (fixed values) |
| expected_close_date | DATE | Y | |
| closed_at | DATETIME | Y | |
| description | TEXT | Y | |
| lead_id | FK→leads SET NULL | Y | origin lead |
| owner_id | FK→users SET NULL | Y | |
| created_at / updated_at | DATETIME | N | |

### tasks
| Column | Type | Null | Notes |
|---|---|---|---|
| id | PK AI | N | |
| firm_id | FK→firms CASCADE | N | index (firm_id, status, due_date) |
| title | VARCHAR(200) | N | |
| description | TEXT | Y | |
| type | VARCHAR(40) | N | lookup list `task_type`, default `todo` (was ENUM) |
| priority | VARCHAR(40) | N | lookup list `task_priority`, default `medium` (was ENUM) |
| status | VARCHAR(40) | N | lookup list `task_status`, default `open` (was ENUM); `done` sets completed_at |
| due_date / completed_at | DATETIME | Y | UTC |
| assigned_to / created_by | FK→users SET NULL | Y | |
| contact_id / deal_id | FK SET NULL | Y | |
| created_at / updated_at | DATETIME | N | |

### help_text
| Column | Type | Null | Notes |
|---|---|---|---|
| id | PK AI | N | |
| firm_id | INT UNSIGNED | N | **0 = global default**, otherwise the firm override. UNIQUE(firm_id, section_key) |
| section_key | VARCHAR(64) | N | e.g. `deals.amount` |
| title | VARCHAR(150) | N | |
| body | TEXT | N | plain text; line breaks preserved |
| updated_by | FK→users SET NULL | Y | |
| updated_at | DATETIME | N | auto-updated |

**Help section keys (55):** `login, roles, dashboard, dashboard.kpis, dashboard.pipeline, dashboard.tasks, dashboard.leads, dashboard.owners, contacts, contacts.basic, contacts.work, contacts.ownership, companies, companies.basic, companies.location, companies.financials, companies.ownership, leads, leads.basic, leads.qualification, leads.value, leads.convert, deals, deals.board, deals.basic, deals.amount, deals.stage, deals.relations, tasks, tasks.basic, tasks.schedule, tasks.links, admin.firms, admin.firms.form, admin.users, admin.users.form, admin.currencies, admin.rates.form, admin.help, settings.firm, settings.stages`, plus v1.1: `settings.api_keys, settings.api_keys.form, settings.api_keys.failover, settings.api_keys.test, settings.task_types, settings.api_usage, ai.agents, ai.lead_scoring, ai.followup_email, ai.deal_summary, settings.lookups, settings.lookups.scope, settings.lookups.values, settings.lookups.add`.

---

## v1.1 tables

### lookup_lists
| Column | Type | Null | Notes |
|---|---|---|---|
| code | VARCHAR(40) PK | N | e.g. `lead_status` |
| name | VARCHAR(80) | N | shown in Settings › Dropdown values |
| description | VARCHAR(255) | Y | |
| used_by | VARCHAR(255) | Y | `table.column` the list feeds |
| allow_custom | TINYINT(1) | N | 0 = fixed values (labels/order only) |
| firm_editable | TINYINT(1) | N | 0 = Super Admin only |
| sort_order | SMALLINT | N | |
| created_at | DATETIME | N | |

### lookup_values
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INT UNSIGNED PK AI | N | |
| firm_id | INT UNSIGNED | N | **0 = global default**; otherwise a firm override (same code) or a firm-only value. UNIQUE(firm_id, list_code, code) |
| list_code | VARCHAR(40) FK→lookup_lists CASCADE | N | |
| code | VARCHAR(40) | N | stable value stored in business tables |
| label | VARCHAR(100) | N | what users see |
| sort_order | SMALLINT | N | |
| is_active | TINYINT(1) | N | inactive = hidden from forms; existing records keep it |
| is_system | TINYINT(1) | N | used by program logic: cannot be deactivated/deleted |
| updated_by | FK→users SET NULL | Y | |
| created_at / updated_at | DATETIME | N | |

**Seeded lists and codes** (system codes in bold):
| List | Codes |
|---|---|
| lead_status | **new**, contacted, qualified, **unqualified**, **converted** |
| lead_source | website, referral, linkedin, trade_show, cold_call, email_campaign, partner, webinar |
| contact_lifecycle | subscriber, **lead**, **opportunity**, customer, evangelist, other |
| company_industry | agriculture, construction, education, energy, financial_services, food_and_beverage, healthcare, hospitality, insurance, logistics, manufacturing, media, retail, technology, other |
| task_type | call, **email**, meeting, **todo** |
| task_priority | high, **medium**, low |
| task_status | **open**, in_progress, **done** |
| deal_status *(fixed)* | **open**, **won**, **lost** |
| firm_status *(fixed, SA only)* | **active**, **suspended** |

### ai_task_types
| Column | Type | Null | Notes |
|---|---|---|---|
| code | VARCHAR(32) PK | N | text, image, audio, embedding (+ custom) |
| name | VARCHAR(80) | N | |
| description | VARCHAR(255) | Y | |
| reset_minutes | INT UNSIGNED | N | auto-reset of exhausted keys; 0 = manual only (default 60) |
| sort_order | SMALLINT | N | |
| is_active | TINYINT(1) | N | |
| created_at / updated_at | DATETIME | N | |

### api_keys
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INT UNSIGNED PK AI | N | |
| firm_id | FK→firms CASCADE | Y | **NULL = platform key** (Super Admin) |
| name | VARCHAR(100) | N | |
| provider | VARCHAR(32) | N | openai, anthropic, gemini, openrouter, groq, mock |
| model | VARCHAR(100) | Y | empty = provider default for the task type |
| task_type | VARCHAR(32) FK→ai_task_types (ON UPDATE CASCADE) | N | |
| priority | SMALLINT | N | lower is tried first (default 10) |
| status | ENUM('active','disabled','exhausted') | N | |
| is_primary | TINYINT(1) | N | one per (scope, task_type) |
| key_enc | TEXT | N | AES-256-GCM `v1:iv:tag:ciphertext` with `APP_ENC_KEY`; **never returned or exported** |
| key_last4 | CHAR(4) | N | the only part shown |
| usage_count / success_count / failure_count | INT UNSIGNED | N | |
| last_used_at, exhausted_at | DATETIME | Y | |
| last_error | VARCHAR(255) | Y | redacted |
| created_by / updated_by | FK→users SET NULL | Y | |
| created_at / updated_at | DATETIME | N | |

### api_key_usage_log
| Column | Type | Null | Notes |
|---|---|---|---|
| id | BIGINT UNSIGNED PK AI | N | |
| firm_id | FK→firms CASCADE | Y | firm whose call it was |
| key_id / to_key_id | FK→api_keys SET NULL | Y | `to_key_id` for `switch` events |
| task_type | VARCHAR(32) | N | |
| event | ENUM('success','failure','exhausted','switch','reset','test_ok','test_fail','all_failed') | N | |
| http_status | SMALLINT | Y | |
| error_type | VARCHAR(32) | Y | rate_limit, quota, auth, … |
| message | VARCHAR(255) | Y | redacted, never a key |
| source | VARCHAR(64) | Y | what made the call (agent, test, routing check, scheduled reset, …) |
| latency_ms | INT UNSIGNED | Y | |
| user_id | FK→users SET NULL | Y | |
| created_at | DATETIME | N | |

### agent_runs
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INT UNSIGNED PK AI | N | |
| firm_id | FK→firms CASCADE | N | |
| agent | VARCHAR(40) | N | lead_scoring, followup_email, deal_summary |
| entity_type / entity_id | VARCHAR(20) / INT UNSIGNED | N | lead or deal (no FK: polymorphic) |
| entity_label | VARCHAR(200) | Y | |
| task_type | VARCHAR(32) FK→ai_task_types | N | |
| status | ENUM('pending_approval','approved','rejected','failed') | N | |
| input_json / output_json / proposed_changes / attempts_json | JSON | N/Y | what was sent, returned, proposed, and each key tried |
| key_id | FK→api_keys SET NULL | Y | key that answered |
| key_name, provider, model | VARCHAR | Y | copied for history |
| error | VARCHAR(500) | Y | |
| latency_ms | INT UNSIGNED | Y | |
| created_by / reviewed_by | FK→users SET NULL | Y | |
| reviewed_at | DATETIME | Y | |
| review_note, applied_result | VARCHAR(255) | Y | |
| created_at / updated_at | DATETIME | N | |

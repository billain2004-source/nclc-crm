# NCLC CRM — Tables Used (Data Dictionary)

> **Document:** Tables Used v1.0 · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30) · **DDL:** [create_tables.sql](create_tables.sql) · **Diagram:** [ER_Diagram.md](ER_Diagram.md)

Database `nclc_crm`, MySQL 8, InnoDB, `utf8mb4_unicode_ci`. All `DATETIME` values are UTC.

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
| 12 | `help_text` | global (firm_id 0) + firm overrides | Context help | 41 global + 1 override |

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
| created_by | INT UNSIGNED | Y | user id |
| created_at | DATETIME | N | |

### firms
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INT UNSIGNED PK AI | N | |
| name | VARCHAR(150) UNIQUE | N | |
| country_code | CHAR(2) FK→countries | N | |
| base_currency | CHAR(3) FK→currencies | N | |
| timezone | VARCHAR(64) | N | default UTC |
| domain | VARCHAR(120) | Y | |
| status | ENUM('active','suspended') | N | |
| created_at / updated_at | DATETIME | N | |

### users
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INT UNSIGNED PK AI | N | |
| firm_id | INT UNSIGNED FK→firms CASCADE | Y | NULL = Super Admin |
| name | VARCHAR(120) | N | |
| email | VARCHAR(160) UNIQUE | N | login |
| password_hash | VARCHAR(100) | N | bcrypt |
| role | ENUM('super_admin','firm_admin','manager','team_user') | N | |
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
| domain, industry, phone, email, city | VARCHAR | Y | |
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
| lifecycle_stage | VARCHAR(32) | N | subscriber/lead/opportunity/customer/evangelist/other |
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
| email, phone, company_name, job_title, source | VARCHAR | Y | |
| status | ENUM('new','contacted','qualified','unqualified','converted') | N | |
| score | TINYINT UNSIGNED | N | 0–100 |
| estimated_value | DECIMAL(16,2) | Y | |
| currency_code | FK→currencies | Y | |
| country_code | FK→countries | Y | |
| notes | TEXT | Y | |
| owner_id | FK→users SET NULL | Y | |
| converted_contact_id / converted_company_id | FK SET NULL | Y | set by conversion |
| converted_deal_id | INT UNSIGNED | Y | no FK (avoids circular FK with deals.lead_id) |
| converted_at | DATETIME | Y | |
| created_at / updated_at | DATETIME | N | |

### deals
| Column | Type | Null | Notes |
|---|---|---|---|
| id | PK AI | N | |
| firm_id | FK→firms CASCADE | N | index (firm_id, status) |
| name | VARCHAR(150) | N | |
| company_id / contact_id | FK SET NULL | Y | |
| stage_id | FK→pipeline_stages | N | |
| amount | DECIMAL(16,2) | N | in currency_code |
| currency_code | FK→currencies | N | |
| probability | TINYINT UNSIGNED | N | % |
| status | ENUM('open','won','lost') | N | derived from stage |
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
| type | ENUM('call','email','meeting','todo') | N | |
| priority | ENUM('low','medium','high') | N | |
| status | ENUM('open','in_progress','done') | N | |
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

**Help section keys (41):** `login, roles, dashboard, dashboard.kpis, dashboard.pipeline, dashboard.tasks, dashboard.leads, dashboard.owners, contacts, contacts.basic, contacts.work, contacts.ownership, companies, companies.basic, companies.location, companies.financials, companies.ownership, leads, leads.basic, leads.qualification, leads.value, leads.convert, deals, deals.board, deals.basic, deals.amount, deals.stage, deals.relations, tasks, tasks.basic, tasks.schedule, tasks.links, admin.firms, admin.firms.form, admin.users, admin.users.form, admin.currencies, admin.rates.form, admin.help, settings.firm, settings.stages`.

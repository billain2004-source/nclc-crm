# NCLC CRM — API Reference

> **Document:** API Reference v1.0 · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30) · **Base URL:** `http://localhost:4000/api`

## Conventions
- **Auth:** `Authorization: Bearer <token>` from `POST /auth/login`. Every endpoint needs it except `/health`, `/auth/login` and `/help/public`.
- **Firm context:** firm users are always scoped to their own firm. The **Super Admin** sends `X-Firm-Id: <firmId>`. Module endpoints without it return `400 Select a firm first`.
- **Bodies:** JSON. **Errors:** `{ "error": "message" }` with status 400 / 401 / 403 / 404 / 409 / 500.
- **Lists:** `?q=&page=1&pageSize=25&sort=<column>&dir=asc|desc` plus module filters. The response is `{ data: [...], total, page, pageSize }`. `pageSize` ≤ 500.
- **Roles:** SA = super_admin, FA = firm_admin, MG = manager, TU = team_user.

## Health & auth
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/health` | public | `{ok, database, firms, time}` |
| POST | `/auth/login` | public | Body `{email, password}` → `{token, user, firm}` |
| GET | `/auth/me` | any | `{user, firm}` |
| POST | `/auth/change-password` | any | `{current_password, new_password}` (≥ 8 chars) |

## CRM modules (generic CRUD)
Each module supports: `GET /<m>` (list), `GET /<m>/:id`, `POST /<m>` (201 + record), `PUT /<m>/:id` (partial update, returns the record), `DELETE /<m>/:id`.

| Module | Writable fields | Required | List filters | Search | TU scope | Delete roles |
|---|---|---|---|---|---|---|
| `/contacts` | company_id, first_name, last_name, email, phone, mobile, job_title, lifecycle_stage, city, country_code, notes, owner_id | first_name, last_name | company_id, owner_id, lifecycle_stage | name, email, phone, company, title | all | SA, FA, MG |
| `/companies` | name, domain, industry, phone, email, city, country_code, employees, annual_revenue, currency_code, description, owner_id | name | industry, owner_id, country_code | name, domain, industry, city | all | SA, FA, MG |
| `/leads` | first_name, last_name, email, phone, company_name, job_title, source, status, score, estimated_value, currency_code, country_code, notes, owner_id | first_name, last_name | status, source, owner_id | name, email, company, source | own | all |
| `/deals` | name, company_id, contact_id, stage_id, amount, currency_code, probability, expected_close_date, description, owner_id | name | stage_id, status, owner_id, company_id | name, company, contact | own | all |
| `/tasks` | title, description, type, priority, status, due_date, assigned_to, contact_id, deal_id | title | status, priority, type, assigned_to, deal_id, contact_id, `due=overdue\|today\|week`, `open=1` | title, description, deal, contact | assigned or created by me | all |

Common list parameter `mine=1` filters to records owned by or assigned to the caller.

**Computed response fields:** contacts `full_name, company_name, owner_name` · companies `owner_name, contact_count, deal_count, annual_revenue_base, base_currency` · leads `full_name, owner_name, estimated_value_base, base_currency` · deals `stage_name, stage_order, company_name, contact_name, owner_name, amount_base, weighted_base, base_currency` · tasks `assigned_name, created_by_name, contact_name, deal_name`.

### Module-specific endpoints
| Method | Path | Description |
|---|---|---|
| POST | `/leads/:id/convert` | Body `{create_deal=true, deal_name?, amount?, currency_code?, stage_id?, expected_close_date?}` → `{ok, contact_id, company_id, deal_id}`. 400 if already converted. |
| GET | `/deals/board` | `{base_currency, stages:[{id,name,probability,is_won,is_lost,total_base,deals:[...]}]}`. Optional `owner_id`. |

### Example
```http
PUT /api/deals/42
Authorization: Bearer eyJ...
Content-Type: application/json

{ "stage_id": 5 }
```
→ `200` deal with `status:"won"`, `probability:100`, `closed_at` set, plus `amount_base`.

## Dashboard
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/dashboard` | any (firm) | `{firm, scope:'firm' or 'mine', counts, pipeline{open_value, weighted_value, won_value, won_count, lost_count, win_rate}, by_stage[], by_owner[], leads_by_status[], leads_by_source[], tasks{overdue, due_today, open_total, upcoming[]}, recent_deals[]}`. All money is in base currency. TU gets `scope:'mine'`. |

## Administration
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/users/lookup` | any (firm) | Active users of the firm `[{id,name,role}]` for dropdowns |
| GET | `/users` | SA, FA | FA: own firm. SA: selected firm, or all firms when no firm is selected (or `all=1`). Filters `q`, `role`. |
| POST | `/users` | SA, FA | `{name, email, role, password, phone?, is_active?, firm_id? (SA)}` |
| PUT | `/users/:id` | SA, FA | Partial. `password` optional. You can't change your own role or deactivate yourself. |
| DELETE | `/users/:id` | SA, FA | Not yourself. Records become unassigned. |
| GET | `/firms` | SA | All firms with `user_count, contact_count, deal_count` |
| POST | `/firms` | SA | `{name, country_code, base_currency, timezone?, domain?, status?, admin_name?, admin_email?, admin_password?}`. Creates the default stages. |
| PUT | `/firms/:id` | SA | Partial (incl. `status: active|suspended`) |
| GET | `/firm` | any (firm) | Current firm with `country_name, currency_symbol, currency_name` |
| PUT | `/firm` | SA, FA | `{name, country_code, base_currency, timezone, domain}` |
| GET | `/firm/stages` | any (firm) | Pipeline stages |
| PUT | `/firm/stages/:id` | SA, FA | `{name?, probability?}` |

## Reference data
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/ref/countries` | any | |
| GET | `/ref/currencies` | any | Each currency with its latest `rate_per_usd`, `effective_date` |
| POST | `/ref/currencies` | SA | `{code, name, symbol, decimals?, rate_per_usd?}` |
| PUT | `/ref/currencies/:code` | SA | `{name?, symbol?, is_active?}` (USD can't be deactivated) |
| GET | `/ref/exchange-rates` | any | History (latest 300). `?currency=EUR` |
| POST | `/ref/exchange-rates` | SA | `{currency_code, rate_per_usd, effective_date?, source?}`. Upserts on (currency, date). |
| GET | `/ref/convert?amount=&from=&to=` | any | `{result}` using the latest rates |

## Help text
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/help/public` | public | Global help map (used on the login page) |
| GET | `/help` | any | Map `section_key → {section_key,title,body,firm_id,scope,updated_by_name,updated_at}`. Firm overrides win. |
| PUT | `/help/:key` | SA, FA | `{title, body, scope?}`. FA → own-firm override. SA → global, or `scope:"firm"` for the selected firm. |
| DELETE | `/help/:key` | SA, FA | Removes the override (FA, or SA with `?scope=firm`). SA without scope deletes the global row. |

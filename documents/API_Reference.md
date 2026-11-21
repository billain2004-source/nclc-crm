# NCLC CRM — API Reference

> **Document:** API Reference v1.1 · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30) · **Base URL:** `http://localhost:4000/api`

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

**Dropdown fields (v1.1):** these fields must hold an **active code** from `/lookups` for the caller's firm, otherwise the response is `400`: `contacts.lifecycle_stage`, `companies.industry`, `leads.status`, `leads.source`, `tasks.type`, `tasks.priority` and `tasks.status`. An unchanged value is always accepted on update, even if it was deactivated since. Empty strings become `null`. `leads.source` and `companies.industry` store codes (e.g. `trade_show`, `financial_services`), not labels.

**Other v1.1 rules:**
- `/deals`: `contact_id` must belong to `company_id` when both are set, otherwise 400.
- `/firm` and `/firms`: `timezone` must be a valid IANA name (e.g. `Europe/London`), otherwise 400.

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
| GET | `/dashboard` | any (firm) | `{firm, scope:'firm' or 'mine', counts, pipeline{open_value, weighted_value, won_value, won_count, lost_count, win_rate}, by_stage[], by_owner[], leads_by_status[{status,label,count}], leads_by_source[{source,label,count}], tasks{overdue, due_today, open_total, upcoming[]}, recent_deals[]}`. All money is in base currency. TU gets `scope:'mine'`. `counts.open_leads` = leads not `unqualified`/`converted`. Labels come from `/lookups`. |

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

## Dropdown values (v1.1)
Lists: `lead_status`, `lead_source`, `contact_lifecycle`, `company_industry`, `task_type`, `task_priority`, `task_status`, `deal_status` (fixed), `firm_status` (fixed, SA only). Each value has `{list_code, code, label, sort_order, is_active, is_system, scope: global|override|firm_only, default_label, default_active, default_sort}`.

**Scope for writes:** a FA always writes the current firm. A SA sends `scope: "firm"` (selected firm) or `"global"` (defaults, `firm_id 0`); the default is `global` when no firm is selected. A FA sending `scope: "global"` gets 403.

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/lookups` | any | `{lists[], values: {list_code: [...]}}`, effective values for the caller's firm (global merged with firm overrides), inactive ones included with `is_active:false` |
| GET | `/lookups/:list` | any | `{list, values}`. `?usage=1` (SA/FA) adds `in_use` counts per code |
| POST | `/lookups/:list/values` | SA, FA | `{label, code?, sort_order?, scope?}` → 201. Code is generated from the label if omitted (`a-z0-9_`). 409 duplicate code; 400 on fixed lists |
| PUT | `/lookups/:list/values/:code` | SA, FA | `{label?, sort_order?, is_active?, scope?}`. In firm scope this creates/updates a firm override. 400 when deactivating a system value |
| POST | `/lookups/:list/reorder` | SA, FA | `{codes: [...], scope?}` → values in new order (sort_order 10, 20, …) |
| DELETE | `/lookups/:list/values/:code` | SA, FA | Firm scope: removes the override (`reset_to_default:true`) or an unused firm-only value. Global (SA): removes an unused non-system default and its firm overrides. 409 if the value is in use |

## AI: API keys and routing (v1.1)
All `/ai` endpoints: **SA, FA** only (MG/TU 403). Scope: a FA always works on its own firm's keys. A SA uses `scope=firm` (selected firm, the default when one is selected) or `scope=platform` (`firm_id NULL` fallback keys), as a query parameter or body field. **Responses never contain the key**, only `key_last4`.

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/ai/providers` | SA, FA | `[{code, label, task_types[], default_models}]`: openai, anthropic, gemini, openrouter, groq, mock |
| GET | `/ai/task-types` | SA, FA | Task types with `key_count, active_count, primary_key_name, primary_key_status, platform_active_count` |
| POST | `/ai/task-types` | SA | `{code, name, description?, reset_minutes?, sort_order?}` (`reset_minutes` 0 = manual reset only) |
| PUT | `/ai/task-types/:code` | SA | `{name?, description?, reset_minutes?, sort_order?, is_active?}` |
| GET | `/ai/keys` | SA, FA | `{scope, firm_id, platform_active_keys, data:[{id, name, provider, model, task_type, priority, is_primary, status, exhausted_at, resets_at, key_last4, usage_count, success_count, failure_count, last_used_at, last_error, ...}]}`. `?task_type=` |
| POST | `/ai/keys` | SA, FA | `{name, provider, task_type, key, model?, priority?=10, status?, is_primary?, scope?}` → 201. The key is encrypted (AES-256-GCM). The first key of a task type becomes primary |
| PUT | `/ai/keys/:id` | SA, FA | Partial; send `key` only to replace it |
| DELETE | `/ai/keys/:id` | SA, FA | |
| POST | `/ai/keys/:id/primary` | SA, FA | Make it the only primary for its task type and scope |
| POST | `/ai/keys/:id/reset` | SA, FA | Exhausted → active |
| POST | `/ai/keys/reset-exhausted` | SA, FA | `{scope?}` → `{reset: n}` |
| POST | `/ai/keys/:id/test` | SA, FA | Tiny call with this key only → `{ok, sample?, http_status?, error_type?, message?, exhausted, key}`; logged as `test_ok`/`test_fail` |
| POST | `/ai/try` | SA, FA | `{task_type, prompt?, scope?}` runs `llmRouter.callLLM` → `{result, model, key:{id,name,provider,model,scope}, attempts[]}`; 400 unknown task type, 503 no key, 502 all keys failed |
| GET | `/ai/usage` | SA, FA | `{data: [log rows], last30d: {event: count}}`. `?limit=` (≤ 500), `key_id=`, `event=`. Events: success, failure, exhausted, switch, reset, test_ok, test_fail, all_failed |
| POST | `/ai/reset-sweep` | SA | Runs the scheduled reset now |

**Failover rules (`llmRouter.callLLM`):** keys are tried firm-first then platform, primary first, then by `priority` ascending. HTTP 429/402/401/403 (or a 400 that mentions quota or an invalid key) marks the key `exhausted` with `exhausted_at` and moves on, logging `exhausted` and `switch`. Exhausted keys return to `active` after the task type's `reset_minutes` (checked every `AI_KEY_RESET_SWEEP_MINUTES`) or by manual reset.

## AI agents (v1.1)
Firm context required. Results are **proposals**: nothing is written until approved.

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/agents` | any | `[{code, name, description, entities, task_type, writes, editable}]`: `lead_scoring`, `followup_email`, `deal_summary` |
| POST | `/agents/:agent/run` | any with access to the record | `{entity_type: 'lead'\|'deal', entity_id}` → 201 run with `status:'pending_approval', output_json, proposed_changes, key_name, provider, model, attempts_json`. 400 wrong record type; 404 no access |
| GET | `/agents/runs` | any | `?status=&agent=&entity_type=&entity_id=&limit=` → `{data, counts: {status: n}}`. TU: own runs only |
| GET | `/agents/runs/:id` | any | One run (404 for another firm, or for a TU who isn't the creator) |
| POST | `/agents/runs/:id/approve` | creator, MG, FA, SA | `{output?: {edited fields}, note?}`: re-checks access, applies the changes in a transaction → run `approved` with `applied_result`. 400 if already reviewed |
| POST | `/agents/runs/:id/reject` | creator, MG, FA, SA | `{note?}` → `rejected`, nothing written |

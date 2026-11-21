# NCLC CRM — Test Cases

> **Document:** Test Cases v1.1 · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30)

## How to run
- **Automated API regression** (130 checks): start the API, then `cd backend; npm run test:api`.
- **UI walkthrough:** headless Microsoft Edge driven by puppeteer-core logged in as each role, visited every page, and checked for console errors, help icons and the help-edit flow. Screenshots were reviewed manually.
- **Database inspection:** `cd backend; node scripts/inspect-db.js` (tables, keys, indexes, 14 integrity checks; see [Data_Relationships.md](Data_Relationships.md)).
- **Backup restore test:** run `scripts\backup.ps1`, unzip, then load `database/*.sql` into a scratch database and compare row counts.

## Latest results
| Run | When (IST) | Result |
|---|---|---|
| API smoke test (first run on fresh DB) | 2026-11-21, before 01:51 | 58 / 58 passed |
| UI walkthrough (SA, FA, MG, TU) | 2026-11-21, before 01:51 | all pages rendered, 0 console/page errors |
| API smoke test after UTC fix + `db:reset` | 2026-11-21 01:51 | 58 / 58 passed |
| Restart check (Stage 5): stop → verify down → start | 2026-11-21 01:56–01:57 | 260/260 module rows unchanged; help edit persisted; 60 / 60 API checks passed (incl. 2 new suspension checks); UI walkthrough 0 errors |
| All 17 demo logins (Stage 6) | 2026-11-21 01:57 | 17 / 17 signed in |
| **Part B** Stage 1+2 (API keys, agents) | 2026-11-21, before 13:56 | 102 / 102 passed |
| Part B Stage 3: backup zip + restore into scratch DB | 2026-11-21 13:56 | 87 files; no `.env`/node_modules/logs/dist; `api_keys` & usage log not exported; 14/14 business tables restored with identical row counts |
| Part B Stage 3: clean clone from GitHub + `setup.ps1` | 2026-11-21 ~14:00 | 86 tracked files; `.env` created with generated `JWT_SECRET`/`APP_ENC_KEY`, `DB_PASSWORD` left empty |
| Part B Stage 4: relationship fixes + `inspect-db.js` | 2026-11-21 | 107 / 107 passed; 14/14 integrity checks 0 |
| Part B Stage 5: dropdown values | 2026-11-21 | 130 / 130 passed (one bug found and fixed: Firm Admin `scope: global` was silently saved as a firm override, now 403) |
| **FINAL:** stop → verify ports closed → start → API tests | 2026-11-21 14:16 | Both servers up; **130 / 130 passed** |
| FINAL: UI walkthrough, 4 roles, every page incl. new Settings screens | 2026-11-21 14:16 | All pages rendered with help icons; 0 console/page errors; Manager → Dropdown values and Team User → API Keys correctly show "You do not have access"; lead form shows labels from the API |
| FINAL: all 17 demo logins | 2026-11-21 14:18 | 17 / 17 signed in |

## 1. Authentication
| ID | Test | Steps | Expected | Auto |
|---|---|---|---|---|
| TC-AUTH-01 | Valid login per role | Log in as SA, FA, MG, TU (User Manual §2) | 200, token, correct dashboard | ✅ |
| TC-AUTH-02 | Wrong password | Login with a bad password | 401 "Invalid email or password" | ✅ |
| TC-AUTH-03 | No token | GET /contacts without a token | 401 | ✅ |
| TC-AUTH-04 | Suspended firm | SA suspends Marina Bay → its user logs in | 403. After re-activation, 200 | ✅ |
| TC-AUTH-05 | Session expiry | Token past `JWT_EXPIRES_IN` | 401 → UI returns to login | manual |

## 2. Tenant isolation
| ID | Test | Expected | Auto |
|---|---|---|---|
| TC-TEN-01 | FA (Northwind) GET a Sahyadri contact by id | 404 | ✅ |
| TC-TEN-02 | FA PUT a Sahyadri contact | 404, no change | ✅ |
| TC-TEN-03 | FA sends `X-Firm-Id` of another firm | Header ignored, own data only | ✅ |
| TC-TEN-04 | MG (Sahyadri) creates a contact linked to a Northwind company_id | 400 "not found in this firm" | ✅ |
| TC-TEN-05 | SA without firm context calls /contacts | 400 "Select a firm first" | ✅ |
| TC-TEN-06 | SA with `X-Firm-Id` | Sees that firm's data | ✅ |

## 3. Role-based access
| ID | Test | Expected | Auto |
|---|---|---|---|
| TC-RBAC-01 | FA GET /firms | 403 | ✅ |
| TC-RBAC-02 | MG GET /users | 403 | ✅ |
| TC-RBAC-03 | TU GET /users | 403. UI shows "You do not have access" | ✅ |
| TC-RBAC-04 | TU POST exchange rate | 403 | ✅ |
| TC-RBAC-05 | TU lists leads/deals | Only `owner_id = self` | ✅ |
| TC-RBAC-06 | TU deletes a contact | 403 | ✅ |
| TC-RBAC-07 | TU creates a task assigned to someone else | 403 | ✅ |
| TC-RBAC-08 | FA creates a super_admin user | 403 | ✅ |
| TC-RBAC-09 | MG/TU edit help | 403 | ✅ |
| TC-RBAC-10 | Admin and Settings menu items per role | SA: Firms/Users/Currencies/Help + Settings (Firm settings, API Keys, Dropdown values). FA: same without Firms. MG/TU: Currencies only, no Settings | UI ✅ |
| TC-RBAC-11 | MG/TU open `/settings/api-keys` or `/settings/dropdowns` | "You do not have access"; API returns 403 | ✅ |

## 4. Modules
| ID | Test | Expected | Auto |
|---|---|---|---|
| TC-MOD-01 | Seed volume | ≥10 rows each in contacts, companies, leads, deals, tasks | ✅ |
| TC-MOD-02 | Manager create/update/delete contact | 201 / 200 / 200; owner defaults to the creator | ✅ |
| TC-MOD-03 | Required field missing | 400 "last name is required" | ✅ |
| TC-MOD-04 | Search contacts "Taylor" | Matching rows only | manual |
| TC-MOD-05 | Paging | 25 rows per page, pager shown when > 25 | manual |
| TC-MOD-06 | New deal defaults | First stage, its probability | ✅ |
| TC-MOD-07 | Move deal to Closed Won | status=won, probability=100, closed_at set | ✅ |
| TC-MOD-08 | Board endpoint | 6 stages with totals | ✅ |
| TC-MOD-09 | Drag a card on the board (UI) | Card moves, column totals update | manual |
| TC-MOD-10 | Set lead status to converted via PUT | 400 | ✅ |
| TC-MOD-11 | Convert lead | Company + contact + deal created, lead converted | ✅ |
| TC-MOD-12 | Convert twice | 400 | ✅ |
| TC-MOD-13 | Task done checkbox | status=done, completed_at set; row struck through | manual |
| TC-MOD-14 | Overdue tasks | Red tint + ⚠ in the list and on the dashboard | UI ✅ |

## 5. Multi-currency
| ID | Test | Expected | Auto |
|---|---|---|---|
| TC-CUR-01 | Firms have different base currencies | GBP, INR, USD, SGD | ✅ |
| TC-CUR-02 | EUR deal in GBP firm | amount_base = amount × rate(GBP)/rate(EUR) (±0.01) | ✅ |
| TC-CUR-03 | USD deal in INR firm | amount_base > amount, base_currency INR | ✅ |
| TC-CUR-04 | SA adds a new rate for EUR | Latest rate used immediately in conversions | manual |
| TC-CUR-05 | Number formatting follows the firm country | UK £302.2k; India ₹53.2L | UI ✅ |

## 6. Dashboard
| ID | Test | Expected | Auto |
|---|---|---|---|
| TC-DSH-01 | Dashboard for FA, MG, TU, SA+firm | 200, 6 stages, base currency | ✅ |
| TC-DSH-02 | TU dashboard scope | "Your figures", only own data | UI ✅ |
| TC-DSH-03 | Bar hover tooltip | Shows the stage value, count and probability | UI ✅ |

## 7. Help text
| ID | Test | Expected | Auto |
|---|---|---|---|
| TC-HLP-01 | Public help for the login page | Contains `login` | ✅ |
| TC-HLP-02 | Help coverage | ≥ 30 sections (41 seeded) | ✅ |
| TC-HLP-03 | Firm override visible only to that firm | Northwind `deals` = firm; others = global | ✅ |
| TC-HLP-04 | FA saves an override | scope=firm, updated_by = FA name | ✅ |
| TC-HLP-05 | Override doesn't leak | Other firm still sees global | ✅ |
| TC-HLP-06 | Reset to default | Falls back to global | ✅ |
| TC-HLP-07 | SA edits global | scope=global | ✅ |
| TC-HLP-08 | "?" present on every page, card and form group | Icons render; popover opens; Edit visible for FA/SA only | UI ✅ |
| TC-HLP-09 | Edit help through the UI | Modal saves and closes; popover shows the new text | UI ✅ |

## 8. Settings › API Keys and llmRouter (Part B Stage 1)
| ID | Test | Expected | Auto |
|---|---|---|---|
| TC-KEY-01 | List keys as FA / SA (firm and platform scope) | Only `key_last4` returned, never `key_enc` or the key | ✅ |
| TC-KEY-02 | Add a key | 201, response shows only the last 4; stored encrypted (`v1:` AES-256-GCM, checked in the DB by hand) | ✅ + manual |
| TC-KEY-03 | MG/TU call `/ai/keys` | 403 | ✅ |
| TC-KEY-04 | FA edits/tests another firm's key; FA asks for `scope=platform`; FA sends another firm's `X-Firm-Id` | 404; forced back to own firm scope; header ignored | ✅ |
| TC-KEY-05 | Failover: primary key returns 429 | Key marked `exhausted` with time; next key answers; `switch` and `exhausted` rows in the usage log | ✅ |
| TC-KEY-06 | All keys fail | 502 with attempts; `all_failed` logged | manual (not automated) |
| TC-KEY-06b | Firm keys unavailable | Falls back to platform keys | ✅ |
| TC-KEY-07 | Reset one / all exhausted keys | Status back to `active`; `reset` logged | ✅ |
| TC-KEY-08 | Automatic reset after `reset_minutes` | Sweep reactivates the key; `reset` with source `schedule` | ✅ (verified once by hand) |
| TC-KEY-09 | Test key (good / 429 key) | `test_ok` / `test_fail` + exhausted | ✅ |
| TC-KEY-10 | Make primary | Only one primary per task type and scope | ✅ |
| TC-KEY-11 | Logs and API responses contain no key strings | Usage log and responses: automated; `logs/*.log` scanned by hand | ✅ + manual |
| TC-KEY-12 | Task types: list has text/image/audio/embedding; FA adds one | 4 types / 403 | ✅ |
| TC-KEY-13 | Unknown task type, key without a value | 400 / 400 | ✅ |

## 9. AI agents (Part B Stage 2)
| ID | Test | Expected | Auto |
|---|---|---|---|
| TC-AGT-01 | Run lead scoring | `agent_runs` row `pending_approval`; lead score **unchanged** | ✅ |
| TC-AGT-02 | Approve (with edited score) | Lead score = edited value; run `approved`, reviewer recorded | ✅ |
| TC-AGT-03 | Reject | Nothing written; run `rejected` | ✅ |
| TC-AGT-04 | Follow-up email approve | Email task created, due tomorrow, assigned to approver | ✅ |
| TC-AGT-05 | Deal summary approve | Dated summary appended to `deals.description` | ✅ |
| TC-AGT-06 | Run when the first key is exhausted | Run records failover attempts and the key that answered | ✅ |
| TC-AGT-07 | TU runs an agent on someone else's lead / own lead; lists runs | 404 / 201; sees own runs only | ✅ |
| TC-AGT-08 | Approve twice | 400 (already reviewed) | ✅ |
| TC-AGT-09 | Agent input minimisation | Lead scoring input contains no name or email | ✅ |
| TC-AGT-10 | Another firm opens a run | 404 | ✅ |

## 10. Backup, setup and Git (Part B Stage 3)
| ID | Test | Expected | Auto |
|---|---|---|---|
| TC-BAK-01 | `scripts\backup.ps1` | Zip in `backups/`; excludes node_modules, `.env*`, logs, dist, `.git` | ✅ script check |
| TC-BAK-02 | Key data in backup | `api_keys`/`api_key_usage_log` rows not exported; `agent_runs.key_id` NULL; no `v1:` ciphertext or `APP_ENC_KEY` value in any file | ✅ |
| TC-BAK-03 | Restore `db_schema.sql` + `db_data.sql` into a scratch DB | Same row counts as live for all business tables | manual (passed 13:56) |
| TC-GIT-01 | `git ls-files` | No `.env`, keys, logs, backups or node_modules tracked; staged content has no key material | manual (passed) |
| TC-GIT-02 | Commit message | No Co-Authored-By / Claude attribution | manual (passed) |
| TC-SET-01 | Fresh clone + `setup.ps1` | Dependencies installed; `.env` generated without a DB password | manual (passed) |

## 11. Data relationships (Part B Stage 4)
| ID | Test | Expected | Auto |
|---|---|---|---|
| TC-REL-01 | Deal whose primary contact works at another company | 400 | ✅ |
| TC-REL-02 | Deal with matching company + contact | 201 | ✅ |
| TC-REL-03 | Invalid firm time zone (`Mars/Olympus`) / valid IANA zone | 400 / 200 | ✅ |
| TC-REL-04 | Delete a deal created by lead conversion | `leads.converted_deal_id` becomes NULL (FK `fk_leads_deal`) | ✅ |
| TC-REL-05 | `inspect-db.js` integrity checks | All 14 return 0 | manual (passed) |
| TC-REL-06 | `npm run db:migrate` twice | Second run: "Schema is up to date" | manual (passed) |

## 12. Dropdown values (Part B Stage 5)
| ID | Test | Expected | Auto |
|---|---|---|---|
| TC-LKP-01 | `GET /lookups` as any role | 9 lists with values in sort order | ✅ |
| TC-LKP-02 | MG edits a value | 403 | ✅ |
| TC-LKP-03 | Save a record with an unknown code (lead source, task priority) | 400 | ✅ |
| TC-LKP-04 | FA adds a firm-only value | 201, code generated from label, scope `firm_only`; duplicate → 409 | ✅ |
| TC-LKP-05 | Record uses the new value; delete it | 409 "used by N record(s)" | ✅ |
| TC-LKP-06 | Deactivate the value | New records → 400; existing record keeps it on edit | ✅ |
| TC-LKP-07 | Firm-only value visible to another firm | No | ✅ |
| TC-LKP-08 | FA relabels a default value | `override` for that firm; other firms see the default | ✅ |
| TC-LKP-09 | Deactivate a system value (`converted`) | 400 | ✅ |
| TC-LKP-10 | Add a value to a fixed list (deal status) | 400 | ✅ |
| TC-LKP-11 | FA edits global defaults / firm status list | 403 / 403 | ✅ |
| TC-LKP-12 | Reorder | New order returned and used by forms | ✅ |
| TC-LKP-13 | Dashboard labels | Lead status labels come from lookups | ✅ |
| TC-LKP-14 | Reset override / delete unused firm-only value | Default label back / 200 | ✅ |
| TC-LKP-15 | SA edits a global default | All firms see it | ✅ |
| TC-LKP-16 | Forms load options from the API | Lead form shows "LinkedIn" for stored code `linkedin`; deactivated current values shown as "(inactive)" | UI ✅ |
| TC-LKP-17 | Migration of v1 data | ENUM → VARCHAR; 96 stored labels (sources, industries) converted to codes; 0 unknown codes | manual (passed) |

## 13. Persistence and restart
| ID | Test | Expected |
|---|---|---|
| TC-RST-01 | Stop both servers, start again | Health OK, login works for all roles |
| TC-RST-02 | Data after restart | Same row counts as before the restart |
| TC-RST-03 | Help text after restart | Edits made before the restart are still present |

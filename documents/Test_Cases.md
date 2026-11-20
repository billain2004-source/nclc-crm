# NCLC CRM — Test Cases

> **Document:** Test Cases v1.0 · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30)

## How to run
- **Automated API regression** (60 checks): start the API, then `cd backend; npm run test:api`.
- **UI walkthrough:** headless Microsoft Edge driven by puppeteer-core logged in as each role, visited every page, and checked for console errors, help icons and the help-edit flow. Screenshots were reviewed manually.

## Latest results
| Run | When (IST) | Result |
|---|---|---|
| API smoke test (first run on fresh DB) | 2026-11-21, before 01:51 | 58 / 58 passed |
| UI walkthrough (SA, FA, MG, TU) | 2026-11-21, before 01:51 | all pages rendered, 0 console/page errors |
| API smoke test after UTC fix + `db:reset` | 2026-11-21 01:51 | 58 / 58 passed |
| Restart check (Stage 5): stop → verify down → start | 2026-11-21 01:56–01:57 | 260/260 module rows unchanged; help edit persisted; 60 / 60 API checks passed (incl. 2 new suspension checks); UI walkthrough 0 errors |
| All 17 demo logins (Stage 6) | 2026-11-21 01:57 | 17 / 17 signed in |

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
| TC-RBAC-10 | Admin menu items per role | SA: Firms/Users/Currencies/Help/Settings. FA: all but Firms. MG/TU: Currencies only | UI ✅ |

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

## 8. Persistence and restart
| ID | Test | Expected |
|---|---|---|
| TC-RST-01 | Stop both servers, start again | Health OK, login works for all roles |
| TC-RST-02 | Data after restart | Same row counts as before the restart |
| TC-RST-03 | Help text after restart | Edits made before the restart are still present |

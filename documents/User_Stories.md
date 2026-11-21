# NCLC CRM — User Stories

> **Document:** User Stories v1.1 · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30)

Format: *As a <role>, I want <goal> so that <benefit>.* Acceptance criteria (AC) are testable. Status ✅ = implemented and covered by [Test Cases](Test_Cases.md).

## Epic A — Platform & tenancy
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| US-A1 | As a **Super Admin**, I want to create firms with a country and base currency so that each client business gets its own isolated CRM. | Firm created with 6 default stages. Optional first Firm Admin. Duplicate name → error. | ✅ |
| US-A2 | As a **Super Admin**, I want to switch between firms so that I can support any tenant. | Firm selector in the top bar. All pages reload for the chosen firm. | ✅ |
| US-A3 | As a **Super Admin**, I want to suspend a firm so that its users can't sign in while the data is kept. | Status = suspended → that firm's users get 403 at login and on API calls. | ✅ |
| US-A4 | As a **firm user**, I want my data to be invisible to other firms so that our pipeline stays confidential. | Cross-firm ids return 404. Linking to another firm's records returns 400. | ✅ |

## Epic B — Users & roles
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| US-B1 | As a **Firm Admin**, I want to add and deactivate users in my firm so that I control access. | Can create FA/MG/TU only. Can't touch other firms or Super Admins. | ✅ |
| US-B2 | As a **Manager**, I want to see and reassign all firm records so that I can balance the team's workload. | Owner dropdowns enabled. Sees every lead, deal and task. | ✅ |
| US-B3 | As a **Team User**, I want to see only my own leads, deals and tasks so that my workspace is focused. | Lists and dashboard filtered to `owner_id`/`assigned_to` = me. | ✅ |
| US-B4 | As a **Firm Admin**, I want role permissions enforced on the server so that nobody can bypass them with API calls. | Forbidden calls return 403 regardless of the UI. | ✅ |

## Epic C — Multi-currency
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| US-C1 | As a **salesperson**, I want to record a deal in the customer's currency so that the quote matches what they pay. | Currency selector on deals, leads and companies. | ✅ |
| US-C2 | As a **manager**, I want all totals in our base currency so that I can compare deals. | Lists show `≈ base` for foreign amounts. Dashboard sums are in base. | ✅ |
| US-C3 | As a **Super Admin**, I want to maintain exchange rates with history so that conversions are current and auditable. | Add a rate per date. History table. Latest rate used. | ✅ |

## Epic D — CRM modules
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| US-D1 | As a **user**, I want to search and filter contacts so that I find people quickly. | Search by name, email, phone, company or title. Filter by stage and owner. Paging. | ✅ |
| US-D2 | As a **user**, I want companies to show their contacts and deals count so that I know the account's value. | Counts in the list. Revenue converted to base. | ✅ |
| US-D3 | As a **salesperson**, I want to qualify leads with status and score so that I focus on the best ones. | Status pills, score bar, source filter. | ✅ |
| US-D4 | As a **salesperson**, I want to convert a qualified lead in one click so that I don't retype data. | Creates company, contact and (optionally) deal. Lead marked converted. Can't convert twice. | ✅ |
| US-D5 | As a **salesperson**, I want a drag-and-drop pipeline board so that updating deal stages is fast. | Drag a card → stage, probability and status updated. Column totals in base. | ✅ |
| US-D6 | As a **user**, I want tasks with due dates and priorities, and overdue highlighting, so that nothing slips. | Overdue rows highlighted. Due filters. Done checkbox stamps the completion time. | ✅ |
| US-D7 | As a **manager**, I want a dashboard with pipeline, forecast, win rate and task alerts so that I can run the team. | KPIs, stage bars, owner bars, overdue badge, recent deals. | ✅ |

## Epic E — Contextual help
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| US-E1 | As a **new user**, I want a "?" next to every section and field group so that I understand each screen. | 41 help keys. Popover shows the title, body, and who updated it and when. | ✅ |
| US-E2 | As a **Firm Admin**, I want to edit help text for my firm so that it reflects our own process. | Edit from the popover or Admin › Help text. Saved as a firm override. Reset to default. | ✅ |
| US-E3 | As a **Super Admin**, I want to edit the default help for all firms so that guidance stays consistent. | Scope "All firms (global)". Firms without an override see the change. | ✅ |
| US-E4 | As **any user**, I want help on the login screen so that I know how to get access. | "?" on the login page uses public global help. | ✅ |
| US-E5 *(v1.1)* | As an **admin**, I want help on every new Settings page so that I can configure AI keys and dropdowns safely. | 14 new help keys (`settings.api_keys*`, `settings.task_types`, `settings.api_usage`, `ai.*`, `settings.lookups*`). | ✅ |

## Epic F — AI keys and agents (v1.1)
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| US-F1 | As a **Firm Admin**, I want to add several AI keys per task type with priorities so that work continues when one key runs out. | Add, edit, disable, delete, make primary; one primary per task type; priority order. | ✅ |
| US-F2 | As a **Firm Admin**, I want exhausted keys skipped automatically and reset later so that nobody has to watch quotas. | 429/402/401/403 → exhausted with time; next key used; switch logged; auto-reset after N minutes or manual reset. | ✅ |
| US-F3 | As a **security officer**, I want keys never shown or logged so that they can't leak. | Encrypted at rest; only last 4 visible; not in API responses, logs, usage log or backups. | ✅ |
| US-F4 | As an **admin**, I want a Test key button so that I know a key works before relying on it. | Shows OK or the provider error; a failing quota key is marked exhausted; logged. | ✅ |
| US-F5 | As a **Super Admin**, I want platform keys that firms fall back to so that firms without keys still get AI. | Platform scope; firm keys first, then platform. | ✅ |
| US-F6 | As a **sales rep**, I want an AI lead score with reasons so that I prioritise better. | Button on the lead; score/rating/reasons shown; saved only after I approve (optionally edited). | ✅ |
| US-F7 | As a **sales rep**, I want an AI-drafted follow-up email so that I reply faster. | Draft subject/body; on approval an Email task is created for me; nothing is sent automatically. | ✅ |
| US-F8 | As a **manager**, I want an AI deal summary with risks so that reviews are quicker. | Summary, risk level, next step; appended to the deal description only after approval. | ✅ |
| US-F9 | As a **manager**, I want a history of AI runs so that I can review and audit them. | AI agents page with status filter; key used, failover attempts, reviewer and note recorded. | ✅ |

## Epic G — Configurable dropdowns and data quality (v1.1)
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| US-G1 | As a **Firm Admin**, I want to rename, reorder and hide dropdown values so that the CRM uses our terms. | Settings › Dropdown values; firm override; Reset to default; other firms unaffected. | ✅ |
| US-G2 | As a **Firm Admin**, I want to add our own values (e.g. a lead source) so that we can track our channels. | Firm-only value with a stable code; usable in forms immediately; can't be deleted while used. | ✅ |
| US-G3 | As a **Super Admin**, I want to maintain the default values for all firms so that new firms start sensibly. | Global scope; system values protected; fixed lists allow labels and order only. | ✅ |
| US-G4 | As a **data owner**, I want the API to reject invalid values and mismatched links so that data stays consistent. | Unknown or inactive codes → 400; deal contact must belong to the deal company; valid time zones only; FKs on all real relationships. | ✅ |
| US-G5 | As a **developer**, I want a setup script, guide and safe backup so that I can get started and recover quickly. | `setup.ps1`/`setup.sh`, Setup_Guide.md, backup zip without secrets; restore tested. | ✅ |

# NCLC CRM — User Stories

> **Document:** User Stories v1.0 · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30)

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

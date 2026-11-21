# NCLC CRM — AI Agents

> **Document:** AI Agents v1.0 · **Last updated:** 2026-11-21 14:40 IST (UTC+05:30)

Which CRM roles and tasks can be automated with LLM agents, how each one would work, and the three agents that are implemented in Part B.

## 1. Principles (apply to every agent)
1. **One router.** Every AI call goes through `llmRouter.callLLM(taskType, payload, ctx)` (`backend/src/services/llmRouter.js`). It picks the key for the task type and handles failover. Usage is logged in `api_key_usage_log`. No feature talks to a provider directly.
2. **Human approval before any write.** An agent only *proposes*. Its run is stored in `agent_runs` with status `pending_approval`. CRM data changes only when a user presses **Approve & apply**. Rejected runs change nothing.
3. **Least data.** Agents send the fields the task needs. Lead scoring sends *whether* an email or phone exists, never the value. Names are only sent when the output needs them (email greeting).
4. **Same permissions as the user.** An agent loads the record through the user's scope (firm, plus own records for Team Users). It runs the check again at approval time.
5. **Auditable.** Each run stores input, output, proposed changes, the key and model used, the failover attempts, who ran it, who reviewed it, when, and the result.
6. **Deterministic fallback for demos.** The `mock` provider (seeded fake keys) returns rule-based answers, so the agents work end-to-end without real API keys or internet access.

## 2. Automation map: roles × tasks

| # | Agent / task | Main beneficiary (role) | Description | Inputs | Outputs | Human-approval step | Task type → key | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | **Lead scoring** | Team User, Manager | Scores a lead 0–100 (hot/warm/cold) for fit and intent | Job title, company, source, status, value, currency, country, has-email/has-phone, notes, age/recency | `score`, `rating`, `reasons[]`, `next_action` | User reviews and edits the score, then **Approve** writes `leads.score` | `text` → primary text key (e.g. llm1), failover by priority | **Implemented** |
| 2 | Contact / company enrichment | Team User | Suggests missing industry, size, website, job-title normalisation | Company name/domain, contact title, existing fields | Field suggestions with confidence | Accept per field. Nothing is overwritten without a tick. | `text` (+ optional web lookup tool) | Designed |
| 3 | **Deal-risk summary** | Manager, Team User | Summarises a deal and rates risk with reasons and next steps | Deal stage, probability, amount, close date, days idle, company, contact presence, tasks (open/overdue/done) | `summary`, `risk_level`, `risks[]`, `next_steps[]` | **Approve** appends the summary to `deals.description` | `text` | **Implemented** |
| 4 | **Follow-up email drafting** | Team User | Drafts a personalised follow-up for a lead or deal contact | Recipient first name, title, company, lead/deal context, open tasks, sender name | `subject`, `body` | User edits, then **Approve** creates an *Email* task with the draft (no auto-send) | `text` | **Implemented** |
| 5 | Task prioritisation | Team User, Manager | Orders a user's open tasks by urgency and deal value | Open tasks, due dates, linked deal value/stage | Ranked list + reason per task | User accepts the new priorities (bulk update of `tasks.priority`) | `text` | Designed |
| 6 | Meeting-note summarising | Team User | Turns raw notes or a transcript into a summary, decisions and action items | Notes text or audio (transcribed) | Summary + action items | Approve creates tasks and appends the summary to the contact/deal | `audio` (speech-to-text) + `text` | Designed |
| 7 | Duplicate detection | Firm Admin, Manager | Finds likely duplicate contacts, companies and leads | Names, emails, phones, domains (embedded) | Candidate pairs with similarity | Admin merges or dismisses each pair | `embedding` + `text` (explanation) | Designed |
| 8 | Help-text drafting | Firm Admin, Super Admin | Drafts or rewrites help text for a section in the firm's tone | Section key, current text, screen fields | Title + body | Admin edits, then saves through the normal Help editor | `text` | Designed |
| 9 | Data-quality checks | Firm Admin | Flags missing or invalid fields, stale records, deals past their close date | Aggregated record stats + samples | Issues list with fix suggestions | Admin applies fixes one by one | `text` | Designed |
| 10 | Currency / rate anomaly alerts | Super Admin | Spots exchange-rate entries that jump unusually, and deals with odd currency | Rate history per currency, recent deals | Alerts with explanation | Super Admin confirms or corrects the rate | `text` | Designed |
| 11 | Pipeline forecast commentary | Manager, Firm Admin | Explains weighted forecast changes week over week | Dashboard figures by stage/owner | Narrative + watch-list | Read-only (no write) | `text` | Idea |
| 12 | Product / proposal image | Team User | Generates a simple visual for a proposal | Prompt from deal details | Image | User downloads or attaches it | `image` | Idea |

Roles: **Super Admin** (platform, rates, global help), **Firm Admin** (users, settings, data quality), **Manager** (pipeline reviews, approvals), **Team User** (day-to-day selling).

## 3. Implemented agents (Part B Stage 2)

| Agent code | UI entry points | Entity | Writes on approval | Editable before approval |
|---|---|---|---|---|
| `lead_scoring` | Leads list row **✨ AI score**; lead form **✨ Score this lead** | lead | `leads.score` | score, rating, next action |
| `followup_email` | Lead form and deal form **✨ Draft follow-up email** | lead, deal | new `tasks` row (type `email`, due tomorrow 09:00 UTC, assigned to the approver, linked to the deal/contact) | subject, body |
| `deal_summary` | Deals list row **✨ AI summary**; deal form **✨ Summarise deal & risks** | deal | `deals.description` (appended block with date and approver) | summary, risk level, risks, next steps |

All three use task type **text**. The **AI agents** page (`/ai/agents`) lists the agents and every run, filtered by status/agent, and is the approval queue.

### Flow
```
User clicks ✨  ->  POST /api/agents/:agent/run {entity_type, entity_id}
  -> load record with the user's scope (404 if not visible)
  -> build minimal input -> llmRouter.callLLM('text', {system, prompt, mock})
       -> firm keys (primary, then priority) -> platform keys; failover + logging
  -> parse + validate JSON -> agent_runs (pending_approval, proposed_changes)
User reviews/edits  ->  POST /api/agents/runs/:id/approve {output?, note?}
  -> re-check access, re-validate, apply proposed changes in one transaction
  -> agent_runs.status = approved, applied_result
or  ->  POST /api/agents/runs/:id/reject {note?}  (nothing written)
```

### Who can approve
The user who ran the agent, or a Manager / Firm Admin / Super Admin of the firm. Team Users only see their own runs.

### Failure handling
- All keys fail: the run is stored as `failed` with the error and each attempt (key, HTTP status, error type).
- An unreadable AI reply (not JSON, missing fields): `failed` with the raw reply kept for review.
- A refusal from the model is treated as final (no failover) and shown as an error.

## 4. Tables
- `agent_runs`: see [Tables_Used.md](Tables_Used.md) and [Data_Relationships.md](Data_Relationships.md).
- `api_keys`, `ai_task_types`, `api_key_usage_log`: key storage, task types and the usage/failover log.

## 5. Adding a new agent
1. Add a definition in `backend/src/services/agents.js` with `code`, `name`, `entities`, `taskType`, `buildInput`, `system`, `prompt`, `mock`, `validate`, `propose` and `editable`.
2. Use only `op: update | append | insert` proposals. Approval applies them inside a transaction scoped to the firm.
3. Add help keys in `backend/db/helpSeed.js` and a button using `<AgentButton agent="..." entityType="..." entityId={id}>`.
4. Add smoke tests (run → pending, approve applies, reject leaves the data unchanged).

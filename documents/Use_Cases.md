# NCLC CRM — Use Cases

> **Document:** Use Cases v1.1 · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30)

Actors: **SA** Super Admin · **FA** Firm Admin · **MG** Manager · **TU** Team User · **SYS** the system.

| ID | Use case | Primary actor(s) |
|---|---|---|
| UC-01 | Sign in / sign out | All |
| UC-02 | Onboard a new firm | SA |
| UC-03 | Switch firm context | SA |
| UC-04 | Manage users | SA, FA |
| UC-05 | Maintain currencies & exchange rates | SA |
| UC-06 | Configure firm settings & pipeline | FA, SA |
| UC-07 | Manage contacts | All (delete: SA/FA/MG) |
| UC-08 | Manage companies | All (delete: SA/FA/MG) |
| UC-09 | Capture & qualify a lead | All |
| UC-10 | Convert a lead | All (TU: own leads) |
| UC-11 | Manage a deal through the pipeline | All (TU: own deals) |
| UC-12 | Plan and complete tasks | All |
| UC-13 | Review the dashboard | All |
| UC-14 | Read contextual help | All |
| UC-15 | Edit help text | FA, SA |
| UC-16 *(v1.1)* | Manage AI API keys | FA, SA |
| UC-17 *(v1.1)* | AI call with automatic failover | SYS |
| UC-18 *(v1.1)* | Run an AI agent and approve the result | All (TU: own records) |
| UC-19 *(v1.1)* | Maintain dropdown values | FA, SA |
| UC-20 *(v1.1)* | Set up the project and take a backup | Developer |

---

### UC-01 Sign in / sign out
**Pre:** The user account exists and is active. Its firm is active (unless SA).
**Main flow:** 1. The user opens the app URL and enters email and password. 2. SYS verifies the password hash, account status and firm status. 3. SYS issues a token and shows the Dashboard of the user's firm (SA: the first or last-selected firm).
**Alternates:** 2a. Wrong credentials → "Invalid email or password". 2b. Inactive user or suspended firm → 403 message.
**Post:** `users.last_login_at` updated. Sign out clears the token.

### UC-02 Onboard a new firm
**Actor:** SA. **Flow:** Admin › Firms › **+ New firm** → enter name, country, base currency, time zone and (optionally) the first Firm Admin's name, email and password → Save. SYS creates the firm, the six default pipeline stages and the Firm Admin in one transaction.
**Alt:** A duplicate firm name or email → 409 error, and nothing is created.

### UC-03 Switch firm context
**Actor:** SA. **Flow:** Choose a firm in the top-bar "Working in firm" selector (or **Open** on Admin › Firms). All module pages, the dashboard and help reload for that firm.

### UC-04 Manage users
**Actors:** SA (any firm, any role), FA (own firm; cannot create or edit a Super Admin).
**Flow:** Admin › Users → **+ New user** / click a user → name, email, role, firm (SA only), password, active → Save.
**Rules:** Email is unique platform-wide. Password ≥ 8 characters. A user can't change their own role, deactivate themselves or delete themselves. Deleting a user leaves their records unassigned.

### UC-05 Maintain currencies & exchange rates
**Actor:** SA. **Flow:** Admin › Currencies → **+ Exchange rate** (currency, units per USD, effective date) or **+ Currency**. SYS stores the rate history. New conversions use the latest rate.
**Others:** All roles can view the rates and use the converter.

### UC-06 Configure firm settings & pipeline
**Actor:** FA (SA for the selected firm). **Flow:** Admin › Firm settings → edit name, country, base currency, time zone and domain → Save. Rename stages or change their default probability → Save on each row.

### UC-07 Manage contacts
**Flow:** Contacts → search or filter → **+ New contact** or click a row → fill the *Contact details*, *Company & role* and *Lifecycle & ownership* groups → Save.
**Rules:** First and last name are required. Company must be in the same firm. TU can't change the owner to someone else or delete.

### UC-08 Manage companies
As UC-07, with the groups *Company details, Location & contact, Size & revenue, Ownership & notes*. Revenue is shown converted to the base currency.

### UC-09 Capture & qualify a lead
**Flow:** Leads → **+ New lead** → details, source, status, score, estimated value and currency → Save. Over time, update the status to Contacted, Qualified or Unqualified.
**Rule:** A TU sees only their own leads.

### UC-10 Convert a lead
**Pre:** Lead status ≠ converted. **Flow:** Leads → **Convert** on a row → choose whether to create a deal, its name, amount, currency, stage and expected close → **Convert lead**. SYS creates or links the Company, creates the Contact, optionally creates the Deal, and marks the lead Converted.
**Alt:** Already converted → 400.

### UC-11 Manage a deal through the pipeline
**Flow:** Deals (Board) → **+ New deal** or click a card → edit → Save. Drag a card to another stage, and SYS updates the stage, probability, status and closed date.
**Rules:** Closed Won = 100%, Closed Lost = 0%. Amounts in a foreign currency show their base-currency equivalent.

### UC-12 Plan and complete tasks
**Flow:** Tasks → **+ New task** → title, type, due date/time, priority, status, assignee, contact and deal links → Save. Tick the checkbox to complete a task. Filter by Overdue, Today or Next 7 days.
**Rule:** A TU can assign tasks only to themselves.

### UC-13 Review the dashboard
**Flow:** Dashboard shows KPIs (open pipeline, weighted forecast, won value, win rate, open leads, contacts/companies), pipeline by stage, upcoming and overdue tasks, leads by source and status, and pipeline by owner. All values are in the base currency. For a TU, it shows only their own data.

### UC-14 Read contextual help
**Flow:** Click any **?** icon next to a page title, card title or form-group title. SYS shows the help title and text, plus who last updated it and when. Press Esc or click outside to close.

### UC-15 Edit help text
**Actors:** FA, SA. **Flow:** In a help popover click **Edit**, or go to Admin › Help text and click a row → change the title or text → Save. FA edits apply only to their firm (override). SA chooses either *All firms (global)* or *Only <firm>*. **Reset to default** removes a firm override.

### UC-16 Manage AI API keys
**Actors:** FA (own firm), SA (any firm or platform keys).
**Flow:**
1. Settings › API Keys → **+ Add key**.
2. Enter name, provider, task type, optional model, the key, priority and status → Save.
3. SYS encrypts the key and shows only its last 4 characters. The first key for a task type becomes primary.
4. **Test key** shows OK or the error. **Make primary**, **Reset**, **Disable/Enable** and **Edit** are available on each key.

**Alternate:** the SA switches to *Platform keys* to manage fallback keys and edits task types (name, reset minutes, active).

### UC-17 AI call with automatic failover
**Actor:** SYS.
**Trigger:** any AI feature calls `callLLM(taskType)`.
**Flow:**
1. SYS orders the active keys: firm keys, then platform keys; primary first, then priority.
2. SYS calls the first key. If it returns 429/402/401/403, SYS marks it exhausted (with the time), logs *exhausted* and *switch*, and tries the next key.
3. When a key answers, SYS logs *success* and updates the counters.

**Exceptions:** no keys → "No active API key…" (503). All keys fail → "All N API key(s)… failed" (502), logged as *all_failed*.
**Post-condition:** exhausted keys return to Active after the task type's reset time, or by manual Reset.

### UC-18 Run an AI agent and approve the result
**Actors:** any user with access to the lead or deal.
**Flow:**
1. On a lead, click **✨ AI score** / **Score this lead** / **Draft follow-up email**. On a deal, click **Summarise deal & risks** / **Draft follow-up email**.
2. SYS runs the agent through UC-17 and shows the proposal, the key used and any failover. Nothing is saved yet.
3. The user edits the proposal if needed, then clicks **Approve & apply**. SYS re-checks access and writes the change: the lead score, a new Email task, or a note appended to the deal.

**Alternate:** **Reject** saves nothing. Runs can be reviewed later under **AI agents**, where managers and admins can approve other users' pending runs.

### UC-19 Maintain dropdown values
**Actors:** FA (own firm), SA (global defaults or a firm).
**Flow:**
1. Settings › Dropdown values → pick a list.
2. Change a label → **Save**. Use ▲▼ to reorder. **Deactivate** or **Activate** a value. **Add a value** (label, optional code).

**Rules:**
- FA changes are firm overrides; **Reset** restores the default.
- System values can't be deactivated, and fixed lists accept no new values.
- A value in use can't be deleted.
- Forms show the changes immediately, and the API rejects inactive or unknown codes on new data.

### UC-20 Set up the project and take a backup
**Actor:** developer.
**Flow:**
1. Clone the repository and run `scripts\setup.ps1` (or `setup.sh`).
2. Fill in `DB_USER` and `DB_PASSWORD` in `.env`.
3. Run `npm run db:setup`, then `scripts\start.ps1`.

**Backup:** `scripts\backup.ps1` creates a zip with code, documents, the schema SQL and the data SQL, without `.env`, node_modules, logs, build output or any API key data. See [Setup_Guide.md](Setup_Guide.md).

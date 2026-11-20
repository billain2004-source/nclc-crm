# NCLC CRM — Use Cases

> **Document:** Use Cases v1.0 · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30)

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

# NCLC CRM — User Manual

> **Document:** User Manual v1.1 · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30) · **Servers verified running:** 2026-11-21 14:16 IST (backend :4000, frontend :5173, restarted for Part B)

## 1. Application URLs
| What | URL | Who uses it |
|---|---|---|
| **Web application (sign in here)** | **http://localhost:5173** | Everyone |
| Login page | http://localhost:5173/ (shown automatically when signed out) | Everyone |
| Dashboard | http://localhost:5173/ | All roles |
| Contacts | http://localhost:5173/contacts | All roles |
| Companies | http://localhost:5173/companies | All roles |
| Leads | http://localhost:5173/leads | All roles |
| Deals (board / list) | http://localhost:5173/deals | All roles |
| Tasks | http://localhost:5173/tasks | All roles |
| **AI agents** (run history, approvals) | http://localhost:5173/ai/agents | All roles (Team Users see their own runs) |
| Admin › Firms | http://localhost:5173/admin/firms | Super Admin |
| Admin › Users | http://localhost:5173/admin/users | Super Admin, Firm Admin |
| Admin › Currencies & rates | http://localhost:5173/admin/currencies | All (edit: Super Admin) |
| Admin › Help text | http://localhost:5173/admin/help | Super Admin, Firm Admin |
| **Settings › Firm settings** | http://localhost:5173/settings/firm (old `/admin/settings` redirects here) | Super Admin, Firm Admin |
| **Settings › API Keys** | http://localhost:5173/settings/api-keys | Super Admin, Firm Admin |
| **Settings › Dropdown values** | http://localhost:5173/settings/dropdowns | Super Admin, Firm Admin |
| Backend API base | http://localhost:4000/api | Developers / integrations |
| API health check | http://localhost:4000/api/health | Operations |
| MySQL database | localhost:3306, database `nclc_crm` | DBA (credentials in `.env`) |

## 2. Login details for every level (demo data)
**Verified 2026-11-21 14:18 IST (after the Part B restart):** all 17 accounts below signed in successfully against the running servers (backend :4000, frontend :5173). The four role logins used by the login page's demo buttons were also walked through in the browser at 14:16 IST.

All firm users share the demo password **`Demo@123`**. The Super Admin's password is **`Super@123`**. Change these before any real use (Admin › Users).

### 2.1 Super Admin (platform: all firms)
| Name | Email | Password |
|---|---|---|
| Platform Super Admin | `superadmin@nclc-crm.example` | `Super@123` |

### 2.2 Firm users
| Firm (country · base currency) | Role | Name | Email | Password |
|---|---|---|---|---|
| **Northwind Traders Ltd** (UK · GBP £) | Firm Admin | Oliver Bennett | `admin@northwind.example` | `Demo@123` |
| | Manager | Charlotte Hughes | `manager@northwind.example` | `Demo@123` |
| | Team User | Harry Clarke | `sales1@northwind.example` | `Demo@123` |
| | Team User | Amelia Wright | `sales2@northwind.example` | `Demo@123` |
| **Sahyadri Tech Solutions Pvt Ltd** (India · INR ₹) | Firm Admin | Rajesh Kulkarni | `admin@sahyadri.example` | `Demo@123` |
| | Manager | Priya Deshpande | `manager@sahyadri.example` | `Demo@123` |
| | Team User | Amit Patil | `sales1@sahyadri.example` | `Demo@123` |
| | Team User | Sneha Joshi | `sales2@sahyadri.example` | `Demo@123` |
| **Lakeshore Analytics Inc** (USA · USD $) | Firm Admin | Michael Carter | `admin@lakeshore.example` | `Demo@123` |
| | Manager | Jennifer Lopez-Reyes | `manager@lakeshore.example` | `Demo@123` |
| | Team User | Brian Mitchell | `sales1@lakeshore.example` | `Demo@123` |
| | Team User | Ashley Turner | `sales2@lakeshore.example` | `Demo@123` |
| **Marina Bay Logistics Pte Ltd** (Singapore · SGD S$) | Firm Admin | Tan Wei Ming | `admin@marinabay.example` | `Demo@123` |
| | Manager | Lim Hui Ling | `manager@marinabay.example` | `Demo@123` |
| | Team User | Rahim Ismail | `sales1@marinabay.example` | `Demo@123` |
| | Team User | Chloe Ng | `sales2@marinabay.example` | `Demo@123` |

Tip: the login page has four "Demo accounts" buttons that fill in a Super Admin, a Firm Admin, a Manager and a Team User.

## 3. What each role can do
| | Super Admin | Firm Admin | Manager | Team User |
|---|:-:|:-:|:-:|:-:|
| See all firms and switch between them | ✔ | | | |
| Create, edit and suspend firms | ✔ | | | |
| Manage users | all firms | own firm | | |
| Firm settings, pipeline stages | ✔ | ✔ | | |
| Add currencies and exchange rates | ✔ | | | |
| Edit help text | global or per firm | own firm | | |
| Settings › API Keys | platform keys + any firm | own firm's keys | | |
| Settings › Dropdown values | global defaults + any firm | own firm (overrides, firm-only values) | | |
| Run AI agents (score, email draft, deal summary) | ✔ | ✔ | ✔ | on own leads/deals |
| Approve / reject AI results | ✔ | ✔ | ✔ | own runs only |
| Contacts and companies | full | full | full | view, add, edit (no delete) |
| Leads and deals | whole firm | whole firm | whole firm | **own only** |
| Tasks | whole firm | whole firm | whole firm | assigned to or created by me |
| Assign records to other people | ✔ | ✔ | ✔ | |

## 4. Getting around
- **Left menu:** Dashboard, Contacts, Companies, Leads, Deals, Tasks, AI agents, then an **Admin** section and (Super Admin and Firm Admin only) a **Settings** section with Firm settings, API Keys and Dropdown values. Only the pages your role can use are shown.
- **Top bar:** your firm, its country and base currency (e.g. *United Kingdom · GBP £*), your name and role, and **Sign out**. The Super Admin sees a **Working in firm** selector instead.
- **"?" icons:** click any **?** next to a page title, a dashboard card or a form section for help. Press Esc or click elsewhere to close it. Firm Admins and the Super Admin see an **Edit** link in the popup.
- **Money:** amounts appear in the record's own currency. Where that differs from your firm's base currency, the converted value appears as "≈ £…" or in a "(EUR)" note. Dashboards always use the base currency.

## 5. Module guide
### 5.1 Dashboard
KPI tiles (open pipeline, weighted forecast, won, win rate, open leads, contacts · companies), pipeline by stage (hover a bar for details), upcoming and overdue tasks, leads by source and status, and pipeline by owner (managers and admins) or *My recent deals* (team users).

### 5.2 Contacts
Search by name, email, phone, job title or company. Filter by lifecycle stage or owner. Click **+ New contact** or a row to edit. The form has three sections: *Contact details*, *Company & role*, *Lifecycle & ownership*.

### 5.3 Companies
Like Contacts, with industry and owner filters. The list shows contact and deal counts and revenue in your base currency.

### 5.4 Leads
Track prospects from **New → Contacted → Qualified** (or **Unqualified**). Use **Convert** on a row to create the company, contact and (optionally) a deal in one step. The lead then shows **Converted**. Status and source choices come from **Settings › Dropdown values**, so your firm may have renamed or added some.

### 5.5 Deals
- **Board view:** one column per stage, with the deal count and total. Drag a card to move it. Probability updates automatically, and Closed Won/Lost close the deal.
- **List view:** a sortable table with stage, status and owner filters.
- Click any card or row to edit the amount, currency, stage, probability, company and contact.

### 5.6 Tasks
Calls, emails, meetings and to-dos with due date and time, priority and assignee. Tick the box to mark a task done. Overdue tasks are tinted red with ⚠. Use the **Due** filter for Overdue / Today / Next 7 days.

### 5.7 Admin
- **Firms** (Super Admin): list with counts, **+ New firm** (optionally with its first Firm Admin), edit or suspend, and **Open** to switch into a firm.
- **Users:** add, edit, deactivate or delete. Leave the password blank when editing to keep it.
- **Currencies:** latest rates, a converter, the country list and rate history. The Super Admin adds rates and currencies.
- **Help text:** every help section with search. Click a row to edit, and **Reset to default** removes a firm override.

### 5.8 AI agents
Three assistants help with routine work. **Nothing an agent produces is saved until a person approves it.**
| Agent | Where | What you approve | What gets saved |
|---|---|---|---|
| **Lead scoring** | Leads: **✨ AI score** on a row, or **Score this lead** in the form | Score 0–100, hot/warm/cold, reasons (editable) | `Score` on the lead |
| **Follow-up email draft** | Lead or deal form: **Draft follow-up email** | Subject and body (editable) | An *Email* task due tomorrow, assigned to you |
| **Deal summary** | Deal form or list: **Summarise deal & risks** | Summary, risk level, next step (editable) | A dated note appended to the deal description |

After clicking a button, a window shows the result, which key answered, and any failover. Edit if needed, then **Approve & apply** or **Reject**. **AI agents** in the menu lists every run with its status (Pending approval, Approved, Rejected, Failed); click a row to review it. Managers and admins can approve runs made by others in their firm. The demo uses offline *mock* keys; add real keys in Settings › API Keys.

### 5.9 Settings (Super Admin and Firm Admin)
- **Firm settings** (`/settings/firm`): firm profile, base currency, time zone (pick from the list), and pipeline stage names and probabilities.
- **API Keys** (`/settings/api-keys`): AI provider keys per task type (text, image, audio, embedding).
  - **+ Add key:** name, provider, task type, optional model, the key itself, priority (lower = tried first), status, and *Primary*. The key is encrypted and only its **last 4 characters** are ever shown.
  - **Test key** sends a tiny request and shows OK or the error. **Make primary** sets the key tried first for its task type. **Reset** brings an exhausted key back. **Disable/Enable** switches it off or on.
  - **Failover:** if a key hits a quota, rate limit or authorisation error (HTTP 429/402/401/403), it is marked **Exhausted** and the next key is tried automatically. The firm's own keys go first, then the Super Admin's platform keys. Exhausted keys come back automatically after the task type's reset time, or immediately with **Reset**.
  - **Try routing** on a task-type card runs a sample call. The **Usage log** shows every call, switch, reset and test, never the key values.
  - The Super Admin uses **This firm / Platform keys** to manage the shared platform keys and the task-type list.
- **Dropdown values** (`/settings/dropdowns`): every choice list in the forms. These are lead status and source, contact lifecycle stage, company industry, task type, priority and status, deal status, and firm status.
  - Pick a list on the left.
  - **Rename:** edit a label and click **Save**.
  - **Reorder:** use ▲ ▼.
  - **Hide:** **Deactivate** hides a value from forms, but records that already use it keep it.
  - **Add a value:** for your firm.
  - **Undo a firm change:** **Reset** brings back the default. **Delete** works only for unused firm-only values.
  - **System** values (e.g. *New*, *Converted*, *Done*, *Email*) can be renamed but not deactivated, because the program relies on them.
  - *Deal status* and *Firm status* have fixed values (labels and order only).
  - Role names are fixed and are not in this list.
  - The Super Admin switches between **This firm** and **Global defaults**. A Firm Admin's changes affect only their firm.

## 6. Starting and stopping the system
```powershell
# from C:\Users\billa\nclc-crm
powershell -ExecutionPolicy Bypass -File scripts\start.ps1   # starts API (:4000) and web app (:5173)
powershell -ExecutionPolicy Bypass -File scripts\stop.ps1    # stops both
```
Rebuild the demo database (this **erases all data**): `cd backend; npm run db:reset`. After pulling new code, run `npm run db:migrate` (keeps data). Back up code, documents and data with `scripts\backup.ps1` (no `.env`, no API keys). See [Setup Guide](Setup_Guide.md) and [Deployment Notes](Deployment_Notes.md).

## 7. Troubleshooting
| Symptom | Fix |
|---|---|
| "Invalid email or password" | Check the table in §2. Passwords are case-sensitive. |
| "Your firm is suspended" | The Super Admin must set the firm back to Active (Admin › Firms). |
| "Select a firm first" (Super Admin) | Pick a firm in the top-bar selector. |
| Page loads but shows no data / network errors | Check that the API is running: http://localhost:4000/api/health. Look in `logs\backend.err.log`. |
| API won't start: "Missing .env" / access denied | Create `.env` from `.env.example` and set `DB_USER` and `DB_PASSWORD`. |
| API won't start: "APP_ENC_KEY is required" | Add `APP_ENC_KEY` (64 hex characters) to `.env`; see the [Setup Guide](Setup_Guide.md). |
| AI button says "No active API key for task type …" or "All N API key(s) … failed" | Settings › API Keys: add or **Reset** a key for that task type; check the Usage log for the error. |
| "… is no longer an active …" when saving | The value was deactivated in Settings › Dropdown values. Pick another value or reactivate it. |
| A dropdown option is missing | It may be deactivated for your firm (Settings › Dropdown values). |

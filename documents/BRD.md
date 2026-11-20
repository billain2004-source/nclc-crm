# NCLC CRM — Business Requirements Document (BRD)

> **Document:** BRD v1.1 · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30) · **Owner:** NCLC CRM project team

---

## 1. Purpose
NCLC CRM is a multi-tenant, HubSpot-style Customer Relationship Management platform. One installation serves many **firms** (tenant companies). Each firm manages its own contacts, companies, leads, deals and tasks in its own base currency. A platform-level **Super Admin** manages all firms.

## 2. Market research summary
The module set below is based on four market-leading CRMs:

| Product | Core modules / objects | Takeaways for NCLC CRM |
|---|---|---|
| **HubSpot CRM** | Contacts, Companies, Leads, Deals, Tickets; deal pipelines with stages; tasks; dashboards | Contacts linked to companies; deals associated with both; visual pipeline with forecast by stage probability |
| **Zoho CRM** | Leads, Accounts, Contacts, Deals (the "four key modules"), Activities, Campaigns, Forecasts, Reports, Dashboards; **multi-currency** with an org (home) currency plus additional currencies with exchange rates | Firm base currency + record currency; amounts converted to base for reporting |
| **Salesforce Sales Cloud** | Lead, Account, Contact, Opportunity; lead conversion creates Account + Contact + Opportunity | **Lead conversion** workflow; role-based access |
| **Pipedrive** | Visual pipeline (drag deals between stages, mark won/lost), Leads Inbox, Activities (tasks, reminders) | Kanban pipeline, won/lost status, deal value + probability + expected close date, activity list |

Sources: [HubSpot CRM](https://www.hubspot.com/products/crm), [HubSpot community – Understanding the CRM](https://community.hubspot.com/t/understanding-the-crm/96537), [Zoho CRM – Understand your CRM account](https://help.zoho.com/portal/en/kb/crm/getting-started/articles/understand-crm-account), [Zoho CRM – Managing multiple currencies](https://help.zoho.com/portal/en/kb/crm/articles/create-multiple-currencies), [Salesforce Sales Cloud data model](https://developer.salesforce.com/docs/platform/data-models/guide/sales-cloud-overview.html), [Trailhead – Customize Sales Cloud](https://trailhead.salesforce.com/content/learn/modules/sales-cloud-configuration-basics/customize-sales-cloud), [Pipedrive](https://www.pipedrive.com), [Geekflare – Pipedrive review](https://geekflare.com/software/pipedrive-crm-review/).

## 3. Scope
### 3.1 In scope (v1)
1. Multi-tenancy: firms are isolated; all business data is scoped by `firm_id`.
2. Authentication (email + password, JWT) and four role levels.
3. Reference data: countries, currencies, exchange rates.
4. Modules: **Dashboard, Contacts, Companies, Leads, Deals/Pipeline, Tasks**.
5. Administration: Firms (Super Admin), Users, Currencies & exchange rates, Help text.
6. Context help: a "?" icon on every section and field group; help text stored in the database and editable by Firm Admin / Super Admin.
7. Seed data: at least 3 firms in different countries and currencies, users at every role, 10+ rows per module.

### 3.2 Out of scope (v1)
Email sync, marketing campaigns, tickets/service desk, quotes/invoices, workflow automation, file attachments, mobile apps, SSO.

## 4. Stakeholders and user roles
| Role | Scope | Typical user |
|---|---|---|
| **Super Admin** | All firms. Creates and edits firms, manages any user, edits global help text and exchange rates. Can switch into any firm to view its data. | Platform operator |
| **Firm Admin** | One firm. Full CRUD on all firm data, manages firm users (except Super Admin), firm settings (base currency), edits help text. | Firm owner or IT administrator |
| **Manager** | One firm. Full CRUD on contacts, companies, leads, deals and tasks. Can reassign records to any user in the firm. Sees all firm records. Cannot manage users or settings. | Sales manager |
| **Team User** | One firm. Sees all firm contacts and companies. Sees and edits **only the leads, deals and tasks owned by or assigned to them**. Cannot delete contacts or companies, and cannot assign records to other users. | Sales representative |

## 5. Business requirements
| ID | Requirement | Priority |
|---|---|---|
| BR-01 | The system shall support many firms in one database, isolating each firm's data by `firm_id`. | Must |
| BR-02 | The system shall enforce role-based access on the server, not just hide UI elements. | Must |
| BR-03 | Each firm shall have a country and a base currency. | Must |
| BR-04 | Deals shall carry an amount and a currency; the system shall show the amount converted to the firm's base currency using the latest exchange rate. | Must |
| BR-05 | The system shall maintain country, currency and exchange-rate reference tables. Super Admin maintains rates. | Must |
| BR-06 | Contacts shall optionally link to a company. Deals shall link to a company and/or contact. | Must |
| BR-07 | Leads shall have a status (New, Contacted, Qualified, Unqualified, Converted) and be convertible into Contact + Company + Deal. | Must |
| BR-08 | Deals shall move through pipeline stages (Prospecting, Qualification, Proposal, Negotiation, Closed Won, Closed Lost), each with a default probability. Pipeline shall be shown as a Kanban board. | Must |
| BR-09 | Tasks shall have a due date, priority, status, an assignee and an optional link to a contact/deal. | Must |
| BR-10 | The dashboard shall show counts, open pipeline value (base currency), weighted forecast, won value, deals by stage, and overdue/upcoming tasks. | Must |
| BR-11 | Every section and field group shall show a "?" help icon. Help text lives in the `help_text` table and Firm Admin / Super Admin can edit it in the UI. | Must |
| BR-12 | All list screens shall support search and paging. | Should |
| BR-13 | The system shall record created/updated timestamps on all records. | Should |
| BR-14 | Passwords shall be stored hashed (bcrypt). DB credentials shall come from `.env` and must never be hardcoded. | Must |

## 6. Business rules
1. **Tenant isolation:** a non-Super Admin user can only read or write rows whose `firm_id` equals their own.
2. **Currency conversion:** `amount_base = amount × rate(deal currency → firm base currency)`. Rates are stored against USD; the cross rate is `rate_usd(base) / rate_usd(deal)`.
3. **Stage probability:** a deal's probability defaults to the stage's probability when its stage changes. Closed Won is 100% and Closed Lost is 0%.
4. **Weighted forecast:** Σ(amount_base × probability) over open deals.
5. **Lead conversion:** creates a Company (if a company name is present and doesn't exist), a Contact, and optionally a Deal, then sets the lead status to Converted. A converted lead can't be converted again.
6. **Ownership:** a new record defaults its owner to the creator. Team Users can't assign records to other users.
7. **Help text resolution:** the firm-specific row overrides the global row (`firm_id` NULL) for the same `section_key`.

## 7. Non-functional requirements
- **Security:** JWT auth, bcrypt hashing, parameterised SQL, CORS limited to the frontend origin.
- **Performance:** list endpoints are paged (default 25 rows); indexes on `firm_id` and the foreign keys.
- **Usability:** responsive single-page app, consistent layout, contextual help.
- **Portability:** runs on Windows, macOS or Linux with Node 18+ and MySQL 8.

## 8. Success criteria
- All four roles can log in and see only what their role allows.
- Each module lists seeded data and supports create, edit and delete according to role.
- Deal values show in the firm's base currency.
- Help text is visible on every section and editable by the admin roles.
- Data and help text persist across server restarts.

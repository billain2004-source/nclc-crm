// Default (global) help text for every section and field group. Loaded into help_text with firm_id = 0.
module.exports = [
  ['login', 'Signing in', 'Sign in with the email address and password your administrator gave you. Each person has one login and one role: Super Admin, Firm Admin, Manager or Team User. Your role decides which menus and records you can see.\n\nForgot your password? Ask your Firm Admin to reset it from Admin > Users.'],
  ['roles', 'Roles & permissions', 'Super Admin: manages every firm, global currencies, exchange rates and default help text.\nFirm Admin: full control of one firm: users, settings, help text and all records.\nManager: creates, edits, deletes and reassigns all contacts, companies, leads, deals and tasks in the firm.\nTeam User: sees all contacts and companies, but only their own leads, deals and tasks. Cannot delete contacts or companies, or assign records to other people.'],

  ['dashboard', 'Dashboard', 'Your sales overview at a glance. All money is shown in your firm\'s base currency. Deals in other currencies are converted using the latest exchange rate.\n\nTeam Users see figures for their own leads, deals and tasks. Everyone else sees the whole firm.'],
  ['dashboard.kpis', 'Key metrics', 'Open pipeline = total value of open deals.\nWeighted forecast = sum of (deal value x probability) for open deals. It is a realistic estimate of what will close.\nWon = total value of deals in a "Closed Won" stage.\nWin rate = won deals / (won + lost deals).'],
  ['dashboard.pipeline', 'Pipeline by stage', 'Shows how many deals sit in each pipeline stage and their combined value in the base currency. A large pile in early stages with little in later stages suggests deals are stalling. Click Deals in the menu to work the pipeline board.'],
  ['dashboard.tasks', 'Upcoming tasks', 'Open tasks due in the next 7 days, plus anything overdue (shown in red). Click Tasks in the menu to update or complete them.'],
  ['dashboard.leads', 'Lead sources & status', 'Breaks your leads down by where they came from and how far they have progressed. Use it to see which channels bring the most leads.'],
  ['dashboard.owners', 'Pipeline by owner', 'Open pipeline value per sales owner, in base currency. Useful for managers balancing workload and coaching the team.'],

  ['contacts', 'Contacts', 'Contacts are the people you do business with. A contact can be linked to a company and owned by a user.\n\nUse search to find people by name, email, phone, job title or company. Click a row to edit it. Team Users can view and edit contacts but cannot delete them.'],
  ['contacts.basic', 'Contact details', 'First and last name are required. Email and phone are used for follow-ups. Keep them accurate to avoid duplicates. Add a mobile number separately if the person has one.'],
  ['contacts.work', 'Company & role', 'Link the contact to a company record so all people, deals and history roll up to that organisation. Job title helps you find the decision-maker.'],
  ['contacts.ownership', 'Lifecycle & ownership', 'Lifecycle stage tracks the relationship: Subscriber > Lead > Opportunity > Customer > Evangelist. The owner is the user responsible for the contact. Only Managers and Firm Admins can assign contacts to someone else.'],

  ['companies', 'Companies', 'Companies (accounts) are organisations you sell to. Contacts and deals link to them, so you can see the whole relationship in one place. Contact and deal counts are shown for each company.'],
  ['companies.basic', 'Company details', 'Company name is required. Add the website domain to tell apart companies with similar names. Industry is used for filtering and reports.'],
  ['companies.location', 'Location & contact', 'The main office address and switchboard details. Country is chosen from the global country list maintained by the Super Admin.'],
  ['companies.financials', 'Size & revenue', 'Employee count and annual revenue help you segment accounts. Revenue is entered in the company\'s own currency and converted to your firm\'s base currency in the list.'],
  ['companies.ownership', 'Ownership & notes', 'The owner is the account manager. Use the description for important background such as key initiatives or buying process.'],

  ['leads', 'Leads', 'Leads are unqualified prospects: people who showed interest but are not yet customers.\n\nWork each lead through New > Contacted > Qualified, or mark it Unqualified. When a lead is ready, use Convert to create a contact, company and deal in one step. Team Users only see leads they own.'],
  ['leads.basic', 'Lead details', 'First and last name are required. Record how to reach the person and the company they work for. The company name becomes a Company record when the lead is converted.'],
  ['leads.qualification', 'Qualification', 'Source records where the lead came from (website, referral, trade show...). Status tracks progress. Score (0-100) is your judgement of fit and intent. Higher scores should be followed up first. "Converted" is set automatically by the Convert action.'],
  ['leads.value', 'Estimated value', 'A rough deal size in the lead\'s currency. It is copied into the deal on conversion, and shown converted into your base currency in the list.'],
  ['leads.convert', 'Converting a lead', 'Conversion creates:\n1. A Company (if the lead has a company name and it does not already exist),\n2. A Contact with the lead\'s details,\n3. Optionally a Deal in the stage you choose.\nThe lead is then marked Converted and can\'t be converted again.'],

  ['deals', 'Deals', 'Deals are sales opportunities with a value, a stage and an expected close date. Switch between the Board (drag cards between stages) and the List. Amounts are shown in the deal currency with the converted base-currency value. Team Users only see their own deals.'],
  ['deals.board', 'Pipeline board', 'Each column is a pipeline stage, with its deal count and total value in base currency. Drag a card to another column to change its stage. Probability is updated to the stage default automatically.'],
  ['deals.basic', 'Deal details', 'Give the deal a clear name, usually "<Company> - <what they are buying>". The owner is the salesperson responsible for closing it.'],
  ['deals.amount', 'Amount & currency', 'Enter the amount in the currency the customer will pay in. The system converts it to your firm\'s base currency for dashboards and forecasts using the latest rate (Admin > Currencies).'],
  ['deals.stage', 'Stage & probability', 'Stages: Prospecting (10%) > Qualification (25%) > Proposal (50%) > Negotiation (75%) > Closed Won (100%) / Closed Lost (0%). Changing the stage resets probability to the stage default. You can then fine-tune it. Weighted value = amount x probability.'],
  ['deals.relations', 'Related records', 'Link the deal to the buying company and the main contact person so the deal shows up in their history.'],

  ['tasks', 'Tasks', 'Tasks are your to-dos: calls, emails, meetings and follow-ups. Overdue tasks are highlighted. Tick a task to mark it done. Team Users see tasks assigned to them or created by them.'],
  ['tasks.basic', 'Task details', 'A short, action-oriented title ("Call Priya about proposal") and the task type. Use the description for agenda or notes.'],
  ['tasks.schedule', 'Schedule & priority', 'Set a due date and time and a priority. Status moves Open > In progress > Done. When a task is marked Done, the completion time is recorded. Only Managers and admins can assign tasks to other users.'],
  ['tasks.links', 'Related records', 'Link the task to a contact and/or a deal so it shows up in the right context.'],

  ['admin.firms', 'Firms', 'Super Admin only. Each firm is a separate tenant with its own users and data, isolated by firm_id. Suspending a firm blocks its users from signing in, but keeps the data. Use the firm selector in the top bar to work inside a firm.'],
  ['admin.firms.form', 'Firm details', 'Country and base currency decide how money is shown across the firm. Every deal is converted into the base currency. A new firm gets the standard 6-stage pipeline and, optionally, its first Firm Admin account.'],
  ['admin.users', 'Users', 'Manage who can sign in. Firm Admins manage users of their own firm. The Super Admin can manage everyone. Deactivate a user to block sign-in but keep their records. Deleting a user leaves their records unassigned.'],
  ['admin.users.form', 'User account', 'Email must be unique across the whole platform. Passwords need at least 8 characters. When editing, leave the password blank to keep the current one. Role controls permissions (see the Roles help on this page).'],
  ['admin.currencies', 'Currencies & exchange rates', 'Rates are stored as "units of currency per 1 USD", and USD is the pivot. To convert A to B the system uses amount x rate(B) / rate(A) with the latest rate of each currency. Only the Super Admin can add currencies or enter new rates. Rate history is kept.'],
  ['admin.rates.form', 'Enter an exchange rate', 'Choose the currency, enter how many units equal 1 USD, and the date it applies from. Entering a rate for an existing date overwrites that day\'s rate.'],
  ['admin.help', 'Help text', 'Edit the text behind every "?" icon. Firm Admins save firm-specific versions, which override the global default for their firm only. The Super Admin edits the global default used by all firms. "Reset" removes a firm override.'],
  ['settings.firm', 'Firm settings', 'Firm name, country, base currency and time zone. Changing the base currency changes how all amounts are converted and shown. Existing deal amounts are not changed.'],
  ['settings.stages', 'Pipeline stages', 'Rename stages or change their default probability. Closed Won and Closed Lost are used to calculate win rate and won revenue.'],
];

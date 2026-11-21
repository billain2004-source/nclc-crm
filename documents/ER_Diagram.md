# NCLC CRM — Entity-Relationship Diagram

> **Document:** ER Diagram v1.1 · **Last updated:** 2026-11-21 14:25 IST (UTC+05:30) · **Field-level mapping:** [Data_Relationships.md](Data_Relationships.md)

Rendered with Mermaid (GitHub, VS Code with a Mermaid extension, or https://mermaid.live). Generated from the live database inspection (18 tables, 50 foreign keys). v1.1 adds the AI tables, dropdown tables, and the foreign keys `leads.converted_deal_id → deals` and `exchange_rates.created_by → users`.

## 1. CRM core
```mermaid
erDiagram
    CURRENCIES ||--o{ COUNTRIES : "default currency"
    CURRENCIES ||--o{ EXCHANGE_RATES : "rate history"
    USERS      |o--o{ EXCHANGE_RATES : "entered by (v1.1 FK)"
    COUNTRIES  ||--o{ FIRMS : "located in"
    CURRENCIES ||--o{ FIRMS : "base currency"

    FIRMS ||--o{ USERS : employs
    FIRMS ||--o{ COMPANIES : owns
    FIRMS ||--o{ CONTACTS : owns
    FIRMS ||--o{ LEADS : owns
    FIRMS ||--o{ DEALS : owns
    FIRMS ||--o{ TASKS : owns
    FIRMS ||--o{ PIPELINE_STAGES : defines

    COMPANIES ||--o{ CONTACTS : "works at"
    COMPANIES ||--o{ DEALS : "buys"
    CONTACTS  ||--o{ DEALS : "primary contact"
    PIPELINE_STAGES ||--o{ DEALS : "current stage"
    LEADS |o--o{ DEALS : "deals.lead_id"
    DEALS |o--o{ LEADS : "leads.converted_deal_id (v1.1 FK)"
    LEADS }o--o| CONTACTS : "converted contact"
    LEADS }o--o| COMPANIES : "converted company"
    CONTACTS ||--o{ TASKS : "related"
    DEALS    ||--o{ TASKS : "related"

    USERS ||--o{ COMPANIES : "owner"
    USERS ||--o{ CONTACTS : "owner"
    USERS ||--o{ LEADS : "owner"
    USERS ||--o{ DEALS : "owner"
    USERS ||--o{ TASKS : "assigned / created"

    FIRMS {
      int id PK
      varchar name UK
      char country_code FK
      char base_currency FK
      varchar timezone "IANA, validated by API"
      enum status "lookup firm_status (labels)"
    }
    USERS {
      int id PK
      int firm_id FK "NULL = Super Admin"
      varchar email UK
      enum role "fixed: super_admin|firm_admin|manager|team_user"
      varchar password_hash
    }
    COMPANIES {
      int id PK
      int firm_id FK
      varchar name
      varchar industry "lookup company_industry (code)"
      decimal annual_revenue
      char currency_code FK
      int owner_id FK
    }
    CONTACTS {
      int id PK
      int firm_id FK
      int company_id FK
      varchar first_name
      varchar last_name
      varchar lifecycle_stage "lookup contact_lifecycle"
      int owner_id FK
    }
    LEADS {
      int id PK
      int firm_id FK
      varchar source "lookup lead_source (code)"
      varchar status "lookup lead_status (was ENUM)"
      tinyint score
      decimal estimated_value
      char currency_code FK
      int converted_deal_id FK "v1.1"
      int owner_id FK
    }
    PIPELINE_STAGES {
      int id PK
      int firm_id FK
      varchar name
      tinyint probability
      bool is_won
      bool is_lost
    }
    DEALS {
      int id PK
      int firm_id FK
      int stage_id FK
      int company_id FK
      int contact_id FK "must work at company_id"
      int lead_id FK
      decimal amount
      char currency_code FK
      enum status "derived from stage; lookup deal_status labels"
      int owner_id FK
    }
    TASKS {
      int id PK
      int firm_id FK
      varchar type "lookup task_type (was ENUM)"
      varchar priority "lookup task_priority (was ENUM)"
      varchar status "lookup task_status (was ENUM)"
      datetime due_date
      int assigned_to FK
    }
    CURRENCIES {
      char code PK
      varchar name
      varchar symbol
    }
    COUNTRIES {
      char code PK
      char currency_code FK
    }
    EXCHANGE_RATES {
      int id PK
      char currency_code FK
      decimal rate_per_usd
      date effective_date
      int created_by FK "v1.1"
    }
```

## 2. Configuration: help text and dropdown values
```mermaid
erDiagram
    FIRMS ||--o{ HELP_TEXT : "overrides (firm_id > 0; 0 = global)"
    USERS |o--o{ HELP_TEXT : "updated_by"
    LOOKUP_LISTS ||--o{ LOOKUP_VALUES : "values"
    FIRMS ||--o{ LOOKUP_VALUES : "overrides / firm-only (firm_id > 0; 0 = global)"
    USERS |o--o{ LOOKUP_VALUES : "updated_by"

    HELP_TEXT {
      int id PK
      int firm_id "0 = global"
      varchar section_key
      varchar title
      text body
    }
    LOOKUP_LISTS {
      varchar code PK "e.g. lead_status"
      varchar name
      varchar used_by "table.column"
      bool allow_custom
      bool firm_editable
    }
    LOOKUP_VALUES {
      int id PK
      int firm_id "0 = global default"
      varchar list_code FK
      varchar code "stable, stored in records"
      varchar label "shown to users"
      smallint sort_order
      bool is_active
      bool is_system
    }
```
`UNIQUE (firm_id, list_code, code)`. The firm_id → FIRMS line is logical: `0` is a sentinel, so there is no database FK (see Data_Relationships §2).

## 3. AI: keys, usage, agents
```mermaid
erDiagram
    AI_TASK_TYPES ||--o{ API_KEYS : "task_type"
    AI_TASK_TYPES ||--o{ AGENT_RUNS : "task_type"
    FIRMS |o--o{ API_KEYS : "firm key (NULL = platform)"
    API_KEYS |o--o{ API_KEY_USAGE_LOG : "key_id / to_key_id"
    API_KEYS |o--o{ AGENT_RUNS : "answered by"
    FIRMS |o--o{ API_KEY_USAGE_LOG : "firm"
    FIRMS ||--o{ AGENT_RUNS : "firm"
    USERS |o--o{ AGENT_RUNS : "created / reviewed by"
    LEADS |o--o{ AGENT_RUNS : "entity (lead)"
    DEALS |o--o{ AGENT_RUNS : "entity (deal)"

    AI_TASK_TYPES {
      varchar code PK "text|image|audio|embedding|..."
      int reset_minutes
    }
    API_KEYS {
      int id PK
      int firm_id FK "NULL = platform"
      varchar provider
      varchar task_type FK
      int priority
      bool is_primary
      enum status "active|disabled|exhausted"
      text key_enc "AES-256-GCM"
      char key_last4
    }
    API_KEY_USAGE_LOG {
      bigint id PK
      int key_id FK
      int to_key_id FK
      enum event
      smallint http_status
    }
    AGENT_RUNS {
      int id PK
      int firm_id FK
      varchar agent
      varchar entity_type "lead|deal"
      int entity_id "polymorphic, no FK"
      enum status "pending_approval|approved|rejected|failed"
      json proposed_changes
      int key_id FK
    }
```

## Tenant boundary
Everything below `FIRMS` carries `firm_id`. Shared by all firms: `CURRENCIES`, `COUNTRIES`, `EXCHANGE_RATES`, `AI_TASK_TYPES`, `LOOKUP_LISTS`, global help and dropdown rows (`firm_id = 0`), and platform API keys (`firm_id NULL`).

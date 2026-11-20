# NCLC CRM — Entity-Relationship Diagram

> **Document:** ER Diagram v1.0 · **Last updated:** 2026-11-21 01:58 IST (UTC+05:30)

Rendered with Mermaid (GitHub, VS Code with a Mermaid extension, or https://mermaid.live).

```mermaid
erDiagram
    CURRENCIES ||--o{ COUNTRIES : "default currency"
    CURRENCIES ||--o{ EXCHANGE_RATES : "rate history"
    COUNTRIES  ||--o{ FIRMS : "located in"
    CURRENCIES ||--o{ FIRMS : "base currency"

    FIRMS ||--o{ USERS : employs
    FIRMS ||--o{ COMPANIES : owns
    FIRMS ||--o{ CONTACTS : owns
    FIRMS ||--o{ LEADS : owns
    FIRMS ||--o{ DEALS : owns
    FIRMS ||--o{ TASKS : owns
    FIRMS ||--o{ PIPELINE_STAGES : defines
    FIRMS ||--o{ HELP_TEXT : "overrides (firm_id>0)"

    COMPANIES ||--o{ CONTACTS : "works at"
    COMPANIES ||--o{ DEALS : "buys"
    CONTACTS  ||--o{ DEALS : "primary contact"
    PIPELINE_STAGES ||--o{ DEALS : "current stage"
    LEADS ||--o| DEALS : "converted into"
    LEADS }o--o| CONTACTS : "converted contact"
    LEADS }o--o| COMPANIES : "converted company"
    CONTACTS ||--o{ TASKS : "related"
    DEALS    ||--o{ TASKS : "related"

    USERS ||--o{ COMPANIES : "owner"
    USERS ||--o{ CONTACTS : "owner"
    USERS ||--o{ LEADS : "owner"
    USERS ||--o{ DEALS : "owner"
    USERS ||--o{ TASKS : "assigned / created"
    USERS ||--o{ HELP_TEXT : "updated_by"

    FIRMS {
      int id PK
      varchar name UK
      char country_code FK
      char base_currency FK
      enum status
    }
    USERS {
      int id PK
      int firm_id FK "NULL = Super Admin"
      varchar email UK
      enum role "super_admin|firm_admin|manager|team_user"
      varchar password_hash
    }
    COMPANIES {
      int id PK
      int firm_id FK
      varchar name
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
      varchar lifecycle_stage
      int owner_id FK
    }
    LEADS {
      int id PK
      int firm_id FK
      enum status
      tinyint score
      decimal estimated_value
      char currency_code FK
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
      decimal amount
      char currency_code FK
      tinyint probability
      enum status
      int owner_id FK
    }
    TASKS {
      int id PK
      int firm_id FK
      enum type
      enum priority
      enum status
      datetime due_date
      int assigned_to FK
    }
    HELP_TEXT {
      int id PK
      int firm_id "0 = global"
      varchar section_key
      varchar title
      text body
      int updated_by FK
      datetime updated_at
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
    }
```

## Tenant boundary
Everything below `FIRMS` in the diagram carries `firm_id`. The global reference tables (`CURRENCIES`, `COUNTRIES`, `EXCHANGE_RATES`) and global help rows (`firm_id = 0`) are shared by all firms.

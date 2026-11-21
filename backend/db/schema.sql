-- =====================================================================
-- NCLC CRM - create-table script (MySQL 8.x, InnoDB, utf8mb4)
-- Database: nclc_crm
-- Every business table is scoped by firm_id (multi-tenant).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS nclc_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nclc_crm;

-- ---------- Reference data (global) ----------
CREATE TABLE IF NOT EXISTS currencies (
  code        CHAR(3)      NOT NULL,
  name        VARCHAR(64)  NOT NULL,
  symbol      VARCHAR(8)   NOT NULL,
  decimals    TINYINT      NOT NULL DEFAULT 2,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS countries (
  code           CHAR(2)      NOT NULL,
  name           VARCHAR(80)  NOT NULL,
  currency_code  CHAR(3)      NOT NULL,
  phone_code     VARCHAR(8)   NULL,
  PRIMARY KEY (code),
  CONSTRAINT fk_countries_currency FOREIGN KEY (currency_code) REFERENCES currencies(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- rate_per_usd = units of this currency for 1 USD (USD = 1.000000)
CREATE TABLE IF NOT EXISTS exchange_rates (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  currency_code   CHAR(3)       NOT NULL,
  rate_per_usd    DECIMAL(18,6) NOT NULL,
  effective_date  DATE          NOT NULL,
  source          VARCHAR(64)   NULL,
  created_by      INT UNSIGNED  NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rate_currency_date (currency_code, effective_date),
  CONSTRAINT fk_rates_currency FOREIGN KEY (currency_code) REFERENCES currencies(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Tenancy ----------
CREATE TABLE IF NOT EXISTS firms (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(150) NOT NULL,
  country_code   CHAR(2)      NOT NULL,
  base_currency  CHAR(3)      NOT NULL,
  timezone       VARCHAR(64)  NOT NULL DEFAULT 'UTC',
  domain         VARCHAR(120) NULL,
  status         ENUM('active','suspended') NOT NULL DEFAULT 'active',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_firms_name (name),
  CONSTRAINT fk_firms_country  FOREIGN KEY (country_code)  REFERENCES countries(code),
  CONSTRAINT fk_firms_currency FOREIGN KEY (base_currency) REFERENCES currencies(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- firm_id is NULL only for the Super Admin
CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  firm_id        INT UNSIGNED NULL,
  name           VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL,
  password_hash  VARCHAR(100) NOT NULL,
  role           ENUM('super_admin','firm_admin','manager','team_user') NOT NULL,
  phone          VARCHAR(40)  NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_firm (firm_id),
  CONSTRAINT fk_users_firm FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- CRM modules ----------
CREATE TABLE IF NOT EXISTS companies (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  firm_id         INT UNSIGNED  NOT NULL,
  name            VARCHAR(150)  NOT NULL,
  domain          VARCHAR(120)  NULL,
  industry        VARCHAR(80)   NULL,
  phone           VARCHAR(40)   NULL,
  email           VARCHAR(160)  NULL,
  city            VARCHAR(80)   NULL,
  country_code    CHAR(2)       NULL,
  employees       INT UNSIGNED  NULL,
  annual_revenue  DECIMAL(16,2) NULL,
  currency_code   CHAR(3)       NULL,
  description     TEXT          NULL,
  owner_id        INT UNSIGNED  NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_companies_firm (firm_id, name),
  CONSTRAINT fk_companies_firm     FOREIGN KEY (firm_id)       REFERENCES firms(id) ON DELETE CASCADE,
  CONSTRAINT fk_companies_owner    FOREIGN KEY (owner_id)      REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_companies_country  FOREIGN KEY (country_code)  REFERENCES countries(code),
  CONSTRAINT fk_companies_currency FOREIGN KEY (currency_code) REFERENCES currencies(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contacts (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  firm_id          INT UNSIGNED NOT NULL,
  company_id       INT UNSIGNED NULL,
  first_name       VARCHAR(80)  NOT NULL,
  last_name        VARCHAR(80)  NOT NULL,
  email            VARCHAR(160) NULL,
  phone            VARCHAR(40)  NULL,
  mobile           VARCHAR(40)  NULL,
  job_title        VARCHAR(100) NULL,
  lifecycle_stage  VARCHAR(32)  NOT NULL DEFAULT 'lead',
  city             VARCHAR(80)  NULL,
  country_code     CHAR(2)      NULL,
  notes            TEXT         NULL,
  owner_id         INT UNSIGNED NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_contacts_firm (firm_id, last_name),
  KEY ix_contacts_company (company_id),
  CONSTRAINT fk_contacts_firm    FOREIGN KEY (firm_id)      REFERENCES firms(id) ON DELETE CASCADE,
  CONSTRAINT fk_contacts_company FOREIGN KEY (company_id)   REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_contacts_owner   FOREIGN KEY (owner_id)     REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_contacts_country FOREIGN KEY (country_code) REFERENCES countries(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  firm_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(60)  NOT NULL,
  sort_order  TINYINT      NOT NULL,
  probability TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_won      TINYINT(1)   NOT NULL DEFAULT 0,
  is_lost     TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stage_firm_name (firm_id, name),
  CONSTRAINT fk_stages_firm FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leads (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  firm_id               INT UNSIGNED  NOT NULL,
  first_name            VARCHAR(80)   NOT NULL,
  last_name             VARCHAR(80)   NOT NULL,
  email                 VARCHAR(160)  NULL,
  phone                 VARCHAR(40)   NULL,
  company_name          VARCHAR(150)  NULL,
  job_title             VARCHAR(100)  NULL,
  source                VARCHAR(40)   NULL,
  status                ENUM('new','contacted','qualified','unqualified','converted') NOT NULL DEFAULT 'new',
  score                 TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estimated_value       DECIMAL(16,2) NULL,
  currency_code         CHAR(3)       NULL,
  country_code          CHAR(2)       NULL,
  notes                 TEXT          NULL,
  owner_id              INT UNSIGNED  NULL,
  converted_contact_id  INT UNSIGNED  NULL,
  converted_company_id  INT UNSIGNED  NULL,
  converted_deal_id     INT UNSIGNED  NULL,
  converted_at          DATETIME      NULL,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_leads_firm (firm_id, status),
  KEY ix_leads_owner (owner_id),
  CONSTRAINT fk_leads_firm     FOREIGN KEY (firm_id)       REFERENCES firms(id) ON DELETE CASCADE,
  CONSTRAINT fk_leads_owner    FOREIGN KEY (owner_id)      REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_currency FOREIGN KEY (currency_code) REFERENCES currencies(code),
  CONSTRAINT fk_leads_country  FOREIGN KEY (country_code)  REFERENCES countries(code),
  CONSTRAINT fk_leads_contact  FOREIGN KEY (converted_contact_id) REFERENCES contacts(id)  ON DELETE SET NULL,
  CONSTRAINT fk_leads_company  FOREIGN KEY (converted_company_id) REFERENCES companies(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deals (
  id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  firm_id              INT UNSIGNED  NOT NULL,
  name                 VARCHAR(150)  NOT NULL,
  company_id           INT UNSIGNED  NULL,
  contact_id           INT UNSIGNED  NULL,
  stage_id             INT UNSIGNED  NOT NULL,
  amount               DECIMAL(16,2) NOT NULL DEFAULT 0,
  currency_code        CHAR(3)       NOT NULL,
  probability          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  status               ENUM('open','won','lost') NOT NULL DEFAULT 'open',
  expected_close_date  DATE          NULL,
  closed_at            DATETIME      NULL,
  description          TEXT          NULL,
  lead_id              INT UNSIGNED  NULL,
  owner_id             INT UNSIGNED  NULL,
  created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_deals_firm (firm_id, status),
  KEY ix_deals_stage (stage_id),
  KEY ix_deals_owner (owner_id),
  CONSTRAINT fk_deals_firm     FOREIGN KEY (firm_id)       REFERENCES firms(id) ON DELETE CASCADE,
  CONSTRAINT fk_deals_company  FOREIGN KEY (company_id)    REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_deals_contact  FOREIGN KEY (contact_id)    REFERENCES contacts(id)  ON DELETE SET NULL,
  CONSTRAINT fk_deals_stage    FOREIGN KEY (stage_id)      REFERENCES pipeline_stages(id),
  CONSTRAINT fk_deals_currency FOREIGN KEY (currency_code) REFERENCES currencies(code),
  CONSTRAINT fk_deals_lead     FOREIGN KEY (lead_id)       REFERENCES leads(id) ON DELETE SET NULL,
  CONSTRAINT fk_deals_owner    FOREIGN KEY (owner_id)      REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  firm_id       INT UNSIGNED NOT NULL,
  title         VARCHAR(200) NOT NULL,
  description   TEXT         NULL,
  type          ENUM('call','email','meeting','todo') NOT NULL DEFAULT 'todo',
  priority      ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  status        ENUM('open','in_progress','done') NOT NULL DEFAULT 'open',
  due_date      DATETIME     NULL,
  completed_at  DATETIME     NULL,
  assigned_to   INT UNSIGNED NULL,
  contact_id    INT UNSIGNED NULL,
  deal_id       INT UNSIGNED NULL,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_tasks_firm (firm_id, status, due_date),
  KEY ix_tasks_assigned (assigned_to),
  CONSTRAINT fk_tasks_firm     FOREIGN KEY (firm_id)     REFERENCES firms(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_creator  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_contact  FOREIGN KEY (contact_id)  REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_deal     FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Note: leads.converted_deal_id has no FK (deals.lead_id already references leads; a second FK
-- would make the two tables mutually dependent). The application keeps it consistent.

-- ---------- Context help ----------
-- firm_id = 0 holds the global (default) text; a row with a real firm_id overrides it for that firm.
CREATE TABLE IF NOT EXISTS help_text (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  firm_id      INT UNSIGNED NOT NULL DEFAULT 0,
  section_key  VARCHAR(64)  NOT NULL,
  title        VARCHAR(150) NOT NULL,
  body         TEXT         NOT NULL,
  updated_by   INT UNSIGNED NULL,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_help_firm_key (firm_id, section_key),
  CONSTRAINT fk_help_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- AI: task types, API keys (encrypted), usage log ----------
-- Editable list of AI task types. Each firm (and the platform) has its own primary key per task type.
-- reset_minutes: an "exhausted" key is reactivated automatically this long after it ran out (0 = manual reset only).
CREATE TABLE IF NOT EXISTS ai_task_types (
  code           VARCHAR(32)  NOT NULL,
  name           VARCHAR(80)  NOT NULL,
  description    VARCHAR(255) NULL,
  reset_minutes  INT UNSIGNED NOT NULL DEFAULT 60,
  sort_order     SMALLINT     NOT NULL DEFAULT 0,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- firm_id NULL = platform key (managed by the Super Admin, used by every firm after its own keys).
-- key_enc holds the AES-256-GCM ciphertext (APP_ENC_KEY); only key_last4 is ever shown.
CREATE TABLE IF NOT EXISTS api_keys (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  firm_id        INT UNSIGNED NULL,
  name           VARCHAR(100) NOT NULL,
  provider       VARCHAR(32)  NOT NULL,
  model          VARCHAR(100) NULL,
  task_type      VARCHAR(32)  NOT NULL,
  priority       SMALLINT     NOT NULL DEFAULT 10,
  status         ENUM('active','disabled','exhausted') NOT NULL DEFAULT 'active',
  is_primary     TINYINT(1)   NOT NULL DEFAULT 0,
  key_enc        TEXT         NOT NULL,
  key_last4      CHAR(4)      NOT NULL,
  usage_count    INT UNSIGNED NOT NULL DEFAULT 0,
  success_count  INT UNSIGNED NOT NULL DEFAULT 0,
  failure_count  INT UNSIGNED NOT NULL DEFAULT 0,
  last_used_at   DATETIME     NULL,
  last_error     VARCHAR(255) NULL,
  exhausted_at   DATETIME     NULL,
  created_by     INT UNSIGNED NULL,
  updated_by     INT UNSIGNED NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_keys_pick (firm_id, task_type, status, priority),
  CONSTRAINT fk_keys_firm      FOREIGN KEY (firm_id)    REFERENCES firms(id) ON DELETE CASCADE,
  CONSTRAINT fk_keys_task_type FOREIGN KEY (task_type)  REFERENCES ai_task_types(code) ON UPDATE CASCADE,
  CONSTRAINT fk_keys_creator   FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_keys_updater   FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per call, failure, exhaustion, failover switch, reset and test. Never contains key material.
CREATE TABLE IF NOT EXISTS api_key_usage_log (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  firm_id      INT UNSIGNED NULL,
  key_id       INT UNSIGNED NULL,
  to_key_id    INT UNSIGNED NULL,
  task_type    VARCHAR(32)  NOT NULL,
  event        ENUM('success','failure','exhausted','switch','reset','test_ok','test_fail','all_failed') NOT NULL,
  http_status  SMALLINT     NULL,
  error_type   VARCHAR(32)  NULL,
  message      VARCHAR(255) NULL,
  source       VARCHAR(64)  NULL,
  latency_ms   INT UNSIGNED NULL,
  user_id      INT UNSIGNED NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_usage_firm (firm_id, created_at),
  KEY ix_usage_key (key_id),
  CONSTRAINT fk_usage_firm   FOREIGN KEY (firm_id)   REFERENCES firms(id) ON DELETE CASCADE,
  CONSTRAINT fk_usage_key    FOREIGN KEY (key_id)    REFERENCES api_keys(id) ON DELETE SET NULL,
  CONSTRAINT fk_usage_to_key FOREIGN KEY (to_key_id) REFERENCES api_keys(id) ON DELETE SET NULL,
  CONSTRAINT fk_usage_user   FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per AI agent run. Nothing an agent proposes is written to CRM records until a user
-- approves it (status pending_approval -> approved, which applies proposed_changes; or rejected).
CREATE TABLE IF NOT EXISTS agent_runs (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  firm_id           INT UNSIGNED NOT NULL,
  agent             VARCHAR(40)  NOT NULL,
  entity_type       VARCHAR(20)  NOT NULL,
  entity_id         INT UNSIGNED NOT NULL,
  entity_label      VARCHAR(200) NULL,
  task_type         VARCHAR(32)  NOT NULL,
  status            ENUM('pending_approval','approved','rejected','failed') NOT NULL DEFAULT 'pending_approval',
  input_json        JSON         NOT NULL,
  output_json       JSON         NULL,
  proposed_changes  JSON         NULL,
  key_id            INT UNSIGNED NULL,
  key_name          VARCHAR(100) NULL,
  provider          VARCHAR(32)  NULL,
  model             VARCHAR(100) NULL,
  attempts_json     JSON         NULL,
  error             VARCHAR(500) NULL,
  latency_ms        INT UNSIGNED NULL,
  created_by        INT UNSIGNED NULL,
  reviewed_by       INT UNSIGNED NULL,
  reviewed_at       DATETIME     NULL,
  review_note       VARCHAR(255) NULL,
  applied_result    VARCHAR(255) NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_runs_firm (firm_id, status, created_at),
  KEY ix_runs_entity (firm_id, entity_type, entity_id),
  CONSTRAINT fk_runs_firm      FOREIGN KEY (firm_id)     REFERENCES firms(id) ON DELETE CASCADE,
  CONSTRAINT fk_runs_key       FOREIGN KEY (key_id)      REFERENCES api_keys(id) ON DELETE SET NULL,
  CONSTRAINT fk_runs_task_type FOREIGN KEY (task_type)   REFERENCES ai_task_types(code) ON UPDATE CASCADE,
  CONSTRAINT fk_runs_creator   FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_runs_reviewer  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

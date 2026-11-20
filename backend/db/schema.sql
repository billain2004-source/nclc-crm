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

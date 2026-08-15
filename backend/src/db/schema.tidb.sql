CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  first_name VARCHAR(60) NOT NULL DEFAULT '',
  last_name VARCHAR(80) NOT NULL DEFAULT '',
  username VARCHAR(40) NOT NULL UNIQUE,
  email VARCHAR(190) NULL,
  password_salt VARCHAR(64) NOT NULL,
  password_hash VARCHAR(256) NOT NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'DOP',
  phone VARCHAR(30) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id BIGINT PRIMARY KEY,
  age INT NULL,
  income_type VARCHAR(20) NOT NULL DEFAULT '',
  income_frequency VARCHAR(20) NOT NULL DEFAULT '',
  income_amount BIGINT NOT NULL DEFAULT 0,
  has_payroll_account TINYINT(1) NOT NULL DEFAULT 0,
  fixed_expenses BIGINT NOT NULL DEFAULT 0,
  planning_period VARCHAR(20) NOT NULL DEFAULT 'monthly',
  plan_purpose VARCHAR(240) NOT NULL DEFAULT '',
  savings_target_percent INT NOT NULL DEFAULT 10,
  primary_goal VARCHAR(30) NOT NULL DEFAULT 'control',
  employment_status VARCHAR(30) NOT NULL DEFAULT 'employee',
  dependents INT NOT NULL DEFAULT 0,
  debt_balance BIGINT NOT NULL DEFAULT 0,
  debt_monthly_payment BIGINT NOT NULL DEFAULT 0,
  emergency_savings BIGINT NOT NULL DEFAULT 0,
  payday_one INT NULL,
  payday_two INT NULL,
  financial_confidence INT NOT NULL DEFAULT 3,
  onboarding_completed TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  endpoint VARCHAR(700) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth_key VARCHAR(255) NOT NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
  user_agent VARCHAR(500) NOT NULL DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_subscriptions_endpoint (endpoint),
  CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  reminder_key VARCHAR(160) NOT NULL,
  sent_on DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notification_log_user_key_date (user_id, reminder_key, sent_on),
  CONSTRAINT fk_notification_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  kind VARCHAR(20) NOT NULL,
  balance BIGINT NOT NULL DEFAULT 0,
  color VARCHAR(30) NOT NULL DEFAULT 'mint',
  institution_type VARCHAR(30) NOT NULL DEFAULT 'other',
  institution_name VARCHAR(150) NOT NULL DEFAULT '',
  product_type VARCHAR(30) NOT NULL DEFAULT 'other',
  nickname VARCHAR(80) NOT NULL DEFAULT '',
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'DOP',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_accounts_kind CHECK (kind IN ('bank', 'savings', 'cash')),
  CONSTRAINT chk_accounts_balance CHECK (balance >= 0),
  CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS account_balance_adjustments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  account_id BIGINT NOT NULL,
  previous_balance BIGINT NOT NULL,
  new_balance BIGINT NOT NULL,
  reason VARCHAR(240) NOT NULL DEFAULT '',
  currency_code VARCHAR(10) NOT NULL DEFAULT 'DOP',
  source VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  adjustment_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_adjustments_previous CHECK (previous_balance >= 0),
  CONSTRAINT chk_adjustments_new CHECK (new_balance >= 0),
  CONSTRAINT fk_adjustments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_adjustments_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL UNIQUE,
  display_name VARCHAR(150) NOT NULL DEFAULT '',
  symbol VARCHAR(20) NOT NULL,
  color VARCHAR(30) NOT NULL DEFAULT 'mint',
  user_id BIGINT NULL,
  parent_id BIGINT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  user_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  monthly_limit BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category_id),
  CONSTRAINT chk_budgets_limit CHECK (monthly_limit >= 0),
  CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_budgets_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS period_budgets (
  user_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  period_key VARCHAR(20) NOT NULL,
  limit_amount BIGINT NOT NULL DEFAULT 0,
  budget_kind VARCHAR(20) NOT NULL DEFAULT 'flexible',
  note VARCHAR(240) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category_id, period_key),
  CONSTRAINT chk_period_budgets_limit CHECK (limit_amount >= 0),
  CONSTRAINT chk_period_budgets_kind CHECK (budget_kind IN ('fixed', 'flexible', 'savings')),
  CONSTRAINT fk_period_budgets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_period_budgets_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS recurring_payments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(180) NOT NULL,
  amount BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  account_id BIGINT NOT NULL,
  frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  next_due_date DATE NOT NULL,
  due_day INT NULL,
  due_month INT NULL,
  is_mandatory TINYINT(1) NOT NULL DEFAULT 1,
  auto_create_transaction TINYINT(1) NOT NULL DEFAULT 0,
  note VARCHAR(500) NOT NULL DEFAULT '',
  last_paid_date DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_recurring_amount CHECK (amount > 0),
  CONSTRAINT chk_recurring_frequency CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'yearly')),
  CONSTRAINT fk_recurring_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_recurring_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_recurring_account FOREIGN KEY (account_id) REFERENCES accounts(id)
);


CREATE TABLE IF NOT EXISTS user_hidden_categories (
  user_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  hidden_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category_id),
  CONSTRAINT fk_hidden_categories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_hidden_categories_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS credit_cards (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(160) NOT NULL,
  institution_name VARCHAR(160) NOT NULL DEFAULT '',
  currency_code VARCHAR(10) NOT NULL DEFAULT 'DOP',
  credit_limit BIGINT NOT NULL DEFAULT 0,
  current_balance BIGINT NOT NULL DEFAULT 0,
  statement_day INT NOT NULL DEFAULT 1,
  due_day INT NOT NULL DEFAULT 20,
  minimum_payment BIGINT NOT NULL DEFAULT 0,
  annual_interest_rate DECIMAL(7,3) NOT NULL DEFAULT 0,
  note VARCHAR(500) NOT NULL DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_credit_cards_limit CHECK (credit_limit >= 0),
  CONSTRAINT chk_credit_cards_balance CHECK (current_balance >= 0),
  CONSTRAINT fk_credit_cards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS debts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(180) NOT NULL,
  lender VARCHAR(180) NOT NULL DEFAULT '',
  debt_type VARCHAR(30) NOT NULL DEFAULT 'personal',
  currency_code VARCHAR(10) NOT NULL DEFAULT 'DOP',
  original_amount BIGINT NOT NULL,
  current_balance BIGINT NOT NULL,
  regular_payment BIGINT NOT NULL DEFAULT 0,
  payment_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  annual_interest_rate DECIMAL(7,3) NOT NULL DEFAULT 0,
  next_due_date DATE NULL,
  end_date DATE NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_debts_original CHECK (original_amount > 0),
  CONSTRAINT chk_debts_balance CHECK (current_balance >= 0),
  CONSTRAINT fk_debts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS credit_card_consumptions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  card_id BIGINT NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  purchase_date DATE NOT NULL,
  installments INT NOT NULL DEFAULT 1,
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_card_consumptions_amount CHECK (amount > 0),
  CONSTRAINT fk_card_consumptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_card_consumptions_card FOREIGN KEY (card_id) REFERENCES credit_cards(id),
  CONSTRAINT fk_card_consumptions_category FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS liability_payments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  liability_type VARCHAR(20) NOT NULL,
  liability_id BIGINT NOT NULL,
  source_account_id BIGINT NOT NULL,
  amount BIGINT NOT NULL,
  payment_date DATE NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_liability_payment_type CHECK (liability_type IN ('card','debt')),
  CONSTRAINT chk_liability_payment_amount CHECK (amount > 0),
  CONSTRAINT fk_liability_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_liability_payments_account FOREIGN KEY (source_account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  type VARCHAR(20) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount BIGINT NOT NULL,
  account_id BIGINT NOT NULL,
  destination_account_id BIGINT NULL,
  category_id BIGINT NULL,
  transaction_date DATE NOT NULL,
  note TEXT NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  currency_code VARCHAR(10) NOT NULL DEFAULT 'DOP',
  destination_amount BIGINT NULL,
  destination_currency_code VARCHAR(10) NULL,
  balance_after BIGINT NULL,
  destination_balance_after BIGINT NULL,
  period_key VARCHAR(20) NOT NULL DEFAULT '',
  external_ref VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_transactions_type CHECK (type IN ('income', 'expense', 'transfer')),
  CONSTRAINT chk_transactions_amount CHECK (amount > 0),
  CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_transactions_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT fk_transactions_destination FOREIGN KEY (destination_account_id) REFERENCES accounts(id),
  CONSTRAINT fk_transactions_category FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS goals (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  target_amount BIGINT NOT NULL,
  current_amount BIGINT NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  color VARCHAR(30) NOT NULL DEFAULT 'sun',
  priority INT NOT NULL DEFAULT 2,
  goal_type VARCHAR(30) NOT NULL DEFAULT 'general',
  currency_code VARCHAR(10) NOT NULL DEFAULT 'DOP',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  note VARCHAR(500) NOT NULL DEFAULT '',
  shared_scope VARCHAR(30) NOT NULL DEFAULT 'personal',
  shared_group_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_goals_target CHECK (target_amount > 0),
  CONSTRAINT chk_goals_current CHECK (current_amount >= 0),
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS goal_contributions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  goal_id BIGINT NOT NULL,
  account_id BIGINT NOT NULL,
  amount BIGINT NOT NULL,
  contribution_date DATE NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_goal_contribution_amount CHECK (amount > 0),
  CONSTRAINT fk_goal_contributions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_goal_contributions_goal FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  CONSTRAINT fk_goal_contributions_account FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS financial_snapshots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  snapshot_date DATE NOT NULL,
  primary_currency VARCHAR(10) NOT NULL DEFAULT 'DOP',
  liquid_balance BIGINT NOT NULL DEFAULT 0,
  goal_reserves BIGINT NOT NULL DEFAULT 0,
  liabilities BIGINT NOT NULL DEFAULT 0,
  net_worth BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_financial_snapshot_user_date_currency (user_id, snapshot_date, primary_currency),
  CONSTRAINT fk_financial_snapshots_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mail_sync_connections (
  user_id BIGINT PRIMARY KEY,
  sync_token VARCHAR(80) NOT NULL UNIQUE,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  auto_mode VARCHAR(30) NOT NULL DEFAULT 'review',
  last_received_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mail_sync_connections_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mail_sync_sources (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  institution_name VARCHAR(160) NOT NULL,
  sender_match VARCHAR(190) NOT NULL,
  account_id BIGINT NOT NULL,
  masked_ref VARCHAR(20) NOT NULL DEFAULT '',
  default_category_id BIGINT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mail_sync_sources_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mail_sync_sources_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT fk_mail_sync_sources_category FOREIGN KEY (default_category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS mail_sync_messages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  source_id BIGINT NULL,
  message_hash CHAR(64) NOT NULL UNIQUE,
  sender VARCHAR(255) NOT NULL DEFAULT '',
  subject VARCHAR(500) NOT NULL DEFAULT '',
  received_at DATETIME NOT NULL,
  movement_type VARCHAR(30) NOT NULL DEFAULT 'unknown',
  amount BIGINT NOT NULL DEFAULT 0,
  reported_balance BIGINT NOT NULL DEFAULT 0,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'DOP',
  merchant VARCHAR(255) NOT NULL DEFAULT '',
  reference VARCHAR(160) NOT NULL DEFAULT '',
  masked_ref VARCHAR(20) NOT NULL DEFAULT '',
  confidence INT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'review',
  transaction_id BIGINT NULL,
  excerpt VARCHAR(1200) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mail_sync_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mail_sync_messages_source FOREIGN KEY (source_id) REFERENCES mail_sync_sources(id) ON DELETE SET NULL,
  CONSTRAINT fk_mail_sync_messages_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS app_meta (
  `key` VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adjustments_user_account ON account_balance_adjustments(user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_notification_log_user_date ON notification_log(user_id, sent_on);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiration ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_mail_sync_sources_user ON mail_sync_sources(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_mail_sync_messages_user_status ON mail_sync_messages(user_id, status, received_at);

CREATE INDEX IF NOT EXISTS idx_recurring_user_due ON recurring_payments(user_id, is_active, next_due_date);

CREATE INDEX IF NOT EXISTS idx_hidden_categories_user ON user_hidden_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_cards_user_active ON credit_cards(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_debts_user_active_due ON debts(user_id, is_active, next_due_date);
CREATE INDEX IF NOT EXISTS idx_liability_payments_user ON liability_payments(user_id, liability_type, liability_id);

CREATE INDEX IF NOT EXISTS idx_card_consumptions_user_date ON credit_card_consumptions(user_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_goal_contributions_user_goal ON goal_contributions(user_id, goal_id);
CREATE INDEX IF NOT EXISTS idx_financial_snapshots_user_date ON financial_snapshots(user_id, snapshot_date);

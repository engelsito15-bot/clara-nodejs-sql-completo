CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(40) NOT NULL UNIQUE,
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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_adjustments_previous CHECK (previous_balance >= 0),
  CONSTRAINT chk_adjustments_new CHECK (new_balance >= 0),
  CONSTRAINT fk_adjustments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_adjustments_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL UNIQUE,
  symbol VARCHAR(20) NOT NULL,
  color VARCHAR(30) NOT NULL DEFAULT 'mint',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_goals_target CHECK (target_amount > 0),
  CONSTRAINT chk_goals_current CHECK (current_amount >= 0),
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_meta (
  `key` VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adjustments_user_account ON account_balance_adjustments(user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiration ON sessions(expires_at);

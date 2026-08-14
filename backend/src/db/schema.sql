PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'DOP',
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  age INTEGER,
  income_type TEXT NOT NULL DEFAULT '',
  income_frequency TEXT NOT NULL DEFAULT '',
  income_amount INTEGER NOT NULL DEFAULT 0 CHECK (income_amount >= 0),
  has_payroll_account INTEGER NOT NULL DEFAULT 0,
  fixed_expenses INTEGER NOT NULL DEFAULT 0 CHECK (fixed_expenses >= 0),
  planning_period TEXT NOT NULL DEFAULT 'monthly' CHECK (planning_period IN ('monthly', 'biweekly')),
  plan_purpose TEXT NOT NULL DEFAULT '',
  savings_target_percent INTEGER NOT NULL DEFAULT 10 CHECK (savings_target_percent BETWEEN 0 AND 100),
  primary_goal TEXT NOT NULL DEFAULT 'control',
  employment_status TEXT NOT NULL DEFAULT 'employee',
  dependents INTEGER NOT NULL DEFAULT 0,
  debt_balance INTEGER NOT NULL DEFAULT 0 CHECK (debt_balance >= 0),
  debt_monthly_payment INTEGER NOT NULL DEFAULT 0 CHECK (debt_monthly_payment >= 0),
  emergency_savings INTEGER NOT NULL DEFAULT 0 CHECK (emergency_savings >= 0),
  payday_one INTEGER,
  payday_two INTEGER,
  financial_confidence INTEGER NOT NULL DEFAULT 3,
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bank', 'savings', 'cash')),
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  color TEXT NOT NULL DEFAULT 'mint',
  institution_type TEXT NOT NULL DEFAULT 'other',
  institution_name TEXT NOT NULL DEFAULT '',
  product_type TEXT NOT NULL DEFAULT 'other',
  nickname TEXT NOT NULL DEFAULT '',
  is_archived INTEGER NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'DOP',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS account_balance_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  previous_balance INTEGER NOT NULL CHECK (previous_balance >= 0),
  new_balance INTEGER NOT NULL CHECK (new_balance >= 0),
  reason TEXT NOT NULL DEFAULT '',
  currency_code TEXT NOT NULL DEFAULT 'DOP',
  source TEXT NOT NULL DEFAULT 'MANUAL',
  adjustment_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  symbol TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'mint',
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budgets (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  monthly_limit INTEGER NOT NULL DEFAULT 0 CHECK (monthly_limit >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category_id)
);

CREATE TABLE IF NOT EXISTS period_budgets (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  limit_amount INTEGER NOT NULL DEFAULT 0 CHECK (limit_amount >= 0),
  budget_kind TEXT NOT NULL DEFAULT 'flexible' CHECK (budget_kind IN ('fixed', 'flexible', 'savings')),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category_id, period_key)
);


CREATE TABLE IF NOT EXISTS recurring_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'yearly')),
  next_due_date TEXT NOT NULL,
  due_day INTEGER,
  due_month INTEGER,
  is_mandatory INTEGER NOT NULL DEFAULT 1,
  auto_create_transaction INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  last_paid_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS user_hidden_categories (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category_id)
);

CREATE TABLE IF NOT EXISTS credit_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  institution_name TEXT NOT NULL DEFAULT '',
  currency_code TEXT NOT NULL DEFAULT 'DOP',
  credit_limit INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  current_balance INTEGER NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
  statement_day INTEGER NOT NULL DEFAULT 1,
  due_day INTEGER NOT NULL DEFAULT 20,
  minimum_payment INTEGER NOT NULL DEFAULT 0 CHECK (minimum_payment >= 0),
  annual_interest_rate REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lender TEXT NOT NULL DEFAULT '',
  debt_type TEXT NOT NULL DEFAULT 'personal',
  currency_code TEXT NOT NULL DEFAULT 'DOP',
  original_amount INTEGER NOT NULL CHECK (original_amount > 0),
  current_balance INTEGER NOT NULL CHECK (current_balance >= 0),
  regular_payment INTEGER NOT NULL DEFAULT 0 CHECK (regular_payment >= 0),
  payment_frequency TEXT NOT NULL DEFAULT 'monthly',
  annual_interest_rate REAL NOT NULL DEFAULT 0,
  next_due_date TEXT,
  end_date TEXT,
  note TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS credit_card_consumptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES credit_cards(id),
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  purchase_date TEXT NOT NULL,
  installments INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS liability_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  liability_type TEXT NOT NULL CHECK (liability_type IN ('card','debt')),
  liability_id INTEGER NOT NULL,
  source_account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  destination_account_id INTEGER REFERENCES accounts(id),
  category_id INTEGER REFERENCES categories(id),
  transaction_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'MANUAL',
  currency_code TEXT NOT NULL DEFAULT 'DOP',
  destination_amount INTEGER,
  destination_currency_code TEXT,
  balance_after INTEGER,
  destination_balance_after INTEGER,
  period_key TEXT NOT NULL DEFAULT '',
  external_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL CHECK (target_amount > 0),
  current_amount INTEGER NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  due_date TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'sun',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adjustments_user_account ON account_balance_adjustments(user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiration ON sessions(expires_at);


CREATE INDEX IF NOT EXISTS idx_hidden_categories_user ON user_hidden_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_cards_user_active ON credit_cards(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_debts_user_active_due ON debts(user_id, is_active, next_due_date);
CREATE INDEX IF NOT EXISTS idx_liability_payments_user ON liability_payments(user_id, liability_type, liability_id);

PRAGMA optimize;

CREATE INDEX IF NOT EXISTS idx_recurring_user_due ON recurring_payments(user_id, is_active, next_due_date);

CREATE INDEX IF NOT EXISTS idx_card_consumptions_user_date ON credit_card_consumptions(user_id, purchase_date);

import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const defaultDatabasePath = join(currentDirectory, "..", "data", "clara.sqlite");
const sqliteSchemaPath = join(currentDirectory, "db", "schema.sql");
const tidbSchemaPath = join(currentDirectory, "db", "schema.tidb.sql");

const baseCategories = [
  [1, "Vivienda", "VI", "forest"],
  [2, "Alimentación", "AL", "coral"],
  [3, "Transporte", "TR", "sky"],
  [4, "Bienestar", "BI", "lilac"],
  [5, "Ocio", "OC", "sun"],
  [6, "Educación", "ED", "mint"],
  [7, "Salud", "SA", "coral"],
  [8, "Servicios", "SE", "sky"],
  [9, "Trabajo", "TR", "forest"],
  [10, "Deudas", "DE", "lilac"],
  [11, "Compras", "CO", "sun"],
  [12, "Otros", "OT", "mint"],
];

const defaultAccounts = [
  ["Cuenta principal", "bank", "forest"],
  ["Ahorros", "savings", "mint"],
  ["Efectivo", "cash", "sun"],
];

function sqliteColumnExists(database, table, column) {
  return database.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function ensureSqliteMultiUserSchema(database) {
  const columns = [
    ["users", "first_name", "TEXT NOT NULL DEFAULT ''"],
    ["users", "last_name", "TEXT NOT NULL DEFAULT ''"],
    ["users", "phone", "TEXT NOT NULL DEFAULT ''"],
    ["accounts", "user_id", "INTEGER"],
    ["accounts", "institution_type", "TEXT NOT NULL DEFAULT 'other'"],
    ["accounts", "institution_name", "TEXT NOT NULL DEFAULT ''"],
    ["accounts", "product_type", "TEXT NOT NULL DEFAULT 'other'"],
    ["accounts", "nickname", "TEXT NOT NULL DEFAULT ''"],
    ["accounts", "is_archived", "INTEGER NOT NULL DEFAULT 0"],
    ["accounts", "currency_code", "TEXT NOT NULL DEFAULT 'DOP'"],
    ["transactions", "user_id", "INTEGER"],
    ["transactions", "source", "TEXT NOT NULL DEFAULT 'MANUAL'"],
    ["transactions", "currency_code", "TEXT NOT NULL DEFAULT 'DOP'"],
    ["transactions", "destination_amount", "INTEGER"],
    ["transactions", "destination_currency_code", "TEXT"],
    ["transactions", "balance_after", "INTEGER"],
    ["transactions", "destination_balance_after", "INTEGER"],
    ["transactions", "period_key", "TEXT NOT NULL DEFAULT ''"],
    ["transactions", "external_ref", "TEXT NOT NULL DEFAULT ''"],
    ["goals", "user_id", "INTEGER"],
    ["categories", "display_name", "TEXT NOT NULL DEFAULT ''"],
    ["categories", "user_id", "INTEGER"],
    ["categories", "parent_id", "INTEGER"],
    ["categories", "is_system", "INTEGER NOT NULL DEFAULT 0"],
    ["categories", "is_active", "INTEGER NOT NULL DEFAULT 1"],
    ["account_balance_adjustments", "currency_code", "TEXT NOT NULL DEFAULT 'DOP'"],
    ["account_balance_adjustments", "source", "TEXT NOT NULL DEFAULT 'MANUAL'"],
    ["account_balance_adjustments", "adjustment_date", "TEXT NOT NULL DEFAULT ''"],
    ["user_profiles", "employment_status", "TEXT NOT NULL DEFAULT 'employee'"],
    ["user_profiles", "dependents", "INTEGER NOT NULL DEFAULT 0"],
    ["user_profiles", "debt_balance", "INTEGER NOT NULL DEFAULT 0"],
    ["user_profiles", "debt_monthly_payment", "INTEGER NOT NULL DEFAULT 0"],
    ["user_profiles", "emergency_savings", "INTEGER NOT NULL DEFAULT 0"],
    ["user_profiles", "payday_one", "INTEGER"],
    ["user_profiles", "payday_two", "INTEGER"],
    ["user_profiles", "financial_confidence", "INTEGER NOT NULL DEFAULT 3"],
  ];

  const accountCurrencyWasMissing = !sqliteColumnExists(database, "accounts", "currency_code");
  const transactionCurrencyWasMissing = !sqliteColumnExists(database, "transactions", "currency_code");

  for (const [table, column, definition] of columns) {
    if (!sqliteColumnExists(database, table, column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS budgets (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      monthly_limit INTEGER NOT NULL DEFAULT 0 CHECK (monthly_limit >= 0),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, category_id)
    );
    CREATE TABLE IF NOT EXISTS account_balance_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      previous_balance INTEGER NOT NULL,
      new_balance INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      currency_code TEXT NOT NULL DEFAULT 'DOP',
      source TEXT NOT NULL DEFAULT 'MANUAL',
      adjustment_date TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_user_active ON accounts(user_id, is_archived);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_period ON transactions(user_id, period_key);
    CREATE INDEX IF NOT EXISTS idx_goals_user_due_date ON goals(user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);
    CREATE INDEX IF NOT EXISTS idx_adjustments_user_account ON account_balance_adjustments(user_id, account_id);
    CREATE INDEX IF NOT EXISTS idx_categories_user_active ON categories(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
  `);

  database.exec(`
    UPDATE categories
       SET display_name = name
     WHERE COALESCE(display_name, '') = '';
    UPDATE categories
       SET is_system = 1
     WHERE user_id IS NULL AND id BETWEEN 1 AND 12;
    UPDATE account_balance_adjustments
       SET adjustment_date = substr(created_at, 1, 10)
     WHERE COALESCE(adjustment_date, '') = '';
  `);

  if (accountCurrencyWasMissing) {
    database.exec(`
      UPDATE accounts
         SET currency_code = COALESCE(
           (SELECT currency_code FROM users WHERE users.id = accounts.user_id),
           'DOP'
         );
      UPDATE account_balance_adjustments
         SET currency_code = COALESCE(
           (SELECT currency_code FROM accounts WHERE accounts.id = account_balance_adjustments.account_id),
           'DOP'
         );
    `);
  }
  if (transactionCurrencyWasMissing) {
    database.exec(`
      UPDATE transactions
         SET currency_code = COALESCE(
           (SELECT currency_code FROM accounts WHERE accounts.id = transactions.account_id),
           'DOP'
         );
      UPDATE transactions
         SET destination_currency_code = (
           SELECT currency_code FROM accounts WHERE accounts.id = transactions.destination_account_id
         )
       WHERE destination_account_id IS NOT NULL;
    `);
  }
}

function seedSqliteCategories(database) {
  const columns = database.prepare("PRAGMA table_info(categories)").all().map((row) => row.name);
  const hasLegacyLimit = columns.includes("monthly_limit");
  const selectCategory = database.prepare("SELECT id FROM categories WHERE id = ?");
  const insertCategory = hasLegacyLimit
    ? database.prepare("INSERT INTO categories (id, name, display_name, symbol, monthly_limit, color, is_system, is_active) VALUES (?, ?, ?, ?, 0, ?, 1, 1)")
    : database.prepare("INSERT INTO categories (id, name, display_name, symbol, color, is_system, is_active) VALUES (?, ?, ?, ?, ?, 1, 1)");
  const updateCategory = database.prepare(
    "UPDATE categories SET display_name = ?, symbol = ?, color = ?, is_system = 1, is_active = 1 WHERE id = ? AND user_id IS NULL",
  );

  database.exec("BEGIN IMMEDIATE");
  try {
    for (const [id, name, symbol, color] of baseCategories) {
      if (selectCategory.get(id)) {
        updateCategory.run(name, symbol, color, id);
      } else if (hasLegacyLimit) {
        insertCategory.run(id, name, name, symbol, color);
      } else {
        insertCategory.run(id, name, name, symbol, color);
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function ensureSqliteUserAccounts(database) {
  const users = database.prepare("SELECT id, currency_code AS currencyCode FROM users ORDER BY id").all();
  const countAccounts = database.prepare("SELECT COUNT(*) AS count FROM accounts WHERE user_id = ? AND COALESCE(is_archived, 0) = 0");
  const insertAccount = database.prepare(
    "INSERT INTO accounts (user_id, name, kind, balance, color, currency_code) VALUES (?, ?, ?, 0, ?, ?)",
  );

  for (const user of users) {
    if (Number(countAccounts.get(user.id).count || 0) > 0) continue;
    for (const [name, kind, color] of defaultAccounts) insertAccount.run(user.id, name, kind, color, user.currencyCode || "DOP");
  }
}

class SqliteDatabase {
  constructor(databasePath = defaultDatabasePath) {
    this.provider = "sqlite";
    this.path = databasePath;
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(readFileSync(sqliteSchemaPath, "utf8"));
    ensureSqliteMultiUserSchema(this.database);
    seedSqliteCategories(this.database);
    ensureSqliteUserAccounts(this.database);
    this.database.exec("PRAGMA optimize");
  }

  async get(sql, params = []) {
    return this.database.prepare(sql).get(...params);
  }

  async all(sql, params = []) {
    return this.database.prepare(sql).all(...params);
  }

  async run(sql, params = []) {
    const result = this.database.prepare(sql).run(...params);
    return { changes: Number(result.changes), insertId: Number(result.lastInsertRowid) };
  }

  async transaction(operation) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = await operation(this);
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async ping() {
    await this.get("SELECT 1 AS ok");
  }

  close() {
    this.database.close();
  }
}

function tidbOptions() {
  const required = ["TIDB_HOST", "TIDB_USER", "TIDB_PASSWORD", "TIDB_DATABASE"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Faltan variables de TiDB: ${missing.join(", ")}`);

  return {
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT || 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: process.env.TIDB_ENABLE_SSL === "true" ? { minVersion: "TLSv1.2" } : undefined,
    waitForConnections: true,
    connectionLimit: Number(process.env.TIDB_CONNECTION_LIMIT || 5),
    queueLimit: 0,
    enableKeepAlive: true,
    supportBigNumbers: true,
    dateStrings: true,
  };
}

function splitSqlStatements(sql) {
  return sql.split(";").map((statement) => statement.trim()).filter(Boolean);
}

async function tidbColumnExists(connection, table, column) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function ensureTidbMultiUserSchema(connection) {
  const columns = [
    ["users", "first_name", "VARCHAR(60) NOT NULL DEFAULT ''"],
    ["users", "last_name", "VARCHAR(80) NOT NULL DEFAULT ''"],
    ["users", "phone", "VARCHAR(30) NOT NULL DEFAULT ''"],
    ["accounts", "user_id", "BIGINT NULL"],
    ["accounts", "institution_type", "VARCHAR(30) NOT NULL DEFAULT 'other'"],
    ["accounts", "institution_name", "VARCHAR(150) NOT NULL DEFAULT ''"],
    ["accounts", "product_type", "VARCHAR(30) NOT NULL DEFAULT 'other'"],
    ["accounts", "nickname", "VARCHAR(80) NOT NULL DEFAULT ''"],
    ["accounts", "is_archived", "TINYINT(1) NOT NULL DEFAULT 0"],
    ["accounts", "currency_code", "VARCHAR(10) NOT NULL DEFAULT 'DOP'"],
    ["transactions", "user_id", "BIGINT NULL"],
    ["transactions", "source", "VARCHAR(20) NOT NULL DEFAULT 'MANUAL'"],
    ["transactions", "currency_code", "VARCHAR(10) NOT NULL DEFAULT 'DOP'"],
    ["transactions", "destination_amount", "BIGINT NULL"],
    ["transactions", "destination_currency_code", "VARCHAR(10) NULL"],
    ["transactions", "balance_after", "BIGINT NULL"],
    ["transactions", "destination_balance_after", "BIGINT NULL"],
    ["transactions", "period_key", "VARCHAR(20) NOT NULL DEFAULT ''"],
    ["transactions", "external_ref", "VARCHAR(120) NOT NULL DEFAULT ''"],
    ["goals", "user_id", "BIGINT NULL"],
    ["categories", "display_name", "VARCHAR(150) NOT NULL DEFAULT ''"],
    ["categories", "user_id", "BIGINT NULL"],
    ["categories", "parent_id", "BIGINT NULL"],
    ["categories", "is_system", "TINYINT(1) NOT NULL DEFAULT 0"],
    ["categories", "is_active", "TINYINT(1) NOT NULL DEFAULT 1"],
    ["account_balance_adjustments", "currency_code", "VARCHAR(10) NOT NULL DEFAULT 'DOP'"],
    ["account_balance_adjustments", "source", "VARCHAR(20) NOT NULL DEFAULT 'MANUAL'"],
    ["account_balance_adjustments", "adjustment_date", "DATE NULL"],
    ["user_profiles", "employment_status", "VARCHAR(30) NOT NULL DEFAULT 'employee'"],
    ["user_profiles", "dependents", "INT NOT NULL DEFAULT 0"],
    ["user_profiles", "debt_balance", "BIGINT NOT NULL DEFAULT 0"],
    ["user_profiles", "debt_monthly_payment", "BIGINT NOT NULL DEFAULT 0"],
    ["user_profiles", "emergency_savings", "BIGINT NOT NULL DEFAULT 0"],
    ["user_profiles", "payday_one", "INT NULL"],
    ["user_profiles", "payday_two", "INT NULL"],
    ["user_profiles", "financial_confidence", "INT NOT NULL DEFAULT 3"],
  ];

  const accountCurrencyWasMissing = !(await tidbColumnExists(connection, "accounts", "currency_code"));
  const transactionCurrencyWasMissing = !(await tidbColumnExists(connection, "transactions", "currency_code"));

  for (const [table, column, definition] of columns) {
    if (!(await tidbColumnExists(connection, table, column))) {
      await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  await connection.query(`CREATE TABLE IF NOT EXISTS budgets (
    user_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    monthly_limit BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, category_id),
    CONSTRAINT chk_budgets_limit CHECK (monthly_limit >= 0),
    CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_budgets_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  )`);

  await connection.query(`CREATE TABLE IF NOT EXISTS account_balance_adjustments (
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
    CONSTRAINT fk_adjustments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_adjustments_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`);

  await connection.query("UPDATE categories SET display_name = name WHERE COALESCE(display_name, '') = ''");
  await connection.query("UPDATE categories SET is_system = 1 WHERE user_id IS NULL AND id BETWEEN 1 AND 12");
  await connection.query("UPDATE account_balance_adjustments SET adjustment_date = DATE(created_at) WHERE adjustment_date IS NULL");

  if (accountCurrencyWasMissing) {
    await connection.query(`
      UPDATE accounts a
      JOIN users u ON u.id = a.user_id
         SET a.currency_code = u.currency_code
    `);
    await connection.query(`
      UPDATE account_balance_adjustments aa
      JOIN accounts a ON a.id = aa.account_id
         SET aa.currency_code = a.currency_code
    `);
  }
  if (transactionCurrencyWasMissing) {
    await connection.query(`
      UPDATE transactions t
      JOIN accounts a ON a.id = t.account_id
         SET t.currency_code = a.currency_code
    `);
    await connection.query(`
      UPDATE transactions t
      JOIN accounts a ON a.id = t.destination_account_id
         SET t.destination_currency_code = a.currency_code
       WHERE t.destination_account_id IS NOT NULL
    `);
  }

  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_accounts_user_active ON accounts(user_id, is_archived)",
    "CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date)",
    "CREATE INDEX IF NOT EXISTS idx_transactions_user_period ON transactions(user_id, period_key)",
    "CREATE INDEX IF NOT EXISTS idx_goals_user_due_date ON goals(user_id, due_date)",
    "CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_adjustments_user_account ON account_balance_adjustments(user_id, account_id)",
    "CREATE INDEX IF NOT EXISTS idx_categories_user_active ON categories(user_id, is_active)",
    "CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id)",
  ];
  for (const statement of indexes) await connection.query(statement);
}

async function seedTidbCategories(connection) {
  const hasLegacyLimit = await tidbColumnExists(connection, "categories", "monthly_limit");
  for (const [id, name, symbol, color] of baseCategories) {
    const [[existing]] = await connection.execute("SELECT id FROM categories WHERE id = ?", [id]);
    if (existing) {
      await connection.execute(
        "UPDATE categories SET display_name = ?, symbol = ?, color = ?, is_system = 1, is_active = 1 WHERE id = ? AND user_id IS NULL",
        [name, symbol, color, id],
      );
      continue;
    }
    if (hasLegacyLimit) {
      await connection.execute(
        "INSERT INTO categories (id, name, display_name, symbol, monthly_limit, color, is_system, is_active) VALUES (?, ?, ?, ?, 0, ?, 1, 1)",
        [id, name, name, symbol, color],
      );
    } else {
      await connection.execute(
        "INSERT INTO categories (id, name, display_name, symbol, color, is_system, is_active) VALUES (?, ?, ?, ?, ?, 1, 1)",
        [id, name, name, symbol, color],
      );
    }
  }
}

async function ensureTidbUserAccounts(connection) {
  const [users] = await connection.query("SELECT id, currency_code AS currencyCode FROM users ORDER BY id");
  for (const user of users) {
    const [[row]] = await connection.execute("SELECT COUNT(*) AS count FROM accounts WHERE user_id = ? AND COALESCE(is_archived, 0) = 0", [user.id]);
    if (Number(row.count || 0) > 0) continue;
    for (const [name, kind, color] of defaultAccounts) {
      await connection.execute(
        "INSERT INTO accounts (user_id, name, kind, balance, color, currency_code) VALUES (?, ?, ?, 0, ?, ?)",
        [user.id, name, kind, color, user.currencyCode || "DOP"],
      );
    }
  }
}

class TidbDatabase {
  constructor() {
    this.provider = "tidb";
    const mysql = require("mysql2/promise");
    this.pool = mysql.createPool(tidbOptions());
    this.ready = this.initialize();
  }

  async initialize() {
    const connection = await this.pool.getConnection();
    try {
      const schema = readFileSync(tidbSchemaPath, "utf8");
      for (const statement of splitSqlStatements(schema)) await connection.query(statement);
      await ensureTidbMultiUserSchema(connection);
      if (process.env.SEED_BASE_DATA !== "false") await seedTidbCategories(connection);
      await ensureTidbUserAccounts(connection);
    } finally {
      connection.release();
    }
  }

  async get(sql, params = []) {
    await this.ready;
    const [rows] = await this.pool.execute(sql, params);
    return rows[0];
  }

  async all(sql, params = []) {
    await this.ready;
    const [rows] = await this.pool.execute(sql, params);
    return rows;
  }

  async run(sql, params = []) {
    await this.ready;
    const [result] = await this.pool.execute(sql, params);
    return { changes: Number(result.affectedRows || 0), insertId: Number(result.insertId || 0) };
  }

  async transaction(operation) {
    await this.ready;
    const connection = await this.pool.getConnection();
    const transactionDatabase = {
      provider: this.provider,
      get: async (sql, params = []) => {
        const [rows] = await connection.execute(sql, params);
        return rows[0];
      },
      all: async (sql, params = []) => {
        const [rows] = await connection.execute(sql, params);
        return rows;
      },
      run: async (sql, params = []) => {
        const [result] = await connection.execute(sql, params);
        return { changes: Number(result.affectedRows || 0), insertId: Number(result.insertId || 0) };
      },
    };

    try {
      await connection.beginTransaction();
      const result = await operation(transactionDatabase);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async ping() {
    await this.ready;
    await this.get("SELECT 1 AS ok");
  }

  async close() {
    await this.pool.end();
  }
}

export function createSqliteDatabase(databasePath = process.env.DB_PATH || defaultDatabasePath) {
  return new SqliteDatabase(databasePath);
}

export function createTidbDatabase() {
  return new TidbDatabase();
}

export function createDatabase(databasePath) {
  if (databasePath || (process.env.DB_PROVIDER || "").toLowerCase() !== "tidb") {
    return createSqliteDatabase(databasePath || process.env.DB_PATH || defaultDatabasePath);
  }
  return createTidbDatabase();
}

export function runInTransaction(database, operation) {
  return database.transaction(operation);
}

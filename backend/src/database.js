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
  if (!sqliteColumnExists(database, "accounts", "user_id")) {
    database.exec("ALTER TABLE accounts ADD COLUMN user_id INTEGER");
  }
  if (!sqliteColumnExists(database, "transactions", "user_id")) {
    database.exec("ALTER TABLE transactions ADD COLUMN user_id INTEGER");
  }
  if (!sqliteColumnExists(database, "goals", "user_id")) {
    database.exec("ALTER TABLE goals ADD COLUMN user_id INTEGER");
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS budgets (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      monthly_limit INTEGER NOT NULL DEFAULT 0 CHECK (monthly_limit >= 0),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, category_id)
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_goals_user_due_date ON goals(user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);
  `);
}

function seedSqliteCategories(database) {
  const categoryCount = Number(database.prepare("SELECT COUNT(*) AS count FROM categories").get().count || 0);
  if (categoryCount) return;

  const columns = database.prepare("PRAGMA table_info(categories)").all().map((row) => row.name);
  const hasLegacyLimit = columns.includes("monthly_limit");
  const insertCategory = hasLegacyLimit
    ? database.prepare("INSERT INTO categories (id, name, symbol, monthly_limit, color) VALUES (?, ?, ?, 0, ?)")
    : database.prepare("INSERT INTO categories (id, name, symbol, color) VALUES (?, ?, ?, ?)");

  database.exec("BEGIN IMMEDIATE");
  try {
    baseCategories.forEach((row) => insertCategory.run(...row));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function ensureSqliteUserAccounts(database) {
  const users = database.prepare("SELECT id FROM users ORDER BY id").all();
  const countAccounts = database.prepare("SELECT COUNT(*) AS count FROM accounts WHERE user_id = ?");
  const insertAccount = database.prepare(
    "INSERT INTO accounts (user_id, name, kind, balance, color) VALUES (?, ?, ?, 0, ?)",
  );

  for (const user of users) {
    if (Number(countAccounts.get(user.id).count || 0) > 0) continue;
    for (const [name, kind, color] of defaultAccounts) insertAccount.run(user.id, name, kind, color);
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
  if (!(await tidbColumnExists(connection, "accounts", "user_id"))) {
    await connection.query("ALTER TABLE accounts ADD COLUMN user_id BIGINT NULL");
  }
  if (!(await tidbColumnExists(connection, "transactions", "user_id"))) {
    await connection.query("ALTER TABLE transactions ADD COLUMN user_id BIGINT NULL");
  }
  if (!(await tidbColumnExists(connection, "goals", "user_id"))) {
    await connection.query("ALTER TABLE goals ADD COLUMN user_id BIGINT NULL");
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

  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date)",
    "CREATE INDEX IF NOT EXISTS idx_goals_user_due_date ON goals(user_id, due_date)",
    "CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id)",
  ];
  for (const statement of indexes) await connection.query(statement);
}

async function seedTidbCategories(connection) {
  const [[categoryCountRow]] = await connection.query("SELECT COUNT(*) AS count FROM categories");
  if (Number(categoryCountRow.count || 0)) return;

  const hasLegacyLimit = await tidbColumnExists(connection, "categories", "monthly_limit");
  for (const [id, name, symbol, color] of baseCategories) {
    if (hasLegacyLimit) {
      await connection.execute(
        "INSERT INTO categories (id, name, symbol, monthly_limit, color) VALUES (?, ?, ?, 0, ?)",
        [id, name, symbol, color],
      );
    } else {
      await connection.execute(
        "INSERT INTO categories (id, name, symbol, color) VALUES (?, ?, ?, ?)",
        [id, name, symbol, color],
      );
    }
  }
}

async function ensureTidbUserAccounts(connection) {
  const [users] = await connection.query("SELECT id FROM users ORDER BY id");
  for (const user of users) {
    const [[row]] = await connection.execute("SELECT COUNT(*) AS count FROM accounts WHERE user_id = ?", [user.id]);
    if (Number(row.count || 0) > 0) continue;
    for (const [name, kind, color] of defaultAccounts) {
      await connection.execute(
        "INSERT INTO accounts (user_id, name, kind, balance, color) VALUES (?, ?, ?, 0, ?)",
        [user.id, name, kind, color],
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

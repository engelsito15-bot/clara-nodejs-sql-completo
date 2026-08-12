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

const baseAccounts = [
  [1, "Cuenta principal", "bank", 0, "forest"],
  [2, "Ahorros", "savings", 0, "mint"],
  [3, "Efectivo", "cash", 0, "sun"],
];

const baseCategories = [
  [1, "Vivienda", "VI", 0, "forest"],
  [2, "Alimentación", "AL", 0, "coral"],
  [3, "Transporte", "TR", 0, "sky"],
  [4, "Bienestar", "BI", 0, "lilac"],
  [5, "Ocio", "OC", 0, "sun"],
  [6, "Educación", "ED", 0, "mint"],
];

function seedSqliteDatabase(database) {
  const seed = database.prepare("SELECT value FROM app_meta WHERE key = ?").get("base_seed_v2");
  if (seed) return;

  const accountCount = Number(database.prepare("SELECT COUNT(*) AS count FROM accounts").get().count || 0);
  const categoryCount = Number(database.prepare("SELECT COUNT(*) AS count FROM categories").get().count || 0);

  database.exec("BEGIN IMMEDIATE");
  try {
    if (!accountCount) {
      const insertAccount = database.prepare(
        "INSERT INTO accounts (id, name, kind, balance, color) VALUES (?, ?, ?, ?, ?)",
      );
      baseAccounts.forEach((row) => insertAccount.run(...row));
    }

    if (!categoryCount) {
      const insertCategory = database.prepare(
        "INSERT INTO categories (id, name, symbol, monthly_limit, color) VALUES (?, ?, ?, ?, ?)",
      );
      baseCategories.forEach((row) => insertCategory.run(...row));
    }

    database.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run("base_seed_v2", "1");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

class SqliteDatabase {
  constructor(databasePath = defaultDatabasePath) {
    this.provider = "sqlite";
    this.path = databasePath;
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(readFileSync(sqliteSchemaPath, "utf8"));
    seedSqliteDatabase(this.database);
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

async function seedTidbDatabase(connection) {
  const [seedRows] = await connection.execute("SELECT value FROM app_meta WHERE `key` = ?", ["base_seed_v2"]);
  if (seedRows.length) return;

  const [[accountCountRow]] = await connection.query("SELECT COUNT(*) AS count FROM accounts");
  const [[categoryCountRow]] = await connection.query("SELECT COUNT(*) AS count FROM categories");

  await connection.beginTransaction();
  try {
    if (!Number(accountCountRow.count || 0)) {
      for (const row of baseAccounts) {
        await connection.execute(
          "INSERT INTO accounts (id, name, kind, balance, color) VALUES (?, ?, ?, ?, ?)",
          row,
        );
      }
    }

    if (!Number(categoryCountRow.count || 0)) {
      for (const row of baseCategories) {
        await connection.execute(
          "INSERT INTO categories (id, name, symbol, monthly_limit, color) VALUES (?, ?, ?, ?, ?)",
          row,
        );
      }
    }

    await connection.execute(
      "INSERT INTO app_meta (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      ["base_seed_v2", "1"],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
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
      if (process.env.SEED_BASE_DATA !== "false") await seedTidbDatabase(connection);
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

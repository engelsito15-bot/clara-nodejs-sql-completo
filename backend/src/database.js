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

function currentMonthDate(day) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return `${year}-${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function futureDate(monthsAhead, day) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function seedSqliteDatabase(database) {
  const seed = database.prepare("SELECT value FROM app_meta WHERE key = ?").get("seeded_v1");
  if (seed) return;

  const insertAccount = database.prepare(
    "INSERT INTO accounts (id, name, kind, balance, color) VALUES (?, ?, ?, ?, ?)",
  );
  const insertCategory = database.prepare(
    "INSERT INTO categories (id, name, symbol, monthly_limit, color) VALUES (?, ?, ?, ?, ?)",
  );
  const insertTransaction = database.prepare(
    `INSERT INTO transactions
      (id, type, description, amount, account_id, destination_account_id, category_id, transaction_date, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertGoal = database.prepare(
    "INSERT INTO goals (id, name, target_amount, current_amount, due_date, color) VALUES (?, ?, ?, ?, ?, ?)",
  );

  database.exec("BEGIN IMMEDIATE");
  try {
    [
      [1, "Cuenta principal", "bank", 986000, "forest"],
      [2, "Ahorros", "savings", 765060, "mint"],
      [3, "Efectivo", "cash", 123000, "sun"],
    ].forEach((row) => insertAccount.run(...row));

    [
      [1, "Vivienda", "VI", 250000, "forest"],
      [2, "Alimentación", "AL", 120000, "coral"],
      [3, "Transporte", "TR", 60000, "sky"],
      [4, "Bienestar", "BI", 45000, "lilac"],
      [5, "Ocio", "OC", 40000, "sun"],
      [6, "Educación", "ED", 50000, "mint"],
    ].forEach((row) => insertCategory.run(...row));

    [
      [1, "income", "Pago mensual", 680000, 1, null, null, currentMonthDate(1), "Ingreso principal"],
      [2, "expense", "Alquiler", 120000, 1, null, 1, currentMonthDate(2), ""],
      [3, "expense", "Supermercado", 42050, 1, null, 2, currentMonthDate(3), "Compra semanal"],
      [4, "expense", "Internet hogar", 19000, 1, null, 1, currentMonthDate(4), ""],
      [5, "expense", "Gimnasio", 18540, 1, null, 4, currentMonthDate(5), ""],
      [6, "expense", "Mercado", 32200, 3, null, 2, currentMonthDate(6), ""],
      [7, "expense", "Combustible", 13000, 1, null, 3, currentMonthDate(6), ""],
      [8, "expense", "Transporte urbano", 12800, 3, null, 3, currentMonthDate(7), ""],
      [9, "expense", "Curso de diseño", 12000, 1, null, 6, currentMonthDate(8), ""],
      [10, "expense", "Cine y café", 21000, 1, null, 5, currentMonthDate(8), ""],
      [11, "expense", "Electricidad", 16000, 1, null, 1, currentMonthDate(9), ""],
    ].forEach((row) => insertTransaction.run(...row));

    insertGoal.run(1, "Fondo de emergencia", 1500000, 765060, futureDate(7, 31), "mint");
    insertGoal.run(2, "Viaje soñado", 850000, 245000, futureDate(5, 15), "sun");
    database.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run("seeded_v1", "1");
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
  if (missing.length) {
    throw new Error(`Faltan variables de TiDB: ${missing.join(", ")}`);
  }

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
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function seedTidbDatabase(connection) {
  const [seedRows] = await connection.execute("SELECT value FROM app_meta WHERE `key` = ?", ["seeded_v1"]);
  if (seedRows.length) return;

  await connection.beginTransaction();
  try {
    const accounts = [
      [1, "Cuenta principal", "bank", 986000, "forest"],
      [2, "Ahorros", "savings", 765060, "mint"],
      [3, "Efectivo", "cash", 123000, "sun"],
    ];
    for (const row of accounts) {
      await connection.execute(
        "INSERT INTO accounts (id, name, kind, balance, color) VALUES (?, ?, ?, ?, ?)",
        row,
      );
    }

    const categories = [
      [1, "Vivienda", "VI", 250000, "forest"],
      [2, "Alimentación", "AL", 120000, "coral"],
      [3, "Transporte", "TR", 60000, "sky"],
      [4, "Bienestar", "BI", 45000, "lilac"],
      [5, "Ocio", "OC", 40000, "sun"],
      [6, "Educación", "ED", 50000, "mint"],
    ];
    for (const row of categories) {
      await connection.execute(
        "INSERT INTO categories (id, name, symbol, monthly_limit, color) VALUES (?, ?, ?, ?, ?)",
        row,
      );
    }

    const transactions = [
      [1, "income", "Pago mensual", 680000, 1, null, null, currentMonthDate(1), "Ingreso principal"],
      [2, "expense", "Alquiler", 120000, 1, null, 1, currentMonthDate(2), ""],
      [3, "expense", "Supermercado", 42050, 1, null, 2, currentMonthDate(3), "Compra semanal"],
      [4, "expense", "Internet hogar", 19000, 1, null, 1, currentMonthDate(4), ""],
      [5, "expense", "Gimnasio", 18540, 1, null, 4, currentMonthDate(5), ""],
      [6, "expense", "Mercado", 32200, 3, null, 2, currentMonthDate(6), ""],
      [7, "expense", "Combustible", 13000, 1, null, 3, currentMonthDate(6), ""],
      [8, "expense", "Transporte urbano", 12800, 3, null, 3, currentMonthDate(7), ""],
      [9, "expense", "Curso de diseño", 12000, 1, null, 6, currentMonthDate(8), ""],
      [10, "expense", "Cine y café", 21000, 1, null, 5, currentMonthDate(8), ""],
      [11, "expense", "Electricidad", 16000, 1, null, 1, currentMonthDate(9), ""],
    ];
    for (const row of transactions) {
      await connection.execute(
        `INSERT INTO transactions
          (id, type, description, amount, account_id, destination_account_id, category_id, transaction_date, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row,
      );
    }

    await connection.execute(
      "INSERT INTO goals (id, name, target_amount, current_amount, due_date, color) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "Fondo de emergencia", 1500000, 765060, futureDate(7, 31), "mint"],
    );
    await connection.execute(
      "INSERT INTO goals (id, name, target_amount, current_amount, due_date, color) VALUES (?, ?, ?, ?, ?, ?)",
      [2, "Viaje soñado", 850000, 245000, futureDate(5, 15), "sun"],
    );
    await connection.execute("INSERT INTO app_meta (`key`, value) VALUES (?, ?)", ["seeded_v1", "1"]);
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
      for (const statement of splitSqlStatements(schema)) {
        await connection.query(statement);
      }
      if (process.env.SEED_DEMO_DATA !== "false") {
        await seedTidbDatabase(connection);
      }
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

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createSqliteDatabase, createTidbDatabase } from "../src/database.js";

const sqlitePath = resolve(process.env.SQLITE_SOURCE_PATH || "./data/clara.sqlite");
if (!existsSync(sqlitePath)) {
  throw new Error(`No existe la base SQLite de origen: ${sqlitePath}`);
}

const source = createSqliteDatabase(sqlitePath);
const target = createTidbDatabase();

async function migrate() {
  try {
    await target.ping();

    const users = await source.all(
      "SELECT id, name, username, password_salt, password_hash, currency_code, created_at FROM users ORDER BY id",
    );
    const accounts = await source.all(
      "SELECT id, user_id, name, kind, balance, color, created_at FROM accounts WHERE user_id IS NOT NULL ORDER BY id",
    );
    const categories = await source.all(
      "SELECT id, name, symbol, color, created_at FROM categories ORDER BY id",
    );
    const budgets = await source.all(
      "SELECT user_id, category_id, monthly_limit, updated_at FROM budgets ORDER BY user_id, category_id",
    );
    const transactions = await source.all(
      `SELECT id, user_id, type, description, amount, account_id, destination_account_id, category_id,
              transaction_date, note, created_at
       FROM transactions WHERE user_id IS NOT NULL ORDER BY id`,
    );
    const goals = await source.all(
      "SELECT id, user_id, name, target_amount, current_amount, due_date, color, created_at FROM goals WHERE user_id IS NOT NULL ORDER BY id",
    );
    const meta = await source.all("SELECT key, value FROM app_meta");

    await target.transaction(async (db) => {
      await db.run("DELETE FROM sessions");
      await db.run("DELETE FROM transactions");
      await db.run("DELETE FROM goals");
      await db.run("DELETE FROM budgets");
      await db.run("DELETE FROM accounts");
      await db.run("DELETE FROM users");
      await db.run("DELETE FROM categories");
      await db.run("DELETE FROM app_meta");

      for (const row of users) {
        await db.run(
          `INSERT INTO users (id, name, username, password_salt, password_hash, currency_code, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [row.id, row.name, row.username, row.password_salt, row.password_hash, row.currency_code, row.created_at],
        );
      }

      for (const row of categories) {
        await db.run(
          "INSERT INTO categories (id, name, symbol, color, created_at) VALUES (?, ?, ?, ?, ?)",
          [row.id, row.name, row.symbol, row.color, row.created_at],
        );
      }

      for (const row of accounts) {
        await db.run(
          "INSERT INTO accounts (id, user_id, name, kind, balance, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [row.id, row.user_id, row.name, row.kind, row.balance, row.color, row.created_at],
        );
      }

      for (const row of budgets) {
        await db.run(
          "INSERT INTO budgets (user_id, category_id, monthly_limit, updated_at) VALUES (?, ?, ?, ?)",
          [row.user_id, row.category_id, row.monthly_limit, row.updated_at],
        );
      }

      for (const row of transactions) {
        await db.run(
          `INSERT INTO transactions
            (id, user_id, type, description, amount, account_id, destination_account_id, category_id, transaction_date, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.user_id,
            row.type,
            row.description,
            row.amount,
            row.account_id,
            row.destination_account_id,
            row.category_id,
            row.transaction_date,
            row.note,
            row.created_at,
          ],
        );
      }

      for (const row of goals) {
        await db.run(
          `INSERT INTO goals
            (id, user_id, name, target_amount, current_amount, due_date, color, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.id, row.user_id, row.name, row.target_amount, row.current_amount, row.due_date, row.color, row.created_at],
        );
      }

      for (const row of meta) {
        await db.run("INSERT INTO app_meta (`key`, value) VALUES (?, ?)", [row.key, row.value]);
      }
    });

    console.log("Migración multiusuario completada correctamente.");
    console.log(`Usuarios: ${users.length}`);
    console.log(`Cuentas: ${accounts.length}`);
    console.log(`Categorías: ${categories.length}`);
    console.log(`Presupuestos: ${budgets.length}`);
    console.log(`Movimientos: ${transactions.length}`);
    console.log(`Metas: ${goals.length}`);
    console.log("Las sesiones no se migran: cada usuario debe iniciar sesión nuevamente.");  } finally {
    source.close();
    await target.close();
  }
}

migrate().catch((error) => {
  console.error("No se pudo migrar SQLite a TiDB:", error);
  process.exitCode = 1;
});

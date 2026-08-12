import { createDatabase, runInTransaction } from "../src/database.js";

const database = createDatabase();
const defaultAccounts = [
  ["Cuenta principal", "bank", "forest"],
  ["Ahorros", "savings", "mint"],
  ["Efectivo", "cash", "sun"],
];

try {
  await runInTransaction(database, async (transaction) => {
    await transaction.run("DELETE FROM transactions");
    await transaction.run("DELETE FROM goals");
    await transaction.run("DELETE FROM budgets");
    await transaction.run("DELETE FROM accounts");

    const users = await transaction.all("SELECT id FROM users ORDER BY id");
    for (const user of users) {
      for (const [name, kind, color] of defaultAccounts) {
        await transaction.run(
          "INSERT INTO accounts (user_id, name, kind, balance, color) VALUES (?, ?, ?, 0, ?)",
          [user.id, name, kind, color],
        );
      }
    }
  });
  console.log("Clara quedó limpia: cada perfil conserva sus credenciales y recibe sus cuentas en 0, sin movimientos, metas ni presupuestos.");
} catch (error) {
  console.error("No se pudo limpiar la base de datos:", error);
  process.exitCode = 1;
} finally {
  await database.close?.();
}

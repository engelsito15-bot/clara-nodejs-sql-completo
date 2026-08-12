import { createDatabase, runInTransaction } from "../src/database.js";

const database = createDatabase();

try {
  await runInTransaction(database, async (transaction) => {
    await transaction.run("DELETE FROM transactions");
    await transaction.run("DELETE FROM goals");
    await transaction.run("UPDATE accounts SET balance = 0");
    await transaction.run("UPDATE categories SET monthly_limit = 0");
  });
  console.log("Clara quedó limpia: cuentas en 0, sin movimientos ni metas y presupuestos en 0.");
} catch (error) {
  console.error("No se pudo limpiar la base de datos:", error);
  process.exitCode = 1;
} finally {
  await database.close?.();
}

import { resolve } from "node:path";
import { createApp } from "./app.js";
import { runFinancialReminders } from "./pwa.js";

const port = Number(process.env.PORT || 4000);
const databasePath = process.env.DB_PROVIDER === "tidb" ? undefined : process.env.DB_PATH ? resolve(process.env.DB_PATH) : undefined;
const app = createApp({ databasePath });

const server = app.listen(port, () => {
  console.log(`Clara está disponible en http://localhost:${port}`);
});

// Mientras Render esté despierto, Clara revisa recordatorios cada 15 minutos.
// Para recordatorios confiables aun cuando el servicio duerma, usa /api/pwa/reminders/run
// desde n8n/GitHub Actions con PWA_CRON_SECRET.
const reminderTimer = setInterval(() => {
  runFinancialReminders(app.locals.database).catch((error) => console.error("Clara reminders:", error?.message || error));
}, 15 * 60 * 1000);
reminderTimer.unref?.();

setTimeout(() => {
  runFinancialReminders(app.locals.database).catch(() => {});
}, 20_000).unref?.();

async function shutdown() {
  clearInterval(reminderTimer);
  server.close(async () => {
    await app.locals.database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

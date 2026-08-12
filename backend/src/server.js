import { resolve } from "node:path";
import { createApp } from "./app.js";

const port = Number(process.env.PORT || 4000);
const databasePath = process.env.DB_PROVIDER === "tidb" ? undefined : process.env.DB_PATH ? resolve(process.env.DB_PATH) : undefined;
const app = createApp({ databasePath });

const server = app.listen(port, () => {
  console.log(`Clara está disponible en http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await app.locals.database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";

test("Clara protege la API y guarda movimientos en SQLite", async (context) => {
  const testDirectory = mkdtempSync(join(tmpdir(), "clara-api-"));
  const app = createApp({ databasePath: join(testDirectory, "test.sqlite") });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    app.locals.database.close();
    rmSync(testDirectory, { recursive: true, force: true });
  });

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { status: "ok", database: "sqlite" });

  const statusResponse = await fetch(`${baseUrl}/api/auth/status`);
  assert.equal(statusResponse.status, 200);
  assert.deepEqual(await statusResponse.json(), { setupRequired: true, setupCodeRequired: false });

  const blockedResponse = await fetch(`${baseUrl}/api/finance`);
  assert.equal(blockedResponse.status, 401);

  const setupResponse = await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Usuario Prueba", username: "prueba", password: "Clave1234" }),
  });
  assert.equal(setupResponse.status, 201);
  const setup = await setupResponse.json();
  assert.ok(setup.token);
  assert.equal(setup.user.currencyCode, "DOP");

  const authHeaders = { authorization: `Bearer ${setup.token}` };
  const beforeResponse = await fetch(`${baseUrl}/api/finance`, { headers: authHeaders });
  assert.equal(beforeResponse.status, 200);
  const before = (await beforeResponse.json()).data;
  assert.ok(before.accounts.length >= 3);
  assert.ok(before.categories.length >= 6);
  assert.equal(before.accounts[0].balance, 0);
  assert.equal(before.transactions.length, 0);

  const movementResponse = await fetch(`${baseUrl}/api/finance`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders },
    body: JSON.stringify({
      action: "transaction",
      type: "income",
      description: "Ingreso de prueba",
      amount: "100.00",
      accountId: before.accounts[0].id,
      transactionDate: new Date().toISOString().slice(0, 10),
    }),
  });
  assert.equal(movementResponse.status, 201);
  const after = (await movementResponse.json()).data;
  assert.equal(after.accounts[0].balance, 10000);
  assert.equal(after.transactions[0].description, "Ingreso de prueba");

  const settingsResponse = await fetch(`${baseUrl}/api/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...authHeaders },
    body: JSON.stringify({ currencyCode: "USD" }),
  });
  assert.equal(settingsResponse.status, 200);
  assert.equal((await settingsResponse.json()).user.currencyCode, "USD");
});

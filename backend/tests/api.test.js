import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";

test("Clara separa los datos de cada perfil y protege la API", async (context) => {
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
  assert.deepEqual(await statusResponse.json(), { registrationEnabled: true });

  const blockedResponse = await fetch(`${baseUrl}/api/finance`);
  assert.equal(blockedResponse.status, 401);

  async function register(name, username, currencyCode = "DOP") {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, username, password: "Clave1234", currencyCode }),
    });
    assert.equal(response.status, 201);
    return response.json();
  }

  const first = await register("Usuario Uno", "usuario1", "DOP");
  const second = await register("Usuario Dos", "usuario2", "USD");
  assert.equal(first.user.currencyCode, "DOP");
  assert.equal(second.user.currencyCode, "USD");

  const firstHeaders = { authorization: `Bearer ${first.token}` };
  const secondHeaders = { authorization: `Bearer ${second.token}` };

  const firstBefore = (await (await fetch(`${baseUrl}/api/finance`, { headers: firstHeaders })).json()).data;
  const secondBefore = (await (await fetch(`${baseUrl}/api/finance`, { headers: secondHeaders })).json()).data;
  assert.equal(firstBefore.accounts.length, 3);
  assert.equal(secondBefore.accounts.length, 3);
  assert.ok(firstBefore.accounts.every((account) => account.balance === 0));
  assert.ok(secondBefore.accounts.every((account) => account.balance === 0));

  const movementResponse = await fetch(`${baseUrl}/api/finance`, {
    method: "POST",
    headers: { "content-type": "application/json", ...firstHeaders },
    body: JSON.stringify({
      action: "transaction",
      type: "income",
      description: "Ingreso de Usuario Uno",
      amount: "100.00",
      accountId: firstBefore.accounts[0].id,
      transactionDate: new Date().toISOString().slice(0, 10),
    }),
  });
  assert.equal(movementResponse.status, 201);
  const firstAfter = (await movementResponse.json()).data;
  assert.equal(firstAfter.summary.totalBalance, 10000);

  const secondAfter = (await (await fetch(`${baseUrl}/api/finance`, { headers: secondHeaders })).json()).data;
  assert.equal(secondAfter.summary.totalBalance, 0);
  assert.equal(secondAfter.transactions.length, 0);

  const crossProfileResponse = await fetch(`${baseUrl}/api/finance`, {
    method: "POST",
    headers: { "content-type": "application/json", ...secondHeaders },
    body: JSON.stringify({
      action: "transaction",
      type: "income",
      description: "Intento cruzado",
      amount: "50.00",
      accountId: firstBefore.accounts[0].id,
      transactionDate: new Date().toISOString().slice(0, 10),
    }),
  });
  assert.equal(crossProfileResponse.status, 404);

  const settingsResponse = await fetch(`${baseUrl}/api/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...firstHeaders },
    body: JSON.stringify({ currencyCode: "EUR" }),
  });
  assert.equal(settingsResponse.status, 200);
  assert.equal((await settingsResponse.json()).user.currencyCode, "EUR");

  const secondMe = await fetch(`${baseUrl}/api/auth/me`, { headers: secondHeaders });
  assert.equal((await secondMe.json()).user.currencyCode, "USD");
});

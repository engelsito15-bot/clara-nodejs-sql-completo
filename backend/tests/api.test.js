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
    const [firstName, ...lastParts] = name.split(" ");
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName: lastParts.join(" ") || "Prueba",
        name,
        username,
        phone: "8095551234",
        password: "Clave1234",
        currencyCode,
      }),
    });
    assert.equal(response.status, 201);
    return response.json();
  }

  const first = await register("Usuario Uno", "usuario1", "DOP");
  const second = await register("Usuario Dos", "usuario2", "USD");
  assert.equal(first.user.currencyCode, "DOP");
  assert.equal(second.user.currencyCode, "USD");
  assert.equal(first.user.phone, "+18095551234");

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


  const accountResponse = await fetch(`${baseUrl}/api/finance`, {
    method: "POST",
    headers: { "content-type": "application/json", ...firstHeaders },
    body: JSON.stringify({
      action: "account",
      institutionType: "bank",
      institutionName: "Banreservas",
      productType: "payroll",
      nickname: "Nómina",
      amount: "1250.00",
    }),
  });
  assert.equal(accountResponse.status, 201);
  const withBankAccount = (await accountResponse.json()).data;
  const declaredAccount = withBankAccount.accounts.find((item) => item.institutionName === "Banreservas");
  assert.ok(declaredAccount);
  assert.equal(declaredAccount.balance, 125000);
  assert.match(declaredAccount.name, /Banreservas/);
  assert.equal(withBankAccount.summary.monthlyIncome, 10000);

  const adjustedResponse = await fetch(`${baseUrl}/api/finance`, {
    method: "POST",
    headers: { "content-type": "application/json", ...firstHeaders },
    body: JSON.stringify({
      action: "account-update",
      accountId: firstBefore.accounts[0].id,
      institutionType: "bank",
      institutionName: "Banco Popular Dominicano",
      productType: "savings",
      nickname: "Principal",
      amount: "175.00",
      balanceReason: "Sincronización manual con el banco",
    }),
  });
  assert.equal(adjustedResponse.status, 200);
  const adjustedData = (await adjustedResponse.json()).data;
  const adjustedAccount = adjustedData.accounts.find((item) => item.id === firstBefore.accounts[0].id);
  assert.equal(adjustedAccount.balance, 17500);
  assert.equal(adjustedAccount.institutionName, "Banco Popular Dominicano");
  assert.equal(adjustedData.summary.monthlyIncome, 10000);
  assert.equal(adjustedData.summary.monthlyExpenses, 0);

  const settingsResponse = await fetch(`${baseUrl}/api/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...firstHeaders },
    body: JSON.stringify({ currencyCode: "EUR", phone: "8295554321" }),
  });
  assert.equal(settingsResponse.status, 200);
  const updatedSettingsUser = (await settingsResponse.json()).user;
  assert.equal(updatedSettingsUser.currencyCode, "EUR");
  assert.equal(updatedSettingsUser.phone, "+18295554321");

  const secondMe = await fetch(`${baseUrl}/api/auth/me`, { headers: secondHeaders });
  assert.equal((await secondMe.json()).user.currencyCode, "USD");
});

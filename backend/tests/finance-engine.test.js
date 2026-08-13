import test from "node:test";
import assert from "node:assert/strict";
import { createSqliteDatabase } from "../src/database.js";
import {
  createAccount,
  createCategory,
  createTransaction,
  createTransfer,
  updateAccount,
  updateBudget,
  copyPreviousBudget,
} from "../src/finance-engine.js";
import { getFinanceData } from "../src/finance-data.js";

async function createUser(database, { name = "Ana Pérez", username = "aperez", currency = "DOP", planningPeriod = "monthly" } = {}) {
  const result = await database.run(
    `INSERT INTO users
      (name, first_name, last_name, username, password_salt, password_hash, phone, currency_code)
     VALUES (?, ?, ?, ?, 'salt', 'hash', '+18090000000', ?)`,
    [name, name.split(" ")[0], name.split(" ").slice(1).join(" ") || "Usuario", username, currency],
  );
  const userId = Number(result.insertId);
  await database.run(
    `INSERT INTO user_profiles (user_id, planning_period, onboarding_completed)
     VALUES (?, ?, 1)`,
    [userId, planningPeriod],
  );
  return userId;
}

test("Clara 3.0 separa monedas, transferencias y gastos reales", async () => {
  const database = createSqliteDatabase(":memory:");
  const userId = await createUser(database, { planningPeriod: "monthly" });

  await createAccount(database, userId, {
    institutionType: "bank",
    institutionName: "Banreservas",
    productType: "savings",
    amount: "10000",
    currencyCode: "DOP",
  });
  await createAccount(database, userId, {
    institutionType: "bank",
    institutionName: "Cuenta USD",
    productType: "savings",
    amount: "100",
    currencyCode: "USD",
  });
  await createAccount(database, userId, {
    institutionType: "cash",
    productType: "cash",
    nickname: "Bolsillo",
    amount: "0",
    currencyCode: "DOP",
  });

  let data = await getFinanceData(database, userId);
  const dop = data.accounts.find((account) => account.institutionName === "Banreservas");
  const usd = data.accounts.find((account) => account.currencyCode === "USD");
  const cash = data.accounts.find((account) => account.kind === "cash");

  await createTransfer(database, userId, {
    accountId: dop.id,
    destinationAccountId: cash.id,
    amount: "1000",
    transactionDate: "2026-08-13",
  });

  data = await getFinanceData(database, userId);
  assert.equal(data.summary.periodExpenses, 0, "Retirar hacia efectivo no es un gasto");
  assert.equal(data.transactions[0].description, "Retiro a efectivo");

  await assert.rejects(
    () => createTransfer(database, userId, {
      accountId: dop.id,
      destinationAccountId: usd.id,
      amount: "500",
      transactionDate: "2026-08-13",
    }),
    /monedas distintas/,
  );

  await createTransfer(database, userId, {
    accountId: dop.id,
    destinationAccountId: usd.id,
    amount: "500",
    destinationAmount: "8",
    transactionDate: "2026-08-13",
  });

  await createCategory(database, userId, { displayName: "Mascotas", color: "mint" });
  data = await getFinanceData(database, userId);
  const pets = data.categories.find((category) => category.name === "Mascotas");
  assert.ok(pets);
  assert.equal(pets.isSystem, false);

  await createTransaction(database, userId, {
    type: "expense",
    description: "Veterinario",
    amount: "250",
    accountId: dop.id,
    categoryId: pets.id,
    transactionDate: "2026-08-13",
    source: "MANUAL",
  });

  data = await getFinanceData(database, userId);
  assert.equal(data.summary.hasMixedCurrencies, true);
  assert.equal(data.summary.primaryCurrency, "DOP");
  assert.equal(data.summary.currencyTotals.DOP, 925000);
  assert.equal(data.summary.currencyTotals.USD, 10800);
  assert.equal(data.summary.primaryBalance, 925000, "No se deben sumar USD como si fueran DOP");
  assert.equal(data.summary.periodExpenses, 25000);
  assert.equal(data.transactions.find((item) => item.description === "Veterinario").source, "MANUAL");

  database.close();
});

test("Clara 3.0 mantiene ajustes de saldo fuera de ingresos y respeta quincenas", async () => {
  const database = createSqliteDatabase(":memory:");
  const userId = await createUser(database, { username: "quincena", planningPeriod: "biweekly" });

  await createAccount(database, userId, {
    institutionType: "bank",
    institutionName: "Banco Popular Dominicano",
    productType: "payroll",
    amount: "5000",
    currencyCode: "DOP",
  });

  let data = await getFinanceData(database, userId);
  const account = data.accounts[0];
  assert.equal(data.summary.periodIncome, 0, "Saldo inicial no debe convertirse en ingreso");

  await updateAccount(database, userId, {
    accountId: account.id,
    institutionType: "bank",
    institutionName: "Banco Popular Dominicano",
    productType: "payroll",
    amount: "5250",
    currencyCode: "DOP",
    balanceReason: "Conciliación manual",
  });

  data = await getFinanceData(database, userId);
  assert.equal(data.summary.periodIncome, 0);
  assert.ok(data.adjustments.some((item) => item.reason === "Conciliación manual"));
  assert.equal(data.period.mode, "biweekly");
  assert.match(data.period.key, /^\d{4}-\d{2}-Q[12]$/);

  database.close();
});


test("Clara 3.1 crea sobres por período, alertas y dinero seguro para gastar", async () => {
  const database = createSqliteDatabase(":memory:");
  const userId = await createUser(database, { username: "presupuesto31", planningPeriod: "biweekly" });

  await database.run(
    `UPDATE user_profiles
        SET income_type = 'fixed', income_frequency = 'biweekly', income_amount = 1500000,
            fixed_expenses = 600000, savings_target_percent = 10, payday_one = 15, payday_two = 30
      WHERE user_id = ?`,
    [userId],
  );

  await createAccount(database, userId, {
    institutionType: "bank",
    institutionName: "Banreservas",
    productType: "payroll",
    amount: "10000",
    currencyCode: "DOP",
  });

  await createCategory(database, userId, { displayName: "Casa", color: "forest" });
  await createCategory(database, userId, { displayName: "Comida", color: "coral" });
  let data = await getFinanceData(database, userId);
  const casa = data.categories.find((item) => item.name === "Casa");
  const comida = data.categories.find((item) => item.name === "Comida");
  const account = data.accounts.find((item) => item.institutionName === "Banreservas");

  await updateBudget(database, userId, {
    categoryId: casa.id,
    periodLimit: "3000",
    budgetKind: "fixed",
    budgetNote: "Compromisos de vivienda",
  });
  await updateBudget(database, userId, {
    categoryId: comida.id,
    periodLimit: "2000",
    budgetKind: "flexible",
  });

  await createTransaction(database, userId, {
    type: "income",
    description: "Cobro quincenal",
    amount: "5000",
    accountId: account.id,
    transactionDate: "2026-08-13",
  });
  await createTransaction(database, userId, {
    type: "expense",
    description: "Supermercado",
    amount: "1900",
    accountId: account.id,
    categoryId: comida.id,
    transactionDate: "2026-08-13",
  });

  data = await getFinanceData(database, userId);
  const updatedCasa = data.categories.find((item) => item.id === casa.id);
  const updatedComida = data.categories.find((item) => item.id === comida.id);
  assert.equal(updatedCasa.budgetKind, "fixed");
  assert.equal(updatedCasa.periodLimit, 300000);
  assert.equal(updatedComida.percentage, 95);
  assert.equal(updatedComida.alertLevel, "warning");
  assert.equal(data.budgetPlan.assigned, 500000);
  assert.equal(data.budgetPlan.fixedReserve, 300000);
  assert.equal(data.budgetPlan.savingsReserve, 50000);
  assert.equal(data.budgetPlan.safeToSpend, 960000);
  assert.ok(data.budgetPlan.dailySafeToSpend > 0);
  assert.equal(data.budgetPlan.alertCount, 1);

  database.close();
});

test("Clara 3.1 puede iniciar el período copiando el presupuesto clásico", async () => {
  const database = createSqliteDatabase(":memory:");
  const userId = await createUser(database, { username: "copiar31", planningPeriod: "biweekly" });
  await database.run("INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES (?, 1, 800000)", [userId]);

  await copyPreviousBudget(database, userId);
  const data = await getFinanceData(database, userId);
  const vivienda = data.categories.find((item) => item.id === 1);
  assert.equal(vivienda.periodLimit, 400000);
  assert.equal(vivienda.hasPeriodBudget, true);
  assert.equal(vivienda.budgetKind, "flexible");

  database.close();
});

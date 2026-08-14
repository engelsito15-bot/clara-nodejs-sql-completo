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
  deleteBudgetForPeriod,
  copyPreviousBudget,
  createRecurringPayment,
  updateRecurringPayment,
  deleteRecurringPayment,
  markRecurringPaymentPaid,
  createGoal, updateGoal, deleteGoal, contributeToGoal,
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


test("Clara 3.2 permite quitar un sobre sin eliminar la categoría ni sus movimientos", async () => {
  const database = createSqliteDatabase(":memory:");
  const userId = await createUser(database, { username: "sobres32", planningPeriod: "biweekly" });
  await database.run("INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES (?, 1, 600000)", [userId]);

  let data = await getFinanceData(database, userId);
  const vivienda = data.categories.find((item) => item.id === 1);
  assert.equal(vivienda.periodLimit, 300000);

  await deleteBudgetForPeriod(database, userId, { categoryId: 1 });
  data = await getFinanceData(database, userId);
  const viviendaDespues = data.categories.find((item) => item.id === 1);
  assert.ok(viviendaDespues, "La categoría Vivienda debe seguir existiendo");
  assert.equal(viviendaDespues.periodLimit, 0, "El sobre queda eliminado solo para el período actual");

  database.close();
});

test("Clara 3.2 protege compromisos recurrentes y puede convertir un pago en gasto", async () => {
  const database = createSqliteDatabase(":memory:");
  const userId = await createUser(database, { username: "recurrente32", planningPeriod: "monthly" });

  await createAccount(database, userId, {
    institutionType: "bank",
    institutionName: "Banreservas",
    productType: "payroll",
    amount: "10000",
    currencyCode: "DOP",
  });
  let data = await getFinanceData(database, userId);
  const account = data.accounts.find((item) => item.institutionName === "Banreservas");
  const services = data.categories.find((item) => item.id === 8);
  const today = new Date().toISOString().slice(0, 10);

  await createRecurringPayment(database, userId, {
    name: "Internet",
    amount: "1000",
    accountId: account.id,
    categoryId: services.id,
    frequency: "monthly",
    nextDueDate: today,
    isMandatory: "on",
    autoCreateTransaction: "on",
    note: "Plan hogar",
  });

  data = await getFinanceData(database, userId);
  assert.equal(data.recurringPayments.length, 1);
  assert.equal(data.budgetPlan.recurringReserve, 100000);
  assert.equal(data.budgetPlan.protectedCommitments, 100000);
  assert.equal(data.budgetPlan.safeToSpend, 900000);
  assert.ok(data.calendar.events.some((event) => event.type === "recurring" && event.title === "Internet"));

  const recurring = data.recurringPayments[0];
  await markRecurringPaymentPaid(database, userId, {
    recurringId: recurring.id,
    paidDate: today,
    registerExpense: "on",
  });

  data = await getFinanceData(database, userId);
  const internetExpense = data.transactions.find((item) => item.externalRef?.startsWith(`recurring:${recurring.id}:`));
  assert.ok(internetExpense, "Marcar pagado debe poder registrar el gasto");
  assert.equal(internetExpense.amount, 100000);
  assert.equal(data.accounts.find((item) => item.id === account.id).balance, 900000);
  assert.notEqual(data.recurringPayments[0].nextDueDate, today, "El próximo vencimiento debe avanzar");

  database.close();
});


test("Clara 3.2 permite editar y desactivar compromisos recurrentes", async () => {
  const database = createSqliteDatabase(":memory:");
  const userId = await createUser(database, { username: "crud32", planningPeriod: "monthly" });
  await createAccount(database, userId, {
    institutionType: "bank", institutionName: "Banco Popular Dominicano", productType: "checking", amount: "5000", currencyCode: "DOP",
  });
  let data = await getFinanceData(database, userId);
  const account = data.accounts[0];
  const category = data.categories.find((item) => item.id === 8);
  const today = new Date().toISOString().slice(0, 10);

  await createRecurringPayment(database, userId, {
    name: "Internet hogar",
    amount: "1500",
    accountId: account.id,
    categoryId: category.id,
    frequency: "monthly",
    nextDueDate: today,
    isMandatory: "on",
  });
  data = await getFinanceData(database, userId);
  const recurring = data.recurringPayments[0];

  await updateRecurringPayment(database, userId, {
    recurringId: recurring.id,
    name: "Internet y teléfono",
    amount: "1800",
    accountId: account.id,
    categoryId: category.id,
    frequency: "monthly",
    nextDueDate: today,
    isMandatory: "on",
    autoCreateTransaction: "",
  });
  data = await getFinanceData(database, userId);
  assert.equal(data.recurringPayments[0].name, "Internet y teléfono");
  assert.equal(data.recurringPayments[0].amount, 180000);

  await deleteRecurringPayment(database, userId, { recurringId: recurring.id });
  data = await getFinanceData(database, userId);
  assert.equal(data.recurringPayments.length, 0);

  database.close();
});

test("Clara 3.3 permite ocultar y restaurar categorías base por usuario", async () => {
  const database = createSqliteDatabase(":memory:");
  const userId = await createUser(database, { username: "categorias33" });
  const { deleteCategory, restoreSystemCategories } = await import("../src/finance-engine.js");

  let data = await getFinanceData(database, userId);
  assert.ok(data.categories.some((item) => item.id === 1));

  await deleteCategory(database, userId, { categoryId: 1 });
  data = await getFinanceData(database, userId);
  assert.equal(data.categories.some((item) => item.id === 1), false);
  assert.equal(data.hiddenSystemCategoriesCount, 1);

  await restoreSystemCategories(database, userId);
  data = await getFinanceData(database, userId);
  assert.ok(data.categories.some((item) => item.id === 1));
  assert.equal(data.hiddenSystemCategoriesCount, 0);
  database.close();
});

test("Clara 3.3 controla tarjetas, deudas y pagos sin duplicarlos como gasto", async () => {
  const database = createSqliteDatabase(":memory:");
  const userId = await createUser(database, { username: "credito33", planningPeriod: "monthly" });
  const {
    createCreditCard, createCreditCardConsumption, createDebt, payCreditCard, payDebt,
  } = await import("../src/finance-engine.js");

  await createAccount(database, userId, {
    institutionType: "bank", institutionName: "Banreservas", productType: "payroll", amount: "50000", currencyCode: "DOP",
  });
  let data = await getFinanceData(database, userId);
  const account = data.accounts.find((item) => item.institutionName === "Banreservas");

  await createCreditCard(database, userId, {
    name: "Visa", institutionName: "Banreservas", currencyCode: "DOP",
    creditLimit: "100000", currentBalance: "20000", statementDay: "5", dueDay: "25",
    minimumPayment: "2500", annualInterestRate: "36",
  });
  await createDebt(database, userId, {
    name: "Préstamo vehículo", lender: "Cooperativa", debtType: "vehicle", currencyCode: "DOP",
    originalAmount: "300000", currentBalance: "240000", regularPayment: "12000", paymentFrequency: "monthly",
    annualInterestRate: "18", nextDueDate: new Date().toISOString().slice(0, 10),
  });

  data = await getFinanceData(database, userId);
  const groceries = data.categories.find((item) => item.id === 2);
  await createCreditCardConsumption(database, userId, {
    cardId: data.creditCards[0].id, description: "Supermercado", amount: "1000", categoryId: groceries.id,
    purchaseDate: new Date().toISOString().slice(0, 10), installments: "1",
  });

  data = await getFinanceData(database, userId);
  assert.equal(data.creditCards.length, 1);
  assert.equal(data.debts.length, 1);
  assert.equal(data.summary.creditUsedTotal, 2100000);
  assert.equal(data.summary.periodExpenses, 100000, "El consumo de tarjeta sí cuenta como gasto");
  assert.equal(data.cardConsumptions.length, 1);
  assert.equal(data.summary.debtBalanceTotal, 24000000);
  assert.ok(data.summary.liabilitiesTotal > 0);
  assert.ok(data.calendar.events.some((event) => event.type === "card"));
  assert.ok(data.calendar.events.some((event) => event.type === "debt"));
  assert.ok(data.budgetPlan.liabilityReserve >= 1200000, "Las obligaciones próximas deben proteger dinero seguro para gastar");

  const card = data.creditCards[0];
  const debt = data.debts[0];
  await payCreditCard(database, userId, { cardId: card.id, accountId: account.id, amount: "2500", paymentDate: new Date().toISOString().slice(0, 10) });
  await payDebt(database, userId, { debtId: debt.id, accountId: account.id, amount: "12000", paymentDate: new Date().toISOString().slice(0, 10) });

  data = await getFinanceData(database, userId);
  assert.equal(data.creditCards[0].currentBalance, 1850000);
  assert.equal(data.debts[0].currentBalance, 22800000);
  assert.equal(data.liabilityPayments.length, 2);
  assert.equal(data.summary.periodExpenses, 100000, "Pagar pasivos no debe duplicar el consumo ya registrado como gasto");
  assert.equal(data.accounts.find((item) => item.id === account.id).balance, 3550000);
  database.close();
});


test("Clara 3.4 planifica metas y mantiene los aportes dentro del patrimonio", async () => {
  const database=createSqliteDatabase(":memory:"); const userId=await createUser(database,{username:"metas34",planningPeriod:"biweekly"});
  await database.run("UPDATE user_profiles SET income_type='fixed',income_frequency='biweekly',income_amount=2000000,fixed_expenses=800000 WHERE user_id=?",[userId]);
  await createAccount(database,userId,{institutionType:"bank",institutionName:"Banreservas",productType:"payroll",amount:"20000",currencyCode:"DOP"});
  let data=await getFinanceData(database,userId); const account=data.accounts[0],before=data.summary.netWorth; const due=new Date();due.setMonth(due.getMonth()+4);const dueDate=due.toISOString().slice(0,10);
  await createGoal(database,userId,{name:"Fondo de emergencia",targetAmount:"24000",dueDate,priority:"1",goalType:"emergency",currencyCode:"DOP",sharedReady:"true"});
  data=await getFinanceData(database,userId); assert.equal(data.goals[0].priority,1);assert.ok(data.goals[0].requiredPerPeriod>0);assert.equal(data.emergencyFund.targetAmount,2400000);assert.equal(data.goals[0].sharedReady,true);
  await contributeToGoal(database,userId,{goalId:data.goals[0].id,accountId:account.id,amount:"4000",contributionDate:new Date().toISOString().slice(0,10)});
  data=await getFinanceData(database,userId);assert.equal(data.goals[0].currentAmount,400000);assert.equal(data.goalContributions.length,1);assert.equal(data.summary.periodExpenses,0);assert.equal(data.summary.netWorth,before);
  await updateGoal(database,userId,{goalId:data.goals[0].id,name:"Fondo esencial",targetAmount:"30000",dueDate,priority:"1",goalType:"emergency",currencyCode:"DOP"});data=await getFinanceData(database,userId);assert.equal(data.goals[0].name,"Fondo esencial");await deleteGoal(database,userId,{goalId:data.goals[0].id});data=await getFinanceData(database,userId);assert.equal(data.goals.length,0);database.close();
});

test("Clara 3.5 produce insights y proyecciones basados en datos registrados", async () => {
  const database=createSqliteDatabase(":memory:");const userId=await createUser(database,{username:"insights35",planningPeriod:"monthly"});await database.run("UPDATE user_profiles SET income_type='fixed',income_frequency='monthly',income_amount=5000000,fixed_expenses=1800000,emergency_savings=3600000,savings_target_percent=15 WHERE user_id=?",[userId]);
  await createAccount(database,userId,{institutionType:"bank",institutionName:"Popular",productType:"payroll",amount:"30000",currencyCode:"DOP"});let data=await getFinanceData(database,userId);const account=data.accounts[0],food=data.categories.find(i=>i.id===2),now=new Date(),thisDate=now.toISOString().slice(0,10),prev=new Date(now);prev.setMonth(prev.getMonth()-1);prev.setDate(10);
  await createTransaction(database,userId,{type:"income",description:"Nómina",amount:"50000",accountId:account.id,transactionDate:thisDate});await createTransaction(database,userId,{type:"expense",description:"Supermercado actual",amount:"8000",accountId:account.id,categoryId:food.id,transactionDate:thisDate});await createTransaction(database,userId,{type:"expense",description:"Supermercado anterior",amount:"4000",accountId:account.id,categoryId:food.id,transactionDate:prev.toISOString().slice(0,10)});
  data=await getFinanceData(database,userId);assert.ok(data.analytics.claraIndex>=0&&data.analytics.claraIndex<=100);assert.ok(data.analytics.recommendations.length>0);assert.ok(data.analytics.projectedMonthExpenses>=data.analytics.currentMonth.expenses);assert.ok(data.analytics.categoryTrends.some(i=>i.name==="Alimentación"));assert.ok(Array.isArray(data.wealth.accountEvolution));assert.ok(Array.isArray(data.wealth.snapshots));assert.equal(data.summary.claraIndex,data.analytics.claraIndex);database.close();
});

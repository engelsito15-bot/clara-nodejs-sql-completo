import { randomBytes } from "node:crypto";
import { runInTransaction } from "./database.js";

const ACCOUNT_PRODUCTS = new Set(["payroll", "savings", "checking", "certificate", "contribution", "wallet", "investment", "cash", "other"]);
const INSTITUTION_TYPES = new Set(["bank", "cooperative", "association", "wallet", "cash", "investment", "other"]);
const CURRENCY_CODES = new Set(["DOP", "USD", "EUR", "GBP", "MXN", "COP", "PEN", "BOB"]);
const SOURCE_TYPES = new Set(["MANUAL", "ASSISTANT", "EMAIL", "IMPORT", "BANK_API"]);
const CATEGORY_COLORS = new Set(["forest", "coral", "sky", "lilac", "sun", "mint"]);
const BUDGET_KINDS = new Set(["fixed", "flexible", "savings"]);
const RECURRING_FREQUENCIES = new Set(["weekly", "biweekly", "monthly", "yearly"]);

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function amountInCents(value, allowZero = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (!allowZero && number === 0)) return null;
  return Math.round(number * 100);
}

function integerId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}


function booleanFlag(value) {
  return ["1", "true", "on", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function recurringFrequency(value) {
  const frequency = String(value || "monthly").trim().toLowerCase();
  return RECURRING_FREQUENCIES.has(frequency) ? frequency : "monthly";
}

function dateParts(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return { year, month, day };
}

function isoFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function advanceRecurringDate(dateText, frequency, dueDay = null, dueMonth = null) {
  const { year, month, day } = dateParts(dateText);
  if (!year || !month || !day) return validDate();
  const normalized = recurringFrequency(frequency);
  if (normalized === "weekly" || normalized === "biweekly") {
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + (normalized === "weekly" ? 7 : 14));
    return date.toISOString().slice(0, 10);
  }
  if (normalized === "yearly") {
    const targetYear = year + 1;
    const targetMonth = Number(dueMonth) >= 1 && Number(dueMonth) <= 12 ? Number(dueMonth) : month;
    const desiredDay = Number(dueDay) >= 1 ? Number(dueDay) : day;
    return isoFromParts(targetYear, targetMonth, Math.min(desiredDay, daysInMonth(targetYear, targetMonth)));
  }
  const currentIndex = year * 12 + (month - 1);
  const nextIndex = currentIndex + 1;
  const targetYear = Math.floor(nextIndex / 12);
  const targetMonth = (nextIndex % 12) + 1;
  const desiredDay = Number(dueDay) >= 1 ? Number(dueDay) : day;
  return isoFromParts(targetYear, targetMonth, Math.min(desiredDay, daysInMonth(targetYear, targetMonth)));
}

function normalizeCurrency(value, fallback = "DOP") {
  const code = String(value || "").trim().toUpperCase();
  return CURRENCY_CODES.has(code) ? code : fallback;
}

function normalizeSource(value) {
  const source = String(value || "MANUAL").trim().toUpperCase();
  return SOURCE_TYPES.has(source) ? source : "MANUAL";
}

function periodKeyForDate(dateText, planningPeriod = "monthly") {
  const [year, month, day] = String(dateText).split("-").map(Number);
  if (!year || !month || !day) return String(dateText).slice(0, 7);
  if (planningPeriod !== "biweekly") return `${year}-${String(month).padStart(2, "0")}`;
  return `${year}-${String(month).padStart(2, "0")}-${day <= 15 ? "Q1" : "Q2"}`;
}

async function userFinanceSettings(database, userId) {
  const row = await database.get(
    `SELECT u.currency_code AS currencyCode,
      COALESCE(p.planning_period, 'monthly') AS planningPeriod
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = ?`,
    [userId],
  );
  if (!row) throw requestError("El perfil no existe.", 404);
  return {
    currencyCode: normalizeCurrency(row.currencyCode),
    planningPeriod: row.planningPeriod === "biweekly" ? "biweekly" : "monthly",
  };
}

async function accountById(database, id, userId, includeArchived = false) {
  return database.get(
    `SELECT id, name, balance, kind,
      COALESCE(currency_code, 'DOP') AS currencyCode,
      COALESCE(is_archived, 0) AS isArchived
     FROM accounts
     WHERE id = ? AND user_id = ? ${includeArchived ? "" : "AND COALESCE(is_archived, 0) = 0"}`,
    [id, userId],
  );
}

async function categoryById(database, id, userId, { activeOnly = true } = {}) {
  return database.get(
    `SELECT id, COALESCE(NULLIF(display_name, ''), name) AS displayName,
      user_id AS userId, parent_id AS parentId,
      COALESCE(is_system, 0) AS isSystem,
      COALESCE(is_active, 1) AS isActive
     FROM categories
     WHERE id = ?
       AND (user_id IS NULL OR user_id = ?)
       ${activeOnly ? "AND COALESCE(is_active, 1) = 1" : ""}`,
    [id, userId],
  );
}

function accountProductLabel(productType) {
  return {
    payroll: "Cuenta de nómina",
    savings: "Cuenta de ahorros",
    checking: "Cuenta corriente",
    certificate: "Certificado",
    contribution: "Aportaciones",
    wallet: "Billetera digital",
    investment: "Cuenta de inversión",
    cash: "Efectivo",
    other: "Cuenta",
  }[productType] || "Cuenta";
}

function accountDetails(payload) {
  const institutionType = INSTITUTION_TYPES.has(payload.institutionType) ? payload.institutionType : "other";
  const productType = ACCOUNT_PRODUCTS.has(payload.productType)
    ? payload.productType
    : payload.kind === "cash"
      ? "cash"
      : payload.kind === "savings"
        ? "savings"
        : "other";
  const institutionName = String(payload.institutionName || "").trim().slice(0, 150);
  const nickname = String(payload.nickname || "").trim().slice(0, 80);
  const explicitName = String(payload.name || "").trim().slice(0, 150);
  const productLabel = accountProductLabel(productType);
  const name = institutionName && institutionType !== "cash"
    ? `${productLabel} · ${institutionName}`.slice(0, 150)
    : (productType === "cash" || institutionType === "cash")
      ? (nickname ? `Efectivo · ${nickname}` : "Efectivo")
      : explicitName || (nickname ? `${productLabel} · ${nickname}` : productLabel);
  const kind = productType === "cash" || institutionType === "cash" ? "cash" : productType === "savings" ? "savings" : "bank";
  return { name, kind, institutionType, institutionName, productType, nickname };
}

async function recordBalanceAdjustment(database, userId, accountId, previousBalance, newBalance, reason, currencyCode, source = "MANUAL", date = validDate()) {
  if (Number(previousBalance) === Number(newBalance)) return;
  await database.run(
    `INSERT INTO account_balance_adjustments
      (user_id, account_id, previous_balance, new_balance, reason, currency_code, source, adjustment_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      accountId,
      previousBalance,
      newBalance,
      String(reason || "Ajuste manual de saldo").trim().slice(0, 240),
      normalizeCurrency(currencyCode),
      normalizeSource(source),
      validDate(date),
    ],
  );
}

export async function createTransaction(database, userId, payload) {
  const type = payload.type === "income" ? "income" : "expense";
  const amount = amountInCents(payload.amount);
  const accountId = integerId(payload.accountId);
  const categoryId = payload.categoryId ? integerId(payload.categoryId) : null;
  const description = String(payload.description || "").trim().slice(0, 255);
  const transactionDate = validDate(payload.transactionDate);
  const source = normalizeSource(payload.source);

  if (!amount || !accountId || !description) throw requestError("Completa la cuenta, el concepto y un monto válido.");
  if (type === "expense" && !categoryId) throw requestError("Selecciona una categoría para el gasto.");

  const settings = await userFinanceSettings(database, userId);

  await runInTransaction(database, async (transaction) => {
    const account = await accountById(transaction, accountId, userId);
    if (!account) throw requestError("La cuenta seleccionada no existe.", 404);
    if (type === "expense" && Number(account.balance) < amount) throw requestError("La cuenta no tiene saldo suficiente.");

    if (categoryId) {
      const category = await categoryById(transaction, categoryId, userId);
      if (!category) throw requestError("La categoría seleccionada no existe o no pertenece a tu perfil.", 404);
    }

    const difference = type === "income" ? amount : -amount;
    const balanceAfter = Number(account.balance) + difference;
    const currencyCode = normalizeCurrency(account.currencyCode, settings.currencyCode);
    await transaction.run("UPDATE accounts SET balance = ? WHERE id = ? AND user_id = ?", [balanceAfter, accountId, userId]);
    await transaction.run(
      `INSERT INTO transactions
        (user_id, type, description, amount, account_id, category_id, transaction_date, note,
         source, currency_code, balance_after, period_key, external_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        type,
        description,
        amount,
        accountId,
        type === "expense" ? categoryId : null,
        transactionDate,
        String(payload.note || "").trim().slice(0, 1000),
        source,
        currencyCode,
        balanceAfter,
        periodKeyForDate(transactionDate, settings.planningPeriod),
        String(payload.externalRef || "").trim().slice(0, 120),
      ],
    );
  });
}

export async function createTransfer(database, userId, payload) {
  const amount = amountInCents(payload.amount);
  const sourceId = integerId(payload.accountId);
  const destinationId = integerId(payload.destinationAccountId);
  const transactionDate = validDate(payload.transactionDate);
  const sourceType = normalizeSource(payload.source);
  if (!amount || !sourceId || !destinationId || sourceId === destinationId) {
    throw requestError("Selecciona dos cuentas distintas y un monto válido.");
  }

  const settings = await userFinanceSettings(database, userId);

  await runInTransaction(database, async (transaction) => {
    const source = await accountById(transaction, sourceId, userId);
    const destination = await accountById(transaction, destinationId, userId);
    if (!source || !destination) throw requestError("Una de las cuentas no existe.", 404);
    if (Number(source.balance) < amount) throw requestError("La cuenta de origen no tiene saldo suficiente.");

    const sourceCurrency = normalizeCurrency(source.currencyCode, settings.currencyCode);
    const destinationCurrency = normalizeCurrency(destination.currencyCode, settings.currencyCode);
    const crossCurrency = sourceCurrency !== destinationCurrency;
    const destinationAmount = crossCurrency ? amountInCents(payload.destinationAmount) : amount;
    if (crossCurrency && !destinationAmount) {
      throw requestError(`Las cuentas usan monedas distintas (${sourceCurrency} → ${destinationCurrency}). Indica cuánto llegará a la cuenta de destino.`);
    }

    const sourceBalanceAfter = Number(source.balance) - amount;
    const destinationBalanceAfter = Number(destination.balance) + destinationAmount;
    await transaction.run("UPDATE accounts SET balance = ? WHERE id = ? AND user_id = ?", [sourceBalanceAfter, sourceId, userId]);
    await transaction.run("UPDATE accounts SET balance = ? WHERE id = ? AND user_id = ?", [destinationBalanceAfter, destinationId, userId]);

    let description = `Transferencia a ${destination.name}`;
    if (destination.kind === "cash" && source.kind !== "cash") description = "Retiro a efectivo";
    if (source.kind === "cash" && destination.kind !== "cash") description = `Depósito de efectivo a ${destination.name}`;

    await transaction.run(
      `INSERT INTO transactions
        (user_id, type, description, amount, account_id, destination_account_id, transaction_date, note,
         source, currency_code, destination_amount, destination_currency_code,
         balance_after, destination_balance_after, period_key, external_ref)
       VALUES (?, 'transfer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        description,
        amount,
        sourceId,
        destinationId,
        transactionDate,
        String(payload.note || "").trim().slice(0, 1000),
        sourceType,
        sourceCurrency,
        destinationAmount,
        destinationCurrency,
        sourceBalanceAfter,
        destinationBalanceAfter,
        periodKeyForDate(transactionDate, settings.planningPeriod),
        String(payload.externalRef || "").trim().slice(0, 120),
      ],
    );
  });
}

export async function updateBudget(database, userId, payload) {
  const categoryId = integerId(payload.categoryId);
  const periodLimit = amountInCents(payload.periodLimit ?? payload.monthlyLimit, true);
  const budgetKind = BUDGET_KINDS.has(payload.budgetKind) ? payload.budgetKind : "flexible";
  const note = String(payload.budgetNote || "").trim().slice(0, 240);
  if (!categoryId || periodLimit === null) throw requestError("Ingresa un presupuesto válido.");

  const category = await categoryById(database, categoryId, userId);
  if (!category) throw requestError("La categoría no existe.", 404);

  const settings = await userFinanceSettings(database, userId);
  const periodKey = periodKeyForDate(validDate(), settings.planningPeriod);
  const existing = await database.get(
    "SELECT user_id FROM period_budgets WHERE user_id = ? AND category_id = ? AND period_key = ?",
    [userId, categoryId, periodKey],
  );

  if (existing) {
    await database.run(
      `UPDATE period_budgets
          SET limit_amount = ?, budget_kind = ?, note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND category_id = ? AND period_key = ?`,
      [periodLimit, budgetKind, note, userId, categoryId, periodKey],
    );
  } else {
    await database.run(
      `INSERT INTO period_budgets
        (user_id, category_id, period_key, limit_amount, budget_kind, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, categoryId, periodKey, periodLimit, budgetKind, note],
    );
  }

  if (settings.planningPeriod === "monthly") {
    const legacy = await database.get("SELECT user_id FROM budgets WHERE user_id = ? AND category_id = ?", [userId, categoryId]);
    if (legacy) {
      await database.run(
        "UPDATE budgets SET monthly_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND category_id = ?",
        [periodLimit, userId, categoryId],
      );
    } else {
      await database.run(
        "INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES (?, ?, ?)",
        [userId, categoryId, periodLimit],
      );
    }
  }
}

function previousPeriodKey(periodKey, planningPeriod) {
  if (planningPeriod !== "biweekly") {
    const [year, month] = String(periodKey).split("-").map(Number);
    const previous = new Date(Date.UTC(year, month - 2, 1));
    return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  const match = String(periodKey).match(/^(\d{4})-(\d{2})-Q([12])$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const half = Number(match[3]);
  if (half === 2) return `${year}-${String(month).padStart(2, "0")}-Q1`;
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-Q2`;
}

export async function copyPreviousBudget(database, userId) {
  const settings = await userFinanceSettings(database, userId);
  const currentKey = periodKeyForDate(validDate(), settings.planningPeriod);
  const previousKey = previousPeriodKey(currentKey, settings.planningPeriod);

  let rows = await database.all(
    `SELECT category_id AS categoryId, limit_amount AS limitAmount,
      COALESCE(budget_kind, 'flexible') AS budgetKind, COALESCE(note, '') AS note
     FROM period_budgets
     WHERE user_id = ? AND period_key = ?`,
    [userId, previousKey],
  );

  if (!rows.length) {
    rows = await database.all(
      `SELECT category_id AS categoryId, monthly_limit AS monthlyLimit
       FROM budgets
       WHERE user_id = ? AND monthly_limit > 0`,
      [userId],
    );
    rows = rows.map((row) => ({
      categoryId: Number(row.categoryId),
      limitAmount: settings.planningPeriod === "biweekly"
        ? Math.round(Number(row.monthlyLimit || 0) / 2)
        : Number(row.monthlyLimit || 0),
      budgetKind: "flexible",
      note: "",
    }));
  }

  if (!rows.length) throw requestError("No encontré un plan anterior para copiar.");

  for (const row of rows) {
    const category = await categoryById(database, Number(row.categoryId), userId);
    if (!category) continue;
    const existing = await database.get(
      "SELECT user_id FROM period_budgets WHERE user_id = ? AND category_id = ? AND period_key = ?",
      [userId, Number(row.categoryId), currentKey],
    );
    const values = [Number(row.limitAmount || 0), row.budgetKind || "flexible", row.note || ""];
    if (existing) {
      await database.run(
        `UPDATE period_budgets
            SET limit_amount = ?, budget_kind = ?, note = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND category_id = ? AND period_key = ?`,
        [...values, userId, Number(row.categoryId), currentKey],
      );
    } else {
      await database.run(
        `INSERT INTO period_budgets
          (user_id, category_id, period_key, limit_amount, budget_kind, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, Number(row.categoryId), currentKey, ...values],
      );
    }
  }
}


export async function deleteBudgetForPeriod(database, userId, payload) {
  const categoryId = integerId(payload.categoryId);
  if (!categoryId) throw requestError("Selecciona un sobre válido.");
  const category = await categoryById(database, categoryId, userId);
  if (!category) throw requestError("La categoría no existe.", 404);
  const settings = await userFinanceSettings(database, userId);
  const periodKey = periodKeyForDate(validDate(), settings.planningPeriod);
  const existing = await database.get(
    "SELECT user_id FROM period_budgets WHERE user_id = ? AND category_id = ? AND period_key = ?",
    [userId, categoryId, periodKey],
  );
  if (existing) {
    await database.run(
      `UPDATE period_budgets
          SET limit_amount = 0, budget_kind = 'flexible', note = '', updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND category_id = ? AND period_key = ?`,
      [userId, categoryId, periodKey],
    );
  } else {
    await database.run(
      `INSERT INTO period_budgets (user_id, category_id, period_key, limit_amount, budget_kind, note)
       VALUES (?, ?, ?, 0, 'flexible', '')`,
      [userId, categoryId, periodKey],
    );
  }
}

async function recurringById(database, recurringId, userId, activeOnly = true) {
  return database.get(
    `SELECT rp.id, rp.name, rp.amount, rp.category_id AS categoryId, rp.account_id AS accountId,
      rp.frequency, rp.next_due_date AS nextDueDate, rp.due_day AS dueDay, rp.due_month AS dueMonth,
      COALESCE(rp.is_mandatory, 1) AS isMandatory,
      COALESCE(rp.auto_create_transaction, 0) AS autoCreateTransaction,
      COALESCE(rp.note, '') AS note, rp.last_paid_date AS lastPaidDate, COALESCE(rp.is_active, 1) AS isActive
     FROM recurring_payments rp
     WHERE rp.id = ? AND rp.user_id = ? ${activeOnly ? "AND COALESCE(rp.is_active, 1) = 1" : ""}`,
    [recurringId, userId],
  );
}

function recurringPayload(payload) {
  const name = String(payload.name || "").trim().slice(0, 180);
  const amount = amountInCents(payload.amount);
  const categoryId = integerId(payload.categoryId);
  const accountId = integerId(payload.accountId);
  const frequency = recurringFrequency(payload.frequency);
  const nextDueDate = validDate(payload.nextDueDate);
  const { month, day } = dateParts(nextDueDate);
  const note = String(payload.note || "").trim().slice(0, 500);
  if (!name || !amount || !categoryId || !accountId) {
    throw requestError("Completa el nombre, monto, categoría y cuenta del compromiso.");
  }
  return {
    name, amount, categoryId, accountId, frequency, nextDueDate,
    dueDay: day, dueMonth: month,
    isMandatory: booleanFlag(payload.isMandatory),
    autoCreateTransaction: booleanFlag(payload.autoCreateTransaction),
    note,
  };
}

export async function createRecurringPayment(database, userId, payload) {
  const item = recurringPayload(payload);
  const account = await accountById(database, item.accountId, userId);
  const category = await categoryById(database, item.categoryId, userId);
  if (!account) throw requestError("La cuenta seleccionada no existe.", 404);
  if (!category) throw requestError("La categoría seleccionada no existe.", 404);
  await database.run(
    `INSERT INTO recurring_payments
      (user_id, name, amount, category_id, account_id, frequency, next_due_date, due_day, due_month,
       is_mandatory, auto_create_transaction, note, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [userId, item.name, item.amount, item.categoryId, item.accountId, item.frequency, item.nextDueDate, item.dueDay, item.dueMonth,
      item.isMandatory ? 1 : 0, item.autoCreateTransaction ? 1 : 0, item.note],
  );
}

export async function updateRecurringPayment(database, userId, payload) {
  const recurringId = integerId(payload.recurringId);
  if (!recurringId) throw requestError("Selecciona un compromiso válido.");
  const existing = await recurringById(database, recurringId, userId);
  if (!existing) throw requestError("El compromiso no existe.", 404);
  const item = recurringPayload(payload);
  const account = await accountById(database, item.accountId, userId);
  const category = await categoryById(database, item.categoryId, userId);
  if (!account || !category) throw requestError("La cuenta o categoría seleccionada ya no está disponible.", 404);
  await database.run(
    `UPDATE recurring_payments
        SET name = ?, amount = ?, category_id = ?, account_id = ?, frequency = ?, next_due_date = ?,
            due_day = ?, due_month = ?, is_mandatory = ?, auto_create_transaction = ?, note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
    [item.name, item.amount, item.categoryId, item.accountId, item.frequency, item.nextDueDate, item.dueDay, item.dueMonth,
      item.isMandatory ? 1 : 0, item.autoCreateTransaction ? 1 : 0, item.note, recurringId, userId],
  );
}

export async function deleteRecurringPayment(database, userId, payload) {
  const recurringId = integerId(payload.recurringId);
  if (!recurringId) throw requestError("Selecciona un compromiso válido.");
  const existing = await recurringById(database, recurringId, userId);
  if (!existing) throw requestError("El compromiso no existe.", 404);
  await database.run(
    "UPDATE recurring_payments SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
    [recurringId, userId],
  );
}

export async function markRecurringPaymentPaid(database, userId, payload) {
  const recurringId = integerId(payload.recurringId);
  if (!recurringId) throw requestError("Selecciona un compromiso válido.");
  const paidDate = validDate(payload.paidDate);
  const registerExpenseOverride = payload.registerExpense === undefined ? null : booleanFlag(payload.registerExpense);
  const settings = await userFinanceSettings(database, userId);

  await runInTransaction(database, async (transaction) => {
    const recurring = await recurringById(transaction, recurringId, userId);
    if (!recurring) throw requestError("El compromiso no existe.", 404);
    const account = await accountById(transaction, Number(recurring.accountId), userId);
    const category = await categoryById(transaction, Number(recurring.categoryId), userId);
    if (!account || !category) throw requestError("La cuenta o categoría del compromiso ya no está disponible.", 404);

    const shouldRegisterExpense = registerExpenseOverride === null
      ? Boolean(Number(recurring.autoCreateTransaction || 0))
      : registerExpenseOverride;
    const dueDate = validDate(String(recurring.nextDueDate));
    const externalRef = `recurring:${recurringId}:${dueDate}`;

    if (shouldRegisterExpense) {
      const duplicate = await transaction.get(
        "SELECT id FROM transactions WHERE user_id = ? AND external_ref = ? LIMIT 1",
        [userId, externalRef],
      );
      if (!duplicate) {
        const amount = Number(recurring.amount || 0);
        if (Number(account.balance) < amount) throw requestError("La cuenta seleccionada no tiene saldo suficiente para registrar este pago.");
        const balanceAfter = Number(account.balance) - amount;
        const currencyCode = normalizeCurrency(account.currencyCode, settings.currencyCode);
        await transaction.run("UPDATE accounts SET balance = ? WHERE id = ? AND user_id = ?", [balanceAfter, account.id, userId]);
        await transaction.run(
          `INSERT INTO transactions
            (user_id, type, description, amount, account_id, category_id, transaction_date, note,
             source, currency_code, balance_after, period_key, external_ref)
           VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?, ?)`,
          [userId, recurring.name, amount, account.id, recurring.categoryId, paidDate,
            recurring.note ? `Pago recurrente · ${recurring.note}` : "Pago recurrente",
            currencyCode, balanceAfter, periodKeyForDate(paidDate, settings.planningPeriod), externalRef],
        );
      }
    }

    const nextDueDate = advanceRecurringDate(dueDate, recurring.frequency, recurring.dueDay, recurring.dueMonth);
    await transaction.run(
      `UPDATE recurring_payments
          SET last_paid_date = ?, next_due_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?`,
      [paidDate, nextDueDate, recurringId, userId],
    );
  });
}

export async function createGoal(database, userId, payload) {
  const targetAmount = amountInCents(payload.targetAmount);
  const name = String(payload.name || "").trim();
  if (!targetAmount || !name || !payload.dueDate) throw requestError("Completa el nombre, el monto y la fecha de la meta.");
  await database.run(
    "INSERT INTO goals (user_id, name, target_amount, current_amount, due_date, color) VALUES (?, ?, ?, 0, ?, 'coral')",
    [userId, name, targetAmount, validDate(payload.dueDate)],
  );
}

export async function contributeToGoal(database, userId, payload) {
  const goalId = integerId(payload.goalId);
  const accountId = integerId(payload.accountId);
  const amount = amountInCents(payload.amount);
  if (!goalId || !accountId || !amount) throw requestError("Selecciona una meta, una cuenta y un monto.");

  const settings = await userFinanceSettings(database, userId);
  const transactionDate = validDate();

  await runInTransaction(database, async (transaction) => {
    const goal = await transaction.get(
      "SELECT id, name, target_amount AS targetAmount, current_amount AS currentAmount FROM goals WHERE id = ? AND user_id = ?",
      [goalId, userId],
    );
    const account = await accountById(transaction, accountId, userId);
    if (!goal || !account) throw requestError("La meta o la cuenta no existe.", 404);
    if (Number(account.balance) < amount) throw requestError("La cuenta no tiene saldo suficiente.");
    if (Number(goal.currentAmount) + amount > Number(goal.targetAmount)) throw requestError("El aporte supera lo que falta para completar la meta.");

    const balanceAfter = Number(account.balance) - amount;
    await transaction.run("UPDATE accounts SET balance = ? WHERE id = ? AND user_id = ?", [balanceAfter, accountId, userId]);
    await transaction.run("UPDATE goals SET current_amount = current_amount + ? WHERE id = ? AND user_id = ?", [amount, goalId, userId]);
    await transaction.run(
      `INSERT INTO transactions
        (user_id, type, description, amount, account_id, transaction_date, note,
         source, currency_code, balance_after, period_key)
       VALUES (?, 'expense', ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?)`,
      [
        userId,
        `Aporte: ${goal.name}`,
        amount,
        accountId,
        transactionDate,
        "Ahorro reservado para una meta",
        normalizeCurrency(account.currencyCode, settings.currencyCode),
        balanceAfter,
        periodKeyForDate(transactionDate, settings.planningPeriod),
      ],
    );
  });
}

export async function createAccount(database, userId, payload) {
  const balance = amountInCents(payload.amount ?? 0, true);
  const details = accountDetails(payload);
  const settings = await userFinanceSettings(database, userId);
  const currencyCode = normalizeCurrency(payload.currencyCode, settings.currencyCode);
  if (!details.name || balance === null) throw requestError("Completa los datos de la cuenta y escribe un saldo válido.");

  await runInTransaction(database, async (transaction) => {
    const result = await transaction.run(
      `INSERT INTO accounts
        (user_id, name, kind, balance, color, institution_type, institution_name, product_type, nickname, currency_code)
       VALUES (?, ?, ?, ?, 'sky', ?, ?, ?, ?, ?)`,
      [userId, details.name, details.kind, balance, details.institutionType, details.institutionName, details.productType, details.nickname, currencyCode],
    );
    if (balance > 0) {
      await recordBalanceAdjustment(transaction, userId, result.insertId, 0, balance, "Saldo inicial declarado", currencyCode, "MANUAL");
    }
  });
}

export async function updateAccount(database, userId, payload) {
  const accountId = integerId(payload.accountId);
  const balance = amountInCents(payload.amount ?? 0, true);
  const details = accountDetails(payload);
  if (!accountId || !details.name || balance === null) throw requestError("Ingresa los datos válidos de la cuenta.");

  const settings = await userFinanceSettings(database, userId);

  await runInTransaction(database, async (transaction) => {
    const account = await transaction.get(
      `SELECT id, balance, COALESCE(currency_code, ?) AS currencyCode
       FROM accounts WHERE id = ? AND user_id = ?`,
      [settings.currencyCode, accountId, userId],
    );
    if (!account) throw requestError("La cuenta no existe o no pertenece a tu perfil.", 404);

    const currentCurrency = normalizeCurrency(account.currencyCode, settings.currencyCode);
    const nextCurrency = normalizeCurrency(payload.currencyCode, currentCurrency);
    if (currentCurrency !== nextCurrency) {
      const history = await transaction.get(
        "SELECT COUNT(*) AS total FROM transactions WHERE user_id = ? AND (account_id = ? OR destination_account_id = ?)",
        [userId, accountId, accountId],
      );
      if (Number(history?.total || 0) > 0) {
        throw requestError("No puedes cambiar la moneda de una cuenta que ya tiene movimientos. Crea otra cuenta con la moneda correcta.");
      }
    }

    await transaction.run(
      `UPDATE accounts
       SET name = ?, kind = ?, balance = ?, institution_type = ?, institution_name = ?, product_type = ?, nickname = ?, currency_code = ?
       WHERE id = ? AND user_id = ?`,
      [details.name, details.kind, balance, details.institutionType, details.institutionName, details.productType, details.nickname, nextCurrency, accountId, userId],
    );
    if (currentCurrency !== nextCurrency) {
      await transaction.run("UPDATE account_balance_adjustments SET currency_code = ? WHERE user_id = ? AND account_id = ?", [nextCurrency, userId, accountId]);
    }
    await recordBalanceAdjustment(
      transaction,
      userId,
      accountId,
      Number(account.balance),
      balance,
      payload.balanceReason || "Saldo actual declarado por el usuario",
      nextCurrency,
      "MANUAL",
    );
  });
}

export async function deleteAccount(database, userId, payload) {
  const accountId = integerId(payload.accountId);
  if (!accountId) throw requestError("Selecciona una cuenta válida.");

  const account = await database.get(
    "SELECT id, name, balance FROM accounts WHERE id = ? AND user_id = ? AND COALESCE(is_archived, 0) = 0",
    [accountId, userId],
  );
  if (!account) throw requestError("La cuenta no existe o no pertenece a tu perfil.", 404);
  if (Number(account.balance) !== 0) throw requestError("Para eliminar una cuenta, primero debe quedar con saldo 0.");

  const count = await database.get(
    "SELECT COUNT(*) AS total FROM accounts WHERE user_id = ? AND COALESCE(is_archived, 0) = 0",
    [userId],
  );
  if (Number(count?.total || 0) <= 1) throw requestError("Debes conservar al menos una cuenta activa en tu perfil.");

  const history = await database.get(
    "SELECT COUNT(*) AS total FROM transactions WHERE user_id = ? AND (account_id = ? OR destination_account_id = ?)",
    [userId, accountId, accountId],
  );

  if (Number(history?.total || 0) > 0) {
    await database.run("UPDATE accounts SET is_archived = 1 WHERE id = ? AND user_id = ?", [accountId, userId]);
    return;
  }

  await database.run("DELETE FROM accounts WHERE id = ? AND user_id = ?", [accountId, userId]);
}

function categorySymbol(name) {
  const clean = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (!parts.length) return "CA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

async function validateParentCategory(database, userId, parentId) {
  if (!parentId) return null;
  const parent = await categoryById(database, parentId, userId);
  if (!parent) throw requestError("La categoría principal no existe.", 404);
  if (parent.parentId) throw requestError("Clara admite un nivel de subcategorías para mantener la organización simple.");
  return parent;
}

export async function createCategory(database, userId, payload) {
  const displayName = String(payload.displayName || payload.name || "").trim().slice(0, 150);
  const parentId = payload.parentId ? integerId(payload.parentId) : null;
  const color = CATEGORY_COLORS.has(payload.color) ? payload.color : "mint";
  if (!displayName) throw requestError("Escribe un nombre para la categoría.");
  await validateParentCategory(database, userId, parentId);

  const duplicate = await database.get(
    `SELECT id FROM categories
     WHERE COALESCE(is_active, 1) = 1
       AND (user_id IS NULL OR user_id = ?)
       AND LOWER(COALESCE(NULLIF(display_name, ''), name)) = LOWER(?)`,
    [userId, displayName],
  );
  if (duplicate) throw requestError("Ya tienes una categoría con ese nombre.");

  const storageName = `u${userId}_${Date.now()}_${randomBytes(3).toString("hex")}`;
  await database.run(
    `INSERT INTO categories (name, display_name, symbol, color, user_id, parent_id, is_system, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 0, 1)`,
    [storageName, displayName, categorySymbol(displayName), color, userId, parentId],
  );
}

export async function updateCategory(database, userId, payload) {
  const categoryId = integerId(payload.categoryId);
  const displayName = String(payload.displayName || payload.name || "").trim().slice(0, 150);
  const parentId = payload.parentId ? integerId(payload.parentId) : null;
  const color = CATEGORY_COLORS.has(payload.color) ? payload.color : "mint";
  if (!categoryId || !displayName) throw requestError("Completa los datos de la categoría.");

  const category = await database.get(
    "SELECT id, parent_id AS parentId FROM categories WHERE id = ? AND user_id = ? AND COALESCE(is_system, 0) = 0",
    [categoryId, userId],
  );
  if (!category) throw requestError("Solo puedes editar categorías creadas por ti.", 403);
  if (parentId === categoryId) throw requestError("Una categoría no puede ser su propia categoría principal.");
  await validateParentCategory(database, userId, parentId);

  const duplicate = await database.get(
    `SELECT id FROM categories
     WHERE id <> ? AND COALESCE(is_active, 1) = 1
       AND (user_id IS NULL OR user_id = ?)
       AND LOWER(COALESCE(NULLIF(display_name, ''), name)) = LOWER(?)`,
    [categoryId, userId, displayName],
  );
  if (duplicate) throw requestError("Ya tienes una categoría con ese nombre.");

  const child = await database.get("SELECT id FROM categories WHERE parent_id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1", [categoryId]);
  if (child && parentId) throw requestError("Una categoría que ya tiene subcategorías no puede convertirse en subcategoría.");

  await database.run(
    "UPDATE categories SET display_name = ?, symbol = ?, color = ?, parent_id = ? WHERE id = ? AND user_id = ?",
    [displayName, categorySymbol(displayName), color, parentId, categoryId, userId],
  );
}

export async function deleteCategory(database, userId, payload) {
  const categoryId = integerId(payload.categoryId);
  if (!categoryId) throw requestError("Selecciona una categoría válida.");

  const category = await database.get(
    "SELECT id FROM categories WHERE id = ? AND user_id = ? AND COALESCE(is_system, 0) = 0",
    [categoryId, userId],
  );
  if (!category) throw requestError("Las categorías base de Clara no se pueden eliminar.", 403);

  const child = await database.get("SELECT id FROM categories WHERE parent_id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1", [categoryId]);
  if (child) throw requestError("Primero elimina o mueve las subcategorías que están dentro de esta categoría.");

  const history = await database.get("SELECT COUNT(*) AS total FROM transactions WHERE user_id = ? AND category_id = ?", [userId, categoryId]);
  const budget = await database.get("SELECT COUNT(*) AS total FROM budgets WHERE user_id = ? AND category_id = ?", [userId, categoryId]);
  const periodBudget = await database.get("SELECT COUNT(*) AS total FROM period_budgets WHERE user_id = ? AND category_id = ?", [userId, categoryId]);
  if (Number(history?.total || 0) > 0 || Number(budget?.total || 0) > 0 || Number(periodBudget?.total || 0) > 0) {
    await database.run("UPDATE categories SET is_active = 0 WHERE id = ? AND user_id = ?", [categoryId, userId]);
    return;
  }
  await database.run("DELETE FROM categories WHERE id = ? AND user_id = ?", [categoryId, userId]);
}

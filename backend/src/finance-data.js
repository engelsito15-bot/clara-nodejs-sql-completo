function normalizeNumber(value) {
  return Number(value || 0);
}

function isoToday() {
  const timezone = process.env.APP_TIMEZONE || "America/Santo_Domingo";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function currentPeriod(planningPeriod = "monthly") {
  const today = isoToday();
  const [year, month, day] = today.split("-").map(Number);
  const monthText = String(month).padStart(2, "0");
  const lastDay = daysInMonth(year, month);
  const monthLabel = new Intl.DateTimeFormat("es-DO", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 10)));

  if (planningPeriod === "biweekly") {
    const firstHalf = day <= 15;
    const startDay = firstHalf ? 1 : 16;
    const endDay = firstHalf ? 15 : lastDay;
    return {
      mode: "biweekly",
      key: `${year}-${monthText}-${firstHalf ? "Q1" : "Q2"}`,
      start: `${year}-${monthText}-${String(startDay).padStart(2, "0")}`,
      end: `${year}-${monthText}-${String(endDay).padStart(2, "0")}`,
      label: `${startDay}–${endDay} de ${monthLabel}`,
      shortLabel: firstHalf ? "Primera quincena" : "Segunda quincena",
      days: endDay - startDay + 1,
      today,
    };
  }

  return {
    mode: "monthly",
    key: `${year}-${monthText}`,
    start: `${year}-${monthText}-01`,
    end: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
    label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
    shortLabel: "Mes actual",
    days: lastDay,
    today,
  };
}

function dateText(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function timestampText(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function utcDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function daysBetween(start, end) {
  return Math.max(0, Math.ceil((utcDate(end) - utcDate(start)) / 86400000));
}

function clampDay(year, month, requestedDay) {
  return Math.min(Math.max(Number(requestedDay || 1), 1), daysInMonth(year, month));
}

function paydayDetails(profile, period) {
  if (profile.incomeFrequency === "irregular") return null;
  const today = period.today || isoToday();
  const [year, month] = today.split("-").map(Number);
  const candidates = [];

  if (profile.incomeFrequency === "weekly") {
    const next = new Date(utcDate(today));
    next.setUTCDate(next.getUTCDate() + 7);
    candidates.push(next.toISOString().slice(0, 10));
  } else {
    const configuredDays = [profile.paydayOne, profile.paydayTwo]
      .map(Number)
      .filter((day) => day >= 1 && day <= 31);
    for (let offset = 0; offset <= 2; offset += 1) {
      const candidateMonth = new Date(Date.UTC(year, month - 1 + offset, 1));
      const candidateYear = candidateMonth.getUTCFullYear();
      const candidateMonthNumber = candidateMonth.getUTCMonth() + 1;
      for (const requestedDay of configuredDays) {
        const day = clampDay(candidateYear, candidateMonthNumber, requestedDay);
        const date = `${candidateYear}-${String(candidateMonthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (date >= today) candidates.push(date);
      }
    }
  }

  candidates.sort();
  const date = candidates[0];
  if (!date) return null;
  return { date, daysUntil: daysBetween(today, date) };
}

function expectedIncomeForPeriod(profile, period) {
  const amount = normalizeNumber(profile.incomeAmount);
  if (!amount) return 0;

  if (period.mode === "monthly") {
    if (profile.incomeFrequency === "weekly") return Math.round(amount * 4);
    if (profile.incomeFrequency === "biweekly") return amount * 2;
    return amount;
  }

  if (profile.incomeFrequency === "weekly") return amount * 2;
  if (profile.incomeFrequency === "biweekly") return amount;
  if (profile.incomeFrequency === "monthly") {
    const payday = Number(profile.paydayOne);
    if (!payday) return Math.round(amount / 2);
    const startDay = Number(period.start.slice(8, 10));
    const endDay = Number(period.end.slice(8, 10));
    return payday >= startDay && payday <= endDay ? amount : 0;
  }
  return Math.round(amount / 2);
}

function alertLevel(percentage) {
  if (percentage >= 100) return "exceeded";
  if (percentage >= 90) return "warning";
  if (percentage >= 70) return "watch";
  return "ok";
}

function budgetKindLabel(kind) {
  return {
    fixed: "Compromiso fijo",
    flexible: "Gasto flexible",
    savings: "Reserva de ahorro",
  }[kind] || "Gasto flexible";
}


function addDays(dateTextValue, amount) {
  const date = utcDate(dateTextValue);
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return date.toISOString().slice(0, 10);
}

function isoFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function advanceRecurringDate(dateValue, frequency, dueDay = null, dueMonth = null) {
  const [year, month, day] = String(dateValue).slice(0, 10).split("-").map(Number);
  if (frequency === "weekly" || frequency === "biweekly") return addDays(dateValue, frequency === "weekly" ? 7 : 14);
  if (frequency === "yearly") {
    const targetYear = year + 1;
    const targetMonth = Number(dueMonth) >= 1 && Number(dueMonth) <= 12 ? Number(dueMonth) : month;
    const targetDay = Math.min(Number(dueDay) || day, daysInMonth(targetYear, targetMonth));
    return isoFromParts(targetYear, targetMonth, targetDay);
  }
  const index = year * 12 + (month - 1) + 1;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const targetDay = Math.min(Number(dueDay) || day, daysInMonth(targetYear, targetMonth));
  return isoFromParts(targetYear, targetMonth, targetDay);
}

function recurringFrequencyLabel(value) {
  return { weekly: "Semanal", biweekly: "Cada 2 semanas", monthly: "Mensual", yearly: "Anual" }[value] || "Mensual";
}

function nextMonthlyDay(today, requestedDay) {
  const [year, month] = String(today).slice(0, 10).split("-").map(Number);
  const sameDay = clampDay(year, month, requestedDay);
  const sameMonth = isoFromParts(year, month, sameDay);
  if (sameMonth >= today) return sameMonth;
  const index = year * 12 + month;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return isoFromParts(nextYear, nextMonth, clampDay(nextYear, nextMonth, requestedDay));
}

function debtTypeLabel(value) {
  return {
    personal: "Préstamo personal", vehicle: "Vehículo", mortgage: "Hipoteca", education: "Educación",
    cooperative: "Cooperativa", family: "Familiar", business: "Negocio", other: "Otra deuda",
  }[value] || "Deuda";
}

function monthBounds(dateValue) {
  const [year, month] = String(dateValue).slice(0, 7).split("-").map(Number);
  const monthText = String(month).padStart(2, "0");
  return {
    start: `${year}-${monthText}-01`,
    end: `${year}-${monthText}-${String(daysInMonth(year, month)).padStart(2, "0")}`,
    year, month,
  };
}

function periodFixedExpenses(profile, period) {
  const amount = normalizeNumber(profile.fixedExpenses);
  return period.mode === "biweekly" ? Math.round(amount / 2) : amount;
}

function shiftMonthDate(dateValue, offset) {
  const [year, month, day] = String(dateValue).slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + Number(offset || 0), 1));
  const y = date.getUTCFullYear(); const m = date.getUTCMonth() + 1;
  return isoFromParts(y, m, Math.min(day, daysInMonth(y, m)));
}

function previousPeriodBounds(planningPeriod, period) {
  if (planningPeriod !== "biweekly") return monthBounds(shiftMonthDate(period.today, -1));
  const [year, month] = period.today.split("-").map(Number);
  const isQ1 = period.key.endsWith("Q1");
  if (!isQ1) return { start: isoFromParts(year, month, 1), end: isoFromParts(year, month, 15) };
  const prev = new Date(Date.UTC(year, month - 2, 1));
  const y = prev.getUTCFullYear(); const m = prev.getUTCMonth() + 1;
  return { start: isoFromParts(y, m, 16), end: isoFromParts(y, m, daysInMonth(y, m)) };
}

function expectedMonthlyIncome(profile) {
  const amount = normalizeNumber(profile.incomeAmount);
  if (!amount) return 0;
  if (profile.incomeFrequency === "weekly") return Math.round(amount * 4.33);
  if (profile.incomeFrequency === "biweekly") return amount * 2;
  return amount;
}
function goalPriorityLabel(value) { return Number(value) === 1 ? "Alta" : Number(value) === 3 ? "Baja" : "Media"; }
function goalTypeLabel(value) { return ({ general:"Meta general", emergency:"Fondo de emergencia", purchase:"Compra", travel:"Viaje", education:"Educación", debt:"Salir de deuda", investment:"Inversión", other:"Otra" })[value] || "Meta"; }
function clampScore(value) { return Math.max(0, Math.min(100, Math.round(Number(value || 0)))); }

export async function getFinanceData(database, userId) {
  const userSettings = await database.get(
    `SELECT u.currency_code AS currencyCode,
      COALESCE(p.planning_period, 'monthly') AS planningPeriod,
      COALESCE(p.income_type, '') AS incomeType,
      COALESCE(p.income_frequency, '') AS incomeFrequency,
      COALESCE(p.income_amount, 0) AS incomeAmount,
      COALESCE(p.fixed_expenses, 0) AS fixedExpenses,
      COALESCE(p.savings_target_percent, 10) AS savingsTargetPercent,
      COALESCE(p.emergency_savings, 0) AS emergencySavings,
      COALESCE(p.primary_goal, '') AS primaryGoal,
      COALESCE(p.financial_confidence, 3) AS financialConfidence,
      p.payday_one AS paydayOne,
      p.payday_two AS paydayTwo
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = ?`,
    [userId],
  );
  const primaryCurrency = String(userSettings?.currencyCode || "DOP").toUpperCase();
  const planningPeriod = userSettings?.planningPeriod === "biweekly" ? "biweekly" : "monthly";
  const period = currentPeriod(planningPeriod);
  const profile = {
    incomeType: userSettings?.incomeType || "",
    incomeFrequency: userSettings?.incomeFrequency || "",
    incomeAmount: normalizeNumber(userSettings?.incomeAmount),
    fixedExpenses: normalizeNumber(userSettings?.fixedExpenses),
    savingsTargetPercent: normalizeNumber(userSettings?.savingsTargetPercent),
    emergencySavings: normalizeNumber(userSettings?.emergencySavings),
    primaryGoal: userSettings?.primaryGoal || "",
    financialConfidence: normalizeNumber(userSettings?.financialConfidence),
    paydayOne: userSettings?.paydayOne ?? null,
    paydayTwo: userSettings?.paydayTwo ?? null,
  };

  const accounts = await database.all(
    `SELECT id, name, kind, balance, color,
      institution_type AS institutionType, institution_name AS institutionName,
      product_type AS productType, nickname,
      COALESCE(currency_code, ?) AS currencyCode
     FROM accounts
     WHERE user_id = ? AND COALESCE(is_archived, 0) = 0
     ORDER BY CASE kind WHEN 'bank' THEN 1 WHEN 'savings' THEN 2 ELSE 3 END, created_at`,
    [primaryCurrency, userId],
  );

  const categoryRows = await database.all(
    `SELECT c.id,
      COALESCE(NULLIF(c.display_name, ''), c.name) AS name,
      c.symbol,
      COALESCE(b.monthly_limit, 0) AS legacyMonthlyLimit,
      c.color,
      c.parent_id AS parentId,
      COALESCE(NULLIF(parent.display_name, ''), parent.name) AS parentDisplayName,
      c.user_id AS ownerUserId,
      COALESCE(c.is_system, 0) AS isSystem,
      c.created_at AS createdAt
     FROM categories c
     LEFT JOIN categories parent ON parent.id = c.parent_id
     LEFT JOIN budgets b ON b.category_id = c.id AND b.user_id = ?
     LEFT JOIN user_hidden_categories hidden ON hidden.category_id = c.id AND hidden.user_id = ?
     WHERE COALESCE(c.is_active, 1) = 1
       AND (c.user_id IS NULL OR c.user_id = ?)
       AND hidden.category_id IS NULL
     ORDER BY CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END,
       COALESCE(c.parent_id, c.id), c.created_at, c.id`,
    [userId, userId, userId],
  );

  const hiddenCategoryRow = await database.get(
    "SELECT COUNT(*) AS total FROM user_hidden_categories WHERE user_id = ?",
    [userId],
  );

  const budgetRows = await database.all(
    `SELECT category_id AS categoryId, limit_amount AS limitAmount,
      COALESCE(budget_kind, 'flexible') AS budgetKind,
      COALESCE(note, '') AS note
     FROM period_budgets
     WHERE user_id = ? AND period_key = ?`,
    [userId, period.key],
  );

  const spendRows = await database.all(
    `SELECT category_id AS categoryId, SUM(amount) AS spent
     FROM transactions
     WHERE user_id = ?
       AND type = 'expense'
       AND category_id IS NOT NULL
       AND transaction_date BETWEEN ? AND ?
       AND COALESCE(currency_code, ?) = ?
     GROUP BY category_id`,
    [userId, period.start, period.end, primaryCurrency, primaryCurrency],
  );

  const transactions = await database.all(
    `SELECT t.id, t.type, t.description, t.amount,
      t.account_id AS accountId,
      t.destination_account_id AS destinationAccountId,
      t.category_id AS categoryId,
      t.transaction_date AS transactionDate,
      t.note,
      COALESCE(t.source, 'MANUAL') AS source,
      COALESCE(t.currency_code, a.currency_code, ?) AS currencyCode,
      t.destination_amount AS destinationAmount,
      COALESCE(t.destination_currency_code, destination.currency_code) AS destinationCurrencyCode,
      t.balance_after AS balanceAfter,
      t.destination_balance_after AS destinationBalanceAfter,
      COALESCE(t.period_key, '') AS periodKey,
      COALESCE(t.external_ref, '') AS externalRef,
      t.created_at AS createdAt,
      a.name AS accountName,
      destination.name AS destinationAccountName,
      COALESCE(NULLIF(c.display_name, ''), c.name) AS categoryName,
      c.symbol AS categorySymbol,
      c.color AS categoryColor,
      parent.id AS parentCategoryId,
      COALESCE(NULLIF(parent.display_name, ''), parent.name) AS parentCategoryName
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id AND a.user_id = t.user_id
     LEFT JOIN accounts destination ON destination.id = t.destination_account_id AND destination.user_id = t.user_id
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN categories parent ON parent.id = c.parent_id
     WHERE t.user_id = ?
     ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC
     LIMIT 250`,
    [primaryCurrency, userId],
  );

  const adjustments = await database.all(
    `SELECT aa.id, aa.account_id AS accountId,
      aa.previous_balance AS previousBalance,
      aa.new_balance AS newBalance,
      aa.reason,
      COALESCE(aa.currency_code, a.currency_code, ?) AS currencyCode,
      COALESCE(aa.source, 'MANUAL') AS source,
      COALESCE(aa.adjustment_date, substr(aa.created_at, 1, 10)) AS adjustmentDate,
      aa.created_at AS createdAt,
      a.name AS accountName
     FROM account_balance_adjustments aa
     JOIN accounts a ON a.id = aa.account_id AND a.user_id = aa.user_id
     WHERE aa.user_id = ?
     ORDER BY COALESCE(aa.adjustment_date, substr(aa.created_at, 1, 10)) DESC, aa.created_at DESC, aa.id DESC
     LIMIT 250`,
    [primaryCurrency, userId],
  );

  const goals = await database.all(
    `SELECT id, name, target_amount AS targetAmount, current_amount AS currentAmount, due_date AS dueDate, color,
      COALESCE(priority, 2) AS priority, COALESCE(goal_type, 'general') AS goalType,
      COALESCE(currency_code, ?) AS currencyCode, COALESCE(status, 'active') AS status,
      COALESCE(note, '') AS note, COALESCE(shared_scope, 'personal') AS sharedScope, shared_group_id AS sharedGroupId,
      created_at AS createdAt, updated_at AS updatedAt
     FROM goals
     WHERE user_id = ? AND COALESCE(status, 'active') <> 'archived'
     ORDER BY CASE COALESCE(status,'active') WHEN 'active' THEN 0 ELSE 1 END, COALESCE(priority,2), due_date, created_at`,
    [primaryCurrency, userId],
  );
  const goalContributionRows = await database.all(
    `SELECT gc.id, gc.goal_id AS goalId, gc.account_id AS accountId, gc.amount, gc.contribution_date AS contributionDate,
      COALESCE(gc.note, '') AS note, gc.created_at AS createdAt, a.name AS accountName, COALESCE(a.currency_code, ?) AS currencyCode
     FROM goal_contributions gc JOIN accounts a ON a.id=gc.account_id AND a.user_id=gc.user_id
     WHERE gc.user_id=? ORDER BY gc.contribution_date DESC, gc.id DESC LIMIT 500`,
    [primaryCurrency, userId],
  );


  const recurringRows = await database.all(
    `SELECT rp.id, rp.name, rp.amount, rp.category_id AS categoryId, rp.account_id AS accountId,
      rp.frequency, rp.next_due_date AS nextDueDate, rp.due_day AS dueDay, rp.due_month AS dueMonth,
      COALESCE(rp.is_mandatory, 1) AS isMandatory,
      COALESCE(rp.auto_create_transaction, 0) AS autoCreateTransaction,
      COALESCE(rp.note, '') AS note, rp.last_paid_date AS lastPaidDate,
      rp.created_at AS createdAt, rp.updated_at AS updatedAt,
      a.name AS accountName, COALESCE(a.currency_code, ?) AS currencyCode,
      COALESCE(NULLIF(c.display_name, ''), c.name) AS categoryName, c.color AS categoryColor, c.symbol AS categorySymbol,
      c.parent_id AS parentCategoryId, COALESCE(NULLIF(parent.display_name, ''), parent.name) AS parentCategoryName
     FROM recurring_payments rp
     JOIN accounts a ON a.id = rp.account_id AND a.user_id = rp.user_id
     JOIN categories c ON c.id = rp.category_id
     LEFT JOIN categories parent ON parent.id = c.parent_id
     WHERE rp.user_id = ? AND COALESCE(rp.is_active, 1) = 1
     ORDER BY rp.next_due_date, rp.created_at, rp.id`,
    [primaryCurrency, userId],
  );

  const creditCardRows = await database.all(
    `SELECT id, name, institution_name AS institutionName, currency_code AS currencyCode,
      credit_limit AS creditLimit, current_balance AS currentBalance, statement_day AS statementDay,
      due_day AS dueDay, minimum_payment AS minimumPayment, annual_interest_rate AS annualInterestRate,
      COALESCE(note, '') AS note, created_at AS createdAt, updated_at AS updatedAt
     FROM credit_cards
     WHERE user_id = ? AND COALESCE(is_active, 1) = 1
     ORDER BY created_at, id`,
    [userId],
  );

  const debtRows = await database.all(
    `SELECT id, name, lender, debt_type AS debtType, currency_code AS currencyCode,
      original_amount AS originalAmount, current_balance AS currentBalance, regular_payment AS regularPayment,
      payment_frequency AS paymentFrequency, annual_interest_rate AS annualInterestRate,
      next_due_date AS nextDueDate, end_date AS endDate, COALESCE(note, '') AS note,
      created_at AS createdAt, updated_at AS updatedAt
     FROM debts
     WHERE user_id = ? AND COALESCE(is_active, 1) = 1
     ORDER BY CASE WHEN next_due_date IS NULL THEN 1 ELSE 0 END, next_due_date, created_at, id`,
    [userId],
  );

  const liabilityPaymentRows = await database.all(
    `SELECT lp.id, lp.liability_type AS liabilityType, lp.liability_id AS liabilityId,
      lp.source_account_id AS sourceAccountId, lp.amount, lp.payment_date AS paymentDate,
      COALESCE(lp.note, '') AS note, lp.created_at AS createdAt, a.name AS accountName,
      COALESCE(a.currency_code, ?) AS currencyCode
     FROM liability_payments lp
     JOIN accounts a ON a.id = lp.source_account_id AND a.user_id = lp.user_id
     WHERE lp.user_id = ?
     ORDER BY lp.payment_date DESC, lp.created_at DESC, lp.id DESC
     LIMIT 120`,
    [primaryCurrency, userId],
  );

  const cardConsumptionRows = await database.all(
    `SELECT cc.id, cc.card_id AS cardId, cc.description, cc.amount, cc.category_id AS categoryId,
      cc.purchase_date AS purchaseDate, cc.installments, COALESCE(cc.note, '') AS note, cc.created_at AS createdAt,
      card.name AS cardName, card.institution_name AS institutionName, card.currency_code AS currencyCode,
      COALESCE(NULLIF(c.display_name, ''), c.name) AS categoryName, c.color AS categoryColor,
      c.parent_id AS parentCategoryId, COALESCE(NULLIF(parent.display_name, ''), parent.name) AS parentCategoryName
     FROM credit_card_consumptions cc
     JOIN credit_cards card ON card.id = cc.card_id AND card.user_id = cc.user_id
     JOIN categories c ON c.id = cc.category_id
     LEFT JOIN categories parent ON parent.id = c.parent_id
     WHERE cc.user_id = ?
     ORDER BY cc.purchase_date DESC, cc.created_at DESC, cc.id DESC
     LIMIT 200`,
    [userId],
  );

  const normalizedAccounts = accounts.map((account) => ({
    ...account,
    id: Number(account.id),
    balance: normalizeNumber(account.balance),
    currencyCode: String(account.currencyCode || primaryCurrency).toUpperCase(),
  }));

  const cardConsumptions = cardConsumptionRows.map((item) => ({
    ...item, id: Number(item.id), cardId: Number(item.cardId), categoryId: Number(item.categoryId),
    parentCategoryId: item.parentCategoryId ? Number(item.parentCategoryId) : null, amount: normalizeNumber(item.amount),
    installments: Number(item.installments || 1), purchaseDate: dateText(item.purchaseDate), createdAt: timestampText(item.createdAt),
    currencyCode: String(item.currencyCode || primaryCurrency).toUpperCase(),
  }));

  const budgetMap = new Map(budgetRows.map((row) => [Number(row.categoryId), row]));
  const spendMap = new Map(spendRows.map((row) => [Number(row.categoryId), normalizeNumber(row.spent)]));
  for (const consumption of cardConsumptions) {
    if (consumption.purchaseDate < period.start || consumption.purchaseDate > period.end || consumption.currencyCode !== primaryCurrency) continue;
    spendMap.set(consumption.categoryId, (spendMap.get(consumption.categoryId) || 0) + consumption.amount);
  }

  let normalizedCategories = categoryRows.map((category) => {
    const id = Number(category.id);
    const legacyMonthlyLimit = normalizeNumber(category.legacyMonthlyLimit);
    const legacyPeriodLimit = planningPeriod === "biweekly" ? Math.round(legacyMonthlyLimit / 2) : legacyMonthlyLimit;
    const currentBudget = budgetMap.get(id);
    const periodLimit = currentBudget ? normalizeNumber(currentBudget.limitAmount) : legacyPeriodLimit;
    const directSpent = spendMap.get(id) || 0;
    const budgetKind = currentBudget?.budgetKind || "flexible";
    return {
      ...category,
      id,
      parentId: category.parentId ? Number(category.parentId) : null,
      ownerUserId: category.ownerUserId ? Number(category.ownerUserId) : null,
      isSystem: Boolean(Number(category.isSystem || 0)),
      monthlyLimit: legacyMonthlyLimit,
      legacyMonthlyLimit,
      periodLimit,
      directSpent,
      spent: directSpent,
      remaining: Math.max(periodLimit - directSpent, 0),
      percentage: periodLimit > 0 ? Math.round((directSpent / periodLimit) * 100) : 0,
      budgetKind,
      budgetKindLabel: budgetKindLabel(budgetKind),
      budgetNote: currentBudget?.note || "",
      hasPeriodBudget: Boolean(currentBudget),
      budgetIsLegacy: !currentBudget && legacyPeriodLimit > 0,
      alertLevel: periodLimit > 0 ? alertLevel(Math.round((directSpent / periodLimit) * 100)) : "ok",
    };
  });

  // Una categoría principal incluye el gasto real de sus subcategorías. El límite
  // del padre sigue siendo independiente para evitar sumar dos veces sobres anidados.
  normalizedCategories = normalizedCategories.map((category) => {
    if (category.parentId) return category;
    const childSpent = normalizedCategories
      .filter((child) => child.parentId === category.id)
      .reduce((sum, child) => sum + child.directSpent, 0);
    const spent = category.directSpent + childSpent;
    const percentage = category.periodLimit > 0 ? Math.round((spent / category.periodLimit) * 100) : 0;
    return {
      ...category,
      spent,
      remaining: Math.max(category.periodLimit - spent, 0),
      percentage,
      alertLevel: category.periodLimit > 0 ? alertLevel(percentage) : "ok",
    };
  });

  const normalizedTransactions = transactions.map((transaction) => ({
    ...transaction,
    id: Number(transaction.id),
    amount: normalizeNumber(transaction.amount),
    accountId: Number(transaction.accountId),
    destinationAccountId: transaction.destinationAccountId ? Number(transaction.destinationAccountId) : null,
    categoryId: transaction.categoryId ? Number(transaction.categoryId) : null,
    parentCategoryId: transaction.parentCategoryId ? Number(transaction.parentCategoryId) : null,
    destinationAmount: transaction.destinationAmount ? normalizeNumber(transaction.destinationAmount) : null,
    balanceAfter: transaction.balanceAfter === null || transaction.balanceAfter === undefined ? null : normalizeNumber(transaction.balanceAfter),
    destinationBalanceAfter: transaction.destinationBalanceAfter === null || transaction.destinationBalanceAfter === undefined ? null : normalizeNumber(transaction.destinationBalanceAfter),
    currencyCode: String(transaction.currencyCode || primaryCurrency).toUpperCase(),
    destinationCurrencyCode: transaction.destinationCurrencyCode ? String(transaction.destinationCurrencyCode).toUpperCase() : null,
    transactionDate: dateText(transaction.transactionDate),
    createdAt: timestampText(transaction.createdAt),
  }));

  const normalizedAdjustments = adjustments.map((adjustment) => ({
    ...adjustment,
    id: Number(adjustment.id),
    accountId: Number(adjustment.accountId),
    previousBalance: normalizeNumber(adjustment.previousBalance),
    newBalance: normalizeNumber(adjustment.newBalance),
    currencyCode: String(adjustment.currencyCode || primaryCurrency).toUpperCase(),
    adjustmentDate: dateText(adjustment.adjustmentDate),
    createdAt: timestampText(adjustment.createdAt),
  }));

  const goalContributions = goalContributionRows.map((item) => ({
    ...item, id:Number(item.id), goalId:Number(item.goalId), accountId:Number(item.accountId), amount:normalizeNumber(item.amount),
    contributionDate:dateText(item.contributionDate), createdAt:timestampText(item.createdAt), currencyCode:String(item.currencyCode||primaryCurrency).toUpperCase(),
  }));
  const ninetyDaysAgo = addDays(period.today, -90);
  const normalizedGoals = goals.map((goal) => {
    const targetAmount=normalizeNumber(goal.targetAmount), currentAmount=normalizeNumber(goal.currentAmount);
    const remainingAmount=Math.max(targetAmount-currentAmount,0); const dueDate=dateText(goal.dueDate);
    const rawDays = dueDate ? Math.ceil((utcDate(dueDate)-utcDate(period.today))/86400000) : 0;
    const daysRemaining=Math.max(0,rawDays+1);
    const periodsRemaining=remainingAmount<=0?0:Math.max(1,planningPeriod==='biweekly'?Math.ceil(daysRemaining/15):Math.ceil(daysRemaining/30.44));
    const requiredPerPeriod=periodsRemaining?Math.ceil(remainingAmount/periodsRemaining):0;
    const requiredMonthly=daysRemaining>0?Math.ceil((remainingAmount/daysRemaining)*30.44):remainingAmount;
    const requiredBiweekly=daysRemaining>0?Math.ceil((remainingAmount/daysRemaining)*15):remainingAmount;
    const recent=goalContributions.filter((item)=>item.goalId===Number(goal.id)&&item.contributionDate>=ninetyDaysAgo&&item.contributionDate<=period.today);
    const recentTotal=recent.reduce((sum,item)=>sum+item.amount,0); const averageMonthlyPace=recentTotal?Math.round(recentTotal/3):0;
    const estimatedDays=averageMonthlyPace>0&&remainingAmount>0?Math.ceil(remainingAmount/(averageMonthlyPace/30.44)):0;
    const estimatedCompletionDate=remainingAmount<=0?dueDate:estimatedDays?addDays(period.today,Math.min(estimatedDays,3650)):'';
    const status=String(goal.status||'active');
    return {...goal,id:Number(goal.id),targetAmount,currentAmount,remainingAmount,dueDate,priority:Number(goal.priority||2),priorityLabel:goalPriorityLabel(goal.priority),
      goalType:goal.goalType||'general',goalTypeLabel:goalTypeLabel(goal.goalType||'general'),currencyCode:String(goal.currencyCode||primaryCurrency).toUpperCase(),status,
      sharedGroupId:goal.sharedGroupId?Number(goal.sharedGroupId):null,sharedReady:goal.sharedScope==='shared-ready'||Boolean(goal.sharedGroupId),createdAt:timestampText(goal.createdAt),updatedAt:timestampText(goal.updatedAt),
      progress:targetAmount?Math.min(100,Math.round((currentAmount/targetAmount)*100)):0,daysRemaining,periodsRemaining,requiredPerPeriod,requiredMonthly,requiredBiweekly,averageMonthlyPace,estimatedCompletionDate,
      projectionStatus:remainingAmount<=0?'completed':dueDate<period.today?'overdue':averageMonthlyPace<=0?'new':averageMonthlyPace>=requiredMonthly?'on-track':'behind'};
  });


  const recurringPayments = recurringRows.map((item) => ({
    ...item,
    id: Number(item.id),
    amount: normalizeNumber(item.amount),
    categoryId: Number(item.categoryId),
    accountId: Number(item.accountId),
    parentCategoryId: item.parentCategoryId ? Number(item.parentCategoryId) : null,
    dueDay: item.dueDay ? Number(item.dueDay) : null,
    dueMonth: item.dueMonth ? Number(item.dueMonth) : null,
    isMandatory: Boolean(Number(item.isMandatory || 0)),
    autoCreateTransaction: Boolean(Number(item.autoCreateTransaction || 0)),
    nextDueDate: dateText(item.nextDueDate),
    lastPaidDate: dateText(item.lastPaidDate),
    currencyCode: String(item.currencyCode || primaryCurrency).toUpperCase(),
    frequencyLabel: recurringFrequencyLabel(item.frequency),
    createdAt: timestampText(item.createdAt),
    updatedAt: timestampText(item.updatedAt),
  }));

  const creditCards = creditCardRows.map((card) => {
    const creditLimit = normalizeNumber(card.creditLimit);
    const currentBalance = normalizeNumber(card.currentBalance);
    return {
      ...card, id: Number(card.id), creditLimit, currentBalance,
      statementDay: Number(card.statementDay || 1), dueDay: Number(card.dueDay || 20),
      minimumPayment: normalizeNumber(card.minimumPayment), annualInterestRate: Number(card.annualInterestRate || 0),
      currencyCode: String(card.currencyCode || primaryCurrency).toUpperCase(),
      availableCredit: Math.max(creditLimit - currentBalance, 0),
      recommendedPayment: currentBalance,
      utilization: creditLimit > 0 ? Math.round((currentBalance / creditLimit) * 100) : 0,
      createdAt: timestampText(card.createdAt), updatedAt: timestampText(card.updatedAt),
    };
  });

  const debts = debtRows.map((debt) => {
    const originalAmount = normalizeNumber(debt.originalAmount);
    const currentBalance = normalizeNumber(debt.currentBalance);
    return {
      ...debt, id: Number(debt.id), originalAmount, currentBalance, regularPayment: normalizeNumber(debt.regularPayment),
      annualInterestRate: Number(debt.annualInterestRate || 0),
      currencyCode: String(debt.currencyCode || primaryCurrency).toUpperCase(),
      nextDueDate: dateText(debt.nextDueDate), endDate: dateText(debt.endDate),
      debtTypeLabel: debtTypeLabel(debt.debtType),
      paidAmount: Math.max(originalAmount - currentBalance, 0),
      progress: originalAmount > 0 ? Math.min(100, Math.round(((originalAmount - currentBalance) / originalAmount) * 100)) : 0,
      paymentFrequencyLabel: recurringFrequencyLabel(debt.paymentFrequency),
      createdAt: timestampText(debt.createdAt), updatedAt: timestampText(debt.updatedAt),
    };
  });

  const liabilityPayments = liabilityPaymentRows.map((payment) => ({
    ...payment, id: Number(payment.id), liabilityId: Number(payment.liabilityId), sourceAccountId: Number(payment.sourceAccountId),
    amount: normalizeNumber(payment.amount), paymentDate: dateText(payment.paymentDate), createdAt: timestampText(payment.createdAt),
    currencyCode: String(payment.currencyCode || primaryCurrency).toUpperCase(),
  }));

  const currencyTotals = normalizedAccounts.reduce((totals, account) => {
    totals[account.currencyCode] = (totals[account.currencyCode] || 0) + account.balance;
    return totals;
  }, {});
  const primaryBalance = currencyTotals[primaryCurrency] || 0;

  // TiDB usa ONLY_FULL_GROUP_BY. Agrupamos por la columna real y normalizamos
  // los registros antiguos con currency_code NULL en JavaScript para evitar que
  // COALESCE(currency_code, ?) con parámetros sea rechazado por el motor SQL.
  const cashflowRows = await database.all(
    `SELECT currency_code AS currencyCode,
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' AND COALESCE(source,'MANUAL') <> 'GOAL' AND description NOT LIKE 'Aporte:%' AND description NOT LIKE 'Reserva:%' THEN amount ELSE 0 END), 0) AS expenses
     FROM transactions
     WHERE user_id = ? AND transaction_date BETWEEN ? AND ?
     GROUP BY currency_code`,
    [userId, period.start, period.end],
  );
  const cashflowByCurrency = {};
  for (const row of cashflowRows) {
    const code = String(row.currencyCode || primaryCurrency).toUpperCase();
    if (!cashflowByCurrency[code]) {
      cashflowByCurrency[code] = { income: 0, expenses: 0 };
    }
    cashflowByCurrency[code].income += normalizeNumber(row.income);
    cashflowByCurrency[code].expenses += normalizeNumber(row.expenses);
  }
  for (const consumption of cardConsumptions) {
    if (consumption.purchaseDate < period.start || consumption.purchaseDate > period.end) continue;
    const code = consumption.currencyCode;
    if (!cashflowByCurrency[code]) cashflowByCurrency[code] = { income: 0, expenses: 0 };
    cashflowByCurrency[code].expenses += consumption.amount;
  }
  const primaryCashflow = cashflowByCurrency[primaryCurrency] || { income: 0, expenses: 0 };

  const roots = normalizedCategories.filter((category) => !category.parentId);
  let budgetTotal = 0;
  let budgetSpent = 0;
  let fixedReserve = 0;
  let explicitSavingsReserve = 0;
  let explicitFixedCount = 0;

  for (const root of roots) {
    const children = normalizedCategories.filter((category) => category.parentId === root.id);
    if (root.periodLimit > 0) {
      budgetTotal += root.periodLimit;
      budgetSpent += root.spent;
      if (root.budgetKind === "fixed") {
        fixedReserve += root.remaining;
        explicitFixedCount += 1;
      }
      if (root.budgetKind === "savings") explicitSavingsReserve += root.remaining;
      continue;
    }
    for (const child of children) {
      if (child.periodLimit <= 0) continue;
      budgetTotal += child.periodLimit;
      budgetSpent += child.spent;
      if (child.budgetKind === "fixed") {
        fixedReserve += child.remaining;
        explicitFixedCount += 1;
      }
      if (child.budgetKind === "savings") explicitSavingsReserve += child.remaining;
    }
  }

  const fixedFallback = periodFixedExpenses(profile, period);
  const usingProfileFixedFallback = explicitFixedCount === 0 && fixedFallback > 0;
  if (usingProfileFixedFallback) fixedReserve = fixedFallback;

  const nextPayday = paydayDetails(profile, period);
  let safeUntil = period.end;
  let safeUntilKind = "period";
  if (nextPayday?.date && nextPayday.date <= period.end) {
    safeUntil = nextPayday.date;
    safeUntilKind = "payday";
  }

  const calendarBounds = monthBounds(period.today);
  const horizon30 = addDays(period.today, 30);
  const eventHorizon = horizon30 > calendarBounds.end ? horizon30 : calendarBounds.end;
  const recurringOccurrences = [];
  for (const recurring of recurringPayments) {
    const firstDate = recurring.nextDueDate;
    if (!firstDate) continue;
    if (firstDate < period.today) {
      recurringOccurrences.push({ ...recurring, date: firstDate, overdue: true, projected: false });
      continue;
    }
    let occurrenceDate = firstDate;
    let guard = 0;
    while (occurrenceDate <= eventHorizon && guard < 40) {
      recurringOccurrences.push({ ...recurring, date: occurrenceDate, overdue: false, projected: occurrenceDate !== firstDate });
      occurrenceDate = advanceRecurringDate(occurrenceDate, recurring.frequency, recurring.dueDay, recurring.dueMonth);
      guard += 1;
    }
  }
  recurringOccurrences.sort((a, b) => `${a.date}|${a.name}`.localeCompare(`${b.date}|${b.name}`));

  const liabilityOccurrences = [];
  for (const card of creditCards) {
    if (card.currentBalance <= 0 || card.minimumPayment <= 0) continue;
    const date = nextMonthlyDay(period.today, card.dueDay);
    liabilityOccurrences.push({
      id: card.id, kind: "card", referenceId: card.id, name: card.name, date, overdue: false,
      amount: Math.min(card.minimumPayment, card.currentBalance), currencyCode: card.currencyCode,
      accountName: card.institutionName || "Tarjeta", categoryName: "Tarjeta de crédito",
    });
  }
  for (const debt of debts) {
    if (debt.currentBalance <= 0 || !debt.nextDueDate || debt.regularPayment <= 0) continue;
    liabilityOccurrences.push({
      id: debt.id, kind: "debt", referenceId: debt.id, name: debt.name, date: debt.nextDueDate,
      overdue: debt.nextDueDate < period.today, amount: Math.min(debt.regularPayment, debt.currentBalance),
      currencyCode: debt.currencyCode, accountName: debt.lender || "Deuda", categoryName: debt.debtTypeLabel,
    });
  }
  liabilityOccurrences.sort((a, b) => `${a.date}|${a.name}`.localeCompare(`${b.date}|${b.name}`));

  const primaryOccurrences = recurringOccurrences.filter((item) => item.currencyCode === primaryCurrency);
  const recurringBeforeSafe = primaryOccurrences.filter((item) => !item.overdue && item.date >= period.today && item.date <= safeUntil);
  const overduePrimary = primaryOccurrences.filter((item) => item.overdue);
  const recurringDueBeforeSafeTotal = [...overduePrimary, ...recurringBeforeSafe].reduce((sum, item) => sum + item.amount, 0);

  const categoryByIdMap = new Map(normalizedCategories.map((category) => [category.id, category]));
  const fixedCoverage = new Map();
  for (const category of normalizedCategories) {
    if (category.budgetKind === "fixed" && category.periodLimit > 0) fixedCoverage.set(category.id, category.remaining);
  }

  let recurringReserveExtra = 0;
  let liabilityReserve = 0;
  let remainingCoverage = new Map(fixedCoverage);
  if (usingProfileFixedFallback) {
    recurringReserveExtra = Math.max(recurringDueBeforeSafeTotal - fixedReserve, 0);
  } else {
    for (const occurrence of [...overduePrimary, ...recurringBeforeSafe]) {
      const category = categoryByIdMap.get(occurrence.categoryId);
      const rootId = category?.parentId || category?.id;
      const coverageId = remainingCoverage.has(occurrence.categoryId)
        ? occurrence.categoryId
        : remainingCoverage.has(rootId) ? rootId : null;
      if (!coverageId) {
        recurringReserveExtra += occurrence.amount;
        continue;
      }
      const availableCoverage = remainingCoverage.get(coverageId) || 0;
      const covered = Math.min(availableCoverage, occurrence.amount);
      remainingCoverage.set(coverageId, availableCoverage - covered);
      recurringReserveExtra += occurrence.amount - covered;
    }
  }

  const primaryLiabilityDue = liabilityOccurrences.filter((item) => item.currencyCode === primaryCurrency && (item.overdue || (item.date >= period.today && item.date <= safeUntil)));
  if (usingProfileFixedFallback) {
    liabilityReserve = primaryLiabilityDue.reduce((sum, item) => sum + item.amount, 0);
  } else {
    for (const occurrence of primaryLiabilityDue) {
      const debtCategoryId = 10;
      const coverageId = remainingCoverage.has(debtCategoryId) ? debtCategoryId : null;
      if (!coverageId) { liabilityReserve += occurrence.amount; continue; }
      const availableCoverage = remainingCoverage.get(coverageId) || 0;
      const covered = Math.min(availableCoverage, occurrence.amount);
      remainingCoverage.set(coverageId, availableCoverage - covered);
      liabilityReserve += occurrence.amount - covered;
    }
  }
  const protectedCommitments = fixedReserve + recurringReserveExtra + liabilityReserve;

  const targetSavingsReserve = Math.round(primaryCashflow.income * Math.max(0, Math.min(profile.savingsTargetPercent, 100)) / 100);
  const savingsReserve = Math.max(explicitSavingsReserve, targetSavingsReserve);
  const nonLiquidProducts = new Set(["certificate", "investment", "contribution"]);
  const liquidBalance = normalizedAccounts
    .filter((account) => account.currencyCode === primaryCurrency && !nonLiquidProducts.has(account.productType))
    .reduce((sum, account) => sum + account.balance, 0);
  const safeToSpend = Math.max(liquidBalance - protectedCommitments - savingsReserve, 0);
  const daysForSafeSpend = Math.max(daysBetween(period.today, safeUntil) + 1, 1);
  const dailySafeToSpend = Math.floor(safeToSpend / daysForSafeSpend);
  const expectedPeriodIncome = expectedIncomeForPeriod(profile, period);
  const incomeReference = Math.max(primaryCashflow.income, expectedPeriodIncome);
  const unassignedBudget = Math.max(incomeReference - budgetTotal, 0);

  const commitmentOccurrences = [
    ...recurringOccurrences.map((item) => ({ ...item, kind: "recurring", referenceId: item.id })),
    ...liabilityOccurrences,
  ].sort((a, b) => `${a.date}|${a.name}`.localeCompare(`${b.date}|${b.name}`));

  const windowSummary = (days) => {
    const end = addDays(period.today, days);
    const allItems = commitmentOccurrences.filter((item) => !item.overdue && item.date >= period.today && item.date <= end);
    const items = allItems.filter((item) => item.currencyCode === primaryCurrency);
    const totalsByCurrency = {};
    for (const item of allItems) totalsByCurrency[item.currencyCode] = (totalsByCurrency[item.currencyCode] || 0) + item.amount;
    return { days, count: items.length, countAll: allItems.length, total: items.reduce((sum, item) => sum + item.amount, 0), totalsByCurrency };
  };
  const overdueCommitments = commitmentOccurrences.filter((item) => item.overdue).map((item) => ({
    id: item.id, referenceId: item.referenceId, kind: item.kind, name: item.name, amount: item.amount, date: item.date, currencyCode: item.currencyCode,
    accountName: item.accountName, categoryName: item.categoryName, overdue: true,
  }));
  const upcomingCommitments = commitmentOccurrences
    .filter((item) => !item.overdue && item.date >= period.today && item.date <= horizon30)
    .slice(0, 60)
    .map((item) => ({
      id: item.id, referenceId: item.referenceId, kind: item.kind, name: item.name, amount: item.amount, date: item.date, currencyCode: item.currencyCode,
      accountName: item.accountName, categoryName: item.categoryName, projected: item.projected,
    }));

  const calendarEvents = commitmentOccurrences
    .filter((item) => item.date >= calendarBounds.start && item.date <= calendarBounds.end)
    .map((item) => ({
      id: `${item.kind}-${item.id}-${item.date}`, type: item.kind, referenceId: item.referenceId, recurringId: item.kind === "recurring" ? item.id : null,
      cardId: item.kind === "card" ? item.id : null, debtId: item.kind === "debt" ? item.id : null, date: item.date,
      title: item.name, amount: item.amount, currencyCode: item.currencyCode, mandatory: item.isMandatory, projected: item.projected,
      categoryName: item.categoryName, accountName: item.accountName, overdue: item.overdue,
    }));

  const paydayEvents = [];
  if (profile.incomeFrequency !== "irregular") {
    if (profile.incomeFrequency === "weekly") {
      let date = nextPayday?.date || period.today;
      let guard = 0;
      while (date <= calendarBounds.end && guard < 8) {
        if (date >= calendarBounds.start) paydayEvents.push({ id: `payday-${date}`, type: "payday", date, title: "Día de cobro", amount: profile.incomeAmount, currencyCode: primaryCurrency });
        date = addDays(date, 7);
        guard += 1;
      }
    } else {
      const configuredDays = [profile.paydayOne, profile.paydayTwo].map(Number).filter((day) => day >= 1 && day <= 31);
      for (const requestedDay of [...new Set(configuredDays)]) {
        const day = clampDay(calendarBounds.year, calendarBounds.month, requestedDay);
        paydayEvents.push({
          id: `payday-${calendarBounds.year}-${calendarBounds.month}-${day}`, type: "payday",
          date: isoFromParts(calendarBounds.year, calendarBounds.month, day), title: "Día de cobro",
          amount: profile.incomeAmount, currencyCode: primaryCurrency,
        });
      }
    }
  }
  const calendarEventsCombined = [...calendarEvents, ...paydayEvents].sort((a, b) => `${a.date}|${a.type}`.localeCompare(`${b.date}|${b.type}`));

  const budgetAlerts = normalizedCategories
    .filter((category) => category.periodLimit > 0 && category.percentage >= 70)
    .map((category) => ({
      categoryId: category.id,
      name: category.name,
      parentId: category.parentId,
      percentage: category.percentage,
      level: category.alertLevel,
      spent: category.spent,
      limit: category.periodLimit,
      remaining: category.remaining,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const creditUsedTotal = creditCards.filter((card) => card.currencyCode === primaryCurrency).reduce((sum, card) => sum + card.currentBalance, 0);
  const creditLimitTotal = creditCards.filter((card) => card.currencyCode === primaryCurrency).reduce((sum, card) => sum + card.creditLimit, 0);
  const debtBalanceTotal = debts.filter((debt) => debt.currencyCode === primaryCurrency).reduce((sum, debt) => sum + debt.currentBalance, 0);
  const monthlyDebtCommitment = creditCards.filter((card) => card.currencyCode === primaryCurrency).reduce((sum, card) => sum + Math.min(card.minimumPayment, card.currentBalance), 0)
    + debts.filter((debt) => debt.currencyCode === primaryCurrency).reduce((sum, debt) => sum + Math.min(debt.regularPayment, debt.currentBalance), 0);
  const liabilitiesTotal = creditUsedTotal + debtBalanceTotal;
  const goalReservesPrimary = normalizedGoals.filter((goal)=>goal.currencyCode===primaryCurrency).reduce((sum,goal)=>sum+goal.currentAmount,0);
  const netWorth = primaryBalance + goalReservesPrimary - liabilitiesTotal;

  const emergencyGoal=normalizedGoals.find((goal)=>goal.goalType==='emergency'&&goal.status!=='archived')||null;
  const emergencyCurrent=emergencyGoal?.currentAmount||profile.emergencySavings||0;
  const monthlyEssentialExpenses=Math.max(profile.fixedExpenses||0,0);
  const emergencyRecommended=emergencyGoal?.targetAmount||monthlyEssentialExpenses*3;
  const emergencyCoverageMonths=monthlyEssentialExpenses>0?emergencyCurrent/monthlyEssentialExpenses:0;
  const emergencyFund={goalId:emergencyGoal?.id||null,currentAmount:emergencyCurrent,targetAmount:emergencyRecommended,coverageMonths:Number(emergencyCoverageMonths.toFixed(1)),recommendedMonths:3,percentage:emergencyRecommended?Math.min(100,Math.round((emergencyCurrent/emergencyRecommended)*100)):0,configured:Boolean(emergencyGoal||emergencyCurrent>0)};

  async function cashflowForRange(start,end){
    const row=await database.get(`SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' AND COALESCE(source,'MANUAL')<>'GOAL' AND description NOT LIKE 'Aporte:%' AND description NOT LIKE 'Reserva:%' THEN amount ELSE 0 END),0) AS expenses
      FROM transactions WHERE user_id=? AND transaction_date BETWEEN ? AND ? AND COALESCE(currency_code,?)=?`,[userId,start,end,primaryCurrency,primaryCurrency]);
    const card=await database.get(`SELECT COALESCE(SUM(cc.amount),0) AS expenses FROM credit_card_consumptions cc JOIN credit_cards c ON c.id=cc.card_id AND c.user_id=cc.user_id WHERE cc.user_id=? AND cc.purchase_date BETWEEN ? AND ? AND COALESCE(c.currency_code,?)=?`,[userId,start,end,primaryCurrency,primaryCurrency]);
    return {income:normalizeNumber(row?.income),expenses:normalizeNumber(row?.expenses)+normalizeNumber(card?.expenses)};
  }
  const currentMonthBounds=monthBounds(period.today), previousMonthBounds=monthBounds(shiftMonthDate(period.today,-1)), previousPeriod=previousPeriodBounds(planningPeriod,period);
  const currentMonthFlow=await cashflowForRange(currentMonthBounds.start,currentMonthBounds.end), previousMonthFlow=await cashflowForRange(previousMonthBounds.start,previousMonthBounds.end);
  const currentPeriodFlow=await cashflowForRange(period.start,period.end), previousPeriodFlow=await cashflowForRange(previousPeriod.start,previousPeriod.end);

  async function categorySpendForRange(start,end){
    const rows=await database.all(`SELECT category_id AS categoryId,COALESCE(SUM(amount),0) AS spent FROM transactions WHERE user_id=? AND type='expense' AND category_id IS NOT NULL AND COALESCE(source,'MANUAL')<>'GOAL' AND description NOT LIKE 'Aporte:%' AND description NOT LIKE 'Reserva:%' AND transaction_date BETWEEN ? AND ? AND COALESCE(currency_code,?)=? GROUP BY category_id`,[userId,start,end,primaryCurrency,primaryCurrency]);
    const cards=await database.all(`SELECT cc.category_id AS categoryId,COALESCE(SUM(cc.amount),0) AS spent FROM credit_card_consumptions cc JOIN credit_cards c ON c.id=cc.card_id AND c.user_id=cc.user_id WHERE cc.user_id=? AND cc.category_id IS NOT NULL AND cc.purchase_date BETWEEN ? AND ? AND COALESCE(c.currency_code,?)=? GROUP BY cc.category_id`,[userId,start,end,primaryCurrency,primaryCurrency]);
    const map=new Map(); for(const row of [...rows,...cards]) map.set(Number(row.categoryId),(map.get(Number(row.categoryId))||0)+normalizeNumber(row.spent)); return map;
  }
  const currentCategorySpend=await categorySpendForRange(period.start,period.end), previousCategorySpend=await categorySpendForRange(previousPeriod.start,previousPeriod.end);
  const categoryMap=new Map(normalizedCategories.map((c)=>[c.id,c]));
  const rootTotals=(source)=>{const totals=new Map();for(const [id,amount] of source){const c=categoryMap.get(id);const rootId=c?.parentId||id;totals.set(rootId,(totals.get(rootId)||0)+amount)}return totals};
  const curRoots=rootTotals(currentCategorySpend), prevRoots=rootTotals(previousCategorySpend);
  const categoryTrends=[...new Set([...curRoots.keys(),...prevRoots.keys()])].map((id)=>{const c=categoryMap.get(id);const current=curRoots.get(id)||0,previous=prevRoots.get(id)||0;return{categoryId:id,name:c?.name||'Otros',color:c?.color||'mint',current,previous,delta:previous>0?Math.round(((current-previous)/previous)*100):current>0?100:0}}).filter((i)=>i.current||i.previous).sort((a,b)=>b.current-a.current).slice(0,8);

  const historyRows=await database.all(`SELECT id,description,amount,category_id AS categoryId,transaction_date AS transactionDate FROM transactions WHERE user_id=? AND type='expense' AND category_id IS NOT NULL AND COALESCE(source,'MANUAL')<>'GOAL' AND transaction_date BETWEEN ? AND ? AND COALESCE(currency_code,?)=? ORDER BY transaction_date,id LIMIT 180`,[userId,addDays(period.today,-90),period.today,primaryCurrency,primaryCurrency]);
  const unusualExpenses=[], byCategory=new Map(); for(const row of historyRows){const id=Number(row.categoryId),h=byCategory.get(id)||[],amount=normalizeNumber(row.amount);if(h.length>=3){const avg=h.reduce((a,b)=>a+b,0)/h.length;if(amount>=Math.max(avg*1.8,50000)){const c=categoryMap.get(id);unusualExpenses.unshift({id:Number(row.id),description:row.description,amount,average:Math.round(avg),categoryId:id,categoryName:c?.name||'Gasto',date:dateText(row.transactionDate),multiplier:Number((amount/Math.max(avg,1)).toFixed(1))})}}h.push(amount);if(h.length>12)h.shift();byCategory.set(id,h)}

  const monthlyIncomeReference=Math.max(expectedMonthlyIncome(profile),currentMonthFlow.income); const monthlySavingsAmount=currentMonthFlow.income-currentMonthFlow.expenses;
  const savingsCapacityRate=currentMonthFlow.income>0?Math.round((monthlySavingsAmount/currentMonthFlow.income)*100):0;
  const debtToIncomeRate=monthlyIncomeReference>0?Math.round((monthlyDebtCommitment/monthlyIncomeReference)*100):0; const fixedToIncomeRate=monthlyIncomeReference>0?Math.round((profile.fixedExpenses/monthlyIncomeReference)*100):0;
  const todayDay=Number(period.today.slice(8,10)), monthDays=daysInMonth(currentMonthBounds.year,currentMonthBounds.month), elapsed=Math.max(todayDay/monthDays,.08);
  const projectedMonthExpenses=Math.round(currentMonthFlow.expenses/elapsed); const projectedEndBalance=Math.max(0,primaryBalance+Math.max(monthlyIncomeReference-currentMonthFlow.income,0)-Math.max(projectedMonthExpenses-currentMonthFlow.expenses,0)-windowSummary(30).total);
  const savingsScore=monthlyIncomeReference>0?Math.min(25,Math.max(0,(Math.max(savingsCapacityRate,0)/Math.max(profile.savingsTargetPercent||10,10))*25)):8;
  const emergencyScore=Math.min(25,(Math.min(emergencyCoverageMonths,3)/3)*25); const debtScore=monthlyIncomeReference>0?Math.max(0,20*(1-Math.min(debtToIncomeRate/50,1))):10; const fixedScore=monthlyIncomeReference>0?Math.max(0,15*(1-Math.min(fixedToIncomeRate/75,1))):8; const budgetScore=Math.max(0,15-Math.min(budgetAlerts.length*4,12)-(safeToSpend<=0?3:0));
  const claraIndex=clampScore(savingsScore+emergencyScore+debtScore+fixedScore+budgetScore); const claraIndexLabel=claraIndex>=80?'Muy bien organizado':claraIndex>=65?'En buen camino':claraIndex>=45?'Hay espacio para mejorar':'Necesita atención';
  const recommendations=[]; if(emergencyCoverageMonths<1&&monthlyEssentialExpenses>0) recommendations.push({type:'emergency',title:'Fortalece tu respaldo',message:`Tu fondo cubre ${emergencyCoverageMonths.toFixed(1)} meses de gastos fijos. El primer objetivo es llegar a 1 mes.`,actionView:'metas'}); if(debtToIncomeRate>35) recommendations.push({type:'debt',title:'La deuda está presionando tu ingreso',message:`${debtToIncomeRate}% de tu ingreso mensual de referencia está comprometido en pagos de deuda.`,actionView:'credito'}); if(fixedToIncomeRate>60) recommendations.push({type:'fixed',title:'Revisa tus gastos fijos',message:`Tus gastos fijos representan cerca de ${fixedToIncomeRate}% del ingreso mensual de referencia.`,actionView:'presupuesto'}); if(budgetAlerts.length) recommendations.push({type:'budget',title:'Hay sobres que necesitan atención',message:`${budgetAlerts.length} categoría${budgetAlerts.length===1?' está':'s están'} por encima del 70% de su presupuesto.`,actionView:'presupuesto'}); if(savingsCapacityRate>=Math.max(profile.savingsTargetPercent||10,10)) recommendations.push({type:'positive',title:'Tu capacidad de ahorro va bien',message:`Este mes llevas una capacidad de ahorro estimada de ${savingsCapacityRate}%.`,actionView:'metas'}); if(!recommendations.length) recommendations.push({type:'plan',title:'Mantén el ritmo',message:'Tus números no muestran una alerta prioritaria. Sigue registrando movimientos para que Clara aprenda mejor tu patrón.',actionView:'analisis'});
  const delta=(current,previous)=>previous>0?Math.round(((current-previous)/previous)*100):current>0?100:0;

  const evolutionMonths=[]; let closingBalance=primaryBalance; for(let offset=0;offset>=-5;offset--){const bounds=monthBounds(shiftMonthDate(period.today,offset));evolutionMonths.push({key:bounds.start.slice(0,7),start:bounds.start,end:bounds.end,balance:closingBalance});let change=0;for(const tx of normalizedTransactions){if(tx.transactionDate<bounds.start||tx.transactionDate>bounds.end)continue;if(tx.currencyCode===primaryCurrency){if(tx.type==='income')change+=tx.amount;else if(tx.type==='expense')change-=tx.amount;else if(tx.type==='transfer')change-=tx.amount}if(tx.type==='transfer'&&tx.destinationCurrencyCode===primaryCurrency)change+=tx.destinationAmount||tx.amount}for(const adj of normalizedAdjustments){if(adj.adjustmentDate>=bounds.start&&adj.adjustmentDate<=bounds.end&&adj.currencyCode===primaryCurrency)change+=adj.newBalance-adj.previousBalance}for(const pay of liabilityPayments){if(pay.paymentDate>=bounds.start&&pay.paymentDate<=bounds.end&&pay.currencyCode===primaryCurrency)change-=pay.amount}closingBalance-=change} evolutionMonths.reverse();

  if(database.provider==='tidb') await database.run(`INSERT INTO financial_snapshots (user_id,snapshot_date,primary_currency,liquid_balance,goal_reserves,liabilities,net_worth) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE liquid_balance=VALUES(liquid_balance),goal_reserves=VALUES(goal_reserves),liabilities=VALUES(liabilities),net_worth=VALUES(net_worth),updated_at=CURRENT_TIMESTAMP`,[userId,period.today,primaryCurrency,primaryBalance,goalReservesPrimary,liabilitiesTotal,netWorth]);
  else await database.run(`INSERT INTO financial_snapshots (user_id,snapshot_date,primary_currency,liquid_balance,goal_reserves,liabilities,net_worth) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,snapshot_date,primary_currency) DO UPDATE SET liquid_balance=excluded.liquid_balance,goal_reserves=excluded.goal_reserves,liabilities=excluded.liabilities,net_worth=excluded.net_worth,updated_at=CURRENT_TIMESTAMP`,[userId,period.today,primaryCurrency,primaryBalance,goalReservesPrimary,liabilitiesTotal,netWorth]);
  const snapshotRows=await database.all(`SELECT snapshot_date AS date,liquid_balance AS liquidBalance,goal_reserves AS goalReserves,liabilities,net_worth AS netWorth FROM financial_snapshots WHERE user_id=? AND primary_currency=? ORDER BY snapshot_date DESC LIMIT 180`,[userId,primaryCurrency]); const snapshots=snapshotRows.map((r)=>({date:dateText(r.date),liquidBalance:normalizeNumber(r.liquidBalance),goalReserves:normalizeNumber(r.goalReserves),liabilities:normalizeNumber(r.liabilities),netWorth:normalizeNumber(r.netWorth)})).reverse();
  const analytics={claraIndex,claraIndexLabel,currentMonth:currentMonthFlow,previousMonth:previousMonthFlow,currentPeriod:currentPeriodFlow,previousPeriod:previousPeriodFlow,monthExpenseDelta:delta(currentMonthFlow.expenses,previousMonthFlow.expenses),monthIncomeDelta:delta(currentMonthFlow.income,previousMonthFlow.income),periodExpenseDelta:delta(currentPeriodFlow.expenses,previousPeriodFlow.expenses),savingsCapacityRate,savingsCapacityAmount:monthlySavingsAmount,debtToIncomeRate,fixedToIncomeRate,projectedMonthExpenses,projectedEndBalance,categoryTrends,unusualExpenses:unusualExpenses.slice(0,6),recommendations,primaryRecommendation:recommendations[0]};
  const wealth={liquidBalance:primaryBalance,goalReserves:goalReservesPrimary,liabilities:liabilitiesTotal,netWorth,snapshots,accountEvolution:evolutionMonths};

  const balanceHistory = [];
  for (const transaction of normalizedTransactions) {
    const signedAmount = transaction.type === "income" ? transaction.amount : -transaction.amount;
    if (transaction.type === "income" || transaction.type === "expense") {
      balanceHistory.push({
        id: `t-${transaction.id}-source`,
        accountId: transaction.accountId,
        accountName: transaction.accountName,
        type: transaction.type,
        description: transaction.description,
        amount: signedAmount,
        balanceAfter: transaction.balanceAfter,
        currencyCode: transaction.currencyCode,
        date: transaction.transactionDate,
        source: transaction.source,
        createdAt: transaction.createdAt,
      });
    } else if (transaction.type === "transfer") {
      balanceHistory.push({
        id: `t-${transaction.id}-source`,
        accountId: transaction.accountId,
        accountName: transaction.accountName,
        type: "transfer-out",
        description: transaction.description,
        amount: -transaction.amount,
        balanceAfter: transaction.balanceAfter,
        currencyCode: transaction.currencyCode,
        date: transaction.transactionDate,
        source: transaction.source,
        createdAt: transaction.createdAt,
      });
      if (transaction.destinationAccountId) {
        balanceHistory.push({
          id: `t-${transaction.id}-destination`,
          accountId: transaction.destinationAccountId,
          accountName: transaction.destinationAccountName,
          type: "transfer-in",
          description: `Desde ${transaction.accountName}`,
          amount: transaction.destinationAmount || transaction.amount,
          balanceAfter: transaction.destinationBalanceAfter,
          currencyCode: transaction.destinationCurrencyCode || transaction.currencyCode,
          date: transaction.transactionDate,
          source: transaction.source,
          createdAt: transaction.createdAt,
        });
      }
    }
  }
  for (const adjustment of normalizedAdjustments) {
    balanceHistory.push({
      id: `a-${adjustment.id}`,
      accountId: adjustment.accountId,
      accountName: adjustment.accountName,
      type: "adjustment",
      description: adjustment.reason || "Ajuste de saldo",
      amount: adjustment.newBalance - adjustment.previousBalance,
      balanceAfter: adjustment.newBalance,
      previousBalance: adjustment.previousBalance,
      currencyCode: adjustment.currencyCode,
      date: adjustment.adjustmentDate,
      source: adjustment.source,
      createdAt: adjustment.createdAt,
    });
  }
  balanceHistory.sort((a, b) => `${b.date || ""}|${b.createdAt || ""}`.localeCompare(`${a.date || ""}|${a.createdAt || ""}`));

  return {
    accounts: normalizedAccounts,
    categories: normalizedCategories,
    transactions: normalizedTransactions,
    adjustments: normalizedAdjustments,
    balanceHistory: balanceHistory.slice(0, 400),
    goals: normalizedGoals,
    goalContributions,
    emergencyFund,
    wealth,
    analytics,
    recurringPayments,
    creditCards,
    debts,
    liabilityPayments,
    cardConsumptions,
    hiddenSystemCategoriesCount: Number(hiddenCategoryRow?.total || 0),
    calendar: {
      monthStart: calendarBounds.start,
      monthEnd: calendarBounds.end,
      events: calendarEventsCombined,
      upcoming: upcomingCommitments,
      overdue: overdueCommitments,
      windows: { days7: windowSummary(7), days15: windowSummary(15), days30: windowSummary(30) },
    },
    period: {
      ...period,
      daysRemaining: Math.max(daysBetween(period.today, period.end) + 1, 1),
    },
    budgetPlan: {
      periodKey: period.key,
      assigned: budgetTotal,
      spent: budgetSpent,
      remaining: Math.max(budgetTotal - budgetSpent, 0),
      unassigned: unassignedBudget,
      expectedIncome: expectedPeriodIncome,
      incomeReference,
      liquidBalance,
      fixedReserve,
      recurringReserve: recurringReserveExtra,
      liabilityReserve,
      protectedCommitments,
      savingsReserve,
      safeToSpend,
      dailySafeToSpend,
      daysForSafeSpend,
      safeUntil,
      safeUntilKind,
      nextPayday,
      upcomingCommitments,
      overdueCommitments,
      usingProfileFixedFallback,
      alerts: budgetAlerts,
      alertCount: budgetAlerts.length,
      configuredEnvelopes: normalizedCategories.filter((category) => category.hasPeriodBudget && category.periodLimit > 0).length,
      legacyEnvelopes: normalizedCategories.filter((category) => category.budgetIsLegacy).length,
    },
    summary: {
      totalBalance: primaryBalance,
      primaryBalance,
      primaryCurrency,
      currencyTotals,
      hasMixedCurrencies: Object.keys(currencyTotals).length > 1,
      monthlyIncome: primaryCashflow.income,
      monthlyExpenses: primaryCashflow.expenses,
      periodIncome: primaryCashflow.income,
      periodExpenses: primaryCashflow.expenses,
      cashflowByCurrency,
      budgetTotal,
      budgetSpent,
      budgetAvailable: Math.max(budgetTotal - budgetSpent, 0),
      safeToSpend,
      dailySafeToSpend,
      fixedReserve,
      recurringReserve: recurringReserveExtra,
      liabilityReserve,
      protectedCommitments,
      savingsReserve,
      liquidBalance,
      budgetAlertCount: budgetAlerts.length,
      creditUsedTotal,
      creditLimitTotal,
      creditAvailableTotal: Math.max(creditLimitTotal - creditUsedTotal, 0),
      debtBalanceTotal,
      liabilitiesTotal,
      monthlyDebtCommitment,
      goalReserves: goalReservesPrimary,
      netWorth,
      claraIndex,
    },
  };
}

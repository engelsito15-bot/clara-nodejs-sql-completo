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

function periodFixedExpenses(profile, period) {
  const amount = normalizeNumber(profile.fixedExpenses);
  return period.mode === "biweekly" ? Math.round(amount / 2) : amount;
}

export async function getFinanceData(database, userId) {
  const userSettings = await database.get(
    `SELECT u.currency_code AS currencyCode,
      COALESCE(p.planning_period, 'monthly') AS planningPeriod,
      COALESCE(p.income_type, '') AS incomeType,
      COALESCE(p.income_frequency, '') AS incomeFrequency,
      COALESCE(p.income_amount, 0) AS incomeAmount,
      COALESCE(p.fixed_expenses, 0) AS fixedExpenses,
      COALESCE(p.savings_target_percent, 10) AS savingsTargetPercent,
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
     WHERE COALESCE(c.is_active, 1) = 1
       AND (c.user_id IS NULL OR c.user_id = ?)
     ORDER BY CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END,
       COALESCE(c.parent_id, c.id), c.created_at, c.id`,
    [userId, userId],
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
    `SELECT id, name, target_amount AS targetAmount,
      current_amount AS currentAmount, due_date AS dueDate, color
     FROM goals
     WHERE user_id = ?
     ORDER BY created_at`,
    [userId],
  );

  const normalizedAccounts = accounts.map((account) => ({
    ...account,
    id: Number(account.id),
    balance: normalizeNumber(account.balance),
    currencyCode: String(account.currencyCode || primaryCurrency).toUpperCase(),
  }));

  const budgetMap = new Map(budgetRows.map((row) => [Number(row.categoryId), row]));
  const spendMap = new Map(spendRows.map((row) => [Number(row.categoryId), normalizeNumber(row.spent)]));

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

  const normalizedGoals = goals.map((goal) => ({
    ...goal,
    id: Number(goal.id),
    targetAmount: normalizeNumber(goal.targetAmount),
    currentAmount: normalizeNumber(goal.currentAmount),
    dueDate: dateText(goal.dueDate),
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
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses
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

  const targetSavingsReserve = Math.round(primaryCashflow.income * Math.max(0, Math.min(profile.savingsTargetPercent, 100)) / 100);
  const savingsReserve = Math.max(explicitSavingsReserve, targetSavingsReserve);
  const nonLiquidProducts = new Set(["certificate", "investment", "contribution"]);
  const liquidBalance = normalizedAccounts
    .filter((account) => account.currencyCode === primaryCurrency && !nonLiquidProducts.has(account.productType))
    .reduce((sum, account) => sum + account.balance, 0);
  const safeToSpend = Math.max(liquidBalance - fixedReserve - savingsReserve, 0);

  const nextPayday = paydayDetails(profile, period);
  let safeUntil = period.end;
  let safeUntilKind = "period";
  if (nextPayday?.date && nextPayday.date <= period.end) {
    safeUntil = nextPayday.date;
    safeUntilKind = "payday";
  }
  const daysForSafeSpend = Math.max(daysBetween(period.today, safeUntil) + 1, 1);
  const dailySafeToSpend = Math.floor(safeToSpend / daysForSafeSpend);
  const expectedPeriodIncome = expectedIncomeForPeriod(profile, period);
  const incomeReference = Math.max(primaryCashflow.income, expectedPeriodIncome);
  const unassignedBudget = Math.max(incomeReference - budgetTotal, 0);

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
      savingsReserve,
      safeToSpend,
      dailySafeToSpend,
      daysForSafeSpend,
      safeUntil,
      safeUntilKind,
      nextPayday,
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
      savingsReserve,
      liquidBalance,
      budgetAlertCount: budgetAlerts.length,
    },
  };
}

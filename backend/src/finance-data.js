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

export async function getFinanceData(database, userId) {
  const userSettings = await database.get(
    `SELECT u.currency_code AS currencyCode,
      COALESCE(p.planning_period, 'monthly') AS planningPeriod
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = ?`,
    [userId],
  );
  const primaryCurrency = String(userSettings?.currencyCode || "DOP").toUpperCase();
  const planningPeriod = userSettings?.planningPeriod === "biweekly" ? "biweekly" : "monthly";
  const period = currentPeriod(planningPeriod);

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

  const categories = await database.all(
    `SELECT c.id,
      COALESCE(NULLIF(c.display_name, ''), c.name) AS name,
      c.symbol,
      COALESCE(b.monthly_limit, 0) AS monthlyLimit,
      c.color,
      c.parent_id AS parentId,
      parent.display_name AS parentDisplayName,
      c.user_id AS ownerUserId,
      COALESCE(c.is_system, 0) AS isSystem,
      COALESCE(SUM(CASE
        WHEN t.type = 'expense'
         AND t.transaction_date BETWEEN ? AND ?
         AND COALESCE(t.currency_code, ?) = ? THEN t.amount
        ELSE 0
      END), 0) AS spent
     FROM categories c
     LEFT JOIN categories parent ON parent.id = c.parent_id
     LEFT JOIN budgets b ON b.category_id = c.id AND b.user_id = ?
     LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = ?
     WHERE COALESCE(c.is_active, 1) = 1
       AND (c.user_id IS NULL OR c.user_id = ?)
     GROUP BY c.id, c.name, c.display_name, c.symbol, b.monthly_limit, c.color,
       c.parent_id, parent.display_name, parent.name, c.user_id, c.is_system, c.created_at
     ORDER BY CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END,
       COALESCE(c.parent_id, c.id), c.created_at, c.id`,
    [period.start, period.end, primaryCurrency, primaryCurrency, userId, userId, userId],
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

  const normalizedCategories = categories.map((category) => ({
    ...category,
    id: Number(category.id),
    parentId: category.parentId ? Number(category.parentId) : null,
    ownerUserId: category.ownerUserId ? Number(category.ownerUserId) : null,
    isSystem: Boolean(Number(category.isSystem || 0)),
    monthlyLimit: normalizeNumber(category.monthlyLimit),
    periodLimit: planningPeriod === "biweekly" ? Math.round(normalizeNumber(category.monthlyLimit) / 2) : normalizeNumber(category.monthlyLimit),
    spent: normalizeNumber(category.spent),
  }));

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

  const budgetTotal = normalizedCategories.reduce((sum, category) => sum + category.periodLimit, 0);
  const budgetSpent = normalizedCategories.reduce((sum, category) => sum + category.spent, 0);

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
    period,
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
      budgetAvailable: Math.max(budgetTotal - budgetSpent, 0),
    },
  };
}

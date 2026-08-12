function monthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeNumber(value) {
  return Number(value || 0);
}

export async function getFinanceData(database, userId) {
  const month = monthKey();
  const accounts = await database.all(
    `SELECT id, name, kind, balance, color
     FROM accounts
     WHERE user_id = ?
     ORDER BY CASE kind WHEN 'bank' THEN 1 WHEN 'savings' THEN 2 ELSE 3 END, created_at`,
    [userId],
  );

  const categories = await database.all(
    `SELECT c.id, c.name, c.symbol,
      COALESCE(b.monthly_limit, 0) AS monthlyLimit,
      c.color,
      COALESCE(SUM(CASE
        WHEN t.type = 'expense' AND substr(t.transaction_date, 1, 7) = ? THEN t.amount
        ELSE 0
      END), 0) AS spent
     FROM categories c
     LEFT JOIN budgets b ON b.category_id = c.id AND b.user_id = ?
     LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = ?
     GROUP BY c.id, c.name, c.symbol, b.monthly_limit, c.color, c.created_at
     ORDER BY c.created_at`,
    [month, userId, userId],
  );

  const transactions = await database.all(
    `SELECT t.id, t.type, t.description, t.amount,
      t.account_id AS accountId,
      t.destination_account_id AS destinationAccountId,
      t.category_id AS categoryId,
      t.transaction_date AS transactionDate,
      t.note,
      a.name AS accountName,
      destination.name AS destinationAccountName,
      c.name AS categoryName,
      c.symbol AS categorySymbol,
      c.color AS categoryColor
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id AND a.user_id = t.user_id
     LEFT JOIN accounts destination ON destination.id = t.destination_account_id AND destination.user_id = t.user_id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ?
     ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC
     LIMIT 150`,
    [userId],
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
  }));
  const normalizedCategories = categories.map((category) => ({
    ...category,
    id: Number(category.id),
    monthlyLimit: normalizeNumber(category.monthlyLimit),
    spent: normalizeNumber(category.spent),
  }));
  const normalizedTransactions = transactions.map((transaction) => ({
    ...transaction,
    id: Number(transaction.id),
    amount: normalizeNumber(transaction.amount),
    accountId: Number(transaction.accountId),
    destinationAccountId: transaction.destinationAccountId ? Number(transaction.destinationAccountId) : null,
    categoryId: transaction.categoryId ? Number(transaction.categoryId) : null,
    transactionDate:
      transaction.transactionDate instanceof Date
        ? transaction.transactionDate.toISOString().slice(0, 10)
        : String(transaction.transactionDate).slice(0, 10),
  }));
  const normalizedGoals = goals.map((goal) => ({
    ...goal,
    id: Number(goal.id),
    targetAmount: normalizeNumber(goal.targetAmount),
    currentAmount: normalizeNumber(goal.currentAmount),
    dueDate: goal.dueDate instanceof Date ? goal.dueDate.toISOString().slice(0, 10) : String(goal.dueDate).slice(0, 10),
  }));

  const totalBalance = normalizedAccounts.reduce((sum, account) => sum + account.balance, 0);
  const cashflow = await database.get(
    `SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS monthlyIncome,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS monthlyExpenses
     FROM transactions
     WHERE user_id = ? AND substr(transaction_date, 1, 7) = ?`,
    [userId, month],
  );
  const budgetTotal = normalizedCategories.reduce((sum, category) => sum + category.monthlyLimit, 0);
  const budgetSpent = normalizedCategories.reduce((sum, category) => sum + category.spent, 0);

  return {
    accounts: normalizedAccounts,
    categories: normalizedCategories,
    transactions: normalizedTransactions,
    goals: normalizedGoals,
    summary: {
      totalBalance,
      monthlyIncome: normalizeNumber(cashflow?.monthlyIncome),
      monthlyExpenses: normalizeNumber(cashflow?.monthlyExpenses),
      budgetTotal,
      budgetAvailable: Math.max(budgetTotal - budgetSpent, 0),
    },
  };
}

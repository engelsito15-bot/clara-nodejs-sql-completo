import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  authStatus,
  authenticatedUser,
  bearerToken,
  loginUser,
  logoutUser,
  requireAuth,
  registerUser,
  updateCurrency,
  completeOnboarding,
  updateFinancialProfile,
} from "./auth.js";
import { createDatabase, runInTransaction } from "./database.js";
import {
  emailVerificationStatus,
  sendEmailVerificationCode,
  verifyEmailCode,
} from "./email-verification.js";
import { getFinanceData } from "./finance-data.js";
import {
  pwaPublicConfig,
  pushStatus,
  savePushSubscription,
  removePushSubscription,
  sendWelcomeNotification,
  sendUserNotification,
  runFinancialReminders,
} from "./pwa.js";
import {
  getMailSyncState,
  updateMailSyncSettings,
  createMailSyncSource,
  deleteMailSyncSource,
  ingestMailSyncMessage,
  confirmMailSyncMessage,
  ignoreMailSyncMessage,
} from "./mail-sync.js";
import {
  createTransaction as engineCreateTransaction,
  createTransfer as engineCreateTransfer,
  updateBudget as engineUpdateBudget,
  deleteBudgetForPeriod as engineDeleteBudgetForPeriod,
  copyPreviousBudget as engineCopyPreviousBudget,
  createRecurringPayment as engineCreateRecurringPayment,
  updateRecurringPayment as engineUpdateRecurringPayment,
  deleteRecurringPayment as engineDeleteRecurringPayment,
  markRecurringPaymentPaid as engineMarkRecurringPaymentPaid,
  createGoal as engineCreateGoal,
  updateGoal as engineUpdateGoal,
  deleteGoal as engineDeleteGoal,
  contributeToGoal as engineContributeToGoal,
  createAccount as engineCreateAccount,
  updateAccount as engineUpdateAccount,
  deleteAccount as engineDeleteAccount,
  createCategory as engineCreateCategory,
  updateCategory as engineUpdateCategory,
  deleteCategory as engineDeleteCategory,
  createCreditCard as engineCreateCreditCard,
  createCreditCardConsumption as engineCreateCreditCardConsumption,
  updateCreditCard as engineUpdateCreditCard,
  deleteCreditCard as engineDeleteCreditCard,
  payCreditCard as enginePayCreditCard,
  createDebt as engineCreateDebt,
  updateDebt as engineUpdateDebt,
  deleteDebt as engineDeleteDebt,
  payDebt as enginePayDebt,
  restoreSystemCategories as engineRestoreSystemCategories,
} from "./finance-engine.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const frontendBuild = join(currentDirectory, "..", "..", "frontend", "dist");

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

async function accountById(database, id, userId) {
  return database.get(
    "SELECT id, name, balance FROM accounts WHERE id = ? AND user_id = ? AND COALESCE(is_archived, 0) = 0",
    [id, userId],
  );
}

async function createTransaction(database, userId, payload) {
  const type = payload.type === "income" ? "income" : "expense";
  const amount = amountInCents(payload.amount);
  const accountId = integerId(payload.accountId);
  const categoryId = payload.categoryId ? integerId(payload.categoryId) : null;
  const description = String(payload.description || "").trim();

  if (!amount || !accountId || !description) throw requestError("Completa la cuenta, el concepto y un monto válido.");
  if (type === "expense" && !categoryId) throw requestError("Selecciona una categoría para el gasto.");

  await runInTransaction(database, async (transaction) => {
    const account = await accountById(transaction, accountId, userId);
    if (!account) throw requestError("La cuenta seleccionada no existe.", 404);
    if (type === "expense" && Number(account.balance) < amount) {
      throw requestError("La cuenta no tiene saldo suficiente.");
    }

    const difference = type === "income" ? amount : -amount;
    await transaction.run("UPDATE accounts SET balance = balance + ? WHERE id = ?", [difference, accountId]);
    await transaction.run(
      `INSERT INTO transactions
        (user_id, type, description, amount, account_id, category_id, transaction_date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        type,
        description,
        amount,
        accountId,
        type === "expense" ? categoryId : null,
        validDate(payload.transactionDate),
        String(payload.note || "").trim(),
      ],
    );
  });
}

async function createTransfer(database, userId, payload) {
  const amount = amountInCents(payload.amount);
  const sourceId = integerId(payload.accountId);
  const destinationId = integerId(payload.destinationAccountId);
  if (!amount || !sourceId || !destinationId || sourceId === destinationId) {
    throw requestError("Selecciona dos cuentas distintas y un monto válido.");
  }

  await runInTransaction(database, async (transaction) => {
    const source = await accountById(transaction, sourceId, userId);
    const destination = await accountById(transaction, destinationId, userId);
    if (!source || !destination) throw requestError("Una de las cuentas no existe.", 404);
    if (Number(source.balance) < amount) throw requestError("La cuenta de origen no tiene saldo suficiente.");

    await transaction.run("UPDATE accounts SET balance = balance - ? WHERE id = ?", [amount, sourceId]);
    await transaction.run("UPDATE accounts SET balance = balance + ? WHERE id = ?", [amount, destinationId]);
    await transaction.run(
      `INSERT INTO transactions
        (user_id, type, description, amount, account_id, destination_account_id, transaction_date, note)
       VALUES (?, 'transfer', ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        `Transferencia a ${destination.name}`,
        amount,
        sourceId,
        destinationId,
        validDate(payload.transactionDate),
        String(payload.note || "").trim(),
      ],
    );
  });
}

async function updateBudget(database, userId, payload) {
  const categoryId = integerId(payload.categoryId);
  const monthlyLimit = amountInCents(payload.monthlyLimit, true);
  if (!categoryId || monthlyLimit === null) throw requestError("Ingresa un presupuesto válido.");
  const category = await database.get("SELECT id FROM categories WHERE id = ?", [categoryId]);
  if (!category) throw requestError("La categoría no existe.", 404);
  const existing = await database.get("SELECT user_id FROM budgets WHERE user_id = ? AND category_id = ?", [userId, categoryId]);
  if (existing) {
    await database.run("UPDATE budgets SET monthly_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND category_id = ?", [monthlyLimit, userId, categoryId]);
  } else {
    await database.run("INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES (?, ?, ?)", [userId, categoryId, monthlyLimit]);
  }
}

async function createGoal(database, userId, payload) {
  const targetAmount = amountInCents(payload.targetAmount);
  const name = String(payload.name || "").trim();
  if (!targetAmount || !name || !payload.dueDate) throw requestError("Completa el nombre, el monto y la fecha de la meta.");
  await database.run(
    "INSERT INTO goals (user_id, name, target_amount, current_amount, due_date, color) VALUES (?, ?, ?, 0, ?, 'coral')",
    [userId, name, targetAmount, validDate(payload.dueDate)],
  );
}

async function contributeToGoal(database, userId, payload) {
  const goalId = integerId(payload.goalId);
  const accountId = integerId(payload.accountId);
  const amount = amountInCents(payload.amount);
  if (!goalId || !accountId || !amount) throw requestError("Selecciona una meta, una cuenta y un monto.");

  await runInTransaction(database, async (transaction) => {
    const goal = await transaction.get(
      "SELECT id, name, target_amount AS targetAmount, current_amount AS currentAmount FROM goals WHERE id = ? AND user_id = ?",
      [goalId, userId],
    );
    const account = await accountById(transaction, accountId, userId);
    if (!goal || !account) throw requestError("La meta o la cuenta no existe.", 404);
    if (Number(account.balance) < amount) throw requestError("La cuenta no tiene saldo suficiente.");
    if (Number(goal.currentAmount) + amount > Number(goal.targetAmount)) {
      throw requestError("El aporte supera lo que falta para completar la meta.");
    }

    await transaction.run("UPDATE accounts SET balance = balance - ? WHERE id = ?", [amount, accountId]);
    await transaction.run("UPDATE goals SET current_amount = current_amount + ? WHERE id = ?", [amount, goalId]);
    await transaction.run(
      `INSERT INTO transactions
        (user_id, type, description, amount, account_id, transaction_date, note)
       VALUES (?, 'expense', ?, ?, ?, ?, ?)`,
      [userId, `Aporte: ${goal.name}`, amount, accountId, validDate(), "Ahorro reservado para una meta"],
    );
  });
}

const ACCOUNT_PRODUCTS = new Set(["payroll", "savings", "checking", "certificate", "contribution", "wallet", "investment", "cash", "other"]);
const INSTITUTION_TYPES = new Set(["bank", "cooperative", "association", "wallet", "cash", "investment", "other"]);

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
  const productType = ACCOUNT_PRODUCTS.has(payload.productType) ? payload.productType : (payload.kind === "cash" ? "cash" : payload.kind === "savings" ? "savings" : "other");
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

async function recordBalanceAdjustment(database, userId, accountId, previousBalance, newBalance, reason) {
  if (Number(previousBalance) === Number(newBalance)) return;
  await database.run(
    `INSERT INTO account_balance_adjustments
      (user_id, account_id, previous_balance, new_balance, reason)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, accountId, previousBalance, newBalance, String(reason || "Ajuste manual de saldo").trim().slice(0, 240)],
  );
}

async function createAccount(database, userId, payload) {
  const balance = amountInCents(payload.amount ?? 0, true);
  const details = accountDetails(payload);
  if (!details.name || balance === null) throw requestError("Completa los datos de la cuenta y escribe un saldo válido.");

  await runInTransaction(database, async (transaction) => {
    const result = await transaction.run(
      `INSERT INTO accounts
        (user_id, name, kind, balance, color, institution_type, institution_name, product_type, nickname)
       VALUES (?, ?, ?, ?, 'sky', ?, ?, ?, ?)`,
      [userId, details.name, details.kind, balance, details.institutionType, details.institutionName, details.productType, details.nickname],
    );
    if (balance > 0) {
      await recordBalanceAdjustment(transaction, userId, result.insertId, 0, balance, "Saldo inicial declarado");
    }
  });
}

async function updateAccount(database, userId, payload) {
  const accountId = integerId(payload.accountId);
  const balance = amountInCents(payload.amount ?? 0, true);
  const details = accountDetails(payload);
  if (!accountId || !details.name || balance === null) throw requestError("Ingresa los datos válidos de la cuenta.");

  await runInTransaction(database, async (transaction) => {
    const account = await transaction.get(
      "SELECT id, balance FROM accounts WHERE id = ? AND user_id = ?",
      [accountId, userId],
    );
    if (!account) throw requestError("La cuenta no existe o no pertenece a tu perfil.", 404);

    await transaction.run(
      `UPDATE accounts
       SET name = ?, kind = ?, balance = ?, institution_type = ?, institution_name = ?, product_type = ?, nickname = ?
       WHERE id = ? AND user_id = ?`,
      [details.name, details.kind, balance, details.institutionType, details.institutionName, details.productType, details.nickname, accountId, userId],
    );
    await recordBalanceAdjustment(
      transaction, userId, accountId, Number(account.balance), balance,
      payload.balanceReason || "Saldo actual declarado por el usuario",
    );
  });
}

async function deleteAccount(database, userId, payload) {
  const accountId = integerId(payload.accountId);
  if (!accountId) throw requestError("Selecciona una cuenta válida.");

  const account = await database.get(
    "SELECT id, name, balance FROM accounts WHERE id = ? AND user_id = ? AND COALESCE(is_archived, 0) = 0",
    [accountId, userId],
  );
  if (!account) throw requestError("La cuenta no existe o no pertenece a tu perfil.", 404);
  if (Number(account.balance) !== 0) {
    throw requestError("Para eliminar una cuenta, primero debe quedar con saldo 0.");
  }

  const count = await database.get(
    "SELECT COUNT(*) AS total FROM accounts WHERE user_id = ? AND COALESCE(is_archived, 0) = 0",
    [userId],
  );
  if (Number(count?.total || 0) <= 1) {
    throw requestError("Debes conservar al menos una cuenta activa en tu perfil.");
  }

  const history = await database.get(
    "SELECT COUNT(*) AS total FROM transactions WHERE user_id = ? AND (account_id = ? OR destination_account_id = ?)",
    [userId, accountId, accountId],
  );

  if (Number(history?.total || 0) > 0) {
    await database.run(
      "UPDATE accounts SET is_archived = 1 WHERE id = ? AND user_id = ?",
      [accountId, userId],
    );
    return;
  }

  await database.run("DELETE FROM accounts WHERE id = ? AND user_id = ?", [accountId, userId]);
}

function createRequestLimiter({ windowMs, maxAttempts, keyForRequest, message }) {
  const attempts = new Map();
  return (request, response, next) => {
    const now = Date.now();
    const key = keyForRequest(request);
    const current = attempts.get(key);
    if (!current || now > current.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > maxAttempts) {
      response.status(429).json({ error: message });
      return;
    }
    next();
  };
}

function requestIp(request) {
  return request.ip || request.socket.remoteAddress || "unknown";
}

function createLoginLimiter() {
  return createRequestLimiter({
    windowMs: 15 * 60 * 1000,
    maxAttempts: 8,
    keyForRequest: (request) => `${requestIp(request)}:${String(request.body?.identifier || request.body?.email || request.body?.username || "").trim().toLowerCase() || "anonymous"}`,
    message: "Demasiados intentos para ese usuario. Espera unos minutos antes de volver a intentar.",
  });
}

function createRegistrationLimiter() {
  return createRequestLimiter({
    windowMs: 60 * 60 * 1000,
    maxAttempts: 10,
    keyForRequest: (request) => requestIp(request),
    message: "Se alcanzó el límite temporal de registros desde esta conexión. Intenta más tarde.",
  });
}

export function createApp({ databasePath } = {}) {
  const app = express();
  const database = createDatabase(databasePath);
  const protect = requireAuth(database);
  const limitLogin = createLoginLimiter();
  const limitRegistration = createRegistrationLimiter();
  app.locals.database = database;

  const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
    : true;
  app.use(cors({ origin: configuredOrigins }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", async (_request, response, next) => {
    try {
      await database.ping();
      response.json({ status: "ok", database: database.provider });
    } catch (error) {
      next(error);
    }
  });


  app.get("/api/pwa/config", (_request, response) => {
    response.json(pwaPublicConfig());
  });

  app.get("/api/pwa/status", protect, async (request, response, next) => {
    try {
      response.json(await pushStatus(database, request.auth.user.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/pwa/subscribe", protect, async (request, response, next) => {
    try {
      const result = await savePushSubscription(database, request.auth.user.id, request.body || {}, request.get("user-agent") || "");
      await sendWelcomeNotification(database, request.auth.user.id);
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/pwa/subscribe", protect, async (request, response, next) => {
    try {
      response.json(await removePushSubscription(database, request.auth.user.id, request.body?.endpoint));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/pwa/test", protect, async (request, response, next) => {
    try {
      const result = await sendUserNotification(database, request.auth.user.id, {
        title: "Notificación de prueba",
        body: "Clara puede avisarte de compromisos, pagos y fechas importantes.",
        url: "/?view=calendario",
        tag: "clara-push-test",
        badge: 1,
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/pwa/reminders/run", async (request, response, next) => {
    try {
      const expected = String(process.env.PWA_CRON_SECRET || "").trim();
      const received = String(request.get("x-clara-cron-secret") || request.query?.secret || "").trim();
      if (!expected || !received || expected !== received) {
        response.status(401).json({ error: "No autorizado." });
        return;
      }
      response.json(await runFinancialReminders(database));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/status", async (_request, response, next) => {
    try {
      response.json(await authStatus());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/register", limitRegistration, async (request, response, next) => {
    try {
      if (!emailVerificationStatus().configured) {
        throw requestError("La verificación por correo todavía no está configurada. Inténtalo nuevamente en unos minutos.", 503);
      }
      const created = await registerUser(database, request.body || {});
      try {
        const verification = await sendEmailVerificationCode(database, created.user.id, { force: true });
        response.status(201).json({ ...created, verification });
      } catch (error) {
        await database.run("DELETE FROM users WHERE id = ?", [created.user.id]).catch(() => {});
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", limitLogin, async (request, response, next) => {
    try {
      response.json(await loginUser(database, request.body || {}));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/me", async (request, response, next) => {
    try {
      const user = await authenticatedUser(database, bearerToken(request));
      if (!user) {
        response.status(401).json({ error: "Tu sesión venció o no has iniciado sesión." });
        return;
      }
      response.json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/email-verification/status", protect, async (request, response, next) => {
    try {
      response.json({
        configured: emailVerificationStatus().configured,
        email: request.auth.user.email || "",
        verified: Boolean(request.auth.user.emailVerified),
      });
    } catch (error) { next(error); }
  });

  app.post("/api/auth/email-verification/send", protect, async (request, response, next) => {
    try {
      response.json(await sendEmailVerificationCode(database, request.auth.user.id));
    } catch (error) { next(error); }
  });

  app.post("/api/auth/email-verification/verify", protect, async (request, response, next) => {
    try {
      await verifyEmailCode(database, request.auth.user.id, request.body?.code);
      const user = await authenticatedUser(database, bearerToken(request));
      response.json({ verified: true, user });
    } catch (error) { next(error); }
  });

  app.post("/api/auth/logout", protect, async (request, response, next) => {
    try {
      await logoutUser(database, request.auth.token);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });


  app.post("/api/profile/onboarding", protect, async (request, response, next) => {
    try {
      const user = await completeOnboarding(database, request.auth.user.id, request.body || {});
      response.json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/profile", protect, async (request, response, next) => {
    try {
      const user = await updateFinancialProfile(database, request.auth.user.id, request.body || {});
      response.json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/settings", protect, async (request, response, next) => {
    try {
      let user = request.auth.user;
      const requestedEmail = request.body?.email === undefined ? undefined : String(request.body.email || "").trim().toLowerCase();
      const emailChanged = requestedEmail !== undefined && requestedEmail !== String(request.auth.user.email || "").trim().toLowerCase();
      if (emailChanged && !emailVerificationStatus().configured) {
        throw requestError("La verificación por correo todavía no está configurada. No cambiamos tu correo.", 503);
      }
      if (request.body?.currencyCode) {
        user = await updateCurrency(database, request.auth.user.id, request.body.currencyCode);
      }
      if (
        request.body?.phone !== undefined ||
        request.body?.firstName !== undefined ||
        request.body?.lastName !== undefined ||
        request.body?.email !== undefined
      ) {
        user = await updateFinancialProfile(database, request.auth.user.id, {
          phone: request.body.phone,
          firstName: request.body.firstName,
          lastName: request.body.lastName,
          email: request.body.email,
        });
      }
      let verification = null;
      if (emailChanged && user?.email && !user.emailVerified) {
        verification = await sendEmailVerificationCode(database, request.auth.user.id, { force: true });
      }
      response.json({ user, verification });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/mail-sync", protect, async (request, response, next) => {
    try { response.json({ mailSync: await getMailSyncState(database, request.auth.user.id) }); }
    catch (error) { next(error); }
  });

  app.patch("/api/mail-sync", protect, async (request, response, next) => {
    try { response.json({ mailSync: await updateMailSyncSettings(database, request.auth.user.id, request.body || {}) }); }
    catch (error) { next(error); }
  });

  app.post("/api/mail-sync/sources", protect, async (request, response, next) => {
    try { response.status(201).json({ mailSync: await createMailSyncSource(database, request.auth.user.id, request.body || {}) }); }
    catch (error) { next(error); }
  });

  app.delete("/api/mail-sync/sources/:id", protect, async (request, response, next) => {
    try { response.json({ mailSync: await deleteMailSyncSource(database, request.auth.user.id, request.params.id) }); }
    catch (error) { next(error); }
  });

  app.post("/api/mail-sync/messages/:id/confirm", protect, async (request, response, next) => {
    try { response.json({ mailSync: await confirmMailSyncMessage(database, request.auth.user.id, request.params.id, request.body || {}) }); }
    catch (error) { next(error); }
  });

  app.post("/api/mail-sync/messages/:id/ignore", protect, async (request, response, next) => {
    try { response.json({ mailSync: await ignoreMailSyncMessage(database, request.auth.user.id, request.params.id) }); }
    catch (error) { next(error); }
  });

  app.post("/api/mail-sync/inbound", async (request, response, next) => {
    try {
      const result = await ingestMailSyncMessage(database, request.headers, request.body || {});
      response.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) { next(error); }
  });

  app.get("/api/finance", protect, async (request, response, next) => {
    try {
      response.json({ data: await getFinanceData(database, request.auth.user.id) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/finance", protect, async (request, response, next) => {
    try {
      const payload = request.body || {};
      const userId = request.auth.user.id;
      switch (payload.action) {
        case "transaction":
          await engineCreateTransaction(database, userId, payload);
          break;
        case "transfer":
          await engineCreateTransfer(database, userId, payload);
          break;
        case "budget":
          await engineUpdateBudget(database, userId, payload);
          break;
        case "budget-delete":
          await engineDeleteBudgetForPeriod(database, userId, payload);
          break;
        case "budget-copy":
          await engineCopyPreviousBudget(database, userId);
          break;
        case "recurring":
          await engineCreateRecurringPayment(database, userId, payload);
          break;
        case "recurring-update":
          await engineUpdateRecurringPayment(database, userId, payload);
          break;
        case "recurring-delete":
          await engineDeleteRecurringPayment(database, userId, payload);
          break;
        case "recurring-paid":
          await engineMarkRecurringPaymentPaid(database, userId, payload);
          break;
        case "goal":
          await engineCreateGoal(database, userId, payload);
          break;
        case "goal-update":
          await engineUpdateGoal(database, userId, payload);
          break;
        case "goal-delete":
          await engineDeleteGoal(database, userId, payload);
          break;
        case "goal-contribution":
          await engineContributeToGoal(database, userId, payload);
          break;
        case "account":
          await engineCreateAccount(database, userId, payload);
          break;
        case "account-update":
          await engineUpdateAccount(database, userId, payload);
          break;
        case "account-delete":
          await engineDeleteAccount(database, userId, payload);
          break;
        case "category":
          await engineCreateCategory(database, userId, payload);
          break;
        case "category-update":
          await engineUpdateCategory(database, userId, payload);
          break;
        case "category-delete":
          await engineDeleteCategory(database, userId, payload);
          break;
        case "category-restore":
          await engineRestoreSystemCategories(database, userId);
          break;
        case "credit-card":
          await engineCreateCreditCard(database, userId, payload);
          break;
        case "credit-card-consumption":
          await engineCreateCreditCardConsumption(database, userId, payload);
          break;
        case "credit-card-update":
          await engineUpdateCreditCard(database, userId, payload);
          break;
        case "credit-card-delete":
          await engineDeleteCreditCard(database, userId, payload);
          break;
        case "credit-card-payment":
          await enginePayCreditCard(database, userId, payload);
          break;
        case "debt":
          await engineCreateDebt(database, userId, payload);
          break;
        case "debt-update":
          await engineUpdateDebt(database, userId, payload);
          break;
        case "debt-delete":
          await engineDeleteDebt(database, userId, payload);
          break;
        case "debt-payment":
          await enginePayDebt(database, userId, payload);
          break;
        default:
          throw requestError("Operación no reconocida.");
      }
      const successStatus = ["account-update", "category-update", "recurring-update", "recurring-paid", "budget-delete", "recurring-delete", "category-delete", "category-restore", "credit-card-update", "credit-card-delete", "credit-card-payment", "debt-update", "debt-delete", "debt-payment"].includes(payload.action) ? 200 : 201;
      response.status(successStatus).json({ data: await getFinanceData(database, userId) });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "Ruta de API no encontrada." });
  });

  if (existsSync(frontendBuild)) {
    app.use(express.static(frontendBuild));
    app.use((request, response, next) => {
      if (request.method === "GET" && request.accepts("html")) {
        response.sendFile(join(frontendBuild, "index.html"));
        return;
      }
      next();
    });
  }

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(error.status || 500).json({
      error: error.status ? error.message : "No se pudo completar la operación.",
    });
  });

  return app;
}

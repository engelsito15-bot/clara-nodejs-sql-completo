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
  setupFirstUser,
  updateCurrency,
} from "./auth.js";
import { createDatabase, runInTransaction } from "./database.js";
import { getFinanceData } from "./finance-data.js";

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

async function accountById(database, id) {
  return database.get("SELECT id, name, balance FROM accounts WHERE id = ?", [id]);
}

async function createTransaction(database, payload) {
  const type = payload.type === "income" ? "income" : "expense";
  const amount = amountInCents(payload.amount);
  const accountId = integerId(payload.accountId);
  const categoryId = payload.categoryId ? integerId(payload.categoryId) : null;
  const description = String(payload.description || "").trim();

  if (!amount || !accountId || !description) throw requestError("Completa la cuenta, el concepto y un monto válido.");
  if (type === "expense" && !categoryId) throw requestError("Selecciona una categoría para el gasto.");

  await runInTransaction(database, async (transaction) => {
    const account = await accountById(transaction, accountId);
    if (!account) throw requestError("La cuenta seleccionada no existe.", 404);
    if (type === "expense" && Number(account.balance) < amount) {
      throw requestError("La cuenta no tiene saldo suficiente.");
    }

    const difference = type === "income" ? amount : -amount;
    await transaction.run("UPDATE accounts SET balance = balance + ? WHERE id = ?", [difference, accountId]);
    await transaction.run(
      `INSERT INTO transactions
        (type, description, amount, account_id, category_id, transaction_date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
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

async function createTransfer(database, payload) {
  const amount = amountInCents(payload.amount);
  const sourceId = integerId(payload.accountId);
  const destinationId = integerId(payload.destinationAccountId);
  if (!amount || !sourceId || !destinationId || sourceId === destinationId) {
    throw requestError("Selecciona dos cuentas distintas y un monto válido.");
  }

  await runInTransaction(database, async (transaction) => {
    const source = await accountById(transaction, sourceId);
    const destination = await accountById(transaction, destinationId);
    if (!source || !destination) throw requestError("Una de las cuentas no existe.", 404);
    if (Number(source.balance) < amount) throw requestError("La cuenta de origen no tiene saldo suficiente.");

    await transaction.run("UPDATE accounts SET balance = balance - ? WHERE id = ?", [amount, sourceId]);
    await transaction.run("UPDATE accounts SET balance = balance + ? WHERE id = ?", [amount, destinationId]);
    await transaction.run(
      `INSERT INTO transactions
        (type, description, amount, account_id, destination_account_id, transaction_date, note)
       VALUES ('transfer', ?, ?, ?, ?, ?, ?)`,
      [
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

async function updateBudget(database, payload) {
  const categoryId = integerId(payload.categoryId);
  const monthlyLimit = amountInCents(payload.monthlyLimit, true);
  if (!categoryId || monthlyLimit === null) throw requestError("Ingresa un presupuesto válido.");
  const result = await database.run("UPDATE categories SET monthly_limit = ? WHERE id = ?", [monthlyLimit, categoryId]);
  if (!result.changes) throw requestError("La categoría no existe.", 404);
}

async function createGoal(database, payload) {
  const targetAmount = amountInCents(payload.targetAmount);
  const name = String(payload.name || "").trim();
  if (!targetAmount || !name || !payload.dueDate) throw requestError("Completa el nombre, el monto y la fecha de la meta.");
  await database.run(
    "INSERT INTO goals (name, target_amount, current_amount, due_date, color) VALUES (?, ?, 0, ?, 'coral')",
    [name, targetAmount, validDate(payload.dueDate)],
  );
}

async function contributeToGoal(database, payload) {
  const goalId = integerId(payload.goalId);
  const accountId = integerId(payload.accountId);
  const amount = amountInCents(payload.amount);
  if (!goalId || !accountId || !amount) throw requestError("Selecciona una meta, una cuenta y un monto.");

  await runInTransaction(database, async (transaction) => {
    const goal = await transaction.get(
      "SELECT id, name, target_amount AS targetAmount, current_amount AS currentAmount FROM goals WHERE id = ?",
      [goalId],
    );
    const account = await accountById(transaction, accountId);
    if (!goal || !account) throw requestError("La meta o la cuenta no existe.", 404);
    if (Number(account.balance) < amount) throw requestError("La cuenta no tiene saldo suficiente.");
    if (Number(goal.currentAmount) + amount > Number(goal.targetAmount)) {
      throw requestError("El aporte supera lo que falta para completar la meta.");
    }

    await transaction.run("UPDATE accounts SET balance = balance - ? WHERE id = ?", [amount, accountId]);
    await transaction.run("UPDATE goals SET current_amount = current_amount + ? WHERE id = ?", [amount, goalId]);
    await transaction.run(
      `INSERT INTO transactions
        (type, description, amount, account_id, transaction_date, note)
       VALUES ('expense', ?, ?, ?, ?, ?)`,
      [`Aporte: ${goal.name}`, amount, accountId, validDate(), "Ahorro reservado para una meta"],
    );
  });
}

async function createAccount(database, payload) {
  const name = String(payload.name || "").trim();
  const balance = amountInCents(payload.amount ?? 0, true);
  const allowedKinds = new Set(["bank", "savings", "cash"]);
  const kind = allowedKinds.has(payload.kind) ? payload.kind : "bank";
  if (!name || balance === null) throw requestError("Ingresa un nombre y un saldo válido.");
  await database.run("INSERT INTO accounts (name, kind, balance, color) VALUES (?, ?, ?, 'sky')", [name, kind, balance]);
}

function createLoginLimiter() {
  const attempts = new Map();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 8;
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || "unknown";
    const current = attempts.get(key);
    if (!current || now > current.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > maxAttempts) {
      response.status(429).json({ error: "Demasiados intentos. Espera unos minutos antes de volver a intentar." });
      return;
    }
    next();
  };
}

export function createApp({ databasePath } = {}) {
  const app = express();
  const database = createDatabase(databasePath);
  const protect = requireAuth(database);
  const limitLogin = createLoginLimiter();
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

  app.get("/api/auth/status", async (_request, response, next) => {
    try {
      response.json(await authStatus(database));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/setup", limitLogin, async (request, response, next) => {
    try {
      response.status(201).json(await setupFirstUser(database, request.body || {}));
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

  app.post("/api/auth/logout", protect, async (request, response, next) => {
    try {
      await logoutUser(database, request.auth.token);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/settings", protect, async (request, response, next) => {
    try {
      const user = await updateCurrency(database, request.auth.user.id, request.body?.currencyCode);
      response.json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/finance", protect, async (_request, response, next) => {
    try {
      response.json({ data: await getFinanceData(database) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/finance", protect, async (request, response, next) => {
    try {
      const payload = request.body || {};
      switch (payload.action) {
        case "transaction":
          await createTransaction(database, payload);
          break;
        case "transfer":
          await createTransfer(database, payload);
          break;
        case "budget":
          await updateBudget(database, payload);
          break;
        case "goal":
          await createGoal(database, payload);
          break;
        case "goal-contribution":
          await contributeToGoal(database, payload);
          break;
        case "account":
          await createAccount(database, payload);
          break;
        default:
          throw requestError("Operación no reconocida.");
      }
      response.status(201).json({ data: await getFinanceData(database) });
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

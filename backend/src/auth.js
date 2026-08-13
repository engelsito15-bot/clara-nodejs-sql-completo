import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_DAYS = 30;
const PASSWORD_BYTES = 64;

export const SUPPORTED_CURRENCIES = new Set(["DOP", "USD", "EUR", "GBP", "MXN", "COP", "PEN", "BOB"]);
const INCOME_TYPES = new Set(["fixed", "variable", "mixed", "irregular"]);
const INCOME_FREQUENCIES = new Set(["monthly", "biweekly", "weekly", "irregular"]);
const PLANNING_PERIODS = new Set(["monthly", "biweekly"]);
const PRIMARY_GOALS = new Set(["control", "save", "emergency", "debt", "purchase", "invest"]);
const EMPLOYMENT_STATUSES = new Set(["employee", "independent", "entrepreneur", "student", "unemployed", "retired", "other"]);

const DEFAULT_ACCOUNTS = [
  ["Cuenta principal", "bank", "forest"],
  ["Ahorros", "savings", "mint"],
  ["Efectivo", "cash", "sun"],
];

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeUsername(value) {
  return String(value || "").trim().toLocaleLowerCase("es");
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeCurrency(value) {
  return String(value || "DOP").trim().toUpperCase();
}

function normalizePhone(value, required = false) {
  const raw = String(value || "").trim();
  if (!raw && !required) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw requestError("Escribe un número de teléfono válido.");
  }
  if (digits.length === 10 && /^(809|829|849)/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

function cleanUsernamePart(value) {
  return normalizeName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function amountInCents(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function integerInRange(value, minimum, maximum, fallback = null) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) return fallback;
  return number;
}

function booleanValue(value) {
  return value === true || value === "true" || value === "1" || value === 1 || value === "yes";
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function databaseDate(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function passwordDigest(password, salt) {
  return scryptSync(password, salt, PASSWORD_BYTES);
}

function safePasswordMatch(password, salt, expectedHex) {
  const actual = passwordDigest(password, salt);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function publicUser(user) {
  const onboardingCompleted = Boolean(Number(user.onboardingCompleted ?? user.onboarding_completed ?? 0));
  const normalizedFullName = normalizeName(user.name || "");
  const fallbackParts = normalizedFullName.split(" ");
  const firstName = normalizeName(user.firstName || user.first_name || fallbackParts[0] || "");
  const lastName = normalizeName(user.lastName || user.last_name || fallbackParts.slice(1).join(" "));
  return {
    id: Number(user.id),
    name: normalizedFullName || normalizeName(`${firstName} ${lastName}`),
    firstName,
    lastName,
    username: user.username,
    currencyCode: user.currencyCode || user.currency_code || "DOP",
    phone: user.phone || "",
    onboardingCompleted,
    profile: {
      age: user.age == null ? null : Number(user.age),
      incomeType: user.incomeType || user.income_type || "",
      incomeFrequency: user.incomeFrequency || user.income_frequency || "",
      incomeAmount: Number(user.incomeAmount ?? user.income_amount ?? 0),
      hasPayrollAccount: Boolean(Number(user.hasPayrollAccount ?? user.has_payroll_account ?? 0)),
      fixedExpenses: Number(user.fixedExpenses ?? user.fixed_expenses ?? 0),
      planningPeriod: user.planningPeriod || user.planning_period || "monthly",
      planPurpose: user.planPurpose || user.plan_purpose || "",
      savingsTargetPercent: Number(user.savingsTargetPercent ?? user.savings_target_percent ?? 10),
      primaryGoal: user.primaryGoal || user.primary_goal || "control",
      employmentStatus: user.employmentStatus || user.employment_status || "employee",
      dependents: Number(user.dependents || 0),
      debtBalance: Number(user.debtBalance ?? user.debt_balance ?? 0),
      debtMonthlyPayment: Number(user.debtMonthlyPayment ?? user.debt_monthly_payment ?? 0),
      emergencySavings: Number(user.emergencySavings ?? user.emergency_savings ?? 0),
      paydayOne: user.paydayOne ?? user.payday_one ?? null,
      paydayTwo: user.paydayTwo ?? user.payday_two ?? null,
      financialConfidence: Number(user.financialConfidence ?? user.financial_confidence ?? 3),
    },
  };
}

async function userWithProfile(database, userId) {
  return database.get(
    `SELECT u.id, u.name, u.first_name AS firstName, u.last_name AS lastName,
      u.username, u.currency_code AS currencyCode, u.phone,
      COALESCE(p.onboarding_completed, 0) AS onboardingCompleted,
      p.age,
      COALESCE(p.income_type, '') AS incomeType,
      COALESCE(p.income_frequency, '') AS incomeFrequency,
      COALESCE(p.income_amount, 0) AS incomeAmount,
      COALESCE(p.has_payroll_account, 0) AS hasPayrollAccount,
      COALESCE(p.fixed_expenses, 0) AS fixedExpenses,
      COALESCE(p.planning_period, 'monthly') AS planningPeriod,
      COALESCE(p.plan_purpose, '') AS planPurpose,
      COALESCE(p.savings_target_percent, 10) AS savingsTargetPercent,
      COALESCE(p.primary_goal, 'control') AS primaryGoal,
      COALESCE(p.employment_status, 'employee') AS employmentStatus,
      COALESCE(p.dependents, 0) AS dependents,
      COALESCE(p.debt_balance, 0) AS debtBalance,
      COALESCE(p.debt_monthly_payment, 0) AS debtMonthlyPayment,
      COALESCE(p.emergency_savings, 0) AS emergencySavings,
      p.payday_one AS paydayOne,
      p.payday_two AS paydayTwo,
      COALESCE(p.financial_confidence, 3) AS financialConfidence
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = ?`,
    [userId],
  );
}

async function createSession(database, userId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await database.run("DELETE FROM sessions WHERE expires_at <= ?", [databaseDate()]);
  await database.run(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    [tokenHash(token), userId, databaseDate(expiresAt)],
  );
  return token;
}

async function seedUserAccounts(database, userId) {
  for (const [name, kind, color] of DEFAULT_ACCOUNTS) {
    await database.run(
      "INSERT INTO accounts (user_id, name, kind, balance, color) VALUES (?, ?, ?, 0, ?)",
      [userId, name, kind, color],
    );
  }
}

async function uniqueGeneratedUsername(database, firstName, lastName) {
  const first = cleanUsernamePart(firstName);
  const last = cleanUsernamePart(lastName);
  let base = `${first.charAt(0)}${last}` || first || last || "usuario";
  if (base.length < 3) base = `${base}user`;
  base = base.slice(0, 34);

  let candidate = base;
  let suffix = 2;
  while (await database.get("SELECT id FROM users WHERE username = ?", [candidate])) {
    candidate = `${base}${suffix}`.slice(0, 40);
    suffix += 1;
  }
  return candidate;
}

async function saveProfile(database, userId, payload, completeOnboarding = false) {
  const age = integerInRange(payload.age, 13, 100);
  const incomeType = INCOME_TYPES.has(payload.incomeType) ? payload.incomeType : "irregular";
  const incomeFrequency = INCOME_FREQUENCIES.has(payload.incomeFrequency) ? payload.incomeFrequency : "irregular";
  const incomeAmount = amountInCents(payload.incomeAmount);
  const fixedExpenses = amountInCents(payload.fixedExpenses);
  const planningPeriod = PLANNING_PERIODS.has(payload.planningPeriod) ? payload.planningPeriod : "monthly";
  const planPurpose = String(payload.planPurpose || "").trim().slice(0, 240);
  const savingsTargetPercent = integerInRange(payload.savingsTargetPercent, 0, 100, 10);
  const primaryGoal = PRIMARY_GOALS.has(payload.primaryGoal) ? payload.primaryGoal : "control";
  const employmentStatus = EMPLOYMENT_STATUSES.has(payload.employmentStatus) ? payload.employmentStatus : "other";
  const dependents = integerInRange(payload.dependents, 0, 20, 0);
  const debtBalance = amountInCents(payload.debtBalance);
  const debtMonthlyPayment = amountInCents(payload.debtMonthlyPayment);
  const emergencySavings = amountInCents(payload.emergencySavings);
  const paydayOne = integerInRange(payload.paydayOne, 1, 31, null);
  const paydayTwo = integerInRange(payload.paydayTwo, 1, 31, null);
  const financialConfidence = integerInRange(payload.financialConfidence, 1, 5, 3);
  const hasPayrollAccount = booleanValue(payload.hasPayrollAccount) ? 1 : 0;

  if (completeOnboarding && age === null) throw requestError("Indica tu edad para personalizar tu experiencia.");
  if ([incomeAmount, fixedExpenses, debtBalance, debtMonthlyPayment, emergencySavings].some((value) => value === null)) {
    throw requestError("Los montos ingresados no son válidos.");
  }

  const values = [
    userId,
    age,
    incomeType,
    incomeFrequency,
    incomeAmount,
    hasPayrollAccount,
    fixedExpenses,
    planningPeriod,
    planPurpose,
    savingsTargetPercent,
    primaryGoal,
    employmentStatus,
    dependents,
    debtBalance,
    debtMonthlyPayment,
    emergencySavings,
    paydayOne,
    paydayTwo,
    financialConfidence,
    completeOnboarding ? 1 : 0,
  ];

  if (database.provider === "tidb") {
    await database.run(
      `INSERT INTO user_profiles
        (user_id, age, income_type, income_frequency, income_amount, has_payroll_account,
         fixed_expenses, planning_period, plan_purpose, savings_target_percent, primary_goal,
         employment_status, dependents, debt_balance, debt_monthly_payment, emergency_savings, payday_one, payday_two, financial_confidence, onboarding_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        age = VALUES(age), income_type = VALUES(income_type), income_frequency = VALUES(income_frequency),
        income_amount = VALUES(income_amount), has_payroll_account = VALUES(has_payroll_account),
        fixed_expenses = VALUES(fixed_expenses), planning_period = VALUES(planning_period),
        plan_purpose = VALUES(plan_purpose), savings_target_percent = VALUES(savings_target_percent),
        primary_goal = VALUES(primary_goal), employment_status = VALUES(employment_status), dependents = VALUES(dependents),
        debt_balance = VALUES(debt_balance), debt_monthly_payment = VALUES(debt_monthly_payment),
        emergency_savings = VALUES(emergency_savings), payday_one = VALUES(payday_one), payday_two = VALUES(payday_two),
        financial_confidence = VALUES(financial_confidence), onboarding_completed = GREATEST(onboarding_completed, VALUES(onboarding_completed)),
        updated_at = CURRENT_TIMESTAMP`,
      values,
    );
  } else {
    await database.run(
      `INSERT INTO user_profiles
        (user_id, age, income_type, income_frequency, income_amount, has_payroll_account,
         fixed_expenses, planning_period, plan_purpose, savings_target_percent, primary_goal,
         employment_status, dependents, debt_balance, debt_monthly_payment, emergency_savings, payday_one, payday_two, financial_confidence, onboarding_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
        age = excluded.age, income_type = excluded.income_type, income_frequency = excluded.income_frequency,
        income_amount = excluded.income_amount, has_payroll_account = excluded.has_payroll_account,
        fixed_expenses = excluded.fixed_expenses, planning_period = excluded.planning_period,
        plan_purpose = excluded.plan_purpose, savings_target_percent = excluded.savings_target_percent,
        primary_goal = excluded.primary_goal, employment_status = excluded.employment_status, dependents = excluded.dependents,
        debt_balance = excluded.debt_balance, debt_monthly_payment = excluded.debt_monthly_payment,
        emergency_savings = excluded.emergency_savings, payday_one = excluded.payday_one, payday_two = excluded.payday_two,
        financial_confidence = excluded.financial_confidence,
        onboarding_completed = MAX(user_profiles.onboarding_completed, excluded.onboarding_completed),
        updated_at = CURRENT_TIMESTAMP`,
      values,
    );
  }

  return publicUser(await userWithProfile(database, userId));
}

export async function authStatus() {
  return {
    registrationEnabled: process.env.REGISTRATION_ENABLED !== "false",
  };
}

export async function registerUser(database, payload) {
  if (process.env.REGISTRATION_ENABLED === "false") {
    throw requestError("El registro de nuevas cuentas está deshabilitado temporalmente.", 403);
  }

  const firstName = normalizeName(payload.firstName || String(payload.name || "").split(" ")[0]);
  const lastName = normalizeName(payload.lastName || String(payload.name || "").split(" ").slice(1).join(" "));
  const name = normalizeName(payload.name || `${firstName} ${lastName}`);
  const password = String(payload.password || "");
  const requestedCurrency = normalizeCurrency(payload.currencyCode);
  const currencyCode = SUPPORTED_CURRENCIES.has(requestedCurrency) ? requestedCurrency : "DOP";
  const phone = normalizePhone(payload.phone, true);

  if (firstName.length < 2) throw requestError("Escribe tu nombre.");
  if (lastName.length < 2) throw requestError("Escribe tu apellido.");
  if (password.length < 8) throw requestError("La contraseña debe tener al menos 8 caracteres.");

  const generatedUsername = await uniqueGeneratedUsername(database, firstName, lastName);

  if (!/^[a-z0-9._-]{3,40}$/i.test(generatedUsername)) {
    throw requestError("No se pudo generar un usuario válido con ese nombre. Revisa tus datos.");
  }

  const existing = await database.get("SELECT id FROM users WHERE username = ?", [generatedUsername]);
  if (existing) throw requestError("Ese nombre de usuario ya está registrado.", 409);

  const salt = randomBytes(16).toString("hex");
  const hash = passwordDigest(password, salt).toString("hex");

  let userId;
  try {
    await database.transaction(async (transaction) => {
      const result = await transaction.run(
        `INSERT INTO users (name, first_name, last_name, username, password_salt, password_hash, currency_code, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, firstName, lastName, generatedUsername, salt, hash, currencyCode, phone],
      );
      userId = result.insertId;
      await seedUserAccounts(transaction, userId);
    });
  } catch (error) {
    if (String(error?.message || "").toLocaleLowerCase("es").includes("unique")) {
      throw requestError("Ese nombre de usuario ya está registrado.", 409);
    }
    throw error;
  }

  const user = publicUser(await userWithProfile(database, userId));
  const token = await createSession(database, userId);
  return { token, user };
}

export async function loginUser(database, payload) {
  const username = normalizeUsername(payload.username);
  const password = String(payload.password || "");
  if (!username || !password) throw requestError("Escribe tu usuario y contraseña.");

  const user = await database.get(
    `SELECT id, name, username, password_salt AS passwordSalt,
      password_hash AS passwordHash, currency_code AS currencyCode
     FROM users WHERE username = ?`,
    [username],
  );

  if (!user || !safePasswordMatch(password, user.passwordSalt, user.passwordHash)) {
    throw requestError("Usuario o contraseña incorrectos.", 401);
  }

  const token = await createSession(database, Number(user.id));
  const completeUser = publicUser(await userWithProfile(database, Number(user.id)));
  return { token, user: completeUser };
}

export function bearerToken(request) {
  const authorization = String(request.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) return "";
  return authorization.slice(7).trim();
}

export async function authenticatedUser(database, token) {
  if (!token) return null;
  const user = await database.get(
    `SELECT u.id
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [tokenHash(token), databaseDate()],
  );
  if (!user) return null;
  return publicUser(await userWithProfile(database, Number(user.id)));
}

export function requireAuth(database) {
  return async (request, response, next) => {
    try {
      const token = bearerToken(request);
      const user = await authenticatedUser(database, token);
      if (!user) {
        response.status(401).json({ error: "Tu sesión venció o no has iniciado sesión." });
        return;
      }
      request.auth = { token, user };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function logoutUser(database, token) {
  if (!token) return;
  await database.run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash(token)]);
}

export async function updateCurrency(database, userId, currencyCode) {
  const code = normalizeCurrency(currencyCode);
  if (!SUPPORTED_CURRENCIES.has(code)) throw requestError("Selecciona una moneda válida.");
  await database.run("UPDATE users SET currency_code = ? WHERE id = ?", [code, userId]);
  return publicUser(await userWithProfile(database, userId));
}

export async function completeOnboarding(database, userId, payload) {
  return saveProfile(database, userId, payload, true);
}

export async function updateFinancialProfile(database, userId, payload) {
  const current = publicUser(await userWithProfile(database, userId));

  const wantsIdentityUpdate = payload.firstName !== undefined || payload.lastName !== undefined;
  if (wantsIdentityUpdate) {
    const firstName = normalizeName(payload.firstName ?? current.firstName);
    const lastName = normalizeName(payload.lastName ?? current.lastName);
    if (firstName.length < 2) throw requestError("Escribe un nombre válido.");
    if (lastName.length < 2) throw requestError("Escribe un apellido válido.");
    await database.run(
      "UPDATE users SET name = ?, first_name = ?, last_name = ? WHERE id = ?",
      [normalizeName(`${firstName} ${lastName}`), firstName, lastName, userId],
    );
  }

  if (payload.phone !== undefined) {
    const phone = normalizePhone(payload.phone, true);
    await database.run("UPDATE users SET phone = ? WHERE id = ?", [phone, userId]);
  }
  const merged = {
    ...current.profile,
    incomeAmount: Number(current.profile.incomeAmount || 0) / 100,
    fixedExpenses: Number(current.profile.fixedExpenses || 0) / 100,
    debtBalance: Number(current.profile.debtBalance || 0) / 100,
    debtMonthlyPayment: Number(current.profile.debtMonthlyPayment || 0) / 100,
    emergencySavings: Number(current.profile.emergencySavings || 0) / 100,
    ...payload,
  };
  return saveProfile(database, userId, merged, current.onboardingCompleted);
}

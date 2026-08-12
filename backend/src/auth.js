import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_DAYS = 30;
const PASSWORD_BYTES = 64;

export const SUPPORTED_CURRENCIES = new Set(["DOP", "USD", "EUR", "GBP", "MXN", "COP", "PEN", "BOB"]);

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
  return {
    id: Number(user.id),
    name: user.name,
    username: user.username,
    currencyCode: user.currencyCode || user.currency_code || "DOP",
  };
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

export async function authStatus(database) {
  const row = await database.get("SELECT COUNT(*) AS count FROM users");
  return {
    setupRequired: Number(row?.count || 0) === 0,
    setupCodeRequired: Boolean(process.env.INITIAL_SETUP_CODE),
  };
}

export async function setupFirstUser(database, payload) {
  const { setupRequired } = await authStatus(database);
  if (!setupRequired) throw requestError("La cuenta principal ya fue configurada.", 409);

  const setupCode = String(payload.setupCode || "");
  if (process.env.INITIAL_SETUP_CODE && setupCode !== process.env.INITIAL_SETUP_CODE) {
    throw requestError("El código de configuración inicial no es válido.", 401);
  }

  const name = normalizeName(payload.name);
  const username = normalizeUsername(payload.username);
  const password = String(payload.password || "");

  if (name.length < 2) throw requestError("Escribe tu nombre.");
  if (!/^[a-z0-9._-]{3,40}$/i.test(username)) {
    throw requestError("El usuario debe tener entre 3 y 40 caracteres y usar letras, números, punto, guion o guion bajo.");
  }
  if (password.length < 8) throw requestError("La contraseña debe tener al menos 8 caracteres.");

  const salt = randomBytes(16).toString("hex");
  const hash = passwordDigest(password, salt).toString("hex");
  const result = await database.run(
    `INSERT INTO users (name, username, password_salt, password_hash, currency_code)
     VALUES (?, ?, ?, ?, 'DOP')`,
    [name, username, salt, hash],
  );
  const user = await database.get(
    "SELECT id, name, username, currency_code AS currencyCode FROM users WHERE id = ?",
    [result.insertId],
  );
  const token = await createSession(database, result.insertId);
  return { token, user: publicUser(user) };
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
  return { token, user: publicUser(user) };
}

export function bearerToken(request) {
  const authorization = String(request.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) return "";
  return authorization.slice(7).trim();
}

export async function authenticatedUser(database, token) {
  if (!token) return null;
  const user = await database.get(
    `SELECT u.id, u.name, u.username, u.currency_code AS currencyCode
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [tokenHash(token), databaseDate()],
  );
  return user ? publicUser(user) : null;
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
  const code = String(currencyCode || "").trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(code)) throw requestError("Selecciona una moneda válida.");
  await database.run("UPDATE users SET currency_code = ? WHERE id = ?", [code, userId]);
  const user = await database.get(
    "SELECT id, name, username, currency_code AS currencyCode FROM users WHERE id = ?",
    [userId],
  );
  return publicUser(user);
}

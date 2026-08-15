import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
    throw requestError("Escribe un correo electrónico válido.");
  }
  return email;
}

function sqlDate(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function hashCode(code) {
  return createHash("sha256").update(String(code)).digest("hex");
}

function safeHashMatch(actualCode, expectedHash) {
  const actual = Buffer.from(hashCode(actualCode), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emailConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.EMAIL_FROM || "").trim();
  return { apiKey, from, configured: Boolean(apiKey && from) };
}

export function emailVerificationStatus() {
  const config = emailConfig();
  return {
    configured: config.configured,
    provider: "resend",
  };
}

async function sendWithResend({ to, code, name }) {
  const { apiKey, from, configured } = emailConfig();
  if (!configured) {
    throw requestError("La verificación por correo todavía no está configurada en Clara.", 503);
  }

  const safeName = String(name || "").trim() || "usuario de Clara";
  const safeHtmlName = escapeHtml(safeName);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${code} es tu código de verificación de Clara`,
      text: `Hola ${safeName}. Tu código de verificación de Clara es ${code}. Vence en ${CODE_TTL_MINUTES} minutos. Si no solicitaste este código, puedes ignorar este correo.`,
      html: `<!doctype html><html><body style="margin:0;background:#f5f6f1;font-family:Arial,sans-serif;color:#123c31"><div style="max-width:560px;margin:0 auto;padding:36px 20px"><div style="background:#0b4d3e;border-radius:24px;padding:28px;color:#fff"><div style="font-size:14px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9ee3cb">Clara · CODEX413</div><h1 style="font-size:28px;line-height:1.15;margin:12px 0 8px">Verifica tu correo</h1><p style="margin:0;color:rgba(255,255,255,.78);line-height:1.6">Hola ${safeHtmlName}. Usa este código para confirmar que este correo realmente te pertenece.</p></div><div style="background:#fff;border:1px solid #dde5df;border-radius:24px;padding:30px;margin-top:14px;text-align:center"><div style="font-size:13px;color:#6f7e78">Código de verificación</div><div style="font-size:40px;font-weight:900;letter-spacing:.18em;color:#0b4d3e;margin:14px 0">${code}</div><div style="font-size:13px;color:#7a8782">Vence en ${CODE_TTL_MINUTES} minutos.</div></div><p style="font-size:12px;color:#84908b;line-height:1.6;text-align:center;padding:0 18px">Si no solicitaste este código, ignora este mensaje. Clara nunca te pedirá tu contraseña bancaria por correo.</p></div></body></html>`,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result?.message || result?.error?.message || "No se pudo enviar el código de verificación.";
    const error = requestError(message, response.status >= 400 && response.status < 500 ? 400 : 502);
    error.provider = "resend";
    throw error;
  }
  return result;
}

export async function sendEmailVerificationCode(database, userId, { force = false } = {}) {
  const user = await database.get(
    `SELECT id, name, email, email_verified_at AS emailVerifiedAt
     FROM users WHERE id = ?`,
    [userId],
  );
  if (!user) throw requestError("No encontramos esa cuenta.", 404);
  const email = normalizeEmail(user.email);
  if (user.emailVerifiedAt) return { alreadyVerified: true, email };

  const existing = await database.get(
    `SELECT user_id AS userId, last_sent_at AS lastSentAt
     FROM email_verification_codes WHERE user_id = ?`,
    [userId],
  );
  if (!force && existing?.lastSentAt) {
    const elapsed = Date.now() - new Date(String(existing.lastSentAt).replace(" ", "T") + "Z").getTime();
    const waitMs = RESEND_COOLDOWN_SECONDS * 1000 - elapsed;
    if (waitMs > 0) {
      throw requestError(`Espera ${Math.ceil(waitMs / 1000)} segundos antes de pedir otro código.`, 429);
    }
  }

  const code = String(randomInt(100000, 1000000));
  const now = new Date();
  const expires = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000);
  await sendWithResend({ to: email, code, name: user.name });

  if (existing) {
    await database.run(
      `UPDATE email_verification_codes
       SET email = ?, code_hash = ?, expires_at = ?, attempts = 0, last_sent_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [email, hashCode(code), sqlDate(expires), sqlDate(now), userId],
    );
  } else {
    await database.run(
      `INSERT INTO email_verification_codes (user_id, email, code_hash, expires_at, attempts, last_sent_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [userId, email, hashCode(code), sqlDate(expires), sqlDate(now)],
    );
  }

  return { sent: true, email, expiresInMinutes: CODE_TTL_MINUTES };
}

export async function verifyEmailCode(database, userId, code) {
  const normalizedCode = String(code || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(normalizedCode)) throw requestError("Escribe el código de 6 dígitos.");

  const record = await database.get(
    `SELECT user_id AS userId, email, code_hash AS codeHash, expires_at AS expiresAt, attempts
     FROM email_verification_codes WHERE user_id = ?`,
    [userId],
  );
  if (!record) throw requestError("Solicita un nuevo código de verificación.", 404);
  if (Number(record.attempts || 0) >= MAX_ATTEMPTS) throw requestError("Ese código fue bloqueado por demasiados intentos. Solicita uno nuevo.", 429);
  const expiresAt = new Date(String(record.expiresAt).replace(" ", "T") + "Z");
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    throw requestError("Ese código venció. Solicita uno nuevo.", 410);
  }
  if (!safeHashMatch(normalizedCode, record.codeHash)) {
    await database.run("UPDATE email_verification_codes SET attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?", [userId]);
    throw requestError("El código no coincide. Revísalo e inténtalo otra vez.", 400);
  }

  await database.transaction(async (transaction) => {
    await transaction.run("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?", [userId]);
    await transaction.run("DELETE FROM email_verification_codes WHERE user_id = ?", [userId]);
  });
  return { verified: true, email: record.email };
}

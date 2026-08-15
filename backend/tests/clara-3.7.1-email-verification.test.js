import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSqliteDatabase } from "../src/database.js";
import { registerUser, authenticatedUser } from "../src/auth.js";
import { sendEmailVerificationCode, verifyEmailCode } from "../src/email-verification.js";

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), "clara371-"));
  return { dir, db: createSqliteDatabase(join(dir, "clara.sqlite")) };
}

async function close(ctx) {
  await ctx.db.close();
  rmSync(ctx.dir, { recursive: true, force: true });
}

test("envía código de 6 dígitos y verifica el correo", async () => {
  const ctx = tempDb();
  const oldFetch = global.fetch;
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.EMAIL_FROM;
  let sentBody = null;
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Clara <acceso@example.com>";
  global.fetch = async (_url, options) => {
    sentBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: "email_test" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const created = await registerUser(ctx.db, { firstName: "Ana", lastName: "Perez", email: "ana@example.com", phone: "8095551234", password: "12345678" });
    assert.equal(created.user.emailVerified, false);
    await sendEmailVerificationCode(ctx.db, created.user.id, { force: true });
    const match = sentBody.subject.match(/^(\d{6})/);
    assert.ok(match);
    await verifyEmailCode(ctx.db, created.user.id, match[1]);
    const row = await ctx.db.get("SELECT email_verified_at AS verifiedAt FROM users WHERE id = ?", [created.user.id]);
    assert.ok(row.verifiedAt);
  } finally {
    global.fetch = oldFetch;
    process.env.RESEND_API_KEY = oldKey;
    process.env.EMAIL_FROM = oldFrom;
    await close(ctx);
  }
});

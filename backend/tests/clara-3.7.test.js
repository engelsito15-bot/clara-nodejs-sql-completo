import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSqliteDatabase } from "../src/database.js";
import { registerUser, loginUser, updateFinancialProfile } from "../src/auth.js";
import { createMailSyncSource, getMailSyncState, ingestMailSyncMessage, updateMailSyncSettings } from "../src/mail-sync.js";

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), "clara37-"));
  const path = join(dir, "clara.sqlite");
  return { dir, db: createSqliteDatabase(path) };
}

async function close(ctx) {
  await ctx.db.close();
  rmSync(ctx.dir, { recursive: true, force: true });
}

test("correo es el identificador de acceso y usuario legado puede migrar", async () => {
  const ctx = tempDb();
  try {
    const created = await registerUser(ctx.db, { firstName: "Ana", lastName: "Perez", email: "Ana@Example.com", phone: "8095551234", password: "12345678" });
    assert.equal(created.user.email, "ana@example.com");
    const byEmail = await loginUser(ctx.db, { identifier: "ana@example.com", password: "12345678" });
    assert.equal(byEmail.user.id, created.user.id);
    await ctx.db.run("UPDATE users SET email = NULL WHERE id = ?", [created.user.id]);
    const legacy = await loginUser(ctx.db, { identifier: created.user.username, password: "12345678" });
    assert.equal(legacy.user.requiresEmailMigration, true);
    const migrated = await updateFinancialProfile(ctx.db, created.user.id, { email: "ana.nueva@example.com" });
    assert.equal(migrated.requiresEmailMigration, false);
  } finally { await close(ctx); }
});

test("Mail Sync usa alias privado, registra alta confianza y evita duplicados", async () => {
  const ctx = tempDb();
  const oldSecret = process.env.MAIL_SYNC_SECRET;
  const oldInbox = process.env.MAIL_SYNC_INBOX_ADDRESS;
  process.env.MAIL_SYNC_SECRET = "test-secret-37";
  process.env.MAIL_SYNC_INBOX_ADDRESS = "clarasync@gmail.com";
  try {
    const created = await registerUser(ctx.db, { firstName: "Mail", lastName: "Tester", email: "mail@test.com", phone: "8295551234", password: "12345678" });
    const account = (await ctx.db.all("SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", [created.user.id]))[0];
    let sync = await getMailSyncState(ctx.db, created.user.id);
    assert.match(sync.forwardingAddress, /^clarasync\+[a-z0-9_-]+@gmail\.com$/);
    await createMailSyncSource(ctx.db, created.user.id, { institutionName: "Banco Prueba", senderMatch: "alertas@banco.test", accountId: account.id, maskedRef: "4132" });
    await updateMailSyncSettings(ctx.db, created.user.id, { autoMode: "automatic_high", enabled: true });
    const payload = { target: sync.forwardingAddress, sender: "alertas@banco.test", subject: "Transferencia recibida", text: "Has recibido un crédito por RD$ 1,000.00. Saldo disponible: RD$ 5,000.00. Cuenta terminada en 4132", messageId: "message-37", receivedAt: new Date().toISOString() };
    const first = await ingestMailSyncMessage(ctx.db, { "x-clara-mail-secret": "test-secret-37" }, payload);
    assert.equal(first.status, "registered");
    assert.equal(first.parsed.reportedBalance, 500000);
    const second = await ingestMailSyncMessage(ctx.db, { "x-clara-mail-secret": "test-secret-37" }, payload);
    assert.equal(second.duplicate, true);
    const rows = await ctx.db.all("SELECT id FROM transactions WHERE user_id = ? AND source = 'EMAIL'", [created.user.id]);
    assert.equal(rows.length, 1);
  } finally {
    process.env.MAIL_SYNC_SECRET = oldSecret;
    process.env.MAIL_SYNC_INBOX_ADDRESS = oldInbox;
    await close(ctx);
  }
});

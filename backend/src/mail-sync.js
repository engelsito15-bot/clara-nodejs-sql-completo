import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createTransaction, createTransfer } from "./finance-engine.js";

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function clean(value, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeEmail(value) {
  return clean(value, 255).toLowerCase();
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (!value) return nowSql();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return nowSql();
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function parseMoneyNumber(raw) {
  let value = String(raw || "").replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(/[.,]+$/, "");
  if (!value) return 0;
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    value = value.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    const decimals = value.length - lastComma - 1;
    value = decimals === 2 ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const decimals = value.length - lastDot - 1;
    value = decimals === 2 ? value.replace(/,/g, "") : value.replace(/\./g, "");
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : 0;
}

function extractAmount(text) {
  const patterns = [
    /(?:RD\$|DOP|US\$|USD|EUR|€|\$)\s*([\d][\d.,]*)/i,
    /(?:monto|importe|valor|por)\s*(?:de\s*)?(?:RD\$|DOP|US\$|USD|EUR|€|\$)?\s*([\d][\d.,]*)/i,
    /([\d][\d.,]*)\s*(?:DOP|USD|EUR|pesos?|d[oó]lares?|euros?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseMoneyNumber(match[1]);
      if (amount) return amount;
    }
  }
  return 0;
}

function extractReportedBalance(text) {
  const match = text.match(/(?:saldo|balance)\s*(?:disponible|actual|restante)?\s*[:#-]?\s*(?:RD\$|DOP|US\$|USD|EUR|€|\$)?\s*([\d][\d.,]*)/i);
  return match ? parseMoneyNumber(match[1]) : 0;
}

function detectCurrency(text) {
  if (/US\$|\bUSD\b|d[oó]lares?/i.test(text)) return "USD";
  if (/€|\bEUR\b|euros?/i.test(text)) return "EUR";
  return "DOP";
}

function detectType(text) {
  const normalized = text.toLowerCase();
  if (/retiro|cajero|atm/.test(normalized)) return "withdrawal";
  if (/transferencia\s+(recibida|entrante)|dep[oó]sito|abono|cr[eé]dito\s+(a|en)|recibiste|has recibido|ingreso/.test(normalized)) return "income";
  if (/compra|consumo|d[eé]bito|cargo|pago realizado|pagaste|transacci[oó]n.*aprobada/.test(normalized)) return "expense";
  if (/transferencia/.test(normalized)) return "transfer";
  return "unknown";
}

function captureField(text, labels, max = 255) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:${labelPattern})\\s*[:#-]?\\s*([^\\n\\r|]{2,${max}})`, "i"));
  return clean(match?.[1] || "", max);
}

function extractMasked(text) {
  const match = text.match(/(?:terminad[ao]\s+en|finaliza(?:da)?\s+en|\*{2,}|x{2,}|XXXX)[^\d]{0,8}(\d{4})/i);
  return match?.[1] || "";
}

function parseFinancialEmail({ sender, subject, text }) {
  const body = `${subject || ""}\n${text || ""}`.slice(0, 12000);
  const amount = extractAmount(body);
  const reportedBalance = extractReportedBalance(body);
  const movementType = detectType(body);
  const maskedRef = extractMasked(body);
  const merchant = captureField(body, ["comercio", "establecimiento", "negocio", "merchant", "descripción", "descripcion", "concepto"]);
  const reference = captureField(body, ["referencia", "ref", "autorización", "autorizacion", "número de transacción", "numero de transaccion"], 160);
  let confidence = 15;
  if (amount) confidence += 35;
  if (movementType !== "unknown" && movementType !== "transfer") confidence += 25;
  if (maskedRef) confidence += 10;
  if (merchant || reference) confidence += 10;
  if (/@/.test(sender || "")) confidence += 5;
  return {
    amount,
    reportedBalance,
    currencyCode: detectCurrency(body),
    movementType,
    maskedRef,
    merchant,
    reference,
    confidence: Math.min(confidence, 100),
    excerpt: clean(body, 1000),
  };
}

function tokenFromTarget(target) {
  const value = normalizeEmail(target);
  const match = value.match(/\+([a-z0-9_-]{10,80})@/i);
  return match?.[1] || "";
}

function forwardingAddress(token) {
  const base = normalizeEmail(process.env.MAIL_SYNC_INBOX_ADDRESS || "");
  if (!base || !base.includes("@")) return "";
  const [local, domain] = base.split("@");
  return `${local}+${token}@${domain}`;
}

async function connectionForUser(database, userId) {
  let row = await database.get(
    `SELECT user_id AS userId, sync_token AS syncToken, is_enabled AS isEnabled,
      auto_mode AS autoMode, last_received_at AS lastReceivedAt
     FROM mail_sync_connections WHERE user_id = ?`,
    [userId],
  );
  if (!row) {
    const token = randomBytes(18).toString("base64url").toLowerCase();
    await database.run(
      "INSERT INTO mail_sync_connections (user_id, sync_token, is_enabled, auto_mode) VALUES (?, ?, 1, 'review')",
      [userId, token],
    );
    row = { userId, syncToken: token, isEnabled: 1, autoMode: "review", lastReceivedAt: null };
  }
  return row;
}

export async function getMailSyncState(database, userId) {
  const connection = await connectionForUser(database, userId);
  const [sources, messages] = await Promise.all([
    database.all(
      `SELECT s.id, s.institution_name AS institutionName, s.sender_match AS senderMatch,
        s.account_id AS accountId, a.name AS accountName, a.currency_code AS currencyCode,
        s.masked_ref AS maskedRef, s.default_category_id AS defaultCategoryId,
        COALESCE(c.display_name, c.name, '') AS defaultCategoryName, s.is_active AS isActive
       FROM mail_sync_sources s
       JOIN accounts a ON a.id = s.account_id AND a.user_id = s.user_id
       LEFT JOIN categories c ON c.id = s.default_category_id
       WHERE s.user_id = ? AND COALESCE(s.is_active, 1) = 1 ORDER BY s.id DESC`,
      [userId],
    ),
    database.all(
      `SELECT m.id, m.sender, m.subject, m.received_at AS receivedAt, m.movement_type AS movementType,
        m.amount, COALESCE(m.reported_balance, 0) AS reportedBalance, m.currency_code AS currencyCode, m.merchant, m.reference, m.masked_ref AS maskedRef,
        m.confidence, m.status, m.excerpt, m.transaction_id AS transactionId,
        COALESCE(s.institution_name, '') AS institutionName, s.account_id AS accountId,
        COALESCE(a.name, '') AS accountName, s.default_category_id AS defaultCategoryId
       FROM mail_sync_messages m
       LEFT JOIN mail_sync_sources s ON s.id = m.source_id
       LEFT JOIN accounts a ON a.id = s.account_id
       WHERE m.user_id = ? ORDER BY m.received_at DESC, m.id DESC LIMIT 50`,
      [userId],
    ),
  ]);
  const pending = messages.filter((message) => message.status === "review").length;
  const automatic = messages.filter((message) => message.status === "registered").length;
  return {
    configured: Boolean(process.env.MAIL_SYNC_SECRET && process.env.MAIL_SYNC_INBOX_ADDRESS),
    inboxConfigured: Boolean(process.env.MAIL_SYNC_INBOX_ADDRESS),
    enabled: Boolean(Number(connection.isEnabled)),
    autoMode: connection.autoMode || "review",
    forwardingAddress: forwardingAddress(connection.syncToken),
    lastReceivedAt: connection.lastReceivedAt || null,
    sources,
    messages,
    stats: { pending, registered: automatic, sources: sources.length },
  };
}

export async function updateMailSyncSettings(database, userId, payload) {
  const connection = await connectionForUser(database, userId);
  const autoMode = payload.autoMode === "automatic_high" ? "automatic_high" : "review";
  const enabled = payload.enabled === false || payload.enabled === "false" ? 0 : 1;
  await database.run(
    "UPDATE mail_sync_connections SET is_enabled = ?, auto_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
    [enabled, autoMode, userId],
  );
  return getMailSyncState(database, userId);
}

export async function createMailSyncSource(database, userId, payload) {
  const institutionName = clean(payload.institutionName, 160);
  const senderMatch = normalizeEmail(payload.senderMatch);
  const accountId = Number(payload.accountId);
  const defaultCategoryId = payload.defaultCategoryId ? Number(payload.defaultCategoryId) : null;
  const maskedRef = clean(payload.maskedRef, 20).replace(/\D/g, "").slice(-4);
  if (institutionName.length < 2 || !senderMatch || !senderMatch.includes("@")) throw requestError("Indica la institución y el correo remitente de sus alertas.");
  if (!Number.isInteger(accountId) || accountId <= 0) throw requestError("Selecciona la cuenta de Clara que corresponde a esas alertas.");
  const account = await database.get("SELECT id FROM accounts WHERE id = ? AND user_id = ? AND COALESCE(is_archived, 0) = 0", [accountId, userId]);
  if (!account) throw requestError("La cuenta seleccionada no existe.", 404);
  if (defaultCategoryId) {
    const category = await database.get("SELECT id FROM categories WHERE id = ? AND (user_id = ? OR user_id IS NULL)", [defaultCategoryId, userId]);
    if (!category) throw requestError("La categoría seleccionada no existe.", 404);
  }
  await database.run(
    `INSERT INTO mail_sync_sources (user_id, institution_name, sender_match, account_id, masked_ref, default_category_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, institutionName, senderMatch, accountId, maskedRef, defaultCategoryId],
  );
  return getMailSyncState(database, userId);
}

export async function deleteMailSyncSource(database, userId, sourceId) {
  await database.run("UPDATE mail_sync_sources SET is_active = 0 WHERE id = ? AND user_id = ?", [Number(sourceId), userId]);
  return getMailSyncState(database, userId);
}

async function sourceForEmail(database, userId, sender, maskedRef) {
  const rows = await database.all(
    `SELECT id, institution_name AS institutionName, sender_match AS senderMatch, account_id AS accountId,
      masked_ref AS maskedRef, default_category_id AS defaultCategoryId
     FROM mail_sync_sources WHERE user_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY id DESC`,
    [userId],
  );
  const senderLower = normalizeEmail(sender);
  return rows.find((source) => {
    const senderMatches = senderLower.includes(String(source.senderMatch || "").toLowerCase());
    const cardMatches = !source.maskedRef || !maskedRef || String(source.maskedRef) === String(maskedRef);
    return senderMatches && cardMatches;
  }) || null;
}

export async function ingestMailSyncMessage(database, headers, payload) {
  const expectedSecret = process.env.MAIL_SYNC_SECRET || "";
  const suppliedSecret = headers["x-clara-mail-secret"] || headers["X-Clara-Mail-Secret"] || "";
  if (!expectedSecret || !safeEqual(expectedSecret, suppliedSecret)) throw requestError("Mail Sync no autorizado.", 401);

  const token = clean(payload.token || tokenFromTarget(payload.target || payload.to), 80).toLowerCase();
  if (!token) throw requestError("No se encontró el identificador del usuario en el correo recibido.");
  const connection = await database.get(
    "SELECT user_id AS userId, is_enabled AS isEnabled, auto_mode AS autoMode FROM mail_sync_connections WHERE sync_token = ?",
    [token],
  );
  if (!connection || !Number(connection.isEnabled)) throw requestError("La conexión Mail Sync no existe o está desactivada.", 404);

  const sender = clean(payload.sender || payload.from, 255);
  const subject = clean(payload.subject, 500);
  const text = String(payload.text || payload.body || payload.snippet || "").slice(0, 12000);
  const receivedAt = normalizeDate(payload.receivedAt || payload.date);
  const stableId = clean(payload.messageId, 500) || `${sender}|${subject}|${receivedAt}|${text}`;
  const messageHash = createHash("sha256").update(stableId).digest("hex");
  const duplicate = await database.get("SELECT id, status FROM mail_sync_messages WHERE message_hash = ?", [messageHash]);
  if (duplicate) return { duplicate: true, id: Number(duplicate.id), status: duplicate.status };

  const parsed = parseFinancialEmail({ sender, subject, text });
  const source = await sourceForEmail(database, connection.userId, sender, parsed.maskedRef);
  const confidence = Math.min(100, parsed.confidence + (source ? 15 : 0));
  let status = "review";
  let transactionId = null;
  const externalRef = `MAIL:${messageHash.slice(0, 60)}`;

  const canAuto = connection.autoMode === "automatic_high" && source && confidence >= 85 && parsed.amount > 0 && ["income", "expense"].includes(parsed.movementType) && (parsed.movementType === "income" || source.defaultCategoryId);
  if (canAuto) {
    try {
      await createTransaction(database, Number(connection.userId), {
        type: parsed.movementType,
        amount: parsed.amount / 100,
        accountId: source.accountId,
        categoryId: parsed.movementType === "expense" ? source.defaultCategoryId : null,
        description: parsed.merchant || subject || `${source.institutionName} · Mail Sync`,
        transactionDate: receivedAt.slice(0, 10),
        note: `Detectado automáticamente por Clara Mail Sync. ${parsed.reference ? `Ref. ${parsed.reference}` : ""}`,
        source: "EMAIL",
        externalRef,
      });
      const tx = await database.get("SELECT id FROM transactions WHERE user_id = ? AND external_ref = ? LIMIT 1", [connection.userId, externalRef]);
      transactionId = Number(tx?.id || 0) || null;
      status = "registered";
    } catch {
      status = "review";
    }
  }

  const result = await database.run(
    `INSERT INTO mail_sync_messages
      (user_id, source_id, message_hash, sender, subject, received_at, movement_type, amount, reported_balance, currency_code,
       merchant, reference, masked_ref, confidence, status, transaction_id, excerpt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [connection.userId, source?.id || null, messageHash, sender, subject, receivedAt, parsed.movementType, parsed.amount, parsed.reportedBalance,
      parsed.currencyCode, parsed.merchant, parsed.reference, parsed.maskedRef, confidence, status, transactionId, parsed.excerpt],
  );
  await database.run("UPDATE mail_sync_connections SET last_received_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?", [receivedAt, connection.userId]);
  return { duplicate: false, id: result.insertId, status, parsed: { ...parsed, confidence }, matchedSource: Boolean(source) };
}

export async function confirmMailSyncMessage(database, userId, messageId, payload) {
  const message = await database.get(
    `SELECT id, movement_type AS movementType, amount, currency_code AS currencyCode, merchant, subject,
      received_at AS receivedAt, message_hash AS messageHash, source_id AS sourceId
     FROM mail_sync_messages WHERE id = ? AND user_id = ?`,
    [Number(messageId), userId],
  );
  if (!message) throw requestError("El movimiento detectado no existe.", 404);
  if (message.status === "registered") return getMailSyncState(database, userId);
  const source = message.sourceId ? await database.get(
    "SELECT account_id AS accountId, default_category_id AS defaultCategoryId FROM mail_sync_sources WHERE id = ? AND user_id = ?",
    [message.sourceId, userId],
  ) : null;
  const accountId = Number(payload.accountId || source?.accountId);
  const type = ["income", "expense", "withdrawal"].includes(payload.movementType) ? payload.movementType : message.movementType;
  const amount = Number(message.amount || 0) / 100;
  const externalRef = `MAIL:${String(message.messageHash).slice(0, 60)}`;
  if (!amount || !accountId) throw requestError("Selecciona la cuenta correcta antes de registrar el movimiento.");

  if (type === "withdrawal") {
    const destinationAccountId = Number(payload.destinationAccountId);
    if (!destinationAccountId) throw requestError("Selecciona la cuenta Efectivo que recibió el retiro.");
    await createTransfer(database, userId, {
      amount,
      accountId,
      destinationAccountId,
      transactionDate: String(message.receivedAt).slice(0, 10) || today(),
      note: "Retiro detectado por Clara Mail Sync.",
      source: "EMAIL",
      externalRef,
    });
  } else {
    const categoryId = type === "expense" ? Number(payload.categoryId || source?.defaultCategoryId) : null;
    if (type === "expense" && !categoryId) throw requestError("Selecciona una categoría para registrar este gasto.");
    await createTransaction(database, userId, {
      type: type === "income" ? "income" : "expense",
      amount,
      accountId,
      categoryId,
      description: clean(payload.description || message.merchant || message.subject || "Movimiento detectado por correo", 255),
      transactionDate: String(message.receivedAt).slice(0, 10) || today(),
      note: "Confirmado desde Clara Mail Sync.",
      source: "EMAIL",
      externalRef,
    });
  }
  const tx = await database.get("SELECT id FROM transactions WHERE user_id = ? AND external_ref = ? LIMIT 1", [userId, externalRef]);
  await database.run("UPDATE mail_sync_messages SET status = 'registered', transaction_id = ? WHERE id = ? AND user_id = ?", [tx?.id || null, message.id, userId]);
  return getMailSyncState(database, userId);
}

export async function ignoreMailSyncMessage(database, userId, messageId) {
  await database.run("UPDATE mail_sync_messages SET status = 'ignored' WHERE id = ? AND user_id = ? AND status <> 'registered'", [Number(messageId), userId]);
  return getMailSyncState(database, userId);
}

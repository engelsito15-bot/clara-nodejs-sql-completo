import * as webpush from "web-push";

let vapidConfigured = false;

function configureVapid() {
  if (vapidConfigured) return true;
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.VAPID_SUBJECT || "mailto:soporte@codex413.com").trim();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

function normalizedSubscription(payload = {}) {
  const subscription = payload.subscription || payload;
  const endpoint = String(subscription?.endpoint || "").trim();
  const p256dh = String(subscription?.keys?.p256dh || "").trim();
  const auth = String(subscription?.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

export function pwaPublicConfig() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  return {
    pushAvailable: Boolean(publicKey && process.env.VAPID_PRIVATE_KEY),
    vapidPublicKey: publicKey,
  };
}

export async function savePushSubscription(database, userId, payload = {}, userAgent = "") {
  const subscription = normalizedSubscription(payload);
  if (!subscription) {
    const error = new Error("La suscripción de notificaciones no es válida.");
    error.status = 400;
    throw error;
  }
  const timezone = String(payload.timezone || "UTC").trim().slice(0, 80) || "UTC";
  const agent = String(userAgent || "").slice(0, 500);

  if (database.provider === "tidb") {
    await database.run(
      `INSERT INTO push_subscriptions
        (user_id, endpoint, p256dh, auth_key, timezone, user_agent, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth_key = VALUES(auth_key),
         timezone = VALUES(timezone), user_agent = VALUES(user_agent), is_active = 1,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, subscription.endpoint, subscription.p256dh, subscription.auth, timezone, agent],
    );
  } else {
    await database.run(
      `INSERT INTO push_subscriptions
        (user_id, endpoint, p256dh, auth_key, timezone, user_agent, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id, p256dh = excluded.p256dh, auth_key = excluded.auth_key,
         timezone = excluded.timezone, user_agent = excluded.user_agent, is_active = 1,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, subscription.endpoint, subscription.p256dh, subscription.auth, timezone, agent],
    );
  }
  return { enabled: true };
}

export async function removePushSubscription(database, userId, endpoint) {
  const cleanEndpoint = String(endpoint || "").trim();
  if (!cleanEndpoint) return { enabled: false };
  await database.run("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", [userId, cleanEndpoint]);
  return { enabled: false };
}

export async function pushStatus(database, userId) {
  const row = await database.get(
    "SELECT COUNT(*) AS total FROM push_subscriptions WHERE user_id = ? AND COALESCE(is_active, 1) = 1",
    [userId],
  );
  return { enabled: Number(row?.total || 0) > 0, devices: Number(row?.total || 0) };
}

async function subscriptionsForUser(database, userId) {
  return database.all(
    `SELECT endpoint, p256dh, auth_key AS authKey, timezone
       FROM push_subscriptions
      WHERE user_id = ? AND COALESCE(is_active, 1) = 1`,
    [userId],
  );
}

async function deleteEndpoint(database, endpoint) {
  await database.run("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
}

async function sendPayload(database, row, payload) {
  if (!configureVapid()) return false;
  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.authKey } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 6, urgency: "normal" },
    );
    return true;
  } catch (error) {
    if ([404, 410].includes(Number(error?.statusCode))) {
      await deleteEndpoint(database, row.endpoint);
      return false;
    }
    console.error("Clara Push:", error?.message || error);
    return false;
  }
}

export async function sendUserNotification(database, userId, payload) {
  if (!configureVapid()) return { sent: 0, configured: false };
  const subscriptions = await subscriptionsForUser(database, userId);
  let sent = 0;
  for (const subscription of subscriptions) {
    if (await sendPayload(database, subscription, payload)) sent += 1;
  }
  return { sent, configured: true };
}

export async function sendWelcomeNotification(database, userId) {
  return sendUserNotification(database, userId, {
    title: "Clara está lista",
    body: "Las notificaciones financieras quedaron activadas en este dispositivo.",
    url: "/?view=inicio",
    tag: "clara-push-ready",
    badge: 0,
  });
}

function dateInZone(timeZone, offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function dayNumber(isoDate) {
  return Number(String(isoDate || "").slice(8, 10));
}

async function reminderItems(database, userId, today, tomorrow) {
  const recurring = await database.all(
    `SELECT name, next_due_date AS dueDate
       FROM recurring_payments
      WHERE user_id = ? AND COALESCE(is_active, 1) = 1 AND next_due_date IN (?, ?)
      ORDER BY next_due_date, id`,
    [userId, today, tomorrow],
  );
  const debts = await database.all(
    `SELECT name, next_due_date AS dueDate
       FROM debts
      WHERE user_id = ? AND COALESCE(is_active, 1) = 1 AND current_balance > 0 AND next_due_date IN (?, ?)
      ORDER BY next_due_date, id`,
    [userId, today, tomorrow],
  );
  const cards = await database.all(
    `SELECT name, due_day AS dueDay
       FROM credit_cards
      WHERE user_id = ? AND COALESCE(is_active, 1) = 1 AND current_balance > 0
      ORDER BY id`,
    [userId],
  );
  const goals = await database.all(
    `SELECT name, due_date AS dueDate
       FROM goals
      WHERE user_id = ? AND COALESCE(status, 'active') = 'active' AND due_date IN (?, ?)
      ORDER BY due_date, id`,
    [userId, today, tomorrow],
  );

  const todayDay = dayNumber(today);
  const tomorrowDay = dayNumber(tomorrow);
  const items = [
    ...recurring.map((item) => ({ type: "Pago", name: item.name, when: item.dueDate === today ? "hoy" : "mañana" })),
    ...debts.map((item) => ({ type: "Deuda", name: item.name, when: item.dueDate === today ? "hoy" : "mañana" })),
    ...goals.map((item) => ({ type: "Meta", name: item.name, when: item.dueDate === today ? "hoy" : "mañana" })),
    ...cards
      .filter((item) => [todayDay, tomorrowDay].includes(Number(item.dueDay)))
      .map((item) => ({ type: "Tarjeta", name: item.name, when: Number(item.dueDay) === todayDay ? "hoy" : "mañana" })),
  ];
  return items;
}

async function reminderAlreadySent(database, userId, key, sentOn) {
  const row = await database.get(
    "SELECT id FROM notification_log WHERE user_id = ? AND reminder_key = ? AND sent_on = ? LIMIT 1",
    [userId, key, sentOn],
  );
  return Boolean(row);
}

async function markReminderSent(database, userId, key, sentOn) {
  if (database.provider === "tidb") {
    await database.run(
      `INSERT IGNORE INTO notification_log (user_id, reminder_key, sent_on) VALUES (?, ?, ?)`,
      [userId, key, sentOn],
    );
  } else {
    await database.run(
      `INSERT OR IGNORE INTO notification_log (user_id, reminder_key, sent_on) VALUES (?, ?, ?)`,
      [userId, key, sentOn],
    );
  }
}

export async function runFinancialReminders(database) {
  if (!configureVapid()) return { configured: false, users: 0, notifications: 0 };
  const users = await database.all(
    `SELECT DISTINCT user_id AS userId, COALESCE(NULLIF(timezone, ''), 'UTC') AS timezone
       FROM push_subscriptions
      WHERE COALESCE(is_active, 1) = 1`,
  );
  let notifications = 0;
  for (const user of users) {
    const today = dateInZone(user.timezone, 0);
    const tomorrow = dateInZone(user.timezone, 1);
    const key = "financial-reminders";
    if (await reminderAlreadySent(database, user.userId, key, today)) continue;
    const items = await reminderItems(database, user.userId, today, tomorrow);
    if (!items.length) continue;

    const first = items.slice(0, 2).map((item) => `${item.name} ${item.when}`).join(" · ");
    const extra = items.length > 2 ? ` y ${items.length - 2} más` : "";
    const result = await sendUserNotification(database, user.userId, {
      title: items.length === 1 ? "Tienes un compromiso financiero" : `Tienes ${items.length} compromisos próximos`,
      body: `${first}${extra}. Abre Clara para revisarlos.`,
      url: "/?view=calendario",
      tag: `clara-reminders-${today}`,
      badge: items.length,
    });
    if (result.sent > 0) {
      await markReminderSent(database, user.userId, key, today);
      notifications += result.sent;
    }
  }
  return { configured: true, users: users.length, notifications };
}

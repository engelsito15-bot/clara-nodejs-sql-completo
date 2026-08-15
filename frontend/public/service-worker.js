const CACHE_NAME = "clara-shell-v3.7";
const QUEUE_DB = "clara-offline-queue";
const QUEUE_STORE = "requests";
const APP_SHELL = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueAdd(record) {
  const db = await openQueueDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).add(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function queueAll() {
  const db = await openQueueDb();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const request = tx.objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return items;
}

async function queueDelete(id) {
  const db = await openQueueDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function queueClear() {
  const db = await openQueueDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function queueCount() {
  return (await queueAll()).length;
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  clients.forEach((client) => client.postMessage(message));
}

async function serializeRequest(request) {
  const clone = request.clone();
  const headers = {};
  clone.headers.forEach((value, key) => { headers[key] = value; });
  return {
    url: clone.url,
    method: clone.method,
    headers,
    body: await clone.text(),
    createdAt: Date.now(),
  };
}

async function flushQueue() {
  const items = await queueAll();
  let synced = 0;
  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      if (response.ok) {
        await queueDelete(item.id);
        synced += 1;
        continue;
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        await queueDelete(item.id);
        await notifyClients({
          type: "QUEUE_FAILED",
          message: response.status === 401
            ? "Un movimiento sin conexión no se sincronizó porque la sesión había vencido."
            : "Un movimiento guardado sin conexión necesita revisión.",
        });
      }
    } catch {
      break;
    }
  }
  const remaining = await queueCount();
  await notifyClients({ type: "QUEUE_SYNCED", synced, remaining });
  await notifyClients({ type: "QUEUE_STATUS", count: remaining });
  if (remaining === 0 && self.navigator?.clearAppBadge) await self.navigator.clearAppBadge().catch(() => {});
  return { synced, remaining };
}

self.addEventListener("sync", (event) => {
  if (event.tag === "clara-finance-sync") event.waitUntil(flushQueue());
});

self.addEventListener("message", (event) => {
  const reply = (payload) => event.ports?.[0]?.postMessage(payload);
  if (event.data?.type === "FLUSH_OFFLINE_QUEUE") {
    event.waitUntil(flushQueue().then(reply));
    return;
  }
  if (event.data?.type === "GET_QUEUE_STATUS") {
    event.waitUntil(queueCount().then((count) => reply({ type: "QUEUE_STATUS", count })));
    return;
  }
  if (event.data?.type === "CLEAR_OFFLINE_QUEUE") {
    event.waitUntil(queueClear().then(() => reply({ type: "QUEUE_STATUS", count: 0 })));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/api/finance") {
    event.respondWith((async () => {
      const backup = request.clone();
      try {
        return await fetch(request);
      } catch {
        const bodyText = await backup.clone().text();
        let action = "";
        try { action = JSON.parse(bodyText)?.action || ""; } catch {}
        if (!["transaction", "transfer"].includes(action)) {
          return new Response(JSON.stringify({ error: "Esta operación necesita conexión a internet." }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }
        await queueAdd(await serializeRequest(backup));
        const count = await queueCount();
        try { await self.registration.sync?.register("clara-finance-sync"); } catch {}
        await notifyClients({ type: "QUEUE_STATUS", count });
        if (self.navigator?.setAppBadge) await self.navigator.setAppBadge(count).catch(() => {});
        return new Response(JSON.stringify({ queued: true, offline: true, queueCount: count }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
    })());
    return;
  }

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put("/", response.clone()).catch(() => {});
        return response;
      } catch {
        return (await caches.match("/")) || (await caches.match("/offline.html"));
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) {
        event.waitUntil(fetch(request).then((response) => {
          if (response.ok) return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return null;
        }).catch(() => null));
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        return new Response("", { status: 504 });
      }
    })());
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json?.() || {}; } catch { data = { body: event.data?.text?.() || "" }; }
  const title = data.title || "Clara";
  const options = {
    body: data.body || "Tienes una actualización financiera.",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || "clara-finance",
    data: { url: data.url || "/" },
    renotify: false,
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    if (self.navigator?.setAppBadge && Number(data.badge) > 0) await self.navigator.setAppBadge(Number(data.badge)).catch(() => {});
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.navigate(targetUrl).catch(() => {});
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});

import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const SNAPSHOT_DB = "clara-pwa";
const SNAPSHOT_STORE = "snapshots";

function openSnapshotDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SNAPSHOT_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOfflineSnapshot(key, value) {
  if (!("indexedDB" in window)) return;
  const db = await openSnapshotDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    tx.objectStore(SNAPSHOT_STORE).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadOfflineSnapshot(key) {
  if (!("indexedDB" in window)) return null;
  const db = await openSnapshotDb();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOT_STORE, "readonly");
    const request = tx.objectStore(SNAPSHOT_STORE).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

export async function clearOfflineSnapshots() {
  if (!("indexedDB" in window)) return;
  const db = await openSnapshotDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    tx.objectStore(SNAPSHOT_STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isMobileDevice() {
  return window.matchMedia?.("(max-width: 900px)").matches || /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandaloneMode() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function dismissedRecently() {
  const value = Number(localStorage.getItem("clara_install_dismissed_at") || 0);
  return value && Date.now() - value < 14 * 24 * 60 * 60 * 1000;
}

function base64UrlToUint8Array(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function api(path, options = {}, token = "") {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, result };
}

async function serviceWorkerMessage(message) {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const worker = navigator.serviceWorker.controller || registration?.active;
  if (!worker) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer);
      resolve(event.data);
    };
    worker.postMessage(message, [channel.port2]);
  });
}

export function usePwaManager(token = "") {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => isStandaloneMode());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(() => ("Notification" in window ? Notification.permission : "unsupported"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const ios = useMemo(() => isIosDevice(), []);
  const mobile = useMemo(() => isMobileDevice(), []);

  async function refreshQueueCount() {
    const response = await serviceWorkerMessage({ type: "GET_QUEUE_STATUS" });
    if (response?.type === "QUEUE_STATUS") setQueueCount(Number(response.count || 0));
  }

  useEffect(() => {
    const onInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      if (mobile && !isStandaloneMode() && !dismissedRecently()) {
        window.setTimeout(() => setShowInstallPrompt(true), 1200);
      }
    };
    const onInstalled = () => {
      setInstalled(true);
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
      localStorage.setItem("clara_pwa_installed", "1");
    };
    const onOnline = () => {
      setOnline(true);
      void serviceWorkerMessage({ type: "FLUSH_OFFLINE_QUEUE" });
    };
    const onOffline = () => setOnline(false);
    const onMessage = (event) => {
      if (event.data?.type === "QUEUE_STATUS") setQueueCount(Number(event.data.count || 0));
      if (event.data?.type === "QUEUE_SYNCED") {
        setQueueCount(Number(event.data.remaining || 0));
        window.dispatchEvent(new CustomEvent("clara:queue-synced", { detail: event.data }));
      }
      if (event.data?.type === "QUEUE_FAILED") {
        setMessage(event.data.message || "Un movimiento sin conexión necesita revisión.");
      }
    };

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    navigator.serviceWorker?.addEventListener("message", onMessage);

    if (mobile && ios && !isStandaloneMode() && !dismissedRecently()) {
      window.setTimeout(() => setShowInstallPrompt(true), 1800);
    }
    void refreshQueueCount();
    if (navigator.onLine) void serviceWorkerMessage({ type: "FLUSH_OFFLINE_QUEUE" });

    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [ios, mobile]);

  useEffect(() => {
    if (!token) {
      setPushEnabled(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const [{ response: configResponse, result: config }, { response: statusResponse, result: status }] = await Promise.all([
          api("/api/pwa/config"),
          api("/api/pwa/status", {}, token),
        ]);
        if (!active) return;
        setPushAvailable(Boolean(configResponse.ok && config?.pushAvailable));
        setPushEnabled(Boolean(statusResponse.ok && status?.enabled));
      } catch {
        if (active) setPushAvailable(false);
      }
    })();
    return () => { active = false; };
  }, [token]);

  async function install() {
    setMessage("");
    if (installed) return { installed: true };
    if (deferredPrompt) {
      setBusy(true);
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice?.outcome === "accepted") {
          setShowInstallPrompt(false);
          return { accepted: true };
        }
        localStorage.setItem("clara_install_dismissed_at", String(Date.now()));
        setShowInstallPrompt(false);
        return { accepted: false };
      } finally {
        setDeferredPrompt(null);
        setBusy(false);
      }
    }
    if (ios) {
      setShowInstallPrompt(false);
      setShowIosGuide(true);
      return { iosGuide: true };
    }
    setMessage("Tu navegador todavía no ofrece la instalación automática. Busca “Instalar app” en el menú del navegador.");
    return { accepted: false };
  }

  function dismissInstall() {
    localStorage.setItem("clara_install_dismissed_at", String(Date.now()));
    setShowInstallPrompt(false);
  }

  async function enableNotifications() {
    if (!token) throw new Error("Inicia sesión para activar notificaciones.");
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error(ios && !installed ? "En iPhone, instala Clara en la pantalla de inicio antes de activar notificaciones." : "Este navegador no admite notificaciones push.");
    }
    if (ios && !installed) throw new Error("En iPhone, instala Clara primero y ábrela desde el icono de la pantalla de inicio.");
    setBusy(true);
    setMessage("");
    try {
      const { response: configResponse, result: config } = await api("/api/pwa/config");
      if (!configResponse.ok || !config?.pushAvailable || !config?.vapidPublicKey) {
        throw new Error("Las notificaciones todavía no están configuradas en el servidor de Clara.");
      }
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") throw new Error("No se concedió permiso para notificaciones.");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey),
        });
      }
      const { response, result } = await api("/api/pwa/subscribe", {
        method: "POST",
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        }),
      }, token);
      if (!response.ok) throw new Error(result?.error || "No se pudieron activar las notificaciones.");
      setPushEnabled(true);
      setMessage("Notificaciones financieras activadas.");
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready.catch(() => null);
      const subscription = await registration?.pushManager?.getSubscription?.();
      if (subscription && token) {
        await api("/api/pwa/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) }, token);
        await subscription.unsubscribe().catch(() => {});
      }
      setPushEnabled(false);
      setMessage("Notificaciones desactivadas en este dispositivo.");
    } finally {
      setBusy(false);
    }
  }

  async function testNotification() {
    if (!token) return;
    setBusy(true);
    try {
      const { response, result } = await api("/api/pwa/test", { method: "POST", body: "{}" }, token);
      if (!response.ok) throw new Error(result?.error || "No se pudo enviar la notificación de prueba.");
      setMessage(result?.sent ? "Notificación de prueba enviada." : "No encontramos un dispositivo suscrito.");
    } finally {
      setBusy(false);
    }
  }

  async function clearQueue() {
    const result = await serviceWorkerMessage({ type: "CLEAR_OFFLINE_QUEUE" });
    setQueueCount(Number(result?.count || 0));
  }

  return {
    installed,
    online,
    mobile,
    ios,
    canInstall: Boolean(deferredPrompt) || (mobile && ios),
    showInstallPrompt,
    showIosGuide,
    setShowIosGuide,
    install,
    dismissInstall,
    queueCount,
    refreshQueueCount,
    clearQueue,
    pushAvailable,
    pushEnabled,
    notificationPermission,
    enableNotifications,
    disableNotifications,
    testNotification,
    busy,
    message,
    setMessage,
  };
}

const CACHE_VERSION = "keepy-pwa-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const API_CACHE = `${CACHE_VERSION}-api`;
const DB_NAME = "keepy-offline";
const DB_VERSION = 1;

const STATIC_ASSETS = [
  "/",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGE_CACHE, "/"));
    return;
  }

  if (url.pathname === "/auth/avatar") {
    event.respondWith(avatarNetworkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request, STATIC_CACHE));
});

self.addEventListener("sync", (event) => {
  if (event.tag === "keepy-sync-bills") {
    event.waitUntil(syncPendingBills().then(notifyClientsUpdated).catch(notifyClientsToSync));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-offline-data") {
    event.waitUntil(clearOfflineData());
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) {
        return fallback;
      }
    }

    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function avatarNetworkFirst(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put("/auth/avatar", response.clone());
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match("/auth/avatar");
    if (cached) {
      return cached;
    }

    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "sync-pending-bills" });
  }
}

async function notifyClientsUpdated() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "pending-bills-updated" });
  }
}

async function syncPendingBills() {
  const pending = await readAllPendingBills();
  if (pending.length === 0) {
    return;
  }

  const response = await fetch("/api/sync/bills", {
    body: JSON.stringify({ bills: pending }),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Sync failed");
  }

  const data = await response.json();
  for (const result of data.results || []) {
    if (result.ok && result.clientId) {
      await deletePendingBill(result.clientId);
    }
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("pages")) db.createObjectStore("pages");
      if (!db.objectStoreNames.contains("monthData"))
        db.createObjectStore("monthData", { keyPath: "key" });
      if (!db.objectStoreNames.contains("pendingBills")) {
        db.createObjectStore("pendingBills", { keyPath: "clientId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAllPendingBills() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("pendingBills", "readonly");
    const request = transaction.objectStore("pendingBills").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
}

async function deletePendingBill(clientId) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("pendingBills", "readwrite");
    const request = transaction.objectStore("pendingBills").delete(clientId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
}

async function clearOfflineData() {
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => key.startsWith("keepy-")).map((key) => caches.delete(key)),
  );
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

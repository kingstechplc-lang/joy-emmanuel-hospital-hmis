// =====================================================================
// SERVICE WORKER — Joy Emmanuel Hospital HMIS
// =====================================================================
// Caches the app shell (HTML, CSS, JS, fonts) for offline access.
// Uses a cache-first strategy for static assets and network-first
// for API requests (falls back to cache when offline).
// =====================================================================

const CACHE_NAME = "jem-hmis-v1";
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/logo.svg",
  "/_next/static/chunks/main-app.js",
];

// Install — cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache what we can — don't fail if some resources aren't available yet
      return cache.addAll(APP_SHELL).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch — handle requests
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET requests (POST, PATCH, DELETE — handled by sync queue)
  if (request.method !== "GET") {
    // Check if this is a mutation that should be queued
    if (request.url.includes("/api/") && (request.method === "POST" || request.method === "PATCH" || request.method === "DELETE")) {
      event.respondWith(handleMutation(request));
    }
    return;
  }

  // For navigation requests (HTML pages) — network first, fall back to cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // For static assets (_next/static) — cache first, fall back to network
  if (request.url.includes("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // For API GET requests — network first, fall back to IndexedDB cache
  if (request.url.includes("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses in the browser cache (short-lived)
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME + "-api").then((cache) => {
              cache.put(request, clone);
              // Clean old entries (keep only last 100)
              cache.keys().then((keys) => {
                if (keys.length > 100) {
                  cache.delete(keys[0]);
                }
              });
            });
          }
          return response;
        })
        .catch(async () => {
          // Try browser cache first
          const cached = await caches.match(request);
          if (cached) return cached;

          // Return a stale-while-revalidate response
          return new Response(
            JSON.stringify({ error: "You are offline. Showing cached data.", offline: true }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        })
    );
    return;
  }

  // Default — try network, fall back to cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ─── Handle mutations when offline ──────────────────────────────
async function handleMutation(request) {
  try {
    // Try to send the request normally
    const response = await fetch(request);
    return response;
  } catch (err) {
    // Network failed — queue the mutation for later sync
    const body = await request.clone().text();
    const queueItem = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2),
      url: request.url,
      method: request.method,
      body: body,
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: Date.now(),
    };

    // Store in IndexedDB via postMessage to the client
    const allClients = await self.clients.matchAll();
    allClients.forEach((client) => {
      client.postMessage({
        type: "QUEUE_MUTATION",
        payload: queueItem,
      });
    });

    // Return a "queued" response
    return new Response(
      JSON.stringify({
        queued: true,
        message: "You are offline. This action has been queued and will be synced when you reconnect.",
        queueId: queueItem.id,
      }),
      { status: 202, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ─── Background Sync — process queued mutations ─────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "jem-hmis-sync") {
    event.waitUntil(processSyncQueue());
  }
});

async function processSyncQueue() {
  const allClients = await self.clients.matchAll();
  allClients.forEach((client) => {
    client.postMessage({ type: "PROCESS_SYNC_QUEUE" });
  });
}

// ─── Message handler ────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

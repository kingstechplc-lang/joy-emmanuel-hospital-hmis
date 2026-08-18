// =====================================================================
// OFFLINE DATA LAYER — IndexedDB + Sync Queue
// =====================================================================
// This module manages:
// 1. Caching API GET responses in IndexedDB for offline reading
// 2. Queuing mutations (POST/PATCH/DELETE) when offline
// 3. Processing the sync queue when back online
// 4. Conflict resolution (last-write-wins with timestamp)
// =====================================================================

const DB_NAME = "jem-hmis-offline";
const DB_VERSION = 1;
const STORE_API_CACHE = "api_cache";      // Cached GET responses
const STORE_MUTATION_QUEUE = "mutation_queue"; // Queued mutations
const STORE_CONFLICTS = "conflicts";       // Unresolved conflicts

// ─── IndexedDB helpers ──────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_API_CACHE)) {
        db.createObjectStore(STORE_API_CACHE, { keyPath: "url" });
      }
      if (!db.objectStoreNames.contains(STORE_MUTATION_QUEUE)) {
        db.createObjectStore(STORE_MUTATION_QUEUE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CONFLICTS)) {
        db.createObjectStore(STORE_CONFLICTS, { keyPath: "id" });
      }
    };
  });
}

async function dbGet<T>(store: string, key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function dbPut(store: string, value: any): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

async function dbGetAll<T>(store: string): Promise<T[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function dbDelete(store: string, key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

// ─── API Response Cache (for offline reading) ───────────────────

export async function cacheApiResponse(url: string, data: any): Promise<void> {
  await dbPut(STORE_API_CACHE, {
    url,
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minute TTL
  });
}

export async function getCachedResponse(url: string): Promise<any | null> {
  const cached = await dbGet<{ url: string; data: any; timestamp: number; expiresAt: number }>(STORE_API_CACHE, url);
  if (!cached) return null;
  // Return cached data even if expired (better stale than nothing when offline)
  return cached.data;
}

export async function clearExpiredCache(): Promise<void> {
  const all = await dbGetAll<{ url: string; expiresAt: number }>(STORE_API_CACHE);
  const now = Date.now();
  for (const item of all) {
    if (item.expiresAt < now) {
      await dbDelete(STORE_API_CACHE, item.url);
    }
  }
}

// ─── Mutation Queue (for offline writes) ────────────────────────

export interface QueuedMutation {
  id: string;
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
  timestamp: number;
  retries: number;
  status: "pending" | "syncing" | "failed" | "conflict";
}

export async function queueMutation(mutation: Omit<QueuedMutation, "id" | "retries" | "status">): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const item: QueuedMutation = {
    ...mutation,
    id,
    retries: 0,
    status: "pending",
  };
  await dbPut(STORE_MUTATION_QUEUE, item);
  return id;
}

export async function getQueuedMutations(): Promise<QueuedMutation[]> {
  const all = await dbGetAll<QueuedMutation>(STORE_MUTATION_QUEUE);
  return all.filter((m) => m.status === "pending" || m.status === "failed").sort((a, b) => a.timestamp - b.timestamp);
}

export async function updateMutationStatus(id: string, status: QueuedMutation["status"]): Promise<void> {
  const item = await dbGet<QueuedMutation>(STORE_MUTATION_QUEUE, id);
  if (item) {
    item.status = status;
    item.retries = (item.retries || 0) + 1;
    await dbPut(STORE_MUTATION_QUEUE, item);
  }
}

export async function removeMutation(id: string): Promise<void> {
  await dbDelete(STORE_MUTATION_QUEUE, id);
}

export async function getQueueCount(): Promise<number> {
  const all = await dbGetAll<QueuedMutation>(STORE_MUTATION_QUEUE);
  return all.filter((m) => m.status === "pending" || m.status === "failed").length;
}

// ─── Sync Processor ─────────────────────────────────────────────

export async function processSyncQueue(): Promise<{ success: number; failed: number; conflicts: number }> {
  const queue = await getQueuedMutations();
  let success = 0;
  let failed = 0;
  let conflicts = 0;

  for (const mutation of queue) {
    try {
      await updateMutationStatus(mutation.id, "syncing");

      const response = await fetch(mutation.url, {
        method: mutation.method,
        headers: {
          "Content-Type": "application/json",
          ...mutation.headers,
        },
        body: mutation.body,
      });

      if (response.ok) {
        await removeMutation(mutation.id);
        success++;
      } else if (response.status === 409) {
        // Conflict — server has a newer version
        await updateMutationStatus(mutation.id, "conflict");
        const conflictData = await response.json().catch(() => ({}));
        await dbPut(STORE_CONFLICTS, {
          id: mutation.id,
          mutation,
          serverResponse: conflictData,
          timestamp: Date.now(),
        });
        conflicts++;
      } else if (mutation.retries >= 3) {
        // Max retries reached — mark as failed permanently
        await updateMutationStatus(mutation.id, "failed");
        failed++;
      } else {
        // Retry later
        await updateMutationStatus(mutation.id, "pending");
        failed++;
      }
    } catch (err) {
      // Network still down — leave in queue for next attempt
      await updateMutationStatus(mutation.id, "pending");
      failed++;
      break; // Stop processing — network is still down
    }
  }

  return { success, failed, conflicts };
}

// ─── Conflict Resolution ────────────────────────────────────────

export async function getConflicts(): Promise<any[]> {
  return dbGetAll(STORE_CONFLICTS);
}

export async function resolveConflict(id: string, resolution: "keep_local" | "keep_server" | "merge", mergedData?: any): Promise<void> {
  const conflict = await dbGet<any>(STORE_CONFLICTS, id);
  if (!conflict) return;

  if (resolution === "keep_local") {
    // Re-send the mutation with force flag
    try {
      const response = await fetch(conflict.mutation.url, {
        method: conflict.mutation.method,
        headers: { "Content-Type": "application/json", ...conflict.mutation.headers, "X-Force-Overwrite": "true" },
        body: mergedData ? JSON.stringify(mergedData) : conflict.mutation.body,
      });
      if (response.ok) {
        await removeMutation(conflict.mutation.id);
        await dbDelete(STORE_CONFLICTS, id);
      }
    } catch {}
  } else if (resolution === "keep_server") {
    // Discard local changes
    await removeMutation(conflict.mutation.id);
    await dbDelete(STORE_CONFLICTS, id);
  } else if (resolution === "merge" && mergedData) {
    // Send merged data
    try {
      const response = await fetch(conflict.mutation.url, {
        method: conflict.mutation.method,
        headers: { "Content-Type": "application/json", ...conflict.mutation.headers },
        body: JSON.stringify(mergedData),
      });
      if (response.ok) {
        await removeMutation(conflict.mutation.id);
        await dbDelete(STORE_CONFLICTS, id);
      }
    } catch {}
  }
}

// ─── Online/Offline Detection ───────────────────────────────────

export function isOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

export function onOnlineStatusChange(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

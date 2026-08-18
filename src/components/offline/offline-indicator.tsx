"use client";

import { useEffect, useState, useCallback } from "react";
import {
  isOnline,
  onOnlineStatusChange,
  getQueueCount,
  processSyncQueue,
  queueMutation,
  type QueuedMutation,
} from "@/lib/offline";
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// ─── Service Worker Registration ────────────────────────────────
export function useServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("Service Worker registered:", reg.scope);
        })
        .catch((err) => {
          console.warn("Service Worker registration failed:", err);
        });
    }
  }, []);
}

// ─── Offline Status Hook ────────────────────────────────────────
export function useOfflineStatus() {
  const [online, setOnline] = useState(isOnline());
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Listen for online/offline events
  useEffect(() => {
    const unsubscribe = onOnlineStatusChange((isOnline) => {
      setOnline(isOnline);
      if (isOnline) {
        // Back online — trigger sync
        handleSync();
      }
    });
    return unsubscribe;
  }, []);

  // Listen for service worker messages (queued mutations)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "QUEUE_MUTATION") {
        const payload = event.data.payload as Omit<QueuedMutation, "id" | "retries" | "status">;
        await queueMutation(payload);
        const count = await getQueueCount();
        setQueueCount(count);
        toast.info(`Action queued for sync (${count} pending)`);
      } else if (event.data?.type === "PROCESS_SYNC_QUEUE") {
        handleSync();
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleMessage);
      return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
    }
  }, []);

  // Check queue count on mount
  useEffect(() => {
    getQueueCount().then(setQueueCount);
  }, []);

  // Process sync queue
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await processSyncQueue();
      if (result.success > 0) {
        toast.success(`Synced ${result.success} action${result.success > 1 ? "s" : ""} successfully`);
      }
      if (result.conflicts > 0) {
        toast.warning(`${result.conflicts} conflict${result.conflicts > 1 ? "s" : ""} detected — review needed`);
      }
      const count = await getQueueCount();
      setQueueCount(count);
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(false);
    }
  }, []);

  return { online, queueCount, syncing, sync: handleSync };
}

// ─── Offline Status Indicator (shown in the topbar) ────────────
export function OfflineIndicator() {
  const { online, queueCount, syncing, sync } = useOfflineStatus();

  if (online && queueCount === 0) {
    return null; // Don't show anything when online and no pending items
  }

  return (
    <div className="flex items-center gap-2">
      {!online && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
          <CloudOff className="w-3.5 h-3.5" />
          Offline
        </div>
      )}
      {queueCount > 0 && (
        <button
          onClick={sync}
          disabled={syncing || !online}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium hover:bg-blue-100 transition disabled:opacity-50"
          title={online ? "Click to sync queued actions" : "Will sync when back online"}
        >
          {syncing ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Cloud className="w-3.5 h-3.5" />
          )}
          {queueCount} pending
        </button>
      )}
    </div>
  );
}

"use client";

// =====================================================================
// DashboardView — main dashboard entry point
// =====================================================================
// Tier 2 Phase 4 — now uses the configurable DashboardCustomizer instead
// of the previous static KPI grid.
//
// The view:
//   1. Shows the welcome header (name + role + date)
//   2. Fetches the user's saved/default layout via /api/dashboard/layout
//   3. Fetches the dashboard stats via /api/dashboard/stats (existing
//      endpoint, unchanged)
//   4. Renders the DashboardCustomizer with both pieces of data
//   5. Auto-saves layout changes via PUT /api/dashboard/layout
//
// BACKWARD COMPATIBILITY:
//   - The /api/dashboard/stats endpoint is unchanged — same 22 KPIs.
//   - The default layout (when no saved layout exists) matches the
//     previous static arrangement, so existing users see no visual
//     change on their first visit after the upgrade.
//   - Users without the `dashboard.customize` permission still see
//     the same dashboard (just without the "Customize" button).
// =====================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { safeJson, PageHeader } from "@/components/ui-helpers";
import { toast } from "sonner";
import {
  Calendar, AlertCircle, RefreshCcw, Loader2, ShieldCheck,
} from "lucide-react";
import { DashboardCustomizer } from "@/components/dashboard/dashboard-customizer";
import type { WidgetPlacement } from "@/lib/dashboard/widget-registry";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

async function sendJson(url: string, method: string, body?: any) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const e = await safeJson(res);
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

export function DashboardView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const queryClient = useQueryClient();

  const role = user?.role || "user";
  const firstName = user?.name?.split(" ")[0] || "User";
  const perms: string[] = user?.permissions || [];
  const isSuperAdmin = user?.roles?.includes("super_admin");
  const has = (p: string) => isSuperAdmin || perms.includes(p);
  const canCustomize = has("dashboard.customize");

  // ─── State ─────────────────────────────────────────────────────────
  const [layout, setLayout] = useState<WidgetPlacement[] | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Data: dashboard stats (existing endpoint, unchanged) ──────────
  const facilityParam = activeFacilityId ? `?facilityId=${activeFacilityId}` : "";
  const { data: stats, isLoading: statsLoading, isError: statsError, isFetching: statsFetching, error, refetch } = useQuery({
    queryKey: ["dashboard-stats", activeFacilityId],
    queryFn: () => fetchJson(`/api/dashboard/stats${facilityParam}`),
    refetchInterval: 30_000, // unchanged from previous behavior
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  // ─── Data: layout (new Tier 2 endpoint) ─────────────────────────────
  const layoutParam = activeFacilityId ? `?facilityId=${activeFacilityId}` : "";
  const {
    data: layoutData,
    isLoading: layoutLoading,
    isError: layoutError,
    refetch: refetchLayout,
  } = useQuery({
    queryKey: ["dashboard-layout", activeFacilityId],
    queryFn: () => fetchJson(`/api/dashboard/layout${layoutParam}`),
    enabled: canCustomize,
    staleTime: 0, // always refetch when the user navigates to the dashboard
  });

  // Initialize layout from fetched data (saved or default)
  useEffect(() => {
    if (layoutData?.layout) {
      setLayout(layoutData.layout);
    } else if (!canCustomize) {
      // Fallback for users without customize permission — show the
      // global default (filtered by their perms). This path doesn't
      // hit the layout endpoint, so we use the widget registry's
      // default layout directly. The widget registry is a shared lib,
      // so we can import it on the client.
      // (We import lazily to avoid bloating the initial bundle.)
      import("@/lib/dashboard/widget-registry").then(({ defaultLayoutForPermissions }) => {
        setLayout(defaultLayoutForPermissions(perms, !!isSuperAdmin));
      });
    }
  }, [layoutData, canCustomize, perms, isSuperAdmin]);

  // ─── Save mutation (debounced) ────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (newLayout: WidgetPlacement[]) =>
      sendJson(`/api/dashboard/layout${layoutParam}`, "PUT", { layout: newLayout }),
    onMutate: () => setSaveState("saving"),
    onSuccess: () => {
      setSaveState("saved");
      // Clear "saved" badge after 2s
      setTimeout(() => setSaveState("idle"), 2000);
      // Invalidate layout query so the saved version is fetched on next visit
      queryClient.invalidateQueries({ queryKey: ["dashboard-layout", activeFacilityId] });
    },
    onError: (err: any) => {
      setSaveState("error");
      toast.error("Failed to save dashboard layout", {
        description: err.message || "Please try again",
      });
      setTimeout(() => setSaveState("idle"), 4000);
    },
  });

  // ─── Debounced save — fires 500ms after the last layout change ────
  const scheduleSave = useCallback(
    (newLayout: WidgetPlacement[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveMutation.mutate(newLayout);
      }, 500);
    },
    [saveMutation]
  );

  const handleSetLayout = useCallback(
    (newLayout: WidgetPlacement[]) => {
      setLayout(newLayout);
      if (editMode) {
        scheduleSave(newLayout);
      }
    },
    [editMode, scheduleSave]
  );

  // ─── Reset to default ──────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    try {
      const result = await sendJson(`/api/dashboard/layout${layoutParam}`, "DELETE", {});
      // Update React Query cache immediately so the init useEffect
      // doesn't overwrite our just-reset layout with stale cached data.
      // Without this, the user would see the OLD layout flash back
      // after reset (the "empty gaps" bug).
      queryClient.setQueryData(
        ["dashboard-layout", activeFacilityId],
        { layout: result.layout, source: result.source || "role_default", layoutId: null }
      );
      setLayout(result.layout);
      setEditMode(false);
      toast.success("Dashboard reset to default");
    } catch (e: any) {
      toast.error("Failed to reset dashboard", { description: e.message });
    }
  }, [layoutParam, activeFacilityId, queryClient]);

  // ─── Toggle edit mode ──────────────────────────────────────────────
  const handleToggleEdit = useCallback(() => {
    setEditMode((prev) => {
      if (prev) {
        // Exiting edit mode — flush any pending save
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          if (layout) saveMutation.mutate(layout);
        }
      }
      return !prev;
    });
  }, [layout, saveMutation]);

  // ─── Render ────────────────────────────────────────────────────────
  if (!canCustomize && !layout) {
    // Loading state for users without customize permission
    return (
      <div className="space-y-6 fade-in-up">
        <Header firstName={firstName} role={role} />
        <Card>
          <CardContent className="p-6 text-center">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" />
            <p className="text-sm text-slate-500 mt-2">Loading dashboard…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (canCustomize && (layoutLoading || !layout)) {
    return (
      <div className="space-y-6 fade-in-up">
        <Header firstName={firstName} role={role} />
        <Card>
          <CardContent className="p-6 text-center">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" />
            <p className="text-sm text-slate-500 mt-2">Loading your dashboard…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (canCustomize && layoutError) {
    return (
      <div className="space-y-6 fade-in-up">
        <Header firstName={firstName} role={role} />
        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm font-semibold text-slate-900 mb-1">
              Failed to load your dashboard layout
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => refetchLayout()}
            >
              <RefreshCcw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in-up">
      <Header firstName={firstName} role={role} />

      {/* Stats error banner — show if /api/dashboard/stats fails */}
      {statsError && (
        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm font-semibold text-slate-900 mb-1">
              Failed to load dashboard stats
            </p>
            <p className="text-xs text-slate-500 mb-3">
              {(error as Error)?.message || "Please try again"}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={statsFetching}
              onClick={() => {
                toast.promise(refetch(), {
                  loading: "Refreshing…",
                  success: "Data refreshed",
                  error: "Failed",
                });
              }}
            >
              {statsFetching ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCcw className="w-3 h-3 mr-1" />
              )}
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* The main customizer */}
      <DashboardCustomizer
        layout={layout || []}
        setLayout={handleSetLayout}
        stats={stats}
        statsLoading={statsLoading}
        editMode={editMode}
        canCustomize={canCustomize}
        onToggleEdit={handleToggleEdit}
        onResetLayout={handleReset}
        onSaveLayout={() => layout && saveMutation.mutate(layout)}
        saveState={saveState}
      />

      {/* If no widgets are visible (empty layout + no quick actions), show a welcome panel */}
      {layout && layout.length === 0 && !canCustomize && (
        <Card>
          <CardContent className="p-12 text-center">
            <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-emerald-500" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              Welcome to Joy Emmanuel Hospital HMIS
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              You are logged in as{" "}
              <strong>
                {role.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </strong>
              . Your dashboard will display relevant statistics and quick actions based on your
              assigned permissions. If you need access to additional modules, please contact your
              system administrator.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Header sub-component (preserved from the previous view) ─────────

function Header({ firstName, role }: { firstName: string; role: string }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          Welcome back, {firstName} 👋
        </h2>
        <p className="text-slate-600 text-sm flex items-center gap-1.5 mt-1">
          <Calendar className="w-3.5 h-3.5 text-rose-500" />
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          <span className="text-slate-300 mx-1">•</span>
          <span className="capitalize">{role.replace(/_/g, " ")}</span>
        </p>
      </div>
    </div>
  );
}

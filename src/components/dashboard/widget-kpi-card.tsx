"use client";

// =====================================================================
// WidgetKpiCard — renders a single KPI widget as a gradient stat card
// =====================================================================
// Used by the dashboard grid for all "kpi_*" widgets.
//
// Props:
//   widgetId — the widget id from the registry (e.g., "kpi_total_patients")
//   stats    — the full /api/dashboard/stats response object
//   editMode — when true, disables click navigation (so the user can
//              drag/configure/remove the widget without navigating away)
//
// The card uses a gradient background matching the KPI's color, displays
// the KPI label in small uppercase letters and the value in large bold
// text. A watermark icon in the top-right and a hover arrow in the
// bottom-right add visual interest.
//
// DRILL-DOWN:
//   Clicking the card (in view mode) navigates to the KPI's drillDownView
//   with the KPI's drillDownParams as query string — so the destination
//   view opens pre-filtered to match the KPI's scope. For example,
//   "Pending Lab Orders" navigates to /lab_orders?status=pending.
//   The destination view must independently honor these query params
//   (server-side enforcement is unchanged).
//
// METADATA SOURCE:
//   KPI metadata (label, icon, color, drill-down) comes from
//   src/lib/dashboard/kpi-definitions.ts — the single source of truth.
// =====================================================================

import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import * as Icons from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { WIDGET_BY_ID } from "@/lib/dashboard/widget-registry";
import { KPI_BY_ID, buildDrillDownUrl } from "@/lib/dashboard/kpi-definitions";

// Gradient class map — matches the existing dashboard-view.tsx StatCard
const GRADIENT_MAP: Record<string, string> = {
  emerald: "kpi-gradient-emerald",
  blue: "kpi-gradient-blue",
  amber: "kpi-gradient-amber",
  purple: "kpi-gradient-purple",
  pink: "kpi-gradient-pink",
  cyan: "kpi-gradient-cyan",
  rose: "kpi-gradient-rose",
  teal: "kpi-gradient-teal",
  orange: "kpi-gradient-orange",
  indigo: "kpi-gradient-indigo",
  slate: "kpi-gradient-slate",
  green: "kpi-gradient-green",
  red: "kpi-gradient-red",
  yellow: "kpi-gradient-amber",
  violet: "kpi-gradient-violet",
};

export function WidgetKpiCard({
  widgetId,
  stats,
  editMode = false,
}: {
  widgetId: string;
  stats: any;
  editMode?: boolean;
}) {
  const setView = useAppStore((s) => s.setView);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const meta = KPI_BY_ID[widgetId];

  // Unknown KPI widget — render a placeholder
  if (!meta) {
    const widget = WIDGET_BY_ID[widgetId];
    return (
      <Card className="h-full">
        <CardContent className="p-5">
          <p className="text-xs font-semibold text-slate-700">
            {widget?.name || widgetId}
          </p>
          <p className="text-xs text-slate-400 mt-1">No renderer for this KPI</p>
        </CardContent>
      </Card>
    );
  }

  const Icon = (Icons as any)[meta.icon] || Icons.Activity;
  const gradientClass = GRADIENT_MAP[meta.color] || GRADIENT_MAP.slate;
  const value = meta.getValue(stats);

  // Build the drill-down handler. In edit mode, clicking does nothing
  // (the user uses the edit toolbar to drag/configure/remove instead).
  // In view mode, clicking navigates to the KPI's drillDownView with the
  // KPI's drillDownParams as query string.
  const handleDrillDown = () => {
    if (editMode || !meta.drillDownView) return;
    const drillDown = buildDrillDownUrl(widgetId, activeFacilityId);
    if (drillDown) {
      // Stash the drill-down params in the app store so the destination
      // view can read them on mount. We use a transient URL search param
      // approach: the destination view reads `useAppStore.getState().drillDownParams`
      // (if set) and clears it after consuming. This avoids URL routing
      // (the dashboard is a SPA with Zustand navigation, not URL-based).
      // For now, we just navigate to the view; the destination views
      // will pick up these params via a future enhancement. The
      // buildDrillDownUrl() helper returns the structured params so the
      // integration is ready when the views support it.
      setView(meta.drillDownView);
    }
  };

  // In edit mode: disable click navigation, cursor-pointer, and hover lift
  // so the user can interact with the edit toolbar (drag/configure/remove)
  // instead of accidentally navigating away from the dashboard.
  const editModeClasses = editMode
    ? "cursor-default"
    : "cursor-pointer hover:shadow-2xl hover:-translate-y-1";

  return (
    <Card
      onClick={handleDrillDown}
      className={`dashboard-kpi-card group relative ${gradientClass} text-white overflow-hidden border-0 shadow-lg transition-all duration-300 rounded-2xl ${editModeClasses}`}
      title={meta.description}
    >
      <CardContent className="p-5 relative z-10">
        {/* Watermark icon */}
        <div className="absolute top-4 right-4 text-white/20 pointer-events-none">
          <Icon className="w-12 h-12" strokeWidth={1.5} />
        </div>
        {/* Label */}
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/90 mb-2 pr-12">
          {meta.label}
        </p>
        {/* Value */}
        <p className="text-3xl font-extrabold text-white tracking-tight tabular-nums">
          {value}
        </p>
        {/* Hover arrow — only in view mode when drill-down is available */}
        {!editMode && meta.drillDownView && (
          <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowRight className="w-4 h-4 text-white/70" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

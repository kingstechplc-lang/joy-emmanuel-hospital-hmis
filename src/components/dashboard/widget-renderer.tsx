"use client";

// =====================================================================
// WidgetRenderer — dispatches to the right widget component based on
// the widgetId from the registry.
// =====================================================================
// This is the single entry point the dashboard grid uses to render a
// widget. It looks up the widgetId prefix and delegates to the right
// component:
//
//   kpi_*           → WidgetKpiCard
//   list_recent_patients → WidgetRecentPatients
//   list_ward_occupancy  → WidgetWardOccupancy
//   list_pending_tasks   → WidgetPendingTasks
//   panel_quick_actions → WidgetQuickActions
//
// Unknown widgetId → renders a "no renderer" placeholder card.
//
// Props:
//   widgetId  — the widget id from the registry
//   stats     — the full /api/dashboard/stats response object
//   isLoading — whether the stats are still loading
//   config    — per-instance config overrides from the layout
//   onConfigure — callback to open the widget's config dialog
// =====================================================================

import { WidgetKpiCard } from "./widget-kpi-card";
import { WidgetRecentPatients } from "./widget-recent-patients";
import { WidgetWardOccupancy } from "./widget-ward-occupancy";
import { WidgetPendingTasks } from "./widget-pending-tasks";
import { WidgetQuickActions } from "./widget-quick-actions";
import { WidgetBatchOperations } from "./widget-batch-operations";
import { WidgetNoticeBoard } from "./widget-notice-board";
import { Card, CardContent } from "@/components/ui/card";
import { WIDGET_BY_ID } from "@/lib/dashboard/widget-registry";

export function WidgetRenderer({
  widgetId,
  stats,
  isLoading,
  config,
  editMode = false,
  onConfigure,
}: {
  widgetId: string;
  stats: any;
  isLoading: boolean;
  config: { maxItems?: number; dateRange?: string; facilityScope?: string };
  editMode?: boolean;
  onConfigure?: () => void;
}) {
  // Dispatch based on widgetId prefix / exact match
  if (widgetId.startsWith("kpi_")) {
    return <WidgetKpiCard widgetId={widgetId} stats={stats} editMode={editMode} />;
  }

  if (widgetId === "list_recent_patients") {
    return (
      <WidgetRecentPatients
        stats={stats}
        isLoading={isLoading}
        config={config}
        onConfigure={onConfigure}
      />
    );
  }

  if (widgetId === "list_ward_occupancy") {
    return (
      <WidgetWardOccupancy
        stats={stats}
        isLoading={isLoading}
        config={config}
        onConfigure={onConfigure}
      />
    );
  }

  if (widgetId === "list_pending_tasks") {
    return (
      <WidgetPendingTasks
        stats={stats}
        isLoading={isLoading}
        config={config}
        onConfigure={onConfigure}
      />
    );
  }

  if (widgetId === "panel_quick_actions") {
    return <WidgetQuickActions />;
  }

  if (widgetId === "panel_batch_operations") {
    return (
      <WidgetBatchOperations
        stats={stats}
        isLoading={isLoading}
        config={config}
      />
    );
  }

  if (widgetId === "panel_notice_board") {
    return <WidgetNoticeBoard />;
  }

  // Unknown widget — placeholder
  const widget = WIDGET_BY_ID[widgetId];
  return (
    <Card className="h-full">
      <CardContent className="p-5">
        <p className="text-xs font-semibold text-slate-700">
          {widget?.name || widgetId}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          No renderer registered for this widget type.
        </p>
      </CardContent>
    </Card>
  );
}

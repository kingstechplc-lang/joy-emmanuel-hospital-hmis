"use client";

// =====================================================================
// WidgetKpiCard — renders a single KPI widget as a gradient stat card
// =====================================================================
// Used by the dashboard grid for all "kpi_*" widgets.
//
// Props:
//   widgetId — the widget id from the registry (e.g., "kpi_total_patients")
//   stats    — the full /api/dashboard/stats response object
//   onDrillDown — called when the user clicks the card; receives the
//                  target view key (e.g., "patients") to navigate to
//
// The card uses a gradient background matching the KPI's color, displays
// the KPI label in small uppercase letters and the value in large bold
// text. A watermark icon in the top-right and a hover arrow in the
// bottom-right add visual interest.
// =====================================================================

import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import * as Icons from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { WIDGET_BY_ID } from "@/lib/dashboard/widget-registry";

// ─── KPI metadata (mirrors the existing dashboard-view.tsx ALL_KPIs) ──
// This is a thin lookup that maps widgetId → { label, icon, color, view,
// getValue } so the KPI card knows how to render. The widget registry
// already declares these as dataSourceKey; this map provides the
// presentation layer (icon, color, drill-down view).
// ────────────────────────────────────────────────────────────────────

type KpiMeta = {
  label: string;
  icon: keyof typeof Icons;
  color: string;
  view: string;
  getValue: (stats: any) => any;
};

const KPI_META: Record<string, KpiMeta> = {
  kpi_total_patients: {
    label: "Total Patients",
    icon: "Users",
    color: "emerald",
    view: "patients",
    getValue: (s) => s?.totalPatients ?? "—",
  },
  kpi_today_encounters: {
    label: "Today's Encounters",
    icon: "Activity",
    color: "blue",
    view: "encounters",
    getValue: (s) => s?.todayEncounters ?? "—",
  },
  kpi_today_new_patients: {
    label: "New Patients Today",
    icon: "UserPlus",
    color: "purple",
    view: "patients",
    getValue: (s) => s?.todayNewPatients ?? "—",
  },
  kpi_today_appointments: {
    label: "Today's Appointments",
    icon: "Calendar",
    color: "cyan",
    view: "appointments",
    getValue: (s) => s?.todayAppointments ?? "—",
  },
  kpi_active_admissions: {
    label: "Active Admissions",
    icon: "BedDouble",
    color: "amber",
    view: "admissions",
    getValue: (s) => s?.activeAdmissions ?? "—",
  },
  kpi_bed_occupancy: {
    label: "Bed Occupancy",
    icon: "BedDouble",
    color: "teal",
    view: "beds",
    getValue: (s) => (s?.bedOccupancy != null ? `${s.bedOccupancy}%` : "—"),
  },
  kpi_today_discharges: {
    label: "Today's Discharges",
    icon: "BedDouble",
    color: "indigo",
    view: "discharges",
    getValue: (s) => s?.todayDischarges ?? "—",
  },
  kpi_today_procedures: {
    label: "Procedures Done Today",
    icon: "Activity",
    color: "purple",
    view: "procedures",
    getValue: (s) => s?.todayCompletedProcedures ?? "—",
  },
  kpi_pending_lab_orders: {
    label: "Pending Lab Orders",
    icon: "FlaskConical",
    color: "purple",
    view: "lab_orders",
    getValue: (s) => s?.pendingLabOrders ?? "—",
  },
  kpi_pending_imaging: {
    label: "Pending Imaging",
    icon: "ScanLine",
    color: "cyan",
    view: "imaging",
    getValue: (s) => s?.pendingImagingOrders ?? "—",
  },
  kpi_pending_prescriptions: {
    label: "Pending Prescriptions",
    icon: "Pill",
    color: "pink",
    view: "prescriptions",
    getValue: (s) => s?.pendingPrescriptions ?? "—",
  },
  kpi_pending_referrals: {
    label: "Pending Referrals",
    icon: "ArrowRight",
    color: "blue",
    view: "referrals",
    getValue: (s) => s?.pendingReferrals ?? "—",
  },
  kpi_outstanding_invoices: {
    label: "Outstanding Invoices",
    icon: "Receipt",
    color: "rose",
    view: "billing_invoices",
    getValue: (s) => s?.outstandingInvoices ?? "—",
  },
  kpi_today_revenue: {
    label: "Today's Revenue (GHS)",
    icon: "TrendingUp",
    color: "emerald",
    view: "billing_payments",
    getValue: (s) =>
      s?.todayRevenue != null
        ? Number(s.todayRevenue).toLocaleString("en-GB", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : "—",
  },
  kpi_low_stock: {
    label: "Low Stock Items",
    icon: "AlertTriangle",
    color: "orange",
    view: "inventory",
    getValue: (s) => s?.lowStockItems ?? "—",
  },
  kpi_pending_tasks: {
    label: "Pending Tasks",
    icon: "CheckSquare",
    color: "amber",
    view: "tasks",
    getValue: (s) => s?.pendingTasksCount ?? "—",
  },
  kpi_total_users: {
    label: "Total Users",
    icon: "UserCog",
    color: "blue",
    view: "settings_users",
    getValue: (s) => s?.totalUsers ?? "—",
  },
  kpi_recent_audit: {
    label: "Recent Audit Events",
    icon: "ScrollText",
    color: "teal",
    view: "audit_logs",
    getValue: (s) => s?.recentAuditCount ?? "—",
  },
};

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
  const meta = KPI_META[widgetId];

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

  // In edit mode: disable click navigation, cursor-pointer, and hover lift
  // so the user can interact with the edit toolbar (drag/configure/remove)
  // instead of accidentally navigating away from the dashboard.
  const editModeClasses = editMode
    ? "cursor-default"
    : "cursor-pointer hover:shadow-2xl hover:-translate-y-1";

  return (
    <Card
      onClick={editMode ? undefined : () => setView(meta.view as any)}
      className={`dashboard-kpi-card group relative ${gradientClass} text-white overflow-hidden border-0 shadow-lg transition-all duration-300 rounded-2xl ${editModeClasses}`}
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
        {/* Hover arrow — only in view mode */}
        {!editMode && (
          <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowRight className="w-4 h-4 text-white/70" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

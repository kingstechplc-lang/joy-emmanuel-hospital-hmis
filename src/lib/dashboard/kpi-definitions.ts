// =====================================================================
// KPI DEFINITIONS — Central KPI metadata for the HMIS
// =====================================================================
// This is the single source of truth for KPI display metadata across
// the dashboard, reports, and any other place that renders KPIs.
//
// Each KPI definition includes:
//   - id: matches the widget id in widget-registry.ts (e.g., "kpi_today_encounters")
//   - label: human-readable label (used in cards, reports, charts)
//   - description: short explanation (used in tooltips + reports)
//   - category: same categories as widgets (CLINICAL, FINANCE, etc.)
//   - icon: lucide-react icon name
//   - color: gradient color name (kpi-gradient-{color})
//   - dataSourceKey: which key in /api/dashboard/stats response holds
//     the value (e.g., "todayEncounters")
//   - drillDownView: the ViewKey to navigate to when the KPI card is clicked
//   - drillDownParams: optional query params to pass to the destination
//     view (e.g., { status: "pending" }) so it opens pre-filtered to
//     match the KPI's scope
//   - getValue: extracts the value from the stats response object
//
// WHY THIS EXISTS:
// Before Phase 5, the KPI metadata was duplicated in:
//   1. src/components/views/dashboard-view.tsx (the old ALL_KPIs array)
//   2. src/components/dashboard/widget-kpi-card.tsx (KPI_META map)
// If a label changed, you had to update both. Reports couldn't reuse the
// same definitions. Now there's one source of truth — the widget-kpi-card
// imports from here, future reports can import from here, and the
// metadata stays in sync.
// =====================================================================

import type { ViewKey } from "@/stores/app-store";

export type KpiCategory =
  | "CLINICAL"
  | "WORKFLOW"
  | "FINANCE"
  | "INVENTORY"
  | "OPERATIONS"
  | "MANAGEMENT"
  | "PERSONAL"
  | "ALERTS";

export interface KpiDefinition {
  /** Stable unique id (matches the widget id in widget-registry.ts). */
  id: string;
  /** Human-readable label shown on the card + in reports. */
  label: string;
  /** Short description for tooltips + report footnotes. */
  description: string;
  /** Category for grouping. */
  category: KpiCategory;
  /** lucide-react icon name. */
  icon: string;
  /** Gradient color name (kpi-gradient-{color}). */
  color: string;
  /** Required permission codes — user must have ALL of them to see the KPI. */
  requiredPermissions: string[];
  /** Which key in /api/dashboard/stats response holds the value. */
  dataSourceKey: string;
  /** View to navigate to when the KPI card is clicked (drill-down). */
  drillDownView?: ViewKey;
  /**
   * Optional query params to pass to the destination view so it opens
   * pre-filtered to match the KPI's scope. For example, "Pending Lab
   * Orders" KPI navigates to lab_orders view with { status: "pending" }.
   */
  drillDownParams?: Record<string, string | number | boolean>;
  /** Extracts the display value from the stats response. */
  getValue: (stats: any) => string | number;
}

// ─── KPI Definitions ────────────────────────────────────────────────
//
// NOTE: The metadata here MUST stay in sync with the widget registry
// (src/lib/dashboard/widget-registry.ts). The widget registry declares
// the widget shell (id, defaultSize, refreshMs); this file declares
// the KPI presentation (label, icon, color, drill-down).
// ────────────────────────────────────────────────────────────────────

export const KPI_DEFINITIONS: KpiDefinition[] = [
  // ─── CLINICAL ──────────────────────────────────────────────────────
  {
    id: "kpi_total_patients",
    label: "Total Patients",
    description: "Organization-wide active patient count",
    category: "CLINICAL",
    icon: "Users",
    color: "emerald",
    requiredPermissions: ["patient.view"],
    dataSourceKey: "totalPatients",
    drillDownView: "patients",
    drillDownParams: { status: "active" },
    getValue: (s) => s?.totalPatients ?? "—",
  },
  {
    id: "kpi_today_encounters",
    label: "Today's Encounters",
    description: "Encounters started today at the active facility",
    category: "CLINICAL",
    icon: "Activity",
    color: "blue",
    requiredPermissions: ["encounter.view"],
    dataSourceKey: "todayEncounters",
    drillDownView: "encounters",
    drillDownParams: { dateRange: "today" },
    getValue: (s) => s?.todayEncounters ?? "—",
  },
  {
    id: "kpi_today_new_patients",
    label: "New Patients Today",
    description: "Patients registered today (org-wide)",
    category: "CLINICAL",
    icon: "UserPlus",
    color: "purple",
    requiredPermissions: ["patient.view"],
    dataSourceKey: "todayNewPatients",
    drillDownView: "patients",
    drillDownParams: { dateRange: "today" },
    getValue: (s) => s?.todayNewPatients ?? "—",
  },
  {
    id: "kpi_today_appointments",
    label: "Today's Appointments",
    description: "Appointments scheduled for today at the active facility",
    category: "CLINICAL",
    icon: "Calendar",
    color: "cyan",
    requiredPermissions: ["appointment.view"],
    dataSourceKey: "todayAppointments",
    drillDownView: "appointments",
    drillDownParams: { dateRange: "today" },
    getValue: (s) => s?.todayAppointments ?? "—",
  },
  {
    id: "kpi_active_admissions",
    label: "Active Admissions",
    description: "Currently admitted inpatients at the active facility",
    category: "CLINICAL",
    icon: "BedDouble",
    color: "amber",
    requiredPermissions: ["admission.view"],
    dataSourceKey: "activeAdmissions",
    drillDownView: "admissions",
    drillDownParams: { status: "admitted" },
    getValue: (s) => s?.activeAdmissions ?? "—",
  },
  {
    id: "kpi_bed_occupancy",
    label: "Bed Occupancy",
    description: "Occupied vs total beds at the active facility",
    category: "CLINICAL",
    icon: "BedDouble",
    color: "teal",
    requiredPermissions: ["bed.manage"],
    dataSourceKey: "bedOccupancy",
    drillDownView: "beds",
    drillDownParams: { status: "occupied" },
    getValue: (s) => (s?.bedOccupancy != null ? `${s.bedOccupancy}%` : "—"),
  },
  {
    id: "kpi_today_discharges",
    label: "Today's Discharges",
    description: "Discharges completed today at the active facility",
    category: "CLINICAL",
    icon: "BedDouble",
    color: "indigo",
    requiredPermissions: ["admission.view"],
    dataSourceKey: "todayDischarges",
    drillDownView: "discharges",
    drillDownParams: { dateRange: "today" },
    getValue: (s) => s?.todayDischarges ?? "—",
  },
  {
    id: "kpi_today_procedures",
    label: "Procedures Done Today",
    description: "Procedures completed today at the active facility",
    category: "CLINICAL",
    icon: "Activity",
    color: "purple",
    requiredPermissions: ["procedure.view"],
    dataSourceKey: "todayCompletedProcedures",
    drillDownView: "procedures",
    drillDownParams: { dateRange: "today", status: "completed" },
    getValue: (s) => s?.todayCompletedProcedures ?? "—",
  },
  {
    id: "kpi_pending_referrals",
    label: "Pending Referrals",
    description: "Referrals awaiting action at the active facility",
    category: "CLINICAL",
    icon: "ArrowRight",
    color: "blue",
    requiredPermissions: ["clinical.view"],
    dataSourceKey: "pendingReferrals",
    drillDownView: "referrals",
    drillDownParams: { status: "pending" },
    getValue: (s) => s?.pendingReferrals ?? "—",
  },

  // ─── WORKFLOW / DIAGNOSTICS ────────────────────────────────────────
  {
    id: "kpi_pending_lab_orders",
    label: "Pending Lab Orders",
    description: "Lab orders not yet resulted",
    category: "WORKFLOW",
    icon: "FlaskConical",
    color: "purple",
    requiredPermissions: ["lab.view"],
    dataSourceKey: "pendingLabOrders",
    drillDownView: "lab_orders",
    drillDownParams: { status: "pending" },
    getValue: (s) => s?.pendingLabOrders ?? "—",
  },
  {
    id: "kpi_pending_imaging",
    label: "Pending Imaging",
    description: "Imaging orders awaiting completion",
    category: "WORKFLOW",
    icon: "ScanLine",
    color: "cyan",
    requiredPermissions: ["imaging.view"],
    dataSourceKey: "pendingImagingOrders",
    drillDownView: "imaging",
    drillDownParams: { status: "pending" },
    getValue: (s) => s?.pendingImagingOrders ?? "—",
  },
  {
    id: "kpi_pending_prescriptions",
    label: "Pending Prescriptions",
    description: "Prescriptions awaiting dispense",
    category: "WORKFLOW",
    icon: "Pill",
    color: "pink",
    requiredPermissions: ["pharmacy.view"],
    dataSourceKey: "pendingPrescriptions",
    drillDownView: "prescriptions",
    drillDownParams: { status: "pending" },
    getValue: (s) => s?.pendingPrescriptions ?? "—",
  },
  {
    id: "kpi_pending_tasks",
    label: "Pending Tasks",
    description: "Tasks assigned to you that are pending or in-progress",
    category: "WORKFLOW",
    icon: "CheckSquare",
    color: "amber",
    requiredPermissions: ["task.assign"],
    dataSourceKey: "pendingTasksCount",
    drillDownView: "tasks",
    drillDownParams: { status: "pending", assignedToMe: true },
    getValue: (s) => s?.pendingTasksCount ?? "—",
  },

  // ─── FINANCE ───────────────────────────────────────────────────────
  {
    id: "kpi_outstanding_invoices",
    label: "Outstanding Invoices",
    description: "Invoices that are issued or partially paid",
    category: "FINANCE",
    icon: "Receipt",
    color: "rose",
    requiredPermissions: ["billing.view"],
    dataSourceKey: "outstandingInvoices",
    drillDownView: "billing_invoices",
    drillDownParams: { status: "issued" },
    getValue: (s) => s?.outstandingInvoices ?? "—",
  },
  {
    id: "kpi_today_revenue",
    label: "Today's Revenue (GHS)",
    description: "Payments received today at the active facility",
    category: "FINANCE",
    icon: "TrendingUp",
    color: "emerald",
    requiredPermissions: ["billing.view"],
    dataSourceKey: "todayRevenue",
    drillDownView: "billing_payments",
    drillDownParams: { dateRange: "today", status: "completed" },
    getValue: (s) =>
      s?.todayRevenue != null
        ? Number(s.todayRevenue).toLocaleString("en-GB", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : "—",
  },

  // ─── INVENTORY ─────────────────────────────────────────────────────
  {
    id: "kpi_low_stock",
    label: "Low Stock Items",
    description: "Inventory items at or below minimum quantity",
    category: "INVENTORY",
    icon: "AlertTriangle",
    color: "orange",
    requiredPermissions: ["inventory.view"],
    dataSourceKey: "lowStockItems",
    drillDownView: "inventory",
    drillDownParams: { filter: "low_stock" },
    getValue: (s) => s?.lowStockItems ?? "—",
  },

  // ─── MANAGEMENT ────────────────────────────────────────────────────
  {
    id: "kpi_total_users",
    label: "Total Users",
    description: "Active user accounts in the organization",
    category: "MANAGEMENT",
    icon: "UserCog",
    color: "blue",
    requiredPermissions: ["user.view"],
    dataSourceKey: "totalUsers",
    drillDownView: "settings_users",
    drillDownParams: { status: "active" },
    getValue: (s) => s?.totalUsers ?? "—",
  },
  {
    id: "kpi_recent_audit",
    label: "Recent Audit Events",
    description: "Audit log entries in the last 24 hours",
    category: "MANAGEMENT",
    icon: "ScrollText",
    color: "teal",
    requiredPermissions: ["audit.view"],
    dataSourceKey: "recentAuditCount",
    drillDownView: "audit_logs",
    drillDownParams: { dateRange: "24h" },
    getValue: (s) => s?.recentAuditCount ?? "—",
  },
];

// ─── Lookup maps ────────────────────────────────────────────────────

/** Map by id for O(1) lookup. */
export const KPI_BY_ID: Record<string, KpiDefinition> = Object.fromEntries(
  KPI_DEFINITIONS.map((k) => [k.id, k])
);

/** KPIs available to a user given their permission list. */
export function kpisForPermissions(
  perms: string[],
  isSuperAdmin: boolean
): KpiDefinition[] {
  if (isSuperAdmin) return KPI_DEFINITIONS;
  return KPI_DEFINITIONS.filter((k) =>
    k.requiredPermissions.every((p) => perms.includes(p))
  );
}

/** Build the drill-down URL (view + query string) for a KPI. */
export function buildDrillDownUrl(
  kpiId: string,
  facilityId?: string | null
): { view: ViewKey; params: Record<string, string | number | boolean> } | null {
  const kpi = KPI_BY_ID[kpiId];
  if (!kpi?.drillDownView) return null;
  const params: Record<string, string | number | boolean> = {
    ...(kpi.drillDownParams || {}),
  };
  if (facilityId) params.facilityId = facilityId;
  return { view: kpi.drillDownView, params };
}

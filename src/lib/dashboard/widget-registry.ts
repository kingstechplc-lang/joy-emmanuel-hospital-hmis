// =====================================================================
// DASHBOARD WIDGET REGISTRY — Tier 2 Phase 2
// =====================================================================
// Single source of truth for all dashboard widgets.
//
// A "widget" is a self-contained card on the dashboard that:
//   - Has a unique id
//   - Has a category (Clinical, Workflow, Finance, Inventory, Operations,
//     Management, Personal, Alerts)
//   - Has one or more required permissions — the user must have ALL of
//     them for the widget to be available
//   - Has a default size (in grid units; grid is 12 columns wide)
//   - Has a data source (which KPI key from /api/dashboard/stats it reads
//     from, or a custom endpoint)
//   - Has an optional configuration schema (dateRange, maxItems, facilityScope)
//   - Has a renderer (the React component that draws the card content
//     given the fetched data)
//
// The dashboard view (src/components/views/dashboard-view.tsx) consumes
// this registry to:
//   - Render the user's saved layout (which widget instances they have
//     placed, in what position/size)
//   - Render the "Add Widget" picker (showing only widgets the user has
//     permission to add)
//   - Render each widget's content via its registered renderer
//
// The /api/dashboard/layout endpoint stores the user's placements in the
// DashboardLayout table; this registry declares what widgets are available
// for placement.
//
// IMPORTANT: This is a PURE registry — no React, no fetch, no DB. It's
// importable from server code (for permission validation) and from
// client code (for rendering).
// =====================================================================

// ─── Types ──────────────────────────────────────────────────────────

export type WidgetCategory =
  | "CLINICAL"
  | "WORKFLOW"
  | "FINANCE"
  | "INVENTORY"
  | "OPERATIONS"
  | "MANAGEMENT"
  | "PERSONAL"
  | "ALERTS";

export type WidgetSize = "sm" | "md" | "lg" | "xl";

export type WidgetConfigSchema = {
  dateRange?: {
    type: "enum";
    options: ("today" | "7d" | "30d" | "month" | "quarter" | "year")[];
    default: "today" | "7d" | "30d" | "month" | "quarter" | "year";
  };
  maxItems?: {
    type: "number";
    min: number;
    max: number;
    default: number;
  };
  facilityScope?: {
    type: "enum";
    options: ("all" | "current")[];
    default: "all" | "current";
  };
};

export interface WidgetDefinition {
  /** Stable unique id (snake_case). Used in DB layout JSON + API. */
  id: string;
  /** Human-readable name shown in the Add Widget picker. */
  name: string;
  /** Short description shown under the name in the picker. */
  description: string;
  /** Category for grouping in the picker. */
  category: WidgetCategory;
  /**
   * Required permission codes (from src/lib/permissions.ts). User must
   * have ALL of them to add this widget to their layout. Super-admin
   * bypasses (handled in the dashboard view via `has()` helper).
   */
  requiredPermissions: string[];
  /**
   * Which KPI key from /api/dashboard/stats this widget reads. If the
   * widget needs a custom endpoint, leave this null and use customDataSource.
   */
  dataSourceKey?: string;
  /**
   * Default grid placement (12-col grid). x=column, y=row, w=width, h=height.
   * Used when the user adds a widget without specifying a position.
   */
  defaultSize: { w: number; h: number };
  /** Supported sizes for the resize control. */
  supportedSizes: WidgetSize[];
  /** Optional configuration schema for the widget's settings dialog. */
  configSchema?: WidgetConfigSchema;
  /** Default refresh interval in milliseconds (0 = no auto-refresh). */
  defaultRefreshMs: number;
  /**
   * Whether this widget is enabled in the registry. Disabled widgets
   * are hidden from the picker and any saved instances are skipped at
   * render time. Useful for feature-flagging new widgets.
   */
  enabled: boolean;
}

// ─── Registry ────────────────────────────────────────────────────────
//
// The widgets below mirror the KPI definitions in the existing
// dashboard-view.tsx `ALL_KPIs` array. Each KPI becomes a small widget
// (default w=2, h=1 in a 12-col grid). We also add several new
// "list"-style widgets that were previously hard-coded sections
// (Recent Patients, Ward Occupancy, Pending Tasks, Quick Actions).
// ────────────────────────────────────────────────────────────────────

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // ─── CLINICAL ──────────────────────────────────────────────────────
  {
    id: "kpi_total_patients",
    name: "Total Patients",
    description: "Organization-wide active patient count",
    category: "CLINICAL",
    requiredPermissions: ["patient.view"],
    dataSourceKey: "totalPatients",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 60_000,
    enabled: true,
  },
  {
    id: "kpi_today_encounters",
    name: "Today's Encounters",
    description: "Encounters started today at the active facility",
    category: "CLINICAL",
    requiredPermissions: ["encounter.view"],
    dataSourceKey: "todayEncounters",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 30_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d", "month", "quarter"],
        default: "today",
      },
    },
    enabled: true,
  },
  {
    id: "kpi_today_new_patients",
    name: "New Patients Today",
    description: "Patients registered today (org-wide)",
    category: "CLINICAL",
    requiredPermissions: ["patient.view"],
    dataSourceKey: "todayNewPatients",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 30_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d", "month"],
        default: "today",
      },
    },
    enabled: true,
  },
  {
    id: "kpi_today_appointments",
    name: "Today's Appointments",
    description: "Appointments scheduled for today at the active facility",
    category: "CLINICAL",
    requiredPermissions: ["appointment.view"],
    dataSourceKey: "todayAppointments",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 30_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d"],
        default: "today",
      },
    },
    enabled: true,
  },
  {
    id: "kpi_active_admissions",
    name: "Active Admissions",
    description: "Currently admitted inpatients at the active facility",
    category: "CLINICAL",
    requiredPermissions: ["admission.view"],
    dataSourceKey: "activeAdmissions",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 60_000,
    enabled: true,
  },
  {
    id: "kpi_bed_occupancy",
    name: "Bed Occupancy",
    description: "Occupied vs total beds at the active facility",
    category: "CLINICAL",
    requiredPermissions: ["bed.manage"],
    dataSourceKey: "bedOccupancy",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 60_000,
    enabled: true,
  },
  {
    id: "kpi_today_discharges",
    name: "Today's Discharges",
    description: "Discharges completed today at the active facility",
    category: "CLINICAL",
    requiredPermissions: ["admission.view"],
    dataSourceKey: "todayDischarges",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 60_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d", "month"],
        default: "today",
      },
    },
    enabled: true,
  },
  {
    id: "kpi_today_procedures",
    name: "Procedures Done Today",
    description: "Procedures completed today at the active facility",
    category: "CLINICAL",
    requiredPermissions: ["procedure.view"],
    dataSourceKey: "todayCompletedProcedures",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 60_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d", "month"],
        default: "today",
      },
    },
    enabled: true,
  },
  {
    id: "kpi_pending_referrals",
    name: "Pending Referrals",
    description: "Referrals awaiting action at the active facility",
    category: "CLINICAL",
    requiredPermissions: ["clinical.view"],
    dataSourceKey: "pendingReferrals",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 30_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d"],
        default: "today",
      },
    },
    enabled: true,
  },

  // ─── WORKFLOW / DIAGNOSTICS ────────────────────────────────────────
  {
    id: "kpi_pending_lab_orders",
    name: "Pending Lab Orders",
    description: "Lab orders not yet resulted",
    category: "WORKFLOW",
    requiredPermissions: ["lab.view"],
    dataSourceKey: "pendingLabOrders",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 30_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d"],
        default: "today",
      },
    },
    enabled: true,
  },
  {
    id: "kpi_pending_imaging",
    name: "Pending Imaging",
    description: "Imaging orders awaiting completion",
    category: "WORKFLOW",
    requiredPermissions: ["imaging.view"],
    dataSourceKey: "pendingImagingOrders",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 30_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d"],
        default: "today",
      },
    },
    enabled: true,
  },
  {
    id: "kpi_pending_prescriptions",
    name: "Pending Prescriptions",
    description: "Prescriptions awaiting dispense",
    category: "WORKFLOW",
    requiredPermissions: ["pharmacy.view"],
    dataSourceKey: "pendingPrescriptions",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 30_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d"],
        default: "today",
      },
    },
    enabled: true,
  },
  {
    id: "kpi_pending_tasks",
    name: "Pending Tasks",
    description: "Tasks assigned to you that are pending or in-progress",
    category: "WORKFLOW",
    requiredPermissions: ["task.assign"],
    dataSourceKey: "pendingTasksCount",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 30_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d"],
        default: "today",
      },
    },
    enabled: true,
  },
  {
    id: "list_pending_tasks",
    name: "My Pending Tasks",
    description: "Detailed list of tasks assigned to you (up to 5)",
    category: "WORKFLOW",
    requiredPermissions: ["task.assign"],
    dataSourceKey: "pendingTasks",
    defaultSize: { w: 12, h: 2 },
    supportedSizes: ["md", "lg", "xl"],
    configSchema: {
      maxItems: { type: "number", min: 1, max: 20, default: 5 },
    },
    defaultRefreshMs: 30_000,
    enabled: true,
  },

  // ─── FINANCE ───────────────────────────────────────────────────────
  {
    id: "kpi_outstanding_invoices",
    name: "Outstanding Invoices",
    description: "Invoices that are issued or partially paid",
    category: "FINANCE",
    requiredPermissions: ["billing.view"],
    dataSourceKey: "outstandingInvoices",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 60_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d", "month"],
        default: "today",
      },
    },
    enabled: true,
  },
  {
    id: "kpi_today_revenue",
    name: "Today's Revenue (GHS)",
    description: "Payments received today at the active facility",
    category: "FINANCE",
    requiredPermissions: ["billing.view"],
    dataSourceKey: "todayRevenue",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 60_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d", "month", "quarter", "year"],
        default: "today",
      },
    },
    enabled: true,
  },

  // ─── INVENTORY ─────────────────────────────────────────────────────
  {
    id: "kpi_low_stock",
    name: "Low Stock Items",
    description: "Inventory items at or below minimum quantity",
    category: "INVENTORY",
    requiredPermissions: ["inventory.view"],
    dataSourceKey: "lowStockItems",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 120_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d", "30d"],
        default: "today",
      },
    },
    enabled: true,
  },

  // ─── OPERATIONS ────────────────────────────────────────────────────
  {
    id: "list_recent_patients",
    name: "Recent Patients",
    description: "Latest registered patients across the organization",
    category: "OPERATIONS",
    requiredPermissions: ["patient.view"],
    dataSourceKey: "recentPatients",
    defaultSize: { w: 8, h: 3 },
    supportedSizes: ["md", "lg", "xl"],
    configSchema: {
      maxItems: { type: "number", min: 1, max: 20, default: 6 },
    },
    defaultRefreshMs: 60_000,
    enabled: true,
  },
  {
    id: "list_ward_occupancy",
    name: "Ward Occupancy",
    description: "Per-ward bed utilization bars (up to 6 wards)",
    category: "OPERATIONS",
    requiredPermissions: ["admission.view"],
    dataSourceKey: "wardOccupancy",
    defaultSize: { w: 4, h: 3 },
    supportedSizes: ["md", "lg"],
    configSchema: {
      maxItems: { type: "number", min: 1, max: 12, default: 6 },
    },
    defaultRefreshMs: 60_000,
    enabled: true,
  },

  // ─── MANAGEMENT ────────────────────────────────────────────────────
  {
    id: "kpi_total_users",
    name: "Total Users",
    description: "Active user accounts in the organization",
    category: "MANAGEMENT",
    requiredPermissions: ["user.view"],
    dataSourceKey: "totalUsers",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 300_000,
    enabled: true,
  },
  {
    id: "kpi_recent_audit",
    name: "Recent Audit Events",
    description: "Audit log entries in the last 24 hours",
    category: "MANAGEMENT",
    requiredPermissions: ["audit.view"],
    dataSourceKey: "recentAuditCount",
    defaultSize: { w: 3, h: 1 },
    supportedSizes: ["sm", "md"],
    defaultRefreshMs: 60_000,
    configSchema: {
      dateRange: {
        type: "enum",
        options: ["today", "7d"],
        default: "today",
      },
    },
    enabled: true,
  },

  // ─── PERSONAL / QUICK ACTIONS ─────────────────────────────────────
  {
    id: "panel_quick_actions",
    name: "Quick Actions",
    description: "Role-appropriate navigation shortcuts",
    category: "PERSONAL",
    requiredPermissions: [], // visible to everyone; the picker uses role perms
    defaultSize: { w: 12, h: 2 },
    supportedSizes: ["lg", "xl"],
    defaultRefreshMs: 0, // never auto-refreshes
    enabled: true,
  },

  // ─── ALERTS ────────────────────────────────────────────────────────
  // Phase 5+ will add Critical Alerts panel widget (CDSS ClinicalAlert
  // count from active+critical) — placeholder for now so the registry
  // is extensible without touching the existing dashboard view.

  // ─── BATCH OPERATIONS (Phase 12 — Cross-Feature Integration) ───────
  {
    id: "panel_batch_operations",
    name: "Batch Operations",
    description: "Pending items ready for bulk processing (lab results, invoices, prescriptions)",
    category: "WORKFLOW",
    requiredPermissions: [], // visible to anyone with at least one batch perm; the widget itself filters
    defaultSize: { w: 4, h: 2 },
    supportedSizes: ["md", "lg"],
    defaultRefreshMs: 60_000,
    enabled: true,
  },

  // ─── LIVE NOTICE BOARD (Operations) ─────────────────────────────────
  {
    id: "panel_notice_board",
    name: "Live Notice Board",
    description: "Latest facility notices with unread / critical / pending-ack counts. Click through to the full board.",
    category: "OPERATIONS",
    requiredPermissions: ["notice.view"],
    defaultSize: { w: 4, h: 3 },
    supportedSizes: ["sm", "md", "lg"],
    defaultRefreshMs: 15_000, // realtime — same cadence as the main board
    enabled: true,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────

/** Map by id for O(1) lookup. */
export const WIDGET_BY_ID: Record<string, WidgetDefinition> = Object.fromEntries(
  WIDGET_REGISTRY.map((w) => [w.id, w])
);

/** All widget ids. */
export const ALL_WIDGET_IDS: string[] = WIDGET_REGISTRY.map((w) => w.id);

/** Widgets available to a user given their permission list. */
export function widgetsForPermissions(perms: string[], isSuperAdmin: boolean): WidgetDefinition[] {
  if (isSuperAdmin) return WIDGET_REGISTRY.filter((w) => w.enabled);
  return WIDGET_REGISTRY.filter(
    (w) =>
      w.enabled &&
      w.requiredPermissions.every((p) => perms.includes(p))
  );
}

/** All categories used by the registry, in display order. */
export const WIDGET_CATEGORIES: WidgetCategory[] = [
  "CLINICAL",
  "WORKFLOW",
  "FINANCE",
  "INVENTORY",
  "OPERATIONS",
  "MANAGEMENT",
  "PERSONAL",
  "ALERTS",
];

/** Default layout for a fresh user (matches the existing dashboard's
 *  arrangement so the upgrade feels invisible). */
export const DEFAULT_LAYOUT: WidgetPlacement[] = [
  // KPI row — 4 widgets per row (each w=3 fills 12 cols)
  { widgetId: "kpi_total_patients", x: 0, y: 0, w: 3, h: 1, config: {} },
  { widgetId: "kpi_today_encounters", x: 3, y: 0, w: 3, h: 1, config: {} },
  { widgetId: "kpi_today_appointments", x: 6, y: 0, w: 3, h: 1, config: {} },
  { widgetId: "kpi_active_admissions", x: 9, y: 0, w: 3, h: 1, config: {} },
  // Second KPI row
  { widgetId: "kpi_pending_lab_orders", x: 0, y: 1, w: 3, h: 1, config: {} },
  { widgetId: "kpi_pending_prescriptions", x: 3, y: 1, w: 3, h: 1, config: {} },
  { widgetId: "kpi_today_revenue", x: 6, y: 1, w: 3, h: 1, config: {} },
  { widgetId: "kpi_outstanding_invoices", x: 9, y: 1, w: 3, h: 1, config: {} },
  // Third KPI row
  { widgetId: "kpi_low_stock", x: 0, y: 2, w: 3, h: 1, config: {} },
  { widgetId: "kpi_pending_tasks", x: 3, y: 2, w: 3, h: 1, config: {} },
  { widgetId: "kpi_bed_occupancy", x: 6, y: 2, w: 3, h: 1, config: {} },
  { widgetId: "kpi_today_discharges", x: 9, y: 2, w: 3, h: 1, config: {} },
  // Quick actions panel (full width)
  { widgetId: "panel_quick_actions", x: 0, y: 3, w: 12, h: 2, config: {} },
  // Two-column row: recent patients (8) + ward occupancy (4)
  { widgetId: "list_recent_patients", x: 0, y: 5, w: 8, h: 3, config: {} },
  { widgetId: "list_ward_occupancy", x: 8, y: 5, w: 4, h: 3, config: {} },
  // My pending tasks (full width)
  { widgetId: "list_pending_tasks", x: 0, y: 8, w: 12, h: 2, config: {} },
];

// ─── Layout placement type (stored in DB) ────────────────────────────

export interface WidgetPlacement {
  widgetId: string;
  /** Grid column (0-11). */
  x: number;
  /** Grid row (0+). */
  y: number;
  /** Width in grid units (1-12). */
  w: number;
  /** Height in grid rows (1+). */
  h: number;
  /** Per-instance config overrides (must conform to widget's configSchema). */
  config: {
    maxItems?: number;
    dateRange?: "today" | "7d" | "30d" | "month" | "quarter" | "year";
    facilityScope?: "all" | "current";
  };
}

/** Validate a layout array against the registry. Returns {valid, errors}. */
export function validateLayout(
  layout: WidgetPlacement[],
  perms: string[],
  isSuperAdmin: boolean
): { valid: boolean; errors: string[]; sanitized: WidgetPlacement[] } {
  const errors: string[] = [];
  const sanitized: WidgetPlacement[] = [];
  const seen = new Set<string>();

  for (const placement of layout) {
    // Skip duplicate widget ids (only the first instance is kept)
    if (seen.has(placement.widgetId)) {
      errors.push(`Duplicate widget: ${placement.widgetId} (skipped)`);
      continue;
    }
    const widget = WIDGET_BY_ID[placement.widgetId];
    if (!widget) {
      errors.push(`Unknown widget: ${placement.widgetId} (skipped)`);
      continue;
    }
    if (!widget.enabled) {
      errors.push(`Disabled widget: ${placement.widgetId} (skipped)`);
      continue;
    }
    // Permission check (super-admin bypasses)
    if (!isSuperAdmin) {
      const missing = widget.requiredPermissions.filter((p) => !perms.includes(p));
      if (missing.length > 0) {
        errors.push(`No permission for ${placement.widgetId} (missing: ${missing.join(", ")})`);
        continue;
      }
    }
    // Sanitize coordinates (clamp to grid)
    const x = Math.max(0, Math.min(11, Math.floor(placement.x || 0)));
    const y = Math.max(0, Math.floor(placement.y || 0));
    const w = Math.max(1, Math.min(12, Math.floor(placement.w || widget.defaultSize.w)));
    const h = Math.max(1, Math.floor(placement.h || widget.defaultSize.h));
    // Sanitize config (apply widget's configSchema defaults)
    const config: WidgetPlacement["config"] = { ...placement.config };
    if (widget.configSchema?.maxItems) {
      const max = widget.configSchema.maxItems;
      config.maxItems = Math.max(max.min, Math.min(max.max, Number(config.maxItems) || max.default));
    }
    sanitized.push({ widgetId: placement.widgetId, x, y, w, h, config });
    seen.add(placement.widgetId);
  }

  return { valid: errors.length === 0, errors, sanitized };
}

/** Default layout filtered by user's permissions (used when no saved layout exists). */
export function defaultLayoutForPermissions(
  perms: string[],
  isSuperAdmin: boolean
): WidgetPlacement[] {
  const { sanitized } = validateLayout(DEFAULT_LAYOUT, perms, isSuperAdmin);
  return sanitized;
}

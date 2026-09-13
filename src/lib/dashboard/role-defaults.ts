// =====================================================================
// ROLE DEFAULT DASHBOARD LAYOUTS — Tier 2 Phase 3
// =====================================================================
// Defines the default widget selection for each of the 13 default roles.
//
// The layouts are code-defined (not DB-seeded) so a fresh install has
// sensible role defaults without any seeding step. Admins can override
// a role's default by saving a DashboardLayout row with scope="role"
// via the admin endpoint (Phase 4 admin UI).
//
// FALLBACK CHAIN (in /api/dashboard/layout GET):
//   1. User's saved personal layout (scope="personal")
//   2. DB-saved role default (scope="role", isDefault=true)
//   3. Code-defined role default (this file)
//   4. Global DEFAULT_LAYOUT (from widget-registry.ts)
//
// Each role's widget list is ORDERED by priority — the most important
// widgets come first. The `arrangeWidgets()` helper packs them into a
// 12-column grid: 2-wide KPI widgets fill rows of 6, then list/panel
// widgets fill full or half rows below.
//
// PERMISSIONS: The validator in widget-registry.ts will silently drop
// any widget the user's role doesn't have permission for. So if a role
// list includes a widget that role can't access, it's filtered out
// automatically — no crash, no error.
// =====================================================================

import type { WidgetPlacement } from "./widget-registry";
import { WIDGET_BY_ID } from "./widget-registry";

// ─── Role-specific widget selections ────────────────────────────────
//
// Each list is ordered by PRIORITY — the first widget is the most
// important for that role. The `arrangeWidgets()` helper will place
// them in this order, top-to-bottom, left-to-right.
//
// Why order matters: when the dashboard renders on a small screen
// (mobile/tablet), widgets stack vertically in this order, so the
// most important widgets are at the top.
// ────────────────────────────────────────────────────────────────────

export const ROLE_DEFAULT_WIDGETS: Record<string, string[]> = {
  // ─── Super Admin — everything, org-wide overview ──────────────────
  super_admin: [
    "kpi_total_patients",
    "kpi_today_encounters",
    "kpi_today_new_patients",
    "kpi_today_appointments",
    "kpi_active_admissions",
    "kpi_bed_occupancy",
    "kpi_pending_lab_orders",
    "kpi_pending_imaging",
    "kpi_pending_prescriptions",
    "kpi_outstanding_invoices",
    "kpi_today_revenue",
    "kpi_low_stock",
    "kpi_pending_tasks",
    "kpi_today_discharges",
    "kpi_today_procedures",
    "kpi_pending_referrals",
    "kpi_total_users",
    "kpi_recent_audit",
    "panel_quick_actions",
    "list_recent_patients",
    "list_ward_occupancy",
    "list_pending_tasks",
  ],

  // ─── Organization Admin — org-wide overview, all modules ──────────
  organization_admin: [
    "kpi_total_patients",
    "kpi_today_encounters",
    "kpi_today_new_patients",
    "kpi_active_admissions",
    "kpi_pending_lab_orders",
    "kpi_pending_prescriptions",
    "kpi_outstanding_invoices",
    "kpi_today_revenue",
    "kpi_low_stock",
    "kpi_pending_tasks",
    "kpi_bed_occupancy",
    "kpi_today_discharges",
    "kpi_total_users",
    "kpi_recent_audit",
    "panel_quick_actions",
    "list_recent_patients",
    "list_ward_occupancy",
    "list_pending_tasks",
  ],

  // ─── Facility Admin — facility operations overview ────────────────
  facility_admin: [
    "kpi_today_encounters",
    "kpi_today_appointments",
    "kpi_active_admissions",
    "kpi_bed_occupancy",
    "kpi_pending_lab_orders",
    "kpi_pending_imaging",
    "kpi_pending_prescriptions",
    "kpi_outstanding_invoices",
    "kpi_today_revenue",
    "kpi_low_stock",
    "kpi_pending_tasks",
    "kpi_today_discharges",
    "kpi_today_procedures",
    "kpi_pending_referrals",
    "panel_quick_actions",
    "list_recent_patients",
    "list_ward_occupancy",
    "list_pending_tasks",
  ],

  // ─── Doctor / Medical Officer — clinical focus ───────────────────
  doctor: [
    "kpi_today_encounters",
    "kpi_today_appointments",
    "kpi_pending_lab_orders",
    "kpi_pending_imaging",
    "kpi_pending_prescriptions",
    "kpi_pending_referrals",
    "kpi_active_admissions",
    "kpi_bed_occupancy",
    "kpi_today_discharges",
    "kpi_today_procedures",
    "kpi_today_new_patients",
    "kpi_pending_tasks",
    "panel_quick_actions",
    "list_recent_patients",
    "list_ward_occupancy",
    "list_pending_tasks",
  ],

  // ─── Nurse — ward/patient care focus ──────────────────────────────
  nurse: [
    "kpi_active_admissions",
    "kpi_bed_occupancy",
    "kpi_pending_tasks",
    "kpi_today_discharges",
    "kpi_pending_prescriptions",
    "kpi_today_encounters",
    "kpi_today_new_patients",
    "panel_quick_actions",
    "list_ward_occupancy",
    "list_pending_tasks",
  ],

  // ─── Pharmacist — pharmacy workflow focus ─────────────────────────
  pharmacist: [
    "kpi_pending_prescriptions",
    "kpi_low_stock",
    "kpi_pending_tasks",
    "kpi_today_encounters",
    "panel_quick_actions",
    "panel_batch_operations",
    "list_pending_tasks",
  ],

  // ─── Laboratory Scientist — lab workflow focus ────────────────────
  laboratory_scientist: [
    "kpi_pending_lab_orders",
    "kpi_pending_tasks",
    "kpi_today_encounters",
    "panel_quick_actions",
    "panel_batch_operations",
    "list_pending_tasks",
  ],

  // ─── Radiographer — imaging workflow focus ────────────────────────
  radiographer: [
    "kpi_pending_imaging",
    "kpi_pending_tasks",
    "kpi_today_encounters",
    "panel_quick_actions",
    "list_pending_tasks",
  ],

  // ─── Receptionist — front desk focus ──────────────────────────────
  receptionist: [
    "kpi_today_encounters",
    "kpi_today_appointments",
    "kpi_today_new_patients",
    "kpi_total_patients",
    "kpi_pending_tasks",
    "panel_quick_actions",
    "list_recent_patients",
    "list_pending_tasks",
  ],

  // ─── Cashier — billing focus ──────────────────────────────────────
  cashier: [
    "kpi_outstanding_invoices",
    "kpi_today_revenue",
    "kpi_pending_tasks",
    "kpi_today_encounters",
    "panel_quick_actions",
    "panel_batch_operations",
    "list_pending_tasks",
  ],

  // ─── Accountant — finance focus ──────────────────────────────────
  accountant: [
    "kpi_outstanding_invoices",
    "kpi_today_revenue",
    "kpi_pending_tasks",
    "kpi_low_stock",
    "kpi_total_patients",
    "panel_quick_actions",
    "panel_batch_operations",
    "list_pending_tasks",
  ],

  // ─── Records Officer — records/patient focus ──────────────────────
  records_officer: [
    "kpi_total_patients",
    "kpi_today_new_patients",
    "kpi_today_encounters",
    "kpi_pending_tasks",
    "panel_quick_actions",
    "list_recent_patients",
    "list_pending_tasks",
  ],

  // ─── Inventory Officer — inventory focus ──────────────────────────
  inventory_officer: [
    "kpi_low_stock",
    "kpi_pending_tasks",
    "panel_quick_actions",
    "list_pending_tasks",
  ],
};

// ─── Layout arrangement helper ───────────────────────────────────────
//
// Packs an ordered list of widget IDs into a 12-column grid.
// Rules:
//   - Small widgets (w<=2) pack 6 per row (12 cols total)
//   - Medium widgets (3<=w<=6) pack 2 per row
//   - Large widgets (w>=7) get their own row
//   - If a widget doesn't fit in the remaining row space, it wraps
//     to the next row
// ────────────────────────────────────────────────────────────────────

export function arrangeWidgets(widgetIds: string[]): WidgetPlacement[] {
  const placements: WidgetPlacement[] = [];
  let x = 0;
  let y = 0;
  let rowMaxH = 1; // track the tallest widget on the current row

  for (const widgetId of widgetIds) {
    const widget = WIDGET_BY_ID[widgetId];
    if (!widget) continue; // skip unknown widget ids

    const w = widget.defaultSize.w;
    const h = widget.defaultSize.h;

    // If this widget doesn't fit in the remaining row space, wrap
    if (x + w > 12) {
      x = 0;
      y += rowMaxH; // advance by the tallest widget on the previous row
      rowMaxH = 1; // reset for the new row
    }

    placements.push({ widgetId, x, y, w, h, config: {} });
    x += w;
    rowMaxH = Math.max(rowMaxH, h); // track the tallest widget on this row

    // If we filled the row exactly, wrap
    if (x >= 12) {
      x = 0;
      y += rowMaxH;
      rowMaxH = 1;
    }
  }

  return placements;
}

// ─── Default layout for a role ───────────────────────────────────────
//
// Returns the auto-arranged layout for the given role code.
// If the role code is unknown, falls back to the global DEFAULT_LAYOUT.
// The returned layout is NOT yet filtered by permissions — the caller
// should run it through validateLayout() to drop widgets the user
// can't access.
// ────────────────────────────────────────────────────────────────────

export function defaultLayoutForRole(roleCode: string): WidgetPlacement[] {
  const widgetIds = ROLE_DEFAULT_WIDGETS[roleCode];
  if (!widgetIds || widgetIds.length === 0) {
    // Unknown role — return empty; caller falls back to global default
    return [];
  }
  return arrangeWidgets(widgetIds);
}

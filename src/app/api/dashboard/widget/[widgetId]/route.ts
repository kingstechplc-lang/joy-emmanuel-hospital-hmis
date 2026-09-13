// =====================================================================
// API: /api/dashboard/widget/[widgetId]
//   GET  — returns data for a single widget, scoped to the user's
//          organization + active facility. Used by widgets that need
//          custom data beyond the standard /api/dashboard/stats payload
//          (e.g., a widget that needs a different date range or a
//          different aggregation than the default 22 KPIs).
//
// PERMISSIONS:
//   GET   requires  dashboard.customize (or super_admin)
//   The widget's requiredPermissions must ALL be satisfied.
//
// QUERY PARAMS:
//   facilityId   — optional; defaults to session user's active facility
//   dateRange    — optional; one of: today | 7d | 30d | month | quarter | year
//                  (defaults to "today" — same as /api/dashboard/stats)
//   facilityScope — optional; one of: all | current
//                  (defaults to "current"; "all" requires org-wide view)
//
// RESPONSE:
//   For KPI widgets (kpi_*):
//     { widgetId, value, label, category, dateRange, facilityScope }
//   For list widgets:
//     { widgetId, items: [...], count, dateRange, facilityScope }
//   For panel widgets (panel_quick_actions):
//     { widgetId, actions: [...] }
//
// NOTE: This endpoint is intentionally lightweight — it does NOT
// compute all 22 KPIs like /api/dashboard/stats does. It only fetches
// the data needed for the requested widget. This reduces Neon DB load
// when a single widget is being polled (e.g., a critical-alerts widget
// refreshing every 15s).
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { WIDGET_BY_ID } from "@/lib/dashboard/widget-registry";
import { KPI_BY_ID } from "@/lib/dashboard/kpi-definitions";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

/** Compute the date range bounds for a given dateRange key. */
function dateRangeBounds(range: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  let start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (range) {
    case "7d":
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "quarter":
      start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      break;
    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case "today":
    default:
      // already set to today's start
      break;
  }
  return { start, end };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ widgetId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DASHBOARD_CUSTOMIZE)) {
    return NextResponse.json({ error: "Forbidden — requires dashboard.customize" }, { status: 403 });
  }

  const { widgetId } = await params;
  const widget = WIDGET_BY_ID[widgetId];
  if (!widget) {
    return NextResponse.json({ error: `Unknown widget: ${widgetId}` }, { status: 404 });
  }

  // Check the widget's required permissions
  if (!session.user.roles?.includes("super_admin")) {
    const missing = widget.requiredPermissions.filter(
      (p) => !session.user.permissions?.includes(p)
    );
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing permissions: ${missing.join(", ")}` },
        { status: 403 }
      );
    }
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || null;
  const dateRange = url.searchParams.get("dateRange") || "today";
  const facilityScope = url.searchParams.get("facilityScope") || "current";
  const organizationId = session.user.organizationId;

  // Build the facility scope: "all" = no facility filter (org-wide);
  // "current" = filter to the active facility.
  const facilityFilter =
    facilityScope === "all" || !facilityId ? {} : { facilityId };

  try {
    // ─── KPI widgets ────────────────────────────────────────────────
    if (widgetId.startsWith("kpi_")) {
      const kpi = KPI_BY_ID[widgetId];
      if (!kpi) {
        return NextResponse.json({ error: `KPI ${widgetId} not defined` }, { status: 404 });
      }

      const { start, end } = dateRangeBounds(dateRange);
      let value: number | string = "—";

      // Compute the value based on the KPI's dataSourceKey
      // (this is a lightweight version of /api/dashboard/stats that
      // only computes the requested KPI)
      switch (kpi.dataSourceKey) {
        case "totalPatients":
          value = await db.patient.count({
            where: { organizationId, status: "active" },
          });
          break;
        case "todayEncounters": {
          const where: any = { ...facilityFilter, startAt: { gte: start, lte: end } };
          value = await db.encounter.count({ where });
          break;
        }
        case "todayNewPatients":
          value = await db.patient.count({
            where: {
              organizationId,
              registrationDate: { gte: start, lte: end },
            },
          });
          break;
        case "todayAppointments": {
          const where: any = { ...facilityFilter, scheduledStart: { gte: start, lte: end } };
          value = await db.appointment.count({ where });
          break;
        }
        case "activeAdmissions": {
          const where: any = { ...facilityFilter, status: "admitted" };
          value = await db.admission.count({ where });
          break;
        }
        case "pendingLabOrders": {
          const where: any = {
            ...facilityFilter,
            status: { in: ["ordered", "collected", "received", "processing", "resulted"] },
          };
          value = await db.labOrder.count({ where });
          break;
        }
        case "pendingImagingOrders": {
          const where: any = {
            ...facilityFilter,
            status: { in: ["ordered", "scheduled", "in_progress"] },
          };
          value = await db.imagingOrder.count({ where });
          break;
        }
        case "pendingPrescriptions": {
          const where: any = {
            ...facilityFilter,
            status: { in: ["pending", "approved", "partially_dispensed"] },
          };
          value = await db.prescription.count({ where });
          break;
        }
        case "pendingReferrals": {
          value = await db.referral.count({
            where: {
              status: "pending",
              encounter: facilityId ? { facilityId } : {},
            },
          });
          break;
        }
        case "outstandingInvoices": {
          const where: any = {
            ...facilityFilter,
            status: { in: ["issued", "partially_paid"] },
          };
          value = await db.invoice.count({ where });
          break;
        }
        case "todayRevenue": {
          const where: any = {
            ...facilityFilter,
            receivedAt: { gte: start, lte: end },
            status: "completed",
          };
          const agg = await db.payment.aggregate({
            where,
            _sum: { amount: true },
          });
          value = agg._sum.amount || 0;
          break;
        }
        case "lowStockItems": {
          value = await db.facilityInventory.count({
            where: {
              ...(facilityId ? { facilityId } : {}),
              currentQuantity: { lte: db.facilityInventory.fields.minimumQuantity },
            },
          });
          break;
        }
        case "pendingTasksCount": {
          value = await db.task.count({
            where: {
              assignedToId: session.user.id,
              status: { in: ["pending", "in_progress"] },
            },
          });
          break;
        }
        case "totalUsers":
          value = await db.user.count({
            where: { organizationId, status: "active" },
          });
          break;
        case "recentAuditCount":
          value = await db.auditLog.count({
            where: { createdAt: { gte: start, lte: end } },
          });
          break;
        case "bedOccupancy": {
          const [available, occupied] = await Promise.all([
            db.bed.count({ where: { ...facilityFilter, status: "available" } }),
            db.bed.count({ where: { ...facilityFilter, status: "occupied" } }),
          ]);
          const total = available + occupied;
          value = total > 0 ? Math.round((occupied / total) * 100) : 0;
          break;
        }
        case "todayDischarges": {
          value = await db.dischargeRecord.count({
            where: {
              dischargedAt: { gte: start, lte: end },
              admission: facilityId ? { facilityId } : {},
            },
          });
          break;
        }
        case "todayCompletedProcedures": {
          const where: any = {
            ...facilityFilter,
            status: "completed",
            performedAt: { gte: start, lte: end },
          };
          value = await db.procedure.count({ where });
          break;
        }
        default:
          // Unknown dataSourceKey — return "—" rather than crash
          value = "—";
      }

      return NextResponse.json({
        widgetId,
        value,
        label: kpi.label,
        category: kpi.category,
        dateRange,
        facilityScope,
      });
    }

    // ─── List widgets — return a count + recent items ────────────────
    if (widgetId.startsWith("list_")) {
      const maxItems = 10; // reasonable default for lightweight endpoint
      let items: any[] = [];
      let count = 0;

      switch (widget.dataSourceKey) {
        case "recentPatients":
          items = await db.patient.findMany({
            where: { organizationId, status: "active" },
            orderBy: { registrationDate: "desc" },
            take: maxItems,
            select: {
              id: true, patientNumber: true, firstName: true, lastName: true,
              sex: true, phone: true, status: true, registrationDate: true,
            },
          });
          count = await db.patient.count({
            where: { organizationId, status: "active" },
          });
          break;
        case "wardOccupancy":
          items = await db.ward.findMany({
            where: facilityId ? { facilityId } : {},
            include: { beds: { select: { id: true, status: true } } },
            take: maxItems,
          });
          items = items.map((w: any) => ({
            code: w.code,
            name: w.name,
            total: w.beds.length,
            occupied: w.beds.filter((b: any) => b.status === "occupied").length,
          }));
          count = items.length;
          break;
        case "pendingTasks":
          items = await db.task.findMany({
            where: {
              assignedToId: session.user.id,
              status: { in: ["pending", "in_progress"] },
            },
            orderBy: { dueAt: "asc" },
            take: maxItems,
          });
          count = items.length;
          break;
      }

      return NextResponse.json({
        widgetId,
        items,
        count,
        dateRange,
        facilityScope,
      });
    }

    // ─── Panel widgets — no custom data (the renderer builds from perms) ─
    if (widgetId.startsWith("panel_")) {
      return NextResponse.json({
        widgetId,
        actions: [], // panel_quick_actions renders from user permissions
      });
    }

    return NextResponse.json(
      { error: `No data fetcher for widget: ${widgetId}` },
      { status: 404 }
    );
  } catch (e: any) {
    console.error(`[GET /api/dashboard/widget/${widgetId}]`, e);
    return NextResponse.json(
      { error: e.message || "Failed to load widget data" },
      { status: 500 }
    );
  }
}

// =====================================================================
// API: /api/dashboard/layout
//   GET  — return the user's saved dashboard layout, or the default
//          layout for their role if no saved layout exists
//   PUT  — save the user's personal dashboard layout (replace existing)
//
// PERMISSIONS:
//   GET   requires  dashboard.customize (or super_admin)
//   PUT   requires  dashboard.customize (or super_admin)
//
// ORGANIZATION + FACILITY ISOLATION:
//   Both GET and PUT enforce server-side scoping:
//     - organizationId is always the session user's organizationId
//     - facilityId is optional (the user's active facility, or null
//       for an org-wide personal layout)
//   The user CANNOT read or write another user's personal layout —
//   the userId is always the session user's id.
//
// LAYOUT JSON SHAPE (stored in DashboardLayout.layout column):
//   [
//     { widgetId, x, y, w, h, config: { maxItems?, dateRange?, facilityScope? } }
//   ]
// Validated against src/lib/dashboard/widget-registry.ts before save.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  WIDGET_BY_ID,
  validateLayout,
  defaultLayoutForPermissions,
  type WidgetPlacement,
} from "@/lib/dashboard/widget-registry";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// ─── GET /api/dashboard/layout ──────────────────────────────────────
// Returns: { layout: WidgetPlacement[], source: "saved" | "default" }
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DASHBOARD_CUSTOMIZE)) {
    return NextResponse.json({ error: "Forbidden — requires dashboard.customize" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || null;
  const organizationId = session.user.organizationId;
  const userId = session.user.id;

  try {
    // Look for the user's personal layout for this (org, facility) combo.
    // If they have no personal layout for this facility, fall back to their
    // org-wide personal layout (facilityId=null). If that also doesn't
    // exist, fall back to the default layout for their permissions.
    let saved: Awaited<ReturnType<typeof db.dashboardLayout.findFirst>> = null;
    if (facilityId) {
      saved = await db.dashboardLayout.findFirst({
        where: { userId, organizationId, facilityId, scope: "personal" },
        orderBy: { updatedAt: "desc" },
      });
    }
    if (!saved) {
      saved = await db.dashboardLayout.findFirst({
        where: { userId, organizationId, facilityId: null, scope: "personal" },
        orderBy: { updatedAt: "desc" },
      });
    }

    if (saved) {
      let layout: WidgetPlacement[] = [];
      try {
        layout = JSON.parse(saved.layout);
      } catch {
        // Corrupt layout in DB — fall through to default
        layout = [];
      }
      // Re-validate against current permissions (in case the user's
      // permissions changed since they last saved the layout — widgets
      // they no longer have permission for are silently dropped)
      const perms = session.user.permissions || [];
      const isSuperAdmin = session.user.roles?.includes("super_admin");
      const { sanitized } = validateLayout(layout, perms, !!isSuperAdmin);
      return NextResponse.json({
        layout: sanitized,
        source: "saved",
        layoutId: saved.id,
        savedAt: saved.updatedAt,
      });
    }

    // No saved layout — return the default for the user's permissions
    const perms = session.user.permissions || [];
    const isSuperAdmin = session.user.roles?.includes("super_admin");
    const layout = defaultLayoutForPermissions(perms, !!isSuperAdmin);
    return NextResponse.json({ layout, source: "default", layoutId: null });
  } catch (e: any) {
    console.error("[GET /api/dashboard/layout]", e);
    return NextResponse.json(
      { error: e.message || "Failed to load dashboard layout" },
      { status: 500 }
    );
  }
}

// ─── PUT /api/dashboard/layout ──────────────────────────────────────
// Body: { layout: WidgetPlacement[], facilityId?: string }
// Returns: { layoutId, layout: WidgetPlacement[] (sanitized) }
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DASHBOARD_CUSTOMIZE)) {
    return NextResponse.json({ error: "Forbidden — requires dashboard.customize" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { layout: rawLayout } = body;
  if (!Array.isArray(rawLayout)) {
    return NextResponse.json({ error: "layout (array) is required" }, { status: 400 });
  }

  const organizationId = session.user.organizationId;
  const userId = session.user.id;
  // facilityId from body, or from query string, or from session. null = org-wide.
  const url = new URL(req.url);
  const facilityId = body.facilityId || url.searchParams.get("facilityId") || session.user.facilityId || null;

  // Validate against registry + permissions
  const perms = session.user.permissions || [];
  const isSuperAdmin = session.user.roles?.includes("super_admin");
  const { valid, errors, sanitized } = validateLayout(rawLayout, perms, !!isSuperAdmin);
  if (sanitized.length === 0) {
    return NextResponse.json(
      { error: "No valid widgets in layout", errors },
      { status: 400 }
    );
  }

  try {
    // Find existing personal layout for this (org, facility) combo
    const existing = await db.dashboardLayout.findFirst({
      where: { userId, organizationId, facilityId, scope: "personal" },
      orderBy: { updatedAt: "desc" },
    });

    const layoutJson = JSON.stringify(sanitized);

    let layoutId: string;
    if (existing) {
      // Update in place — preserves the original createdAt
      await db.dashboardLayout.update({
        where: { id: existing.id },
        data: { layout: layoutJson },
      });
      layoutId = existing.id;
    } else {
      // Create new personal layout
      const created = await db.dashboardLayout.create({
        data: {
          userId,
          organizationId,
          facilityId,
          scope: "personal",
          isDefault: false,
          layout: layoutJson,
        },
      });
      layoutId = created.id;
    }

    await auditLog({
      userId,
      organizationId,
      facilityId: facilityId || undefined,
      action: "DASHBOARD_LAYOUT_UPDATED",
      resourceType: "dashboard_layout",
      resourceId: layoutId,
      newValues: {
        widgetCount: sanitized.length,
        widgets: sanitized.map((p) => p.widgetId),
        facilityId,
      },
    });

    return NextResponse.json({
      layoutId,
      layout: sanitized,
      validationErrors: valid ? undefined : errors,
    });
  } catch (e: any) {
    console.error("[PUT /api/dashboard/layout]", e);
    return NextResponse.json(
      { error: e.message || "Failed to save dashboard layout" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/dashboard/layout ───────────────────────────────────
// Resets the user's personal layout to the default (deletes their saved
// layout row for this facility). Body: { facilityId?: string }
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DASHBOARD_CUSTOMIZE)) {
    return NextResponse.json({ error: "Forbidden — requires dashboard.customize" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || null;
  const organizationId = session.user.organizationId;
  const userId = session.user.id;

  try {
    const deleted = await db.dashboardLayout.deleteMany({
      where: { userId, organizationId, facilityId, scope: "personal" },
    });

    await auditLog({
      userId,
      organizationId,
      facilityId: facilityId || undefined,
      action: "DASHBOARD_LAYOUT_RESET",
      resourceType: "dashboard_layout",
      newValues: { deletedCount: deleted.count, facilityId },
    });

    // Return the default layout so the client can re-render immediately
    const perms = session.user.permissions || [];
    const isSuperAdmin = session.user.roles?.includes("super_admin");
    const layout = defaultLayoutForPermissions(perms, !!isSuperAdmin);
    return NextResponse.json({
      reset: true,
      deletedCount: deleted.count,
      layout,
      source: "default",
    });
  } catch (e: any) {
    console.error("[DELETE /api/dashboard/layout]", e);
    return NextResponse.json(
      { error: e.message || "Failed to reset dashboard layout" },
      { status: 500 }
    );
  }
}

// Helper for the registry (used by the dashboard view to look up widget
// metadata at render time). Re-exported here so the API bundle has a
// single import for the registry.
export { WIDGET_BY_ID };

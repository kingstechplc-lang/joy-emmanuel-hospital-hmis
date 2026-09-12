// =====================================================================
// API: /api/dashboard/layout/role-default
//   GET  — return the role-default dashboard layout for a given role
//          (code-defined or DB-overridden). Used by admin UI to preview
//          and edit role defaults.
//   PUT  — save an admin override for a role's default layout. Only
//          org_admin / super_admin / facility_admin can do this.
//   DELETE — remove the admin override, reverting to the code-defined
//            role default.
//
// PERMISSIONS:
//   GET      requires  dashboard.customize (any user can preview a role default)
//   PUT      requires  organization_admin role OR super_admin
//   DELETE   requires  organization_admin role OR super_admin
//
// QUERY / BODY PARAMS:
//   roleCode   — the role code (e.g., "doctor", "nurse") — REQUIRED
//   facilityId — optional; if provided, saves a facility-scoped role
//                default; if null/omitted, saves an org-wide role default
//
// LAYOUT JSON SHAPE: same as /api/dashboard/layout — array of
//   { widgetId, x, y, w, h, config }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  validateLayout,
  defaultLayoutForPermissions,
  type WidgetPlacement,
} from "@/lib/dashboard/widget-registry";
import { defaultLayoutForRole, ROLE_DEFAULT_WIDGETS } from "@/lib/dashboard/role-defaults";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// List of valid role codes (for validation)
const VALID_ROLE_CODES = Object.keys(ROLE_DEFAULT_WIDGETS);

function isAdmin(session: any): boolean {
  return (
    session.user.roles?.includes("super_admin") ||
    session.user.roles?.includes("organization_admin") ||
    session.user.roles?.includes("facility_admin")
  );
}

// ─── GET /api/dashboard/layout/role-default?roleCode=doctor ──────────
// Returns: { layout, source: "db_override" | "code_default" | "none", roleCode, layoutId? }
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DASHBOARD_CUSTOMIZE)) {
    return NextResponse.json({ error: "Forbidden — requires dashboard.customize" }, { status: 403 });
  }

  const url = new URL(req.url);
  const roleCode = url.searchParams.get("roleCode");
  const facilityId = url.searchParams.get("facilityId") || null;

  if (!roleCode) {
    return NextResponse.json(
      { error: "roleCode query parameter is required" },
      { status: 400 }
    );
  }
  if (!VALID_ROLE_CODES.includes(roleCode)) {
    return NextResponse.json(
      { error: `Invalid roleCode: ${roleCode}. Valid: ${VALID_ROLE_CODES.join(", ")}` },
      { status: 400 }
    );
  }

  const organizationId = session.user.organizationId;

  try {
    // Look for a DB override (facility-scoped first, then org-wide)
    let dbOverride: Awaited<ReturnType<typeof db.dashboardLayout.findFirst>> = null;
    if (facilityId) {
      dbOverride = await db.dashboardLayout.findFirst({
        where: {
          organizationId,
          facilityId,
          scope: "role",
          roleCode,
          isDefault: true,
        },
        orderBy: { updatedAt: "desc" },
      });
    }
    if (!dbOverride) {
      dbOverride = await db.dashboardLayout.findFirst({
        where: {
          organizationId,
          facilityId: null,
          scope: "role",
          roleCode,
          isDefault: true,
        },
        orderBy: { updatedAt: "desc" },
      });
    }

    if (dbOverride) {
      let layout: WidgetPlacement[] = [];
      try {
        layout = JSON.parse(dbOverride.layout);
      } catch {
        layout = [];
      }
      return NextResponse.json({
        layout,
        source: "db_override",
        roleCode,
        layoutId: dbOverride.id,
        savedAt: dbOverride.updatedAt,
        savedBy: dbOverride.userId,
      });
    }

    // No DB override — return the code-defined role default
    const codeLayout = defaultLayoutForRole(roleCode);
    if (codeLayout.length > 0) {
      return NextResponse.json({
        layout: codeLayout,
        source: "code_default",
        roleCode,
        layoutId: null,
      });
    }

    // No code default for this role — return empty
    return NextResponse.json({
      layout: [],
      source: "none",
      roleCode,
      layoutId: null,
    });
  } catch (e: any) {
    console.error("[GET /api/dashboard/layout/role-default]", e);
    return NextResponse.json(
      { error: e.message || "Failed to load role default" },
      { status: 500 }
    );
  }
}

// ─── PUT /api/dashboard/layout/role-default ──────────────────────────
// Body: { roleCode: string, layout: WidgetPlacement[], facilityId?: string }
// Returns: { layoutId, layout (sanitized), roleCode }
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) {
    return NextResponse.json(
      { error: "Forbidden — requires organization_admin or facility_admin or super_admin" },
      { status: 403 }
    );
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { roleCode, layout: rawLayout } = body;
  if (!roleCode) {
    return NextResponse.json({ error: "roleCode is required" }, { status: 400 });
  }
  if (!VALID_ROLE_CODES.includes(roleCode)) {
    return NextResponse.json(
      { error: `Invalid roleCode: ${roleCode}. Valid: ${VALID_ROLE_CODES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!Array.isArray(rawLayout)) {
    return NextResponse.json({ error: "layout (array) is required" }, { status: 400 });
  }

  const url = new URL(req.url);
  const organizationId = session.user.organizationId;
  const facilityId = body.facilityId || url.searchParams.get("facilityId") || null;
  const userId = session.user.id;

  // Validate against registry — role defaults don't filter by the admin's
  // permissions (the admin might not have the role-specific permissions, but
  // they're configuring the layout FOR users of that role). We still validate
  // widget IDs, sizes, and coordinates.
  const { valid, errors, sanitized } = validateLayout(rawLayout, [], true);
  if (sanitized.length === 0) {
    return NextResponse.json(
      { error: "No valid widgets in layout", errors },
      { status: 400 }
    );
  }

  try {
    // Find existing role-default override
    const existing = await db.dashboardLayout.findFirst({
      where: {
        organizationId,
        facilityId,
        scope: "role",
        roleCode,
        isDefault: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const layoutJson = JSON.stringify(sanitized);
    const name = `${roleCode} Default`;

    let layoutId: string;
    if (existing) {
      await db.dashboardLayout.update({
        where: { id: existing.id },
        data: { layout: layoutJson, name, userId },
      });
      layoutId = existing.id;
    } else {
      // Before creating, clear any other isDefault=true rows for this
      // (org, facilityId, roleCode) combo — there should only be one
      await db.dashboardLayout.updateMany({
        where: {
          organizationId,
          facilityId,
          scope: "role",
          roleCode,
          isDefault: true,
        },
        data: { isDefault: false },
      });
      const created = await db.dashboardLayout.create({
        data: {
          userId,
          organizationId,
          facilityId,
          scope: "role",
          roleCode,
          isDefault: true,
          name,
          layout: layoutJson,
        },
      });
      layoutId = created.id;
    }

    await auditLog({
      userId,
      organizationId,
      facilityId: facilityId || undefined,
      action: "DASHBOARD_ROLE_DEFAULT_UPDATED",
      resourceType: "dashboard_layout",
      resourceId: layoutId,
      newValues: {
        roleCode,
        facilityId,
        widgetCount: sanitized.length,
        widgets: sanitized.map((p) => p.widgetId),
      },
    });

    return NextResponse.json({
      layoutId,
      layout: sanitized,
      roleCode,
      validationErrors: valid ? undefined : errors,
    });
  } catch (e: any) {
    console.error("[PUT /api/dashboard/layout/role-default]", e);
    return NextResponse.json(
      { error: e.message || "Failed to save role default" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/dashboard/layout/role-default?roleCode=doctor ──────
// Removes the admin override, reverting to the code-defined default.
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) {
    return NextResponse.json(
      { error: "Forbidden — requires organization_admin or facility_admin or super_admin" },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const roleCode = url.searchParams.get("roleCode");
  const facilityId = url.searchParams.get("facilityId") || null;
  const organizationId = session.user.organizationId;
  const userId = session.user.id;

  if (!roleCode) {
    return NextResponse.json(
      { error: "roleCode query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const deleted = await db.dashboardLayout.deleteMany({
      where: {
        organizationId,
        facilityId,
        scope: "role",
        roleCode,
        isDefault: true,
      },
    });

    await auditLog({
      userId,
      organizationId,
      facilityId: facilityId || undefined,
      action: "DASHBOARD_ROLE_DEFAULT_RESET",
      resourceType: "dashboard_layout",
      newValues: { roleCode, facilityId, deletedCount: deleted.count },
    });

    // Return the code-defined default so the admin UI can re-render
    const codeLayout = defaultLayoutForRole(roleCode);
    return NextResponse.json({
      reset: true,
      deletedCount: deleted.count,
      roleCode,
      layout: codeLayout,
      source: "code_default",
    });
  } catch (e: any) {
    console.error("[DELETE /api/dashboard/layout/role-default]", e);
    return NextResponse.json(
      { error: e.message || "Failed to reset role default" },
      { status: 500 }
    );
  }
}

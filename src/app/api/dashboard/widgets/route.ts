// =====================================================================
// API: /api/dashboard/widgets
//   GET  — returns the list of widgets available to the current user
//          (based on their permissions). Used by the "Add Widget" picker.
//
// PERMISSIONS:
//   GET   requires  dashboard.customize (or super_admin)
//
// Returns: { widgets: WidgetDefinition[] }
//   Each widget definition includes:
//     id, name, description, category, defaultSize, supportedSizes,
//     configSchema, defaultRefreshMs
//   (requiredPermissions is omitted from the response — the client
//    doesn't need them; the server already filtered.)
// =====================================================================
import { NextResponse } from "next/server";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { widgetsForPermissions } from "@/lib/dashboard/widget-registry";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DASHBOARD_CUSTOMIZE)) {
    return NextResponse.json({ error: "Forbidden — requires dashboard.customize" }, { status: 403 });
  }

  const perms = session.user.permissions || [];
  const isSuperAdmin = session.user.roles?.includes("super_admin");
  const widgets = widgetsForPermissions(perms, !!isSuperAdmin).map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    category: w.category,
    defaultSize: w.defaultSize,
    supportedSizes: w.supportedSizes,
    configSchema: w.configSchema,
    defaultRefreshMs: w.defaultRefreshMs,
  }));

  return NextResponse.json({ widgets, count: widgets.length });
}

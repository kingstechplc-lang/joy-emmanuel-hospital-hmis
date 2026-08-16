// =====================================================================
// API: /api/permissions
//   GET — list all permissions (system-defined, read-only catalog)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PERMISSION_ASSIGN) && !hasPermission(session, PERMISSIONS.ROLE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Pull DB-stored permission catalog; if empty, the system hasn't seeded it
  const dbPerms = await db.permission.findMany({
    orderBy: [{ module: "asc" }, { code: "asc" }],
    include: { _count: { select: { roles: true } } },
  });

  return NextResponse.json({ items: dbPerms });
}

// =====================================================================
// API: /api/rosters/[id]/versions — GET (list version history)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const roster = await db.roster.findUnique({ where: { id } });
  if (!roster || roster.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const items = await db.rosterVersion.findMany({
    where: { rosterId: id },
    orderBy: { versionNumber: "desc" },
    include: {
      changedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  return NextResponse.json({ items, count: items.length });
}

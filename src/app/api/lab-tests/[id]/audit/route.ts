// =====================================================================
// API: /api/lab-tests/[id]/audit
//   GET — list catalog audit entries for a test
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canViewCatalog } from "@/lib/lab-catalog";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewCatalog(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const test = await db.laboratoryTest.findUnique({ where: { id } });
  if (!test || test.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const items = await db.labTestCatalogAudit.findMany({
    where: { laboratoryTestId: id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json({ items, count: items.length });
}

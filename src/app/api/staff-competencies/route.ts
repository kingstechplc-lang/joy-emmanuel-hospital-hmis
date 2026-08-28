// API: /api/staff-competencies — GET (list) + POST (create)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_VIEW) && !hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const status = url.searchParams.get("status");
  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  const items = await db.staffCompetency.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { staff: { select: { id: true, firstName: true, lastName: true, staffNumber: true } }, competency: true, assessor: { select: { id: true, firstName: true, lastName: true } } },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_COMPETENCY_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  body.organizationId = session.user.organizationId;
  const item = await db.staffCompetency.create({ data: body });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "STAFF_COMPETENCIES_CREATED", resourceType: "staffCompetency", resourceId: item.id, newValues: body });
  return NextResponse.json({ item }, { status: 201 });
}

// API: /api/staffing-requirements — GET (list) + POST (create)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const departmentId = url.searchParams.get("departmentId");
  const where: any = { organizationId: session.user.organizationId, active: true };
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  const items = await db.staffingRequirement.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFFING_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { facilityId, departmentId, wardId, shiftType, dayType, profession, specialty, seniority, minCount, idealCount, notes } = body;
  if (!facilityId || !minCount) return NextResponse.json({ error: "facilityId, minCount are required" }, { status: 400 });
  const fac = await db.facility.findUnique({ where: { id: facilityId } });
  if (!fac || fac.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  const item = await db.staffingRequirement.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId,
      departmentId: departmentId || null,
      wardId: wardId || null,
      shiftType: shiftType || null,
      dayType: dayType || "weekday",
      profession: profession || null,
      specialty: specialty || null,
      seniority: seniority || null,
      minCount: parseInt(minCount, 10) || 1,
      idealCount: idealCount ? parseInt(idealCount, 10) : null,
      notes,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "STAFFING_REQUIREMENT_CREATED", resourceType: "staffing_requirement", resourceId: item.id, newValues: { facilityId, profession, minCount } });
  return NextResponse.json({ item }, { status: 201 });
}

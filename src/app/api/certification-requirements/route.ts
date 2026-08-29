// API: /api/certification-requirements — GET + POST
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
  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  const items = await db.certificationRequirement.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } }, certificationType: true },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { facilityId, departmentId, certificationTypeId, certificationName, profession, specialty, jobRole, employmentType, staffCategory, isMandatory, validityMonths } = body;
  if (!certificationName) return NextResponse.json({ error: "certificationName is required" }, { status: 400 });
  const item = await db.certificationRequirement.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null, departmentId: departmentId || null,
      certificationTypeId: certificationTypeId || null,
      certificationName, profession: profession || null, specialty: specialty || null,
      jobRole: jobRole || null, employmentType: employmentType || null, staffCategory: staffCategory || null,
      isMandatory: isMandatory !== false,
      validityMonths: validityMonths ? parseInt(validityMonths, 10) : null,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_REQUIREMENT_CREATED", resourceType: "certification_requirement", resourceId: item.id, newValues: { certificationName, isMandatory } });
  return NextResponse.json({ item }, { status: 201 });
}

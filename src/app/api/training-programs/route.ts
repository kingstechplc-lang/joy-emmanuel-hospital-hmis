// API: /api/training-programs — GET (list) + POST (create)
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
  const departmentId = url.searchParams.get("departmentId");
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status");
  const mandatory = url.searchParams.get("mandatory");
  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  if (category) where.category = category;
  if (status) where.status = status;
  if (mandatory === "true") where.isMandatory = true;
  const items = await db.trainingProgram.findMany({
    where,
    orderBy: [{ title: "asc" }],
    take: 500,
    include: {
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      provider: { select: { id: true, name: true } },
      trainer: { select: { id: true, name: true } },
      _count: { select: { sessions: true, enrollments: true, certificates: true } },
    },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_CREATE) && !hasPermission(session, PERMISSIONS.TRAINING_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { title, code, description, category, subcategory, trainingType, deliveryMethod, targetStaff, isMandatory, durationHours, cpdPoints, validityMonths, renewalMonths, assessmentRequired, passingScore, certificateRequired, cost, providerId, trainerId, facilityId, departmentId, status } = body;
  if (!title || !code) return NextResponse.json({ error: "title, code are required" }, { status: 400 });
  const existing = await db.trainingProgram.findUnique({ where: { organizationId_code: { organizationId: session.user.organizationId, code } } });
  if (existing) return NextResponse.json({ error: "Code already exists" }, { status: 409 });
  const item = await db.trainingProgram.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      departmentId: departmentId || null,
      title, code, description, category, subcategory,
      trainingType: trainingType || "internal",
      deliveryMethod: deliveryMethod || "in_person",
      targetStaff: targetStaff ? JSON.stringify(targetStaff) : null,
      isMandatory: !!isMandatory,
      durationHours: durationHours ? parseFloat(durationHours) : null,
      cpdPoints: cpdPoints ? parseFloat(cpdPoints) : null,
      validityMonths: validityMonths ? parseInt(validityMonths, 10) : null,
      renewalMonths: renewalMonths ? parseInt(renewalMonths, 10) : null,
      assessmentRequired: !!assessmentRequired,
      passingScore: passingScore ? parseFloat(passingScore) : null,
      certificateRequired: certificateRequired !== false,
      cost: cost ? parseFloat(cost) : 0,
      providerId: providerId || null,
      trainerId: trainerId || null,
      status: status || "active",
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "TRAINING_PROGRAM_CREATED", resourceType: "training_program", resourceId: item.id, newValues: { title, code, category } });
  return NextResponse.json({ item }, { status: 201 });
}

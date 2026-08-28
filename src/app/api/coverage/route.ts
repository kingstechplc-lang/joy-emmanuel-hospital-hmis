// =====================================================================
// API: /api/coverage
//   GET  — list coverage requests
//   POST — create a coverage request
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const departmentId = url.searchParams.get("departmentId");
  const status = url.searchParams.get("status");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { facilityId: { in: orgFacilityIds } };
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.shiftDate = {};
    if (dateFrom) where.shiftDate.gte = new Date(dateFrom);
    if (dateTo) where.shiftDate.lte = new Date(dateTo);
  }

  const items = await db.coverageRequest.findMany({
    where,
    orderBy: [{ shiftDate: "asc" }, { priority: "desc" }],
    take: 300,
    include: {
      originalStaff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true } },
      replacementStaff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      shift: { select: { id: true, startTime: true, endTime: true } },
    },
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COVERAGE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { facilityId, departmentId, shiftId, originalStaffId, reason, requiredProfession, requiredSpecialty, shiftDate, startTime, endTime, priority, notes } = body;

  if (!facilityId || !originalStaffId || !shiftDate || !startTime) {
    return NextResponse.json({ error: "facilityId, originalStaffId, shiftDate, startTime are required" }, { status: 400 });
  }

  const facility = await db.facility.findUnique({ where: { id: facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  }

  const item = await db.coverageRequest.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId,
      departmentId: departmentId || null,
      shiftId: shiftId || null,
      originalStaffId,
      reason,
      requiredProfession,
      requiredSpecialty,
      shiftDate: new Date(shiftDate),
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : null,
      priority: priority || "normal",
      notes,
      status: "open",
    },
  });

  // Notify managers in the facility who can assign coverage
  try {
    const managers = await db.user.findMany({
      where: {
        organizationId: session.user.organizationId,
        status: "active",
        userRoles: {
          some: {
            role: {
              permissions: {
                some: {
                  permission: { code: { in: [PERMISSIONS.COVERAGE_MANAGE, PERMISSIONS.SHIFT_MANAGE] } },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    for (const mgr of managers) {
      await db.notification.create({
        data: {
          userId: mgr.id,
          facilityId,
          type: "coverage_required",
          title: "Coverage Required",
          message: `Coverage needed for ${requiredProfession || "staff"} on ${new Date(shiftDate).toLocaleDateString()} at ${facility.name}.`,
          referenceType: "coverage_request",
          referenceId: item.id,
        },
      });
    }
  } catch (e) {
    console.error("Notification failed (non-fatal):", e);
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "COVERAGE_REQUEST_CREATED",
    resourceType: "coverage_request",
    resourceId: item.id,
    newValues: { facilityId, originalStaffId, shiftDate, priority },
  });

  return NextResponse.json({ item }, { status: 201 });
}

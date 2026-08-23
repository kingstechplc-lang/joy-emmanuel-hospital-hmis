// =====================================================================
// API: /api/appointments/waiting-list
//   GET  — list waiting list entries
//   POST — add patient to waiting list
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.APPOINTMENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "waiting";
  const facilityId = url.searchParams.get("facilityId");

  const where: any = { organizationId: session.user.organizationId, status };
  if (facilityId) where.facilityId = facilityId;

  const items = await db.waitingList.findMany({
    where,
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, phone: true } },
    },
    take: 100,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.APPOINTMENT_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { patientId, facilityId, departmentId, staffId, specialty, preferredDate, preferredTime, priority, contactMethod, notes } = body;
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

  const item = await db.waitingList.create({
    data: {
      organizationId: session.user.organizationId,
      patientId,
      facilityId: facilityId || null,
      departmentId: departmentId || null,
      staffId: staffId || null,
      specialty: specialty || null,
      preferredDate: preferredDate ? new Date(preferredDate) : null,
      preferredTime: preferredTime || "any",
      priority: priority || "routine",
      contactMethod: contactMethod || "phone",
      notes: notes || null,
      status: "waiting",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "WAITING_LIST_ADDED",
    resourceType: "waitingList",
    resourceId: item.id,
    newValues: { patientId, priority },
  });

  return NextResponse.json({ item }, { status: 201 });
}

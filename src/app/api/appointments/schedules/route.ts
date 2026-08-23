// =====================================================================
// API: /api/appointments/schedules
//   GET  — list clinician schedules / clinic sessions
//   POST — create a schedule or clinic session
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
  const type = url.searchParams.get("type") || "schedule"; // schedule | session
  const facilityId = url.searchParams.get("facilityId");
  const staffId = url.searchParams.get("staffId");

  if (type === "session") {
    const where: any = { organizationId: session.user.organizationId };
    if (facilityId) where.facilityId = facilityId;
    const items = await db.clinicSession.findMany({
      where,
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return NextResponse.json({ items, count: items.length });
  }

  // Default: clinician schedules
  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (staffId) where.staffId = staffId;
  const items = await db.clinicianSchedule.findMany({
    where,
    orderBy: [{ staffName: "asc" }, { dayOfWeek: "asc" }],
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.APPOINTMENT_RESCHEDULE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { type, ...data } = body;
  const orgId = session.user.organizationId;

  if (type === "session") {
    const item = await db.clinicSession.create({
      data: { ...data, organizationId: orgId },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: orgId,
      action: "CLINIC_SESSION_CREATED",
      resourceType: "clinicSession",
      resourceId: item.id,
    });
    return NextResponse.json({ item }, { status: 201 });
  }

  // Default: clinician schedule
  const item = await db.clinicianSchedule.create({
    data: { ...data, organizationId: orgId },
  });
  await auditLog({
    userId: session.user.id,
    organizationId: orgId,
    action: "CLINICIAN_SCHEDULE_CREATED",
    resourceType: "clinicianSchedule",
    resourceId: item.id,
  });
  return NextResponse.json({ item }, { status: 201 });
}

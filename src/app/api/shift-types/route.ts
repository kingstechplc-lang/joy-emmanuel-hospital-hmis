// =====================================================================
// API: /api/shift-types
//   GET  — list shift types (filter by organization/facility/active)
//   POST — create a new shift type
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
  const activeOnly = url.searchParams.get("active") !== "false";

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) {
    where.OR = [{ facilityId: null }, { facilityId }];
  }
  if (activeOnly) where.active = true;

  const items = await db.shiftType.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { name, code, category, colorHex, startTime, endTime, overnight, isOnCall, defaultBreakMinutes, paidBreak, workingHours, description, facilityId, sortOrder } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name, code are required" }, { status: 400 });
  }

  if (facilityId) {
    const facility = await db.facility.findUnique({ where: { id: facilityId } });
    if (!facility || facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  const existing = await db.shiftType.findUnique({
    where: { organizationId_code: { organizationId: session.user.organizationId, code } },
  });
  if (existing) {
    return NextResponse.json({ error: `Shift type with code ${code} already exists` }, { status: 409 });
  }

  const shiftType = await db.shiftType.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      name,
      code,
      category: category || "regular",
      colorHex,
      startTime,
      endTime,
      overnight: !!overnight,
      isOnCall: !!isOnCall,
      defaultBreakMinutes,
      paidBreak: paidBreak !== false,
      workingHours,
      description,
      sortOrder: sortOrder || 0,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SHIFT_TYPE_CREATED",
    resourceType: "shift_type",
    resourceId: shiftType.id,
    newValues: { name, code, category },
  });

  return NextResponse.json({ item: shiftType }, { status: 201 });
}

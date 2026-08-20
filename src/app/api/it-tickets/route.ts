// =====================================================================
// API: /api/it-tickets
//   GET  — list IT ticket records
//   POST — create a new IT ticket
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
  if (!hasPermission(session, PERMISSIONS.IT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");
  const ticketType = url.searchParams.get("ticketType");
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) {
    where.facilityId = facilityId;
  } else {
    where.facilityId = { in: orgFacilityIds };
  }
  if (ticketType && ticketType !== "all") where.ticketType = ticketType;
  if (status && status !== "all") where.status = status;
  if (priority && priority !== "all") where.priority = priority;
  if (search) {
    where.OR = [{ ticketNumber: { contains: search, mode: "insensitive" } }, { subject: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }, { affectedSystem: { contains: search, mode: "insensitive" } }, { reportedByName: { contains: search, mode: "insensitive" } }];
  }

  const items = await db.iTTicket.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  if (!ticketType || !subject || !description) {
    return NextResponse.json({ error: "Missing required fields: ticketType, subject, description" }, { status: 400 });
  }

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }
  const year = new Date().getFullYear();
  const count = await db.iTTicket.count({ where: { organizationId: session.user.organizationId } });
  const ticketNumber = `IT-${year}-${String(count + 1).padStart(6, "0")}`;

  const item = await db.iTTicket.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      ticketNumber,
      ...body,
      facilityId: resolvedFacilityId,
      organizationId: session.user.organizationId,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "IT_TICKET_CREATED",
    resourceType: "iTTicket",
    resourceId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}

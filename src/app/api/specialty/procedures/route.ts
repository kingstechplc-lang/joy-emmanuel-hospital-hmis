// =====================================================================
// API: /api/specialty/procedures
//   GET  — list procedures (filter by encounterId)
//   POST — create a procedure on an encounter
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
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const encounterId = url.searchParams.get("encounterId");
  const status = url.searchParams.get("status");

  if (!encounterId) {
    return NextResponse.json({ error: "encounterId is required" }, { status: 400 });
  }

  // Verify encounter belongs to user's org
  const encounter = await db.specialtyEncounter.findUnique({ where: { id: encounterId } });
  if (!encounter || encounter.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const where: any = { specialtyEncounterId: encounterId };
  if (status) where.status = status;

  const items = await db.specialtyProcedure.findMany({
    where,
    orderBy: [{ startedAt: "desc" }],
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  if (!body.specialtyEncounterId || !body.procedureName) {
    return NextResponse.json({ error: "Missing required fields: specialtyEncounterId, procedureName" }, { status: 400 });
  }

  const encounter = await db.specialtyEncounter.findUnique({ where: { id: body.specialtyEncounterId } });
  if (!encounter || encounter.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
  }

  const { id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, ...createData } = body;

  const item = await db.specialtyProcedure.create({
    data: {
      ...createData,
      organizationId: session.user.organizationId,
      facilityId: encounter.facilityId,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: encounter.facilityId || undefined,
    action: "SPECIALTY_PROCEDURE_CREATED",
    resourceType: "specialtyProcedure",
    resourceId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}

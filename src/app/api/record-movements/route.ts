// =====================================================================
// API: /api/record-movements
//   GET  — list movements (filter by patientId, recordRequestId)
//   POST — create a movement (manual movement logging)
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
  if (!hasPermission(session, PERMISSIONS.PATIENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const recordRequestId = url.searchParams.get("recordRequestId");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (recordRequestId) where.recordRequestId = recordRequestId;

  const items = await db.recordMovement.findMany({
    where,
    orderBy: { movedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { patientName, movementType } = body;
  if (!patientName || !movementType) {
    return NextResponse.json({ error: "patientName and movementType are required" }, { status: 400 });
  }

  const item = await db.recordMovement.create({
    data: {
      ...body,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "RECORD_MOVEMENT_LOGGED",
    resourceType: "record_movement",
    resourceId: item.id,
    newValues: { movementType, patientName },
  });

  return NextResponse.json({ item }, { status: 201 });
}

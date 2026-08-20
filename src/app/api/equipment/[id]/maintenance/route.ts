// =====================================================================
// API: /api/equipment/[id]/maintenance
//   GET  — list maintenance records for an equipment
//   POST — schedule/record a maintenance event
//
// POST body:
//   { maintenanceType, description, performedById?, performedAt?, nextDueAt?, cost?, status? }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const records = await db.equipmentMaintenance.findMany({
    where: { equipmentId: id },
    orderBy: { performedAt: "desc" },
    include: {
      performedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: records, count: records.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_ADJUST)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const {
    maintenanceType, description, performedById,
    performedAt, nextDueAt, cost, status,
  } = body;

  if (!maintenanceType) return NextResponse.json({ error: "maintenanceType is required" }, { status: 400 });
  if (!description) return NextResponse.json({ error: "description is required" }, { status: 400 });

  // Validate equipment exists
  const equipment = await db.equipment.findUnique({ where: { id } });
  if (!equipment) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

  // Create maintenance record + flip equipment status to maintenance if preventive/corrective
  const result = await db.$transaction(async (tx) => {
    const m = await tx.equipmentMaintenance.create({
      data: {
        equipmentId: id,
        maintenanceType,
        description,
        performedById: performedById || session.user.id,
        performedAt: performedAt ? new Date(performedAt) : new Date(),
        nextDueAt: nextDueAt ? new Date(nextDueAt) : null,
        cost: cost != null ? Number(cost) : null,
        status: status || "completed",
      },
    });

    // If maintenance is corrective, mark equipment as "maintenance"
    if ((maintenanceType === "corrective" || maintenanceType === "preventive") && equipment.status === "active") {
      await tx.equipment.update({
        where: { id },
        data: { status: "maintenance" },
      });
    }

    return m;
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: equipment.facilityId || session.user.facilityId || undefined,
    action: "EQUIPMENT_MAINTENANCE_SCHEDULED",
    resourceType: "equipment_maintenance",
    resourceId: result.id,
    newValues: {
      equipmentId: id,
      equipmentName: equipment.name,
      maintenanceType,
      description,
      cost,
      nextDueAt,
    },
  });

  return NextResponse.json({ item: result }, { status: 201 });
}

// =====================================================================
// API: /api/lab-orders
//   GET  — list lab orders filtered by facility/status/priority/patientId
//   POST — create a new lab order (lab.order permission)
//          auto-generates orderNumber via nextLabOrderNumber(facilityId)
//          creates LabOrder + multiple LabOrderItems
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextLabOrderNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/lab-orders?facilityId=...&status=...&priority=...&patientId=...&limit=50
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LAB_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (patientId) where.patientId = patientId;

  const orders = await db.labOrder.findMany({
    where,
    orderBy: { orderedAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true } },
      encounter: { select: { id: true, encounterNumber: true, encounterType: true } },
      facility: { select: { id: true, name: true, code: true } },
      orderingClinician: { select: { id: true, firstName: true, lastName: true } },
      items: {
        include: {
          laboratoryTest: { select: { id: true, name: true, code: true, unit: true, referenceRange: true } },
          results: true,
        },
      },
      samples: true,
      _count: { select: { items: true, samples: true } },
    },
  });

  return NextResponse.json({ items: orders, count: orders.length });
}

// POST /api/lab-orders
// Body: { patientId, encounterId, facilityId, testIds: string[], priority, notes, orderingClinicianId }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LAB_ORDER)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { patientId, encounterId, facilityId, testIds, priority, notes, orderingClinicianId } = body;

  if (!patientId || !facilityId) {
    return NextResponse.json({ error: "patientId and facilityId are required" }, { status: 400 });
  }
  if (!testIds || !Array.isArray(testIds) || testIds.length === 0) {
    return NextResponse.json({ error: "At least one test must be selected" }, { status: 400 });
  }

  // Resolve encounter: explicit, or use selectedEncounter from store, or auto-create one
  let finalEncounterId = encounterId;
  if (!finalEncounterId) {
    // Auto-create a minimal laboratory encounter
    const year = new Date().getFullYear();
    const count = await db.encounter.count({ where: { facilityId } });
    const encounterNumber = `ENC-${year}-${String(count + 1).padStart(6, "0")}`;
    const enc = await db.encounter.create({
      data: {
        patientId,
        facilityId,
        encounterNumber,
        encounterType: "laboratory",
        status: "in_progress",
        priority: priority || "routine",
        attendingStaffId: session.user.id,
        startAt: new Date(),
        createdById: session.user.id,
      },
    });
    finalEncounterId = enc.id;
  }

  // Verify tests exist & belong to org
  const tests = await db.laboratoryTest.findMany({
    where: {
      id: { in: testIds },
      organizationId: session.user.organizationId,
      status: "active",
    },
  });
  if (tests.length === 0) {
    return NextResponse.json({ error: "No valid tests selected" }, { status: 400 });
  }

  const orderNumber = await nextLabOrderNumber(facilityId);

  // Use a transaction to create order + items atomically
  const order = await db.labOrder.create({
    data: {
      patientId,
      encounterId: finalEncounterId,
      facilityId,
      orderingClinicianId: orderingClinicianId || session.user.id,
      orderNumber,
      status: "ordered",
      priority: priority || "routine",
      notes: notes || null,
      orderedAt: new Date(),
      items: {
        create: tests.map((t) => ({
          laboratoryTestId: t.id,
          status: "ordered",
        })),
      },
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      items: { include: { laboratoryTest: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "LAB_ORDER_CREATED",
    resourceType: "lab_order",
    resourceId: order.id,
    newValues: {
      orderNumber,
      patientId,
      encounterId: finalEncounterId,
      priority,
      testCount: tests.length,
      testCodes: tests.map((t) => t.code),
      notes: notes || null,
    },
  });

  return NextResponse.json({ item: order }, { status: 201 });
}

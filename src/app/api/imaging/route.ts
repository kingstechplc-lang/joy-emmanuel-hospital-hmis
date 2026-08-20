// =====================================================================
// API: /api/imaging
//   GET  — list imaging orders filtered by facility/status/patientId
//   POST — create new imaging order (imaging.order permission)
//          auto-creates a draft ImagingReport capturing the indication
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { notifyImagingOrderCreated } from "@/lib/workflow-notifications";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/imaging?facilityId=...&status=...&patientId=...&limit=50
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMAGING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (patientId) where.patientId = patientId;

  const orders = await db.imagingOrder.findMany({
    where,
    orderBy: { orderedAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true } },
      encounter: { select: { id: true, encounterNumber: true, encounterType: true } },
      facility: { select: { id: true, name: true, code: true } },
      orderingClinician: { select: { id: true, firstName: true, lastName: true } },
      report: true,
    },
  });

  return NextResponse.json({ items: orders, count: orders.length });
}

// POST /api/imaging
// Body: { patientId, encounterId, facilityId, procedureName, procedureCode, priority, indication, orderingClinicianId }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMAGING_ORDER)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { patientId, encounterId, facilityId, procedureName, procedureCode, priority, indication, orderingClinicianId } = body;

  if (!patientId || !facilityId) {
    return NextResponse.json({ error: "patientId and facilityId are required" }, { status: 400 });
  }
  if (!procedureName) {
    return NextResponse.json({ error: "procedureName is required" }, { status: 400 });
  }

  // Resolve encounter
  let finalEncounterId = encounterId;
  if (!finalEncounterId) {
    const year = new Date().getFullYear();
    const count = await db.encounter.count({ where: { facilityId } });
    const encounterNumber = `ENC-${year}-${String(count + 1).padStart(6, "0")}`;
    const enc = await db.encounter.create({
      data: {
        patientId,
        facilityId,
        encounterNumber,
        encounterType: "imaging",
        status: "in_progress",
        priority: priority || "routine",
        attendingStaffId: session.user.id,
        startAt: new Date(),
        createdById: session.user.id,
      },
    });
    finalEncounterId = enc.id;
  }

  const order = await db.imagingOrder.create({
    data: {
      patientId,
      encounterId: finalEncounterId,
      facilityId,
      orderingClinicianId: orderingClinicianId || session.user.id,
      procedureName,
      procedureCode: procedureCode || null,
      priority: priority || "routine",
      status: "ordered",
      orderedAt: new Date(),
      // Create a draft report capturing the indication in findings
      report: indication
        ? {
            create: {
              patientId,
              findings: indication ? `Indication: ${indication}` : null,
              status: "draft",
            },
          }
        : undefined,
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      report: true,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "IMAGING_ORDERED",
    resourceType: "imaging_order",
    resourceId: order.id,
    newValues: {
      patientId,
      encounterId: finalEncounterId,
      procedureName,
      procedureCode,
      priority,
      indication: indication || null,
    },
  });

  // 🔔 Fire workflow notification to radiology staff
  await notifyImagingOrderCreated({
    organizationId: session.user.organizationId,
    facilityId,
    orderNumber: order.id.slice(-8).toUpperCase(),
    patientName: order.patient ? `${order.patient.firstName} ${order.patient.lastName}` : "Unknown",
    modality: procedureCode || "Imaging",
    studyType: procedureName,
    orderId: order.id,
    orderingClinicianId: session.user.id,
  });

  return NextResponse.json({ item: order }, { status: 201 });
}

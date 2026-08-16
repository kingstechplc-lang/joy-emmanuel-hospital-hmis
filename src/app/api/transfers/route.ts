// =====================================================================
// API: /api/transfers
//   GET  — list patient transfers (filter by facility, status, patient)
//   POST — create transfer request
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/transfers?facilityId=...&status=...&patientId=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");

  const where: any = {};
  if (facilityId) {
    // Either from or to facility
    where.OR = [{ fromFacilityId: facilityId }, { toFacilityId: facilityId }];
  }
  if (status) where.status = status;
  if (patientId) where.patientId = patientId;

  const transfers = await db.patientTransfer.findMany({
    where,
    orderBy: { requestedAt: "desc" },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true } },
      admission: {
        select: {
          id: true, admissionNumber: true, admissionType: true, admissionDiagnosis: true,
          status: true, admittedAt: true,
          admittedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      fromFacility: { select: { id: true, name: true, code: true } },
      toFacility: { select: { id: true, name: true, code: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: transfers, count: transfers.length });
}

// POST /api/transfers
// body: { patientId, admissionId, fromFacilityId, toFacilityId, fromWardId?, fromBedId?,
//         toWardId, toBedId, reason, clinicalSummary, requestedById? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_TRANSFER)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    patientId, admissionId, fromFacilityId, toFacilityId,
    fromWardId, fromBedId, toWardId, toBedId, reason, clinicalSummary, requestedById,
  } = body;

  if (!patientId || !admissionId || !fromFacilityId || !toFacilityId || !toWardId) {
    return NextResponse.json({ error: "patientId, admissionId, fromFacilityId, toFacilityId, toWardId are required" }, { status: 400 });
  }

  const transfer = await db.patientTransfer.create({
    data: {
      patientId,
      admissionId,
      fromFacilityId,
      toFacilityId,
      fromWardId: fromWardId || null,
      toWardId,
      fromBedId: fromBedId || null,
      toBedId: toBedId || null,
      reason: reason || null,
      clinicalSummary: clinicalSummary || null,
      requestedById: requestedById || session.user.id,
      requestedAt: new Date(),
      status: "requested",
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      fromFacility: { select: { id: true, name: true } },
      toFacility: { select: { id: true, name: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: fromFacilityId,
    action: "PATIENT_TRANSFER_REQUESTED",
    resourceType: "patient_transfer",
    resourceId: transfer.id,
    newValues: { patientId, admissionId, fromFacilityId, toFacilityId, toWardId, reason },
  });

  return NextResponse.json({ item: transfer }, { status: 201 });
}

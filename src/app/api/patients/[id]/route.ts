// =====================================================================
// API: /api/patients/[id] — get full 360° patient record
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      identifiers: true,
      contacts: true,
      emergencyContacts: true,
      nextOfKin: true,
      insurance: { include: { insuranceProvider: true } },
      allergies: { orderBy: { recordedAt: "desc" } },
      medicalHistory: { orderBy: { createdAt: "desc" } },
      surgicalHistory: { orderBy: { createdAt: "desc" } },
      familyHistory: { orderBy: { createdAt: "desc" } },
      socialHistory: { orderBy: { createdAt: "desc" } },
      immunizations: { orderBy: { administeredAt: "desc" }, take: 20 },
      vitalSigns: {
        orderBy: { recordedAt: "desc" },
        take: 30,
      },
      encounters: {
        orderBy: { startAt: "desc" },
        include: { facility: true, department: true },
        take: 50,
      },
      appointments: {
        orderBy: { scheduledStart: "desc" },
        include: { facility: true, department: true },
        take: 20,
      },
      consultations: {
        orderBy: { createdAt: "desc" },
        include: { encounter: { include: { facility: true } } },
        take: 20,
      },
      diagnoses: { orderBy: { diagnosedAt: "desc" }, take: 30 },
      prescriptions: {
        orderBy: { prescribedAt: "desc" },
        include: { items: { include: { medication: true } }, encounter: { include: { facility: true } } },
        take: 20,
      },
      labOrders: {
        orderBy: { orderedAt: "desc" },
        include: { items: { include: { laboratoryTest: true, results: true } }, encounter: { include: { facility: true } } },
        take: 20,
      },
      imagingOrders: {
        orderBy: { orderedAt: "desc" },
        include: { report: true, encounter: { include: { facility: true } } },
        take: 20,
      },
      procedures: { orderBy: { performedAt: "desc" }, take: 20 },
      admissions: {
        orderBy: { admittedAt: "desc" },
        include: { facility: true, bedAssignments: { include: { bed: true, ward: true } } },
        take: 20,
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        include: { items: true, payments: true },
        take: 20,
      },
      payments: {
        orderBy: { receivedAt: "desc" },
        include: { invoice: true },
        take: 20,
      },
      documents: { orderBy: { uploadedAt: "desc" }, take: 20 },
      consents: { orderBy: { createdAt: "desc" }, take: 20 },
      referralsFrom: {
        orderBy: { referredAt: "desc" },
        include: { referringFacility: true, receivingFacility: true },
        take: 20,
      },
      nursingNotes: { orderBy: { createdAt: "desc" }, take: 20 },
      carePlans: { orderBy: { createdAt: "desc" }, take: 20 },
      maternityRecords: { orderBy: { createdAt: "desc" }, include: { newborns: true }, take: 5 },
      accessLogs: {
        orderBy: { accessedAt: "desc" },
        include: { user: { select: { firstName: true, lastName: true } } },
        take: 10,
      },
    },
  });

  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  // Log access for audit purposes
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "PATIENT_VIEWED",
    resourceType: "patient",
    resourceId: patient.id,
    newValues: { patientNumber: patient.patientNumber },
  });

  // Also log to patient_access_log
  try {
    await db.patientAccessLog.create({
      data: {
        patientId: patient.id,
        userId: session.user.id,
        facilityId: session.user.facilityId || null,
        accessType: "view",
        resourceType: "patient",
        resourceId: patient.id,
      },
    });
  } catch (e) {
    // ignore
  }

  return NextResponse.json({ patient });
}

// =====================================================================
// PATCH — update patient biographic/demographic information
//   Requires patient.edit permission. Audit-logged.
//   Protected fields (patientNumber, organizationId) cannot be changed.
// =====================================================================
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_EDIT)) {
    return NextResponse.json({ error: "Forbidden — patient.edit permission required" }, { status: 403 });
  }

  const { id } = await params;

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  // Fetch existing patient (with org scope check)
  const existing = await db.patient.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  // Strip protected fields — these can never be edited via this endpoint
  const {
    id: _id,
    organizationId: _orgId,
    patientNumber: _pn,
    registeredAtFacilityId: _raf,
    registeredBy: _rb,
    registrationDate: _rd,
    createdAt: _c,
    updatedAt: _u,
    ...updateData
  } = body;

  // Convert dateOfBirth string to Date if provided
  if (updateData.dateOfBirth) {
    updateData.dateOfBirth = new Date(updateData.dateOfBirth);
  }

  // Validate sex field if provided
  if (updateData.sex && !["male", "female", "intersex", "unknown"].includes(updateData.sex)) {
    return NextResponse.json({ error: "Invalid sex value" }, { status: 400 });
  }

  // Validate status field if provided
  if (updateData.status && !["active", "inactive", "merged", "deceased"].includes(updateData.status)) {
    return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
  }

  const updated = await db.patient.update({
    where: { id },
    data: updateData,
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "PATIENT_UPDATED",
    resourceType: "patient",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({ patient: updated });
}

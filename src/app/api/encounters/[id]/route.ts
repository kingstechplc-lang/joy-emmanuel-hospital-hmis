// =====================================================================
// API: /api/encounters/[id]
//   GET   — single encounter with all related clinical records
//   PATCH — update status/priority/department with Zod validation + state machine
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { updateEncounterSchema, isValidTransition, isTerminalStatus, cancelEncounterSchema } from "@/lib/encounter-validation";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const encounter = await db.encounter.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, middleName: true, lastName: true, dateOfBirth: true, sex: true, phone: true, bloodGroup: true, allergies: { where: { status: "active" }, select: { allergen: true, severity: true, reaction: true }, take: 10 } } },
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      triageRecords: { orderBy: { recordedAt: "desc" }, take: 5 },
      vitalSigns: { orderBy: { recordedAt: "desc" }, take: 10 },
      consultations: { orderBy: { createdAt: "desc" }, include: { clinician: { select: { id: true, firstName: true, lastName: true } } }, take: 10 },
      diagnoses: { orderBy: { diagnosedAt: "desc" }, take: 20 },
      prescriptions: { orderBy: { prescribedAt: "desc" }, include: { items: { include: { medication: true } } }, take: 10 },
      labOrders: { orderBy: { orderedAt: "desc" }, include: { items: { include: { laboratoryTest: true, results: true } } }, take: 10 },
      imagingOrders: { orderBy: { orderedAt: "desc" }, take: 10 },
      procedures: { orderBy: { performedAt: "desc" }, take: 10 },
      admissions: { orderBy: { admittedAt: "desc" }, take: 5 },
      nursingNotes: { orderBy: { createdAt: "desc" }, take: 10 },
      invoices: { orderBy: { createdAt: "desc" }, take: 10 },
      // NHIS workflow relations
      encounterCoverage: true,
      attendanceVerification: true,
    },
  });

  if (!encounter) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });

  return NextResponse.json({ item: encounter });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_EDIT) && !hasPermission(session, PERMISSIONS.ENCOUNTER_CLOSE)) {
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

  // Check if this is a cancellation request
  if (body.action === "cancel") {
    return handleCancel(id, body, session);
  }

  // Zod validation
  const parsed = updateEncounterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: "Validation failed",
      details: parsed.error.issues.map((i: any) => ({ field: i.path.join("."), message: i.message })),
    }, { status: 400 });
  }

  const existing = await db.encounter.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });

  // Check if encounter is already in terminal state
  if (isTerminalStatus(existing.status) && parsed.data.status && parsed.data.status !== existing.status) {
    return NextResponse.json({ error: `Cannot modify a ${existing.status} encounter` }, { status: 422 });
  }

  // Validate status transition
  if (parsed.data.status && parsed.data.status !== existing.status) {
    if (!isValidTransition(existing.status, parsed.data.status)) {
      return NextResponse.json({
        error: `Invalid status transition: ${existing.status} → ${parsed.data.status}`,
        allowedTransitions: ["open → in_progress/cancelled/completed/admitted", "in_progress → completed/cancelled/admitted/discharged", "admitted → discharged/cancelled", "discharged → completed/cancelled"],
      }, { status: 422 });
    }

    // Check if close permission is required
    if (isTerminalStatus(parsed.data.status) && !hasPermission(session, PERMISSIONS.ENCOUNTER_CLOSE)) {
      return NextResponse.json({ error: "Missing encounter.close permission" }, { status: 403 });
    }
  }

  const data: any = {};
  if (parsed.data.status) {
    data.status = parsed.data.status;
    // Fix: discharged also sets endAt (was previously missing)
    if (["completed", "cancelled", "discharged"].includes(parsed.data.status)) {
      data.endAt = new Date();
      data.checkOutAt = new Date();
    }
  }
  if (parsed.data.priority) data.priority = parsed.data.priority;
  if (parsed.data.attendingStaffId !== undefined) data.attendingStaffId = parsed.data.attendingStaffId;
  if (parsed.data.departmentId !== undefined) data.departmentId = parsed.data.departmentId;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

  const updated = await db.encounter.update({
    where: { id },
    data,
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "ENCOUNTER_UPDATED",
    resourceType: "encounter",
    resourceId: id,
    oldValues: { status: existing.status, priority: existing.priority },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}

// --- Cancellation handler ---
async function handleCancel(id: string, body: any, session: any) {
  const parsed = cancelEncounterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: "Validation failed",
      details: parsed.error.issues.map((i: any) => ({ field: i.path.join("."), message: i.message })),
    }, { status: 400 });
  }

  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_CLOSE)) {
    return NextResponse.json({ error: "Missing encounter.close permission to cancel" }, { status: 403 });
  }

  const existing = await db.encounter.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });

  if (isTerminalStatus(existing.status)) {
    return NextResponse.json({ error: `Cannot cancel an already ${existing.status} encounter` }, { status: 422 });
  }

  const updated = await db.encounter.update({
    where: { id },
    data: {
      status: "cancelled",
      endAt: new Date(),
      checkOutAt: new Date(),
      cancelledAt: new Date(),
      cancelledById: session.user.id,
      cancelReason: parsed.data.reason,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "ENCOUNTER_CANCELLED",
    resourceType: "encounter",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status: "cancelled", cancelReason: parsed.data.reason, cancelledById: session.user.id },
  });

  return NextResponse.json({ item: updated });
}

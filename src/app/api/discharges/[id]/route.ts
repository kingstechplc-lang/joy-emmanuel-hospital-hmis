// =====================================================================
// API: /api/discharges/[id]
//   GET    — full discharge record detail (with checklist + medications + admission + patient)
//   PATCH  — alias of /api/discharges PATCH (for action: approve/finalize/cancel/etc.)
//   DELETE — soft delete (rare; only for drafts)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const discharge = await db.dischargeRecord.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true, address: true, bloodGroup: true } },
      admission: {
        select: {
          id: true, admissionNumber: true, admissionType: true, admissionDiagnosis: true, admissionReason: true,
          admittedAt: true, dischargedAt: true, status: true, attendingClinicianId: true,
          facility: { select: { id: true, name: true, code: true } },
          bedAssignments: { include: { ward: { select: { name: true } }, bed: { select: { bedNumber: true, bedType: true } }, room: { select: { roomNumber: true } } }, orderBy: { assignedAt: "asc" } },
        },
      },
      dischargedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      cancelledBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      finalizedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      clinicalClearedBy: { select: { id: true, firstName: true, lastName: true } },
      nursingClearedBy: { select: { id: true, firstName: true, lastName: true } },
      financialClearedBy: { select: { id: true, firstName: true, lastName: true } },
      pharmacyClearedBy: { select: { id: true, firstName: true, lastName: true } },
      checklist: { orderBy: { sortOrder: "asc" } },
      medicationsReconciliation: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!discharge) return NextResponse.json({ error: "Discharge not found" }, { status: 404 });

  // Pull related clinical data for the discharge review screen
  const patientId = discharge.patientId;
  const [diagnoses, labOrders, imagingOrders, procedures, prescriptions, vitals, nursingNotes, wardRounds, intakeOutput] = await Promise.all([
    db.diagnosis.findMany({ where: { patientId }, orderBy: { diagnosedAt: "desc" }, take: 20 }),
    db.labOrder.findMany({ where: { patientId }, orderBy: { orderedAt: "desc" }, take: 10, include: { items: { include: { laboratoryTest: true, results: true } } } }),
    db.imagingOrder.findMany({ where: { patientId }, orderBy: { orderedAt: "desc" }, take: 10, include: { reports: true } }),
    db.procedure.findMany({ where: { patientId }, orderBy: { performedAt: "desc" }, take: 10 }),
    db.prescription.findMany({ where: { patientId }, orderBy: { prescribedAt: "desc" }, take: 20, include: { items: { include: { medication: true } } } }),
    db.vitalSign.findMany({ where: { patientId }, orderBy: { recordedAt: "desc" }, take: 5 }),
    db.nursingNote.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.wardRoundNote.findMany({ where: { patientId }, orderBy: { authoredAt: "desc" }, take: 5 }),
    db.intakeOutputEntry.findMany({ where: { patientId, status: { not: "cancelled" }, eventAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, orderBy: { eventAt: "desc" }, take: 10 }),
  ]);

  // Billing summary
  const invoices = await db.invoice.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { items: true, payments: true },
  });
  const totalBilled = invoices.reduce((s, inv) => s + (inv.total || 0), 0);
  const totalPaid = invoices.reduce((s, inv) => s + (inv.amountPaid || 0), 0);
  const outstandingBalance = totalBilled - totalPaid;

  // Allergies
  const allergies = await db.allergy.findMany({ where: { patientId }, take: 20 });

  return NextResponse.json({
    item: discharge,
    clinical: {
      diagnoses, labOrders, imagingOrders, procedures, prescriptions, vitals, nursingNotes, wardRounds, intakeOutput, allergies,
    },
    billing: {
      invoices,
      totalBilled,
      totalPaid,
      outstandingBalance,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Delegate to the same logic as the main route (simpler to keep here for the [id] variant)
  // Support checklist item update + medication reconciliation item update
  const { action } = body;

  if (action === "checklist_update") {
    const { checklistItemId, status, notes } = body;
    if (!checklistItemId) return NextResponse.json({ error: "checklistItemId is required" }, { status: 400 });
    const validStatuses = ["pending", "completed", "not_applicable", "blocked"];
    if (!validStatuses.includes(status)) return NextResponse.json({ error: `status must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    const updated = await db.dischargeChecklistItem.update({
      where: { id: checklistItemId },
      data: {
        status,
        completedById: status === "completed" ? session.user.id : null,
        completedAt: status === "completed" ? new Date() : null,
        notes: notes ?? undefined,
      },
    });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "DISCHARGE_CHECKLIST_UPDATED", resourceType: "discharge_checklist_item", resourceId: checklistItemId, newValues: { status, notes } });
    return NextResponse.json({ item: updated });
  }

  if (action === "medication_add") {
    const { medicationName, medicationId, strength, dose, route, frequency, duration, quantity, instructions, action: medAction, preAdmission, inpatient } = body;
    if (!medicationName) return NextResponse.json({ error: "medicationName is required" }, { status: 400 });
    const med = await db.dischargeMedication.create({
      data: {
        dischargeId: id,
        medicationName, medicationId, strength, dose, route, frequency, duration, quantity, instructions,
        action: medAction || "continue",
        preAdmission: !!preAdmission, inpatient: !!inpatient,
      },
    });
    return NextResponse.json({ item: med }, { status: 201 });
  }

  if (action === "medication_update") {
    const { medicationId: medRowId, ...updateFields } = body;
    if (!medRowId) return NextResponse.json({ error: "medicationId (row id) is required" }, { status: 400 });
    delete updateFields.action;
    delete updateFields.dischargeId;
    const updated = await db.dischargeMedication.update({ where: { id: medRowId }, data: updateFields });
    return NextResponse.json({ item: updated });
  }

  if (action === "medication_delete") {
    const { medicationId: medRowId } = body;
    if (!medRowId) return NextResponse.json({ error: "medicationId (row id) is required" }, { status: 400 });
    await db.dischargeMedication.delete({ where: { id: medRowId } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action for /api/discharges/[id] PATCH. Use /api/discharges PATCH for lifecycle actions." }, { status: 400 });
}

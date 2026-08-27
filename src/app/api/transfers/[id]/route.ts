// =====================================================================
// API: /api/transfers/[id]
//   GET    — full transfer detail (with checklist + communications + clinical handover data)
//   PATCH  — alias of /api/transfers PATCH for checklist_update
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
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

  const transfer = await db.patientTransfer.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true, address: true, bloodGroup: true } },
      admission: {
        select: {
          id: true, admissionNumber: true, admissionType: true, admissionDiagnosis: true, admissionReason: true,
          admittedAt: true, status: true, attendingClinicianId: true,
          facility: { select: { id: true, name: true, code: true } },
          bedAssignments: { include: { ward: { select: { name: true } }, bed: { select: { bedNumber: true, bedType: true } }, room: { select: { roomNumber: true } } }, orderBy: { assignedAt: "asc" } },
        },
      },
      fromFacility: { select: { id: true, name: true, code: true, address: true, phone: true } },
      toFacility: { select: { id: true, name: true, code: true, address: true, phone: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
      acceptedBy: { select: { id: true, firstName: true, lastName: true } },
      rejectedBy: { select: { id: true, firstName: true, lastName: true } },
      departedBy: { select: { id: true, firstName: true, lastName: true } },
      arrivedBy: { select: { id: true, firstName: true, lastName: true } },
      completedBy: { select: { id: true, firstName: true, lastName: true } },
      cancelledBy: { select: { id: true, firstName: true, lastName: true } },
      checklist: { orderBy: { sortOrder: "asc" } },
      communications: { orderBy: { sentAt: "desc" } },
    },
  });

  if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });

  // Pull related clinical data for the handover screen
  const patientId = transfer.patientId;
  const [diagnoses, labOrders, imagingOrders, procedures, prescriptions, vitals, nursingNotes, intakeOutput, allergies] = await Promise.all([
    db.diagnosis.findMany({ where: { patientId }, orderBy: { diagnosedAt: "desc" }, take: 10 }).catch(() => []),
    db.labOrder.findMany({ where: { patientId }, orderBy: { orderedAt: "desc" }, take: 5, include: { items: { include: { laboratoryTest: true, results: true } } } }).catch(() => []),
    db.imagingOrder.findMany({ where: { patientId }, orderBy: { orderedAt: "desc" }, take: 5, include: { reports: true } }).catch(() => []),
    db.procedure.findMany({ where: { patientId }, orderBy: { performedAt: "desc" }, take: 5 }).catch(() => []),
    db.prescription.findMany({ where: { patientId }, orderBy: { prescribedAt: "desc" }, take: 10, include: { items: { include: { medication: true } } } }).catch(() => []),
    db.vitalSign.findMany({ where: { patientId }, orderBy: { recordedAt: "desc" }, take: 3 }).catch(() => []),
    db.nursingNote.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, take: 5 }).catch(() => []),
    db.intakeOutputEntry.findMany({ where: { patientId, status: { not: "cancelled" }, eventAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, orderBy: { eventAt: "desc" }, take: 5 }).catch(() => []),
    db.allergy.findMany({ where: { patientId }, take: 20 }).catch(() => []),
  ]);

  return NextResponse.json({
    item: transfer,
    clinical: {
      diagnoses, labOrders, imagingOrders, procedures, prescriptions, vitals, nursingNotes, intakeOutput, allergies,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_TRANSFER)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { action } = body;

  // Add communication log
  if (action === "add_communication") {
    const { senderName, recipientName, recipientDepartment, recipientFacility, messageType, message, outcome } = body;
    if (!messageType || !recipientName) return NextResponse.json({ error: "messageType and recipientName are required" }, { status: 400 });
    const comm = await db.transferCommunication.create({
      data: {
        transferId: id,
        senderId: session.user.id,
        senderName: senderName || session.user.name,
        recipientName,
        recipientDepartment: recipientDepartment || null,
        recipientFacility: recipientFacility || null,
        messageType,
        message: message || null,
        outcome: outcome || null,
      },
    });
    return NextResponse.json({ item: comm }, { status: 201 });
  }

  return NextResponse.json({ error: "Use /api/transfers PATCH for lifecycle actions" }, { status: 400 });
}

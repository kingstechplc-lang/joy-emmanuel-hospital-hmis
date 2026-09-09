// =====================================================================
// API: /api/medication-labels
//   GET    — list labels (filter by facility/patient/prescriptionItem/status)
//   POST   — mint a new label for a dispensed prescription item
//
// PERMISSIONS:
//   GET     requires  medication_label.print
//   POST    requires  medication_label.print  (minting IS printing)
//
// The POST endpoint:
//   1. Generates an opaque token via crypto.randomUUID
//   2. Calls assembleMedicationLabelContent to build the snapshot
//   3. Persists a MedicationLabel row with status="active"
//   4. Audit-logs the minting
//   5. Returns the full label record (with content + relations)
//
// Note: For a given PrescriptionItem, multiple labels CAN exist over
// time (each dispense event = one label). The frontend should look up
// the most recent active label for an item before deciding to mint
// a new one.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  assembleMedicationLabelContent,
  generateMedicationLabelToken,
} from "@/lib/medication-label/assembler";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_STATUSES = ["active", "voided"];

// GET /api/medication-labels?facilityId=...&patientId=...&prescriptionItemId=...&status=...&limit=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MEDICATION_LABEL_PRINT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId") || undefined;
  const prescriptionItemId = url.searchParams.get("prescriptionItemId") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "100");

  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (patientId) where.patientId = patientId;
  if (prescriptionItemId) where.prescriptionItemId = prescriptionItemId;
  if (status) where.status = status;

  try {
    const items = await db.medicationLabel.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 500),
      include: {
        patient: {
          select: {
            id: true, patientNumber: true, firstName: true, lastName: true,
            dateOfBirth: true, sex: true, bloodGroup: true,
          },
        },
        prescriptionItem: {
          select: {
            id: true, dose: true, frequency: true, route: true, duration: true,
            quantity: true, dispensedQuantity: true, status: true,
            medication: { select: { id: true, genericName: true, brandName: true, strength: true } },
          },
        },
        inventoryBatch: {
          select: { id: true, batchNumber: true, expiryDate: true, status: true },
        },
        firstPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        lastPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        voidedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ items, count: items.length });
  } catch (e: any) {
    console.error("[GET /api/medication-labels]", e);
    return NextResponse.json({ error: e.message || "Failed to load labels" }, { status: 500 });
  }
}

// POST /api/medication-labels
//   Body: { prescriptionItemId: string, batchId?: string }
//   Returns: { ...label, content }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MEDICATION_LABEL_PRINT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { prescriptionItemId, batchId } = body;
  if (!prescriptionItemId) {
    return NextResponse.json({ error: "prescriptionItemId is required" }, { status: 400 });
  }

  try {
    // Generate token and build the QR payload
    const token = generateMedicationLabelToken();
    const origin = new URL(req.url).origin;

    // Assemble the content snapshot
    const assembled = await assembleMedicationLabelContent(prescriptionItemId, batchId, token, origin);

    // Persist the label row
    const created = await db.medicationLabel.create({
      data: {
        organizationId: assembled.organizationId,
        facilityId: assembled.facilityId,
        patientId: assembled.patientId,
        prescriptionItemId,
        prescriptionId: assembled.prescriptionId,
        inventoryBatchId: assembled.inventoryBatchId,
        token,
        status: "active",
        content: JSON.stringify(assembled.content),
        medicationName: assembled.content.medication.brandName
          ? `${assembled.content.medication.genericName} (${assembled.content.medication.brandName})`
          : assembled.content.medication.genericName,
        genericName: assembled.content.medication.genericName,
        isHighAlert: assembled.content.medication.isHighAlert,
        controlledStatus: assembled.content.medication.controlledStatus,
        firstPrintedById: session.user.id,
        firstPrintedAt: new Date(),
        lastPrintedById: session.user.id,
        lastPrintedAt: new Date(),
        printCount: 1,
      },
      include: {
        patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, bloodGroup: true } },
        prescriptionItem: {
          select: {
            id: true, dose: true, frequency: true, route: true, duration: true,
            quantity: true, dispensedQuantity: true, status: true,
            medication: { select: { id: true, genericName: true, brandName: true, strength: true } },
          },
        },
        inventoryBatch: { select: { id: true, batchNumber: true, expiryDate: true, status: true } },
        firstPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        lastPrintedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: assembled.organizationId,
      facilityId: assembled.facilityId,
      action: "medication_label.create",
      resourceType: "MedicationLabel",
      resourceId: created.id,
      newValues: {
        patientId: assembled.patientId,
        prescriptionItemId,
        batchId: assembled.inventoryBatchId,
        token: token.slice(0, 8) + "...",
        medicationName: assembled.content.medication.genericName,
        isHighAlert: assembled.content.medication.isHighAlert,
      },
    });

    return NextResponse.json(
      { ...created, content: assembled.content },
      { status: 201 },
    );
  } catch (e: any) {
    console.error("[POST /api/medication-labels]", e);
    return NextResponse.json({ error: e.message || "Failed to mint label" }, { status: 500 });
  }
}

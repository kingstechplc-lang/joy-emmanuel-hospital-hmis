// =====================================================================
// API: /api/medication-labels/[id]
//   GET    — fetch a single label (with full content + relations)
//   PATCH  — lifecycle: reprint | void
//
// PERMISSIONS:
//   GET     requires  medication_label.print
//   PATCH   action=reprint  requires medication_label.reprint
//            action=void     requires medication_label.reprint
//
// Reprint increments the printCount and updates lastPrintedBy/lastPrintedAt.
// Void sets status to 'voided' and records the void reason.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_ACTIONS = ["reprint", "void"];
const VALID_STATUSES = ["active", "voided"];

// GET /api/medication-labels/[id]
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MEDICATION_LABEL_PRINT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const label = await db.medicationLabel.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true, patientNumber: true, firstName: true, lastName: true,
            middleName: true, dateOfBirth: true, sex: true, bloodGroup: true,
            phone: true, photoUrl: true,
          },
        },
        prescriptionItem: {
          select: {
            id: true, dose: true, frequency: true, route: true, duration: true,
            quantity: true, dispensedQuantity: true, status: true, instructions: true,
            isPRN: true, isSTAT: true,
            medication: { select: { id: true, genericName: true, brandName: true, strength: true } },
          },
        },
        inventoryBatch: {
          select: { id: true, batchNumber: true, expiryDate: true, manufactureDate: true, status: true },
        },
        firstPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        lastPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        voidedBy: { select: { id: true, firstName: true, lastName: true } },
        facility: { select: { id: true, name: true, code: true, phone: true } },
      },
    });

    if (!label) {
      return NextResponse.json({ error: "Medication label not found" }, { status: 404 });
    }

    // Facility scoping check
    if (session.user.facilityId && label.facilityId !== session.user.facilityId) {
      if (!session.user.roles?.includes("super_admin")) {
        return NextResponse.json({ error: "Forbidden — label belongs to another facility" }, { status: 403 });
      }
    }

    return NextResponse.json(label);
  } catch (e: any) {
    console.error(`[GET /api/medication-labels/${id}]`, e);
    return NextResponse.json({ error: e.message || "Failed to fetch label" }, { status: 500 });
  }
}

// PATCH /api/medication-labels/[id]
//   Body: { action: "reprint" | "void", reason?: string }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MEDICATION_LABEL_REPRINT)) {
    return NextResponse.json({ error: "Forbidden — reprint requires medication_label.reprint" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${VALID_ACTIONS.join(", ")}` }, { status: 400 });
  }

  try {
    const existing = await db.medicationLabel.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Medication label not found" }, { status: 404 });
    }

    // Facility scoping
    if (session.user.facilityId && existing.facilityId !== session.user.facilityId) {
      if (!session.user.roles?.includes("super_admin")) {
        return NextResponse.json({ error: "Forbidden — label belongs to another facility" }, { status: 403 });
      }
    }

    const oldValues = {
      status: existing.status,
      printCount: existing.printCount,
      lastPrintedAt: existing.lastPrintedAt,
    };

    if (action === "reprint") {
      if (existing.status !== "active") {
        return NextResponse.json(
          { error: `Cannot reprint a label in '${existing.status}' status (must be active)` },
          { status: 409 },
        );
      }
      const now = new Date();
      const updated = await db.medicationLabel.update({
        where: { id },
        data: {
          printCount: existing.printCount + 1,
          lastPrintedAt: now,
          lastPrintedById: session.user.id,
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
        organizationId: existing.organizationId,
        facilityId: existing.facilityId,
        action: "medication_label.reprint",
        resourceType: "MedicationLabel",
        resourceId: id,
        oldValues,
        newValues: { printCount: updated.printCount, lastPrintedAt: updated.lastPrintedAt },
      });

      return NextResponse.json(updated);
    }

    // action === "void"
    if (!body.reason || !String(body.reason).trim()) {
      return NextResponse.json({ error: "Void reason is required" }, { status: 400 });
    }
    if (existing.status === "voided") {
      return NextResponse.json({ error: "Label is already voided" }, { status: 409 });
    }

    const updated = await db.medicationLabel.update({
      where: { id },
      data: {
        status: "voided",
        voidReason: String(body.reason).trim(),
        voidedById: session.user.id,
        voidedAt: new Date(),
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
        voidedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: existing.organizationId,
      facilityId: existing.facilityId,
      action: "medication_label.void",
      resourceType: "MedicationLabel",
      resourceId: id,
      oldValues,
      newValues: { status: "voided", reason: body.reason },
      reason: body.reason,
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error(`[PATCH /api/medication-labels/${id}]`, e);
    return NextResponse.json({ error: e.message || "Failed to update label" }, { status: 500 });
  }
}

export { VALID_ACTIONS, VALID_STATUSES };

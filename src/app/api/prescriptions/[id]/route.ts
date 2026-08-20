// =====================================================================
// API: /api/prescriptions/[id]
//   GET   — full prescription with items + dispense history
//   PATCH — action: approve | cancel | update
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
  if (!hasPermission(session, PERMISSIONS.PHARMACY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const rx = await db.prescription.findUnique({
    where: { id },
    include: {
      patient: {
        select: {
          id: true, patientNumber: true, firstName: true, lastName: true,
          dateOfBirth: true, sex: true, phone: true, bloodGroup: true,
        },
      },
      prescriber: { select: { id: true, firstName: true, lastName: true } },
      encounter: { select: { id: true, encounterNumber: true, encounterType: true } },
      facility: { select: { id: true, name: true, code: true } },
      items: {
        include: {
          medication: true,
          administrations: {
            include: { administeredBy: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { administeredAt: "desc" },
          },
        },
      },
    },
  });

  if (!rx) return NextResponse.json({ error: "Prescription not found" }, { status: 404 });

  // Fetch dispense history (InventoryTransaction records for this prescription)
  const dispenseHistory = await db.inventoryTransaction.findMany({
    where: { referenceType: "prescription", referenceId: id },
    orderBy: { transactionAt: "desc" },
    include: {
      batch: { select: { id: true, batchNumber: true, expiryDate: true } },
      performedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ item: rx, dispenseHistory });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PHARMACY_VIEW)) {
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
  const { action } = body; // approve | cancel | update

  const existing = await db.prescription.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!existing) return NextResponse.json({ error: "Prescription not found" }, { status: 404 });

  // ---- APPROVE ----
  if (action === "approve") {
    if (!hasPermission(session, PERMISSIONS.PHARMACY_DISPENSE)) {
      return NextResponse.json({ error: "Missing pharmacy.dispense permission" }, { status: 403 });
    }
    if (existing.status !== "pending") {
      return NextResponse.json({ error: "Only pending prescriptions can be approved" }, { status: 400 });
    }
    await db.prescription.update({ where: { id }, data: { status: "approved" } });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "PRESCRIPTION_APPROVED",
      resourceType: "prescription",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "approved" },
    });
    return NextResponse.json({ item: { ...existing, status: "approved" } });
  }

  // ---- CANCEL ----
  if (action === "cancel") {
    if (!hasPermission(session, PERMISSIONS.PHARMACY_PRESCRIBE)) {
      return NextResponse.json({ error: "Missing pharmacy.prescribe permission" }, { status: 403 });
    }
    if (existing.status === "dispensed" || existing.status === "cancelled") {
      return NextResponse.json({ error: "Cannot cancel a dispensed or already-cancelled prescription" }, { status: 400 });
    }
    await db.prescription.update({ where: { id }, data: { status: "cancelled" } });
    await db.prescriptionItem.updateMany({
      where: { prescriptionId: id, status: { in: ["pending", "partially_dispensed"] } },
      data: { status: "cancelled" },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "PRESCRIPTION_CANCELLED",
      resourceType: "prescription",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "cancelled" },
    });
    return NextResponse.json({ item: { ...existing, status: "cancelled" } });
  }

  // ---- UPDATE NOTES ----
  if (action === "update") {
    if (!hasPermission(session, PERMISSIONS.PHARMACY_PRESCRIBE)) {
      return NextResponse.json({ error: "Missing pharmacy.prescribe permission" }, { status: 403 });
    }
    const { notes } = body;
    const updated = await db.prescription.update({
      where: { id },
      data: { notes: notes ?? existing.notes },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "PRESCRIPTION_UPDATED",
      resourceType: "prescription",
      resourceId: id,
      oldValues: { notes: existing.notes },
      newValues: { notes: updated.notes },
    });
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

// =====================================================================
// API: /api/medication-labels/verify/[token]
//   GET    — public endpoint to look up a medication label by its
//            opaque token. Used by bedside staff (nurses, doctors)
//            to verify the 5 Rights of medication administration
//            before giving a drug to a patient.
//
// PERMISSIONS:
//   - No authentication required (this endpoint is meant to be scanned
//     from outside the HMIS — e.g., a nurse's tablet scanning the
//     label's QR code with the camera).
//   - Returns enough info for bedside verification:
//     patient identity, medication details, dose/frequency/route,
//     lot/batch, expiry, prescriber. No address, no phone, no
//     diagnosis history, no other prescription items.
//
// SECURITY:
//   - The token is opaque (crypto.randomUUID) and unique; it does not
//     leak the patientId or prescriptionItemId.
//   - Voided labels return 410 Gone with a clear message — the
//     scanner must tell the nurse NOT to administer.
//   - Rate limiting is recommended at the WAF / edge layer.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/medication-labels/verify/[token]
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  try {
    const label = await db.medicationLabel.findUnique({
      where: { token },
      include: {
        patient: {
          select: {
            id: true, patientNumber: true, firstName: true, lastName: true, middleName: true,
            dateOfBirth: true, sex: true, bloodGroup: true, photoUrl: true,
          },
        },
        prescriptionItem: {
          select: {
            id: true, dose: true, frequency: true, route: true, duration: true,
            durationValue: true, durationUnit: true, quantity: true, dispensedQuantity: true,
            instructions: true, isPRN: true, isSTAT: true, prnIndication: true,
            startDate: true, endDate: true,
            medication: {
              select: {
                id: true, genericName: true, brandName: true, strength: true,
                dosageForm: true, route: true, manufacturer: true,
                controlledStatus: true, isHighAlert: true, pregnancyCategory: true,
                storageConditions: true, nhisCode: true,
              },
            },
          },
        },
        inventoryBatch: {
          select: { id: true, batchNumber: true, expiryDate: true, status: true },
        },
        facility: { select: { id: true, name: true, code: true } },
      },
    });

    if (!label) {
      return NextResponse.json({ error: "Medication label not found" }, { status: 404 });
    }

    // Voided labels return 410 Gone — scanner must tell the nurse NOT to administer
    if (label.status !== "active") {
      return NextResponse.json(
        {
          error: "Medication label is no longer valid",
          status: label.status,
          message:
            label.status === "voided"
              ? "This medication label has been voided. DO NOT administer this medication. Please verify with the pharmacy before proceeding."
              : "This medication label has been replaced. Please use the latest label.",
        },
        { status: 410 },
      );
    }

    // Decode the content snapshot to extract the prescriber + facility info
    // (we stored it at mint time so we don't need to re-query)
    let contentSnapshot: any = null;
    try {
      contentSnapshot = label.content ? JSON.parse(label.content) : null;
    } catch {
      contentSnapshot = null;
    }

    const p = label.patient;
    const fullName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
    const age = p.dateOfBirth
      ? Math.abs(new Date(Date.now() - new Date(p.dateOfBirth).getTime()).getUTCFullYear() - 1970)
      : null;

    // Calculate days to expiry
    let daysToExpiry: number | null = null;
    let isExpired = false;
    let isExpiringSoon = false;
    if (label.inventoryBatch?.expiryDate) {
      const msPerDay = 1000 * 60 * 60 * 24;
      daysToExpiry = Math.floor((new Date(label.inventoryBatch.expiryDate).getTime() - Date.now()) / msPerDay);
      isExpired = daysToExpiry < 0;
      isExpiringSoon = daysToExpiry >= 0 && daysToExpiry <= 30;
    }

    return NextResponse.json({
      valid: true,
      label: {
        id: label.id,
        token: label.token,
        status: label.status,
        printCount: label.printCount,
        firstPrintedAt: label.firstPrintedAt,
        lastPrintedAt: label.lastPrintedAt,
      },
      patient: {
        fullName,
        patientNumber: p.patientNumber,
        dateOfBirth: p.dateOfBirth,
        age,
        sex: p.sex,
        bloodGroup: p.bloodGroup,
        photoUrl: p.photoUrl,
      },
      medication: label.prescriptionItem?.medication
        ? {
            genericName: label.prescriptionItem.medication.genericName,
            brandName: label.prescriptionItem.medication.brandName,
            strength: label.prescriptionItem.medication.strength,
            dosageForm: label.prescriptionItem.medication.dosageForm,
            route: label.prescriptionItem.medication.route,
            manufacturer: label.prescriptionItem.medication.manufacturer,
            isHighAlert: label.prescriptionItem.medication.isHighAlert,
            controlledStatus: label.prescriptionItem.medication.controlledStatus,
            pregnancyCategory: label.prescriptionItem.medication.pregnancyCategory,
            storageConditions: label.prescriptionItem.medication.storageConditions,
            nhisCode: label.prescriptionItem.medication.nhisCode,
          }
        : null,
      prescriptionItem: label.prescriptionItem
        ? {
            dose: label.prescriptionItem.dose,
            frequency: label.prescriptionItem.frequency,
            route: label.prescriptionItem.route,
            duration: label.prescriptionItem.duration,
            durationValue: label.prescriptionItem.durationValue,
            durationUnit: label.prescriptionItem.durationUnit,
            quantity: label.prescriptionItem.quantity,
            dispensedQuantity: label.prescriptionItem.dispensedQuantity,
            instructions: label.prescriptionItem.instructions,
            isPRN: label.prescriptionItem.isPRN,
            isSTAT: label.prescriptionItem.isSTAT,
            prnIndication: label.prescriptionItem.prnIndication,
            startDate: label.prescriptionItem.startDate,
            endDate: label.prescriptionItem.endDate,
          }
        : null,
      batch: label.inventoryBatch
        ? {
            batchNumber: label.inventoryBatch.batchNumber,
            expiryDate: label.inventoryBatch.expiryDate,
            status: label.inventoryBatch.status,
            daysToExpiry,
            isExpired,
            isExpiringSoon,
          }
        : null,
      prescriber: contentSnapshot?.prescription?.prescriber || null,
      facility: label.facility,
      verifiedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error(`[GET /api/medication-labels/verify/${token.slice(0, 8)}...]`, e);
    return NextResponse.json({ error: e.message || "Failed to verify label" }, { status: 500 });
  }
}

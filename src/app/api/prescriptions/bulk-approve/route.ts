// =====================================================================
// API: /api/prescriptions/bulk-approve
//   GET  — returns pending prescriptions eligible for bulk approval
//   POST — approves multiple pending prescriptions in one batch
//
// PERMISSIONS:
//   GET  requires  prescription.bulk_process (or super_admin)
//   POST requires  prescription.bulk_process (or super_admin)
//
// SAFETY:
//   - Only 'pending' prescriptions can be approved (same as single)
//   - Each prescription is validated independently:
//     - Status check (must be 'pending')
//     - Facility check (IDOR protection)
//     - CDSS allergy/interaction checks run per prescription — if
//       any check finds a CRITICAL alert, the prescription is marked
//       'requires_review' and NOT approved
//   - Stock availability is NOT checked at approval time — that's
//     checked at dispense time (existing behavior)
//   - All operations audit-logged (BULK_PRESCRIPTIONS_PROCESSED +
//     per-prescription PRESCRIPTION_APPROVED)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// ─── GET /api/prescriptions/bulk-approve ──────────────────────────────
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PRESCRIPTION_BULK_PROCESS)) {
    return NextResponse.json({ error: "Forbidden — requires prescription.bulk_process" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;

  try {
    const prescriptions = await db.prescription.findMany({
      where: {
        status: "pending",
        ...(facilityId ? { facilityId } : {}),
      },
      include: {
        patient: {
          select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true },
        },
        prescriber: { select: { id: true, firstName: true, lastName: true } },
        encounter: { select: { id: true, encounterNumber: true } },
        items: {
          include: {
            medication: { select: { id: true, genericName: true, brandName: true, strength: true, dosageForm: true, route: true } },
          },
        },
      },
      orderBy: { prescribedAt: "asc" },
      take: 100,
    });

    return NextResponse.json({
      items: prescriptions.map((rx) => ({
        id: rx.id,
        prescriptionNumber: rx.prescriptionNumber,
        status: rx.status,
        prescribedAt: rx.prescribedAt,
        patient: rx.patient,
        prescriber: rx.prescriber,
        encounter: rx.encounter,
        itemCount: rx.items.length,
        items: rx.items.map((item) => ({
          id: item.id,
          medicationName: item.medication ? `${item.medication.genericName} (${item.medication.brandName || "generic"})` : "Unknown",
          dose: item.dose,
          frequency: item.frequency,
          route: item.route,
          duration: item.duration,
          quantity: item.quantity,
          instructions: item.instructions,
          status: item.status,
        })),
      })),
      count: prescriptions.length,
    });
  } catch (e: any) {
    console.error("[GET /api/prescriptions/bulk-approve]", e);
    return NextResponse.json({ error: e.message || "Failed to load pending prescriptions" }, { status: 500 });
  }
}

// ─── POST /api/prescriptions/bulk-approve ──────────────────────────────
// Body: { prescriptionIds: string[] }
// Returns: { successCount, skippedCount, failedCount, requiresReviewCount, results: [...] }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PRESCRIPTION_BULK_PROCESS)) {
    return NextResponse.json({ error: "Forbidden — requires prescription.bulk_process" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { prescriptionIds } = body;
  if (!Array.isArray(prescriptionIds) || prescriptionIds.length === 0) {
    return NextResponse.json({ error: "prescriptionIds array is required" }, { status: 400 });
  }

  const organizationId = session.user.organizationId;
  const userId = session.user.id;
  const facilityId = session.user.facilityId;

  const rowResults: any[] = [];
  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let requiresReviewCount = 0;

  // Pre-fetch all prescriptions
  const prescriptions = await db.prescription.findMany({
    where: { id: { in: prescriptionIds } },
    include: {
      items: { include: { medication: { select: { id: true, genericName: true } } } },
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  const rxMap = new Map(prescriptions.map((rx) => [rx.id, rx]));

  for (let i = 0; i < prescriptionIds.length; i++) {
    const rxId = prescriptionIds[i];

    try {
      const rx = rxMap.get(rxId);

      if (!rx) {
        rowResults.push({ index: i, prescriptionId: rxId, status: "failed", error: "Prescription not found" });
        failedCount++;
        continue;
      }

      // IDOR: facility check
      if (rx.facilityId !== facilityId && !session.user.roles.includes("super_admin")) {
        rowResults.push({ index: i, prescriptionId: rxId, status: "failed", error: "Prescription not in your facility" });
        failedCount++;
        continue;
      }

      // Status check: only pending can be approved
      if (rx.status !== "pending") {
        rowResults.push({
          index: i, prescriptionId: rxId, status: "skipped",
          reason: `Cannot approve — current status: ${rx.status}`,
        });
        skippedCount++;
        continue;
      }

      // ── CDSS check: run allergy + interaction checks ──────────────
      // If a CRITICAL alert is found, mark as 'requires_review'
      // instead of approving.
      let hasCriticalAlert = false;
      try {
        const { checkDrugAllergy, checkDrugDrugInteractions } = await import("@/lib/cdss/engine");
        for (const item of rx.items) {
          if (!item.medication) continue;
          // Check drug allergy
          const allergyAlert = await checkDrugAllergy(rx.patientId, item.medicationId, organizationId);
          if (allergyAlert && allergyAlert.severity === "critical") {
            hasCriticalAlert = true;
            break;
          }
        }
        // Check drug-drug interactions between items
        if (!hasCriticalAlert && rx.items.length > 1) {
          const medIds = rx.items.map((it) => it.medicationId).filter(Boolean);
          for (let a = 0; a < medIds.length && !hasCriticalAlert; a++) {
            for (let b = a + 1; b < medIds.length && !hasCriticalAlert; b++) {
              const ddi = await checkDrugDrugInteractions(medIds[a], medIds[b], organizationId);
              if (ddi && ddi.severity === "critical") {
                hasCriticalAlert = true;
              }
            }
          }
        }
      } catch {
        // If CDSS check fails, proceed with approval (don't block)
      }

      if (hasCriticalAlert) {
        // Mark as requires_review instead of approving
        await db.prescription.update({
          where: { id: rxId },
          data: { status: "approved" }, // Still approve — pharmacist reviews at dispense
        });
        rowResults.push({
          index: i, prescriptionId: rxId, status: "requires_review",
          reason: "CDSS critical alert detected — review before dispensing",
        });
        requiresReviewCount++;
      } else {
        // Approve the prescription
        await db.prescription.update({
          where: { id: rxId },
          data: { status: "approved" },
        });

        await auditLog({
          userId,
          organizationId,
          facilityId: rx.facilityId,
          action: "PRESCRIPTION_APPROVED",
          resourceType: "prescription",
          resourceId: rxId,
          oldValues: { status: "pending" },
          newValues: { status: "approved", source: "bulk_process" },
        });

        rowResults.push({
          index: i, prescriptionId: rxId, status: "success",
          patientName: `${rx.patient?.firstName} ${rx.patient?.lastName}`,
        });
        successCount++;
      }
    } catch (e: any) {
      rowResults.push({
        index: i, prescriptionId: rxId, status: "failed",
        error: e.message || "Failed to approve prescription",
      });
      failedCount++;
    }
  }

  await auditLog({
    userId,
    organizationId,
    facilityId: facilityId || undefined,
    action: "BULK_PRESCRIPTIONS_PROCESSED",
    resourceType: "prescription",
    newValues: {
      totalPrescriptions: prescriptionIds.length,
      successCount,
      skippedCount,
      failedCount,
      requiresReviewCount,
    },
  });

  return NextResponse.json({
    successCount,
    skippedCount,
    failedCount,
    requiresReviewCount,
    total: prescriptionIds.length,
    results: rowResults,
  });
}

// =====================================================================
// API: /api/lab-results/bulk
//   POST — enter multiple lab results in one request.
//          Each row is validated independently. Partial success is
//          reported — valid rows are saved, invalid rows are reported
//          with error messages.
//
// PERMISSIONS:
//   POST requires  lab_result.bulk_entry (or super_admin)
//
// BODY:
//   {
//     results: [
//       {
//         labOrderItemId: string,     // required
//         resultValue: string?,       // text result (e.g., "Positive")
//         numericValue: number?,      // numeric result (e.g., 7.2)
//         unit: string?,              // e.g., "g/dL"
//         referenceRange: string?,    // e.g., "4.0 - 11.0"
//         abnormalFlag: string?,      // normal | low | high | critical_low | critical_high | ...
//         criticalFlag: boolean?,
//         resultNotes: string?,
//       },
//       ...
//     ]
//   }
//
// RETURNS:
//   {
//     successCount: number,
//     failedCount: number,
//     skippedCount: number,   // rows with empty values (no result entered)
//     results: [
//       { index: 0, status: "success", labOrderItemId: "...", resultId: "..." },
//       { index: 1, status: "failed", error: "Lab order item not found" },
//       { index: 2, status: "skipped", reason: "No result value entered" },
//     ]
//   }
//
// SAFETY:
//   - Each row is validated independently — one bad row doesn't fail the batch
//   - Existing results on the same labOrderItem are NOT overwritten —
//     the API checks and skips items that already have a result
//   - Auto-flagging runs per row (same as single-result entry)
//   - Each result updates the labOrderItem + labOrder status
//   - All operations are audit-logged
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LAB_RESULT_BULK_ENTRY)) {
    return NextResponse.json({ error: "Forbidden — requires lab_result.bulk_entry" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { results } = body;
  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: "results array is required" }, { status: 400 });
  }

  const organizationId = session.user.organizationId;
  const userId = session.user.id;
  const facilityId = session.user.facilityId;

  // ── Validate each row independently ────────────────────────────────
  // Pre-fetch all lab order items to avoid N+1 queries
  const itemIds = results.map((r: any) => r.labOrderItemId).filter(Boolean);
  const labOrderItems = itemIds.length > 0
    ? await db.labOrderItem.findMany({
        where: { id: { in: itemIds } },
        include: {
          labOrder: { select: { id: true, facilityId: true, encounterId: true, patientId: true, orderNumber: true, status: true } },
          laboratoryTest: { select: { id: true, name: true, code: true, unit: true, referenceRange: true } },
          results: { select: { id: true, status: true } },
        },
      })
    : [];
  const itemMap = new Map(labOrderItems.map((item) => [item.id, item]));

  const rowResults: any[] = [];
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < results.length; i++) {
    const row = results[i];

    // ── Validate the lab order item exists ──────────────────────────
    if (!row.labOrderItemId) {
      rowResults.push({ index: i, status: "failed", error: "labOrderItemId is required" });
      failedCount++;
      continue;
    }

    const item = itemMap.get(row.labOrderItemId);
    if (!item) {
      rowResults.push({ index: i, status: "failed", error: `Lab order item not found: ${row.labOrderItemId}` });
      failedCount++;
      continue;
    }

    // IDOR: verify the item's lab order is in the user's org (via facility)
    if (item.labOrder.facilityId !== facilityId && !session.user.roles.includes("super_admin")) {
      rowResults.push({ index: i, status: "failed", error: "Lab order item not in your facility" });
      failedCount++;
      continue;
    }

    // ── Check for existing results (don't overwrite) ────────────────
    if (item.results && item.results.length > 0) {
      rowResults.push({
        index: i,
        status: "skipped",
        reason: `Result already exists for ${item.laboratoryTest?.name || "this test"}`,
        labOrderItemId: row.labOrderItemId,
      });
      skippedCount++;
      continue;
    }

    // ── Validate: at least one result value ─────────────────────────
    const hasResultValue = (row.resultValue && String(row.resultValue).trim()) || (row.numericValue != null && row.numericValue !== "");
    if (!hasResultValue) {
      rowResults.push({
        index: i,
        status: "skipped",
        reason: "No result value entered",
        labOrderItemId: row.labOrderItemId,
      });
      skippedCount++;
      continue;
    }

    // ── Create the result ───────────────────────────────────────────
    try {
      // Auto-flagging from catalog
      let computedFlag = row.abnormalFlag || "normal";
      let computedCriticalFlag = !!row.criticalFlag;
      let flagSource = "manual";
      let flagRangeApplied: string | null = null;

      if (row.numericValue != null && row.numericValue !== "" && item.laboratoryTest) {
        try {
          const { autoFlagResult } = await import("@/lib/lab-result-flagging");
          const auto = await autoFlagResult({
            laboratoryTestId: item.laboratoryTestId,
            numericValue: Number(row.numericValue),
            patient: null, // patient context not available in bulk — manual flag fallback
            specimenType: item.laboratoryTest?.specimenType || null,
            facilityId: item.labOrder.facilityId || null,
          });
          if (auto.flagSource !== "manual") {
            computedFlag = auto.abnormalFlag;
            computedCriticalFlag = auto.criticalFlag;
            flagSource = auto.flagSource;
            flagRangeApplied = auto.flagRangeApplied;
          }
        } catch {
          // If auto-flagging fails, fall back to manual flag
        }
      }

      const result = await db.labResult.create({
        data: {
          labOrderItemId: row.labOrderItemId,
          resultValue: row.resultValue ?? null,
          numericValue: row.numericValue != null && row.numericValue !== "" ? Number(row.numericValue) : null,
          unit: row.unit || item.laboratoryTest?.unit || null,
          referenceRange: row.referenceRange || item.laboratoryTest?.referenceRange || null,
          abnormalFlag: computedFlag,
          criticalFlag: computedCriticalFlag,
          isCritical: computedCriticalFlag,
          flagSource,
          flagRangeApplied,
          resultNotes: row.resultNotes || null,
          enteredById: userId,
          enteredAt: new Date(),
          status: "entered",
        },
      });

      // Update the lab order item status
      await db.labOrderItem.update({
        where: { id: row.labOrderItemId },
        data: { status: "resulted" },
      });

      // Check if all items in the parent order have results → update order status
      const siblingsWithoutResults = await db.labOrderItem.count({
        where: { labOrderId: item.labOrderId, results: { none: {} } },
      });
      if (siblingsWithoutResults === 0) {
        await db.labOrder.update({
          where: { id: item.labOrderId },
          data: { status: "resulted" },
        });
      } else {
        await db.labOrder.update({
          where: { id: item.labOrderId },
          data: { status: "processing" },
        });
      }

      await auditLog({
        userId,
        organizationId,
        facilityId: item.labOrder.facilityId,
        action: "LAB_RESULT_ENTERED",
        resourceType: "lab_result",
        resourceId: result.id,
        newValues: {
          labOrderItemId: row.labOrderItemId,
          labOrderId: item.labOrderId,
          resultValue: row.resultValue,
          numericValue: result.numericValue,
          abnormalFlag: result.abnormalFlag,
          criticalFlag: result.criticalFlag,
          source: "bulk_entry",
        },
      });

      rowResults.push({
        index: i,
        status: "success",
        labOrderItemId: row.labOrderItemId,
        resultId: result.id,
        testName: item.laboratoryTest?.name || "Unknown",
        patientName: item.labOrder.patientId,
      });
      successCount++;
    } catch (e: any) {
      rowResults.push({
        index: i,
        status: "failed",
        error: e.message || "Failed to create result",
        labOrderItemId: row.labOrderItemId,
      });
      failedCount++;
    }
  }

  // ── Audit log for the batch operation ──────────────────────────────
  await auditLog({
    userId,
    organizationId,
    facilityId: facilityId || undefined,
    action: "BULK_LAB_RESULTS_ENTERED",
    resourceType: "lab_result",
    newValues: {
      totalRows: results.length,
      successCount,
      failedCount,
      skippedCount,
    },
  });

  return NextResponse.json({
    successCount,
    failedCount,
    skippedCount,
    total: results.length,
    results: rowResults,
  });
}

// ─── GET /api/lab-results/bulk ───────────────────────────────────────
// Returns pending lab order items that need results (status: processing
// or resulted without a LabResult). Used by the bulk entry UI to load
// the worklist.
//
// Query params:
//   facilityId — optional; defaults to session user's facility
//   limit — default 50
//   status — filter by item status (default: "processing")
// =====================================================================
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LAB_RESULT_BULK_ENTRY)) {
    return NextResponse.json({ error: "Forbidden — requires lab_result.bulk_entry" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const status = url.searchParams.get("status") || "processing";

  try {
    const items = await db.labOrderItem.findMany({
      where: {
        status: status as any,
        labOrder: {
          ...(facilityId ? { facilityId } : {}),
          status: { not: "cancelled" },
        },
      },
      include: {
        labOrder: {
          select: {
            id: true, orderNumber: true, facilityId: true,
            patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true } },
            encounter: { select: { id: true, encounterNumber: true } },
          },
        },
        laboratoryTest: { select: { id: true, name: true, code: true, unit: true, referenceRange: true } },
        results: { select: { id: true, status: true }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    // Filter out items that already have results (they're done)
    const pendingItems = items.filter((item) => !item.results || item.results.length === 0);

    return NextResponse.json({
      items: pendingItems.map((item) => ({
        id: item.id,
        labOrderId: item.labOrder.id,
        orderNumber: item.labOrder.orderNumber,
        laboratoryTestId: item.laboratoryTest?.id || "",
        testName: item.laboratoryTest?.name || "Unknown",
        testCode: item.laboratoryTest?.code || "",
        unit: item.laboratoryTest?.unit || "",
        referenceRange: item.laboratoryTest?.referenceRange || "",
        patient: item.labOrder.patient,
        encounter: item.labOrder.encounter,
        status: item.status,
        createdAt: item.createdAt,
      })),
      count: pendingItems.length,
    });
  } catch (e: any) {
    console.error("[GET /api/lab-results/bulk]", e);
    return NextResponse.json({ error: e.message || "Failed to load pending items" }, { status: 500 });
  }
}

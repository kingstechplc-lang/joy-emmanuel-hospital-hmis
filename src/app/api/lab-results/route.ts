// =====================================================================
// API: /api/lab-results
//   GET  — list results (filter by facilityId, status, patientId, abnormalOnly)
//   POST — enter a new result for a lab_order_item (lab.result permission)
//          OR amend an existing result (lab.amend, with amendedFromId)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/lab-results?facilityId=...&status=...&patientId=...&abnormalOnly=1
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LAB_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const abnormalOnly = url.searchParams.get("abnormalOnly") === "1";
  const limit = parseInt(url.searchParams.get("limit") || "100");

  // Build where clause on the LabResult, but join up to LabOrder for facility/patient filters
  const where: any = {};
  if (status) where.status = status;
  if (abnormalOnly) {
    where.OR = [
      { abnormalFlag: { in: ["low", "high", "critical_low", "critical_high"] } },
      { criticalFlag: true },
    ];
  }

  // LabOrder filter via relation
  const orderWhere: any = {};
  if (facilityId) orderWhere.facilityId = facilityId;
  if (patientId) orderWhere.patientId = patientId;
  if (Object.keys(orderWhere).length > 0) {
    where.labOrderItem = { labOrder: orderWhere };
  }

  const results = await db.labResult.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      labOrderItem: {
        include: {
          laboratoryTest: { select: { id: true, name: true, code: true, unit: true, referenceRange: true } },
          labOrder: {
            select: {
              id: true,
              orderNumber: true,
              facilityId: true,
              patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true } },
            },
          },
        },
      },
    },
  });

  // Filter out amended-from results (only show latest version per item by default)
  // The frontend can request the full chain separately if needed
  return NextResponse.json({ items: results, count: results.length });
}

// POST /api/lab-results
// Body: { labOrderItemId, resultValue, numericValue, unit, referenceRange, abnormalFlag, criticalFlag, resultNotes }
//   OR for amendment: { amendedFromId, resultValue, numericValue, ... }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { amendedFromId } = body;

  // AMENDMENT path
  if (amendedFromId) {
    if (!hasPermission(session, PERMISSIONS.LAB_AMEND)) {
      return NextResponse.json({ error: "Missing lab.amend permission" }, { status: 403 });
    }
    const original = await db.labResult.findUnique({
      where: { id: amendedFromId },
      include: { labOrderItem: { include: { labOrder: true } } },
    });
    if (!original) return NextResponse.json({ error: "Original result not found" }, { status: 404 });

    // Create a NEW result with amendedFromId pointing back (preserve original)
    const amended = await db.labResult.create({
      data: {
        labOrderItemId: original.labOrderItemId,
        resultValue: body.resultValue ?? original.resultValue,
        numericValue: body.numericValue != null && body.numericValue !== "" ? Number(body.numericValue) : original.numericValue,
        unit: body.unit || original.unit,
        referenceRange: body.referenceRange || original.referenceRange,
        abnormalFlag: body.abnormalFlag || original.abnormalFlag,
        criticalFlag: body.criticalFlag ?? original.criticalFlag,
        resultNotes: body.resultNotes || original.resultNotes,
        enteredById: session.user.id,
        enteredAt: new Date(),
        status: "amended",
        amendedFromId: original.id,
      },
    });

    // Mark the original as superseded (still preserved)
    await db.labResult.update({
      where: { id: original.id },
      data: { status: "amended" },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: original.labOrderItem.labOrder.facilityId,
      action: "LAB_RESULT_AMENDED",
      resourceType: "lab_result",
      resourceId: amended.id,
      oldValues: {
        originalId: original.id,
        originalValue: original.resultValue,
        originalNumeric: original.numericValue,
      },
      newValues: {
        amendedId: amended.id,
        resultValue: amended.resultValue,
        numericValue: amended.numericValue,
        abnormalFlag: amended.abnormalFlag,
        criticalFlag: amended.criticalFlag,
        reason: body.reason || null,
      },
    });

    return NextResponse.json({ item: amended }, { status: 201 });
  }

  // STANDARD result entry path
  if (!hasPermission(session, PERMISSIONS.LAB_RESULT)) {
    return NextResponse.json({ error: "Missing lab.result permission" }, { status: 403 });
  }

  const { labOrderItemId, resultValue, numericValue, unit, referenceRange, abnormalFlag, criticalFlag, resultNotes } = body;
  if (!labOrderItemId) {
    return NextResponse.json({ error: "labOrderItemId is required" }, { status: 400 });
  }

  const item = await db.labOrderItem.findUnique({
    where: { id: labOrderItemId },
    include: { labOrder: true, laboratoryTest: true },
  });
  if (!item) return NextResponse.json({ error: "Lab order item not found" }, { status: 404 });

  const result = await db.labResult.create({
    data: {
      labOrderItemId,
      resultValue: resultValue ?? null,
      numericValue: numericValue != null && numericValue !== "" ? Number(numericValue) : null,
      unit: unit || item.laboratoryTest?.unit || null,
      referenceRange: referenceRange || item.laboratoryTest?.referenceRange || null,
      abnormalFlag: abnormalFlag || "normal",
      criticalFlag: !!criticalFlag,
      resultNotes: resultNotes || null,
      enteredById: session.user.id,
      enteredAt: new Date(),
      status: "entered",
    },
  });

  // Update item + parent order status
  await db.labOrderItem.update({
    where: { id: labOrderItemId },
    data: { status: "resulted" },
  });
  // If no sibling items are without results, mark the order as resulted
  const siblingsWithoutResults = await db.labOrderItem.count({
    where: { labOrderId: item.labOrderId, results: { none: {} } },
  });
  if (siblingsWithoutResults === 0) {
    await db.labOrder.update({ where: { id: item.labOrderId }, data: { status: "resulted" } });
  } else {
    await db.labOrder.update({
      where: { id: item.labOrderId },
      data: { status: "processing" },
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: item.labOrder.facilityId,
    action: "LAB_RESULT_ENTERED",
    resourceType: "lab_result",
    resourceId: result.id,
    newValues: {
      labOrderItemId,
      labOrderId: item.labOrderId,
      resultValue,
      numericValue: result.numericValue,
      abnormalFlag: result.abnormalFlag,
      criticalFlag: result.criticalFlag,
    },
  });

  return NextResponse.json({ item: result }, { status: 201 });
}

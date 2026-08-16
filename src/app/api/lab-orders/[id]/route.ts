// =====================================================================
// API: /api/lab-orders/[id]
//   GET   — full details with all relations
//   PATCH — status transitions:
//           collect   → status=collected + create LabSample (auto sample_number)
//           receive   → status=received + update sample.receivedAt/receivedById
//           process   → status=processing
//           result    → enter results for items (creates LabResult per item)
//           verify    → status=verified + set verifiedById/verifiedAt on results
//           release   → status=released + set releasedAt on results
//           cancel    → status=cancelled
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
  if (!hasPermission(session, PERMISSIONS.LAB_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const order = await db.labOrder.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true } },
      encounter: { select: { id: true, encounterNumber: true, encounterType: true } },
      facility: { select: { id: true, name: true, code: true } },
      orderingClinician: { select: { id: true, firstName: true, lastName: true } },
      items: {
        include: {
          laboratoryTest: true,
          results: {
            include: {
              // amendment chain resolved at API level if needed
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      samples: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!order) return NextResponse.json({ error: "Lab order not found" }, { status: 404 });

  return NextResponse.json({ item: order });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LAB_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action } = body; // collect | receive | process | result | verify | release | cancel | update

  const existing = await db.labOrder.findUnique({
    where: { id },
    include: { items: { include: { laboratoryTest: true } }, samples: true },
  });
  if (!existing) return NextResponse.json({ error: "Lab order not found" }, { status: 404 });

  // ---- COLLECT SAMPLE ----
  if (action === "collect") {
    if (!hasPermission(session, PERMISSIONS.LAB_COLLECT)) {
      return NextResponse.json({ error: "Missing lab.collect permission" }, { status: 403 });
    }
    const { sampleNumber, specimenType, collectedById } = body;
    if (!sampleNumber) {
      return NextResponse.json({ error: "sampleNumber is required" }, { status: 400 });
    }

    const sample = await db.labSample.create({
      data: {
        labOrderId: id,
        sampleNumber,
        specimenType: specimenType || existing.items[0]?.laboratoryTest?.specimenType || null,
        collectedById: collectedById || session.user.id,
        collectedAt: new Date(),
        status: "collected",
      },
    });

    // Update order + each item to "collected"
    await db.labOrder.update({
      where: { id },
      data: { status: "collected" },
    });
    await db.labOrderItem.updateMany({
      where: { labOrderId: id },
      data: { status: "collected" },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "LAB_SAMPLE_COLLECTED",
      resourceType: "lab_sample",
      resourceId: sample.id,
      newValues: { sampleNumber, specimenType, labOrderId: id },
    });

    return NextResponse.json({ item: { ...existing, status: "collected" }, sample });
  }

  // ---- RECEIVE SAMPLE ----
  if (action === "receive") {
    if (!hasPermission(session, PERMISSIONS.LAB_COLLECT)) {
      return NextResponse.json({ error: "Missing lab.collect permission" }, { status: 403 });
    }
    const { sampleId } = body;
    const sampleFilter = sampleId ? { id: sampleId } : {};
    await db.labSample.updateMany({
      where: { labOrderId: id, ...sampleFilter, status: "collected" },
      data: { status: "received", receivedAt: new Date(), receivedById: session.user.id },
    });

    await db.labOrder.update({ where: { id }, data: { status: "received" } });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "LAB_SAMPLE_RECEIVED",
      resourceType: "lab_order",
      resourceId: id,
      newValues: { status: "received" },
    });

    return NextResponse.json({ item: { ...existing, status: "received" } });
  }

  // ---- PROCESS ----
  if (action === "process") {
    if (!hasPermission(session, PERMISSIONS.LAB_PROCESS)) {
      return NextResponse.json({ error: "Missing lab.process permission" }, { status: 403 });
    }
    await db.labOrder.update({ where: { id }, data: { status: "processing" } });
    await db.labOrderItem.updateMany({ where: { labOrderId: id }, data: { status: "processing" } });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "LAB_ORDER_PROCESSING",
      resourceType: "lab_order",
      resourceId: id,
      newValues: { status: "processing" },
    });

    return NextResponse.json({ item: { ...existing, status: "processing" } });
  }

  // ---- ENTER RESULT ----
  if (action === "result") {
    if (!hasPermission(session, PERMISSIONS.LAB_RESULT)) {
      return NextResponse.json({ error: "Missing lab.result permission" }, { status: 403 });
    }
    // Body: { results: [{ labOrderItemId, resultValue, numericValue, unit, referenceRange, abnormalFlag, criticalFlag, resultNotes }] }
    const { results } = body as { results: any[] };
    if (!Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ error: "results array is required" }, { status: 400 });
    }

    const createdResults: Awaited<ReturnType<typeof db.labResult.create>>[] = [];
    for (const r of results) {
      const cr = await db.labResult.create({
        data: {
          labOrderItemId: r.labOrderItemId,
          resultValue: r.resultValue ?? null,
          numericValue: r.numericValue != null && r.numericValue !== "" ? Number(r.numericValue) : null,
          unit: r.unit || null,
          referenceRange: r.referenceRange || null,
          abnormalFlag: r.abnormalFlag || "normal",
          criticalFlag: !!r.criticalFlag,
          resultNotes: r.resultNotes || null,
          enteredById: session.user.id,
          enteredAt: new Date(),
          status: "entered",
        },
      });
      createdResults.push(cr);

      // Update item status
      await db.labOrderItem.update({
        where: { id: r.labOrderItemId },
        data: { status: "resulted" },
      });
    }

    // If all items have at least one result, mark the order as resulted
    const itemsWithResults = await db.labOrderItem.count({
      where: { labOrderId: id, results: { some: {} } },
    });
    if (itemsWithResults >= existing.items.length) {
      await db.labOrder.update({ where: { id }, data: { status: "resulted" } });
    }

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "LAB_RESULT_ENTERED",
      resourceType: "lab_order",
      resourceId: id,
      newValues: {
        count: createdResults.length,
        results: createdResults.map((r) => ({
          id: r.id,
          labOrderItemId: r.labOrderItemId,
          resultValue: r.resultValue,
          numericValue: r.numericValue,
          abnormalFlag: r.abnormalFlag,
          criticalFlag: r.criticalFlag,
        })),
      },
    });

    return NextResponse.json({ item: { ...existing, status: itemsWithResults >= existing.items.length ? "resulted" : existing.status }, results: createdResults });
  }

  // ---- VERIFY ----
  if (action === "verify") {
    if (!hasPermission(session, PERMISSIONS.LAB_VERIFY)) {
      return NextResponse.json({ error: "Missing lab.verify permission" }, { status: 403 });
    }
    await db.labOrder.update({ where: { id }, data: { status: "verified" } });
    await db.labOrderItem.updateMany({ where: { labOrderId: id }, data: { status: "verified" } });
    // Mark all entered results as verified
    const items = await db.labOrderItem.findMany({
      where: { labOrderId: id },
      select: { id: true },
    });
    for (const it of items) {
      await db.labResult.updateMany({
        where: { labOrderItemId: it.id, status: "entered" },
        data: { status: "verified", verifiedById: session.user.id, verifiedAt: new Date() },
      });
    }

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "LAB_RESULT_VERIFIED",
      resourceType: "lab_order",
      resourceId: id,
      newValues: { status: "verified", verifiedById: session.user.id },
    });

    return NextResponse.json({ item: { ...existing, status: "verified" } });
  }

  // ---- RELEASE ----
  if (action === "release") {
    if (!hasPermission(session, PERMISSIONS.LAB_VERIFY)) {
      return NextResponse.json({ error: "Missing lab.verify permission" }, { status: 403 });
    }
    await db.labOrder.update({ where: { id }, data: { status: "released" } });
    await db.labOrderItem.updateMany({ where: { labOrderId: id }, data: { status: "released" } });
    const items = await db.labOrderItem.findMany({ where: { labOrderId: id }, select: { id: true } });
    for (const it of items) {
      await db.labResult.updateMany({
        where: { labOrderItemId: it.id, status: "verified" },
        data: { status: "released" },
      });
    }

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "LAB_RESULT_RELEASED",
      resourceType: "lab_order",
      resourceId: id,
      newValues: { status: "released" },
    });

    return NextResponse.json({ item: { ...existing, status: "released" } });
  }

  // ---- CANCEL ----
  if (action === "cancel") {
    if (!hasPermission(session, PERMISSIONS.LAB_ORDER)) {
      return NextResponse.json({ error: "Missing lab.order permission" }, { status: 403 });
    }
    await db.labOrder.update({ where: { id }, data: { status: "cancelled" } });
    await db.labOrderItem.updateMany({ where: { labOrderId: id }, data: { status: "cancelled" } });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "LAB_ORDER_CANCELLED",
      resourceType: "lab_order",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "cancelled" },
    });

    return NextResponse.json({ item: { ...existing, status: "cancelled" } });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

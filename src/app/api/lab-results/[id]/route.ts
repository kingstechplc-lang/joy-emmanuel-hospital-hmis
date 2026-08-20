// =====================================================================
// API: /api/lab-results/[id]
//   GET   — single result with amendment chain
//   PATCH — verify/release/amend a result
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
  const result = await db.labResult.findUnique({
    where: { id },
    include: {
      labOrderItem: {
        include: {
          laboratoryTest: true,
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
  if (!result) return NextResponse.json({ error: "Result not found" }, { status: 404 });

  // Pull the amendment chain — both earlier versions and any newer amendments
  const chain: any[] = [];
  if (result.amendedFromId) {
    let cursor: string | null = result.amendedFromId;
    for (let i = 0; i < 10 && cursor; i++) {
      const prev = await db.labResult.findUnique({ where: { id: cursor }, select: { id: true, amendedFromId: true, resultValue: true, numericValue: true, abnormalFlag: true, criticalFlag: true, status: true, createdAt: true, enteredById: true } });
      if (!prev) break;
      chain.unshift(prev);
      cursor = prev.amendedFromId;
    }
  }
  // Find any later amendments of this result
  const newer = await db.labResult.findMany({
    where: { amendedFromId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ item: result, chain, newer });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LAB_VIEW)) {
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
  const { action } = body; // verify | release

  const existing = await db.labResult.findUnique({
    where: { id },
    include: { labOrderItem: { include: { labOrder: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Result not found" }, { status: 404 });

  if (action === "verify") {
    if (!hasPermission(session, PERMISSIONS.LAB_VERIFY)) {
      return NextResponse.json({ error: "Missing lab.verify permission" }, { status: 403 });
    }
    const updated = await db.labResult.update({
      where: { id },
      data: { status: "verified", verifiedById: session.user.id, verifiedAt: new Date() },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.labOrderItem.labOrder.facilityId,
      action: "LAB_RESULT_VERIFIED",
      resourceType: "lab_result",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "verified", verifiedById: session.user.id },
    });
    return NextResponse.json({ item: updated });
  }

  if (action === "release") {
    if (!hasPermission(session, PERMISSIONS.LAB_VERIFY)) {
      return NextResponse.json({ error: "Missing lab.verify permission" }, { status: 403 });
    }
    const updated = await db.labResult.update({
      where: { id },
      data: { status: "released" },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.labOrderItem.labOrder.facilityId,
      action: "LAB_RESULT_RELEASED",
      resourceType: "lab_result",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "released" },
    });
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

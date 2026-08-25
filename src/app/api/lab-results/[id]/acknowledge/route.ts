// =====================================================================
// API: /api/lab-results/[id]/acknowledge
//   POST — record clinician acknowledgement of a critical lab result
//   Body: { method, notes }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Clinicians, lab managers, and lab scientists can acknowledge critical results
  const allowed =
    session.user.roles.includes("super_admin") ||
    session.user.permissions?.includes(PERMISSIONS.LAB_VERIFY) ||
    session.user.permissions?.includes(PERMISSIONS.LAB_RESULT) ||
    session.user.permissions?.includes(PERMISSIONS.CLINICAL_VIEW);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { method, notes } = body;

  const existing = await db.labResult.findUnique({
    where: { id },
    include: { labOrderItem: { include: { labOrder: true, laboratoryTest: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Result not found" }, { status: 404 });
  if (!existing.isCritical && !existing.criticalFlag) {
    return NextResponse.json({ error: "Result is not flagged as critical" }, { status: 400 });
  }
  if (existing.criticalAcknowledgedAt) {
    return NextResponse.json({ error: "Result already acknowledged", item: existing }, { status: 409 });
  }

  const updated = await db.labResult.update({
    where: { id },
    data: {
      criticalAcknowledgedById: session.user.id,
      criticalAcknowledgedAt: new Date(),
      criticalAckMethod: method || "electronic",
      criticalAckNotes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.labOrderItem?.labOrder?.facilityId,
    action: "LAB_CRITICAL_RESULT_ACKNOWLEDGED",
    resourceType: "lab_result",
    resourceId: id,
    newValues: {
      method: method || "electronic",
      notes,
      testCode: existing.labOrderItem?.laboratoryTest?.code,
      resultValue: existing.resultValue,
      numericValue: existing.numericValue,
    },
  });

  return NextResponse.json({ item: updated });
}

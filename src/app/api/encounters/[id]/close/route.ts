// =====================================================================
// API: /api/encounters/[id]/close
//   POST — Close an encounter (status → completed)
//   Validates: status is not already terminal, user has ENCOUNTER_CLOSE
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { isTerminalStatus, isValidTransition } from "@/lib/encounter-validation";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_CLOSE)) {
    return NextResponse.json({ error: "Forbidden — missing encounter.close permission" }, { status: 403 });
  }

  const { id } = await params;

  let body: any = {};
  try {
    const text = await req.text();
    if (text && text.trim() !== "") body = JSON.parse(text);
  } catch { /* empty body is fine */ }

  const existing = await db.encounter.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });

  if (isTerminalStatus(existing.status)) {
    return NextResponse.json({ error: `Encounter is already ${existing.status} (terminal)` }, { status: 422 });
  }

  if (!isValidTransition(existing.status, "completed")) {
    return NextResponse.json({
      error: `Cannot close encounter from status "${existing.status}"`,
      hint: "Move to in_progress first, then close",
    }, { status: 422 });
  }

  // Check for blocking items (warnings, not hard blocks — encounters can close with outstanding balances)
  const [activePrescriptions, pendingLabs, unpaidInvoices] = await Promise.all([
    db.prescription.count({ where: { encounterId: id, status: "pending" } }),
    db.labOrder.count({ where: { encounterId: id, status: { in: ["pending", "collected", "processing"] } } }),
    db.invoice.count({ where: { encounterId: id, balance: { gt: 0 }, status: { notIn: ["cancelled", "voided", "written_off"] } } }),
  ]);

  const warnings: string[] = [];
  if (activePrescriptions > 0) warnings.push(`${activePrescriptions} pending prescription(s)`);
  if (pendingLabs > 0) warnings.push(`${pendingLabs} pending lab order(s)`);
  if (unpaidInvoices > 0) warnings.push(`${unpaidInvoices} unpaid invoice(s)`);

  const updated = await db.encounter.update({
    where: { id },
    data: {
      status: "completed",
      endAt: new Date(),
      checkOutAt: new Date(),
      notes: body.notes ? `${existing.notes || ""}\n[Closed] ${body.notes}`.trim() : existing.notes,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "ENCOUNTER_CLOSED",
    resourceType: "encounter",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status: "completed", warnings: warnings.length > 0 ? warnings.join("; ") : undefined },
  });

  return NextResponse.json({
    item: updated,
    warnings: warnings.length > 0 ? warnings : undefined,
    message: warnings.length > 0
      ? `Encounter closed with ${warnings.length} warning(s): ${warnings.join(", ")}`
      : "Encounter closed successfully",
  });
}

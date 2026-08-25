// =====================================================================
// API: /api/admissions/[id]/discharge-plan
//   POST — create/update discharge plan (admitted → discharge_planned)
//   Body: { expectedDischargeDate, dischargeReadiness, pendingItems, notes }
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
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_DISCHARGE_PLAN) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden — missing admission.discharge_plan permission" }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { expectedDischargeDate, dischargeReadiness, pendingItems, notes } = body;

  const existing = await db.admission.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Admission not found" }, { status: 404 });
  if (!["admitted", "discharge_planned"].includes(existing.status)) {
    return NextResponse.json({ error: `Cannot plan discharge for admission in status "${existing.status}"` }, { status: 400 });
  }

  const updateData: any = {
    status: "discharge_planned",
    dischargePlannedAt: new Date(),
    dischargePlannedById: session.user.id,
    updatedById: session.user.id,
  };
  if (expectedDischargeDate !== undefined) updateData.expectedDischargeDate = expectedDischargeDate ? new Date(expectedDischargeDate) : null;
  if (dischargeReadiness !== undefined) updateData.dischargeReadiness = dischargeReadiness;
  if (pendingItems !== undefined) updateData.pendingItems = typeof pendingItems === "string" ? pendingItems : JSON.stringify(pendingItems);
  if (notes !== undefined) updateData.notes = notes;

  const updated = await db.admission.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "DISCHARGE_PLANNED",
    resourceType: "admission",
    resourceId: id,
    oldValues: { status: existing.status, expectedDischargeDate: existing.expectedDischargeDate },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

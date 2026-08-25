// =====================================================================
// API: /api/admissions/[id]/approve
//   POST — approve or decline an admission request
//   Body: { decision: "approved" | "declined", notes }
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
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_APPROVE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden — missing admission.approve permission" }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { decision, notes } = body;
  if (!decision || !["approved", "declined"].includes(decision)) {
    return NextResponse.json({ error: "decision must be 'approved' or 'declined'" }, { status: 400 });
  }

  const existing = await db.admission.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Admission not found" }, { status: 404 });

  // Only allow approval from requested/pending_approval states
  if (!["requested", "pending_approval"].includes(existing.status)) {
    return NextResponse.json({ error: `Cannot approve admission in status "${existing.status}"` }, { status: 400 });
  }

  const newStatus = decision === "approved" ? "approved" : "declined";
  const updated = await db.admission.update({
    where: { id },
    data: {
      status: newStatus,
      approvalDecision: decision,
      approvalNotes: notes || null,
      approvedById: session.user.id,
      approvedAt: new Date(),
      updatedById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: decision === "approved" ? "ADMISSION_APPROVED" : "ADMISSION_DECLINED",
    resourceType: "admission",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status: newStatus, decision, notes },
  });

  return NextResponse.json({ item: updated });
}

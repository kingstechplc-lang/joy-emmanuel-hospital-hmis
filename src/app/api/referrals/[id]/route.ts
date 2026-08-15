// =====================================================================
// API: /api/referrals/[id]
//   GET   — single referral
//   PATCH — update status (accepted, rejected, completed, cancelled)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const referral = await db.referral.findUnique({
    where: { id },
    include: {
      patient: true,
      patientTo: true,
      encounter: true,
      referringFacility: true,
      receivingFacility: true,
      referredBy: { select: { id: true, firstName: true, lastName: true } },
      receivedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!referral) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item: referral });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_EDIT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { status, clinicalSummary, urgency, receivingStaffId } = body;

  const existing = await db.referral.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: any = {};
  if (status) {
    data.status = status;
    if (status === "accepted") data.acceptedAt = new Date();
    if (status === "completed") data.completedAt = new Date();
  }
  if (clinicalSummary !== undefined) data.clinicalSummary = clinicalSummary;
  if (urgency !== undefined) data.urgency = urgency;
  if (receivingStaffId !== undefined) {
    data.receivingStaffId = receivingStaffId || session.user.id;
  }

  const updated = await db.referral.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "REFERRAL_UPDATED",
    resourceType: "referral",
    resourceId: id,
    oldValues: { status: existing.status, urgency: existing.urgency },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}

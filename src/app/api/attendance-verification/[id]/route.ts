// =====================================================================
// API: /api/attendance-verification/[id]
//   GET   — fetch single attendance verification record
//   PATCH — update status (e.g., mark verified/failed after NHIA bridge response)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const ALLOWED_STATUSES = new Set(["pending", "verified", "failed", "not_required", "expired"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_VERIFICATION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const item = await db.attendanceVerification.findUnique({
    where: { id },
    include: { encounter: { select: { id: true, encounterNumber: true, patientId: true } } },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_VERIFICATION_VERIFY)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.attendanceVerification.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // CRITICAL: Once verified, cannot be reverted to pending (prevents tampering — section 37)
  if (existing.verificationStatus === "verified" && !hasPermission(session, PERMISSIONS.NHIA_CLAIM_CONFIG)) {
    return NextResponse.json({
      error: "Cannot modify a verified attendance record. Only org admins can override (e.g., for corrections).",
    }, { status: 422 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { verificationStatus, transactionRef, resultMessage, responseData, expiresAt } = body;

  if (verificationStatus && !ALLOWED_STATUSES.has(verificationStatus)) {
    return NextResponse.json({ error: `Invalid verificationStatus. Allowed: ${[...ALLOWED_STATUSES].join(", ")}` }, { status: 400 });
  }

  const updateData: any = {};
  if (verificationStatus) {
    updateData.verificationStatus = verificationStatus;
    if (verificationStatus === "verified") updateData.verifiedAt = new Date();
  }
  if (transactionRef !== undefined) updateData.transactionRef = transactionRef;
  if (resultMessage !== undefined) updateData.resultMessage = resultMessage;
  if (responseData !== undefined) updateData.responseData = typeof responseData === "string" ? responseData : JSON.stringify(responseData);
  if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

  const item = await db.attendanceVerification.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "ATTENDANCE_VERIFICATION_UPDATED",
    resourceType: "attendanceVerification",
    resourceId: id,
    oldValues: { verificationStatus: existing.verificationStatus },
    newValues: updateData,
  });

  return NextResponse.json({ item });
}

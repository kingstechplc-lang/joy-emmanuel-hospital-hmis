// API: /api/certifications/[id]/verify — POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_VERIFY) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.certification.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  const { verificationMethod, verificationReference, verificationUrl, verificationNotes } = body;
  // Transaction: update cert + create verification record + create status history + notify
  await db.$transaction(async (tx) => {
    const newStatus = existing.certificationTypeId ? (await tx.certificationType.findUnique({ where: { id: existing.certificationTypeId || "" } }))?.requiresApproval ? "pending_approval" : "active" : "active";
    await tx.certification.update({
      where: { id },
      data: {
        verificationStatus: "verified",
        verifiedById: session.user.id,
        verifiedAt: new Date(),
        verificationMethod: verificationMethod || "document_review",
        verificationReference: verificationReference || null,
        verificationUrl: verificationUrl || null,
        verificationNotes: verificationNotes || null,
        status: newStatus,
      },
    });
    await tx.certificationVerification.create({
      data: {
        certificationId: id,
        verifiedById: session.user.id,
        verificationStatus: "verified",
        verificationMethod: verificationMethod || "document_review",
        verificationReference: verificationReference || null,
        verificationUrl: verificationUrl || null,
        verificationNotes: verificationNotes || null,
        verifiedAt: new Date(),
      },
    });
    await tx.certificationStatusHistory.create({
      data: { certificationId: id, previousStatus: existing.status, newStatus, changedById: session.user.id, reason: "Verified" },
    });
  });
  // Notify staff
  try {
    const staff = await db.staff.findUnique({ where: { id: existing.staffId }, select: { userId: true, firstName: true, lastName: true } });
    if (staff) {
      await db.notification.create({
        data: {
          userId: staff.userId,
          type: "certification_verified",
          title: "Certification Verified",
          message: `Your certification "${existing.certificationName}" has been verified.`,
          referenceType: "certification",
          referenceId: id,
        },
      });
    }
  } catch (e) { console.error("Notification failed (non-fatal):", e); }
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_VERIFIED", resourceType: "certification", resourceId: id, reason: verificationNotes });
  return NextResponse.json({ item: { id, verificationStatus: "verified" } });
}

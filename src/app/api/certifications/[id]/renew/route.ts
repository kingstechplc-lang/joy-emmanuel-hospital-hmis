// API: /api/certifications/[id]/renew — POST (transactional: create renewal record + new cert + archive old)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_RENEW) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.certification.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  const { newIssueDate, newExpiryDate, newCertificateNumber, documentUrl, notes } = body;
  if (!newIssueDate) return NextResponse.json({ error: "newIssueDate is required" }, { status: 400 });

  // Transaction: archive old cert + create renewal record + create new cert
  const result = await db.$transaction(async (tx) => {
    // Archive old certification
    await tx.certification.update({
      where: { id },
      data: { status: "archived", renewalStatus: "completed" },
    });
    await tx.certificationStatusHistory.create({
      data: { certificationId: id, previousStatus: existing.status, newStatus: "archived", changedById: session.user.id, reason: "Renewed — replaced by new certification" },
    });

    // Create new certification (renewal)
    const newCert = await tx.certification.create({
      data: {
        staffId: existing.staffId,
        organizationId: existing.organizationId,
        facilityId: existing.facilityId,
        departmentId: existing.departmentId,
        certificationName: existing.certificationName,
        certificationTypeId: existing.certificationTypeId,
        credentialType: existing.credentialType,
        category: existing.category,
        issuingBody: existing.issuingBody,
        issuerId: existing.issuerId,
        issuingCountry: existing.issuingCountry,
        certificateNumber: newCertificateNumber || null,
        licenseNumber: existing.licenseNumber,
        registrationNumber: existing.registrationNumber,
        issueDate: new Date(newIssueDate),
        expiryDate: newExpiryDate ? new Date(newExpiryDate) : null,
        status: "active",
        isMandatory: existing.isMandatory,
        verificationStatus: "verified", // auto-verified since it's a renewal of a verified cert
        verifiedById: session.user.id,
        verifiedAt: new Date(),
        verificationMethod: "document_review",
        documentUrl: documentUrl || null,
        notes: notes || `Renewal of certification ${existing.certificateNumber || id}`,
        renewedFromId: id,
        createdById: session.user.id,
      },
    });

    // Create renewal record
    await tx.certificationRenewal.create({
      data: {
        organizationId: session.user.organizationId,
        certificationId: id,
        staffId: existing.staffId,
        renewalDate: new Date(),
        newIssueDate: new Date(newIssueDate),
        newExpiryDate: newExpiryDate ? new Date(newExpiryDate) : null,
        newCertificateNumber: newCertificateNumber || null,
        documentUrl: documentUrl || null,
        status: "completed",
        approvedById: session.user.id,
        notes,
      },
    });

    // Status history for new cert
    await tx.certificationStatusHistory.create({
      data: { certificationId: newCert.id, previousStatus: null, newStatus: "active", changedById: session.user.id, reason: "Renewal — created from previous certification" },
    });

    return { newCert };
  });

  // Notify staff
  try {
    const staff = await db.staff.findUnique({ where: { id: existing.staffId }, select: { userId: true } });
    if (staff) {
      await db.notification.create({
        data: { userId: staff.userId, type: "certification_renewed", title: "Certification Renewed", message: `Your certification "${existing.certificationName}" has been renewed.`, referenceType: "certification", referenceId: result.newCert.id },
      });
    }
  } catch (e) { console.error("Notification failed:", e); }

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_RENEWED", resourceType: "certification", resourceId: id, newValues: { newCertId: result.newCert.id } });
  return NextResponse.json({ item: result.newCert, oldCertArchived: true }, { status: 201 });
}

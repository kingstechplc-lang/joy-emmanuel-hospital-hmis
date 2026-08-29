// =====================================================================
// API: /api/certifications (UPGRADED)
//   GET  — list certifications with advanced filtering
//   POST — create a new certification record
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.CERTIFICATION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const staffId = url.searchParams.get("staffId");
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q") || "";
  const credentialType = url.searchParams.get("credentialType");
  const verificationStatus = url.searchParams.get("verificationStatus");
  const certificationTypeId = url.searchParams.get("certificationTypeId");

  // Scope to user's org
  const orgUsers = await db.user.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const userIds = orgUsers.map((u) => u.id);
  const orgStaff = await db.staff.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const staffIds = orgStaff.map((s) => s.id);

  const where: any = { staffId: { in: staffIds } };
  if (staffId) where.staffId = staffId;
  if (credentialType) where.credentialType = credentialType;
  if (verificationStatus) where.verificationStatus = verificationStatus;
  if (certificationTypeId) where.certificationTypeId = certificationTypeId;

  if (q) {
    where.OR = [
      { certificationName: { contains: q, mode: "insensitive" } },
      { issuingBody: { contains: q, mode: "insensitive" } },
      { certificateNumber: { contains: q, mode: "insensitive" } },
      { licenseNumber: { contains: q, mode: "insensitive" } },
      { registrationNumber: { contains: q, mode: "insensitive" } },
    ];
  }

  const now = new Date();
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(now.getDate() + 90);

  if (status === "expired") {
    where.expiryDate = { lt: now };
    where.status = { notIn: ["revoked", "archived"] };
  } else if (status === "expiring") {
    where.expiryDate = { gte: now, lte: ninetyDaysFromNow };
    where.status = { notIn: ["revoked", "archived"] };
  } else if (status === "active") {
    where.AND = [
      { OR: [{ status: "active" }, { status: { notIn: ["revoked", "suspended", "archived"] } }] },
      { OR: [{ expiryDate: null }, { expiryDate: { gte: ninetyDaysFromNow } }] },
    ];
  } else if (status === "revoked") {
    where.status = "revoked";
  } else if (status === "suspended") {
    where.status = "suspended";
  } else if (status === "pending_verification") {
    where.verificationStatus = "pending";
  } else if (status) {
    where.status = status;
  }

  const records = await db.certification.findMany({
    where,
    orderBy: [{ expiryDate: "asc" }, { issueDate: "desc" }],
    take: 500,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true, departmentId: true, facilityId: true } },
      certificationType: true,
      issuer: { select: { id: true, name: true } },
    },
  });

  const items = records.map((r) => {
    const isExpiringSoon = r.expiryDate && r.expiryDate >= now && r.expiryDate <= ninetyDaysFromNow && !["revoked", "suspended", "archived"].includes(r.status);
    const isExpired = r.expiryDate && r.expiryDate < now && !["revoked", "archived"].includes(r.status);
    const daysToExpiry = r.expiryDate ? Math.ceil((r.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
    const effectiveStatus = r.status === "revoked" ? "revoked" : r.status === "suspended" ? "suspended" : isExpired ? "expired" : isExpiringSoon ? "expiring_soon" : r.status;
    return {
      ...r,
      effectiveStatus,
      isExpiringSoon: !!isExpiringSoon,
      isExpired: !!isExpired,
      daysToExpiry,
    };
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_CREATE) && !hasPermission(session, PERMISSIONS.STAFF_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    staffId, certificationName, certificationTypeId, credentialType, category,
    issuingBody, issuerId, issuingCountry,
    certificateNumber, licenseNumber, registrationNumber,
    issueDate, effectiveDate, expiryDate, renewalDate, gracePeriodDays,
    isMandatory, documentUrl, notes,
  } = body;

  if (!staffId || !certificationName || !issueDate) {
    return NextResponse.json({ error: "staffId, certificationName, issueDate are required" }, { status: 400 });
  }

  // Validate staff belongs to org
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    include: { user: { select: { organizationId: true } } },
  });
  if (!staff || staff.user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid staff member" }, { status: 400 });
  }

  // Validate expiry > issue date
  if (expiryDate && new Date(expiryDate) < new Date(issueDate)) {
    return NextResponse.json({ error: "Expiry date cannot be earlier than issue date." }, { status: 400 });
  }

  // Check for duplicate certificate number
  if (certificateNumber) {
    const existing = await db.certification.findFirst({
      where: { certificateNumber, staffId },
    });
    if (existing) {
      return NextResponse.json({ error: "Certificate number already exists for this staff member." }, { status: 409 });
    }
  }

  // Determine initial status based on certification type settings
  let initialStatus = "pending_verification";
  let verificationStatus = "pending";
  if (certificationTypeId) {
    const certType = await db.certificationType.findUnique({ where: { id: certificationTypeId } });
    if (certType) {
      if (!certType.requiresVerification) {
        verificationStatus = "not_required";
        initialStatus = certType.requiresApproval ? "pending_approval" : "active";
      }
    }
  }

  const record = await db.certification.create({
    data: {
      staffId,
      organizationId: session.user.organizationId,
      facilityId: staff.facilityId || null,
      departmentId: staff.departmentId || null,
      certificationName,
      certificationTypeId: certificationTypeId || null,
      credentialType: credentialType || "certification",
      category: category || null,
      issuingBody: issuingBody || null,
      issuerId: issuerId || null,
      issuingCountry: issuingCountry || null,
      certificateNumber: certificateNumber || null,
      licenseNumber: licenseNumber || null,
      registrationNumber: registrationNumber || null,
      issueDate: new Date(issueDate),
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      renewalDate: renewalDate ? new Date(renewalDate) : null,
      gracePeriodDays: gracePeriodDays ? parseInt(gracePeriodDays, 10) : null,
      status: initialStatus,
      isMandatory: !!isMandatory,
      verificationStatus,
      documentUrl: documentUrl || null,
      notes: notes || null,
      createdById: session.user.id,
    },
  });

  // Create status history
  await db.certificationStatusHistory.create({
    data: {
      certificationId: record.id,
      previousStatus: null,
      newStatus: initialStatus,
      changedById: session.user.id,
    },
  }).catch(() => {});

  // Notify HR users for verification if required
  if (verificationStatus === "pending") {
    try {
      const hrUsers = await db.user.findMany({
        where: {
          organizationId: session.user.organizationId,
          status: "active",
          userRoles: {
            some: {
              role: {
                permissions: {
                  some: {
                    permission: { code: { in: [PERMISSIONS.CERTIFICATION_VERIFY, PERMISSIONS.SHIFT_MANAGE] } },
                  },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      for (const u of hrUsers) {
        await db.notification.create({
          data: {
            userId: u.id,
            type: "certification_pending_verification",
            title: "Certification Pending Verification",
            message: `${staff.firstName} ${staff.lastName}'s certification "${certificationName}" requires verification.`,
            referenceType: "certification",
            referenceId: record.id,
          },
        });
      }
    } catch (e) { console.error("Notification failed (non-fatal):", e); }
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: staff.facilityId || undefined,
    action: "CERTIFICATION_CREATED",
    resourceType: "certification",
    resourceId: record.id,
    newValues: { staffId, certificationName, credentialType, issueDate, expiryDate },
  });

  return NextResponse.json({ item: record }, { status: 201 });
}

// =====================================================================
// API: /api/certifications
//   GET  — list certifications (filter by staff, status)
//   POST — add a new professional certification for a staff member
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Helper: compute effective status based on expiryDate
function computeEffectiveStatus(status: string, expiryDate: Date | null): string {
  if (status === "revoked") return "revoked";
  if (!expiryDate) return status; // no expiry = stays active
  const now = new Date();
  if (expiryDate < now) return "expired";
  return status;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const staffId = url.searchParams.get("staffId");
  const status = url.searchParams.get("status"); // active | expiring | expired | revoked
  const q = url.searchParams.get("q") || "";

  // Scope to user's org
  const orgUsers = await db.user.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const userIds = orgUsers.map((u) => u.id);
  const orgStaff = await db.staff.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const staffIds = orgStaff.map((s) => s.id);

  const where: any = { staffId: { in: staffIds } };
  if (staffId) where.staffId = staffId;
  if (q) {
    where.OR = [
      { certificationName: { contains: q } },
      { issuingBody: { contains: q } },
      { certificateNumber: { contains: q } },
    ];
  }

  // For status filtering, we need to consider expiry-based status
  const now = new Date();
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(now.getDate() + 90);

  if (status === "expired") {
    where.expiryDate = { lt: now };
    where.status = { not: "revoked" };
  } else if (status === "expiring") {
    where.expiryDate = { gte: now, lte: ninetyDaysFromNow };
    where.status = { not: "revoked" };
  } else if (status === "active") {
    where.AND = [
      { OR: [{ status: "active" }, { status: { not: "revoked" } }] },
      { OR: [{ expiryDate: null }, { expiryDate: { gte: ninetyDaysFromNow } }] },
    ];
  } else if (status === "revoked") {
    where.status = "revoked";
  } else if (status) {
    where.status = status;
  }

  const records = await db.certification.findMany({
    where,
    orderBy: [{ expiryDate: "asc" }, { issueDate: "desc" }],
    take: 500,
    include: {
      staff: {
        select: {
          id: true,
          staffNumber: true,
          firstName: true,
          lastName: true,
          professionalRole: true,
        },
      },
    },
  });

  const items = records.map((r) => {
    const effectiveStatus = computeEffectiveStatus(r.status, r.expiryDate);
    const isExpiringSoon =
      r.expiryDate &&
      r.expiryDate >= now &&
      r.expiryDate <= ninetyDaysFromNow &&
      r.status !== "revoked";
    const isExpired = r.expiryDate && r.expiryDate < now && r.status !== "revoked";
    const daysToExpiry = r.expiryDate
      ? Math.ceil((r.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return {
      id: r.id,
      staffId: r.staffId,
      staff: r.staff,
      organizationId: r.organizationId,
      certificationName: r.certificationName,
      issuingBody: r.issuingBody,
      issueDate: r.issueDate,
      expiryDate: r.expiryDate,
      certificateNumber: r.certificateNumber,
      status: r.status,
      effectiveStatus,
      isExpiringSoon: !!isExpiringSoon,
      isExpired: !!isExpired,
      daysToExpiry,
      notes: r.notes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const {
    staffId,
    certificationName,
    issuingBody,
    issueDate,
    expiryDate,
    certificateNumber,
    status,
    notes,
  } = body;

  if (!staffId || !certificationName || !issueDate) {
    return NextResponse.json(
      { error: "staffId, certificationName, issueDate are required" },
      { status: 400 }
    );
  }

  // Validate staff belongs to org
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    include: { user: { select: { organizationId: true } } },
  });
  if (!staff || staff.user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid staff member" }, { status: 400 });
  }

  const record = await db.certification.create({
    data: {
      staffId,
      organizationId: session.user.organizationId,
      certificationName,
      issuingBody: issuingBody || null,
      issueDate: new Date(issueDate),
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      certificateNumber: certificateNumber || null,
      status: status || "active",
      notes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "CERTIFICATION_ADDED",
    resourceType: "certification",
    resourceId: record.id,
    newValues: { staffId, certificationName, issuingBody, issueDate, expiryDate, status },
  });

  return NextResponse.json({ item: record }, { status: 201 });
}

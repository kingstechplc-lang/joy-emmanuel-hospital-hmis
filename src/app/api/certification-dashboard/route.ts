// =====================================================================
// API: /api/certification-dashboard — GET
//   Aggregated certification statistics
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
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
  const facilityId = url.searchParams.get("facilityId");

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const [
    totalCerts,
    activeCerts,
    expiring30,
    expiring60,
    expiring90,
    expired,
    pendingVerification,
    pendingApproval,
    suspended,
    revoked,
    mandatoryCerts,
    mandatoryActive,
  ] = await Promise.all([
    db.certification.count({ where }),
    db.certification.count({ where: { ...where, status: "active", OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] } }),
    db.certification.count({ where: { ...where, expiryDate: { gte: now, lte: in30Days }, status: { notIn: ["revoked", "suspended", "archived"] } } }),
    db.certification.count({ where: { ...where, expiryDate: { gte: now, lte: in60Days }, status: { notIn: ["revoked", "suspended", "archived"] } } }),
    db.certification.count({ where: { ...where, expiryDate: { gte: now, lte: in90Days }, status: { notIn: ["revoked", "suspended", "archived"] } } }),
    db.certification.count({ where: { ...where, expiryDate: { lt: now }, status: { notIn: ["revoked", "archived"] } } }),
    db.certification.count({ where: { ...where, verificationStatus: "pending" } }),
    db.certification.count({ where: { ...where, status: "pending_approval" } }),
    db.certification.count({ where: { ...where, status: "suspended" } }),
    db.certification.count({ where: { ...where, status: "revoked" } }),
    db.certification.count({ where: { ...where, isMandatory: true } }),
    db.certification.count({ where: { ...where, isMandatory: true, status: "active", OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] } }),
  ]);

  const complianceRate = mandatoryCerts > 0 ? Math.round((mandatoryActive / mandatoryCerts) * 100) : 0;

  // Recent certifications
  const recentCerts = await db.certification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
    },
  });

  // Expiring soon list
  const expiringSoon = await db.certification.findMany({
    where: { ...where, expiryDate: { gte: now, lte: in90Days }, status: { notIn: ["revoked", "suspended", "archived"] } },
    orderBy: { expiryDate: "asc" },
    take: 20,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
    },
  });

  // Already expired list
  const expiredList = await db.certification.findMany({
    where: { ...where, expiryDate: { lt: now }, status: { notIn: ["revoked", "archived"] } },
    orderBy: { expiryDate: "desc" },
    take: 20,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
    },
  });

  // Department breakdown
  const deptBreakdown = await db.certification.groupBy({
    by: ["departmentId"],
    where,
    _count: { id: true },
  });

  // Profession breakdown
  const professionBreakdown = await db.certification.groupBy({
    by: ["credentialType"],
    where,
    _count: { id: true },
  });

  return NextResponse.json({
    stats: {
      totalCerts, activeCerts,
      expiring30, expiring60, expiring90, expired,
      pendingVerification, pendingApproval, suspended, revoked,
      mandatoryCerts, mandatoryActive, complianceRate,
    },
    recentCerts,
    expiringSoon,
    expiredList,
    deptBreakdown,
    professionBreakdown,
  });
}

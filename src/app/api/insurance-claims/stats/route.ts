// =====================================================================
// API: /api/insurance-claims/stats
//   GET — dashboard KPIs + work queue counts
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
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = {};
  if (facilityId && orgFacilityIds.includes(facilityId)) {
    where.facilityId = facilityId;
  } else {
    where.facilityId = { in: orgFacilityIds };
  }

  const [total, draft, submitted, approved, partiallyApproved, rejected, paid, resubmitted, openQueries, totalClaimAmount, totalApprovedAmount, totalPaidAmount] = await Promise.all([
    db.insuranceClaim.count({ where }),
    db.insuranceClaim.count({ where: { ...where, status: "draft" } }),
    db.insuranceClaim.count({ where: { ...where, status: "submitted" } }),
    db.insuranceClaim.count({ where: { ...where, status: "approved" } }),
    db.insuranceClaim.count({ where: { ...where, status: "partially_approved" } }),
    db.insuranceClaim.count({ where: { ...where, status: "rejected" } }),
    db.insuranceClaim.count({ where: { ...where, status: "paid" } }),
    db.insuranceClaim.count({ where: { ...where, status: "resubmitted" } }),
    db.claimQuery.count({ where: { status: "open", claim: where } }),
    db.insuranceClaim.aggregate({ where, _sum: { claimAmount: true } }),
    db.insuranceClaim.aggregate({ where: { ...where, status: { in: ["approved", "partially_approved", "paid"] } }, _sum: { approvedAmount: true } }),
    db.insuranceClaim.aggregate({ where: { ...where, status: "paid" }, _sum: { approvedAmount: true } }),
  ]);

  const outstanding = (totalClaimAmount._sum.claimAmount || 0) - (totalPaidAmount._sum.approvedAmount || 0);

  return NextResponse.json({
    kpis: {
      total, draft, submitted, approved, partiallyApproved, rejected, paid, resubmitted, openQueries,
      totalClaimAmount: totalClaimAmount._sum.claimAmount || 0,
      totalApprovedAmount: totalApprovedAmount._sum.approvedAmount || 0,
      totalPaidAmount: totalPaidAmount._sum.approvedAmount || 0,
      outstanding,
    },
    workQueues: {
      pendingValidation: draft,
      readyForSubmission: draft, // drafts that are validated
      submittedAwaitingResponse: submitted,
      openQueries,
      rejectedClaims: rejected,
      resubmissions: resubmitted,
      awaitingPayment: approved + partiallyApproved,
    },
  });
}

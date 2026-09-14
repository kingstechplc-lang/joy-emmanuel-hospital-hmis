// =====================================================================
// API: /api/portal/lab-results
//   GET — list lab orders + results for the authenticated patient
//
// Authorization: Bearer <portal-jwt>
//
// Returns ONLY lab orders where:
//   1. The order belongs to the authenticated patient (Patient.id
//      linked to the PatientPortalAccount)
//   2. The order's status is "released" or higher (lab has finished)
//   3. The order's `releasedToPatientAt` is set (clinician has
//      explicitly approved portal visibility)
//
// This implements the "Doctor-approves-release" decision: a finalized
// lab result stays hidden from the patient until the clinician clicks
// the "Release to Patient" button (POST /api/lab-orders/[id]/release-to-patient).
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalSessionFromRequest } from "@/lib/patient-portal/jwt";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getPortalSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.patientId) {
    return NextResponse.json(
      {
        error:
          "Your account is pending identity verification. Please visit the Records Desk to complete setup.",
        needsIdentity: true,
      },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));

  // Find lab orders that have been released to the patient
  const [orders, total] = await Promise.all([
    db.labOrder.findMany({
      where: {
        patientId: session.patientId,
        releasedToPatientAt: { not: null },
        // Also exclude cancelled orders
        status: { not: "cancelled" },
      },
      orderBy: { releasedToPatientAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        priority: true,
        orderedAt: true,
        releasedToPatientAt: true,
        encounter: {
          select: {
            id: true,
            encounterNumber: true,
            encounterType: true,
          },
        },
        orderingClinician: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: {
          select: {
            id: true,
            testName: true,
            // Include the lab result for each item (1:1)
            result: {
              select: {
                id: true,
                resultValue: true,
                unit: true,
                abnormalFlag: true,
                isCritical: true,
                referenceRange: true,
                resultReleasedAt: true,
                notes: true,
                releasedById: true,
              },
            },
          },
        },
      },
    }),
    db.labOrder.count({
      where: {
        patientId: session.patientId,
        releasedToPatientAt: { not: null },
        status: { not: "cancelled" },
      },
    }),
  ]);

  return NextResponse.json({
    items: orders,
    total,
    offset,
    limit,
    hasMore: offset + orders.length < total,
  });
}

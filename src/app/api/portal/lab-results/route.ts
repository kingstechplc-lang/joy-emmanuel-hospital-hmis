// =====================================================================
// API: /api/portal/lab-results
//   GET — list lab orders + results for the authenticated patient
//
// Authorization: Bearer <portal-jwt>
//
// Returns ONLY lab orders where:
//   1. The order belongs to the authenticated patient
//   2. The order's status is not "cancelled"
//   3. The order's `releasedToPatientAt` is set (clinician has
//      explicitly approved portal visibility)
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

  try {
    const where = {
      patientId: session.patientId,
      releasedToPatientAt: { not: null },
      status: { not: "cancelled" as const },
    };

    const [orders, total] = await Promise.all([
      db.labOrder.findMany({
        where,
        orderBy: { releasedToPatientAt: "desc" as const },
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
              // ⚠️ The relation is `results` (plural, LabResult[]) — not `result`
              results: {
                select: {
                  id: true,
                  resultValue: true,
                  numericValue: true,
                  unit: true,
                  abnormalFlag: true,
                  criticalFlag: true,
                  referenceRange: true,
                  releasedAt: true,
                  resultNotes: true,
                  clinicianComment: true,
                },
              },
            },
          },
        },
      }),
      db.labOrder.count({ where }),
    ]);

    return NextResponse.json({
      items: orders,
      total,
      offset,
      limit,
      hasMore: offset + orders.length < total,
    });
  } catch (e: any) {
    console.error("[GET /api/portal/lab-results] error:", e);
    return NextResponse.json(
      { error: "Failed to load lab results. Please try again." },
      { status: 500 }
    );
  }
}

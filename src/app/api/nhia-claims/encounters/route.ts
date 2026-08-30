// =====================================================================
// API: /api/nhia-claims/encounters
//   GET — list encounters eligible for NHIA claim generation.
//         "Eligible" = has an NHIS invoice (status issued/paid/partially_paid)
//                       AND has at least one diagnosis AND patient has NHIS number.
//   Returns: { items: [...], count }
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
  if (!hasPermission(session, PERMISSIONS.NHIA_CLAIM_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  if (!facilityId) {
    return NextResponse.json({
      items: [],
      count: 0,
      error: "facilityId is required (set an active facility in the topbar)",
    });
  }

  // Fetch encounters that have an NHIS invoice
  // Strategy: scan recent encounters at the facility, filter to those with
  // an NHIS invoice + diagnoses + patient NHIS number.
  const encounters = await db.encounter.findMany({
    where: { facilityId },
    include: {
      patient: {
        select: {
          id: true, patientNumber: true, firstName: true, lastName: true, sex: true, phone: true,
          insurance: {
            where: { OR: [{ status: "active" }, { status: "verified" }] },
            include: { insuranceProvider: true },
            take: 1,
          },
        },
      },
      department: { select: { id: true, name: true } },
      diagnoses: { take: 5, select: { id: true, diagnosisCode: true, diagnosisName: true, isPrimary: true } },
      invoices: {
        where: { payerType: "nhis", status: { in: ["issued", "paid", "partially_paid"] } },
        select: {
          id: true, invoiceNumber: true, total: true, balance: true, status: true,
          patientResponsibility: true, nhisResponsibility: true, issuedAt: true,
        },
        orderBy: { issuedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { startAt: "desc" },
    take: Math.max(limit * 3, 300), // overscan then filter
  });

  // Filter to eligible encounters
  const eligible = encounters
    .filter(e => e.invoices.length > 0)              // must have NHIS invoice
    .filter(e => e.diagnoses.length > 0)             // must have at least one diagnosis
    .filter(e => {
      const ins = e.patient?.insurance?.[0];
      return ins && (ins.membershipNumber || ins.policyNumber); // must have NHIS number
    })
    .slice(0, limit)
    .map(e => {
      const inv = e.invoices[0];
      const ins = e.patient?.insurance?.[0];
      const primaryDx = e.diagnoses.find(d => d.isPrimary) || e.diagnoses[0];
      return {
        encounterId: e.id,
        encounterNumber: e.encounterNumber,
        encounterType: e.encounterType,
        visitDate: e.startAt,
        patientId: e.patientId,
        patientNumber: e.patient?.patientNumber,
        patientName: e.patient ? `${e.patient.firstName} ${e.patient.lastName}`.trim() : null,
        patientSex: e.patient?.sex || null,
        patientPhone: e.patient?.phone || null,
        departmentName: e.department?.name || null,
        nhisNumber: ins?.membershipNumber || ins?.policyNumber || null,
        insuranceProvider: ins?.insuranceProvider?.name || "NHIS",
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceTotal: inv.total,
        invoiceBalance: inv.balance,
        invoiceStatus: inv.status,
        patientResponsibility: inv.patientResponsibility,
        nhisResponsibility: inv.nhisResponsibility,
        diagnosisCount: e.diagnoses.length,
        primaryDiagnosisCode: primaryDx?.diagnosisCode || null,
        primaryDiagnosisName: primaryDx?.diagnosisName || null,
      };
    });

  return NextResponse.json({ items: eligible, count: eligible.length });
}

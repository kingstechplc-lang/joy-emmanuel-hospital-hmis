// =====================================================================
// API: /api/records/stats
//   Returns statistics specific to the Records Desk:
//   - Today's check-ins (encounters opened today)
//   - New patients today
//   - NHIS-insured patients vs. self-pay patients
//   - Patients with expired/unvalidated insurance
//   - Encounter breakdown by type (OPD, emergency, etc.)
//   - Recent check-ins (last 10)
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
  if (
    !hasPermission(session, PERMISSIONS.PATIENT_VIEW) &&
    !hasPermission(session, PERMISSIONS.ENCOUNTER_VIEW)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const orgId = session.user.organizationId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  const encWhere: any = { facilityId: facilityId || { in: (await db.facility.findMany({ where: { organizationId: orgId }, select: { id: true } })).map((f) => f.id) } };
  const encTodayWhere = { ...encWhere, startAt: { gte: today, lte: todayEnd } };

  const [
    totalPatients,
    todayCheckIns,
    todayNewPatients,
    totalNHIS,
    totalSelfPay,
    expiredInsurance,
    unvalidatedInsurance,
    encountersByType,
    recentCheckIns,
    activeEncounters,
  ] = await Promise.all([
    // Total patients in the org
    db.patient.count({ where: { organizationId: orgId, status: "active" } }),

    // Today's check-ins (encounters opened today at this facility)
    db.encounter.count({ where: encTodayWhere }),

    // New patients registered today
    db.patient.count({
      where: {
        organizationId: orgId,
        registrationDate: { gte: today, lte: todayEnd },
      },
    }),

    // Total patients with active, verified NHIS/insurance
    db.patientInsurance.count({
      where: {
        status: "active",
        verificationStatus: "verified",
        coverageEnd: { gte: new Date() },
        patient: { organizationId: orgId, status: "active" },
      },
    }),

    // Total active patients WITHOUT valid insurance (self-pay)
    db.patient.count({
      where: {
        organizationId: orgId,
        status: "active",
        insurance: { none: { status: "active", verificationStatus: "verified", coverageEnd: { gte: new Date() } } },
      },
    }),

    // Patients with EXPIRED insurance
    db.patientInsurance.count({
      where: {
        status: "active",
        coverageEnd: { lt: new Date() },
        patient: { organizationId: orgId, status: "active" },
      },
    }),

    // Patients with PENDING/UNVALIDATED insurance
    db.patientInsurance.count({
      where: {
        status: "active",
        verificationStatus: { in: ["pending", "rejected"] },
        patient: { organizationId: orgId, status: "active" },
      },
    }),

    // Today's encounters by type
    db.encounter.groupBy({
      by: ["encounterType"],
      where: encTodayWhere,
      _count: true,
    }),

    // Recent check-ins (last 10 encounters today)
    db.encounter.findMany({
      where: encTodayWhere,
      orderBy: { startAt: "desc" },
      take: 10,
      include: {
        patient: {
          select: {
            id: true,
            patientNumber: true,
            firstName: true,
            lastName: true,
            sex: true,
            dateOfBirth: true,
            phone: true,
            insurance: {
              where: { status: "active" },
              include: { insuranceProvider: true },
              take: 1,
            },
          },
        },
        facility: { select: { name: true, code: true } },
        department: { select: { name: true, code: true } },
      },
    }),

    // Currently active encounters (open/in_progress)
    db.encounter.count({
      where: { ...encWhere, status: { in: ["open", "in_progress"] } },
    }),
  ]);

  // Compute insurance status for each recent check-in
  const recentWithEligibility = recentCheckIns.map((enc) => {
    const ins = enc.patient.insurance[0];
    let eligibility: "valid" | "expired" | "unvalidated" | "self_pay" = "self_pay";
    let payerType: "NHIS" | "self_pay" = "self_pay";

    if (ins) {
      const now = new Date();
      if (ins.verificationStatus === "verified" && ins.coverageEnd && new Date(ins.coverageEnd) >= now) {
        eligibility = "valid";
        payerType = "NHIS";
      } else if (ins.coverageEnd && new Date(ins.coverageEnd) < now) {
        eligibility = "expired";
      } else {
        eligibility = "unvalidated";
      }
    }

    return {
      id: enc.id,
      encounterNumber: enc.encounterNumber,
      encounterType: enc.encounterType,
      status: enc.status,
      priority: enc.priority,
      startAt: enc.startAt,
      department: enc.department,
      patient: {
        id: enc.patient.id,
        patientNumber: enc.patient.patientNumber,
        firstName: enc.patient.firstName,
        lastName: enc.patient.lastName,
        sex: enc.patient.sex,
        dateOfBirth: enc.patient.dateOfBirth,
        phone: enc.patient.phone,
        eligibility,
        payerType,
        insuranceProvider: ins?.insuranceProvider?.name || null,
        insuranceStatus: ins?.verificationStatus || null,
      },
    };
  });

  return NextResponse.json({
    totalPatients,
    todayCheckIns,
    todayNewPatients,
    activeEncounters,
    insuranceBreakdown: {
      nhisValid: totalNHIS,
      selfPay: totalSelfPay,
      expired: expiredInsurance,
      unvalidated: unvalidatedInsurance,
    },
    encountersByType: encountersByType.map((t) => ({
      type: t.encounterType,
      count: t._count,
    })),
    recentCheckIns: recentWithEligibility,
  });
}

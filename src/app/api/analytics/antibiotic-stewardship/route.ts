// =====================================================================
// API: /api/analytics/antibiotic-stewardship
//   GET — Antibiotic prescribing patterns + per-clinician breakdown.
//
// Auth: NextAuth staff session, requires PERMISSIONS.REPORT_VIEW.
// Facility-scoped: when session.user.facilityId is set and the user is
//   not a super_admin, results are limited to prescriptions issued at
//   that facility. Medications themselves are organization-scoped
//   (Medication has only organizationId, no facilityId), so the master
//   catalog filter uses session.user.organizationId.
//
// Query params:
//   ?period=30d|90d|1y|all   (default: 90d)
//
// Returns:
//   {
//     period: "90d",
//     periodStart: "2026-…Z" | null,
//     topAntibiotics: [{ name, count }],
//     byClinician: [{ clinicianId, clinicianName, antibioticCount, totalPrescriptions }]
//   }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

type PeriodKey = "30d" | "90d" | "1y" | "all";

function computePeriodStart(period: PeriodKey): Date | null {
  if (period === "all") return null;
  const now = new Date();
  const days = period === "30d" ? 30 : period === "90d" ? 90 : 365;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

const ANTIBIOTIC_KEYWORDS = [
  "amoxicillin",
  "ciprofloxacin",
  "metronidazole",
  "azithromycin",
  "ceftriaxone",
  "doxycycline",
  "cotrimoxazole",
  "erythromycin",
  "gentamicin",
  "chloramphenicol",
];

function displayName(u: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  username?: string | null;
} | null): string {
  if (!u) return "Unknown";
  const parts = [u.firstName, u.middleName, u.lastName].filter(
    (p): p is string => Boolean(p && p.length > 0)
  );
  if (parts.length > 0) return parts.join(" ");
  return u.username ?? "Unknown";
}

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session, PERMISSIONS.REPORT_VIEW)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const rawPeriod = url.searchParams.get("period") as PeriodKey | null;
    const period: PeriodKey =
      rawPeriod === "30d" || rawPeriod === "90d" || rawPeriod === "1y" || rawPeriod === "all"
        ? rawPeriod
        : "90d";

    const periodStart = computePeriodStart(period);
    const isSuperAdmin = session.user.roles.includes("super_admin");
    const facilityId = session.user.facilityId;
    const organizationId = session.user.organizationId;

    // -----------------------------------------------------------------
    // 1. Find all medications whose genericName contains one of the
    //    antibiotic keywords (case-insensitive contains search).
    //    Medication is organization-scoped (no facilityId on the model).
    // -----------------------------------------------------------------
    const medWhere: any = {
      organizationId,
      OR: ANTIBIOTIC_KEYWORDS.map((kw) => ({
        genericName: { contains: kw, mode: "insensitive" },
      })),
    };
    // super_admin (with no facilityId) reads across the org; otherwise
    // restrict to the user's org only — there is no finer facility-level
    // scoping possible on the master catalog.
    if (isSuperAdmin) {
      delete medWhere.organizationId;
    }

    const antibiotics = await db.medication.findMany({
      where: medWhere,
      select: { id: true, genericName: true, brandName: true },
    });

    if (antibiotics.length === 0) {
      return NextResponse.json({
        period,
        periodStart: periodStart ? periodStart.toISOString() : null,
        generatedAt: new Date().toISOString(),
        topAntibiotics: [],
        byClinician: [],
      });
    }

    const antibioticIds = antibiotics.map((m) => m.id);

    // -----------------------------------------------------------------
    // 2. Build the PrescriptionItem `where` clause.
    //    PrescriptionItem.facilityId isn't a direct field — scope via
    //    the prescription relation (Prescription has facilityId + prescribedAt).
    // -----------------------------------------------------------------
    const itemWhere: any = {
      medicationId: { in: antibioticIds },
      prescription: {},
    };
    if (periodStart) {
      itemWhere.prescription.prescribedAt = { gte: periodStart };
    }
    if (!isSuperAdmin && facilityId) {
      itemWhere.prescription.facilityId = facilityId;
    }

    // -----------------------------------------------------------------
    // 3. Per-antibiotic counts via groupBy on medicationId.
    //    We fetch the lightweight PrescriptionItem rows (just the FK +
    //    prescription.prescriberId for the by-clinician breakdown) and
    //    aggregate in JS — that's one round-trip instead of two.
    // -----------------------------------------------------------------
    const items = await db.prescriptionItem.findMany({
      where: itemWhere,
      select: {
        medicationId: true,
        prescriptionId: true,
        prescription: {
          select: {
            id: true,
            prescriberId: true,
            prescriber: {
              select: {
                id: true,
                firstName: true,
                middleName: true,
                lastName: true,
                username: true,
              },
            },
          },
        },
      },
    });

    // Per-antibiotic counts
    const byMedCount = new Map<string, number>();
    for (const it of items) {
      byMedCount.set(it.medicationId, (byMedCount.get(it.medicationId) ?? 0) + 1);
    }
    const medIdToName = new Map<string, string>(
      antibiotics.map((m) => [m.id, m.genericName])
    );

    const topAntibiotics = [...byMedCount.entries()]
      .map(([id, count]) => ({ name: medIdToName.get(id) ?? "Unknown", count }))
      .sort((a, b) => b.count - a.count);

    // -----------------------------------------------------------------
    // 4. Per-clinician breakdown.
    //    antibioticCount  = distinct PrescriptionItem rows for antibiotics
    //                       where prescription.prescriberId = X
    //    totalPrescriptions = distinct Prescription.id where prescriberId = X
    //                       (any medication, not just antibiotics) in period
    // -----------------------------------------------------------------
    const antibioticByClinician = new Map<string, number>();
    const antibioticPrescriptionIdsByClinician = new Map<string, Set<string>>();
    for (const it of items) {
      const prescriberId = it.prescription?.prescriberId;
      if (!prescriberId) continue;
      antibioticByClinician.set(
        prescriberId,
        (antibioticByClinician.get(prescriberId) ?? 0) + 1
      );
      const set =
        antibioticPrescriptionIdsByClinician.get(prescriberId) ?? new Set<string>();
      set.add(it.prescriptionId);
      antibioticPrescriptionIdsByClinician.set(prescriberId, set);
    }

    // Fetch total prescriptions (any medication) per clinician, in the period
    const rxWhere: any = {};
    if (periodStart) {
      rxWhere.prescribedAt = { gte: periodStart };
    }
    if (!isSuperAdmin && facilityId) {
      rxWhere.facilityId = facilityId;
    }
    const rxRows = await db.prescription.findMany({
      where: rxWhere,
      select: { id: true, prescriberId: true },
    });
    const totalByClinician = new Map<string, Set<string>>();
    for (const r of rxRows) {
      if (!r.prescriberId) continue;
      const set = totalByClinician.get(r.prescriberId) ?? new Set<string>();
      set.add(r.id);
      totalByClinician.set(r.prescriberId, set);
    }

    // Union of clinician IDs from both maps
    const clinicianIds = new Set<string>([
      ...antibioticByClinician.keys(),
      ...totalByClinician.keys(),
    ]);

    // Fetch clinician names (one query — User table)
    const clinicianIdsArr = [...clinicianIds];
    const users =
      clinicianIdsArr.length > 0
        ? await db.user.findMany({
            where: { id: { in: clinicianIdsArr } },
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              username: true,
            },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const byClinician = [...clinicianIds]
      .map((id) => {
        const u = userMap.get(id) ?? null;
        const abSet = antibioticPrescriptionIdsByClinician.get(id);
        const totalSet = totalByClinician.get(id);
        return {
          clinicianId: id,
          clinicianName: displayName(u),
          antibioticCount: antibioticByClinician.get(id) ?? 0,
          antibioticPrescriptions: abSet ? abSet.size : 0,
          totalPrescriptions: totalSet ? totalSet.size : 0,
        };
      })
      .sort((a, b) => b.antibioticCount - a.antibioticCount);

    return NextResponse.json({
      period,
      periodStart: periodStart ? periodStart.toISOString() : null,
      generatedAt: new Date().toISOString(),
      topAntibiotics,
      byClinician,
    });
  } catch (e: any) {
    console.error("[GET /api/analytics/antibiotic-stewardship]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to compute antibiotic stewardship analytics" },
      { status: 500 }
    );
  }
}

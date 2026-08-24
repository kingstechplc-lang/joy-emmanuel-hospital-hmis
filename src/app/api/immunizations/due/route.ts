// =====================================================================
// API: /api/immunizations/due
//   GET — worklist of patients with due/overdue vaccinations
// =====================================================================
// Computes the immunization schedule for every patient under 18 at this
// facility and returns those who have at least one due_now or overdue dose.
// Used by the Due List tab in the immunizations view.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { computePatientSchedule } from "@/lib/immunization-schedule";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMMUNIZATION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId;
  if (!facilityId) {
    return NextResponse.json({ items: [], count: 0 });
  }

  const filter = url.searchParams.get("filter") || "all"; // all | due_now | overdue

  // Load all patients under 18 at this facility (vaccines primarily target children)
  // Cap at 500 patients to keep the computation reasonable.
  const eighteenYearsAgo = new Date();
  eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);

  const patients = await db.patient.findMany({
    where: {
      dateOfBirth: { gte: eighteenYearsAgo },
    },
    select: {
      id: true,
      patientNumber: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      sex: true,
      phone: true,
    },
    take: 500,
    orderBy: { dateOfBirth: "desc" },
  });

  // Compute schedule for each patient and collect due/overdue entries
  const dueEntries: any[] = [];
  for (const patient of patients) {
    const schedule = await computePatientSchedule(patient.id, session.user.organizationId);
    for (const entry of schedule) {
      if (entry.status === "due_now" || entry.status === "overdue") {
        if (filter === "due_now" && entry.status !== "due_now") continue;
        if (filter === "overdue" && entry.status !== "overdue") continue;
        dueEntries.push({
          patient,
          vaccineCatalogId: entry.vaccineCatalogId,
          vaccineCode: entry.vaccineCode,
          vaccineName: entry.vaccineName,
          doseNumber: entry.doseNumber,
          doseLabel: entry.doseLabel,
          dueDate: entry.dueDate,
          overdueDate: entry.overdueDate,
          status: entry.status,
          daysUntilDue: entry.daysUntilDue,
        });
      }
    }
  }

  // Sort: overdue first (most overdue first), then due_now (most urgent first)
  dueEntries.sort((a, b) => {
    if (a.status === "overdue" && b.status !== "overdue") return -1;
    if (a.status !== "overdue" && b.status === "overdue") return 1;
    return a.daysUntilDue - b.daysUntilDue;
  });

  return NextResponse.json({ items: dueEntries, count: dueEntries.length });
}

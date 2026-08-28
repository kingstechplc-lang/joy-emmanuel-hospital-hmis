// =====================================================================
// API: /api/discharges/export
//   GET — export discharge records as CSV
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

function csvEscape(value: any): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  where.dischargedAt = { gte: new Date(`${from}T00:00:00`), lte: new Date(`${to}T23:59:59.999`) };

  const items = await db.dischargeRecord.findMany({
    where,
    orderBy: { dischargedAt: "desc" },
    include: {
      patient: { select: { patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } },
      admission: { select: { admissionNumber: true, admittedAt: true, bedAssignments: { where: { status: "active" }, include: { ward: { select: { name: true } }, bed: { select: { bedNumber: true } } }, take: 1 } } },
      dischargedBy: { select: { firstName: true, lastName: true } },
    },
    take: 1000,
  });

  const headers = [
    "Discharge #", "Patient", "Patient #", "Sex", "DOB", "Admission #", "Admitted At", "Discharged At",
    "Discharge Type", "Disposition", "Status", "Final Diagnosis", "Condition", "Ward", "Bed",
    "Follow-up Date", "Follow-up Clinic", "Discharged By", "LOS (days)",
  ];

  const rows = items.map((d) => {
    const ba = d.admission?.bedAssignments?.[0];
    const los = d.admission?.admittedAt ? ((new Date(d.dischargedAt).getTime() - new Date(d.admission.admittedAt).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1) : "";
    return [
      d.dischargeNumber || "",
      `${d.patient?.firstName} ${d.patient?.lastName}`,
      d.patient?.patientNumber || "",
      d.patient?.sex || "",
      d.patient?.dateOfBirth ? new Date(d.patient.dateOfBirth).toISOString().slice(0, 10) : "",
      d.admission?.admissionNumber || "",
      d.admission?.admittedAt ? new Date(d.admission.admittedAt).toISOString() : "",
      new Date(d.dischargedAt).toISOString(),
      d.dischargeType || "routine",
      d.disposition || "home",
      d.status,
      d.finalDiagnosis || "",
      d.dischargeConditions || "",
      ba?.ward?.name || "",
      ba?.bed?.bedNumber || "",
      d.followUpAppointmentDate ? new Date(d.followUpAppointmentDate).toISOString().slice(0, 10) : "",
      d.followUpClinic || "",
      d.dischargedBy ? `${d.dischargedBy.firstName} ${d.dischargedBy.lastName}` : "",
      los,
    ].map(csvEscape).join(",");
  });

  const csv = [
    `# Discharge Export — ${from} to ${to}`,
    `# Facility: ${facilityId || "All"}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Total records: ${items.length}`,
    "",
    headers.map(csvEscape).join(","),
    ...rows,
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="discharges-${from}-to-${to}.csv"`,
    },
  });
}

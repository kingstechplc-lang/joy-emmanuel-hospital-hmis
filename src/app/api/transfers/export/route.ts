// =====================================================================
// API: /api/transfers/export
//   GET — export transfers as CSV
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
  if (facilityId) {
    where.OR = [{ fromFacilityId: facilityId }, { toFacilityId: facilityId }];
  }
  where.requestedAt = { gte: new Date(`${from}T00:00:00`), lte: new Date(`${to}T23:59:59.999`) };

  const items = await db.patientTransfer.findMany({
    where,
    orderBy: { requestedAt: "desc" },
    include: {
      patient: { select: { patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } },
      admission: { select: { admissionNumber: true, admittedAt: true } },
      fromFacility: { select: { name: true } },
      toFacility: { select: { name: true } },
      requestedBy: { select: { firstName: true, lastName: true } },
    },
    take: 1000,
  });

  const headers = [
    "Transfer #", "Patient", "Patient #", "Sex", "Admission #",
    "Type", "Category", "Priority", "Status",
    "From Facility", "To Facility", "Reason",
    "Requested At", "Approved At", "Departed At", "Arrived At", "Completed At",
    "Transport Method", "Requested By",
  ];

  const rows = items.map((t) => [
    t.transferNumber || "",
    `${t.patient?.firstName} ${t.patient?.lastName}`,
    t.patient?.patientNumber || "",
    t.patient?.sex || "",
    t.admission?.admissionNumber || "",
    t.transferType,
    t.transferCategory || "",
    t.priority,
    t.status,
    t.fromFacility?.name || "",
    t.toFacility?.name || "",
    t.reason || "",
    new Date(t.requestedAt).toISOString(),
    t.approvedAt ? new Date(t.approvedAt).toISOString() : "",
    t.departedAt ? new Date(t.departedAt).toISOString() : "",
    t.arrivedAt ? new Date(t.arrivedAt).toISOString() : "",
    t.completedAt ? new Date(t.completedAt).toISOString() : "",
    t.transportMethod || "",
    t.requestedBy ? `${t.requestedBy.firstName} ${t.requestedBy.lastName}` : "",
  ].map(csvEscape).join(","));

  const csv = [
    `# Transfer Export — ${from} to ${to}`,
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
      "Content-Disposition": `attachment; filename="transfers-${from}-to-${to}.csv"`,
    },
  });
}

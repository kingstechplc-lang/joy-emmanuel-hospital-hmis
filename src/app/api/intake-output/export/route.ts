// =====================================================================
// API: /api/intake-output/export
//   GET — export entries as CSV (for spreadsheet / external analysis)
//
// Query params:
//   patientId    = required
//   admissionId  = optional scope
//   from         = YYYY-MM-DD (optional, defaults to 7 days ago)
//   to           = YYYY-MM-DD (optional, defaults to today)
//   format       = csv (default) | json
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
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const admissionId = url.searchParams.get("admissionId");
  const from = url.searchParams.get("from") || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const format = url.searchParams.get("format") || "csv";

  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { id: true, organizationId: true, firstName: true, lastName: true, patientNumber: true, sex: true, dateOfBirth: true },
  });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59.999`);

  const where: any = {
    patientId,
    status: { not: "cancelled" },
    eventAt: { gte: start, lte: end },
  };
  if (admissionId) where.admissionId = admissionId;

  const entries = await db.intakeOutputEntry.findMany({
    where,
    orderBy: { eventAt: "asc" },
    include: {
      recordedBy: { select: { firstName: true, lastName: true, username: true } },
      verifiedBy: { select: { firstName: true, lastName: true, username: true } },
      amendedBy: { select: { firstName: true, lastName: true, username: true } },
    },
  });

  if (format === "json") {
    return NextResponse.json({
      patient: { ...patient, dateOfBirth: patient.dateOfBirth?.toISOString() },
      range: { from: start, to: end },
      entries,
      count: entries.length,
    });
  }

  // CSV format
  const headers = [
    "Event Date", "Event Time", "Entry Type", "Category", "Source", "Route",
    "Amount", "Unit", "Measurement Type", "Drain Label", "Catheter Status",
    "Status", "Recorded At", "Recorded By", "Verified At", "Verified By",
    "Amended At", "Amended By", "Amendment Reason", "Original Amount",
    "Notes",
  ];

  const rows = entries.map((e) => {
    const evDt = new Date(e.eventAt);
    const recDt = new Date(e.recordedAt);
    return [
      evDt.toISOString().slice(0, 10),
      evDt.toTimeString().slice(0, 8),
      e.entryType,
      e.category || e.fluidType,
      e.source || "",
      e.route || "",
      e.amount,
      e.unit,
      e.measurementType || "measured",
      e.drainLabel || "",
      e.catheterStatus || "",
      e.status,
      recDt.toISOString(),
      e.recordedBy ? `${e.recordedBy.firstName} ${e.recordedBy.lastName}` : "",
      e.verifiedAt ? new Date(e.verifiedAt).toISOString() : "",
      e.verifiedBy ? `${e.verifiedBy.firstName} ${e.verifiedBy.lastName}` : "",
      e.amendedAt ? new Date(e.amendedAt).toISOString() : "",
      e.amendedBy ? `${e.amendedBy.firstName} ${e.amendedBy.lastName}` : "",
      e.amendmentReason || "",
      e.originalAmount != null ? e.originalAmount : "",
      e.notes || "",
    ].map(csvEscape).join(",");
  });

  const csv = [
    `# Patient: ${patient.firstName} ${patient.lastName} (${patient.patientNumber})`,
    `# Date of Birth: ${patient.dateOfBirth ? new Date(patient.dateOfBirth).toISOString().slice(0, 10) : "—"}`,
    `# Sex: ${patient.sex || "—"}`,
    `# Range: ${from} to ${to}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Total entries: ${entries.length}`,
    "",
    headers.map(csvEscape).join(","),
    ...rows,
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="intake-output-${patient.patientNumber}-${from}-to-${to}.csv"`,
    },
  });
}

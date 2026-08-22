// =====================================================================
// API: /api/insurance-claims/export
//   GET — export claims in CSV, JSON, or TSV (Excel-compatible) format
//
// Query params:
//   format: "csv" | "json" | "tsv"  (default: csv)
//   facilityId: string
//   status: string
//   patientId: string
//   providerId: string
//   dateFrom: YYYY-MM-DD
//   dateTo: YYYY-MM-DD
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

function escapeCSV(val: any, delimiter = ","): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(delimiter) || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "csv";
  const facilityId = url.searchParams.get("facilityId");
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const providerId = url.searchParams.get("providerId");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (patientId) where.patientId = patientId;
  if (providerId) where.insuranceProviderId = providerId;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(`${dateTo}T23:59:59`);
  }

  const claims = await db.insuranceClaim.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, phone: true, dateOfBirth: true } },
      facility: { select: { id: true, name: true, code: true } },
      insuranceProvider: { select: { id: true, name: true, code: true } },
      invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true } },
      claimDiagnoses: { select: { diagnosisCode: true, diagnosisName: true, diagnosisType: true, isPrimary: true } },
    },
    take: 5000,
  });

  const delimiter = format === "tsv" ? "\t" : ",";

  if (format === "json") {
    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      totalRecords: claims.length,
      claims,
    }, {
      headers: {
        "Content-Disposition": `attachment; filename="nhis-claims-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  }

  // CSV / TSV format
  const headers = [
    "Claim Number",
    "Claim Type",
    "Status",
    "Patient Number",
    "Patient Name",
    "Patient Sex",
    "Patient Phone",
    "Facility",
    "Insurance Provider",
    "NHIS Number",
    "Invoice Number",
    "Claim Amount",
    "Approved Amount",
    "Primary Diagnosis Code",
    "Primary Diagnosis Name",
    "G-DRG Code",
    "G-DRG Name",
    "NHIS Tariff",
    "NHIS Validated",
    "Validation Notes",
    "Submitted At",
    "Approved At",
    "Created At",
  ];

  const rows = claims.map((c) => {
    const primaryDx = c.claimDiagnoses.find((d) => d.isPrimary) || c.claimDiagnoses[0];
    return [
      c.claimNumber,
      c.claimType,
      c.status,
      c.patient?.patientNumber || "",
      c.patient ? `${c.patient.firstName} ${c.patient.lastName}` : "",
      c.patient?.sex || "",
      c.patient?.phone || "",
      c.facility?.name || "",
      c.insuranceProvider?.name || "",
      c.nhisNumber || "",
      c.invoice?.invoiceNumber || "",
      c.claimAmount.toFixed(2),
      c.approvedAmount.toFixed(2),
      c.primaryDiagnosisCode || primaryDx?.diagnosisCode || "",
      c.primaryDiagnosisName || primaryDx?.diagnosisName || "",
      c.gdrgCode || "",
      c.gdrgName || "",
      c.nhisTariff ? c.nhisTariff.toFixed(2) : "",
      c.isNhisValidated ? "Yes" : "No",
      c.nhisValidationNotes || "",
      c.submittedAt ? new Date(c.submittedAt).toISOString() : "",
      c.approvedAt ? new Date(c.approvedAt).toISOString() : "",
      new Date(c.createdAt).toISOString(),
    ];
  });

  const csvLines = [
    headers.map((h) => escapeCSV(h, delimiter)).join(delimiter),
    ...rows.map((row) => row.map((cell) => escapeCSV(cell, delimiter)).join(delimiter)),
  ];
  const csvContent = csvLines.join("\n");

  const contentType = format === "tsv" ? "text/tab-separated-values" : "text/csv";
  const fileExt = format === "tsv" ? "tsv" : "csv";

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="nhis-claims-${new Date().toISOString().slice(0, 10)}.${fileExt}"`,
    },
  });
}

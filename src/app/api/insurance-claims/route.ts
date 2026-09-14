// =====================================================================
// API: /api/insurance-claims
//   GET  — list claims (filter by facility, status, patient, provider)
//   POST — create claim (status=draft). Auto-generate claim_number.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextClaimNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/insurance-claims?facilityId=...&status=...&patientId=...&providerId=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const providerId = url.searchParams.get("providerId");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (patientId) where.patientId = patientId;
  if (providerId) where.insuranceProviderId = providerId;

  const claims = await db.insuranceClaim.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, phone: true } },
      facility: { select: { id: true, name: true, code: true } },
      insuranceProvider: { select: { id: true, name: true, code: true } },
      invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true, status: true } },
    },
  });

  return NextResponse.json({ items: claims, count: claims.length });
}

// POST /api/insurance-claims
// body: { patientId, facilityId, insuranceProviderId, invoiceId, claimAmount,
//         claimType?, nhisNumber?, primaryDiagnosisCatalogId?, primaryDiagnosisCode?,
//         primaryDiagnosisName?, encounterId? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_CLAIM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const {
    patientId, facilityId, insuranceProviderId, invoiceId, claimAmount,
    claimType, nhisNumber,
    primaryDiagnosisCatalogId, primaryDiagnosisCode, primaryDiagnosisName,
    encounterId,
  } = body;

  if (!patientId || !facilityId || !insuranceProviderId || !invoiceId) {
    return NextResponse.json({ error: "patientId, facilityId, insuranceProviderId, invoiceId are required" }, { status: 400 });
  }

  // Validate invoice belongs to patient
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.patientId !== patientId) {
    return NextResponse.json({ error: "Invoice does not belong to the specified patient" }, { status: 400 });
  }
  if (invoice.balance <= 0) {
    return NextResponse.json({ error: "Invoice has no outstanding balance to claim against" }, { status: 400 });
  }

  // ── Auto-populate from finalized DischargeSummary ───────────────
  // When an encounterId is provided AND a finalized DischargeSummary
  // exists for it, pre-fill the primary diagnosis code/name and the
  // claim type (inpatient if the summary links to an admission, else
  // outpatient). Explicitly-provided body values take precedence —
  // this is purely a fallback for fields the caller omitted.
  let prefilledDxCode = primaryDiagnosisCode || null;
  let prefilledDxName = primaryDiagnosisName || null;
  let prefilledClaimType = claimType || null;
  let prefilledCatalogId = primaryDiagnosisCatalogId || null;
  let dischargeSummaryId: string | null = null;

  if (encounterId) {
    const finalizedSummary = await db.dischargeSummary.findFirst({
      where: {
        encounterId,
        status: "finalized",
        facilityId,
      },
      orderBy: { finalizedAt: "desc" },
      select: {
        id: true,
        primaryDiagnosisCode: true,
        primaryDiagnosisName: true,
        attendingClinicianId: true,
        admissionId: true,
      },
    });

    if (finalizedSummary) {
      dischargeSummaryId = finalizedSummary.id;
      if (!prefilledDxCode && finalizedSummary.primaryDiagnosisCode) {
        prefilledDxCode = finalizedSummary.primaryDiagnosisCode;
      }
      if (!prefilledDxName && finalizedSummary.primaryDiagnosisName) {
        prefilledDxName = finalizedSummary.primaryDiagnosisName;
      }
      if (!prefilledClaimType) {
        // If the discharge summary links to an Admission record, the
        // encounter was inpatient; otherwise it's an outpatient visit.
        prefilledClaimType = finalizedSummary.admissionId ? "inpatient" : "outpatient";
      }
    }
  }

  // NHIS validation — if the provider is NHIS, require ICD-10 + NHIS number
  const provider = await db.insuranceProvider.findUnique({ where: { id: insuranceProviderId } });
  const isNhis = provider?.code?.toUpperCase().includes("NHIS") || provider?.name?.toUpperCase().includes("NHIS") || false;

  let isNhisValidated = false;
  let validationNotes: string[] = [];

  if (isNhis) {
    if (!nhisNumber) validationNotes.push("NHIS membership number is required for NHIS claims");
    if (!prefilledDxCode) validationNotes.push("Primary ICD-10 diagnosis code is required for NHIS claims");
    if (!prefilledDxName) validationNotes.push("Primary diagnosis name is required for NHIS claims");
    isNhisValidated = validationNotes.length === 0;
  } else {
    // For non-NHIS, validation is optional but recommended
    if (!prefilledDxCode) validationNotes.push("Primary diagnosis code recommended (not required for non-NHIS)");
    isNhisValidated = true; // non-NHIS claims pass validation
  }

  // If catalog ID provided, snapshot the code + name from catalog
  let finalDxCode = prefilledDxCode;
  let finalDxName = prefilledDxName;
  let finalDxCatalogId = prefilledCatalogId || null;
  let gdrgCode: string | null = null;
  let gdrgName: string | null = null;
  let nhisTariff: number | null = null;

  if (finalDxCatalogId) {
    const catalogEntry = await db.diagnosisCatalog.findUnique({ where: { id: finalDxCatalogId } });
    if (catalogEntry) {
      finalDxCode = finalDxCode || catalogEntry.code;
      finalDxName = finalDxName || catalogEntry.name;
      gdrgCode = catalogEntry.nhisGdrgCode || null;
      gdrgName = catalogEntry.nhisGdrgName || null;
      nhisTariff = catalogEntry.nhisTariff || null;
    }
  } else if (finalDxCode && isNhis) {
    // No catalog ID provided but we have a code from the DischargeSummary
    // fallback — look up the catalog by code so we can still snapshot
    // the gDRG/tariff for the claim.
    const catalogByCode = await db.diagnosisCatalog.findFirst({
      where: { code: finalDxCode },
      select: {
        id: true, code: true, name: true,
        nhisGdrgCode: true, nhisGdrgName: true, nhisTariff: true,
      },
    });
    if (catalogByCode) {
      finalDxCatalogId = catalogByCode.id;
      finalDxName = finalDxName || catalogByCode.name;
      gdrgCode = catalogByCode.nhisGdrgCode || null;
      gdrgName = catalogByCode.nhisGdrgName || null;
      nhisTariff = catalogByCode.nhisTariff || null;
    }
  }

  const claimNumber = await nextClaimNumber(facilityId);

  const claim = await db.insuranceClaim.create({
    data: {
      patientId,
      facilityId,
      insuranceProviderId,
      invoiceId,
      encounterId: encounterId || null,
      claimNumber,
      claimAmount: Number(claimAmount) || invoice.balance,
      approvedAmount: 0,
      claimType: prefilledClaimType || "outpatient",
      nhisNumber: nhisNumber || null,
      primaryDiagnosisCode: finalDxCode || null,
      primaryDiagnosisName: finalDxName || null,
      primaryDiagnosisCatalogId: finalDxCatalogId || null,
      gdrgCode,
      gdrgName,
      nhisTariff,
      isNhisValidated,
      nhisValidationNotes: validationNotes.length > 0 ? validationNotes.join("; ") : null,
      status: "draft",
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      insuranceProvider: { select: { id: true, name: true, code: true } },
      invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true, status: true } },
    },
  });

  // If primary diagnosis was provided, create a ClaimDiagnosis record
  if (finalDxCode && finalDxName) {
    await db.claimDiagnosis.create({
      data: {
        claimId: claim.id,
        catalogId: finalDxCatalogId || null,
        diagnosisCode: finalDxCode,
        diagnosisName: finalDxName,
        diagnosisType: "primary",
        isPrimary: true,
      },
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "CLAIM_CREATED",
    resourceType: "insurance_claim",
    resourceId: claim.id,
    newValues: {
      claimNumber, patientId, invoiceId, insuranceProviderId,
      claimAmount: claim.claimAmount, isNhis, isNhisValidated,
      primaryDiagnosisCode: finalDxCode,
      claimType: prefilledClaimType || "outpatient",
      // Track whether this claim was auto-populated from a finalized
      // DischargeSummary — useful for audit / reconciliation.
      prepopulatedFromDischargeSummaryId: dischargeSummaryId,
    },
  });

  return NextResponse.json({ item: claim }, { status: 201 });
}

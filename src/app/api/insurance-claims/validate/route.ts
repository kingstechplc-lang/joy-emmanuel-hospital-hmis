// =====================================================================
// API: /api/insurance-claims/validate
//   POST — validate a claim before submission. Checks all required fields.
//   Returns: { isValid, completeness, issues: [...], warnings: [...] }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { claimId } = body;
  if (!claimId) return NextResponse.json({ error: "claimId is required" }, { status: 400 });

  const claim = await db.insuranceClaim.findUnique({
    where: { id: claimId },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } },
      insuranceProvider: { select: { id: true, name: true, code: true } },
      invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true, status: true } },
      claimDiagnoses: true,
      claimItems: true,
    },
  });

  if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 });

  const issues: string[] = [];
  const warnings: string[] = [];
  let checksTotal = 0;
  let checksPassed = 0;

  // 1. Patient identity
  checksTotal++;
  if (claim.patient) checksPassed++;
  else issues.push("Patient not linked to claim");

  // 2. Insurance provider
  checksTotal++;
  if (claim.insuranceProvider) checksPassed++;
  else issues.push("Insurance provider not specified");

  // 3. NHIS number (if NHIS provider)
  const isNhis = claim.insuranceProvider?.code?.toUpperCase().includes("NHIS") ||
    claim.insuranceProvider?.name?.toUpperCase().includes("NHIS") || false;
  if (isNhis) {
    checksTotal++;
    if (claim.nhisNumber) checksPassed++;
    else issues.push("NHIS membership number is required for NHIS claims");
  }

  // 4. Encounter
  checksTotal++;
  if (claim.encounterId) checksPassed++;
  else warnings.push("No encounter linked — recommended for clinical traceability");

  // 5. Primary diagnosis (ICD-10)
  checksTotal++;
  if (claim.primaryDiagnosisCode) checksPassed++;
  else issues.push("Primary ICD-10 diagnosis code is missing");

  checksTotal++;
  if (claim.primaryDiagnosisName) checksPassed++;
  else issues.push("Primary diagnosis name is missing");

  // 6. Invoice
  checksTotal++;
  if (claim.invoice) checksPassed++;
  else issues.push("Invoice not linked to claim");

  // 7. Claim amount
  checksTotal++;
  if (claim.claimAmount > 0) checksPassed++;
  else issues.push("Claim amount must be greater than zero");

  // 8. Claim items
  checksTotal++;
  if (claim.claimItems.length > 0) checksPassed++;
  else warnings.push("No structured claim items — claim may be rejected for missing service details");

  // 9. Duplicate check
  checksTotal++;
  if (claim.invoice) {
    const dupClaims = await db.insuranceClaim.count({
      where: { invoiceId: claim.invoiceId, id: { not: claim.id }, status: { notIn: ["cancelled", "rejected"] } },
    });
    if (dupClaims === 0) checksPassed++;
    else issues.push(`Possible duplicate: ${dupClaims} other active claim(s) exist for the same invoice`);
  } else {
    checksPassed++;
  }

  // 10. G-DRG code (NHIS)
  if (isNhis) {
    checksTotal++;
    if (claim.gdrgCode) checksPassed++;
    else warnings.push("G-DRG code not set — recommended for NHIS claims");
  }

  // 11. Upstream Claim Readiness — compose with the operational readiness engine
  // (does NOT duplicate the engine — calls the existing /api/claim-readiness logic)
  // Surfaces upstream failures (missing eligibility, attendance, coverage, etc.)
  // as additional issues so the user has a single view of all blocking problems.
  let upstreamReadiness: any = null;
  if (claim.encounterId) {
    try {
      const { evaluateReadiness } = await import("@/lib/nhis-workflow/claim-readiness-engine");
      // Build the context inline (mirrors /api/claim-readiness/route.ts buildReadinessContext)
      const encounter = await db.encounter.findUnique({
        where: { id: claim.encounterId },
        include: { facility: true },
      });
      if (encounter && encounter.facility.organizationId === session.user.organizationId) {
        const [patient, encounterCoverage, latestEligibility, attendanceVerification, diagnoses, invoice, insuranceClaim] = await Promise.all([
          db.patient.findUnique({
            where: { id: encounter.patientId },
            select: { id: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true },
          }),
          db.encounterCoverage.findFirst({
            where: { encounterId: claim.encounterId!, status: "active" },
            orderBy: { selectedAt: "desc" },
          }),
          db.eligibilityVerification.findFirst({
            where: { OR: [{ encounterId: claim.encounterId }, { patientId: encounter.patientId }] },
            orderBy: { verificationDate: "desc" },
          }),
          db.attendanceVerification.findUnique({ where: { encounterId: claim.encounterId! } }),
          db.diagnosis.findMany({
            where: { encounterId: claim.encounterId },
            select: { id: true, diagnosisCode: true, diagnosisName: true, isPrimary: true, codeSystem: true },
            orderBy: [{ isPrimary: "desc" }, { diagnosedAt: "asc" }],
          }),
          db.invoice.findFirst({
            where: { encounterId: claim.encounterId, status: { in: ["issued", "paid", "partially_paid"] } },
            orderBy: { issuedAt: "desc" },
            include: { items: { include: { service: true } } },
          }),
          db.insuranceClaim.findFirst({
            where: { encounterId: claim.encounterId },
            orderBy: { createdAt: "desc" },
            select: { id: true, claimNumber: true, status: true, isNhisValidated: true },
          }),
        ]);

        // Fetch patientInsurance if coverage links to one
        let patientInsurance: any = null;
        if (encounterCoverage?.patientInsuranceId) {
          patientInsurance = await db.patientInsurance.findUnique({
            where: { id: encounterCoverage.patientInsuranceId },
            include: { insuranceProvider: { select: { id: true, name: true, code: true, providerType: true } } },
          });
        }

        const ctx = {
          encounter: {
            id: encounter.id, encounterNumber: encounter.encounterNumber,
            encounterType: encounter.encounterType, startAt: encounter.startAt,
            status: encounter.status, patientId: encounter.patientId, facilityId: encounter.facilityId,
          },
          patient: patient ? {
            id: patient.id, firstName: patient.firstName, lastName: patient.lastName,
            dateOfBirth: patient.dateOfBirth, sex: patient.sex, phone: patient.phone,
          } : null,
          patientInsurance: patientInsurance ? {
            id: patientInsurance.id, membershipNumber: patientInsurance.membershipNumber,
            policyNumber: patientInsurance.policyNumber, status: patientInsurance.status,
            verificationStatus: patientInsurance.verificationStatus, coverageEnd: patientInsurance.coverageEnd,
            insuranceProvider: {
              id: patientInsurance.insuranceProvider.id, name: patientInsurance.insuranceProvider.name,
              code: patientInsurance.insuranceProvider.code, providerType: patientInsurance.insuranceProvider.providerType,
            },
          } : null,
          encounterCoverage: encounterCoverage ? {
            id: encounterCoverage.id, payerType: encounterCoverage.payerType, status: encounterCoverage.status,
            patientInsuranceId: encounterCoverage.patientInsuranceId, insuranceProviderId: encounterCoverage.insuranceProviderId,
          } : null,
          latestEligibility: latestEligibility ? {
            id: latestEligibility.id, verificationStatus: latestEligibility.verificationStatus,
            verificationMethod: latestEligibility.verificationMethod, verificationSource: latestEligibility.verificationSource,
            coverageEnd: latestEligibility.coverageEnd, expiresAt: latestEligibility.expiresAt,
            verificationDate: latestEligibility.verificationDate,
          } : null,
          attendanceVerification: attendanceVerification ? {
            id: attendanceVerification.id, method: attendanceVerification.method,
            code: attendanceVerification.code, verificationStatus: attendanceVerification.verificationStatus,
            verifiedAt: attendanceVerification.verifiedAt, expiresAt: attendanceVerification.expiresAt,
          } : null,
          diagnoses,
          services: invoice?.items?.filter((it: any) => it.service).map((it: any) => ({
            id: it.service.id, name: it.service.name, code: it.service.code,
            nhisServiceCode: it.service.nhisServiceCode, nhisPrice: it.service.nhisPrice,
            nhisEligible: it.service.nhisEligible,
          })) || [],
          medications: [],
          invoice: invoice ? {
            id: invoice.id, invoiceNumber: invoice.invoiceNumber, payerType: invoice.payerType,
            status: invoice.status, total: invoice.total, balance: invoice.balance,
            nhisResponsibility: invoice.nhisResponsibility, patientResponsibility: invoice.patientResponsibility,
          } : null,
          insuranceClaim: insuranceClaim ? {
            id: insuranceClaim.id, claimNumber: insuranceClaim.claimNumber,
            status: insuranceClaim.status, isNhisValidated: insuranceClaim.isNhisValidated,
          } : null,
        } as any;

        upstreamReadiness = evaluateReadiness(ctx);
        // Surface upstream failures as additional issues
        const upstreamFailures = upstreamReadiness.checks.filter((c: any) => c.status === "FAIL");
        for (const f of upstreamFailures) {
          issues.push(`[Upstream] ${f.label}: ${f.message}`);
        }
        // Surface upstream warnings
        const upstreamWarnings = upstreamReadiness.checks.filter((c: any) => c.status === "WARNING");
        for (const w of upstreamWarnings) {
          warnings.push(`[Upstream] ${w.label}: ${w.message}`);
        }
      }
    } catch (e: any) {
      // Non-fatal — if upstream readiness fails, just skip it
      console.error("[insurance-claims/validate] Upstream readiness check failed:", e?.message);
    }
  }

  const completeness = Math.round((checksPassed / checksTotal) * 100);
  const isValid = issues.length === 0;

  // Update claim validation status
  await db.insuranceClaim.update({
    where: { id: claimId },
    data: {
      isNhisValidated: isValid,
      nhisValidationNotes: issues.length > 0 ? issues.join("; ") : (warnings.length > 0 ? "Warnings: " + warnings.join("; ") : null),
    },
  });

  return NextResponse.json({
    isValid,
    completeness,
    issues,
    warnings,
    checksPassed,
    checksTotal,
    upstreamReadiness: upstreamReadiness ? {
      status: upstreamReadiness.status,
      readinessScore: upstreamReadiness.readinessScore,
      checksPassed: upstreamReadiness.checksPassed,
      checksTotal: upstreamReadiness.checksTotal,
      checksFailed: upstreamReadiness.checksFailed,
      failureSummary: upstreamReadiness.failureSummary,
    } : null,
  });
}

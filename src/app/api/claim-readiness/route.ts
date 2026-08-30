// =====================================================================
// API: /api/claim-readiness
//   GET  — list readiness assessments (filter by facility, status, encounter)
//   POST — evaluate readiness for an encounter (creates a new assessment row)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { evaluateReadiness, type ReadinessContext } from "@/lib/nhis-workflow/claim-readiness-engine";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Gather all the data the engine needs to evaluate readiness for an encounter.
async function buildReadinessContext(
  encounterId: string,
  organizationId: string,
): Promise<ReadinessContext | null> {
  const encounter = await db.encounter.findUnique({
    where: { id: encounterId },
    include: { facility: true },
  });
  if (!encounter) return null;
  if (encounter.facility.organizationId !== organizationId) return null;

  const patient = await db.patient.findUnique({
    where: { id: encounter.patientId },
    select: {
      id: true, firstName: true, lastName: true,
      dateOfBirth: true, sex: true, phone: true,
    },
  });

  // Encounter coverage (latest active)
  const encounterCoverage = await db.encounterCoverage.findFirst({
    where: { encounterId, status: "active" },
    orderBy: { selectedAt: "desc" },
  });

  // Patient insurance (linked via coverage, or most recent active)
  // Using `any` here because the conditional findUnique/findFirst typing gets messy with relations
  let patientInsurance: any = null;
  if (encounterCoverage?.patientInsuranceId) {
    patientInsurance = await db.patientInsurance.findUnique({
      where: { id: encounterCoverage.patientInsuranceId },
      include: { insuranceProvider: { select: { id: true, name: true, code: true, providerType: true } } },
    });
  } else {
    patientInsurance = await db.patientInsurance.findFirst({
      where: { patientId: encounter.patientId, status: "active" },
      include: { insuranceProvider: { select: { id: true, name: true, code: true, providerType: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  // Latest eligibility verification for this encounter (or patient if no encounter-scoped)
  const latestEligibility = await db.eligibilityVerification.findFirst({
    where: {
      OR: [
        { encounterId },
        { patientId: encounter.patientId },
      ],
    },
    orderBy: { verificationDate: "desc" },
  });

  // Attendance verification for this encounter
  const attendanceVerification = await db.attendanceVerification.findUnique({
    where: { encounterId },
  });

  // Diagnoses
  const diagnoses = await db.diagnosis.findMany({
    where: { encounterId },
    select: {
      id: true, diagnosisCode: true, diagnosisName: true,
      isPrimary: true, codeSystem: true,
    },
    orderBy: [{ isPrimary: "desc" }, { diagnosedAt: "asc" }],
  });

  // Services from invoice items
  const invoice = await db.invoice.findFirst({
    where: { encounterId, status: { in: ["issued", "paid", "partially_paid"] } },
    orderBy: { issuedAt: "desc" },
    include: { items: { include: { service: true } } },
  });

  const services = invoice?.items
    ?.filter(it => it.service)
    .map(it => ({
      id: it.service!.id,
      name: it.service!.name,
      code: it.service!.code,
      nhisServiceCode: it.service!.nhisServiceCode,
      nhisPrice: it.service!.nhisPrice,
      nhisEligible: it.service!.nhisEligible,
    })) || [];

  // Medications from prescriptions
  const prescriptions = await db.prescription.findMany({
    where: { encounterId },
    include: {
      items: {
        include: {
          medication: {
            select: {
              id: true, genericName: true,
              nhisCode: true, nhisTariffAmount: true,
            },
          },
        },
        where: { dispensedQuantity: { gt: 0 } },
      },
    },
  });
  const medications = prescriptions.flatMap(p => p.items.map(pi => ({
    id: pi.medication.id,
    genericName: pi.medication.genericName,
    nhisCode: pi.medication.nhisCode,
    nhisTariffAmount: pi.medication.nhisTariffAmount,
  })));

  // Insurance claim if exists
  const insuranceClaim = await db.insuranceClaim.findFirst({
    where: { encounterId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, claimNumber: true, status: true, isNhisValidated: true,
    },
  });

  return {
    encounter: {
      id: encounter.id,
      encounterNumber: encounter.encounterNumber,
      encounterType: encounter.encounterType,
      startAt: encounter.startAt,
      status: encounter.status,
      patientId: encounter.patientId,
      facilityId: encounter.facilityId,
    },
    patient: patient ? {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      sex: patient.sex,
      phone: patient.phone,
    } : null,
    patientInsurance: patientInsurance ? {
      id: patientInsurance.id,
      membershipNumber: patientInsurance.membershipNumber,
      policyNumber: patientInsurance.policyNumber,
      status: patientInsurance.status,
      verificationStatus: patientInsurance.verificationStatus,
      coverageEnd: patientInsurance.coverageEnd,
      insuranceProvider: {
        id: patientInsurance.insuranceProvider.id,
        name: patientInsurance.insuranceProvider.name,
        code: patientInsurance.insuranceProvider.code,
        providerType: patientInsurance.insuranceProvider.providerType,
      },
    } : null,
    encounterCoverage: encounterCoverage ? {
      id: encounterCoverage.id,
      payerType: encounterCoverage.payerType,
      status: encounterCoverage.status,
      patientInsuranceId: encounterCoverage.patientInsuranceId,
      insuranceProviderId: encounterCoverage.insuranceProviderId,
    } : null,
    latestEligibility: latestEligibility ? {
      id: latestEligibility.id,
      verificationStatus: latestEligibility.verificationStatus,
      verificationMethod: latestEligibility.verificationMethod,
      verificationSource: latestEligibility.verificationSource,
      coverageEnd: latestEligibility.coverageEnd,
      expiresAt: latestEligibility.expiresAt,
      verificationDate: latestEligibility.verificationDate,
    } : null,
    attendanceVerification: attendanceVerification ? {
      id: attendanceVerification.id,
      method: attendanceVerification.method,
      code: attendanceVerification.code,
      verificationStatus: attendanceVerification.verificationStatus,
      verifiedAt: attendanceVerification.verifiedAt,
      expiresAt: attendanceVerification.expiresAt,
    } : null,
    diagnoses,
    services,
    medications,
    invoice: invoice ? {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      payerType: invoice.payerType,
      status: invoice.status,
      total: invoice.total,
      balance: invoice.balance,
      nhisResponsibility: invoice.nhisResponsibility,
      patientResponsibility: invoice.patientResponsibility,
    } : null,
    insuranceClaim: insuranceClaim ? {
      id: insuranceClaim.id,
      claimNumber: insuranceClaim.claimNumber,
      status: insuranceClaim.status,
      isNhisValidated: insuranceClaim.isNhisValidated,
    } : null,
  };
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLAIM_READINESS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const encounterId = url.searchParams.get("encounterId");
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (encounterId) where.encounterId = encounterId;
  if (status) where.status = status;

  const items = await db.claimReadinessAssessment.findMany({
    where,
    orderBy: { evaluatedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLAIM_READINESS_EVALUATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { encounterId } = body;
  if (!encounterId) {
    return NextResponse.json({ error: "encounterId is required" }, { status: 400 });
  }

  const ctx = await buildReadinessContext(encounterId, session.user.organizationId);
  if (!ctx) {
    return NextResponse.json({ error: "Encounter not found or not in your organization" }, { status: 404 });
  }

  // Run the pure-function engine
  const result = evaluateReadiness(ctx);

  // Persist a new assessment row (history preserved — never overwritten, section 13)
  const patientName = ctx.patient ? `${ctx.patient.firstName} ${ctx.patient.lastName}`.trim() : null;

  const assessment = await db.claimReadinessAssessment.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: ctx.encounter.facilityId,
      encounterId,
      patientId: ctx.encounter.patientId,
      patientName,
      status: result.status,
      readinessScore: result.readinessScore,
      checksTotal: result.checksTotal,
      checksPassed: result.checksPassed,
      checksFailed: result.checksFailed,
      checksWarning: result.checksWarning,
      checks: JSON.stringify(result.checks),
      failureSummary: result.failureSummary || null,
      warningsSummary: result.warningsSummary || null,
      coverageId: result.coverageId,
      eligibilityVerificationId: result.eligibilityVerificationId,
      attendanceVerificationId: result.attendanceVerificationId,
      invoiceId: result.invoiceId,
      insuranceClaimId: result.insuranceClaimId,
      evaluatedById: session.user.id,
      evaluatedByName: session.user.name || session.user.username,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: ctx.encounter.facilityId,
    action: "CLAIM_READINESS_EVALUATED",
    resourceType: "claimReadinessAssessment",
    resourceId: assessment.id,
    newValues: {
      encounterId,
      status: result.status,
      readinessScore: result.readinessScore,
      checksPassed: result.checksPassed,
      checksFailed: result.checksFailed,
    },
  });

  return NextResponse.json({ item: assessment, result }, { status: 201 });
}

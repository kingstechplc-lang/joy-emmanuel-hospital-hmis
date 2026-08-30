// =====================================================================
// API: /api/encounter-coverage
//   GET  — list encounter coverage records (filter by facility, payerType, patientInsuranceId)
//   POST — create or upsert encounter coverage (one coverage record per encounter)
//
// This is the authoritative source of truth for "this encounter is NHIS-covered"
// (distinct from "this patient HAS NHIS" which is PatientInsurance).
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const ALLOWED_PAYER_TYPES = new Set([
  "self_pay", "nhis", "private_insurance", "corporate", "employer", "government", "other",
]);

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_COVERAGE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const encounterId = url.searchParams.get("encounterId");
  const payerType = url.searchParams.get("payerType");
  const patientInsuranceId = url.searchParams.get("patientInsuranceId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (encounterId) where.encounterId = encounterId;
  if (payerType) where.payerType = payerType;
  if (patientInsuranceId) where.patientInsuranceId = patientInsuranceId;

  const items = await db.encounterCoverage.findMany({
    where,
    orderBy: { selectedAt: "desc" },
    take: limit,
    include: {
      encounter: {
        select: {
          id: true, encounterNumber: true, encounterType: true, startAt: true, status: true,
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_COVERAGE_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    encounterId, payerType, patientInsuranceId, insuranceProviderId, insurancePlanId,
    insuranceAuthorizationId, coveragePercentage, patientCopay,
    patientResponsibility, payerResponsibility, notes,
  } = body;

  // --- Validation ---
  if (!encounterId) return NextResponse.json({ error: "encounterId is required" }, { status: 400 });
  if (!payerType || !ALLOWED_PAYER_TYPES.has(payerType)) {
    return NextResponse.json({ error: `Invalid payerType. Allowed: ${[...ALLOWED_PAYER_TYPES].join(", ")}` }, { status: 400 });
  }

  // Fetch encounter with facility for org check
  const encounter = await db.encounter.findUnique({
    where: { id: encounterId },
    include: { facility: true },
  });
  if (!encounter) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
  if (encounter.facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden — encounter belongs to different organization" }, { status: 403 });
  }

  // If payerType is insurance-based, validate patientInsuranceId
  if (["nhis", "private_insurance", "corporate"].includes(payerType)) {
    if (!patientInsuranceId) {
      return NextResponse.json({
        error: `patientInsuranceId is required when payerType is '${payerType}'`,
      }, { status: 400 });
    }
    const pi = await db.patientInsurance.findUnique({ where: { id: patientInsuranceId } });
    if (!pi || pi.patientId !== encounter.patientId) {
      return NextResponse.json({ error: "PatientInsurance not found or does not belong to this patient" }, { status: 400 });
    }
  }

  // Validate insuranceProviderId if provided
  if (insuranceProviderId) {
    const prov = await db.insuranceProvider.findUnique({ where: { id: insuranceProviderId } });
    if (!prov || prov.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "InsuranceProvider not found" }, { status: 400 });
    }
  }

  // --- Compute coverage if not provided ---
  let computedCoveragePct = coveragePercentage ?? 0;
  let computedPatientResp = patientResponsibility ?? 0;
  let computedPayerResp = payerResponsibility ?? 0;

  if (patientInsuranceId && insurancePlanId) {
    const plan = await db.insurancePlan.findUnique({ where: { id: insurancePlanId } });
    if (plan) {
      computedCoveragePct = computedCoveragePct || plan.coveragePercentage || 0;
      if (!patientResponsibility && !payerResponsibility) {
        // Will be computed against invoice later — for now store zero
      }
    }
  }

  // --- Upsert (one coverage per encounter) ---
  // If a coverage record already exists for this encounter, supersede it
  const existing = await db.encounterCoverage.findUnique({
    where: { encounterId },
  });

  let item;
  if (existing) {
    // Mark existing as superseded, then create new
    await db.encounterCoverage.update({
      where: { id: existing.id },
      data: { status: "superseded" },
    });

    item = await db.encounterCoverage.create({
      data: {
        organizationId: session.user.organizationId,
        facilityId: encounter.facilityId,
        encounterId,
        payerType,
        patientInsuranceId: patientInsuranceId || null,
        insuranceProviderId: insuranceProviderId || null,
        insurancePlanId: insurancePlanId || null,
        insuranceAuthorizationId: insuranceAuthorizationId || null,
        coveragePercentage: computedCoveragePct,
        patientCopay: patientCopay || 0,
        patientResponsibility: computedPatientResp,
        payerResponsibility: computedPayerResp,
        status: "active",
        selectedById: session.user.id,
        selectedByName: session.user.name || session.user.username,
        notes: notes || null,
      },
    });
  } else {
    item = await db.encounterCoverage.create({
      data: {
        organizationId: session.user.organizationId,
        facilityId: encounter.facilityId,
        encounterId,
        payerType,
        patientInsuranceId: patientInsuranceId || null,
        insuranceProviderId: insuranceProviderId || null,
        insurancePlanId: insurancePlanId || null,
        insuranceAuthorizationId: insuranceAuthorizationId || null,
        coveragePercentage: computedCoveragePct,
        patientCopay: patientCopay || 0,
        patientResponsibility: computedPatientResp,
        payerResponsibility: computedPayerResp,
        status: "active",
        selectedById: session.user.id,
        selectedByName: session.user.name || session.user.username,
        notes: notes || null,
      },
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: encounter.facilityId,
    action: "ENCOUNTER_COVERAGE_SELECTED",
    resourceType: "encounterCoverage",
    resourceId: item.id,
    newValues: {
      encounterId, payerType, patientInsuranceId, insuranceProviderId,
      coveragePercentage: computedCoveragePct, previousCoverageId: existing?.id,
    },
  });

  return NextResponse.json({ item }, { status: existing ? 200 : 201 });
}

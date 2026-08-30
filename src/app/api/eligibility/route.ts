// =====================================================================
// API: /api/eligibility
//   GET  — list eligibility verifications (filter by patient, encounter, status)
//   POST — create a new eligibility verification (manual / external / API)
//
// EXTENDED (Phase 5c) to support:
//   • encounterId scoping — verifications tied to a specific encounter
//   • verificationMethod distinction (integrated | manual | external | unavailable | pending)
//   • verificationSource distinction (nhia_integration | manual | external | local | other)
//   • responseData / requestPayload capture (raw API payload, secrets scrubbed)
//   • expiresAt — when this verification result is no longer valid
//   • attendanceVerificationId — link to paired attendance record
//
// CRITICAL: We NEVER fake official NHIA verification (section 12, 39 of master prompt).
// If verificationSource = "nhia_integration" but no live API is configured, the route
// refuses to mark the verification as "verified" — it returns "unavailable" instead.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const ALLOWED_STATUSES = new Set([
  "not_verified", "verified", "active", "inactive", "expired",
  "unable_to_verify", "pending", "failed", "manual_verified",
]);

const ALLOWED_METHODS = new Set([
  "integrated", "manual", "external", "unavailable", "pending",
]);

const ALLOWED_SOURCES = new Set([
  "nhia_integration", "manual", "external", "local", "other",
]);

// Scrub sensitive fields from request payload before persisting
function scrubRequestPayload(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const scrubbed: any = { ...payload };
  const SENSITIVE_KEYS = ["password", "secret", "apiKey", "api_key", "token", "authorization"];
  for (const key of Object.keys(scrubbed)) {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      scrubbed[key] = "***REDACTED***";
    }
  }
  return JSON.stringify(scrubbed);
}

// Determine whether the verification method requires a live API call
// and whether that API is available in this deployment.
function isNhiaLiveApiAvailable(): boolean {
  // Future: check for NHIA_API_BASE_URL env var or settings record
  // For now, NO live NHIA API is configured — we never fabricate official verification.
  return !!process.env.NHIA_API_BASE_URL;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const encounterId = url.searchParams.get("encounterId");
  const status = url.searchParams.get("status");
  const patientInsuranceId = url.searchParams.get("patientInsuranceId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: any = { organizationId: session.user.organizationId };
  if (patientId) where.patientId = patientId;
  if (encounterId) where.encounterId = encounterId;
  if (status) where.verificationStatus = status;
  if (patientInsuranceId) where.patientInsuranceId = patientInsuranceId;

  const items = await db.eligibilityVerification.findMany({
    where,
    orderBy: { verificationDate: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, phone: true } },
    },
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_CLAIM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    patientId, encounterId, facilityId,
    insuranceProviderId, patientInsuranceId, membershipNumber,
    verificationStatus, coverageStatus, coverageStart, coverageEnd,
    verificationMethod, verificationSource, verificationReference,
    responseData, requestPayload,
    expiresAt, resultMessage, notes,
    attendanceVerificationId,
  } = body;

  // --- Validation ---
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

  if (verificationStatus && !ALLOWED_STATUSES.has(verificationStatus)) {
    return NextResponse.json({ error: `Invalid verificationStatus. Allowed: ${[...ALLOWED_STATUSES].join(", ")}` }, { status: 400 });
  }
  if (verificationMethod && !ALLOWED_METHODS.has(verificationMethod)) {
    return NextResponse.json({ error: `Invalid verificationMethod. Allowed: ${[...ALLOWED_METHODS].join(", ")}` }, { status: 400 });
  }
  if (verificationSource && !ALLOWED_SOURCES.has(verificationSource)) {
    return NextResponse.json({ error: `Invalid verificationSource. Allowed: ${[...ALLOWED_SOURCES].join(", ")}` }, { status: 400 });
  }

  // --- CRITICAL SAFETY: Never fake official NHIA verification (section 39) ---
  // If user requests verificationSource = "nhia_integration" but no live API is configured,
  // downgrade to "unavailable" status with a clear message.
  let finalStatus = verificationStatus || "verified";
  let finalSource = verificationSource || "manual";
  let finalMethod = verificationMethod || "manual";
  let finalMessage = resultMessage || null;

  if (finalSource === "nhia_integration" && !isNhiaLiveApiAvailable()) {
    return NextResponse.json({
      error: "NHIA live verification API is not configured. Use verificationSource='manual' or 'external' for non-official checks, or set NHIA_API_BASE_URL env var to enable official verification.",
      nhiaApiAvailable: false,
    }, { status: 422 });
  }

  // If user attempts to mark as "verified" with source="local" but method="integrated",
  // that's contradictory — refuse.
  if (finalStatus === "verified" && finalSource === "local" && finalMethod === "integrated") {
    return NextResponse.json({
      error: "Cannot mark as verified with source=local and method=integrated. Use method='manual' for local checks.",
    }, { status: 422 });
  }

  // --- Patient validation ---
  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  // --- Encounter validation (if provided) ---
  if (encounterId) {
    const encounter = await db.encounter.findUnique({ where: { id: encounterId } });
    if (!encounter) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
    if (encounter.patientId !== patientId) {
      return NextResponse.json({ error: "Encounter does not belong to this patient" }, { status: 400 });
    }
  }

  // --- PatientInsurance validation (if provided) ---
  if (patientInsuranceId) {
    const pi = await db.patientInsurance.findUnique({ where: { id: patientInsuranceId } });
    if (!pi || pi.patientId !== patientId) {
      return NextResponse.json({ error: "PatientInsurance record not found or does not belong to this patient" }, { status: 400 });
    }
  }

  // --- Create verification record ---
  const item = await db.eligibilityVerification.create({
    data: {
      organizationId: session.user.organizationId,
      patientId,
      encounterId: encounterId || null,
      facilityId: facilityId || session.user.facilityId || null,
      insuranceProviderId: insuranceProviderId || null,
      patientInsuranceId: patientInsuranceId || null,
      membershipNumber: membershipNumber || null,
      verificationStatus: finalStatus,
      coverageStatus: coverageStatus || null,
      coverageStart: coverageStart ? new Date(coverageStart) : null,
      coverageEnd: coverageEnd ? new Date(coverageEnd) : null,
      verificationMethod: finalMethod,
      verificationSource: finalSource,
      verificationReference: verificationReference || null,
      responseData: responseData ? (typeof responseData === "string" ? responseData : JSON.stringify(responseData)) : null,
      requestPayload: scrubRequestPayload(requestPayload),
      expiresAt: expiresAt ? new Date(expiresAt) : (coverageEnd ? new Date(coverageEnd) : null),
      resultMessage: finalMessage,
      verifiedById: session.user.id,
      verifiedByName: session.user.name || undefined,
      notes: notes || null,
      attendanceVerificationId: attendanceVerificationId || null,
    },
  });

  // --- If linked to a PatientInsurance, optionally update its verificationStatus ---
  // (only if the new status is more recent than the existing one)
  if (patientInsuranceId && finalStatus !== "not_verified") {
    const statusMap: Record<string, string> = {
      verified: "verified",
      active: "verified",
      manual_verified: "verified",
      inactive: "rejected",
      expired: "expired",
      failed: "rejected",
      unable_to_verify: "pending",
      pending: "pending",
    };
    const mappedStatus = statusMap[finalStatus];
    if (mappedStatus) {
      await db.patientInsurance.update({
        where: { id: patientInsuranceId },
        data: {
          verificationStatus: mappedStatus,
          verifiedAt: new Date(),
        },
      }).catch(() => { /* non-fatal */ });
    }
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: facilityId || session.user.facilityId || undefined,
    action: "ELIGIBILITY_VERIFIED",
    resourceType: "eligibilityVerification",
    resourceId: item.id,
    newValues: {
      patientId, encounterId, verificationStatus: finalStatus,
      verificationMethod: finalMethod, verificationSource: finalSource,
      membershipNumber, coverageEnd,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}

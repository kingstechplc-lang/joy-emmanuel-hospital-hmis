// =====================================================================
// API: /api/portal/auth/request-otp
//   POST — request a one-time password sent via SMS to the patient's phone
//
// Body: { phone: string }
//
// Logic:
//   1. Canonicalize the phone number (handles 0XXX, +233XXX, 233XXX, etc.)
//   2. Look up all Patient records across all orgs with that phone
//      (most deployments are single-org so this is 1 query)
//   3. If exactly one Patient matches → resolve orgId, issue + send OTP
//   4. If zero patients match → return 404 "no patient with this phone"
//   5. If multiple patients match across orgs → for v1, pick the org
//      with the most recent visit (last encounter startAt desc). Multi-org
//      deployments should override this by passing an X-Org-Slug header.
//   6. Rate-limit: 60s between OTPs for the same phone, 5 per hour
//
// Returns: { sent: true } on success. NEVER reveals whether the phone is
// registered in the system to prevent phone-enumeration attacks — except
// for the explicit 404 case where the patient self-registration flow
// benefits from knowing "this phone isn't registered yet". This is a
// deliberate v1 tradeoff; we'll re-evaluate before going to production.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canonicalizePhone, isValidPhone } from "@/lib/patient-portal/otp";
import { issueAndSendOtp } from "@/lib/patient-portal/otp";
import { getClientIp, getUserAgent } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawPhone = String(body?.phone || "").trim();
  if (!rawPhone) {
    return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
  }

  const phone = canonicalizePhone(rawPhone);
  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
  }

  // ── Find matching Patient(s) across all orgs ────────────────────
  // Patient.phone is stored as a free-text field (varies by data entry).
  // We do an exact match on the canonicalized form first (covers most
  // cases where the phone was entered cleanly), then fall back to a
  // suffix match on the last 9 digits (catches "0241234567" vs
  // "+233241234567" mismatches in legacy data).
  const last9 = phone.slice(-9);

  // First: exact match on canonical form
  let patients = await db.patient.findMany({
    where: { phone: phone },
    select: { id: true, organizationId: true, firstName: true, lastName: true },
    take: 50,
  });

  // If no exact matches, try suffix match (last 9 digits)
  if (patients.length === 0) {
    patients = await db.patient.findMany({
      where: { phone: { endsWith: last9 } },
      select: { id: true, organizationId: true, firstName: true, lastName: true },
      take: 50,
    });
  }

  if (patients.length === 0) {
    // v1 decision: tell the user their phone isn't registered. This
    // enables the self-service flow where the patient goes to records
    // desk to register. We can re-evaluate this for security later.
    return NextResponse.json(
      {
        error:
          "No patient record found for this phone number. Please visit the hospital's Records Desk to register your phone number.",
      },
      { status: 404 }
    );
  }

  // Resolve the organization to use
  let orgId: string;
  if (patients.length === 1) {
    orgId = patients[0].organizationId;
  } else {
    // Multiple patients across orgs (or within one org — same phone on
    // two patients, e.g., a child + parent with the same contact)
    // For v1: pick the org that has the most recent encounter for any
    // of the matched patients
    const distinctOrgIds = Array.from(new Set(patients.map((p) => p.organizationId)));
    if (distinctOrgIds.length === 1) {
      orgId = distinctOrgIds[0];
    } else {
      // Multi-org case —find the org with the most recent encounter
      const mostRecent = await db.encounter.findFirst({
        where: { patientId: { in: patients.map((p) => p.id) } },
        orderBy: { startAt: "desc" },
        select: { patientId: true },
      });
      const winner = patients.find((p) => p.id === mostRecent?.patientId);
      orgId = winner?.organizationId || distinctOrgIds[0];
    }
  }

  // ── Rate limit: 60s between OTPs, 5 per hour ────────────────────
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentOtps = await db.patientOtp.count({
    where: {
      organizationId: orgId,
      phone,
      createdAt: { gt: oneMinuteAgo },
    },
  });
  if (recentOtps > 0) {
    return NextResponse.json(
      { error: "Please wait 60 seconds before requesting a new code" },
      { status: 429 }
    );
  }
  const hourlyOtps = await db.patientOtp.count({
    where: {
      organizationId: orgId,
      phone,
      createdAt: { gt: oneHourAgo },
    },
  });
  if (hourlyOtps >= 5) {
    return NextResponse.json(
      { error: "Too many code requests. Please try again in an hour." },
      { status: 429 }
    );
  }

  // ── Issue + send OTP ─────────────────────────────────────────────
  const ipAddress = getClientIp(req) || undefined;
  const userAgent = getUserAgent(req) || undefined;

  try {
    const result = await issueAndSendOtp({
      phone,
      organizationId: orgId,
      ipAddress,
      userAgent,
    });

    if (!result.smsOk) {
      return NextResponse.json(
        { error: "Failed to send SMS — please try again" },
        { status: 500 }
      );
    }

    // In dev mode, the response includes the OTP code so testing is
    // possible without checking the server logs. Production gateways
    // never populate devModeOtp.
    return NextResponse.json({
      sent: true,
      // Always include the otpId so a dev dashboard can correlate
      otpId: result.otpId,
      ...(result.devModeOtp ? { devModeOtp: result.devModeOtp } : {}),
    });
  } catch (e: any) {
    console.error("[POST /api/portal/auth/request-otp]", e);
    return NextResponse.json(
      { error: "Failed to send code — please try again" },
      { status: 500 }
    );
  }
}

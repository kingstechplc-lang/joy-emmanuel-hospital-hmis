// =====================================================================
// API: /api/portal/auth/login-with-card
//   POST — Ghana Card + DOB + patient number 3-factor verification
//
// Body: { ghanaCardNumber, dateOfBirth, patientNumber }
//
// Returns:
//   200 { token, account } on success
//   401 { error, code } on mismatch — error message is generic ("don't
//        match our records") so attackers can't enumerate which factor
//        was wrong
//   400 { error, code } on invalid input format
//   403 { error, code } on locked / suspended account
//   429 { error } on rate limit (max 10 failed attempts per IP per hour)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loginWithGhanaCard } from "@/lib/patient-portal/auth";
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

  const ghanaCardNumber = String(body?.ghanaCardNumber || "").trim();
  const dateOfBirth = String(body?.dateOfBirth || "").trim();
  const patientNumber = String(body?.patientNumber || "").trim();

  if (!ghanaCardNumber || !dateOfBirth || !patientNumber) {
    return NextResponse.json(
      { error: "Ghana Card number, date of birth, and patient number are all required." },
      { status: 400 }
    );
  }

  // ── Rate limiting — 10 attempts per IP per hour ──────────────────
  const ipAddress = getClientIp(req) || "unknown";
  const userAgent = getUserAgent(req) || undefined;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentFailedAttempts = await db.auditLog.count({
    where: {
      action: "PATIENT_PORTAL_LOGIN_FAILED",
      ipAddress: ipAddress !== "unknown" ? ipAddress : null,
      createdAt: { gt: oneHourAgo },
    },
  });

  if (recentFailedAttempts >= 10) {
    await db.auditLog.create({
      data: {
        organizationId: null,
        facilityId: null,
        action: "PATIENT_PORTAL_LOGIN_RATE_LIMITED",
        actionCategory: "AUTH",
        severity: "warning",
        source: "patient_portal",
        resourceType: "patient_portal_account",
        newValues: { ghanaCardNumber, patientNumber, ipAddress },
        ipAddress: ipAddress !== "unknown" ? ipAddress : null,
        userAgent: userAgent || null,
        reason: "Rate limit hit — too many failed login attempts from this IP",
      },
    }).catch(() => {});

    return NextResponse.json(
      { error: "Too many failed attempts. Please try again in an hour or contact the hospital." },
      { status: 429 }
    );
  }

  // ── Attempt the 3-factor verification ────────────────────────────
  const result = await loginWithGhanaCard({
    ghanaCardNumber,
    dateOfBirth,
    patientNumber,
    ipAddress,
    userAgent,
  });

  if (!result.ok) {
    // Audit the failed attempt
    try {
      await db.auditLog.create({
        data: {
          organizationId: null,
          facilityId: null,
          action: "PATIENT_PORTAL_LOGIN_FAILED",
          actionCategory: "AUTH",
          severity: "warning",
          source: "patient_portal",
          resourceType: "patient_portal_account",
          newValues: {
            ghanaCardNumber,
            patientNumber,
            reason: result.reason,
            code: result.code,
          },
          ipAddress: ipAddress !== "unknown" ? ipAddress : null,
          userAgent: userAgent || null,
          reason: result.reason || "Login failed",
        },
      });
    } catch (e) {
      console.error("[portal login-failed] audit log error:", e);
    }

    const code = result.code;
    let status = 401;
    if (code === "INVALID_INPUT") status = 400;
    else if (code === "LOCKED") status = 403;

    return NextResponse.json(
      { error: result.reason, code },
      { status }
    );
  }

  // ── Success — audit the login ────────────────────────────────────
  try {
    // Look up the patient's org for the audit log
    let orgId: string | null = null;
    if (result.account?.patientId) {
      const patient = await db.patient.findUnique({
        where: { id: result.account.patientId },
        select: { organizationId: true },
      });
      orgId = patient?.organizationId || null;
    }

    await db.auditLog.create({
      data: {
        userId: null,
        organizationId: orgId,
        facilityId: null,
        action: "PATIENT_PORTAL_LOGIN",
        actionCategory: "AUTH",
        severity: "notice",
        source: "patient_portal",
        resourceType: "patient_portal_account",
        resourceId: result.account?.id,
        newValues: {
          ghanaCardNumber: result.account?.ghanaCardNumber,
          patientId: result.account?.patientId,
          authMethod: "ghana_card",
        },
        ipAddress: ipAddress !== "unknown" ? ipAddress : null,
        userAgent: userAgent || null,
        reason: "Patient logged in via Ghana Card",
      },
    });
  } catch (e) {
    console.error("[portal login] audit log failed:", e);
  }

  return NextResponse.json({
    token: result.token,
    account: result.account,
  });
}

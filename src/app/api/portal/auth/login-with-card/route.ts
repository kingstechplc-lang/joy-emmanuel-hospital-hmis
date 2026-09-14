// =====================================================================
// API: /api/portal/auth/login-with-card
//   POST — Ghana Card + DOB + patient number 3-factor verification
//
// Body: { ghanaCardNumber, dateOfBirth, patientNumber }
//
// Returns:
//   200 { token, account } on success
//   401 { error, code } on mismatch — error message is generic so
//        attackers can't enumerate which factor was wrong
//   400 { error, code } on invalid input format
//   403 { error, code } on locked / suspended account
//   429 { error } on rate limit (max 10 failed attempts per IP per hour)
//   500 { error } on any unexpected server error (NEVER returns empty
//        body — this was the root cause of the "Unexpected end of JSON
//        input" client error)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loginWithGhanaCard } from "@/lib/patient-portal/auth";
import { getClientIp, getUserAgent } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  // ── Top-level try/catch — guarantees we ALWAYS return JSON, never
  //    an empty body or HTML error page. This is critical because the
  //    client calls `await res.json()` which would throw on empty body.
  try {
    return await handleLogin(req);
  } catch (e: any) {
    console.error("[POST /api/portal/auth/login-with-card] UNHANDLED ERROR:", e);
    return NextResponse.json(
      {
        error: "A server error occurred during login. Please try again. If the problem persists, contact the hospital.",
        code: "SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}

async function handleLogin(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_INPUT" }, { status: 400 });
  }

  const ghanaCardNumber = String(body?.ghanaCardNumber || "").trim();
  const dateOfBirth = String(body?.dateOfBirth || "").trim();
  const patientNumber = String(body?.patientNumber || "").trim();

  if (!ghanaCardNumber || !dateOfBirth || !patientNumber) {
    return NextResponse.json(
      {
        error: "Ghana Card number, date of birth, and patient number are all required.",
        code: "INVALID_INPUT",
      },
      { status: 400 }
    );
  }

  // ── Rate limiting — 10 attempts per IP per hour ──────────────────
  const ipAddress = getClientIp(req) || "unknown";
  const userAgent = getUserAgent(req) || undefined;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  let recentFailedAttempts = 0;
  try {
    recentFailedAttempts = await db.auditLog.count({
      where: {
        action: "PATIENT_PORTAL_LOGIN_FAILED",
        ipAddress: ipAddress !== "unknown" ? ipAddress : null,
        createdAt: { gt: oneHourAgo },
      },
    });
  } catch (e) {
    console.error("[portal login] rate-limit check failed:", e);
    // Don't block login if rate-limit check fails — fail open
  }

  if (recentFailedAttempts >= 10) {
    try {
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
      });
    } catch (e) {
      console.error("[portal login] rate-limit audit failed:", e);
    }

    return NextResponse.json(
      {
        error: "Too many failed attempts. Please try again in an hour or contact the hospital.",
        code: "RATE_LIMITED",
      },
      { status: 429 }
    );
  }

  // ── Attempt the 3-factor verification ────────────────────────────
  // loginWithGhanaCard returns a result object (ok: true/false). It
  // should NOT throw — but if it does (e.g., DB connection issue), the
  // top-level try/catch will catch it and return a 500 JSON response.
  const result = await loginWithGhanaCard({
    ghanaCardNumber,
    dateOfBirth,
    patientNumber,
    ipAddress,
    userAgent,
  });

  if (!result.ok) {
    // Audit the failed attempt — fire-and-forget, don't block the response
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

  // ── Success — audit the login (fire-and-forget) ──────────────────
  try {
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

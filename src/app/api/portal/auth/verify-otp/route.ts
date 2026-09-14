// =====================================================================
// API: /api/portal/auth/verify-otp
//   POST — verify the OTP code and mint a patient portal JWT
//
// Body: { phone: string, code: string }
//
// Logic:
//   1. Canonicalize the phone number
//   2. Find the most recent unused OTP for this phone+org
//   3. Verify the code (bcrypt compare against the stored hash)
//   4. On success: find or create the PatientPortalAccount, link to
//      Patient by phone (auto-link if exactly one Patient matches),
//      issue a 30-min portal JWT, return it
//   5. On failure: increment attempt count on the OTP row, return 401
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  canonicalizePhone,
  isValidPhone,
  verifyOtpForPhone,
} from "@/lib/patient-portal/otp";
import { signPortalToken } from "@/lib/patient-portal/jwt";
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
  const code = String(body?.code || "").trim();
  if (!rawPhone || !code) {
    return NextResponse.json({ error: "Phone and code are required" }, { status: 400 });
  }

  const phone = canonicalizePhone(rawPhone);
  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Code must be 6 digits" }, { status: 400 });
  }

  // ── Find the org for this phone ──────────────────────────────────
  // Same matching logic as request-otp: exact match first, then suffix
  // match on last 9 digits.
  const last9 = phone.slice(-9);
  let patients = await db.patient.findMany({
    where: { phone },
    select: { id: true, organizationId: true, firstName: true, lastName: true, phone: true },
    take: 50,
  });
  if (patients.length === 0) {
    patients = await db.patient.findMany({
      where: { phone: { endsWith: last9 } },
      select: { id: true, organizationId: true, firstName: true, lastName: true, phone: true },
      take: 50,
    });
  }
  if (patients.length === 0) {
    return NextResponse.json({ error: "No patient record found" }, { status: 404 });
  }

  // Resolve org (same as request-otp)
  let orgId: string;
  let linkedPatientId: string | null = null;
  if (patients.length === 1) {
    orgId = patients[0].organizationId;
    linkedPatientId = patients[0].id; // exactly one → auto-link
  } else {
    const distinctOrgIds = Array.from(new Set(patients.map((p) => p.organizationId)));
    if (distinctOrgIds.length === 1) {
      orgId = distinctOrgIds[0];
      // Multiple patients in same org with same phone — admin must
      // manually link later. Account stays in 'pending_admin_review'.
    } else {
      const mostRecent = await db.encounter.findFirst({
        where: { patientId: { in: patients.map((p) => p.id) } },
        orderBy: { startAt: "desc" },
        select: { patientId: true },
      });
      const winner = patients.find((p) => p.id === mostRecent?.patientId);
      orgId = winner?.organizationId || distinctOrgIds[0];
      if (winner) linkedPatientId = winner.id;
    }
  }

  // ── Verify the OTP ───────────────────────────────────────────────
  const verify = await verifyOtpForPhone({ phone, code, organizationId: orgId });
  if (!verify.ok) {
    return NextResponse.json(
      { error: verify.reason || "Invalid code" },
      { status: 401 }
    );
  }

  // ── Find or create the PatientPortalAccount ──────────────────────
  let account = await db.patientPortalAccount.findUnique({
    where: { organizationId_phone: { organizationId: orgId, phone } },
  });

  if (!account) {
    // Create the account, auto-link if exactly one Patient matched
    account = await db.patientPortalAccount.create({
      data: {
        organizationId: orgId,
        phone,
        patientId: linkedPatientId,
        status:
          linkedPatientId === null
            ? patients.length > 1
              ? "pending_admin_review"
              : "pending_identity" // no patients matched (shouldn't happen here)
            : "active",
        lastLoginAt: new Date(),
      },
    });
  } else {
    // Account exists — update last login + maybe upgrade identity link
    const updateData: any = { lastLoginAt: new Date(), failedOtpAttempts: 0, lockedUntil: null };
    // If account had no patientId before but we have one now, link it
    if (!account.patientId && linkedPatientId) {
      updateData.patientId = linkedPatientId;
      updateData.status = "active";
    }
    account = await db.patientPortalAccount.update({
      where: { id: account.id },
      data: updateData,
    });
  }

  // ── Mint the portal JWT ──────────────────────────────────────────
  const token = await signPortalToken({
    accountId: account.id,
    patientId: account.patientId,
    phone: account.phone,
    organizationId: account.organizationId,
  });

  // ── Audit log the login ──────────────────────────────────────────
  try {
    const ipAddress = getClientIp(req) || undefined;
    const userAgent = getUserAgent(req) || undefined;
    await db.auditLog.create({
      data: {
        userId: null, // portal users don't have a User row
        organizationId: account.organizationId,
        facilityId: null,
        action: "PATIENT_PORTAL_LOGIN",
        actionCategory: "AUTH",
        severity: "notice",
        source: "patient_portal",
        resourceType: "patient_portal_account",
        resourceId: account.id,
        newValues: {
          phone: account.phone,
          patientId: account.patientId,
          otpId: verify.otpId,
        },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        reason: "Patient logged in via OTP",
      },
    });
  } catch (e) {
    console.error("[portal login] audit log failed:", e);
  }

  return NextResponse.json({
    token,
    account: {
      id: account.id,
      phone: account.phone,
      patientId: account.patientId,
      status: account.status,
      needsIdentity: account.patientId === null,
    },
  });
}

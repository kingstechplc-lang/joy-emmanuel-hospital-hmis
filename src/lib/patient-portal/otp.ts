// =====================================================================
// PATIENT PORTAL — OTP generation + phone canonicalization
// =====================================================================
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// =====================================================================
// Phone canonicalization
// =====================================================================
// Ghana phone numbers come in many formats: 0241234567, +233241234567,
// 233241234567, 020-123-4567, etc. We normalize before storing or
// looking up so a patient can log in regardless of how they typed it.
//
// Rules:
//   - Strip whitespace, dashes, parentheses
//   - Strip leading "+"
//   - If starts with "0" and length is 10 (e.g., 0241234567), replace
//     leading 0 with "233" (Ghana country code)
//   - If starts with "233" and length is 12, leave as-is
//   - If starts with a digit but not 0 or 233, assume local 9-digit
//     number → prepend "233"
//   - Anything else → return as-is (caller validates further)
//
// Examples:
//   "0241234567"      → "233241234567"
//   "+233241234567"   → "233241234567"
//   "233-24-123-4567" → "233241234567"
//   "020 123 4567"    → "233201234567"
//   "5551234567"      → "5551234567" (US format — not Ghana, return as-is)
// =====================================================================
export function canonicalizePhone(raw: string): string {
  if (!raw) return "";
  // Strip everything that's not a digit, then re-add country code logic
  const digits = raw.replace(/[^\d+]/g, "");
  // Strip leading "+"
  const stripped = digits.replace(/^\+/, "");

  // Ghana mobile: 10 digits starting with 0 (e.g., 0241234567)
  if (/^0\d{9}$/.test(stripped)) {
    return "233" + stripped.slice(1);
  }
  // Already has Ghana country code
  if (/^233\d{9}$/.test(stripped)) {
    return stripped;
  }
  // 9 digits without leading 0 — assume Ghana local
  if (/^\d{9}$/.test(stripped)) {
    return "233" + stripped;
  }
  // Otherwise return as-is; caller will decide if it's acceptable
  return stripped;
}

export function isValidGhanaPhone(canonical: string): boolean {
  return /^233\d{9}$/.test(canonical);
}

export function isValidPhone(canonical: string): boolean {
  // Accept any 9-15 digit number with optional country code prefix
  return /^\d{9,15}$/.test(canonical);
}

// =====================================================================
// OTP generation
// =====================================================================
// 6-digit code, uniformly random — no modulo bias. crypto.randomInt
// is only available in Node 18+; the project targets Node 20+ on
// Vercel, so we can use it directly.
export function generateOtpCode(): string {
  // Use crypto.randomInt for cryptographic-uniform distribution
  // Fallback to Math.random if running in an environment that doesn't
  // expose crypto.randomInt (shouldn't happen on Vercel Node 20+)
  try {
    const { randomInt } = require("crypto");
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
  } catch {
    const n = Math.floor(Math.random() * 1_000_000);
    return String(n).padStart(6, "0");
  }
}

export async function hashOtpCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function verifyOtpCode(code: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(code, hash);
  } catch {
    return false;
  }
}

// =====================================================================
// OTP issue + send
// =====================================================================
// Issues a fresh OTP for a given phone, hashes it with bcrypt, persists
// the row, then sends it via the configured SMS service. Returns the
// OTP row id + the SMS provider's message id (and, in dev mode, the
// OTP itself so the dev dashboard can display it for testing).
//
// IMPORTANT: this function uses the ORGANIZATION ID from the request
// context. The portal needs to know which org a patient belongs to
// BEFORE sending the OTP — because the patient table is org-scoped.
// We resolve org at request-otp time by scanning ALL orgs for a
// matching patient phone (most installations are single-org, so this
// is a 1-row scan; multi-org deployments should override this by
// adding an X-Org-Slug header resolver).
//
// Rate limiting: max 1 OTP per phone per 60 seconds, max 5 per hour.
// Implemented at the request-otp endpoint, not here.
export async function issueAndSendOtp(params: {
  phone: string;          // canonical form
  organizationId: string;
  ipAddress?: string;
  userAgent?: string;
  purpose?: string;
}): Promise<{
  otpId: string;
  smsOk: boolean;
  smsStatus: string;
  smsStatusDetail?: string;
  devModeOtp?: string; // surfaced only in dev mode
}> {
  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Invalidate any prior unused OTPs for this phone (so only the newest
  // code is valid at any moment)
  await db.patientOtp.updateMany({
    where: {
      organizationId: params.organizationId,
      phone: params.phone,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() }, // mark old codes as used so they can't be verified
  });

  const otpRow = await db.patientOtp.create({
    data: {
      organizationId: params.organizationId,
      phone: params.phone,
      codeHash,
      purpose: params.purpose || "login",
      expiresAt,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    },
  });

  // Build the SMS body. Keep it short — single SMS segment (160 chars).
  const org = await db.organization.findUnique({
    where: { id: params.organizationId },
    select: { name: true },
  });
  const orgName = org?.name || "Joy Emmanuel Hospital";
  const shortName = orgName.length > 24 ? orgName.slice(0, 24) : orgName;
  const body = `${shortName}: Your login code is ${code}. It expires in 5 minutes. Do not share this code with anyone.`;

  // Send via the SMS service
  const { getSmsService } = await import("@/lib/sms/service");
  const sms = getSmsService();
  const result = await sms.send({
    to: params.phone,
    body,
    relatedOtpId: otpRow.id,
    organizationId: params.organizationId,
    ipAddress: params.ipAddress,
  });

  return {
    otpId: otpRow.id,
    smsOk: result.ok,
    smsStatus: result.status,
    smsStatusDetail: result.statusDetail,
    devModeOtp: result.devModeOtp,
  };
}

// =====================================================================
// OTP verify — check a code against the latest unused OTP for the phone
// =====================================================================
export async function verifyOtpForPhone(params: {
  phone: string;
  code: string;
  organizationId: string;
}): Promise<{
  ok: boolean;
  reason?: string;
  otpId?: string;
}> {
  // Find the latest unused, non-expired OTP for this phone + org
  const otp = await db.patientOtp.findFirst({
    where: {
      organizationId: params.organizationId,
      phone: params.phone,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    return { ok: false, reason: "No active OTP — request a new code" };
  }

  // Check attempt count — max 5 attempts per code
  if (otp.attemptCount >= 5) {
    await db.patientOtp.update({
      where: { id: otp.id },
      data: { usedAt: new Date() }, // invalidate the code
    });
    return { ok: false, reason: "Too many attempts — request a new code" };
  }

  // Increment attempt count BEFORE verifying (so a wrong code increments)
  await db.patientOtp.update({
    where: { id: otp.id },
    data: { attemptCount: { increment: 1 } },
  });

  const valid = await verifyOtpCode(params.code, otp.codeHash);
  if (!valid) {
    return { ok: false, reason: "Invalid code", otpId: otp.id };
  }

  // Mark as used so it can't be replayed
  await db.patientOtp.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });

  return { ok: true, otpId: otp.id };
}

// =====================================================================
// PATIENT PORTAL — Ghana Card auth helpers
// =====================================================================
// v1 patient authentication: 3-factor verification using
//   1. Ghana Card number (looked up via PatientIdentifier where
//      identifierType='ghana_card')
//   2. Date of birth (verified against Patient.dateOfBirth)
//   3. Patient number, e.g. "JEM-00000001" (verified against
//      Patient.patientNumber, unique within the org)
//
// All three factors must match the SAME Patient row. On success, find
// or create a PatientPortalAccount with ghanaCardNumber set, then
// mint a portal JWT. On any failure, return a generic "credentials
// don't match" error (don't reveal which factor was wrong).
//
// The existing OTP/SMS auth flow (request-otp + verify-otp endpoints)
// stays in place for future v2 use — when SMS_PROVIDER is configured
// to a real gateway and the login UI gains an "Authenticate via SMS"
// tab. The SmsService, PatientOtp, and SmsLog models remain ready.
// =====================================================================
import { db } from "@/lib/db";
import { signPortalToken } from "@/lib/patient-portal/jwt";

// =====================================================================
// Ghana Card number canonicalization
// =====================================================================
// Ghana Card numbers come in several formats:
//   - "GHA-123456789-1" (with prefix + dashes)
//   - "GHA1234567891" (with prefix, no dashes)
//   - "123456789-1" (no prefix, with dash)
//   - "1234567891" (just digits + check digit)
//
// We normalize by:
//   1. Convert to uppercase
//   2. Strip whitespace, dashes, parentheses
//   3. If starts with "GHA", strip the prefix
//   4. Result: just the 10-digit number + check digit (e.g., "1234567891")
//
// Examples:
//   "GHA-123456789-1" → "1234567891"
//   "gha1234567891"   → "1234567891"
//   "123456789-1"     → "1234567891"
//   "  1234567891  "  → "1234567891"
// =====================================================================
export function canonicalizeGhanaCard(raw: string): string {
  if (!raw) return "";
  let s = raw.toUpperCase().trim();
  // Strip everything that's not a digit
  s = s.replace(/[^\d]/g, "");
  // Note: the GHA prefix is alphabetic so it gets stripped by the
  // digit-only filter above. No special handling needed.
  return s;
}

export function isValidGhanaCardFormat(canonical: string): boolean {
  // Ghana Card numbers are 10 digits (9-digit sequence + 1 check digit)
  // Some sources cite 12 digits — we accept 9-12 to be permissive
  return /^\d{9,12}$/.test(canonical);
}

// =====================================================================
// Patient number canonicalization
// =====================================================================
// Patient numbers are stored as "JEM-00000001" (with the JEM- prefix
// and 7-digit padding). The user may type:
//   - "JEM-00000001" (canonical)
//   - "jem-00000001" (lowercase)
//   - "00000001" (just digits, no prefix)
//   - "1" (just the number, no padding)
//
// We normalize to the canonical "JEM-XXXXXXXX" form for DB lookup.
// If the input is purely numeric (no JEM- prefix), we pad with zeros
// and prepend the prefix.
// =====================================================================
export function canonicalizePatientNumber(raw: string): string {
  if (!raw) return "";
  let s = raw.trim().toUpperCase();
  // Strip the JEM- prefix if present
  if (s.startsWith("JEM-")) s = s.slice(4);
  else if (s.startsWith("JEM")) s = s.slice(3);
  // Strip whitespace and dashes
  s = s.replace(/[\s-]/g, "");
  // If empty after stripping, return as-is (caller validates)
  if (!s) return "";
  // If purely numeric, pad to 7 digits and prepend JEM-
  if (/^\d+$/.test(s)) {
    return `JEM-${s.padStart(7, "0")}`;
  }
  // Otherwise return as-is (caller decides)
  return `JEM-${s}`;
}

// =====================================================================
// Date of birth normalization
// =====================================================================
// Accept either "YYYY-MM-DD" (HTML date input) or full ISO timestamps.
// Returns a Date object at midnight UTC. Returns null if invalid.
// =====================================================================
export function parseDateOfBirth(input: string): Date | null {
  if (!input) return null;
  // Try ISO format first (yyyy-mm-dd)
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [_, y, m, d] = match;
    const dt = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d)));
    if (!isNaN(dt.getTime())) return dt;
  }
  // Fallback to Date parsing (less reliable)
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) {
    // Truncate to midnight UTC
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }
  return null;
}

// =====================================================================
// Login with Ghana Card — 3-factor verification
// =====================================================================
// Returns:
//   { ok: true, token, account } on success
//   { ok: false, reason, code } on failure
//     code: 'NO_MATCH' | 'LOCKED' | 'RATE_LIMITED' | 'INVALID_INPUT'
// =====================================================================
export async function loginWithGhanaCard(params: {
  ghanaCardNumber: string;  // raw input
  dateOfBirth: string;      // raw input (yyyy-mm-dd)
  patientNumber: string;    // raw input
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  ok: boolean;
  reason?: string;
  code?: string;
  token?: string;
  account?: { id: string; ghanaCardNumber: string | null; patientId: string | null; status: string };
}> {
  const ghanaCard = canonicalizeGhanaCard(params.ghanaCardNumber);
  if (!isValidGhanaCardFormat(ghanaCard)) {
    return { ok: false, reason: "Ghana Card number format is invalid", code: "INVALID_INPUT" };
  }

  const dob = parseDateOfBirth(params.dateOfBirth);
  if (!dob) {
    return { ok: false, reason: "Date of birth is invalid", code: "INVALID_INPUT" };
  }

  const patientNumber = canonicalizePatientNumber(params.patientNumber);
  if (!patientNumber) {
    return { ok: false, reason: "Patient number is required", code: "INVALID_INPUT" };
  }

  // ── Step 1: Find PatientIdentifier with this Ghana Card ──────────
  // Staff at the Records Desk may have entered the Ghana Card number in
  // several formats: "GHA-123456789-1", "GHA1234567891", "123456789-1",
  // "1234567891", etc. Our canonical form is digits-only ("1234567891").
  //
  // Strategy: try FAST exact match first (uses the unique index on
  // (identifierType, identifierValue)), then fall back to SLOWER contains
  // match only if exact fails. This avoids a slow ILIKE scan on every
  // login attempt.
  //
  // We try 4 variants in order:
  //   1. Exact canonical digits ("1234567891")
  //   2. Raw input as-typed (in case DB stored it verbatim)
  //   3. Contains canonical digits (catches "GHA-123456789-1" etc.)
  //   4. Contains raw input (case-insensitive, catches unusual formats)
  const identifier = await (async () => {
    // Variant 1: exact canonical match — fast (uses unique index)
    let id = await db.patientIdentifier.findFirst({
      where: {
        identifierType: "ghana_card",
        identifierValue: ghanaCard,
      },
      select: { id: true, patientId: true, verified: true, identifierValue: true },
    });
    if (id) {
      console.log(`[portal login] Ghana Card matched via exact canonical: "${id.identifierValue}"`);
      return id;
    }

    // Variant 2: exact raw input match — also fast (uses unique index)
    id = await db.patientIdentifier.findFirst({
      where: {
        identifierType: "ghana_card",
        identifierValue: params.ghanaCardNumber,
      },
      select: { id: true, patientId: true, verified: true, identifierValue: true },
    });
    if (id) {
      console.log(`[portal login] Ghana Card matched via exact raw input: "${id.identifierValue}"`);
      return id;
    }

    // Variant 3: contains canonical digits — slow (ILIKE scan) but catches
    // all format variants like "GHA-123456789-1"
    id = await db.patientIdentifier.findFirst({
      where: {
        identifierType: "ghana_card",
        identifierValue: { contains: ghanaCard },
      },
      select: { id: true, patientId: true, verified: true, identifierValue: true },
    });
    if (id) {
      console.log(`[portal login] Ghana Card matched via contains(canonical): "${id.identifierValue}"`);
      return id;
    }

    // Variant 4: contains raw input (case-insensitive) — catches edge cases
    id = await db.patientIdentifier.findFirst({
      where: {
        identifierType: "ghana_card",
        identifierValue: { contains: params.ghanaCardNumber, mode: "insensitive" as any },
      },
      select: { id: true, patientId: true, verified: true, identifierValue: true },
    });
    if (id) {
      console.log(`[portal login] Ghana Card matched via contains(raw): "${id.identifierValue}"`);
      return id;
    }

    return null;
  })();

  if (!identifier) {
    // Debug log — helps troubleshoot without exposing data to the client
    console.log(
      `[portal login] no PatientIdentifier found for ghanaCard=${ghanaCard} ` +
      `(raw=${params.ghanaCardNumber}, patientNumber=${patientNumber})`
    );
    // Don't reveal that the Ghana Card specifically was wrong
    return {
      ok: false,
      reason: "The credentials you entered don't match our records. Please verify your Ghana Card number, date of birth, and patient number, then try again.",
      code: "NO_MATCH",
    };
  }

  // ── Step 2: Find the Patient linked to this identifier ───────────
  const patient = await db.patient.findUnique({
    where: { id: identifier.patientId },
    select: {
      id: true,
      organizationId: true,
      patientNumber: true,
      dateOfBirth: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!patient) {
    console.log(
      `[portal login] PatientIdentifier found but no Patient linked ` +
      `(patientId=${identifier.patientId})`
    );
    return {
      ok: false,
      reason: "The credentials you entered don't match our records.",
      code: "NO_MATCH",
    };
  }

  // ── Step 3: Verify patientNumber matches ──────────────────────────
  // Patient numbers are unique within org. The DB might store it as
  // "JEM-00000001" while the user typed "jem-1" or "00000001" or "1".
  // We canonicalize both sides (uppercase + JEM- prefix + 7-digit padding)
  // and compare case-insensitively.
  //
  // For patients whose patientNumber wasn't issued in the JEM-XXXXXXX
  // format (legacy data), we fall back to a case-insensitive comparison
  // of the raw values.
  const storedPatientNumber = (patient.patientNumber || "").toUpperCase();
  const inputPatientNumber = patientNumber.toUpperCase();
  const matches =
    storedPatientNumber === inputPatientNumber ||
    storedPatientNumber.replace(/[\s-]/g, "") === inputPatientNumber.replace(/[\s-]/g, "") ||
    // Handle the case where DB stored as "JEM-00000001" and user typed "1"
    // (strip prefix + leading zeros from both sides for one more comparison)
    storedPatientNumber.replace(/JEM-?/i, "").replace(/^0+/, "") ===
      inputPatientNumber.replace(/JEM-?/i, "").replace(/^0+/, "");

  if (!matches) {
    console.log(
      `[portal login] patientNumber mismatch: stored=${patient.patientNumber} ` +
      `input=${patientNumber} (canonical=${inputPatientNumber})`
    );
    return {
      ok: false,
      reason: "The credentials you entered don't match our records.",
      code: "NO_MATCH",
    };
  }

  // ── Step 4: Verify DOB matches (date-only comparison) ────────────
  // Patient.dateOfBirth might be stored with a time-of-day component
  // (depending on how the seed data was inserted). We strip to date-only
  // (UTC midnight) on both sides and compare. Also try a string-format
  // comparison as a fallback in case of timezone issues.
  if (patient.dateOfBirth) {
    const storedDob = new Date(
      Date.UTC(
        patient.dateOfBirth.getUTCFullYear(),
        patient.dateOfBirth.getUTCMonth(),
        patient.dateOfBirth.getUTCDate()
      )
    );
    const storedStr = `${storedDob.getUTCFullYear()}-${String(storedDob.getUTCMonth() + 1).padStart(2, "0")}-${String(storedDob.getUTCDate()).padStart(2, "0")}`;
    const inputStr = `${dob.getUTCFullYear()}-${String(dob.getUTCMonth() + 1).padStart(2, "0")}-${String(dob.getUTCDate()).padStart(2, "0")}`;
    if (storedDob.getTime() !== dob.getTime() && storedStr !== inputStr) {
      console.log(
        `[portal login] DOB mismatch: stored=${patient.dateOfBirth.toISOString()} ` +
        `input=${params.dateOfBirth} (canonical=${inputStr})`
      );
      return {
        ok: false,
        reason: "The credentials you entered don't match our records.",
        code: "NO_MATCH",
      };
    }
  } else if (identifier.verified === false) {
    // Edge case: if Patient has no DOB on file AND the Ghana Card wasn't
    // verified by staff, reject — too risky
    return {
      ok: false,
      reason: "Your identity hasn't been fully verified. Please visit the Records Desk.",
      code: "NO_MATCH",
    };
  }

  // ── Step 5: All 3 factors match — find or create the account ──────
  let account = await db.patientPortalAccount.findUnique({
    where: {
      organizationId_ghanaCardNumber: {
        organizationId: patient.organizationId,
        ghanaCardNumber: ghanaCard,
      },
    },
  });

  if (!account) {
    account = await db.patientPortalAccount.create({
      data: {
        organizationId: patient.organizationId,
        ghanaCardNumber: ghanaCard,
        patientId: patient.id,
        status: "active",
        lastLoginAt: new Date(),
        lastAuthMethod: "ghana_card",
      },
    });
  } else {
    account = await db.patientPortalAccount.update({
      where: { id: account.id },
      data: {
        lastLoginAt: new Date(),
        lastAuthMethod: "ghana_card",
        // If the account existed but wasn't linked to a patient, link now
        ...(account.patientId ? {} : { patientId: patient.id }),
      },
    });
  }

  // ── Step 6: Check account status — locked? suspended? ────────────
  if (account.status === "suspended") {
    return {
      ok: false,
      reason: "Your account has been suspended. Please contact the hospital.",
      code: "LOCKED",
    };
  }
  if (account.lockedUntil && account.lockedUntil > new Date()) {
    return {
      ok: false,
      reason: "Your account is temporarily locked. Please try again later.",
      code: "LOCKED",
    };
  }

  // ── Step 7: Mint the portal JWT ──────────────────────────────────
  const token = await signPortalToken({
    accountId: account.id,
    patientId: account.patientId,
    phone: account.phone || "", // empty if Ghana Card-only account
    organizationId: account.organizationId,
  });

  return {
    ok: true,
    token,
    account: {
      id: account.id,
      ghanaCardNumber: account.ghanaCardNumber,
      patientId: account.patientId,
      status: account.status,
    },
  };
}

// =====================================================================
// Verification Evidence Level Helper
// =====================================================================
// Derives a verification evidence level from the method + source combination.
// This is a PURE FUNCTION — it does not query the database.
//
// Evidence hierarchy (per the NHIS/NHIA verification semantics audit):
//
// LEVEL 1 — DIRECT_NHIA_VERIFIED
//   method=api, source=nhia_direct
//   The HMIS itself communicated with an authorized NHIA interface.
//
// LEVEL 2 — NHIA_OPERATIONAL_VERIFIED
//   method=facility_operational, source=nhia_operational
//   NHIA-recognized facility-side operational process (e.g., NHIA facility portal,
//   NeHFAMS facility workflow, authorized NHIA verification application).
//
// LEVEL 3 — NHIA_ATTENDANCE_VERIFIED
//   method=otac, source=nhia_otac
//   OTAC/*929# attendance-based verification. Proves attendance, NOT eligibility.
//
// LEVEL 4 — EXTERNAL_VERIFIED
//   method=external, source=external
//   Staff verified through an authorized external NHIA/facility system.
//
// LEVEL 5 — MANUAL_REVIEW
//   method=manual, source=local or manual
//   Staff physically checked NHIS card, membership number, expiry, patient identity.
//
// LEVEL 0 — NOT_VERIFIED
//   No verification record, or status is not_verified/failed/pending.
//
// IMPORTANT: This model does NOT equate "manual/external" with "invalid."
// A verification can be legitimate and NHIA-recognized operationally even
// when the HMIS does not have a direct API connection to NHIA.
// =====================================================================

export type VerificationEvidenceLevel =
  | "DIRECT_NHIA_VERIFIED"
  | "NHIA_OPERATIONAL_VERIFIED"
  | "NHIA_ATTENDANCE_VERIFIED"
  | "EXTERNAL_VERIFIED"
  | "MANUAL_REVIEW"
  | "NOT_VERIFIED";

export interface EvidenceLevelInfo {
  level: VerificationEvidenceLevel;
  label: string;          // UI display label
  shortLabel: string;     // compact badge label
  description: string;    // what this evidence level means
  isLegitimate: boolean;  // true if this counts as a valid verification for readiness
  isOfficial: boolean;    // true if this involves an NHIA-recognized channel
  color: string;          // tailwind color classes for badges
  requiresApiConfig: boolean; // true only for DIRECT_NHIA_VERIFIED
}

const EVIDENCE_INFO: Record<VerificationEvidenceLevel, EvidenceLevelInfo> = {
  DIRECT_NHIA_VERIFIED: {
    level: "DIRECT_NHIA_VERIFIED",
    label: "NHIA Direct Verified",
    shortLabel: "NHIA Direct",
    description: "Verified through a direct authorized NHIA API/system response.",
    isLegitimate: true,
    isOfficial: true,
    color: "bg-emerald-100 text-emerald-700 border-emerald-300",
    requiresApiConfig: true,
  },
  NHIA_OPERATIONAL_VERIFIED: {
    level: "NHIA_OPERATIONAL_VERIFIED",
    label: "NHIA Operational Verification",
    shortLabel: "NHIA Operational",
    description: "Verified through an authorized NHIA facility-side operational process.",
    isLegitimate: true,
    isOfficial: true,
    color: "bg-blue-100 text-blue-700 border-blue-300",
    requiresApiConfig: false,
  },
  NHIA_ATTENDANCE_VERIFIED: {
    level: "NHIA_ATTENDANCE_VERIFIED",
    label: "NHIA Attendance Verified",
    shortLabel: "NHIA Attendance",
    description: "Attendance verified via OTAC/*929# — NHIA-recognized attendance channel. Does not by itself prove membership eligibility.",
    isLegitimate: true, // legitimate as attendance evidence
    isOfficial: true,
    color: "bg-cyan-100 text-cyan-700 border-cyan-300",
    requiresApiConfig: false,
  },
  EXTERNAL_VERIFIED: {
    level: "EXTERNAL_VERIFIED",
    label: "External Verification Recorded",
    shortLabel: "External",
    description: "Verified by staff through an authorized external NHIA/facility verification system.",
    isLegitimate: true,
    isOfficial: false, // external system, not direct NHIA
    color: "bg-violet-100 text-violet-700 border-violet-300",
    requiresApiConfig: false,
  },
  MANUAL_REVIEW: {
    level: "MANUAL_REVIEW",
    label: "Manual Record Check",
    shortLabel: "Manual",
    description: "Staff physically checked NHIS card, membership number, coverage dates, and patient identity.",
    isLegitimate: true, // still counts, but lowest evidence level
    isOfficial: false,
    color: "bg-amber-100 text-amber-700 border-amber-300",
    requiresApiConfig: false,
  },
  NOT_VERIFIED: {
    level: "NOT_VERIFIED",
    label: "Not Yet Verified",
    shortLabel: "Unverified",
    description: "No verification evidence has been recorded.",
    isLegitimate: false,
    isOfficial: false,
    color: "bg-rose-100 text-rose-700 border-rose-300",
    requiresApiConfig: false,
  },
};

/**
 * Derive the evidence level from method + source + status.
 *
 * For ELIGIBILITY verification:
 *   - method=api + source=nhia_direct → DIRECT_NHIA_VERIFIED
 *   - method=facility_operational + source=nhia_operational → NHIA_OPERATIONAL_VERIFIED
 *   - method=external + source=external → EXTERNAL_VERIFIED
 *   - method=manual + source=local or manual → MANUAL_REVIEW
 *   - anything else with a passing status → MANUAL_REVIEW (fallback)
 *
 * For ATTENDANCE verification:
 *   - method=OTAC + source=nhia_otac → NHIA_ATTENDANCE_VERIFIED
 *   - method=CCC + source=nhia_operational → NHIA_OPERATIONAL_VERIFIED
 *   - other methods → MANUAL_REVIEW or NOT_VERIFIED
 */
export function getEvidenceLevel(
  method: string | null | undefined,
  source: string | null | undefined,
  status: string | null | undefined,
): EvidenceLevelInfo {
  // If status is not a passing status, return NOT_VERIFIED
  const passingStatuses = ["verified", "active", "manual_verified"];
  if (!status || !passingStatuses.includes(status)) {
    return EVIDENCE_INFO.NOT_VERIFIED;
  }

  const m = (method || "").toLowerCase();
  const s = (source || "").toLowerCase();

  // Direct NHIA API
  if (m === "api" || m === "integrated" || s === "nhia_direct" || s === "nhia_integration") {
    return EVIDENCE_INFO.DIRECT_NHIA_VERIFIED;
  }

  // NHIA operational/facility
  if (m === "facility_operational" || s === "nhia_operational") {
    return EVIDENCE_INFO.NHIA_OPERATIONAL_VERIFIED;
  }

  // NHIA attendance via OTAC
  if (m === "otac" || s === "nhia_otac") {
    return EVIDENCE_INFO.NHIA_ATTENDANCE_VERIFIED;
  }

  // External verification
  if (m === "external" || s === "external") {
    return EVIDENCE_INFO.EXTERNAL_VERIFIED;
  }

  // Manual / local
  if (m === "manual" || s === "manual" || s === "local") {
    return EVIDENCE_INFO.MANUAL_REVIEW;
  }

  // Fallback: if status is verified but method/source is unknown, treat as manual review
  return EVIDENCE_INFO.MANUAL_REVIEW;
}

/**
 * Check if a verification record satisfies the eligibility requirement.
 *
 * IMPORTANT: This does NOT treat OTAC as eligibility.
 * OTAC is attendance evidence, not eligibility evidence.
 * OTAC satisfies the ATTENDANCE requirement, not the ELIGIBILITY requirement.
 *
 * For eligibility, the following evidence levels are legitimate:
 *   - DIRECT_NHIA_VERIFIED
 *   - NHIA_OPERATIONAL_VERIFIED
 *   - EXTERNAL_VERIFIED
 *   - MANUAL_REVIEW
 *
 * NHIA_ATTENDANCE_VERIFIED does NOT satisfy eligibility on its own.
 */
export function satisfiesEligibility(
  method: string | null | undefined,
  source: string | null | undefined,
  status: string | null | undefined,
): boolean {
  const evidence = getEvidenceLevel(method, source, status);
  // NHIA_ATTENDANCE_VERIFIED does NOT satisfy eligibility — it's attendance only
  if (evidence.level === "NHIA_ATTENDANCE_VERIFIED") return false;
  return evidence.isLegitimate;
}

/**
 * Check if a verification record satisfies the attendance requirement.
 */
export function satisfiesAttendance(
  method: string | null | undefined,
  source: string | null | undefined,
  status: string | null | undefined,
): boolean {
  const evidence = getEvidenceLevel(method, source, status);
  // All legitimate evidence levels satisfy attendance (OTAC, operational, etc.)
  return evidence.isLegitimate;
}

/**
 * Get the UI label for a verification record.
 */
export function getVerificationLabel(
  method: string | null | undefined,
  source: string | null | undefined,
  status: string | null | undefined,
): string {
  return getEvidenceLevel(method, source, status).label;
}

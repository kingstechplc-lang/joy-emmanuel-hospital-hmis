// =====================================================================
// WRISTBAND — Content Assembler + QR Token Generator
// =====================================================================
// Builds the structured content payload used by both the on-screen
// wristband preview and the thermal-printer template. Also generates
// the opaque wristband token (a crypto.randomUUID v4 URL-safe string)
// that handheld QR scanners will decode to verify patient identity.
//
// The QR payload encodes a fully-qualified verify URL so any modern
// smartphone / tablet / handheld scanner can:
//   - Open the link in a browser, OR
//   - Hand the URL string to a backend lookup
//
// Token format: `${origin}/wb/${token}`
//   - Short prefix `/wb/` keeps QR data small (better readability)
//   - The token itself is opaque (not the patientId) to prevent
//     leaking patient IDs through QR scans
//
// Allergy aggregation: filters Patient.allergies by status='active',
// sorts by severity (anaphylactic > severe > moderate > mild), and
// joins allergen strings with commas. The wristband template renders
// this as a red banner ONLY when there's at least one active allergy
// — blood group alone (e.g., O+) is NOT a red alert.
// =====================================================================

import { db } from "@/lib/db";

export interface WristbandContent {
  patient: {
    id: string;
    patientNumber: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    fullName: string;
    dateOfBirth?: string | null;
    age: number | null;
    sex?: string | null;
    bloodGroup?: string | null;
    phone?: string | null;
    photoUrl?: string | null;
  };
  encounter?: {
    id: string;
    encounterNumber: string;
    encounterType: string;
    priority: string;
    startAt: string;
    department?: { id: string; name: string; code: string } | null;
  };
  facility: {
    id: string;
    name: string;
    code?: string | null;
    phone?: string | null;
  };
  organization: {
    id: string;
    name: string;
    logoUrl?: string | null;
  };
  allergies: Array<{
    id: string;
    allergen: string;
    severity: string | null;
    reaction: string | null;
  }>;
  // True if at least one active allergy exists — drives the red banner
  hasAllergyAlert: boolean;
  // Comma-joined string of all active allergens (e.g., "Penicillin, Sulfa")
  allergySummary: string | null;
  // Highest severity among active allergies (for banner color)
  highestAllergySeverity: string | null;
  // QR payload — the URL to be encoded by the QR library
  qrPayload: string;
  // Wristband token (opaque)
  token: string;
  // ISO date when the wristband was minted
  issuedAt: string;
}

function calculateAge(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

const SEVERITY_ORDER: Record<string, number> = {
  anaphylactic: 0,
  severe: 1,
  moderate: 2,
  mild: 3,
};

/**
 * Mint a fresh wristband token using crypto.randomUUID.
 * Returns the raw token (URL-safe UUID v4 string).
 */
export function generateWristbandToken(): string {
  // crypto.randomUUID is available in Node 18+ and all modern browsers
  // (the Next.js server runtime polyfills it via the global crypto object).
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: a 32-char hex string from Math.random (low collision risk)
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

/**
 * Build the QR payload URL for a wristband token.
 *
 * @param token  The wristband token (crypto.randomUUID)
 * @param origin Optional explicit origin (defaults to /wb/<token> relative
 *               path; if origin is provided, returns an absolute URL).
 *
 * The verify endpoint at `/api/patient-wristbands/verify/[token]` does the
 * actual patient lookup by token, so the QR code can be scanned by anyone
 * with a smartphone or handheld scanner.
 */
export function buildQrPayload(token: string, origin?: string): string {
  if (origin) {
    return `${origin.replace(/\/$/, "")}/wb/${token}`;
  }
  return `/wb/${token}`;
}

/**
 * Assemble the wristband content for a patient (+ optional encounter).
 *
 * This is a read-only operation — no records are created or modified.
 * The caller is responsible for persisting a new PatientWristband row
 * with the generated token + content snapshot.
 */
export async function assembleWristbandContent(
  patientId: string,
  encounterId: string | null | undefined,
  token: string,
  origin?: string,
): Promise<{
  content: WristbandContent;
  organizationId: string;
  facilityId: string;
  encounterId: string | null;
}> {
  // 1. Load the patient with active allergies
  const patient = await db.patient.findUnique({
    where: { id: patientId },
    include: {
      allergies: {
        where: { status: "active" },
        orderBy: [{ severity: "desc" }, { allergen: "asc" }],
      },
      organization: { select: { id: true, name: true, logoUrl: true } },
    },
  });

  if (!patient) {
    throw new Error("Patient not found");
  }

  // 2. Load the encounter (if provided) with its department
  let encounter: any = null;
  if (encounterId) {
    encounter = await db.encounter.findUnique({
      where: { id: encounterId },
      include: {
        department: { select: { id: true, name: true, code: true } },
        facility: { select: { id: true, name: true, code: true, phone: true } },
      },
    });
    if (!encounter) {
      throw new Error("Encounter not found");
    }
  }

  // 3. Determine facility: prefer encounter.facility, fall back to patient's
  //    registered facility, fall back to the organization's first facility.
  const facilityId = encounter?.facilityId || patient.registeredAtFacilityId || "";
  let facility: any = null;
  if (facilityId) {
    facility = await db.facility.findUnique({
      where: { id: facilityId },
      select: { id: true, name: true, code: true, phone: true },
    });
  }

  if (!facility) {
    throw new Error("Facility could not be determined for this patient");
  }

  // 4. Aggregate allergies — sort by severity, build a comma-joined summary,
  //    and pick the highest severity for banner color.
  const sortedAllergies = [...patient.allergies].sort((a, b) => {
    const aS = SEVERITY_ORDER[a.severity || "mild"] ?? 99;
    const bS = SEVERITY_ORDER[b.severity || "mild"] ?? 99;
    return aS - bS;
  });
  const hasAllergyAlert = sortedAllergies.length > 0;
  const allergySummary = hasAllergyAlert
    ? sortedAllergies.map((a) => a.allergen).join(", ")
    : null;
  const highestAllergySeverity = hasAllergyAlert
    ? sortedAllergies[0].severity || "mild"
    : null;

  // 5. Build the QR payload URL
  const qrPayload = buildQrPayload(token, origin);

  const content: WristbandContent = {
    patient: {
      id: patient.id,
      patientNumber: patient.patientNumber,
      firstName: patient.firstName,
      lastName: patient.lastName,
      middleName: patient.middleName,
      fullName: [patient.firstName, patient.middleName, patient.lastName]
        .filter(Boolean)
        .join(" "),
      dateOfBirth: patient.dateOfBirth?.toISOString() || null,
      age: calculateAge(patient.dateOfBirth),
      sex: patient.sex,
      bloodGroup: patient.bloodGroup,
      phone: patient.phone,
      photoUrl: patient.photoUrl,
    },
    encounter: encounter
      ? {
          id: encounter.id,
          encounterNumber: encounter.encounterNumber,
          encounterType: encounter.encounterType,
          priority: encounter.priority,
          startAt: encounter.startAt.toISOString(),
          department: encounter.department
            ? {
                id: encounter.department.id,
                name: encounter.department.name,
                code: encounter.department.code,
              }
            : null,
        }
      : undefined,
    facility: {
      id: facility.id,
      name: facility.name,
      code: facility.code,
      phone: facility.phone,
    },
    organization: {
      id: patient.organization.id,
      name: patient.organization.name,
      logoUrl: patient.organization.logoUrl,
    },
    allergies: sortedAllergies.map((a) => ({
      id: a.id,
      allergen: a.allergen,
      severity: a.severity,
      reaction: a.reaction,
    })),
    hasAllergyAlert,
    allergySummary,
    highestAllergySeverity,
    qrPayload,
    token,
    issuedAt: new Date().toISOString(),
  };

  return {
    content,
    organizationId: patient.organizationId,
    facilityId: facility.id,
    encounterId: encounter?.id || null,
  };
}

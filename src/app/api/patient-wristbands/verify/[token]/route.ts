// =====================================================================
// API: /api/patient-wristbands/verify/[token]
//   GET    — public endpoint to look up a wristband by its opaque token.
//            Used by handheld QR scanners and smartphones to verify
//            patient identity at the point of care (drug administration,
//            blood draw, procedure, etc.).
//
// PERMISSIONS:
//   - No authentication required (this endpoint is meant to be scanned
//     from outside the HMIS — e.g., a nurse's tablet scanning a
//     wristband QR with the camera).
//   - However, we only return enough info for bedside verification:
//     name, MRN, DOB/age, sex, blood group, allergy alert, and the
//     facility name. No phone, no address, no diagnosis history.
//
// SECURITY:
//   - The token is opaque (crypto.randomUUID) and unique; it does not
//     leak the patientId.
//   - Voided or replaced wristbands return 410 Gone with a "Wristband
//     is no longer valid" message — the scanner must tell the clinician
//     to reprint.
//   - Rate limiting is recommended but not implemented here; this
//     endpoint should be protected by an upstream WAF / edge rate
//     limiter (e.g., Vercel's built-in rate limiting).
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/patient-wristbands/verify/[token]
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  try {
    const wristband = await db.patientWristband.findUnique({
      where: { token },
      include: {
        patient: {
          select: {
            id: true, patientNumber: true, firstName: true, lastName: true, middleName: true,
            dateOfBirth: true, sex: true, bloodGroup: true, photoUrl: true,
            allergies: { where: { status: "active" }, select: { allergen: true, severity: true, reaction: true } },
          },
        },
        encounter: {
          select: {
            id: true, encounterNumber: true, encounterType: true, status: true,
            startAt: true, priority: true,
            department: { select: { name: true, code: true } },
          },
        },
        facility: { select: { id: true, name: true, code: true } },
      },
    });

    if (!wristband) {
      return NextResponse.json({ error: "Wristband not found" }, { status: 404 });
    }

    // Voided or replaced wristbands are "gone" — the scanner should
    // tell the clinician to reprint the wristband.
    if (wristband.status !== "active") {
      return NextResponse.json(
        {
          error: "Wristband is no longer valid",
          status: wristband.status,
          message:
            wristband.status === "voided"
              ? "This wristband has been voided. Please reprint a new wristband for this patient."
              : "This wristband has been replaced. Please use the latest wristband.",
        },
        { status: 410 },
      );
    }

    const p = wristband.patient;
    const fullName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
    const age = p.dateOfBirth
      ? Math.abs(new Date(Date.now() - new Date(p.dateOfBirth).getTime()).getUTCFullYear() - 1970)
      : null;

    return NextResponse.json({
      valid: true,
      wristband: {
        id: wristband.id,
        token: wristband.token,
        status: wristband.status,
        printCount: wristband.printCount,
        firstPrintedAt: wristband.firstPrintedAt,
        lastPrintedAt: wristband.lastPrintedAt,
      },
      patient: {
        fullName,
        patientNumber: p.patientNumber,
        dateOfBirth: p.dateOfBirth,
        age,
        sex: p.sex,
        bloodGroup: p.bloodGroup,
        photoUrl: p.photoUrl,
        allergies: p.allergies,
        hasAllergyAlert: p.allergies.length > 0,
      },
      encounter: wristband.encounter
        ? {
            encounterNumber: wristband.encounter.encounterNumber,
            encounterType: wristband.encounter.encounterType,
            status: wristband.encounter.status,
            priority: wristband.encounter.priority,
            department: wristband.encounter.department,
          }
        : null,
      facility: wristband.facility,
      // Verification timestamp for audit displays
      verifiedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error(`[GET /api/patient-wristbands/verify/${token.slice(0, 8)}...]`, e);
    return NextResponse.json({ error: e.message || "Failed to verify wristband" }, { status: 500 });
  }
}

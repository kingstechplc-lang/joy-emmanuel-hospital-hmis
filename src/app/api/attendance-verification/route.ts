// =====================================================================
// API: /api/attendance-verification
//   GET  — list attendance verification records
//   POST — capture a new attendance verification (CCC / OTAC / biometric)
//
// CRITICAL: CCC ≠ OTAC ≠ BIOMETRIC (section 15 of master prompt).
// Each method has its own semantics:
//   CCC      — Claim Center Code (issued at NHIA-accredited facility, long-lived)
//   OTAC     — One-Time Attendance Code (short-lived, single-use)
//   BIOMETRIC — Fingerprint/face match against NHIA member registry
//   OTHER    — Any other mechanism (e.g., card scan)
//   NOT_REQUIRED — For non-NHIS encounters where attendance verification is not applicable
//
// REPLAY PROTECTION (section 17):
//   OTAC codes are hashed and stored. The same OTAC cannot be used for two encounters.
//   CCC codes can be reused (they're facility-scoped, not single-use), but the same
//   encounter cannot have two active attendance records.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { createHash } from "crypto";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const ALLOWED_METHODS = new Set(["CCC", "OTAC", "BIOMETRIC", "OTHER", "NOT_REQUIRED"]);
const ALLOWED_STATUSES = new Set(["pending", "verified", "failed", "not_required", "expired"]);
const ALLOWED_SOURCES = new Set(["nhia_integration", "manual", "external", "local", "other"]);

// Hash a verification code for replay-duplicate detection.
// We use SHA-256 with a static salt prefix — this is NOT for password security,
// it's only to detect duplicate OTAC reuse without storing the code in plaintext.
function hashCode(code: string): string {
  return createHash("sha256").update(`nhia-attendance::${code}`).digest("hex");
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_VERIFICATION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const encounterId = url.searchParams.get("encounterId");
  const patientId = url.searchParams.get("patientId");
  const method = url.searchParams.get("method");
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (encounterId) where.encounterId = encounterId;
  if (patientId) where.patientId = patientId;
  if (method) where.method = method;
  if (status) where.verificationStatus = status;

  const items = await db.attendanceVerification.findMany({
    where,
    orderBy: { capturedAt: "desc" },
    take: limit,
    include: {
      encounter: {
        select: {
          id: true, encounterNumber: true, encounterType: true, startAt: true,
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_VERIFICATION_CAPTURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    encounterId, patientInsuranceId,
    method, code, transactionRef,
    verificationStatus, expiresAt,
    source, resultMessage, responseData,
  } = body;

  // --- Validation ---
  if (!encounterId) return NextResponse.json({ error: "encounterId is required" }, { status: 400 });
  if (!method || !ALLOWED_METHODS.has(method)) {
    return NextResponse.json({ error: `Invalid method. Allowed: ${[...ALLOWED_METHODS].join(", ")}` }, { status: 400 });
  }
  if (verificationStatus && !ALLOWED_STATUSES.has(verificationStatus)) {
    return NextResponse.json({ error: `Invalid verificationStatus. Allowed: ${[...ALLOWED_STATUSES].join(", ")}` }, { status: 400 });
  }
  if (source && !ALLOWED_SOURCES.has(source)) {
    return NextResponse.json({ error: `Invalid source. Allowed: ${[...ALLOWED_SOURCES].join(", ")}` }, { status: 400 });
  }

  // Code is required for CCC/OTAC/BIOMETRIC, optional for OTHER, not allowed for NOT_REQUIRED
  if (method !== "NOT_REQUIRED" && !code && method !== "OTHER") {
    return NextResponse.json({ error: `code is required for method '${method}'` }, { status: 400 });
  }
  if (method === "NOT_REQUIRED" && code) {
    return NextResponse.json({ error: "code must not be provided when method is NOT_REQUIRED" }, { status: 400 });
  }

  // Fetch encounter with facility
  const encounter = await db.encounter.findUnique({
    where: { id: encounterId },
    include: { facility: true },
  });
  if (!encounter) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
  if (encounter.facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden — encounter belongs to different organization" }, { status: 403 });
  }

  // --- Replay protection (section 17) ---
  // For OTAC: the same code cannot be used for two different encounters.
  // For CCC: the same code can be reused (facility-scoped), but one encounter cannot have two active attendance records.
  if (method === "OTAC" && code) {
    const codeHash = hashCode(code);
    const existingOTAC = await db.attendanceVerification.findFirst({
      where: {
        codeHash,
        organizationId: session.user.organizationId,
        id: { not: undefined },
      },
    });
    if (existingOTAC) {
      return NextResponse.json({
        error: "OTAC replay detected — this code has already been used for another encounter.",
        existingAttendanceId: existingOTAC.id,
        existingEncounterId: existingOTAC.encounterId,
      }, { status: 409 });
    }
  }

  // --- One active attendance record per encounter (upsert behaviour) ---
  const existing = await db.attendanceVerification.findUnique({
    where: { encounterId },
  });

  if (existing && existing.verificationStatus === "verified") {
    return NextResponse.json({
      error: "Encounter already has a verified attendance record. Cannot create a new one.",
      existingAttendanceId: existing.id,
    }, { status: 409 });
  }

  // --- Build record ---
  const codeHash = code ? hashCode(code) : null;
  const finalStatus = verificationStatus || (method === "NOT_REQUIRED" ? "not_required" : "pending");
  const finalSource = source || "local";
  const verifiedAt = finalStatus === "verified" ? new Date() : null;

  const data = {
    organizationId: session.user.organizationId,
    facilityId: encounter.facilityId,
    encounterId,
    patientId: encounter.patientId,
    patientInsuranceId: patientInsuranceId || null,
    method,
    code: code || null,
    codeHash,
    transactionRef: transactionRef || null,
    verificationStatus: finalStatus,
    verifiedAt,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    source: finalSource,
    resultMessage: resultMessage || null,
    responseData: responseData ? (typeof responseData === "string" ? responseData : JSON.stringify(responseData)) : null,
    capturedById: session.user.id,
    capturedByName: session.user.name || session.user.username,
  };

  let item;
  if (existing) {
    // Update the existing record (it was pending/failed — now being updated)
    item = await db.attendanceVerification.update({
      where: { id: existing.id },
      data,
    });
  } else {
    item = await db.attendanceVerification.create({ data });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: encounter.facilityId,
    action: "ATTENDANCE_VERIFICATION_CAPTURED",
    resourceType: "attendanceVerification",
    resourceId: item.id,
    newValues: {
      encounterId, method, verificationStatus: finalStatus,
      hasCode: !!code, source: finalSource,
    },
  });

  return NextResponse.json({ item }, { status: existing ? 200 : 201 });
}

// =====================================================================
// API: /api/patient-wristbands
//   GET    — list wristbands (filter by facility/patient/encounter/status)
//   POST   — mint a new wristband for a patient (+ optional encounterId)
//
// PERMISSIONS:
//   GET     requires  wristband.print  (anyone who can print can view history)
//   POST    requires  wristband.print  (minting a new wristband IS printing)
//
// The POST endpoint:
//   1. Generates an opaque token via crypto.randomUUID
//   2. Calls assembleWristbandContent to build the snapshot (patient +
//      allergies + encounter + facility branding + QR payload URL)
//   3. Persists a PatientWristband row with status="active"
//   4. Audit-logs the minting
//   5. Returns the full wristband record (with content + relations)
//
// Note: A patient can have multiple wristbands over time (the previous
// one is auto-marked "replaced" when a new one is minted IF the caller
// passes replaceId). Without replaceId, the old wristbands stay active
// — this supports printing multiple copies for the same patient at
// different units (e.g., one for the wrist, one for the chart).
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  assembleWristbandContent,
  generateWristbandToken,
} from "@/lib/wristband/assembler";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_STATUSES = ["active", "replaced", "voided"];

// GET /api/patient-wristbands?facilityId=...&patientId=...&encounterId=...&status=...&limit=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.WRISTBAND_PRINT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId") || undefined;
  const encounterId = url.searchParams.get("encounterId") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "100");

  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (patientId) where.patientId = patientId;
  if (encounterId) where.encounterId = encounterId;
  if (status) where.status = status;

  try {
    const items = await db.patientWristband.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 500),
      include: {
        patient: {
          select: {
            id: true, patientNumber: true, firstName: true, lastName: true,
            dateOfBirth: true, sex: true, bloodGroup: true,
          },
        },
        encounter: {
          select: { id: true, encounterNumber: true, encounterType: true, status: true, startAt: true },
        },
        // Include facility.organization.logoUrl so reprints of existing
        // wristbands can render the brand logo.
        facility: {
          select: {
            id: true, name: true, code: true, phone: true,
            organization: { select: { logoUrl: true } },
          },
        },
        firstPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        lastPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        replacedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ items, count: items.length });
  } catch (e: any) {
    console.error("[GET /api/patient-wristbands]", e);
    return NextResponse.json({ error: e.message || "Failed to load wristbands" }, { status: 500 });
  }
}

// POST /api/patient-wristbands
//   Body: { patientId: string, encounterId?: string, replaceId?: string }
//   Returns: { ...wristband, content }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.WRISTBAND_PRINT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { patientId, encounterId, replaceId } = body;
  if (!patientId) {
    return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  }

  try {
    // If replaceId was provided, validate it belongs to the same patient
    // and is currently active — we'll mark it as 'replaced' below.
    let toReplace: any = null;
    if (replaceId) {
      toReplace = await db.patientWristband.findUnique({ where: { id: replaceId } });
      if (!toReplace) {
        return NextResponse.json({ error: "Wristband to replace not found" }, { status: 404 });
      }
      if (toReplace.patientId !== patientId) {
        return NextResponse.json({ error: "Cannot replace a wristband that belongs to a different patient" }, { status: 400 });
      }
      if (toReplace.status !== "active") {
        return NextResponse.json({ error: `Cannot replace a wristband in '${toReplace.status}' status (must be active)` }, { status: 409 });
      }
    }

    // Generate an opaque token and build the QR payload
    const token = generateWristbandToken();

    // Resolve the public origin for QR codes. We use the request URL's
    // origin so the QR code resolves to the deployed app (e.g.,
    // https://joy-emmanuel-hospital-hmis.example.com/wb/<token>).
    const origin = new URL(req.url).origin;

    // Assemble the content snapshot
    const assembled = await assembleWristbandContent(patientId, encounterId, token, origin);

    // Persist the new wristband row
    const created = await db.patientWristband.create({
      data: {
        organizationId: assembled.organizationId,
        facilityId: assembled.facilityId,
        patientId,
        encounterId: assembled.encounterId,
        token,
        tokenExpiresAt: null, // No expiry by default; wristbands last until replaced
        status: "active",
        firstPrintedById: session.user.id,
        firstPrintedAt: new Date(),
        lastPrintedById: session.user.id,
        lastPrintedAt: new Date(),
        printCount: 1,
      },
      include: {
        patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, bloodGroup: true } },
        encounter: { select: { id: true, encounterNumber: true, encounterType: true, status: true, startAt: true } },
        facility: {
          select: {
            id: true, name: true, code: true, phone: true,
            organization: { select: { logoUrl: true } },
          },
        },
        firstPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        lastPrintedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // If a replaceId was provided, mark the old wristband as replaced
    if (toReplace) {
      await db.patientWristband.update({
        where: { id: toReplace.id },
        data: {
          status: "replaced",
          replacedById: session.user.id,
          replacedAt: new Date(),
          replacementReason: body.replacementReason || "Replaced with new wristband",
        },
      });
    }

    await auditLog({
      userId: session.user.id,
      organizationId: assembled.organizationId,
      facilityId: assembled.facilityId,
      action: toReplace ? "wristband.replace" : "wristband.create",
      resourceType: "PatientWristband",
      resourceId: created.id,
      newValues: { patientId, encounterId, token: token.slice(0, 8) + "...", replacedId: toReplace?.id || null },
    });

    return NextResponse.json(
      { ...created, content: assembled.content },
      { status: 201 },
    );
  } catch (e: any) {
    console.error("[POST /api/patient-wristbands]", e);
    return NextResponse.json({ error: e.message || "Failed to mint wristband" }, { status: 500 });
  }
}

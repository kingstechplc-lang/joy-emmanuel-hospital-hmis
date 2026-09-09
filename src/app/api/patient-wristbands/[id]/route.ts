// =====================================================================
// API: /api/patient-wristbands/[id]
//   GET    — fetch a single wristband (with full content snapshot + relations)
//   PATCH  — lifecycle: reprint | void
//
// PERMISSIONS:
//   GET     requires  wristband.print
//   PATCH   action=reprint  requires wristband.reprint
//            action=void     requires wristband.reprint
//
// Reprint increments the printCount and updates lastPrintedBy/lastPrintedAt.
// Void sets status to 'voided' and clears the token's effective validity.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_ACTIONS = ["reprint", "void"];
const VALID_STATUSES = ["active", "replaced", "voided"];

// GET /api/patient-wristbands/[id]
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.WRISTBAND_PRINT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const wristband = await db.patientWristband.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true, patientNumber: true, firstName: true, lastName: true,
            middleName: true, dateOfBirth: true, sex: true, bloodGroup: true,
            phone: true, photoUrl: true,
          },
        },
        encounter: {
          select: {
            id: true, encounterNumber: true, encounterType: true, status: true,
            startAt: true, priority: true, departmentId: true,
          },
        },
        firstPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        lastPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        replacedBy: { select: { id: true, firstName: true, lastName: true } },
        facility: { select: { id: true, name: true, code: true, phone: true } },
      },
    });

    if (!wristband) {
      return NextResponse.json({ error: "Wristband not found" }, { status: 404 });
    }

    // Facility scoping check (non-super_admin)
    if (session.user.facilityId && wristband.facilityId !== session.user.facilityId) {
      if (!session.user.roles?.includes("super_admin")) {
        return NextResponse.json({ error: "Forbidden — wristband belongs to another facility" }, { status: 403 });
      }
    }

    return NextResponse.json(wristband);
  } catch (e: any) {
    console.error(`[GET /api/patient-wristbands/${id}]`, e);
    return NextResponse.json({ error: e.message || "Failed to fetch wristband" }, { status: 500 });
  }
}

// PATCH /api/patient-wristbands/[id]
//   Body: { action: "reprint" | "void", reason?: string }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.WRISTBAND_REPRINT)) {
    return NextResponse.json({ error: "Forbidden — reprint requires wristband.reprint" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${VALID_ACTIONS.join(", ")}` }, { status: 400 });
  }

  try {
    const existing = await db.patientWristband.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Wristband not found" }, { status: 404 });
    }

    // Facility scoping
    if (session.user.facilityId && existing.facilityId !== session.user.facilityId) {
      if (!session.user.roles?.includes("super_admin")) {
        return NextResponse.json({ error: "Forbidden — wristband belongs to another facility" }, { status: 403 });
      }
    }

    const oldValues = {
      status: existing.status,
      printCount: existing.printCount,
      lastPrintedAt: existing.lastPrintedAt,
    };

    if (action === "reprint") {
      if (existing.status !== "active") {
        return NextResponse.json(
          { error: `Cannot reprint a wristband in '${existing.status}' status (must be active)` },
          { status: 409 },
        );
      }
      const now = new Date();
      const updated = await db.patientWristband.update({
        where: { id },
        data: {
          printCount: existing.printCount + 1,
          lastPrintedAt: now,
          lastPrintedById: session.user.id,
        },
        include: {
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, bloodGroup: true } },
          encounter: { select: { id: true, encounterNumber: true, encounterType: true, status: true, startAt: true } },
          firstPrintedBy: { select: { id: true, firstName: true, lastName: true } },
          lastPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await auditLog({
        userId: session.user.id,
        organizationId: existing.organizationId,
        facilityId: existing.facilityId,
        action: "wristband.reprint",
        resourceType: "PatientWristband",
        resourceId: id,
        oldValues,
        newValues: { printCount: updated.printCount, lastPrintedAt: updated.lastPrintedAt },
      });

      return NextResponse.json(updated);
    }

    // action === "void"
    if (!body.reason || !String(body.reason).trim()) {
      return NextResponse.json({ error: "Void reason is required" }, { status: 400 });
    }
    if (existing.status === "voided") {
      return NextResponse.json({ error: "Wristband is already voided" }, { status: 409 });
    }

    const updated = await db.patientWristband.update({
      where: { id },
      data: {
        status: "voided",
        replacementReason: String(body.reason).trim(), // reuse this column for void reason
        replacedById: session.user.id,
        replacedAt: new Date(),
      },
      include: {
        patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, bloodGroup: true } },
        encounter: { select: { id: true, encounterNumber: true, encounterType: true, status: true, startAt: true } },
        firstPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        lastPrintedBy: { select: { id: true, firstName: true, lastName: true } },
        replacedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: existing.organizationId,
      facilityId: existing.facilityId,
      action: "wristband.void",
      resourceType: "PatientWristband",
      resourceId: id,
      oldValues,
      newValues: { status: "voided", reason: body.reason },
      reason: body.reason,
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error(`[PATCH /api/patient-wristbands/${id}]`, e);
    return NextResponse.json({ error: e.message || "Failed to update wristband" }, { status: 500 });
  }
}

export { VALID_ACTIONS, VALID_STATUSES };

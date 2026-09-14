// =====================================================================
// API: /api/lab-orders/[id]/release-to-patient
//   POST — clinician explicitly releases the lab order's results to the
//          patient portal (sets `releasedToPatientAt` + `releasedToPatientById`)
//
// PERMISSIONS: requires `lab_order.view` — same permission that lets a
// clinician see lab results. (We deliberately don't require a separate
// permission because releasing results to the patient is a natural
// extension of viewing them, and clinicians will click this button
// from the lab order detail view they already have access to.)
//
// Body: { reason?: string }   // optional — captured in audit log
//
// Returns: { ok: true, releasedAt: <iso>, releasedById: <userId> }
// Idempotent — if already released, returns the existing release info.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog, getClientIp, getUserAgent, AUDIT_ACTIONS } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LAB_VIEW)) {
    return NextResponse.json({ error: "Forbidden — requires lab_order.view" }, { status: 403 });
  }

  const { id } = await params;

  let body: any = {};
  try {
    const text = await req.text();
    if (text && text.trim()) body = JSON.parse(text);
  } catch { /* ignore — body is optional */ }
  const reason: string | undefined = body.reason ? String(body.reason) : undefined;

  const order = await db.labOrder.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      patientId: true,
      status: true,
      releasedToPatientAt: true,
      releasedToPatientById: true,
      facilityId: true,
      items: { select: { id: true, testName: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Lab order not found" }, { status: 404 });
  }

  // Facility scoping check (mirrors other lab-order endpoints)
  if (session.user.facilityId && order.facilityId !== session.user.facilityId) {
    if (!session.user.roles?.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden — order belongs to another facility" }, { status: 403 });
    }
  }

  // Idempotent — if already released, return existing release info
  if (order.releasedToPatientAt) {
    return NextResponse.json({
      ok: true,
      alreadyReleased: true,
      releasedAt: order.releasedToPatientAt,
      releasedById: order.releasedToPatientById,
    });
  }

  // Status validation: results must be at least "released" (clinician
  // has seen them). Don't allow releasing orders still in processing.
  const ALLOWED_STATUSES = ["resulted", "verified", "released"];
  if (!ALLOWED_STATUSES.includes(order.status)) {
    return NextResponse.json(
      {
        error: `Cannot release an order in '${order.status}' status. Order must be at least 'resulted'.`,
      },
      { status: 409 }
    );
  }

  // Update the order
  const updated = await db.labOrder.update({
    where: { id },
    data: {
      releasedToPatientAt: new Date(),
      releasedToPatientById: session.user.id,
    },
    select: {
      releasedToPatientAt: true,
      releasedToPatientById: true,
    },
  });

  // Audit log — this is a security-relevant event (data release to a
  // patient portal) so severity is "notice" not "info"
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: order.facilityId,
    action: "LAB_RESULT_RELEASED_TO_PATIENT",
    actionCategory: "LAB",
    severity: "notice",
    source: "lab",
    resourceType: "lab_order",
    resourceId: order.id,
    newValues: {
      orderNumber: order.orderNumber,
      patientId: order.patientId,
      releasedAt: updated.releasedToPatientAt,
      itemCount: order.items.length,
      reason: reason || null,
    },
    ipAddress: getClientIp(req) || undefined,
    userAgent: getUserAgent(req) || undefined,
    reason: reason || "Released lab results to patient portal",
  });

  return NextResponse.json({
    ok: true,
    releasedAt: updated.releasedToPatientAt,
    releasedById: updated.releasedToPatientById,
  });
}

// =====================================================================
// API: /api/immunizations/[id]
//   GET    — single immunization record with full relations
//   PATCH  — update (e.g., add notes, change status to missed/declined)
//   DELETE — soft-cancel (sets status to cancelled; never hard-deletes)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMMUNIZATION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const immunization = await db.immunization.findUnique({
    where: { id },
    include: {
      patient: {
        select: {
          id: true, patientNumber: true, firstName: true, lastName: true,
          dateOfBirth: true, sex: true, phone: true,
        },
      },
      facility: { select: { id: true, name: true } },
      administeredBy: { select: { id: true, firstName: true, lastName: true } },
      vaccineCatalog: { select: { id: true, code: true, name: true } },
      aefiRecords: {
        orderBy: { reportedAt: "desc" },
        include: {
          reportedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!immunization) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item: immunization });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMMUNIZATION_RECORD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const existing = await db.immunization.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowedFields = [
    "dose", "doseNumber", "route", "site", "notes", "status",
    "indication", "nextDueAt", "consentStatus", "guardianName",
    "deferralReason", "deferredUntil", "declineReason",
    "recallStatus", "recalledAt",
  ];

  const data: any = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === "nextDueAt" || field === "deferredUntil" || field === "recalledAt") {
        data[field] = body[field] ? new Date(body[field]) : null;
      } else {
        data[field] = body[field];
      }
    }
  }

  // If status changes to declined/deferred/contraindicated, capture reason
  if (body.status === "declined" && body.declineReason) {
    data.declineReason = body.declineReason;
  }
  if (body.status === "deferred" && body.deferralReason) {
    data.deferralReason = body.deferralReason;
    data.deferredUntil = body.deferredUntil ? new Date(body.deferredUntil) : null;
  }

  const updated = await db.immunization.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "IMMUNIZATION_UPDATED",
    resourceType: "immunization",
    resourceId: id,
    oldValues: { status: existing.status, notes: existing.notes },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}

// DELETE — soft-cancel only (never hard-delete clinical history)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMMUNIZATION_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.immunization.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cancel instead of delete — preserve clinical history
  const updated = await db.immunization.update({
    where: { id },
    data: { status: "cancelled" },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "IMMUNIZATION_CANCELLED",
    resourceType: "immunization",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status: "cancelled" },
  });

  return NextResponse.json({ item: updated });
}

// =====================================================================
// API: /api/immunizations/[id]/aefi
//   GET  — list AEFI records for an immunization
//   POST — create a new AEFI report
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
  const aefiRecords = await db.aEFI.findMany({
    where: { immunizationId: id },
    orderBy: { reportedAt: "desc" },
    include: {
      reportedBy: { select: { id: true, firstName: true, lastName: true } },
      reviewedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: aefiRecords, count: aefiRecords.length });
}

// POST /api/immunizations/[id]/aefi
// Body: { onsetAt, symptoms, severity?, actionTaken?, treatment?, outcome?, notes? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMMUNIZATION_AEFI)) {
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

  const { onsetAt, symptoms, severity, actionTaken, treatment, outcome, notes, status } = body;

  if (!onsetAt || !symptoms) {
    return NextResponse.json(
      { error: "onsetAt and symptoms are required" },
      { status: 400 }
    );
  }

  // Load the immunization to get patientId + facilityId
  const immunization = await db.immunization.findUnique({
    where: { id },
    select: { id: true, patientId: true, facilityId: true, vaccineName: true },
  });
  if (!immunization) return NextResponse.json({ error: "Immunization not found" }, { status: 404 });

  const aefi = await db.aEFI.create({
    data: {
      immunizationId: id,
      patientId: immunization.patientId,
      facilityId: immunization.facilityId,
      onsetAt: new Date(onsetAt),
      reportedById: session.user.id,
      symptoms,
      severity: severity || "mild",
      actionTaken: actionTaken || null,
      treatment: treatment || null,
      outcome: outcome || null,
      status: status || "open",
      followUpNotes: notes || null,
    },
    include: {
      reportedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: immunization.facilityId,
    action: "AEFI_REPORTED",
    resourceType: "aefi",
    resourceId: aefi.id,
    newValues: {
      immunizationId: id,
      vaccineName: immunization.vaccineName,
      severity: aefi.severity,
      symptoms: symptoms.slice(0, 200),
    },
  });

  return NextResponse.json({ item: aefi }, { status: 201 });
}

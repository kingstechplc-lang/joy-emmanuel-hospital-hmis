// =====================================================================
// API: /api/encounters/[id]
//   GET   — single encounter with all related clinical records
//   PATCH — update status (open|in_progress|completed|cancelled|admitted|discharged)
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
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const encounter = await db.encounter.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true, bloodGroup: true } },
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true } },
      triageRecords: { orderBy: { recordedAt: "desc" }, take: 5 },
      vitalSigns: { orderBy: { recordedAt: "desc" }, take: 10 },
      consultations: { orderBy: { createdAt: "desc" }, include: { clinician: { select: { id: true, firstName: true, lastName: true } } }, take: 10 },
      diagnoses: { orderBy: { diagnosedAt: "desc" }, take: 20 },
      prescriptions: { orderBy: { prescribedAt: "desc" }, include: { items: { include: { medication: true } } }, take: 10 },
      labOrders: { orderBy: { orderedAt: "desc" }, include: { items: { include: { laboratoryTest: true, results: true } } }, take: 10 },
      imagingOrders: { orderBy: { orderedAt: "desc" }, take: 10 },
      procedures: { orderBy: { performedAt: "desc" }, take: 10 },
      admissions: { orderBy: { admittedAt: "desc" }, take: 5 },
      nursingNotes: { orderBy: { createdAt: "desc" }, take: 10 },
      invoices: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!encounter) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });

  return NextResponse.json({ item: encounter });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_EDIT) && !hasPermission(session, PERMISSIONS.ENCOUNTER_CLOSE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { status, priority, attendingStaffId, departmentId } = body;

  const existing = await db.encounter.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });

  const canClose = hasPermission(session, PERMISSIONS.ENCOUNTER_CLOSE);
  if (status && ["completed", "cancelled", "discharged"].includes(status) && !canClose) {
    return NextResponse.json({ error: "Missing encounter.close permission" }, { status: 403 });
  }

  const data: any = {};
  if (status) {
    data.status = status;
    if (status === "completed" || status === "cancelled") data.endAt = new Date();
  }
  if (priority) data.priority = priority;
  if (attendingStaffId) data.attendingStaffId = attendingStaffId;
  if (departmentId) data.departmentId = departmentId;

  const updated = await db.encounter.update({
    where: { id },
    data,
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "ENCOUNTER_UPDATED",
    resourceType: "encounter",
    resourceId: id,
    oldValues: { status: existing.status, priority: existing.priority },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}

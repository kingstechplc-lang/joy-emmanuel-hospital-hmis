// =====================================================================
// API: /api/encounter-coverage/[id]
//   GET    — fetch single encounter coverage record
//   PATCH  — update fields (e.g., add insuranceAuthorizationId after pre-auth)
//   DELETE — cancel coverage (soft delete — sets status=cancelled)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_COVERAGE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const item = await db.encounterCoverage.findUnique({
    where: { id },
    include: { encounter: { select: { id: true, encounterNumber: true, patientId: true } } },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_COVERAGE_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.encounterCoverage.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const allowedFields = [
    "patientInsuranceId", "insuranceProviderId", "insurancePlanId", "insuranceAuthorizationId",
    "coveragePercentage", "patientCopay", "patientResponsibility", "payerResponsibility",
    "notes", "status",
  ];
  const updateData: any = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }

  const item = await db.encounterCoverage.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "ENCOUNTER_COVERAGE_UPDATED",
    resourceType: "encounterCoverage",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({ item });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_COVERAGE_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.encounterCoverage.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft-delete — set status=cancelled
  const item = await db.encounterCoverage.update({
    where: { id },
    data: { status: "cancelled" },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "ENCOUNTER_COVERAGE_CANCELLED",
    resourceType: "encounterCoverage",
    resourceId: id,
  });

  return NextResponse.json({ item });
}

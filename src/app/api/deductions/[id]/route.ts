// =====================================================================
// API: /api/deductions/[id]
//   GET / PATCH / DELETE (soft delete — set active=false)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PAYROLL_VIEW) && !hasPermission(session, PERMISSIONS.FINANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const item = await db.deduction.findUnique({
    where: { id },
    include: {
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
  });

  if (!item || item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ item: { ...item, amount: item.amount.toNumber() } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DEDUCTION_MANAGE) && !hasPermission(session, PERMISSIONS.COMPENSATION_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.deduction.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const updateData: any = {};
  const allowedFields = [
    "name", "code", "deductionType", "amount", "percentage",
    "isStatutory", "isRecurring", "priority", "requiresApproval", "active",
  ];
  for (const f of allowedFields) {
    if (body[f] !== undefined) updateData[f] = body[f];
  }
  if (body.facilityId !== undefined) updateData.facilityId = body.facilityId || null;
  if (body.departmentId !== undefined) updateData.departmentId = body.departmentId || null;
  if (body.effectiveFrom !== undefined) updateData.effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : null;
  if (body.effectiveTo !== undefined) updateData.effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;

  delete updateData.id;
  delete updateData.organizationId;

  const updated = await db.deduction.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "DEDUCTION_UPDATED",
    resourceType: "deduction",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({ item: { ...updated, amount: updated.amount.toNumber() } });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DEDUCTION_MANAGE) && !hasPermission(session, PERMISSIONS.COMPENSATION_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.deduction.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft delete — just deactivate
  await db.deduction.update({ where: { id }, data: { active: false } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "DEDUCTION_DEACTIVATED",
    resourceType: "deduction",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}

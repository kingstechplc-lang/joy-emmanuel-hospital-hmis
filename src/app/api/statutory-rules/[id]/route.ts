// =====================================================================
// API: /api/statutory-rules/[id]
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
  if (!hasPermission(session, PERMISSIONS.PAYROLL_VIEW) && !hasPermission(session, PERMISSIONS.FINANCE_VIEW) && !hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const item = await db.statutoryRule.findUnique({
    where: { id },
    include: { facility: { select: { id: true, name: true } } },
  });

  if (!item || item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      ...item,
      fixedAmount: item.fixedAmount ? item.fixedAmount.toNumber() : null,
      threshold: item.threshold ? item.threshold.toNumber() : null,
      cap: item.cap ? item.cap.toNumber() : null,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STATUTORY_RULE_MANAGE) && !hasPermission(session, PERMISSIONS.COMPENSATION_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE) && !hasPermission(session, PERMISSIONS.FINANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.statutoryRule.findUnique({ where: { id } });
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
    "name", "code", "ruleType", "calculationType", "rate", "fixedAmount",
    "threshold", "cap", "borneBy", "employerRate", "active", "notes",
  ];
  for (const f of allowedFields) {
    if (body[f] !== undefined) updateData[f] = body[f];
  }
  if (body.brackets !== undefined) {
    updateData.brackets = body.brackets === null ? null : (typeof body.brackets === "string" ? body.brackets : JSON.stringify(body.brackets));
  }
  if (body.facilityId !== undefined) updateData.facilityId = body.facilityId || null;
  if (body.effectiveFrom !== undefined) updateData.effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : null;
  if (body.effectiveTo !== undefined) updateData.effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;

  delete updateData.id;
  delete updateData.organizationId;

  const updated = await db.statutoryRule.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "STATUTORY_RULE_UPDATED",
    resourceType: "statutory_rule",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({
    item: {
      ...updated,
      fixedAmount: updated.fixedAmount ? updated.fixedAmount.toNumber() : null,
      threshold: updated.threshold ? updated.threshold.toNumber() : null,
      cap: updated.cap ? updated.cap.toNumber() : null,
    },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STATUTORY_RULE_MANAGE) && !hasPermission(session, PERMISSIONS.COMPENSATION_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE) && !hasPermission(session, PERMISSIONS.FINANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.statutoryRule.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft delete — just deactivate
  await db.statutoryRule.update({ where: { id }, data: { active: false } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "STATUTORY_RULE_DEACTIVATED",
    resourceType: "statutory_rule",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}

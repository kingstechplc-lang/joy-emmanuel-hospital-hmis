// API: /api/certifications/[id]/reactivate — POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_APPROVE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.certification.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["suspended", "revoked"].includes(existing.status)) return NextResponse.json({ error: "Only suspended or revoked certifications can be reactivated." }, { status: 400 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  if (!body.reason) return NextResponse.json({ error: "A reason is required to reactivate a certification." }, { status: 400 });
  await db.$transaction(async (tx) => {
    await tx.certification.update({ where: { id }, data: { status: "active", reactivatedAt: new Date(), reactivatedReason: body.reason, reactivatedById: session.user.id } });
    await tx.certificationStatusHistory.create({ data: { certificationId: id, previousStatus: existing.status, newStatus: "active", changedById: session.user.id, reason: body.reason } });
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_REACTIVATED", resourceType: "certification", resourceId: id, reason: body.reason });
  return NextResponse.json({ item: { id, status: "active" } });
}

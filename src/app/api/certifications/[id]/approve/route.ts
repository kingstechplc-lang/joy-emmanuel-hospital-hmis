// API: /api/certifications/[id]/approve — POST
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
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  await db.$transaction(async (tx) => {
    await tx.certification.update({ where: { id }, data: { status: "active" } });
    await tx.certificationStatusHistory.create({ data: { certificationId: id, previousStatus: existing.status, newStatus: "active", changedById: session.user.id, reason: body.reason || "Approved" } });
  });
  try {
    const staff = await db.staff.findUnique({ where: { id: existing.staffId }, select: { userId: true } });
    if (staff) {
      await db.notification.create({
        data: { userId: staff.userId, type: "certification_approved", title: "Certification Approved", message: `Your certification "${existing.certificationName}" has been approved and is now active.`, referenceType: "certification", referenceId: id },
      });
    }
  } catch (e) { console.error("Notification failed:", e); }
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_APPROVED", resourceType: "certification", resourceId: id, reason: body.reason });
  return NextResponse.json({ item: { id, status: "active" } });
}

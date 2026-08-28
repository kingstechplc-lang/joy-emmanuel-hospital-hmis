// API: /api/attendance/exceptions/[id]/resolve — POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_REVIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.attendanceException.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  const newStatus = body.status === "ignored" ? "ignored" : body.status === "escalated" ? "escalated" : "resolved";
  const updated = await db.attendanceException.update({
    where: { id },
    data: {
      status: newStatus,
      resolvedById: session.user.id,
      resolutionNote: body.note || body.reason || null,
      resolvedAt: new Date(),
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: `ATTENDANCE_EXCEPTION_${newStatus.toUpperCase()}`, resourceType: "attendance_exception", resourceId: id, reason: body.note || body.reason });
  return NextResponse.json({ item: updated });
}

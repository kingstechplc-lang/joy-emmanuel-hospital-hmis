// API: /api/attendance/overtime/[id]/approve — POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.OVERTIME_MANAGE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.overtimeRecord.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "pending") return NextResponse.json({ error: `Cannot approve overtime in status '${existing.status}'.` }, { status: 400 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  const updated = await db.overtimeRecord.update({
    where: { id },
    data: { status: "approved", approvedById: session.user.id, approvedAt: new Date() },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "OVERTIME_APPROVED", resourceType: "overtime_record", resourceId: id, reason: body.comment });
  return NextResponse.json({ item: updated });
}

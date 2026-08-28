// API: /api/coverage/[id]/complete — POST (mark coverage as fulfilled/cancelled)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COVERAGE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.coverageRequest.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  const newStatus = body.status === "cancelled" ? "cancelled" : "fulfilled";
  const updated = await db.coverageRequest.update({
    where: { id },
    data: { status: newStatus, notes: body.notes || existing.notes || "" },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: newStatus === "fulfilled" ? "COVERAGE_FULFILLED" : "COVERAGE_CANCELLED",
    resourceType: "coverage_request",
    resourceId: id,
    reason: body.reason,
  });

  return NextResponse.json({ item: updated });
}

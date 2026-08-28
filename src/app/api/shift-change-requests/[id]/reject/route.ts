// API: /api/shift-change-requests/[id]/reject — POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_SWAP_APPROVE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.shiftChangeRequest.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  // "changes_requested" returns for correction; "rejected" terminates
  const newStatus = body.changesRequested ? "changes_requested" : "rejected";

  const updated = await db.shiftChangeRequest.update({
    where: { id },
    data: {
      status: newStatus,
      reviewedById: session.user.id,
      reviewComment: body.comment || body.reason || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: newStatus === "rejected" ? "SHIFT_CHANGE_REJECTED" : "SHIFT_CHANGE_CHANGES_REQUESTED",
    resourceType: "shift_change_request",
    resourceId: id,
    reason: body.comment || body.reason,
  });

  return NextResponse.json({ item: updated });
}

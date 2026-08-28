// API: /api/shift-swaps/[id]/reject — POST (supervisor or target rejects)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_SWAP_APPROVE) && !hasPermission(session, PERMISSIONS.SHIFT_SWAP_REQUEST) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.shiftSwap.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  const updated = await db.shiftSwap.update({
    where: { id },
    data: {
      status: "rejected",
      rejectionReason: body.reason || "Rejected",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SHIFT_SWAP_REJECTED",
    resourceType: "shift_swap",
    resourceId: id,
    reason: body.reason,
  });

  return NextResponse.json({ item: updated });
}

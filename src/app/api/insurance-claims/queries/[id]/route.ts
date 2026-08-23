// =====================================================================
// API: /api/insurance-claims/queries/[id]
//   PATCH — respond to a query (close it)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_CLAIM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const existing = await db.claimQuery.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Query not found" }, { status: 404 });

  const updateData: any = {};
  if (body.response) { updateData.response = body.response; updateData.responseAt = new Date(); }
  if (body.status) updateData.status = body.status;
  if (body.assignedToName) updateData.assignedToName = body.assignedToName;

  const updated = await db.claimQuery.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "CLAIM_QUERY_UPDATED",
    resourceType: "claimQuery",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

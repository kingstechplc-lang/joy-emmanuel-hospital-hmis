// API: /api/training-certificates/[id]/revoke — POST (revoke with reason + audit)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_CERTIFICATE_MANAGE) && !hasPermission(session, PERMISSIONS.TRAINING_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.trainingCertificate.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  if (!body.reason) return NextResponse.json({ error: "A reason is required to revoke a certificate." }, { status: 400 });

  const updated = await db.trainingCertificate.update({
    where: { id },
    data: {
      status: "revoked",
      revokedAt: new Date(),
      revokedReason: body.reason,
      revokedById: session.user.id,
    },
  });

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "TRAINING_CERTIFICATE_REVOKED", resourceType: "training_certificate", resourceId: id, oldValues: { status: existing.status }, newValues: { status: "revoked", reason: body.reason }, reason: body.reason });
  return NextResponse.json({ item: updated });
}

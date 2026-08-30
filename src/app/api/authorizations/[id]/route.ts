// =====================================================================
// API: /api/authorizations/[id]
//   GET   — fetch single authorization
//   PATCH — update status (approve / reject / cancel)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const ALLOWED_STATUSES = new Set(["pending", "approved", "rejected", "expired", "cancelled"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_AUTHORIZATION_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const item = await db.insuranceAuthorization.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      insuranceProvider: { select: { id: true, name: true, code: true, organizationId: true } },
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.insuranceProvider?.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_AUTHORIZATION_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.insuranceAuthorization.findUnique({
    where: { id },
    include: { insuranceProvider: { select: { organizationId: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.insuranceProvider?.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.status && !ALLOWED_STATUSES.has(body.status)) {
    return NextResponse.json({ error: `Invalid status. Allowed: ${[...ALLOWED_STATUSES].join(", ")}` }, { status: 400 });
  }

  const allowedFields = [
    "status", "authorizedById", "expiryDate", "approvedService",
    "approvedQuantity", "approvedAmount", "authorizationNumber",
  ];
  const updateData: any = {};
  for (const f of allowedFields) {
    if (body[f] !== undefined) {
      updateData[f] = f === "expiryDate" && body[f] ? new Date(body[f]) : body[f];
    }
  }

  const item = await db.insuranceAuthorization.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "INSURANCE_AUTHORIZATION_UPDATED",
    resourceType: "insuranceAuthorization",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: updateData,
  });

  return NextResponse.json({ item });
}

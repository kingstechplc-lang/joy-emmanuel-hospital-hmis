// API: /api/certification-types — GET + POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const items = await db.certificationType.findMany({
    where: { organizationId: session.user.organizationId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, code, category, credentialType, description, isMandatory, defaultValidityMonths, requiresVerification, requiresApproval, allowsExpiry } = body;
  if (!name || !code) return NextResponse.json({ error: "name, code are required" }, { status: 400 });
  const existing = await db.certificationType.findUnique({ where: { organizationId_code: { organizationId: session.user.organizationId, code } } });
  if (existing) return NextResponse.json({ error: "Code already exists" }, { status: 409 });
  const item = await db.certificationType.create({
    data: {
      organizationId: session.user.organizationId,
      name, code, category: category || null,
      credentialType: credentialType || "certification",
      description, isMandatory: !!isMandatory,
      defaultValidityMonths: defaultValidityMonths ? parseInt(defaultValidityMonths, 10) : null,
      requiresVerification: requiresVerification !== false,
      requiresApproval: requiresApproval !== false,
      allowsExpiry: allowsExpiry !== false,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_TYPE_CREATED", resourceType: "certification_type", resourceId: item.id, newValues: { name, code } });
  return NextResponse.json({ item }, { status: 201 });
}

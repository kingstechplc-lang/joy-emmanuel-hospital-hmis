// API: /api/certification-issuers — GET + POST
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
  const items = await db.certificationIssuer.findMany({
    where: { organizationId: session.user.organizationId, active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_ISSUER_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, type, country, contactPerson, email, phone, website, address, accreditation, verificationUrl, notes } = body;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const item = await db.certificationIssuer.create({
    data: {
      organizationId: session.user.organizationId,
      name, type: type || null, country: country || null,
      contactPerson: contactPerson || null, email: email || null, phone: phone || null,
      website: website || null, address: address || null,
      accreditation: accreditation || null, verificationUrl: verificationUrl || null, notes: notes || null,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_ISSUER_CREATED", resourceType: "certification_issuer", resourceId: item.id, newValues: { name } });
  return NextResponse.json({ item }, { status: 201 });
}

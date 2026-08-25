// =====================================================================
// API: /api/insurance-providers/[id]/contacts
//   GET  — list contacts for a provider
//   POST — add a contact
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

async function getProvider(session: any, id: string) {
  const provider = await db.insuranceProvider.findUnique({ where: { id } });
  if (!provider || provider.organizationId !== session.user.organizationId) return null;
  return provider;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW) && !hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const provider = await getProvider(session, id);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const contacts = await db.providerContact.findMany({
    where: { insuranceProviderId: id },
    orderBy: { contactType: "asc" },
  });
  return NextResponse.json({ items: contacts, count: contacts.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const provider = await getProvider(session, id);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { contactType, name, position, phone, email, notes } = body;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const contact = await db.providerContact.create({
    data: {
      insuranceProviderId: id,
      contactType: contactType || "general",
      name,
      position: position || null,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
    },
  });
  await auditLog({
    userId: session.user.id, organizationId: session.user.organizationId,
    action: "PROVIDER_CONTACT_ADDED", resourceType: "insurance_provider", resourceId: id,
    newValues: { contactId: contact.id, contactType, name },
  });
  return NextResponse.json({ item: contact }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const url = new URL(req.url);
  const contactId = url.searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  await db.providerContact.delete({ where: { id: contactId, insuranceProviderId: id } });
  return NextResponse.json({ ok: true });
}

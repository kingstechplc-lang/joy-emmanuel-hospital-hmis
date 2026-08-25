// =====================================================================
// API: /api/lab-tests/[id]/aliases
//   GET    — list aliases for a test
//   POST   — add an alias
//   DELETE — remove an alias  (?aliasId=...)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { canViewCatalog, canManageCatalog, catalogAudit } from "@/lib/lab-catalog";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

async function getTest(session: any, id: string) {
  const test = await db.laboratoryTest.findUnique({ where: { id } });
  if (!test || test.organizationId !== session.user.organizationId) return null;
  return test;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewCatalog(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const test = await getTest(session, id);
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const items = await db.labTestAlias.findMany({ where: { laboratoryTestId: id }, orderBy: { alias: "asc" } });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const test = await getTest(session, id);
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { alias, aliasType } = body;
  if (!alias) return NextResponse.json({ error: "alias is required" }, { status: 400 });
  try {
    const item = await db.labTestAlias.create({
      data: { laboratoryTestId: id, alias, aliasType: aliasType || "synonym" },
    });
    await catalogAudit({ session, laboratoryTestId: id, action: "UPDATED", newValue: { aliasAdded: alias } });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Alias already exists for this test" }, { status: 409 });
    throw e;
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const test = await getTest(session, id);
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  const aliasId = url.searchParams.get("aliasId");
  if (!aliasId) return NextResponse.json({ error: "aliasId is required" }, { status: 400 });
  await db.labTestAlias.delete({ where: { id: aliasId, laboratoryTestId: id } });
  await catalogAudit({ session, laboratoryTestId: id, action: "UPDATED", newValue: { aliasRemoved: aliasId } });
  return NextResponse.json({ ok: true });
}

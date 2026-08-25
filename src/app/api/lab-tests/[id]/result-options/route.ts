// =====================================================================
// API: /api/lab-tests/[id]/result-options
//   GET    — list qualitative/categorical result options for a test
//   POST   — add a result option
//   PATCH  — update  (?optionId=...)
//   DELETE — remove  (?optionId=...)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
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
  const url = new URL(req.url);
  const isActive = url.searchParams.get("isActive");
  const where: any = { laboratoryTestId: id };
  if (isActive === "true") where.isActive = true;
  if (isActive === "false") where.isActive = false;
  const items = await db.labTestResultOption.findMany({ where, orderBy: { displayOrder: "asc" } });
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
  const { optionValue, optionLabel, isCritical, displayOrder, isActive } = body;
  if (!optionValue) return NextResponse.json({ error: "optionValue is required" }, { status: 400 });
  const item = await db.labTestResultOption.create({
    data: {
      laboratoryTestId: id,
      optionValue,
      optionLabel: optionLabel || null,
      isCritical: !!isCritical,
      displayOrder: typeof displayOrder === "number" ? displayOrder : 0,
      isActive: isActive !== undefined ? !!isActive : true,
    },
  });
  await catalogAudit({ session, laboratoryTestId: id, action: "UPDATED", newValue: { resultOptionAdded: item } });
  return NextResponse.json({ item }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const test = await getTest(session, id);
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  const optionId = url.searchParams.get("optionId");
  if (!optionId) return NextResponse.json({ error: "optionId is required" }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updated = await db.labTestResultOption.update({ where: { id: optionId, laboratoryTestId: id }, data: body });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const test = await getTest(session, id);
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  const optionId = url.searchParams.get("optionId");
  if (!optionId) return NextResponse.json({ error: "optionId is required" }, { status: 400 });
  await db.labTestResultOption.delete({ where: { id: optionId, laboratoryTestId: id } });
  return NextResponse.json({ ok: true });
}

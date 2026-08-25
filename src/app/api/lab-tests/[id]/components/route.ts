// =====================================================================
// API: /api/lab-tests/[id]/components
//   GET    — list components for a test (panel)
//   POST   — add a component
//   PATCH  — update a component  (?componentId=...)
//   DELETE — remove a component  (?componentId=...)
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
  const items = await db.labTestComponent.findMany({ where, orderBy: { displayOrder: "asc" } });
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
  const {
    componentName, componentCode, resultType, unit, referenceRange,
    criticalLow, criticalHigh, decimalPrecision, displayOrder, isActive,
  } = body;
  if (!componentName) return NextResponse.json({ error: "componentName is required" }, { status: 400 });
  const item = await db.labTestComponent.create({
    data: {
      laboratoryTestId: id,
      componentName,
      componentCode: componentCode || null,
      resultType: resultType || "numeric",
      unit: unit || null,
      referenceRange: referenceRange || null,
      criticalLow: typeof criticalLow === "number" ? criticalLow : null,
      criticalHigh: typeof criticalHigh === "number" ? criticalHigh : null,
      decimalPrecision: typeof decimalPrecision === "number" ? decimalPrecision : null,
      displayOrder: typeof displayOrder === "number" ? displayOrder : 0,
      isActive: isActive !== undefined ? !!isActive : true,
    },
  });
  await catalogAudit({ session, laboratoryTestId: id, action: "PANEL_CHANGED", newValue: { componentAdded: item } });
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
  const componentId = url.searchParams.get("componentId");
  if (!componentId) return NextResponse.json({ error: "componentId is required" }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updated = await db.labTestComponent.update({ where: { id: componentId, laboratoryTestId: id }, data: body });
  await catalogAudit({ session, laboratoryTestId: id, action: "PANEL_CHANGED", newValue: { componentUpdated: updated } });
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
  const componentId = url.searchParams.get("componentId");
  if (!componentId) return NextResponse.json({ error: "componentId is required" }, { status: 400 });
  await db.labTestComponent.delete({ where: { id: componentId, laboratoryTestId: id } });
  await catalogAudit({ session, laboratoryTestId: id, action: "PANEL_CHANGED", newValue: { componentRemoved: componentId } });
  return NextResponse.json({ ok: true });
}

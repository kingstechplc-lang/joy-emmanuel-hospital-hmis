// =====================================================================
// API: /api/lab-tests/[id]/panel-members
//   GET    — list panel members (component tests) for a panel test
//   POST   — add a component test to the panel
//   DELETE — remove a component test from the panel  (?componentTestId=...)
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
  const items = await db.labTestPanelMember.findMany({
    where: { panelTestId: id, isActive: true },
    include: { componentTest: { select: { id: true, name: true, code: true, unit: true, referenceRange: true, category: true } } },
    orderBy: { displayOrder: "asc" },
  });
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
  const { componentTestId, displayOrder } = body;
  if (!componentTestId) return NextResponse.json({ error: "componentTestId is required" }, { status: 400 });
  // Verify component test belongs to same org
  const component = await db.laboratoryTest.findUnique({ where: { id: componentTestId } });
  if (!component || component.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Component test not found in this organization" }, { status: 404 });
  }
  if (componentTestId === id) {
    return NextResponse.json({ error: "Cannot add a test as a member of itself" }, { status: 400 });
  }
  try {
    const item = await db.labTestPanelMember.create({
      data: {
        panelTestId: id,
        componentTestId,
        displayOrder: typeof displayOrder === "number" ? displayOrder : 0,
        isActive: true,
      },
    });
    // Ensure isPanel is true on the parent
    await db.laboratoryTest.update({ where: { id }, data: { isPanel: true } });
    await catalogAudit({ session, laboratoryTestId: id, action: "PANEL_CHANGED", newValue: { memberAdded: { componentTestId, name: component.name } } });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Component is already a member of this panel" }, { status: 409 });
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
  const componentTestId = url.searchParams.get("componentTestId");
  if (!componentTestId) return NextResponse.json({ error: "componentTestId is required" }, { status: 400 });
  // Soft-remove: mark inactive, preserve history
  await db.labTestPanelMember.updateMany({
    where: { panelTestId: id, componentTestId, isActive: true },
    data: { isActive: false, removedAt: new Date() },
  });
  await catalogAudit({ session, laboratoryTestId: id, action: "PANEL_CHANGED", newValue: { memberRemoved: componentTestId } });
  return NextResponse.json({ ok: true });
}

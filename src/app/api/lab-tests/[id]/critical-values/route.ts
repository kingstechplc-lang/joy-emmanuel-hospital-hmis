// =====================================================================
// API: /api/lab-tests/[id]/critical-values
//   GET    — list critical value thresholds for a test
//   POST   — add a critical value threshold
//   PATCH  — update  (?criticalId=...)
//   DELETE — remove  (?criticalId=...)
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
  const status = url.searchParams.get("status") || "active";
  const items = await db.labTestCriticalValue.findMany({
    where: { laboratoryTestId: id, ...(status !== "all" ? { status } : {}) },
    orderBy: { createdAt: "desc" },
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
  const {
    sex, ageGroup, ageMinDays, ageMaxDays,
    criticalLow, criticalHigh, alertType, alertValue,
    notificationBehavior, notes, status,
  } = body;
  if (criticalLow == null && criticalHigh == null && !alertValue) {
    return NextResponse.json({ error: "At least one of criticalLow, criticalHigh, or alertValue is required" }, { status: 400 });
  }
  const item = await db.labTestCriticalValue.create({
    data: {
      laboratoryTestId: id,
      sex: sex || null,
      ageGroup: ageGroup || null,
      ageMinDays: typeof ageMinDays === "number" ? ageMinDays : null,
      ageMaxDays: typeof ageMaxDays === "number" ? ageMaxDays : null,
      criticalLow: typeof criticalLow === "number" ? criticalLow : null,
      criticalHigh: typeof criticalHigh === "number" ? criticalHigh : null,
      alertType: alertType || "numeric",
      alertValue: alertValue || null,
      notificationBehavior: notificationBehavior || null,
      notes: notes || null,
      status: status || "active",
      createdById: session.user.id,
    },
  });
  await catalogAudit({ session, laboratoryTestId: id, action: "CRITICAL_CHANGED", newValue: { criticalAdded: item } });
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
  const criticalId = url.searchParams.get("criticalId");
  if (!criticalId) return NextResponse.json({ error: "criticalId is required" }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updated = await db.labTestCriticalValue.update({ where: { id: criticalId, laboratoryTestId: id }, data: body });
  await catalogAudit({ session, laboratoryTestId: id, action: "CRITICAL_CHANGED", newValue: { criticalUpdated: updated } });
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
  const criticalId = url.searchParams.get("criticalId");
  if (!criticalId) return NextResponse.json({ error: "criticalId is required" }, { status: 400 });
  await db.labTestCriticalValue.update({
    where: { id: criticalId, laboratoryTestId: id },
    data: { status: "retired" },
  });
  await catalogAudit({ session, laboratoryTestId: id, action: "CRITICAL_CHANGED", newValue: { criticalRetired: criticalId } });
  return NextResponse.json({ ok: true });
}

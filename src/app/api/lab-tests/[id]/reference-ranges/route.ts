// =====================================================================
// API: /api/lab-tests/[id]/reference-ranges
//   GET    — list reference ranges for a test (optionally active only)
//   POST   — add a new reference range (supersedes prior active ranges for
//            the same sex/ageGroup/specimen slice if supersede=true)
//   PATCH  — update a range  (?rangeId=...)
//   DELETE — retire a range   (?rangeId=...)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canViewCatalog, canManageCatalog, catalogAudit, snapshotVersion } from "@/lib/lab-catalog";
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
  const items = await db.labTestReferenceRange.findMany({
    where: { laboratoryTestId: id, ...(status !== "all" ? { status } : {}) },
    orderBy: [{ effectiveFrom: "desc" }],
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
    label, sex, ageGroup, ageMinDays, ageMaxDays, pregnancyApplicable,
    specimenType, facilityId, lowText, highText, rangeText, unit,
    criticalLowText, criticalHighText, notes, supersede,
  } = body;

  // Compute next version for this test
  const latest = await db.labTestReferenceRange.findFirst({
    where: { laboratoryTestId: id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latest?.version || 0) + 1;

  // If supersede=true, close out currently-active ranges matching the same slice
  if (supersede) {
    await db.labTestReferenceRange.updateMany({
      where: {
        laboratoryTestId: id,
        status: "active",
        sex: sex || null,
        ageGroup: ageGroup || null,
        specimenType: specimenType || null,
        facilityId: facilityId || null,
      },
      data: { status: "superseded", effectiveTo: new Date() },
    });
  }

  const item = await db.labTestReferenceRange.create({
    data: {
      laboratoryTestId: id,
      label: label || null,
      sex: sex || null,
      ageGroup: ageGroup || null,
      ageMinDays: typeof ageMinDays === "number" ? ageMinDays : null,
      ageMaxDays: typeof ageMaxDays === "number" ? ageMaxDays : null,
      pregnancyApplicable: !!pregnancyApplicable,
      specimenType: specimenType || null,
      facilityId: facilityId || null,
      lowText: lowText || null,
      highText: highText || null,
      rangeText: rangeText || null,
      unit: unit || null,
      criticalLowText: criticalLowText || null,
      criticalHighText: criticalHighText || null,
      notes: notes || null,
      version: nextVersion,
      effectiveFrom: new Date(),
      status: "active",
      createdById: session.user.id,
    },
  });

  // Mirror primary referenceRange text on the test (for back-compat with lab-orders/results)
  if (rangeText && !test.referenceRange) {
    await db.laboratoryTest.update({ where: { id }, data: { referenceRange: rangeText, unit: unit || test.unit } });
  }

  await catalogAudit({
    session, laboratoryTestId: id, action: "RANGE_CHANGED",
    newValue: { rangeAdded: item, superseded: !!supersede },
  });
  await snapshotVersion(id, `Reference range added (v${nextVersion})`, session.user.id).catch(() => null);
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
  const rangeId = url.searchParams.get("rangeId");
  if (!rangeId) return NextResponse.json({ error: "rangeId is required" }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updated = await db.labTestReferenceRange.update({ where: { id: rangeId, laboratoryTestId: id }, data: body });
  await catalogAudit({ session, laboratoryTestId: id, action: "RANGE_CHANGED", newValue: { rangeUpdated: updated } });
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
  const rangeId = url.searchParams.get("rangeId");
  if (!rangeId) return NextResponse.json({ error: "rangeId is required" }, { status: 400 });
  // Retire (not hard-delete) — preserve historical integrity
  await db.labTestReferenceRange.update({
    where: { id: rangeId, laboratoryTestId: id },
    data: { status: "retired", effectiveTo: new Date() },
  });
  await catalogAudit({ session, laboratoryTestId: id, action: "RANGE_CHANGED", newValue: { rangeRetired: rangeId } });
  return NextResponse.json({ ok: true });
}

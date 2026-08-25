// =====================================================================
// API: /api/lab-tests/[id]/specimens
//   GET    — list specimen configurations for a test
//   POST   — add a specimen configuration
//   PATCH  — update a specimen configuration  (?specimenId=...)
//   DELETE — remove a specimen configuration  (?specimenId=...)
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
  const items = await db.labTestSpecimenConfig.findMany({
    where: { laboratoryTestId: id, ...(status !== "all" ? { status } : {}) },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
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
    specimenType, isPrimary, container, minVolume,
    collectionRequirements, processingRequirements, storageRequirements, transportRequirements,
    stabilityInfo, fastingRequired, timingRequired, specialPreparation, collectionNotes,
    sortOrder, status,
  } = body;
  if (!specimenType) return NextResponse.json({ error: "specimenType is required" }, { status: 400 });

  // If isPrimary, demote any existing primary
  if (isPrimary) {
    await db.labTestSpecimenConfig.updateMany({
      where: { laboratoryTestId: id, isPrimary: true },
      data: { isPrimary: false },
    });
  }
  const item = await db.labTestSpecimenConfig.create({
    data: {
      laboratoryTestId: id,
      specimenType,
      isPrimary: !!isPrimary,
      container: container || null,
      minVolume: minVolume || null,
      collectionRequirements: collectionRequirements || null,
      processingRequirements: processingRequirements || null,
      storageRequirements: storageRequirements || null,
      transportRequirements: transportRequirements || null,
      stabilityInfo: stabilityInfo || null,
      fastingRequired: !!fastingRequired,
      timingRequired: timingRequired || null,
      specialPreparation: specialPreparation || null,
      collectionNotes: collectionNotes || null,
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
      status: status || "active",
    },
  });
  // If this is the first/primary specimen, also set the legacy specimenType field on the test
  if (isPrimary) {
    await db.laboratoryTest.update({ where: { id }, data: { specimenType } });
  }
  await catalogAudit({ session, laboratoryTestId: id, action: "SPECIMEN_CHANGED", newValue: { added: item } });
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
  const specimenId = url.searchParams.get("specimenId");
  if (!specimenId) return NextResponse.json({ error: "specimenId is required" }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.isPrimary) {
    await db.labTestSpecimenConfig.updateMany({
      where: { laboratoryTestId: id, isPrimary: true },
      data: { isPrimary: false },
    });
  }
  const updated = await db.labTestSpecimenConfig.update({ where: { id: specimenId, laboratoryTestId: id }, data: body });
  if (body.isPrimary && body.specimenType) {
    await db.laboratoryTest.update({ where: { id }, data: { specimenType: body.specimenType } });
  }
  await catalogAudit({ session, laboratoryTestId: id, action: "SPECIMEN_CHANGED", newValue: { updated } });
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
  const specimenId = url.searchParams.get("specimenId");
  if (!specimenId) return NextResponse.json({ error: "specimenId is required" }, { status: 400 });
  await db.labTestSpecimenConfig.delete({ where: { id: specimenId, laboratoryTestId: id } });
  await catalogAudit({ session, laboratoryTestId: id, action: "SPECIMEN_CHANGED", newValue: { removed: specimenId } });
  return NextResponse.json({ ok: true });
}

// =====================================================================
// API: /api/lab-tests/[id]/facility-availability
//   GET    — list facility availability overrides for a test
//   POST   — add/update an override
//   PATCH  — update  (?facilityAvailId=...)
//   DELETE — remove  (?facilityId=...)
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
  const items = await db.labTestFacilityAvailability.findMany({
    where: { laboratoryTestId: id },
    orderBy: { facilityId: "asc" },
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
    facilityId, availability, performingDepartmentId, facilityTatMinutes,
    facilityReferralLab, facilityNotes, status,
  } = body;
  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });
  // Upsert
  const item = await db.labTestFacilityAvailability.upsert({
    where: { laboratoryTestId_facilityId: { laboratoryTestId: id, facilityId } },
    update: {
      availability: availability || "available",
      performingDepartmentId: performingDepartmentId || null,
      facilityTatMinutes: typeof facilityTatMinutes === "number" ? facilityTatMinutes : null,
      facilityReferralLab: facilityReferralLab || null,
      facilityNotes: facilityNotes || null,
      status: status || "active",
    },
    create: {
      laboratoryTestId: id,
      facilityId,
      availability: availability || "available",
      performingDepartmentId: performingDepartmentId || null,
      facilityTatMinutes: typeof facilityTatMinutes === "number" ? facilityTatMinutes : null,
      facilityReferralLab: facilityReferralLab || null,
      facilityNotes: facilityNotes || null,
      status: status || "active",
    },
  });
  await catalogAudit({ session, laboratoryTestId: id, action: "UPDATED", newValue: { facilityAvailability: item } });
  return NextResponse.json({ item }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const test = await getTest(session, id);
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });
  await db.labTestFacilityAvailability.delete({
    where: { laboratoryTestId_facilityId: { laboratoryTestId: id, facilityId } },
  });
  await catalogAudit({ session, laboratoryTestId: id, action: "UPDATED", newValue: { facilityAvailabilityRemoved: facilityId } });
  return NextResponse.json({ ok: true });
}

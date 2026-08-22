// =====================================================================
// API: /api/specialty/notes
//   POST — add a clinical note/addendum to an encounter
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  if (!body.specialtyEncounterId || !body.content) {
    return NextResponse.json({ error: "Missing required fields: specialtyEncounterId, content" }, { status: 400 });
  }

  const encounter = await db.specialtyEncounter.findUnique({ where: { id: body.specialtyEncounterId } });
  if (!encounter || encounter.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
  }

  const { id: _id, organizationId: _orgId, createdAt: _c, authoredAt: _a, ...createData } = body;

  const item = await db.specialtyClinicalNote.create({
    data: {
      ...createData,
      organizationId: session.user.organizationId,
      specialtyEncounterId: body.specialtyEncounterId,
      authoredById: session.user.id,
      authoredByName: session.user.name || undefined,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: encounter.facilityId || undefined,
    action: "SPECIALTY_NOTE_ADDED",
    resourceType: "specialtyClinicalNote",
    resourceId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}

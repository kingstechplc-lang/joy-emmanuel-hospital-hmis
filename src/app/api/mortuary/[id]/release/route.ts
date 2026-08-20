// =====================================================================
// API: /api/mortuary/[id]/release
//   POST — release body to family / funeral home
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MORTUARY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { releasedTo, releasedToPhone, releasedToIdType, releasedToIdNo, releaseNotes, undertakingCompany } = body;

  if (!releasedTo) {
    return NextResponse.json({ error: "releasedTo is required" }, { status: 400 });
  }

  const existing = await db.mortuaryAdmission.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Admission not found" }, { status: 404 });
  }

  if (existing.admissionStatus === "released") {
    return NextResponse.json({ error: "Body already released" }, { status: 400 });
  }

  const updated = await db.mortuaryAdmission.update({
    where: { id },
    data: {
      admissionStatus: "released",
      releasedAt: new Date(),
      releasedTo,
      releasedToPhone: releasedToPhone || null,
      releasedToIdType: releasedToIdType || null,
      releasedToIdNo: releasedToIdNo || null,
      releaseNotes: releaseNotes || null,
      undertakingCompany: undertakingCompany || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "MORTUARY_BODY_RELEASED",
    resourceType: "mortuary_admission",
    resourceId: id,
    oldValues: { status: existing.admissionStatus },
    newValues: { releasedTo, undertakingCompany },
  });

  return NextResponse.json({ item: updated });
}

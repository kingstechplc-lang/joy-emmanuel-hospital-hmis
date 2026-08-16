// =====================================================================
// API: /api/medications
//   GET  — list/search medications (org-level catalog)
//   POST — create medication (admin only)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/medications?q=...&status=active
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PHARMACY_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "active";

  const where: any = { organizationId: session.user.organizationId };
  if (status && status !== "all") where.status = status;
  if (q) {
    where.OR = [
      { genericName: { contains: q } },
      { brandName: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const medications = await db.medication.findMany({
    where,
    orderBy: { genericName: "asc" },
    take: 200,
  });

  return NextResponse.json({ items: medications, count: medications.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { genericName, brandName, strength, dosageForm, route, unit, description } = body;

  if (!genericName) {
    return NextResponse.json({ error: "genericName is required" }, { status: 400 });
  }

  const med = await db.medication.create({
    data: {
      organizationId: session.user.organizationId,
      genericName,
      brandName: brandName || null,
      strength: strength || null,
      dosageForm: dosageForm || null,
      route: route || null,
      unit: unit || null,
      description: description || null,
      status: "active",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "MEDICATION_CREATED",
    resourceType: "medication",
    resourceId: med.id,
    newValues: { genericName, brandName, strength, dosageForm, route },
  });

  return NextResponse.json({ item: med }, { status: 201 });
}

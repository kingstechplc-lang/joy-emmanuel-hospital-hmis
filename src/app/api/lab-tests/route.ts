// =====================================================================
// API: /api/lab-tests
//   GET  — list laboratory test catalog (organization-level)
//   POST — create a new laboratory test (settings.view permission)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/lab-tests?q=...&category=...&status=active
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LAB_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status") || "active";

  const where: any = { organizationId: session.user.organizationId };
  if (status) where.status = status;
  if (category) where.category = category;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { code: { contains: q } },
    ];
  }

  const tests = await db.laboratoryTest.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 200,
  });

  return NextResponse.json({ items: tests, count: tests.length });
}

// POST /api/lab-tests
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, code, category, specimenType, unit, referenceRange, price } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  }

  const existing = await db.laboratoryTest.findUnique({
    where: { organizationId_code: { organizationId: session.user.organizationId, code } },
  });
  if (existing) {
    return NextResponse.json({ error: "Test with this code already exists" }, { status: 409 });
  }

  const test = await db.laboratoryTest.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      code,
      category: category || null,
      specimenType: specimenType || null,
      unit: unit || null,
      referenceRange: referenceRange || null,
      price: typeof price === "number" ? price : 0,
      status: "active",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "LAB_TEST_CREATED",
    resourceType: "laboratory_test",
    resourceId: test.id,
    newValues: { name, code, category, specimenType, unit, price },
  });

  return NextResponse.json({ item: test }, { status: 201 });
}

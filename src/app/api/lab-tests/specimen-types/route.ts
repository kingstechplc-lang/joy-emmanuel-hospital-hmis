// =====================================================================
// API: /api/lab-tests/specimen-types
//   GET  — list specimen types for the org
//   POST — create a new specimen type
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { canViewCatalog, canManageCatalog } from "@/lib/lab-catalog";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewCatalog(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "active";
  const items = await db.labTestSpecimenType.findMany({
    where: { organizationId: session.user.organizationId, ...(status !== "all" ? { status } : {}) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, code, description, sortOrder, status } = body;
  if (!name || !code) return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  try {
    const item = await db.labTestSpecimenType.create({
      data: {
        organizationId: session.user.organizationId,
        name, code,
        description: description || null,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        status: status || "active",
      },
    });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId,
      action: "LABTestSpecimenType_CREATED", resourceType: "lab_test_specimen_type", resourceId: item.id,
      newValues: { name, code },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Specimen type with this name or code already exists" }, { status: 409 });
    throw e;
  }
}

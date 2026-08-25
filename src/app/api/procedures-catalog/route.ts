// =====================================================================
// API: /api/procedures-catalog
//   GET  — list procedure catalog entries
//   POST — create a new procedure catalog entry
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCEDURE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status") || "active";

  const where: any = { organizationId: session.user.organizationId };
  if (status && status !== "all") where.status = status;
  if (category) where.category = category;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { shortName: { contains: q, mode: "insensitive" } },
    ];
  }
  const items = await db.procedureCatalog.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 200,
    include: { facilityAvailability: true },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Only settings managers or procedure performers can manage the catalog
  const allowed = session.user.roles.includes("super_admin") ||
    session.user.permissions?.includes(PERMISSIONS.SETTINGS_MANAGE) ||
    session.user.permissions?.includes(PERMISSIONS.PROCEDURE_PERFORM);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const {
    name, code, shortName, description, category, procedureType,
    departmentId, requiredStaffType, estimatedDurationMinutes,
    serviceId, isBillable, billableAs,
    nhisEligible, nhisServiceCode, nhisTariffRef, claimableStatus,
    requiredConsumables, status,
  } = body;
  if (!name || !code) return NextResponse.json({ error: "name and code are required" }, { status: 400 });

  try {
    const item = await db.procedureCatalog.create({
      data: {
        organizationId: session.user.organizationId,
        name, code,
        shortName: shortName || null,
        description: description || null,
        category: category || "minor",
        procedureType: procedureType || "diagnostic",
        departmentId: departmentId || null,
        requiredStaffType: requiredStaffType || null,
        estimatedDurationMinutes: typeof estimatedDurationMinutes === "number" ? estimatedDurationMinutes : null,
        serviceId: serviceId || null,
        isBillable: isBillable !== undefined ? !!isBillable : true,
        billableAs: billableAs || "individual",
        nhisEligible: !!nhisEligible,
        nhisServiceCode: nhisServiceCode || null,
        nhisTariffRef: nhisTariffRef || null,
        claimableStatus: claimableStatus || "not_configured",
        requiredConsumables: requiredConsumables || null,
        status: status || "active",
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId,
      action: "PROCEDURE_CATALOG_CREATED", resourceType: "procedure_catalog", resourceId: item.id,
      newValues: { name, code, category, serviceId },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Procedure with this code already exists" }, { status: 409 });
    throw e;
  }
}

// =====================================================================
// API: /api/diagnoses/catalog
//   GET  — search/list diagnoses in the master catalog
//   POST — create a new catalog entry (admin only)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Any clinical user can browse the catalog
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const category = url.searchParams.get("category");
  const specialty = url.searchParams.get("specialty");
  const codeSystem = url.searchParams.get("codeSystem");
  const isActive = url.searchParams.get("isActive");
  const limit = parseInt(url.searchParams.get("limit") || "30");

  const where: any = { organizationId: session.user.organizationId };
  if (isActive !== null && isActive !== undefined && isActive !== "") {
    where.isActive = isActive === "true";
  } else {
    where.isActive = true; // default to active only
  }
  if (category && category !== "all") where.category = category;
  if (specialty && specialty !== "all") where.specialty = specialty;
  if (codeSystem && codeSystem !== "all") where.codeSystem = codeSystem;

  if (q) {
    // Fuzzy/partial match across name, code, synonyms (stored as JSON string)
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { synonyms: { contains: q, mode: "insensitive" } },
      { searchTerms: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }

  const items = await db.diagnosisCatalog.findMany({
    where,
    orderBy: [{ name: "asc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_CATALOG_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  if (!body.code || !body.name) {
    return NextResponse.json({ error: "Missing required fields: code, name" }, { status: 400 });
  }

  // Check for duplicate within org
  const codeSystem = body.codeSystem || "ICD-10";
  const existing = await db.diagnosisCatalog.findUnique({
    where: {
      organizationId_code_codeSystem: {
        organizationId: session.user.organizationId,
        code: body.code,
        codeSystem,
      },
    },
  });
  if (existing) {
    return NextResponse.json({ error: `Diagnosis with code "${body.code}" (${codeSystem}) already exists` }, { status: 409 });
  }

  const { id: _id, organizationId: _o, createdAt: _c, updatedAt: _u, ...createData } = body;
  const item = await db.diagnosisCatalog.create({
    data: {
      ...createData,
      codeSystem,
      organizationId: session.user.organizationId,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "DIAGNOSIS_CATALOG_CREATED",
    resourceType: "diagnosisCatalog",
    resourceId: item.id,
    newValues: { code: item.code, name: item.name, codeSystem: item.codeSystem },
  });

  return NextResponse.json({ item }, { status: 201 });
}

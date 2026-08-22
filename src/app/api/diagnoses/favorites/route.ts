// =====================================================================
// API: /api/diagnoses/favorites
//   GET  — list current user's favorite diagnoses (with catalog info)
//   POST — add a catalog entry to favorites
//   DELETE (via ?catalogId=...) — remove a favorite
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await db.diagnosisFavorite.findMany({
    where: { userId: session.user.id },
    include: {
      catalog: {
        select: {
          id: true, code: true, name: true, codeSystem: true,
          category: true, isActive: true, isChronicDefault: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  if (!body.catalogId) {
    return NextResponse.json({ error: "catalogId is required" }, { status: 400 });
  }

  // Verify catalog belongs to user's org
  const catalog = await db.diagnosisCatalog.findUnique({ where: { id: body.catalogId } });
  if (!catalog || catalog.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Catalog entry not found" }, { status: 404 });
  }

  // Upsert — ignore if already favorited
  const existing = await db.diagnosisFavorite.findUnique({
    where: { userId_catalogId: { userId: session.user.id, catalogId: body.catalogId } },
  });
  if (existing) {
    return NextResponse.json({ item: existing, alreadyFavorited: true });
  }

  const item = await db.diagnosisFavorite.create({
    data: { userId: session.user.id, catalogId: body.catalogId },
  });
  return NextResponse.json({ item }, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const catalogId = url.searchParams.get("catalogId");
  if (!catalogId) {
    return NextResponse.json({ error: "catalogId query param is required" }, { status: 400 });
  }
  await db.diagnosisFavorite.deleteMany({
    where: { userId: session.user.id, catalogId },
  });
  return NextResponse.json({ ok: true });
}

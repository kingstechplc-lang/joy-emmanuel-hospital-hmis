// =====================================================================
// API: /api/record-amendments
//   GET  — list amendments (filter by status, patientId)
//   POST — create an amendment request
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
  if (!hasPermission(session, PERMISSIONS.PATIENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");

  const where: any = { organizationId: session.user.organizationId };
  if (status && status !== "all") where.status = status;
  if (patientId) where.patientId = patientId;
  if (search) {
    where.OR = [
      { patientName: { contains: search, mode: "insensitive" } },
      { reason: { contains: search, mode: "insensitive" } },
      { field: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await db.recordAmendment.findMany({
    where,
    orderBy: { requestedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { patientName, reason, amendmentType } = body;
  if (!patientName || !reason) {
    return NextResponse.json({ error: "patientName and reason are required" }, { status: 400 });
  }

  const item = await db.recordAmendment.create({
    data: {
      ...body,
      organizationId: session.user.organizationId,
      requestedById: session.user.id,
      requestedByName: session.user.name || session.user.username,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "RECORD_AMENDMENT_REQUESTED",
    resourceType: "record_amendment",
    resourceId: item.id,
    newValues: { patientName, amendmentType, reason },
  });

  return NextResponse.json({ item }, { status: 201 });
}

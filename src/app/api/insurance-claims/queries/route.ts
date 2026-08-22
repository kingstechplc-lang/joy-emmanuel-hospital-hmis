// =====================================================================
// API: /api/insurance-claims/queries
//   GET  — list queries (filter by claimId, status)
//   POST — create a query on a claim
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
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const claimId = url.searchParams.get("claimId");
  const status = url.searchParams.get("status");

  const where: any = {};
  if (claimId) where.claimId = claimId;
  if (status) where.status = status;

  const items = await db.claimQuery.findMany({
    where,
    orderBy: { queriedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_CLAIM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { claimId, queryReason, queryCode, responseDeadline, assignedToName, notes } = body;
  if (!claimId || !queryReason) {
    return NextResponse.json({ error: "claimId and queryReason are required" }, { status: 400 });
  }

  const claim = await db.insuranceClaim.findUnique({ where: { id: claimId } });
  if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 });

  const item = await db.claimQuery.create({
    data: {
      claimId,
      queryReason,
      queryCode: queryCode || null,
      responseDeadline: responseDeadline ? new Date(responseDeadline) : null,
      assignedToName: assignedToName || null,
    },
  });

  // Update claim status to "queried"
  await db.insuranceClaim.update({
    where: { id: claimId },
    data: { status: "submitted" }, // stays submitted but has a query
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: claim.facilityId,
    action: "CLAIM_QUERIED",
    resourceType: "claimQuery",
    resourceId: item.id,
    newValues: { claimId, queryReason },
  });

  return NextResponse.json({ item }, { status: 201 });
}

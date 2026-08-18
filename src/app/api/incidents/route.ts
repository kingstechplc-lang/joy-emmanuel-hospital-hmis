// =====================================================================
// API: /api/incidents
//   GET  — list incident reports (filter by facility, type, severity, status)
//   POST — create a new incident report
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/incidents?facilityId=...&incidentType=...&severity=...&status=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Anyone who can assign tasks (clinical/operations staff) can view incidents
  if (!hasPermission(session, PERMISSIONS.TASK_ASSIGN) && !hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const incidentType = url.searchParams.get("incidentType");
  const severity = url.searchParams.get("severity");
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") || "200");

  // Scope facilities to user's org
  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) {
    where.facilityId = facilityId;
  } else {
    where.facilityId = { in: orgFacilityIds };
  }
  if (incidentType && incidentType !== "all") where.incidentType = incidentType;
  if (severity && severity !== "all") where.severity = severity;
  if (status && status !== "all") where.status = status;

  const incidents = await db.incidentReport.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    include: {
      facility: { select: { id: true, name: true, code: true } },
      reportedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  return NextResponse.json({ items: incidents, count: incidents.length });
}

// POST /api/incidents
// body: { facilityId?, incidentType, severity, description, location?, peopleInvolved?, immediateAction? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TASK_ASSIGN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { facilityId, incidentType, severity, description, location, peopleInvolved, immediateAction } = body;

  if (!incidentType || !severity || !description) {
    return NextResponse.json({ error: "incidentType, severity, description are required" }, { status: 400 });
  }

  const validTypes = ["clinical", "safety", "security", "equipment", "other"];
  if (!validTypes.includes(incidentType)) {
    return NextResponse.json({ error: `incidentType must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }
  const validSeverities = ["low", "medium", "high", "critical"];
  if (!validSeverities.includes(severity)) {
    return NextResponse.json({ error: `severity must be one of: ${validSeverities.join(", ")}` }, { status: 400 });
  }

  // Validate facility scope (if provided)
  let resolvedFacilityId = facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  const incident = await db.incidentReport.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      incidentType,
      severity,
      description,
      location: location || null,
      peopleInvolved: peopleInvolved || null,
      immediateAction: immediateAction || null,
      status: "reported",
      reportedById: session.user.id,
    },
    include: {
      facility: { select: { id: true, name: true, code: true } },
      reportedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "INCIDENT_REPORTED",
    resourceType: "incident_report",
    resourceId: incident.id,
    newValues: { incidentType, severity, description: description.slice(0, 200), location },
  });

  return NextResponse.json({ item: incident }, { status: 201 });
}

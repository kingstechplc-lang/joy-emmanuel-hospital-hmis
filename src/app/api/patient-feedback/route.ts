// =====================================================================
// API: /api/patient-feedback
//   GET  — list records (filter by facility, status, etc.)
//   POST — create a new record
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { notifyPatientFeedbackReceived } from "@/lib/workflow-notifications";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_RELATIONS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");

  // Scope to user's facilities
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

  // Apply filter params from URL (any param other than facilityId/search/limit)
  for (const [k, v] of url.searchParams.entries()) {
    if (["facilityId", "search", "limit"].includes(k)) continue;
    if (v && v !== "all") {
      if (k === "isActive") {
        where[k] = v === "true";
      } else {
        where[k] = v;
      }
    }
  }

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await db.patientFeedback.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_RELATIONS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  // Validate required fields
  if (body.feedbackType === undefined || body.feedbackType === "" || body.feedbackType === null || body.patientName === undefined || body.patientName === "" || body.patientName === null || body.subject === undefined || body.subject === "" || body.subject === null || body.description === undefined || body.description === "" || body.description === null) {
    return NextResponse.json({ error: "Missing required fields: feedbackType, patientName, subject, description" }, { status: 400 });
  }

  // Validate facility scope
  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  // Strip protected fields from body before passing to prisma.create
  const { id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, createdById: _cb, facilityId: _fId, ...createData } = body;
  const year = new Date().getFullYear();
  const count = await db.patientFeedback.count({ where: { organizationId: session.user.organizationId } });
  const feedbackNumber = `FB-${year}-${String(count + 1).padStart(6, "0")}`;

  const item = await db.patientFeedback.create({
    data: {
      ...createData,
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      feedbackNumber,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "PATIENT_FEEDBACK_CREATED",
    resourceType: "patientFeedback",
    resourceId: item.id,
  });

  // 🔔 Fire workflow notification to patient relations staff
  await notifyPatientFeedbackReceived({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    feedbackNumber: item.feedbackNumber,
    feedbackType: item.feedbackType,
    patientName: item.patientName,
    subject: item.subject,
    severity: item.severity || undefined,
    feedbackId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}

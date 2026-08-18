// =====================================================================
// API: /api/training
//   GET  — list training records (filter by staff, date range)
//   POST — record a new training entry for a staff member
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
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const staffId = url.searchParams.get("staffId");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const provider = url.searchParams.get("provider");
  const q = url.searchParams.get("q") || "";

  // Scope to user's org (via staff.user.organizationId)
  const orgUsers = await db.user.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const userIds = orgUsers.map((u) => u.id);
  const orgStaff = await db.staff.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const staffIds = orgStaff.map((s) => s.id);

  const where: any = { staffId: { in: staffIds } };
  if (staffId) where.staffId = staffId;
  if (provider) where.provider = { contains: provider };
  if (q) {
    where.OR = [
      { trainingName: { contains: q } },
      { provider: { contains: q } },
      { certificateNumber: { contains: q } },
      { notes: { contains: q } },
    ];
  }
  if (dateFrom || dateTo) {
    where.trainingDate = {};
    if (dateFrom) {
      const d = new Date(dateFrom);
      d.setHours(0, 0, 0, 0);
      where.trainingDate.gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      where.trainingDate.lte = d;
    }
  }

  const records = await db.trainingRecord.findMany({
    where,
    orderBy: [{ trainingDate: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      staff: {
        select: {
          id: true,
          staffNumber: true,
          firstName: true,
          lastName: true,
          professionalRole: true,
        },
      },
    },
  });

  const items = records.map((r) => ({
    id: r.id,
    staffId: r.staffId,
    staff: r.staff,
    organizationId: r.organizationId,
    trainingName: r.trainingName,
    provider: r.provider,
    trainingDate: r.trainingDate,
    durationHours: r.durationHours,
    certificateIssued: r.certificateIssued,
    certificateNumber: r.certificateNumber,
    expiryDate: r.expiryDate,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    staffId,
    trainingName,
    provider,
    trainingDate,
    durationHours,
    certificateIssued,
    certificateNumber,
    expiryDate,
    notes,
  } = body;

  if (!staffId || !trainingName || !trainingDate) {
    return NextResponse.json(
      { error: "staffId, trainingName, trainingDate are required" },
      { status: 400 }
    );
  }

  // Validate staff belongs to org
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    include: { user: { select: { organizationId: true } } },
  });
  if (!staff || staff.user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid staff member" }, { status: 400 });
  }

  const record = await db.trainingRecord.create({
    data: {
      staffId,
      organizationId: session.user.organizationId,
      trainingName,
      provider: provider || null,
      trainingDate: new Date(trainingDate),
      durationHours: durationHours != null && durationHours !== "" ? Number(durationHours) : null,
      certificateIssued: !!certificateIssued,
      certificateNumber: certificateNumber || null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      notes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "TRAINING_RECORDED",
    resourceType: "training_record",
    resourceId: record.id,
    newValues: { staffId, trainingName, provider, trainingDate, certificateIssued },
  });

  return NextResponse.json({ item: record }, { status: 201 });
}

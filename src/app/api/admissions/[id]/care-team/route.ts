// =====================================================================
// API: /api/admissions/[id]/care-team
//   GET  — list care team members for an admission
//   POST — assign a care team member
//   DELETE — remove a care team member (?memberId=...)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_VIEW) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const members = await db.careTeamMember.findMany({
    where: { admissionId: id, status: "active" },
    orderBy: { assignedAt: "desc" },
  });
  return NextResponse.json({ items: members, count: members.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_CARE_TEAM) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden — missing admission.care_team permission" }, { status: 403 });
  }
  const { id } = await params;
  const admission = await db.admission.findUnique({ where: { id } });
  if (!admission) return NextResponse.json({ error: "Admission not found" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { userId, staffName, role, notes } = body;
  if (!userId && !staffName) return NextResponse.json({ error: "userId or staffName is required" }, { status: 400 });

  const member = await db.careTeamMember.create({
    data: {
      admissionId: id,
      userId: userId || null,
      staffName: staffName || null,
      role: role || "attending",
      assignedById: session.user.id,
      notes: notes || null,
      status: "active",
    },
  });

  // If role is attending, also set attendingClinicianId on the admission
  if (role === "attending" && userId) {
    await db.admission.update({ where: { id }, data: { attendingClinicianId: userId } });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: admission.facilityId,
    action: "CARE_TEAM_MEMBER_ASSIGNED",
    resourceType: "admission",
    resourceId: id,
    newValues: { member, role },
  });

  return NextResponse.json({ item: member }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_CARE_TEAM) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const url = new URL(req.url);
  const memberId = url.searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId is required" }, { status: 400 });

  // Soft-remove: set status to inactive + unassignedAt
  await db.careTeamMember.update({
    where: { id: memberId, admissionId: id },
    data: { status: "inactive", unassignedAt: new Date() },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "CARE_TEAM_MEMBER_REMOVED",
    resourceType: "admission",
    resourceId: id,
    newValues: { memberId },
  });

  return NextResponse.json({ ok: true });
}

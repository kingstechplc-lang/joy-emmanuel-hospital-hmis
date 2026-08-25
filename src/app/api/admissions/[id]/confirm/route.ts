// =====================================================================
// API: /api/admissions/[id]/confirm
//   POST — confirm patient arrival / check-in (bed_assigned → admitted)
//   Body: { conditionOnArrival, notes }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_CONFIRM) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden — missing admission.confirm permission" }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { conditionOnArrival, notes } = body;

  const existing = await db.admission.findUnique({
    where: { id },
    include: { bedAssignments: { where: { status: "active" }, take: 1 } },
  });
  if (!existing) return NextResponse.json({ error: "Admission not found" }, { status: 404 });

  // Allow confirmation from bed_assigned or approved (if bed was auto-assigned)
  if (!["bed_assigned", "approved"].includes(existing.status)) {
    return NextResponse.json({ error: `Cannot confirm admission in status "${existing.status}"` }, { status: 400 });
  }

  const activeBed = existing.bedAssignments[0];

  const result = await db.$transaction(async (tx) => {
    // Mark bed as occupied (was reserved)
    if (activeBed) {
      await tx.bed.update({
        where: { id: activeBed.bedId },
        data: { status: "occupied" },
      });
    }
    // Update admission status to admitted + set actual admittedAt
    const updated = await tx.admission.update({
      where: { id },
      data: {
        status: "admitted",
        admittedAt: new Date(),
        admittedById: session.user.id,
        notes: notes ? (existing.notes ? `${existing.notes}\n[Check-in] ${notes}` : `[Check-in] ${notes}`) : existing.notes,
        updatedById: session.user.id,
      },
    });
    return updated;
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "ADMISSION_CONFIRMED",
    resourceType: "admission",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status: "admitted", conditionOnArrival, notes },
  });

  return NextResponse.json({ item: result });
}

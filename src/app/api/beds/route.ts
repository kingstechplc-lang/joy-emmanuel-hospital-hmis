// =====================================================================
// API: /api/beds
//   GET  — list beds grouped by ward (filter by facility, ward, status)
//          includes current active bed_assignment with patient info
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/beds?facilityId=...&wardId=...&status=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW) && !hasPermission(session, PERMISSIONS.BED_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const wardId = url.searchParams.get("wardId");
  const status = url.searchParams.get("status");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (wardId) where.wardId = wardId;
  if (status) where.status = status;

  const beds = await db.bed.findMany({
    where,
    orderBy: [{ wardId: "asc" }, { bedNumber: "asc" }],
    include: {
      ward: { select: { id: true, name: true, code: true, wardType: true, capacity: true } },
      room: { select: { id: true, roomNumber: true, roomType: true } },
      bedAssignments: {
        where: { status: "active" },
        take: 1,
        include: {
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true } },
          admission: {
            select: {
              id: true, admissionNumber: true, admissionType: true, admissionDiagnosis: true,
              admittedAt: true, status: true,
              admittedBy: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  // Group beds by ward for the frontend
  const wardMap = new Map<string, any>();
  for (const b of beds) {
    const wId = b.wardId;
    if (!wardMap.has(wId)) {
      wardMap.set(wId, {
        ward: b.ward,
        beds: [],
      });
    }
    wardMap.get(wId)!.beds.push(b);
  }

  return NextResponse.json({
    items: beds,
    wards: Array.from(wardMap.values()),
    count: beds.length,
  });
}

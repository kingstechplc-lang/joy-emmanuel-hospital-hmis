// =====================================================================
// API: /api/maternity/[id]
//   GET — single maternity record with full relations
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MATERNITY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const record = await db.maternityRecord.findUnique({
    where: { id },
    include: {
      patient: {
        select: {
          id: true, patientNumber: true, firstName: true, lastName: true,
          dateOfBirth: true, sex: true, phone: true, address: true,
        },
      },
      facility: { select: { id: true, name: true } },
      encounter: { select: { id: true, encounterNumber: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      newborns: {
        orderBy: { birthDate: "asc" },
      },
      ancVisits: {
        orderBy: { visitDate: "desc" },
        include: {
          recordedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      laborAndDelivery: {
        include: {
          attendingClinician: { select: { id: true, firstName: true, lastName: true } },
          attendingMidwife: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      postnatalVisits: {
        orderBy: { visitDate: "desc" },
        include: {
          recordedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item: record });
}

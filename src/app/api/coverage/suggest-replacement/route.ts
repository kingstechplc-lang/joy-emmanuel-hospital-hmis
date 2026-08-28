// =====================================================================
// API: /api/coverage/suggest-replacement — POST
//   Returns ranked list of suitable replacement staff for a coverage request.
//   Uses the shift-engine's findReplacementCandidates.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { findReplacementCandidates, calculateShiftHours } from "@/lib/shift-engine";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COVERAGE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE) && !hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { coverageRequestId, facilityId, shiftStart, shiftEnd, requiredProfession, requiredSpecialty } = body;

  let cov: any = null;
  if (coverageRequestId) {
    cov = await db.coverageRequest.findUnique({ where: { id: coverageRequestId } });
    if (!cov || cov.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Coverage request not found" }, { status: 404 });
    }
  }

  const targetFacilityId = cov?.facilityId || facilityId;
  const targetStart = cov?.startTime || new Date(shiftStart);
  const targetEnd = cov?.endTime || (shiftEnd ? new Date(shiftEnd) : null);
  const targetProfession = cov?.requiredProfession || requiredProfession;
  const targetSpecialty = cov?.requiredSpecialty || requiredSpecialty;

  if (!targetFacilityId || !targetStart) {
    return NextResponse.json({ error: "facilityId and shiftStart are required" }, { status: 400 });
  }

  // Find all active staff in org (prefer same facility)
  const candidatesRaw = await db.staff.findMany({
    where: {
      user: { organizationId: session.user.organizationId, status: "active" },
      employmentStatus: "active",
      OR: [
        { facilityId: targetFacilityId },
        { facilityId: null },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      staffNumber: true,
      profession: true,
      specialty: true,
      facilityId: true,
      employmentStatus: true,
    },
    take: 200,
  });

  // For each candidate, fetch their existing shifts on the same day + weekly hours
  const dayStart = new Date(targetStart.getTime() - 24 * 60 * 60 * 1000);
  const dayEnd = new Date(targetStart.getTime() + 24 * 60 * 60 * 1000);
  const weekAgo = new Date(targetStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const candidatesWithData = await Promise.all(
    candidatesRaw.map(async (c) => {
      const existingShiftsOnDate = await db.staffShift.findMany({
        where: {
          staffId: c.id,
          status: { in: ["scheduled", "checked_in", "on_break", "completed"] },
          shiftDate: { gte: dayStart, lte: dayEnd },
        },
        select: { startTime: true, endTime: true },
      });
      const weeklyShifts = await db.staffShift.findMany({
        where: {
          staffId: c.id,
          status: { in: ["scheduled", "checked_in", "on_break", "completed"] },
          shiftDate: { gte: weekAgo, lte: targetStart },
        },
        select: { startTime: true, endTime: true },
      });
      const weeklyHours = weeklyShifts.reduce((sum, s) => sum + calculateShiftHours(s.startTime, s.endTime), 0);
      return {
        ...c,
        existingShiftsOnDate,
        weeklyHours,
      };
    })
  );

  const results = findReplacementCandidates(candidatesWithData, {
    requiredProfession: targetProfession || undefined,
    requiredSpecialty: targetSpecialty || undefined,
    facilityId: targetFacilityId,
    shiftStart: targetStart,
    shiftEnd: targetEnd,
  });

  return NextResponse.json({
    items: results.slice(0, 20),
    count: results.length,
    coverageRequestId: coverageRequestId || null,
  });
}

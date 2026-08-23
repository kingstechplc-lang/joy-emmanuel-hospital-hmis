// =====================================================================
// API: /api/referrals/[id]/timeline
//   GET — chronological timeline of all events for a referral
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
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const referral = await db.referral.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!referral) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const events = await db.referralEvent.findMany({
    where: { referralId: id },
    orderBy: { createdAt: "asc" },
    include: {
      actorUser: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: events, count: events.length });
}

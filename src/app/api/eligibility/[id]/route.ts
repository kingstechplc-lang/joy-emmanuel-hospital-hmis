// =====================================================================
// API: /api/eligibility/[id]
//   GET — fetch a single eligibility verification record
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const item = await db.eligibilityVerification.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, phone: true } },
    },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ item });
}

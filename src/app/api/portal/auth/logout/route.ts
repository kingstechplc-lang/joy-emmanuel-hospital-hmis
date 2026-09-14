// =====================================================================
// API: /api/portal/auth/logout
//   POST — invalidate the current portal JWT (client-side delete + audit)
//
// The portal JWT is stateless (jose library), so the server can't
// truly invalidate it server-side without a token blocklist. For v1
// we just log the logout event for audit + instruct the client to
// delete the token from localStorage. Token TTL is 30 minutes so
// any leaked token self-expires anyway.
//
// Future enhancement: implement a JTI blocklist (Redis) for immediate
// revocation — useful when a patient loses their phone and reports it.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalSessionFromRequest } from "@/lib/patient-portal/jwt";
import { getClientIp } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getPortalSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: true }); // idempotent logout
  }

  try {
    await db.auditLog.create({
      data: {
        userId: null,
        organizationId: session.organizationId,
        facilityId: null,
        action: "PATIENT_PORTAL_LOGOUT",
        actionCategory: "AUTH",
        severity: "info",
        source: "patient_portal",
        resourceType: "patient_portal_account",
        resourceId: session.accountId,
        newValues: {
          phone: session.phone,
          jti: session.jti || null,
        },
        ipAddress: getClientIp(req) || null,
        reason: "Patient logged out of portal",
      },
    });
  } catch (e) {
    console.error("[portal logout] audit log failed:", e);
  }

  return NextResponse.json({ ok: true });
}

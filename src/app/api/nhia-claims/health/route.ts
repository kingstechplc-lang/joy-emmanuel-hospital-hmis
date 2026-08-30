// =====================================================================
// API: /api/nhia-claims/health
//   GET — check the transport bridge (CLAIM-it HMS bridge on localhost:31719)
//          Returns: { reachable, endpoint, version?, error? }
// =====================================================================
import { NextResponse } from "next/server";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { createTransport } from "@/integrations/nhia/claim-it";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NHIA_CLAIM_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Always check the bridge — even when transportMode=file, the user may
  // want to know whether the bridge is available before switching to it.
  const bridge = createTransport("bridge");
  const result = await bridge.healthCheck();

  return NextResponse.json({
    ...result,
    configuredTransport: process.env.NHIA_CLAIMIT_TRANSPORT || "file",
    bridgeUrl: process.env.NHIA_CLAIMIT_BRIDGE_URL || "http://localhost:31719",
  });
}

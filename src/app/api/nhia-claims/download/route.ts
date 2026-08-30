// =====================================================================
// API: /api/nhia-claims/download
//   GET — download the XML file for a given claim generation ID.
//          Also bumps the download count + records the timestamp.
//
// Query: ?id=<exportId>
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NHIA_CLAIM_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
  }

  const record = await db.nhiaClaimExport.findUnique({ where: { id } });
  if (!record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }
  if (record.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!record.xmlPayload) {
    return NextResponse.json(
      { error: "XML payload not available — generation likely failed." },
      { status: 404 },
    );
  }

  // Bump download count + timestamp (fire-and-forget)
  db.nhiaClaimExport.update({
    where: { id },
    data: {
      downloadCount: { increment: 1 },
      downloadedAt: new Date(),
    },
  }).catch(() => { /* non-fatal */ });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: record.facilityId || undefined,
    action: "NHIA_CLAIM_DOWNLOADED",
    resourceType: "nhia_claim_export",
    resourceId: record.id,
    newValues: { claimNumber: record.claimNumber, encounterId: record.encounterId },
  });

  // Filename: BAT-<facilityCode>-<period>-<claimNumber>.xml
  const safeName = (record.claimNumber || "nhia-claim").replace(/[^\w.-]/g, "_");
  const filename = `${safeName}.xml`;

  return new NextResponse(record.xmlPayload, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}

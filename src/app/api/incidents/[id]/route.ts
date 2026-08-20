// =====================================================================
// API: /api/incidents/[id]
//   PATCH — advance incident status (reported → investigating → resolved)
//           body: { status: "investigating"|"resolved", resolution? }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_STATUSES = ["reported", "investigating", "resolved"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TASK_ASSIGN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { status, resolution } = body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const existing = await db.incidentReport.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  // If marking as resolved, require a resolution note
  if (status === "resolved" && !resolution) {
    return NextResponse.json({ error: "resolution is required when marking an incident as resolved" }, { status: 400 });
  }

  const updated = await db.incidentReport.update({
    where: { id },
    data: {
      status,
      resolution: status === "resolved" ? resolution : existing.resolution,
      resolvedAt: status === "resolved" ? new Date() : existing.resolvedAt,
    },
    include: {
      facility: { select: { id: true, name: true, code: true } },
      reportedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: `INCIDENT_${status.toUpperCase()}`,
    resourceType: "incident_report",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status, resolutionPreview: resolution ? resolution.slice(0, 200) : null },
  });

  return NextResponse.json({ item: updated });
}

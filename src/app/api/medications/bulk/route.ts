// =====================================================================
// API: /api/medications/bulk
//   POST — bulk update medications (activate/deactivate/assign category)
//   Body: { medicationIds: string[], action: "activate"|"deactivate"|"setCategory", value?: string }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MEDICATION_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { medicationIds, action, value } = body;

  if (!Array.isArray(medicationIds) || medicationIds.length === 0) {
    return NextResponse.json({ error: "medicationIds array is required" }, { status: 400 });
  }
  if (!["activate", "deactivate", "setCategory"].includes(action)) {
    return NextResponse.json({ error: "action must be 'activate', 'deactivate', or 'setCategory'" }, { status: 400 });
  }

  let updateData: any = { updatedById: session.user.id };
  let auditAction = "";

  if (action === "activate") {
    updateData.status = "active";
    auditAction = "MEDICATION_BULK_ACTIVATE";
  } else if (action === "deactivate") {
    updateData.status = "inactive";
    auditAction = "MEDICATION_BULK_DEACTIVATE";
  } else if (action === "setCategory") {
    if (!value) {
      return NextResponse.json({ error: "value (category) is required for setCategory action" }, { status: 400 });
    }
    updateData.medicationCategory = value;
    auditAction = "MEDICATION_BULK_SET_CATEGORY";
  }

  const result = await db.medication.updateMany({
    where: {
      id: { in: medicationIds },
      organizationId: session.user.organizationId,
    },
    data: updateData,
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: auditAction,
    resourceType: "medication",
    newValues: { count: result.count, action, value },
  });

  return NextResponse.json({ updated: result.count, action, value });
}

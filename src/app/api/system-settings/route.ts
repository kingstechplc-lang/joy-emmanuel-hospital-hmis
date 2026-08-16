// =====================================================================
// API: /api/system-settings
//   GET — list all settings (optionally scoped to org or facility)
//   PUT — upsert a setting value
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || undefined;

  // Org-level + (optionally) facility-scoped settings
  const where: any = {
    OR: [
      { organizationId: session.user.organizationId, facilityId: null },
      ...(facilityId ? [{ organizationId: session.user.organizationId, facilityId }] : []),
    ],
  };

  const settings = await db.systemSetting.findMany({
    where,
    orderBy: { settingKey: "asc" },
  });

  // Group by category inferred from key prefix
  const grouped: Record<string, any[]> = {};
  for (const s of settings) {
    const category = s.settingKey.split("_")[0] || "general";
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(s);
  }

  return NextResponse.json({ items: settings, grouped });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { settingKey, settingValue, settingType, facilityId } = body;

  if (!settingKey) {
    return NextResponse.json({ error: "settingKey is required" }, { status: 400 });
  }

  const orgId = session.user.organizationId;
  const resolvedFacilityId = facilityId || null;

  // Find existing setting (composite unique with null facilityId requires findFirst)
  const existing = await db.systemSetting.findFirst({
    where: {
      organizationId: orgId,
      facilityId: resolvedFacilityId,
      settingKey,
    },
  });

  const setting = existing
    ? await db.systemSetting.update({
        where: { id: existing.id },
        data: {
          settingValue: settingValue !== undefined ? String(settingValue) : existing.settingValue,
          settingType: settingType || existing.settingType,
          updatedById: session.user.id,
        },
      })
    : await db.systemSetting.create({
        data: {
          organizationId: orgId,
          facilityId: resolvedFacilityId,
          settingKey,
          settingValue: settingValue !== undefined ? String(settingValue) : null,
          settingType: settingType || "string",
          updatedById: session.user.id,
        },
      });

  await auditLog({
    userId: session.user.id,
    organizationId: orgId,
    facilityId: resolvedFacilityId || undefined,
    action: "SETTINGS_CHANGED",
    resourceType: "system_setting",
    resourceId: setting.id,
    oldValues: existing ? { settingValue: existing.settingValue } : undefined,
    newValues: { settingKey, settingValue, settingType },
  });

  return NextResponse.json({ item: setting });
}

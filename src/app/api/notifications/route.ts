// =====================================================================
// API: /api/notifications
//   GET  — list notifications for the current user
//   Query params:
//     ?unreadOnly=true     — only unread notifications
//     ?type=lab_order_created  — filter by workflow event type
//     ?referenceType=lab_order — filter by reference type
//     ?limit=50            — max results (default 50, max 200)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const type = url.searchParams.get("type");
  const referenceType = url.searchParams.get("referenceType");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);

  const where: any = { userId: session.user.id };
  if (unreadOnly) where.readAt = null;
  if (type) where.type = type;
  if (referenceType) where.referenceType = referenceType;

  const notifications = await db.notification.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  // Compute summary counts by type for the workflow dashboard
  const allForUser = await db.notification.findMany({
    where: { userId: session.user.id },
    select: { type: true, readAt: true },
  });

  const byType: Record<string, { total: number; unread: number }> = {};
  for (const n of allForUser) {
    const t = n.type || "other";
    if (!byType[t]) byType[t] = { total: 0, unread: 0 };
    byType[t].total++;
    if (!n.readAt) byType[t].unread++;
  }

  const totalUnread = allForUser.filter((n) => !n.readAt).length;

  return NextResponse.json({
    notifications,
    count: notifications.length,
    summary: {
      total: allForUser.length,
      unread: totalUnread,
      byType,
    },
  });
}

// =====================================================================
// POST — mark all as read (bulk action)
// =====================================================================
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action === "markAllRead") {
    const result = await db.notification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ updated: result.count });
  }

  if (action === "markTypeRead") {
    const { type } = body;
    if (!type) return NextResponse.json({ error: "type is required" }, { status: 400 });
    const result = await db.notification.updateMany({
      where: { userId: session.user.id, type, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ updated: result.count });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

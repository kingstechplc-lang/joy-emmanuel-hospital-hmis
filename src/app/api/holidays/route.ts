// API: /api/holidays — GET (list) + POST (create)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const year = url.searchParams.get("year");
  const where: any = { organizationId: session.user.organizationId, active: true };
  if (facilityId) where.OR = [{ facilityId: null }, { facilityId }];
  if (year) {
    const start = new Date(`${year}-01-01`);
    const end = new Date(`${year}-12-31`);
    where.date = { gte: start, lte: end };
  }
  const items = await db.holiday.findMany({ where, orderBy: { date: "asc" } });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.HOLIDAY_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, date, type, description, isRecurring, facilityId } = body;
  if (!name || !date) return NextResponse.json({ error: "name, date are required" }, { status: 400 });
  const item = await db.holiday.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      name,
      date: new Date(date),
      type: type || "public",
      description,
      isRecurring: !!isRecurring,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "HOLIDAY_CREATED", resourceType: "holiday", resourceId: item.id, newValues: { name, date } });
  return NextResponse.json({ item }, { status: 201 });
}

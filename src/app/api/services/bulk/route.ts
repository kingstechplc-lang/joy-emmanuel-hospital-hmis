// =====================================================================
// API: /api/services/bulk
//   POST — bulk price update (percentage or fixed, with preview)
//   Body: { serviceIds: string[], action: "percentage_increase"|"percentage_decrease"|"fixed_set"|"activate"|"deactivate", value: number, priceType: "default"|"nhis" }
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
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { serviceIds, action, value, priceType = "default" } = body;

  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    return NextResponse.json({ error: "serviceIds array is required" }, { status: 400 });
  }

  const validActions = ["percentage_increase", "percentage_decrease", "fixed_set", "activate", "deactivate"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${validActions.join(", ")}` }, { status: 400 });
  }

  // Load existing services for preview + history
  const services = await db.service.findMany({
    where: { id: { in: serviceIds }, organizationId: session.user.organizationId },
    select: { id: true, name: true, code: true, defaultPrice: true, nhisPrice: true, status: true },
  });

  if (services.length === 0) {
    return NextResponse.json({ error: "No matching services found" }, { status: 404 });
  }

  let updated = 0;
  const changes: { id: string; name: string; oldPrice: number | null; newPrice: number | null }[] = [];

  for (const svc of services) {
    let updateData: any = { updatedById: session.user.id };
    let oldPrice: number | null = null;
    let newPrice: number | null = null;

    if (action === "activate") {
      updateData.status = "active";
    } else if (action === "deactivate") {
      updateData.status = "inactive";
    } else {
      // Price update
      const currentPrice = priceType === "nhis" ? (svc.nhisPrice ?? 0) : svc.defaultPrice;
      oldPrice = currentPrice;

      if (action === "percentage_increase") {
        newPrice = currentPrice * (1 + Number(value) / 100);
      } else if (action === "percentage_decrease") {
        newPrice = currentPrice * (1 - Number(value) / 100);
      } else if (action === "fixed_set") {
        newPrice = Number(value);
      }

      newPrice = Math.round((newPrice || 0) * 100) / 100; // Round to 2 decimal places
      if (newPrice < 0) newPrice = 0;

      if (priceType === "nhis") {
        updateData.nhisPrice = newPrice;
      } else {
        updateData.defaultPrice = newPrice;
      }
    }

    await db.service.update({ where: { id: svc.id }, data: updateData });
    updated++;

    if (oldPrice !== null && newPrice !== null) {
      changes.push({ id: svc.id, name: svc.name, oldPrice, newPrice });

      // Record price history
      await db.servicePriceHistory.create({
        data: {
          organizationId: session.user.organizationId,
          serviceId: svc.id,
          oldPrice,
          newPrice,
          priceType,
          reason: `Bulk ${action} by ${session.user.name || "user"}`,
          changedById: session.user.id,
        },
      });
    }
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SERVICE_BULK_UPDATE",
    resourceType: "service",
    newValues: { count: updated, action, value, priceType, priceChanges: changes.length },
  });

  return NextResponse.json({ updated, action, changes: changes.slice(0, 50) });
}

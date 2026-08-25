// =====================================================================
// API: /api/services/export
//   GET — export all services as CSV
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const services = await db.service.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { name: "asc" },
    select: {
      name: true, shortName: true, code: true, category: true, serviceType: true,
      description: true, defaultPrice: true, nhisPrice: true, insurancePrice: true,
      cashPrice: true, isBillable: true, isTaxable: true, nhisEligible: true,
      nhisServiceCode: true, unitOfMeasure: true, status: true,
    },
  });

  const headers = [
    "name", "shortName", "code", "category", "serviceType", "description",
    "defaultPrice", "nhisPrice", "insurancePrice", "cashPrice",
    "isBillable", "isTaxable", "nhisEligible", "nhisServiceCode",
    "unitOfMeasure", "status",
  ];

  const csvLines = [headers.join(",")];
  for (const s of services) {
    const row = headers.map((h) => {
      const val = (s as any)[h];
      if (val === null || val === undefined) return "";
      if (typeof val === "string" && val.includes(",")) return `"${val.replace(/"/g, '""')}"`;
      if (typeof val === "boolean") return val ? "true" : "false";
      return String(val);
    });
    csvLines.push(row.join(","));
  }

  const csv = csvLines.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="services_export_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

// =====================================================================
// API: /api/suppliers/export
//   GET — exports the org's suppliers as a CSV file.
//   Columns:
//     Name, Code, Category, Type, Status, Contact, Phone, Email,
//     City, Country, Preferred, Compliance, Total Orders, Total Spend
//
//   Supports the same query filters as GET /api/suppliers so the
//   exported file matches what the user is currently viewing.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.organizationId;

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const status = url.searchParams.get("status") || "all";
    const category = url.searchParams.get("category") || "";
    const supplierType = url.searchParams.get("supplierType") || "";
    const isPreferredParam = url.searchParams.get("isPreferred");
    const complianceStatus = url.searchParams.get("complianceStatus") || "";

    const where: any = { organizationId: orgId };
    if (status && status !== "all") where.status = status;
    if (category) where.category = category;
    if (supplierType) where.supplierType = supplierType;
    if (isPreferredParam === "true" || isPreferredParam === "1") where.isPreferred = true;
    if (isPreferredParam === "false" || isPreferredParam === "0") where.isPreferred = false;
    if (complianceStatus) where.complianceStatus = complianceStatus;

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { contactPerson: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { legalBusinessName: { contains: q, mode: "insensitive" } },
        { tradingName: { contains: q, mode: "insensitive" } },
        { vendorId: { contains: q, mode: "insensitive" } },
        { registrationNumber: { contains: q, mode: "insensitive" } },
        { taxIdNumber: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
      ];
    }

    const suppliers = await db.supplier.findMany({
      where,
      orderBy: { name: "asc" },
      take: 2000,
      select: {
        id: true,
        name: true,
        code: true,
        category: true,
        supplierType: true,
        status: true,
        contactPerson: true,
        phone: true,
        email: true,
        city: true,
        country: true,
        isPreferred: true,
        complianceStatus: true,
        totalOrders: true,
        totalSpend: true,
      },
    });

    const headers = [
      "Name",
      "Code",
      "Category",
      "Type",
      "Status",
      "Contact",
      "Phone",
      "Email",
      "City",
      "Country",
      "Preferred",
      "Compliance",
      "Total Orders",
      "Total Spend",
    ];

    const rows = suppliers.map((s) => [
      s.name,
      s.code,
      s.category || "",
      s.supplierType || "",
      s.status,
      s.contactPerson || "",
      s.phone || "",
      s.email || "",
      s.city || "",
      s.country || "",
      s.isPreferred ? "Yes" : "No",
      s.complianceStatus || "",
      String(s.totalOrders ?? 0),
      (s.totalSpend ?? 0).toFixed(2),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => csvEscape(cell)).join(","))
      .join("\r\n");

    await auditLog({
      userId: session.user.id,
      organizationId: orgId,
      facilityId: session.user.facilityId || undefined,
      action: "SUPPLIER_EXPORTED",
      resourceType: "supplier",
      newValues: { count: suppliers.length, filters: { q, status, category, supplierType, complianceStatus } },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="suppliers-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/suppliers/export] failed:", err);
    return NextResponse.json(
      { error: "Failed to export suppliers", detail: err?.message },
      { status: 500 }
    );
  }
}

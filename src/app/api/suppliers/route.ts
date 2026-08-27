// =====================================================================
// API: /api/suppliers
//   GET  — list suppliers (org-wide) with filters & search
//   POST — create supplier (full Ghana-ready vendor onboarding)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Fields accepted on create/update (kept here so POST and PATCH share the same surface)
const SUPPLIER_FIELDS = [
  // Identity & contact (existing)
  "name",
  "code",
  "contactPerson",
  "phone",
  "email",
  "address",
  "status",
  // Classification (new)
  "supplierType",
  "category",
  // Business identity (new)
  "legalBusinessName",
  "tradingName",
  "vendorId",
  "registrationNumber",
  "taxIdNumber",
  "vatStatus",
  // Contact details (new)
  "website",
  "alternatePhone",
  "postalAddress",
  "city",
  "region",
  "country",
  "digitalAddress",
  // Payment & banking (new)
  "paymentTerms",
  "creditLimit",
  "bankName",
  "bankAccountName",
  "bankAccountNumber",
  "bankBranch",
  "swiftCode",
  // Compliance & preferences (new)
  "isPreferred",
  "complianceStatus",
  // Performance metrics (new — usually computed, but allow seeding)
  "performanceRating",
] as const;

function pickFields(body: any, fields: readonly string[]) {
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    if (body[f] !== undefined && body[f] !== null && body[f] !== "") {
      data[f] = body[f];
    } else if (body[f] === null) {
      data[f] = null;
    }
  }
  return data;
}

// GET /api/suppliers?q=&status=&category=&supplierType=&isPreferred=&complianceStatus=
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const status = url.searchParams.get("status") || "all";
    const category = url.searchParams.get("category") || "";
    const supplierType = url.searchParams.get("supplierType") || "";
    const isPreferredParam = url.searchParams.get("isPreferred");
    const complianceStatus = url.searchParams.get("complianceStatus") || "";

    const where: any = { organizationId: session.user.organizationId };

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
      take: 500,
      include: {
        _count: { select: { purchaseOrders: true, contacts: true, documents: true } },
      },
    });

    return NextResponse.json({ items: suppliers, count: suppliers.length });
  } catch (err: any) {
    console.error("[GET /api/suppliers] failed:", err);
    return NextResponse.json(
      { error: "Failed to load suppliers", detail: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// POST /api/suppliers
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCUREMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { name, code } = body;
  if (!name || !code) {
    return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  }

  // Check code uniqueness within the organization
  try {
    const existing = await db.supplier.findFirst({
      where: { organizationId: session.user.organizationId, code },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Supplier code already exists in this organization" },
        { status: 409 }
      );
    }
  } catch (err: any) {
    console.error("[POST /api/suppliers] uniqueness check failed:", err);
    return NextResponse.json(
      { error: "Failed to validate supplier code", detail: err?.message },
      { status: 500 }
    );
  }

  const data: any = pickFields(body, SUPPLIER_FIELDS);
  data.organizationId = session.user.organizationId;
  // New suppliers default to pending_verification until approved/verified
  if (!data.status) data.status = "pending_verification";
  data.createdById = session.user.id;
  // Sanitize numbers
  if (data.creditLimit !== undefined) data.creditLimit = Number(data.creditLimit) || 0;
  if (data.performanceRating !== undefined)
    data.performanceRating = data.performanceRating === null ? null : Number(data.performanceRating);
  if (data.isPreferred === "true") data.isPreferred = true;
  if (data.isPreferred === "false") data.isPreferred = false;

  try {
    const supplier = await db.supplier.create({ data });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "SUPPLIER_CREATED",
      resourceType: "supplier",
      resourceId: supplier.id,
      newValues: { ...data, createdById: session.user.id },
    });

    return NextResponse.json({ item: supplier }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/suppliers] create failed:", err);
    return NextResponse.json(
      { error: "Failed to create supplier", detail: err?.message },
      { status: 500 }
    );
  }
}

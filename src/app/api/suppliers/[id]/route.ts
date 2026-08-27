// =====================================================================
// API: /api/suppliers/[id]
//   GET    — fetch single supplier with deep relations + metrics
//   PATCH  — basic field updates OR lifecycle actions (approve/suspend/etc.)
//   DELETE — soft delete (status -> inactive)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const UPDATABLE_FIELDS = [
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
  // Performance metrics (new)
  "performanceRating",
] as const;

// GET /api/suppliers/[id]
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const supplier = await db.supplier.findUnique({
      where: { id },
      include: {
        approvedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
        verifiedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
        suspendedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, username: true } },
        contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
        documents: { orderBy: { createdAt: "desc" } },
        supplierProducts: {
          include: {
            inventoryItem: { select: { id: true, name: true, sku: true, unit: true, itemType: true } },
          },
          orderBy: [{ isPreferred: "desc" }, { createdAt: "desc" }],
        },
        evaluations: {
          include: {
            evaluatedBy: { select: { id: true, firstName: true, lastName: true } },
            facility: { select: { id: true, name: true } },
          },
          orderBy: { evaluatedAt: "desc" },
        },
        complaints: {
          include: {
            resolvedBy: { select: { id: true, firstName: true, lastName: true } },
            facility: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        purchaseOrders: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            purchaseOrderNumber: true,
            status: true,
            total: true,
            createdAt: true,
            orderedAt: true,
            approvedAt: true,
            facility: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: {
            purchaseOrders: true,
            contacts: true,
            documents: true,
            supplierProducts: true,
            evaluations: true,
            complaints: true,
          },
        },
      },
    });

    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    // Compute aggregated metrics from purchase orders
    const poAgg = await db.purchaseOrder.aggregate({
      where: { supplierId: id, status: { notIn: ["cancelled", "draft"] } },
      _sum: { total: true },
      _count: { _all: true },
    });

    return NextResponse.json({
      item: supplier,
      metrics: {
        totalOrders: poAgg._count._all,
        totalSpend: poAgg._sum.total || 0,
        storedTotalOrders: supplier.totalOrders,
        storedTotalSpend: supplier.totalSpend,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/suppliers/[id]] failed:", err);
    return NextResponse.json(
      { error: "Failed to load supplier", detail: err?.message },
      { status: 500 }
    );
  }
}

// PATCH /api/suppliers/[id]
// Body shape:
//   { action: "approve" | "suspend" | "activate" | "deactivate" | "mark_preferred" | "remove_preferred" | "verify", reason?: string }
//   OR  { name?, code?, ...basic fields }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCUREMENT_MANAGE)) {
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

  try {
    const existing = await db.supplier.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    // ---------- Lifecycle actions ----------
    if (body.action && typeof body.action === "string") {
      const action = body.action as string;
      const reason: string | undefined = body.reason;
      const updates: Record<string, unknown> = {};
      let auditAction = "SUPPLIER_UPDATED";

      switch (action) {
        case "approve": {
          if (existing.status !== "pending_verification" && existing.status !== "active") {
            return NextResponse.json(
              { error: `Cannot approve supplier in '${existing.status}' state` },
              { status: 400 }
            );
          }
          updates.status = "active";
          updates.approvedById = session.user.id;
          updates.approvedAt = new Date();
          auditAction = "SUPPLIER_APPROVED";
          break;
        }
        case "suspend": {
          if (existing.status === "suspended") {
            return NextResponse.json({ error: "Supplier is already suspended" }, { status: 400 });
          }
          if (!reason || !reason.trim()) {
            return NextResponse.json(
              { error: "A suspension reason is required" },
              { status: 400 }
            );
          }
          updates.status = "suspended";
          updates.suspendedAt = new Date();
          updates.suspendedById = session.user.id;
          updates.suspensionReason = reason.trim();
          auditAction = "SUPPLIER_SUSPENDED";
          break;
        }
        case "activate": {
          if (existing.status !== "suspended" && existing.status !== "inactive") {
            return NextResponse.json(
              { error: `Cannot activate supplier in '${existing.status}' state` },
              { status: 400 }
            );
          }
          updates.status = "active";
          updates.suspendedAt = null;
          updates.suspendedById = null;
          updates.suspensionReason = null;
          auditAction = "SUPPLIER_ACTIVATED";
          break;
        }
        case "deactivate": {
          if (existing.status === "inactive") {
            return NextResponse.json({ error: "Supplier is already inactive" }, { status: 400 });
          }
          updates.status = "inactive";
          auditAction = "SUPPLIER_DEACTIVATED";
          break;
        }
        case "mark_preferred": {
          updates.isPreferred = true;
          auditAction = "SUPPLIER_MARKED_PREFERRED";
          break;
        }
        case "remove_preferred": {
          updates.isPreferred = false;
          auditAction = "SUPPLIER_REMOVED_PREFERRED";
          break;
        }
        case "verify": {
          updates.verifiedById = session.user.id;
          updates.verifiedAt = new Date();
          if (existing.complianceStatus === "under_review" || !existing.complianceStatus) {
            updates.complianceStatus = "compliant";
          }
          auditAction = "SUPPLIER_VERIFIED";
          break;
        }
        default:
          return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
      }

      const updated = await db.supplier.update({ where: { id }, data: updates });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: session.user.facilityId || undefined,
        action: auditAction,
        resourceType: "supplier",
        resourceId: id,
        oldValues: {
          status: existing.status,
          isPreferred: existing.isPreferred,
          approvedAt: existing.approvedAt,
          verifiedAt: existing.verifiedAt,
          suspendedAt: existing.suspendedAt,
        },
        newValues: updates,
        reason,
      });

      return NextResponse.json({ item: updated });
    }

    // ---------- Basic field update (default) ----------
    const data: any = {};
    for (const f of UPDATABLE_FIELDS) {
      if (body[f] !== undefined) {
        if (body[f] === "") {
          data[f] = null;
        } else {
          data[f] = body[f];
        }
      }
    }

    // If updating code, check uniqueness (excluding self)
    if (body.code && body.code !== existing.code) {
      const dupe = await db.supplier.findFirst({
        where: {
          organizationId: existing.organizationId,
          code: body.code,
          NOT: { id },
        },
      });
      if (dupe) {
        return NextResponse.json({ error: "Supplier code already exists" }, { status: 409 });
      }
    }

    // Sanitize numeric fields
    if (data.creditLimit !== undefined) data.creditLimit = Number(data.creditLimit) || 0;
    if (data.performanceRating !== undefined) {
      data.performanceRating = data.performanceRating === null ? null : Number(data.performanceRating);
    }
    if (data.isPreferred === "true") data.isPreferred = true;
    if (data.isPreferred === "false") data.isPreferred = false;

    const updated = await db.supplier.update({ where: { id }, data });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "SUPPLIER_UPDATED",
      resourceType: "supplier",
      resourceId: id,
      oldValues: existing,
      newValues: data,
    });

    return NextResponse.json({ item: updated });
  } catch (err: any) {
    console.error("[PATCH /api/suppliers/[id]] failed:", err);
    return NextResponse.json(
      { error: "Failed to update supplier", detail: err?.message },
      { status: 500 }
    );
  }
}

// DELETE /api/suppliers/[id]  (soft delete)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCUREMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const existing = await db.supplier.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    const updated = await db.supplier.update({
      where: { id },
      data: { status: "inactive" },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "SUPPLIER_DEACTIVATED",
      resourceType: "supplier",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "inactive" },
    });

    return NextResponse.json({ item: updated });
  } catch (err: any) {
    console.error("[DELETE /api/suppliers/[id]] failed:", err);
    return NextResponse.json(
      { error: "Failed to deactivate supplier", detail: err?.message },
      { status: 500 }
    );
  }
}

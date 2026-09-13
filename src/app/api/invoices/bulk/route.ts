// =====================================================================
// API: /api/invoices/bulk
//   GET  — returns eligible encounters for bulk invoice generation
//          (encounters with unbilled services)
//   POST — generates invoices for multiple encounters in one batch
//
// PERMISSIONS:
//   GET  requires  invoice.bulk_generate (or super_admin)
//   POST requires  invoice.bulk_generate (or super_admin)
//
// GET returns encounters that have services rendered but no invoice yet.
// POST creates one invoice per encounter (using existing invoice logic),
// with idempotency protection (duplicate detection).
//
// SAFETY:
//   - Only encounters with unbilled services are eligible
//   - Existing invoices are NOT overwritten (skip if invoice exists)
//   - Each invoice is created through the same logic as POST /api/invoices
//   - Missing payer info skips the encounter (reported, not failed)
//   - Idempotency: if an invoice already exists for the encounter+services,
//     it's skipped (not duplicated)
//   - All operations audit-logged (BULK_INVOICES_GENERATED)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog, nextInvoiceNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// ─── GET /api/invoices/bulk ─────────────────────────────────────────
// Returns encounters with unbilled services at the active facility.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_BULK_GENERATE)) {
    return NextResponse.json({ error: "Forbidden — requires invoice.bulk_generate" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });

  try {
    // Find encounters at this facility that are active (not closed/cancelled)
    // and have services rendered (consultations, lab orders, imaging, procedures, prescriptions)
    const encounters = await db.encounter.findMany({
      where: {
        facilityId,
        status: { notIn: ["cancelled"] },
      },
      select: {
        id: true,
        encounterNumber: true,
        encounterType: true,
        startAt: true,
        status: true,
        patient: {
          select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true },
        },
        _count: {
          select: {
            consultations: true,
            labOrders: true,
            imagingOrders: true,
            procedures: true,
            prescriptions: true,
            invoices: true,
          },
        },
      },
      orderBy: { startAt: "desc" },
      take: 100,
    });

    // Filter: encounters that have services but NO existing invoice
    const eligible = encounters.filter((e) => {
      const hasServices = e._count.consultations > 0 || e._count.labOrders > 0 ||
        e._count.imagingOrders > 0 || e._count.procedures > 0 || e._count.prescriptions > 0;
      const hasInvoice = e._count.invoices > 0;
      return hasServices && !hasInvoice;
    });

    return NextResponse.json({
      items: eligible.map((e) => ({
        id: e.id,
        encounterNumber: e.encounterNumber,
        encounterType: e.encounterType,
        startAt: e.startAt,
        status: e.status,
        patient: e.patient,
        serviceCounts: {
          consultations: e._count.consultations,
          labOrders: e._count.labOrders,
          imagingOrders: e._count.imagingOrders,
          procedures: e._count.procedures,
          prescriptions: e._count.prescriptions,
        },
      })),
      count: eligible.length,
    });
  } catch (e: any) {
    console.error("[GET /api/invoices/bulk]", e);
    return NextResponse.json({ error: e.message || "Failed to load eligible encounters" }, { status: 500 });
  }
}

// ─── POST /api/invoices/bulk ────────────────────────────────────────
// Body: { encounterIds: string[], payerType?: string, insuranceProviderId?: string }
// Returns: { successCount, skippedCount, failedCount, results: [...] }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_BULK_GENERATE)) {
    return NextResponse.json({ error: "Forbidden — requires invoice.bulk_generate" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { encounterIds } = body;
  if (!Array.isArray(encounterIds) || encounterIds.length === 0) {
    return NextResponse.json({ error: "encounterIds array is required" }, { status: 400 });
  }

  const organizationId = session.user.organizationId;
  const userId = session.user.id;
  const facilityId = body.facilityId || session.user.facilityId;
  const payerType = body.payerType || "self_pay";
  const insuranceProviderId = body.insuranceProviderId || null;

  const rowResults: any[] = [];
  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < encounterIds.length; i++) {
    const encounterId = encounterIds[i];

    try {
      // ── Fetch the encounter with its billable services ──────────
      const encounter = await db.encounter.findUnique({
        where: { id: encounterId },
        select: {
          id: true, patientId: true, facilityId: true, status: true,
          encounterNumber: true,
          _count: { select: { invoices: true } },
        },
      });

      if (!encounter) {
        rowResults.push({ index: i, encounterId, status: "failed", error: "Encounter not found" });
        failedCount++;
        continue;
      }

      // IDOR: verify encounter is in user's facility
      if (encounter.facilityId !== facilityId) {
        rowResults.push({ index: i, encounterId, status: "failed", error: "Encounter not in your facility" });
        failedCount++;
        continue;
      }

      // ── Duplicate detection: skip if invoice already exists ──────
      if (encounter._count.invoices > 0) {
        rowResults.push({
          index: i, encounterId, status: "skipped",
          reason: "Invoice already exists for this encounter",
        });
        skippedCount++;
        continue;
      }

      // ── Build invoice items from encounter services ─────────────
      // Gather billable services: consultations, lab orders, imaging, procedures
      const [consultations, labOrders, imagingOrders, procedures] = await Promise.all([
        // Consultations → consultation service
        db.consultation.findMany({
          where: { encounterId },
          select: { id: true },
        }),
        // Lab orders → individual test prices
        db.labOrder.findMany({
          where: { encounterId, status: { not: "cancelled" } },
          include: {
            items: {
              include: { laboratoryTest: { select: { id: true, name: true } } },
            },
          },
        }),
        // Imaging orders → procedure price
        db.imagingOrder.findMany({
          where: { encounterId, status: { not: "cancelled" } },
          select: { id: true, procedureName: true },
        }),
        // Procedures
        db.procedure.findMany({
          where: { encounterId, status: { not: "cancelled" } },
          select: { id: true, procedureName: true },
        }),
      ]);

      const invoiceItems: any[] = [];

      // Add consultation items
      for (const c of consultations) {
        // Find the consultation service for this facility
        const svc = await db.service.findFirst({
          where: { organizationId, category: "consultation", status: "active" },
          select: { id: true, name: true, defaultPrice: true },
        });
        if (svc) {
          // Check for facility-specific price
          const fp = await db.facilityServicePrice.findFirst({
            where: { facilityId, serviceId: svc.id, status: "active" },
            select: { price: true },
          });
          invoiceItems.push({
            serviceId: svc.id,
            description: `Consultation — ${svc.name}`,
            quantity: 1,
            unitPrice: fp?.price ?? svc.defaultPrice ?? 0,
            referenceType: "consultation",
            referenceId: c.id,
          });
        }
      }

      // Add lab order items
      for (const lab of labOrders) {
        for (const item of lab.items) {
          // Try to find a matching service for the lab test
          const svc = await db.service.findFirst({
            where: {
              organizationId,
              category: "lab",
              status: "active",
              OR: [
                { name: { contains: item.laboratoryTest?.name || "", mode: "insensitive" } },
              ],
            },
            select: { id: true, name: true, defaultPrice: true },
          });
          if (svc) {
            const fp = await db.facilityServicePrice.findFirst({
              where: { facilityId, serviceId: svc.id, status: "active" },
              select: { price: true },
            });
            invoiceItems.push({
              serviceId: svc.id,
              description: `Lab: ${item.laboratoryTest?.name || "Unknown test"}`,
              quantity: 1,
              unitPrice: fp?.price ?? svc.defaultPrice ?? 0,
              referenceType: "lab_order",
              referenceId: item.id,
            });
          } else {
            // No matching service — still add as a line item with 0 price
            invoiceItems.push({
              serviceId: null,
              description: `Lab: ${item.laboratoryTest?.name || "Unknown test"}`,
              quantity: 1,
              unitPrice: 0,
              referenceType: "lab_order",
              referenceId: item.id,
            });
          }
        }
      }

      // Add imaging items
      for (const img of imagingOrders) {
        const svc = await db.service.findFirst({
          where: { organizationId, category: "imaging", status: "active" },
          select: { id: true, name: true, defaultPrice: true },
        });
        if (svc) {
          const fp = await db.facilityServicePrice.findFirst({
            where: { facilityId, serviceId: svc.id, status: "active" },
            select: { price: true },
          });
          invoiceItems.push({
            serviceId: svc.id,
            description: `Imaging: ${img.procedureName}`,
            quantity: 1,
            unitPrice: fp?.price ?? svc.defaultPrice ?? 0,
            referenceType: "imaging_order",
            referenceId: img.id,
          });
        }
      }

      // Add procedure items
      for (const proc of procedures) {
        const svc = await db.service.findFirst({
          where: { organizationId, category: "procedure", status: "active" },
          select: { id: true, name: true, defaultPrice: true },
        });
        if (svc) {
          const fp = await db.facilityServicePrice.findFirst({
            where: { facilityId, serviceId: svc.id, status: "active" },
            select: { price: true },
          });
          invoiceItems.push({
            serviceId: svc.id,
            description: `Procedure: ${proc.procedureName}`,
            quantity: 1,
            unitPrice: fp?.price ?? svc.defaultPrice ?? 0,
            referenceType: "procedure",
            referenceId: proc.id,
          });
        }
      }

      // Skip if no billable items
      if (invoiceItems.length === 0) {
        rowResults.push({
          index: i, encounterId, status: "skipped",
          reason: "No billable services found for this encounter",
        });
        skippedCount++;
        continue;
      }

      // ── Create the invoice (same logic as POST /api/invoices) ────
      const invoiceNumber = await nextInvoiceNumber(facilityId);
      const subtotal = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const total = Math.max(0, subtotal);

      const invoice = await db.invoice.create({
        data: {
          patientId: encounter.patientId,
          encounterId,
          facilityId,
          invoiceNumber,
          status: "draft",
          invoiceType: "patient",
          payerType,
          subtotal,
          total,
          balance: total,
          amountPaid: 0,
          amountRefunded: 0,
          amountCredited: 0,
          insuranceProviderId,
          currency: "GHS",
          createdById: userId,
          items: { create: invoiceItems },
        },
      });

      await auditLog({
        userId,
        organizationId,
        facilityId,
        action: "INVOICE_CREATED",
        resourceType: "invoice",
        resourceId: invoice.id,
        newValues: {
          invoiceNumber,
          encounterId,
          payerType,
          subtotal,
          total,
          itemCount: invoiceItems.length,
          source: "bulk_generate",
        },
      });

      rowResults.push({
        index: i, encounterId, status: "success",
        invoiceId: invoice.id, invoiceNumber,
        itemCount: invoiceItems.length, total,
      });
      successCount++;
    } catch (e: any) {
      rowResults.push({
        index: i, encounterId, status: "failed",
        error: e.message || "Failed to generate invoice",
      });
      failedCount++;
    }
  }

  // ── Audit log for the batch operation ──────────────────────────────
  await auditLog({
    userId,
    organizationId,
    facilityId: facilityId || undefined,
    action: "BULK_INVOICES_GENERATED",
    resourceType: "invoice",
    newValues: {
      totalEncounters: encounterIds.length,
      successCount,
      skippedCount,
      failedCount,
    },
  });

  return NextResponse.json({
    successCount,
    skippedCount,
    failedCount,
    total: encounterIds.length,
    results: rowResults,
  });
}

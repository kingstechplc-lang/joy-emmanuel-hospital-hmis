// =====================================================================
// API: /api/reports/[type]
//   GET — dynamic report endpoint
//   type: patients | clinical | lab | pharmacy | financial | operational
//   Query params: dateFrom, dateTo, facilityId
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.REPORT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type } = await params;
  const url = new URL(req.url);
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const facilityId = url.searchParams.get("facilityId");

  const orgId = session.user.organizationId;
  const now = new Date();

  // Build date filter
  const dateFilter: any = {};
  if (dateFrom) dateFilter.gte = new Date(dateFrom);
  if (dateTo) dateFilter.lte = new Date(`${dateTo}T23:59:59`);

  // Scope facilities to org
  const orgFacilities = await db.facility.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, code: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  // Apply facility filter
  const resolvedFacilityId = facilityId && orgFacilityIds.includes(facilityId) ? facilityId : null;

  switch (type) {
    case "patients": {
      const where: any = { organizationId: orgId };
      if (Object.keys(dateFilter).length > 0) where.registrationDate = dateFilter;

      const [total, newPatients, bySex, byAgeGroup] = await Promise.all([
        db.patient.count({ where }),
        db.patient.count({ where }),
        db.patient.groupBy({ by: ["sex"], where, _count: true }),
        // Age groups based on dateOfBirth
        db.patient.findMany({ where, select: { dateOfBirth: true } }),
      ]);

      const now = new Date();
      const ageGroups: Record<string, number> = {
        "0-17": 0,
        "18-39": 0,
        "40-59": 0,
        "60+": 0,
        unknown: 0,
      };
      byAgeGroup.forEach((p) => {
        if (!p.dateOfBirth) {
          ageGroups.unknown += 1;
          return;
        }
        const age = now.getFullYear() - new Date(p.dateOfBirth).getFullYear();
        if (age < 18) ageGroups["0-17"] += 1;
        else if (age < 40) ageGroups["18-39"] += 1;
        else if (age < 60) ageGroups["40-59"] += 1;
        else ageGroups["60+"] += 1;
      });

      return NextResponse.json({
        type: "patients",
        stats: {
          totalPatients: total,
          newPatients: newPatients,
          bySex: bySex.map((s) => ({ label: s.sex || "unknown", value: s._count })),
          byAgeGroup: Object.entries(ageGroups).map(([label, value]) => ({ label, value })),
        },
        tableColumns: ["Sex", "Count"],
        tableRows: bySex.map((s) => [s.sex || "unknown", String(s._count)]),
      });
    }

    case "clinical": {
      const encounterWhere: any = { facilityId: { in: orgFacilityIds } };
      if (resolvedFacilityId) encounterWhere.facilityId = resolvedFacilityId;
      if (Object.keys(dateFilter).length > 0) encounterWhere.createdAt = dateFilter;

      const [encounters, admissions, discharges, consultations, diagnoses] = await Promise.all([
        db.encounter.count({ where: encounterWhere }),
        db.admission.count({ where: { facilityId: resolvedFacilityId || { in: orgFacilityIds } } }),
        db.dischargeRecord.count({ where: {} }),
        db.consultation.count({ where: {} }),
        db.diagnosis.count({ where: {} }),
      ]);

      const byType = await db.encounter.groupBy({
        by: ["encounterType"],
        where: encounterWhere,
        _count: true,
      });

      return NextResponse.json({
        type: "clinical",
        stats: {
          encounters,
          admissions,
          discharges,
          consultations,
          diagnoses,
          byType: byType.map((t) => ({ label: t.encounterType, value: t._count })),
        },
        tableColumns: ["Encounter Type", "Count"],
        tableRows: byType.map((t) => [t.encounterType, String(t._count)]),
      });
    }

    case "lab": {
      const labWhere: any = { facilityId: { in: orgFacilityIds } };
      if (resolvedFacilityId) labWhere.facilityId = resolvedFacilityId;
      if (Object.keys(dateFilter).length > 0) labWhere.orderedAt = dateFilter;

      const [total, byStatus, byPriority] = await Promise.all([
        db.labOrder.count({ where: labWhere }),
        db.labOrder.groupBy({ by: ["status"], where: labWhere, _count: true }),
        db.labOrder.groupBy({ by: ["priority"], where: labWhere, _count: true }),
      ]);

      // Critical results (lab results with criticalFlag = true)
      const criticalResults = await db.labResult.count({
        where: { criticalFlag: true },
      });

      return NextResponse.json({
        type: "lab",
        stats: {
          totalOrders: total,
          criticalResults,
          byStatus: byStatus.map((s) => ({ label: s.status, value: s._count })),
          byPriority: byPriority.map((p) => ({ label: p.priority, value: p._count })),
        },
        tableColumns: ["Status", "Count"],
        tableRows: byStatus.map((s) => [s.status, String(s._count)]),
      });
    }

    case "pharmacy": {
      const rxWhere: any = { facilityId: { in: orgFacilityIds } };
      if (resolvedFacilityId) rxWhere.facilityId = resolvedFacilityId;
      if (Object.keys(dateFilter).length > 0) rxWhere.prescribedAt = dateFilter;

      const [prescriptions, dispensed, pending] = await Promise.all([
        db.prescription.count({ where: rxWhere }),
        db.prescription.count({ where: { ...rxWhere, status: "dispensed" } }),
        db.prescription.count({ where: { ...rxWhere, status: { in: ["pending", "approved", "partially_dispensed"] } } }),
      ]);

      // Low stock items
      const lowStock = await db.facilityInventory.findMany({
        where: {
          facilityId: resolvedFacilityId || { in: orgFacilityIds },
          currentQuantity: { lte: db.facilityInventory.fields.minimumQuantity },
        },
        take: 50,
        include: { inventoryItem: { select: { name: true, sku: true } } },
      });

      // Expiring medicines (within 90 days)
      const expiringSoon = await db.inventoryBatch.findMany({
        where: {
          expiryDate: {
            gte: now,
            lte: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          },
          quantity: { gt: 0 },
        },
        take: 50,
        include: {
          facilityInventory: {
            include: {
              facility: { select: { name: true, code: true } },
              inventoryItem: { select: { name: true, sku: true } },
            },
          },
        },
      });

      return NextResponse.json({
        type: "pharmacy",
        stats: {
          totalPrescriptions: prescriptions,
          dispensed,
          pending,
          lowStockCount: lowStock.length,
          expiringSoonCount: expiringSoon.length,
        },
        lowStock: lowStock.map((l) => ({
          id: l.id,
          itemName: l.inventoryItem.name,
          sku: l.inventoryItem.sku,
          currentQty: l.currentQuantity,
          minQty: l.minimumQuantity,
        })),
        expiringSoon: expiringSoon.map((b) => ({
          id: b.id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          quantity: b.quantity,
          itemName: b.facilityInventory.inventoryItem.name,
          facility: b.facilityInventory.facility.name,
        })),
        tableColumns: ["Item", "Current Qty", "Min Qty"],
        tableRows: lowStock.map((l) => [l.inventoryItem.name, String(l.currentQuantity), String(l.minimumQuantity)]),
      });
    }

    case "financial": {
      const invoiceWhere: any = { facilityId: { in: orgFacilityIds } };
      if (resolvedFacilityId) invoiceWhere.facilityId = resolvedFacilityId;
      if (Object.keys(dateFilter).length > 0) invoiceWhere.createdAt = dateFilter;

      const [invoices, totalRevenue, totalPaid, totalOutstanding, totalDiscounts] = await Promise.all([
        db.invoice.count({ where: invoiceWhere }),
        db.invoice.aggregate({ where: invoiceWhere, _sum: { total: true } }),
        db.invoice.aggregate({ where: invoiceWhere, _sum: { amountPaid: true } }),
        db.invoice.aggregate({ where: { ...invoiceWhere, balance: { gt: 0 } }, _sum: { balance: true } }),
        db.invoice.aggregate({ where: invoiceWhere, _sum: { discount: true } }),
      ]);

      const payments = await db.payment.aggregate({
        where: invoiceWhere,
        _sum: { amount: true },
        _count: true,
      });

      const byStatus = await db.invoice.groupBy({ by: ["status"], where: invoiceWhere, _count: true });

      const insuranceClaims = await db.insuranceClaim.aggregate({
        where: invoiceWhere,
        _sum: { claimAmount: true, approvedAmount: true },
        _count: true,
      });

      return NextResponse.json({
        type: "financial",
        stats: {
          invoices,
          totalRevenue: totalRevenue._sum.total || 0,
          totalPaid: totalPaid._sum.amountPaid || 0,
          totalOutstanding: totalOutstanding._sum.balance || 0,
          totalDiscounts: totalDiscounts._sum.discount || 0,
          totalPayments: payments._count,
          paymentsAmount: payments._sum.amount || 0,
          claimsCount: insuranceClaims._count,
          claimsAmount: insuranceClaims._sum.claimAmount || 0,
          approvedAmount: insuranceClaims._sum.approvedAmount || 0,
        },
        byStatus: byStatus.map((s) => ({ label: s.status, value: s._count })),
        tableColumns: ["Invoice Status", "Count"],
        tableRows: byStatus.map((s) => [s.status, String(s._count)]),
      });
    }

    case "operational": {
      const bedWhere: any = { facilityId: { in: orgFacilityIds } };
      if (resolvedFacilityId) bedWhere.facilityId = resolvedFacilityId;

      const [totalBeds, occupiedBeds, availableBeds, reservedBeds, maintenanceBeds] = await Promise.all([
        db.bed.count({ where: bedWhere }),
        db.bed.count({ where: { ...bedWhere, status: "occupied" } }),
        db.bed.count({ where: { ...bedWhere, status: "available" } }),
        db.bed.count({ where: { ...bedWhere, status: "reserved" } }),
        db.bed.count({ where: { ...bedWhere, status: "maintenance" } }),
      ]);

      const occupancyRate = totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0;

      // Active encounters by type (proxy for waiting times)
      const activeEncounters = await db.encounter.groupBy({
        by: ["encounterType"],
        where: { facilityId: resolvedFacilityId || { in: orgFacilityIds }, status: "open" },
        _count: true,
      });

      // Staff activity (count by professional role)
      const staffActivity = await db.staff.groupBy({
        by: ["professionalRole"],
        where: { employmentStatus: "active" },
        _count: true,
      });

      return NextResponse.json({
        type: "operational",
        stats: {
          totalBeds,
          occupiedBeds,
          availableBeds,
          reservedBeds,
          maintenanceBeds,
          occupancyRate: Math.round(occupancyRate * 100) / 100,
        },
        activeEncounters: activeEncounters.map((e) => ({ label: e.encounterType, value: e._count })),
        staffActivity: staffActivity.map((s) => ({ label: s.professionalRole || "unknown", value: s._count })),
        tableColumns: ["Bed Status", "Count"],
        tableRows: [
          ["Total", String(totalBeds)],
          ["Occupied", String(occupiedBeds)],
          ["Available", String(availableBeds)],
          ["Reserved", String(reservedBeds)],
          ["Maintenance", String(maintenanceBeds)],
        ],
      });
    }

    default:
      return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 });
  }
}

// =====================================================================
// API: /api/reports/[type]
//   GET — dynamic report endpoint
//   type: patients | clinical | lab | pharmacy | financial | operational |
//         hr | inventory | audit | theatre | mortuary | appointments
//   Query params: dateFrom, dateTo, facilityId, departmentId
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

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
  const resolvedFacilityId = facilityId && orgFacilityIds.includes(facilityId) ? facilityId : null;

  // Helper: facility filter for queries
  const facFilter = resolvedFacilityId ? { facilityId: resolvedFacilityId } : { facilityId: { in: orgFacilityIds } };

  switch (type) {
    // =====================================================================
    // PATIENTS REPORT — fixed: total vs new, bySex/byAgeGroup at root
    // =====================================================================
    case "patients": {
      const totalWhere: any = { organizationId: orgId, status: "active" };
      const newWhere: any = { organizationId: orgId, status: "active" };
      if (Object.keys(dateFilter).length > 0) {
        newWhere.registrationDate = dateFilter;
      }

      const [totalPatients, newPatients, bySex, patientsForAge] = await Promise.all([
        db.patient.count({ where: totalWhere }),
        db.patient.count({ where: newWhere }),
        db.patient.groupBy({ by: ["sex"], where: totalWhere, _count: true }),
        db.patient.findMany({ where: totalWhere, select: { dateOfBirth: true, sex: true }, take: 5000 }),
      ]);

      // Compute age groups
      const ageGroups: Record<string, number> = { "0-17": 0, "18-39": 0, "40-59": 0, "60+": 0, unknown: 0 };
      patientsForAge.forEach((p) => {
        if (!p.dateOfBirth) { ageGroups.unknown += 1; return; }
        const age = now.getFullYear() - new Date(p.dateOfBirth).getFullYear();
        if (age < 18) ageGroups["0-17"] += 1;
        else if (age < 40) ageGroups["18-39"] += 1;
        else if (age < 60) ageGroups["40-59"] += 1;
        else ageGroups["60+"] += 1;
      });

      const bySexData = bySex.map((s) => ({ label: s.sex || "unknown", value: s._count }));
      const byAgeData = Object.entries(ageGroups).map(([label, value]) => ({ label, value }));

      return NextResponse.json({
        type: "patients",
        stats: {
          totalPatients,
          newPatients,
          returningPatients: totalPatients - newPatients,
        },
        bySex: bySexData,
        byAgeGroup: byAgeData,
        tableColumns: ["Sex", "Count"],
        tableRows: bySexData.map((s) => [s.label, String(s.value)]),
      });
    }

    // =====================================================================
    // CLINICAL REPORT — fixed: org-scoped, date-filtered all queries
    // =====================================================================
    case "clinical": {
      const encWhere: any = { ...facFilter };
      if (Object.keys(dateFilter).length > 0) encWhere.startAt = dateFilter;

      const admWhere: any = { ...facFilter, status: "admitted" };
      const dischargeWhere: any = { admission: { ...facFilter } };
      if (Object.keys(dateFilter).length > 0) dischargeWhere.dischargedAt = dateFilter;
      const consultWhere: any = { encounter: { ...facFilter } };
      if (Object.keys(dateFilter).length > 0) consultWhere.createdAt = dateFilter;
      const diagWhere: any = { encounter: { ...facFilter } };

      const [encounters, admissions, discharges, consultations, diagnoses, byType] = await Promise.all([
        db.encounter.count({ where: encWhere }),
        db.admission.count({ where: admWhere }),
        db.dischargeRecord.count({ where: dischargeWhere }),
        db.consultation.count({ where: consultWhere }),
        db.diagnosis.count({ where: diagWhere }),
        db.encounter.groupBy({ by: ["encounterType"], where: encWhere, _count: true }),
      ]);

      // Top diagnoses
      const topDiagnoses = await db.diagnosis.groupBy({
        by: ["diagnosisName"],
        where: diagWhere,
        _count: true,
        orderBy: { diagnosisName: "asc" },
        take: 10,
      });

      const byTypeData = byType.map((t) => ({ label: t.encounterType, value: t._count }));

      return NextResponse.json({
        type: "clinical",
        stats: { encounters, admissions, discharges, consultations, diagnoses },
        byType: byTypeData,
        topDiagnoses: topDiagnoses.map((d) => ({ label: d.diagnosisName?.slice(0, 50) || "Unknown", value: d._count })),
        tableColumns: ["Encounter Type", "Count"],
        tableRows: byTypeData.map((t) => [t.label, String(t.value)]),
      });
    }

    // =====================================================================
    // LAB REPORT — fixed: org-scoped critical results
    // =====================================================================
    case "lab": {
      const labWhere: any = { ...facFilter };
      if (Object.keys(dateFilter).length > 0) labWhere.orderedAt = dateFilter;

      const [total, byStatus, byPriority, criticalResults, byTest] = await Promise.all([
        db.labOrder.count({ where: labWhere }),
        db.labOrder.groupBy({ by: ["status"], where: labWhere, _count: true }),
        db.labOrder.groupBy({ by: ["priority"], where: labWhere, _count: true }),
        db.labResult.count({
          where: {
            criticalFlag: true,
            labOrderItem: { labOrder: { ...facFilter } },
          },
        }),
        db.labOrderItem.groupBy({
          by: ["laboratoryTestId"],
          where: { labOrder: labWhere },
          _count: true,
          orderBy: { laboratoryTestId: "asc" },
          take: 10,
        }),
      ]);

      // Get test names
      const testIds = byTest.map((t) => t.laboratoryTestId);
      const tests = await db.laboratoryTest.findMany({
        where: { id: { in: testIds } },
        select: { id: true, name: true, code: true },
      });
      const testNameMap = new Map(tests.map((t) => [t.id, t.name]));

      const byStatusData = byStatus.map((s) => ({ label: s.status, value: s._count }));
      const byPriorityData = byPriority.map((p) => ({ label: p.priority, value: p._count }));

      return NextResponse.json({
        type: "lab",
        stats: { totalOrders: total, criticalResults },
        byStatus: byStatusData,
        byPriority: byPriorityData,
        topTests: byTest.map((t) => ({ label: testNameMap.get(t.laboratoryTestId) || "Unknown", value: t._count })),
        tableColumns: ["Status", "Count"],
        tableRows: byStatusData.map((s) => [s.label, String(s.value)]),
      });
    }

    // =====================================================================
    // PHARMACY REPORT — fixed: byStatus at root for chart
    // =====================================================================
    case "pharmacy": {
      const rxWhere: any = { ...facFilter };
      if (Object.keys(dateFilter).length > 0) rxWhere.prescribedAt = dateFilter;

      const [prescriptions, dispensed, pending, byStatus] = await Promise.all([
        db.prescription.count({ where: rxWhere }),
        db.prescription.count({ where: { ...rxWhere, status: "dispensed" } }),
        db.prescription.count({ where: { ...rxWhere, status: { in: ["pending", "approved", "partially_dispensed"] } } }),
        db.prescription.groupBy({ by: ["status"], where: rxWhere, _count: true }),
      ]);

      // Top dispensed medications
      const topMeds = await db.prescriptionItem.groupBy({
        by: ["medicationId"],
        where: { prescription: rxWhere, status: "dispensed" },
        _sum: { quantity: true },
        orderBy: { medicationId: "asc" },
        take: 10,
      });
      const medIds = topMeds.map((m) => m.medicationId).filter(Boolean);
      const medications = await db.medication.findMany({
        where: { id: { in: medIds as string[] } },
        select: { id: true, genericName: true, brandName: true },
      });
      const medNameMap = new Map(medications.map((m) => [m.id, `${m.genericName}${m.brandName ? ` (${m.brandName})` : ""}`]));

      // Low stock items
      const lowStock = await db.facilityInventory.findMany({
        where: {
          ...(resolvedFacilityId ? { facilityId: resolvedFacilityId } : { facilityId: { in: orgFacilityIds } }),
          currentQuantity: { lte: db.facilityInventory.fields.minimumQuantity },
        },
        take: 50,
        include: { inventoryItem: { select: { name: true, sku: true } } },
      });

      // Expiring medicines (within 90 days)
      const expiringSoon = await db.inventoryBatch.findMany({
        where: {
          expiryDate: { gte: now, lte: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) },
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

      const byStatusData = byStatus.map((s) => ({ label: s.status, value: s._count }));

      return NextResponse.json({
        type: "pharmacy",
        stats: { totalPrescriptions: prescriptions, dispensed, pending, lowStockCount: lowStock.length, expiringSoonCount: expiringSoon.length },
        byStatus: byStatusData,
        topMedications: topMeds.map((m) => ({ label: medNameMap.get(m.medicationId || "") || "Unknown", value: m._sum.quantity || 0 })),
        lowStock: lowStock.map((l) => ({ itemName: l.inventoryItem.name, sku: l.inventoryItem.sku, currentQty: l.currentQuantity, minQty: l.minimumQuantity })),
        expiringSoon: expiringSoon.map((b) => ({ batchNumber: b.batchNumber, expiryDate: b.expiryDate, quantity: b.quantity, itemName: b.facilityInventory.inventoryItem.name, facility: b.facilityInventory.facility.name })),
        tableColumns: ["Item", "Current Qty", "Min Qty"],
        tableRows: lowStock.map((l) => [l.inventoryItem.name, String(l.currentQuantity), String(l.minimumQuantity)]),
      });
    }

    // =====================================================================
    // FINANCIAL REPORT — already good, added revenue by facility
    // =====================================================================
    case "financial": {
      const invoiceWhere: any = { ...facFilter };
      if (Object.keys(dateFilter).length > 0) invoiceWhere.createdAt = dateFilter;

      const [invoices, totalRevenue, totalPaid, totalOutstanding, totalDiscounts, payments, byStatus, insuranceClaims, byFacility] = await Promise.all([
        db.invoice.count({ where: invoiceWhere }),
        db.invoice.aggregate({ where: invoiceWhere, _sum: { total: true } }),
        db.invoice.aggregate({ where: invoiceWhere, _sum: { amountPaid: true } }),
        db.invoice.aggregate({ where: { ...invoiceWhere, balance: { gt: 0 } }, _sum: { balance: true } }),
        db.invoice.aggregate({ where: invoiceWhere, _sum: { discount: true } }),
        db.payment.aggregate({ where: invoiceWhere, _sum: { amount: true }, _count: true }),
        db.invoice.groupBy({ by: ["status"], where: invoiceWhere, _count: true }),
        db.insuranceClaim.aggregate({ where: invoiceWhere, _sum: { claimAmount: true, approvedAmount: true }, _count: true }),
        db.invoice.groupBy({ by: ["facilityId"], where: invoiceWhere, _sum: { total: true }, _count: true }),
      ]);

      const facNameMap = new Map(orgFacilities.map((f) => [f.id, f.name]));
      const byFacilityData = byFacility.map((f) => ({ label: facNameMap.get(f.facilityId) || "Unknown", value: f._sum.total || 0, count: f._count }));
      const byStatusData = byStatus.map((s) => ({ label: s.status, value: s._count }));

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
        byStatus: byStatusData,
        byFacility: byFacilityData,
        tableColumns: ["Invoice Status", "Count"],
        tableRows: byStatusData.map((s) => [s.label, String(s.value)]),
      });
    }

    // =====================================================================
    // OPERATIONAL REPORT — fixed: org-scoped staff activity
    // =====================================================================
    case "operational": {
      const bedWhere: any = { ...facFilter };

      const [totalBeds, occupiedBeds, availableBeds, reservedBeds, maintenanceBeds, activeEncounters, staffActivity] = await Promise.all([
        db.bed.count({ where: bedWhere }),
        db.bed.count({ where: { ...bedWhere, status: "occupied" } }),
        db.bed.count({ where: { ...bedWhere, status: "available" } }),
        db.bed.count({ where: { ...bedWhere, status: "reserved" } }),
        db.bed.count({ where: { ...bedWhere, status: "maintenance" } }),
        db.encounter.groupBy({
          by: ["encounterType"],
          where: { facilityId: facFilter.facilityId, status: { in: ["open", "in_progress"] } },
          _count: true,
        }),
        db.staff.groupBy({
          by: ["professionalRole"],
          where: { employmentStatus: "active", user: { organizationId: orgId } },
          _count: true,
        }),
      ]);

      const occupancyRate = totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0;
      const bedStatusData = [
        { label: "Occupied", value: occupiedBeds },
        { label: "Available", value: availableBeds },
        { label: "Reserved", value: reservedBeds },
        { label: "Maintenance", value: maintenanceBeds },
      ];

      return NextResponse.json({
        type: "operational",
        stats: { totalBeds, occupiedBeds, availableBeds, reservedBeds, maintenanceBeds, occupancyRate: Math.round(occupancyRate * 100) / 100 },
        byBedStatus: bedStatusData,
        activeEncounters: activeEncounters.map((e) => ({ label: e.encounterType, value: e._count })),
        staffActivity: staffActivity.map((s) => ({ label: s.professionalRole || "unknown", value: s._count })),
        tableColumns: ["Bed Status", "Count"],
        tableRows: bedStatusData.map((b) => [b.label, String(b.value)]),
      });
    }

    // =====================================================================
    // APPOINTMENTS REPORT — NEW
    // =====================================================================
    case "appointments": {
      const aptWhere: any = { ...facFilter };
      if (Object.keys(dateFilter).length > 0) aptWhere.scheduledStart = dateFilter;

      const [total, completed, cancelled, noShows, byStatus] = await Promise.all([
        db.appointment.count({ where: aptWhere }),
        db.appointment.count({ where: { ...aptWhere, status: "completed" } }),
        db.appointment.count({ where: { ...aptWhere, status: "cancelled" } }),
        db.appointment.count({ where: { ...aptWhere, status: "no_show" } }),
        db.appointment.groupBy({ by: ["status"], where: aptWhere, _count: true }),
      ]);

      const byStatusData = byStatus.map((s) => ({ label: s.status, value: s._count }));
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return NextResponse.json({
        type: "appointments",
        stats: { total, completed, cancelled, noShows, completionRate },
        byStatus: byStatusData,
        tableColumns: ["Status", "Count"],
        tableRows: byStatusData.map((s) => [s.label, String(s.value)]),
      });
    }

    // =====================================================================
    // HR / STAFF REPORT — NEW
    // =====================================================================
    case "hr": {
      const staffWhere: any = { user: { organizationId: orgId } };
      const [total, active, onLeave, byRole, byType] = await Promise.all([
        db.staff.count({ where: staffWhere }),
        db.staff.count({ where: { ...staffWhere, employmentStatus: "active" } }),
        db.staff.count({ where: { ...staffWhere, employmentStatus: "on_leave" } }),
        db.staff.groupBy({ by: ["professionalRole"], where: staffWhere, _count: true }),
        db.staff.groupBy({ by: ["employmentType"], where: staffWhere, _count: true }),
      ]);

      const byRoleData = byRole.map((r) => ({ label: r.professionalRole || "unknown", value: r._count }));
      const byTypeData = byType.map((t) => ({ label: t.employmentType || "unknown", value: t._count }));

      return NextResponse.json({
        type: "hr",
        stats: { totalStaff: total, active, onLeave },
        byRole: byRoleData,
        byEmploymentType: byTypeData,
        tableColumns: ["Role", "Count"],
        tableRows: byRoleData.map((r) => [r.label, String(r.value)]),
      });
    }

    // =====================================================================
    // INVENTORY REPORT — NEW
    // =====================================================================
    case "inventory": {
      const invWhere: any = resolvedFacilityId ? { facilityId: resolvedFacilityId } : { facilityId: { in: orgFacilityIds } };

      const [totalItems, lowStock, outOfStock, totalValue, stockByFacility] = await Promise.all([
        db.facilityInventory.count({ where: invWhere }),
        db.facilityInventory.count({ where: { ...invWhere, currentQuantity: { lte: db.facilityInventory.fields.minimumQuantity } } }),
        db.facilityInventory.count({ where: { ...invWhere, currentQuantity: 0 } }),
        db.facilityInventory.aggregate({ where: invWhere, _sum: { currentQuantity: true } }),
        db.facilityInventory.groupBy({ by: ["facilityId"], where: invWhere, _count: true, _sum: { currentQuantity: true } }),
      ]);

      const facNameMap = new Map(orgFacilities.map((f) => [f.id, f.name]));
      const byFacilityData = stockByFacility.map((f) => ({ label: facNameMap.get(f.facilityId) || "Unknown", value: f._sum.currentQuantity || 0, count: f._count }));

      return NextResponse.json({
        type: "inventory",
        stats: { totalItems, lowStock, outOfStock, totalQuantity: totalValue._sum.currentQuantity || 0 },
        byFacility: byFacilityData,
        tableColumns: ["Facility", "Items", "Total Qty"],
        tableRows: byFacilityData.map((f) => [f.label, String(f.count), String(f.value)]),
      });
    }

    // =====================================================================
    // AUDIT REPORT — NEW
    // =====================================================================
    case "audit": {
      const auditWhere: any = { organizationId: orgId };
      if (Object.keys(dateFilter).length > 0) auditWhere.createdAt = dateFilter;

      const [total, byAction, byUser, recentLogs] = await Promise.all([
        db.auditLog.count({ where: auditWhere }),
        db.auditLog.groupBy({ by: ["action"], where: auditWhere, _count: true, orderBy: { action: "asc" }, take: 15 }),
        db.auditLog.groupBy({ by: ["userId"], where: auditWhere, _count: true, orderBy: { userId: "asc" }, take: 10 }),
        db.auditLog.findMany({ where: auditWhere, orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: { firstName: true, lastName: true, username: true } } } }),
      ]);

      const byActionData = byAction.map((a) => ({ label: a.action, value: a._count }));
      const recentLogsData = recentLogs.map((l) => ({
        action: l.action,
        user: l.user ? `${l.user.firstName} ${l.user.lastName}` : "System",
        resourceType: l.resourceType || "—",
        time: l.createdAt,
      }));

      return NextResponse.json({
        type: "audit",
        stats: { totalEvents: total },
        byAction: byActionData,
        recentLogs: recentLogsData,
        tableColumns: ["Action", "Count"],
        tableRows: byActionData.map((a) => [a.label, String(a.value)]),
      });
    }

    // =====================================================================
    // THEATRE REPORT — NEW
    // =====================================================================
    case "theatre": {
      const theatreWhere: any = { organizationId: orgId };
      if (resolvedFacilityId) theatreWhere.facilityId = resolvedFacilityId;
      if (Object.keys(dateFilter).length > 0) theatreWhere.scheduledStart = dateFilter;

      const [total, completed, scheduled, cancelled, byType, byStatus] = await Promise.all([
        db.theatreCase.count({ where: theatreWhere }),
        db.theatreCase.count({ where: { ...theatreWhere, status: "completed" } }),
        db.theatreCase.count({ where: { ...theatreWhere, status: "scheduled" } }),
        db.theatreCase.count({ where: { ...theatreWhere, status: "cancelled" } }),
        db.theatreCase.groupBy({ by: ["procedureType"], where: theatreWhere, _count: true }),
        db.theatreCase.groupBy({ by: ["status"], where: theatreWhere, _count: true }),
      ]);

      const byTypeData = byType.map((t) => ({ label: t.procedureType, value: t._count }));
      const byStatusData = byStatus.map((s) => ({ label: s.status, value: s._count }));

      return NextResponse.json({
        type: "theatre",
        stats: { total, completed, scheduled, cancelled },
        byType: byTypeData,
        byStatus: byStatusData,
        tableColumns: ["Procedure Type", "Count"],
        tableRows: byTypeData.map((t) => [t.label, String(t.value)]),
      });
    }

    // =====================================================================
    // MORTUARY REPORT — NEW
    // =====================================================================
    case "mortuary": {
      const mortWhere: any = { organizationId: orgId };
      if (resolvedFacilityId) mortWhere.facilityId = resolvedFacilityId;
      if (Object.keys(dateFilter).length > 0) mortWhere.admittedAt = dateFilter;

      const [total, inStorage, released, byPlace, byStatus] = await Promise.all([
        db.mortuaryAdmission.count({ where: mortWhere }),
        db.mortuaryAdmission.count({ where: { ...mortWhere, admissionStatus: { in: ["admitted", "stored"] } } }),
        db.mortuaryAdmission.count({ where: { ...mortWhere, admissionStatus: "released" } }),
        db.mortuaryAdmission.groupBy({ by: ["placeOfDeath"], where: mortWhere, _count: true }),
        db.mortuaryAdmission.groupBy({ by: ["admissionStatus"], where: mortWhere, _count: true }),
      ]);

      const byPlaceData = byPlace.map((p) => ({ label: p.placeOfDeath || "unknown", value: p._count }));
      const byStatusData = byStatus.map((s) => ({ label: s.admissionStatus, value: s._count }));

      return NextResponse.json({
        type: "mortuary",
        stats: { total, inStorage, released },
        byPlaceOfDeath: byPlaceData,
        byStatus: byStatusData,
        tableColumns: ["Status", "Count"],
        tableRows: byStatusData.map((s) => [s.label, String(s.value)]),
      });
    }

    // =====================================================================
    // INSURANCE / NHIS REPORT — NEW
    // =====================================================================
    case "insurance": {
      const claimWhere: any = { ...facFilter };
      if (Object.keys(dateFilter).length > 0) claimWhere.createdAt = dateFilter;

      const [total, submitted, approved, rejected, paid, pending, totalAmount, approvedAmount, byStatus] = await Promise.all([
        db.insuranceClaim.count({ where: claimWhere }),
        db.insuranceClaim.count({ where: { ...claimWhere, status: "submitted" } }),
        db.insuranceClaim.count({ where: { ...claimWhere, status: "approved" } }),
        db.insuranceClaim.count({ where: { ...claimWhere, status: "rejected" } }),
        db.insuranceClaim.count({ where: { ...claimWhere, status: "paid" } }),
        db.insuranceClaim.count({ where: { ...claimWhere, status: "pending" } }),
        db.insuranceClaim.aggregate({ where: claimWhere, _sum: { claimAmount: true } }),
        db.insuranceClaim.aggregate({ where: { ...claimWhere, status: "approved" }, _sum: { approvedAmount: true } }),
        db.insuranceClaim.groupBy({ by: ["status"], where: claimWhere, _count: true }),
      ]);

      const byStatusData = byStatus.map((s) => ({ label: s.status, value: s._count }));

      return NextResponse.json({
        type: "insurance",
        stats: { total, submitted, approved, rejected, paid, pending, totalClaimAmount: totalAmount._sum.claimAmount || 0, approvedAmount: approvedAmount._sum.approvedAmount || 0 },
        byStatus: byStatusData,
        tableColumns: ["Claim Status", "Count"],
        tableRows: byStatusData.map((s) => [s.label, String(s.value)]),
      });
    }

    // =====================================================================
    // DIAGNOSES REPORT — frequency, top diagnoses, trends by dept/specialty/facility
    // =====================================================================
    case "diagnoses": {
      const dxWhere: any = {};
      if (Object.keys(dateFilter).length > 0) {
        dxWhere.diagnosedAt = dateFilter;
      }
      // Filter by patient → encounter → facility
      const encounterWhere: any = {};
      if (resolvedFacilityId) {
        encounterWhere.facilityId = resolvedFacilityId;
      } else {
        encounterWhere.facilityId = { in: orgFacilityIds };
      }

      // Get diagnoses with encounter + patient info
      const allDiagnoses = await db.diagnosis.findMany({
        where: {
          ...dxWhere,
          encounter: encounterWhere,
        },
        select: {
          id: true,
          diagnosisCode: true,
          diagnosisName: true,
          diagnosisType: true,
          clinicalStatus: true,
          isPrimary: true,
          isChronic: true,
          diagnosedAt: true,
          patient: { select: { sex: true, dateOfBirth: true } },
          encounter: {
            select: {
              id: true,
              encounterType: true,
              facility: { select: { id: true, name: true } },
              department: { select: { id: true, name: true, code: true } },
            },
          },
          catalog: { select: { id: true, category: true, specialty: true, isChronicDefault: true, nhisGdrgCode: true, isNhisClaimable: true } },
        },
        take: 5000,
      });

      // Top diagnoses (by name + code)
      const topMap: Record<string, { name: string; code: string; count: number }> = {};
      allDiagnoses.forEach((d) => {
        const key = `${d.diagnosisCode || "NOCODE"}|${d.diagnosisName}`;
        if (!topMap[key]) topMap[key] = { name: d.diagnosisName, code: d.diagnosisCode || "—", count: 0 };
        topMap[key].count += 1;
      });
      const topDiagnoses = Object.values(topMap).sort((a, b) => b.count - a.count).slice(0, 15);

      // By category (from catalog)
      const byCategoryMap: Record<string, number> = {};
      allDiagnoses.forEach((d) => {
        const cat = d.catalog?.category || "uncategorized";
        byCategoryMap[cat] = (byCategoryMap[cat] || 0) + 1;
      });
      const byCategory = Object.entries(byCategoryMap).map(([label, value]) => ({ label: label.replace(/_/g, " "), value })).sort((a, b) => b.value - a.value);

      // By department
      const byDeptMap: Record<string, number> = {};
      allDiagnoses.forEach((d) => {
        const dept = d.encounter.department?.name || d.encounter.department?.code || "Unassigned";
        byDeptMap[dept] = (byDeptMap[dept] || 0) + 1;
      });
      const byDepartment = Object.entries(byDeptMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

      // By facility
      const byFacMap: Record<string, number> = {};
      allDiagnoses.forEach((d) => {
        const fac = d.encounter.facility?.name || "Unknown";
        byFacMap[fac] = (byFacMap[fac] || 0) + 1;
      });
      const byFacility = Object.entries(byFacMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

      // By specialty (from catalog)
      const bySpecMap: Record<string, number> = {};
      allDiagnoses.forEach((d) => {
        const spec = d.catalog?.specialty || "General";
        bySpecMap[spec] = (bySpecMap[spec] || 0) + 1;
      });
      const bySpecialty = Object.entries(bySpecMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

      // By type (primary/secondary/etc.)
      const byTypeMap: Record<string, number> = {};
      allDiagnoses.forEach((d) => {
        byTypeMap[d.diagnosisType] = (byTypeMap[d.diagnosisType] || 0) + 1;
      });
      const byType = Object.entries(byTypeMap).map(([label, value]) => ({ label, value }));

      // By status
      const byStatusMap: Record<string, number> = {};
      allDiagnoses.forEach((d) => {
        byStatusMap[d.clinicalStatus] = (byStatusMap[d.clinicalStatus] || 0) + 1;
      });
      const byStatusData = Object.entries(byStatusMap).map(([label, value]) => ({ label, value }));

      // Monthly trend (last 12 months)
      const trendMap: Record<string, number> = {};
      allDiagnoses.forEach((d) => {
        const monthKey = new Date(d.diagnosedAt).toISOString().slice(0, 7); // YYYY-MM
        trendMap[monthKey] = (trendMap[monthKey] || 0) + 1;
      });
      const trend = Object.entries(trendMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([label, value]) => ({ label, value }));

      // Demographics
      const bySexMap: Record<string, number> = { male: 0, female: 0, unknown: 0 };
      const ageGroups: Record<string, number> = { "0-17": 0, "18-39": 0, "40-59": 0, "60+": 0, unknown: 0 };
      allDiagnoses.forEach((d) => {
        const sex = d.patient?.sex || "unknown";
        bySexMap[sex] = (bySexMap[sex] || 0) + 1;
        if (!d.patient?.dateOfBirth) { ageGroups.unknown += 1; return; }
        const age = now.getFullYear() - new Date(d.patient.dateOfBirth).getFullYear();
        if (age < 18) ageGroups["0-17"] += 1;
        else if (age < 40) ageGroups["18-39"] += 1;
        else if (age < 60) ageGroups["40-59"] += 1;
        else ageGroups["60+"] += 1;
      });
      const bySex = Object.entries(bySexMap).map(([label, value]) => ({ label, value }));
      const byAgeGroup = Object.entries(ageGroups).map(([label, value]) => ({ label, value }));

      // NHIS claimability
      const nhisClaimable = allDiagnoses.filter((d) => d.catalog?.isNhisClaimable !== false).length;
      const nhisNotClaimable = allDiagnoses.length - nhisClaimable;

      // Chronic vs acute
      const chronic = allDiagnoses.filter((d) => d.isChronic).length;
      const acute = allDiagnoses.length - chronic;

      return NextResponse.json({
        type: "diagnoses",
        stats: {
          total: allDiagnoses.length,
          primary: allDiagnoses.filter((d) => d.isPrimary || d.diagnosisType === "primary").length,
          secondary: allDiagnoses.filter((d) => d.diagnosisType === "secondary").length,
          provisional: allDiagnoses.filter((d) => d.diagnosisType === "provisional").length,
          differential: allDiagnoses.filter((d) => d.diagnosisType === "differential").length,
          chronic,
          acute,
          active: byStatusMap.active || 0,
          resolved: byStatusMap.resolved || 0,
          ruledOut: byStatusMap.ruled_out || 0,
          nhisClaimable,
          nhisNotClaimable,
        },
        topDiagnoses,
        topItems: topDiagnoses.map((d) => ({ label: `${d.code} — ${d.name.slice(0, 30)}${d.name.length > 30 ? "..." : ""}`, value: d.count, code: d.code, name: d.name })),
        byCategory,
        byDepartment,
        byFacility,
        bySpecialty,
        byType,
        byStatus: byStatusData,
        trend,
        bySex,
        byAgeGroup,
        tableColumns: ["Diagnosis", "Code", "Count"],
        tableRows: topDiagnoses.map((d) => [d.name, d.code, String(d.count)]),
      });
    }

    default:
      return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 });
  }
}

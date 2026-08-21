// =====================================================================
// API: /api/dashboard/stats
// Returns real KPI numbers computed from the database.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Force dynamic rendering — stats are user-specific and time-sensitive
export const dynamic = "force-dynamic";
// Allow up to 30s for Neon cold start + 14 parallel queries (Pro tier)
// Hobby tier supports 10s which is still enough for warm DB
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url);
    const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
    const orgId = session.user.organizationId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const f = facilityId ? { facilityId } : {};

  const [
    totalPatients,
    todayEncounters,
    todayNewPatients,
    activeAdmissions,
    pendingLabOrders,
    pendingPrescriptions,
    todayAppointments,
    outstandingInvoices,
    todayRevenueAgg,
    lowStockItems,
    recentPatients,
    activeBeds,
    occupiedBeds,
    wardOccupancyRaw,
    pendingTasksRaw,
    totalUsers,
    recentAuditCount,
    pendingImagingOrders,
    pendingReferrals,
    pendingTasks,
    todayDischarges,
    todayCompletedProcedures,
  ] = await Promise.all([
    db.patient.count({ where: { organizationId: orgId, status: "active" } }),
    db.encounter.count({ where: { ...f, startAt: { gte: today, lte: todayEnd } } }),
    // New patients registered today (organization-wide)
    db.patient.count({
      where: {
        organizationId: orgId,
        registrationDate: { gte: today, lte: todayEnd },
      },
    }),
    db.admission.count({ where: { ...f, status: "admitted" } }),
    db.labOrder.count({ where: { ...f, status: { in: ["ordered", "collected", "received", "processing", "resulted"] } } }),
    db.prescription.count({ where: { ...f, status: { in: ["pending", "approved", "partially_dispensed"] } } }),
    db.appointment.count({ where: { ...f, scheduledStart: { gte: today, lte: todayEnd } } }),
    db.invoice.count({ where: { ...f, status: { in: ["issued", "partially_paid"] } } }),
    db.payment.aggregate({ where: { ...f, receivedAt: { gte: today, lte: todayEnd }, status: "completed" }, _sum: { amount: true } }),
    db.facilityInventory.count({
      where: { ...(facilityId ? { facilityId } : {}), currentQuantity: { lte: db.facilityInventory.fields.minimumQuantity } },
    }),
    db.patient.findMany({
      where: { organizationId: orgId, status: "active" },
      orderBy: { registrationDate: "desc" },
      take: 6,
      include: { identifiers: { where: { isPrimary: true }, take: 1 } },
    }),
    db.bed.count({ where: { ...f, status: "available" } }),
    db.bed.count({ where: { ...f, status: "occupied" } }),
    db.ward.findMany({
      where: facilityId ? { facilityId } : {},
      include: { beds: { select: { id: true, status: true } } },
      take: 8,
    }),
    db.task.findMany({
      where: { assignedToId: session.user.id, status: { in: ["pending", "in_progress"] } },
      orderBy: { dueAt: "asc" },
      take: 5,
    }),
    // Security / Admin stats
    db.user.count({ where: { organizationId: orgId, status: "active" } }),
    db.auditLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    // Additional KPIs
    db.imagingOrder.count({ where: { ...f, status: { in: ["ordered", "scheduled", "in_progress"] } } }),
    db.referral.count({ where: { status: "pending", encounter: { ...(facilityId ? { facilityId } : {}) } } }),
    db.task.count({ where: { ...f, status: { in: ["pending", "in_progress"] } } }),
    db.dischargeRecord.count({ where: { dischargedAt: { gte: today, lte: todayEnd }, admission: { ...(facilityId ? { facilityId } : {}) } } }),
    db.procedure.count({ where: { ...f, status: "completed", performedAt: { gte: today, lte: todayEnd } } }),
  ]);

  const totalBeds = activeBeds + occupiedBeds;
  const bedOccupancy = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  const wardOccupancy = wardOccupancyRaw.map((w) => ({
    code: w.code,
    name: w.name,
    total: w.beds.length,
    occupied: w.beds.filter((b) => b.status === "occupied").length,
  }));

  return NextResponse.json({
    totalPatients,
    todayEncounters,
    todayNewPatients,
    activeAdmissions,
    pendingLabOrders,
    pendingPrescriptions,
    todayAppointments,
    outstandingInvoices,
    todayRevenue: todayRevenueAgg._sum.amount || 0,
    lowStockItems,
    recentPatients: recentPatients.map((p) => ({
      id: p.id,
      patientNumber: p.patientNumber,
      firstName: p.firstName,
      lastName: p.lastName,
      sex: p.sex,
      phone: p.phone,
      status: p.status,
      registrationDate: p.registrationDate,
    })),
    bedOccupancy,
    activeBeds,
    occupiedBeds,
    wardOccupancy,
    pendingTasks: pendingTasksRaw,
    totalUsers,
    recentAuditCount,
    // Additional KPIs
    pendingImagingOrders,
    pendingReferrals,
    pendingTasksCount: pendingTasks,
    todayDischarges,
    todayCompletedProcedures,
  });
  } catch (err: any) {
    console.error("[dashboard/stats] Error:", err?.message);
    return NextResponse.json(
      { error: `Failed to load dashboard stats: ${err?.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}

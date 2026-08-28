// =====================================================================
// API: /api/staff/stats
//   GET — dashboard stats for the Staff module
//   Resilient: each section wrapped so partial failures don't break the
//   whole dashboard.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

async function resilient<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[staff-stats] ${label} failed:`, e);
    return fallback;
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Scope to user's org
    const orgUsers = await db.user.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true },
    });
    const userIds = orgUsers.map((u) => u.id);
    const baseWhere = { userId: { in: userIds } };

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // ---- Counts by employment status
    const byStatus = await resilient("byStatus", async () => {
      const groups = await db.staff.groupBy({
        by: ["employmentStatus"],
        where: baseWhere,
        _count: { _all: true },
      });
      const map: Record<string, number> = {};
      for (const g of groups) map[g.employmentStatus] = g._count._all;
      return map;
    }, {});

    // ---- Counts by employment type
    const byEmploymentType = await resilient("byEmploymentType", async () => {
      const groups = await db.staff.groupBy({
        by: ["employmentType"],
        where: baseWhere,
        _count: { _all: true },
      });
      const map: Record<string, number> = {};
      for (const g of groups) {
        const k = g.employmentType || "unknown";
        map[k] = (map[k] || 0) + g._count._all;
      }
      return map;
    }, {});

    // ---- Counts by staff category
    const byCategory = await resilient("byCategory", async () => {
      const groups = await db.staff.groupBy({
        by: ["staffCategory"],
        where: baseWhere,
        _count: { _all: true },
      });
      const map: Record<string, number> = {};
      for (const g of groups) map[g.staffCategory] = g._count._all;
      return map;
    }, {});

    // ---- Counts by facility
    const byFacility = await resilient("byFacility", async () => {
      const groups = await db.staff.groupBy({
        by: ["facilityId"],
        where: baseWhere,
        _count: { _all: true },
      });
      const ids = groups.map((g) => g.facilityId).filter(Boolean) as string[];
      const facilities = ids.length
        ? await db.facility.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, code: true } })
        : [];
      const facMap: Record<string, { name: string; code: string }> = {};
      for (const f of facilities) facMap[f.id] = { name: f.name, code: f.code };
      return groups.map((g) => ({
        facilityId: g.facilityId,
        name: g.facilityId ? facMap[g.facilityId]?.name || "Unknown" : "Unassigned",
        code: g.facilityId ? facMap[g.facilityId]?.code || "" : "",
        count: g._count._all,
      }));
    }, []);

    // ---- Counts by department
    const byDepartment = await resilient("byDepartment", async () => {
      const groups = await db.staff.groupBy({
        by: ["departmentId"],
        where: { ...baseWhere, departmentId: { not: null } },
        _count: { _all: true },
      });
      const ids = groups.map((g) => g.departmentId).filter(Boolean) as string[];
      const depts = ids.length
        ? await db.department.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, code: true } })
        : [];
      const dMap: Record<string, { name: string; code: string }> = {};
      for (const d of depts) dMap[d.id] = { name: d.name, code: d.code };
      return groups.map((g) => ({
        departmentId: g.departmentId,
        name: g.departmentId ? dMap[g.departmentId]?.name || "Unknown" : "Unassigned",
        code: g.departmentId ? dMap[g.departmentId]?.code || "" : "",
        count: g._count._all,
      }));
    }, []);

    // ---- Counts by profession
    const byProfession = await resilient("byProfession", async () => {
      const groups = await db.staff.groupBy({
        by: ["profession"],
        where: { ...baseWhere, profession: { not: null } },
        _count: { _all: true },
      });
      const mapped = groups.map((g) => ({
        profession: g.profession || "unknown",
        count: g._count._all,
      }));
      // Also include professionalRole if profession is null
      const roleGroups = await db.staff.groupBy({
        by: ["professionalRole"],
        where: { ...baseWhere, profession: null, professionalRole: { not: null } },
        _count: { _all: true },
      });
      for (const r of roleGroups) {
        mapped.push({
          profession: r.professionalRole || "unknown",
          count: r._count._all,
        });
      }
      return mapped.sort((a, b) => b.count - a.count);
    }, []);

    // ---- Expiring licenses (within 30 days) and expired
    const expiringLicenses = await resilient("expiringLicenses", async () => {
      return db.staff.count({
        where: {
          ...baseWhere,
          licenseExpiryDate: { gte: now, lte: in30Days },
          licenseStatus: { not: "expired" },
        },
      });
    }, 0);

    const expiredLicenses = await resilient("expiredLicenses", async () => {
      return db.staff.count({
        where: {
          ...baseWhere,
          licenseExpiryDate: { lt: now },
        },
      });
    }, 0);

    const expiringLicensesList = await resilient("expiringLicensesList", async () => {
      return db.staff.findMany({
        where: {
          ...baseWhere,
          licenseExpiryDate: { gte: now, lte: in30Days },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          staffNumber: true,
          licenseNumber: true,
          licenseExpiryDate: true,
          profession: true,
          facility: { select: { name: true } },
        },
        orderBy: { licenseExpiryDate: "asc" },
        take: 50,
      });
    }, []);

    // ---- Expiring contracts (within 30 days)
    const expiringContracts = await resilient("expiringContracts", async () => {
      return db.staff.count({
        where: {
          ...baseWhere,
          contractEndDate: { gte: now, lte: in30Days },
          employmentStatus: { notIn: ["resigned", "terminated", "retired", "deceased", "contract_expired"] },
        },
      });
    }, 0);

    const expiringContractsList = await resilient("expiringContractsList", async () => {
      return db.staff.findMany({
        where: {
          ...baseWhere,
          contractEndDate: { gte: now, lte: in30Days },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          staffNumber: true,
          contractEndDate: true,
          employmentType: true,
          facility: { select: { name: true } },
        },
        orderBy: { contractEndDate: "asc" },
        take: 50,
      });
    }, []);

    // ---- New this month
    const newThisMonth = await resilient("newThisMonth", async () => {
      return db.staff.count({
        where: {
          ...baseWhere,
          createdAt: { gte: startOfMonth, lt: endOfMonth },
        },
      });
    }, 0);

    // ---- Departed this month (separationDate within this month)
    const departedThisMonth = await resilient("departedThisMonth", async () => {
      return db.staff.count({
        where: {
          ...baseWhere,
          separationDate: { gte: startOfMonth, lt: endOfMonth },
        },
      });
    }, 0);

    const departedThisMonthList = await resilient("departedThisMonthList", async () => {
      return db.staff.findMany({
        where: {
          ...baseWhere,
          separationDate: { gte: startOfMonth, lt: endOfMonth },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          staffNumber: true,
          separationDate: true,
          separationType: true,
          separationReason: true,
          facility: { select: { name: true } },
        },
        orderBy: { separationDate: "desc" },
        take: 50,
      });
    }, []);

    const totalStaff = await resilient("totalStaff", async () => {
      return db.staff.count({ where: baseWhere });
    }, 0);

    const clinical = await resilient("clinical", async () => {
      return db.staff.count({ where: { ...baseWhere, isClinical: true } });
    }, 0);

    const nonClinical = await resilient("nonClinical", async () => {
      return db.staff.count({ where: { ...baseWhere, isClinical: false } });
    }, 0);

    return NextResponse.json({
      totals: {
        total: totalStaff,
        active: byStatus["active"] || 0,
        probation: byStatus["probation"] || 0,
        on_leave: byStatus["on_leave"] || 0,
        suspended: byStatus["suspended"] || 0,
        inactive: byStatus["inactive"] || 0,
        resigned: byStatus["resigned"] || 0,
        terminated: byStatus["terminated"] || 0,
        retired: byStatus["retired"] || 0,
        deceased: byStatus["deceased"] || 0,
        contract_expired: byStatus["contract_expired"] || 0,
        clinical,
        nonClinical,
        expiringLicenses,
        expiredLicenses,
        newThisMonth,
        departedThisMonth,
      },
      byStatus,
      byEmploymentType,
      byCategory,
      byFacility,
      byDepartment,
      byProfession,
      expiringLicenses,
      expiredLicenses,
      expiringContracts,
      newThisMonth,
      departedThisMonth,
      lists: {
        expiringLicenses: expiringLicensesList,
        expiringContracts: expiringContractsList,
        departedThisMonth: departedThisMonthList,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/staff/stats] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to compute staff stats" },
      { status: 500 }
    );
  }
}

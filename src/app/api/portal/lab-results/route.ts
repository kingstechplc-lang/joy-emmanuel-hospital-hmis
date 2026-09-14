// =====================================================================
// API: /api/portal/lab-results
//   GET — list lab orders + results for the authenticated patient
//   Supports search + date range filters
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalSessionFromRequest } from "@/lib/patient-portal/jwt";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.patientId) {
    return NextResponse.json({ error: "Account pending identity verification", needsIdentity: true }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const search = url.searchParams.get("search") || "";
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const statusFilter = url.searchParams.get("status") || "";

  try {
    const where: any = {
      patientId: session.patientId,
      releasedToPatientAt: { not: null },
      status: { not: "cancelled" },
    };

    // Date range filter
    if (dateFrom || dateTo) {
      where.orderedAt = {};
      if (dateFrom) where.orderedAt.gte = new Date(dateFrom);
      if (dateTo) where.orderedAt.lte = new Date(`${dateTo}T23:59:59`);
    }

    // Status filter
    if (statusFilter && statusFilter !== "all") {
      where.status = statusFilter;
    }

    // Search — search by order number OR test name (via items.laboratoryTest.name)
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { items: { some: { laboratoryTest: { name: { contains: search, mode: "insensitive" } } } } },
        { items: { some: { laboratoryTest: { code: { contains: search, mode: "insensitive" } } } } },
      ];
    }

    const [orders, total] = await Promise.all([
      db.labOrder.findMany({
        where,
        orderBy: { releasedToPatientAt: "desc" },
        skip: offset,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          priority: true,
          orderedAt: true,
          releasedToPatientAt: true,
          encounter: { select: { id: true, encounterNumber: true, encounterType: true } },
          orderingClinician: { select: { id: true, firstName: true, lastName: true } },
          items: {
            select: {
              id: true,
              status: true,
              // ⚠️ testName was wrong — it's on the laboratoryTest relation
              laboratoryTest: { select: { id: true, name: true, code: true, unit: true, referenceRange: true } },
              results: {
                select: {
                  id: true,
                  resultValue: true,
                  numericValue: true,
                  unit: true,
                  abnormalFlag: true,
                  criticalFlag: true,
                  referenceRange: true,
                  releasedAt: true,
                  resultNotes: true,
                  clinicianComment: true,
                  componentName: true,
                },
              },
            },
          },
        },
      }),
      db.labOrder.count({ where }),
    ]);

    return NextResponse.json({ items: orders, total, offset, limit, hasMore: offset + orders.length < total });
  } catch (e: any) {
    console.error("[GET /api/portal/lab-results] error:", e);
    // Return the actual error for debugging
    return NextResponse.json(
      { error: "Failed to load lab results", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}

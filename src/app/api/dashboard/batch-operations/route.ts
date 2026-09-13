// =====================================================================
// API: /api/dashboard/batch-operations
//   GET  — returns counts of pending items for each batch operation
//          (bulk lab results, bulk invoices, batch prescription approval)
//
// This is the cross-feature integration endpoint (Phase 12) that ties
// the dashboard to the batch operation workflows. The dashboard renders
// a "Batch Operations" widget using this data, and the user can click
// through to the relevant batch entry view.
//
// PERMISSIONS:
//   GET requires the specific batch permission for each count:
//     - lab_result.bulk_entry → lab result count
//     - invoice.bulk_generate → eligible invoice count
//     - prescription.bulk_process → pending prescription count
//
// Returns only counts the user has permission to see.
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

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;

  try {
    const [pendingLabResults, eligibleInvoices, pendingPrescriptions] = await Promise.all([
      // Pending lab results (items in 'processing' status with no results)
      hasPermission(session, PERMISSIONS.LAB_RESULT_BULK_ENTRY)
        ? db.labOrderItem.count({
            where: {
              status: "processing",
              results: { none: {} },
              labOrder: {
                ...(facilityId ? { facilityId } : {}),
                status: { not: "cancelled" },
              },
            },
          })
        : null,

      // Eligible encounters for bulk invoice (services but no invoice)
      hasPermission(session, PERMISSIONS.INVOICE_BULK_GENERATE)
        ? db.encounter.count({
            where: {
              ...(facilityId ? { facilityId } : {}),
              status: { notIn: ["cancelled"] },
              invoices: { none: {} },
              OR: [
                { consultations: { some: {} } },
                { labOrders: { some: { status: { not: "cancelled" } } } },
                { imagingOrders: { some: { status: { not: "cancelled" } } } },
                { procedures: { some: { status: { not: "cancelled" } } } },
              ],
            },
          })
        : null,

      // Pending prescriptions for batch approval
      hasPermission(session, PERMISSIONS.PRESCRIPTION_BULK_PROCESS)
        ? db.prescription.count({
            where: {
              status: "pending",
              ...(facilityId ? { facilityId } : {}),
            },
          })
        : null,
    ]);

    return NextResponse.json({
      labResults: pendingLabResults,
      bulkInvoices: eligibleInvoices,
      pendingPrescriptions,
      hasAny: (pendingLabResults ?? 0) + (eligibleInvoices ?? 0) + (pendingPrescriptions ?? 0) > 0,
    });
  } catch (e: any) {
    console.error("[GET /api/dashboard/batch-operations]", e);
    return NextResponse.json(
      { error: e.message || "Failed to load batch operations" },
      { status: 500 }
    );
  }
}

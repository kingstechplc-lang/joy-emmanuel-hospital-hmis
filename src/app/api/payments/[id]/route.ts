// =====================================================================
// API: /api/payments/[id]
//   GET — single payment with relations
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, phone: true } },
      facility: { select: { id: true, name: true, code: true } },
      invoice: {
        select: {
          id: true, invoiceNumber: true, total: true, balance: true, amountPaid: true, status: true,
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
        },
      },
      receivedBy: { select: { id: true, firstName: true, lastName: true } },
      refunds: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  return NextResponse.json({ item: payment });
}

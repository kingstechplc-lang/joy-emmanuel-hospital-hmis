// =====================================================================
// /api/print-log  —  POST endpoint to record a print/document action
// in the audit log.
//
// Audit log entry format:
//   action:        "DOCUMENT_PRINTED"
//   resourceType:  "print:<documentType>"  (e.g., "print:invoice")
//   resourceId:    recordId (e.g., invoice id) or null
//   newValues:     { documentType, paperSize, orientation, recordSummary }
//
// The endpoint:
//   - Requires authentication (any logged-in user can print — there is
//     no separate print.* permission in the current RBAC system;
//     parent views already gate their own permissions, so reaching
//     the print button already implies the user can see the record).
//   - Enforces org/facility isolation by always reading
//     `organizationId` and `facilityId` from the SESSION, never from
//     the request body.  This prevents a malicious user from logging
//     fake print events against another facility's audit trail.
//
// The endpoint is non-blocking on the client side — PrintButton fires
// this as a fire-and-forget fetch after opening the popup window.
// =====================================================================

import { NextResponse } from "next/server";
import { getSession, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const ALLOWED_DOCUMENT_TYPES = [
  "receipt",
  "invoice",
  "lab_report",
  "lab_test",
  "prescription",
  "patient_statement",
  "insurance_document",
  "admission",
  "discharge",
  "referral",
  "imaging_report",
  "refund_receipt",
  "transfer",
  "purchase_order",
  "stock_transfer",
  "intake_output",
  "report",
] as const;

const ALLOWED_PAPER_SIZES = ["A4", "A5", "THERMAL_80", "THERMAL_58"] as const;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const documentType = String(body.documentType || "").toLowerCase();
  const paperSize = String(body.paperSize || "A4").toUpperCase();
  const orientation = String(body.orientation || "portrait").toLowerCase();
  const recordId = body.recordId ? String(body.recordId) : null;
  const recordSummary = body.recordSummary ? String(body.recordSummary).slice(0, 200) : null;

  // Validate documentType
  if (!ALLOWED_DOCUMENT_TYPES.includes(documentType as any)) {
    return NextResponse.json({ error: `Invalid documentType: ${documentType}` }, { status: 400 });
  }
  // Validate paperSize
  if (!ALLOWED_PAPER_SIZES.includes(paperSize as any)) {
    return NextResponse.json({ error: `Invalid paperSize: ${paperSize}` }, { status: 400 });
  }

  // Audit log — always uses session-derived org/facility (never request body).
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || null,
    action: "DOCUMENT_PRINTED",
    resourceType: `print:${documentType}`,
    resourceId: recordId,
    newValues: {
      documentType,
      paperSize,
      orientation,
      recordSummary,
    },
  });

  return NextResponse.json({ ok: true });
}

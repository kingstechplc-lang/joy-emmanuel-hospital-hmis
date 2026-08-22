// =====================================================================
// API: /api/insurance-claims/validate
//   POST — validate a claim before submission. Checks all required fields.
//   Returns: { isValid, completeness, issues: [...], warnings: [...] }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { claimId } = body;
  if (!claimId) return NextResponse.json({ error: "claimId is required" }, { status: 400 });

  const claim = await db.insuranceClaim.findUnique({
    where: { id: claimId },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } },
      insuranceProvider: { select: { id: true, name: true, code: true } },
      invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true, status: true } },
      claimDiagnoses: true,
      claimItems: true,
    },
  });

  if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 });

  const issues: string[] = [];
  const warnings: string[] = [];
  let checksTotal = 0;
  let checksPassed = 0;

  // 1. Patient identity
  checksTotal++;
  if (claim.patient) checksPassed++;
  else issues.push("Patient not linked to claim");

  // 2. Insurance provider
  checksTotal++;
  if (claim.insuranceProvider) checksPassed++;
  else issues.push("Insurance provider not specified");

  // 3. NHIS number (if NHIS provider)
  const isNhis = claim.insuranceProvider?.code?.toUpperCase().includes("NHIS") ||
    claim.insuranceProvider?.name?.toUpperCase().includes("NHIS") || false;
  if (isNhis) {
    checksTotal++;
    if (claim.nhisNumber) checksPassed++;
    else issues.push("NHIS membership number is required for NHIS claims");
  }

  // 4. Encounter
  checksTotal++;
  if (claim.encounterId) checksPassed++;
  else warnings.push("No encounter linked — recommended for clinical traceability");

  // 5. Primary diagnosis (ICD-10)
  checksTotal++;
  if (claim.primaryDiagnosisCode) checksPassed++;
  else issues.push("Primary ICD-10 diagnosis code is missing");

  checksTotal++;
  if (claim.primaryDiagnosisName) checksPassed++;
  else issues.push("Primary diagnosis name is missing");

  // 6. Invoice
  checksTotal++;
  if (claim.invoice) checksPassed++;
  else issues.push("Invoice not linked to claim");

  // 7. Claim amount
  checksTotal++;
  if (claim.claimAmount > 0) checksPassed++;
  else issues.push("Claim amount must be greater than zero");

  // 8. Claim items
  checksTotal++;
  if (claim.claimItems.length > 0) checksPassed++;
  else warnings.push("No structured claim items — claim may be rejected for missing service details");

  // 9. Duplicate check
  checksTotal++;
  if (claim.invoice) {
    const dupClaims = await db.insuranceClaim.count({
      where: { invoiceId: claim.invoiceId, id: { not: claim.id }, status: { notIn: ["cancelled", "rejected"] } },
    });
    if (dupClaims === 0) checksPassed++;
    else issues.push(`Possible duplicate: ${dupClaims} other active claim(s) exist for the same invoice`);
  } else {
    checksPassed++;
  }

  // 10. G-DRG code (NHIS)
  if (isNhis) {
    checksTotal++;
    if (claim.gdrgCode) checksPassed++;
    else warnings.push("G-DRG code not set — recommended for NHIS claims");
  }

  const completeness = Math.round((checksPassed / checksTotal) * 100);
  const isValid = issues.length === 0;

  // Update claim validation status
  await db.insuranceClaim.update({
    where: { id: claimId },
    data: {
      isNhisValidated: isValid,
      nhisValidationNotes: issues.length > 0 ? issues.join("; ") : (warnings.length > 0 ? "Warnings: " + warnings.join("; ") : null),
    },
  });

  return NextResponse.json({
    isValid,
    completeness,
    issues,
    warnings,
    checksPassed,
    checksTotal,
  });
}

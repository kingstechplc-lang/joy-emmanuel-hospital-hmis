// =====================================================================
// API: /api/insurance-claims/bulk
//   POST — generate multiple NHIS claims in batch from selected invoices
//
// Body: {
//   facilityId: string,
//   insuranceProviderId: string,
//   claimType: "outpatient" | "inpatient" | "day_case",
//   nhisNumber?: string,  // optional — if all patients share the same NHIS #
//   items: [
//     {
//       patientId: string,
//       invoiceId: string,
//       encounterId?: string,
//       primaryDiagnosisCatalogId?: string,
//       primaryDiagnosisCode?: string,
//       primaryDiagnosisName?: string,
//       nhisNumber?: string,  // per-patient override
//       claimAmount?: number,  // defaults to invoice balance
//     }
//   ]
// }
//
// Returns: { created: [...], failed: [...], summary: { total, success, failed } }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextClaimNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_CLAIM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { facilityId, insuranceProviderId, claimType, items } = body;

  if (!facilityId || !insuranceProviderId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "facilityId, insuranceProviderId, and non-empty items[] are required" }, { status: 400 });
  }

  // Validate provider
  const provider = await db.insuranceProvider.findUnique({ where: { id: insuranceProviderId } });
  if (!provider) return NextResponse.json({ error: "Insurance provider not found" }, { status: 404 });

  const isNhis = provider.code?.toUpperCase().includes("NHIS") || provider.name?.toUpperCase().includes("NHIS") || false;

  const created: any[] = [];
  const failed: any[] = [];

  for (const item of items) {
    try {
      const { patientId, invoiceId, encounterId, primaryDiagnosisCatalogId, primaryDiagnosisCode, primaryDiagnosisName, nhisNumber: itemNhisNumber, claimAmount } = item;

      if (!patientId || !invoiceId) {
        failed.push({ patientId, invoiceId, error: "patientId and invoiceId are required" });
        continue;
      }

      // Validate invoice
      const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) {
        failed.push({ patientId, invoiceId, error: "Invoice not found" });
        continue;
      }
      if (invoice.patientId !== patientId) {
        failed.push({ patientId, invoiceId, error: "Invoice does not belong to patient" });
        continue;
      }
      if (invoice.balance <= 0) {
        failed.push({ patientId, invoiceId, error: "Invoice has no outstanding balance" });
        continue;
      }

      // NHIS validation
      const effectiveNhisNumber = itemNhisNumber || body.nhisNumber;
      let isNhisValidated = false;
      let validationNotes: string[] = [];

      if (isNhis) {
        if (!effectiveNhisNumber) validationNotes.push("NHIS number required");
        if (!primaryDiagnosisCode && !primaryDiagnosisCatalogId) validationNotes.push("ICD-10 diagnosis required");
        isNhisValidated = validationNotes.length === 0;
      } else {
        isNhisValidated = true;
      }

      // Resolve diagnosis from catalog if provided
      let finalDxCode = primaryDiagnosisCode || null;
      let finalDxName = primaryDiagnosisName || null;
      let finalDxCatalogId = primaryDiagnosisCatalogId || null;
      let gdrgCode: string | null = null;
      let gdrgName: string | null = null;
      let nhisTariff: number | null = null;

      if (finalDxCatalogId) {
        const cat = await db.diagnosisCatalog.findUnique({ where: { id: finalDxCatalogId } });
        if (cat) {
          finalDxCode = finalDxCode || cat.code;
          finalDxName = finalDxName || cat.name;
          gdrgCode = cat.nhisGdrgCode || null;
          gdrgName = cat.nhisGdrgName || null;
          nhisTariff = cat.nhisTariff || null;
        }
      }

      const claimNumber = await nextClaimNumber(facilityId);

      const claim = await db.insuranceClaim.create({
        data: {
          patientId,
          facilityId,
          insuranceProviderId,
          invoiceId,
          encounterId: encounterId || null,
          claimNumber,
          claimAmount: Number(claimAmount) || invoice.balance,
          approvedAmount: 0,
          claimType: claimType || "outpatient",
          nhisNumber: effectiveNhisNumber || null,
          primaryDiagnosisCode: finalDxCode,
          primaryDiagnosisName: finalDxName,
          primaryDiagnosisCatalogId: finalDxCatalogId,
          gdrgCode,
          gdrgName,
          nhisTariff,
          isNhisValidated,
          nhisValidationNotes: validationNotes.length > 0 ? validationNotes.join("; ") : null,
          status: "draft",
        },
      });

      // Create ClaimDiagnosis if diagnosis provided
      if (finalDxCode && finalDxName) {
        await db.claimDiagnosis.create({
          data: {
            claimId: claim.id,
            catalogId: finalDxCatalogId,
            diagnosisCode: finalDxCode,
            diagnosisName: finalDxName,
            diagnosisType: "primary",
            isPrimary: true,
          },
        });
      }

      created.push({
        claimId: claim.id,
        claimNumber: claim.claimNumber,
        patientId,
        invoiceId,
        claimAmount: claim.claimAmount,
        isNhisValidated,
        validationNotes: validationNotes.length > 0 ? validationNotes.join("; ") : null,
      });
    } catch (e: any) {
      failed.push({ ...item, error: e.message || "Unknown error" });
    }
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "BULK_CLAIMS_CREATED",
    resourceType: "insurance_claim",
    newValues: { total: items.length, created: created.length, failed: failed.length, isNhis, insuranceProviderId },
  });

  return NextResponse.json({
    created,
    failed,
    summary: {
      total: items.length,
      success: created.length,
      failed: failed.length,
    },
  }, { status: 201 });
}

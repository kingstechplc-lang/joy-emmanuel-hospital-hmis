// =====================================================================
// API: /api/clinical-templates/[id]/apply — PREVIEW only (no orders created)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { buildTemplateVisibilityWhere } from "@/lib/clinical-templates/template-registry";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_TEMPLATE_APPLY)) {
    return NextResponse.json({ error: "Forbidden — requires clinical_template.apply" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { encounterId, patientId } = body;
  if (!encounterId) return NextResponse.json({ error: "encounterId is required" }, { status: 400 });
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

  try {
    const encounter = await db.encounter.findUnique({
      where: { id: encounterId },
      select: { id: true, patientId: true, facilityId: true, status: true },
    });
    if (!encounter) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
    if (encounter.patientId !== patientId) return NextResponse.json({ error: "Patient ID mismatch" }, { status: 400 });
    if (encounter.status === "closed" || encounter.status === "cancelled") return NextResponse.json({ error: `Encounter is ${encounter.status}` }, { status: 400 });

    // Check org via facility
    const facility = await db.facility.findUnique({ where: { id: encounter.facilityId }, select: { organizationId: true } });
    if (!facility || facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
    }

    const template = await db.clinicalTemplate.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    if (template.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    if (template.status !== "active") return NextResponse.json({ error: `Template is not active` }, { status: 400 });

    const currentVersion = template.versions[0];
    if (!currentVersion) return NextResponse.json({ error: "Template has no versions" }, { status: 400 });
    let content: any;
    try { content = JSON.parse(currentVersion.content); } catch { return NextResponse.json({ error: "Template content is corrupted" }, { status: 500 }); }

    const duplicateWarnings: string[] = [];

    // Lab orders preview
    let labOrdersPreview: any[] = [];
    if (Array.isArray(content.labOrders) && content.labOrders.length > 0) {
      const labTestIds = content.labOrders.map((o: any) => o.laboratoryTestId).filter(Boolean);
      const labTests = labTestIds.length > 0 ? await db.laboratoryTest.findMany({ where: { id: { in: labTestIds } }, select: { id: true, name: true, code: true } }) : [];
      const labTestMap = new Map(labTests.map((t) => [t.id, t]));
      const existingLabOrders = await db.labOrderItem.findMany({ where: { labOrder: { encounterId, status: { not: "cancelled" } } }, select: { laboratoryTestId: true } });
      const existingLabTestIds = new Set(existingLabOrders.map((o) => o.laboratoryTestId));
      labOrdersPreview = content.labOrders.map((item: any) => {
        const test = labTestMap.get(item.laboratoryTestId);
        const isDuplicate = existingLabTestIds.has(item.laboratoryTestId);
        if (isDuplicate) duplicateWarnings.push(`Lab test "${test?.name || item.laboratoryTestId}" already has an active order`);
        return { laboratoryTestId: item.laboratoryTestId, testName: test?.name || "Unknown", testCode: test?.code || "", priority: item.priority || "routine", clinicalNote: item.clinicalNote || "", duplicate: isDuplicate };
      });
    }

    // Imaging orders preview
    let imagingOrdersPreview: any[] = [];
    if (Array.isArray(content.imagingOrders) && content.imagingOrders.length > 0) {
      const procIds = content.imagingOrders.map((o: any) => o.procedureCatalogId).filter(Boolean);
      const procs = procIds.length > 0 ? await db.procedureCatalog.findMany({ where: { id: { in: procIds } }, select: { id: true, name: true, code: true } }) : [];
      const procMap = new Map(procs.map((p) => [p.id, p]));
      imagingOrdersPreview = content.imagingOrders.map((item: any) => {
        const proc = procMap.get(item.procedureCatalogId);
        return { procedureCatalogId: item.procedureCatalogId, procedureName: proc?.name || "Unknown", priority: item.priority || "routine", clinicalNote: item.clinicalNote || "" };
      });
    }

    // Prescriptions preview
    let prescriptionsPreview: any[] = [];
    if (Array.isArray(content.prescriptions) && content.prescriptions.length > 0) {
      const medIds = content.prescriptions.map((o: any) => o.medicationId).filter(Boolean);
      const meds = medIds.length > 0 ? await db.medication.findMany({ where: { id: { in: medIds } }, select: { id: true, genericName: true, brandName: true, strength: true, dosageForm: true, route: true } }) : [];
      const medMap = new Map(meds.map((m) => [m.id, m]));
      prescriptionsPreview = content.prescriptions.map((item: any) => {
        const med = medMap.get(item.medicationId);
        return { medicationId: item.medicationId, medicationName: med ? `${med.genericName} (${med.brandName || "generic"}) ${med.strength || ""}` : "Unknown", dosage: item.dosage || "", frequency: item.frequency || "", route: item.route || med?.route || "", duration: item.duration || "", quantity: item.quantity || null, instructions: item.instructions || "" };
      });
    }

    // Procedures preview
    let proceduresPreview: any[] = [];
    if (Array.isArray(content.procedures) && content.procedures.length > 0) {
      const procIds = content.procedures.map((o: any) => o.procedureCatalogId).filter(Boolean);
      const procs = procIds.length > 0 ? await db.procedureCatalog.findMany({ where: { id: { in: procIds } }, select: { id: true, name: true, code: true } }) : [];
      const procMap = new Map(procs.map((p) => [p.id, p]));
      proceduresPreview = content.procedures.map((item: any) => {
        const proc = procMap.get(item.procedureCatalogId);
        return { procedureCatalogId: item.procedureCatalogId, procedureName: proc?.name || "Unknown", priority: item.priority || "routine", clinicalNote: item.clinicalNote || "" };
      });
    }

    const consultationFields = template.templateType === "consultation" ? {
      chiefComplaint: content.chiefComplaint || "",
      historyPresentingIllness: content.historyPresentingIllness || "",
      pastMedicalHistory: content.pastMedicalHistory || "",
      assessment: content.assessment || "",
      treatmentPlan: content.treatmentPlan || "",
      patientInstructions: content.patientInstructions || "",
    } : undefined;

    return NextResponse.json({
      template: { id: template.id, name: template.name, templateType: template.templateType, versionId: currentVersion.id, versionNumber: currentVersion.versionNumber },
      encounter: { id: encounter.id, patientId: encounter.patientId, facilityId: encounter.facilityId },
      proposedItems: { labOrders: labOrdersPreview, imagingOrders: imagingOrdersPreview, prescriptions: prescriptionsPreview, procedures: proceduresPreview, instructions: content.instructions || "" },
      consultationFields,
      duplicateWarnings,
    });
  } catch (e: any) {
    console.error("[POST /api/clinical-templates/[id]/apply]", e);
    return NextResponse.json({ error: e.message || "Failed to preview template" }, { status: 500 });
  }
}

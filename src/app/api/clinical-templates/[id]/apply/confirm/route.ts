// =====================================================================
// API: /api/clinical-templates/[id]/apply/confirm — creates orders
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

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

  const { encounterId, patientId, versionId, modified, items } = body;
  if (!encounterId) return NextResponse.json({ error: "encounterId is required" }, { status: 400 });
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  if (!versionId) return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  if (!items) return NextResponse.json({ error: "items is required" }, { status: 400 });

  const organizationId = session.user.organizationId;
  const userId = session.user.id;

  try {
    const encounter = await db.encounter.findUnique({
      where: { id: encounterId },
      select: { id: true, patientId: true, facilityId: true, status: true },
    });
    if (!encounter) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
    if (encounter.patientId !== patientId) return NextResponse.json({ error: "Patient ID mismatch" }, { status: 400 });
    if (encounter.status === "closed" || encounter.status === "cancelled") return NextResponse.json({ error: `Encounter is ${encounter.status}` }, { status: 400 });

    const facility = await db.facility.findUnique({ where: { id: encounter.facilityId }, select: { organizationId: true } });
    if (!facility || facility.organizationId !== organizationId) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });

    const template = await db.clinicalTemplate.findUnique({ where: { id } });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    if (template.organizationId !== organizationId) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    if (template.status !== "active") return NextResponse.json({ error: "Template is not active" }, { status: 400 });

    const version = await db.clinicalTemplateVersion.findUnique({ where: { id: versionId } });
    if (!version || version.templateId !== id) return NextResponse.json({ error: "Version not found" }, { status: 404 });

    const errors: string[] = [];
    let labOrdersCreated = 0, imagingOrdersCreated = 0, prescriptionsCreated = 0, proceduresCreated = 0;
    const facilityId = encounter.facilityId;

    // ── Lab Orders ───────────────────────────────────────────────────
    const labItems = (items.labOrders || []).filter((o: any) => o.laboratoryTestId && !o.skip);
    if (labItems.length > 0) {
      try {
        // Generate order number
        const orderCount = await db.labOrder.count({ where: { facilityId } });
        const orderNumber = `LAB-${String(orderCount + 1).padStart(6, "0")}`;

        const labOrder = await db.labOrder.create({
          data: {
            patientId, encounterId, facilityId,
            orderingClinicianId: userId,
            orderNumber,
            status: "ordered",
            priority: labItems[0]?.priority || "routine",
            orderedAt: new Date(),
          },
        });
        // Create items separately
        for (const item of labItems) {
          await db.labOrderItem.create({
            data: {
              labOrderId: labOrder.id,
              laboratoryTestId: item.laboratoryTestId,
              status: "ordered",
            },
          });
          labOrdersCreated++;
        }
        await auditLog({ userId, organizationId, facilityId, action: "LAB_ORDER_CREATED", resourceType: "lab_order", resourceId: labOrder.id, newValues: { source: "clinical_template", templateId: id, itemCount: labOrdersCreated } });
      } catch (e: any) { errors.push(`Lab orders: ${e.message}`); }
    }

    // ── Prescriptions ──────────────────────────────────────────────
    const rxItems = (items.prescriptions || []).filter((p: any) => p.medicationId && !p.skip);
    if (rxItems.length > 0) {
      try {
        const rxCount = await db.prescription.count({ where: { facilityId } });
        const rxNumber = `RX-${String(rxCount + 1).padStart(6, "0")}`;
        const rx = await db.prescription.create({
          data: {
            patientId, encounterId, facilityId,
            prescriptionNumber: rxNumber,
            prescriberId: userId,
            status: "pending",
            prescribedAt: new Date(),
          },
        });
        for (const item of rxItems) {
          await db.prescriptionItem.create({
            data: {
              prescriptionId: rx.id,
              medicationId: item.medicationId,
              dose: item.dosage || "",
              frequency: item.frequency || "",
              route: item.route || null,
              duration: item.duration || null,
              quantity: item.quantity || 0,
              instructions: item.instructions || null,
              status: "pending",
            },
          });
          prescriptionsCreated++;
        }
        await auditLog({ userId, organizationId, facilityId, action: "PRESCRIPTION_CREATED", resourceType: "prescription", resourceId: rx.id, newValues: { source: "clinical_template", templateId: id, itemCount: prescriptionsCreated } });
      } catch (e: any) { errors.push(`Prescriptions: ${e.message}`); }
    }

    // ── Imaging Orders ──────────────────────────────────────────────
    const imgItems = (items.imagingOrders || []).filter((o: any) => o.procedureCatalogId && !o.skip);
    if (imgItems.length > 0) {
      try {
        for (const img of imgItems) {
          await db.imagingOrder.create({
            data: {
              patientId, encounterId, facilityId,
              orderingClinicianId: userId,
              procedureName: img.procedureName || "Imaging",
              status: "ordered",
              priority: img.priority || "routine",
              orderedAt: new Date(),
            },
          });
          imagingOrdersCreated++;
        }
        if (imagingOrdersCreated > 0) {
          await auditLog({ userId, organizationId, facilityId, action: "IMAGING_ORDER_CREATED", resourceType: "imaging_order", newValues: { source: "clinical_template", templateId: id, count: imagingOrdersCreated } });
        }
      } catch (e: any) { errors.push(`Imaging orders: ${e.message}`); }
    }

    // ── Procedures ──────────────────────────────────────────────────
    const procItems = (items.procedures || []).filter((o: any) => o.procedureCatalogId && !o.skip);
    if (procItems.length > 0) {
      try {
        for (const proc of procItems) {
          await db.procedure.create({
            data: {
              patientId, encounterId, facilityId,
              procedureCatalogId: proc.procedureCatalogId,
              procedureName: proc.procedureName || "Procedure",
              requestedById: userId,
              status: "scheduled",
              requestedAt: new Date(),
            },
          });
          proceduresCreated++;
        }
        if (proceduresCreated > 0) {
          await auditLog({ userId, organizationId, facilityId, action: "PROCEDURE_SCHEDULED", resourceType: "procedure", newValues: { source: "clinical_template", templateId: id, count: proceduresCreated } });
        }
      } catch (e: any) { errors.push(`Procedures: ${e.message}`); }
    }

    // ── Record the ClinicalTemplateApplication ─────────────────────
    const application = await db.clinicalTemplateApplication.create({
      data: {
        templateId: id,
        templateVersionId: versionId,
        encounterId, patientId,
        appliedById: userId,
        modified: !!modified,
        status: "active",
        itemsCreated: JSON.stringify({ labOrders: labOrdersCreated, imagingOrders: imagingOrdersCreated, prescriptions: prescriptionsCreated, procedures: proceduresCreated }),
      },
    });

    await auditLog({
      userId, organizationId, facilityId,
      action: "CLINICAL_TEMPLATE_APPLIED",
      resourceType: "clinical_template_application",
      resourceId: application.id,
      newValues: {
        templateId: id, templateName: template.name, versionNumber: version.versionNumber,
        encounterId, modified: !!modified,
        created: { labOrders: labOrdersCreated, imagingOrders: imagingOrdersCreated, prescriptions: prescriptionsCreated, procedures: proceduresCreated },
        errors: errors.length > 0 ? errors : undefined,
      },
    });

    return NextResponse.json({
      applicationId: application.id,
      created: { labOrders: labOrdersCreated, imagingOrders: imagingOrdersCreated, prescriptions: prescriptionsCreated, procedures: proceduresCreated },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[POST /api/clinical-templates/[id]/apply/confirm]", e);
    return NextResponse.json({ error: e.message || "Failed to apply template" }, { status: 500 });
  }
}

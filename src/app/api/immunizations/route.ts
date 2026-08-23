// =====================================================================
// API: /api/immunizations
//   GET  — list immunizations (filter by facility/patient/status/vaccine/date)
//   POST — record immunization administration with batch + stock deduction
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextInvoiceNumber, nextAppointmentNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { isDuplicateDose, getNextDueDose } from "@/lib/immunization-schedule";
import { notifyVaccineAdministered, notifyVaccineStockOut } from "@/lib/workflow-notifications";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/immunizations?facilityId=...&patientId=...&status=...&vaccineCatalogId=...&dateFrom=...&dateTo=...&search=...&limit=100
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMMUNIZATION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId");
  const status = url.searchParams.get("status");
  const vaccineCatalogId = url.searchParams.get("vaccineCatalogId");
  const batchId = url.searchParams.get("batchId");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const search = url.searchParams.get("search")?.trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (patientId) where.patientId = patientId;
  if (status && status !== "all") where.status = status;
  if (vaccineCatalogId && vaccineCatalogId !== "all") where.vaccineCatalogId = vaccineCatalogId;
  if (batchId) where.batchId = batchId;

  if (dateFrom || dateTo) {
    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom + "T00:00:00");
    if (dateTo) dateFilter.lte = new Date(dateTo + "T23:59:59");
    where.administeredAt = dateFilter;
  }

  if (search) {
    where.OR = [
      { vaccineName: { contains: search, mode: "insensitive" } },
      { batchNumber: { contains: search, mode: "insensitive" } },
      {
        patient: {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { patientNumber: { contains: search, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const immunizations = await db.immunization.findMany({
    where,
    orderBy: { administeredAt: "desc" },
    take: limit,
    include: {
      patient: {
        select: {
          id: true,
          patientNumber: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          sex: true,
          phone: true,
        },
      },
      facility: { select: { id: true, name: true } },
      administeredBy: { select: { id: true, firstName: true, lastName: true } },
      vaccineCatalog: { select: { id: true, code: true, name: true } },
      aefiRecords: { select: { id: true, severity: true, status: true } },
      _count: { select: { aefiRecords: true } },
    },
  });

  return NextResponse.json({ items: immunizations, count: immunizations.length });
}

// POST /api/immunizations
// Body: {
//   patientId, vaccineCatalogId?, vaccineName, dose?, doseNumber?,
//   batchId?, batchNumber?, manufacturer?, expiryDate?,
//   route?, site?, administeredAt?, nextDueAt?, facilityId,
//   status?, indication?, encounterId?, consentStatus?, guardianName?,
//   notes?, deductStock?
// }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMMUNIZATION_RECORD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const {
    patientId, vaccineCatalogId, vaccineName, dose, doseNumber,
    batchId, batchNumber, manufacturer, expiryDate,
    route, site, administeredAt, nextDueAt, facilityId,
    status, indication, encounterId, consentStatus, guardianName,
    notes, deductStock = true,
    // Appointment auto-booking + billing integration
    createAppointment = false,
    createInvoice = false,
  } = body;

  if (!patientId || !vaccineName || !facilityId) {
    return NextResponse.json(
      { error: "patientId, vaccineName, and facilityId are required" },
      { status: 400 }
    );
  }

  // ---- Validate batch if provided ----
  let batch: any = null;
  if (batchId) {
    batch = await db.inventoryBatch.findUnique({
      where: { id: batchId },
      include: {
        facilityInventory: { select: { facilityId: true, inventoryItemId: true } },
      },
    });
    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }
    // Verify batch belongs to the administering facility
    if (batch.facilityInventory.facilityId !== facilityId) {
      return NextResponse.json(
        { error: "Batch does not belong to the administering facility" },
        { status: 400 }
      );
    }
    // Reject expired batches
    if (batch.expiryDate && new Date(batch.expiryDate) < new Date()) {
      return NextResponse.json(
        { error: `Batch ${batch.batchNumber} expired on ${new Date(batch.expiryDate).toLocaleDateString()}` },
        { status: 400 }
      );
    }
    // Reject out-of-stock batches
    if (batch.quantity <= 0) {
      return NextResponse.json(
        { error: `Batch ${batch.batchNumber} has no available stock` },
        { status: 400 }
      );
    }
  }

  // ---- Duplicate dose check ----
  if (vaccineCatalogId && doseNumber) {
    const dup = await isDuplicateDose(patientId, vaccineCatalogId, doseNumber);
    if (dup) {
      return NextResponse.json(
        {
          error: `Duplicate dose detected: patient already has a completed record for ${vaccineName} dose ${doseNumber}. Use the amendment workflow if this is a correction.`,
          code: "DUPLICATE_DOSE",
        },
        { status: 409 }
      );
    }
  }

  // ---- Auto-compute nextDueAt from schedule if not provided ----
  let computedNextDueAt: Date | null = nextDueAt ? new Date(nextDueAt) : null;
  if (!computedNextDueAt && vaccineCatalogId) {
    const nextDose = await getNextDueDose(patientId, vaccineCatalogId, session.user.organizationId);
    if (nextDose) {
      computedNextDueAt = nextDose.dueDate;
    }
  }

  // ---- Create immunization record + deduct stock in a transaction ----
  const result = await db.$transaction(async (tx) => {
    // 1. Create the immunization record
    const immunization = await tx.immunization.create({
      data: {
        patientId,
        vaccineCatalogId: vaccineCatalogId || null,
        vaccineName,
        dose: dose || null,
        doseNumber: doseNumber || null,
        batchId: batchId || null,
        batchNumber: batchNumber || batch?.batchNumber || null,
        manufacturer: manufacturer || null,
        expiryDate: expiryDate ? new Date(expiryDate) : batch?.expiryDate || null,
        route: route || null,
        site: site || null,
        administeredAt: administeredAt ? new Date(administeredAt) : new Date(),
        nextDueAt: computedNextDueAt,
        status: status || "completed",
        indication: indication || null,
        encounterId: encounterId || null,
        consentStatus: consentStatus || null,
        consentObtainedAt: consentStatus === "obtained" ? new Date() : null,
        guardianName: guardianName || null,
        facilityId,
        administeredById: session.user.id,
        notes: notes || null,
      },
    });

    // 2. Deduct stock from the batch (if requested and batch is linked)
    if (deductStock && batchId && batch) {
      const inventoryItemId = batch.facilityInventory.inventoryItemId;

      // Decrement batch quantity
      const updatedBatch = await tx.inventoryBatch.update({
        where: { id: batchId },
        data: { quantity: { decrement: 1 } },
      });

      if (updatedBatch.quantity < 0) {
        throw new Error(`Batch ${batch.batchNumber} has insufficient stock (would go negative)`);
      }

      // Decrement facility inventory current quantity
      await tx.facilityInventory.update({
        where: { id: batch.facilityInventoryId },
        data: { currentQuantity: { decrement: 1 } },
      });

      // Create inventory transaction record for audit trail
      await tx.inventoryTransaction.create({
        data: {
          facilityId,
          inventoryItemId,
          batchId,
          transactionType: "dispense",
          quantity: -1, // 1 dose consumed
          referenceType: "immunization",
          referenceId: immunization.id,
          performedById: session.user.id,
          transactionAt: new Date(),
          notes: `Vaccine administration: ${vaccineName}${dose ? ` (${dose})` : ""}`,
        },
      });
    }

    // 3. Auto-book next-dose appointment if requested
    let appointmentId: string | null = null;
    if (createAppointment && computedNextDueAt) {
      const apptNumber = `APT-${new Date().getFullYear()}-${String(
        await tx.appointment.count({ where: { facilityId } }) + 1
      ).padStart(6, "0")}`;
      const appt = await tx.appointment.create({
        data: {
          patientId,
          facilityId,
          appointmentNumber: apptNumber,
          appointmentType: "follow_up",
          scheduledStart: computedNextDueAt,
          status: "scheduled",
          reason: `Vaccination follow-up: ${vaccineName}${dose ? ` (${dose})` : ""}`,
          notes: `Auto-booked from immunization record ${immunization.id}. Next dose due.`,
          createdById: session.user.id,
        },
      });
      appointmentId = appt.id;
    }

    // 4. Create invoice item if requested and vaccine has a linked Service
    let invoiceId: string | null = null;
    if (createInvoice && vaccineCatalogId) {
      // Load the vaccine catalog to get the serviceId
      const vaccine = await tx.vaccineCatalog.findUnique({
        where: { id: vaccineCatalogId },
        select: { serviceId: true, name: true },
      });
      if (vaccine?.serviceId) {
        // Load the service to get the price
        const service = await tx.service.findUnique({
          where: { id: vaccine.serviceId },
          select: { id: true, name: true, defaultPrice: true, nhisPrice: true },
        });
        if (service) {
          // Check if the patient has an active/draft invoice at this facility
          let invoice = await tx.invoice.findFirst({
            where: {
              patientId,
              facilityId,
              status: { in: ["draft", "issued", "partially_paid"] },
            },
            orderBy: { createdAt: "desc" },
          });

          if (!invoice) {
            // Create a new invoice
            const invNumber = `INV-${new Date().getFullYear()}-${String(
              await tx.invoice.count({ where: { facilityId } }) + 1
            ).padStart(6, "0")}`;
            invoice = await tx.invoice.create({
              data: {
                patientId,
                encounterId: encounterId || null,
                facilityId,
                invoiceNumber: invNumber,
                status: "draft",
                currency: "GHS",
                createdById: session.user.id,
              },
            });
          }

          // Determine the unit price — prefer NHIS price if patient has NHIS
          const patientInsurance = await tx.patientInsurance.findFirst({
            where: {
              patientId,
              status: "active",
              verificationStatus: "verified",
            },
            include: { insuranceProvider: { select: { name: true, code: true } } },
          });
          const isNhis = patientInsurance?.insuranceProvider?.code?.toUpperCase().includes("NHIS");
          const unitPrice = isNhis && service.nhisPrice != null
            ? service.nhisPrice
            : service.defaultPrice;

          // Create the invoice item
          await tx.invoiceItem.create({
            data: {
              invoiceId: invoice.id,
              serviceId: service.id,
              description: `Vaccine administration: ${vaccineName}${dose ? ` (${dose})` : ""}`,
              quantity: 1,
              unitPrice,
              total: unitPrice,
              referenceType: "immunization",
              referenceId: immunization.id,
            },
          });

          // Recalculate invoice totals
          const allItems = await tx.invoiceItem.findMany({
            where: { invoiceId: invoice.id },
            select: { total: true, discount: true, tax: true },
          });
          const subtotal = allItems.reduce((sum, it) => sum + it.total, 0);
          const totalDiscount = allItems.reduce((sum, it) => sum + (it.discount || 0), 0);
          const totalTax = allItems.reduce((sum, it) => sum + (it.tax || 0), 0);
          const grandTotal = subtotal - totalDiscount + totalTax;
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              subtotal,
              discount: totalDiscount,
              tax: totalTax,
              total: grandTotal,
              balance: grandTotal - (invoice.amountPaid || 0),
            },
          });
          invoiceId = invoice.id;
        }
      }
    }

    // Update the immunization record with the appointment + invoice links
    if (appointmentId || invoiceId) {
      await tx.immunization.update({
        where: { id: immunization.id },
        data: {
          ...(appointmentId ? { appointmentId } : {}),
        },
      });
    }

    return { immunization, appointmentId, invoiceId };
  }).catch((err) => ({ error: err.message }));

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { immunization, appointmentId, invoiceId } = result as {
    immunization: any;
    appointmentId: string | null;
    invoiceId: string | null;
  };

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "IMMUNIZATION_RECORDED",
    resourceType: "immunization",
    resourceId: immunization.id,
    newValues: {
      patientId,
      vaccineName,
      dose,
      doseNumber,
      batchNumber: immunization.batchNumber,
      status: immunization.status,
      appointmentId,
      invoiceId,
    },
  });

  // 🔔 Fire workflow notification: vaccine administered
  // Load patient name for the notification
  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { firstName: true, lastName: true },
  });
  await notifyVaccineAdministered({
    organizationId: session.user.organizationId,
    facilityId,
    patientName: patient ? `${patient.firstName} ${patient.lastName}` : "Unknown",
    vaccineName,
    doseLabel: dose || undefined,
    immunizationId: immunization.id,
    administeredById: session.user.id,
  });

  // 🔔 Fire stock-out notification if the batch is now at/below reorder level
  if (batchId && batch) {
    const updatedBatch = await db.inventoryBatch.findUnique({
      where: { id: batchId },
      include: {
        facilityInventory: {
          select: { id: true, currentQuantity: true, minimumQuantity: true, inventoryItemId: true },
        },
      },
    });
    if (updatedBatch && updatedBatch.facilityInventory) {
      const fi = updatedBatch.facilityInventory;
      if (fi.currentQuantity <= 0 || (fi.minimumQuantity && fi.currentQuantity <= fi.minimumQuantity)) {
        await notifyVaccineStockOut({
          organizationId: session.user.organizationId,
          facilityId,
          vaccineName,
          batchNumber: updatedBatch.batchNumber,
          currentStock: fi.currentQuantity,
          reorderLevel: fi.minimumQuantity || undefined,
          inventoryItemId: fi.inventoryItemId,
        });
      }
    }
  }

  // Load the full record with relations for the response
  const fullRecord = await db.immunization.findUnique({
    where: { id: immunization.id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      facility: { select: { id: true, name: true } },
      vaccineCatalog: { select: { id: true, code: true, name: true } },
    },
  });

  return NextResponse.json(
    { item: fullRecord, appointmentId, invoiceId },
    { status: 201 }
  );
}

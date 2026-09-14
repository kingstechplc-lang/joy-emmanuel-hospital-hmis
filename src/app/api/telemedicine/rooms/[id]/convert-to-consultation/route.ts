// =====================================================================
// API: /api/telemedicine/rooms/[id]/convert-to-consultation
//   POST — convert a finished telemedicine call into a full clinical
//          Consultation + Encounter + Invoice.
//
// Permission: consultation.create (we reuse CLINICAL_CREATE since
// telemedicine.* / consultation.* aren't yet defined — consultations
// are clinical operations).
//
// Body: {
//   chiefComplaint?, historyPresentingIllness?, examination?,
//   assessment?, treatmentPlan?, followUpPlan?, patientInstructions?
// }
//   (Note: "examination" maps to Consultation.physicalExamination)
//
// Flow:
//   1. Validate room exists, belongs to org, caller is linked clinician.
//   2. Idempotency: if room.consultationId is already set, return the
//      existing consultation + invoice (so a doctor who double-clicks
//      "Convert" doesn't get duplicate records).
//   3. Create an Encounter (if not already linked) with:
//        - encounterType = "opd"
//        - source = "telemedicine"
//        - status = "open"
//   4. Create the Consultation record linking to the encounter +
//      patient + clinician. Sets status="draft" (the doctor can sign
//      it from the consultations view afterwards).
//   5. Link the consultationId back to the TelemedicineRoom.
//   6. Generate an Invoice for the telemedicine consultation:
//        - Look up a Service in the org with code "TELEMED" or
//          category "consultation" + name containing "telemed".
//          If found, use its defaultPrice; else fall back to a free-
//          text line item with unitPrice=0 (the doctor can adjust
//          from the invoice edit page).
//        - invoiceType = "outpatient", payerType = "self_pay"
//        - status = "draft"
//        - Link the invoiceId back to the TelemedicineRoom too.
//   7. Audit log TELEMEDICINE_CONVERTED_TO_CONSULTATION.
//   8. Return { consultation, invoice }.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getSession,
  hasAnyPermission,
  auditLog,
  nextEncounterNumber,
  nextInvoiceNumber,
} from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const CONVERT_PERMS = [PERMISSIONS.CLINICAL_CREATE];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAnyPermission(session, CONVERT_PERMS)) {
    return NextResponse.json(
      { error: "Forbidden — missing consultation.create permission" },
      { status: 403 }
    );
  }

  const { id } = await params;

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 }
    );
  }

  const {
    chiefComplaint,
    historyPresentingIllness,
    examination,
    assessment,
    treatmentPlan,
    followUpPlan,
    patientInstructions,
  } = body;

  try {
    const room = await db.telemedicineRoom.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            patientNumber: true,
            firstName: true,
            lastName: true,
            sex: true,
            dateOfBirth: true,
          },
        },
        clinician: {
          select: { id: true, firstName: true, lastName: true },
        },
        encounter: { select: { id: true, encounterNumber: true } },
        appointment: { select: { id: true, departmentId: true } },
      },
    });

    if (!room) {
      return NextResponse.json(
        { error: "Telemedicine room not found" },
        { status: 404 }
      );
    }
    if (room.organizationId !== session.user.organizationId) {
      return NextResponse.json(
        { error: "Telemedicine room not found" },
        { status: 404 }
      );
    }

    // Authorization: the linked clinician or super_admin.
    const isLinkedClinician = room.clinicianId === session.user.id;
    const isSuperAdmin = session.user.roles.includes("super_admin");
    if (!isLinkedClinician && !isSuperAdmin) {
      return NextResponse.json(
        {
          error:
            "Only the linked clinician can convert this telemedicine call to a consultation.",
        },
        { status: 403 }
      );
    }

    // Idempotency — if already converted, fetch the existing records.
    if (room.consultationId) {
      const existingConsultation = await db.consultation.findUnique({
        where: { id: room.consultationId },
        include: {
          patient: {
            select: {
              id: true,
              patientNumber: true,
              firstName: true,
              lastName: true,
            },
          },
          encounter: {
            select: { id: true, encounterNumber: true },
          },
        },
      });
      const existingInvoice = room.invoiceId
        ? await db.invoice.findUnique({
            where: { id: room.invoiceId },
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              total: true,
              balance: true,
              currency: true,
            },
          })
        : null;
      return NextResponse.json({
        consultation: existingConsultation,
        invoice: existingInvoice,
        message: "Telemedicine room was already converted to a consultation.",
        idempotent: true,
      });
    }

    // The clinician who owns the room is the consultation's clinician.
    const clinicianId = room.clinicianId || session.user.id;

    // ── 1. Create (or reuse) the Encounter ──────────────────────────
    let encounterId = room.encounterId;
    let encounterNumber: string | null = room.encounter?.encounterNumber || null;

    if (!encounterId) {
      encounterNumber = await nextEncounterNumber(room.facilityId);
      const newEncounter = await db.encounter.create({
        data: {
          patientId: room.patientId,
          facilityId: room.facilityId,
          departmentId: room.appointment?.departmentId || null,
          unitId: null,
          encounterNumber,
          encounterType: "opd",
          status: "open",
          priority: "routine",
          attendingStaffId: clinicianId,
          source: "telemedicine",
          notes: `Created from telemedicine room ${room.roomName}`,
          startAt: new Date(),
          checkInAt: new Date(),
          createdById: session.user.id,
        },
        select: { id: true, encounterNumber: true },
      });
      encounterId = newEncounter.id;
      encounterNumber = newEncounter.encounterNumber;

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: room.facilityId,
        action: "ENCOUNTER_CREATED",
        resourceType: "encounter",
        resourceId: encounterId,
        newValues: {
          encounterNumber,
          patientId: room.patientId,
          encounterType: "opd",
          source: "telemedicine",
        },
      });
    }

    // ── 2. Create the Consultation ───────────────────────────────────
    // Map the body's `examination` field to Consultation.physicalExamination.
    const consultation = await db.consultation.create({
      data: {
        encounterId,
        patientId: room.patientId,
        clinicianId,
        chiefComplaint: chiefComplaint || null,
        historyPresentingIllness: historyPresentingIllness || null,
        // Body uses `examination`; the Consultation model calls this
        // `physicalExamination`. Map explicitly so the API contract
        // (which mirrors the existing consultations POST endpoint's
        // field naming for consistency) stays clean.
        physicalExamination: examination || null,
        assessment: assessment || null,
        treatmentPlan: treatmentPlan || null,
        followUpPlan: followUpPlan || null,
        patientInstructions: patientInstructions || null,
        status: "draft",
        consultationStart: room.callStartedAt || new Date(),
        consultationEnd: room.callEndedAt || new Date(),
      },
      include: {
        patient: {
          select: {
            id: true,
            patientNumber: true,
            firstName: true,
            lastName: true,
          },
        },
        encounter: { select: { id: true, encounterNumber: true } },
        clinician: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: room.facilityId,
      action: "CONSULTATION_CREATED",
      resourceType: "consultation",
      resourceId: consultation.id,
      newValues: {
        encounterId,
        patientId: room.patientId,
        chiefComplaint,
        source: "telemedicine",
      },
    });

    // ── 3. Generate the Invoice ──────────────────────────────────────
    // Look up a telemedicine Service in the org. We try (in order):
    //   1. Exact code match "TELEMED"
    //   2. Code starts with "TELEMED" (e.g. TELEMED-CONSULT)
    //   3. Category "consultation" AND name contains "telemed"
    // If none, fall back to a free-text line item with unitPrice=0 —
    // the doctor can adjust the price from the invoice edit page.
    let telemedService: any = null;
    try {
      telemedService = await db.service.findFirst({
        where: {
          organizationId: session.user.organizationId,
          OR: [
            { code: "TELEMED" },
            { code: { startsWith: "TELEMED" } },
            {
              category: "consultation",
              name: { contains: "telemed", mode: "insensitive" },
            },
            {
              serviceType: "consultation",
              name: { contains: "telemed", mode: "insensitive" },
            },
          ],
        },
        orderBy: [{ code: "asc" }, { name: "asc" }],
      });
      // If the lookup returned a non-billable service (rare), look up
      // a generic consultation service as fallback.
      if (!telemedService || telemedService.isBillable === false) {
        telemedService =
          telemedService ||
          (await db.service.findFirst({
            where: {
              organizationId: session.user.organizationId,
              category: "consultation",
              isBillable: true,
              status: "active",
            },
            orderBy: { defaultPrice: "desc" },
          }));
      }
    } catch (svcErr) {
      // Service lookup is best-effort — never block the consultation
      // conversion if the Service catalog has a transient issue. We
      // just create a free-text line item with unitPrice=0.
      console.error("[telemedicine/convert] Service lookup failed:", svcErr);
      telemedService = null;
    }

    const unitPrice = telemedService?.defaultPrice || 0;
    const lineDescription = telemedService?.name || "Telemedicine Consultation";
    const lineTotal = Math.max(0, unitPrice);
    const invoiceTotal = lineTotal;

    const invoiceNumber = await nextInvoiceNumber(room.facilityId);
    const invoice = await db.invoice.create({
      data: {
        patientId: room.patientId,
        encounterId,
        facilityId: room.facilityId,
        invoiceNumber,
        invoiceType: "outpatient",
        payerType: "self_pay",
        status: "draft",
        subtotal: invoiceTotal,
        discount: 0,
        tax: 0,
        taxRate: 0,
        total: invoiceTotal,
        amountPaid: 0,
        amountRefunded: 0,
        amountCredited: 0,
        balance: invoiceTotal,
        payerResponsibility: 0,
        patientResponsibility: invoiceTotal,
        insuranceResponsibility: 0,
        nhisResponsibility: 0,
        currency: "GHS",
        dueAt: null,
        internalNotes: `Auto-generated from telemedicine room ${room.roomName}`,
        patientNotes: null,
        paymentTerms: null,
        createdById: session.user.id,
        items: {
          create: [
            {
              serviceId: telemedService?.id || null,
              description: lineDescription,
              quantity: 1,
              unitPrice,
              discount: 0,
              tax: 0,
              total: lineTotal,
              referenceType: "consultation",
              referenceId: consultation.id,
            },
          ],
        },
      },
      include: {
        items: {
          include: {
            service: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: room.facilityId,
      action: "INVOICE_CREATED",
      resourceType: "invoice",
      resourceId: invoice.id,
      newValues: {
        invoiceNumber,
        patientId: room.patientId,
        invoiceType: "outpatient",
        payerType: "self_pay",
        total: invoiceTotal,
        itemCount: 1,
        status: "draft",
        source: "telemedicine",
      },
    });

    // ── 4. Link the consultation + invoice back to the room ──────────
    const updatedRoom = await db.telemedicineRoom.update({
      where: { id: room.id },
      data: {
        encounterId,
        consultationId: consultation.id,
        invoiceId: invoice.id,
      },
      select: {
        id: true,
        encounterId: true,
        consultationId: true,
        invoiceId: true,
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: room.facilityId,
      action: "TELEMEDICINE_CONVERTED_TO_CONSULTATION",
      resourceType: "telemedicine_room",
      resourceId: room.id,
      oldValues: {
        consultationId: null,
        encounterId: room.encounterId,
        invoiceId: null,
      },
      newValues: {
        consultationId: consultation.id,
        encounterId,
        invoiceId: invoice.id,
        invoiceNumber,
        encounterNumber,
      },
    });

    return NextResponse.json(
      {
        consultation,
        invoice,
        room: updatedRoom,
        idempotent: false,
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error(
      "[POST /api/telemedicine/rooms/[id]/convert-to-consultation] error:",
      e
    );
    // Surface Prisma unique-constraint violations as 409 — the caller
    // (e.g. a doctor who double-clicked Convert) can retry safely.
    if (e?.code === "P2002") {
      return NextResponse.json(
        {
          error: "A record with that number already exists — please retry.",
          code: "UNIQUE_CONSTRAINT_VIOLATION",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        error: "Failed to convert telemedicine call to consultation",
        detail: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}

// =====================================================================
// API: /api/records/check-in
//   POST — The Records Desk check-in workflow:
//     1. Find or confirm the patient (must already exist)
//     2. Evaluate insurance eligibility (NHIS valid / expired / unvalidated / self-pay)
//     3. Create a new encounter (OPD by default, configurable)
//     4. Optionally add patient to the OPD queue
//     5. Return the encounter + eligibility classification
//
//   Body: {
//     patientId: string,
//     encounterType?: "opd" | "emergency" | "follow_up" | ...,
//     priority?: "routine" | "urgent" | "emergency",
//     departmentId?: string,
//     addToQueue?: boolean,
//     chiefComplaint?: string,
//   }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog, nextEncounterNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !hasPermission(session, PERMISSIONS.ENCOUNTER_CREATE) &&
    !hasPermission(session, PERMISSIONS.PATIENT_CREATE)
  ) {
    return NextResponse.json({ error: "Forbidden — missing encounter.create permission" }, { status: 403 });
  }

  // Parse body safely — handle empty/invalid JSON gracefully
  let body: any;
  try {
    const text = await req.text();
    if (!text || text.trim() === "") {
      return NextResponse.json({ error: "Request body is empty. Please provide patientId, encounterType, and other required fields." }, { status: 400 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body. Please check the data and try again." }, { status: 400 });
  }

  const {
    patientId,
    encounterType = "opd",
    priority = "routine",
    departmentId,
    addToQueue = true,
    chiefComplaint,
  } = body;

  if (!patientId) {
    return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  }

  const facilityId = body.facilityId || session.user.facilityId;
  if (!facilityId) {
    return NextResponse.json({ error: "No facility selected. Choose a facility first." }, { status: 400 });
  }

  // ─── 0. Verify the facility exists and belongs to this org ─────
  // This prevents foreign key constraint violations when a stale/invalid
  // facilityId is sent (e.g., from browser localStorage of a previous session)
  let facility;
  try {
    facility = await db.facility.findUnique({
      where: { id: facilityId },
      select: { id: true, name: true, code: true, organizationId: true },
    });
  } catch (dbErr: any) {
    console.error("[check-in] Database error looking up facility:", dbErr?.message);
    return NextResponse.json(
      { error: `Database error verifying facility: ${dbErr?.message || "Unknown error"}` },
      { status: 500 }
    );
  }

  if (!facility) {
    return NextResponse.json(
      {
        error: `Facility not found (ID: ${facilityId}). This usually means your browser has a stale facility selection from a previous session. Please select a facility from the top bar dropdown and try again. If no facilities appear in the dropdown, the database may need to be seeded (run: bun run seed).`,
      },
      { status: 400 }
    );
  }

  if (facility.organizationId !== session.user.organizationId) {
    return NextResponse.json(
      { error: "Facility does not belong to your organization. Please select a valid facility." },
      { status: 403 }
    );
  }

  // ─── 1. Verify patient exists and belongs to this org ─────────
  let patient;
  try {
    patient = await db.patient.findUnique({
      where: { id: patientId },
      include: {
        identifiers: { take: 3, orderBy: { isPrimary: "desc" } },
        insurance: {
          where: { status: "active" },
          include: { insuranceProvider: true },
          take: 3,
        },
        allergies: { where: { status: "active" }, take: 5 },
      },
    });
  } catch (dbErr: any) {
    console.error("[check-in] Database error looking up patient:", dbErr?.message);
    return NextResponse.json(
      { error: `Database error: ${dbErr?.message || "Could not connect to the database. Please try again or contact support."}` },
      { status: 500 }
    );
  }

  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  // ─── 2. Evaluate insurance eligibility ────────────────────────
  const now = new Date();
  let eligibility: "valid" | "expired" | "unvalidated" | "self_pay" = "self_pay";
  let payerType: "NHIS" | "self_pay" = "self_pay";
  let insuranceInfo: any = null;

  if (patient.insurance.length > 0) {
    const ins = patient.insurance[0]; // primary insurance
    insuranceInfo = {
      provider: ins.insuranceProvider?.name || "Unknown",
      providerCode: ins.insuranceProvider?.code || null,
      membershipNumber: ins.membershipNumber,
      policyNumber: ins.policyNumber,
      verificationStatus: ins.verificationStatus,
      coverageEnd: ins.coverageEnd,
    };

    if (ins.verificationStatus === "verified" && ins.coverageEnd && new Date(ins.coverageEnd) >= now) {
      eligibility = "valid";
      payerType = "NHIS";
    } else if (ins.coverageEnd && new Date(ins.coverageEnd) < now) {
      eligibility = "expired";
    } else {
      eligibility = "unvalidated";
    }
  }

  // ─── 3. Check for an already-open encounter at this facility ──
  let existingEncounter;
  try {
    existingEncounter = await db.encounter.findFirst({
      where: {
        patientId,
        facilityId,
        status: { in: ["open", "in_progress"] },
      },
      orderBy: { startAt: "desc" },
    });
  } catch (err: any) {
    console.error("[check-in] Error checking existing encounter:", err?.message);
    return NextResponse.json(
      { error: `Could not check existing encounters: ${err?.message || "Database error"}` },
      { status: 500 }
    );
  }

  if (existingEncounter) {
    // Patient already checked in — return the existing encounter
    return NextResponse.json({
      encounter: existingEncounter,
      patient: {
        id: patient.id,
        patientNumber: patient.patientNumber,
        firstName: patient.firstName,
        lastName: patient.lastName,
        sex: patient.sex,
        dateOfBirth: patient.dateOfBirth,
        phone: patient.phone,
        bloodGroup: patient.bloodGroup,
      },
      eligibility,
      payerType,
      insuranceInfo,
      allergies: patient.allergies,
      alreadyCheckedIn: true,
      message: "Patient is already checked in at this facility. Existing encounter returned.",
    });
  }

  // ─── 4. Create new encounter ──────────────────────────────────
  let encounterNumber: string;
  try {
    encounterNumber = await nextEncounterNumber(facilityId);
  } catch (err: any) {
    console.error("[check-in] Error generating encounter number:", err?.message);
    return NextResponse.json(
      { error: `Could not generate encounter number: ${err?.message || "Unknown error"}` },
      { status: 500 }
    );
  }

  // Resolve department — default to OPD if not specified
  // Also validate that the department belongs to this facility
  let resolvedDeptId = departmentId;
  if (!resolvedDeptId) {
    try {
      const opd = await db.department.findFirst({
        where: { facilityId, code: "OPD" },
      });
      resolvedDeptId = opd?.id || null;
    } catch (err: any) {
      console.error("[check-in] Error finding OPD department:", err?.message);
      // Continue without department — not critical
    }
  } else {
    // Validate that the provided departmentId belongs to this facility
    try {
      const dept = await db.department.findUnique({
        where: { id: resolvedDeptId },
        select: { id: true, facilityId: true },
      });
      if (!dept || dept.facilityId !== facilityId) {
        // Department doesn't belong to this facility — clear it to avoid FK violation
        console.warn("[check-in] Department does not belong to facility, clearing departmentId");
        resolvedDeptId = null;
      }
    } catch {
      // If we can't validate, clear it to be safe
      resolvedDeptId = null;
    }
  }

  let encounter;
  try {
    encounter = await db.encounter.create({
      data: {
        patientId,
        facilityId,
        departmentId: resolvedDeptId,
        encounterNumber,
        encounterType,
        status: "open",
        priority,
        startAt: new Date(),
        createdById: session.user.id,
      },
      include: {
        facility: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
      },
    });
  } catch (err: any) {
    console.error("[check-in] Error creating encounter:", err?.message);
    return NextResponse.json(
      { error: `Could not create encounter: ${err?.message || "Database error. Please try again."}` },
      { status: 500 }
    );
  }

  // ─── 5. Optionally add to OPD queue ───────────────────────────
  let queueEntry: any = null;
  if (addToQueue) {
    try {
      // Find or create today's queue for this facility/department
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);

      let queue = await db.queue.findFirst({
        where: {
          facilityId,
          departmentId: resolvedDeptId,
          queueDate: todayDate,
          status: "active",
        },
      });

      if (!queue) {
        queue = await db.queue.create({
          data: {
            facilityId,
            departmentId: resolvedDeptId,
            queueDate: todayDate,
            queueType: encounterType,
            status: "active",
          },
        });
      }

      // Get the next queue number
      const lastEntry = await db.queueEntry.findFirst({
        where: { queueId: queue.id },
        orderBy: { queueNumber: "desc" },
      });
      const queueNumber = (lastEntry?.queueNumber || 0) + 1;

      queueEntry = await db.queueEntry.create({
        data: {
          queueId: queue.id,
          patientId,
          encounterId: encounter.id,
          queueNumber,
          priority,
          status: "waiting",
        },
      });
    } catch (err: any) {
      console.error("[check-in] Error adding to queue (non-critical):", err?.message);
      // Don't fail the entire check-in just because queue failed
    }
  }

  // ─── 6. Audit log ────────────────────────────────────────────
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "PATIENT_CHECKED_IN",
    resourceType: "encounter",
    resourceId: encounter.id,
    newValues: {
      encounterNumber,
      patientNumber: patient.patientNumber,
      patientName: `${patient.firstName} ${patient.lastName}`,
      encounterType,
      eligibility,
      payerType,
      chiefComplaint: chiefComplaint || null,
    },
  });

  return NextResponse.json({
    encounter,
    patient: {
      id: patient.id,
      patientNumber: patient.patientNumber,
      firstName: patient.firstName,
      lastName: patient.lastName,
      sex: patient.sex,
      dateOfBirth: patient.dateOfBirth,
      phone: patient.phone,
      bloodGroup: patient.bloodGroup,
    },
    eligibility,
    payerType,
    insuranceInfo,
    allergies: patient.allergies,
    queueEntry,
    alreadyCheckedIn: false,
    message: `Patient checked in successfully. Encounter ${encounterNumber} created. Payer: ${payerType === "NHIS" ? "NHIS-insured" : "Self-pay"}.`,
  }, { status: 201 });
}

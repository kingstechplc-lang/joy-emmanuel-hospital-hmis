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

  // ─── 1. Verify patient exists and belongs to this org ─────────
  const patient = await db.patient.findUnique({
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
  const existingEncounter = await db.encounter.findFirst({
    where: {
      patientId,
      facilityId,
      status: { in: ["open", "in_progress"] },
    },
    orderBy: { startAt: "desc" },
  });

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
  const encounterNumber = await nextEncounterNumber(facilityId);

  // Resolve department — default to OPD if not specified
  let resolvedDeptId = departmentId;
  if (!resolvedDeptId) {
    const opd = await db.department.findFirst({
      where: { facilityId, code: "OPD" },
    });
    resolvedDeptId = opd?.id || null;
  }

  const encounter = await db.encounter.create({
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

  // ─── 5. Optionally add to OPD queue ───────────────────────────
  let queueEntry: any = null;
  if (addToQueue) {
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

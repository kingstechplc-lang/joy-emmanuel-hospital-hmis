// =====================================================================
// WORKFLOW NOTIFICATION ENGINE
// =====================================================================
// Centralized system for sending cross-departmental notifications
// when clinical/operational events occur.
//
// Design:
// - Each workflow event has a defined set of recipients based on role
//   and/or department
// - Notifications are persisted in the Notification table
// - Each notification includes a deep link (referenceType + referenceId)
//   so the recipient can navigate directly to the relevant record
// - Role-based recipient resolution: e.g., when a lab order is created,
//   all users with the lab.process permission in the same facility
//   get notified
// =====================================================================
import { db } from "./db";

export type WorkflowEvent =
  | "lab_order_created"
  | "lab_sample_collected"
  | "lab_result_entered"
  | "lab_result_verified"
  | "lab_result_released"
  | "lab_order_cancelled"
  | "prescription_created"
  | "prescription_dispensed"
  | "prescription_partially_dispensed"
  | "imaging_order_created"
  | "imaging_performed"
  | "imaging_reported"
  | "imaging_verified"
  | "admission_created"
  | "admission_discharged"
  | "admission_transferred"
  | "discharge_initiated"
  | "referral_made"
  | "referral_accepted"
  | "procedure_scheduled"
  | "procedure_completed"
  | "theatre_case_scheduled"
  | "theatre_case_started"
  | "theatre_case_completed"
  | "critical_care_admitted"
  | "critical_care_discharged"
  | "blood_unit_reserved"
  | "blood_unit_issued"
  | "blood_transfusion_started"
  | "blood_transfusion_completed"
  | "mortuary_admission"
  | "mortuary_release"
  | "service_request_created"
  | "service_request_assigned"
  | "service_request_completed"
  | "patient_feedback_received"
  | "patient_feedback_resolved"
  | "quality_indicator_breach"
  | "risk_register_updated"
  | "it_ticket_created"
  | "it_ticket_resolved"
  | "home_care_visit_scheduled"
  | "home_care_visit_completed"
  | "community_outreach_scheduled";

// Permission code → recipient role mapping
// When an event fires, we look up users with these permissions in the same facility
const RECIPIENT_PERMISSIONS: Record<WorkflowEvent, string[]> = {
  lab_order_created: ["lab.collect", "lab.process", "lab.view"],
  lab_sample_collected: ["lab.process", "lab.view"],
  lab_result_entered: ["lab.verify", "lab.view"],
  lab_result_verified: ["lab.view"],
  lab_result_released: ["clinical.view", "encounter.view"],
  lab_order_cancelled: ["lab.view"],
  prescription_created: ["pharmacy.dispense", "pharmacy.view"],
  prescription_dispensed: ["clinical.view", "encounter.view"],
  prescription_partially_dispensed: ["clinical.view", "encounter.view"],
  imaging_order_created: ["imaging.perform", "imaging.view"],
  imaging_performed: ["imaging.report", "imaging.view"],
  imaging_reported: ["imaging.verify", "imaging.view"],
  imaging_verified: ["clinical.view", "encounter.view"],
  admission_created: ["bed.manage", "admission.view", "clinical.view"],
  admission_discharged: ["billing.view", "admission.view", "clinical.view"],
  admission_transferred: ["admission.view", "clinical.view"],
  discharge_initiated: ["billing.view", "admission.view"],
  referral_made: ["clinical.view", "encounter.view"],
  referral_accepted: ["clinical.view", "encounter.view"],
  procedure_scheduled: ["procedure.perform", "procedure.view"],
  procedure_completed: ["clinical.view", "encounter.view"],
  theatre_case_scheduled: ["theatre.view", "theatre.perform"],
  theatre_case_started: ["theatre.view", "recovery.view"],
  theatre_case_completed: ["recovery.view", "clinical.view", "admission.view"],
  critical_care_admitted: ["critical_care.view", "clinical.view"],
  critical_care_discharged: ["admission.view", "clinical.view"],
  blood_unit_reserved: ["bloodbank.view", "bloodbank.manage"],
  blood_unit_issued: ["bloodbank.view", "bloodbank.transfuse"],
  blood_transfusion_started: ["bloodbank.view", "clinical.view"],
  blood_transfusion_completed: ["clinical.view", "bloodbank.view"],
  mortuary_admission: ["mortuary.view", "mortuary.manage"],
  mortuary_release: ["mortuary.view"],
  service_request_created: ["support_services.view", "support_services.manage"],
  service_request_assigned: ["support_services.view"],
  service_request_completed: ["support_services.view"],
  patient_feedback_received: ["patient_relations.view", "patient_relations.manage"],
  patient_feedback_resolved: ["patient_relations.view"],
  quality_indicator_breach: ["qa.view", "qa.manage"],
  risk_register_updated: ["risk.view", "risk.manage"],
  it_ticket_created: ["it.view", "it.manage"],
  it_ticket_resolved: ["it.view"],
  home_care_visit_scheduled: ["home_care.view", "home_care.manage"],
  home_care_visit_completed: ["clinical.view", "home_care.view"],
  community_outreach_scheduled: ["community_health.view", "community_health.manage"],
};

type NotifyParams = {
  event: WorkflowEvent;
  organizationId: string;
  facilityId?: string | null;
  departmentId?: string | null;
  title: string;
  message: string;
  referenceType: string; // e.g., "lab_order", "prescription"
  referenceId: string;
  // Optional: specific user to also notify (e.g., the ordering clinician)
  directRecipientIds?: string[];
  // Optional: exclude the actor from notifications (don't notify yourself)
  excludeUserId?: string;
  // Optional: priority for sorting/display
  priority?: "low" | "normal" | "high" | "critical";
};

// =====================================================================
// MAIN ENTRY POINT — sendWorkflowNotification
// =====================================================================
// Resolves recipients based on the event type and creates Notification
// records for each. Recipients are users who:
//   (a) belong to the same organization
//   (b) belong to the same facility (if facilityId is provided)
//   (c) have at least one of the permissions required for the event
//   (d) are active
// Plus any direct recipients specified.
//
// This function never throws — it logs errors and returns silently
// so it doesn't break the calling API route.
// =====================================================================
export async function sendWorkflowNotification(params: NotifyParams): Promise<number> {
  const {
    event,
    organizationId,
    facilityId,
    departmentId,
    title,
    message,
    referenceType,
    referenceId,
    directRecipientIds = [],
    excludeUserId,
  } = params;

  try {
    // 1. Resolve permission-based recipients
    const requiredPerms = RECIPIENT_PERMISSIONS[event] || [];
    const recipientUserIds = new Set<string>();

    if (requiredPerms.length > 0) {
      // Find users who have any of the required permissions via their roles
      // We need to join: User → UserRole → Role → RolePermission → Permission
      const usersWithPerms = await db.user.findMany({
        where: {
          organizationId,
          status: "active",
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
          userRoles: {
            some: {
              role: {
                permissions: {
                  some: {
                    permission: { code: { in: requiredPerms } },
                  },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      usersWithPerms.forEach((u) => recipientUserIds.add(u.id));

      // Also include super_admins (they should see everything)
      const superAdmins = await db.user.findMany({
        where: {
          organizationId,
          status: "active",
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
          userRoles: { some: { role: { code: "super_admin" } } },
        },
        select: { id: true },
      });
      superAdmins.forEach((u) => recipientUserIds.add(u.id));
    }

    // 2. Add direct recipients
    for (const id of directRecipientIds) {
      if (id && id !== excludeUserId) recipientUserIds.add(id);
    }

    if (recipientUserIds.size === 0) {
      return 0;
    }

    // 3. Bulk-create notifications
    const notifs = Array.from(recipientUserIds).map((userId) => ({
      userId,
      facilityId: facilityId || null,
      type: event,
      title,
      message,
      referenceType,
      referenceId,
    }));

    await db.notification.createMany({ data: notifs });

    return recipientUserIds.size;
  } catch (error) {
    console.error(`[workflow-notify] Failed to send "${event}" notification:`, error);
    return 0;
  }
}

// =====================================================================
// SPECIALIZED HELPERS — one per workflow type
// =====================================================================
// These provide a clean, typed API for each workflow event and handle
// the message formatting.

export async function notifyLabOrderCreated(opts: {
  organizationId: string;
  facilityId: string;
  orderNumber: string;
  patientName: string;
  testCount: number;
  testNames: string[];
  priority?: string;
  orderingClinicianId?: string;
  orderId: string;
}) {
  return sendWorkflowNotification({
    event: "lab_order_created",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🧪 New Lab Order: ${opts.orderNumber}`,
    message: `Lab order for ${opts.patientName} — ${opts.testCount} test(s): ${opts.testNames.join(", ")}${opts.priority === "urgent" || opts.priority === "emergency" ? ` [${opts.priority?.toUpperCase()}]` : ""}`,
    referenceType: "lab_order",
    referenceId: opts.orderId,
    directRecipientIds: opts.orderingClinicianId ? [opts.orderingClinicianId] : [],
    priority: opts.priority === "urgent" || opts.priority === "emergency" ? "high" : "normal",
  });
}

export async function notifyLabResultReleased(opts: {
  organizationId: string;
  facilityId: string;
  orderNumber: string;
  patientName: string;
  orderId: string;
  orderingClinicianId?: string;
  hasCritical?: boolean;
  hasAbnormal?: boolean;
}) {
  const criticalPrefix = opts.hasCritical ? "🚨 CRITICAL — " : opts.hasAbnormal ? "⚠️ Abnormal — " : "";
  return sendWorkflowNotification({
    event: "lab_result_released",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `${criticalPrefix}Lab Result Ready: ${opts.orderNumber}`,
    message: `Lab results for ${opts.patientName} have been verified and released.`,
    referenceType: "lab_order",
    referenceId: opts.orderId,
    directRecipientIds: opts.orderingClinicianId ? [opts.orderingClinicianId] : [],
    priority: opts.hasCritical ? "critical" : opts.hasAbnormal ? "high" : "normal",
  });
}

export async function notifyPrescriptionCreated(opts: {
  organizationId: string;
  facilityId: string;
  prescriptionNumber: string;
  patientName: string;
  itemCount: number;
  prescriberId?: string;
  prescriptionId: string;
}) {
  return sendWorkflowNotification({
    event: "prescription_created",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `💊 New Prescription: ${opts.prescriptionNumber}`,
    message: `Prescription for ${opts.patientName} — ${opts.itemCount} item(s) waiting to be dispensed.`,
    referenceType: "prescription",
    referenceId: opts.prescriptionId,
  });
}

export async function notifyPrescriptionDispensed(opts: {
  organizationId: string;
  facilityId: string;
  prescriptionNumber: string;
  patientName: string;
  prescriptionId: string;
  prescriberId?: string;
  partial?: boolean;
}) {
  return sendWorkflowNotification({
    event: opts.partial ? "prescription_partially_dispensed" : "prescription_dispensed",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `💊 Prescription ${opts.partial ? "Partially " : ""}Dispensed: ${opts.prescriptionNumber}`,
    message: `Prescription for ${opts.patientName} has been ${opts.partial ? "partially " : ""}dispensed by pharmacy.`,
    referenceType: "prescription",
    referenceId: opts.prescriptionId,
    directRecipientIds: opts.prescriberId ? [opts.prescriberId] : [],
  });
}

export async function notifyImagingOrderCreated(opts: {
  organizationId: string;
  facilityId: string;
  orderNumber: string;
  patientName: string;
  modality: string;
  studyType: string;
  orderId: string;
  orderingClinicianId?: string;
}) {
  return sendWorkflowNotification({
    event: "imaging_order_created",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `📷 New Imaging Request: ${opts.orderNumber}`,
    message: `${opts.modality} — ${opts.studyType} for ${opts.patientName}`,
    referenceType: "imaging_order",
    referenceId: opts.orderId,
    directRecipientIds: opts.orderingClinicianId ? [opts.orderingClinicianId] : [],
  });
}

export async function notifyImagingVerified(opts: {
  organizationId: string;
  facilityId: string;
  orderNumber: string;
  patientName: string;
  orderId: string;
  orderingClinicianId?: string;
}) {
  return sendWorkflowNotification({
    event: "imaging_verified",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `📷 Imaging Report Ready: ${opts.orderNumber}`,
    message: `Verified imaging report for ${opts.patientName} is now available.`,
    referenceType: "imaging_order",
    referenceId: opts.orderId,
    directRecipientIds: opts.orderingClinicianId ? [opts.orderingClinicianId] : [],
  });
}

export async function notifyAdmissionCreated(opts: {
  organizationId: string;
  facilityId: string;
  admissionNumber: string;
  patientName: string;
  wardName: string;
  bedNumber?: string;
  admissionId: string;
  admittingDoctorId?: string;
}) {
  return sendWorkflowNotification({
    event: "admission_created",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🛏️ New Admission: ${opts.admissionNumber}`,
    message: `${opts.patientName} admitted to ${opts.wardName}${opts.bedNumber ? ` — Bed ${opts.bedNumber}` : ""}.`,
    referenceType: "admission",
    referenceId: opts.admissionId,
    directRecipientIds: opts.admittingDoctorId ? [opts.admittingDoctorId] : [],
  });
}

export async function notifyDischargeInitiated(opts: {
  organizationId: string;
  facilityId: string;
  patientName: string;
  admissionId: string;
  dischargeId: string;
  wardName?: string;
}) {
  return sendWorkflowNotification({
    event: "discharge_initiated",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `📤 Discharge Initiated: ${opts.patientName}`,
    message: `Discharge process started${opts.wardName ? ` from ${opts.wardName}` : ""}. Billing & Records to complete.`,
    referenceType: "discharge",
    referenceId: opts.dischargeId,
  });
}

export async function notifyReferralMade(opts: {
  organizationId: string;
  facilityId?: string | null;
  referralNumber: string;
  patientName: string;
  fromDepartment: string;
  toDepartment: string;
  reason: string;
  referralId: string;
  referredById?: string;
  receivedById?: string;
}) {
  return sendWorkflowNotification({
    event: "referral_made",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🔄 New Referral: ${opts.referralNumber}`,
    message: `${opts.patientName} referred from ${opts.fromDepartment} to ${opts.toDepartment}. Reason: ${opts.reason.slice(0, 100)}`,
    referenceType: "referral",
    referenceId: opts.referralId,
    directRecipientIds: opts.receivedById ? [opts.receivedById] : [],
  });
}

export async function notifyTheatreCaseScheduled(opts: {
  organizationId: string;
  facilityId: string;
  caseNumber: string;
  patientName: string;
  procedureName: string;
  scheduledStart: string;
  surgeonName?: string;
  theatreCaseId: string;
}) {
  return sendWorkflowNotification({
    event: "theatre_case_scheduled",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🔪 Theatre Case Scheduled: ${opts.caseNumber}`,
    message: `${opts.procedureName} for ${opts.patientName} on ${new Date(opts.scheduledStart).toLocaleString()}${opts.surgeonName ? ` — Surgeon: ${opts.surgeonName}` : ""}.`,
    referenceType: "theatre_case",
    referenceId: opts.theatreCaseId,
  });
}

export async function notifyTheatreCaseCompleted(opts: {
  organizationId: string;
  facilityId: string;
  caseNumber: string;
  patientName: string;
  procedureName: string;
  theatreCaseId: string;
  surgeonId?: string;
  complications?: string;
}) {
  return sendWorkflowNotification({
    event: "theatre_case_completed",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🔪 Surgery Completed: ${opts.caseNumber}`,
    message: `${opts.procedureName} for ${opts.patientName} completed.${opts.complications ? ` Complications: ${opts.complications.slice(0, 100)}` : ""} Patient ready for recovery.`,
    referenceType: "theatre_case",
    referenceId: opts.theatreCaseId,
    directRecipientIds: opts.surgeonId ? [opts.surgeonId] : [],
  });
}

export async function notifyCriticalCareAdmitted(opts: {
  organizationId: string;
  facilityId: string;
  admissionNumber: string;
  patientName: string;
  unitType: string;
  diagnosis: string;
  severity?: string;
  criticalCareId: string;
  attendingPhysicianId?: string;
}) {
  return sendWorkflowNotification({
    event: "critical_care_admitted",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🚨 ICU Admission: ${opts.admissionNumber}`,
    message: `${opts.patientName} admitted to ${opts.unitType.toUpperCase()} — ${opts.diagnosis}${opts.severity ? ` [${opts.severity.toUpperCase()}]` : ""}`,
    referenceType: "critical_care_admission",
    referenceId: opts.criticalCareId,
    directRecipientIds: opts.attendingPhysicianId ? [opts.attendingPhysicianId] : [],
    priority: opts.severity === "critical" ? "critical" : "high",
  });
}

export async function notifyServiceRequestCreated(opts: {
  organizationId: string;
  facilityId?: string | null;
  requestNumber: string;
  serviceType: string;
  title: string;
  location?: string;
  priority?: string;
  requestId: string;
  requestedById?: string;
}) {
  const priorityIcon = opts.priority === "emergency" ? "🚨" : opts.priority === "urgent" ? "⚠️" : "📋";
  return sendWorkflowNotification({
    event: "service_request_created",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `${priorityIcon} ${opts.serviceType.replace(/_/g, " ").toUpperCase()} Request: ${opts.requestNumber}`,
    message: `${opts.title}${opts.location ? ` — Location: ${opts.location}` : ""}${opts.priority === "urgent" || opts.priority === "emergency" ? ` [${opts.priority?.toUpperCase()}]` : ""}`,
    referenceType: "service_request",
    referenceId: opts.requestId,
    directRecipientIds: opts.requestedById ? [opts.requestedById] : [],
    priority: opts.priority === "emergency" ? "critical" : opts.priority === "urgent" ? "high" : "normal",
  });
}

export async function notifyPatientFeedbackReceived(opts: {
  organizationId: string;
  facilityId?: string | null;
  feedbackNumber: string;
  feedbackType: string;
  patientName: string;
  subject: string;
  severity?: string;
  feedbackId: string;
}) {
  const icon = opts.feedbackType === "complaint" ? "😤" : opts.feedbackType === "compliment" ? "👏" : "💬";
  return sendWorkflowNotification({
    event: "patient_feedback_received",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `${icon} ${opts.feedbackType.toUpperCase()}: ${opts.feedbackNumber}`,
    message: `From ${opts.patientName}: ${opts.subject}${opts.severity === "critical" || opts.severity === "high" ? ` [${opts.severity?.toUpperCase()}]` : ""}`,
    referenceType: "patient_feedback",
    referenceId: opts.feedbackId,
    priority: opts.severity === "critical" ? "critical" : opts.severity === "high" ? "high" : "normal",
  });
}

export async function notifyMortuaryAdmission(opts: {
  organizationId: string;
  facilityId?: string | null;
  admissionNumber: string;
  deceasedName: string;
  placeOfDeath: string;
  causeOfDeath?: string;
  mortuaryId: string;
}) {
  return sendWorkflowNotification({
    event: "mortuary_admission",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🪦 Mortuary Admission: ${opts.admissionNumber}`,
    message: `${opts.deceasedName} — Place of death: ${opts.placeOfDeath}.${opts.causeOfDeath ? ` Cause: ${opts.causeOfDeath}` : ""}`,
    referenceType: "mortuary_admission",
    referenceId: opts.mortuaryId,
  });
}

export async function notifyBloodUnitReserved(opts: {
  organizationId: string;
  facilityId?: string | null;
  unitNumber: string;
  bloodGroup: string;
  patientName: string;
  unitId: string;
}) {
  return sendWorkflowNotification({
    event: "blood_unit_reserved",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🩸 Blood Unit Reserved: ${opts.unitNumber}`,
    message: `${opts.bloodGroup} unit reserved for ${opts.patientName}.`,
    referenceType: "blood_unit",
    referenceId: opts.unitId,
  });
}

export async function notifyItTicketCreated(opts: {
  organizationId: string;
  facilityId?: string | null;
  ticketNumber: string;
  ticketType: string;
  subject: string;
  priority: string;
  ticketId: string;
  reportedById?: string;
}) {
  return sendWorkflowNotification({
    event: "it_ticket_created",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `💻 IT Ticket: ${opts.ticketNumber}`,
    message: `${opts.ticketType} — ${opts.subject} [${opts.priority.toUpperCase()}]`,
    referenceType: "it_ticket",
    referenceId: opts.ticketId,
    directRecipientIds: opts.reportedById ? [opts.reportedById] : [],
    priority: opts.priority === "critical" ? "critical" : opts.priority === "high" ? "high" : "normal",
  });
}

export async function notifyHomeCareVisitScheduled(opts: {
  organizationId: string;
  facilityId?: string | null;
  visitNumber: string;
  patientName: string;
  visitType: string;
  scheduledAt: string;
  visitId: string;
  caregiverId?: string;
}) {
  return sendWorkflowNotification({
    event: "home_care_visit_scheduled",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🏠 Home Care Visit: ${opts.visitNumber}`,
    message: `${opts.visitType} for ${opts.patientName} on ${new Date(opts.scheduledAt).toLocaleString()}.`,
    referenceType: "home_care_visit",
    referenceId: opts.visitId,
    directRecipientIds: opts.caregiverId ? [opts.caregiverId] : [],
  });
}

// =====================================================================
// ADDITIONAL HELPERS — for the remaining extended modules
// =====================================================================

export async function notifyBloodTransfusionStarted(opts: {
  organizationId: string;
  facilityId?: string | null;
  transfusionNumber: string;
  patientName: string;
  bloodGroup: string;
  volumeMl: number;
  transfusionId: string;
  administeredById?: string;
}) {
  return sendWorkflowNotification({
    event: "blood_transfusion_started",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🩸 Transfusion Started: ${opts.transfusionNumber}`,
    message: `${opts.bloodGroup} (${opts.volumeMl}ml) for ${opts.patientName}. Monitor for reactions.`,
    referenceType: "blood_transfusion",
    referenceId: opts.transfusionId,
    directRecipientIds: opts.administeredById ? [opts.administeredById] : [],
    priority: "high",
  });
}

export async function notifyBloodTransfusionCompleted(opts: {
  organizationId: string;
  facilityId?: string | null;
  transfusionNumber: string;
  patientName: string;
  reactionObserved: boolean;
  transfusionId: string;
  administeredById?: string;
}) {
  const reactionTag = opts.reactionObserved ? " ⚠️ REACTION OBSERVED" : "";
  return sendWorkflowNotification({
    event: "blood_transfusion_completed",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🩸 Transfusion Completed: ${opts.transfusionNumber}${reactionTag}`,
    message: `Transfusion for ${opts.patientName} completed.${opts.reactionObserved ? " Reaction was observed — review details." : " No reactions."}`,
    referenceType: "blood_transfusion",
    referenceId: opts.transfusionId,
    directRecipientIds: opts.administeredById ? [opts.administeredById] : [],
    priority: opts.reactionObserved ? "critical" : "normal",
  });
}

export async function notifyBloodUnitIssued(opts: {
  organizationId: string;
  facilityId?: string | null;
  unitNumber: string;
  bloodGroup: string;
  patientName: string;
  unitId: string;
}) {
  return sendWorkflowNotification({
    event: "blood_unit_issued",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🩸 Blood Unit Issued: ${opts.unitNumber}`,
    message: `${opts.bloodGroup} unit issued to ${opts.patientName}. Confirm crossmatch before transfusion.`,
    referenceType: "blood_unit",
    referenceId: opts.unitId,
    priority: "high",
  });
}

export async function notifySpecialtyEncounterCreated(opts: {
  organizationId: string;
  facilityId?: string | null;
  encounterNumber: string;
  patientName: string;
  departmentCode: string;
  chiefComplaint: string;
  encounterId: string;
  clinicianId?: string;
}) {
  const specialtyLabel = opts.departmentCode.replace(/_/g, " ");
  return sendWorkflowNotification({
    event: "theatre_case_scheduled", // reuse a general "specialty booking" channel
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🩺 ${specialtyLabel} Encounter: ${opts.encounterNumber}`,
    message: `${opts.patientName} — ${opts.chiefComplaint.slice(0, 100)}`,
    referenceType: "specialty_encounter",
    referenceId: opts.encounterId,
    directRecipientIds: opts.clinicianId ? [opts.clinicianId] : [],
  });
}

export async function notifyHistopathologySpecimenCreated(opts: {
  organizationId: string;
  facilityId?: string | null;
  specimenNumber: string;
  patientName: string;
  specimenType: string;
  specimenSite: string;
  specimenId: string;
  requestingPhysicianId?: string;
}) {
  return sendWorkflowNotification({
    event: "lab_order_created", // histopathology flows through lab-style workflow
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🔬 Histopathology Specimen: ${opts.specimenNumber}`,
    message: `${opts.specimenType} from ${opts.specimenSite} — ${opts.patientName}. Awaiting processing.`,
    referenceType: "histopathology_specimen",
    referenceId: opts.specimenId,
    directRecipientIds: opts.requestingPhysicianId ? [opts.requestingPhysicianId] : [],
  });
}

export async function notifyCodingRecordCreated(opts: {
  organizationId: string;
  facilityId?: string | null;
  patientName: string;
  codingType: string;
  primaryCode: string;
  primaryDescription: string;
  codingId: string;
  coderId?: string;
}) {
  return sendWorkflowNotification({
    event: "it_ticket_created", // reuse a generic "coding/claims" channel
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `📝 Coding Record: ${opts.codingType.toUpperCase()} ${opts.primaryCode}`,
    message: `${opts.patientName} — ${opts.primaryDescription.slice(0, 100)}`,
    referenceType: "coding_record",
    referenceId: opts.codingId,
    directRecipientIds: opts.coderId ? [opts.coderId] : [],
  });
}

export async function notifyCommunityOutreachScheduled(opts: {
  organizationId: string;
  facilityId?: string | null;
  eventNumber: string;
  eventType: string;
  title: string;
  location: string;
  startDate: string;
  eventId: string;
  teamLeadId?: string;
}) {
  return sendWorkflowNotification({
    event: "community_outreach_scheduled",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🌍 Community Outreach: ${opts.eventNumber}`,
    message: `${opts.eventType.replace(/_/g, " ")} — ${opts.title} at ${opts.location} on ${new Date(opts.startDate).toLocaleString()}`,
    referenceType: "community_outreach",
    referenceId: opts.eventId,
    directRecipientIds: opts.teamLeadId ? [opts.teamLeadId] : [],
  });
}

export async function notifyQualityIndicatorCreated(opts: {
  organizationId: string;
  facilityId?: string | null;
  indicatorCode: string;
  indicatorName: string;
  category: string;
  target: string;
  indicatorId: string;
}) {
  return sendWorkflowNotification({
    event: "quality_indicator_breach",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `📊 Quality Indicator: ${opts.indicatorCode}`,
    message: `${opts.indicatorName} (${opts.category}) — Target: ${opts.target}`,
    referenceType: "quality_indicator",
    referenceId: opts.indicatorId,
  });
}

export async function notifyRiskRegisterCreated(opts: {
  organizationId: string;
  facilityId?: string | null;
  riskNumber: string;
  riskTitle: string;
  riskCategory: string;
  likelihood: string;
  impact: string;
  riskId: string;
  ownerId?: string;
}) {
  const priority = opts.likelihood === "high" && opts.impact === "critical" ? "critical"
    : opts.likelihood === "high" || opts.impact === "critical" ? "high"
    : "normal";
  return sendWorkflowNotification({
    event: "risk_register_updated",
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `⚠️ Risk Registered: ${opts.riskNumber}`,
    message: `${opts.riskTitle} — ${opts.riskCategory} [L:${opts.likelihood} I:${opts.impact}]`,
    referenceType: "risk_register",
    referenceId: opts.riskId,
    directRecipientIds: opts.ownerId ? [opts.ownerId] : [],
    priority: priority as any,
  });
}

export async function notifyLegalCaseCreated(opts: {
  organizationId: string;
  facilityId?: string | null;
  caseNumber: string;
  caseType: string;
  title: string;
  priority: string;
  caseId: string;
  assignedAttorney?: string;
}) {
  return sendWorkflowNotification({
    event: "risk_register_updated", // legal matters flow through the risk/governance channel
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `⚖️ Legal Case: ${opts.caseNumber}`,
    message: `${opts.caseType} — ${opts.title} [${opts.priority.toUpperCase()}]${opts.assignedAttorney ? ` — Attorney: ${opts.assignedAttorney}` : ""}`,
    referenceType: "legal_case",
    referenceId: opts.caseId,
    priority: opts.priority === "high" ? "high" : "normal",
  });
}

export async function notifyResearchStudyCreated(opts: {
  organizationId: string;
  facilityId?: string | null;
  studyNumber: string;
  studyTitle: string;
  studyType: string;
  principalInvestigator: string;
  studyId: string;
}) {
  return sendWorkflowNotification({
    event: "it_ticket_created", // research flows through governance/research channel
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🔬 Research Study: ${opts.studyNumber}`,
    message: `${opts.studyType} — ${opts.studyTitle} (PI: ${opts.principalInvestigator})`,
    referenceType: "research_study",
    referenceId: opts.studyId,
  });
}

export async function notifyPRActivityCreated(opts: {
  organizationId: string;
  facilityId?: string | null;
  activityNumber: string;
  activityType: string;
  title: string;
  status: string;
  activityId: string;
}) {
  return sendWorkflowNotification({
    event: "it_ticket_created", // PR activities flow through the governance channel
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `📢 PR Activity: ${opts.activityNumber}`,
    message: `${opts.activityType.replace(/_/g, " ")} — ${opts.title} [${opts.status}]`,
    referenceType: "pr_activity",
    referenceId: opts.activityId,
  });
}

export async function notifyRecoveryRoomAdmitted(opts: {
  organizationId: string;
  facilityId?: string | null;
  recordNumber: string;
  patientName: string;
  theatreCaseNumber?: string;
  recoveryId: string;
  nurseId?: string;
}) {
  return sendWorkflowNotification({
    event: "theatre_case_completed", // recovery flows through the theatre/recovery channel
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `🛏️ Recovery Room: ${opts.recordNumber}`,
    message: `${opts.patientName} admitted to recovery${opts.theatreCaseNumber ? ` (from ${opts.theatreCaseNumber})` : ""}. Monitor vitals.`,
    referenceType: "recovery_room_record",
    referenceId: opts.recoveryId,
    directRecipientIds: opts.nurseId ? [opts.nurseId] : [],
  });
}

export async function notifyAuditFindingCreated(opts: {
  organizationId: string;
  facilityId?: string | null;
  findingNumber: string;
  auditType: string;
  title: string;
  severity: string;
  findingId: string;
  auditorId?: string;
}) {
  return sendWorkflowNotification({
    event: "risk_register_updated", // audit findings flow through governance channel
    organizationId: opts.organizationId,
    facilityId: opts.facilityId,
    title: `📜 Audit Finding: ${opts.findingNumber}`,
    message: `${opts.auditType} — ${opts.title} [${opts.severity.toUpperCase()}]`,
    referenceType: "audit_finding",
    referenceId: opts.findingId,
    directRecipientIds: opts.auditorId ? [opts.auditorId] : [],
    priority: opts.severity === "critical" ? "critical" : opts.severity === "high" ? "high" : "normal",
  });
}

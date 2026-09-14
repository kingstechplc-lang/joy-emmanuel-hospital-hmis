// =====================================================================
// CENTRALIZED AUDIT ACTION CONSTANTS
// =====================================================================
// Use these constants everywhere instead of string literals so that:
//   1. Action names are consistent and typo-proof
//   2. The audit-log viewer can group by category / severity
//   3. Future renames are a single-file change
//
// Every auditLog() call SHOULD pass an `actionCategory`, `severity`, and
// `source` for the new columns. Existing calls without these will default
// to NULL in the DB (backward-compatible) but new code should always
// include them.
// =====================================================================

export const AUDIT_CATEGORIES = {
  AUTH: "AUTH",
  PATIENT: "PATIENT",
  CLINICAL: "CLINICAL",
  ENCOUNTER: "ENCOUNTER",
  PHARMACY: "PHARMACY",
  LAB: "LAB",
  IMAGING: "IMAGING",
  BILLING: "BILLING",
  INSURANCE: "INSURANCE",
  USERS: "USERS",
  ROLES: "ROLES",
  FACILITY: "FACILITY",
  STAFF: "STAFF",
  INVENTORY: "INVENTORY",
  DOCUMENTS: "DOCUMENTS",
  ADMIN: "ADMIN",
  SECURITY: "SECURITY",
  DATA_EXPORT: "DATA_EXPORT",
  SETTINGS: "SETTINGS",
  CLINICAL_TEMPLATES: "CLINICAL_TEMPLATES",
  CDSS: "CDSS",
} as const;

export const AUDIT_SEVERITY = {
  INFO: "info", // routine operations: view, list, search
  NOTICE: "notice", // state changes: create, update, status transition
  WARNING: "warning", // policy-impacting: cancel, refund, disable, role change
  CRITICAL: "critical", // security events: login failure, lockout, permission grant, break-glass, delete
} as const;

export type AuditSeverity = typeof AUDIT_SEVERITY[keyof typeof AUDIT_SEVERITY];

/**
 * Canonical audit action codes. Each entry maps the action string to its
 * category + default severity + suggested source module. Pass the whole
 * object to auditLog() / auditLogRequest() for auto-population:
 *
 *   await auditLogRequest(req, {
 *     session,
 *     ...AUDIT_ACTIONS.PATIENT_ALLERGY_CHANGED,
 *     resourceType: "patient",
 *     resourceId: patient.id,
 *     oldValues: { allergies: "None" },
 *     newValues: { allergies: "Penicillin" },
 *     reason: "Patient self-reported new allergy",
 *   });
 */
export const AUDIT_ACTIONS = {
  // ---- AUTH & SECURITY ----
  LOGIN_SUCCESS: {
    action: "LOGIN_SUCCESS",
    actionCategory: AUDIT_CATEGORIES.AUTH,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "auth",
  },
  LOGIN_FAILED: {
    action: "LOGIN_FAILED",
    actionCategory: AUDIT_CATEGORIES.AUTH,
    severity: AUDIT_SEVERITY.WARNING,
    source: "auth",
  },
  LOGIN_LOCKED: {
    action: "LOGIN_LOCKED",
    actionCategory: AUDIT_CATEGORIES.AUTH,
    severity: AUDIT_SEVERITY.CRITICAL,
    source: "auth",
  },
  LOGOUT: {
    action: "LOGOUT",
    actionCategory: AUDIT_CATEGORIES.AUTH,
    severity: AUDIT_SEVERITY.INFO,
    source: "auth",
  },
  PASSWORD_CHANGED: {
    action: "PASSWORD_CHANGED",
    actionCategory: AUDIT_CATEGORIES.AUTH,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "auth",
  },
  PASSWORD_RESET: {
    action: "PASSWORD_RESET",
    actionCategory: AUDIT_CATEGORIES.AUTH,
    severity: AUDIT_SEVERITY.WARNING,
    source: "auth",
  },
  SESSION_EXPIRED: {
    action: "SESSION_EXPIRED",
    actionCategory: AUDIT_CATEGORIES.AUTH,
    severity: AUDIT_SEVERITY.INFO,
    source: "auth",
  },
  BREAK_GLASS: {
    action: "BREAK_GLASS",
    actionCategory: AUDIT_CATEGORIES.SECURITY,
    severity: AUDIT_SEVERITY.CRITICAL,
    source: "clinical",
  },

  // ---- PATIENT ----
  PATIENT_VIEWED: {
    action: "PATIENT_VIEWED",
    actionCategory: AUDIT_CATEGORIES.PATIENT,
    severity: AUDIT_SEVERITY.INFO,
    source: "patient",
  },
  PATIENT_CREATED: {
    action: "PATIENT_CREATED",
    actionCategory: AUDIT_CATEGORIES.PATIENT,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "patient",
  },
  PATIENT_UPDATED: {
    action: "PATIENT_UPDATED",
    actionCategory: AUDIT_CATEGORIES.PATIENT,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "patient",
  },
  PATIENT_ALLERGY_CHANGED: {
    action: "PATIENT_ALLERGY_CHANGED",
    actionCategory: AUDIT_CATEGORIES.PATIENT,
    severity: AUDIT_SEVERITY.WARNING,
    source: "clinical",
  },
  PATIENT_DELETED: {
    action: "PATIENT_DELETED",
    actionCategory: AUDIT_CATEGORIES.PATIENT,
    severity: AUDIT_SEVERITY.CRITICAL,
    source: "patient",
  },

  // ---- CLINICAL ----
  ENCOUNTER_CREATED: {
    action: "ENCOUNTER_CREATED",
    actionCategory: AUDIT_CATEGORIES.ENCOUNTER,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "clinical",
  },
  ENCOUNTER_UPDATED: {
    action: "ENCOUNTER_UPDATED",
    actionCategory: AUDIT_CATEGORIES.ENCOUNTER,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "clinical",
  },
  ENCOUNTER_DISCHARGED: {
    action: "ENCOUNTER_DISCHARGED",
    actionCategory: AUDIT_CATEGORIES.ENCOUNTER,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "clinical",
  },
  CONSULTATION_CREATED: {
    action: "CONSULTATION_CREATED",
    actionCategory: AUDIT_CATEGORIES.CLINICAL,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "clinical",
  },
  DIAGNOSIS_ADDED: {
    action: "DIAGNOSIS_ADDED",
    actionCategory: AUDIT_CATEGORIES.CLINICAL,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "clinical",
  },

  // ---- PHARMACY ----
  PRESCRIPTION_CREATED: {
    action: "PRESCRIPTION_CREATED",
    actionCategory: AUDIT_CATEGORIES.PHARMACY,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "pharmacy",
  },
  PRESCRIPTION_APPROVED: {
    action: "PRESCRIPTION_APPROVED",
    actionCategory: AUDIT_CATEGORIES.PHARMACY,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "pharmacy",
  },
  PRESCRIPTION_DISPENSED: {
    action: "PRESCRIPTION_DISPENSED",
    actionCategory: AUDIT_CATEGORIES.PHARMACY,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "pharmacy",
  },
  PRESCRIPTION_CANCELLED: {
    action: "PRESCRIPTION_CANCELLED",
    actionCategory: AUDIT_CATEGORIES.PHARMACY,
    severity: AUDIT_SEVERITY.WARNING,
    source: "pharmacy",
  },

  // ---- LAB ----
  LAB_ORDER_CREATED: {
    action: "LAB_ORDER_CREATED",
    actionCategory: AUDIT_CATEGORIES.LAB,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "lab",
  },
  LAB_RESULT_ENTERED: {
    action: "LAB_RESULT_ENTERED",
    actionCategory: AUDIT_CATEGORIES.LAB,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "lab",
  },
  LAB_RESULT_BULK_ENTRY: {
    action: "LAB_RESULT_BULK_ENTRY",
    actionCategory: AUDIT_CATEGORIES.LAB,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "lab",
  },

  // ---- IMAGING ----
  IMAGING_ORDER_CREATED: {
    action: "IMAGING_ORDER_CREATED",
    actionCategory: AUDIT_CATEGORIES.IMAGING,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "imaging",
  },
  IMAGING_RESULT_UPLOADED: {
    action: "IMAGING_RESULT_UPLOADED",
    actionCategory: AUDIT_CATEGORIES.IMAGING,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "imaging",
  },

  // ---- BILLING ----
  INVOICE_CREATED: {
    action: "INVOICE_CREATED",
    actionCategory: AUDIT_CATEGORIES.BILLING,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "billing",
  },
  INVOICE_UPDATED: {
    action: "INVOICE_UPDATED",
    actionCategory: AUDIT_CATEGORIES.BILLING,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "billing",
  },
  INVOICE_CANCELLED: {
    action: "INVOICE_CANCELLED",
    actionCategory: AUDIT_CATEGORIES.BILLING,
    severity: AUDIT_SEVERITY.WARNING,
    source: "billing",
  },
  PAYMENT_RECEIVED: {
    action: "PAYMENT_RECEIVED",
    actionCategory: AUDIT_CATEGORIES.BILLING,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "billing",
  },
  REFUND_ISSUED: {
    action: "REFUND_ISSUED",
    actionCategory: AUDIT_CATEGORIES.BILLING,
    severity: AUDIT_SEVERITY.WARNING,
    source: "billing",
  },

  // ---- USERS, ROLES, PERMISSIONS ----
  USER_CREATED: {
    action: "USER_CREATED",
    actionCategory: AUDIT_CATEGORIES.USERS,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "admin",
  },
  USER_UPDATED: {
    action: "USER_UPDATED",
    actionCategory: AUDIT_CATEGORIES.USERS,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "admin",
  },
  USER_VIEWED: {
    action: "USER_VIEWED",
    actionCategory: AUDIT_CATEGORIES.USERS,
    severity: AUDIT_SEVERITY.INFO,
    source: "admin",
  },
  USER_DISABLED: {
    action: "USER_DISABLED",
    actionCategory: AUDIT_CATEGORIES.USERS,
    severity: AUDIT_SEVERITY.WARNING,
    source: "admin",
  },
  USER_ENABLED: {
    action: "USER_ENABLED",
    actionCategory: AUDIT_CATEGORIES.USERS,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "admin",
  },
  USER_UNLOCKED: {
    action: "USER_UNLOCKED",
    actionCategory: AUDIT_CATEGORIES.USERS,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "admin",
  },
  USER_DELETED: {
    action: "USER_DELETED",
    actionCategory: AUDIT_CATEGORIES.USERS,
    severity: AUDIT_SEVERITY.CRITICAL,
    source: "admin",
  },
  ROLE_ASSIGNED: {
    action: "ROLE_ASSIGNED",
    actionCategory: AUDIT_CATEGORIES.ROLES,
    severity: AUDIT_SEVERITY.CRITICAL,
    source: "admin",
  },
  ROLE_REMOVED: {
    action: "ROLE_REMOVED",
    actionCategory: AUDIT_CATEGORIES.ROLES,
    severity: AUDIT_SEVERITY.WARNING,
    source: "admin",
  },
  PERMISSION_GRANTED: {
    action: "PERMISSION_GRANTED",
    actionCategory: AUDIT_CATEGORIES.ROLES,
    severity: AUDIT_SEVERITY.CRITICAL,
    source: "admin",
  },
  PERMISSION_REVOKED: {
    action: "PERMISSION_REVOKED",
    actionCategory: AUDIT_CATEGORIES.ROLES,
    severity: AUDIT_SEVERITY.WARNING,
    source: "admin",
  },

  // ---- DATA EXPORT (PII/financial exfiltration visibility) ----
  DATA_EXPORTED: {
    action: "DATA_EXPORTED",
    actionCategory: AUDIT_CATEGORIES.DATA_EXPORT,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "export",
  },

  // ---- SETTINGS & ADMIN ----
  SETTINGS_UPDATED: {
    action: "SETTINGS_UPDATED",
    actionCategory: AUDIT_CATEGORIES.SETTINGS,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "admin",
  },
  CLINICAL_TEMPLATE_APPLIED: {
    action: "CLINICAL_TEMPLATE_APPLIED",
    actionCategory: AUDIT_CATEGORIES.CLINICAL_TEMPLATES,
    severity: AUDIT_SEVERITY.NOTICE,
    source: "clinical_templates",
  },
  CDSS_ALERT_TRIGGERED: {
    action: "CDSS_ALERT_TRIGGERED",
    actionCategory: AUDIT_CATEGORIES.CDSS,
    severity: AUDIT_SEVERITY.WARNING,
    source: "cdss",
  },
} as const;

export type AuditActionCode = keyof typeof AUDIT_ACTIONS;
export type AuditActionSpec = (typeof AUDIT_ACTIONS)[AuditActionCode];

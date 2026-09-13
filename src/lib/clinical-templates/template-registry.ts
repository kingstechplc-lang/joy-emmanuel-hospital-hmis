// =====================================================================
// CLINICAL TEMPLATE REGISTRY — Phase 6
// =====================================================================
// Single source of truth for clinical template types, lifecycle states,
// scopes, and validation. Used by both the API and the admin UI.
//
// TEMPLATE TYPES (what kind of template this is):
//   consultation  — pre-fills the consultation structure (HPI, PE, etc.)
//   order_set     — bundles lab + imaging + Rx + procedure + services
//   lab           — lab-only order set
//   imaging       — imaging-only order set
//   medication    — prescription-only template
//   procedure     — procedure-only template
//   care          — care plan / nursing-focused template
//
// LIFECYCLE STATES:
//   draft        — newly created, only visible to creator + admins
//   under_review — submitted for review (admin can approve)
//   approved     — approved but not yet activated (admin can activate)
//   active       — visible to all eligible users, can be applied
//   inactive     — paused (no new applications; existing ones preserved)
//   archived     — retired (hidden from the picker; history preserved)
//
// SCOPES (who can see the template):
//   system       — shared across all orgs (rarely used)
//   organization — org-wide (any user in the org can see + apply)
//   facility     — facility-wide (any user in the facility can see + apply)
//   department   — department-wide (any user in the dept can see + apply)
//   personal     — only the creator (private templates)
//
// SAFETY: Only 'active' templates can be applied. A template must be
// approved before it can be activated. This prevents unreviewed drafts
// from being used in clinical workflows.
// =====================================================================

// ─── Template Types ─────────────────────────────────────────────────

export type TemplateType =
  | "consultation"
  | "order_set"
  | "lab"
  | "imaging"
  | "medication"
  | "procedure"
  | "care";

export const TEMPLATE_TYPES: { value: TemplateType; label: string; description: string }[] = [
  {
    value: "consultation",
    label: "Consultation Template",
    description: "Pre-fills the consultation structure (chief complaint, HPI, PE, assessment, plan)",
  },
  {
    value: "order_set",
    label: "Order Set",
    description: "Bundles lab + imaging + Rx + procedure + service orders",
  },
  {
    value: "lab",
    label: "Lab Order Set",
    description: "Lab-only order set (multiple lab tests bundled)",
  },
  {
    value: "imaging",
    label: "Imaging Order Set",
    description: "Imaging-only order set (multiple imaging studies bundled)",
  },
  {
    value: "medication",
    label: "Medication Template",
    description: "Prescription-only template (multiple medications bundled)",
  },
  {
    value: "procedure",
    label: "Procedure Template",
    description: "Procedure-only template (multiple procedures bundled)",
  },
  {
    value: "care",
    label: "Care Template",
    description: "Care plan / nursing-focused template (vitals, nursing tasks, care plans)",
  },
];

export const TEMPLATE_TYPE_BY_VALUE: Record<string, typeof TEMPLATE_TYPES[0]> = Object.fromEntries(
  TEMPLATE_TYPES.map((t) => [t.value, t])
);

// ─── Lifecycle States ───────────────────────────────────────────────

export type TemplateStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "active"
  | "inactive"
  | "archived";

export const TEMPLATE_STATUSES: { value: TemplateStatus; label: string; color: string }[] = [
  { value: "draft", label: "Draft", color: "slate" },
  { value: "under_review", label: "Under Review", color: "amber" },
  { value: "approved", label: "Approved", color: "blue" },
  { value: "active", label: "Active", color: "emerald" },
  { value: "inactive", label: "Inactive", color: "orange" },
  { value: "archived", label: "Archived", color: "rose" },
];

export const TEMPLATE_STATUS_BY_VALUE: Record<string, typeof TEMPLATE_STATUSES[0]> = Object.fromEntries(
  TEMPLATE_STATUSES.map((s) => [s.value, s])
);

/** Valid state transitions — enforces the lifecycle rules. */
export const VALID_TRANSITIONS: Record<TemplateStatus, TemplateStatus[]> = {
  draft: ["under_review", "archived"],
  under_review: ["approved", "draft", "archived"], // approved or sent back to draft
  approved: ["active", "archived"], // activate or archive
  active: ["inactive", "archived"], // pause or retire
  inactive: ["active", "archived"], // reactivate or retire
  archived: ["draft"], // un-archive to draft (rare)
};

export function isValidTransition(
  from: TemplateStatus,
  to: TemplateStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) || false;
}

// ─── Scopes ─────────────────────────────────────────────────────────

export type TemplateScope =
  | "system"
  | "organization"
  | "facility"
  | "department"
  | "personal";

export const TEMPLATE_SCOPES: { value: TemplateScope; label: string; description: string }[] = [
  {
    value: "system",
    label: "System",
    description: "Shared across all organizations (rarely used)",
  },
  {
    value: "organization",
    label: "Organization",
    description: "Any user in the organization can see and apply this template",
  },
  {
    value: "facility",
    label: "Facility",
    description: "Any user in the facility can see and apply this template",
  },
  {
    value: "department",
    label: "Department",
    description: "Any user in the department can see and apply this template",
  },
  {
    value: "personal",
    label: "Personal",
    description: "Only the creator can see and apply this template (private)",
  },
];

export const TEMPLATE_SCOPE_BY_VALUE: Record<string, typeof TEMPLATE_SCOPES[0]> = Object.fromEntries(
  TEMPLATE_SCOPES.map((s) => [s.value, s])
);

// ─── Version Status ─────────────────────────────────────────────────

export type VersionStatus = "draft" | "approved" | "active" | "archived";

export const VERSION_STATUSES: { value: VersionStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

// ─── Content Shape Validation ───────────────────────────────────────
//
// The template 'content' field is a JSON blob. This section defines the
// expected shape per template type and validates it before save.
// ────────────────────────────────────────────────────────────────────

/** Common item shapes inside the content JSON. */
export interface LabOrderItem {
  laboratoryTestId: string;
  priority?: string; // routine | urgent | stat
  clinicalNote?: string;
}
export interface ImagingOrderItem {
  procedureCatalogId: string;
  priority?: string;
  clinicalNote?: string;
}
export interface PrescriptionItem {
  medicationId: string;
  dosage: string;
  frequency: string;
  route?: string;
  duration?: string;
  quantity?: number;
  instructions?: string;
}
export interface ProcedureItem {
  procedureCatalogId: string;
  priority?: string;
  clinicalNote?: string;
}
export interface ServiceItem {
  serviceId: string;
  quantity?: number;
}
export interface DiagnosisSuggestion {
  diagnosisCatalogId: string;
  type: string; // primary | secondary | differential
}

/** Content shape for consultation templates. */
export interface ConsultationContent {
  chiefComplaint?: string;
  historyPresentingIllness?: string;
  pastMedicalHistory?: string;
  pastSurgicalHistory?: string;
  familyHistory?: string;
  socialHistory?: string;
  reviewOfSystems?: string;
  physicalExamination?: string;
  assessment?: string;
  treatmentPlan?: string;
  followUpPlan?: string;
  disposition?: string;
  patientInstructions?: string;
}

/** Content shape for order sets + lab/imaging/medication/procedure templates. */
export interface OrderSetContent {
  labOrders?: LabOrderItem[];
  imagingOrders?: ImagingOrderItem[];
  prescriptions?: PrescriptionItem[];
  procedures?: ProcedureItem[];
  services?: ServiceItem[];
  instructions?: string;
  diagnoses?: DiagnosisSuggestion[];
}

/** Content shape for care templates. */
export interface CareContent {
  carePlanGoals?: string;
  nursingTasks?: { description: string; frequency?: string }[];
  vitalsMonitoring?: { vitalType: string; frequency: string }[];
  patientEducation?: string;
  dischargeCriteria?: string;
}

/**
 * Validates the content JSON for a given template type.
 * Returns { valid: boolean, errors: string[] }.
 *
 * This is a LIGHTWEIGHT validation — it checks that required fields are
 * present and that array items have the expected keys. It does NOT
 * validate that the referenced IDs (laboratoryTestId, medicationId, etc.)
 * actually exist in the database — that's the /apply endpoint's job
 * (Phase 8), because the catalog may have changed between save and apply.
 */
export function validateTemplateContent(
  templateType: TemplateType,
  content: any
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!content || typeof content !== "object") {
    return { valid: false, errors: ["Content must be a JSON object"] };
  }

  switch (templateType) {
    case "consultation":
      // All fields optional for consultation templates (any subset is valid)
      // Just verify the content object has at least one field
      if (Object.keys(content).length === 0) {
        errors.push("Consultation template content cannot be empty");
      }
      break;

    case "order_set":
    case "lab":
    case "imaging":
    case "medication":
    case "procedure": {
      // Must have at least one order array
      const hasOrders =
        (content.labOrders && content.labOrders.length > 0) ||
        (content.imagingOrders && content.imagingOrders.length > 0) ||
        (content.prescriptions && content.prescriptions.length > 0) ||
        (content.procedures && content.procedures.length > 0) ||
        (content.services && content.services.length > 0);
      if (!hasOrders) {
        errors.push("Order set must contain at least one order item (lab, imaging, prescription, procedure, or service)");
      }
      // Validate lab order items
      if (Array.isArray(content.labOrders)) {
        content.labOrders.forEach((item: LabOrderItem, i: number) => {
          if (!item.laboratoryTestId) {
            errors.push(`labOrders[${i}].laboratoryTestId is required`);
          }
        });
      }
      // Validate imaging order items
      if (Array.isArray(content.imagingOrders)) {
        content.imagingOrders.forEach((item: ImagingOrderItem, i: number) => {
          if (!item.procedureCatalogId) {
            errors.push(`imagingOrders[${i}].procedureCatalogId is required`);
          }
        });
      }
      // Validate prescription items
      if (Array.isArray(content.prescriptions)) {
        content.prescriptions.forEach((item: PrescriptionItem, i: number) => {
          if (!item.medicationId) {
            errors.push(`prescriptions[${i}].medicationId is required`);
          }
          if (!item.dosage) {
            errors.push(`prescriptions[${i}].dosage is required`);
          }
          if (!item.frequency) {
            errors.push(`prescriptions[${i}].frequency is required`);
          }
        });
      }
      // Validate procedure items
      if (Array.isArray(content.procedures)) {
        content.procedures.forEach((item: ProcedureItem, i: number) => {
          if (!item.procedureCatalogId) {
            errors.push(`procedures[${i}].procedureCatalogId is required`);
          }
        });
      }
      // Validate service items
      if (Array.isArray(content.services)) {
        content.services.forEach((item: ServiceItem, i: number) => {
          if (!item.serviceId) {
            errors.push(`services[${i}].serviceId is required`);
          }
        });
      }
      break;
    }

    case "care": {
      // Must have at least one care element
      const hasCareElements =
        content.carePlanGoals ||
        (content.nursingTasks && content.nursingTasks.length > 0) ||
        (content.vitalsMonitoring && content.vitalsMonitoring.length > 0) ||
        content.patientEducation ||
        content.dischargeCriteria;
      if (!hasCareElements) {
        errors.push("Care template must contain at least one care element (goals, tasks, vitals, education, or discharge criteria)");
      }
      break;
    }

    default:
      errors.push(`Unknown template type: ${templateType}`);
  }

  return { valid: errors.length === 0, errors };
}

// ─── Template Visibility Filter ─────────────────────────────────────
//
// Given the user's session (organizationId, facilityId, departmentId, userId,
// and permissions), determine which templates they can see and apply.
//
// Visibility rules:
//   - super_admin: sees ALL templates in the org (any scope, any status)
//   - org_admin / facility_admin: sees all non-archived templates in scope
//   - other users: sees templates where:
//       scope="system" OR
//       scope="organization" AND organizationId matches OR
//       scope="facility" AND facilityId matches OR
//       scope="department" AND departmentId matches OR
//       scope="personal" AND creatorId matches the user
//     AND status="active" (non-admins only see active templates)
// ────────────────────────────────────────────────────────────────────

export function buildTemplateVisibilityWhere(
  session: {
    user: {
      id: string;
      organizationId: string;
      facilityId: string | null;
      departmentId: string | null;
      roles: string[];
      permissions: string[];
    };
  },
  includeInactive: boolean = false
): any {
  const { user } = session;
  const isSuperAdmin = user.roles.includes("super_admin");
  const isAdmin =
    isSuperAdmin ||
    user.roles.includes("organization_admin") ||
    user.roles.includes("facility_admin");

  if (isSuperAdmin) {
    // Super admin sees everything in their org (including archived)
    return {
      organizationId: user.organizationId,
      ...(includeInactive ? {} : { status: { not: "archived" } }),
    };
  }

  if (isAdmin) {
    // Admins see all non-archived templates in their scope
    const where: any = {
      organizationId: user.organizationId,
      status: includeInactive ? { not: "archived" } : "active",
    };
    // facility_admin only sees their facility's templates + org-wide
    if (!user.roles.includes("organization_admin") && user.facilityId) {
      where.OR = [
        { scope: "system" },
        { scope: "organization" },
        { scope: "facility", facilityId: user.facilityId },
        { scope: "department", facilityId: user.facilityId },
        { scope: "personal", creatorId: user.id },
      ];
    }
    return where;
  }

  // Regular users see only active templates in their visible scope
  const orConditions: any[] = [
    { scope: "system" },
    { scope: "organization" },
  ];
  if (user.facilityId) {
    orConditions.push({ scope: "facility", facilityId: user.facilityId });
    orConditions.push({ scope: "department", facilityId: user.facilityId });
  }
  if (user.departmentId) {
    orConditions.push({ scope: "department", departmentId: user.departmentId });
  }
  orConditions.push({ scope: "personal", creatorId: user.id });

  return {
    organizationId: user.organizationId,
    status: "active",
    OR: orConditions,
  };
}

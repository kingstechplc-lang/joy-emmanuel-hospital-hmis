// =====================================================================
// paper-profiles.ts
//
// Centralized paper format definitions for the HMIS print system.
//
// Each profile defines:
//   - paperSize CSS keyword for @page rule (A4, A5, or auto)
//   - width / height (mm) — for screen preview and container sizing
//   - margins (top/right/bottom/left in mm) — for @page rule
//   - bodyPadding — for inner document container (additional padding)
//   - fontScale — multiplier applied to base font sizes
//   - orientation — "portrait" | "landscape"
//   - thermal — boolean; if true, document height grows with content
//              (no fixed A4-like height); also enables compact styling
//
// The HMIS supports 4 paper profiles per spec:
//   A4          — 210 × 297 mm  (invoices, lab reports, statements, admissions, discharges, referrals)
//   A5          — 148 × 210 mm  (compact invoices, prescriptions, smaller reports)
//   THERMAL_80  — 80 mm wide    (payment receipts, pharmacy receipts, POS)
//   THERMAL_58  — 58 mm wide    (compact receipts, small payment receipts)
//
// Thermal printers use continuous paper; we do NOT force a fixed height.
// =====================================================================

export type PaperSize = "A4" | "A5" | "THERMAL_80" | "THERMAL_58";
export type Orientation = "portrait" | "landscape";

export interface PaperProfile {
  id: PaperSize;
  label: string;
  /** CSS keyword for the `@page { size: ... }` rule, e.g., "A4", "A5", or "auto" */
  pageCssSize: string;
  /** Physical paper width in mm (informational; thermal = printable width) */
  widthMm: number;
  /** Physical paper height in mm (informational; thermal = auto/continuous) */
  heightMm: number | null;
  /** Margins applied to the @page rule (mm) */
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  /** Inner body padding inside the document (mm).  For thermal, this is the
   *  small padding between the printable area and the content. */
  bodyPaddingMm: number;
  /** Multiplier applied to base font sizes (1.0 = default 14px) */
  fontScale: number;
  /** Whether this is a continuous-feed thermal receipt (no fixed page height) */
  thermal: boolean;
  /** Default orientation for this paper profile */
  defaultOrientation: Orientation;
}

export const PAPER_PROFILES: Record<PaperSize, PaperProfile> = {
  A4: {
    id: "A4",
    label: "A4 (210 × 297 mm)",
    pageCssSize: "A4",
    widthMm: 210,
    heightMm: 297,
    marginTop: 12,
    marginRight: 12,
    marginBottom: 14,
    marginLeft: 12,
    bodyPaddingMm: 0,
    fontScale: 1.0,
    thermal: false,
    defaultOrientation: "portrait",
  },
  A5: {
    id: "A5",
    label: "A5 (148 × 210 mm)",
    pageCssSize: "A5",
    widthMm: 148,
    heightMm: 210,
    marginTop: 10,
    marginRight: 10,
    marginBottom: 12,
    marginLeft: 10,
    bodyPaddingMm: 0,
    fontScale: 0.92,
    thermal: false,
    defaultOrientation: "portrait",
  },
  THERMAL_80: {
    id: "THERMAL_80",
    label: "80mm Thermal Receipt",
    pageCssSize: "auto",
    widthMm: 80,
    heightMm: null,
    marginTop: 3,
    marginRight: 3,
    marginBottom: 3,
    marginLeft: 3,
    bodyPaddingMm: 2,
    fontScale: 0.85,
    thermal: true,
    defaultOrientation: "portrait",
  },
  THERMAL_58: {
    id: "THERMAL_58",
    label: "58mm Thermal Receipt",
    pageCssSize: "auto",
    widthMm: 58,
    heightMm: null,
    marginTop: 2,
    marginRight: 2,
    marginBottom: 2,
    marginLeft: 2,
    bodyPaddingMm: 1,
    fontScale: 0.78,
    thermal: true,
    defaultOrientation: "portrait",
  },
};

// =====================================================================
// Document type registry — which paper formats are appropriate for each
// document type.  Used by the print preview UI to show only the relevant
// format options.
//
// Default + alternative come from the spec (Section 41).
// These can be overridden per facility via SystemSetting keys
// `print_default_paper_<documentType>`.
// =====================================================================

export type DocumentType =
  | "receipt"
  | "invoice"
  | "lab_report"
  | "lab_test"
  | "prescription"
  | "patient_statement"
  | "insurance_document"
  | "admission"
  | "discharge"
  | "referral"
  | "imaging_report"
  | "refund_receipt"
  | "transfer"
  | "purchase_order"
  | "stock_transfer"
  | "intake_output"
  | "report";

export interface DocumentTypeConfig {
  id: DocumentType;
  label: string;
  /** Default paper format for this document type */
  defaultPaper: PaperSize;
  /** Allowed alternative paper formats the user may switch to in preview */
  allowedPapers: PaperSize[];
  /** Whether this document type supports landscape orientation */
  supportsLandscape: boolean;
  /** Human-readable description shown in print preview UI */
  description: string;
}

export const DOCUMENT_TYPES: Record<DocumentType, DocumentTypeConfig> = {
  receipt: {
    id: "receipt",
    label: "Payment Receipt",
    defaultPaper: "THERMAL_80",
    allowedPapers: ["THERMAL_80", "THERMAL_58"],
    supportsLandscape: false,
    description: "Thermal receipt for a payment, with patient, items, totals, and payment method.",
  },
  invoice: {
    id: "invoice",
    label: "Invoice",
    defaultPaper: "A4",
    allowedPapers: ["A4", "A5"],
    supportsLandscape: false,
    description: "Professional invoice with facility header, patient, line items, totals, and payment status.",
  },
  lab_report: {
    id: "lab_report",
    label: "Laboratory Report",
    defaultPaper: "A4",
    allowedPapers: ["A4", "A5"],
    supportsLandscape: false,
    description: "Full laboratory report for a Lab Order — patient, order, specimen, all results with reference ranges and flags.",
  },
  lab_test: {
    id: "lab_test",
    label: "Individual Lab Test Report",
    defaultPaper: "A4",
    allowedPapers: ["A4", "A5"],
    supportsLandscape: false,
    description: "Single lab test result — patient, order, and only the selected LabResult.  Print Full Report ≠ Print Test.",
  },
  prescription: {
    id: "prescription",
    label: "Prescription",
    defaultPaper: "A5",
    allowedPapers: ["A5", "A4"],
    supportsLandscape: false,
    description: "Patient prescription with prescriber, medication, dose, route, frequency, duration, instructions.",
  },
  patient_statement: {
    id: "patient_statement",
    label: "Patient Statement",
    defaultPaper: "A4",
    allowedPapers: ["A4"],
    supportsLandscape: false,
    description: "Patient account statement with opening balance, charges, payments, refunds, adjustments, closing balance.",
  },
  insurance_document: {
    id: "insurance_document",
    label: "Insurance / NHIS Document",
    defaultPaper: "A4",
    allowedPapers: ["A4"],
    supportsLandscape: false,
    description: "Insurance or NHIS-related printable document.",
  },
  admission: {
    id: "admission",
    label: "Admission Record",
    defaultPaper: "A4",
    allowedPapers: ["A4"],
    supportsLandscape: false,
    description: "Patient admission record with bed assignment, attending clinician, admission diagnosis.",
  },
  discharge: {
    id: "discharge",
    label: "Discharge Summary",
    defaultPaper: "A4",
    allowedPapers: ["A4"],
    supportsLandscape: false,
    description: "Discharge summary with diagnoses, procedures, medications on discharge, follow-up.",
  },
  referral: {
    id: "referral",
    label: "Referral Letter",
    defaultPaper: "A4",
    allowedPapers: ["A4"],
    supportsLandscape: false,
    description: "Patient referral letter to another facility or specialist.",
  },
  imaging_report: {
    id: "imaging_report",
    label: "Imaging Report",
    defaultPaper: "A4",
    allowedPapers: ["A4", "A5"],
    supportsLandscape: false,
    description: "Imaging study report with clinical indication, technique, findings, impression, recommendations.",
  },
  refund_receipt: {
    id: "refund_receipt",
    label: "Refund Receipt",
    defaultPaper: "THERMAL_80",
    allowedPapers: ["THERMAL_80", "THERMAL_58"],
    supportsLandscape: false,
    description: "Thermal receipt for a refund, clearly labelled REFUND (not a payment receipt).",
  },
  transfer: {
    id: "transfer",
    label: "Patient Transfer Summary",
    defaultPaper: "A4",
    allowedPapers: ["A4"],
    supportsLandscape: false,
    description: "Inter-facility or inter-ward patient transfer summary.",
  },
  purchase_order: {
    id: "purchase_order",
    label: "Purchase Order",
    defaultPaper: "A4",
    allowedPapers: ["A4", "A5"],
    supportsLandscape: true,
    description: "Supplier purchase order with line items, totals, delivery and payment terms.",
  },
  stock_transfer: {
    id: "stock_transfer",
    label: "Stock Transfer Note",
    defaultPaper: "A4",
    allowedPapers: ["A4", "A5"],
    supportsLandscape: false,
    description: "Stock transfer note between facilities or departments.",
  },
  intake_output: {
    id: "intake_output",
    label: "Intake / Output Chart",
    defaultPaper: "A4",
    allowedPapers: ["A4"],
    supportsLandscape: true,
    description: "Patient intake/output chart over a monitoring period.",
  },
  report: {
    id: "report",
    label: "System Report",
    defaultPaper: "A4",
    allowedPapers: ["A4"],
    supportsLandscape: true,
    description: "Generic system / KPI report.",
  },
};

// =====================================================================
// Helpers — build the @page CSS rule for a paper profile + orientation,
// and produce a screen-preview style object that mirrors the printable
// dimensions for the on-screen preview UI.
// =====================================================================

export function buildPageCssRule(
  profile: PaperProfile,
  orientation: Orientation = profile.defaultOrientation
): string {
  if (profile.thermal) {
    // Thermal: use width-specific page, no fixed height (continuous feed).
    return `@page { size: ${profile.widthMm}mm auto; margin: ${profile.marginTop}mm ${profile.marginRight}mm ${profile.marginBottom}mm ${profile.marginLeft}mm; }`;
  }
  const sizeKeyword =
    orientation === "landscape"
      ? `${profile.pageCssSize} landscape`
      : `${profile.pageCssSize} portrait`;
  return `@page { size: ${sizeKeyword}; margin: ${profile.marginTop}mm ${profile.marginRight}mm ${profile.marginBottom}mm ${profile.marginLeft}mm; }`;
}

export function buildBodyStyle(profile: PaperProfile): Record<string, string> {
  const printableWidthMm = profile.widthMm - profile.marginLeft - profile.marginRight;
  return {
    width: `${printableWidthMm}mm`,
    maxWidth: `${printableWidthMm}mm`,
    margin: "0 auto",
    padding: `${profile.bodyPaddingMm}mm`,
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#0f172a",
    background: "white",
    fontSize: `${(14 * profile.fontScale).toFixed(2)}px`,
    lineHeight: "1.4",
  };
}

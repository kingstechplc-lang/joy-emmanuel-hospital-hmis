// =====================================================================
// API: /api/cdss/rbac-matrix
//   GET    — returns the roles × CDSS permissions matrix.
//            For each role, indicates which CDSS permissions it has.
//            Used by the CDSS Health Center dashboard to render a
//            permission matrix table.
//
// PERMISSIONS:
//   GET     requires  cdss.view  (or super_admin)
//
// Returns:
//   {
//     roles: [{ key, label, permissions: { "cdss.view": true, ... } }],
//     permissions: [{ code, label, category }],
//     categories: ["cdss", "clinical_alert", "discharge_summary",
//                   "wristband", "medication_label"]
//   }
// =====================================================================
import { NextResponse } from "next/server";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLE_LABELS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// CDSS permissions organized by category
const CDSS_PERMISSION_MATRIX: Array<{
  code: string;
  constant: string;
  label: string;
  category: string;
}> = [
  // CDSS engine
  { code: PERMISSIONS.CDSS_VIEW, constant: "CDSS_VIEW", label: "View CDSS dashboard", category: "cdss" },
  { code: PERMISSIONS.CDSS_CONFIGURE, constant: "CDSS_CONFIGURE", label: "Configure CDSS rules", category: "cdss" },
  // Clinical alerts
  { code: PERMISSIONS.CLINICAL_ALERT_VIEW, constant: "CLINICAL_ALERT_VIEW", label: "View clinical alerts", category: "clinical_alert" },
  { code: PERMISSIONS.CLINICAL_ALERT_ACKNOWLEDGE, constant: "CLINICAL_ALERT_ACKNOWLEDGE", label: "Acknowledge alerts", category: "clinical_alert" },
  { code: PERMISSIONS.CLINICAL_ALERT_OVERRIDE, constant: "CLINICAL_ALERT_OVERRIDE", label: "Override alerts (with reason)", category: "clinical_alert" },
  { code: PERMISSIONS.CLINICAL_ALERT_ESCALATE, constant: "CLINICAL_ALERT_ESCALATE", label: "Escalate alerts", category: "clinical_alert" },
  // Discharge summaries
  { code: PERMISSIONS.DISCHARGE_SUMMARY_VIEW, constant: "DISCHARGE_SUMMARY_VIEW", label: "View discharge summaries", category: "discharge_summary" },
  { code: PERMISSIONS.DISCHARGE_SUMMARY_CREATE, constant: "DISCHARGE_SUMMARY_CREATE", label: "Create / edit drafts", category: "discharge_summary" },
  { code: PERMISSIONS.DISCHARGE_SUMMARY_FINALIZE, constant: "DISCHARGE_SUMMARY_FINALIZE", label: "Approve / finalize / amend", category: "discharge_summary" },
  { code: PERMISSIONS.DISCHARGE_SUMMARY_PRINT, constant: "DISCHARGE_SUMMARY_PRINT", label: "Print summaries", category: "discharge_summary" },
  // Patient wristbands
  { code: PERMISSIONS.WRISTBAND_PRINT, constant: "WRISTBAND_PRINT", label: "Print wristbands", category: "wristband" },
  { code: PERMISSIONS.WRISTBAND_REPRINT, constant: "WRISTBAND_REPRINT", label: "Reprint / void wristbands", category: "wristband" },
  // Medication labels
  { code: PERMISSIONS.MEDICATION_LABEL_PRINT, constant: "MEDICATION_LABEL_PRINT", label: "Print medication labels", category: "medication_label" },
  { code: PERMISSIONS.MEDICATION_LABEL_REPRINT, constant: "MEDICATION_LABEL_REPRINT", label: "Reprint / void labels", category: "medication_label" },
];

const CATEGORY_LABELS: Record<string, string> = {
  cdss: "CDSS Engine",
  clinical_alert: "Clinical Alerts",
  discharge_summary: "Discharge Summaries",
  wristband: "Patient Wristbands",
  medication_label: "Medication Labels",
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CDSS_VIEW)) {
    return NextResponse.json({ error: "Forbidden — requires cdss.view" }, { status: 403 });
  }

  // Build the matrix: for each role, compute has-permission per CDSS permission
  const roles = Object.keys(ROLE_PERMISSIONS);
  const roleMatrix = roles.map((roleKey) => {
    const rolePerms = ROLE_PERMISSIONS[roleKey] as string[];
    const isSuperAdmin = roleKey === "super_admin";
    const permissions: Record<string, boolean> = {};
    for (const perm of CDSS_PERMISSION_MATRIX) {
      permissions[perm.code] = isSuperAdmin || rolePerms.includes(perm.code as any);
    }
    return {
      key: roleKey,
      label: (ROLE_LABELS as any)[roleKey] || roleKey.replace(/_/g, " "),
      isSuperAdmin,
      permissions,
    };
  });

  return NextResponse.json({
    roles: roleMatrix,
    permissions: CDSS_PERMISSION_MATRIX.map((p) => ({
      code: p.code,
      constant: p.constant,
      label: p.label,
      category: p.category,
      categoryLabel: CATEGORY_LABELS[p.category] || p.category,
    })),
    categories: Object.entries(CATEGORY_LABELS).map(([key, label]) => ({ key, label })),
  });
}

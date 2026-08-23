// =====================================================================
// APP NAVIGATION STORE (Zustand) — SPA-style view switching
// =====================================================================
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewKey =
  | "dashboard"
  | "patients"
  | "patient_new"
  | "patient_360"
  | "encounters"
  | "appointments"
  | "queue"
  | "triage"
  | "consultations"
  | "prescriptions"
  | "dispense"
  | "lab_orders"
  | "lab_results"
  | "imaging"
  | "procedures"
  | "admissions"
  | "beds"
  | "nursing"
  | "discharges"
  | "transfers"
  | "referrals"
  | "immunizations"
  | "maternity"
  | "billing_invoices"
  | "billing_payments"
  | "billing_refunds"
  | "insurance_claims"
  | "inventory"
  | "suppliers"
  | "purchase_orders"
  | "stock_transfers"
  | "equipment"
  | "staff"
  | "shifts"
  | "attendance"
  | "training"
  | "certifications"
  | "documents"
  | "tasks"
  | "incident_reports"
  | "handover"
  | "audit_logs"
  | "security"
  | "reports"
  | "settings_facilities"
  | "settings_departments"
  | "settings_users"
  | "settings_roles"
  | "settings_permissions"
  | "settings_services"
  | "settings_lab_tests"
  | "settings_medications"
  | "settings_diagnoses"
  | "settings_insurance_providers"
  | "settings_system"
  | "records_desk"
  | "opd"
  | "ward_rounds"
  | "intake_output"
  | "department_dashboard"
  // Extended modules
  | "mortuary"
  | "blood_donors"
  | "blood_units"
  | "blood_transfusions"
  | "theatre"
  | "critical_care"
  | "specialty_clinics"
  | "specialty_clinics_appointments"
  | "specialty_clinics_referrals"
  | "specialty_clinics_clinics"
  | "support_services"
  | "patient_relations"
  | "quality_assurance"
  | "risk_management"
  | "legal_compliance"
  | "research"
  | "public_relations"
  | "it_support"
  | "coding_claims"
  | "community_health"
  | "home_care"
  | "histopathology"
  | "recovery_room"
  | "internal_audit"
  | "workflow_dashboard";

type AppState = {
  view: ViewKey;
  activeFacilityId: string | null;
  selectedPatientId: string | null;
  selectedEncounterId: string | null;
  sidebarCollapsed: boolean;
  setView: (v: ViewKey) => void;
  setActiveFacility: (id: string | null) => void;
  selectPatient: (id: string | null) => void;
  selectEncounter: (id: string | null) => void;
  toggleSidebar: () => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      view: "dashboard",
      activeFacilityId: null,
      selectedPatientId: null,
      selectedEncounterId: null,
      sidebarCollapsed: false,
      setView: (v) => set({ view: v }),
      setActiveFacility: (id) => set({ activeFacilityId: id }),
      selectPatient: (id) => set({ selectedPatientId: id }),
      selectEncounter: (id) => set({ selectedEncounterId: id }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "jem-hmis-store",
      partialize: (state) => ({
        activeFacilityId: state.activeFacilityId,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);

// =====================================================================
// SIDEBAR NAVIGATION DEFINITION
// =====================================================================
export type NavItem = {
  key: ViewKey;
  label: string;
  icon: string;
  permission?: string;
  category: string;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard", category: "Overview" },
  { key: "workflow_dashboard", label: "Workflow & Notifications", icon: "BellRing", category: "Overview" },
  { key: "records_desk", label: "Records Desk", icon: "ClipboardCheck", permission: "patient.view", category: "Clinical" },
  { key: "opd", label: "Outpatient (OPD)", icon: "Stethoscope", permission: "encounter.view", category: "Clinical" },
  { key: "patients", label: "Patients", icon: "Users", permission: "patient.view", category: "Clinical" },
  { key: "patient_new", label: "Register Patient", icon: "UserPlus", permission: "patient.create", category: "Clinical" },
  { key: "encounters", label: "Encounters", icon: "Stethoscope", permission: "encounter.view", category: "Clinical" },
  { key: "appointments", label: "Appointments", icon: "Calendar", permission: "appointment.view", category: "Clinical" },
  { key: "queue", label: "Queue", icon: "ListOrdered", permission: "encounter.view", category: "Clinical" },
  { key: "triage", label: "Triage & Vitals", icon: "Activity", permission: "triage.view", category: "Clinical" },
  { key: "consultations", label: "Consultations", icon: "ClipboardList", permission: "clinical.create", category: "Clinical" },
  { key: "prescriptions", label: "Prescriptions", icon: "FileText", permission: "pharmacy.view", category: "Clinical" },
  { key: "dispense", label: "Dispensing", icon: "Pill", permission: "pharmacy.dispense", category: "Clinical" },
  { key: "referrals", label: "Referrals", icon: "Share2", permission: "clinical.view", category: "Clinical" },
  { key: "immunizations", label: "Immunizations", icon: "Syringe", permission: "immunization.view", category: "Clinical" },
  { key: "maternity", label: "Maternity", icon: "Baby", permission: "maternity.view", category: "Clinical" },

  { key: "lab_orders", label: "Lab Orders", icon: "FlaskConical", permission: "lab.view", category: "Diagnostics" },
  { key: "lab_results", label: "Lab Results", icon: "TestTube", permission: "lab.view", category: "Diagnostics" },
  { key: "imaging", label: "Imaging", icon: "ScanLine", permission: "imaging.view", category: "Diagnostics" },
  { key: "procedures", label: "Procedures", icon: "Scissors", permission: "procedure.view", category: "Diagnostics" },

  { key: "admissions", label: "Admissions", icon: "BedDouble", permission: "admission.view", category: "Inpatient" },
  { key: "beds", label: "Bed Management", icon: "Grid3x3", permission: "bed.manage", category: "Inpatient" },
  { key: "nursing", label: "Nursing Notes", icon: "NotebookPen", permission: "clinical.view", category: "Inpatient" },
  { key: "ward_rounds", label: "Ward Rounds", icon: "ClipboardCheck", permission: "admission.view", category: "Inpatient" },
  { key: "intake_output", label: "Intake / Output", icon: "Droplets", permission: "clinical.view", category: "Inpatient" },
  { key: "discharges", label: "Discharges", icon: "LogOut", permission: "admission.view", category: "Inpatient" },
  { key: "transfers", label: "Transfers", icon: "ArrowRightLeft", permission: "admission.view", category: "Inpatient" },

  { key: "billing_invoices", label: "Invoices", icon: "Receipt", permission: "billing.view", category: "Finance" },
  { key: "billing_payments", label: "Payments", icon: "CreditCard", permission: "billing.view", category: "Finance" },
  { key: "billing_refunds", label: "Refunds", icon: "RotateCcw", permission: "billing.view", category: "Finance" },
  { key: "insurance_claims", label: "Insurance Claims", icon: "ShieldCheck", permission: "insurance.view", category: "Finance" },

  { key: "inventory", label: "Inventory", icon: "Boxes", permission: "inventory.view", category: "Inventory" },
  { key: "suppliers", label: "Suppliers", icon: "Truck", permission: "inventory.view", category: "Inventory" },
  { key: "purchase_orders", label: "Purchase Orders", icon: "ShoppingCart", permission: "procurement.manage", category: "Inventory" },
  { key: "stock_transfers", label: "Stock Transfers", icon: "ArrowLeftRight", permission: "inventory.transfer", category: "Inventory" },
  { key: "equipment", label: "Equipment", icon: "Wrench", permission: "inventory.view", category: "Inventory" },

  { key: "staff", label: "Staff", icon: "UserCog", permission: "staff.view", category: "Human Resources" },
  { key: "shifts", label: "Shifts & Leave", icon: "CalendarClock", permission: "staff.view", category: "Human Resources" },
  { key: "attendance", label: "Attendance", icon: "Clock", permission: "staff.view", category: "Human Resources" },
  { key: "training", label: "Training", icon: "GraduationCap", permission: "staff.view", category: "Human Resources" },
  { key: "certifications", label: "Certifications", icon: "Award", permission: "staff.view", category: "Human Resources" },

  { key: "documents", label: "Documents", icon: "FolderOpen", permission: "document.view", category: "Operations" },
  { key: "tasks", label: "Tasks", icon: "CheckSquare", permission: "task.assign", category: "Operations" },
  { key: "incident_reports", label: "Incident Reports", icon: "AlertTriangle", permission: "task.assign", category: "Operations" },
  { key: "handover", label: "Shift Handover", icon: "ArrowLeftRight", permission: "clinical.view", category: "Operations" },

  { key: "audit_logs", label: "Audit Logs", icon: "ScrollText", permission: "audit.view", category: "Administration" },
  { key: "security", label: "Security", icon: "Shield", permission: "security.dashboard", category: "Administration" },
  { key: "reports", label: "Reports", icon: "BarChart3", permission: "report.view", category: "Administration" },
  { key: "settings_facilities", label: "Facilities", icon: "Building2", permission: "facility.manage", category: "Administration" },
  { key: "settings_departments", label: "Departments", icon: "Network", permission: "department.manage", category: "Administration" },
  { key: "department_dashboard", label: "Dept Dashboard", icon: "LayoutDashboard", permission: "department.manage", category: "Administration" },
  { key: "settings_users", label: "Users", icon: "UserCircle", permission: "user.view", category: "Administration" },
  { key: "settings_roles", label: "Roles", icon: "BadgeCheck", permission: "role.view", category: "Administration" },
  { key: "settings_permissions", label: "Permissions", icon: "Key", permission: "permission.assign", category: "Administration" },
  { key: "settings_services", label: "Services & Pricing", icon: "DollarSign", permission: "settings.view", category: "Administration" },
  { key: "settings_lab_tests", label: "Lab Test Catalog", icon: "Beaker", permission: "settings.view", category: "Administration" },
  { key: "settings_medications", label: "Medications", icon: "Pill", permission: "settings.view", category: "Administration" },
  { key: "settings_diagnoses", label: "Diagnosis Engine", icon: "Stethoscope", permission: "diagnosis.view", category: "Administration" },
  { key: "settings_insurance_providers", label: "Insurance Providers", icon: "Building", permission: "settings.view", category: "Administration" },
  { key: "settings_system", label: "System Settings", icon: "Settings", permission: "settings.view", category: "Administration" },

  // Extended Clinical — Specialty & Critical Care
  { key: "specialty_clinics", label: "Specialty Clinics", icon: "Stethoscope", permission: "specialty.view", category: "Specialty Clinics" },
  { key: "specialty_clinics_appointments", label: "Specialty Appointments", icon: "Calendar", permission: "specialty.view", category: "Specialty Clinics" },
  { key: "specialty_clinics_referrals", label: "Specialty Referrals", icon: "Share2", permission: "specialty.view", category: "Specialty Clinics" },
  { key: "specialty_clinics_clinics", label: "Clinic Configuration", icon: "Building2", permission: "specialty.view", category: "Specialty Clinics" },
  { key: "theatre", label: "Operating Theatre", icon: "Scissors", permission: "theatre.view", category: "Specialty Clinics" },
  { key: "recovery_room", label: "Recovery Room", icon: "BedDouble", permission: "recovery.view", category: "Specialty Clinics" },
  { key: "critical_care", label: "ICU / NICU", icon: "Activity", permission: "critical_care.view", category: "Specialty Clinics" },
  { key: "histopathology", label: "Histopathology", icon: "Microscope", permission: "histopathology.view", category: "Specialty Clinics" },

  // Blood Bank
  { key: "blood_donors", label: "Blood Donors", icon: "HeartPulse", permission: "bloodbank.view", category: "Blood Bank" },
  { key: "blood_units", label: "Blood Units", icon: "Droplet", permission: "bloodbank.view", category: "Blood Bank" },
  { key: "blood_transfusions", label: "Transfusions", icon: "Syringe", permission: "bloodbank.view", category: "Blood Bank" },

  // Support Services
  { key: "support_services", label: "Support Services", icon: "Sparkles", permission: "support_services.view", category: "Support Services" },
  { key: "mortuary", label: "Mortuary", icon: "Skull", permission: "mortuary.view", category: "Support Services" },
  { key: "home_care", label: "Home Care", icon: "Home", permission: "home_care.view", category: "Support Services" },
  { key: "community_health", label: "Community Health", icon: "Users", permission: "community_health.view", category: "Support Services" },

  // Governance & Quality
  { key: "patient_relations", label: "Patient Relations", icon: "MessageSquare", permission: "patient_relations.view", category: "Governance" },
  { key: "quality_assurance", label: "Quality Assurance", icon: "ClipboardCheck", permission: "qa.view", category: "Governance" },
  { key: "risk_management", label: "Risk Management", icon: "AlertTriangle", permission: "risk.view", category: "Governance" },
  { key: "legal_compliance", label: "Legal & Compliance", icon: "Scale", permission: "legal.view", category: "Governance" },
  { key: "internal_audit", label: "Internal Audit", icon: "ScrollText", permission: "audit.view", category: "Governance" },
  { key: "research", label: "Research & Studies", icon: "FlaskConical", permission: "research.view", category: "Governance" },
  { key: "public_relations", label: "Public Relations", icon: "Megaphone", permission: "pr.view", category: "Governance" },

  // IT & Coding
  { key: "it_support", label: "IT Support", icon: "Server", permission: "it.view", category: "IT & Coding" },
  { key: "coding_claims", label: "Coding & Claims", icon: "FileText", permission: "coding.view", category: "IT & Coding" },
];

export const NAV_CATEGORIES = [
  "Overview",
  "Clinical",
  "Diagnostics",
  "Inpatient",
  "Finance",
  "Inventory",
  "Human Resources",
  "Operations",
  "Administration",
  "Specialty Clinics",
  "Blood Bank",
  "Support Services",
  "Governance",
  "IT & Coding",
];

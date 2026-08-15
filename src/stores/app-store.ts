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
  | "documents"
  | "tasks"
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
  | "settings_insurance_providers"
  | "settings_system";

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
  { key: "patients", label: "Patients", icon: "Users", permission: "patient.view", category: "Clinical" },
  { key: "patient_new", label: "Register Patient", icon: "UserPlus", permission: "patient.create", category: "Clinical" },
  { key: "encounters", label: "Encounters", icon: "Stethoscope", permission: "encounter.view", category: "Clinical" },
  { key: "appointments", label: "Appointments", icon: "Calendar", permission: "appointment.view", category: "Clinical" },
  { key: "queue", label: "Queue", icon: "ListOrdered", permission: "encounter.view", category: "Clinical" },
  { key: "triage", label: "Triage & Vitals", icon: "Activity", permission: "triage.view", category: "Clinical" },
  { key: "consultations", label: "Consultations", icon: "ClipboardList", permission: "clinical.view", category: "Clinical" },
  { key: "prescriptions", label: "Prescriptions", icon: "FileText", permission: "pharmacy.view", category: "Clinical" },
  { key: "dispense", label: "Dispensing", icon: "Pill", permission: "pharmacy.dispense", category: "Clinical" },
  { key: "referrals", label: "Referrals", icon: "Share2", permission: "clinical.view", category: "Clinical" },
  { key: "immunizations", label: "Immunizations", icon: "Syringe", permission: "patient.view", category: "Clinical" },
  { key: "maternity", label: "Maternity", icon: "Baby", permission: "maternity.view", category: "Clinical" },

  { key: "lab_orders", label: "Lab Orders", icon: "FlaskConical", permission: "lab.view", category: "Diagnostics" },
  { key: "lab_results", label: "Lab Results", icon: "TestTube", permission: "lab.view", category: "Diagnostics" },
  { key: "imaging", label: "Imaging", icon: "ScanLine", permission: "imaging.view", category: "Diagnostics" },
  { key: "procedures", label: "Procedures", icon: "Scissors", permission: "procedure.view", category: "Diagnostics" },

  { key: "admissions", label: "Admissions", icon: "BedDouble", permission: "admission.view", category: "Inpatient" },
  { key: "beds", label: "Bed Management", icon: "Grid3x3", permission: "bed.manage", category: "Inpatient" },
  { key: "nursing", label: "Nursing Notes", icon: "NotebookPen", permission: "clinical.view", category: "Inpatient" },
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

  { key: "documents", label: "Documents", icon: "FolderOpen", permission: "document.view", category: "Operations" },
  { key: "tasks", label: "Tasks", icon: "CheckSquare", permission: "task.assign", category: "Operations" },

  { key: "audit_logs", label: "Audit Logs", icon: "ScrollText", permission: "audit.view", category: "Administration" },
  { key: "security", label: "Security", icon: "Shield", permission: "security.dashboard", category: "Administration" },
  { key: "reports", label: "Reports", icon: "BarChart3", permission: "report.view", category: "Administration" },
  { key: "settings_facilities", label: "Facilities", icon: "Building2", permission: "facility.manage", category: "Administration" },
  { key: "settings_departments", label: "Departments", icon: "Network", permission: "department.manage", category: "Administration" },
  { key: "settings_users", label: "Users", icon: "UserCircle", permission: "user.view", category: "Administration" },
  { key: "settings_roles", label: "Roles", icon: "BadgeCheck", permission: "role.view", category: "Administration" },
  { key: "settings_permissions", label: "Permissions", icon: "Key", permission: "permission.assign", category: "Administration" },
  { key: "settings_services", label: "Services & Pricing", icon: "DollarSign", permission: "settings.view", category: "Administration" },
  { key: "settings_lab_tests", label: "Lab Test Catalog", icon: "Beaker", permission: "settings.view", category: "Administration" },
  { key: "settings_medications", label: "Medications", icon: "Pill", permission: "settings.view", category: "Administration" },
  { key: "settings_insurance_providers", label: "Insurance Providers", icon: "Building", permission: "settings.view", category: "Administration" },
  { key: "settings_system", label: "System Settings", icon: "Settings", permission: "settings.view", category: "Administration" },
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
];

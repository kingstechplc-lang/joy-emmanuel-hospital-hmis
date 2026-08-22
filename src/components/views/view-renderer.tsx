"use client";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { DashboardView } from "@/components/views/dashboard-view";
import { RecordsDeskView } from "@/components/views/clinical/records-desk-view";
import { OPDView } from "@/components/views/clinical/opd-view";
import { PatientsView } from "@/components/views/patients/patients-view";
import { PatientRegistrationView } from "@/components/views/patients/patient-registration-view";
import { Patient360View } from "@/components/views/patients/patient-360-view";
import { EncountersView } from "@/components/views/clinical/encounters-view";
import { AppointmentsView } from "@/components/views/clinical/appointments-view";
import { QueueView } from "@/components/views/clinical/queue-view";
import { TriageView } from "@/components/views/clinical/triage-view";
import { ConsultationsView } from "@/components/views/clinical/consultations-view";
import { PrescriptionsView } from "@/components/views/pharmacy/prescriptions-view";
import { DispenseView } from "@/components/views/pharmacy/dispense-view";
import { ReferralsView } from "@/components/views/clinical/referrals-view";
import { ImmunizationsView } from "@/components/views/clinical/immunizations-view";
import { MaternityView } from "@/components/views/clinical/maternity-view";
import { LabOrdersView } from "@/components/views/lab/lab-orders-view";
import { LabResultsView } from "@/components/views/lab/lab-results-view";
import { ImagingView } from "@/components/views/imaging/imaging-view";
import { ProceduresView } from "@/components/views/procedures/procedures-view";
import { AdmissionsView } from "@/components/views/inpatient/admissions-view";
import { BedsView } from "@/components/views/inpatient/beds-view";
import { NursingView } from "@/components/views/inpatient/nursing-view";
import { DischargesView } from "@/components/views/inpatient/discharges-view";
import { TransfersView } from "@/components/views/inpatient/transfers-view";
import { InvoicesView } from "@/components/views/billing/invoices-view";
import { PaymentsView } from "@/components/views/billing/payments-view";
import { RefundsView } from "@/components/views/billing/refunds-view";
import { InsuranceClaimsView } from "@/components/views/billing/insurance-claims-view";
import { InventoryView } from "@/components/views/inventory/inventory-view";
import { SuppliersView } from "@/components/views/inventory/suppliers-view";
import { PurchaseOrdersView } from "@/components/views/inventory/purchase-orders-view";
import { StockTransfersView } from "@/components/views/inventory/stock-transfers-view";
import { EquipmentView } from "@/components/views/inventory/equipment-view";
import { StaffView } from "@/components/views/hr/staff-view";
import { ShiftsView } from "@/components/views/hr/shifts-view";
import { AttendanceView } from "@/components/views/hr/attendance-view";
import { TrainingView } from "@/components/views/hr/training-view";
import { CertificationsView } from "@/components/views/hr/certifications-view";
import { DocumentsView } from "@/components/views/operations/documents-view";
import { TasksView } from "@/components/views/operations/tasks-view";
import { IncidentReportsView } from "@/components/views/operations/incident-reports-view";
import { HandoverView } from "@/components/views/operations/handover-view";
import { WardRoundsView } from "@/components/views/inpatient/ward-rounds-view";
import { IntakeOutputView } from "@/components/views/inpatient/intake-output-view";
import { AuditLogsView } from "@/components/views/admin/audit-logs-view";
import { SecurityView } from "@/components/views/admin/security-view";
import { ReportsView } from "@/components/views/admin/reports-view";
import { FacilitiesAdminView } from "@/components/views/admin/facilities-admin-view";
import { DepartmentsAdminView } from "@/components/views/admin/departments-admin-view";
import { DepartmentDashboardView } from "@/components/views/admin/department-dashboard-view";
import { UsersAdminView } from "@/components/views/admin/users-admin-view";
import { RolesAdminView } from "@/components/views/admin/roles-admin-view";
import { PermissionsAdminView } from "@/components/views/admin/permissions-admin-view";
import { ServicesAdminView } from "@/components/views/admin/services-admin-view";
import { LabTestsAdminView } from "@/components/views/admin/lab-tests-admin-view";
import { MedicationsAdminView } from "@/components/views/admin/medications-admin-view";
import { DiagnosisEngineView } from "@/components/views/admin/diagnosis-engine-view";
import { InsuranceProvidersAdminView } from "@/components/views/admin/insurance-providers-admin-view";
import { SystemSettingsView } from "@/components/views/admin/system-settings-view";
import type { ViewKey } from "@/stores/app-store";

// Extended module views
import { MortuaryView } from "@/components/views/extended/mortuary-view";
import { WorkflowDashboardView } from "@/components/views/extended/workflow-dashboard-view";
import { ITSupportView } from "@/components/views/extended/it-support-view";
import { SupportServicesView } from "@/components/views/extended/support-services-view";
import { BloodBankView } from "@/components/views/extended/blood-bank-view";
import { SpecialtyClinicsView } from "@/components/views/extended/specialty-clinics-view";
import {
  BloodDonorsView, BloodUnitsView, BloodTransfusionsView,
  TheatreView, CriticalCareView,
  PatientRelationsView, QualityAssuranceView,
  RiskManagementView, LegalComplianceView, ResearchView,
  PublicRelationsView, CodingClaimsView,
  CommunityHealthView, HomeCareView, HistopathologyView,
  RecoveryRoomView, InternalAuditView,
} from "@/components/views/extended";

const VIEW_MAP: Record<ViewKey, React.ComponentType<any>> = {
  dashboard: DashboardView,
  workflow_dashboard: WorkflowDashboardView,
  records_desk: RecordsDeskView,
  opd: OPDView,
  patients: PatientsView,
  patient_new: PatientRegistrationView,
  patient_360: Patient360View,
  encounters: EncountersView,
  appointments: AppointmentsView,
  queue: QueueView,
  triage: TriageView,
  consultations: ConsultationsView,
  prescriptions: PrescriptionsView,
  dispense: DispenseView,
  referrals: ReferralsView,
  immunizations: ImmunizationsView,
  maternity: MaternityView,
  lab_orders: LabOrdersView,
  lab_results: LabResultsView,
  imaging: ImagingView,
  procedures: ProceduresView,
  admissions: AdmissionsView,
  beds: BedsView,
  nursing: NursingView,
  discharges: DischargesView,
  transfers: TransfersView,
  billing_invoices: InvoicesView,
  billing_payments: PaymentsView,
  billing_refunds: RefundsView,
  insurance_claims: InsuranceClaimsView,
  inventory: InventoryView,
  suppliers: SuppliersView,
  purchase_orders: PurchaseOrdersView,
  stock_transfers: StockTransfersView,
  equipment: EquipmentView,
  staff: StaffView,
  shifts: ShiftsView,
  attendance: AttendanceView,
  training: TrainingView,
  certifications: CertificationsView,
  documents: DocumentsView,
  tasks: TasksView,
  incident_reports: IncidentReportsView,
  handover: HandoverView,
  ward_rounds: WardRoundsView,
  intake_output: IntakeOutputView,
  audit_logs: AuditLogsView,
  security: SecurityView,
  reports: ReportsView,
  settings_facilities: FacilitiesAdminView,
  settings_departments: DepartmentsAdminView,
  department_dashboard: DepartmentDashboardView,
  settings_users: UsersAdminView,
  settings_roles: RolesAdminView,
  settings_permissions: PermissionsAdminView,
  settings_services: ServicesAdminView,
  settings_lab_tests: LabTestsAdminView,
  settings_medications: MedicationsAdminView,
  settings_diagnoses: DiagnosisEngineView,
  settings_insurance_providers: InsuranceProvidersAdminView,
  settings_system: SystemSettingsView,
  // Extended modules
  mortuary: MortuaryView,
  blood_donors: BloodBankView,
  blood_units: BloodBankView,
  blood_transfusions: BloodBankView,
  theatre: TheatreView,
  critical_care: CriticalCareView,
  specialty_clinics: SpecialtyClinicsView,
  specialty_clinics_appointments: SpecialtyClinicsView,
  specialty_clinics_referrals: SpecialtyClinicsView,
  specialty_clinics_clinics: SpecialtyClinicsView,
  support_services: SupportServicesView,
  patient_relations: PatientRelationsView,
  quality_assurance: QualityAssuranceView,
  risk_management: RiskManagementView,
  legal_compliance: LegalComplianceView,
  research: ResearchView,
  public_relations: PublicRelationsView,
  it_support: ITSupportView,
  coding_claims: CodingClaimsView,
  community_health: CommunityHealthView,
  home_care: HomeCareView,
  histopathology: HistopathologyView,
  recovery_room: RecoveryRoomView,
  internal_audit: InternalAuditView,
};

const PERMISSION_MAP: Partial<Record<ViewKey, string>> = {
  records_desk: "patient.view",
  opd: "encounter.view",
  patients: "patient.view",
  patient_new: "patient.create",
  patient_360: "patient.view",
  encounters: "encounter.view",
  appointments: "appointment.view",
  queue: "encounter.view",
  triage: "triage.view",
  consultations: "clinical.create",
  prescriptions: "pharmacy.view",
  dispense: "pharmacy.dispense",
  referrals: "clinical.view",
  immunizations: "clinical.view",
  maternity: "maternity.view",
  lab_orders: "lab.view",
  lab_results: "lab.view",
  imaging: "imaging.view",
  procedures: "procedure.view",
  admissions: "admission.view",
  beds: "bed.manage",
  nursing: "clinical.view",
  discharges: "admission.view",
  transfers: "admission.view",
  billing_invoices: "billing.view",
  billing_payments: "billing.view",
  billing_refunds: "billing.view",
  insurance_claims: "insurance.view",
  inventory: "inventory.view",
  suppliers: "inventory.view",
  purchase_orders: "procurement.manage",
  stock_transfers: "inventory.transfer",
  equipment: "inventory.view",
  staff: "staff.view",
  shifts: "staff.view",
  attendance: "staff.view",
  training: "staff.view",
  certifications: "staff.view",
  documents: "document.view",
  tasks: "task.assign",
  incident_reports: "task.assign",
  handover: "clinical.view",
  ward_rounds: "admission.view",
  intake_output: "clinical.view",
  audit_logs: "audit.view",
  security: "security.dashboard",
  reports: "report.view",
  settings_facilities: "facility.manage",
  settings_departments: "department.manage",
  department_dashboard: "department.manage",
  settings_users: "user.view",
  settings_roles: "role.view",
  settings_permissions: "permission.assign",
  settings_services: "settings.view",
  settings_lab_tests: "settings.view",
  settings_medications: "settings.view",
  settings_diagnoses: "diagnosis.view",
  settings_insurance_providers: "settings.view",
  settings_system: "settings.view",
  // Extended modules
  mortuary: "mortuary.view",
  blood_donors: "bloodbank.view",
  blood_units: "bloodbank.view",
  blood_transfusions: "bloodbank.view",
  theatre: "theatre.view",
  critical_care: "critical_care.view",
  specialty_clinics: "specialty.view",
  specialty_clinics_appointments: "specialty.view",
  specialty_clinics_referrals: "specialty.view",
  specialty_clinics_clinics: "specialty.view",
  support_services: "support_services.view",
  patient_relations: "patient_relations.view",
  quality_assurance: "qa.view",
  risk_management: "risk.view",
  legal_compliance: "legal.view",
  research: "research.view",
  public_relations: "pr.view",
  it_support: "it.view",
  coding_claims: "coding.view",
  community_health: "community_health.view",
  home_care: "home_care.view",
  histopathology: "histopathology.view",
  recovery_room: "recovery.view",
  internal_audit: "audit.view",
};

export function ViewRenderer({ view }: { view: ViewKey }) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const isSuperAdmin = user?.roles?.includes("super_admin");
  const userPermissions: string[] = user?.permissions || [];

  // Blood Bank views pass the view key as initialTab
  const isBloodBankView = view === "blood_donors" || view === "blood_units" || view === "blood_transfusions";
  const isSpecialtyClinicsView = view === "specialty_clinics" || view === "specialty_clinics_appointments" || view === "specialty_clinics_referrals" || view === "specialty_clinics_clinics";

  const requiredPerm = PERMISSION_MAP[view];
  if (requiredPerm && !isSuperAdmin && !userPermissions.includes(requiredPerm)) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-amber-500" />
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Access Restricted</h3>
          <p className="text-sm text-slate-500">
            You don&apos;t have permission to access this module.
            <br />
            Required permission: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">{requiredPerm}</code>
          </p>
        </CardContent>
      </Card>
    );
  }

  const ViewComponent = VIEW_MAP[view] || DashboardView;
  if (isBloodBankView) {
    return <BloodBankView initialTab={view} />;
  }
  if (isSpecialtyClinicsView) {
    return <SpecialtyClinicsView initialTab={view} />;
  }
  return <ViewComponent />;
}

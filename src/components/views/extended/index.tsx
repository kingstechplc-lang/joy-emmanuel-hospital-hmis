"use client";
import { ExtendedModuleView } from "./_generic-module-view";
import { MODULE_CONFIGS } from "./module-configs";

// Individual view components for each extended module
// Each is a thin wrapper around the generic ExtendedModuleView

export function BloodDonorsView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.blood_donors} />;
}
export function BloodUnitsView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.blood_units} />;
}
export function BloodTransfusionsView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.blood_transfusions} />;
}
export function TheatreView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.theatre} />;
}
export function CriticalCareView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.critical_care} />;
}
export function SpecialtyClinicsView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.specialty} />;
}
export function SupportServicesView() {
  // Now uses the dedicated Support Services view (imported in view-renderer.tsx)
  return null;
}
export function PatientRelationsView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.patient_feedback} />;
}
export function QualityAssuranceView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.quality_indicators} />;
}
export function RiskManagementView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.risk_register} />;
}
export function LegalComplianceView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.legal_cases} />;
}
export function ResearchView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.research} />;
}
export function PublicRelationsView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.pr_activities} />;
}
export function ITSupportView() {
  // Now uses the dedicated IT Service Desk view (imported in view-renderer.tsx)
  // This is kept for backward compatibility but view-renderer now uses the dedicated component
  return null;
}
export function CodingClaimsView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.coding_records} />;
}
export function CommunityHealthView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.community_outreach} />;
}
export function HomeCareView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.home_care} />;
}
export function HistopathologyView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.histopathology} />;
}
export function RecoveryRoomView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.recovery_room} />;
}
export function InternalAuditView() {
  return <ExtendedModuleView config={MODULE_CONFIGS.audit_findings} />;
}

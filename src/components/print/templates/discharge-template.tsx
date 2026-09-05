"use client";

// =====================================================================
// discharge-template.tsx
//
// Printable discharge summary template using the central
// PrintLayout + DocumentTable + DocumentSection primitives.
//
// Used by DischargeDetailDialog's "Print Summary" button.
// Replaces the old raw `window.print()` that printed the entire SPA.
//
// Data: receives the discharge record (with patient + admission +
// clinician relations already loaded by the parent view).  The template
// does NOT re-fetch or re-calculate any data — it renders what it is
// given.  Authoritative financial/diagnostic truth stays in the
// domain modules.
// =====================================================================

import * as React from "react";
import { PrintLayout } from "@/components/print/print-layout";
import {
  DocumentSection,
  DocumentMeta,
  PrintDivider,
  StatusBadge,
} from "@/components/print/document-primitives";
import { formatDate } from "@/components/ui-helpers";

export function DischargeTemplate({ d }: { d: any }) {
  if (!d) return null;

  const fullName = `${d.patient?.firstName || ""} ${d.patient?.lastName || ""}`.trim();
  const lengthOfStayDays =
    d.admission?.admittedAt && d.dischargedAt
      ? ((new Date(d.dischargedAt).getTime() - new Date(d.admission.admittedAt).getTime()) /
          (1000 * 60 * 60 * 24)
        ).toFixed(1)
      : null;

  return (
    <PrintLayout
      title="Discharge Summary"
      documentNumber={d.dischargeNumber || "—"}
      subtitle={d.admission?.admissionNumber || undefined}
      paperSize="A4"
      patient={d.patient}
      extraPatientRows={[
        { label: "Admission #", value: d.admission?.admissionNumber },
        { label: "Discharge #", value: d.dischargeNumber },
      ]}
      signatory={`${d.dischargedBy?.firstName || ""} ${d.dischargedBy?.lastName || ""}`.trim() || undefined}
      signatoryRole="Discharging Clinician"
    >
      {/* Status bar */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
        <StatusBadge
          status={(d.dischargeType || "routine").replace(/_/g, " ")}
          variant={d.dischargeType === "ama" ? "warning" : d.dischargeType === "deceased" ? "danger" : "success"}
        />
        {d.disposition && <StatusBadge status={d.disposition} variant="info" />}
        {d.dischargeNumber && (
          <span style={{ fontSize: "11px", color: "#64748b" }}>
            Finalized {formatDate(d.finalizedAt || d.dischargedAt, true)}
          </span>
        )}
      </div>

      {/* Admission + Discharge meta */}
      <DocumentMeta
        rows={[
          { label: "Admitted", value: formatDate(d.admission?.admittedAt, true) },
          { label: "Discharged", value: formatDate(d.dischargedAt, true) },
          { label: "Length of Stay", value: lengthOfStayDays ? `${lengthOfStayDays} days` : "—" },
          { label: "Discharge Type", value: (d.dischargeType || "routine").replace(/_/g, " ") },
        ]}
      />

      {/* Clinical information */}
      {(d.primaryDiagnosisName || d.finalDiagnosis || d.dischargeSummary || d.procedures) && (
        <DocumentSection title="Clinical Information">
          {d.primaryDiagnosisName && (
            <div style={{ marginBottom: "6px" }}>
              <strong>Primary Diagnosis:</strong> {d.primaryDiagnosisName}
              {d.primaryDiagnosisCode && (
                <span style={{ color: "#64748b", fontFamily: "monospace", marginLeft: "4px" }}>
                  ({d.primaryDiagnosisCode})
                </span>
              )}
            </div>
          )}
          {d.finalDiagnosis && (
            <div style={{ marginBottom: "6px" }}>
              <strong>Final Diagnosis:</strong> {d.finalDiagnosis}
            </div>
          )}
          {d.procedures && (
            <div style={{ marginBottom: "6px" }}>
              <strong>Procedures Performed:</strong>
              <div style={{ whiteSpace: "pre-wrap" }}>{d.procedures}</div>
            </div>
          )}
          {d.dischargeSummary && (
            <div style={{ marginBottom: "6px" }}>
              <strong>Clinical Summary:</strong>
              <div style={{ whiteSpace: "pre-wrap" }}>{d.dischargeSummary}</div>
            </div>
          )}
          {d.dischargeConditions && (
            <div style={{ marginBottom: "6px" }}>
              <strong>Condition at Discharge:</strong>{" "}
              <span style={{ textTransform: "capitalize" }}>{d.dischargeConditions}</span>
            </div>
          )}
        </DocumentSection>
      )}

      {/* Discharge instructions */}
      {(d.instructionsMedication ||
        d.instructionsDiet ||
        d.instructionsActivity ||
        d.instructionsWoundCare ||
        d.instructionsWarningSigns ||
        d.instructionsEmergency) && (
        <DocumentSection title="Discharge Instructions">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {d.instructionsMedication && (
              <div>
                <strong>Medication:</strong> {d.instructionsMedication}
              </div>
            )}
            {d.instructionsDiet && (
              <div>
                <strong>Diet:</strong> {d.instructionsDiet}
              </div>
            )}
            {d.instructionsActivity && (
              <div>
                <strong>Activity:</strong> {d.instructionsActivity}
              </div>
            )}
            {d.instructionsWoundCare && (
              <div>
                <strong>Wound care:</strong> {d.instructionsWoundCare}
              </div>
            )}
            {d.instructionsWarningSigns && (
              <div>
                <strong>Warning signs:</strong> {d.instructionsWarningSigns}
              </div>
            )}
            {d.instructionsEmergency && (
              <div>
                <strong>Emergency:</strong> {d.instructionsEmergency}
              </div>
            )}
          </div>
        </DocumentSection>
      )}

      {/* Follow-up */}
      {(d.followUpAppointmentDate || d.followUpClinic || d.followUpPlan) && (
        <DocumentSection title="Follow-up">
          {d.followUpAppointmentDate && (
            <div style={{ marginBottom: "4px" }}>
              <strong>Appointment date:</strong> {formatDate(d.followUpAppointmentDate, true)}
            </div>
          )}
          {d.followUpClinic && (
            <div style={{ marginBottom: "4px" }}>
              <strong>Clinic:</strong> {d.followUpClinic}
            </div>
          )}
          {d.followUpPlan && (
            <div>
              <strong>Plan:</strong>
              <div style={{ whiteSpace: "pre-wrap" }}>{d.followUpPlan}</div>
            </div>
          )}
        </DocumentSection>
      )}

      {/* Advice on discharge */}
      {d.adviceOnDischarge && (
        <DocumentSection title="Advice on Discharge">
          <div style={{ whiteSpace: "pre-wrap" }}>{d.adviceOnDischarge}</div>
        </DocumentSection>
      )}

      {/* Transfer info (if applicable) */}
      {(d.transferReceivingFacility || d.transferDestination) && (
        <DocumentSection title="Transfer Information">
          {d.transferReceivingFacility && (
            <div>
              <strong>Receiving facility:</strong> {d.transferReceivingFacility}
            </div>
          )}
          {d.transferReceivingDept && (
            <div>
              <strong>Department:</strong> {d.transferReceivingDept}
            </div>
          )}
          {d.transferContactPerson && (
            <div>
              <strong>Contact:</strong> {d.transferContactPerson}
              {d.transferContactPhone && ` (${d.transferContactPhone})`}
            </div>
          )}
          {d.transferReason && (
            <div>
              <strong>Reason:</strong> {d.transferReason}
            </div>
          )}
          {d.transferTransportMethod && (
            <div>
              <strong>Transport:</strong> {d.transferTransportMethod}
            </div>
          )}
        </DocumentSection>
      )}

      {/* DAMA */}
      {d.dischargeType === "ama" && d.damaReason && (
        <DocumentSection title="Against Medical Advice">
          <div>
            <strong>Reason:</strong> {d.damaReason}
          </div>
          {d.damaRisksExplained && (
            <div>
              <strong>Risks explained:</strong> Yes
            </div>
          )}
          {d.damaAdviceProvided && (
            <div>
              <strong>Advice provided:</strong> {d.damaAdviceProvided}
            </div>
          )}
          {d.damaWitnessName && (
            <div>
              <strong>Witness:</strong> {d.damaWitnessName}
            </div>
          )}
        </DocumentSection>
      )}

      {/* Death */}
      {d.dischargeType === "deceased" && (
        <DocumentSection title="Death Documentation">
          {d.deathDate && (
            <div>
              <strong>Date/time of death:</strong> {formatDate(d.deathDate, true)}
            </div>
          )}
          {d.deathCause && (
            <div>
              <strong>Cause:</strong> {d.deathCause}
            </div>
          )}
        </DocumentSection>
      )}

      <PrintDivider />

      {/* Patient / Caregiver acknowledgement */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "32px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "200px", borderBottom: "1px dashed #94a3b8", marginBottom: "4px" }} />
          <div style={{ fontSize: "12px", fontWeight: 500 }}>
            {d.dischargedBy?.firstName} {d.dischargedBy?.lastName}
          </div>
          <div style={{ fontSize: "10px", color: "#64748b" }}>Discharging Clinician</div>
          <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
            {formatDate(d.dischargedAt, true)}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "200px", borderBottom: "1px dashed #94a3b8", marginBottom: "4px" }} />
          <div style={{ fontSize: "12px", fontWeight: 500 }}>{d.caregiverName || "—"}</div>
          <div style={{ fontSize: "10px", color: "#64748b" }}>Patient / Caregiver Acknowledgement</div>
          <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
            {d.acknowledgedAt ? formatDate(d.acknowledgedAt, true) : ""}
          </div>
        </div>
      </div>
    </PrintLayout>
  );
}

"use client";

// =====================================================================
// discharge-summary-template.tsx
//
// Printable Discharge Summary template for the Phase 7 CDSS DischargeSummary
// document. Uses the centralized PrintLayout + DocumentSection +
// DocumentTable + DocumentMeta + SignatureBlock primitives so it inherits
// the facility header / paper profile / signature block / page CSS for free.
//
// Data: receives the full DischargeSummary record (with patient, encounter,
// admission, dischargeRecord, attendingClinician, finalizedBy relations
// already loaded by the parent view). The `content` field is a JSON
// string assembled by `assembleDischargeSummaryContent()` in
// `src/lib/discharge-summary/assembler.ts`.
//
// The template does NOT re-fetch or re-calculate any data — it only renders
// what it is given. Authoritative clinical truth stays in the source modules.
// =====================================================================

import * as React from "react";
import { PrintLayout } from "@/components/print/print-layout";
import {
  DocumentSection,
  DocumentMeta,
  DocumentTable,
  PrintDivider,
  StatusBadge,
  type DocumentTableColumn,
} from "@/components/print/document-primitives";
import { formatDate } from "@/components/ui-helpers";

type DischargeSummaryTemplateProps = {
  /** The full DischargeSummary record with relations loaded. */
  summary: any;
};

function safeParseContent(content: any): any {
  if (!content) return {};
  if (typeof content === "object") return content;
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export function DischargeSummaryTemplate({ summary }: DischargeSummaryTemplateProps) {
  if (!summary) return null;

  const c = safeParseContent(summary.content);
  const patient = summary.patient || c.patient;
  const encounter = summary.encounter || c.encounter;
  const admission = summary.admission || c.admission;
  const dischargeRecord = summary.dischargeRecord || c.dischargeRecord;
  const attending = summary.attendingClinician ||
    (admission?.attendingClinician
      ? { firstName: admission.attendingClinician.firstName, lastName: admission.attendingClinician.lastName }
      : null);
  const finalizedBy = summary.finalizedBy || null;

  const fullName = [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") || "—";
  const attendingName = attending
    ? [attending.firstName, attending.lastName].filter(Boolean).join(" ")
    : "—";
  const finalizerName = finalizedBy
    ? [finalizedBy.firstName, finalizedBy.lastName].filter(Boolean).join(" ")
    : null;

  const lengthOfStayDays =
    admission?.admittedAt && (admission?.dischargedAt || dischargeRecord?.dischargedAt)
      ? Math.round(
          ((new Date(admission.dischargedAt || dischargeRecord.dischargedAt).getTime() -
            new Date(admission.admittedAt).getTime()) /
            (1000 * 60 * 60 * 24)) * 10,
        ) / 10
      : null;

  const diagnoses: any[] = c.diagnoses || [];
  const primaryDx = diagnoses.find((d) => d.isPrimary) || diagnoses[0] || null;
  const otherDx = diagnoses.filter((d) => d !== primaryDx);

  const investigations: any[] = c.investigations || [];
  const dischargeMedications: any[] = c.dischargeMedications || [];
  const consultations: any[] = c.consultations || [];
  const latestConsultation = consultations[consultations.length - 1] || null;
  const vitals = c.vitalsSnapshot?.triage || null;

  return (
    <PrintLayout
      title="Discharge Summary"
      documentNumber={summary.summaryNumber || "—"}
      subtitle={encounter?.encounterNumber || admission?.admissionNumber || undefined}
      paperSize="A4"
      patient={patient}
      extraPatientRows={[
        { label: "Encounter #", value: encounter?.encounterNumber },
        { label: "Admission #", value: admission?.admissionNumber },
        { label: "Discharge #", value: dischargeRecord?.dischargeNumber },
        { label: "MRN", value: patient?.patientNumber },
      ]}
      signatory={finalizerName || attendingName || undefined}
      signatoryRole={finalizerName ? "Finalizing Clinician" : "Attending Clinician"}
    >
      {/* Status banner */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <StatusBadge
          status={summary.status || "draft"}
          variant={
            summary.status === "finalized"
              ? "success"
              : summary.status === "amended"
                ? "warning"
                : summary.status === "approved"
                  ? "info"
                  : "neutral"
          }
        />
        {summary.status === "finalized" && summary.finalizedAt && (
          <span style={{ fontSize: "11px", color: "#64748b" }}>
            Finalized {formatDate(summary.finalizedAt, true)}
          </span>
        )}
        {summary.status === "amended" && summary.amendedAt && (
          <span style={{ fontSize: "11px", color: "#64748b" }}>
            Amended {formatDate(summary.amendedAt, true)}
          </span>
        )}
        <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto" }}>
          Version {summary.version || 1}
        </span>
      </div>

      {/* Admission / Encounter meta */}
      <DocumentMeta
        rows={[
          { label: "Encounter Type", value: encounter?.encounterType?.replace(/_/g, " ") || "—" },
          { label: "Admitted", value: formatDate(admission?.admittedAt || encounter?.startAt, true) },
          {
            label: "Discharged",
            value: formatDate(
              admission?.dischargedAt || dischargeRecord?.dischargedAt || encounter?.endAt,
              true,
            ),
          },
          {
            label: "Length of Stay",
            value: lengthOfStayDays != null ? `${lengthOfStayDays} day(s)` : "—",
          },
          {
            label: "Discharge Type",
            value: dischargeRecord?.dischargeType?.replace(/_/g, " ") || "Routine",
          },
          { label: "Disposition", value: dischargeRecord?.disposition || "—" },
          { label: "Attending Clinician", value: attendingName },
        ]}
      />

      {/* Primary Diagnosis + Other Diagnoses */}
      {(primaryDx || otherDx.length > 0) && (
        <DocumentSection title="Diagnoses">
          {primaryDx && (
            <div style={{ marginBottom: "8px" }}>
              <strong>Primary Diagnosis:</strong> {primaryDx.diagnosisName}
              {primaryDx.diagnosisCode && (
                <span style={{ color: "#64748b", fontFamily: "monospace", marginLeft: "4px" }}>
                  ({primaryDx.codeSystem || "ICD-10"}: {primaryDx.diagnosisCode})
                </span>
              )}
              {primaryDx.clinicalStatus && (
                <span style={{ color: "#64748b", marginLeft: "6px" }}>
                  · {primaryDx.clinicalStatus.replace(/_/g, " ")}
                </span>
              )}
            </div>
          )}
          {otherDx.length > 0 && (
            <div>
              <strong>Other Diagnoses:</strong>
              <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                {otherDx.map((d, i) => (
                  <li key={d.id || i} style={{ marginBottom: "2px" }}>
                    {d.diagnosisName}
                    {d.diagnosisCode && (
                      <span style={{ color: "#64748b", fontFamily: "monospace", marginLeft: "4px" }}>
                        ({d.codeSystem || "ICD-10"}: {d.diagnosisCode})
                      </span>
                    )}
                    {d.diagnosisType && (
                      <span style={{ color: "#94a3b8", marginLeft: "6px", fontSize: "11px" }}>
                        · {d.diagnosisType.replace(/_/g, " ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DocumentSection>
      )}

      {/* Clinical Summary — from latest consultation */}
      {(latestConsultation?.chiefComplaint ||
        latestConsultation?.historyPresentingIllness ||
        latestConsultation?.physicalExamination ||
        latestConsultation?.assessment) && (
        <DocumentSection title="Clinical Summary">
          {latestConsultation.chiefComplaint && (
            <div style={{ marginBottom: "6px" }}>
              <strong>Chief Complaint:</strong> {latestConsultation.chiefComplaint}
            </div>
          )}
          {latestConsultation.historyPresentingIllness && (
            <div style={{ marginBottom: "6px" }}>
              <strong>History of Presenting Illness:</strong>
              <div style={{ whiteSpace: "pre-wrap" }}>{latestConsultation.historyPresentingIllness}</div>
            </div>
          )}
          {latestConsultation.physicalExamination && (
            <div style={{ marginBottom: "6px" }}>
              <strong>Physical Examination:</strong>
              <div style={{ whiteSpace: "pre-wrap" }}>{latestConsultation.physicalExamination}</div>
            </div>
          )}
          {latestConsultation.assessment && (
            <div style={{ marginBottom: "6px" }}>
              <strong>Assessment:</strong>
              <div style={{ whiteSpace: "pre-wrap" }}>{latestConsultation.assessment}</div>
            </div>
          )}
          {latestConsultation.treatmentPlan && (
            <div>
              <strong>Treatment Plan:</strong>
              <div style={{ whiteSpace: "pre-wrap" }}>{latestConsultation.treatmentPlan}</div>
            </div>
          )}
        </DocumentSection>
      )}

      {/* Vitals Snapshot */}
      {vitals && (
        <DocumentSection title="Vitals Snapshot">
          <DocumentTable
            columns={[
              { key: "vital", label: "Vital" },
              { key: "value", label: "Value" },
              { key: "unit", label: "Unit" },
              { key: "recorded", label: "Recorded" },
            ]}
            rows={[
              { vital: "Temperature", value: vitals.temperature ?? "—", unit: "°C", recorded: formatDate(vitals.recordedAt, true) },
              { vital: "Pulse", value: vitals.pulse ?? "—", unit: "bpm", recorded: "—" },
              { vital: "Respiratory Rate", value: vitals.respiratoryRate ?? "—", unit: "/min", recorded: "—" },
              { vital: "Blood Pressure", value: vitals.systolicBp && vitals.diastolicBp ? `${vitals.systolicBp}/${vitals.diastolicBp}` : "—", unit: "mmHg", recorded: "—" },
              { vital: "Oxygen Saturation", value: vitals.oxygenSaturation ?? "—", unit: "%", recorded: "—" },
              { vital: "Weight", value: vitals.weight ?? "—", unit: "kg", recorded: "—" },
              { vital: "Height", value: vitals.height ?? "—", unit: "cm", recorded: "—" },
              { vital: "BMI", value: vitals.bmi ?? "—", unit: "kg/m²", recorded: "—" },
              { vital: "Blood Glucose", value: vitals.bloodGlucose ?? "—", unit: "mg/dL", recorded: "—" },
              { vital: "Pain Score", value: vitals.painScore ?? "—", unit: "/10", recorded: "—" },
              { vital: "Consciousness", value: vitals.consciousnessLevel ?? "—", unit: "", recorded: "—" },
            ]}
          />
        </DocumentSection>
      )}

      {/* Investigations */}
      {investigations.length > 0 && (
        <DocumentSection title="Investigations">
          <DocumentTable
            columns={[
              { key: "test", label: "Test" },
              { key: "result", label: "Result" },
              { key: "flag", label: "Flag" },
              { key: "range", label: "Reference Range" },
            ]}
            rows={investigations.map((inv) => ({
              test: inv.componentName ? `${inv.testName} — ${inv.componentName}` : inv.testName,
              result: `${inv.resultValue ?? "—"}${inv.unit ? ` ${inv.unit}` : ""}`,
              flag: inv.abnormalFlag ? inv.abnormalFlag.replace(/_/g, " ") : (inv.isCritical ? "CRITICAL" : ""),
              range: inv.referenceRange || "—",
            }))}
          />
        </DocumentSection>
      )}

      {/* Discharge Medications */}
      {dischargeMedications.length > 0 && (
        <DocumentSection title="Discharge Medications">
          <DocumentTable
            columns={[
              { key: "medication", label: "Medication" },
              { key: "dose", label: "Dose" },
              { key: "freq", label: "Frequency" },
              { key: "route", label: "Route" },
              { key: "duration", label: "Duration" },
              { key: "instructions", label: "Instructions" },
            ]}
            rows={dischargeMedications.map((m) => ({
              medication: m.medicationName || m.genericName || "—",
              dose: m.dose || "—",
              freq: m.frequency || "—",
              route: m.route || "—",
              duration: m.duration || "—",
              instructions: m.instructions || "—",
            }))}
          />
        </DocumentSection>
      )}

      {/* Advice + Follow-up */}
      {(dischargeRecord?.adviceOnDischarge || dischargeRecord?.followUpClinic || dischargeRecord?.followUpAppointmentDate || latestConsultation?.followUpPlan) && (
        <DocumentSection title="Advice & Follow-up">
          {dischargeRecord?.adviceOnDischarge && (
            <div style={{ marginBottom: "6px" }}>
              <strong>Advice on Discharge:</strong>
              <div style={{ whiteSpace: "pre-wrap" }}>{dischargeRecord.adviceOnDischarge}</div>
            </div>
          )}
          {latestConsultation?.followUpPlan && (
            <div style={{ marginBottom: "6px" }}>
              <strong>Follow-up Plan:</strong>
              <div style={{ whiteSpace: "pre-wrap" }}>{latestConsultation.followUpPlan}</div>
            </div>
          )}
          {dischargeRecord?.followUpClinic && (
            <div style={{ marginBottom: "6px" }}>
              <strong>Follow-up Clinic:</strong> {dischargeRecord.followUpClinic}
            </div>
          )}
          {dischargeRecord?.followUpAppointmentDate && (
            <div>
              <strong>Follow-up Appointment:</strong> {formatDate(dischargeRecord.followUpAppointmentDate, true)}
            </div>
          )}
        </DocumentSection>
      )}

      <PrintDivider />

      {/* Signatures */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "32px", gap: "32px" }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ width: "100%", maxWidth: "220px", borderBottom: "1px dashed #94a3b8", marginBottom: "4px", margin: "0 auto" }} />
          <div style={{ fontSize: "12px", fontWeight: 500 }}>{finalizerName || attendingName}</div>
          <div style={{ fontSize: "10px", color: "#64748b" }}>
            {finalizerName ? "Finalizing Clinician" : "Attending Clinician"}
          </div>
          <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
            {summary.finalizedAt ? formatDate(summary.finalizedAt, true) : summary.updatedAt ? formatDate(summary.updatedAt, true) : ""}
          </div>
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ width: "100%", maxWidth: "220px", borderBottom: "1px dashed #94a3b8", marginBottom: "4px", margin: "0 auto" }} />
          <div style={{ fontSize: "12px", fontWeight: 500 }}>Patient / Caregiver</div>
          <div style={{ fontSize: "10px", color: "#64748b" }}>Acknowledgement</div>
        </div>
      </div>
    </PrintLayout>
  );
}

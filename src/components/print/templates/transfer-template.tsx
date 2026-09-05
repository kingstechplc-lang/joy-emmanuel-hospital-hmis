"use client";

// =====================================================================
// transfer-template.tsx — printable patient transfer summary.
// Used by TransferDetailDialog's "Print Summary" button.
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

export function TransferTemplate({ t }: { t: any }) {
  if (!t) return null;

  return (
    <PrintLayout
      title="Patient Transfer Summary"
      documentNumber={t.transferNumber || "—"}
      subtitle={t.admission?.admissionNumber || undefined}
      paperSize="A4"
      patient={t.patient}
      extraPatientRows={[
        { label: "Transfer #", value: t.transferNumber },
        { label: "Admission #", value: t.admission?.admissionNumber },
      ]}
      signatory={
        `${t.completedBy?.firstName || ""} ${t.completedBy?.lastName || ""}`.trim() ||
        undefined
      }
      signatoryRole="Completed By"
    >
      {/* Status bar */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
        <StatusBadge
          status={(t.transferType || "internal").replace(/_/g, " ")}
          variant="info"
        />
        <StatusBadge status={t.priority || "routine"} variant="warning" />
        {t.status && <StatusBadge status={t.status.replace(/_/g, " ")} variant="success" />}
      </div>

      {/* From → To */}
      <DocumentMeta
        rows={[
          { label: "From Facility", value: t.fromFacility?.name || "—" },
          {
            label: "From Ward / Bed",
            value: t.admission?.bedAssignments?.[0]
              ? `${t.admission.bedAssignments[0].ward?.name || "—"} / Bed ${t.admission.bedAssignments[0].bed?.bedNumber || "—"}`
              : "—",
          },
          { label: "To Facility", value: t.toFacility?.name || "—" },
          {
            label: "To Department",
            value: t.toDepartment || "—",
          },
          { label: "To Contact", value: t.toContactPerson || "—" },
          { label: "To Phone", value: t.toContactPhone || "—" },
        ]}
      />

      {/* Transfer details */}
      <DocumentMeta
        rows={[
          {
            label: "Type",
            value: `${t.transferType} ${
              t.transferCategory ? `(${t.transferCategory.replace(/_/g, " ")})` : ""
            }`,
          },
          { label: "Priority", value: t.priority || "—" },
          {
            label: "Transport Method",
            value: (t.transportMethod || "—").replace(/_/g, " "),
          },
          { label: "Escort Required", value: t.escortRequired || "—" },
        ]}
      />

      {/* Reason */}
      {t.reason && (
        <DocumentSection title="Reason for Transfer">
          <div style={{ whiteSpace: "pre-wrap" }}>{t.reason}</div>
        </DocumentSection>
      )}

      {/* Clinical summary */}
      {t.clinicalSummary && (
        <DocumentSection title="Clinical Summary">
          <div style={{ whiteSpace: "pre-wrap" }}>{t.clinicalSummary}</div>
        </DocumentSection>
      )}

      {/* Handover summary */}
      {t.handoverSummary && (
        <DocumentSection title="Handover Summary">
          <div style={{ whiteSpace: "pre-wrap" }}>{t.handoverSummary}</div>
        </DocumentSection>
      )}

      <PrintDivider />

      {/* Signatures */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "32px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "200px", borderBottom: "1px dashed #94a3b8", marginBottom: "4px" }} />
          <div style={{ fontSize: "12px", fontWeight: 500 }}>
            {t.requestedBy?.firstName} {t.requestedBy?.lastName}
          </div>
          <div style={{ fontSize: "10px", color: "#64748b" }}>Requested By</div>
          <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
            {formatDate(t.requestedAt, true)}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "200px", borderBottom: "1px dashed #94a3b8", marginBottom: "4px" }} />
          <div style={{ fontSize: "12px", fontWeight: 500 }}>
            {t.completedBy?.firstName} {t.completedBy?.lastName || "—"}
          </div>
          <div style={{ fontSize: "10px", color: "#64748b" }}>Completed By</div>
          <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
            {t.completedAt ? formatDate(t.completedAt, true) : ""}
          </div>
        </div>
      </div>
    </PrintLayout>
  );
}

"use client";

// =====================================================================
// stock-transfer-template.tsx — printable stock transfer note.
// =====================================================================

import * as React from "react";
import { PrintLayout } from "@/components/print/print-layout";
import {
  DocumentSection,
  DocumentMeta,
  DocumentTable,
  PrintDivider,
  StatusBadge,
} from "@/components/print/document-primitives";
import { formatDate, formatCurrency } from "@/components/ui-helpers";

export function StockTransferTemplate({ t }: { t: any }) {
  if (!t) return null;

  return (
    <PrintLayout
      title="Stock Transfer Note"
      documentNumber={t.transferNumber || t.id}
      subtitle={t.transferType}
      paperSize="A4"
      signatory={
        `${t.requestedBy?.firstName || ""} ${t.requestedBy?.lastName || ""}`.trim() || undefined
      }
      signatoryRole="Requested By"
    >
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <StatusBadge status={t.status.replace(/_/g, " ")} variant={t.status === "cancelled" ? "danger" : "info"} />
        {t.priority && <StatusBadge status={t.priority} variant="warning" />}
      </div>

      <DocumentMeta
        rows={[
          { label: "Transfer Type", value: t.transferType || "—" },
          { label: "Request Date", value: formatDate(t.requestDate || t.createdAt, true) },
          { label: "From Facility", value: t.fromFacility?.name || "—" },
          { label: "To Facility", value: t.toFacility?.name || "—" },
          { label: "From Department", value: t.fromDepartment?.name || "—" },
          { label: "To Department", value: t.toDepartment?.name || "—" },
          { label: "Expected Date", value: t.expectedDate ? formatDate(t.expectedDate, true) : "—" },
          { label: "Transport Method", value: t.transportMethod ? t.transportMethod.replace(/_/g, " ") : "—" },
        ]}
      />

      <DocumentSection title="Line Items">
        <DocumentTable
          paperSize="A4"
          columns={[
            { key: "name", label: "Item", width: "40%" },
            { key: "qty", label: "Qty", align: "right" as const, width: "10%" },
            { key: "unit", label: "Unit", width: "10%" },
            { key: "batch", label: "Batch", width: "15%" },
            { key: "expiry", label: "Expiry", width: "15%" },
            { key: "notes", label: "Notes", width: "10%" },
          ]}
          numericColumns={["qty"]}
          rows={(t.items || []).map((it: any) => ({
            name: it.item?.name || it.itemName || "—",
            qty: String(it.quantity ?? "—"),
            unit: it.unit || it.item?.unit || "—",
            batch: it.batchNumber || "—",
            expiry: it.expiryDate ? formatDate(it.expiryDate) : "—",
            notes: it.notes || "—",
          }))}
        />
      </DocumentSection>

      <PrintDivider />

      {t.reason && (
        <DocumentSection title="Reason">
          <div style={{ whiteSpace: "pre-wrap", fontSize: "11px" }}>{t.reason}</div>
        </DocumentSection>
      )}

      {t.notes && (
        <DocumentSection title="Notes">
          <div style={{ whiteSpace: "pre-wrap", fontSize: "11px" }}>{t.notes}</div>
        </DocumentSection>
      )}

      {(t.approvedBy || t.approvedAt) && (
        <DocumentSection title="Approval">
          <DocumentMeta
            rows={[
              { label: "Approved By", value: t.approvedBy ? `${t.approvedBy.firstName} ${t.approvedBy.lastName}` : "—" },
              { label: "Approved At", value: t.approvedAt ? formatDate(t.approvedAt, true) : "—" },
              { label: "Approval Reason", value: t.approvalReason || "—" },
            ]}
          />
        </DocumentSection>
      )}
    </PrintLayout>
  );
}

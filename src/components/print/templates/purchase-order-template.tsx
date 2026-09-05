"use client";

// =====================================================================
// purchase-order-template.tsx — printable purchase order.
// =====================================================================

import * as React from "react";
import { PrintLayout } from "@/components/print/print-layout";
import {
  DocumentSection,
  DocumentMeta,
  DocumentTable,
  DocumentTotals,
  PrintDivider,
  StatusBadge,
} from "@/components/print/document-primitives";
import { formatDate, formatCurrency } from "@/components/ui-helpers";

export function PurchaseOrderTemplate({ po }: { po: any }) {
  if (!po) return null;

  const total = Number(po.total || 0);
  const tax = Number(po.taxAmount || 0);
  const shipping = Number(po.shippingCost || 0);
  const subtotal = total - tax - shipping;

  return (
    <PrintLayout
      title="Purchase Order"
      documentNumber={po.poNumber || po.orderNumber || po.id}
      subtitle={po.supplier?.name}
      paperSize="A4"
      signatory={
        `${po.requestedBy?.firstName || ""} ${po.requestedBy?.lastName || ""}`.trim() || undefined
      }
      signatoryRole="Requested By"
    >
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <StatusBadge status={po.status.replace(/_/g, " ")} variant={po.status === "cancelled" ? "danger" : "info"} />
        {po.priority && <StatusBadge status={po.priority} variant="warning" />}
      </div>

      <DocumentMeta
        rows={[
          { label: "Order Date", value: formatDate(po.orderDate || po.createdAt, true) },
          { label: "Expected Delivery", value: po.expectedDeliveryDate ? formatDate(po.expectedDeliveryDate, true) : "—" },
          { label: "Payment Terms", value: po.paymentTerms || "—" },
          { label: "Ship To", value: po.shipTo || po.facility?.name || "—" },
        ]}
      />

      <DocumentSection title="Supplier">
        <div style={{ fontSize: "11px" }}>
          <div style={{ fontWeight: 600 }}>{po.supplier?.name || "—"}</div>
          {po.supplier?.address && <div>{po.supplier.address}</div>}
          {po.supplier?.phone && <div>Tel: {po.supplier.phone}</div>}
          {po.supplier?.email && <div>Email: {po.supplier.email}</div>}
        </div>
      </DocumentSection>

      <DocumentSection title="Line Items">
        <DocumentTable
          paperSize="A4"
          columns={[
            { key: "description", label: "Description", width: "45%" },
            { key: "qty", label: "Qty", align: "right" as const, width: "10%" },
            { key: "unit", label: "Unit", width: "10%" },
            { key: "unitPrice", label: "Unit Price", align: "right" as const, width: "15%" },
            { key: "total", label: "Total", align: "right" as const, width: "20%" },
          ]}
          numericColumns={["qty", "unitPrice", "total"]}
          rows={(po.items || []).map((it: any) => ({
            description: it.description || it.itemName || it.name || "—",
            qty: String(it.quantity ?? "—"),
            unit: it.unit || "—",
            unitPrice: formatCurrency(it.unitPrice),
            total: formatCurrency(Number(it.quantity || 0) * Number(it.unitPrice || 0)),
          }))}
        />
      </DocumentSection>

      <DocumentTotals
        paperSize="A4"
        rows={[
          { label: "Subtotal", value: formatCurrency(subtotal) },
          ...(tax > 0 ? [{ label: "Tax", value: formatCurrency(tax) }] : []),
          ...(shipping > 0 ? [{ label: "Shipping", value: formatCurrency(shipping) }] : []),
          { label: "Total", value: formatCurrency(total), strong: true },
        ]}
      />

      <PrintDivider />

      {(po.notes || po.termsAndConditions) && (
        <DocumentSection title="Notes & Terms">
          {po.notes && (
            <div style={{ marginBottom: "6px", whiteSpace: "pre-wrap", fontSize: "11px" }}>{po.notes}</div>
          )}
          {po.termsAndConditions && (
            <div style={{ whiteSpace: "pre-wrap", fontSize: "11px" }}>{po.termsAndConditions}</div>
          )}
        </DocumentSection>
      )}

      {(po.approvedBy || po.approvedAt) && (
        <DocumentSection title="Approval">
          <DocumentMeta
            rows={[
              { label: "Approved By", value: po.approvedBy ? `${po.approvedBy.firstName} ${po.approvedBy.lastName}` : "—" },
              { label: "Approved At", value: po.approvedAt ? formatDate(po.approvedAt, true) : "—" },
              { label: "Approval Reason", value: po.approvalReason || "—" },
              { label: "Acknowledged", value: po.supplierAckStatus ? po.supplierAckStatus.replace(/_/g, " ") : "—" },
            ]}
          />
        </DocumentSection>
      )}
    </PrintLayout>
  );
}

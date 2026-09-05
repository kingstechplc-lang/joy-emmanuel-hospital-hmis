"use client";

// =====================================================================
// report-template.tsx — generic printable report template.
//
// Used for any printable report that doesn't have a dedicated template
// (intake/output charts, stock transfer notes, purchase orders, system
// reports, etc.).  Wraps the caller's content in a PrintLayout with
// facility header, title, optional patient header, and footer.
//
// This is the "fallback" template — prefer a dedicated template
// (DischargeTemplate, TransferTemplate, etc.) when one exists.
// =====================================================================

import * as React from "react";
import { PrintLayout } from "@/components/print/print-layout";
import type { PaperSize } from "@/lib/print/paper-profiles";

export function ReportTemplate({
  title,
  subtitle,
  documentNumber,
  patient,
  children,
  paperSize = "A4",
  signatory,
  signatoryRole,
  extraPatientRows,
}: {
  title: string;
  subtitle?: string;
  documentNumber?: string;
  patient?: any;
  children: React.ReactNode;
  paperSize?: PaperSize;
  signatory?: string;
  signatoryRole?: string;
  extraPatientRows?: { label: string; value: React.ReactNode }[];
}) {
  return (
    <PrintLayout
      title={title}
      subtitle={subtitle}
      documentNumber={documentNumber}
      patient={patient}
      extraPatientRows={extraPatientRows}
      paperSize={paperSize}
      signatory={signatory}
      signatoryRole={signatoryRole}
    >
      {children}
    </PrintLayout>
  );
}

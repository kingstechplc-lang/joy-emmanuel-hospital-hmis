"use client";

// =====================================================================
// print-layout.tsx  (v2 — extended to support paper profiles, facility
// context, and print audit logging)
//
// Backward compatibility: the original `PrintLayout` + `PrintButton`
// exports still work.  Existing call sites that don't pass a `paperSize`
// get "A4" by default — same as before.
//
// New capabilities:
//   - `paperSize` prop on PrintLayout + PrintButton (A4, A5, THERMAL_80, THERMAL_58)
//   - `orientation` prop (portrait/landscape) — A4/A5 only
//   - `documentType` prop on PrintButton — used for audit logging + to
//     pick the default paper format if `paperSize` is not specified
//   - `recordId` + `recordSummary` props on PrintButton — for the
//     audit-log entry (e.g., `recordId="INV-2026-000001"`)
//   - Facility branding auto-loaded from the FacilityPrintProvider if
//     the caller doesn't pass an explicit `facility` prop
//   - Print audit log: POSTs to `/api/print-log` on every print
//
// The popup-window technique is preserved — it's the existing
// working pattern and there's no PDF-generation library in the repo.
// =====================================================================

import * as React from "react";
import {
  PAPER_PROFILES,
  PaperSize,
  Orientation,
  DocumentType,
  DOCUMENT_TYPES,
  buildPageCssRule,
  buildBodyStyle,
} from "@/lib/print/paper-profiles";
import { useFacilityBranding, type FacilityBranding } from "@/components/print/facility-print-context";
import {
  DocumentPage,
  FacilityHeader,
  DocumentTitle,
  PatientHeader,
  SignatureBlock,
  DocumentFooter,
} from "@/components/print/document-primitives";

// =====================================================================
// PrintLayout  (v2)
// =====================================================================

export function PrintLayout({
  title,
  subtitle,
  facility,
  patient,
  documentNumber,
  children,
  signatory,
  signatoryRole,
  paperSize = "A4",
  extraPatientRows,
}: {
  title: string;
  subtitle?: string;
  /** If omitted, the active facility branding is auto-loaded from context. */
  facility?: any;
  patient?: any;
  documentNumber?: string;
  children: React.ReactNode;
  signatory?: string;
  signatoryRole?: string;
  paperSize?: PaperSize;
  /** Additional rows to display in the patient header (e.g., Encounter Number). */
  extraPatientRows?: { label: string; value: React.ReactNode }[];
}) {
  // Auto-load facility branding from context if not explicitly passed.
  const ctxFacility = useFacilityBranding();
  const resolvedFacility: FacilityBranding | null | undefined =
    facility ?? ctxFacility;

  return (
    <DocumentPage paperSize={paperSize}>
      <FacilityHeader facility={resolvedFacility} paperSize={paperSize} />
      <DocumentTitle
        title={title}
        subtitle={subtitle}
        documentNumber={documentNumber}
        paperSize={paperSize}
      />
      {patient && (
        <PatientHeader
          patient={patient}
          paperSize={paperSize}
          extraRows={extraPatientRows}
        />
      )}
      <div style={{ minHeight: "100px" }}>{children}</div>
      <SignatureBlock
        signatory={signatory}
        signatoryRole={signatoryRole}
        paperSize={paperSize}
      />
      <DocumentFooter facility={resolvedFacility} paperSize={paperSize} />
    </DocumentPage>
  );
}

// =====================================================================
// PrintButton  (v2)
// =====================================================================

export function PrintButton({
  label = "Print",
  className = "",
  renderContent,
  paperSize,
  orientation,
  documentType,
  recordId,
  recordSummary,
}: {
  label?: string;
  className?: string;
  /** Render the document body (PrintLayout + children) into a popup window. */
  renderContent: () => React.ReactNode;
  /** Paper format.  If omitted, the document type's default is used. */
  paperSize?: PaperSize;
  /** Orientation (A4/A5 only; thermal is always portrait). */
  orientation?: Orientation;
  /** Document type — used for audit log + to pick the default paperSize. */
  documentType?: DocumentType;
  /** Authoritative record ID for audit logging (e.g., invoice id). */
  recordId?: string;
  /** Short human-readable summary for audit log (e.g., "INV-2026-000001"). */
  recordSummary?: string;
}) {
  const handlePrint = async () => {
    // Resolve paper size.
    let size: PaperSize = paperSize || "A4";
    if (!paperSize && documentType) {
      size = DOCUMENT_TYPES[documentType].defaultPaper;
    }
    const profile = PAPER_PROFILES[size];
    const orient: Orientation =
      orientation || (documentType ? DOCUMENT_TYPES[documentType].defaultOrientation : profile.defaultOrientation);

    const content = renderContent();
    const printWindow = window.open("", "_blank", "width=900,height=1100");
    if (!printWindow) {
      alert("Please allow popups to print this document.");
      return;
    }

    const ReactDOMServer = await import("react-dom/server");
    const html = ReactDOMServer.renderToStaticMarkup(content);

    const pageCss = buildPageCssRule(profile, orient);
    const bodyStyle = buildBodyStyle(profile);
    const bodyStyleStr = Object.entries(bodyStyle)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}: ${v}`)
      .join("; ");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${label} — Joy Emmanuel Hospital HMIS</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { ${bodyStyleStr} }
          ${pageCss}
          @media print {
            body { padding: 0; margin: 0; }
            .no-print { display: none !important; }
            /* Avoid breaking inside table rows / signatures / totals */
            tr, .avoid-break { break-inside: avoid; }
            thead { display: table-header-group; }
          }
          /* For thermal, ensure the body width matches the printer width
             and the document grows naturally with content (no min-height). */
          ${profile.thermal ? `body { min-height: auto !important; }` : ""}
        </style>
      </head>
      <body>
        ${html}
        <div class="no-print" style="position:fixed;bottom:20px;left:0;right:0;text-align:center;padding:12px;background:white;border-top:1px solid #e2e8f0;">
          <button onclick="window.print()" style="background:#059669;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;margin-right:8px;">Print Document</button>
          <button onclick="window.close()" style="background:#64748b;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;">Close</button>
        </div>
        <script>
          // Wait for images + fonts to load before opening the print dialog.
          window.onload = function() {
            setTimeout(function(){ window.print(); }, 300);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();

    // Fire-and-forget audit log entry (non-blocking).
    if (documentType) {
      try {
        await fetch("/api/print-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentType,
            paperSize: size,
            orientation: orient,
            recordId: recordId || null,
            recordSummary: recordSummary || null,
          }),
        });
      } catch {
        // Audit logging is best-effort — never block printing on it.
      }
    }
  };

  return (
    <button
      onClick={handlePrint}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition ${className}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      {label}
    </button>
  );
}

// =====================================================================
// Compact print button variant — for inline action rows where space is
// tight (e.g., inside a table row's actions cell).
// =====================================================================

export function PrintIconButton({
  onClick,
  title = "Print",
  className = "",
}: {
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition ${className}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
    </button>
  );
}

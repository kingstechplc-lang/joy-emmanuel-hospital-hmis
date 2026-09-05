"use client";

// =====================================================================
// document-primitives.tsx
//
// Shared, reusable print document primitives used by every document
// template (Receipt, Invoice, LabReport, Prescription, etc.).
//
// All styling is INLINE (style={{}}).  This is deliberate:
//   1. The print popup window renders via renderToStaticMarkup — Tailwind
//      classes don't apply in the popup because the popup doesn't load
//      the app's CSS bundle.
//   2. Inline styles survive the popup-window technique and produce
//      consistent visual output regardless of the parent app's
//      stylesheet.
//
// Every primitive accepts an optional `style` prop so callers can
// override individual style attributes when needed.
//
// Thermal vs A4/A5: primitives auto-scale based on the active
// PaperProfile.  Pass `paperSize` to any primitive that should know
// about it; otherwise it defaults to "A4".
//
// Per spec (Section 25):
//   DocumentPage, DocumentHeader, DocumentFooter, FacilityHeader,
//   PatientHeader, DocumentTitle, DocumentMeta, DocumentTable,
//   DocumentSection, DocumentTotals, SignatureBlock
// =====================================================================

import * as React from "react";
import { ShieldPlus, Phone, Mail, MapPin, Globe } from "lucide-react";
import {
  PAPER_PROFILES,
  PaperSize,
  PaperProfile,
  buildBodyStyle,
} from "@/lib/print/paper-profiles";
import type { FacilityBranding } from "@/components/print/facility-print-context";

// ─── Helpers ────────────────────────────────────────────────────────

function getProfile(paperSize: PaperSize): PaperProfile {
  return PAPER_PROFILES[paperSize];
}

function fontPx(profile: PaperProfile, base: number): number {
  return Number((base * profile.fontScale).toFixed(2));
}

function spacingPx(profile: PaperProfile, base: number): number {
  // Spacing scales slightly less aggressively than font for thermal.
  return Number((base * (profile.thermal ? 0.7 : 1.0)).toFixed(2));
}

// ─── DocumentPage ──────────────────────────────────────────────────

export function DocumentPage({
  paperSize = "A4",
  children,
  style,
}: {
  paperSize?: PaperSize;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const profile = getProfile(paperSize);
  const bodyStyle = buildBodyStyle(profile) as React.CSSProperties;
  return (
    <div
      style={{
        ...bodyStyle,
        // For thermal, the document grows naturally — no min-height.
        // For A4/A5, we let the content flow and let the @page rule
        // handle page breaks (rather than forcing a fixed page height).
        ...(style || {}),
      }}
    >
      {children}
    </div>
  );
}

// ─── FacilityHeader ────────────────────────────────────────────────

export function FacilityHeader({
  facility,
  paperSize = "A4",
  showContactInfo = true,
}: {
  facility?: FacilityBranding | null;
  paperSize?: PaperSize;
  /** Thermal receipts sometimes hide contact info to save space. */
  showContactInfo?: boolean;
}) {
  const profile = getProfile(paperSize);
  const name = facility?.name || "Joy Emmanuel Hospital";
  const addressParts: string[] = [];
  if (facility?.address) addressParts.push(facility.address);
  if (facility?.city) addressParts.push(facility.city);
  if (facility?.region) addressParts.push(facility.region);
  if (facility?.country) addressParts.push(facility.country);
  const address = addressParts.join(", ") || "Accra, Ghana";
  const phone = facility?.phone || "+233 30 000 0000";
  const email = facility?.email || "info@joyemmanuelhospital.org";
  const logoUrl = facility?.logoUrl || null;

  // Thermal: compact logo (32px or none), centered header.
  // A4/A5: 56px logo on the left, name + contact on the right.
  if (profile.thermal) {
    return (
      <div
        style={{
          textAlign: "center",
          borderBottom: `1px dashed #94a3b8`,
          paddingBottom: spacingPx(profile, 6),
          marginBottom: spacingPx(profile, 8),
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={name}
            style={{
              maxWidth: "40mm",
              maxHeight: "20mm",
              margin: "0 auto",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: "32px",
              height: "32px",
              background: "linear-gradient(135deg, #059669, #0d9488)",
              borderRadius: "8px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
            }}
          >
            <ShieldPlus size={18} />
          </div>
        )}
        <div style={{ fontSize: fontPx(profile, 13), fontWeight: 700, marginTop: spacingPx(profile, 4) }}>
          {name}
        </div>
        {showContactInfo && (
          <div style={{ fontSize: fontPx(profile, 9), color: "#64748b", marginTop: spacingPx(profile, 2) }}>
            {address}
          </div>
        )}
        {showContactInfo && (
          <div style={{ fontSize: fontPx(profile, 9), color: "#64748b" }}>
            Tel: {phone}
            {email ? ` • ${email}` : ""}
          </div>
        )}
      </div>
    );
  }

  // A4 / A5 — professional header with logo on left, name + contact on right.
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "2px solid #059669",
        paddingBottom: spacingPx(profile, 12),
        marginBottom: spacingPx(profile, 16),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={name}
            style={{
              maxWidth: "60mm",
              maxHeight: "24mm",
              objectFit: "contain",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: "56px",
              height: "56px",
              background: "linear-gradient(135deg, #059669, #0d9488)",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              flexShrink: 0,
            }}
          >
            <ShieldPlus size={28} />
          </div>
        )}
        <div>
          <h1 style={{ fontSize: fontPx(profile, 18), fontWeight: 700, color: "#0f172a", margin: 0 }}>
            {name}
          </h1>
          <div
            style={{
              fontSize: fontPx(profile, 10),
              color: "#64748b",
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              marginTop: "2px",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <MapPin size={10} /> {address}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <Phone size={10} /> {phone}
            </span>
            {email && (
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Mail size={10} /> {email}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DocumentTitle ────────────────────────────────────────────────

export function DocumentTitle({
  title,
  subtitle,
  documentNumber,
  paperSize = "A4",
}: {
  title: string;
  subtitle?: string;
  documentNumber?: string;
  paperSize?: PaperSize;
}) {
  const profile = getProfile(paperSize);
  if (profile.thermal) {
    return (
      <div style={{ textAlign: "center", marginBottom: spacingPx(profile, 8) }}>
        <h2
          style={{
            fontSize: fontPx(profile, 12),
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "#0f172a",
            margin: 0,
          }}
        >
          {title}
        </h2>
        {documentNumber && (
          <div
            style={{
              marginTop: spacingPx(profile, 2),
              fontSize: fontPx(profile, 10),
              fontFamily: "monospace",
              color: "#475569",
            }}
          >
            {documentNumber}
          </div>
        )}
        {subtitle && (
          <p style={{ fontSize: fontPx(profile, 9), color: "#64748b", marginTop: spacingPx(profile, 2) }}>
            {subtitle}
          </p>
        )}
      </div>
    );
  }
  return (
    <div style={{ textAlign: "center", marginBottom: spacingPx(profile, 16) }}>
      <h2
        style={{
          fontSize: fontPx(profile, 16),
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#0f172a",
          margin: 0,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: fontPx(profile, 11), color: "#64748b", marginTop: "2px" }}>
          {subtitle}
        </p>
      )}
      {documentNumber && (
        <div
          style={{
            display: "inline-block",
            marginTop: spacingPx(profile, 6),
            padding: "2px 12px",
            background: "#f1f5f9",
            borderRadius: "4px",
            fontSize: fontPx(profile, 11),
            fontFamily: "monospace",
            color: "#475569",
          }}
        >
          {documentNumber}
        </div>
      )}
    </div>
  );
}

// ─── PatientHeader ───────────────────────────────────────────────

export function PatientHeader({
  patient,
  paperSize = "A4",
  extraRows,
}: {
  patient?: any;
  paperSize?: PaperSize;
  /** Extra rows to display in the patient header (e.g., Encounter Number). */
  extraRows?: { label: string; value: React.ReactNode }[];
}) {
  const profile = getProfile(paperSize);
  if (!patient) return null;

  const age = patient.dateOfBirth
    ? `${new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()} years`
    : "—";
  const fullName = `${patient.firstName || ""} ${patient.lastName || ""}`.trim();

  if (profile.thermal) {
    // Compact 2-column layout for thermal — patient name + MRN only.
    return (
      <div
        style={{
          borderTop: "1px dashed #cbd5e1",
          borderBottom: "1px dashed #cbd5e1",
          padding: `${spacingPx(profile, 4)}px 0`,
          marginBottom: spacingPx(profile, 6),
          fontSize: fontPx(profile, 10),
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>{fullName}</span>
          {patient.patientNumber && (
            <span style={{ fontFamily: "monospace", color: "#475569" }}>{patient.patientNumber}</span>
          )}
        </div>
        {extraRows && extraRows.length > 0 && (
          <div style={{ marginTop: spacingPx(profile, 2), color: "#64748b" }}>
            {extraRows.map((row, i) => (
              <div key={i} style={{ fontSize: fontPx(profile, 9) }}>
                {row.label}: {row.value || "—"}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // A4 / A5 — full patient info grid.
  return (
    <div
      style={{
        background: "#f8fafc",
        borderRadius: "8px",
        padding: spacingPx(profile, 10),
        marginBottom: spacingPx(profile, 12),
        border: "1px solid #e2e8f0",
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: `4px ${spacingPx(profile, 12)}px`,
      }}
    >
      <InfoRow label="Patient Name" value={fullName} profile={profile} />
      <InfoRow label="Patient ID" value={patient.patientNumber} profile={profile} />
      <InfoRow label="Age" value={age} profile={profile} />
      <InfoRow label="Sex" value={patient.sex} profile={profile} />
      <InfoRow label="Phone" value={patient.phone} profile={profile} />
      <InfoRow label="Blood Group" value={patient.bloodGroup} profile={profile} />
      {extraRows?.map((row, i) => (
        <InfoRow key={i} label={row.label} value={row.value} profile={profile} />
      ))}
    </div>
  );
}

// ─── InfoRow (internal helper) ─────────────────────────────────

function InfoRow({
  label,
  value,
  profile,
}: {
  label: string;
  value: React.ReactNode;
  profile: PaperProfile;
}) {
  return (
    <div style={{ display: "flex", marginBottom: "2px" }}>
      <span
        style={{
          fontSize: fontPx(profile, 11),
          fontWeight: 500,
          color: "#64748b",
          width: "120px",
          flexShrink: 0,
        }}
      >
        {label}:
      </span>
      <span style={{ fontSize: fontPx(profile, 11), color: "#0f172a", fontWeight: 500, flex: 1 }}>
        {value || "—"}
      </span>
    </div>
  );
}

// ─── DocumentMeta ─────────────────────────────────────────────────

export function DocumentMeta({
  rows,
  paperSize = "A4",
}: {
  /** Two-column meta rows: label on left, value on right. */
  rows: { label: string; value: React.ReactNode }[];
  paperSize?: PaperSize;
}) {
  const profile = getProfile(paperSize);
  if (profile.thermal) {
    return (
      <div style={{ marginBottom: spacingPx(profile, 6), fontSize: fontPx(profile, 10) }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
            <span style={{ color: "#64748b" }}>{row.label}:</span>
            <span style={{ fontWeight: 500 }}>{row.value || "—"}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: `2px ${spacingPx(profile, 12)}px`,
        marginBottom: spacingPx(profile, 12),
        fontSize: fontPx(profile, 11),
      }}
    >
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex" }}>
          <span style={{ color: "#64748b", width: "140px", flexShrink: 0 }}>{row.label}:</span>
          <span style={{ color: "#0f172a", fontWeight: 500 }}>{row.value || "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ─── DocumentSection ──────────────────────────────────────────

export function DocumentSection({
  title,
  children,
  paperSize = "A4",
}: {
  title?: string;
  children: React.ReactNode;
  paperSize?: PaperSize;
}) {
  const profile = getProfile(paperSize);
  return (
    <div
      style={{
        marginTop: spacingPx(profile, 12),
        // Keep heading + content together; do not split immediately after the heading.
        breakInside: "avoid",
      }}
    >
      {title && (
        <h3
          style={{
            fontSize: fontPx(profile, 12),
            fontWeight: 600,
            color: "#334155",
            marginBottom: spacingPx(profile, 4),
            paddingBottom: spacingPx(profile, 2),
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          {title}
        </h3>
      )}
      <div>{children}</div>
    </div>
  );
}

// ─── DocumentTable ────────────────────────────────────────────

export interface DocumentTableColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
}

export function DocumentTable({
  columns,
  rows,
  paperSize = "A4",
  numericColumns = [],
}: {
  columns: DocumentTableColumn[];
  /** rows: array of objects keyed by column.key */
  rows: Record<string, React.ReactNode>[];
  paperSize?: PaperSize;
  /** Column keys that should be right-aligned (numeric / financial) */
  numericColumns?: string[];
}) {
  const profile = getProfile(paperSize);
  const headerFontSize = fontPx(profile, profile.thermal ? 9 : 11);
  const cellFontSize = fontPx(profile, profile.thermal ? 9 : 11);

  if (profile.thermal) {
    // Thermal: simplified table — no borders, just rows separated by space.
    // Long item names wrap safely; long references wrap safely.
    return (
      <div style={{ marginBottom: spacingPx(profile, 6) }}>
        {/* Header row */}
        <div
          style={{
            display: "flex",
            fontWeight: 600,
            borderBottom: "1px dashed #94a3b8",
            paddingBottom: spacingPx(profile, 2),
            marginBottom: spacingPx(profile, 2),
            fontSize: headerFontSize,
          }}
        >
          {columns.map((col) => (
            <div
              key={col.key}
              style={{
                flex: col.width ? undefined : 1,
                width: col.width,
                textAlign: col.align || (numericColumns.includes(col.key) ? "right" : "left"),
                ...(col.align === "right" ? { marginLeft: "4px" } : {}),
              }}
            >
              {col.label}
            </div>
          ))}
        </div>
        {/* Data rows */}
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              padding: `${spacingPx(profile, 1)}px 0`,
              fontSize: cellFontSize,
              // Avoid breaking a row across pages — supported in modern browsers.
              breakInside: "avoid",
            }}
          >
            {columns.map((col) => (
              <div
                key={col.key}
                style={{
                  flex: col.width ? undefined : 1,
                  width: col.width,
                  textAlign: col.align || (numericColumns.includes(col.key) ? "right" : "left"),
                  wordBreak: "break-word",
                }}
              >
                {row[col.key] ?? "—"}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // A4 / A5 — proper bordered table with print-safe behavior.
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        marginBottom: spacingPx(profile, 12),
        fontSize: cellFontSize,
        // Repeat header row on each printed page.
        // @ts-expect-error - thead display mode is non-standard but widely supported.
        "& thead": { display: "table-header-group" },
      }}
    >
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              style={{
                width: col.width,
                textAlign: col.align || (numericColumns.includes(col.key) ? "right" : "left"),
                background: "#f1f5f9",
                color: "#334155",
                fontWeight: 600,
                padding: `${spacingPx(profile, 6)}px ${spacingPx(profile, 8)}px`,
                borderBottom: "2px solid #cbd5e1",
                fontSize: headerFontSize,
              }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ breakInside: "avoid" }}>
            {columns.map((col) => (
              <td
                key={col.key}
                style={{
                  textAlign: col.align || (numericColumns.includes(col.key) ? "right" : "left"),
                  padding: `${spacingPx(profile, 6)}px ${spacingPx(profile, 8)}px`,
                  borderBottom: "1px solid #e2e8f0",
                  color: "#0f172a",
                  wordBreak: "break-word",
                }}
              >
                {row[col.key] ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── DocumentTotals ──────────────────────────────────────────

export function DocumentTotals({
  rows,
  paperSize = "A4",
}: {
  /** Each row: { label, value, strong? }  strong rows are bolded (e.g., TOTAL). */
  rows: { label: string; value: React.ReactNode; strong?: boolean }[];
  paperSize?: PaperSize;
}) {
  const profile = getProfile(paperSize);
  if (profile.thermal) {
    return (
      <div
        style={{
          borderTop: "1px dashed #94a3b8",
          marginTop: spacingPx(profile, 4),
          paddingTop: spacingPx(profile, 4),
          marginBottom: spacingPx(profile, 4),
          fontSize: fontPx(profile, 10),
        }}
      >
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "1px 0",
              fontWeight: row.strong ? 700 : 400,
              fontSize: fontPx(profile, row.strong ? 12 : 10),
            }}
          >
            <span>{row.label}</span>
            <span>{row.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div
      style={{
        marginTop: spacingPx(profile, 8),
        marginLeft: "auto",
        width: "260px",
        fontSize: fontPx(profile, 11),
      }}
    >
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: `${spacingPx(profile, 4)}px 0`,
            fontWeight: row.strong ? 700 : 400,
            fontSize: fontPx(profile, row.strong ? 13 : 11),
            borderTop: row.strong ? "2px solid #059669" : "none",
            color: row.strong ? "#059669" : "#0f172a",
          }}
        >
          <span>{row.label}</span>
          <span>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── SignatureBlock ──────────────────────────────────────────

export function SignatureBlock({
  signatory,
  signatoryRole,
  paperSize = "A4",
}: {
  signatory?: string;
  signatoryRole?: string;
  paperSize?: PaperSize;
}) {
  const profile = getProfile(paperSize);
  if (!signatory && !signatoryRole) return null;
  if (profile.thermal) {
    return (
      <div style={{ marginTop: spacingPx(profile, 8), textAlign: "center", fontSize: fontPx(profile, 9) }}>
        {signatory && <div style={{ fontWeight: 600 }}>{signatory}</div>}
        {signatoryRole && <div style={{ color: "#64748b" }}>{signatoryRole}</div>}
      </div>
    );
  }
  return (
    <div style={{ marginTop: spacingPx(profile, 32), display: "flex", justifyContent: "flex-end" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: "200px", borderBottom: "1px dashed #94a3b8", marginBottom: "4px" }} />
        {signatory && (
          <div style={{ fontSize: fontPx(profile, 12), fontWeight: 500, color: "#334155" }}>{signatory}</div>
        )}
        {signatoryRole && (
          <div style={{ fontSize: fontPx(profile, 10), color: "#64748b" }}>{signatoryRole}</div>
        )}
      </div>
    </div>
  );
}

// ─── DocumentFooter ──────────────────────────────────────────

export function DocumentFooter({
  facility,
  printedBy,
  paperSize = "A4",
  confidentialityNotice = true,
}: {
  facility?: FacilityBranding | null;
  /** Name of the user who triggered the print, for the "Printed by" footer line. */
  printedBy?: string;
  paperSize?: PaperSize;
  /** Whether to show the standard "Confidential — contains patient health information" notice. */
  confidentialityNotice?: boolean;
}) {
  const profile = getProfile(paperSize);
  const now = new Date().toLocaleString("en-GB");
  const facilityLine = facility
    ? `${facility.name}${facility.address ? ` • ${facility.address}` : ""}`
    : "";

  if (profile.thermal) {
    return (
      <div
        style={{
          marginTop: spacingPx(profile, 6),
          paddingTop: spacingPx(profile, 4),
          borderTop: "1px dashed #94a3b8",
          textAlign: "center",
          fontSize: fontPx(profile, 8),
          color: "#94a3b8",
        }}
      >
        {confidentialityNotice && <div>Confidential — Patient Health Information</div>}
        <div>Printed {now}{printedBy ? ` by ${printedBy}` : ""}</div>
        {facilityLine && <div>{facilityLine}</div>}
      </div>
    );
  }
  return (
    <div
      style={{
        marginTop: spacingPx(profile, 32),
        paddingTop: spacingPx(profile, 12),
        borderTop: "1px solid #e2e8f0",
        fontSize: fontPx(profile, 10),
        color: "#94a3b8",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          {confidentialityNotice && (
            <p style={{ fontWeight: 500, color: "#64748b" }}>
              Confidential — contains protected patient health information
            </p>
          )}
          <p>
            Generated by Joy Emmanuel Hospital HMIS on {now}
            {printedBy ? ` • Printed by ${printedBy}` : ""}
          </p>
          {facilityLine && <p>{facilityLine}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── StatusBadge (text-based, print-safe, no color reliance) ────────

export function StatusBadge({
  status,
  variant = "neutral",
  paperSize = "A4",
}: {
  status: string;
  /** Use the variant to set the border color only; the text always renders
   *  in the same color so color is not the sole indicator. */
  variant?: "neutral" | "success" | "warning" | "danger" | "info";
  paperSize?: PaperSize;
}) {
  const profile = getProfile(paperSize);
  const borderColor =
    variant === "success"
      ? "#059669"
      : variant === "warning"
      ? "#d97706"
      : variant === "danger"
      ? "#dc2626"
      : variant === "info"
      ? "#2563eb"
      : "#94a3b8";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        border: `1px solid ${borderColor}`,
        borderRadius: "4px",
        fontSize: fontPx(profile, 9),
        fontWeight: 600,
        color: "#0f172a",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {status}
    </span>
  );
}

// ─── FlagIndicator (lab result flag — print-safe) ────────────────

export function FlagIndicator({
  flag,
  paperSize = "A4",
}: {
  /** flag: "normal" | "abnormal" | "critical" | "low" | "high" */
  flag?: string;
  paperSize?: PaperSize;
}) {
  const profile = getProfile(paperSize);
  if (!flag || flag === "normal") {
    return (
      <span style={{ fontSize: fontPx(profile, 10), fontWeight: 600, color: "#475569" }}>
        NORMAL
      </span>
    );
  }
  const text = flag.toUpperCase();
  const borderColor =
    flag === "critical" ? "#dc2626" : flag === "abnormal" ? "#d97706" : "#475569";
  return (
    <span
      style={{
        fontSize: fontPx(profile, 10),
        fontWeight: 700,
        color: "#0f172a",
        border: `1px solid ${borderColor}`,
        padding: "1px 4px",
        borderRadius: "3px",
      }}
    >
      {text}
    </span>
  );
}

// ─── Divider (thermal separators) ───────────────────────────────

export function PrintDivider({ paperSize = "A4" }: { paperSize?: PaperSize }) {
  const profile = getProfile(paperSize);
  return (
    <div
      style={{
        borderTop: profile.thermal ? "1px dashed #94a3b8" : "1px solid #e2e8f0",
        margin: `${spacingPx(profile, 6)}px 0`,
      }}
    />
  );
}

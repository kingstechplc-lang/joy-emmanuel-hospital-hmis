"use client";

// =====================================================================
// wristband-template.tsx
//
// Thermal-printer wristband template for Phase 8 CDSS.
// Designed for 58mm and 80mm thermal wristband printers (Zebra ZD420,
// Brother TD-2120N, etc.) but also prints fine on A4 for laminated
// badge-style wristbands.
//
// LAYOUT (top to bottom, single column):
//
//   ┌──────────────────────────────────────┐
//   │  [Facility Name]      [Facility Code]  │  ← Branding row
//   │  ───────────────────────────────────  │  ← Divider
//   │  ⚠ ALLERGY ALERT: Penicillin, Sulfa   │  ← Red banner IF allergies
//   │  ───────────────────────────────────  │
//   │  ESTHER OHEMAA SERWAA                 │  ← Patient name (large)
//   │  MRN: JEM-00000006    F / 34y          │  ← MRN + sex/age
//   │  DOB: 1991-04-12      Blood: O+        │  ← DOB + blood group
//   │  ───────────────────────────────────  │
//   │         ┌─────────────┐                │
//   │         │             │                │
//   │         │   [QR CODE] │                │  ← Large, central QR
//   │         │             │                │
//   │         └─────────────┘                │
//   │       /wb/<token-shorthand>            │  ← Token label
//   │  ───────────────────────────────────  │
//   │  ENC-2026-000008 · OPD                 │  ← Encounter row (if any)
//   │  Issued: 09 Sep 2026, 14:30            │  ← Issued timestamp
//   └──────────────────────────────────────┘
//
// DESIGN PRINCIPLES:
//   - High contrast: pure black on white for maximum QR scan reliability
//   - Large name (16-18pt) so clinicians can read it at arm's length
//   - MRN, DOB, blood group always present — these are the fields
//     clinicians need for bedside verification
//   - Allergy banner is RED BOLD only when there are active allergies
//     (silent if no allergies — don't cry wolf)
//   - QR code is at least 28mm (110px @ 96dpi) so even cheap smartphone
//     cameras can scan it through a transparent wristband sleeve
//   - "Token shorthand" under the QR shows the last 8 chars of the
//     token, so a clinician can manually verify the wristband if the
//     QR scanner is broken
// =====================================================================

import * as React from "react";
import { QrCodeSvg } from "@/components/ui/qr-code-svg";
import { formatDate } from "@/components/ui-helpers";
import type { WristbandContent } from "@/lib/wristband/assembler";

type WristbandTemplateProps = {
  /** The assembled wristband content (patient + encounter + facility + allergies + qrPayload + token). */
  content: WristbandContent;
  /** Paper size — controls font scale + wristband width. */
  paperSize?: "THERMAL_58" | "THERMAL_80" | "A4";
  /** Show the "Issued by" line at the bottom (off for the on-screen preview, on for print). */
  showIssuedAt?: boolean;
};

const BLOOD_GROUP_COLORS: Record<string, string> = {
  "O+": "#dc2626",
  "O-": "#dc2626",
  "A+": "#2563eb",
  "A-": "#2563eb",
  "B+": "#16a34a",
  "B-": "#16a34a",
  "AB+": "#7c3aed",
  "AB-": "#7c3aed",
};

const SEX_LABEL: Record<string, string> = {
  male: "M",
  female: "F",
  intersex: "I",
  unknown: "?",
};

export function WristbandTemplate({
  content,
  paperSize = "THERMAL_58",
  showIssuedAt = true,
}: WristbandTemplateProps) {
  if (!content) return null;

  const c = content;
  const is80 = paperSize === "THERMAL_80";
  const isA4 = paperSize === "A4";

  // Font scales per paper profile
  const fontScale = isA4 ? 1.4 : is80 ? 1.15 : 1;
  const baseFont = 10 * fontScale; // base body font size in pt
  const nameFont = 16 * fontScale; // patient name large font
  const smallFont = 8 * fontScale; // meta info small font
  const qrSize = isA4 ? 200 : is80 ? 180 : 140;

  // Allergy banner
  const allergySeverityColor =
    c.highestAllergySeverity === "anaphylactic"
      ? "#7f1d1d"
      : c.highestAllergySeverity === "severe"
        ? "#dc2626"
        : "#ea580c";

  // Blood group color
  const bloodColor = c.patient.bloodGroup
    ? BLOOD_GROUP_COLORS[c.patient.bloodGroup.toUpperCase()] || "#374151"
    : "#374151";

  // Token shorthand (last 8 chars of the UUID)
  const tokenShort = c.token.slice(-8).toUpperCase();
  const issuedAt = c.issuedAt ? formatDate(c.issuedAt, true) : "";

  return (
    <div
      style={{
        width: "100%",
        background: "#ffffff",
        color: "#000000",
        fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
        padding: `${6 * fontScale}pt ${8 * fontScale}pt`,
        boxSizing: "border-box",
        // Wristband print profile — no page breaks
        pageBreakInside: "avoid",
      }}
    >
      {/* Facility branding row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1.5pt solid #000000",
          paddingBottom: `${4 * fontScale}pt`,
          marginBottom: `${4 * fontScale}pt`,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: `${baseFont}pt`, lineHeight: 1.1 }}>
          {c.facility.name}
        </div>
        {c.facility.code && (
          <div style={{ fontSize: `${smallFont}pt`, color: "#4b5563" }}>
            [{c.facility.code}]
          </div>
        )}
      </div>

      {/* Allergy alert banner — only when there are active allergies */}
      {c.hasAllergyAlert && (
        <div
          style={{
            background: allergySeverityColor,
            color: "#ffffff",
            padding: `${4 * fontScale}pt ${6 * fontScale}pt`,
            marginBottom: `${4 * fontScale}pt`,
            borderRadius: "2pt",
            fontWeight: 700,
            fontSize: `${baseFont}pt`,
            textAlign: "center",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            border: `${1.5 * fontScale}pt solid #000000`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: `${4 * fontScale}pt`,
          }}
        >
          <span style={{ fontSize: `${baseFont + 2}pt` }}>⚠</span>
          <span>
            ALLERGY ALERT: {c.allergySummary}
            {c.highestAllergySeverity === "anaphylactic" && " (ANAPHYLACTIC)"}
          </span>
        </div>
      )}

      {/* Patient identity block */}
      <div style={{ marginBottom: `${4 * fontScale}pt` }}>
        <div
          style={{
            fontSize: `${nameFont}pt`,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            marginBottom: `${2 * fontScale}pt`,
            textTransform: "uppercase",
          }}
        >
          {c.patient.lastName}, {c.patient.firstName}
          {c.patient.middleName ? ` ${c.patient.middleName.charAt(0)}.` : ""}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: `${baseFont}pt`,
            marginBottom: `${1 * fontScale}pt`,
          }}
        >
          <span>
            <span style={{ color: "#6b7280" }}>MRN: </span>
            <span style={{ fontWeight: 700, fontFamily: "monospace" }}>
              {c.patient.patientNumber}
            </span>
          </span>
          <span style={{ fontWeight: 700 }}>
            {c.patient.sex ? SEX_LABEL[c.patient.sex] || c.patient.sex.toUpperCase() : "?"}
            {c.patient.age != null ? ` / ${c.patient.age}y` : ""}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: `${baseFont}pt`,
            marginBottom: `${1 * fontScale}pt`,
          }}
        >
          <span>
            <span style={{ color: "#6b7280" }}>DOB: </span>
            <span style={{ fontWeight: 600 }}>
              {c.patient.dateOfBirth ? formatDate(c.patient.dateOfBirth) : "—"}
            </span>
          </span>
          <span>
            <span style={{ color: "#6b7280" }}>Blood: </span>
            <span style={{ fontWeight: 800, color: bloodColor }}>
              {c.patient.bloodGroup || "—"}
            </span>
          </span>
        </div>
      </div>

      {/* QR code block — large, central */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          margin: `${4 * fontScale}pt 0`,
          padding: `${4 * fontScale}pt`,
          border: `${1 * fontScale}pt solid #000000`,
          borderRadius: "2pt",
        }}
      >
        <QrCodeSvg
          value={c.qrPayload}
          size={qrSize}
          level="M"
          margin={0}
        />
        <div
          style={{
            marginTop: `${3 * fontScale}pt`,
            fontSize: `${smallFont}pt`,
            color: "#4b5563",
            fontFamily: "monospace",
            letterSpacing: "0.04em",
          }}
        >
          WBN-{tokenShort}
        </div>
      </div>

      {/* Encounter block (if present) */}
      {c.encounter && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: `${smallFont}pt`,
            borderTop: "1pt dashed #9ca3af",
            paddingTop: `${2 * fontScale}pt`,
            marginTop: `${2 * fontScale}pt`,
            color: "#374151",
          }}
        >
          <span style={{ fontFamily: "monospace" }}>
            {c.encounter.encounterNumber}
          </span>
          <span style={{ textTransform: "uppercase" }}>
            {c.encounter.encounterType.replace(/_/g, " ")}
            {c.encounter.priority && c.encounter.priority !== "routine"
              ? ` · ${c.encounter.priority.toUpperCase()}`
              : ""}
          </span>
        </div>
      )}

      {/* Issued-at footer */}
      {showIssuedAt && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: `${smallFont}pt`,
            color: "#6b7280",
            marginTop: `${3 * fontScale}pt`,
            paddingTop: `${2 * fontScale}pt`,
            borderTop: "1pt solid #d1d5db",
          }}
        >
          <span>Issued: {issuedAt}</span>
          <span>{c.organization.name}</span>
        </div>
      )}
    </div>
  );
}

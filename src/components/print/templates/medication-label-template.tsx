"use client";

// =====================================================================
// medication-label-template.tsx
//
// Thermal-printer medication label template for Phase 9 CDSS.
// Designed for 58mm and 80mm thermal label printers (Zebra ZD420,
// Brother TD-2120N, etc.). Also prints fine on A4 for laminate labels.
//
// LAYOUT (top to bottom, single column):
//
//   ┌──────────────────────────────────────┐
//   │  ⚠ HIGH ALERT MEDICATION              │  ← Red banner IF isHighAlert
//   │  ⚠ CONTROLLED SUBSTANCE — Class B    │  ← Amber banner IF controlled
//   │  ❄ REFRIGERATE (2–8°C)               │  ← Blue banner IF cold chain
//   │  [Logo] Facility Name      [Code]     │  ← Branding row
//   │  ───────────────────────────────────  │
//   │  PARACETAMOL 500mg                    │  ← Generic + strength (large)
//   │  (Tylenol)  · Tablet · Oral           │  ← Brand + form + route
//   │  ───────────────────────────────────  │
//   │  Patient: OHEMAA SERWAA, ESTHER       │  ← Patient name (bold)
//   │  MRN: JEM-00000006  · F / 19y          │  ← MRN + sex/age
//   │  ───────────────────────────────────  │
//   │  TAKE 1 TABLET × 3 DAILY              │  ← Dose + frequency (large)
//   │  Route: Oral · 5 days                 │  ← Route + duration
//   │  Quantity: 15 tablets                 │  ← Dispensed quantity
//   │  Instructions: After meals            │  ← Patient instructions
//   │  ───────────────────────────────────  │
//   │  Lot: BN-2024-0823   Exp: 12/2026     │  ← Lot + Expiry (mono)
//   │  NHIS: ACETAZTA1 · GH¢ 0.45 · B1      │  ← NHIS info
//   │  ───────────────────────────────────  │
//   │         ┌─────────────┐                │
//   │         │   [QR CODE] │                │  ← QR encodes /ml/<token>
//   │         └─────────────┘                │
//   │       MLN-XXXXXXXX                     │  ← Token shorthand
//   │  ───────────────────────────────────  │
//   │  Rx: RX-2026-000023 · Dr. Adusei      │  ← Prescription + prescriber
//   │  Reg: GA/MDC/1234                     │  ← License number
//   │  Issued: 09 Sep 2026                  │  ← Issued timestamp
//   └──────────────────────────────────────┘
//
// SAFETY PRINCIPLES:
//   - HIGH ALERT banner (red, bold, with ⚠) ONLY when Medication.isHighAlert
//   - CONTROLLED banner (amber) ONLY when controlledStatus is not 'none'
//   - COLD CHAIN banner (blue, with ❄) ONLY when storageConditions is
//     'refrigerate' | 'freeze' | 'cold_chain'
//   - Lot/Expiry is large, monospaced, with EXPIRY highlighted in red
//     when expired or within 30 days
//   - Generic name is the largest text on the label (the drug name is
//     the most critical info; brand name is secondary)
//   - Patient name + MRN + age + sex always present for bedside verification
//   - QR code is large enough to scan with a smartphone through a
//     transparent label sleeve (140-180px on 58mm; 200px on A4)
//   - "5 Rights" verification shorthand printed on label footer:
//     right patient (✓ MRN matches wristband), right drug (✓ scan QR),
//     right dose, right route, right time
// =====================================================================

import * as React from "react";
import { QrCodeSvg } from "@/components/ui/qr-code-svg";
import { formatDate } from "@/components/ui-helpers";
import type { MedicationLabelContent } from "@/lib/medication-label/assembler";

type MedicationLabelTemplateProps = {
  content: MedicationLabelContent;
  paperSize?: "THERMAL_58" | "THERMAL_80" | "A4";
  showIssuedAt?: boolean;
};

const SEX_LABEL: Record<string, string> = {
  male: "M",
  female: "F",
  intersex: "I",
  unknown: "?",
};

const STORAGE_ICON: Record<string, string> = {
  refrigerate: "❄",
  freeze: "❄❄",
  cold_chain: "❄",
  room_temp: "",
};

const STORAGE_LABEL: Record<string, string> = {
  refrigerate: "REFRIGERATE (2–8°C)",
  freeze: "FREEZE (≤ -18°C)",
  cold_chain: "COLD CHAIN — keep refrigerated",
  room_temp: "Store at room temperature",
};

const CONTROLLED_LABEL: Record<string, string> = {
  class_a: "CLASS A",
  class_b: "CLASS B",
  class_c: "CLASS C",
  class_d: "CLASS D",
  none: "",
};

export function MedicationLabelTemplate({
  content,
  paperSize = "THERMAL_58",
  showIssuedAt = true,
}: MedicationLabelTemplateProps) {
  if (!content) return null;

  const c = content;
  const is80 = paperSize === "THERMAL_80";
  const isA4 = paperSize === "A4";

  const fontScale = isA4 ? 1.4 : is80 ? 1.15 : 1;
  const baseFont = 9 * fontScale; // base body font
  const nameFont = 14 * fontScale; // medication name large font
  const patientFont = 11 * fontScale; // patient name
  const doseFont = 12 * fontScale; // dose + frequency
  const smallFont = 8 * fontScale; // small meta
  const monoFont = 9 * fontScale; // lot/expiry monospaced
  const qrSize = isA4 ? 200 : is80 ? 180 : 140;

  // High-alert status
  const isHighAlert = c.medication.isHighAlert;
  // Controlled substance
  const controlledClass = c.medication.controlledStatus && c.medication.controlledStatus !== "none"
    ? c.medication.controlledStatus
    : null;
  // Cold chain storage
  const storageConditions = c.medication.storageConditions || "";
  const isColdChain = ["refrigerate", "freeze", "cold_chain"].includes(storageConditions);

  // Lot + Expiry
  const batch = c.batch;
  const isExpired = batch?.isExpired || false;
  const isExpiringSoon = batch?.isExpiringSoon || false;
  const expiryColor = isExpired ? "#dc2626" : isExpiringSoon ? "#ea580c" : "#000000";
  const expiryLabel = isExpired
    ? "EXPIRED"
    : isExpiringSoon
      ? `EXPIRES SOON (${batch?.daysToExpiry}d)`
      : null;

  // Token shorthand (last 8 chars)
  const tokenShort = c.token.slice(-8).toUpperCase();
  const issuedAt = c.issuedAt ? formatDate(c.issuedAt, true) : "";

  // Patient name (Last, First M.)
  const patientLastName = c.patient.lastName || "";
  const patientFirstName = c.patient.firstName || "";
  const patientInitial = c.patient.fullName?.split(" ")[1]?.charAt(0) || "";
  const patientDisplay = `${patientLastName}, ${patientFirstName}${patientInitial ? ` ${patientInitial}.` : ""}`;

  // Medication name display: Generic + strength (large), Brand + form + route (small)
  const medicationMain = `${c.medication.genericName}${c.medication.strength ? ` ${c.medication.strength}` : ""}`;
  const medicationSub = [
    c.medication.brandName ? `(${c.medication.brandName})` : null,
    c.medication.dosageForm ? c.medication.dosageForm : null,
    c.medication.route ? c.medication.route : null,
  ].filter(Boolean).join(" · ");

  // Dose + frequency (large)
  const doseFreq = [c.prescriptionItem.dose, c.prescriptionItem.frequency].filter(Boolean).join(" × ");
  const isPRN = c.prescriptionItem.isPRN;
  const isSTAT = c.prescriptionItem.isSTAT;

  // Prescriber credentials
  const prescriber = c.prescription?.prescriber;
  const prescriberName = prescriber?.fullName || "—";
  const prescriberCred = prescriber?.licenseNumber || prescriber?.professionalRegistrationNumber || null;
  const prescriberAuthority = prescriber?.licensingAuthority || null;

  return (
    <div
      style={{
        width: "100%",
        background: "#ffffff",
        color: "#000000",
        fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
        padding: `${5 * fontScale}pt ${6 * fontScale}pt`,
        boxSizing: "border-box",
        pageBreakInside: "avoid",
      }}
    >
      {/* ── Safety banners (top priority) ──────────────────────── */}
      {isHighAlert && (
        <div
          style={{
            background: "#dc2626",
            color: "#ffffff",
            padding: `${3 * fontScale}pt ${4 * fontScale}pt`,
            marginBottom: `${2 * fontScale}pt`,
            borderRadius: "2pt",
            fontWeight: 800,
            fontSize: `${baseFont}pt`,
            textAlign: "center",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            border: `${1.5 * fontScale}pt solid #7f1d1d`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: `${3 * fontScale}pt`,
          }}
        >
          <span style={{ fontSize: `${baseFont + 2}pt` }}>⚠</span>
          <span>HIGH ALERT MEDICATION — ISMP</span>
        </div>
      )}
      {controlledClass && (
        <div
          style={{
            background: "#d97706",
            color: "#ffffff",
            padding: `${3 * fontScale}pt ${4 * fontScale}pt`,
            marginBottom: `${2 * fontScale}pt`,
            borderRadius: "2pt",
            fontWeight: 800,
            fontSize: `${baseFont}pt`,
            textAlign: "center",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            border: `${1.5 * fontScale}pt solid #92400e`,
          }}
        >
          CONTROLLED SUBSTANCE · {CONTROLLED_LABEL[controlledClass] || controlledClass.toUpperCase()}
        </div>
      )}
      {isColdChain && (
        <div
          style={{
            background: "#2563eb",
            color: "#ffffff",
            padding: `${3 * fontScale}pt ${4 * fontScale}pt`,
            marginBottom: `${2 * fontScale}pt`,
            borderRadius: "2pt",
            fontWeight: 700,
            fontSize: `${baseFont}pt`,
            textAlign: "center",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            border: `${1.5 * fontScale}pt solid #1e40af`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: `${3 * fontScale}pt`,
          }}
        >
          <span style={{ fontSize: `${baseFont + 2}pt` }}>{STORAGE_ICON[storageConditions] || "❄"}</span>
          <span>{STORAGE_LABEL[storageConditions] || "COLD CHAIN"}</span>
        </div>
      )}

      {/* ── Facility branding row ───────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1.5pt solid #000000",
          paddingBottom: `${3 * fontScale}pt`,
          marginBottom: `${3 * fontScale}pt`,
          gap: `${3 * fontScale}pt`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: `${3 * fontScale}pt`, minWidth: 0, flex: 1 }}>
          {(c.facility.logoUrl || c.organization.logoUrl) && (
            <img
              src={c.facility.logoUrl || c.organization.logoUrl || ""}
              alt={`${c.facility.name} logo`}
              style={{
                height: `${18 * fontScale}pt`,
                width: "auto",
                maxWidth: `${40 * fontScale}pt`,
                objectFit: "contain",
                flexShrink: 0,
              }}
              crossOrigin="anonymous"
            />
          )}
          <div style={{ fontWeight: 700, fontSize: `${baseFont}pt`, lineHeight: 1.1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {c.facility.name}
          </div>
        </div>
        {c.facility.code && (
          <div style={{ fontSize: `${smallFont}pt`, color: "#4b5563", flexShrink: 0 }}>
            [{c.facility.code}]
          </div>
        )}
      </div>

      {/* ── Medication name (largest text on label) ────────────── */}
      <div style={{ marginBottom: `${2 * fontScale}pt` }}>
        <div
          style={{
            fontSize: `${nameFont}pt`,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.01em",
            marginBottom: `${1 * fontScale}pt`,
            textTransform: "uppercase",
          }}
        >
          {medicationMain}
        </div>
        {medicationSub && (
          <div style={{ fontSize: `${smallFont}pt`, color: "#374151", lineHeight: 1.15 }}>
            {medicationSub}
          </div>
        )}
      </div>

      {/* ── Patient identity ───────────────────────────────────── */}
      <div
        style={{
          borderTop: "1pt dashed #9ca3af",
          borderBottom: "1pt dashed #9ca3af",
          padding: `${2 * fontScale}pt 0`,
          marginBottom: `${3 * fontScale}pt`,
        }}
      >
        <div
          style={{
            fontSize: `${patientFont}pt`,
            fontWeight: 700,
            lineHeight: 1.1,
            marginBottom: `${1 * fontScale}pt`,
            textTransform: "uppercase",
          }}
        >
          {patientDisplay}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: `${smallFont}pt`, color: "#374151" }}>
          <span>
            MRN: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{c.patient.patientNumber}</span>
          </span>
          <span style={{ fontWeight: 700 }}>
            {c.patient.sex ? SEX_LABEL[c.patient.sex] || c.patient.sex.toUpperCase() : "?"}
            {c.patient.age != null ? ` / ${c.patient.age}y` : ""}
            {c.patient.bloodGroup ? ` · ${c.patient.bloodGroup}` : ""}
          </span>
        </div>
      </div>

      {/* ── Dose + frequency (critical) ────────────────────────── */}
      <div style={{ marginBottom: `${3 * fontScale}pt` }}>
        <div
          style={{
            fontSize: `${doseFont}pt`,
            fontWeight: 800,
            lineHeight: 1.15,
            color: "#000000",
            textTransform: "uppercase",
            letterSpacing: "0.02em",
          }}
        >
          {doseFreq || "—"}
          {isPRN && <span style={{ color: "#d97706", marginLeft: `${2 * fontScale}pt` }}>PRN</span>}
          {isSTAT && <span style={{ color: "#dc2626", marginLeft: `${2 * fontScale}pt` }}>STAT</span>}
        </div>
        {c.prescriptionItem.route && c.prescriptionItem.duration && (
          <div style={{ fontSize: `${smallFont}pt`, color: "#4b5563", marginTop: `${1 * fontScale}pt` }}>
            Route: {c.prescriptionItem.route} · Duration: {c.prescriptionItem.duration}
          </div>
        )}
        <div style={{ fontSize: `${smallFont}pt`, color: "#4b5563", marginTop: `${1 * fontScale}pt` }}>
          Quantity dispensed: <span style={{ fontWeight: 700 }}>{c.prescriptionItem.dispensedQuantity} units</span>
        </div>
        {c.prescriptionItem.instructions && (
          <div
            style={{
              fontSize: `${smallFont}pt`,
              color: "#374151",
              marginTop: `${1 * fontScale}pt`,
              fontStyle: "italic",
              lineHeight: 1.2,
            }}
          >
            {c.prescriptionItem.instructions}
          </div>
        )}
        {isPRN && c.prescriptionItem.prnIndication && (
          <div style={{ fontSize: `${smallFont}pt`, color: "#d97706", marginTop: `${1 * fontScale}pt`, fontWeight: 600 }}>
            PRN for: {c.prescriptionItem.prnIndication}
          </div>
        )}
      </div>

      {/* ── Lot + Expiry (mono, large) ────────────────────────── */}
      {batch && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: `${monoFont}pt`,
            fontFamily: "monospace",
            fontWeight: 700,
            padding: `${2 * fontScale}pt 0`,
            borderTop: "1.5pt solid #000000",
            borderBottom: "1.5pt solid #000000",
            marginBottom: `${3 * fontScale}pt`,
          }}
        >
          <span>
            <span style={{ color: "#6b7280", fontWeight: 400 }}>LOT: </span>
            {batch.batchNumber}
          </span>
          <span>
            <span style={{ color: "#6b7280", fontWeight: 400 }}>EXP: </span>
            <span style={{ color: expiryColor }}>
              {batch.expiryDate ? formatDate(batch.expiryDate) : "—"}
            </span>
            {expiryLabel && (
              <span
                style={{
                  marginLeft: `${2 * fontScale}pt`,
                  color: expiryColor,
                  fontSize: `${smallFont}pt`,
                  fontWeight: 700,
                  border: `1pt solid ${expiryColor}`,
                  padding: `0 ${2 * fontScale}pt`,
                  borderRadius: "2pt",
                }}
              >
                {expiryLabel}
              </span>
            )}
          </span>
        </div>
      )}

      {/* ── NHIS info (if present) ─────────────────────────────── */}
      {c.medication.nhisCode && (
        <div style={{ fontSize: `${smallFont}pt`, color: "#4b5563", marginBottom: `${3 * fontScale}pt` }}>
          NHIS: <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{c.medication.nhisCode}</span>
          {c.medication.nhisTariffAmount != null && ` · GH¢ ${c.medication.nhisTariffAmount.toFixed(2)}`}
          {c.medication.nhisPrescribingLevel && ` · Level ${c.medication.nhisPrescribingLevel}`}
        </div>
      )}

      {/* ── QR code block ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          margin: `${3 * fontScale}pt 0`,
          padding: `${4 * fontScale}pt`,
          background: "#ffffff",
          border: `${1.5 * fontScale}pt solid #000000`,
          borderRadius: "2pt",
        }}
      >
        {c.qrPayload ? (
          <QrCodeSvg value={c.qrPayload} size={qrSize} level="M" margin={0} />
        ) : (
          <div
            style={{
              width: qrSize,
              height: qrSize,
              background: "#f3f4f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
              fontSize: `${smallFont}pt`,
            }}
          >
            QR unavailable
          </div>
        )}
        <div
          style={{
            marginTop: `${2 * fontScale}pt`,
            fontSize: `${smallFont}pt`,
            color: "#4b5563",
            fontFamily: "monospace",
            letterSpacing: "0.04em",
          }}
        >
          MLN-{tokenShort}
        </div>
      </div>

      {/* ── Prescriber credentials ────────────────────────────── */}
      <div
        style={{
          fontSize: `${smallFont}pt`,
          color: "#374151",
          borderTop: "1pt dashed #9ca3af",
          paddingTop: `${2 * fontScale}pt`,
          marginBottom: `${2 * fontScale}pt`,
          lineHeight: 1.25,
        }}
      >
        <div>
          <span style={{ color: "#6b7280" }}>Rx: </span>
          <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{c.prescription?.prescriptionNumber || "—"}</span>
          {" · "}
          <span>Dr. {prescriberName}</span>
        </div>
        {prescriberCred && (
          <div>
            <span style={{ color: "#6b7280" }}>Reg: </span>
            <span style={{ fontFamily: "monospace" }}>{prescriberCred}</span>
            {prescriberAuthority && <span style={{ color: "#9ca3af" }}> ({prescriberAuthority})</span>}
          </div>
        )}
        {c.medication.manufacturer && (
          <div>
            <span style={{ color: "#6b7280" }}>Mfr: </span>
            <span>{c.medication.manufacturer}</span>
          </div>
        )}
      </div>

      {/* ── Footer: 5 Rights + issued-at ──────────────────────── */}
      {showIssuedAt && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: `${smallFont}pt`,
            color: "#6b7280",
            marginTop: `${2 * fontScale}pt`,
            paddingTop: `${2 * fontScale}pt`,
            borderTop: "1pt solid #d1d5db",
          }}
        >
          <span>Issued: {issuedAt}</span>
          <span style={{ fontStyle: "italic" }}>Scan QR to verify 5 Rights</span>
        </div>
      )}
    </div>
  );
}

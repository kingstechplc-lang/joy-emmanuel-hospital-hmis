// =====================================================================
// NHIA CLAIM-it XML Utility Functions
// =====================================================================

/** Escape XML special characters in text content */
export function escapeXml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ""); // Remove control chars
}

/** Format a date as NHIA date string (yyyy-MM-dd) */
export function formatDateNHIA(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Format a date as NHIA datetime string (yyyy-MM-dd'T'HH:mm:ss) */
export function formatDateTimeNHIA(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const datePart = formatDateNHIA(d);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${datePart}T${hours}:${minutes}:${seconds}`;
}

/** Format a monetary amount with exactly 2 decimal places */
export function formatAmountNHIA(amount: number): string {
  return amount.toFixed(2);
}

/** Create an XML element string */
export function xmlElement(tag: string, content: string | null | undefined, indent: number = 0): string {
  const pad = "  ".repeat(indent);
  if (content === null || content === undefined || content === "") {
    return `${pad}<${tag} />`;
  }
  return `${pad}<${tag}>${escapeXml(String(content))}</${tag}>`;
}

/** Create an XML element with attributes */
export function xmlElementWithAttrs(tag: string, attrs: Record<string, string>, content: string | null | undefined, indent: number = 0): string {
  const pad = "  ".repeat(indent);
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeXml(v)}"`)
    .join(" ");
  if (content === null || content === undefined || content === "") {
    return `${pad}<${tag}${attrStr ? " " + attrStr : ""} />`;
  }
  return `${pad}<${tag}${attrStr ? " " + attrStr : ""}>${escapeXml(String(content))}</${tag}>`;
}

/** Open an XML tag */
export function xmlOpen(tag: string, indent: number = 0): string {
  return `${"  ".repeat(indent)}<${tag}>`;
}

/** Close an XML tag */
export function xmlClose(tag: string, indent: number = 0): string {
  return `${"  ".repeat(indent)}</${tag}>`;
}

/** Generate a deterministic claim reference */
export function generateClaimRef(facilityCode: string, encounterId: string, date: Date = new Date()): string {
  const dateStr = formatDateNHIA(date).replace(/-/g, "");
  const hash = encounterId.slice(-8).toUpperCase();
  return `CLM-${facilityCode}-${dateStr}-${hash}`;
}

/** Generate a batch reference */
export function generateBatchRef(facilityCode: string, period: string): string {
  return `BAT-${facilityCode}-${period}`;
}

/** Normalize an NHIS member number (remove spaces, dashes, uppercase) */
export function normalizeMemberNumber(nhisNumber: string | null | undefined): string | null {
  if (!nhisNumber) return null;
  return nhisNumber.replace(/[\s-]/g, "").toUpperCase();
}

/** Validate ICD-10 code format (basic check) */
export function isValidICD10(code: string | null | undefined): boolean {
  if (!code) return false;
  // ICD-10 format: Letter + 2 digits + optional . + 1-4 chars
  return /^[A-Z]\d{2}(\.[A-Z0-9]{1,4})?$/.test(code);
}

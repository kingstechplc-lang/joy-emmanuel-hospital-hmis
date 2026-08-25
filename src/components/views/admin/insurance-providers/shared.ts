// Shared constants & helpers for the Insurance Providers admin view
export const PROVIDER_TYPES = [
  { value: "nhis", label: "NHIS" },
  { value: "private", label: "Private Health Insurance" },
  { value: "corporate", label: "Corporate Health Plan" },
  { value: "managed_care", label: "Managed Care Organization" },
  { value: "employer_sponsored", label: "Employer-sponsored Plan" },
  { value: "government", label: "Government Payer" },
  { value: "institutional", label: "Institutional Payer" },
  { value: "self_funded", label: "Self-funded Organization" },
  { value: "other", label: "Other" },
];

export const PROVIDER_STATUSES = [
  { value: "active", label: "Active", color: "emerald" },
  { value: "inactive", label: "Inactive", color: "slate" },
  { value: "suspended", label: "Suspended", color: "amber" },
  { value: "pending", label: "Pending", color: "blue" },
  { value: "expired", label: "Expired", color: "rose" },
  { value: "terminated", label: "Terminated", color: "rose" },
  { value: "retired", label: "Retired", color: "slate" },
];

export const PLAN_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "family", label: "Family" },
  { value: "corporate", label: "Corporate" },
  { value: "employer", label: "Employer" },
  { value: "government", label: "Government" },
  { value: "nhis", label: "NHIS" },
  { value: "managed_care", label: "Managed Care" },
  { value: "other", label: "Other" },
];

export const CONTACT_TYPES = [
  { value: "general", label: "General" },
  { value: "claims", label: "Claims" },
  { value: "finance", label: "Finance" },
  { value: "authorization", label: "Authorization" },
  { value: "technical", label: "Technical" },
  { value: "management", label: "Management" },
];

export const BENEFIT_CATEGORIES = [
  { value: "outpatient", label: "Outpatient" },
  { value: "inpatient", label: "Inpatient" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "laboratory", label: "Laboratory" },
  { value: "imaging", label: "Imaging" },
  { value: "procedures", label: "Procedures" },
  { value: "maternity", label: "Maternity" },
  { value: "dental", label: "Dental" },
  { value: "optical", label: "Optical" },
  { value: "emergency", label: "Emergency" },
  { value: "other", label: "Other" },
];

export const COVERAGE_TYPES = [
  { value: "covered", label: "Covered" },
  { value: "partially_covered", label: "Partially Covered" },
  { value: "not_covered", label: "Not Covered" },
  { value: "authorization_required", label: "Authorization Required" },
  { value: "referral_required", label: "Referral Required" },
];

export function statusColor(s?: string): string {
  const found = PROVIDER_STATUSES.find((t) => t.value === s);
  return found?.color || "slate";
}

export function labelOf(arr: { value: string; label: string }[], v?: string | null): string {
  if (!v) return "—";
  return arr.find((x) => x.value === v)?.label || v;
}

export async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `GH¢ ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Shared constants & helpers for the Lab Test Catalog admin view
export const TEST_CATEGORIES = [
  { value: "haematology", label: "Haematology" },
  { value: "chemistry", label: "Clinical Chemistry" },
  { value: "microbiology", label: "Microbiology" },
  { value: "serology", label: "Serology" },
  { value: "immunology", label: "Immunology" },
  { value: "parasitology", label: "Parasitology" },
  { value: "histopathology", label: "Histopathology" },
  { value: "cytology", label: "Cytology" },
  { value: "blood_bank", label: "Blood Bank" },
  { value: "molecular", label: "Molecular Diagnostics" },
  { value: "urinalysis", label: "Urinalysis" },
  { value: "stool_examination", label: "Stool Examination" },
  { value: "endocrinology", label: "Endocrinology" },
  { value: "toxicology", label: "Toxicology" },
  { value: "other", label: "Other" },
];

export const TEST_TYPES = [
  { value: "single", label: "Single Test" },
  { value: "panel", label: "Panel" },
  { value: "profile", label: "Profile" },
  { value: "culture", label: "Culture" },
  { value: "microscopy", label: "Microscopy" },
  { value: "quantitative", label: "Quantitative" },
  { value: "qualitative", label: "Qualitative" },
  { value: "semi_quantitative", label: "Semi-quantitative" },
  { value: "molecular", label: "Molecular" },
  { value: "pathology", label: "Pathology" },
  { value: "other", label: "Other" },
];

export const RESULT_TYPES = [
  { value: "numeric", label: "Numeric" },
  { value: "text", label: "Text" },
  { value: "qualitative", label: "Qualitative" },
  { value: "pos_neg", label: "Positive / Negative" },
  { value: "reactive_nonreactive", label: "Reactive / Non-reactive" },
  { value: "detected_not_detected", label: "Detected / Not detected" },
  { value: "categorical", label: "Categorical" },
  { value: "structured", label: "Structured" },
  { value: "organism", label: "Organism selection" },
  { value: "titer", label: "Titer" },
  { value: "other", label: "Other" },
];

export const TEST_STATUSES = [
  { value: "active", label: "Active", color: "emerald" },
  { value: "inactive", label: "Inactive", color: "slate" },
  { value: "temporarily_unavailable", label: "Temporarily Unavailable", color: "amber" },
  { value: "referral_out", label: "Referral Out", color: "blue" },
  { value: "retired", label: "Retired", color: "rose" },
  { value: "archived", label: "Archived", color: "slate" },
];

export const PRIORITIES = [
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "stat", label: "STAT" },
];

export const BILLABLE_AS = [
  { value: "individual", label: "Individually billable" },
  { value: "package", label: "Package-priced" },
  { value: "component", label: "Component-priced" },
  { value: "parent_only", label: "Non-billable parent (components billable)" },
];

export const CLAIMABLE_STATUSES = [
  { value: "not_configured", label: "Not configured" },
  { value: "claimable", label: "Claimable" },
  { value: "non_claimable", label: "Non-claimable" },
  { value: "pending", label: "Pending" },
];

export const SEX_OPTIONS = ["male", "female", "all"];
export const AGE_GROUPS = ["neonate", "infant", "child", "adolescent", "adult", "older_adult", "all"];

export function statusColor(s?: string): string {
  const found = TEST_STATUSES.find((t) => t.value === s);
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

export function tatLabel(t: any): string {
  if (!t) return "—";
  const parts: string[] = [];
  if (t.tatMinutes) parts.push(`${t.tatMinutes}m`);
  if (t.tatRoutineMin) parts.push(`R:${t.tatRoutineMin}m`);
  if (t.tatUrgentMin) parts.push(`U:${t.tatUrgentMin}m`);
  if (t.tatStatMin) parts.push(`S:${t.tatStatMin}m`);
  return parts.length ? parts.join(" · ") : "—";
}

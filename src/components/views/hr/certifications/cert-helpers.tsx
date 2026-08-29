"use client";
import { useSession } from "next-auth/react";
import { safeJson } from "@/components/ui-helpers";

export async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

export function usePermissions() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const isSuperAdmin = user?.roles?.includes("super_admin");
  const can = (p: string | string[]) => {
    if (isSuperAdmin) return true;
    if (Array.isArray(p)) return p.some((perm) => perms.includes(perm));
    return perms.includes(p);
  };
  return { can, perms, user, isSuperAdmin };
}

export const CERT_STATUSES = [
  { value: "active", label: "Active", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "expiring_soon", label: "Expiring Soon", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "expired", label: "Expired", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "suspended", label: "Suspended", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "revoked", label: "Revoked", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "pending_verification", label: "Pending Verification", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "pending_approval", label: "Pending Approval", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "draft", label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "rejected", label: "Rejected", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "renewal_pending", label: "Renewal Pending", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "archived", label: "Archived", color: "bg-slate-100 text-slate-500 border-slate-200" },
];

export const VERIFICATION_STATUSES = [
  { value: "pending", label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "verified", label: "Verified", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "rejected", label: "Rejected", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "not_required", label: "Not Required", color: "bg-slate-100 text-slate-600 border-slate-200" },
];

export const CREDENTIAL_TYPES = [
  { value: "professional_license", label: "Professional License" },
  { value: "certification", label: "Certification" },
  { value: "registration", label: "Registration" },
  { value: "permit", label: "Permit" },
  { value: "accreditation", label: "Accreditation" },
  { value: "credential", label: "Credential" },
  { value: "training_certificate", label: "Training Certificate" },
];

export const CERT_CATEGORIES = [
  "Clinical", "Nursing", "Pharmacy", "Laboratory", "Radiology", "Emergency",
  "Management", "IT", "Safety", "Infection Prevention", "Occupational Health",
  "Professional", "Technical", "Regulatory", "Administrative",
];

export const VERIFICATION_METHODS = [
  { value: "document_review", label: "Document Review" },
  { value: "issuing_org", label: "Issuing Organization Verification" },
  { value: "portal", label: "Official Verification Portal" },
  { value: "physical_inspection", label: "Physical Document Inspection" },
  { value: "hr_verification", label: "HR Verification" },
  { value: "supervisor_verification", label: "Supervisor Verification" },
  { value: "external", label: "External Verification" },
];

export function getStatusInfo(status: string, list: { value: string; label: string; color: string }[]) {
  return list.find((s) => s.value === status) || { value: status, label: status.replace(/_/g, " "), color: "bg-slate-100 text-slate-700 border-slate-200" };
}

export function ColoredBadge({ status, list }: { status: string; list: { value: string; label: string; color: string }[] }) {
  const info = getStatusInfo(status, list);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${info.color}`}>
      {info.label}
    </span>
  );
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysUntil(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

"use client";
// =====================================================================
// TRAINING UI HELPERS — shared fetchers, badges, formatters
// =====================================================================
import { useSession } from "next-auth/react";

export async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
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

export const PROGRAM_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "active", label: "Active", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "inactive", label: "Inactive", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "archived", label: "Archived", color: "bg-slate-100 text-slate-500 border-slate-200" },
];

export const SESSION_STATUSES = [
  { value: "scheduled", label: "Scheduled", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "open", label: "Open", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "full", label: "Full", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "ongoing", label: "Ongoing", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "completed", label: "Completed", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "cancelled", label: "Cancelled", color: "bg-slate-100 text-slate-500 border-slate-200 line-through" },
];

export const ENROLLMENT_STATUSES = [
  { value: "pending", label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "approved", label: "Approved", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "confirmed", label: "Confirmed", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "waitlisted", label: "Waitlisted", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "attended", label: "Attended", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "completed", label: "Completed", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "withdrawn", label: "Withdrawn", color: "bg-slate-100 text-slate-500 border-slate-200" },
  { value: "absent", label: "Absent", color: "bg-rose-100 text-rose-700 border-rose-200" },
];

export const CERTIFICATE_STATUSES = [
  { value: "valid", label: "Valid", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "expiring_soon", label: "Expiring Soon", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "expired", label: "Expired", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "revoked", label: "Revoked", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "suspended", label: "Suspended", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "pending", label: "Pending", color: "bg-slate-100 text-slate-700 border-slate-200" },
];

export const REQUEST_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "submitted", label: "Submitted", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "under_review", label: "Under Review", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "approved", label: "Approved", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "rejected", label: "Rejected", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "scheduled", label: "Scheduled", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "completed", label: "Completed", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];

export const COMPETENCY_LEVELS = [
  { value: "competent", label: "Competent", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "not_yet_competent", label: "Not Yet Competent", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "reassessment_required", label: "Reassessment Required", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "pending", label: "Pending", color: "bg-slate-100 text-slate-700 border-slate-200" },
];

export const TRAINING_CATEGORIES = [
  "Clinical", "Nursing", "Pharmacy", "Laboratory", "Radiology", "Emergency",
  "Infection Control", "Patient Safety", "Occupational Safety", "Administration",
  "IT", "Leadership", "Compliance", "Professional Development", "Orientation", "Mandatory",
];

export const TRAINING_TYPES = [
  { value: "internal", label: "Internal Training" },
  { value: "external", label: "External Training" },
  { value: "workshop", label: "Workshop" },
  { value: "seminar", label: "Seminar" },
  { value: "conference", label: "Conference" },
  { value: "webinar", label: "Webinar" },
  { value: "orientation", label: "Orientation" },
  { value: "refresher", label: "Refresher Course" },
  { value: "certification", label: "Certification Course" },
  { value: "skills", label: "Skills Training" },
  { value: "clinical", label: "Clinical Training" },
  { value: "simulation", label: "Simulation" },
  { value: "e_learning", label: "E-Learning" },
  { value: "on_job", label: "On-the-Job Training" },
];

export const DELIVERY_METHODS = [
  { value: "in_person", label: "In Person" },
  { value: "online", label: "Online" },
  { value: "hybrid", label: "Hybrid" },
  { value: "self_paced", label: "Self-Paced" },
  { value: "workshop", label: "Workshop" },
  { value: "simulation", label: "Simulation" },
  { value: "practical", label: "Practical" },
  { value: "on_job", label: "On-the-Job" },
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

export function formatDateTime(date: string | Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatTime(date: string | Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function daysUntil(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

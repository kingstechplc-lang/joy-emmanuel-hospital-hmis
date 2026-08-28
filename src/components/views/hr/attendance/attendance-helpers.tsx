"use client";
// =====================================================================
// ATTENDANCE UI HELPERS — shared fetchers, badges, formatters
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

export const ATTENDANCE_STATUSES = [
  { value: "scheduled", label: "Scheduled", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "present", label: "Present", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "checked_in", label: "Checked In", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "checked_out", label: "Checked Out", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "late", label: "Late", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "early_departure", label: "Early Departure", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "absent", label: "Absent", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "on_leave", label: "On Leave", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "off_duty", label: "Off Duty", color: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "on_call", label: "On Call", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { value: "half_day", label: "Half Day", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "overtime", label: "Overtime", color: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200" },
  { value: "missing_checkout", label: "Missing Check-Out", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "correction_pending", label: "Correction Pending", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "excused_absence", label: "Excused Absence", color: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "unscheduled", label: "Unscheduled", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "emergency_duty", label: "Emergency Duty", color: "bg-red-100 text-red-700 border-red-200" },
];

export const EXCEPTION_STATUSES = [
  { value: "open", label: "Open", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "reviewed", label: "Reviewed", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "resolved", label: "Resolved", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "escalated", label: "Escalated", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "ignored", label: "Ignored", color: "bg-slate-100 text-slate-500 border-slate-200" },
];

export const CORRECTION_STATUSES = [
  { value: "pending", label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "approved", label: "Approved", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "rejected", label: "Rejected", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "changes_requested", label: "Changes Requested", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "cancelled", label: "Cancelled", color: "bg-slate-100 text-slate-500 border-slate-200" },
];

export const OVERTIME_STATUSES = [
  { value: "pending", label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "approved", label: "Approved", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "rejected", label: "Rejected", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "cancelled", label: "Cancelled", color: "bg-slate-100 text-slate-500 border-slate-200" },
];

export const PERIOD_STATUSES = [
  { value: "open", label: "Open", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "processing", label: "Processing", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "review", label: "In Review", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "approved", label: "Approved", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "locked", label: "Locked", color: "bg-slate-100 text-slate-600 border-slate-200" },
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

export function formatTime(date: string | Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(date: string | Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function todayStr(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

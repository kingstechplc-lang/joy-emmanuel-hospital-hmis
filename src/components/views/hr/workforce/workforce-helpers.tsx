"use client";
// =====================================================================
// WORKFORCE UI HELPERS — shared types, fetchers, and badges
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

export const SHIFT_STATUSES = [
  { value: "scheduled", label: "Scheduled", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "checked_in", label: "Checked In", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "on_break", label: "On Break", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "checked_out", label: "Checked Out", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "late", label: "Late", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "absent", label: "Absent", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "no_show", label: "No Show", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "cancelled", label: "Cancelled", color: "bg-slate-100 text-slate-500 border-slate-200 line-through" },
  { value: "completed", label: "Completed", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];

export const LEAVE_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "submitted", label: "Submitted", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "pending", label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "approved", label: "Approved", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "rejected", label: "Rejected", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "cancelled", label: "Cancelled", color: "bg-slate-100 text-slate-500 border-slate-200 line-through" },
  { value: "withdrawn", label: "Withdrawn", color: "bg-slate-100 text-slate-500 border-slate-200 line-through" },
  { value: "extended", label: "Extended", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "completed", label: "Completed", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "overdue_return", label: "Overdue Return", color: "bg-rose-100 text-rose-700 border-rose-200" },
];

export const ROSTER_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "review", label: "In Review", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "approved", label: "Approved", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "published", label: "Published", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "archived", label: "Archived", color: "bg-slate-100 text-slate-500 border-slate-200" },
];

export const SWAP_STATUSES = [
  { value: "requested", label: "Requested", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "accepted", label: "Accepted", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "rejected", label: "Rejected", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "approved", label: "Approved", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "cancelled", label: "Cancelled", color: "bg-slate-100 text-slate-500 border-slate-200 line-through" },
  { value: "completed", label: "Completed", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];

export const COVERAGE_STATUSES = [
  { value: "open", label: "Open", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "assigned", label: "Assigned", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "fulfilled", label: "Fulfilled", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "cancelled", label: "Cancelled", color: "bg-slate-100 text-slate-500 border-slate-200 line-through" },
  { value: "unresolved", label: "Unresolved", color: "bg-rose-100 text-rose-700 border-rose-200" },
];

export const AVAILABILITY_STATUSES = [
  { value: "available", label: "Available", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "unavailable", label: "Unavailable", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "on_leave", label: "On Leave", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "off_duty", label: "Off Duty", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "on_shift", label: "On Shift", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "on_call", label: "On Call", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "absent", label: "Absent", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "suspended", label: "Suspended", color: "bg-rose-100 text-rose-700 border-rose-200" },
];

export function getStatusInfo(status: string, list: { value: string; label: string; color: string }[]) {
  return list.find((s) => s.value === status) || { value: status, label: status, color: "bg-slate-100 text-slate-700 border-slate-200" };
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

export function calcDurationHours(start: string | Date, end: string | Date | null | undefined): number {
  if (!end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms > 0 ? ms / (1000 * 60 * 60) : 0;
}

export function formatDuration(hours: number): string {
  if (hours <= 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

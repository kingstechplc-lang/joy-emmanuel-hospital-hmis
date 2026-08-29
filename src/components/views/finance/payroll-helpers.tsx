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

export const PERIOD_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "open", label: "Open", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "processing", label: "Processing", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "pending_approval", label: "Pending Approval", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "approved", label: "Approved", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "paid", label: "Paid", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "locked", label: "Locked", color: "bg-slate-100 text-slate-500 border-slate-200" },
  { value: "cancelled", label: "Cancelled", color: "bg-slate-100 text-slate-500 border-slate-200 line-through" },
];

export const PAYMENT_STATUSES = [
  { value: "unpaid", label: "Unpaid", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "pending", label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "paid", label: "Paid", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "failed", label: "Failed", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "reversed", label: "Reversed", color: "bg-purple-100 text-purple-700 border-purple-200" },
];

export const LOAN_STATUSES = [
  { value: "pending", label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "approved", label: "Approved", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "active", label: "Active", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "completed", label: "Completed", color: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "defaulted", label: "Defaulted", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "cancelled", label: "Cancelled", color: "bg-slate-100 text-slate-500 border-slate-200" },
];

export function getStatusInfo(status: string, list: { value: string; label: string; color: string }[]) {
  return list.find((s) => s.value === status) || { value: status, label: status.replace(/_/g, " "), color: "bg-slate-100 text-slate-700 border-slate-200" };
}

export function ColoredBadge({ status, list }: { status: string; list: { value: string; label: string; color: string }[] }) {
  const info = getStatusInfo(status, list);
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${info.color}`}>{info.label}</span>;
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatCurrency(amount: number | string | null | undefined, currency = "GHS") {
  if (amount == null || amount === "") return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  const symbols: Record<string, string> = { GHS: "₵", USD: "$", EUR: "€", GBP: "£" };
  const symbol = symbols[currency] || currency + " ";
  return `${symbol}${num.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, SearchX } from "lucide-react";
import { ReactNode } from "react";

// Empty state
export function EmptyState({ title, description, action, icon: Icon }: { title: string; description?: string; action?: ReactNode; icon?: any }) {
  const FinalIcon = Icon || SearchX;
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 ring-1 ring-slate-200/60 flex items-center justify-center mb-4 shadow-sm">
        <FinalIcon className="w-7 h-7 text-slate-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">{title}</h3>
      {description && <p className="text-xs text-slate-500 mb-4 max-w-sm leading-relaxed">{description}</p>}
      {action}
    </div>
  );
}

// Loading state
export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-md border border-slate-100">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Error state
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card>
      <CardContent className="p-6 flex flex-col items-center text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
        <p className="text-sm font-semibold text-slate-900 mb-1">Something went wrong</p>
        <p className="text-xs text-slate-500 mb-4">{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="text-xs text-emerald-600 font-medium hover:underline">
            Try again
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// Status badge with color mapping
export function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700 border-emerald-200",
    available: "bg-emerald-100 text-emerald-700 border-emerald-200",
    admitted: "bg-amber-100 text-amber-700 border-amber-200",
    occupied: "bg-rose-100 text-rose-700 border-rose-200",
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    cancelled: "bg-slate-100 text-slate-600 border-slate-200",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    issued: "bg-blue-100 text-blue-700 border-blue-200",
    draft: "bg-slate-100 text-slate-600 border-slate-200",
    partially_paid: "bg-amber-100 text-amber-700 border-amber-200",
    refunded: "bg-purple-100 text-purple-700 border-purple-200",
    verified: "bg-emerald-100 text-emerald-700 border-emerald-200",
    ordered: "bg-blue-100 text-blue-700 border-blue-200",
    collected: "bg-cyan-100 text-cyan-700 border-cyan-200",
    processing: "bg-amber-100 text-amber-700 border-amber-200",
    resulted: "bg-purple-100 text-purple-700 border-purple-200",
    released: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dispensed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    partially_dispensed: "bg-amber-100 text-amber-700 border-amber-200",
    discharged: "bg-slate-100 text-slate-600 border-slate-200",
    open: "bg-blue-100 text-blue-700 border-blue-200",
    in_progress: "bg-amber-100 text-amber-700 border-amber-200",
    closed: "bg-slate-100 text-slate-600 border-slate-200",
    waiting: "bg-amber-100 text-amber-700 border-amber-200",
    called: "bg-blue-100 text-blue-700 border-blue-200",
    signed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    amended: "bg-purple-100 text-purple-700 border-purple-200",
    given: "bg-emerald-100 text-emerald-700 border-emerald-200",
    received: "bg-emerald-100 text-emerald-700 border-emerald-200",
    approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
    rejected: "bg-rose-100 text-rose-700 border-rose-200",
    submitted: "bg-blue-100 text-blue-700 border-blue-200",
    scheduled: "bg-blue-100 text-blue-700 border-blue-200",
    confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    checked_in: "bg-cyan-100 text-cyan-700 border-cyan-200",
    no_show: "bg-rose-100 text-rose-700 border-rose-200",
    requested: "bg-amber-100 text-amber-700 border-amber-200",
    shipped: "bg-blue-100 text-blue-700 border-blue-200",
    maintenance: "bg-amber-100 text-amber-700 border-amber-200",
    out_of_service: "bg-slate-100 text-slate-600 border-slate-200",
    cleaning: "bg-cyan-100 text-cyan-700 border-cyan-200",
    reserved: "bg-purple-100 text-purple-700 border-purple-200",
    emergency: "bg-rose-100 text-rose-700 border-rose-200",
    urgent: "bg-amber-100 text-amber-700 border-amber-200",
    routine: "bg-slate-100 text-slate-600 border-slate-200",
    high: "bg-rose-100 text-rose-700 border-rose-200",
    critical: "bg-rose-100 text-rose-700 border-rose-200",
  };
  const classes = colorMap[status] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${classes}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// Format currency
export function formatCurrency(amount: number | null | undefined, currency = "GHS") {
  if (amount == null) return "—";
  const symbols: Record<string, string> = { GHS: "₵", USD: "$", EUR: "€", GBP: "£" };
  const symbol = symbols[currency] || currency + " ";
  return `${symbol}${Number(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format date
export function formatDate(date: string | Date | null | undefined, withTime = false) {
  if (!date) return "—";
  const d = new Date(date);
  if (withTime) {
    return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Format relative time
export function formatRelative(date: string | Date | null | undefined) {
  if (!date) return "—";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

// Calculate age from DOB
export function calculateAge(dob: string | Date | null | undefined) {
  if (!dob) return "—";
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

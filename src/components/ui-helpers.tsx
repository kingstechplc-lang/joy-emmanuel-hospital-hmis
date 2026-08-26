"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, SearchX, Search, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { ReactNode, useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// =====================================================================
// SAFE FETCH HELPERS — handle empty/error responses gracefully
// =====================================================================

/**
 * Safely parse a JSON response body. Returns {} if body is empty or invalid.
 * Prevents "Failed to execute 'json' on 'Response': Unexpected end of JSON input"
 */
export async function safeJson<T = any>(res: Response): Promise<T> {
  try {
    const text = await res.text();
    if (!text || text.trim() === "") return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Safe fetch + JSON parse. Throws Error with server message on non-OK response.
 * Never throws "Unexpected end of JSON input" — falls back to generic message.
 */
export async function safeFetchJson(url: string, options?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (e: any) {
    throw new Error(e?.message || "Network request failed");
  }

  const data = await safeJson(res);

  if (!res.ok) {
    const errMsg = (data && data.error) || `Request failed with status ${res.status}`;
    throw new Error(errMsg);
  }

  return data;
}

// =====================================================================
// COLORFUL PAGE HEADER — gradient banner with icon, title, description
// =====================================================================
export function PageHeader({
  title,
  description,
  icon: Icon,
  gradient = "from-rose-500 to-red-600",
  actions,
}: {
  title: string;
  description?: string;
  icon?: any;
  gradient?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${gradient} text-white p-5 shadow-lg fade-in-up`}>
      {/* Watermark icon */}
      {Icon && (
        <div className="absolute top-3 right-4 text-white/15 pointer-events-none">
          <Icon className="w-20 h-20" strokeWidth={1.5} />
        </div>
      )}
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-1">
          {Icon && <Icon className="w-5 h-5 text-white/90" />}
          <h2 className="text-xl font-bold text-white">{title}</h2>
        </div>
        {description && <p className="text-sm text-white/80">{description}</p>}
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// =====================================================================
// COLORFUL STAT CARD — compact gradient stat for sub-pages
// =====================================================================
export function MiniStatCard({
  label,
  value,
  icon: Icon,
  gradient = "from-blue-500 to-blue-600",
  sublabel,
}: {
  label: string;
  value: string | number;
  icon?: any;
  gradient?: string;
  sublabel?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${gradient} text-white p-4 shadow-md card-hover-lift`}>
      {Icon && (
        <div className="absolute top-2 right-2 text-white/20 pointer-events-none">
          <Icon className="w-8 h-8" strokeWidth={1.5} />
        </div>
      )}
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/80 mb-1">{label}</p>
      <p className="text-2xl font-extrabold text-white tabular-nums">{value}</p>
      {sublabel && <p className="text-[10px] text-white/70 mt-0.5">{sublabel}</p>}
    </div>
  );
}

// =====================================================================
// COLORFUL TABLE — attractive table with gradient header
// =====================================================================
export function ColorfulTable({
  headers,
  children,
  headerGradient = "from-slate-700 to-slate-800",
}: {
  headers: string[];
  children: ReactNode;
  headerGradient?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full">
        <thead>
          <tr className={`bg-gradient-to-r ${headerGradient} text-white`}>
            {headers.map((h, i) => (
              <th
                key={i}
                className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {children}
        </tbody>
      </table>
    </div>
  );
}

// =====================================================================
// TABLE ROW — hoverable row with status color
// =====================================================================
export function StatusTableRow({
  children,
  statusColor,
}: {
  children: ReactNode;
  statusColor?: string;
}) {
  return (
    <tr className="hover:bg-slate-50 transition-colors border-l-4 border-transparent hover:border-l-4"
      style={statusColor ? { borderLeftColor: statusColor } : undefined}
    >
      {children}
    </tr>
  );
}

// =====================================================================
// GRADIENT BUTTON — colorful action button
// =====================================================================
export function GradientButton({
  children,
  onClick,
  gradient = "from-rose-500 to-red-600",
  size = "sm",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  gradient?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg bg-gradient-to-r ${gradient} text-white font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ${
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-base"
      } ${className}`}
    >
      {children}
    </button>
  );
}

// =====================================================================
// COLORFUL BADGE — status badge with color
// =====================================================================
export function ColorfulBadge({ status, label }: { status: string; label?: string }) {
  const colorMap: Record<string, string> = {
    // Clinical statuses
    active: "bg-emerald-100 text-emerald-700 border-emerald-200",
    admitted: "bg-amber-100 text-amber-700 border-amber-200",
    open: "bg-blue-100 text-blue-700 border-blue-200",
    in_progress: "bg-amber-100 text-amber-700 border-amber-200",
    completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    discharged: "bg-slate-100 text-slate-600 border-slate-200",
    cancelled: "bg-rose-100 text-rose-700 border-rose-200",
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    ordered: "bg-blue-100 text-blue-700 border-blue-200",
    collected: "bg-cyan-100 text-cyan-700 border-cyan-200",
    processing: "bg-purple-100 text-purple-700 border-purple-200",
    resulted: "bg-purple-100 text-purple-700 border-purple-200",
    verified: "bg-emerald-100 text-emerald-700 border-emerald-200",
    released: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dispensed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    available: "bg-emerald-100 text-emerald-700 border-emerald-200",
    occupied: "bg-rose-100 text-rose-700 border-rose-200",
    // Severity
    low: "bg-emerald-100 text-emerald-700 border-emerald-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    high: "bg-orange-100 text-orange-700 border-orange-200",
    critical: "bg-rose-100 text-rose-700 border-rose-200",
    urgent: "bg-orange-100 text-orange-700 border-orange-200",
    emergency: "bg-rose-100 text-rose-700 border-rose-200",
    routine: "bg-slate-100 text-slate-600 border-slate-200",
  };
  const classes = colorMap[status] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${classes}`}>
      {label || status.replace(/_/g, " ")}
    </span>
  );
}

// Empty state
export function EmptyState({ title, description, action, icon: Icon }: { title: string; description?: string; action?: ReactNode; icon?: any }) {
  const FinalIcon = Icon || SearchX;
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-50 to-red-100 ring-1 ring-rose-200/60 flex items-center justify-center mb-4 shadow-sm">
        <FinalIcon className="w-7 h-7 text-rose-400" />
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

// =====================================================================
// CLEARABLE SEARCH INPUT — reusable search bar with a clear (X) button.
// Drop-in replacement for:
//   <div className="relative">
//     <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
//     <Input value={search} onChange={...} className="pl-9" />
//   </div>
//
// Usage:
//   <ClearableSearch value={search} onChange={setSearch} placeholder="Search..." />
//
// Optional props:
//   - onClear: extra callback when X is clicked (e.g., reset page to 0)
//   - className: wrapper styling
//   - inputClassName: input styling
// =====================================================================
export function ClearableSearch({
  value,
  onChange,
  onClear,
  placeholder = "Search...",
  className = "",
  inputClassName = "",
  autoFocus = false,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const handleClear = () => {
    onChange("");
    if (onClear) onClear();
  };
  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        className={`pl-9 ${value ? "pr-9" : ""} ${inputClassName}`}
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full p-0.5 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// =====================================================================
// PAGINATION — standalone pagination control for tables that render
// their own <table> markup (i.e., NOT using DataTable).
//
// Usage:
//   const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 10);
//   // ... render pagedItems in your table ...
//   <Pagination page={page} pageSize={pageSize} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
// =====================================================================

export function usePagination<T>(items: T[], initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pagedItems = items.slice(startIndex, endIndex);

  // Reset to page 1 if items shrink (e.g., due to filtering)
  // Use useEffect-style check inline to avoid hook order issues
  if (page > totalPages && totalPages > 0) {
    setPage(1);
  }

  return {
    page: safePage,
    pageSize,
    totalPages,
    totalItems,
    startIndex: startIndex + 1, // 1-indexed for display
    endIndex,
    pagedItems,
    setPage,
    setPageSize: ( newSize: number) => {
      setPageSize(newSize);
      setPage(1);
    },
  };
}

function getPageNumbers(current: number, total: number): (number | string)[] {
  const pages: (number | string)[] = [];
  const maxVisible = 5;
  if (total <= maxVisible) {
    for (let i = 1; i <= total; i++) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (current > 3) pages.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

export function Pagination({
  page,
  pageSize,
  totalPages,
  totalItems,
  onPageChange,
  onPageSizeChange,
  showPageSizeSelector = true,
}: {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  showPageSizeSelector?: boolean;
}) {
  if (totalItems === 0) return null;
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t bg-slate-50">
      <div className="flex items-center gap-3 text-xs text-slate-600">
        <span>
          Showing <span className="font-semibold text-slate-800">{startIndex + 1}</span>–<span className="font-semibold text-slate-800">{endIndex}</span> of{" "}
          <span className="font-semibold text-slate-800">{totalItems}</span>
        </span>
        {showPageSizeSelector && onPageSizeChange && (
          <span className="flex items-center gap-1">
            <span className="text-slate-500">| Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </span>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => onPageChange(1)} disabled={page === 1} aria-label="First page">
            <ChevronsLeft className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="Previous page">
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          {getPageNumbers(page, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={i} className="px-1.5 text-slate-400 text-xs">…</span>
            ) : (
              <Button
                key={i}
                variant={p === page ? "default" : "outline"}
                size="sm"
                className={`h-7 w-7 p-0 text-xs ${p === page ? "bg-slate-800 text-white border-0" : ""}`}
                onClick={() => onPageChange(p as number)}
              >
                {p}
              </Button>
            )
          )}
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => onPageChange(page + 1)} disabled={page === totalPages} aria-label="Next page">
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => onPageChange(totalPages)} disabled={page === totalPages} aria-label="Last page">
            <ChevronsRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

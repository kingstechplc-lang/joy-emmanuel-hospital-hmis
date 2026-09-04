"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Receipt, Eye, CreditCard, Ban, Trash2, Search, X,
  Download, FileText, CheckCircle2, AlertCircle, Clock,
  Calendar, DollarSign, Filter, FilePlus, Check,
  ScrollText, BarChart3, AlertTriangle, FileSpreadsheet,
  ClipboardCheck, Hourglass, Send, Stamp, FileMinus, PenLine,
  RefreshCcw, HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge,
  formatDate, safeJson, PageHeader, MiniStatCard,
  ClearableSearch, usePagination, Pagination, ModuleHelp,
} from "@/components/ui-helpers";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { PrintButton, PrintLayout } from "@/components/print/print-layout";
import { FieldLabel } from "@/components/ui/required-label";

// ============================================================
// Helpers
// ============================================================
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const formatCurrency = (n: number | null | undefined) =>
  n != null
    ? `GHS ${Number(n || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : "—";

const numberCell = (n: number | null | undefined) =>
  n == null ? "—" : Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const money = (n: number | null | undefined) => Number(n || 0);

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const FINAL_STATUSES = ["paid", "voided", "cancelled", "refunded", "written_off"];
const PRE_ISSUE_STATUSES = ["draft", "pending_review", "approved"];

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  pending_review: "bg-violet-100 text-violet-700 border-violet-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  issued: "bg-emerald-100 text-emerald-700 border-emerald-200",
  partially_paid: "bg-amber-100 text-amber-700 border-amber-200",
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  overdue: "bg-rose-100 text-rose-700 border-rose-200",
  voided: "bg-rose-100 text-rose-700 border-rose-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  refunded: "bg-slate-100 text-slate-600 border-slate-200",
  written_off: "bg-slate-100 text-slate-600 border-slate-200",
};

function InvoiceStatusBadge({ status }: { status: string }) {
  const cls = INVOICE_STATUS_COLORS[status] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function OverdueBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border bg-rose-100 text-rose-700 border-rose-200">
      <AlertCircle className="w-3 h-3" /> Overdue
    </span>
  );
}

const INVOICE_TYPES = [
  { value: "patient", label: "Patient" },
  { value: "insurance", label: "Insurance" },
  { value: "nhis", label: "NHIS" },
  { value: "corporate", label: "Corporate" },
  { value: "proforma", label: "Proforma" },
  { value: "credit", label: "Credit" },
];

const PAYER_TYPES = [
  { value: "self_pay", label: "Self Pay" },
  { value: "nhis", label: "NHIS" },
  { value: "private_insurance", label: "Private Insurance" },
  { value: "corporate", label: "Corporate" },
  { value: "government", label: "Government" },
  { value: "other", label: "Other" },
];

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "issued", label: "Issued" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "voided", label: "Voided" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
  { value: "written_off", label: "Written Off" },
];

const INVOICE_TYPE_FILTERS = [
  { value: "all", label: "All Types" },
  ...INVOICE_TYPES,
];

const PAYER_TYPE_FILTERS = [
  { value: "all", label: "All Payers" },
  ...PAYER_TYPES,
];

// ============================================================
// HELP SECTIONS — tutorial content for the Invoices module
// ============================================================
const INVOICE_HELP_SECTIONS = [
  {
    title: "Invoice Lifecycle",
    content: `Invoices follow a structured lifecycle:
1. DRAFT — Created but not yet reviewed. Can be edited freely.
2. PENDING REVIEW — Submitted for review by a finance user.
3. APPROVED — Reviewed and approved for issuance.
4. ISSUED — Officially issued to the patient/payer. Invoice number is generated. Financial fields are now locked.
5. PARTIALLY PAID — Some payments have been recorded but balance remains.
6. PAID — Full payment received. Balance is zero.
7. OVERDUE — Past due date with outstanding balance.

Exception statuses:
• VOIDED — Cancelled after issuance (requires reason; blocked if payments exist).
• CANCELLED — Cancelled before issuance.
• REFUNDED — Full refund processed.
• WRITTEN OFF — Outstanding balance written off (requires reason + amount).`,
  },
  {
    title: "Payer Types & Responsibility",
    content: `Each invoice has a payer type that determines who is responsible for payment:

• SELF-PAY — Patient pays the full amount.
• NHIS — National Health Insurance Scheme covers eligible services. Patient pays any co-pay or non-covered services.
• PRIVATE INSURANCE — Insurance provider covers a portion. Patient pays co-pay/deductible.
• CORPORATE — Employer/organization covers the bill. Patient may have no responsibility.
• GOVERNMENT — Government-sponsored coverage.

The "Payer Responsibility" fields let you split the total between payer and patient. For example:
• Total: GHS 1,000
• Insurance responsibility: GHS 700
• Patient responsibility: GHS 300`,
  },
  {
    title: "Invoice Types",
    content: `Invoice types help categorize billing:
• PATIENT — General patient invoice
• OUTPATIENT — OPD/clinic visit
• INPATIENT — Admission-related (linked to admission)
• EMERGENCY — Emergency department
• PHARMACY — Medication/dispensing
• LABORATORY — Lab tests
• IMAGING — X-ray, ultrasound, CT, MRI
• PROCEDURE — Medical procedures
• THEATRE — Surgical procedures
• MATERNITY — Maternity/delivery
• AMBULANCE — Transport services
• CORPORATE — Corporate billing
• INSURANCE — Insurance billing
• NHIS — NHIS billing`,
  },
  {
    title: "Line Items & Services",
    content: `Each invoice contains line items that represent billable services:

• Select a service from the dropdown — the price auto-fills from Services & Pricing.
• You can also enter a custom description and price for manual charges.
• Quantity, discount, and tax can be adjusted per line item.
• The system auto-calculates line totals, subtotal, and grand total.
• Services linked to lab orders, imaging, procedures, etc. retain their source reference for financial traceability.

To add items after issuance, use "Add Item" (only available on issued invoices with no payments).`,
  },
  {
    title: "Payments",
    content: `Payments are recorded against issued invoices:
• Multiple payment methods supported: Cash, Mobile Money, Card, Bank Transfer, Insurance, Other.
• Partial payments are supported — the invoice status auto-updates to "Partially Paid".
• Full payment (balance reaches zero) auto-marks the invoice as "Paid".
• Overpayments are tracked — the excess can be refunded or applied to another invoice.
• Each payment generates a unique payment number (PAY-YYYY-NNNNNN).
• Payments are immutable once created — corrections require the Refund workflow.`,
  },
  {
    title: "Credit Notes & Adjustments",
    content: `After an invoice is issued, you cannot directly edit its financial values. Instead:

CREDIT NOTES — Used for:
• Overbilling corrections
• Returned services
• Approved discounts after issuance
• Billing errors

A credit note reduces the invoice balance without modifying the original invoice. It gets its own number (CN-YYYY-NNNNNN).

ADJUSTMENTS — Used for:
• Debit notes (additional charges after issuance)
• Write-offs (removing outstanding balance)
• Corrections

Both credit notes and adjustments preserve the original invoice and create an audit trail.`,
  },
  {
    title: "Reports & Export",
    content: `The Reports tab provides financial insights:
• DAILY — All invoices for a specific date
• MONTHLY — Summary with by-type and by-status breakdowns
• REVENUE BY TYPE — Revenue grouped by invoice type
• OUTSTANDING — All invoices with outstanding balances
• OVERDUE — Invoices past their due date with outstanding balance
• AGING — Accounts receivable aging (Current, 1-30, 31-60, 61-90, 90+ days)
• AUDIT LOG — All invoice-related audit events

CSV Export is available for all invoice data — useful for accounting reconciliation and external reporting.`,
  },
  {
    title: "Permissions",
    content: `Different roles have different permissions:
• VIEW — All clinical/admin staff can view invoices
• CREATE — Finance users, cashiers, records officers can create invoices
• PAYMENT — Cashiers and finance users can record payments
• DISCOUNT — Only organization admins and accountants can apply discounts
• REFUND — Only organization admins and accountants can process refunds
• CANCEL — Facility admins and above can cancel invoices

Dangerous actions (void, write-off, credit note) require confirmation and are fully audit-logged.`,
  },
];

// ============================================================
// Main view — Tabs: Dashboard | Work Queue | Reports
// Dialogs: View Invoice | New Invoice
// ============================================================
export function InvoicesView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const canCreate = can("billing.create");
  const canPay = can("billing.payment");
  const canCancel = can("billing.cancel");
  const canDiscount = can("billing.discount");
  const canRefund = can("billing.refund");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [showNew, setShowNew] = useState(false);
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["invoice-stats"] });
    qc.invalidateQueries({ queryKey: ["invoice-detail"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        description="Manage patient billing — draft, review, approve, issue, and reconcile"
        icon={Receipt}
        gradient="from-rose-500 to-red-600"
        actions={
          <div className="flex items-center gap-2">
            <ModuleHelp title="Invoices" sections={INVOICE_HELP_SECTIONS} />
            <Button
              onClick={() => setShowNew(true)}
              disabled={!canCreate}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" /> New Invoice
            </Button>
          </div>
        }
      />

      {!activeFacilityId && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
            Select a facility to view invoices.
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5" /> Work Queue
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab facilityId={activeFacilityId} />
        </TabsContent>
        <TabsContent value="queue">
          <WorkQueueTab
            facilityId={activeFacilityId}
            onView={(id) => setViewInvoiceId(id)}
            invalidate={invalidate}
            canCreate={canCreate}
            canPay={canPay}
            canCancel={canCancel}
          />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab facilityId={activeFacilityId} />
        </TabsContent>
      </Tabs>

      <NewInvoiceDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => {
          setShowNew(false);
          invalidate();
          setTab("queue");
        }}
        facilityId={activeFacilityId}
        canDiscount={canDiscount}
      />

      {viewInvoiceId && (
        <ViewInvoiceDialog
          invoiceId={viewInvoiceId}
          onClose={() => setViewInvoiceId(null)}
          invalidate={invalidate}
          canCreate={canCreate}
          canPay={canPay}
          canCancel={canCancel}
          canDiscount={canDiscount}
        />
      )}
    </div>
  );
}

// ============================================================
// Tab 1: Dashboard — 12 stat cards from /api/invoices/stats
// ============================================================
function DashboardTab({ facilityId }: { facilityId: string | null }) {
  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["invoice-stats", facilityId],
    queryFn: () => fetchJson(`/api/invoices/stats${qs}`),
    enabled: !!facilityId,
  });

  if (!facilityId) return null;

  if (isLoading) return <LoadingState rows={6} />;
  if (isError)
    return <ErrorState message="Failed to load invoice statistics" onRetry={() => refetch()} />;

  const counts = data?.counts || {};
  const totals = data?.totals || {};

  const cards = [
    { label: "Total Invoices", value: counts.total ?? 0, icon: Receipt, gradient: "from-slate-600 to-slate-700" },
    { label: "Draft", value: counts.draft ?? 0, icon: FileText, gradient: "from-slate-500 to-slate-600" },
    { label: "Pending Review", value: counts.pending_review ?? 0, icon: Hourglass, gradient: "from-violet-500 to-purple-600" },
    { label: "Issued", value: counts.issued ?? 0, icon: Send, gradient: "from-blue-500 to-blue-600" },
    { label: "Partially Paid", value: counts.partially_paid ?? 0, icon: Clock, gradient: "from-amber-500 to-orange-500" },
    { label: "Paid", value: counts.paid ?? 0, icon: CheckCircle2, gradient: "from-emerald-500 to-emerald-600" },
    { label: "Overdue", value: counts.overdue ?? 0, icon: AlertCircle, gradient: "from-rose-500 to-red-600" },
    { label: "Voided", value: counts.voided ?? 0, icon: Ban, gradient: "from-rose-400 to-rose-500" },
    { label: "Cancelled", value: counts.cancelled ?? 0, icon: X, gradient: "from-rose-400 to-rose-500" },
    { label: "Total Invoiced", value: formatCurrency(totals.invoiced), icon: DollarSign, gradient: "from-emerald-600 to-teal-600" },
    { label: "Total Paid", value: formatCurrency(totals.paid), icon: CheckCircle2, gradient: "from-emerald-500 to-emerald-700" },
    { label: "Outstanding", value: formatCurrency(totals.outstanding), icon: AlertTriangle, gradient: "from-amber-600 to-rose-600" },
  ];

  const byStatus = data?.byStatus || [];
  const byInvoiceType = data?.byInvoiceType || [];
  const byPayerType = data?.byPayerType || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <MiniStatCard
            key={i}
            label={c.label}
            value={c.value}
            icon={c.icon}
            gradient={c.gradient}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BreakdownCard title="By Status" rows={byStatus} />
        <BreakdownCard title="By Invoice Type" rows={byInvoiceType} />
        <BreakdownCard title="By Payer Type" rows={byPayerType} />
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <StatLine label="Subtotal" value={formatCurrency(totals.subtotal)} />
          <StatLine label="Discount" value={formatCurrency(totals.discount)} />
          <StatLine label="Tax" value={formatCurrency(totals.tax)} />
          <StatLine label="Refunded" value={formatCurrency(totals.refunded)} />
          <StatLine label="Credited" value={formatCurrency(totals.credited)} />
          <StatLine label="Overdue Amount" value={formatCurrency(totals.overdue)} />
          <StatLine label="Credit Notes (issued)" value={data?.creditNotes?.issued ?? 0} />
          <StatLine label="Pending Refunds" value={data?.refunds?.pending ?? 0} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="text-sm font-mono font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number; total: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-500" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">No data.</p>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">{r.label || "—"}</Badge>
                  <span className="text-slate-500">{r.count} inv.</span>
                </div>
                <span className="font-mono font-semibold text-slate-800">{formatCurrency(r.total)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tab 2: Work Queue — filters + table + pagination + CSV export
// ============================================================
function WorkQueueTab({
  facilityId,
  onView,
  invalidate,
  canCreate,
  canPay,
  canCancel,
}: {
  facilityId: string | null;
  onView: (id: string) => void;
  invalidate: () => void;
  canCreate: boolean;
  canPay: boolean;
  canCancel: boolean;
}) {
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [payerFilter, setPayerFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const debouncedSearch = useDebouncedValue(search, 350);

  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  if (debouncedSearch) params.set("q", debouncedSearch);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (typeFilter !== "all") params.set("invoiceType", typeFilter);
  if (payerFilter !== "all") params.set("payerType", payerFilter);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["invoices", facilityId, debouncedSearch, statusFilter, typeFilter, payerFilter, from, to],
    queryFn: () => fetchJson(`/api/invoices${qs}`),
    enabled: !!facilityId,
  });

  const items: any[] = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 15);

  const handleExport = () => {
    const p = new URLSearchParams();
    if (facilityId) p.set("facilityId", facilityId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const exportQs = p.toString() ? `?${p.toString()}` : "";
    window.open(`/api/invoices/export${exportQs}`, "_blank");
  };

  const cancel = (inv: any) => {
    confirmAction({
      title: "Cancel this invoice?",
      description:
        "Cancelling marks the invoice as cancelled. This cannot be undone. If payments were already received, they will need to be refunded separately.",
      confirmText: "Yes, cancel invoice",
      variant: "warning",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/invoices/${inv.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "cancel" }),
          });
          if (!res.ok) {
            const err = await safeJson(res);
            throw new Error(err.error || "Failed");
          }
          toast.success("Invoice cancelled");
          invalidate();
        } catch (e: any) {
          toast.error(e.message);
        }
      },
    });
  };

  const issue = async (inv: any) => {
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "issue" }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success(`Invoice ${inv.invoiceNumber} issued`);
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setPayerFilter("all");
    setFrom("");
    setTo("");
  };

  const hasActiveFilters =
    !!debouncedSearch ||
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    payerFilter !== "all" ||
    !!from ||
    !!to;

  if (!facilityId) return null;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
            <ClearableSearch
              value={search}
              onChange={setSearch}
              placeholder="Search invoice #, patient name or patient #..."
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 shrink-0">
              <Download className="w-3.5 h-3.5" /> CSV Export
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                {INVOICE_TYPE_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={payerFilter} onValueChange={setPayerFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Payer" /></SelectTrigger>
              <SelectContent>
                {PAYER_TYPE_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 text-xs" />
            <div className="flex items-center gap-1">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-xs flex-1" />
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-xs text-rose-600 hover:text-rose-700">
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState message="Failed to load invoices" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title={hasActiveFilters ? "No matching invoices" : "No invoices yet"}
              description={
                hasActiveFilters
                  ? "Try adjusting or clearing your filters."
                  : "Create a new invoice to bill a patient."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Invoice #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Payer</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Total</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Paid</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Balance</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Issued</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Due</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((inv: any) => (
                    <tr key={inv.id} className="border-b hover:bg-rose-50/30">
                      <td className="p-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {inv.invoiceNumber || <span className="text-slate-400 italic">(draft)</span>}
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">
                          {inv.patient?.firstName} {inv.patient?.lastName}
                        </div>
                        <div className="text-xs text-slate-500">{inv.patient?.patientNumber}</div>
                      </td>
                      <td className="p-3 text-xs capitalize text-slate-600">
                        {(inv.invoiceType || "patient").replace(/_/g, " ")}
                      </td>
                      <td className="p-3 text-xs capitalize text-slate-600">
                        {(inv.payerType || "self_pay").replace(/_/g, " ")}
                      </td>
                      <td className="p-3 text-right font-mono text-xs">{formatCurrency(inv.total)}</td>
                      <td className="p-3 text-right font-mono text-xs text-emerald-700">{formatCurrency(inv.amountPaid)}</td>
                      <td className="p-3 text-right font-mono text-xs text-rose-700">{formatCurrency(inv.balance)}</td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <InvoiceStatusBadge status={inv.status} />
                          {inv.isOverdue && <OverdueBadge />}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{formatDate(inv.issuedAt)}</td>
                      <td className="p-3 text-xs text-slate-600 whitespace-nowrap">
                        {inv.dueAt ? (
                          <span className={inv.isOverdue ? "text-rose-700 font-semibold" : ""}>
                            {formatDate(inv.dueAt)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onView(inv.id)}
                            className="gap-1 h-7 text-xs"
                          >
                            <Eye className="w-3 h-3" /> View
                          </Button>
                          {inv.balance > 0 &&
                            !FINAL_STATUSES.includes(inv.status) &&
                            inv.status !== "draft" &&
                            canPay && (
                              <Button
                                size="sm"
                                onClick={() => onView(inv.id)}
                                className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                                title="Record payment"
                              >
                                <CreditCard className="w-3 h-3" /> Pay
                              </Button>
                            )}
                          {PRE_ISSUE_STATUSES.includes(inv.status) && canCreate && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => issue(inv)}
                              className="gap-1 h-7 text-xs"
                              title="Issue invoice"
                            >
                              <Send className="w-3 h-3" /> Issue
                            </Button>
                          )}
                          {inv.status === "issued" && money(inv.amountPaid) === 0 && canCancel && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => cancel(inv)}
                              className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700 border-rose-200 hover:border-rose-300"
                              title="Void invoice"
                            >
                              <Ban className="w-3 h-3" /> Void
                            </Button>
                          )}
                          {inv.status === "draft" && canCancel && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancel(inv)}
                              className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700"
                            >
                              <X className="w-3 h-3" /> Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              totalItems={totalItems}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </CardContent>
        </Card>
      )}
      {confirmDialogEl}
    </div>
  );
}

// ============================================================
// Tab 5: Reports — multiple report types with formatted tables
// ============================================================
const REPORT_TYPES = [
  { value: "daily", label: "Daily Revenue", needsDateRange: true, singleDate: false },
  { value: "monthly", label: "Monthly Revenue", needsDateRange: true, singleDate: false },
  { value: "revenue_by_type", label: "Revenue by Type", needsDateRange: true, singleDate: false },
  { value: "outstanding", label: "Outstanding Balances", needsDateRange: false, singleDate: false },
  { value: "overdue", label: "Overdue Invoices", needsDateRange: false, singleDate: false },
  { value: "aging", label: "Aging Report", needsDateRange: false, singleDate: false },
  { value: "audit_log", label: "Audit Log", needsDateRange: true, singleDate: false },
];

function ReportsTab({ facilityId }: { facilityId: string | null }) {
  const [reportType, setReportType] = useState("daily");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [generated, setGenerated] = useState(false);

  const reportCfg = REPORT_TYPES.find((r) => r.value === reportType) || REPORT_TYPES[0];

  const handleGenerate = () => setGenerated(true);

  const handleExport = () => {
    const p = new URLSearchParams();
    if (facilityId) p.set("facilityId", facilityId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const exportQs = p.toString() ? `?${p.toString()}` : "";
    window.open(`/api/invoices/export${exportQs}`, "_blank");
  };

  if (!facilityId) return null;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div>
              <FieldLabel required>Report Type</FieldLabel>
              <Select value={reportType} onValueChange={(v) => { setReportType(v); setGenerated(false); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {reportCfg.needsDateRange && (
              <>
                <div>
                  <FieldLabel required>From</FieldLabel>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 text-xs" />
                </div>
                <div>
                  <FieldLabel required>To</FieldLabel>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-xs" />
                </div>
              </>
            )}
            {!reportCfg.needsDateRange && (
              <div className="hidden md:block" />
            )}
            <div className="flex items-end gap-2">
              <Button onClick={handleGenerate} className="gap-1.5 bg-rose-600 hover:bg-rose-700">
                <BarChart3 className="w-3.5 h-3.5" /> Generate
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!generated ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No report generated yet"
              description="Select a report type and date range, then click Generate."
              icon={FileSpreadsheet}
            />
          </CardContent>
        </Card>
      ) : (
        <ReportRenderer
          reportType={reportType}
          facilityId={facilityId}
          from={from}
          to={to}
        />
      )}
    </div>
  );
}

function ReportRenderer({
  reportType,
  facilityId,
  from,
  to,
}: {
  reportType: string;
  facilityId: string;
  from: string;
  to: string;
}) {
  const params = new URLSearchParams();
  params.set("facilityId", facilityId);
  if (reportType === "daily" || reportType === "monthly") {
    // Use last 30 days if not specified
    const f = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const t = to || new Date().toISOString().slice(0, 10);
    params.set("from", f);
    params.set("to", t);
  } else if (reportType === "audit_log") {
    const f = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const t = to || new Date().toISOString().slice(0, 10);
    params.set("dateFrom", f);
    params.set("dateTo", t);
  } else {
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }

  const isAudit = reportType === "audit_log";
  const url = isAudit
    ? `/api/audit-logs?${params.toString()}&resourceType=invoice&limit=200`
    : `/api/invoices?${params.toString()}&limit=500`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["invoice-report", reportType, facilityId, from, to],
    queryFn: () => fetchJson(url),
  });

  if (isLoading) return <LoadingState rows={6} />;
  if (isError)
    return <ErrorState message="Failed to load report data" onRetry={() => refetch()} />;

  if (reportType === "daily") return <DailyReport items={data?.items || []} />;
  if (reportType === "monthly") return <MonthlyReport items={data?.items || []} />;
  if (reportType === "revenue_by_type") return <RevenueByTypeReport items={data?.items || []} />;
  if (reportType === "outstanding") return <OutstandingReport items={data?.items || []} />;
  if (reportType === "overdue") return <OverdueReport items={data?.items || []} />;
  if (reportType === "aging") return <AgingReport items={data?.items || []} />;
  if (reportType === "audit_log") return <AuditLogReport items={data?.items || []} />;
  return null;
}

function ReportCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-rose-600" /> {title}
        </CardTitle>
        {subtitle && <CardDescription className="text-xs">{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function ReportEmpty({ message }: { message?: string }) {
  return (
    <div className="py-8">
      <EmptyState
        title="No data in this period"
        description={message || "Try a different date range or check the underlying records."}
        icon={FileText}
      />
    </div>
  );
}

function DailyReport({ items }: { items: any[] }) {
  const byDay = useMemo(() => {
    const m = new Map<string, { count: number; total: number; paid: number }>();
    for (const inv of items) {
      const d = inv.issuedAt || inv.createdAt;
      if (!d) continue;
      const key = new Date(d).toISOString().slice(0, 10);
      const cur = m.get(key) || { count: 0, total: 0, paid: 0 };
      cur.count++;
      cur.total += money(inv.total);
      cur.paid += money(inv.amountPaid);
      m.set(key, cur);
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => ({ day, ...v }));
  }, [items]);

  if (byDay.length === 0) return <ReportCard title="Daily Revenue"><ReportEmpty /></ReportCard>;

  const grandTotal = byDay.reduce((s, r) => s + r.total, 0);
  const grandPaid = byDay.reduce((s, r) => s + r.paid, 0);
  const grandCount = byDay.reduce((s, r) => s + r.count, 0);

  return (
    <ReportCard title="Daily Revenue" subtitle={`${byDay.length} days • ${grandCount} invoices • Total ${formatCurrency(grandTotal)} • Paid ${formatCurrency(grandPaid)}`}>
      <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-700">Date</th>
              <th className="text-right p-2 font-semibold text-slate-700">Invoices</th>
              <th className="text-right p-2 font-semibold text-slate-700">Total Billed</th>
              <th className="text-right p-2 font-semibold text-slate-700">Collected</th>
              <th className="text-right p-2 font-semibold text-slate-700">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {byDay.map((r) => (
              <tr key={r.day} className="border-b hover:bg-rose-50/30">
                <td className="p-2 text-slate-700">{formatDate(r.day)}</td>
                <td className="p-2 text-right font-mono text-xs">{r.count}</td>
                <td className="p-2 text-right font-mono text-xs">{formatCurrency(r.total)}</td>
                <td className="p-2 text-right font-mono text-xs text-emerald-700">{formatCurrency(r.paid)}</td>
                <td className="p-2 text-right font-mono text-xs text-rose-700">{formatCurrency(r.total - r.paid)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-100">
            <tr>
              <td className="p-2 font-semibold">Total</td>
              <td className="p-2 text-right font-mono text-xs font-semibold">{grandCount}</td>
              <td className="p-2 text-right font-mono text-xs font-semibold">{formatCurrency(grandTotal)}</td>
              <td className="p-2 text-right font-mono text-xs font-semibold text-emerald-700">{formatCurrency(grandPaid)}</td>
              <td className="p-2 text-right font-mono text-xs font-semibold text-rose-700">{formatCurrency(grandTotal - grandPaid)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportCard>
  );
}

function MonthlyReport({ items }: { items: any[] }) {
  const byMonth = useMemo(() => {
    const m = new Map<string, { count: number; total: number; paid: number }>();
    for (const inv of items) {
      const d = inv.issuedAt || inv.createdAt;
      if (!d) continue;
      const key = new Date(d).toISOString().slice(0, 7);
      const cur = m.get(key) || { count: 0, total: 0, paid: 0 };
      cur.count++;
      cur.total += money(inv.total);
      cur.paid += money(inv.amountPaid);
      m.set(key, cur);
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, ...v }));
  }, [items]);

  if (byMonth.length === 0) return <ReportCard title="Monthly Revenue"><ReportEmpty /></ReportCard>;

  const grandTotal = byMonth.reduce((s, r) => s + r.total, 0);
  const grandPaid = byMonth.reduce((s, r) => s + r.paid, 0);

  return (
    <ReportCard title="Monthly Revenue" subtitle={`${byMonth.length} months • Total ${formatCurrency(grandTotal)} • Paid ${formatCurrency(grandPaid)}`}>
      <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-700">Month</th>
              <th className="text-right p-2 font-semibold text-slate-700">Invoices</th>
              <th className="text-right p-2 font-semibold text-slate-700">Total Billed</th>
              <th className="text-right p-2 font-semibold text-slate-700">Collected</th>
              <th className="text-right p-2 font-semibold text-slate-700">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {byMonth.map((r) => (
              <tr key={r.month} className="border-b hover:bg-rose-50/30">
                <td className="p-2 text-slate-700">{r.month}</td>
                <td className="p-2 text-right font-mono text-xs">{r.count}</td>
                <td className="p-2 text-right font-mono text-xs">{formatCurrency(r.total)}</td>
                <td className="p-2 text-right font-mono text-xs text-emerald-700">{formatCurrency(r.paid)}</td>
                <td className="p-2 text-right font-mono text-xs text-rose-700">{formatCurrency(r.total - r.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportCard>
  );
}

function RevenueByTypeReport({ items }: { items: any[] }) {
  const byType = useMemo(() => {
    const m = new Map<string, { count: number; total: number; paid: number }>();
    for (const inv of items) {
      const key = inv.invoiceType || "patient";
      const cur = m.get(key) || { count: 0, total: 0, paid: 0 };
      cur.count++;
      cur.total += money(inv.total);
      cur.paid += money(inv.amountPaid);
      m.set(key, cur);
    }
    return Array.from(m.entries()).map(([type, v]) => ({ type, ...v }));
  }, [items]);

  if (byType.length === 0) return <ReportCard title="Revenue by Type"><ReportEmpty /></ReportCard>;

  return (
    <ReportCard title="Revenue by Invoice Type">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-700">Type</th>
              <th className="text-right p-2 font-semibold text-slate-700">Invoices</th>
              <th className="text-right p-2 font-semibold text-slate-700">Total Billed</th>
              <th className="text-right p-2 font-semibold text-slate-700">Collected</th>
              <th className="text-right p-2 font-semibold text-slate-700">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {byType.map((r) => (
              <tr key={r.type} className="border-b hover:bg-rose-50/30">
                <td className="p-2 capitalize text-slate-700">{r.type.replace(/_/g, " ")}</td>
                <td className="p-2 text-right font-mono text-xs">{r.count}</td>
                <td className="p-2 text-right font-mono text-xs">{formatCurrency(r.total)}</td>
                <td className="p-2 text-right font-mono text-xs text-emerald-700">{formatCurrency(r.paid)}</td>
                <td className="p-2 text-right font-mono text-xs text-rose-700">{formatCurrency(r.total - r.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportCard>
  );
}

function OutstandingReport({ items }: { items: any[] }) {
  const rows = items
    .filter((i) => money(i.balance) > 0 && !["cancelled", "voided", "written_off"].includes(i.status))
    .sort((a, b) => money(b.balance) - money(a.balance));

  if (rows.length === 0)
    return <ReportCard title="Outstanding Balances"><ReportEmpty message="All invoices are fully paid or written off." /></ReportCard>;

  const totalOutstanding = rows.reduce((s, r) => s + money(r.balance), 0);

  return (
    <ReportCard title="Outstanding Balances" subtitle={`${rows.length} invoices • Total outstanding ${formatCurrency(totalOutstanding)}`}>
      <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-700">Invoice #</th>
              <th className="text-left p-2 font-semibold text-slate-700">Patient</th>
              <th className="text-left p-2 font-semibold text-slate-700">Status</th>
              <th className="text-right p-2 font-semibold text-slate-700">Total</th>
              <th className="text-right p-2 font-semibold text-slate-700">Paid</th>
              <th className="text-right p-2 font-semibold text-slate-700">Balance</th>
              <th className="text-left p-2 font-semibold text-slate-700">Due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => (
              <tr key={inv.id} className="border-b hover:bg-rose-50/30">
                <td className="p-2 font-mono text-xs">{inv.invoiceNumber}</td>
                <td className="p-2 text-slate-700">{inv.patient?.firstName} {inv.patient?.lastName}</td>
                <td className="p-2"><InvoiceStatusBadge status={inv.status} /></td>
                <td className="p-2 text-right font-mono text-xs">{formatCurrency(inv.total)}</td>
                <td className="p-2 text-right font-mono text-xs text-emerald-700">{formatCurrency(inv.amountPaid)}</td>
                <td className="p-2 text-right font-mono text-xs font-semibold text-rose-700">{formatCurrency(inv.balance)}</td>
                <td className="p-2 text-xs text-slate-600">{formatDate(inv.dueAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportCard>
  );
}

function OverdueReport({ items }: { items: any[] }) {
  const rows = items.filter((i) => i.isOverdue);
  if (rows.length === 0)
    return <ReportCard title="Overdue Invoices"><ReportEmpty message="No overdue invoices. Great job!" /></ReportCard>;

  const totalOverdue = rows.reduce((s, r) => s + money(r.balance), 0);

  return (
    <ReportCard title="Overdue Invoices" subtitle={`${rows.length} invoices • Total overdue ${formatCurrency(totalOverdue)}`}>
      <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-700">Invoice #</th>
              <th className="text-left p-2 font-semibold text-slate-700">Patient</th>
              <th className="text-right p-2 font-semibold text-slate-700">Balance</th>
              <th className="text-left p-2 font-semibold text-slate-700">Due</th>
              <th className="text-left p-2 font-semibold text-slate-700">Days Overdue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => {
              const days = inv.dueAt ? Math.floor((Date.now() - new Date(inv.dueAt).getTime()) / 86400000) : 0;
              return (
                <tr key={inv.id} className="border-b hover:bg-rose-50/30">
                  <td className="p-2 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="p-2 text-slate-700">{inv.patient?.firstName} {inv.patient?.lastName}</td>
                  <td className="p-2 text-right font-mono text-xs font-semibold text-rose-700">{formatCurrency(inv.balance)}</td>
                  <td className="p-2 text-xs text-slate-600">{formatDate(inv.dueAt)}</td>
                  <td className="p-2">
                    <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 text-xs">{days} days</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ReportCard>
  );
}

function AgingReport({ items }: { items: any[] }) {
  const buckets = useMemo(() => {
    const b = {
      current: { count: 0, total: 0 },
      "1_30": { count: 0, total: 0 },
      "31_60": { count: 0, total: 0 },
      "61_90": { count: 0, total: 0 },
      "90_plus": { count: 0, total: 0 },
    };
    for (const inv of items) {
      if (money(inv.balance) <= 0) continue;
      if (["cancelled", "voided", "written_off", "paid", "refunded"].includes(inv.status)) continue;
      if (!inv.dueAt) {
        b.current.count++;
        b.current.total += money(inv.balance);
        continue;
      }
      const days = Math.floor((Date.now() - new Date(inv.dueAt).getTime()) / 86400000);
      if (days <= 0) { b.current.count++; b.current.total += money(inv.balance); }
      else if (days <= 30) { b["1_30"].count++; b["1_30"].total += money(inv.balance); }
      else if (days <= 60) { b["31_60"].count++; b["31_60"].total += money(inv.balance); }
      else if (days <= 90) { b["61_90"].count++; b["61_90"].total += money(inv.balance); }
      else { b["90_plus"].count++; b["90_plus"].total += money(inv.balance); }
    }
    return b;
  }, [items]);

  const rows = [
    { label: "Current (not yet due)", ...buckets.current, color: "text-emerald-700" },
    { label: "1 – 30 days", ...buckets["1_30"], color: "text-amber-700" },
    { label: "31 – 60 days", ...buckets["31_60"], color: "text-orange-700" },
    { label: "61 – 90 days", ...buckets["61_90"], color: "text-rose-700" },
    { label: "Over 90 days", ...buckets["90_plus"], color: "text-red-800" },
  ];
  const totalOutstanding = rows.reduce((s, r) => s + r.total, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  if (totalCount === 0) return <ReportCard title="Aging Report"><ReportEmpty message="No outstanding balances to age." /></ReportCard>;

  return (
    <ReportCard title="Aging Report" subtitle={`${totalCount} outstanding invoices • ${formatCurrency(totalOutstanding)}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-700">Bucket</th>
              <th className="text-right p-2 font-semibold text-slate-700">Invoices</th>
              <th className="text-right p-2 font-semibold text-slate-700">Outstanding</th>
              <th className="text-right p-2 font-semibold text-slate-700">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b hover:bg-rose-50/30">
                <td className="p-2 text-slate-700">{r.label}</td>
                <td className="p-2 text-right font-mono text-xs">{r.count}</td>
                <td className={`p-2 text-right font-mono text-xs font-semibold ${r.color}`}>{formatCurrency(r.total)}</td>
                <td className="p-2 text-right font-mono text-xs text-slate-500">
                  {totalOutstanding > 0 ? ((r.total / totalOutstanding) * 100).toFixed(1) : "0.0"}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-100">
            <tr>
              <td className="p-2 font-semibold">Total</td>
              <td className="p-2 text-right font-mono text-xs font-semibold">{totalCount}</td>
              <td className="p-2 text-right font-mono text-xs font-semibold">{formatCurrency(totalOutstanding)}</td>
              <td className="p-2 text-right font-mono text-xs font-semibold">100.0%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportCard>
  );
}

function AuditLogReport({ items }: { items: any[] }) {
  if (items.length === 0) return <ReportCard title="Invoice Audit Log"><ReportEmpty /></ReportCard>;

  return (
    <ReportCard title="Invoice Audit Log" subtitle={`${items.length} events`}>
      <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-700">When</th>
              <th className="text-left p-2 font-semibold text-slate-700">User</th>
              <th className="text-left p-2 font-semibold text-slate-700">Action</th>
              <th className="text-left p-2 font-semibold text-slate-700">Resource</th>
              <th className="text-left p-2 font-semibold text-slate-700">Reason</th>
            </tr>
          </thead>
          <tbody>
            {items.map((log) => (
              <tr key={log.id} className="border-b hover:bg-rose-50/30">
                <td className="p-2 text-xs text-slate-600 whitespace-nowrap">{formatDate(log.createdAt, true)}</td>
                <td className="p-2 text-xs text-slate-700">
                  {log.user ? `${log.user.firstName || ""} ${log.user.lastName || ""}`.trim() || log.user.username : "—"}
                </td>
                <td className="p-2 text-xs">
                  <Badge variant="outline" className="font-mono text-[10px]">{log.action}</Badge>
                </td>
                <td className="p-2 text-xs text-slate-600">
                  <span className="font-mono">{log.resourceType}</span>
                  {log.resourceId && <span className="text-slate-400 ml-1">({log.resourceId.slice(-8)})</span>}
                </td>
                <td className="p-2 text-xs text-slate-600">{log.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportCard>
  );
}

// ============================================================
// Tab 3: View Invoice Dialog — multi-section with lifecycle actions
// ============================================================
function ViewInvoiceDialog({
  invoiceId,
  onClose,
  invalidate,
  canCreate,
  canPay,
  canCancel,
  canDiscount,
}: {
  invoiceId: string;
  onClose: () => void;
  invalidate: () => void;
  canCreate: boolean;
  canPay: boolean;
  canCancel: boolean;
  canDiscount: boolean;
}) {
  const qc = useQueryClient();
  const [innerTab, setInnerTab] = useState("overview");
  const [payOpen, setPayOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState<{ kind: string } | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["invoice-detail", invoiceId],
    queryFn: () => fetchJson(`/api/invoices/${invoiceId}`),
    enabled: !!invoiceId,
  });

  const inv = data?.item;

  const lifecycleMutation = useMutation({
    mutationFn: async (vars: { action: string; body?: any }) => {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: vars.action, ...(vars.body || {}) }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: (_data, vars) => {
      toast.success(`Invoice ${vars.action.replace(/_/g, " ")} successful`);
      qc.invalidateQueries({ queryKey: ["invoice-detail", invoiceId] });
      invalidate();
      setActionDialog(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runAction = (action: string) => {
    if (action === "review" || action === "approve" || action === "issue") {
      lifecycleMutation.mutate({ action });
    } else {
      setActionDialog({ kind: action });
    }
  };

  const submitActionDialog = async (vals: any) => {
    if (!actionDialog) return;
    lifecycleMutation.mutate({ action: actionDialog.kind, body: vals });
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
          {isLoading || !inv ? (
            <div className="p-4"><LoadingState rows={4} /></div>
          ) : (
            <>
              <DialogHeader className="shrink-0">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <Receipt className="w-5 h-5 text-rose-600" />
                  <span className="font-mono">{inv.invoiceNumber}</span>
                  <InvoiceStatusBadge status={inv.status} />
                  {inv.isOverdue && <OverdueBadge />}
                </DialogTitle>
                <DialogDescription className="text-white/80">
                  <span className="font-medium text-slate-700">
                    {inv.patient?.firstName} {inv.patient?.lastName}
                  </span>{" "}
                  ({inv.patient?.patientNumber}) • {inv.facility?.name} •{" "}
                  <span className="capitalize">{(inv.invoiceType || "patient").replace(/_/g, " ")}</span> •{" "}
                  <span className="capitalize">{(inv.payerType || "self_pay").replace(/_/g, " ")}</span>
                </DialogDescription>
              </DialogHeader>

              {/* Lifecycle action bar */}
              <div className="shrink-0 flex flex-wrap gap-2 pb-2 border-b">
                {inv.status === "draft" && canCreate && (
                  <Button size="sm" variant="outline" onClick={() => runAction("review")} disabled={lifecycleMutation.isPending} className="gap-1.5 h-7 text-xs">
                    <ClipboardCheck className="w-3.5 h-3.5" /> Submit for Review
                  </Button>
                )}
                {inv.status === "pending_review" && canCreate && (
                  <Button size="sm" onClick={() => runAction("approve")} disabled={lifecycleMutation.isPending} className="gap-1.5 h-7 text-xs bg-blue-600 hover:bg-blue-700">
                    <Check className="w-3.5 h-3.5" /> Approve
                  </Button>
                )}
                {PRE_ISSUE_STATUSES.includes(inv.status) && canCreate && (
                  <Button size="sm" onClick={() => runAction("issue")} disabled={lifecycleMutation.isPending} className="gap-1.5 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                    <Send className="w-3.5 h-3.5" /> Issue
                  </Button>
                )}
                {inv.status === "issued" && money(inv.amountPaid) === 0 && canCancel && (
                  <Button size="sm" variant="outline" onClick={() => runAction("void")} disabled={lifecycleMutation.isPending} className="gap-1.5 h-7 text-xs text-rose-600 border-rose-200 hover:border-rose-300">
                    <Ban className="w-3.5 h-3.5" /> Void
                  </Button>
                )}
                {inv.status === "draft" && canCancel && (
                  <Button size="sm" variant="ghost" onClick={() => runAction("cancel")} disabled={lifecycleMutation.isPending} className="gap-1.5 h-7 text-xs text-rose-600 hover:text-rose-700">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </Button>
                )}
                {money(inv.balance) > 0 &&
                  !FINAL_STATUSES.includes(inv.status) &&
                  inv.status !== "draft" && canCancel && (
                    <Button size="sm" variant="outline" onClick={() => runAction("write_off")} disabled={lifecycleMutation.isPending} className="gap-1.5 h-7 text-xs text-amber-700 border-amber-200 hover:border-amber-300">
                      <FileMinus className="w-3.5 h-3.5" /> Write Off
                    </Button>
                  )}
                {!["voided", "cancelled", "draft"].includes(inv.status) && canDiscount && (
                  <Button size="sm" variant="outline" onClick={() => runAction("credit_note")} disabled={lifecycleMutation.isPending} className="gap-1.5 h-7 text-xs">
                    <Stamp className="w-3.5 h-3.5" /> Credit Note
                  </Button>
                )}
                {PRE_ISSUE_STATUSES.includes(inv.status) && canCreate && (
                  <Button size="sm" variant="outline" onClick={() => setAddItemOpen(true)} className="gap-1.5 h-7 text-xs">
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </Button>
                )}
                {money(inv.balance) > 0 &&
                  !FINAL_STATUSES.includes(inv.status) &&
                  inv.status !== "draft" && canPay && (
                    <Button size="sm" onClick={() => setPayOpen(true)} className="gap-1.5 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                      <CreditCard className="w-3.5 h-3.5" /> Record Payment
                    </Button>
                  )}
                <Button size="sm" variant="outline" onClick={() => { refetch(); toast.success("Invoice refreshed"); }} disabled={isFetching} className="gap-1.5 h-7 text-xs ml-auto">
                  <RefreshCcw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>

              {/* Inner tabs */}
              <Tabs value={innerTab} onValueChange={setInnerTab} className="flex-1 overflow-hidden flex flex-col">
                <TabsList className="flex-wrap h-auto shrink-0">
                  <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="items" className="text-xs">Line Items ({inv._count?.items ?? (inv.items?.length || 0)})</TabsTrigger>
                  <TabsTrigger value="payments" className="text-xs">Payments ({inv._count?.payments ?? (inv.payments?.length || 0)})</TabsTrigger>
                  <TabsTrigger value="credits" className="text-xs">Credit Notes ({inv._count?.creditNotes ?? (inv.creditNotes?.length || 0)})</TabsTrigger>
                  <TabsTrigger value="audit" className="text-xs">Audit</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="overflow-y-auto pr-1">
                  <OverviewTab inv={inv} nhisClaims={data?.nhisClaims || []} />
                </TabsContent>
                <TabsContent value="items" className="overflow-y-auto pr-1">
                  <LineItemsTable items={inv.items || []} currency={inv.currency} />
                </TabsContent>
                <TabsContent value="payments" className="overflow-y-auto pr-1">
                  <PaymentsTable payments={inv.payments || []} currency={inv.currency} />
                </TabsContent>
                <TabsContent value="credits" className="overflow-y-auto pr-1">
                  <CreditNotesTable creditNotes={inv.creditNotes || []} currency={inv.currency} />
                </TabsContent>
                <TabsContent value="audit" className="overflow-y-auto pr-1">
                  <AuditTab inv={inv} />
                </TabsContent>
              </Tabs>

              <DialogFooter className="shrink-0 border-t pt-3 gap-2">
                <PrintButton
                  label="Print Invoice"
                  renderContent={() => (
                    <PrintLayout
                      title="Invoice"
                      subtitle={inv.facility?.name}
                      documentNumber={inv.invoiceNumber}
                      facility={inv.facility}
                      patient={inv.patient}
                    >
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginBottom: "16px" }}>
                        <thead>
                          <tr style={{ background: "#f1f5f9" }}>
                            <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Description</th>
                            <th style={{ padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>Qty</th>
                            <th style={{ padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>Unit Price</th>
                            <th style={{ padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>Disc</th>
                            <th style={{ padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(inv.items || []).map((it: any) => (
                            <tr key={it.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "6px 8px" }}>{it.description}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right" }}>{it.quantity}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right" }}>{numberCell(it.unitPrice)}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right" }}>{numberCell(it.discount)}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{numberCell(it.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ marginLeft: "auto", width: "280px", fontSize: "11px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>Subtotal:</span><span>{formatCurrency(inv.subtotal)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>Discount:</span><span>-{formatCurrency(inv.discount)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>Tax:</span><span>{formatCurrency(inv.tax)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "2px solid #059669", marginTop: "4px" }}>
                          <span style={{ fontWeight: 700 }}>Total:</span>
                          <span style={{ fontWeight: 700, color: "#059669" }}>{formatCurrency(inv.total)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>Paid:</span><span style={{ color: "#059669" }}>{formatCurrency(inv.amountPaid)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                          <span style={{ fontWeight: 700 }}>Balance Due:</span>
                          <span style={{ fontWeight: 700, color: "#be123c" }}>{formatCurrency(inv.balance)}</span>
                        </div>
                      </div>
                      <div style={{ marginTop: "16px", fontSize: "10px", color: "#64748b" }}>
                        <p>Status: <strong>{inv.status}</strong></p>
                        <p>Issued: {formatDate(inv.issuedAt, true)}</p>
                        {inv.dueAt && <p>Due: {formatDate(inv.dueAt)}</p>}
                      </div>
                    </PrintLayout>
                  )}
                />
                <Button variant="outline" onClick={onClose}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {payOpen && inv && (
        <PaymentDialog
          invoice={inv}
          onClose={() => setPayOpen(false)}
          onDone={() => {
            setPayOpen(false);
            qc.invalidateQueries({ queryKey: ["invoice-detail", invoiceId] });
            invalidate();
          }}
          canPay={canPay}
        />
      )}

      {addItemOpen && inv && (
        <AddItemDialog
          invoice={inv}
          onClose={() => setAddItemOpen(false)}
          onDone={() => {
            setAddItemOpen(false);
            qc.invalidateQueries({ queryKey: ["invoice-detail", invoiceId] });
            invalidate();
          }}
          facilityId={inv.facilityId}
        />
      )}

      {actionDialog && inv && (
        <LifecycleActionDialog
          kind={actionDialog.kind}
          invoice={inv}
          saving={lifecycleMutation.isPending}
          onClose={() => setActionDialog(null)}
          onSubmit={submitActionDialog}
        />
      )}
    </>
  );
}

function OverviewTab({ inv, nhisClaims }: { inv: any; nhisClaims: any[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 py-3">
      {/* Financial Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" /> Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono">{formatCurrency(inv.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Discount {inv.discountReason ? `(${inv.discountReason})` : ""}</span><span className="font-mono text-rose-700">-{formatCurrency(inv.discount)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Tax (rate {inv.taxRate ?? 0}%)</span><span className="font-mono">+{formatCurrency(inv.tax)}</span></div>
          <div className="flex justify-between border-t pt-1.5"><span className="font-semibold">Total</span><span className="font-mono font-bold text-emerald-700">{formatCurrency(inv.total)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="font-mono text-emerald-700">{formatCurrency(inv.amountPaid)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Refunded</span><span className="font-mono text-purple-700">{formatCurrency(inv.amountRefunded)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Credited</span><span className="font-mono text-amber-700">{formatCurrency(inv.amountCredited)}</span></div>
          {inv.writeOffAmount ? (
            <div className="flex justify-between"><span className="text-slate-500">Written Off</span><span className="font-mono text-rose-700">{formatCurrency(inv.writeOffAmount)}</span></div>
          ) : null}
          <div className="flex justify-between border-t pt-1.5"><span className="font-semibold">Balance Due</span><span className="font-mono font-bold text-rose-700">{formatCurrency(inv.balance)}</span></div>
        </CardContent>
      </Card>

      {/* Payer responsibility + insurance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600" /> Payer & Insurance
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1.5 text-sm">
          <KV label="Payer Type" value={<span className="capitalize">{(inv.payerType || "self_pay").replace(/_/g, " ")}</span>} />
          <KV label="Invoice Type" value={<span className="capitalize">{(inv.invoiceType || "patient").replace(/_/g, " ")}</span>} />
          <KV label="Patient Responsibility" value={formatCurrency(inv.patientResponsibility)} />
          <KV label="Payer Responsibility" value={formatCurrency(inv.payerResponsibility)} />
          {inv.payerType === "nhis" && <KV label="NHIS Number" value={inv.nhisNumber} />}
          {inv.payerType === "private_insurance" && (
            <>
              <KV label="Insurance Provider" value={inv.insuranceProvider?.name || inv.insuranceProviderId || "—"} />
              <KV label="Policy Number" value={inv.insurancePolicyNumber} />
              <KV label="Authorization" value={inv.insuranceAuthorization} />
              <KV label="Insurance Responsibility" value={formatCurrency(inv.insuranceResponsibility)} />
            </>
          )}
          {inv.payerType === "corporate" && (
            <>
              <KV label="Corporate Name" value={inv.corporateName} />
              <KV label="Corporate Account #" value={inv.corporateAccountNumber} />
            </>
          )}
          {nhisClaims.length > 0 && (
            <div className="pt-2 mt-2 border-t">
              <p className="text-xs font-semibold text-slate-700 mb-1">NHIS Claims</p>
              {nhisClaims.map((c) => (
                <div key={c.id} className="text-xs flex justify-between">
                  <span className="font-mono">{c.claimNumber} • <StatusBadge status={c.status} /></span>
                  <span className="font-mono">{numberCell(c.approvedAmount ?? c.claimAmount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <PenLine className="w-4 h-4 text-slate-600" /> Notes & Terms
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2 text-sm">
          <div>
            <p className="text-[10px] uppercase font-semibold text-slate-500">Internal Notes</p>
            <p className="text-xs text-slate-700 whitespace-pre-wrap">{inv.internalNotes || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-slate-500">Patient Notes</p>
            <p className="text-xs text-slate-700 whitespace-pre-wrap">{inv.patientNotes || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-slate-500">Payment Terms</p>
            <p className="text-xs text-slate-700 whitespace-pre-wrap">{inv.paymentTerms || "—"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Dates */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-violet-600" /> Lifecycle Dates
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1.5 text-sm">
          <KV label="Created" value={`${formatDate(inv.createdAt, true)} by ${userName(inv.createdBy)}`} />
          {inv.reviewedAt && <KV label="Reviewed" value={`${formatDate(inv.reviewedAt, true)} by ${userName(inv.reviewedBy)}`} />}
          {inv.approvedAt && <KV label="Approved" value={`${formatDate(inv.approvedAt, true)} by ${userName(inv.approvedBy)}`} />}
          {inv.issuedAt && <KV label="Issued" value={`${formatDate(inv.issuedAt, true)} by ${userName(inv.issuedBy)}`} />}
          {inv.dueAt && <KV label="Due" value={formatDate(inv.dueAt)} />}
          {inv.voidedAt && <KV label="Voided" value={`${formatDate(inv.voidedAt, true)} by ${userName(inv.voidedBy)}`} />}
          {inv.cancelledAt && <KV label="Cancelled" value={`${formatDate(inv.cancelledAt, true)} by ${userName(inv.cancelledBy)}`} />}
          {inv.writtenOffAt && <KV label="Written Off" value={`${formatDate(inv.writtenOffAt, true)} by ${userName(inv.writtenOffBy)}`} />}
          {inv.cancelReason && <KV label="Cancel Reason" value={inv.cancelReason} />}
          {inv.voidReason && <KV label="Void Reason" value={inv.voidReason} />}
          {inv.writeOffReason && <KV label="Write-off Reason" value={inv.writeOffReason} />}
        </CardContent>
      </Card>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="text-xs text-slate-800 font-medium text-right">{value}</span>
    </div>
  );
}

function userName(u: any): string {
  if (!u) return "—";
  return `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username || "—";
}

function LineItemsTable({ items, currency }: { items: any[]; currency: string }) {
  if (items.length === 0) return <EmptyState title="No line items" description="Add an item to this invoice." />;
  const totals = items.reduce(
    (acc, it) => {
      acc.subtotal += money(it.quantity) * money(it.unitPrice);
      acc.discount += money(it.discount);
      acc.tax += money(it.tax);
      acc.total += money(it.total);
      return acc;
    },
    { subtotal: 0, discount: 0, tax: 0, total: 0 }
  );
  return (
    <div className="py-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-700">Description</th>
              <th className="text-left p-2 font-semibold text-slate-700">Service</th>
              <th className="text-right p-2 font-semibold text-slate-700">Qty</th>
              <th className="text-right p-2 font-semibold text-slate-700">Unit Price</th>
              <th className="text-right p-2 font-semibold text-slate-700">Disc</th>
              <th className="text-right p-2 font-semibold text-slate-700">Tax</th>
              <th className="text-right p-2 font-semibold text-slate-700">Total</th>
              <th className="text-left p-2 font-semibold text-slate-700">Ref</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b hover:bg-rose-50/30">
                <td className="p-2 text-xs">{it.description}</td>
                <td className="p-2 text-xs text-slate-600">
                  {it.service ? `${it.service.code || ""} ${it.service.category ? "• " + it.service.category : ""}`.trim() : "—"}
                </td>
                <td className="p-2 text-right font-mono text-xs">{it.quantity}</td>
                <td className="p-2 text-right font-mono text-xs">{numberCell(it.unitPrice)}</td>
                <td className="p-2 text-right font-mono text-xs text-rose-700">{numberCell(it.discount)}</td>
                <td className="p-2 text-right font-mono text-xs">{numberCell(it.tax)}</td>
                <td className="p-2 text-right font-mono text-xs font-semibold">{numberCell(it.total)}</td>
                <td className="p-2 text-xs text-slate-600">{it.referenceType || "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-100">
            <tr>
              <td colSpan={3} className="p-2 text-xs font-semibold">Totals</td>
              <td className="p-2 text-right font-mono text-xs">{numberCell(totals.subtotal)}</td>
              <td className="p-2 text-right font-mono text-xs">{numberCell(totals.discount)}</td>
              <td className="p-2 text-right font-mono text-xs">{numberCell(totals.tax)}</td>
              <td className="p-2 text-right font-mono text-xs font-bold text-emerald-700">{numberCell(totals.total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function PaymentsTable({ payments, currency }: { payments: any[]; currency: string }) {
  if (payments.length === 0)
    return <EmptyState title="No payments" description="No payments have been recorded against this invoice yet." icon={CreditCard} />;
  return (
    <div className="py-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-700">Payment #</th>
              <th className="text-right p-2 font-semibold text-slate-700">Amount</th>
              <th className="text-left p-2 font-semibold text-slate-700">Method</th>
              <th className="text-left p-2 font-semibold text-slate-700">Reference</th>
              <th className="text-left p-2 font-semibold text-slate-700">Status</th>
              <th className="text-left p-2 font-semibold text-slate-700">Received By</th>
              <th className="text-left p-2 font-semibold text-slate-700">Date</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b hover:bg-rose-50/30">
                <td className="p-2 font-mono text-xs">{p.paymentNumber}</td>
                <td className="p-2 text-right font-mono text-xs font-semibold text-emerald-700">{numberCell(p.amount)}</td>
                <td className="p-2 text-xs capitalize">{(p.paymentMethod || "").replace(/_/g, " ")}</td>
                <td className="p-2 text-xs text-slate-600">{p.transactionReference || "—"}</td>
                <td className="p-2"><StatusBadge status={p.status || "received"} /></td>
                <td className="p-2 text-xs text-slate-700">{userName(p.receivedBy)}</td>
                <td className="p-2 text-xs text-slate-600 whitespace-nowrap">{formatDate(p.receivedAt || p.createdAt, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreditNotesTable({ creditNotes, currency }: { creditNotes: any[]; currency: string }) {
  if (creditNotes.length === 0)
    return <EmptyState title="No credit notes" description="No credit notes have been issued for this invoice." icon={Stamp} />;
  return (
    <div className="py-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2 font-semibold text-slate-700">CN #</th>
              <th className="text-right p-2 font-semibold text-slate-700">Amount</th>
              <th className="text-left p-2 font-semibold text-slate-700">Reason</th>
              <th className="text-left p-2 font-semibold text-slate-700">Status</th>
              <th className="text-left p-2 font-semibold text-slate-700">Issued By</th>
              <th className="text-left p-2 font-semibold text-slate-700">Date</th>
            </tr>
          </thead>
          <tbody>
            {creditNotes.map((c) => (
              <tr key={c.id} className="border-b hover:bg-rose-50/30">
                <td className="p-2 font-mono text-xs">{c.creditNoteNumber}</td>
                <td className="p-2 text-right font-mono text-xs font-semibold text-amber-700">{numberCell(c.amount)}</td>
                <td className="p-2 text-xs text-slate-700">{c.reason}</td>
                <td className="p-2"><StatusBadge status={c.status} /></td>
                <td className="p-2 text-xs text-slate-700">{userName(c.issuedBy)}</td>
                <td className="p-2 text-xs text-slate-600 whitespace-nowrap">{formatDate(c.issuedAt || c.createdAt, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditTab({ inv }: { inv: any }) {
  const adjustments = inv.adjustments || [];
  const events: { label: string; date: string; by: string; reason?: string | null }[] = [];
  if (inv.createdAt) events.push({ label: "Created", date: inv.createdAt, by: userName(inv.createdBy) });
  if (inv.reviewedAt) events.push({ label: "Submitted for Review", date: inv.reviewedAt, by: userName(inv.reviewedBy), reason: inv.reviewNotes });
  if (inv.approvedAt) events.push({ label: "Approved", date: inv.approvedAt, by: userName(inv.approvedBy), reason: inv.approvalNotes });
  if (inv.issuedAt) events.push({ label: "Issued", date: inv.issuedAt, by: userName(inv.issuedBy) });
  if (inv.voidedAt) events.push({ label: "Voided", date: inv.voidedAt, by: userName(inv.voidedBy), reason: inv.voidReason });
  if (inv.cancelledAt) events.push({ label: "Cancelled", date: inv.cancelledAt, by: userName(inv.cancelledBy), reason: inv.cancelReason });
  if (inv.writtenOffAt) events.push({ label: "Written Off", date: inv.writtenOffAt, by: userName(inv.writtenOffBy), reason: inv.writeOffReason });

  return (
    <div className="py-3 space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-slate-600" /> Lifecycle Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {events.length === 0 ? (
            <p className="text-xs text-slate-500">No lifecycle events recorded.</p>
          ) : (
            <ol className="relative border-l-2 border-slate-200 ml-2 space-y-3">
              {events.map((e, i) => (
                <li key={i} className="ml-4">
                  <div className="absolute w-3 h-3 rounded-full bg-rose-500 -left-[7px] mt-1.5 ring-2 ring-white" />
                  <p className="text-xs font-semibold text-slate-800">{e.label}</p>
                  <p className="text-xs text-slate-500">{formatDate(e.date, true)} • by {e.by}</p>
                  {e.reason && <p className="text-xs text-slate-600 mt-0.5">Reason: {e.reason}</p>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <PenLine className="w-4 h-4 text-slate-600" /> Adjustments ({adjustments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {adjustments.length === 0 ? (
            <p className="text-xs text-slate-500">No adjustments recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                    <th className="text-right p-2 font-semibold text-slate-700">Amount</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Reason</th>
                    <th className="text-left p-2 font-semibold text-slate-700">By</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((a) => (
                    <tr key={a.id} className="border-b">
                      <td className="p-2 text-xs capitalize">{(a.adjustmentType || "").replace(/_/g, " ")}</td>
                      <td className="p-2 text-right font-mono text-xs">{numberCell(a.amount)}</td>
                      <td className="p-2 text-xs">{a.reason}</td>
                      <td className="p-2 text-xs text-slate-700">{userName(a.approvedBy)}</td>
                      <td className="p-2 text-xs text-slate-600">{formatDate(a.approvedAt || a.createdAt, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Lifecycle Action Dialog — Void / Write Off / Credit Note / Cancel
// ============================================================
function LifecycleActionDialog({
  kind,
  invoice,
  saving,
  onClose,
  onSubmit,
}: {
  kind: string;
  invoice: any;
  saving: boolean;
  onClose: () => void;
  onSubmit: (vals: any) => void;
}) {
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState<number>(kind === "write_off" ? Number(invoice.balance) || 0 : 0);
  const [description, setDescription] = useState("");
  const [adjustmentType, setAdjustmentType] = useState("credit");

  const cfg: Record<string, { title: string; icon: any; iconColor: string; submitLabel: string; requireAmount?: boolean; requireReason?: boolean; requireType?: boolean; maxAmount?: number }> = {
    void: { title: "Void Invoice", icon: Ban, iconColor: "text-rose-600", submitLabel: "Void Invoice", requireReason: true },
    write_off: { title: "Write Off Balance", icon: FileMinus, iconColor: "text-amber-600", submitLabel: "Write Off", requireReason: true, requireAmount: true, maxAmount: Number(invoice.balance) || 0 },
    credit_note: { title: "Issue Credit Note", icon: Stamp, iconColor: "text-amber-600", submitLabel: "Issue Credit Note", requireReason: true, requireAmount: true, maxAmount: Number(invoice.total) || 0 },
    cancel: { title: "Cancel Invoice", icon: X, iconColor: "text-rose-600", submitLabel: "Cancel Invoice", requireReason: false },
    add_adjustment: { title: "Add Adjustment", icon: PenLine, iconColor: "text-slate-600", submitLabel: "Add Adjustment", requireReason: true, requireAmount: true, requireType: true },
  };
  const c = cfg[kind] || cfg.cancel;
  const Icon = c.icon;

  const handleSubmit = () => {
    if (c.requireReason && !reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    if (c.requireAmount && (!amount || amount <= 0)) {
      toast.error("Amount must be greater than zero");
      return;
    }
    if (c.maxAmount && amount > c.maxAmount + 0.01) {
      toast.error(`Amount cannot exceed ${formatCurrency(c.maxAmount)}`);
      return;
    }
    const vals: any = { reason: reason.trim() || undefined };
    if (c.requireAmount) vals.amount = amount;
    if (description.trim()) vals.description = description.trim();
    if (kind === "void") vals.voidReason = reason.trim();
    if (kind === "write_off") vals.writeOffReason = reason.trim();
    if (kind === "write_off") vals.writeOffAmount = amount;
    if (kind === "cancel") vals.reason = reason.trim() || undefined;
    if (kind === "add_adjustment") vals.adjustmentType = adjustmentType;
    onSubmit(vals);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Icon className={`w-5 h-5 ${c.iconColor}`} /> {c.title}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Invoice <span className="font-mono">{invoice.invoiceNumber}</span> • Balance {formatCurrency(invoice.balance)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {c.requireAmount && (
            <div>
              <FieldLabel required>Amount (GHS)</FieldLabel>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={c.maxAmount}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              {c.maxAmount && (
                <p className="text-[10px] text-slate-500 mt-1">Max: {formatCurrency(c.maxAmount)}</p>
              )}
            </div>
          )}
          {c.requireType && (
            <div>
              <FieldLabel required>Adjustment Type</FieldLabel>
              <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Debit (increase balance)</SelectItem>
                  <SelectItem value="credit">Credit (decrease balance)</SelectItem>
                  <SelectItem value="write_off">Write Off</SelectItem>
                  <SelectItem value="correction">Correction</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <FieldLabel required={c.requireReason}>Reason</FieldLabel>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Provide a clear reason — this is recorded in the audit log."
            />
          </div>
          <div>
            <FieldLabel>Description (optional)</FieldLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className={`gap-2 ${
              kind === "void" || kind === "cancel"
                ? "bg-rose-600 hover:bg-rose-700"
                : kind === "write_off"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-slate-700 hover:bg-slate-800"
            }`}
          >
            {saving ? "Working..." : <><Icon className="w-4 h-4" /> {c.submitLabel}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Tab 4: New Invoice Dialog — full form with payer/insurance fields
// ============================================================
type LineItem = {
  serviceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  referenceType?: string;
};

function NewInvoiceDialog({
  open,
  onClose,
  onCreated,
  facilityId,
  canDiscount,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  facilityId: string | null;
  canDiscount: boolean;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [invoiceType, setInvoiceType] = useState("patient");
  const [payerType, setPayerType] = useState("self_pay");
  const [dueAt, setDueAt] = useState("");
  const [headerDiscount, setHeaderDiscount] = useState(0);
  const [headerTax, setHeaderTax] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0, discount: 0, tax: 0 },
  ]);
  // Payer responsibility
  const [patientResponsibility, setPatientResponsibility] = useState(0);
  const [insuranceResponsibility, setInsuranceResponsibility] = useState(0);
  const [nhisResponsibility, setNhisResponsibility] = useState(0);
  const [payerResponsibility, setPayerResponsibility] = useState(0);
  // Insurance / NHIS / corporate
  const [insuranceProviderId, setInsuranceProviderId] = useState("");
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState("");
  const [insuranceAuthorization, setInsuranceAuthorization] = useState("");
  const [nhisNumber, setNhisNumber] = useState("");
  const [corporateName, setCorporateName] = useState("");
  const [corporateAccountNumber, setCorporateAccountNumber] = useState("");
  // Notes
  const [internalNotes, setInternalNotes] = useState("");
  const [patientNotes, setPatientNotes] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Payment due within 30 days of issue.");
  const [saving, setSaving] = useState(false);

  const itemsEndRef = useRef<HTMLDivElement>(null);
  const debouncedPatientQuery = useDebouncedValue(patientQuery, 350);

  useEffect(() => {
    if (items.length > 1 && itemsEndRef.current) {
      itemsEndRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [items.length]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setInvoiceType("patient"); setPayerType("self_pay");
      setDueAt(""); setHeaderDiscount(0); setHeaderTax(0); setTaxRate(0);
      setDiscountReason("");
      setPatientResponsibility(0); setInsuranceResponsibility(0); setNhisResponsibility(0); setPayerResponsibility(0);
      setInsuranceProviderId(""); setInsurancePolicyNumber(""); setInsuranceAuthorization("");
      setNhisNumber(""); setCorporateName(""); setCorporateAccountNumber("");
      setInternalNotes(""); setPatientNotes("");
      setPaymentTerms("Payment due within 30 days of issue.");
      setItems([{ description: "", quantity: 1, unitPrice: 0, discount: 0, tax: 0 }]);
    }
  }, [open]);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search-invoice", debouncedPatientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(debouncedPatientQuery)}`),
    enabled: debouncedPatientQuery.length >= 2,
  });

  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters-invoice", patientId, facilityId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}${facilityId ? `&facilityId=${facilityId}` : ""}`),
    enabled: !!patientId,
  });

  const { data: servicesData } = useQuery({
    queryKey: ["services-catalog", facilityId],
    queryFn: () => fetchJson(`/api/services${facilityId ? `?facilityId=${facilityId}` : ""}`),
    enabled: !!facilityId && open,
  });

  const { data: providersData } = useQuery({
    queryKey: ["insurance-providers-invoice"],
    queryFn: () => fetchJson(`/api/insurance-providers?status=active`),
    enabled: open && payerType === "private_insurance",
  });

  const selectPatient = (p: any) => {
    setPatientId(p.id);
    setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
  };

  const updateItem = (index: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const selectService = (index: number, serviceId: string) => {
    const svc = (servicesData?.items || []).find((s: any) => s.id === serviceId);
    if (svc) {
      updateItem(index, {
        serviceId: svc.id,
        description: svc.name,
        unitPrice: Number(svc.unitPrice) || 0,
      });
    }
  };

  const addItem = () =>
    setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0, discount: 0, tax: 0 }]);
  const removeItem = (index: number) =>
    setItems((p) => p.filter((_, i) => i !== index));

  const lineTotal = (it: LineItem) =>
    Math.max(0, money(it.quantity) * money(it.unitPrice) - money(it.discount) + money(it.tax));
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const total = Math.max(0, subtotal - money(headerDiscount) + money(headerTax));

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    if (!facilityId) { toast.error("No active facility"); return; }
    if (items.length === 0 || items.some((it) => !it.description.trim())) {
      toast.error("All line items need a description");
      return;
    }
    if (headerDiscount > 0 && !canDiscount) {
      toast.error("You do not have permission to apply discounts");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          encounterId: encounterId || undefined,
          facilityId,
          invoiceType,
          payerType,
          dueAt: dueAt || undefined,
          discount: Number(headerDiscount) || 0,
          discountReason: discountReason || undefined,
          tax: Number(headerTax) || 0,
          taxRate: Number(taxRate) || 0,
          payerResponsibility: Number(payerResponsibility) || 0,
          patientResponsibility: Number(patientResponsibility) || 0,
          insuranceResponsibility: Number(insuranceResponsibility) || 0,
          nhisResponsibility: Number(nhisResponsibility) || 0,
          insuranceProviderId: insuranceProviderId || undefined,
          insurancePolicyNumber: insurancePolicyNumber || undefined,
          insuranceAuthorization: insuranceAuthorization || undefined,
          nhisNumber: nhisNumber || undefined,
          corporateName: corporateName || undefined,
          corporateAccountNumber: corporateAccountNumber || undefined,
          internalNotes: internalNotes || undefined,
          patientNotes: patientNotes || undefined,
          paymentTerms: paymentTerms || undefined,
          items: items.map((it) => ({
            serviceId: it.serviceId || undefined,
            description: it.description,
            quantity: Number(it.quantity) || 1,
            unitPrice: Number(it.unitPrice) || 0,
            discount: Number(it.discount) || 0,
            tax: Number(it.tax) || 0,
            referenceType: it.referenceType || undefined,
          })),
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Invoice created as draft. Submit for review to begin the lifecycle.");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Receipt className="w-5 h-5 text-rose-600" /> New Invoice
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Selecting a service auto-fills the unit price from the facility price list. The invoice is created as
            <span className="font-semibold text-slate-700"> Draft</span> — submit it for review to begin the lifecycle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          {/* Patient + encounter + dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Patient</FieldLabel>
              <ClearableSearch
                value={patientQuery}
                onChange={setPatientQuery}
                placeholder="Search by name or patient number..."
              />
              {patientsData?.patients && patientsData.patients.length > 0 && (
                <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                  {patientsData.patients.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => selectPatient(p)}
                      className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0"
                    >
                      <span className="font-medium">{p.firstName} {p.lastName}</span>
                      <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                    </button>
                  ))}
                </div>
              )}
              {patientId && (
                <p className="text-[10px] text-emerald-700 mt-1 font-medium">Selected. ID: {patientId.slice(-8)}</p>
              )}
            </div>
            <div>
              <FieldLabel>Encounter (optional)</FieldLabel>
              <Select value={encounterId || "_none"} onValueChange={(v) => v !== "_none" && setEncounterId(v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {(encountersData?.items || []).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.encounterNumber} • {e.encounterType}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Type + Payer */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <FieldLabel required>Invoice Type</FieldLabel>
              <Select value={invoiceType} onValueChange={setInvoiceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVOICE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel required>Payer Type</FieldLabel>
              <Select value={payerType} onValueChange={setPayerType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>Due Date (optional)</FieldLabel>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          </div>

          {/* Payer responsibility fields (conditional) */}
          {payerType !== "self_pay" && (
            <Card>
              <CardContent className="p-3 space-y-3">
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Payer Responsibility Breakdown
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-[10px]">Patient Pays (GHS)</Label>
                    <Input type="number" step="0.01" value={patientResponsibility} onChange={(e) => setPatientResponsibility(Number(e.target.value))} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Payer Pays (GHS)</Label>
                    <Input type="number" step="0.01" value={payerResponsibility} onChange={(e) => setPayerResponsibility(Number(e.target.value))} className="h-8 text-xs" />
                  </div>
                  {payerType === "private_insurance" && (
                    <div>
                      <Label className="text-[10px]">Insurance Pays (GHS)</Label>
                      <Input type="number" step="0.01" value={insuranceResponsibility} onChange={(e) => setInsuranceResponsibility(Number(e.target.value))} className="h-8 text-xs" />
                    </div>
                  )}
                  {payerType === "nhis" && (
                    <div>
                      <Label className="text-[10px]">NHIS Pays (GHS)</Label>
                      <Input type="number" step="0.01" value={nhisResponsibility} onChange={(e) => setNhisResponsibility(Number(e.target.value))} className="h-8 text-xs" />
                    </div>
                  )}
                </div>

                {payerType === "private_insurance" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <FieldLabel required>Insurance Provider</FieldLabel>
                      <Select value={insuranceProviderId || "_none"} onValueChange={(v) => v !== "_none" && setInsuranceProviderId(v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select provider" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">— None —</SelectItem>
                          {(providersData?.items || []).map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <FieldLabel required>Policy Number</FieldLabel>
                      <Input value={insurancePolicyNumber} onChange={(e) => setInsurancePolicyNumber(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <FieldLabel>Authorization #</FieldLabel>
                      <Input value={insuranceAuthorization} onChange={(e) => setInsuranceAuthorization(e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                )}

                {payerType === "nhis" && (
                  <div>
                    <FieldLabel required>NHIS Number</FieldLabel>
                    <Input value={nhisNumber} onChange={(e) => setNhisNumber(e.target.value)} className="h-8 text-xs" placeholder="e.g. NHIS-000-000-000" />
                  </div>
                )}

                {payerType === "corporate" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <FieldLabel required>Corporate Name</FieldLabel>
                      <Input value={corporateName} onChange={(e) => setCorporateName(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <FieldLabel>Corporate Account #</FieldLabel>
                      <Input value={corporateAccountNumber} onChange={(e) => setCorporateAccountNumber(e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Line items */}
          <div>
            <div className="sticky top-0 z-20 bg-white pb-1 mb-1 flex items-center justify-between border-b border-slate-100">
              <FieldLabel>Line Items ({items.length})</FieldLabel>
              <Button size="sm" variant="outline" onClick={addItem} className="gap-1 h-7 text-xs">
                <Plus className="w-3 h-3" /> Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="border rounded p-2 space-y-2 bg-slate-50">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 md:col-span-5">
                      <Label className="text-[10px]">Service (auto-fills price)</Label>
                      <Select value={it.serviceId || "_none"} onValueChange={(v) => v !== "_none" && selectService(i, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="— Custom —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">— Custom / Manual —</SelectItem>
                          {(servicesData?.items || []).map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name} • {formatCurrency(s.unitPrice)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-12 md:col-span-7">
                      <FieldLabel required className="text-[10px]">Description</FieldLabel>
                      <Input value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    <div>
                      <Label className="text-[10px]">Qty</Label>
                      <Input type="number" min="1" value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Unit Price</Label>
                      <Input type="number" step="0.01" value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Discount</Label>
                      <Input type="number" step="0.01" value={it.discount} onChange={(e) => updateItem(i, { discount: Number(e.target.value) })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Tax</Label>
                      <Input type="number" step="0.01" value={it.tax} onChange={(e) => updateItem(i, { tax: Number(e.target.value) })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Line Total</Label>
                      <div className="h-8 px-2 flex items-center text-xs font-mono font-semibold text-emerald-700">
                        {formatCurrency(lineTotal(it))}
                      </div>
                    </div>
                  </div>
                  {items.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => removeItem(i)} className="gap-1 h-6 text-xs text-rose-600 hover:text-rose-700">
                      <Trash2 className="w-3 h-3" /> Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div ref={itemsEndRef} />
          </div>

          {/* Header-level adjustments */}
          <Separator />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <FieldLabel>Header Discount {canDiscount ? "" : "(no perm)"}</FieldLabel>
              <Input type="number" step="0.01" value={headerDiscount} onChange={(e) => setHeaderDiscount(Number(e.target.value))} disabled={!canDiscount} />
            </div>
            <div>
              <FieldLabel>Discount Reason</FieldLabel>
              <Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="e.g. Senior citizen" />
            </div>
            <div>
              <FieldLabel>Header Tax (GHS)</FieldLabel>
              <Input type="number" step="0.01" value={headerTax} onChange={(e) => setHeaderTax(Number(e.target.value))} />
            </div>
            <div>
              <FieldLabel>Tax Rate (%)</FieldLabel>
              <Input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} />
            </div>
          </div>

          {/* Notes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <FieldLabel>Internal Notes</FieldLabel>
              <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} placeholder="Visible to staff only" />
            </div>
            <div>
              <FieldLabel>Patient Notes</FieldLabel>
              <Textarea value={patientNotes} onChange={(e) => setPatientNotes(e.target.value)} rows={2} placeholder="Shown on the invoice" />
            </div>
            <div>
              <FieldLabel>Payment Terms</FieldLabel>
              <Textarea value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} rows={2} />
            </div>
          </div>
        </div>

        {/* Sticky footer with live total */}
        <div className="shrink-0 border-t pt-3 space-y-3 bg-white">
          <div className="flex items-center justify-between">
            <Button size="sm" variant="outline" onClick={addItem} className="gap-1 h-8 text-xs">
              <Plus className="w-3.5 h-3.5" /> Add Line Item
            </Button>
            <div className="text-sm font-mono font-bold text-emerald-700">
              Total: {formatCurrency(total)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={saving || !patientId}
              className="gap-2 bg-rose-600 hover:bg-rose-700"
            >
              {saving ? "Saving..." : <><FilePlus className="w-4 h-4" /> Create Draft Invoice</>}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Payment Dialog — quick payment on an invoice
// ============================================================
function PaymentDialog({
  invoice,
  onClose,
  onDone,
  canPay,
}: {
  invoice: any;
  onClose: () => void;
  onDone: () => void;
  canPay: boolean;
}) {
  const [amount, setAmount] = useState(invoice.balance || 0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [transactionReference, setTransactionReference] = useState("");
  const [saving, setSaving] = useState(false);
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();

  const submit = async () => {
    if (!amount || amount <= 0) { toast.error("Amount must be > 0"); return; }
    if (amount > invoice.balance + 0.01) {
      confirmAction({
        title: "Overpayment Warning",
        description:
          "The entered amount exceeds the outstanding balance. The excess will be credited to the patient's account.",
        confirmText: "Yes, accept overpayment",
        variant: "warning",
        details: (
          <div>
            <div><strong>Outstanding balance:</strong> {formatCurrency(invoice.balance)}</div>
            <div><strong>Payment amount:</strong> {formatCurrency(amount)}</div>
            <div><strong>Overpayment:</strong> {formatCurrency(amount - invoice.balance)}</div>
          </div>
        ),
        onConfirm: () => doSubmit(),
      });
      return;
    }
    doSubmit();
  };

  const doSubmit = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          patientId: invoice.patientId,
          facilityId: invoice.facilityId,
          amount,
          paymentMethod,
          transactionReference,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Payment recorded");
      setAmount(0);
      setTransactionReference("");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
            <DialogTitle className="flex items-center gap-2 text-white">
              <CreditCard className="w-5 h-5 text-emerald-600" /> Record Payment
            </DialogTitle>
            <DialogDescription className="text-white/80">
              Invoice <span className="font-mono">{invoice.invoiceNumber}</span> • Outstanding {formatCurrency(invoice.balance)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <FieldLabel required>Amount (GHS)</FieldLabel>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              <p className="text-[10px] text-slate-500 mt-1">Defaulted to outstanding balance</p>
            </div>
            <div>
              <FieldLabel required>Payment Method</FieldLabel>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>Transaction Reference (optional)</FieldLabel>
              <Input value={transactionReference} onChange={(e) => setTransactionReference(e.target.value)} placeholder="Momo ref, cheque #, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !canPay} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Recording..." : <><CreditCard className="w-4 h-4" /> Record Payment</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialogEl}
    </>
  );
}

// ============================================================
// Add Item Dialog — append a line item to a pre-issue invoice
// ============================================================
function AddItemDialog({
  invoice,
  onClose,
  onDone,
  facilityId,
}: {
  invoice: any;
  onClose: () => void;
  onDone: () => void;
  facilityId: string | null;
}) {
  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [referenceType, setReferenceType] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: servicesData } = useQuery({
    queryKey: ["services-additem", facilityId],
    queryFn: () => fetchJson(`/api/services${facilityId ? `?facilityId=${facilityId}` : ""}`),
  });

  const selectService = (id: string) => {
    const svc = (servicesData?.items || []).find((s: any) => s.id === id);
    if (svc) {
      setServiceId(svc.id);
      setDescription(svc.name);
      setUnitPrice(Number(svc.unitPrice) || 0);
    }
  };

  const lineTotal = Math.max(0, money(quantity) * money(unitPrice) - money(discount) + money(tax));

  const submit = async () => {
    if (!description.trim()) { toast.error("Description required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_item",
          serviceId: serviceId || undefined,
          description,
          quantity,
          unitPrice,
          discount,
          tax,
          referenceType: referenceType || undefined,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Item added to invoice");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Plus className="w-5 h-5 text-emerald-600" /> Add Item to {invoice.invoiceNumber}
          </DialogTitle>
          <DialogDescription className="text-white/80">Totals will be recomputed automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel>Service (optional)</FieldLabel>
            <Select value={serviceId || "_none"} onValueChange={(v) => v !== "_none" && selectService(v)}>
              <SelectTrigger><SelectValue placeholder="— Custom —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Custom / Manual —</SelectItem>
                {(servicesData?.items || []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} • {formatCurrency(s.unitPrice)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel required>Description</FieldLabel>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <Label className="text-[10px]">Qty</Label>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-[10px]">Unit Price</Label>
              <Input type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-[10px]">Discount</Label>
              <Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-[10px]">Tax</Label>
              <Input type="number" step="0.01" value={tax} onChange={(e) => setTax(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label className="text-[10px]">Reference Type (optional)</Label>
            <Input value={referenceType} onChange={(e) => setReferenceType(e.target.value)} placeholder="e.g. lab_order, encounter, prescription" />
          </div>
          <div className="text-right text-sm font-mono font-semibold text-emerald-700">
            Line Total: {formatCurrency(lineTotal)}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !description.trim()} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Adding..." : <><Plus className="w-4 h-4" /> Add Item</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

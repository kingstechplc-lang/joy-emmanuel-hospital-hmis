"use client";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus, RotateCcw, RefreshCcw, Search, Download, Eye, Check, X,
  Clock, CheckCircle2, XCircle, Ban, Undo2, AlertTriangle, FileBarChart,
  DollarSign, Banknote, Smartphone, CreditCard as CardIcon, Building2,
  CalendarDays, TrendingUp, ScrollText, UserCheck, ArrowRight, Printer,
  AlertCircle, FileText, ListChecks, FileSearch, History, Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge,
  formatDate, formatCurrency, formatRelative, safeJson,
  PageHeader, MiniStatCard, ClearableSearch, usePagination, Pagination,
  ModuleHelp,
} from "@/components/ui-helpers";
import { PrintButton, PrintLayout } from "@/components/print/print-layout";
import { FieldLabel } from "@/components/ui/required-label";

// =====================================================================
// Constants
// =====================================================================
const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "reviewed", label: "Reviewed" },
  { value: "approved", label: "Approved" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "reversed", label: "Reversed" },
  { value: "failed", label: "Failed" },
];

const TYPE_FILTERS = [
  { value: "all", label: "All Types" },
  { value: "full", label: "Full" },
  { value: "partial", label: "Partial" },
  { value: "overpayment", label: "Overpayment" },
  { value: "deposit", label: "Deposit" },
  { value: "credit_balance", label: "Credit Balance" },
  { value: "duplicate_payment", label: "Duplicate Payment" },
  { value: "service_cancellation", label: "Service Cancellation" },
  { value: "payment_error", label: "Payment Error" },
  { value: "other", label: "Other" },
];

const METHOD_FILTERS = [
  { value: "all", label: "All Methods" },
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank" },
  { value: "original_method", label: "Original Method" },
  { value: "patient_credit", label: "Patient Credit" },
  { value: "other", label: "Other" },
];

const TYPE_LABELS: Record<string, string> = {
  full: "Full",
  partial: "Partial",
  overpayment: "Overpayment",
  deposit: "Deposit",
  credit_balance: "Credit Balance",
  duplicate_payment: "Duplicate Payment",
  service_cancellation: "Service Cancellation",
  payment_error: "Payment Error",
  other: "Other",
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  card: "Card",
  bank: "Bank",
  original_method: "Original Method",
  patient_credit: "Patient Credit",
  other: "Other",
};

const METHOD_ICONS: Record<string, any> = {
  cash: Banknote,
  mobile_money: Smartphone,
  card: CardIcon,
  bank: Building2,
  original_method: RefreshCcw,
  patient_credit: UserCheck,
  other: DollarSign,
};

const SOURCE_LABELS: Record<string, string> = {
  patient_payment: "Patient Payment",
  insurance_payment: "Insurance Payment",
  nhis_payment: "NHIS Payment",
  corporate_payment: "Corporate Payment",
  patient_deposit: "Patient Deposit",
  credit_balance: "Credit Balance",
};

const HELP_SECTIONS = [
  {
    title: "Refund Lifecycle",
    content: `Refunds follow a 9-status lifecycle:
   pending → reviewed → approved → processing → completed
                                                  ↓
                                              reversed (correction)
   Any of: pending/reviewed/approved → rejected
   Any of: pending/reviewed → cancelled
   processing → failed → (retry) → processing

• Pending — newly requested, awaiting review
• Reviewed — verified by a billing clerk
• Approved — authorized by an accountant/manager
• Processing — funds in transit (gateway / bank)
• Completed — money returned to patient; invoice updated
• Reversed — completed refund undone (correction)
• Rejected — request denied (with reason)
• Cancelled — request withdrawn before approval
• Failed — gateway / bank returned an error (can retry)

Each transition is audit-logged with the user, timestamp, and reason.`,
  },
  {
    title: "Refund Types",
    content: `Refunds are categorized by their cause:
• Full — entire payment refunded
• Partial — portion of the payment refunded
• Overpayment — patient paid more than the invoice total
• Deposit — refunding a pre-payment deposit
• Credit Balance — refunding unused credit on the patient account
• Duplicate Payment — same invoice paid twice
• Service Cancellation — service was cancelled after payment
• Payment Error — wrong amount or wrong patient recorded
• Other — any reason not listed (use the notes field to explain)

The type feeds the dashboard's "By Type" breakdown for trend analysis.`,
  },
  {
    title: "Refundable Amount",
    content: `The refundable amount on a payment is calculated as:
   refundable = payment.amount − Σ(existing refund amounts)
where the sum includes refunds in any status EXCEPT rejected and
cancelled (those release their hold on the payment).

Example: payment of GHS 100 with an approved refund of GHS 30
and a rejected refund of GHS 50 → refundable = 100 − 30 = GHS 70.

When you select a payment in the New Refund dialog, the available
refundable amount is auto-calculated and shown next to the amount
field. You cannot request more than the refundable amount.`,
  },
  {
    title: "Approval Workflow",
    content: `Most refunds require approval before processing:
1. Request — any billing user creates a refund (status=pending)
2. Review — a billing clerk verifies the request (status=reviewed)
3. Approve — an accountant authorizes the refund (status=approved);
   optionally sets approvedAmount (≤ requested amount)
4. Process — cashier returns the money (status=completed);
   invoice.amountRefunded and invoice.balance are updated

Rejection: At any pending/reviewed/approved state, an authorized
user can reject the refund (with a rejection reason).
Cancellation: At pending/reviewed state, the requester can cancel
the refund (with a cancel reason).

All transitions require the billing.refund permission and are
audit-logged with user, timestamp, and reason.`,
  },
  {
    title: "Processing & Methods",
    content: `When you mark an approved refund as processed:
• The refund moves to status=completed
• processedBy and processedAt are set
• processedAmount is recorded (defaults to approvedAmount or amount)
• externalReference can be set (e.g. momo transaction ID, cheque #)
• The linked invoice's amountRefunded += processedAmount
• The linked invoice's balance += processedAmount
   (Refunds increase the invoice balance because money was returned.)

Refund methods include: cash, mobile_money, card, bank,
original_method (use the same method as the source payment),
patient_credit (apply as credit to the patient account), other.`,
  },
  {
    title: "Reversal & Correction",
    content: `If a completed refund needs to be undone (e.g. processed in error,
funds returned to the hospital):
• Use the Reverse action — requires reversalReason
• The refund moves to status=reversed
• reversedBy and reversedAt are set
• The invoice's amountRefunded -= processedAmount
• The invoice's balance -= processedAmount
   (Reversing the original balance change.)

For failed gateway/bank transactions:
• Use the Fail action — requires failureReason
• The refund moves to status=failed, failedAt is set
• Use Retry to attempt processing again — retryCount increments
   and status returns to processing.

Reversals and retries are all audit-logged for full traceability.`,
  },
];

// =====================================================================
// Helpers
// =====================================================================
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

function InfoRow({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
      <span className={`text-sm text-slate-900 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

function userFullName(u: any): string {
  if (!u) return "—";
  return `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username || "—";
}

function prettyLabel(s: string | null | undefined, labels: Record<string, string>): string {
  if (!s) return "—";
  return labels[s] || s.replace(/_/g, " ");
}

// =====================================================================
// Main view
// =====================================================================
export function RefundsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canRefund = can("billing.refund");
  const canView = can("billing.view");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showNew, setShowNew] = useState(false);
  const [selectedRefundId, setSelectedRefundId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["refunds"] });
    qc.invalidateQueries({ queryKey: ["refund-stats"] });
    qc.invalidateQueries({ queryKey: ["refund-detail"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
  };

  const openDetail = (id: string) => {
    setSelectedRefundId(id);
    setActiveTab("detail");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Refunds"
        description="Request, approve, process, and reverse patient refunds with full lifecycle tracking"
        icon={RotateCcw}
        gradient="from-orange-500 to-red-600"
        actions={
          <>
            <Button
              onClick={() => setShowNew(true)}
              disabled={!canRefund}
              className="gap-2 bg-white/95 text-orange-700 hover:bg-white"
            >
              <Plus className="w-4 h-4" /> Request Refund
            </Button>
            <ModuleHelp title="Refunds" sections={HELP_SECTIONS} />
          </>
        }
      />

      {!activeFacilityId && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
            Select a facility to view refunds.
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5">
            <ListChecks className="w-3.5 h-3.5" /> All Refunds
          </TabsTrigger>
          <TabsTrigger value="detail" className="gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Refund Detail
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <FileBarChart className="w-3.5 h-3.5" /> Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab
            facilityId={activeFacilityId}
            canView={canView}
            onRequest={() => setShowNew(true)}
            canRefund={canRefund}
          />
        </TabsContent>

        <TabsContent value="all">
          <AllRefundsTab
            facilityId={activeFacilityId}
            canView={canView}
            canRefund={canRefund}
            invalidate={invalidate}
            onViewDetail={openDetail}
          />
        </TabsContent>

        <TabsContent value="detail">
          <RefundDetailTab
            refundId={selectedRefundId}
            onClose={() => { setSelectedRefundId(null); setActiveTab("all"); }}
            canRefund={canRefund}
            invalidate={invalidate}
          />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsTab facilityId={activeFacilityId} canView={canView} />
        </TabsContent>
      </Tabs>

      <NewRefundDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); invalidate(); }}
        facilityId={activeFacilityId}
      />
    </div>
  );
}

// =====================================================================
// Tab 1: Dashboard — 12 stat cards + breakdown by type/method
// =====================================================================
function DashboardTab({
  facilityId, canView, onRequest, canRefund,
}: {
  facilityId: string | null;
  canView: boolean;
  onRequest: () => void;
  canRefund: boolean;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["refund-stats", facilityId],
    queryFn: () => fetchJson(`/api/refunds/stats${facilityId ? `?facilityId=${facilityId}` : ""}`),
    enabled: !!facilityId && canView,
  });

  if (!facilityId) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState title="No facility selected" description="Select a facility to view the refund dashboard." />
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load refund statistics" onRetry={() => refetch()} />;

  const totals = data?.totals || {};
  const byStatus: Record<string, { count: number; total: number }> = data?.byStatus || {};
  const windows = data?.windows || {};
  const byType: any[] = data?.byType || [];
  const byMethod: any[] = data?.byMethod || [];

  return (
    <div className="space-y-4">
      {/* Row 1: 6 status counts */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniStatCard
          label="Total Refunds"
          value={totals.count ?? 0}
          icon={RotateCcw}
          gradient="from-slate-600 to-slate-700"
          sublabel={`All time · ${formatCurrency(totals.amount ?? 0)} requested`}
        />
        <MiniStatCard
          label="Pending"
          value={byStatus.pending?.count ?? 0}
          icon={Clock}
          gradient="from-amber-500 to-orange-600"
          sublabel={`${formatCurrency(byStatus.pending?.total ?? 0)}`}
        />
        <MiniStatCard
          label="Approved"
          value={byStatus.approved?.count ?? 0}
          icon={CheckCircle2}
          gradient="from-emerald-500 to-emerald-600"
          sublabel={`${formatCurrency(byStatus.approved?.total ?? 0)}`}
        />
        <MiniStatCard
          label="Processing"
          value={byStatus.processing?.count ?? 0}
          icon={RefreshCcw}
          gradient="from-purple-500 to-purple-600"
          sublabel={`${formatCurrency(byStatus.processing?.total ?? 0)}`}
        />
        <MiniStatCard
          label="Completed"
          value={byStatus.completed?.count ?? 0}
          icon={CheckCircle2}
          gradient="from-teal-500 to-teal-600"
          sublabel={`${formatCurrency(byStatus.completed?.total ?? 0)}`}
        />
        <MiniStatCard
          label="Rejected"
          value={byStatus.rejected?.count ?? 0}
          icon={XCircle}
          gradient="from-rose-500 to-red-600"
          sublabel={`${formatCurrency(byStatus.rejected?.total ?? 0)}`}
        />
      </div>

      {/* Row 2: 6 more stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniStatCard
          label="Cancelled"
          value={byStatus.cancelled?.count ?? 0}
          icon={Ban}
          gradient="from-slate-500 to-slate-600"
          sublabel={`${formatCurrency(byStatus.cancelled?.total ?? 0)}`}
        />
        <MiniStatCard
          label="Reversed"
          value={byStatus.reversed?.count ?? 0}
          icon={Undo2}
          gradient="from-indigo-500 to-indigo-600"
          sublabel={`${formatCurrency(byStatus.reversed?.total ?? 0)}`}
        />
        <MiniStatCard
          label="Failed"
          value={byStatus.failed?.count ?? 0}
          icon={AlertTriangle}
          gradient="from-rose-600 to-rose-700"
          sublabel={`${formatCurrency(byStatus.failed?.total ?? 0)}`}
        />
        <MiniStatCard
          label="Total Refund Value"
          value={formatCurrency(totals.refundValue ?? 0)}
          icon={DollarSign}
          gradient="from-emerald-600 to-teal-700"
          sublabel="Sum of processed refunds"
        />
        <MiniStatCard
          label="Pending Value"
          value={formatCurrency(totals.pendingValue ?? 0)}
          icon={AlertCircle}
          gradient="from-amber-600 to-orange-700"
          sublabel="Awaiting processing"
        />
        <MiniStatCard
          label="Today's Refunds"
          value={windows.today?.count ?? 0}
          icon={CalendarDays}
          gradient="from-cyan-500 to-cyan-600"
          sublabel={`${formatCurrency(windows.today?.total ?? 0)} requested`}
        />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Type */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Refunds by Type</h3>
              <FileText className="w-4 h-4 text-slate-400" />
            </div>
            {byType.length === 0 ? (
              <EmptyState title="No data" description="No refunds recorded yet." icon={FileText} />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {byType.map((t) => {
                  const pct = totals.amount > 0 ? Math.round((t.total / totals.amount) * 100) : 0;
                  return (
                    <div key={t.label} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline text-xs">
                          <span className="font-medium text-slate-700">{TYPE_LABELS[t.label] || t.label}</span>
                          <span className="font-mono font-semibold text-slate-900">{formatCurrency(t.total)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-orange-400 to-red-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-500 w-9 text-right">{t.count}×</span>
                          <span className="text-[10px] text-slate-400 w-9 text-right">{pct}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By Method */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Refunds by Method</h3>
              <Banknote className="w-4 h-4 text-slate-400" />
            </div>
            {byMethod.length === 0 ? (
              <EmptyState title="No data" description="No refunds with a method recorded yet." icon={Banknote} />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {byMethod.map((m) => {
                  const Icon = METHOD_ICONS[m.label] || DollarSign;
                  const pct = totals.amount > 0 ? Math.round((m.total / totals.amount) * 100) : 0;
                  return (
                    <div key={m.label} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline text-xs">
                          <span className="font-medium text-slate-700">{METHOD_LABELS[m.label] || m.label}</span>
                          <span className="font-mono font-semibold text-slate-900">{formatCurrency(m.total)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-orange-400 to-red-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-500 w-9 text-right">{m.count}×</span>
                          <span className="text-[10px] text-slate-400 w-9 text-right">{pct}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick action */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Request a new refund</div>
            <div className="text-xs text-slate-500">Find a completed payment and request a refund against it.</div>
          </div>
          <Button onClick={onRequest} disabled={!canRefund} className="gap-2 bg-orange-600 hover:bg-orange-700">
            <Plus className="w-4 h-4" /> Request Refund
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// Tab 2: All Refunds — search + filters + paginated table + actions
// =====================================================================
function AllRefundsTab({
  facilityId, canView, canRefund, invalidate, onViewDetail,
}: {
  facilityId: string | null;
  canView: boolean;
  canRefund: boolean;
  invalidate: () => void;
  onViewDetail: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  if (search.trim()) params.set("q", search.trim());
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (typeFilter !== "all") params.set("refundType", typeFilter);
  if (methodFilter !== "all") params.set("refundMethod", methodFilter);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["refunds", facilityId, search, statusFilter, typeFilter, methodFilter, from, to],
    queryFn: () => fetchJson(`/api/refunds${qs}`),
    enabled: !!facilityId && canView,
  });

  const items: any[] = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 15);

  const handleExport = () => {
    const p = new URLSearchParams();
    if (facilityId) p.set("facilityId", facilityId);
    if (search.trim()) p.set("q", search.trim());
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (typeFilter !== "all") p.set("refundType", typeFilter);
    if (methodFilter !== "all") p.set("refundMethod", methodFilter);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    window.open(`/api/refunds/export?${p.toString()}`, "_blank");
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <ClearableSearch
              value={search}
              onChange={setSearch}
              onClear={() => setSearch("")}
              placeholder="Search refund #, payment #, invoice #, patient..."
              className="md:flex-1"
            />
            <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
              <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter || undefined} onValueChange={setTypeFilter}>
              <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={methodFilter || undefined} onValueChange={setMethodFilter}>
              <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHOD_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-2 items-center">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40 h-8 text-xs" />
              <span className="text-xs text-slate-500">to</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40 h-8 text-xs" />
            </div>
            <div className="md:ml-auto flex items-center gap-3">
              <span className="text-xs text-slate-600">
                Showing <span className="font-semibold text-slate-800">{items.length}</span> refund{items.length === 1 ? "" : "s"}
              </span>
              <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5 h-8">
                <Download className="w-3.5 h-3.5" /> CSV Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load refunds" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No refunds found"
              description="Adjust filters or request a new refund against a completed payment."
              icon={RotateCcw}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Refund #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Payment #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Invoice #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Method</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Amount</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Requested By</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((r: any) => {
                    const MethodIcon = METHOD_ICONS[r.refundMethod || ""] || null;
                    const patient = r.patient || r.payment?.patient;
                    return (
                      <tr key={r.id} className="border-b hover:bg-orange-50/40">
                        <td className="p-3 font-mono text-xs text-slate-700">
                          {r.refundNumber || r.id.slice(-8).toUpperCase()}
                        </td>
                        <td className="p-3 text-xs">
                          {patient ? (
                            <>
                              <div className="font-medium text-slate-900">{patient.firstName} {patient.lastName}</div>
                              <div className="text-[10px] text-slate-400">{patient.patientNumber}</div>
                            </>
                          ) : "—"}
                        </td>
                        <td className="p-3 font-mono text-xs text-slate-700">{r.payment?.paymentNumber || "—"}</td>
                        <td className="p-3 font-mono text-xs text-slate-700">{r.invoice?.invoiceNumber || r.payment?.invoice?.invoiceNumber || "—"}</td>
                        <td className="p-3 text-xs text-slate-700">
                          {r.refundType ? <span className="px-1.5 py-0.5 rounded bg-slate-100 capitalize">{(TYPE_LABELS[r.refundType] || r.refundType).replace(/_/g, " ")}</span> : "—"}
                        </td>
                        <td className="p-3 text-xs text-slate-700">
                          {r.refundMethod ? (
                            <span className="inline-flex items-center gap-1.5 capitalize">
                              {MethodIcon && <MethodIcon className="w-3 h-3 text-slate-500" />}
                              {(METHOD_LABELS[r.refundMethod] || r.refundMethod).replace(/_/g, " ")}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-rose-700">{formatCurrency(r.amount)}</td>
                        <td className="p-3"><StatusBadge status={r.status} /></td>
                        <td className="p-3 text-xs text-slate-600">
                          {r.requestedBy ? `${r.requestedBy.firstName} ${r.requestedBy.lastName}` : "—"}
                        </td>
                        <td className="p-3 text-xs text-slate-600">{formatDate(r.createdAt, true)}</td>
                        <td className="p-3 text-right">
                          <div className="flex flex-wrap gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => onViewDetail(r.id)}
                            >
                              <Eye className="w-3 h-3" /> View
                            </Button>
                            {canRefund && ["pending", "reviewed"].includes(r.status) && (
                              <QuickActionButton
                                id={r.id}
                                action="approve"
                                label="Approve"
                                icon={Check}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                invalidate={invalidate}
                              />
                            )}
                            {canRefund && ["pending", "reviewed"].includes(r.status) && (
                              <ReasonActionButton
                                id={r.id}
                                action="reject"
                                label="Reject"
                                icon={X}
                                reasonField="rejectionReason"
                                reasonLabel="Rejection Reason"
                                reasonPlaceholder="e.g. Not authorized, invalid request, payment already reconciled..."
                                className="text-rose-600 hover:text-rose-700"
                                invalidate={invalidate}
                              />
                            )}
                            {canRefund && r.status === "approved" && (
                              <ProcessActionButton
                                id={r.id}
                                refund={r}
                                invalidate={invalidate}
                              />
                            )}
                            {canRefund && ["pending", "reviewed"].includes(r.status) && (
                              <ReasonActionButton
                                id={r.id}
                                action="cancel"
                                label="Cancel"
                                icon={Ban}
                                reasonField="cancelReason"
                                reasonLabel="Cancel Reason"
                                reasonPlaceholder="e.g. Requested in error, resolved with patient..."
                                className="text-slate-600 hover:text-slate-700"
                                invalidate={invalidate}
                              />
                            )}
                            <RefundReceiptButton refund={r} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
    </div>
  );
}

// =====================================================================
// Quick action button (no extra fields)
// =====================================================================
function QuickActionButton({
  id, action, label, icon: Icon, className, invalidate,
}: {
  id: string;
  action: string;
  label: string;
  icon: any;
  className?: string;
  invalidate: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/refunds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success(`Refund ${label.toLowerCase()}`);
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={run}
      disabled={busy}
      className={`gap-1 h-7 px-2 text-xs ${className || ""}`}
    >
      <Icon className="w-3 h-3" /> {label}
    </Button>
  );
}

// =====================================================================
// Reason action button — opens a small dialog to collect a reason
// =====================================================================
function ReasonActionButton({
  id, action, label, icon: Icon, reasonField, reasonLabel, reasonPlaceholder,
  className, invalidate,
}: {
  id: string;
  action: string;
  label: string;
  icon: any;
  reasonField: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  className?: string;
  invalidate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { toast.error(`${reasonLabel} is required`); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/refunds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, [reasonField]: reason.trim() }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success(`Refund ${label.toLowerCase()}`);
      setOpen(false);
      setReason("");
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        className={`gap-1 h-7 px-2 text-xs ${className || ""}`}
      >
        <Icon className="w-3 h-3" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setReason(""); }}>
        <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
            <DialogTitle className="flex items-center gap-2 capitalize">
              <Icon className="w-4 h-4" /> {label} Refund
            </DialogTitle>
            <DialogDescription className="text-white/80">Provide a reason. This will be audit-logged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <FieldLabel required>{reasonLabel}</FieldLabel>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={reasonPlaceholder}
            />
          </div>
          <DialogFooter className="p-6 pt-4 shrink-0 border-t">
            <Button variant="outline" onClick={() => { setOpen(false); setReason(""); }} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !reason.trim()} className="gap-2 bg-orange-600 hover:bg-orange-700">
              {busy ? "Working..." : <><Icon className="w-4 h-4" /> Confirm {label}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =====================================================================
// Process action button — collects processedAmount + externalReference
// =====================================================================
function ProcessActionButton({
  id, refund, invalidate,
}: {
  id: string;
  refund: any;
  invalidate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [processedAmount, setProcessedAmount] = useState<number | null>(null);
  const [externalReference, setExternalReference] = useState("");
  const [busy, setBusy] = useState(false);

  const defaultAmount = refund.approvedAmount != null ? refund.approvedAmount : refund.amount;

  const open_ = () => {
    setProcessedAmount(Number(defaultAmount));
    setExternalReference(refund.externalReference || "");
    setOpen(true);
  };

  const submit = async () => {
    if (processedAmount == null || processedAmount <= 0) { toast.error("Processed amount must be > 0"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/refunds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "process",
          processedAmount,
          externalReference: externalReference.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Refund processed");
      setOpen(false);
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={open_}
        className="gap-1 h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        <RotateCcw className="w-3 h-3" /> Process
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
            <DialogTitle className="flex items-center gap-2 text-white">
              <RotateCcw className="w-4 h-4 text-emerald-600" /> Process Refund
            </DialogTitle>
            <DialogDescription className="text-white/80">
              Confirm the funds have been returned to the patient. This will mark the refund as completed and update the invoice balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs bg-slate-50 p-3 rounded-lg space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Refund #</span><span className="font-mono font-semibold">{refund.refundNumber || refund.id.slice(-8).toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Approved Amount</span><span className="font-mono font-semibold">{formatCurrency(defaultAmount)}</span></div>
            </div>
            <div>
              <FieldLabel required>Processed Amount</FieldLabel>
              <Input
                type="number"
                step="0.01"
                value={processedAmount ?? ""}
                onChange={(e) => setProcessedAmount(Number(e.target.value))}
              />
              <div className="text-[10px] text-slate-500 mt-1">Max: {formatCurrency(defaultAmount)}</div>
            </div>
            <div>
              <FieldLabel>External Reference</FieldLabel>
              <Input
                value={externalReference}
                onChange={(e) => setExternalReference(e.target.value)}
                placeholder="e.g. Momo ref, cheque #, bank txn ID..."
              />
            </div>
          </div>
          <DialogFooter className="p-6 pt-4 shrink-0 border-t">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {busy ? "Processing..." : <><RotateCcw className="w-4 h-4" /> Confirm Process</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =====================================================================
// Tab 3: Refund Detail (inline view)
// =====================================================================
function RefundDetailTab({
  refundId, onClose, canRefund, invalidate,
}: {
  refundId: string | null;
  onClose: () => void;
  canRefund: boolean;
  invalidate: () => void;
}) {
  if (!refundId) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            title="No refund selected"
            description="Click 'View' on a refund in the All Refunds tab to see its full detail here."
            icon={FileSearch}
            action={<Button variant="outline" onClick={onClose} className="gap-2"><ListChecks className="w-4 h-4" /> Go to All Refunds</Button>}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <RefundDetailContent
      refundId={refundId}
      canRefund={canRefund}
      invalidate={invalidate}
      onClose={onClose}
    />
  );
}

// =====================================================================
// Refund Detail Content — the actual detail UI (used inline in Tab 3)
// =====================================================================
function RefundDetailContent({
  refundId, canRefund, invalidate, onClose,
}: {
  refundId: string;
  canRefund: boolean;
  invalidate: () => void;
  onClose?: () => void;
}) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["refund-detail", refundId],
    queryFn: () => fetchJson(`/api/refunds/${refundId}`),
    enabled: !!refundId,
  });

  if (isLoading) return <LoadingState rows={6} />;

  const refund = data?.item;
  if (!refund) {
    return (
      <Card>
        <CardContent className="p-6">
          <ErrorState message="Refund not found" onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const payment = refund.payment;
  const invoice = refund.invoice || payment?.invoice;
  const patient = refund.patient || payment?.patient;

  // Financial summary calculations
  const originalPayment = payment?.amount ?? 0;
  // We don't have all refunds for this payment here; show what we have
  const previouslyRefunded = Number(invoice?.amountRefunded || 0) - Number(refund.processedAmount || refund.approvedAmount || refund.amount || 0);
  const refundableAmount = Math.max(0, originalPayment - (Number(invoice?.amountRefunded || 0) - Number(refund.processedAmount || 0)));
  const requestedAmount = refund.amount;
  const approvedAmount = refund.approvedAmount;
  const processedAmount = refund.processedAmount;
  const remainingRefundable = Math.max(0, refundableAmount - requestedAmount);

  // Lifecycle timeline
  const timeline = [
    { label: "Requested", at: refund.createdAt, by: refund.requestedBy, icon: Send, color: "text-amber-600", ringColor: "bg-amber-100" },
    { label: "Reviewed", at: refund.reviewedAt, by: refund.reviewedBy, icon: Eye, color: "text-blue-600", ringColor: "bg-blue-100" },
    { label: "Approved", at: refund.approvedAt, by: refund.approvedBy, icon: CheckCircle2, color: "text-emerald-600", ringColor: "bg-emerald-100" },
    { label: "Processed", at: refund.processedAt, by: refund.processedBy, icon: RotateCcw, color: "text-teal-600", ringColor: "bg-teal-100" },
    { label: "Verified", at: refund.verifiedAt, by: refund.verifiedBy, icon: UserCheck, color: "text-purple-600", ringColor: "bg-purple-100" },
  ];

  const status = refund.status;

  return (
    <div className="space-y-3">
      {/* Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-slate-900 font-mono">{refund.refundNumber || refund.id.slice(-8).toUpperCase()}</span>
                <StatusBadge status={status} />
                {refund.retryCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                    {refund.retryCount} retr{refund.retryCount === 1 ? "y" : "ies"}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500">
                Created {formatDate(refund.createdAt, true)} · Updated {formatRelative(refund.updatedAt)}
              </div>
            </div>
            {onClose && (
              <Button variant="outline" onClick={onClose} className="gap-2 self-end">
                <ListChecks className="w-4 h-4" /> Back to list
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
            <InfoRow label="Patient" value={patient ? `${patient.firstName} ${patient.lastName}` : "—"} />
            <InfoRow label="Patient #" value={patient?.patientNumber} mono />
            <InfoRow label="Payment #" value={payment?.paymentNumber} mono />
            <InfoRow label="Invoice #" value={invoice?.invoiceNumber} mono />
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-800">Financial Summary</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="border rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Original Payment</div>
              <div className="text-lg font-mono font-bold text-slate-900">{formatCurrency(originalPayment)}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Previously Refunded</div>
              <div className="text-lg font-mono font-bold text-amber-700">{formatCurrency(previouslyRefunded)}</div>
            </div>
            <div className="border rounded-lg p-3 bg-emerald-50">
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Refundable Amount</div>
              <div className="text-lg font-mono font-bold text-emerald-800">{formatCurrency(refundableAmount)}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Requested Amount</div>
              <div className="text-lg font-mono font-bold text-rose-700">{formatCurrency(requestedAmount)}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Approved Amount</div>
              <div className="text-lg font-mono font-bold text-emerald-700">{formatCurrency(approvedAmount)}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Processed Amount</div>
              <div className="text-lg font-mono font-bold text-teal-700">{formatCurrency(processedAmount)}</div>
            </div>
            <div className="border rounded-lg p-3 bg-slate-50">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Remaining Refundable</div>
              <div className="text-lg font-mono font-bold text-slate-900">{formatCurrency(remainingRefundable)}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Invoice Balance</div>
              <div className="text-lg font-mono font-bold text-slate-900">{formatCurrency(invoice?.balance)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Refund Details */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-orange-600" />
            <h3 className="text-sm font-semibold text-slate-800">Refund Details</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <InfoRow label="Type" value={prettyLabel(refund.refundType, TYPE_LABELS)} />
            <InfoRow label="Method" value={prettyLabel(refund.refundMethod, METHOD_LABELS)} />
            <InfoRow label="Source" value={prettyLabel(refund.refundSource, SOURCE_LABELS)} />
            <InfoRow label="External Reference" value={refund.externalReference} mono />
            <InfoRow label="Reason" value={refund.reason} />
            <InfoRow label="Notes" value={refund.notes} />
          </div>

          {/* Rejection / Cancel / Failure / Reversal reasons if present */}
          {refund.rejectionReason && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold mb-1">Rejection Reason</div>
              <div className="text-sm text-rose-800">{refund.rejectionReason}</div>
              <div className="text-[10px] text-rose-500 mt-1">by {userFullName(refund.rejectedBy)} · {formatDate(refund.rejectedAt, true)}</div>
            </div>
          )}
          {refund.cancelReason && (
            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-slate-700 font-semibold mb-1">Cancel Reason</div>
              <div className="text-sm text-slate-800">{refund.cancelReason}</div>
              <div className="text-[10px] text-slate-500 mt-1">by {userFullName(refund.cancelledBy)} · {formatDate(refund.cancelledAt, true)}</div>
            </div>
          )}
          {refund.failureReason && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold mb-1">Failure Reason</div>
              <div className="text-sm text-rose-800">{refund.failureReason}</div>
              <div className="text-[10px] text-rose-500 mt-1">{formatDate(refund.failedAt, true)}</div>
            </div>
          )}
          {refund.reversalReason && (
            <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-indigo-700 font-semibold mb-1">Reversal Reason</div>
              <div className="text-sm text-indigo-800">{refund.reversalReason}</div>
              <div className="text-[10px] text-indigo-500 mt-1">by {userFullName(refund.reversedBy)} · {formatDate(refund.reversedAt, true)}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lifecycle Timeline */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-800">Lifecycle Timeline</h3>
          </div>
          <div className="space-y-3">
            {timeline.map((step, i) => {
              const Icon = step.icon;
              const reached = !!step.at;
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full ${reached ? step.ringColor : "bg-slate-100"} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${reached ? step.color : "text-slate-300"}`} />
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${reached ? "text-slate-900" : "text-slate-400"}`}>{step.label}</span>
                      {reached && <span className="text-xs text-slate-500">{formatDate(step.at, true)}</span>}
                    </div>
                    {reached ? (
                      <div className="text-xs text-slate-500">by {userFullName(step.by)}</div>
                    ) : (
                      <div className="text-xs text-slate-400 italic">Not yet</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {canRefund && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRight className="w-4 h-4 text-orange-600" />
              <h3 className="text-sm font-semibold text-slate-800">Actions</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {status === "pending" && (
                <QuickActionButton
                  id={refund.id}
                  action="review"
                  label="Mark Reviewed"
                  icon={Eye}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  invalidate={invalidate}
                />
              )}
              {["pending", "reviewed"].includes(status) && (
                <ApproveActionButton id={refund.id} refund={refund} invalidate={invalidate} />
              )}
              {["pending", "reviewed", "approved"].includes(status) && (
                <ReasonActionButton
                  id={refund.id}
                  action="reject"
                  label="Reject"
                  icon={X}
                  reasonField="rejectionReason"
                  reasonLabel="Rejection Reason"
                  reasonPlaceholder="e.g. Not authorized, invalid request..."
                  className="text-rose-600 hover:text-rose-700 border border-rose-200"
                  invalidate={invalidate}
                />
              )}
              {status === "approved" && (
                <ProcessActionButton id={refund.id} refund={refund} invalidate={invalidate} />
              )}
              {["pending", "reviewed"].includes(status) && (
                <ReasonActionButton
                  id={refund.id}
                  action="cancel"
                  label="Cancel"
                  icon={Ban}
                  reasonField="cancelReason"
                  reasonLabel="Cancel Reason"
                  reasonPlaceholder="e.g. Requested in error, resolved with patient..."
                  className="text-slate-600 hover:text-slate-700 border border-slate-200"
                  invalidate={invalidate}
                />
              )}
              {status === "completed" && (
                <ReasonActionButton
                  id={refund.id}
                  action="reverse"
                  label="Reverse"
                  icon={Undo2}
                  reasonField="reversalReason"
                  reasonLabel="Reversal Reason"
                  reasonPlaceholder="e.g. Processed in error, funds returned to hospital..."
                  className="text-indigo-600 hover:text-indigo-700 border border-indigo-200"
                  invalidate={invalidate}
                />
              )}
              {status === "failed" && (
                <QuickActionButton
                  id={refund.id}
                  action="retry"
                  label="Retry Processing"
                  icon={RefreshCcw}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  invalidate={invalidate}
                />
              )}
              <RefundReceiptButton refund={refund} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// Approve action button — optionally sets approvedAmount
// =====================================================================
function ApproveActionButton({
  id, refund, invalidate,
}: {
  id: string;
  refund: any;
  invalidate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [approvedAmount, setApprovedAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const open_ = () => {
    setApprovedAmount(Number(refund.approvedAmount ?? refund.amount));
    setOpen(true);
  };

  const submit = async () => {
    if (approvedAmount == null || approvedAmount <= 0) { toast.error("Approved amount must be > 0"); return; }
    if (approvedAmount > refund.amount) { toast.error(`Cannot exceed requested ${formatCurrency(refund.amount)}`); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/refunds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          approvedAmount,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Refund approved");
      setOpen(false);
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        onClick={open_}
        className="gap-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        <Check className="w-3.5 h-3.5" /> Approve
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
            <DialogTitle className="flex items-center gap-2 text-white">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Approve Refund
            </DialogTitle>
            <DialogDescription className="text-white/80">Confirm the approved refund amount (cannot exceed the requested amount).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs bg-slate-50 p-3 rounded-lg space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Refund #</span><span className="font-mono font-semibold">{refund.refundNumber || refund.id.slice(-8).toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Requested Amount</span><span className="font-mono font-semibold">{formatCurrency(refund.amount)}</span></div>
            </div>
            <div>
              <FieldLabel required>Approved Amount</FieldLabel>
              <Input
                type="number"
                step="0.01"
                value={approvedAmount ?? ""}
                onChange={(e) => setApprovedAmount(Number(e.target.value))}
              />
              <div className="text-[10px] text-slate-500 mt-1">Max: {formatCurrency(refund.amount)}</div>
            </div>
          </div>
          <DialogFooter className="p-6 pt-4 shrink-0 border-t">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {busy ? "Approving..." : <><Check className="w-4 h-4" /> Confirm Approve</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =====================================================================
// Tab 4: Reports — 5 report types
// =====================================================================
function ReportsTab({ facilityId, canView }: { facilityId: string | null; canView: boolean }) {
  const [reportType, setReportType] = useState("daily_refunds");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const effectiveFrom = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const effectiveTo = to || new Date().toISOString().slice(0, 10);

  const refundsParams = new URLSearchParams();
  if (facilityId) refundsParams.set("facilityId", facilityId);
  refundsParams.set("from", effectiveFrom);
  refundsParams.set("to", effectiveTo);
  refundsParams.set("limit", "500");

  const { data: refundsData, isLoading } = useQuery({
    queryKey: ["refunds-report", facilityId, effectiveFrom, effectiveTo],
    queryFn: () => fetchJson(`/api/refunds?${refundsParams.toString()}`),
    enabled: !!facilityId && canView,
  });

  const auditParams = new URLSearchParams();
  auditParams.set("resourceType", "refund");
  auditParams.set("limit", "200");
  if (facilityId) auditParams.set("facilityId", facilityId);

  const { data: auditData } = useQuery({
    queryKey: ["refund-audit-report", facilityId],
    queryFn: () => fetchJson(`/api/audit-logs?${auditParams.toString()}`),
    enabled: !!facilityId && canView && reportType === "audit_log",
  });

  const refunds: any[] = refundsData?.items || [];
  const auditLogs: any[] = auditData?.items || [];

  // Daily Refunds
  const dailyRows = useMemo(() => {
    const byDay = new Map<string, { count: number; total: number; completed: number }>();
    for (const r of refunds) {
      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      const e = byDay.get(day) || { count: 0, total: 0, completed: 0 };
      e.count += 1;
      e.total += r.amount || 0;
      if (r.status === "completed") e.completed += r.processedAmount || r.amount || 0;
      byDay.set(day, e);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, ...v }));
  }, [refunds]);

  // By Method
  const methodRows = useMemo(() => {
    const byMethod = new Map<string, { count: number; total: number }>();
    for (const r of refunds) {
      const m = r.refundMethod || "unspecified";
      const e = byMethod.get(m) || { count: 0, total: 0 };
      e.count += 1;
      e.total += r.amount || 0;
      byMethod.set(m, e);
    }
    return Array.from(byMethod.entries()).map(([method, v]) => ({ method, ...v }));
  }, [refunds]);

  // By Reason (group by refundType since reasons are free-text)
  const reasonRows = useMemo(() => {
    const byType = new Map<string, { count: number; total: number }>();
    for (const r of refunds) {
      const t = r.refundType || "other";
      const e = byType.get(t) || { count: 0, total: 0 };
      e.count += 1;
      e.total += r.amount || 0;
      byType.set(t, e);
    }
    return Array.from(byType.entries()).map(([type, v]) => ({ type, ...v }));
  }, [refunds]);

  // Pending Refunds
  const pendingRows = useMemo(() => {
    return refunds
      .filter((r) => ["pending", "reviewed", "approved", "processing"].includes(r.status))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [refunds]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-2 md:items-center">
          <Select value={reportType || undefined} onValueChange={setReportType}>
            <SelectTrigger className="md:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily_refunds">Daily Refunds</SelectItem>
              <SelectItem value="by_method">By Method</SelectItem>
              <SelectItem value="by_reason">By Reason</SelectItem>
              <SelectItem value="pending_refunds">Pending Refunds</SelectItem>
              <SelectItem value="audit_log">Audit Log</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2 items-center">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40 h-8 text-xs" />
            <span className="text-xs text-slate-500">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40 h-8 text-xs" />
          </div>
        </CardContent>
      </Card>

      {isLoading && reportType !== "audit_log" ? (
        <LoadingState rows={6} />
      ) : (
        <>
          {/* Daily Refunds */}
          {reportType === "daily_refunds" && (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b bg-orange-50">
                  <h3 className="text-sm font-semibold text-orange-900">Daily Refunds Report</h3>
                  <p className="text-xs text-orange-700">
                    From {formatDate(effectiveFrom)} to {formatDate(effectiveTo)} · {refunds.length} refund(s) in range
                  </p>
                </div>
                {dailyRows.length === 0 ? (
                  <EmptyState title="No data" description="No refunds in this date range." icon={CalendarDays} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Refunds</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Requested</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Completed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyRows.map((r) => (
                          <tr key={r.day} className="border-b hover:bg-orange-50/40">
                            <td className="p-3 font-medium text-slate-900">{formatDate(r.day)}</td>
                            <td className="p-3 text-right font-mono text-slate-700">{r.count}</td>
                            <td className="p-3 text-right font-mono text-rose-700 font-semibold">{formatCurrency(r.total)}</td>
                            <td className="p-3 text-right font-mono text-emerald-700">{r.completed > 0 ? formatCurrency(r.completed) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 bg-slate-50">
                        <tr>
                          <td className="p-3 font-semibold text-slate-900">Total</td>
                          <td className="p-3 text-right font-mono font-semibold text-slate-900">{dailyRows.reduce((s, r) => s + r.count, 0)}</td>
                          <td className="p-3 text-right font-mono font-bold text-rose-700">{formatCurrency(dailyRows.reduce((s, r) => s + r.total, 0))}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-700">{formatCurrency(dailyRows.reduce((s, r) => s + r.completed, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* By Method */}
          {reportType === "by_method" && (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b bg-teal-50">
                  <h3 className="text-sm font-semibold text-teal-900">Refunds by Method Report</h3>
                  <p className="text-xs text-teal-700">By refund method · {refunds.length} refund(s) in range</p>
                </div>
                {methodRows.length === 0 ? (
                  <EmptyState title="No data" description="No refunds with a method in this date range." icon={Banknote} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Method</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Refunds</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Total</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Avg</th>
                          <th className="text-right p-3 font-semibold text-slate-700">% of Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const grandTotal = methodRows.reduce((s, r) => s + r.total, 0);
                          return methodRows.map((r) => {
                            const Icon = METHOD_ICONS[r.method] || DollarSign;
                            return (
                              <tr key={r.method} className="border-b hover:bg-teal-50/40">
                                <td className="p-3">
                                  <span className="inline-flex items-center gap-1.5 text-xs capitalize px-2 py-0.5 rounded bg-slate-100">
                                    <Icon className="w-3 h-3 text-slate-500" />
                                    {(METHOD_LABELS[r.method] || r.method).replace(/_/g, " ")}
                                  </span>
                                </td>
                                <td className="p-3 text-right font-mono text-slate-700">{r.count}</td>
                                <td className="p-3 text-right font-mono font-semibold text-rose-700">{formatCurrency(r.total)}</td>
                                <td className="p-3 text-right font-mono text-slate-600">{formatCurrency(r.total / r.count)}</td>
                                <td className="p-3 text-right font-mono text-slate-700">
                                  {grandTotal > 0 ? Math.round((r.total / grandTotal) * 100) : 0}%
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* By Reason (Type) */}
          {reportType === "by_reason" && (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b bg-amber-50">
                  <h3 className="text-sm font-semibold text-amber-900">Refunds by Reason (Type) Report</h3>
                  <p className="text-xs text-amber-700">By refund type · {refunds.length} refund(s) in range</p>
                </div>
                {reasonRows.length === 0 ? (
                  <EmptyState title="No data" description="No refunds in this date range." icon={FileText} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Count</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Total Amount</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Avg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reasonRows.map((r) => (
                          <tr key={r.type} className="border-b hover:bg-amber-50/40">
                            <td className="p-3">
                              <span className="inline-flex items-center text-xs px-2 py-0.5 rounded bg-slate-100 capitalize">
                                {(TYPE_LABELS[r.type] || r.type).replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono text-slate-700">{r.count}</td>
                            <td className="p-3 text-right font-mono font-semibold text-rose-700">{formatCurrency(r.total)}</td>
                            <td className="p-3 text-right font-mono text-slate-600">{formatCurrency(r.total / r.count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Pending Refunds */}
          {reportType === "pending_refunds" && (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b bg-amber-50">
                  <h3 className="text-sm font-semibold text-amber-900">Pending Refunds Report</h3>
                  <p className="text-xs text-amber-700">{pendingRows.length} refund(s) awaiting action</p>
                </div>
                {pendingRows.length === 0 ? (
                  <EmptyState title="No pending refunds" description="All refunds have been actioned." icon={CheckCircle2} />
                ) : (
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Refund #</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Amount</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Requested</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingRows.map((r) => {
                          const patient = r.patient || r.payment?.patient;
                          return (
                            <tr key={r.id} className="border-b hover:bg-amber-50/40">
                              <td className="p-3 font-mono text-xs text-slate-700">{r.refundNumber || r.id.slice(-8).toUpperCase()}</td>
                              <td className="p-3 text-xs">{patient ? `${patient.firstName} ${patient.lastName}` : "—"}</td>
                              <td className="p-3 text-right font-mono font-semibold text-rose-700">{formatCurrency(r.amount)}</td>
                              <td className="p-3"><StatusBadge status={r.status} /></td>
                              <td className="p-3 text-xs text-slate-600">{formatDate(r.createdAt, true)}</td>
                              <td className="p-3 text-xs text-slate-600 max-w-xs truncate" title={r.reason}>{r.reason || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Audit Log */}
          {reportType === "audit_log" && (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b bg-slate-100">
                  <h3 className="text-sm font-semibold text-slate-900">Refund Audit Log</h3>
                  <p className="text-xs text-slate-600">All refund-related audit entries · {auditLogs.length} record(s)</p>
                </div>
                {auditLogs.length === 0 ? (
                  <EmptyState title="No audit entries" description="No refund-related audit log entries found." icon={ScrollText} />
                ) : (
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Timestamp</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Action</th>
                          <th className="text-left p-3 font-semibold text-slate-700">User</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Resource ID</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Reason / Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((l) => (
                          <tr key={l.id} className="border-b hover:bg-slate-50">
                            <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{formatDate(l.createdAt, true)}</td>
                            <td className="p-3">
                              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{l.action}</span>
                            </td>
                            <td className="p-3 text-xs text-slate-700">
                              {l.user ? `${l.user.firstName} ${l.user.lastName}` : "—"}
                            </td>
                            <td className="p-3 text-xs font-mono text-slate-500">{l.resourceId?.slice(-8) || "—"}</td>
                            <td className="p-3 text-xs text-slate-600 max-w-xs truncate" title={l.reason || l.newValues || ""}>
                              {l.reason || (l.newValues ? String(l.newValues).slice(0, 80) : "—")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// =====================================================================
// New Refund Dialog — payment search + form
// =====================================================================
function NewRefundDialog({
  open, onClose, onCreated, facilityId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  facilityId: string | null;
}) {
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [refundType, setRefundType] = useState("full");
  const [refundMethod, setRefundMethod] = useState("original_method");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch completed payments for selection (filtered by search)
  const paymentsParams = new URLSearchParams();
  if (facilityId) paymentsParams.set("facilityId", facilityId);
  paymentsParams.set("status", "completed");
  if (paymentSearch.trim()) paymentsParams.set("q", paymentSearch.trim());
  paymentsParams.set("limit", "100");

  const { data: paymentsData } = useQuery({
    queryKey: ["payments-for-refund", facilityId, paymentSearch],
    queryFn: () => fetchJson(`/api/payments?${paymentsParams.toString()}`),
    enabled: open && !!facilityId,
  });

  const payments: any[] = paymentsData?.items || [];
  const selectedPayment = payments.find((p) => p.id === paymentId);

  // Fetch existing refunds for the selected payment to compute refundable amount
  const { data: paymentRefundsData } = useQuery({
    queryKey: ["payment-refunds", paymentId],
    queryFn: () => fetchJson(`/api/refunds?paymentId=${paymentId}&limit=200`),
    enabled: open && !!paymentId,
  });
  const existingRefunds: any[] = paymentRefundsData?.items || [];
  const allocatedAmount = existingRefunds
    .filter((r) => !["rejected", "cancelled"].includes(r.status))
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const refundableAmount = selectedPayment
    ? Math.max(0, Number(selectedPayment.amount || 0) - allocatedAmount)
    : 0;

  const selectPayment = (id: string) => {
    const p = payments.find((p) => p.id === id);
    if (p) {
      setPaymentId(p.id);
      setAmount(Number(p.amount || 0));
    }
  };

  const reset = () => {
    setPaymentSearch("");
    setPaymentId("");
    setAmount(0);
    setReason("");
    setRefundType("full");
    setRefundMethod("original_method");
    setNotes("");
  };

  const submit = async () => {
    if (!paymentId) { toast.error("Please select a payment"); return; }
    if (!amount || amount <= 0) { toast.error("Amount must be > 0"); return; }
    if (amount > refundableAmount) {
      toast.error(`Amount exceeds refundable amount of ${formatCurrency(refundableAmount)}`);
      return;
    }
    if (!reason.trim()) { toast.error("Reason required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId,
          invoiceId: selectedPayment?.invoiceId,
          patientId: selectedPayment?.patientId,
          facilityId: selectedPayment?.facilityId,
          amount,
          reason: reason.trim(),
          refundType,
          refundMethod,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Refund requested");
      reset();
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <RotateCcw className="w-5 h-5 text-orange-600" /> Request Refund
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Find a completed payment and request a refund against it. The original payment record is preserved — the refund creates its own audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Payment search */}
          <div>
            <FieldLabel required>Search Payment</FieldLabel>
            <ClearableSearch
              value={paymentSearch}
              onChange={setPaymentSearch}
              onClear={() => setPaymentSearch("")}
              placeholder="Search payment #, patient name, invoice #..."
            />
          </div>

          {/* Payment select */}
          <div>
            <FieldLabel required>Select Payment</FieldLabel>
            {payments.length === 0 ? (
              <div className="text-xs text-slate-500 italic p-3 border rounded bg-slate-50">
                {paymentSearch ? "No payments match your search." : "Type to search for a payment."}
              </div>
            ) : (
              <Select value={paymentId || undefined} onValueChange={selectPayment}>
                <SelectTrigger><SelectValue placeholder="Select a completed payment" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {payments.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono">{p.paymentNumber}</span>
                      {" · "}
                      {p.patient?.firstName} {p.patient?.lastName}
                      {" · "}
                      <span className="font-mono text-emerald-700">{formatCurrency(p.amount)}</span>
                      {" · "}
                      <span className="capitalize">{(p.paymentMethod || "").replace(/_/g, " ")}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Selected payment details */}
          {selectedPayment && (
            <div className="text-xs bg-slate-50 p-3 rounded-lg space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Patient</span><span className="font-medium">{selectedPayment.patient?.firstName} {selectedPayment.patient?.lastName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Invoice #</span><span className="font-mono">{selectedPayment.invoice?.invoiceNumber}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Original Amount</span><span className="font-mono font-semibold">{formatCurrency(selectedPayment.amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Already Allocated</span><span className="font-mono text-amber-700">{formatCurrency(allocatedAmount)}</span></div>
              <div className="flex justify-between border-t pt-1 mt-1"><span className="text-emerald-700 font-semibold">Refundable Amount</span><span className="font-mono font-bold text-emerald-800">{formatCurrency(refundableAmount)}</span></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Refund Type</FieldLabel>
              <Select value={refundType || undefined} onValueChange={setRefundType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_FILTERS.filter((t) => t.value !== "all").map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel required>Refund Method</FieldLabel>
              <Select value={refundMethod || undefined} onValueChange={setRefundMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHOD_FILTERS.filter((m) => m.value !== "all").map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel required>Refund Amount</FieldLabel>
            <Input
              type="number"
              step="0.01"
              max={refundableAmount}
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <div className="text-[10px] text-slate-500 mt-1">
              Max refundable: <span className="font-mono font-semibold text-emerald-700">{formatCurrency(refundableAmount)}</span>
            </div>
          </div>

          <div>
            <FieldLabel required>Reason</FieldLabel>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Duplicate payment, service not rendered, overpayment, payment error..."
            />
          </div>

          <div>
            <FieldLabel>Notes (optional)</FieldLabel>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Additional context, references, or instructions..."
            />
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={saving || !paymentId || !amount || !reason.trim() || (selectedPayment && amount > refundableAmount)}
            className="gap-2 bg-orange-600 hover:bg-orange-700"
          >
            {saving ? "Requesting..." : <><RotateCcw className="w-4 h-4" /> Request Refund</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Refund Receipt Button — print a refund receipt
// =====================================================================
function RefundReceiptButton({ refund }: { refund: any }) {
  const patient = refund.patient || refund.payment?.patient;
  const payment = refund.payment;
  const invoice = refund.invoice || payment?.invoice;

  return (
    <PrintButton
      label="Receipt"
      className="h-7 px-2 py-0 text-xs"
      renderContent={() => (
        <PrintLayout
          title="Refund Receipt"
          documentNumber={refund.refundNumber || refund.id.slice(-8).toUpperCase()}
          patient={patient}
          facility={null}
          signatory={refund.processedBy ? `${refund.processedBy.firstName} ${refund.processedBy.lastName}` : undefined}
          signatoryRole="Processed By"
        >
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "8px" }}>Refund Details</div>
            <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "6px 0", color: "#64748b", width: "40%" }}>Refund Number</td>
                  <td style={{ padding: "6px 0", fontFamily: "monospace", fontWeight: 600 }}>{refund.refundNumber || refund.id.slice(-8).toUpperCase()}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "6px 0", color: "#64748b" }}>Payment Number</td>
                  <td style={{ padding: "6px 0", fontFamily: "monospace" }}>{payment?.paymentNumber || "—"}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "6px 0", color: "#64748b" }}>Invoice Number</td>
                  <td style={{ padding: "6px 0", fontFamily: "monospace" }}>{invoice?.invoiceNumber || "—"}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "6px 0", color: "#64748b" }}>Refund Type</td>
                  <td style={{ padding: "6px 0", textTransform: "capitalize" }}>{(refund.refundType || "full").replace(/_/g, " ")}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "6px 0", color: "#64748b" }}>Refund Method</td>
                  <td style={{ padding: "6px 0", textTransform: "capitalize" }}>{(refund.refundMethod || "—").replace(/_/g, " ")}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "6px 0", color: "#64748b" }}>Status</td>
                  <td style={{ padding: "6px 0", textTransform: "uppercase", fontWeight: 600, color: refund.status === "completed" ? "#059669" : "#64748b" }}>{refund.status}</td>
                </tr>
                {refund.externalReference && (
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "6px 0", color: "#64748b" }}>External Reference</td>
                    <td style={{ padding: "6px 0", fontFamily: "monospace" }}>{refund.externalReference}</td>
                  </tr>
                )}
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "6px 0", color: "#64748b" }}>Reason</td>
                  <td style={{ padding: "6px 0" }}>{refund.reason || "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ background: "#fef3c7", borderRadius: "8px", padding: "12px", marginBottom: "16px", border: "1px solid #fde68a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#92400e" }}>REFUND AMOUNT</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#92400e", fontFamily: "monospace" }}>
                {formatCurrency(refund.processedAmount ?? refund.approvedAmount ?? refund.amount)}
              </div>
            </div>
            {refund.processedAt && (
              <div style={{ fontSize: "10px", color: "#92400e", marginTop: "4px" }}>
                Processed on {new Date(refund.processedAt).toLocaleString("en-GB")}
              </div>
            )}
          </div>

          <div style={{ fontSize: "10px", color: "#94a3b8", fontStyle: "italic", textAlign: "center" }}>
            This refund receipt is generated based on the refund record and does not modify the original payment.
          </div>
        </PrintLayout>
      )}
    />
  );
}

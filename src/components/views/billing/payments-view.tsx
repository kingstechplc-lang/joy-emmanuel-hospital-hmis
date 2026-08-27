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
  Plus, CreditCard, Search, DollarSign, RefreshCcw, Download, RotateCcw,
  Eye, Check, X, Banknote, Smartphone, CreditCard as CardIcon, Building2, Shield,
  CalendarDays, TrendingUp, AlertCircle, ScrollText, FileBarChart
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
// Helpers
// =====================================================================
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const METHOD_FILTERS = [
  { value: "all", label: "All Methods" },
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank" },
  { value: "insurance", label: "Insurance" },
  { value: "other", label: "Other" },
];

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "reversed", label: "Reversed" },
];

const METHOD_ICONS: Record<string, any> = {
  cash: Banknote,
  mobile_money: Smartphone,
  card: CardIcon,
  bank: Building2,
  insurance: Shield,
  other: DollarSign,
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  card: "Card",
  bank: "Bank",
  insurance: "Insurance",
  other: "Other",
};

const HELP_SECTIONS = [
  {
    title: "Payment Methods",
    content: `Payments can be recorded using one of six methods:
• Cash — physical currency received at the counter
• Mobile Money — MoMo transfer (MTN, Vodafone, AirtelTigo)
• Card — debit / credit card POS
• Bank — bank transfer / deposit slip
• Insurance — payment by an insurer against a claim
• Other — any method not listed above

Each method feeds into the dashboard's "By Method" breakdown so finance teams can reconcile collections by channel.`,
  },
  {
    title: "Partial Payments",
    content: `A single invoice can be settled with multiple payments. Each payment reduces the invoice's outstanding balance and the invoice transitions:
   issued → partially_paid → paid
You can record a payment of any amount up to the remaining balance. The system prevents overpaying beyond the total invoice amount (plus a small tolerance).`,
  },
  {
    title: "Refunds",
    content: `Refunds return money to a patient (e.g. duplicate payment, service not rendered, overpayment).
Workflow:  Request → Approve → Process
• Request a refund against an existing completed payment
• Accountant approves the request (original payment unchanged)
• Cashier marks the refund as processed when the money is returned
Each refund is linked to its source payment. The original payment's audit trail is preserved per financial-integrity rules.`,
  },
  {
    title: "Reversals",
    content: `Reversals are a last-resort correction tool for payments recorded in error. A reversal:
• Marks the payment's status as "reversed" (the record is preserved for audit)
• Rolls back the linked invoice's amountPaid, balance, and status
• Requires a written reason (stored in the audit log)
Use reversals sparingly — prefer a refund where the money was actually received. Reversals should be reserved for cases where no money actually changed hands (e.g. duplicate entry of the same payment).`,
  },
  {
    title: "Receipts",
    content: `Every payment can be printed as a receipt. Click the Print button on any payment row or in the Payment Detail dialog. The receipt shows:
• Payment number, invoice number, amount, method
• Transaction reference (momo ref, cheque #, etc.)
• Received by + date
• Patient + facility info
Receipts use a standard A4 layout with the hospital letterhead.`,
  },
  {
    title: "Reconciliation",
    content: `Use the Dashboard tab to reconcile daily / weekly / monthly collections:
• Today's count + amount — should match your cash drawer
• Week / Month totals — for bank deposit slips
• By Method breakdown — match against MoMo statements, POS reports, bank statements
• Pending refunds — items needing approval before close of business
• Processed refunds — total refunds already returned today
Use the Reports tab for cashier summaries and the CSV Export for spreadsheet-level reconciliation.`,
  },
];

// =====================================================================
// Main view
// =====================================================================
export function PaymentsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canPay = can("billing.payment");
  const canRefund = can("billing.refund");
  const canView = can("billing.view");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showNew, setShowNew] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["payment-stats"] });
    qc.invalidateQueries({ queryKey: ["refunds"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payments"
        description="Record patient payments, track collections, process refunds, and reconcile daily cash flow"
        icon={CreditCard}
        gradient="from-emerald-500 to-teal-600"
        actions={
          <>
            <Button onClick={() => setShowNew(true)} disabled={!canPay} className="gap-2 bg-white/95 text-emerald-700 hover:bg-white">
              <Plus className="w-4 h-4" /> Record Payment
            </Button>
            <ModuleHelp title="Payments" sections={HELP_SECTIONS} />
          </>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view payments.</CardContent></Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Dashboard</TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5"><DollarSign className="w-3.5 h-3.5" /> All Payments</TabsTrigger>
          <TabsTrigger value="refunds" className="gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Refunds</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><FileBarChart className="w-3.5 h-3.5" /> Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab facilityId={activeFacilityId} canView={canView} onRecord={() => setShowNew(true)} canPay={canPay} />
        </TabsContent>

        <TabsContent value="all">
          <AllPaymentsTab
            facilityId={activeFacilityId}
            canView={canView}
            canRefund={canRefund}
            invalidate={invalidate}
          />
        </TabsContent>

        <TabsContent value="refunds">
          <RefundsTab facilityId={activeFacilityId} canView={canView} canRefund={canRefund} invalidate={invalidate} />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsTab facilityId={activeFacilityId} canView={canView} />
        </TabsContent>
      </Tabs>

      <NewPaymentDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); invalidate(); }}
        facilityId={activeFacilityId}
      />
    </div>
  );
}

// =====================================================================
// Tab 1: Dashboard
// =====================================================================
function DashboardTab({
  facilityId, canView, onRecord, canPay,
}: {
  facilityId: string | null;
  canView: boolean;
  onRecord: () => void;
  canPay: boolean;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payment-stats", facilityId],
    queryFn: () => fetchJson(`/api/payments/stats${facilityId ? `?facilityId=${facilityId}` : ""}`),
    enabled: !!facilityId && canView,
  });

  if (!facilityId) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState title="No facility selected" description="Select a facility to view payment dashboard." />
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load payment statistics" onRetry={() => refetch()} />;

  const w = data?.windows || {};
  const totals = data?.totals || {};
  const byMethod: any[] = data?.byMethod || [];
  const byStatus: any[] = data?.byStatus || [];
  const refunds = data?.refunds || {};

  return (
    <div className="space-y-4">
      {/* Time window stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard
          label="Today's Payments"
          value={w.today?.count ?? 0}
          icon={CalendarDays}
          gradient="from-emerald-500 to-emerald-600"
          sublabel={`${formatCurrency(w.today?.total ?? 0)} collected`}
        />
        <MiniStatCard
          label="Today's Amount"
          value={formatCurrency(w.today?.total ?? 0)}
          icon={DollarSign}
          gradient="from-teal-500 to-teal-600"
          sublabel={`${w.today?.count ?? 0} payments`}
        />
        <MiniStatCard
          label="This Week"
          value={formatCurrency(w.week?.total ?? 0)}
          icon={TrendingUp}
          gradient="from-cyan-500 to-cyan-600"
          sublabel={`${w.week?.count ?? 0} payments`}
        />
        <MiniStatCard
          label="This Month"
          value={formatCurrency(w.month?.total ?? 0)}
          icon={TrendingUp}
          gradient="from-emerald-600 to-teal-700"
          sublabel={`${w.month?.count ?? 0} payments`}
        />
      </div>

      {/* Refund stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard
          label="Pending Refunds"
          value={refunds.pending?.count ?? 0}
          icon={AlertCircle}
          gradient="from-amber-500 to-orange-600"
          sublabel={`${formatCurrency(refunds.pending?.total ?? 0)} requested`}
        />
        <MiniStatCard
          label="Processed Refunds"
          value={refunds.processed?.count ?? 0}
          icon={Check}
          gradient="from-rose-500 to-red-600"
          sublabel={`${formatCurrency(refunds.processed?.total ?? 0)} returned`}
        />
        <MiniStatCard
          label="Total Payments"
          value={totals.count ?? 0}
          icon={CreditCard}
          gradient="from-slate-600 to-slate-700"
          sublabel="All time"
        />
        <MiniStatCard
          label="Total Collected"
          value={formatCurrency(totals.amount ?? 0)}
          icon={DollarSign}
          gradient="from-emerald-700 to-teal-800"
          sublabel="All time"
        />
      </div>

      {/* By Method breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Collections by Method</h3>
              <DollarSign className="w-4 h-4 text-slate-400" />
            </div>
            {byMethod.length === 0 ? (
              <EmptyState title="No data" description="No completed payments recorded yet." icon={Banknote} />
            ) : (
              <div className="space-y-2">
                {byMethod.map((m) => {
                  const Icon = METHOD_ICONS[m.label] || DollarSign;
                  const pct = totals.amount > 0 ? Math.round((m.total / totals.amount) * 100) : 0;
                  return (
                    <div key={m.label} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline text-xs">
                          <span className="font-medium text-slate-700">{METHOD_LABELS[m.label] || m.label}</span>
                          <span className="font-mono font-semibold text-slate-900">{formatCurrency(m.total)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-500 w-9 text-right">{m.count} txn</span>
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

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Payments by Status</h3>
              <AlertCircle className="w-4 h-4 text-slate-400" />
            </div>
            {byStatus.length === 0 ? (
              <EmptyState title="No data" description="No payments recorded yet." icon={AlertCircle} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {byStatus.map((s) => (
                  <div key={s.label} className="border rounded-lg p-3 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <StatusBadge status={s.label} />
                      <span className="text-xs font-mono text-slate-500">{s.count}</span>
                    </div>
                    <div className="text-sm font-mono font-semibold text-slate-900">{formatCurrency(s.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick action */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Record a new payment</div>
            <div className="text-xs text-slate-500">Search for a patient, pick an outstanding invoice, and record the payment method.</div>
          </div>
          <Button onClick={onRecord} disabled={!canPay} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Record Payment
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// Tab 2: All Payments
// =====================================================================
function AllPaymentsTab({
  facilityId, canView, canRefund, invalidate,
}: {
  facilityId: string | null;
  canView: boolean;
  canRefund: boolean;
  invalidate: () => void;
}) {
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  if (search.trim()) params.set("q", search.trim());
  if (methodFilter !== "all") params.set("method", methodFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payments", facilityId, search, methodFilter, statusFilter, from, to],
    queryFn: () => fetchJson(`/api/payments${qs}`),
    enabled: !!facilityId && canView,
  });

  const items: any[] = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 10);
  const totalCollected = items
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + (p.amount || 0), 0);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (facilityId) params.set("facilityId", facilityId);
    if (search.trim()) params.set("q", search.trim());
    if (methodFilter !== "all") params.set("method", methodFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const url = `/api/payments/export?${params.toString()}`;
    window.open(url, "_blank");
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
              placeholder="Search payment #, patient, invoice #..."
              className="md:flex-1"
            />
            <Select value={methodFilter || undefined} onValueChange={setMethodFilter}>
              <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHOD_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
              <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
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
                Total collected: <span className="font-mono font-bold text-emerald-700">{formatCurrency(totalCollected)}</span>
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
        <ErrorState message="Failed to load payments" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No payments found"
              description="Adjust filters or record a new payment against an outstanding invoice."
              icon={CreditCard}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Payment #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Invoice #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Amount</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Method</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Reference</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Received By</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((p: any) => {
                    const MethodIcon = METHOD_ICONS[p.paymentMethod] || DollarSign;
                    return (
                      <tr key={p.id} className="border-b hover:bg-emerald-50/40">
                        <td className="p-3 font-mono text-xs text-slate-700">{p.paymentNumber}</td>
                        <td className="p-3">
                          <div className="font-mono text-xs text-slate-700">{p.invoice?.invoiceNumber}</div>
                          {p.invoice && <StatusBadge status={p.invoice.status} />}
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{p.patient?.firstName} {p.patient?.lastName}</div>
                          <div className="text-xs text-slate-500">{p.patient?.patientNumber}</div>
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-700 font-semibold">{formatCurrency(p.amount)}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1.5 text-xs capitalize px-2 py-0.5 rounded bg-slate-100">
                            <MethodIcon className="w-3 h-3 text-slate-500" />
                            {(p.paymentMethod || "").replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-slate-600 font-mono max-w-[160px] truncate" title={p.transactionReference || ""}>
                          {p.transactionReference || "—"}
                        </td>
                        <td className="p-3"><StatusBadge status={p.status} /></td>
                        <td className="p-3 text-xs text-slate-600">
                          {p.receivedBy ? `${p.receivedBy.firstName} ${p.receivedBy.lastName}` : "—"}
                        </td>
                        <td className="p-3 text-xs text-slate-600">{formatDate(p.receivedAt, true)}</td>
                        <td className="p-3 text-right">
                          <div className="flex flex-wrap gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setSelectedPaymentId(p.id)}
                            >
                              <Eye className="w-3 h-3" /> View
                            </Button>
                            <PaymentReceiptButton payment={p} />
                            {canRefund && p.status === "completed" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700"
                                onClick={() => setRefundTarget(p)}
                              >
                                <RotateCcw className="w-3 h-3" /> Refund
                              </Button>
                            )}
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

      {/* Detail dialog */}
      <PaymentDetailDialog
        paymentId={selectedPaymentId}
        onClose={() => setSelectedPaymentId(null)}
        canRefund={canRefund}
        onRefund={(p) => { setSelectedPaymentId(null); setRefundTarget(p); }}
        onMutated={invalidate}
      />

      {/* Refund dialog */}
      <RefundRequestDialog
        payment={refundTarget}
        onClose={() => setRefundTarget(null)}
        onCreated={() => { setRefundTarget(null); invalidate(); }}
      />
    </div>
  );
}

// =====================================================================
// Tab 3: Refunds
// =====================================================================
function RefundsTab({
  facilityId, canView, canRefund, invalidate,
}: {
  facilityId: string | null;
  canView: boolean;
  canRefund: boolean;
  invalidate: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState("all");

  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["refunds", facilityId, statusFilter],
    queryFn: () => fetchJson(`/api/refunds${qs}`),
    enabled: !!facilityId && canView,
  });

  const items: any[] = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 10);

  const doAction = async (id: string, action: string, successMsg: string, extra?: any) => {
    try {
      const res = await fetch(`/api/refunds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success(successMsg);
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-2 md:items-center">
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <div className="md:ml-auto text-xs text-slate-500">
            Showing {items.length} refund{items.length === 1 ? "" : "s"}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load refunds" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No refunds"
              description="Refund requests will appear here once submitted from the All Payments tab."
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
                    <th className="text-left p-3 font-semibold text-slate-700">Payment #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Invoice #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Amount</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Reason</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Requested By</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-amber-50/40">
                      <td className="p-3 font-mono text-xs text-slate-700">{r.id.slice(-8).toUpperCase()}</td>
                      <td className="p-3 font-mono text-xs text-slate-700">{r.payment?.paymentNumber || "—"}</td>
                      <td className="p-3 font-mono text-xs text-slate-700">{r.invoice?.invoiceNumber || "—"}</td>
                      <td className="p-3 text-xs text-slate-700">
                        {r.payment ? (
                          <>
                            <div className="font-medium text-slate-900">{r.payment.patient?.firstName} {r.payment.patient?.lastName}</div>
                            <div className="text-[10px] text-slate-400">{r.payment.patient?.patientNumber}</div>
                          </>
                        ) : "—"}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold text-rose-700">{formatCurrency(r.amount)}</td>
                      <td className="p-3 text-xs text-slate-700 max-w-[180px] truncate" title={r.reason}>{r.reason || "—"}</td>
                      <td className="p-3"><StatusBadge status={r.status} /></td>
                      <td className="p-3 text-xs text-slate-600">
                        {r.requestedBy ? `${r.requestedBy.firstName} ${r.requestedBy.lastName}` : "—"}
                      </td>
                      <td className="p-3 text-xs text-slate-600">{formatDate(r.createdAt, true)}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {r.status === "pending" && canRefund && (
                            <>
                              <Button size="sm" onClick={() => doAction(r.id, "approve", "Refund approved")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                                <Check className="w-3 h-3" /> Approve
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => doAction(r.id, "reject", "Refund rejected")} className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700">
                                <X className="w-3 h-3" /> Reject
                              </Button>
                            </>
                          )}
                          {r.status === "approved" && canRefund && (
                            <Button size="sm" onClick={() => doAction(r.id, "process", "Refund processed")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <RotateCcw className="w-3 h-3" /> Process
                            </Button>
                          )}
                          {["processed", "rejected"].includes(r.status) && (
                            <span className="text-[10px] text-slate-400 italic">No actions</span>
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
    </div>
  );
}

// =====================================================================
// Tab 4: Reports
// =====================================================================
function ReportsTab({ facilityId, canView }: { facilityId: string | null; canView: boolean }) {
  const [reportType, setReportType] = useState("daily_collection");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Default date range = last 7 days
  const effectiveFrom = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const effectiveTo = to || new Date().toISOString().slice(0, 10);

  // Fetch payments for the date range (used by all report types)
  const paymentsParams = new URLSearchParams();
  if (facilityId) paymentsParams.set("facilityId", facilityId);
  paymentsParams.set("from", effectiveFrom);
  paymentsParams.set("to", effectiveTo);
  paymentsParams.set("limit", "500");

  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ["payments-report", facilityId, effectiveFrom, effectiveTo],
    queryFn: () => fetchJson(`/api/payments?${paymentsParams.toString()}`),
    enabled: !!facilityId && canView,
  });

  // Fetch refunds for the date range
  const refundsParams = new URLSearchParams();
  if (facilityId) refundsParams.set("facilityId", facilityId);
  refundsParams.set("limit", "500");

  const { data: refundsData } = useQuery({
    queryKey: ["refunds-report", facilityId],
    queryFn: () => fetchJson(`/api/refunds?${refundsParams.toString()}`),
    enabled: !!facilityId && canView,
  });

  // Fetch audit logs for the audit report
  const auditParams = new URLSearchParams();
  auditParams.set("resourceType", "payment");
  auditParams.set("limit", "100");
  if (facilityId) auditParams.set("facilityId", facilityId);

  const { data: auditData } = useQuery({
    queryKey: ["payment-audit-report", facilityId],
    queryFn: () => fetchJson(`/api/audit-logs?${auditParams.toString()}`),
    enabled: !!facilityId && canView && reportType === "audit_log",
  });

  const payments: any[] = paymentsData?.items || [];
  const refunds: any[] = refundsData?.items || [];
  const auditLogs: any[] = auditData?.items || [];

  // ---- Daily Collection report ----
  const dailyRows = useMemo(() => {
    const byDay = new Map<string, { count: number; total: number; reversed: number }>();
    for (const p of payments) {
      const day = new Date(p.receivedAt).toISOString().slice(0, 10);
      const e = byDay.get(day) || { count: 0, total: 0, reversed: 0 };
      if (p.status === "completed") {
        e.count += 1;
        e.total += p.amount || 0;
      } else if (p.status === "reversed") {
        e.reversed += p.amount || 0;
      }
      byDay.set(day, e);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, ...v }));
  }, [payments]);

  // ---- Method Summary report ----
  const methodRows = useMemo(() => {
    const byMethod = new Map<string, { count: number; total: number }>();
    for (const p of payments) {
      if (p.status !== "completed") continue;
      const m = p.paymentMethod || "other";
      const e = byMethod.get(m) || { count: 0, total: 0 };
      e.count += 1;
      e.total += p.amount || 0;
      byMethod.set(m, e);
    }
    return Array.from(byMethod.entries()).map(([method, v]) => ({ method, ...v }));
  }, [payments]);

  // ---- Cashier Summary report ----
  const cashierRows = useMemo(() => {
    const byCashier = new Map<string, { name: string; count: number; total: number }>();
    for (const p of payments) {
      if (p.status !== "completed") continue;
      const id = p.receivedBy?.id || "unknown";
      const name = p.receivedBy ? `${p.receivedBy.firstName} ${p.receivedBy.lastName}` : "Unknown";
      const e = byCashier.get(id) || { name, count: 0, total: 0 };
      e.count += 1;
      e.total += p.amount || 0;
      byCashier.set(id, e);
    }
    return Array.from(byCashier.values()).sort((a, b) => b.total - a.total);
  }, [payments]);

  // ---- Refund Summary report ----
  const refundRows = useMemo(() => {
    const byStatus = new Map<string, { count: number; total: number }>();
    for (const r of refunds) {
      const s = r.status || "unknown";
      const e = byStatus.get(s) || { count: 0, total: 0 };
      e.count += 1;
      e.total += r.amount || 0;
      byStatus.set(s, e);
    }
    return Array.from(byStatus.entries()).map(([status, v]) => ({ status, ...v }));
  }, [refunds]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-2 md:items-center">
          <Select value={reportType || undefined} onValueChange={setReportType}>
            <SelectTrigger className="md:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily_collection">Daily Collection</SelectItem>
              <SelectItem value="method_summary">Method Summary</SelectItem>
              <SelectItem value="cashier_summary">Cashier Summary</SelectItem>
              <SelectItem value="refund_summary">Refund Summary</SelectItem>
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
          {/* Daily Collection */}
          {reportType === "daily_collection" && (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b bg-emerald-50">
                  <h3 className="text-sm font-semibold text-emerald-900">Daily Collection Report</h3>
                  <p className="text-xs text-emerald-700">
                    From {formatDate(effectiveFrom)} to {formatDate(effectiveTo)} · {payments.length} payment(s) in range
                  </p>
                </div>
                {dailyRows.length === 0 ? (
                  <EmptyState title="No data" description="No payments in this date range." icon={CalendarDays} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Payments</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Collected</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Reversed</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyRows.map((r) => (
                          <tr key={r.day} className="border-b hover:bg-emerald-50/40">
                            <td className="p-3 font-medium text-slate-900">{formatDate(r.day)}</td>
                            <td className="p-3 text-right font-mono text-slate-700">{r.count}</td>
                            <td className="p-3 text-right font-mono text-emerald-700 font-semibold">{formatCurrency(r.total)}</td>
                            <td className="p-3 text-right font-mono text-rose-600">{r.reversed > 0 ? formatCurrency(r.reversed) : "—"}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">{formatCurrency(r.total - r.reversed)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 bg-slate-50">
                        <tr>
                          <td className="p-3 font-semibold text-slate-900">Total</td>
                          <td className="p-3 text-right font-mono font-semibold text-slate-900">{dailyRows.reduce((s, r) => s + r.count, 0)}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-700">{formatCurrency(dailyRows.reduce((s, r) => s + r.total, 0))}</td>
                          <td className="p-3 text-right font-mono font-semibold text-rose-600">{formatCurrency(dailyRows.reduce((s, r) => s + r.reversed, 0))}</td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900">{formatCurrency(dailyRows.reduce((s, r) => s + r.total - r.reversed, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Method Summary */}
          {reportType === "method_summary" && (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b bg-teal-50">
                  <h3 className="text-sm font-semibold text-teal-900">Method Summary Report</h3>
                  <p className="text-xs text-teal-700">By payment method · {payments.length} payment(s) in range</p>
                </div>
                {methodRows.length === 0 ? (
                  <EmptyState title="No data" description="No completed payments in this date range." icon={Banknote} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Method</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Transactions</th>
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
                                    {METHOD_LABELS[r.method] || r.method}
                                  </span>
                                </td>
                                <td className="p-3 text-right font-mono text-slate-700">{r.count}</td>
                                <td className="p-3 text-right font-mono font-semibold text-emerald-700">{formatCurrency(r.total)}</td>
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

          {/* Cashier Summary */}
          {reportType === "cashier_summary" && (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b bg-cyan-50">
                  <h3 className="text-sm font-semibold text-cyan-900">Cashier Summary Report</h3>
                  <p className="text-xs text-cyan-700">By received-by user · {payments.length} payment(s) in range</p>
                </div>
                {cashierRows.length === 0 ? (
                  <EmptyState title="No data" description="No completed payments recorded in this date range." icon={DollarSign} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Cashier</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Transactions</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Total Collected</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Avg Transaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cashierRows.map((r, i) => (
                          <tr key={i} className="border-b hover:bg-cyan-50/40">
                            <td className="p-3 font-medium text-slate-900">{r.name}</td>
                            <td className="p-3 text-right font-mono text-slate-700">{r.count}</td>
                            <td className="p-3 text-right font-mono font-semibold text-emerald-700">{formatCurrency(r.total)}</td>
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

          {/* Refund Summary */}
          {reportType === "refund_summary" && (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b bg-amber-50">
                  <h3 className="text-sm font-semibold text-amber-900">Refund Summary Report</h3>
                  <p className="text-xs text-amber-700">By refund status · {refunds.length} refund(s) total</p>
                </div>
                {refundRows.length === 0 ? (
                  <EmptyState title="No refunds" description="No refund requests have been made in this facility." icon={RotateCcw} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Count</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Total Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {refundRows.map((r) => (
                          <tr key={r.status} className="border-b hover:bg-amber-50/40">
                            <td className="p-3"><StatusBadge status={r.status} /></td>
                            <td className="p-3 text-right font-mono text-slate-700">{r.count}</td>
                            <td className="p-3 text-right font-mono font-semibold text-rose-700">{formatCurrency(r.total)}</td>
                          </tr>
                        ))}
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
                  <h3 className="text-sm font-semibold text-slate-900">Payment Audit Log</h3>
                  <p className="text-xs text-slate-600">All payment-related audit entries · {auditLogs.length} record(s)</p>
                </div>
                {auditLogs.length === 0 ? (
                  <EmptyState title="No audit entries" description="No payment-related audit log entries found." icon={ScrollText} />
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
// Payment Detail Dialog
// =====================================================================
function PaymentDetailDialog({
  paymentId, onClose, canRefund, onRefund, onMutated,
}: {
  paymentId: string | null;
  onClose: () => void;
  canRefund: boolean;
  onRefund: (payment: any) => void;
  onMutated: () => void;
}) {
  const [reversing, setReversing] = useState(false);
  const [reverseReason, setReverseReason] = useState("");
  const [showReverse, setShowReverse] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["payment-detail", paymentId],
    queryFn: () => fetchJson(`/api/payments/${paymentId}`),
    enabled: !!paymentId,
  });

  const payment = data?.item;

  const handleReverse = async () => {
    if (!payment) return;
    if (!reverseReason.trim()) { toast.error("Reason is required"); return; }
    setReversing(true);
    try {
      const res = await fetch(`/api/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reverse", reason: reverseReason }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Payment reversed");
      setShowReverse(false);
      setReverseReason("");
      onMutated();
      refetch();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReversing(false);
    }
  };

  return (
    <Dialog open={!!paymentId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" /> Payment Detail
          </DialogTitle>
          <DialogDescription>
            {payment ? `Payment #${payment.paymentNumber}` : "Loading..."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState rows={4} />
        ) : !payment ? (
          <ErrorState message="Payment not found" />
        ) : (
          <div className="space-y-4">
            {/* Amount + status hero */}
            <div className="flex items-center justify-between bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
              <div>
                <div className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">Amount Received</div>
                <div className="text-3xl font-extrabold text-emerald-900">{formatCurrency(payment.amount)}</div>
                <div className="text-xs text-emerald-700 mt-1">via {(payment.paymentMethod || "").replace(/_/g, " ")}</div>
              </div>
              <StatusBadge status={payment.status} />
            </div>

            {/* Payment info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Payment #" value={payment.paymentNumber} mono />
              <InfoRow label="Method" value={(payment.paymentMethod || "").replace(/_/g, " ")} />
              <InfoRow label="Reference" value={payment.transactionReference || "—"} mono />
              <InfoRow label="Received At" value={formatDate(payment.receivedAt, true)} />
              <InfoRow label="Received By" value={payment.receivedBy ? `${payment.receivedBy.firstName} ${payment.receivedBy.lastName}` : "—"} />
              <InfoRow label="Facility" value={payment.facility?.name || "—"} />
            </div>

            {/* Linked invoice */}
            <div className="border rounded-lg">
              <div className="px-3 py-2 bg-slate-50 border-b">
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Linked Invoice</div>
              </div>
              {payment.invoice ? (
                <div className="p-3 grid grid-cols-2 gap-2 text-sm">
                  <InfoRow label="Invoice #" value={payment.invoice.invoiceNumber} mono />
                  <InfoRow label="Status" value={<StatusBadge status={payment.invoice.status} />} />
                  <InfoRow label="Total" value={formatCurrency(payment.invoice.total)} />
                  <InfoRow label="Amount Paid" value={formatCurrency(payment.invoice.amountPaid)} />
                  <InfoRow label="Balance" value={formatCurrency(payment.invoice.balance)} />
                  <InfoRow label="Patient" value={payment.invoice.patient ? `${payment.invoice.patient.firstName} ${payment.invoice.patient.lastName}` : "—"} />
                </div>
              ) : (
                <div className="p-3 text-xs text-slate-500 italic">No linked invoice.</div>
              )}
            </div>

            {/* Refund history */}
            <div className="border rounded-lg">
              <div className="px-3 py-2 bg-amber-50 border-b">
                <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Refund History</div>
              </div>
              {payment.refunds && payment.refunds.length > 0 ? (
                <div className="p-3 space-y-2">
                  {payment.refunds.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-600">#{r.id.slice(-8).toUpperCase()}</span>
                          <StatusBadge status={r.status} />
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">{r.reason}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Requested {formatRelative(r.createdAt)}
                          {r.processedAt && ` · Processed ${formatDate(r.processedAt, true)}`}
                          {r.processedBy && ` by ${r.processedBy.firstName} ${r.processedBy.lastName}`}
                        </div>
                      </div>
                      <div className="font-mono font-semibold text-rose-700">{formatCurrency(r.amount)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-xs text-slate-500 italic">No refunds requested for this payment.</div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 justify-end pt-2 border-t">
              <PaymentReceiptButton payment={payment} />
              {canRefund && payment.status === "completed" && (
                <Button
                  variant="outline"
                  className="gap-2 text-rose-600 hover:text-rose-700 border-rose-200 hover:bg-rose-50"
                  onClick={() => onRefund(payment)}
                >
                  <RotateCcw className="w-4 h-4" /> Request Refund
                </Button>
              )}
              {canRefund && payment.status === "completed" && (
                <Button
                  variant="outline"
                  className="gap-2 text-amber-700 hover:text-amber-800 border-amber-200 hover:bg-amber-50"
                  onClick={() => setShowReverse((s) => !s)}
                  disabled={reversing}
                >
                  <RefreshCcw className="w-4 h-4" /> Reverse Payment
                </Button>
              )}
            </div>

            {/* Reverse form */}
            {showReverse && (
              <div className="border border-amber-200 rounded-lg p-3 bg-amber-50/50 space-y-2">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-semibold">Reversal Confirmation</span>
                </div>
                <div className="text-xs text-amber-700">
                  Reversing this payment will mark it as <code>reversed</code> and roll back the linked invoice's balance. This action is audit-logged.
                </div>
                <div>
                  <FieldLabel required>Reason for reversal</FieldLabel>
                  <Textarea
                    value={reverseReason}
                    onChange={(e) => setReverseReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. Duplicate entry — same payment recorded twice"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setShowReverse(false); setReverseReason(""); }} disabled={reversing}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleReverse} disabled={reversing || !reverseReason.trim()} className="gap-2 bg-amber-600 hover:bg-amber-700">
                    {reversing ? "Reversing..." : <><RefreshCcw className="w-3.5 h-3.5" /> Confirm Reversal</>}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
      <span className={`text-sm text-slate-900 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

// =====================================================================
// Refund Request Dialog (used by All Payments tab + Payment Detail)
// =====================================================================
function RefundRequestDialog({
  payment, onClose, onCreated,
}: {
  payment: any | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset state when target changes
  useMemo(() => {
    if (payment) {
      setAmount(payment.amount || 0);
      setReason("");
    }
  }, [payment]);

  const submit = async () => {
    if (!payment) return;
    if (!amount || amount <= 0) { toast.error("Amount must be > 0"); return; }
    if (amount > payment.amount) { toast.error(`Amount cannot exceed ${formatCurrency(payment.amount)}`); return; }
    if (!reason.trim()) { toast.error("Reason is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_refund",
          amount,
          reason,
          refundMethod: payment.paymentMethod,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Refund requested");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="w-5 h-5 text-amber-600" /> Request Refund</DialogTitle>
          <DialogDescription>
            A refund request will be created against this payment. The original payment record is preserved — the refund creates its own audit trail.
          </DialogDescription>
        </DialogHeader>
        {payment && (
          <div className="space-y-3">
            <div className="text-xs bg-slate-50 p-3 rounded-lg space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Payment #</span><span className="font-mono font-semibold">{payment.paymentNumber}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Patient</span><span className="font-medium">{payment.patient?.firstName} {payment.patient?.lastName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Invoice #</span><span className="font-mono">{payment.invoice?.invoiceNumber}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Original Amount</span><span className="font-mono font-semibold text-emerald-700">{formatCurrency(payment.amount)}</span></div>
            </div>

            <div>
              <FieldLabel required>Refund Amount</FieldLabel>
              <Input type="number" step="0.01" max={payment.amount} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              <div className="text-[10px] text-slate-500 mt-1">Max: {formatCurrency(payment.amount)}</div>
            </div>

            <div>
              <FieldLabel required>Reason</FieldLabel>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Duplicate payment, service not rendered, overpayment..."
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !payment || !amount || !reason.trim()} className="gap-2 bg-amber-600 hover:bg-amber-700">
            {saving ? "Requesting..." : <><RotateCcw className="w-4 h-4" /> Request Refund</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Payment Receipt Button — print a single payment receipt
// =====================================================================
function PaymentReceiptButton({ payment }: { payment: any }) {
  return (
    <PrintButton
      label="Receipt"
      className="h-7 px-2 py-0 text-xs"
      renderContent={() => (
        <PrintLayout
          title="Payment Receipt"
          documentNumber={payment.paymentNumber}
          facility={payment.facility}
          patient={payment.patient}
          signatory={payment.receivedBy ? `${payment.receivedBy.firstName} ${payment.receivedBy.lastName}` : undefined}
          signatoryRole="Cashier"
        >
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "#059669" }}>{formatCurrency(payment.amount)}</div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>Payment received via {(payment.paymentMethod || "").replace(/_/g, " ")}</div>
          </div>
          <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "6px 8px", color: "#64748b" }}>Receipt No:</td>
                <td style={{ padding: "6px 8px", fontWeight: 600, fontFamily: "monospace" }}>{payment.paymentNumber}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "6px 8px", color: "#64748b" }}>Invoice:</td>
                <td style={{ padding: "6px 8px", fontWeight: 600, fontFamily: "monospace" }}>{payment.invoice?.invoiceNumber}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "6px 8px", color: "#64748b" }}>Amount:</td>
                <td style={{ padding: "6px 8px", fontWeight: 700, color: "#059669" }}>{formatCurrency(payment.amount)}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "6px 8px", color: "#64748b" }}>Method:</td>
                <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{(payment.paymentMethod || "").replace(/_/g, " ")}</td>
              </tr>
              {payment.transactionReference && (
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "6px 8px", color: "#64748b" }}>Reference:</td>
                  <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{payment.transactionReference}</td>
                </tr>
              )}
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "6px 8px", color: "#64748b" }}>Status:</td>
                <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{(payment.status || "").replace(/_/g, " ")}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "6px 8px", color: "#64748b" }}>Received by:</td>
                <td style={{ padding: "6px 8px" }}>{payment.receivedBy?.firstName} {payment.receivedBy?.lastName}</td>
              </tr>
              <tr>
                <td style={{ padding: "6px 8px", color: "#64748b" }}>Date:</td>
                <td style={{ padding: "6px 8px" }}>{formatDate(payment.receivedAt, true)}</td>
              </tr>
            </tbody>
          </table>
        </PrintLayout>
      )}
    />
  );
}

// =====================================================================
// New Payment Dialog (preserved from previous implementation)
// =====================================================================
function NewPaymentDialog({ open, onClose, onCreated, facilityId }: { open: boolean; onClose: () => void; onCreated: () => void; facilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [transactionReference, setTransactionReference] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search-payment", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  // Fetch invoices with outstanding balances for this patient
  const { data: invoicesData } = useQuery({
    queryKey: ["patient-invoices-payment", patientId, facilityId],
    queryFn: () => fetchJson(`/api/invoices?patientId=${patientId}${facilityId ? `&facilityId=${facilityId}` : ""}`),
    enabled: !!patientId,
  });

  const outstandingInvoices = (invoicesData?.items || []).filter((i: any) => i.balance > 0 && i.status !== "cancelled");

  const selectPatient = (p: any) => {
    setPatientId(p.id);
    setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
    setInvoiceId(""); setAmount(0);
  };

  const selectInvoice = (id: string) => {
    const inv = outstandingInvoices.find((i: any) => i.id === id);
    if (inv) {
      setInvoiceId(inv.id);
      setAmount(inv.balance);
    }
  };

  const selectedInvoice = outstandingInvoices.find((i: any) => i.id === invoiceId);
  const newBalanceAfter = selectedInvoice ? Math.max(0, selectedInvoice.balance - (amount || 0)) : 0;

  const submit = async () => {
    if (!invoiceId) { toast.error("Please select an outstanding invoice"); return; }
    if (!amount || amount <= 0) { toast.error("Amount must be > 0"); return; }
    if (selectedInvoice && amount > selectedInvoice.balance + 0.01) {
      toast.error(`Amount exceeds outstanding balance of ${formatCurrency(selectedInvoice.balance)}`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          patientId,
          facilityId,
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
      setPatientQuery(""); setPatientId(""); setInvoiceId(""); setAmount(0);
      setTransactionReference("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-emerald-600" /> Record Payment</DialogTitle>
          <DialogDescription>Select an invoice with an outstanding balance. The payment will update the invoice's amount paid, balance, and status atomically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <ClearableSearch value={patientQuery} onChange={setPatientQuery} placeholder="Search patient..." className="" inputClassName="" />
            </div>
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => selectPatient(p)} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {patientId && (
            <div>
              <FieldLabel required>Outstanding Invoice</FieldLabel>
              {outstandingInvoices.length === 0 ? (
                <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded">No outstanding invoices for this patient.</div>
              ) : (
                <Select value={invoiceId || undefined} onValueChange={selectInvoice}>
                  <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
                  <SelectContent>
                    {outstandingInvoices.map((i: any) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.invoiceNumber} • Total {formatCurrency(i.total)} • Balance {formatCurrency(i.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Amount</FieldLabel>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
            <div>
              <FieldLabel required>Payment Method</FieldLabel>
              <Select value={paymentMethod || undefined} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Transaction Reference (optional)</Label>
            <Input value={transactionReference} onChange={(e) => setTransactionReference(e.target.value)} placeholder="Momo ref, cheque #, etc." />
          </div>

          {/* Live preview */}
          {selectedInvoice && (
            <div className="text-xs bg-emerald-50 p-3 rounded-lg border border-emerald-100">
              <div className="font-semibold text-emerald-900 mb-1">Payment Preview</div>
              <div className="flex justify-between"><span className="text-emerald-700">Invoice Total</span><span className="font-mono">{formatCurrency(selectedInvoice.total)}</span></div>
              <div className="flex justify-between"><span className="text-emerald-700">Currently Paid</span><span className="font-mono">{formatCurrency(selectedInvoice.amountPaid)}</span></div>
              <div className="flex justify-between"><span className="text-emerald-700">Outstanding Balance</span><span className="font-mono">{formatCurrency(selectedInvoice.balance)}</span></div>
              <div className="flex justify-between"><span className="text-emerald-700">This Payment</span><span className="font-mono font-semibold text-emerald-900">−{formatCurrency(amount || 0)}</span></div>
              <div className="flex justify-between border-t border-emerald-200 mt-1 pt-1">
                <span className="font-semibold text-emerald-900">New Balance</span>
                <span className="font-mono font-bold text-emerald-900">{formatCurrency(newBalanceAfter)}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !invoiceId || !amount} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Recording..." : <><CreditCard className="w-4 h-4" /> Record Payment</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

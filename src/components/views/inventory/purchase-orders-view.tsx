"use client";
// =====================================================================
// Purchase Orders View — full lifecycle dashboard, list, reports, dialogs
// =====================================================================
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Plus, ShoppingCart, PackageCheck, Send, CheckCircle2, X, Truck, Eye,
  AlertTriangle, FileDown, Filter, Ban, Pause, Play, RefreshCw, Printer,
  ClipboardCheck, Clock, Layers, TrendingUp, Wallet, PackageX, ListChecks,
  Building2, Scale, MoreVertical, ThumbsUp, ThumbsDown, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative,
  formatCurrency, safeJson, PageHeader, ClearableSearch, usePagination, Pagination,
  MiniStatCard, ModuleHelp,
} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

// =====================================================================
// Helpers
// =====================================================================
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "sent_to_supplier", label: "Sent to Supplier" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "partially_received", label: "Partially Received" },
  { value: "fully_received", label: "Fully Received" },
  { value: "partially_invoiced", label: "Partially Invoiced" },
  { value: "fully_invoiced", label: "Fully Invoiced" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "fully_paid", label: "Fully Paid" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "on_hold", label: "On Hold" },
  { value: "expired", label: "Expired" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
  { value: "emergency", label: "Emergency" },
];

const PAYMENT_TERMS_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "immediate", label: "Immediate" },
  { value: "7_days", label: "Net 7 days" },
  { value: "15_days", label: "Net 15 days" },
  { value: "30_days", label: "Net 30 days" },
  { value: "45_days", label: "Net 45 days" },
  { value: "60_days", label: "Net 60 days" },
  { value: "90_days", label: "Net 90 days" },
  { value: "custom", label: "Custom" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  sent_to_supplier: "Sent to Supplier",
  acknowledged: "Acknowledged",
  partially_received: "Partially Received",
  fully_received: "Fully Received",
  partially_invoiced: "Partially Invoiced",
  fully_invoiced: "Fully Invoiced",
  partially_paid: "Partially Paid",
  fully_paid: "Fully Paid",
  closed: "Closed",
  cancelled: "Cancelled",
  on_hold: "On Hold",
  expired: "Expired",
};

// Color classes per spec
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  pending_approval: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  sent_to_supplier: "bg-cyan-100 text-cyan-700 border-cyan-200",
  acknowledged: "bg-teal-100 text-teal-700 border-teal-200",
  partially_received: "bg-amber-100 text-amber-700 border-amber-200",
  fully_received: "bg-emerald-100 text-emerald-700 border-emerald-200",
  partially_invoiced: "bg-amber-100 text-amber-700 border-amber-200",
  fully_invoiced: "bg-emerald-100 text-emerald-700 border-emerald-200",
  partially_paid: "bg-amber-100 text-amber-700 border-amber-200",
  fully_paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  on_hold: "bg-orange-100 text-orange-700 border-orange-200",
  expired: "bg-slate-100 text-slate-600 border-slate-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 border-slate-200",
  normal: "bg-blue-100 text-blue-700 border-blue-200",
  high: "bg-amber-100 text-amber-700 border-amber-200",
  urgent: "bg-orange-100 text-orange-700 border-orange-200",
  emergency: "bg-rose-100 text-rose-700 border-rose-200",
};

function POStatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {STATUS_LABELS[status] || status.replace(/_/g, " ")}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const p = priority || "normal";
  const cls = PRIORITY_COLORS[p] || PRIORITY_COLORS.normal;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {p.charAt(0).toUpperCase() + p.slice(1)}
    </span>
  );
}

function OverdueBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-red-100 text-red-700 border-red-200">
      <AlertTriangle className="w-3 h-3" /> Overdue
    </span>
  );
}

function pct(value: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function userFullName(u: any): string {
  if (!u) return "—";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "—";
}

// =====================================================================
// MAIN VIEW
// =====================================================================
export function PurchaseOrdersView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canView = can("inventory.view");
  const canManage = can("procurement.manage");
  const canReceive = can("inventory.receive");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("dashboard");

  // Dialogs
  const [showNew, setShowNew] = useState(false);
  const [viewPo, setViewPo] = useState<any | null>(null);
  const [receivePo, setReceivePo] = useState<any | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    qc.invalidateQueries({ queryKey: ["po-stats"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchase Orders"
        description="Create, approve, dispatch and track purchase orders across the full procurement lifecycle."
        icon={ShoppingCart}
        gradient="from-indigo-500 to-blue-600"
        actions={
          <>
            <Button onClick={() => setShowNew(true)} disabled={!canManage} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" /> New PO
            </Button>
            <ModuleHelp
              title="Purchase Orders Module"
              buttonLabel="Help"
              sections={[
                {
                  title: "PO Lifecycle",
                  content:
                    "A purchase order moves through these statuses: Draft → Pending Approval → Approved → Sent to Supplier → Acknowledged → Partially/Fully Received → Partially/Fully Invoiced → Partially/Fully Paid → Closed. A PO can be put On Hold at any active stage, Revised (sent back to draft), or Cancelled.",
                },
                {
                  title: "Approval Workflow",
                  content:
                    "Drafts are submitted for approval (status becomes 'Pending Approval'). An approver with procurement.manage permission can then Approve (→ Approved) or Reject (→ Rejected, requires a reason). Approved POs can be Sent to the supplier and then Acknowledged once the supplier confirms.",
                },
                {
                  title: "Delivery Tracking",
                  content:
                    "Each PO carries an Expected Delivery Date. If that date passes while the PO is still active (not closed/cancelled/fully received), it is automatically flagged Overdue. Use the shipping fields (carrier, tracking number, delivery contact) and the Acknowledge action to track supplier confirmation.",
                },
                {
                  title: "Goods Receiving",
                  content:
                    "Click 'Receive' on a sent/acknowledged/partially-received PO to open the Receive dialog. For each line, capture received quantity, rejected quantity, batch number, expiry date, cost price and selling price. Submitting creates a Goods Received Note (GRN), increments facility stock, and updates the PO's received rollups.",
                },
                {
                  title: "Three-Way Matching",
                  content:
                    "PO → Goods Receipt → Invoice → Payment. The Detail dialog shows per-line ordered vs received vs rejected vs invoiced vs paid quantities, plus PO-level totals for received, invoiced and paid values. Outstanding value = PO total − paid. Use this to spot mismatches before payment.",
                },
                {
                  title: "Reports & Analytics",
                  content:
                    "The Reports tab provides five standard reports: PO Register (all POs in a date range), Overdue POs, Outstanding Commitments, Spend by Supplier, and Delivery Performance. The Dashboard tab shows live counts and the by-supplier spend breakdown. CSV export is available from the All POs tab.",
                },
              ]}
            />
          </>
        }
      />

      {!activeFacilityId && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
            Select a facility to view purchase orders.
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5"><Layers className="w-3.5 h-3.5" /> Dashboard</TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5"><ListChecks className="w-3.5 h-3.5" /> All POs</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab activeFacilityId={activeFacilityId} canView={canView} onOpenPo={(p) => setViewPo(p)} />
        </TabsContent>

        <TabsContent value="list">
          <ListTab
            activeFacilityId={activeFacilityId}
            canView={canView}
            canManage={canManage}
            canReceive={canReceive}
            onView={(p) => setViewPo(p)}
            onReceive={(p) => setReceivePo(p)}
            invalidate={invalidate}
          />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsTab activeFacilityId={activeFacilityId} canView={canView} onView={(p) => setViewPo(p)} />
        </TabsContent>
      </Tabs>

      <NewPODialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); invalidate(); }}
        defaultFacilityId={activeFacilityId || undefined}
      />

      {viewPo && (
        <ViewPODialog
          po={viewPo}
          canManage={canManage}
          canReceive={canReceive}
          onClose={() => setViewPo(null)}
          onReceive={(p) => { setViewPo(null); setReceivePo(p); }}
          invalidate={invalidate}
        />
      )}

      {receivePo && (
        <ReceiveDialog
          po={receivePo}
          onClose={() => setReceivePo(null)}
          onDone={() => { setReceivePo(null); invalidate(); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// TAB 1 — DASHBOARD
// =====================================================================
function DashboardTab({
  activeFacilityId, canView, onOpenPo,
}: {
  activeFacilityId: string | null;
  canView: boolean;
  onOpenPo: (po: any) => void;
}) {
  const qs = activeFacilityId ? `?facilityId=${activeFacilityId}` : "";
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["po-stats", activeFacilityId],
    queryFn: () => fetchJson(`/api/purchase-orders/stats${qs}`),
    enabled: !!canView && !!activeFacilityId,
  });

  if (!activeFacilityId) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState title="No facility selected" description="Select a facility to view dashboard stats." />
        </CardContent>
      </Card>
    );
  }
  if (isLoading) return <LoadingState rows={5} />;
  if (isError) return <ErrorState message="Failed to load PO stats" onRetry={() => refetch()} />;

  const t = data?.totals || {};
  const f = data?.financial || {};

  return (
    <div className="space-y-4">
      {/* 12 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <MiniStatCard label="Total POs" value={t.total || 0} icon={ShoppingCart} gradient="from-indigo-500 to-blue-600" />
        <MiniStatCard label="Draft" value={t.draft || 0} icon={FileDown} gradient="from-slate-500 to-slate-600" />
        <MiniStatCard label="Pending Approval" value={t.pending_approval || 0} icon={Clock} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Approved" value={t.approved || 0} icon={CheckCircle2} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="Sent to Supplier" value={t.sent_to_supplier || 0} icon={Send} gradient="from-cyan-500 to-cyan-600" />
        <MiniStatCard label="Partially Received" value={t.partially_received || 0} icon={PackageCheck} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Fully Received" value={t.fully_received || 0} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Overdue" value={t.overdue || 0} icon={AlertTriangle} gradient="from-red-500 to-rose-600" />
        <MiniStatCard label="Cancelled" value={t.cancelled || 0} icon={Ban} gradient="from-rose-500 to-rose-600" />
        <MiniStatCard label="Total Value" value={formatCurrency(f.totalValue)} icon={Wallet} gradient="from-indigo-500 to-blue-600" />
        <MiniStatCard label="Outstanding" value={formatCurrency(f.outstandingValue)} icon={Scale} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Total Paid" value={formatCurrency(f.totalPaid)} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
      </div>

      {/* By supplier breakdown */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <Building2 className="w-4 h-4" /> Spend by Supplier
            </h3>
          </div>
          {(data?.bySupplier || []).length === 0 ? (
            <EmptyState title="No supplier data" description="No POs have been created yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-700">Supplier</th>
                    <th className="text-right p-2 font-semibold text-slate-700">POs</th>
                    <th className="text-right p-2 font-semibold text-slate-700">Total Value</th>
                    <th className="text-right p-2 font-semibold text-slate-700">% of Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.bySupplier || []).map((s: any) => (
                    <tr key={s.id} className="border-b hover:bg-slate-50">
                      <td className="p-2 font-medium text-slate-900">{s.name}</td>
                      <td className="p-2 text-right">{s.count}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(s.value)}</td>
                      <td className="p-2 text-right text-xs text-slate-600">
                        {f.totalValue > 0 ? `${pct(s.value, f.totalValue)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* By priority */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
            <Layers className="w-4 h-4" /> By Priority
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {(data?.byPriority || []).map((p: any) => (
              <div key={p.priority} className="border rounded-lg p-3 text-center">
                <PriorityBadge priority={p.priority} />
                <div className="text-2xl font-bold mt-1 text-slate-800">{p.count}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// TAB 2 — ALL POs (list + filters + actions)
// =====================================================================
function ListTab({
  activeFacilityId, canView, canManage, canReceive, onView, onReceive, invalidate,
}: {
  activeFacilityId: string | null;
  canView: boolean;
  canManage: boolean;
  canReceive: boolean;
  onView: (po: any) => void;
  onReceive: (po: any) => void;
  invalidate: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Suppliers for filter
  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers-for-po-filter"],
    queryFn: () => fetchJson(`/api/suppliers?status=active`),
    enabled: !!canView,
  });
  const suppliers = suppliersData?.items || [];

  const listQueryStr = useMemo(() => {
    const params = new URLSearchParams();
    if (activeFacilityId) params.set("facilityId", activeFacilityId);
    if (search) params.set("q", search);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (priorityFilter && priorityFilter !== "all") params.set("priority", priorityFilter);
    if (supplierFilter && supplierFilter !== "all") params.set("supplierId", supplierFilter);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [activeFacilityId, search, statusFilter, priorityFilter, supplierFilter, from, to]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["purchase-orders", listQueryStr],
    queryFn: () => fetchJson(`/api/purchase-orders${listQueryStr}`),
    enabled: !!canView && !!activeFacilityId,
  });

  const items = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } =
    usePagination(items, 15);

  const handleExport = () => {
    window.open(`/api/purchase-orders/export${listQueryStr}`, "_blank");
  };

  const clearFilters = () => {
    setSearch(""); setStatusFilter("all"); setPriorityFilter("all");
    setSupplierFilter("all"); setFrom(""); setTo("");
  };

  const doAction = async (id: string, action: string, payload: any = {}, successMsg: string) => {
    const res = await fetch(`/api/purchase-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    if (res.ok) {
      toast.success(successMsg);
      invalidate();
    } else {
      const e = await safeJson(res).catch(() => ({}));
      toast.error(e.error || "Failed");
    }
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search PO #, supplier, ref..." />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger><SelectValue placeholder="All suppliers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-[10px] text-slate-500">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div>
              <Label className="text-[10px] text-slate-500">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <Button size="sm" variant="outline" onClick={clearFilters} className="gap-1.5 h-8">
              <Filter className="w-3.5 h-3.5" /> Clear
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5 h-8 ml-auto">
              <FileDown className="w-3.5 h-3.5" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {!activeFacilityId ? (
        <Card><CardContent className="p-6"><EmptyState title="No facility selected" description="Select a facility to view POs." /></CardContent></Card>
      ) : isLoading ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState message="Failed to load purchase orders" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="No purchase orders" description="Adjust filters or create a new PO." />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">PO #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Supplier</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Facility</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Expected</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Priority</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Total</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Recv %</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((p: any) => {
                    const orderedQty = (p.items || []).reduce((s: number, it: any) => s + (it.quantity || 0), 0);
                    const recvQty = (p.items || []).reduce((s: number, it: any) => s + (it.receivedQuantity || 0), 0);
                    const recvPct = pct(recvQty, orderedQty);
                    return (
                      <tr key={p.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 font-mono text-xs text-slate-700">
                          <button onClick={() => onView(p)} className="text-blue-700 hover:underline font-medium">
                            {p.purchaseOrderNumber}
                          </button>
                          {p.revisionNumber > 0 && <span className="text-amber-600 ml-1">rev{p.revisionNumber}</span>}
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{p.supplier?.name}</div>
                          <div className="text-xs text-slate-500">{p.supplier?.code}</div>
                        </td>
                        <td className="p-3 text-xs text-slate-700">{p.facility?.name}</td>
                        <td className="p-3 text-xs text-slate-600">{formatDate(p.createdAt)}</td>
                        <td className="p-3 text-xs text-slate-600">
                          {p.expectedDeliveryDate ? formatDate(p.expectedDeliveryDate) : "—"}
                          {p.isOverdue && <div className="mt-0.5"><OverdueBadge /></div>}
                        </td>
                        <td className="p-3"><PriorityBadge priority={p.priority} /></td>
                        <td className="p-3 text-right font-mono font-semibold">{formatCurrency(p.total, p.currency)}</td>
                        <td className="p-3 text-right">
                          <span className={`text-xs font-semibold ${recvPct >= 100 ? "text-emerald-700" : recvPct > 0 ? "text-amber-700" : "text-slate-500"}`}>
                            {recvPct}%
                          </span>
                        </td>
                        <td className="p-3"><POStatusBadge status={p.status} /></td>
                        <td className="p-3 text-right">
                          <RowActions
                            po={p}
                            canManage={canManage}
                            canReceive={canReceive}
                            onView={() => onView(p)}
                            onReceive={() => onReceive(p)}
                            doAction={doAction}
                          />
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

// Row actions dropdown
function RowActions({
  po, canManage, canReceive, onView, onReceive, doAction,
}: {
  po: any;
  canManage: boolean;
  canReceive: boolean;
  onView: () => void;
  onReceive: () => void;
  doAction: (id: string, action: string, payload: any, successMsg: string) => Promise<void>;
}) {
  if (!canManage && !canReceive) {
    return (
      <Button size="sm" variant="outline" onClick={onView} className="gap-1 h-7 text-xs">
        <Eye className="w-3 h-3" /> View
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <Button size="sm" variant="outline" onClick={onView} className="gap-1 h-7 text-xs">
        <Eye className="w-3 h-3" /> View
      </Button>
      {canReceive && ["sent_to_supplier", "acknowledged", "partially_received"].includes(po.status) && (
        <Button size="sm" onClick={onReceive} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
          <PackageCheck className="w-3 h-3" /> Receive
        </Button>
      )}
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><MoreVertical className="w-3.5 h-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs">Lifecycle</DropdownMenuLabel>
            {po.status === "draft" && (
              <DropdownMenuItem onClick={() => doAction(po.id, "submit", {}, "PO submitted for approval")}>
                <Send className="w-3.5 h-3.5 mr-2" /> Submit for Approval
              </DropdownMenuItem>
            )}
            {po.status === "pending_approval" && (
              <>
                <DropdownMenuItem onClick={() => doAction(po.id, "approve", {}, "PO approved")}>
                  <ThumbsUp className="w-3.5 h-3.5 mr-2" /> Approve
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const reason = prompt("Rejection reason (required):");
                  if (reason && reason.trim()) doAction(po.id, "reject", { rejectionReason: reason.trim() }, "PO rejected");
                }} className="text-rose-600">
                  <ThumbsDown className="w-3.5 h-3.5 mr-2" /> Reject…
                </DropdownMenuItem>
              </>
            )}
            {po.status === "approved" && (
              <DropdownMenuItem onClick={() => doAction(po.id, "send", {}, "PO sent to supplier")}>
                <Send className="w-3.5 h-3.5 mr-2" /> Send to Supplier
              </DropdownMenuItem>
            )}
            {po.status === "sent_to_supplier" && (
              <DropdownMenuItem onClick={() => {
                const ackStatus = prompt("Ack status (accepted | partially_accepted | rejected):", "accepted") || "accepted";
                const comments = prompt("Supplier comments (optional):", "") || "";
                doAction(po.id, "acknowledge", { supplierAckStatus: ackStatus, supplierAckComments: comments }, "PO acknowledged");
              }}>
                <ClipboardCheck className="w-3.5 h-3.5 mr-2" /> Acknowledge…
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {!["on_hold", "closed", "cancelled", "fully_received", "rejected"].includes(po.status) && (
              <DropdownMenuItem onClick={() => {
                const reason = prompt("Hold reason (required):");
                if (reason && reason.trim()) doAction(po.id, "hold", { holdReason: reason.trim() }, "PO put on hold");
              }} className="text-orange-600">
                <Pause className="w-3.5 h-3.5 mr-2" /> Put on Hold…
              </DropdownMenuItem>
            )}
            {po.status === "on_hold" && (
              <DropdownMenuItem onClick={() => doAction(po.id, "release", {}, "PO released from hold")}>
                <Play className="w-3.5 h-3.5 mr-2" /> Release Hold
              </DropdownMenuItem>
            )}
            {["fully_paid", "fully_received", "fully_invoiced"].includes(po.status) && (
              <DropdownMenuItem onClick={() => {
                const notes = prompt("Close notes (optional):", "") || "";
                doAction(po.id, "close", { closeNotes: notes }, "PO closed");
              }}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Close PO…
              </DropdownMenuItem>
            )}
            {["approved", "sent_to_supplier", "acknowledged", "pending_approval"].includes(po.status) && (
              <DropdownMenuItem onClick={() => {
                const reason = prompt("Revise reason (required):");
                if (reason && reason.trim()) doAction(po.id, "revise", { reason: reason.trim() }, "PO sent back to draft for revision");
              }}>
                <RefreshCw className="w-3.5 h-3.5 mr-2" /> Revise…
              </DropdownMenuItem>
            )}
            {!["fully_received", "closed", "cancelled"].includes(po.status) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => {
                  const reason = prompt("Cancel reason (optional):", "") || "";
                  doAction(po.id, "cancel", { cancelReason: reason.trim() }, "PO cancelled");
                }} className="text-rose-600">
                  <Ban className="w-3.5 h-3.5 mr-2" /> Cancel…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// =====================================================================
// TAB 3 — REPORTS
// =====================================================================
function ReportsTab({
  activeFacilityId, canView, onView,
}: {
  activeFacilityId: string | null;
  canView: boolean;
  onView: (po: any) => void;
}) {
  const [reportType, setReportType] = useState("register");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const listQueryStr = useMemo(() => {
    const params = new URLSearchParams();
    if (activeFacilityId) params.set("facilityId", activeFacilityId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [activeFacilityId, from, to]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["purchase-orders-reports", listQueryStr],
    queryFn: () => fetchJson(`/api/purchase-orders${listQueryStr}`),
    enabled: !!canView && !!activeFacilityId,
  });

  const allPos: any[] = data?.items || [];

  // Compute reports
  const register = allPos;
  const overdue = allPos.filter((p) => p.isOverdue);
  const outstanding = allPos.filter((p) => {
    const total = Number(p.total) || 0;
    const paid = Number(p.totalPaid) || 0;
    return (total - paid) > 0.01 && !["cancelled", "closed", "rejected"].includes(p.status);
  });

  // Spend by supplier
  const spendMap = new Map<string, { name: string; count: number; value: number; paid: number }>();
  for (const p of allPos) {
    if (["cancelled", "rejected"].includes(p.status)) continue;
    const key = p.supplier?.id || "unknown";
    const name = p.supplier?.name || "Unknown";
    const cur = spendMap.get(key) || { name, count: 0, value: 0, paid: 0 };
    cur.count++;
    cur.value += Number(p.total) || 0;
    cur.paid += Number(p.totalPaid) || 0;
    spendMap.set(key, cur);
  }
  const spend = Array.from(spendMap.values()).sort((a, b) => b.value - a.value);

  // Delivery performance — POs with expectedDeliveryDate and either fully_received or cancelled
  const delivery = allPos
    .filter((p) => p.expectedDeliveryDate && ["fully_received", "partially_received", "cancelled"].includes(p.status))
    .map((p) => {
      const expected = new Date(p.expectedDeliveryDate).getTime();
      const actual = p.actualDeliveryDate ? new Date(p.actualDeliveryDate).getTime() : (p.status === "fully_received" ? Date.now() : null);
      const onTime = actual !== null ? actual <= expected : null;
      const daysLate = actual !== null && actual > expected ? Math.ceil((actual - expected) / (1000 * 60 * 60 * 24)) : 0;
      return { ...p, onTime, daysLate };
    });

  if (!activeFacilityId) {
    return <Card><CardContent className="p-6"><EmptyState title="No facility selected" description="Select a facility to view reports." /></CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      {/* Report selector + date range */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-[10px] text-slate-500">Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="register">PO Register</SelectItem>
                  <SelectItem value="overdue">Overdue POs</SelectItem>
                  <SelectItem value="outstanding">Outstanding Commitments</SelectItem>
                  <SelectItem value="spend">Spend by Supplier</SelectItem>
                  <SelectItem value="delivery">Delivery Performance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-slate-500">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div>
              <Label className="text-[10px] text-slate-500">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs w-36" />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load report data" onRetry={() => refetch()} />
      ) : (
        <>
          {/* PO Register */}
          {reportType === "register" && (
            <ReportCard title="PO Register" description="All purchase orders in the selected date range.">
              {register.length === 0 ? (
                <EmptyState title="No POs" description="No purchase orders match the selected filters." />
              ) : (
                <ReportTable
                  headers={["PO #", "Supplier", "Date", "Priority", "Status", "Total"]}
                  rows={register.map((p) => [
                    <button key="n" onClick={() => onView(p)} className="text-blue-700 hover:underline font-mono text-xs">{p.purchaseOrderNumber}</button>,
                    p.supplier?.name || "—",
                    formatDate(p.createdAt),
                    <PriorityBadge key="p" priority={p.priority} />,
                    <POStatusBadge key="s" status={p.status} />,
                    <span key="t" className="font-mono">{formatCurrency(p.total, p.currency)}</span>,
                  ])}
                />
              )}
            </ReportCard>
          )}

          {/* Overdue POs */}
          {reportType === "overdue" && (
            <ReportCard title="Overdue POs" description="Active POs whose expected delivery date has passed.">
              {overdue.length === 0 ? (
                <EmptyState title="No overdue POs" description="All active POs are within their expected delivery window." icon={CheckCircle2} />
              ) : (
                <ReportTable
                  headers={["PO #", "Supplier", "Expected", "Days Overdue", "Priority", "Total"]}
                  rows={overdue.map((p) => {
                    const days = Math.ceil((Date.now() - new Date(p.expectedDeliveryDate).getTime()) / (1000 * 60 * 60 * 24));
                    return [
                      <button key="n" onClick={() => onView(p)} className="text-blue-700 hover:underline font-mono text-xs">{p.purchaseOrderNumber}</button>,
                      p.supplier?.name || "—",
                      formatDate(p.expectedDeliveryDate),
                      <Badge key="d" variant="destructive">{days}d</Badge>,
                      <PriorityBadge key="p" priority={p.priority} />,
                      <span key="t" className="font-mono">{formatCurrency(p.total, p.currency)}</span>,
                    ];
                  })}
                />
              )}
            </ReportCard>
          )}

          {/* Outstanding Commitments */}
          {reportType === "outstanding" && (
            <ReportCard title="Outstanding Commitments" description="POs with unpaid balances (PO total − paid).">
              {outstanding.length === 0 ? (
                <EmptyState title="No outstanding commitments" description="All POs are fully paid or closed." icon={CheckCircle2} />
              ) : (
                <ReportTable
                  headers={["PO #", "Supplier", "Total", "Paid", "Outstanding", "Status"]}
                  rows={outstanding.map((p) => {
                    const total = Number(p.total) || 0;
                    const paid = Number(p.totalPaid) || 0;
                    const out = total - paid;
                    return [
                      <button key="n" onClick={() => onView(p)} className="text-blue-700 hover:underline font-mono text-xs">{p.purchaseOrderNumber}</button>,
                      p.supplier?.name || "—",
                      <span key="t" className="font-mono">{formatCurrency(total, p.currency)}</span>,
                      <span key="p" className="font-mono">{formatCurrency(paid, p.currency)}</span>,
                      <span key="o" className="font-mono font-semibold text-amber-700">{formatCurrency(out, p.currency)}</span>,
                      <POStatusBadge key="s" status={p.status} />,
                    ];
                  })}
                />
              )}
            </ReportCard>
          )}

          {/* Spend by Supplier */}
          {reportType === "spend" && (
            <ReportCard title="Spend by Supplier" description="Aggregated PO value & paid amounts per supplier.">
              {spend.length === 0 ? (
                <EmptyState title="No spend data" description="No non-cancelled POs in the selected range." />
              ) : (
                <ReportTable
                  headers={["Supplier", "POs", "Total Value", "Paid", "Outstanding"]}
                  rows={spend.map((s) => [
                    s.name,
                    s.count,
                    <span key="v" className="font-mono">{formatCurrency(s.value)}</span>,
                    <span key="p" className="font-mono text-emerald-700">{formatCurrency(s.paid)}</span>,
                    <span key="o" className="font-mono text-amber-700">{formatCurrency(s.value - s.paid)}</span>,
                  ])}
                />
              )}
            </ReportCard>
          )}

          {/* Delivery Performance */}
          {reportType === "delivery" && (
            <ReportCard title="Delivery Performance" description="On-time vs late deliveries for received/cancelled POs.">
              {delivery.length === 0 ? (
                <EmptyState title="No delivery data" description="No POs with expected delivery dates have been received/cancelled yet." />
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="border rounded p-3 text-center bg-emerald-50">
                      <div className="text-2xl font-bold text-emerald-700">{delivery.filter((d) => d.onTime === true).length}</div>
                      <div className="text-xs text-slate-600">On Time</div>
                    </div>
                    <div className="border rounded p-3 text-center bg-amber-50">
                      <div className="text-2xl font-bold text-amber-700">{delivery.filter((d) => d.onTime === false).length}</div>
                      <div className="text-xs text-slate-600">Late</div>
                    </div>
                    <div className="border rounded p-3 text-center bg-slate-50">
                      <div className="text-2xl font-bold text-slate-700">{delivery.filter((d) => d.onTime === null).length}</div>
                      <div className="text-xs text-slate-600">Unknown</div>
                    </div>
                  </div>
                  <ReportTable
                    headers={["PO #", "Supplier", "Expected", "Actual", "Days Late", "Status"]}
                    rows={delivery.map((p) => [
                      <button key="n" onClick={() => onView(p)} className="text-blue-700 hover:underline font-mono text-xs">{p.purchaseOrderNumber}</button>,
                      p.supplier?.name || "—",
                      formatDate(p.expectedDeliveryDate),
                      p.actualDeliveryDate ? formatDate(p.actualDeliveryDate) : "—",
                      p.onTime === false ? <Badge key="l" variant="destructive">{p.daysLate}d late</Badge> : (p.onTime === true ? <Badge key="o" className="bg-emerald-100 text-emerald-700 border-emerald-200">on time</Badge> : "—"),
                      <POStatusBadge key="s" status={p.status} />,
                    ])}
                  />
                </>
              )}
            </ReportCard>
          )}
        </>
      )}
    </div>
  );
}

function ReportCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        {description && <p className="text-xs text-slate-500 mb-3">{description}</p>}
        {!description && <div className="mb-3" />}
        {children}
      </CardContent>
    </Card>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-slate-50 sticky top-0">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={`p-2 font-semibold text-slate-700 ${i === 0 ? "text-left" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b hover:bg-slate-50">
              {row.map((cell, j) => (
                <td key={j} className="p-2">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =====================================================================
// NEW PO DIALOG
// =====================================================================
function NewPODialog({
  open, onClose, onCreated, defaultFacilityId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultFacilityId?: string;
}) {
  const [facilityId, setFacilityId] = useState(defaultFacilityId || "");
  const [supplierId, setSupplierId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [deliveryContact, setDeliveryContact] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [shippingMethod, setShippingMethod] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState("");

  const [facilities, setFacilities] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [invQuery, setInvQuery] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const itemsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (items.length > 0 && itemsEndRef.current) {
      itemsEndRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [items.length]);

  useEffect(() => { fetchJson("/api/facilities").then((d) => setFacilities(d.facilities || [])).catch(() => {}); }, []);
  useEffect(() => { fetchJson("/api/suppliers?status=active").then((d) => setSuppliers(d.items || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (!facilityId) { setDepartments([]); return; }
    fetchJson(`/api/departments?facilityId=${facilityId}`).then((d) => setDepartments(d.items || [])).catch(() => setDepartments([]));
  }, [facilityId]);
  useEffect(() => {
    if (!facilityId) return;
    const q = new URLSearchParams();
    q.set("facilityId", facilityId);
    if (invQuery) q.set("q", invQuery);
    fetchJson(`/api/inventory?${q.toString()}`).then((d) => setInventory(d.items || [])).catch(() => setInventory([]));
  }, [facilityId, invQuery]);

  // Live total calculation
  const calc = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unitPrice) || 0;
      const discount = Number(it.discount) || 0;
      const taxRate = Number(it.taxRate) || 0;
      const gross = qty * price;
      const net = Math.max(0, gross - discount);
      const tax = net * (taxRate / 100);
      subtotal += gross;
      totalDiscount += discount;
      totalTax += tax;
    }
    const grandTotal = subtotal - totalDiscount + totalTax;
    return { subtotal, totalDiscount, totalTax, grandTotal };
  }, [items]);

  const addItem = (inv: any) => {
    if (items.find((i) => i.inventoryItemId === inv.id)) return;
    setItems([
      ...items,
      {
        inventoryItemId: inv.id,
        description: inv.name,
        category: inv.category || "",
        unit: inv.unit || "",
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        taxRate: 0,
        _isStock: true,
      },
    ]);
  };

  const addNonStock = () => {
    setItems([
      ...items,
      {
        inventoryItemId: null,
        description: "",
        category: "",
        unit: "",
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        taxRate: 0,
        _isStock: false,
      },
    ]);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!facilityId) return toast.error("Select a facility");
    if (!supplierId) return toast.error("Select a supplier");
    if (items.length === 0) return toast.error("Add at least one item");
    if (isEmergency && !emergencyReason.trim()) return toast.error("Emergency reason is required for emergency POs");

    // Validate items
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it._isStock && !it.description?.trim()) {
        return toast.error(`Line ${i + 1}: description required for non-stock item`);
      }
      if (!Number(it.quantity) || Number(it.quantity) <= 0) {
        return toast.error(`Line ${i + 1}: quantity must be > 0`);
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId,
          supplierId,
          departmentId: departmentId || undefined,
          priority,
          expectedDeliveryDate: expectedDeliveryDate || undefined,
          paymentTerms: paymentTerms || undefined,
          deliveryTerms: deliveryTerms || undefined,
          shippingAddress: shippingAddress || undefined,
          deliveryContact: deliveryContact || undefined,
          deliveryPhone: deliveryPhone || undefined,
          shippingMethod: shippingMethod || undefined,
          supplierReference: supplierReference || undefined,
          trackingNumber: trackingNumber || undefined,
          notes,
          termsAndConditions,
          isEmergency,
          emergencyReason: emergencyReason || undefined,
          status: "draft",
          items: items.map((it) => ({
            inventoryItemId: it.inventoryItemId || undefined,
            description: it.description || undefined,
            category: it.category || undefined,
            unit: it.unit || undefined,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            discount: Number(it.discount) || 0,
            taxRate: Number(it.taxRate) || 0,
          })),
        }),
      });
      const rdata = await safeJson(res);
      if (!res.ok) throw new Error(rdata.error || "Failed");
      toast.success("Purchase order created");
      // Reset
      setSupplierId(""); setDepartmentId(""); setPriority("normal");
      setExpectedDeliveryDate(""); setPaymentTerms(""); setDeliveryTerms("");
      setShippingAddress(""); setDeliveryContact(""); setDeliveryPhone("");
      setShippingMethod(""); setSupplierReference(""); setTrackingNumber("");
      setNotes(""); setTermsAndConditions(""); setIsEmergency(false); setEmergencyReason("");
      setItems([]);
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><ShoppingCart className="w-4 h-4" /> New Purchase Order</DialogTitle>
          <DialogDescription className="text-white/80">Select facility, supplier, commercial terms and line items.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Header fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <FieldLabel required>Facility</FieldLabel>
              <Select value={facilityId || undefined} onValueChange={setFacilityId}>
                <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel required>Supplier</FieldLabel>
              <Select value={supplierId || undefined} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>Department</FieldLabel>
              <Select value={departmentId || "none"} onValueChange={(v) => setDepartmentId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No department —</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <FieldLabel>Priority</FieldLabel>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>Expected Delivery</FieldLabel>
              <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Payment Terms</FieldLabel>
              <Select value={paymentTerms || "none"} onValueChange={(v) => setPaymentTerms(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {PAYMENT_TERMS_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>Delivery Terms</FieldLabel>
              <Input value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} placeholder="e.g. FOB, EXW" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <FieldLabel>Delivery Contact</FieldLabel>
              <Input value={deliveryContact} onChange={(e) => setDeliveryContact(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Delivery Phone</FieldLabel>
              <Input value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Shipping Method</FieldLabel>
              <Input value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value)} placeholder="e.g. Courier, Truck" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Supplier Reference</FieldLabel>
              <Input value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} placeholder="Supplier's quote # / ref" />
            </div>
            <div>
              <FieldLabel>Tracking Number</FieldLabel>
              <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
            </div>
          </div>

          <div>
            <FieldLabel>Shipping Address</FieldLabel>
            <Textarea value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} rows={2} />
          </div>

          {/* Emergency toggle */}
          <div className="border rounded p-3 bg-rose-50/40">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isEmergency} onChange={(e) => setIsEmergency(e.target.checked)} className="rounded" />
              <span className="text-sm font-medium text-rose-700 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Mark as Emergency PO
              </span>
            </label>
            {isEmergency && (
              <div className="mt-2">
                <FieldLabel required>Emergency Reason</FieldLabel>
                <Input value={emergencyReason} onChange={(e) => setEmergencyReason(e.target.value)} placeholder="Brief justification for emergency procurement" />
              </div>
            )}
          </div>

          {/* Item picker */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-800">Line Items ({items.length})</h4>
              <Button size="sm" variant="outline" onClick={addNonStock} className="gap-1.5 h-7 text-xs">
                <Plus className="w-3 h-3" /> Add Non-Stock Item
              </Button>
            </div>
            <div className="sticky top-0 z-20 bg-white pb-2 border-b border-slate-100">
              <FieldLabel>Add Inventory Item</FieldLabel>
              <ClearableSearch value={invQuery} onChange={setInvQuery} placeholder="Search inventory by name or SKU" disabled={!facilityId} />
              {inventory.length > 0 && (
                <div className="mt-1 border rounded max-h-40 overflow-y-auto">
                  {inventory.slice(0, 10).map((inv) => (
                    <button key={inv.id} onClick={() => addItem(inv)} className="w-full text-left p-2 hover:bg-emerald-50 border-b last:border-b-0">
                      <div className="text-sm">{inv.name} <span className="text-xs text-slate-500">({inv.sku})</span></div>
                      {inv.category && <div className="text-[10px] text-slate-500">{inv.category}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <>
                <div className="border rounded mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="text-left p-2 min-w-[180px]">Item / Description</th>
                        <th className="text-left p-2 w-24">Unit</th>
                        <th className="text-right p-2 w-20">Qty</th>
                        <th className="text-right p-2 w-28">Unit Price</th>
                        <th className="text-right p-2 w-24">Discount</th>
                        <th className="text-right p-2 w-20">Tax %</th>
                        <th className="text-right p-2 w-28">Line Total</th>
                        <th className="p-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => {
                        const qty = Number(it.quantity) || 0;
                        const price = Number(it.unitPrice) || 0;
                        const discount = Number(it.discount) || 0;
                        const taxRate = Number(it.taxRate) || 0;
                        const net = Math.max(0, qty * price - discount);
                        const lineTotal = net + net * (taxRate / 100);
                        return (
                          <tr key={idx} className="border-b">
                            <td className="p-2">
                              {it._isStock ? (
                                <>
                                  <div className="font-medium">{it.description}</div>
                                  <div className="text-[10px] text-slate-500">Stock item</div>
                                </>
                              ) : (
                                <Input
                                  value={it.description}
                                  onChange={(e) => updateItem(idx, "description", e.target.value)}
                                  placeholder="Description for non-stock item"
                                  className="h-7 text-xs"
                                />
                              )}
                            </td>
                            <td className="p-2">
                              <Input value={it.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} className="h-7 text-xs" placeholder="pcs" />
                            </td>
                            <td className="p-2">
                              <Input type="number" min={1} value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="h-7 text-xs text-right" />
                            </td>
                            <td className="p-2">
                              <Input type="number" step="0.01" min={0} value={it.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} className="h-7 text-xs text-right" />
                            </td>
                            <td className="p-2">
                              <Input type="number" step="0.01" min={0} value={it.discount} onChange={(e) => updateItem(idx, "discount", e.target.value)} className="h-7 text-xs text-right" />
                            </td>
                            <td className="p-2">
                              <Input type="number" step="0.01" min={0} value={it.taxRate} onChange={(e) => updateItem(idx, "taxRate", e.target.value)} className="h-7 text-xs text-right" />
                            </td>
                            <td className="p-2 text-right font-mono font-semibold">{formatCurrency(lineTotal)}</td>
                            <td className="p-2 text-right">
                              <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="text-rose-600 h-7 w-7 p-0">
                                <X className="w-3 h-3" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50">
                      <tr>
                        <td colSpan={3} className="p-2 text-right font-semibold">Subtotal</td>
                        <td className="p-2 text-right font-mono" colSpan={4}>{formatCurrency(calc.subtotal)}</td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="p-2 text-right font-semibold">Total Discount</td>
                        <td className="p-2 text-right font-mono text-rose-700" colSpan={4}>- {formatCurrency(calc.totalDiscount)}</td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="p-2 text-right font-semibold">Total Tax</td>
                        <td className="p-2 text-right font-mono text-amber-700" colSpan={4}>+ {formatCurrency(calc.totalTax)}</td>
                        <td></td>
                      </tr>
                      <tr className="bg-indigo-50">
                        <td colSpan={3} className="p-2 text-right font-bold">Grand Total</td>
                        <td className="p-2 text-right font-mono font-bold text-indigo-700 text-base" colSpan={4}>{formatCurrency(calc.grandTotal)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div ref={itemsEndRef} />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Notes</FieldLabel>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <div>
              <FieldLabel>Terms & Conditions</FieldLabel>
              <Textarea value={termsAndConditions} onChange={(e) => setTermsAndConditions(e.target.value)} rows={2} placeholder="Payment, delivery, return policies" />
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Creating..." : "Create PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// VIEW PO DETAIL DIALOG
// =====================================================================
function ViewPODialog({
  po, canManage, canReceive, onClose, onReceive, invalidate,
}: {
  po: any;
  canManage: boolean;
  canReceive: boolean;
  onClose: () => void;
  onReceive: (po: any) => void;
  invalidate: () => void;
}) {
  const [data, setData] = useState<any>(po);
  const [innerTab, setInnerTab] = useState("overview");

  useEffect(() => {
    fetchJson(`/api/purchase-orders/${po.id}`).then((d) => setData(d.item)).catch(() => {});
  }, [po.id]);

  const reload = () => {
    fetchJson(`/api/purchase-orders/${po.id}`).then((d) => setData(d.item)).catch(() => {});
    invalidate();
  };

  const doAction = async (action: string, payload: any = {}, successMsg: string) => {
    const res = await fetch(`/api/purchase-orders/${po.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    if (res.ok) {
      toast.success(successMsg);
      reload();
    } else {
      const e = await safeJson(res).catch(() => ({}));
      toast.error(e.error || "Failed");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const m = data?.metrics || {
    totalOrderedQty: 0,
    totalReceivedQty: 0,
    totalRejectedQty: 0,
    poTotal: Number(data?.total) || 0,
    totalReceivedValue: Number(data?.totalReceived) || 0,
    totalInvoicedValue: Number(data?.totalInvoiced) || 0,
    totalPaidValue: Number(data?.totalPaid) || 0,
    outstandingValue: Math.max(0, (Number(data?.total) || 0) - (Number(data?.totalPaid) || 0)),
    receivedPct: 0,
    invoicedPct: 0,
    paidPct: 0,
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <ShoppingCart className="w-5 h-5" />
                <span className="font-mono">{data?.purchaseOrderNumber}</span>
                {data?.revisionNumber > 0 && <Badge variant="outline" className="text-amber-700 border-amber-200">rev {data.revisionNumber}</Badge>}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 flex-wrap mt-1">
                <span>{data?.supplier?.name}</span>
                <span className="text-slate-400">·</span>
                <span>{data?.facility?.name}</span>
                {data?.department && <><span className="text-slate-400">·</span><span>{data.department.name}</span></>}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <POStatusBadge status={data?.status} />
              {data?.priority && <PriorityBadge priority={data.priority} />}
              {data?.isOverdue && <OverdueBadge />}
              {data?.isEmergency && <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Emergency</Badge>}
            </div>
          </div>
        </DialogHeader>

        {/* Financial summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="border rounded p-2 text-center">
            <div className="text-[10px] text-slate-500 uppercase">PO Total</div>
            <div className="font-bold text-slate-900">{formatCurrency(m.poTotal, data?.currency)}</div>
          </div>
          <div className="border rounded p-2 text-center bg-emerald-50">
            <div className="text-[10px] text-slate-500 uppercase">Received</div>
            <div className="font-bold text-emerald-700">{formatCurrency(m.totalReceivedValue, data?.currency)}</div>
            <div className="text-[10px] text-slate-500">{m.receivedPct}%</div>
          </div>
          <div className="border rounded p-2 text-center bg-amber-50">
            <div className="text-[10px] text-slate-500 uppercase">Invoiced</div>
            <div className="font-bold text-amber-700">{formatCurrency(m.totalInvoicedValue, data?.currency)}</div>
            <div className="text-[10px] text-slate-500">{m.invoicedPct}%</div>
          </div>
          <div className="border rounded p-2 text-center bg-blue-50">
            <div className="text-[10px] text-slate-500 uppercase">Paid</div>
            <div className="font-bold text-blue-700">{formatCurrency(m.totalPaidValue, data?.currency)}</div>
            <div className="text-[10px] text-slate-500">{m.paidPct}%</div>
          </div>
          <div className="border rounded p-2 text-center bg-rose-50">
            <div className="text-[10px] text-slate-500 uppercase">Outstanding</div>
            <div className="font-bold text-rose-700">{formatCurrency(m.outstandingValue, data?.currency)}</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 border-y py-2">
          <Button size="sm" variant="outline" onClick={() => onReceive(data)} disabled={!canReceive || !["sent_to_supplier", "acknowledged", "partially_received"].includes(data?.status)} className="gap-1.5 h-8">
            <PackageCheck className="w-3.5 h-3.5" /> Receive
          </Button>
          {canManage && data?.status === "draft" && (
            <Button size="sm" onClick={() => doAction("submit", {}, "PO submitted")} className="gap-1.5 h-8 bg-amber-600 hover:bg-amber-700">
              <Send className="w-3.5 h-3.5" /> Submit
            </Button>
          )}
          {canManage && data?.status === "pending_approval" && (
            <>
              <Button size="sm" onClick={() => doAction("approve", {}, "PO approved")} className="gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-700">
                <ThumbsUp className="w-3.5 h-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                const reason = prompt("Rejection reason (required):");
                if (reason && reason.trim()) doAction("reject", { rejectionReason: reason.trim() }, "PO rejected");
              }} className="gap-1.5 h-8 text-rose-700 border-rose-300">
                <ThumbsDown className="w-3.5 h-3.5" /> Reject
              </Button>
            </>
          )}
          {canManage && data?.status === "approved" && (
            <Button size="sm" onClick={() => doAction("send", {}, "PO sent to supplier")} className="gap-1.5 h-8 bg-cyan-600 hover:bg-cyan-700">
              <Send className="w-3.5 h-3.5" /> Send to Supplier
            </Button>
          )}
          {canManage && data?.status === "sent_to_supplier" && (
            <Button size="sm" onClick={() => {
              const ackStatus = prompt("Ack status (accepted | partially_accepted | rejected):", "accepted") || "accepted";
              const comments = prompt("Supplier comments (optional):", "") || "";
              doAction("acknowledge", { supplierAckStatus: ackStatus, supplierAckComments: comments }, "PO acknowledged");
            }} className="gap-1.5 h-8 bg-teal-600 hover:bg-teal-700">
              <ClipboardCheck className="w-3.5 h-3.5" /> Acknowledge
            </Button>
          )}
          {canManage && !["on_hold", "closed", "cancelled", "fully_received", "rejected"].includes(data?.status) && (
            <Button size="sm" variant="outline" onClick={() => {
              const reason = prompt("Hold reason (required):");
              if (reason && reason.trim()) doAction("hold", { holdReason: reason.trim() }, "PO put on hold");
            }} className="gap-1.5 h-8 text-orange-700 border-orange-300">
              <Pause className="w-3.5 h-3.5" /> Hold
            </Button>
          )}
          {canManage && data?.status === "on_hold" && (
            <Button size="sm" variant="outline" onClick={() => doAction("release", {}, "PO released")} className="gap-1.5 h-8">
              <Play className="w-3.5 h-3.5" /> Release
            </Button>
          )}
          {canManage && ["fully_paid", "fully_received", "fully_invoiced"].includes(data?.status) && (
            <Button size="sm" onClick={() => {
              const notes = prompt("Close notes (optional):", "") || "";
              doAction("close", { closeNotes: notes }, "PO closed");
            }} className="gap-1.5 h-8 bg-slate-700 hover:bg-slate-800">
              <CheckCircle2 className="w-3.5 h-3.5" /> Close
            </Button>
          )}
          {canManage && ["approved", "sent_to_supplier", "acknowledged", "pending_approval"].includes(data?.status) && (
            <Button size="sm" variant="outline" onClick={() => {
              const reason = prompt("Revise reason (required):");
              if (reason && reason.trim()) doAction("revise", { reason: reason.trim() }, "PO sent back to draft");
            }} className="gap-1.5 h-8">
              <RefreshCw className="w-3.5 h-3.5" /> Revise
            </Button>
          )}
          {canManage && !["fully_received", "closed", "cancelled"].includes(data?.status) && (
            <Button size="sm" variant="outline" onClick={() => {
              const reason = prompt("Cancel reason (optional):", "") || "";
              doAction("cancel", { cancelReason: reason.trim() }, "PO cancelled");
            }} className="gap-1.5 h-8 text-rose-700 border-rose-300">
              <Ban className="w-3.5 h-3.5" /> Cancel
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handlePrint} className="gap-1.5 h-8 ml-auto">
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        </div>

        {/* Inner tabs */}
        <Tabs value={innerTab} onValueChange={setInnerTab}>
          <TabsList>
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="items" className="text-xs">Line Items</TabsTrigger>
            <TabsTrigger value="grns" className="text-xs">Goods Receipts</TabsTrigger>
            <TabsTrigger value="approvals" className="text-xs">Approvals</TabsTrigger>
            <TabsTrigger value="audit" className="text-xs">Audit Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <Card>
                <CardContent className="p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-700 uppercase mb-1">Pricing</div>
                  <Row label="Subtotal" value={formatCurrency(data?.subtotal, data?.currency)} />
                  <Row label="Discount" value={`- ${formatCurrency((data?.items || []).reduce((s: number, it: any) => s + (Number(it.discount) || 0), 0), data?.currency)}`} />
                  <Row label="Tax" value={`+ ${formatCurrency(data?.tax, data?.currency)}`} />
                  <Row label="Total" value={formatCurrency(data?.total, data?.currency)} bold />
                  <Row label="Currency" value={data?.currency || "GHS"} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-700 uppercase mb-1">Delivery</div>
                  <Row label="Expected Delivery" value={data?.expectedDeliveryDate ? formatDate(data.expectedDeliveryDate) : "—"} />
                  <Row label="Actual Delivery" value={data?.actualDeliveryDate ? formatDate(data.actualDeliveryDate) : "—"} />
                  <Row label="Shipping Method" value={data?.shippingMethod || "—"} />
                  <Row label="Tracking #" value={data?.trackingNumber || "—"} />
                  <Row label="Delivery Contact" value={data?.deliveryContact || "—"} />
                  <Row label="Delivery Phone" value={data?.deliveryPhone || "—"} />
                  <Row label="Shipping Address" value={data?.shippingAddress || "—"} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-700 uppercase mb-1">Commercial Terms</div>
                  <Row label="Payment Terms" value={data?.paymentTerms || "—"} />
                  <Row label="Delivery Terms" value={data?.deliveryTerms || "—"} />
                  <Row label="Supplier Reference" value={data?.supplierReference || "—"} />
                  <Row label="Priority" value={<PriorityBadge priority={data?.priority} />} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-700 uppercase mb-1">Notes & T&Cs</div>
                  <div className="text-xs text-slate-700 whitespace-pre-wrap">{data?.notes || "—"}</div>
                  <div className="text-[10px] text-slate-500 mt-2">Terms & Conditions</div>
                  <div className="text-xs text-slate-700 whitespace-pre-wrap">{data?.termsAndConditions || "—"}</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="items">
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-xs">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-2">Item</th>
                    <th className="text-right p-2">Ordered</th>
                    <th className="text-right p-2">Received</th>
                    <th className="text-right p-2">Rejected</th>
                    <th className="text-right p-2">Outstanding</th>
                    <th className="text-right p-2">Invoiced</th>
                    <th className="text-right p-2">Paid</th>
                    <th className="text-right p-2">Unit Price</th>
                    <th className="text-right p-2">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.items || []).map((it: any) => {
                    const outstanding = Math.max(0, (it.quantity || 0) - (it.receivedQuantity || 0));
                    return (
                      <tr key={it.id} className="border-b hover:bg-slate-50">
                        <td className="p-2">
                          <div className="font-medium">{it.inventoryItem?.name || it.description || "—"}</div>
                          <div className="text-[10px] text-slate-500">
                            {it.inventoryItem?.sku || "Non-stock"}
                            {it.category && ` · ${it.category}`}
                            {it.unit && ` · ${it.unit}`}
                          </div>
                        </td>
                        <td className="p-2 text-right">{it.quantity}</td>
                        <td className="p-2 text-right text-emerald-700">{it.receivedQuantity || 0}</td>
                        <td className="p-2 text-right text-rose-700">{it.rejectedQuantity || 0}</td>
                        <td className="p-2 text-right text-amber-700 font-semibold">{outstanding}</td>
                        <td className="p-2 text-right">{it.invoicedQuantity || 0}</td>
                        <td className="p-2 text-right">{it.paidQuantity || 0}</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(it.unitPrice, data?.currency)}</td>
                        <td className="p-2 text-right font-mono font-semibold">{formatCurrency(it.lineTotal || it.total, data?.currency)}</td>
                      </tr>
                    );
                  })}
                  {(data?.items || []).length === 0 && (
                    <tr><td colSpan={9} className="p-4 text-center text-slate-500">No line items</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="grns">
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-xs">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-2">GRN ID</th>
                    <th className="text-left p-2">Reference</th>
                    <th className="text-left p-2">Received By</th>
                    <th className="text-left p-2">Received At</th>
                    <th className="text-left p-2">Facility</th>
                    <th className="text-left p-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.goodsReceived || []).map((g: any) => (
                    <tr key={g.id} className="border-b hover:bg-slate-50">
                      <td className="p-2 font-mono text-[10px]">{g.id.slice(-8)}</td>
                      <td className="p-2">{g.referenceNumber || "—"}</td>
                      <td className="p-2">{userFullName(g.receivedBy)}</td>
                      <td className="p-2">{formatDate(g.receivedAt, true)}</td>
                      <td className="p-2">{g.facility?.name || "—"}</td>
                      <td className="p-2 text-slate-600">{g.notes || "—"}</td>
                    </tr>
                  ))}
                  {(data?.goodsReceived || []).length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-slate-500">No goods received yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="approvals">
            <div className="space-y-2 text-sm">
              <ApprovalRow label="Requested by" user={data?.requestedBy} date={data?.createdAt} />
              <ApprovalRow label="Submitted" date={data?.submittedAt} />
              <ApprovalRow label="Approved by" user={data?.approvedBy} date={data?.approvedAt} />
              <ApprovalRow label="Rejected by" user={data?.rejectedBy} date={data?.rejectedAt} reason={data?.rejectionReason} />
              <ApprovalRow label="Sent to supplier" user={data?.sentBy} date={data?.sentToSupplierAt} />
              <ApprovalRow label="Acknowledged by" user={data?.acknowledgedBy} date={data?.acknowledgedAt} reason={data?.supplierAckComments} />
              <ApprovalRow label="Put on hold by" user={data?.heldBy} date={data?.heldAt} reason={data?.holdReason} />
              <ApprovalRow label="Closed by" user={data?.closedBy} date={data?.closedAt} reason={data?.closeNotes} />
              <ApprovalRow label="Cancelled by" user={data?.cancelledBy} date={data?.cancelledAt} reason={data?.cancelReason} />
            </div>
          </TabsContent>

          <TabsContent value="audit">
            <AuditTimeline po={data} />
          </TabsContent>
        </Tabs>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right ${bold ? "font-bold text-slate-900" : "text-slate-700"}`}>{value}</span>
    </div>
  );
}

function ApprovalRow({ label, user, date, reason }: { label: string; user?: any; date?: any; reason?: string | null }) {
  if (!date && !user) {
    return (
      <div className="flex items-center gap-2 border rounded p-2 bg-slate-50 text-slate-400">
        <Clock className="w-3.5 h-3.5" />
        <span className="text-xs">{label}: pending</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 border rounded p-2">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      <div className="flex-1">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] text-slate-500">
          {user ? userFullName(user) : "—"} · {date ? formatDate(date, true) : "—"}
        </div>
        {reason && <div className="text-[10px] text-amber-700 mt-0.5">Reason: {reason}</div>}
      </div>
    </div>
  );
}

function AuditTimeline({ po }: { po: any }) {
  // Build a chronological timeline from available dates on the PO
  const events: { label: string; date?: any; user?: any; reason?: string | null }[] = [
    { label: "PO Created", date: po?.createdAt, user: po?.requestedBy },
    { label: "Submitted for Approval", date: po?.submittedAt },
    { label: "Approved", date: po?.approvedAt, user: po?.approvedBy },
    { label: "Rejected", date: po?.rejectedAt, user: po?.rejectedBy, reason: po?.rejectionReason },
    { label: "Sent to Supplier", date: po?.sentToSupplierAt, user: po?.sentBy },
    { label: "Acknowledged by Supplier", date: po?.acknowledgedAt, user: po?.acknowledgedBy, reason: po?.supplierAckComments },
    { label: "Put on Hold", date: po?.heldAt, user: po?.heldBy, reason: po?.holdReason },
    { label: "Goods Delivered", date: po?.actualDeliveryDate },
    { label: "Closed", date: po?.closedAt, user: po?.closedBy, reason: po?.closeNotes },
    { label: "Cancelled", date: po?.cancelledAt, user: po?.cancelledBy, reason: po?.cancelReason },
  ]
    .filter((e) => e.date)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (events.length === 0) {
    return <EmptyState title="No timeline events" description="No lifecycle events recorded yet." />;
  }

  return (
    <div className="space-y-2">
      {events.map((e, i) => (
        <div key={i} className="flex gap-3 border-l-2 border-slate-200 pl-3 pb-2 relative">
          <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-indigo-500" />
          <div className="flex-1">
            <div className="text-xs font-semibold text-slate-800">{e.label}</div>
            <div className="text-[10px] text-slate-500">{formatDate(e.date, true)} · {formatRelative(e.date)}</div>
            {e.user && <div className="text-[10px] text-slate-600">by {userFullName(e.user)}</div>}
            {e.reason && <div className="text-[10px] text-amber-700 mt-0.5">{e.reason}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// RECEIVE DIALOG (preserved + rejectedQuantity enhancement)
// =====================================================================
function ReceiveDialog({
  po, onClose, onDone,
}: {
  po: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [recvMap, setRecvMap] = useState<Record<string, {
    receivedQuantity: string;
    rejectedQuantity: string;
    batchNumber: string;
    expiryDate: string;
    costPrice: string;
    sellingPrice: string;
  }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<any>(po);

  useEffect(() => {
    fetchJson(`/api/purchase-orders/${po.id}`).then((d) => setData(d.item)).catch(() => {});
  }, [po.id]);

  const setItem = (itemId: string, field: string, value: string) => {
    setRecvMap((prev) => {
      const cur = prev[itemId] || {
        receivedQuantity: "", rejectedQuantity: "", batchNumber: "",
        expiryDate: "", costPrice: "", sellingPrice: "",
      };
      return { ...prev, [itemId]: { ...cur, [field]: value } };
    });
  };

  const handleSubmit = async () => {
    const items = (data?.items || []).map((it: any) => {
      const cfg = recvMap[it.id];
      const receivedQty = Number(cfg?.receivedQuantity || 0);
      if (receivedQty <= 0) return null;
      return {
        purchaseOrderItemId: it.id,
        receivedQuantity: receivedQty,
        rejectedQuantity: Number(cfg?.rejectedQuantity || 0),
        batchNumber: cfg?.batchNumber || `BATCH-${Date.now()}`,
        expiryDate: cfg?.expiryDate || null,
        costPrice: cfg?.costPrice ? Number(cfg.costPrice) : it.unitPrice,
        sellingPrice: cfg?.sellingPrice ? Number(cfg.sellingPrice) : Number(it.unitPrice) * 1.2,
      };
    }).filter(Boolean);

    if (items.length === 0) return toast.error("Enter at least one received quantity");

    setSubmitting(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceNumber, notes, items }),
      });
      const rdata = await safeJson(res);
      if (!res.ok) throw new Error(rdata.error || "Failed");
      toast.success(`Goods received — ${items.length} item(s) stocked`);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><PackageCheck className="w-4 h-4" /> Receive Goods: {data?.purchaseOrderNumber}</DialogTitle>
          <DialogDescription className="text-white/80">{data?.supplier?.name} · {data?.facility?.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel>GRN / Reference Number</FieldLabel>
              <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Optional waybill #" />
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {(data?.items || []).map((it: any) => {
              const cfg = recvMap[it.id] || {};
              const outstanding = Math.max(0, (it.quantity || 0) - (it.receivedQuantity || 0));
              return (
                <Card key={it.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{it.inventoryItem?.name || it.description || "—"}</div>
                        <div className="text-xs text-slate-500">
                          Ordered: {it.quantity} · Already received: {it.receivedQuantity || 0} · Outstanding: {outstanding} · Unit Price {formatCurrency(it.unitPrice, data?.currency)}
                        </div>
                      </div>
                      {outstanding === 0 && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Fully received</Badge>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                      <div>
                        <FieldLabel required>Received Qty</FieldLabel>
                        <Input type="number" min={0} max={outstanding} value={cfg.receivedQuantity || ""} onChange={(e) => setItem(it.id, "receivedQuantity", e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <FieldLabel>Rejected Qty</FieldLabel>
                        <Input type="number" min={0} value={cfg.rejectedQuantity || ""} onChange={(e) => setItem(it.id, "rejectedQuantity", e.target.value)} className="h-8 text-xs" placeholder="0" />
                      </div>
                      <div>
                        <FieldLabel>Batch #</FieldLabel>
                        <Input value={cfg.batchNumber || ""} onChange={(e) => setItem(it.id, "batchNumber", e.target.value)} className="h-8 text-xs" placeholder="BATCH-001" />
                      </div>
                      <div>
                        <FieldLabel>Expiry</FieldLabel>
                        <Input type="date" value={cfg.expiryDate || ""} onChange={(e) => setItem(it.id, "expiryDate", e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <FieldLabel>Cost Price</FieldLabel>
                        <Input type="number" step="0.01" value={cfg.costPrice ?? String(it.unitPrice)} onChange={(e) => setItem(it.id, "costPrice", e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <FieldLabel>Sell Price</FieldLabel>
                        <Input type="number" step="0.01" value={cfg.sellingPrice || ""} onChange={(e) => setItem(it.id, "sellingPrice", e.target.value)} className="h-8 text-xs" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {(data?.items || []).length === 0 && (
              <EmptyState title="No items" description="This PO has no line items to receive." />
            )}
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Receiving..." : "Receive Goods"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

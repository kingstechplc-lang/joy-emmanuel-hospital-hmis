"use client";
// =====================================================================
// Stock Transfers View — full lifecycle dashboard, list, detail dialog,
// reports, new-transfer dialog, receive dialog, and module help.
//
// Lifecycle (15 states):
//   draft → pending_approval → approved → preparing → ready_for_dispatch
//     → dispatched → (in_transit) → partially_received | received
//     → verified → completed
//   Side branches: rejected, cancelled, on_hold, discrepancy
//
// Permissions:
//   canView    = inventory.view
//   canTransfer = inventory.transfer  (submit / approve / prepare / dispatch
//                  / receive / verify / complete / hold / release / cancel)
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
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeftRight, Plus, Send, CheckCircle2, X, Truck, Eye, AlertTriangle,
  FileDown, Filter, Ban, Pause, Play, Printer, ClipboardCheck,
  Clock, Layers, Wallet, Package, Building2, MoreVertical, ThumbsUp,
  ThumbsDown, PackageCheck, ShieldCheck, CheckCheck, Boxes, ClipboardList,
  MapPin, ArrowRight, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, formatDate, formatRelative,
  formatCurrency, safeJson, PageHeader, ClearableSearch, usePagination,
  Pagination, MiniStatCard, ModuleHelp,
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
  { value: "preparing", label: "Preparing" },
  { value: "ready_for_dispatch", label: "Ready for Dispatch" },
  { value: "dispatched", label: "Dispatched" },
  { value: "in_transit", label: "In Transit" },
  { value: "partially_received", label: "Partially Received" },
  { value: "received", label: "Received" },
  { value: "verified", label: "Verified" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "on_hold", label: "On Hold" },
  { value: "rejected", label: "Rejected" },
  { value: "discrepancy", label: "Discrepancy" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
  { value: "emergency", label: "Emergency" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "internal", label: "Internal" },
  { value: "department", label: "Department" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "facility", label: "Facility" },
  { value: "central_warehouse", label: "Central Warehouse" },
  { value: "emergency", label: "Emergency" },
  { value: "return", label: "Return" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  preparing: "Preparing",
  ready_for_dispatch: "Ready for Dispatch",
  dispatched: "Dispatched",
  in_transit: "In Transit",
  partially_received: "Partially Received",
  received: "Received",
  verified: "Verified",
  completed: "Completed",
  cancelled: "Cancelled",
  on_hold: "On Hold",
  discrepancy: "Discrepancy",
};

// Color classes per spec
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  pending_approval: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  preparing: "bg-violet-100 text-violet-700 border-violet-200",
  ready_for_dispatch: "bg-violet-100 text-violet-700 border-violet-200",
  dispatched: "bg-cyan-100 text-cyan-700 border-cyan-200",
  in_transit: "bg-teal-100 text-teal-700 border-teal-200",
  partially_received: "bg-amber-100 text-amber-700 border-amber-200",
  received: "bg-emerald-100 text-emerald-700 border-emerald-200",
  verified: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-slate-100 text-slate-600 border-slate-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  on_hold: "bg-orange-100 text-orange-700 border-orange-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  discrepancy: "bg-rose-100 text-rose-700 border-rose-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 border-slate-200",
  normal: "bg-blue-100 text-blue-700 border-blue-200",
  high: "bg-amber-100 text-amber-700 border-amber-200",
  urgent: "bg-orange-100 text-orange-700 border-orange-200",
  emergency: "bg-rose-100 text-rose-700 border-rose-200",
};

const TYPE_LABELS: Record<string, string> = {
  internal: "Internal",
  department: "Department",
  pharmacy: "Pharmacy",
  facility: "Facility",
  central_warehouse: "Central Warehouse",
  emergency: "Emergency",
  return: "Return",
};

const TYPE_COLORS: Record<string, string> = {
  internal: "bg-blue-100 text-blue-700 border-blue-200",
  department: "bg-cyan-100 text-cyan-700 border-cyan-200",
  pharmacy: "bg-violet-100 text-violet-700 border-violet-200",
  facility: "bg-teal-100 text-teal-700 border-teal-200",
  central_warehouse: "bg-indigo-100 text-indigo-700 border-indigo-200",
  emergency: "bg-rose-100 text-rose-700 border-rose-200",
  return: "bg-amber-100 text-amber-700 border-amber-200",
};

function STStatusBadge({ status }: { status: string }) {
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

function TypeBadge({ type }: { type: string }) {
  const t = type || "internal";
  const cls = TYPE_COLORS[t] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {TYPE_LABELS[t] || t.replace(/_/g, " ")}
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
export function StockTransfersView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canView = can("inventory.view");
  const canTransfer = can("inventory.transfer");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [direction, setDirection] = useState("both");

  // Dialogs
  const [showNew, setShowNew] = useState(false);
  const [viewTr, setViewTr] = useState<any | null>(null);
  const [receiveTr, setReceiveTr] = useState<any | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["stock-transfers"] });
    qc.invalidateQueries({ queryKey: ["stock-transfer-stats"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Transfers"
        description="Move inventory between facilities and departments through a controlled 15-state lifecycle."
        icon={ArrowLeftRight}
        gradient="from-violet-500 to-purple-600"
        actions={
          <>
            <Button
              onClick={() => setShowNew(true)}
              disabled={!canTransfer}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" /> New Transfer
            </Button>
            <ModuleHelp
              title="Stock Transfers Module"
              buttonLabel="Help"
              sections={[
                {
                  title: "Transfer Lifecycle",
                  content:
                    "A stock transfer moves through these statuses: Draft → Pending Approval → Approved → Preparing → Ready for Dispatch → Dispatched → (In Transit) → Partially Received | Received → Verified → Completed. A transfer can be Rejected (from pending approval), put On Hold at any active stage (then Released), Cancelled (requires a reason), or flagged with a Discrepancy during receiving.",
                },
                {
                  title: "Types & Priority",
                  content:
                    "Transfer types: Internal (same facility, different store), Department (cross-department), Pharmacy, Facility (cross-facility), Central Warehouse, Emergency, and Return. Priority levels — Low, Normal, High, Urgent, Emergency — drive sorting and overdue flagging. An Expected Delivery Date past today on an active transfer is automatically flagged Overdue.",
                },
                {
                  title: "Preparation & Dispatch",
                  content:
                    "Once approved, the source store prepares the items (Prepared Quantity per line is captured). When ready, the transfer is Dispatched — this is a TRANSACTIONAL step: an InventoryTransaction(transfer_out) is recorded for each line, and the source FacilityInventory is decremented. Dispatch info (carrier, tracking #, notes) is captured here.",
                },
                {
                  title: "Receiving & Verification",
                  content:
                    "On arrival, the destination store receives the transfer — also TRANSACTIONAL: an InventoryTransaction(transfer_in) is created per line and the destination FacilityInventory is incremented. Per line, capture Received, Rejected and Damaged quantities. If any line is short, the transfer becomes Partially Received; once all lines are complete it becomes Received. A Verifier then confirms (Verified → Completed).",
                },
                {
                  title: "Discrepancies",
                  content:
                    "Discrepancies arise when received + rejected + damaged < dispatched for any line. The Discrepancy status highlights transfers needing investigation. Use the Discrepancy Report (Reports tab) to see all such transfers at a glance, then resolve via the Receive dialog (top-up the received quantities) or Cancel with a reason.",
                },
                {
                  title: "Reports",
                  content:
                    "Five standard reports are available: Transfer Register (all transfers in a date range), Overdue Transfers, By Facility (source/destination rollups), By Item (most-transferred items), and Discrepancy Report. CSV export of the filtered list is available from the All Transfers tab.",
                },
              ]}
            />
          </>
        }
      />

      {!activeFacilityId && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
            Select a facility to view stock transfers.
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" /> All Transfers
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <Boxes className="w-3.5 h-3.5" /> Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab
            activeFacilityId={activeFacilityId}
            direction={direction}
            setDirection={setDirection}
            canView={canView}
            onOpenTr={(t) => setViewTr(t)}
          />
        </TabsContent>

        <TabsContent value="list">
          <ListTab
            activeFacilityId={activeFacilityId}
            direction={direction}
            setDirection={setDirection}
            canView={canView}
            canTransfer={canTransfer}
            onView={(t) => setViewTr(t)}
            onReceive={(t) => setReceiveTr(t)}
            invalidate={invalidate}
          />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsTab
            activeFacilityId={activeFacilityId}
            direction={direction}
            canView={canView}
            onView={(t) => setViewTr(t)}
          />
        </TabsContent>
      </Tabs>

      <NewTransferDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => {
          setShowNew(false);
          invalidate();
        }}
        defaultFromFacilityId={activeFacilityId || undefined}
      />

      {viewTr && (
        <ViewTransferDialog
          transfer={viewTr}
          canTransfer={canTransfer}
          onClose={() => setViewTr(null)}
          onReceive={(t) => {
            setViewTr(null);
            setReceiveTr(t);
          }}
          invalidate={invalidate}
        />
      )}

      {receiveTr && (
        <ReceiveDialog
          transfer={receiveTr}
          onClose={() => setReceiveTr(null)}
          onDone={() => {
            setReceiveTr(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// TAB 1 — DASHBOARD
// =====================================================================
function DashboardTab({
  activeFacilityId, direction, setDirection, canView, onOpenTr,
}: {
  activeFacilityId: string | null;
  direction: string;
  setDirection: (d: string) => void;
  canView: boolean;
  onOpenTr: (t: any) => void;
}) {
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (activeFacilityId) p.set("facilityId", activeFacilityId);
    if (direction) p.set("direction", direction);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [activeFacilityId, direction]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["stock-transfer-stats", qs],
    queryFn: () => fetchJson(`/api/stock-transfers/stats${qs}`),
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
  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load transfer stats" onRetry={() => refetch()} />;

  const t = data?.totals || {};
  const f = data?.financial || {};
  const byType = data?.byType || [];
  const byPriority = data?.byPriority || [];
  const byFacility = data?.byFacility || [];

  return (
    <div className="space-y-4">
      {/* Direction selector */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <Label className="text-xs text-slate-500">Scope:</Label>
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger className="w-56 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Both (in / out)</SelectItem>
              <SelectItem value="from">Outgoing (from this facility)</SelectItem>
              <SelectItem value="to">Incoming (to this facility)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* 12 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <MiniStatCard label="Total Transfers" value={t.total || 0} icon={ArrowLeftRight} gradient="from-violet-500 to-purple-600" />
        <MiniStatCard label="Draft" value={t.draft || 0} icon={ClipboardList} gradient="from-slate-500 to-slate-600" />
        <MiniStatCard label="Pending Approval" value={t.pending_approval || 0} icon={Clock} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Approved" value={t.approved || 0} icon={CheckCircle2} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="Dispatched" value={t.dispatched || 0} icon={Truck} gradient="from-cyan-500 to-cyan-600" />
        <MiniStatCard label="In Transit" value={t.in_transit || 0} icon={MapPin} gradient="from-teal-500 to-teal-600" />
        <MiniStatCard label="Partially Received" value={t.partially_received || 0} icon={PackageCheck} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Completed" value={t.completed || 0} icon={CheckCheck} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Cancelled" value={t.cancelled || 0} icon={Ban} gradient="from-rose-500 to-rose-600" />
        <MiniStatCard label="On Hold" value={t.on_hold || 0} icon={Pause} gradient="from-orange-500 to-orange-600" />
        <MiniStatCard label="Overdue" value={t.overdue || 0} icon={AlertTriangle} gradient="from-red-500 to-rose-600" />
        <MiniStatCard label="Total Value" value={formatCurrency(f.totalValue)} icon={Wallet} gradient="from-violet-500 to-purple-600" sublabel={`${f.totalQuantity || 0} units`} />
      </div>

      {/* By type + by priority */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
              <ArrowLeftRight className="w-4 h-4" /> By Transfer Type
            </h3>
            {byType.length === 0 ? (
              <EmptyState title="No type data" description="No transfers have been created yet." />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {byType.map((b: any) => (
                  <div key={b.type} className="border rounded-lg p-3 text-center">
                    <TypeBadge type={b.type} />
                    <div className="text-2xl font-bold mt-1 text-slate-800">{b.count}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> By Priority
            </h3>
            {byPriority.length === 0 ? (
              <EmptyState title="No priority data" description="No transfers have been created yet." />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {byPriority.map((p: any) => (
                  <div key={p.priority} className="border rounded-lg p-3 text-center">
                    <PriorityBadge priority={p.priority} />
                    <div className="text-2xl font-bold mt-1 text-slate-800">{p.count}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* By facility */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
            <Building2 className="w-4 h-4" /> By Facility
          </h3>
          {byFacility.length === 0 ? (
            <EmptyState title="No facility data" description="No transfers recorded yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-700">Facility</th>
                    <th className="text-right p-2 font-semibold text-slate-700">As Source</th>
                    <th className="text-right p-2 font-semibold text-slate-700">As Destination</th>
                    <th className="text-right p-2 font-semibold text-slate-700">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {byFacility.map((f: any) => (
                    <tr key={f.id} className="border-b hover:bg-slate-50">
                      <td className="p-2 font-medium text-slate-900">{f.name}</td>
                      <td className="p-2 text-right">{f.asSource}</td>
                      <td className="p-2 text-right">{f.asDest}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(f.value)}</td>
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

// =====================================================================
// TAB 2 — ALL TRANSFERS (list + filters + actions)
// =====================================================================
function ListTab({
  activeFacilityId, direction, setDirection, canView, canTransfer, onView, onReceive, invalidate,
}: {
  activeFacilityId: string | null;
  direction: string;
  setDirection: (d: string) => void;
  canView: boolean;
  canTransfer: boolean;
  onView: (t: any) => void;
  onReceive: (t: any) => void;
  invalidate: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const listQueryStr = useMemo(() => {
    const params = new URLSearchParams();
    if (activeFacilityId) params.set("facilityId", activeFacilityId);
    if (direction) params.set("direction", direction);
    if (search) params.set("q", search);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (typeFilter && typeFilter !== "all") params.set("transferType", typeFilter);
    if (priorityFilter && priorityFilter !== "all") params.set("priority", priorityFilter);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [activeFacilityId, direction, search, statusFilter, typeFilter, priorityFilter, from, to]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["stock-transfers", listQueryStr],
    queryFn: () => fetchJson(`/api/stock-transfers${listQueryStr}`),
    enabled: !!canView && !!activeFacilityId,
  });

  const items = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } =
    usePagination(items, 15);

  const handleExport = () => {
    window.open(`/api/stock-transfers/export${listQueryStr}`, "_blank");
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setPriorityFilter("all");
    setFrom("");
    setTo("");
  };

  const doAction = async (id: string, action: string, payload: any = {}, successMsg: string) => {
    const res = await fetch(`/api/stock-transfers/${id}`, {
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
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search transfer #, item, carrier..." />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-[10px] text-slate-500">Scope</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger className="h-8 text-xs w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both (in / out)</SelectItem>
                  <SelectItem value="from">Outgoing</SelectItem>
                  <SelectItem value="to">Incoming</SelectItem>
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
        <Card><CardContent className="p-6"><EmptyState title="No facility selected" description="Select a facility to view transfers." /></CardContent></Card>
      ) : isLoading ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState message="Failed to load stock transfers" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="No stock transfers" description="Adjust filters or create a new transfer." />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Transfer #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">From → To</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Priority</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Total Qty</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Total Value</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((t: any) => (
                    <tr key={t.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs text-slate-700">
                        <button onClick={() => onView(t)} className="text-blue-700 hover:underline font-medium">
                          {t.transferNumber}
                        </button>
                        <div className="text-[10px] text-slate-500">{formatDate(t.createdAt)}</div>
                      </td>
                      <td className="p-3"><TypeBadge type={t.transferType} /></td>
                      <td className="p-3 text-xs">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{t.fromFacility?.code || t.fromFacility?.name}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className="font-medium">{t.toFacility?.code || t.toFacility?.name}</span>
                        </div>
                        {(t.fromStoreName || t.toStoreName) && (
                          <div className="text-[10px] text-slate-500">
                            {t.fromStoreName || "—"} → {t.toStoreName || "—"}
                          </div>
                        )}
                      </td>
                      <td className="p-3"><PriorityBadge priority={t.priority} /></td>
                      <td className="p-3 text-right font-mono">{Number(t.totalQuantity) || 0}</td>
                      <td className="p-3 text-right font-mono font-semibold">{formatCurrency(t.totalValue)}</td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <STStatusBadge status={t.status} />
                          {t.isOverdue && <OverdueBadge />}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <RowActions
                          transfer={t}
                          canTransfer={canTransfer}
                          onView={() => onView(t)}
                          onReceive={() => onReceive(t)}
                          doAction={doAction}
                        />
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

function RowActions({
  transfer, canTransfer, onView, onReceive, doAction,
}: {
  transfer: any;
  canTransfer: boolean;
  onView: () => void;
  onReceive: () => void;
  doAction: (id: string, action: string, payload: any, successMsg: string) => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-1 justify-end">
      <Button size="sm" variant="outline" onClick={onView} className="gap-1 h-7 text-xs">
        <Eye className="w-3 h-3" /> View
      </Button>
      {canTransfer && ["dispatched", "in_transit", "partially_received"].includes(transfer.status) && (
        <Button size="sm" onClick={onReceive} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
          <PackageCheck className="w-3 h-3" /> Receive
        </Button>
      )}
      {canTransfer && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">Lifecycle</DropdownMenuLabel>
            {transfer.status === "draft" && (
              <DropdownMenuItem onClick={() => doAction(transfer.id, "submit", {}, "Transfer submitted for approval")}>
                <Send className="w-3.5 h-3.5 mr-2" /> Submit for Approval
              </DropdownMenuItem>
            )}
            {transfer.status === "pending_approval" && (
              <>
                <DropdownMenuItem onClick={() => doAction(transfer.id, "approve", {}, "Transfer approved")}>
                  <ThumbsUp className="w-3.5 h-3.5 mr-2" /> Approve
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const reason = prompt("Rejection reason (required):");
                    if (reason && reason.trim())
                      doAction(transfer.id, "reject", { rejectionReason: reason.trim() }, "Transfer rejected");
                  }}
                  className="text-rose-600"
                >
                  <ThumbsDown className="w-3.5 h-3.5 mr-2" /> Reject…
                </DropdownMenuItem>
              </>
            )}
            {transfer.status === "approved" && (
              <DropdownMenuItem onClick={() => doAction(transfer.id, "prepare", {}, "Transfer moved to preparing")}>
                <ClipboardCheck className="w-3.5 h-3.5 mr-2" /> Prepare
              </DropdownMenuItem>
            )}
            {transfer.status === "preparing" && (
              <DropdownMenuItem onClick={() => doAction(transfer.id, "ready", {}, "Transfer marked ready for dispatch")}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Mark Ready
              </DropdownMenuItem>
            )}
            {transfer.status === "ready_for_dispatch" && (
              <DropdownMenuItem
                onClick={() => {
                  const carrier = prompt("Carrier name (optional):", "") || "";
                  const tracking = prompt("Tracking # (optional):", "") || "";
                  const notes = prompt("Dispatch notes (optional):", "") || "";
                  doAction(
                    transfer.id,
                    "dispatch",
                    { carrierName: carrier, trackingNumber: tracking, dispatchNotes: notes },
                    "Transfer dispatched"
                  );
                }}
              >
                <Truck className="w-3.5 h-3.5 mr-2" /> Dispatch…
              </DropdownMenuItem>
            )}
            {["received", "partially_received"].includes(transfer.status) && (
              <DropdownMenuItem onClick={() => doAction(transfer.id, "verify", {}, "Transfer verified")}>
                <ShieldCheck className="w-3.5 h-3.5 mr-2" /> Verify
              </DropdownMenuItem>
            )}
            {["verified", "received"].includes(transfer.status) && (
              <DropdownMenuItem onClick={() => doAction(transfer.id, "complete", {}, "Transfer completed")}>
                <CheckCheck className="w-3.5 h-3.5 mr-2" /> Complete
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {!["on_hold", "received", "verified", "completed", "cancelled", "rejected", "discrepancy"].includes(
              transfer.status
            ) && (
              <DropdownMenuItem
                onClick={() => {
                  const reason = prompt("Hold reason (required):");
                  if (reason && reason.trim())
                    doAction(transfer.id, "hold", { holdReason: reason.trim() }, "Transfer put on hold");
                }}
                className="text-orange-600"
              >
                <Pause className="w-3.5 h-3.5 mr-2" /> Put on Hold…
              </DropdownMenuItem>
            )}
            {transfer.status === "on_hold" && (
              <DropdownMenuItem onClick={() => doAction(transfer.id, "release", {}, "Transfer released from hold")}>
                <Play className="w-3.5 h-3.5 mr-2" /> Release Hold
              </DropdownMenuItem>
            )}
            {!["received", "verified", "completed", "cancelled", "rejected"].includes(transfer.status) && (
              <DropdownMenuItem
                onClick={() => {
                  const reason = prompt("Cancel reason (required):");
                  if (reason && reason.trim())
                    doAction(transfer.id, "cancel", { cancelReason: reason.trim() }, "Transfer cancelled");
                }}
                className="text-rose-600"
              >
                <Ban className="w-3.5 h-3.5 mr-2" /> Cancel…
              </DropdownMenuItem>
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
  activeFacilityId, direction, canView, onView,
}: {
  activeFacilityId: string | null;
  direction: string;
  canView: boolean;
  onView: (t: any) => void;
}) {
  const [reportType, setReportType] = useState("register");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const listQueryStr = useMemo(() => {
    const params = new URLSearchParams();
    if (activeFacilityId) params.set("facilityId", activeFacilityId);
    if (direction) params.set("direction", direction);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [activeFacilityId, direction, from, to]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["stock-transfers-reports", listQueryStr],
    queryFn: () => fetchJson(`/api/stock-transfers${listQueryStr}`),
    enabled: !!canView && !!activeFacilityId,
  });

  const all: any[] = data?.items || [];

  // 1) Transfer Register
  const register = all;

  // 2) Overdue Transfers
  const overdue = all.filter((t) => t.isOverdue);

  // 3) By Facility
  const facilityMap = new Map<
    string,
    { name: string; asSource: number; asDest: number; qty: number; value: number }
  >();
  for (const t of all) {
    if (["cancelled", "rejected"].includes(t.status)) continue;
    if (t.fromFacility) {
      const k = t.fromFacility.id || "unknown";
      const cur = facilityMap.get(k) || { name: t.fromFacility.name || "Unknown", asSource: 0, asDest: 0, qty: 0, value: 0 };
      cur.asSource++;
      cur.qty += Number(t.totalQuantity) || 0;
      cur.value += Number(t.totalValue) || 0;
      facilityMap.set(k, cur);
    }
    if (t.toFacility) {
      const k = t.toFacility.id || "unknown";
      const cur = facilityMap.get(k) || { name: t.toFacility.name || "Unknown", asSource: 0, asDest: 0, qty: 0, value: 0 };
      cur.asDest++;
      facilityMap.set(k, cur);
    }
  }
  const byFacility = Array.from(facilityMap.values()).sort((a, b) => b.asSource + b.asDest - (a.asSource + a.asDest));

  // 4) By Item
  const itemMap = new Map<string, { name: string; sku: string; unit: string; qty: number; transfers: number; value: number }>();
  for (const t of all) {
    if (["cancelled", "rejected"].includes(t.status)) continue;
    for (const it of t.items || []) {
      const inv = it.inventoryItem;
      const key = it.inventoryItemId || inv?.id || it.id;
      const cur = itemMap.get(key) || {
        name: inv?.name || "Unknown",
        sku: inv?.sku || "—",
        unit: inv?.unit || "",
        qty: 0,
        transfers: 0,
        value: 0,
      };
      cur.qty += Number(it.requestedQuantity) || 0;
      cur.transfers++;
      cur.value += Number(it.totalValue) || Number(it.unitCost) * Number(it.requestedQuantity) || 0;
      itemMap.set(key, cur);
    }
  }
  const byItem = Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 50);

  // 5) Discrepancy Report
  const discrepancy = all.filter((t) => {
    const items = t.items || [];
    return items.some((it: any) => {
      const dispatched = Number(it.dispatchedQuantity) || 0;
      const received = Number(it.receivedQuantity) || 0;
      const rejected = Number(it.rejectedQuantity) || 0;
      const damaged = Number(it.damagedQuantity) || 0;
      return dispatched > 0 && received + rejected + damaged < dispatched;
    });
  });

  if (!activeFacilityId) {
    return <Card><CardContent className="p-6"><EmptyState title="No facility selected" description="Select a facility to view reports." /></CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-[10px] text-slate-500">Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="register">Transfer Register</SelectItem>
                  <SelectItem value="overdue">Overdue Transfers</SelectItem>
                  <SelectItem value="facility">By Facility</SelectItem>
                  <SelectItem value="item">By Item</SelectItem>
                  <SelectItem value="discrepancy">Discrepancy Report</SelectItem>
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
          {reportType === "register" && (
            <ReportCard title="Transfer Register" description="All stock transfers in the selected date range.">
              {register.length === 0 ? (
                <EmptyState title="No transfers" description="No stock transfers match the selected filters." />
              ) : (
                <ReportTable
                  headers={["Transfer #", "Type", "Route", "Priority", "Status", "Qty", "Value"]}
                  rows={register.map((t) => [
                    <button key="n" onClick={() => onView(t)} className="text-blue-700 hover:underline font-mono text-xs">{t.transferNumber}</button>,
                    <TypeBadge key="t" type={t.transferType} />,
                    <span key="r" className="text-xs">{t.fromFacility?.name} → {t.toFacility?.name}</span>,
                    <PriorityBadge key="p" priority={t.priority} />,
                    <STStatusBadge key="s" status={t.status} />,
                    Number(t.totalQuantity) || 0,
                    <span key="v" className="font-mono">{formatCurrency(t.totalValue)}</span>,
                  ])}
                />
              )}
            </ReportCard>
          )}

          {reportType === "overdue" && (
            <ReportCard title="Overdue Transfers" description="Active transfers whose expected delivery date has passed.">
              {overdue.length === 0 ? (
                <EmptyState title="No overdue transfers" description="All active transfers are within their expected delivery window." icon={CheckCircle2} />
              ) : (
                <ReportTable
                  headers={["Transfer #", "Route", "Expected", "Days Overdue", "Priority", "Status", "Value"]}
                  rows={overdue.map((t) => {
                    const days = Math.ceil((Date.now() - new Date(t.expectedDeliveryDate).getTime()) / (1000 * 60 * 60 * 24));
                    return [
                      <button key="n" onClick={() => onView(t)} className="text-blue-700 hover:underline font-mono text-xs">{t.transferNumber}</button>,
                      <span key="r" className="text-xs">{t.fromFacility?.name} → {t.toFacility?.name}</span>,
                      formatDate(t.expectedDeliveryDate),
                      <Badge key="d" variant="destructive">{days}d</Badge>,
                      <PriorityBadge key="p" priority={t.priority} />,
                      <STStatusBadge key="s" status={t.status} />,
                      <span key="v" className="font-mono">{formatCurrency(t.totalValue)}</span>,
                    ];
                  })}
                />
              )}
            </ReportCard>
          )}

          {reportType === "facility" && (
            <ReportCard title="Transfers by Facility" description="Aggregated source/destination activity per facility.">
              {byFacility.length === 0 ? (
                <EmptyState title="No facility data" description="No non-cancelled transfers in the selected range." />
              ) : (
                <ReportTable
                  headers={["Facility", "As Source", "As Destination", "Total Qty", "Total Value"]}
                  rows={byFacility.map((f) => [
                    f.name,
                    f.asSource,
                    f.asDest,
                    f.qty,
                    <span key="v" className="font-mono">{formatCurrency(f.value)}</span>,
                  ])}
                />
              )}
            </ReportCard>
          )}

          {reportType === "item" && (
            <ReportCard title="Transfers by Item" description="Most-transferred items across all transfers.">
              {byItem.length === 0 ? (
                <EmptyState title="No item data" description="No items have been transferred in the selected range." />
              ) : (
                <ReportTable
                  headers={["Item", "SKU", "Unit", "Transfers", "Total Qty", "Total Value"]}
                  rows={byItem.map((it) => [
                    it.name,
                    <span key="s" className="font-mono text-xs">{it.sku}</span>,
                    it.unit || "—",
                    it.transfers,
                    it.qty,
                    <span key="v" className="font-mono">{formatCurrency(it.value)}</span>,
                  ])}
                />
              )}
            </ReportCard>
          )}

          {reportType === "discrepancy" && (
            <ReportCard title="Discrepancy Report" description="Transfers where received + rejected + damaged < dispatched for any line.">
              {discrepancy.length === 0 ? (
                <EmptyState title="No discrepancies" description="All received transfers are fully accounted for." icon={CheckCircle2} />
              ) : (
                <ReportTable
                  headers={["Transfer #", "Route", "Status", "Discrepancy (units)"]}
                  rows={discrepancy.map((t) => {
                    const disc = (t.items || []).reduce((s: number, it: any) => {
                      const d = Number(it.dispatchedQuantity) || 0;
                      const r = Number(it.receivedQuantity) + Number(it.rejectedQuantity) + Number(it.damagedQuantity) || 0;
                      return s + Math.max(0, d - r);
                    }, 0);
                    return [
                      <button key="n" onClick={() => onView(t)} className="text-blue-700 hover:underline font-mono text-xs">{t.transferNumber}</button>,
                      <span key="r" className="text-xs">{t.fromFacility?.name} → {t.toFacility?.name}</span>,
                      <STStatusBadge key="s" status={t.status} />,
                      <Badge key="d" variant="destructive">{disc} units</Badge>,
                    ];
                  })}
                />
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
              <th key={i} className="text-left p-2 font-semibold text-slate-700">{h}</th>
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
// NEW TRANSFER DIALOG
// =====================================================================
function NewTransferDialog({
  open, onClose, onCreated, defaultFromFacilityId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultFromFacilityId?: string;
}) {
  const [transferType, setTransferType] = useState("internal");
  const [fromFacilityId, setFromFacilityId] = useState(defaultFromFacilityId || "");
  const [toFacilityId, setToFacilityId] = useState("");
  const [fromDepartmentId, setFromDepartmentId] = useState("");
  const [toDepartmentId, setToDepartmentId] = useState("");
  const [fromStoreName, setFromStoreName] = useState("");
  const [toStoreName, setToStoreName] = useState("");
  const [priority, setPriority] = useState("normal");
  const [reason, setReason] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");

  const [facilities, setFacilities] = useState<any[]>([]);
  const [fromDepartments, setFromDepartments] = useState<any[]>([]);
  const [toDepartments, setToDepartments] = useState<any[]>([]);
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

  useEffect(() => {
    fetchJson("/api/facilities").then((d) => setFacilities(d.facilities || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!fromFacilityId) { setFromDepartments([]); return; }
    fetchJson(`/api/departments?facilityId=${fromFacilityId}`).then((d) => setFromDepartments(d.items || [])).catch(() => setFromDepartments([]));
  }, [fromFacilityId]);

  useEffect(() => {
    if (!toFacilityId) { setToDepartments([]); return; }
    fetchJson(`/api/departments?facilityId=${toFacilityId}`).then((d) => setToDepartments(d.items || [])).catch(() => setToDepartments([]));
  }, [toFacilityId]);

  useEffect(() => {
    if (!fromFacilityId) return;
    const q = new URLSearchParams();
    q.set("facilityId", fromFacilityId);
    if (invQuery) q.set("q", invQuery);
    fetchJson(`/api/inventory?${q.toString()}`).then((d) => setInventory(d.items || [])).catch(() => setInventory([]));
  }, [fromFacilityId, invQuery]);

  // Live total calculation
  const calc = useMemo(() => {
    let totalQuantity = 0;
    let totalValue = 0;
    for (const it of items) {
      const qty = Number(it.requestedQuantity) || 0;
      const cost = Number(it.unitCost) || 0;
      totalQuantity += qty;
      totalValue += qty * cost;
    }
    return { totalQuantity, totalValue: +totalValue.toFixed(2) };
  }, [items]);

  const addItem = (inv: any) => {
    if (items.find((i) => i.inventoryItemId === inv.id)) return;
    setItems([
      ...items,
      {
        inventoryItemId: inv.id,
        name: inv.name,
        sku: inv.sku,
        unit: inv.unit,
        category: inv.category,
        available: inv.currentQuantity,
        batches: inv.batches || [],
        batchId: "",
        requestedQuantity: 1,
        unitCost: inv.lastCostPrice || 0,
      },
    ]);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!fromFacilityId) return toast.error("Select source facility");
    if (!toFacilityId) return toast.error("Select destination facility");
    if (fromFacilityId === toFacilityId) return toast.error("Source and destination must differ");
    if (items.length === 0) return toast.error("Add at least one item");

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!Number(it.requestedQuantity) || Number(it.requestedQuantity) <= 0) {
        return toast.error(`Line ${i + 1}: quantity must be > 0`);
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/stock-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transferType,
          fromFacilityId,
          toFacilityId,
          fromDepartmentId: fromDepartmentId || undefined,
          toDepartmentId: toDepartmentId || undefined,
          fromStoreName: fromStoreName || undefined,
          toStoreName: toStoreName || undefined,
          priority,
          reason: reason || undefined,
          expectedDeliveryDate: expectedDeliveryDate || undefined,
          notes,
          items: items.map((it) => ({
            inventoryItemId: it.inventoryItemId,
            batchId: it.batchId || undefined,
            requestedQuantity: Number(it.requestedQuantity),
            unitCost: Number(it.unitCost) || 0,
            unit: it.unit || undefined,
            category: it.category || undefined,
          })),
        }),
      });
      const rdata = await safeJson(res);
      if (!res.ok) throw new Error(rdata.error || "Failed");
      toast.success("Stock transfer created (draft)");
      // Reset
      setToFacilityId(""); setFromDepartmentId(""); setToDepartmentId("");
      setFromStoreName(""); setToStoreName(""); setPriority("normal");
      setReason(""); setExpectedDeliveryDate(""); setNotes(""); setItems([]);
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <ArrowLeftRight className="w-4 h-4" /> New Stock Transfer
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Move inventory between facilities/departments. Starts as Draft — submit for approval when ready.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {/* Header fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <FieldLabel required>Transfer Type</FieldLabel>
              <Select value={transferType} onValueChange={setTransferType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="pharmacy">Pharmacy</SelectItem>
                  <SelectItem value="facility">Facility</SelectItem>
                  <SelectItem value="central_warehouse">Central Warehouse</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="return">Return</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
          </div>

          {/* From / To */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="bg-slate-50/60">
              <CardContent className="p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-700 uppercase">From (Source)</div>
                <div>
                  <FieldLabel required>Facility</FieldLabel>
                  <Select value={fromFacilityId || undefined} onValueChange={setFromFacilityId}>
                    <SelectTrigger><SelectValue placeholder="Select source facility" /></SelectTrigger>
                    <SelectContent>
                      {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Department</FieldLabel>
                  <Select value={fromDepartmentId || "none"} onValueChange={(v) => setFromDepartmentId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {fromDepartments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Store Name</FieldLabel>
                  <Input value={fromStoreName} onChange={(e) => setFromStoreName(e.target.value)} placeholder="e.g. Main Store" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-50/60">
              <CardContent className="p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-700 uppercase">To (Destination)</div>
                <div>
                  <FieldLabel required>Facility</FieldLabel>
                  <Select value={toFacilityId || undefined} onValueChange={setToFacilityId}>
                    <SelectTrigger><SelectValue placeholder="Select destination facility" /></SelectTrigger>
                    <SelectContent>
                      {facilities.filter((f) => f.id !== fromFacilityId).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Department</FieldLabel>
                  <Select value={toDepartmentId || "none"} onValueChange={(v) => setToDepartmentId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {toDepartments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Store Name</FieldLabel>
                  <Input value={toStoreName} onChange={(e) => setToStoreName(e.target.value)} placeholder="e.g. Pharmacy Store" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <FieldLabel>Reason</FieldLabel>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this transfer being made?" rows={3} />
          </div>

          {/* Item picker */}
          {fromFacilityId && (
            <div className="border rounded p-3 bg-white">
              <div className="flex items-center justify-between mb-2">
                <FieldLabel>Add items (from source facility stock)</FieldLabel>
                <ClearableSearch value={invQuery} onChange={setInvQuery} placeholder="Search items..." className="w-64" inputClassName="h-8 text-xs" />
              </div>
              {inventory.length === 0 ? (
                <div className="text-xs text-slate-500">No inventory items at source facility.</div>
              ) : (
                <div className="border rounded max-h-44 overflow-y-auto">
                  {inventory.slice(0, 30).map((inv) => (
                    <button
                      key={inv.id}
                      onClick={() => addItem(inv)}
                      disabled={!!items.find((i) => i.inventoryItemId === inv.id)}
                      className="w-full text-left p-2 hover:bg-violet-50 border-b last:border-b-0 disabled:opacity-40"
                    >
                      <div className="text-sm font-medium">{inv.name} <span className="text-xs text-slate-500">({inv.sku})</span></div>
                      <div className="text-[10px] text-slate-500">In stock: {inv.currentQuantity} {inv.unit || ""}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Line items */}
          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((it, idx) => (
                <Card key={idx}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{it.name}</div>
                        <div className="text-xs text-slate-500">{it.sku} · Available: {it.available} {it.unit || ""}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="text-rose-600 h-7">
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <div>
                        <FieldLabel>Batch (optional)</FieldLabel>
                        <Select value={it.batchId || "none"} onValueChange={(v) => updateItem(idx, "batchId", v === "none" ? "" : v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Any —</SelectItem>
                            {(it.batches || []).map((b: any) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.batchNumber} · {b.quantity} units{b.expiryDate ? ` · exp ${formatDate(b.expiryDate)}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <FieldLabel required>Quantity</FieldLabel>
                        <Input type="number" min={1} value={it.requestedQuantity} onChange={(e) => updateItem(idx, "requestedQuantity", e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <FieldLabel>Unit Cost (GHS)</FieldLabel>
                        <Input type="number" step="0.01" min={0} value={it.unitCost} onChange={(e) => updateItem(idx, "unitCost", e.target.value)} className="h-8 text-xs" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <div ref={itemsEndRef} />
            </div>
          )}

          {/* Live totals */}
          {items.length > 0 && (
            <div className="flex justify-end gap-4 text-sm border-t pt-2">
              <span className="text-slate-500">Total Qty: <span className="font-bold text-slate-900">{calc.totalQuantity}</span></span>
              <span className="text-slate-500">Total Value: <span className="font-bold text-slate-900">{formatCurrency(calc.totalValue)}</span></span>
            </div>
          )}

          <div>
            <FieldLabel>Notes</FieldLabel>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-violet-600 hover:bg-violet-700">
            {submitting ? "Creating..." : "Create Draft Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// VIEW TRANSFER DIALOG — header + quantity summary + inner tabs +
//   action buttons (12 lifecycle actions + Print)
// =====================================================================
function ViewTransferDialog({
  transfer, canTransfer, onClose, onReceive, invalidate,
}: {
  transfer: any;
  canTransfer: boolean;
  onClose: () => void;
  onReceive: (t: any) => void;
  invalidate: () => void;
}) {
  const [data, setData] = useState<any>(transfer);
  const [innerTab, setInnerTab] = useState("overview");

  useEffect(() => {
    fetchJson(`/api/stock-transfers/${transfer.id}`).then((d) => setData(d.item)).catch(() => {});
  }, [transfer.id]);

  const reload = () => {
    fetchJson(`/api/stock-transfers/${transfer.id}`).then((d) => setData(d.item)).catch(() => {});
    invalidate();
  };

  const doAction = async (action: string, payload: any = {}, successMsg: string) => {
    const res = await fetch(`/api/stock-transfers/${transfer.id}`, {
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

  const handlePrint = () => window.print();

  const m = data?.metrics || {
    totalRequestedQty: 0,
    totalApprovedQty: 0,
    totalPreparedQty: 0,
    totalDispatchedQty: 0,
    totalReceivedQty: 0,
    totalRejectedQty: 0,
    totalDamagedQty: 0,
    totalOutstandingQty: 0,
    receivedPct: 0,
    lineCount: 0,
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <DialogTitle className="text-white flex items-center gap-2 text-xl">
                <ArrowLeftRight className="w-5 h-5" />
                <span className="font-mono">{data?.transferNumber}</span>
              </DialogTitle>
              <DialogDescription className="text-white/80 flex items-center gap-2 flex-wrap mt-1">
                <span>{data?.fromFacility?.name}</span>
                <ArrowRight className="w-3 h-3" />
                <span>{data?.toFacility?.name}</span>
                {data?.fromStoreName && <span className="text-slate-400">({data.fromStoreName} → {data.toStoreName || "—"})</span>}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <STStatusBadge status={data?.status} />
              <TypeBadge type={data?.transferType} />
              <PriorityBadge priority={data?.priority} />
              {data?.isOverdue && <OverdueBadge />}
            </div>
          </div>
        </DialogHeader>

        {/* Quantity summary */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <SummaryTile label="Requested" value={m.totalRequestedQty} />
          <SummaryTile label="Approved" value={m.totalApprovedQty} color="blue" />
          <SummaryTile label="Dispatched" value={m.totalDispatchedQty} color="cyan" />
          <SummaryTile label="Received" value={m.totalReceivedQty} color="emerald" sub={`${m.receivedPct}%`} />
          <SummaryTile label="Rejected" value={m.totalRejectedQty} color="rose" />
          <SummaryTile label="Damaged" value={m.totalDamagedQty} color="orange" />
          <SummaryTile label="Outstanding" value={m.totalOutstandingQty} color="amber" />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 border-y py-2">
          {canTransfer && data?.status === "draft" && (
            <Button size="sm" onClick={() => doAction("submit", {}, "Transfer submitted")} className="gap-1.5 h-8 bg-amber-600 hover:bg-amber-700">
              <Send className="w-3.5 h-3.5" /> Submit
            </Button>
          )}
          {canTransfer && data?.status === "pending_approval" && (
            <>
              <Button size="sm" onClick={() => doAction("approve", {}, "Transfer approved")} className="gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-700">
                <ThumbsUp className="w-3.5 h-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                const reason = prompt("Rejection reason (required):");
                if (reason && reason.trim()) doAction("reject", { rejectionReason: reason.trim() }, "Transfer rejected");
              }} className="gap-1.5 h-8 text-rose-700 border-rose-300">
                <ThumbsDown className="w-3.5 h-3.5" /> Reject
              </Button>
            </>
          )}
          {canTransfer && data?.status === "approved" && (
            <Button size="sm" onClick={() => doAction("prepare", {}, "Transfer moved to preparing")} className="gap-1.5 h-8 bg-violet-600 hover:bg-violet-700">
              <ClipboardCheck className="w-3.5 h-3.5" /> Prepare
            </Button>
          )}
          {canTransfer && data?.status === "preparing" && (
            <Button size="sm" onClick={() => doAction("ready", {}, "Transfer ready for dispatch")} className="gap-1.5 h-8 bg-violet-600 hover:bg-violet-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark Ready
            </Button>
          )}
          {canTransfer && data?.status === "ready_for_dispatch" && (
            <Button size="sm" onClick={() => {
              const carrier = prompt("Carrier name (optional):", "") || "";
              const tracking = prompt("Tracking # (optional):", "") || "";
              const notes = prompt("Dispatch notes (optional):", "") || "";
              doAction("dispatch", { carrierName: carrier, trackingNumber: tracking, dispatchNotes: notes }, "Transfer dispatched");
            }} className="gap-1.5 h-8 bg-cyan-600 hover:bg-cyan-700">
              <Truck className="w-3.5 h-3.5" /> Dispatch
            </Button>
          )}
          {canTransfer && ["dispatched", "in_transit", "partially_received"].includes(data?.status) && (
            <Button size="sm" onClick={() => onReceive(data)} className="gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-700">
              <PackageCheck className="w-3.5 h-3.5" /> Receive
            </Button>
          )}
          {canTransfer && ["received", "partially_received"].includes(data?.status) && (
            <Button size="sm" onClick={() => doAction("verify", {}, "Transfer verified")} className="gap-1.5 h-8 bg-emerald-700 hover:bg-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5" /> Verify
            </Button>
          )}
          {canTransfer && ["verified", "received"].includes(data?.status) && (
            <Button size="sm" onClick={() => doAction("complete", {}, "Transfer completed")} className="gap-1.5 h-8 bg-slate-700 hover:bg-slate-800">
              <CheckCheck className="w-3.5 h-3.5" /> Complete
            </Button>
          )}
          {canTransfer && !["on_hold", "received", "verified", "completed", "cancelled", "rejected", "discrepancy"].includes(data?.status) && (
            <Button size="sm" variant="outline" onClick={() => {
              const reason = prompt("Hold reason (required):");
              if (reason && reason.trim()) doAction("hold", { holdReason: reason.trim() }, "Transfer put on hold");
            }} className="gap-1.5 h-8 text-orange-700 border-orange-300">
              <Pause className="w-3.5 h-3.5" /> Hold
            </Button>
          )}
          {canTransfer && data?.status === "on_hold" && (
            <Button size="sm" variant="outline" onClick={() => doAction("release", {}, "Transfer released")} className="gap-1.5 h-8">
              <Play className="w-3.5 h-3.5" /> Release
            </Button>
          )}
          {canTransfer && !["received", "verified", "completed", "cancelled", "rejected"].includes(data?.status) && (
            <Button size="sm" variant="outline" onClick={() => {
              const reason = prompt("Cancel reason (required):");
              if (reason && reason.trim()) doAction("cancel", { cancelReason: reason.trim() }, "Transfer cancelled");
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
            <TabsTrigger value="audit" className="text-xs">Audit Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <Card>
                <CardContent className="p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-700 uppercase mb-1">Route</div>
                  <Row label="From Facility" value={data?.fromFacility?.name || "—"} />
                  <Row label="To Facility" value={data?.toFacility?.name || "—"} />
                  <Row label="From Department" value={data?.fromDepartmentId || "—"} />
                  <Row label="To Department" value={data?.toDepartmentId || "—"} />
                  <Row label="From Store" value={data?.fromStoreName || "—"} />
                  <Row label="To Store" value={data?.toStoreName || "—"} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-700 uppercase mb-1">Pricing</div>
                  <Row label="Total Quantity" value={Number(data?.totalQuantity) || 0} />
                  <Row label="Total Value" value={formatCurrency(data?.totalValue)} bold />
                  <Row label="Transfer Type" value={<TypeBadge type={data?.transferType} />} />
                  <Row label="Priority" value={<PriorityBadge priority={data?.priority} />} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-700 uppercase mb-1">Delivery</div>
                  <Row label="Expected Delivery" value={data?.expectedDeliveryDate ? formatDate(data.expectedDeliveryDate) : "—"} />
                  <Row label="Actual Delivery" value={data?.actualDeliveryDate ? formatDate(data.actualDeliveryDate) : "—"} />
                  <Row label="Reason" value={data?.reason || "—"} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-700 uppercase mb-1">Dispatch Info</div>
                  <Row label="Carrier" value={data?.carrierName || "—"} />
                  <Row label="Tracking #" value={data?.trackingNumber || "—"} />
                  <Row label="Dispatch Notes" value={data?.dispatchNotes && !data.dispatchNotes.startsWith("__previous_status__") ? data.dispatchNotes : "—"} />
                </CardContent>
              </Card>
            </div>
            {(data?.notes || data?.rejectionReason || data?.holdReason || data?.cancelReason) && (
              <Card>
                <CardContent className="p-3 space-y-2 text-sm">
                  <div className="text-xs font-semibold text-slate-700 uppercase">Notes & Reasons</div>
                  {data?.notes && <div><span className="text-slate-500 text-xs">Notes:</span> <span className="text-slate-700">{data.notes}</span></div>}
                  {data?.rejectionReason && <div><span className="text-rose-600 text-xs font-semibold">Rejection Reason:</span> <span className="text-slate-700">{data.rejectionReason}</span></div>}
                  {data?.holdReason && <div><span className="text-orange-600 text-xs font-semibold">Hold Reason:</span> <span className="text-slate-700">{data.holdReason}</span></div>}
                  {data?.cancelReason && <div><span className="text-rose-600 text-xs font-semibold">Cancel Reason:</span> <span className="text-slate-700">{data.cancelReason}</span></div>}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="items">
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-xs">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-2">Item</th>
                    <th className="text-right p-2">Req</th>
                    <th className="text-right p-2">Appr</th>
                    <th className="text-right p-2">Prep</th>
                    <th className="text-right p-2">Disp</th>
                    <th className="text-right p-2">Recv</th>
                    <th className="text-right p-2">Rej</th>
                    <th className="text-right p-2">Dmg</th>
                    <th className="text-right p-2">Outst</th>
                    <th className="text-right p-2">Unit Cost</th>
                    <th className="text-right p-2">Line Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.items || []).map((it: any) => {
                    const outstanding = Math.max(
                      0,
                      Number(it.dispatchedQuantity || 0) - Number(it.receivedQuantity || 0) - Number(it.rejectedQuantity || 0) - Number(it.damagedQuantity || 0)
                    );
                    return (
                      <tr key={it.id} className="border-b hover:bg-slate-50">
                        <td className="p-2">
                          <div className="font-medium">{it.inventoryItem?.name || "—"}</div>
                          <div className="text-[10px] text-slate-500">
                            {it.inventoryItem?.sku || "—"}
                            {it.inventoryItem?.unit && ` · ${it.inventoryItem.unit}`}
                            {it.batchId && ` · batch: ${it.batchId.slice(-6)}`}
                          </div>
                        </td>
                        <td className="p-2 text-right">{it.requestedQuantity || 0}</td>
                        <td className="p-2 text-right text-blue-700">{it.approvedQuantity || 0}</td>
                        <td className="p-2 text-right text-violet-700">{it.preparedQuantity || 0}</td>
                        <td className="p-2 text-right text-cyan-700">{it.dispatchedQuantity || 0}</td>
                        <td className="p-2 text-right text-emerald-700">{it.receivedQuantity || 0}</td>
                        <td className="p-2 text-right text-rose-700">{it.rejectedQuantity || 0}</td>
                        <td className="p-2 text-right text-orange-700">{it.damagedQuantity || 0}</td>
                        <td className="p-2 text-right text-amber-700 font-semibold">{outstanding}</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(it.unitCost)}</td>
                        <td className="p-2 text-right font-mono font-semibold">{formatCurrency(it.totalValue)}</td>
                      </tr>
                    );
                  })}
                  {(data?.items || []).length === 0 && (
                    <tr><td colSpan={11} className="p-4 text-center text-slate-500">No line items</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="audit">
            <AuditTimeline transfer={data} />
          </TabsContent>
        </Tabs>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({
  label, value, color = "slate", sub,
}: {
  label: string;
  value: number | string;
  color?: "slate" | "blue" | "cyan" | "emerald" | "rose" | "orange" | "amber";
  sub?: string;
}) {
  const colorMap: Record<string, string> = {
    slate: "bg-slate-50 text-slate-800",
    blue: "bg-blue-50 text-blue-700",
    cyan: "bg-cyan-50 text-cyan-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    orange: "bg-orange-50 text-orange-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className={`border rounded p-2 text-center ${colorMap[color]}`}>
      <div className="text-[10px] uppercase font-semibold opacity-80">{label}</div>
      <div className="font-bold text-lg">{value}</div>
      {sub && <div className="text-[10px] opacity-70">{sub}</div>}
    </div>
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

function AuditTimeline({ transfer }: { transfer: any }) {
  const events: { label: string; date?: any; user?: any; reason?: string | null }[] = [
    { label: "Transfer Created", date: transfer?.createdAt, user: transfer?.requestedBy },
    { label: "Submitted for Approval", date: transfer?.submittedAt },
    { label: "Approved", date: transfer?.approvedAt, user: transfer?.approvedBy },
    { label: "Rejected", date: transfer?.rejectedAt, user: transfer?.rejectedBy, reason: transfer?.rejectionReason },
    { label: "Preparing", date: transfer?.preparedAt, user: transfer?.preparedBy },
    { label: "Dispatched", date: transfer?.dispatchedAt, user: transfer?.dispatchedBy },
    { label: "Received", date: transfer?.receivedAt, user: transfer?.receivedBy },
    { label: "Verified", date: transfer?.verifiedAt, user: transfer?.verifiedBy },
    { label: "Completed", date: transfer?.completedAt },
    { label: "Put on Hold", date: transfer?.heldAt, user: transfer?.heldBy, reason: transfer?.holdReason },
    { label: "Cancelled", date: transfer?.cancelledAt, user: transfer?.cancelledBy, reason: transfer?.cancelReason },
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
          <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-violet-500" />
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
// RECEIVE DIALOG — per-line received/rejected/damaged quantities
//   with dispatch comparison.
// =====================================================================
function ReceiveDialog({
  transfer, onClose, onDone,
}: {
  transfer: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const [data, setData] = useState<any>(transfer);
  const [recvMap, setRecvMap] = useState<Record<string, {
    receivedQuantity: string;
    rejectedQuantity: string;
    damagedQuantity: string;
  }>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchJson(`/api/stock-transfers/${transfer.id}`).then((d) => setData(d.item)).catch(() => {});
  }, [transfer.id]);

  const setItem = (itemId: string, field: string, value: string) => {
    setRecvMap((prev) => {
      const cur = prev[itemId] || { receivedQuantity: "", rejectedQuantity: "", damagedQuantity: "" };
      return { ...prev, [itemId]: { ...cur, [field]: value } };
    });
  };

  const handleSubmit = async () => {
    const items = (data?.items || []).map((it: any) => {
      const cfg = recvMap[it.id];
      const receivedQty = Number(cfg?.receivedQuantity || 0);
      const rejectedQty = Number(cfg?.rejectedQuantity || 0);
      const damagedQty = Number(cfg?.damagedQuantity || 0);
      if (receivedQty <= 0 && rejectedQty <= 0 && damagedQty <= 0) return null;
      return {
        id: it.id,
        receivedQuantity: receivedQty,
        rejectedQuantity: rejectedQty,
        damagedQuantity: damagedQty,
      };
    }).filter(Boolean);

    if (items.length === 0) return toast.error("Enter at least one received quantity");

    setSubmitting(true);
    try {
      const res = await fetch(`/api/stock-transfers/${transfer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "receive", items }),
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
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <PackageCheck className="w-4 h-4" /> Receive Goods: {data?.transferNumber}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {data?.fromFacility?.name} → {data?.toFacility?.name}
            {data?.carrierName && ` · Carrier: ${data.carrierName}`}
            {data?.trackingNumber && ` · Tracking: ${data.trackingNumber}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {(data?.items || []).map((it: any) => {
            const cfg = recvMap[it.id] || {};
            const dispatched = Number(it.dispatchedQuantity) || Number(it.requestedQuantity) || 0;
            const alreadyReceived = Number(it.receivedQuantity) || 0;
            const alreadyRejected = Number(it.rejectedQuantity) || 0;
            const alreadyDamaged = Number(it.damagedQuantity) || 0;
            const outstanding = Math.max(0, dispatched - alreadyReceived - alreadyRejected - alreadyDamaged);
            return (
              <Card key={it.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{it.inventoryItem?.name || "—"}</div>
                      <div className="text-xs text-slate-500">
                        Dispatched: {dispatched} · Already received: {alreadyReceived} · Rejected: {alreadyRejected} · Damaged: {alreadyDamaged} · Outstanding: {outstanding}
                      </div>
                    </div>
                    {outstanding === 0 && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Fully received</Badge>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <FieldLabel required>Received Qty</FieldLabel>
                      <Input
                        type="number"
                        min={0}
                        max={outstanding}
                        value={cfg.receivedQuantity || ""}
                        onChange={(e) => setItem(it.id, "receivedQuantity", e.target.value)}
                        className="h-8 text-xs"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <FieldLabel>Rejected Qty</FieldLabel>
                      <Input
                        type="number"
                        min={0}
                        value={cfg.rejectedQuantity || ""}
                        onChange={(e) => setItem(it.id, "rejectedQuantity", e.target.value)}
                        className="h-8 text-xs"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <FieldLabel>Damaged Qty</FieldLabel>
                      <Input
                        type="number"
                        min={0}
                        value={cfg.damagedQuantity || ""}
                        onChange={(e) => setItem(it.id, "damagedQuantity", e.target.value)}
                        className="h-8 text-xs"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {(data?.items || []).length === 0 && (
            <EmptyState title="No items" description="This transfer has no line items to receive." />
          )}
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Receiving...
              </>
            ) : (
              "Receive Goods"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

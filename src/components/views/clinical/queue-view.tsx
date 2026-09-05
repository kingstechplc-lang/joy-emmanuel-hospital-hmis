"use client";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, UserCheck, Play, Check, X, ListOrdered, Clock, Activity, Pause,
  SkipForward, RotateCcw, ArrowRightLeft, Search, LayoutDashboard, Monitor,
  RefreshCw, Users, CheckCircle2, BellRing, XCircle, AlertTriangle, Timer,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, calculateAge,
  safeJson, PageHeader, MiniStatCard, formatDate, formatRelative,
} from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

// ---- helpers -----------------------------------------------------------

/** Minutes elapsed since `createdAt` (or any past date). */
function calcWaitMinutes(createdAt?: string | Date | null): number {
  if (!createdAt) return 0;
  const diff = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(diff / 60000));
}

/** Human-readable wait like "5m" or "1h 12m". */
function formatWait(minutes: number): string {
  if (minutes <= 0) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Status options shared by filter dropdown and DisplayBoard
const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "waiting", label: "Waiting" },
  { value: "called", label: "Called" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "skipped", label: "Skipped" },
  { value: "cancelled", label: "Cancelled" },
];

// =====================================================================
// MAIN VIEW
// =====================================================================
export function QueueView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showAdd, setShowAdd] = useState(false);

  if (!activeFacilityId) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-amber-700 bg-amber-50 border-amber-200">
          Please select an active facility to manage the queue.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Queue Management"
        description="Live patient queue — dashboard, management, and waiting-room display board"
        icon={ListOrdered}
        gradient="from-amber-500 to-orange-600"
        actions={
          <Button
            onClick={() => setShowAdd(true)}
            className="bg-white/20 border border-white/30 text-white hover:bg-white/30"
          >
            <Plus className="w-4 h-4 mr-1" /> Add Patient to Queue
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto gap-1 p-1 bg-slate-100 rounded-lg tabs-scroll">
          <TabsTrigger value="dashboard" className="text-xs whitespace-nowrap flex-1 min-w-[90px] gap-1">
            <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="live" className="text-xs whitespace-nowrap flex-1 min-w-[90px] gap-1">
            <ListOrdered className="w-3.5 h-3.5" /> Live Queue
          </TabsTrigger>
          <TabsTrigger value="board" className="text-xs whitespace-nowrap flex-1 min-w-[90px] gap-1">
            <Monitor className="w-3.5 h-3.5" /> Display Board
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab facilityId={activeFacilityId} />
        </TabsContent>
        <TabsContent value="live" className="mt-4">
          <LiveQueueTab facilityId={activeFacilityId} />
        </TabsContent>
        <TabsContent value="board" className="mt-4">
          <DisplayBoardTab facilityId={activeFacilityId} />
        </TabsContent>
      </Tabs>

      <AddToQueueDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        facilityId={activeFacilityId}
        onAdded={() => {
          setShowAdd(false);
          qc.invalidateQueries({ queryKey: ["queue"] });
          qc.invalidateQueries({ queryKey: ["queue-stats"] });
        }}
      />
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB — KPIs, perf cards, queue breakdown
// =====================================================================
function DashboardTab({ facilityId }: { facilityId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["queue-stats", facilityId],
    queryFn: () => fetchJson(`/api/queue/stats?facilityId=${facilityId}`),
    enabled: !!facilityId,
    refetchInterval: 15000,
  });

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load queue stats" onRetry={() => refetch()} />;

  const k = data?.kpis || {};
  const queues: any[] = data?.queues || [];

  const kpiCards = [
    { label: "Total", value: k.total ?? 0, icon: Users, gradient: "from-amber-500 to-orange-600" },
    { label: "Waiting", value: k.waiting ?? 0, icon: Clock, gradient: "from-amber-400 to-yellow-500" },
    { label: "Called", value: k.called ?? 0, icon: BellRing, gradient: "from-teal-500 to-cyan-600" },
    { label: "In Progress", value: k.inProgress ?? 0, icon: Activity, gradient: "from-orange-500 to-red-500" },
    { label: "On Hold", value: k.onHold ?? 0, icon: Pause, gradient: "from-purple-500 to-pink-500" },
    { label: "Completed", value: k.completed ?? 0, icon: CheckCircle2, gradient: "from-emerald-500 to-green-600" },
    { label: "Skipped", value: k.skipped ?? 0, icon: SkipForward, gradient: "from-slate-500 to-slate-700" },
    { label: "Cancelled", value: k.cancelled ?? 0, icon: XCircle, gradient: "from-rose-500 to-red-600" },
  ];

  return (
    <div className="space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {kpiCards.map((c) => (
          <MiniStatCard
            key={c.label}
            label={c.label}
            value={c.value}
            icon={c.icon}
            gradient={c.gradient}
          />
        ))}
      </div>

      {/* Performance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="overflow-hidden border-0 shadow-md">
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Timer className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">Average Wait Time</p>
              <p className="text-3xl font-extrabold tabular-nums">
                {k.avgWaitMin ?? 0}
                <span className="text-base font-semibold ml-1">min</span>
              </p>
              <p className="text-[11px] text-white/70">From check-in to being called</p>
            </div>
          </div>
        </Card>
        <Card className="overflow-hidden border-0 shadow-md">
          <div className="bg-gradient-to-br from-orange-500 to-amber-700 text-white p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">Average Service Time</p>
              <p className="text-3xl font-extrabold tabular-nums">
                {k.avgServiceMin ?? 0}
                <span className="text-base font-semibold ml-1">min</span>
              </p>
              <p className="text-[11px] text-white/70">From service start to completion</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Queue breakdown table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-600" />
            Queue Breakdown by Department
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {queues.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No active queues today"
                description="Once patients are added to a queue, the breakdown will appear here."
                icon={ListOrdered}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-cyan-600 to-blue-700 text-white">
                    <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider">Queue / Department</th>
                    <th className="text-center px-3 py-2.5 text-xs font-bold uppercase tracking-wider">Type</th>
                    <th className="text-center px-3 py-2.5 text-xs font-bold uppercase tracking-wider">Total</th>
                    <th className="text-center px-3 py-2.5 text-xs font-bold uppercase tracking-wider">Waiting</th>
                    <th className="text-center px-3 py-2.5 text-xs font-bold uppercase tracking-wider">In Progress</th>
                    <th className="text-center px-3 py-2.5 text-xs font-bold uppercase tracking-wider">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {queues.map((q: any) => (
                    <tr key={q.id} className="hover:bg-amber-50/50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {q.departmentName || "General"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 capitalize">
                          {(q.queueType || "consultation").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center font-bold text-slate-900 tabular-nums">{q.total ?? 0}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 tabular-nums">
                          {q.waiting ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200 tabular-nums">
                          {q.inProgress ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 tabular-nums">
                          {q.completed ?? 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                    <td className="px-4 py-2.5 text-slate-700" colSpan={2}>Totals</td>
                    <td className="px-3 py-2.5 text-center text-slate-900 tabular-nums">
                      {queues.reduce((s, q) => s + (q.total ?? 0), 0)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-amber-700 tabular-nums">
                      {queues.reduce((s, q) => s + (q.waiting ?? 0), 0)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-orange-700 tabular-nums">
                      {queues.reduce((s, q) => s + (q.inProgress ?? 0), 0)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-emerald-700 tabular-nums">
                      {queues.reduce((s, q) => s + (q.completed ?? 0), 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// LIVE QUEUE TAB — management with filters & context-aware actions
// =====================================================================
function LiveQueueTab({ facilityId }: { facilityId: string }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [transferEntry, setTransferEntry] = useState<any | null>(null);
  const [skipEntry, setSkipEntry] = useState<any | null>(null);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["queue", facilityId, statusFilter],
    queryFn: () => {
      const statusParam = statusFilter !== "all" ? `&status=${statusFilter}` : "";
      return fetchJson(`/api/queue?facilityId=${facilityId}${statusParam}`);
    },
    enabled: !!facilityId,
    refetchInterval: 15000,
  });

  const updateEntry = useMutation({
    mutationFn: async (payload: {
      id: string;
      status?: string;
      transferToQueueId?: string;
      skipReason?: string;
      noShowReason?: string;
      notes?: string;
      priority?: string;
    }) => {
      const res = await fetch(`/api/queue/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: (_d, vars) => {
      const verb = vars.transferToQueueId
        ? "transferred"
        : vars.status ? vars.status.replace(/_/g, " ") : "updated";
      toast.success(`Patient ${verb}`);
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["queue-stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const queues: any[] = data?.items || [];

  // Apply client-side search filter (by name or MRN)
  const filteredQueues = useMemo(() => {
    if (!search.trim()) return queues;
    const q = search.toLowerCase();
    return queues
      .map((queue) => ({
        ...queue,
        entries: (queue.entries || []).filter(
          (e: any) =>
            `${e.patient?.firstName || ""} ${e.patient?.lastName || ""}`.toLowerCase().includes(q) ||
            (e.patient?.patientNumber || "").toLowerCase().includes(q)
        ),
      }))
      .filter((queue) => (queue.entries || []).length > 0);
  }, [queues, search]);

  return (
    <div className="space-y-3">
      {/* Filters bar */}
      <Card>
        <CardContent className="p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by patient name or MRN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="sm:w-52">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
            className="shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load queue" onRetry={() => refetch()} />
      ) : filteredQueues.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title={search ? "No matching patients" : "No active queues"}
              description={
                search
                  ? "Try a different name or MRN, or clear the search."
                  : "Add a patient to create today's queue."
              }
              icon={search ? Search : ListOrdered}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredQueues.map((q: any) => (
            <Card key={q.id} className="overflow-hidden">
              <CardHeader className="pb-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ListOrdered className="w-4 h-4 text-amber-600" />
                    {q.department?.name || "General"} Queue
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold border border-amber-200">
                      {(q.entries || []).length} entries
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {(q.entries || []).length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 text-center">
                    No entries match this filter.
                  </div>
                ) : (
                  <div className="divide-y max-h-[28rem] overflow-y-auto">
                    {q.entries.map((entry: any) => (
                      <QueueEntryRow
                        key={entry.id}
                        entry={entry}
                        queueId={q.id}
                        currentQueueName={q.department?.name || "General"}
                        allQueues={queues}
                        busy={updateEntry.isPending}
                        onAction={(status) =>
                          updateEntry.mutate({ id: entry.id, status })
                        }
                        onTransfer={() => setTransferEntry({ ...entry, fromQueueId: q.id })}
                        onSkip={() => setSkipEntry(entry)}
                      />
                    ))}
                  </div>
                )}
                <div className="p-3 border-t bg-slate-50 flex items-center justify-between text-xs text-slate-600">
                  <span>Waiting: {q.entries?.filter((e: any) => e.status === "waiting").length || 0}</span>
                  <span>
                    In progress: {q.entries?.filter((e: any) => e.status === "in_progress").length || 0} •{" "}
                    Completed: {q.entries?.filter((e: any) => e.status === "completed").length || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TransferDialog
        open={!!transferEntry}
        entry={transferEntry}
        allQueues={queues}
        onClose={() => setTransferEntry(null)}
        onConfirm={(targetQueueId, notes) => {
          if (transferEntry) {
            updateEntry.mutate(
              { id: transferEntry.id, transferToQueueId: targetQueueId, notes },
              { onSettled: () => setTransferEntry(null) }
            );
          }
        }}
      />

      <SkipDialog
        open={!!skipEntry}
        entry={skipEntry}
        onClose={() => setSkipEntry(null)}
        onConfirm={(reason, isNoShow) => {
          if (skipEntry) {
            updateEntry.mutate(
              {
                id: skipEntry.id,
                status: isNoShow ? "cancelled" : "skipped",
                ...(isNoShow ? { noShowReason: reason } : { skipReason: reason }),
              },
              { onSettled: () => setSkipEntry(null) }
            );
          }
        }}
      />
    </div>
  );
}

// ---- Single queue entry row with context-aware actions --------------
function QueueEntryRow({
  entry,
  allQueues,
  busy,
  onAction,
  onTransfer,
  onSkip,
}: {
  entry: any;
  queueId: string;
  currentQueueName: string;
  allQueues: any[];
  busy: boolean;
  onAction: (status: string) => void;
  onTransfer: () => void;
  onSkip: () => void;
}) {
  const waitMin = calcWaitMinutes(entry.createdAt);
  const priorityColor =
    entry.priority === "emergency"
      ? "bg-rose-100 text-rose-700 border-rose-200"
      : entry.priority === "urgent"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-amber-50/40">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${priorityColor} border`}
          title={`Priority: ${entry.priority}`}
        >
          {entry.queueNumber}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-slate-900 truncate">
            {entry.patient?.firstName} {entry.patient?.lastName}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
            <span className="font-mono">{entry.patient?.patientNumber || "—"}</span>
            <span className="text-slate-300">•</span>
            <span>{calculateAge(entry.patient?.dateOfBirth)}y</span>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              {formatWait(waitMin)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap justify-end">
        <StatusBadge status={entry.status} />
        <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${priorityColor}`}>
          {entry.priority}
        </span>

        {/* Context-aware action buttons */}
        {entry.status === "waiting" && (
          <>
            <Button
              size="sm"
              onClick={() => onAction("called")}
              disabled={busy}
              className="gap-1 h-7 px-2 text-xs bg-amber-600 hover:bg-amber-700"
            >
              <UserCheck className="w-3 h-3" /> Call
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("on_hold")}
              disabled={busy}
              className="gap-1 h-7 px-2 text-xs"
            >
              <Pause className="w-3 h-3" /> Hold
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onSkip}
              disabled={busy}
              className="gap-1 h-7 px-2 text-xs text-slate-600"
            >
              <SkipForward className="w-3 h-3" /> Skip
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAction("cancelled")}
              disabled={busy}
              className="h-7 w-7 p-0 text-rose-500"
              title="Cancel"
            >
              <X className="w-3 h-3" />
            </Button>
          </>
        )}

        {entry.status === "called" && (
          <>
            <Button
              size="sm"
              onClick={() => onAction("in_progress")}
              disabled={busy}
              className="gap-1 h-7 px-2 text-xs bg-orange-600 hover:bg-orange-700"
            >
              <Play className="w-3 h-3" /> Start
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("waiting")}
              disabled={busy}
              className="gap-1 h-7 px-2 text-xs"
            >
              <RotateCcw className="w-3 h-3" /> Recall
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAction("cancelled")}
              disabled={busy}
              className="h-7 w-7 p-0 text-rose-500"
              title="Cancel"
            >
              <X className="w-3 h-3" />
            </Button>
          </>
        )}

        {entry.status === "in_progress" && (
          <>
            <Button
              size="sm"
              onClick={() => onAction("completed")}
              disabled={busy}
              className="gap-1 h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
            >
              <Check className="w-3 h-3" /> Complete
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("on_hold")}
              disabled={busy}
              className="gap-1 h-7 px-2 text-xs"
            >
              <Pause className="w-3 h-3" /> Hold
            </Button>
          </>
        )}

        {entry.status === "on_hold" && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("waiting")}
              disabled={busy}
              className="gap-1 h-7 px-2 text-xs"
            >
              <RotateCcw className="w-3 h-3" /> Resume
            </Button>
            <Button
              size="sm"
              onClick={() => onAction("completed")}
              disabled={busy}
              className="gap-1 h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
            >
              <Check className="w-3 h-3" /> Complete
            </Button>
          </>
        )}

        {/* Transfer is always available for active statuses */}
        {["waiting", "called", "in_progress", "on_hold"].includes(entry.status) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onTransfer}
            disabled={busy}
            className="gap-1 h-7 px-2 text-xs text-amber-700"
            title="Transfer to another queue"
          >
            <ArrowRightLeft className="w-3 h-3" /> Transfer
          </Button>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// DISPLAY BOARD TAB — large-font waiting-room view
// =====================================================================
function DisplayBoardTab({ facilityId }: { facilityId: string }) {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["queue", facilityId, "board"],
    queryFn: () => fetchJson(`/api/queue?facilityId=${facilityId}`),
    enabled: !!facilityId,
    refetchInterval: 15000,
  });

  // Force a re-render every 30s so the wait-time clock advances
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const allEntries: any[] = useMemo(() => {
    const queues: any[] = data?.items || [];
    return queues.flatMap((q) =>
      (q.entries || []).map((e: any) => ({
        ...e,
        departmentName: q.department?.name || "General",
      }))
    );
  }, [data]);

  const nowCalling = allEntries.filter(
    (e) => e.status === "called" || e.status === "in_progress"
  );
  const nextUp = allEntries
    .filter((e) => e.status === "waiting")
    .sort((a, b) => {
      // emergency → urgent → routine; then by queue number
      const order: Record<string, number> = { emergency: 0, urgent: 1, routine: 2 };
      const pa = order[a.priority] ?? 3;
      const pb = order[b.priority] ?? 3;
      if (pa !== pb) return pa - pb;
      return (a.queueNumber || 0) - (b.queueNumber || 0);
    })
    .slice(0, 5);

  const totalWaiting = allEntries.filter((e) => e.status === "waiting").length;

  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message="Failed to load display board" onRetry={() => refetch()} />;

  return (
    <div className="bg-slate-900 rounded-2xl p-4 sm:p-6 lg:p-8 text-white min-h-[60vh]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Monitor className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Now Serving</h2>
            <p className="text-white/60 text-sm">Please proceed when your number is called</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-white/50">In Waiting</p>
            <p className="text-3xl font-extrabold tabular-nums text-amber-400">{totalWaiting}</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white shrink-0"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Now calling */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <BellRing className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-amber-400">
            Now Calling
          </h3>
        </div>
        {nowCalling.length === 0 ? (
          <div className="bg-white/5 rounded-xl p-8 text-center border border-white/10">
            <p className="text-white/60 text-lg">No patients being called at the moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {nowCalling.map((e) => (
              <div
                key={e.id}
                className={`relative overflow-hidden rounded-xl p-5 border-2 ${
                  e.status === "in_progress"
                    ? "bg-gradient-to-br from-orange-600/30 to-red-600/20 border-orange-500"
                    : "bg-gradient-to-br from-amber-600/30 to-orange-600/20 border-amber-500"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-white/60 mb-1">
                      {e.status === "in_progress" ? "In Progress" : "Please Come Forward"}
                    </div>
                    <div className="text-4xl sm:text-5xl font-extrabold tabular-nums">
                      {e.queueNumber}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg sm:text-xl font-bold">
                      {e.patient?.firstName} {e.patient?.lastName}
                    </div>
                    <div className="text-sm text-white/70">{e.departmentName}</div>
                    <div className="text-xs text-white/50 mt-1 font-mono">
                      MRN: {e.patient?.patientNumber || "—"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Next up */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-5 h-5 text-teal-400" />
          <h3 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-teal-400">
            Next in Line
          </h3>
        </div>
        {nextUp.length === 0 ? (
          <div className="bg-white/5 rounded-xl p-8 text-center border border-white/10">
            <p className="text-white/60 text-lg">No patients waiting.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {nextUp.map((e, idx) => {
              const waitMin = calcWaitMinutes(e.createdAt);
              const priorityBadge =
                e.priority === "emergency"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : e.priority === "urgent"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-white/10 text-white/60 border-white/20";
              return (
                <div
                  key={e.id}
                  className="relative overflow-hidden rounded-xl p-4 bg-white/5 border border-white/10 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                      #{idx + 1}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase ${priorityBadge}`}>
                      {e.priority}
                    </span>
                  </div>
                  <div className="text-3xl sm:text-4xl font-extrabold tabular-nums text-white">
                    {e.queueNumber}
                  </div>
                  <div className="text-sm font-semibold text-white/90 truncate">
                    {e.patient?.firstName} {e.patient?.lastName}
                  </div>
                  <div className="text-xs text-white/50 flex items-center justify-between">
                    <span>{e.departmentName}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {formatWait(waitMin)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer ticker */}
      <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-white/40">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Live • Auto-refresh every 15s
        </span>
        <span>{formatDate(new Date(), true)}</span>
      </div>
    </div>
  );
}

// =====================================================================
// TRANSFER DIALOG
// =====================================================================
function TransferDialog({
  open,
  entry,
  allQueues,
  onClose,
  onConfirm,
}: {
  open: boolean;
  entry: any | null;
  allQueues: any[];
  onClose: () => void;
  onConfirm: (targetQueueId: string, notes?: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden" size="compact">
        {/* Keyed body — fresh form state per entry, no effect needed */}
        {entry && (
          <TransferDialogBody
            key={entry.id}
            entry={entry}
            allQueues={allQueues}
            onConfirm={onConfirm}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TransferDialogBody({
  entry,
  allQueues,
  onConfirm,
  onClose,
}: {
  entry: any;
  allQueues: any[];
  onConfirm: (targetQueueId: string, notes?: string) => void;
  onClose: () => void;
}) {
  const [targetQueueId, setTargetQueueId] = useState("");
  const [notes, setNotes] = useState("");

  const eligibleQueues = allQueues.filter((q) => q.id !== entry?.fromQueueId);

  const submit = () => {
    if (!targetQueueId) {
      toast.error("Please select a target queue");
      return;
    }
    onConfirm(targetQueueId, notes.trim() || undefined);
  };

  return (
    <>
      <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <DialogTitle className="text-white">Transfer Patient</DialogTitle>
        <DialogDescription className="text-white/80">
          Move{" "}
          <span className="font-semibold text-slate-900">
            {entry?.patient?.firstName} {entry?.patient?.lastName}
          </span>{" "}
          (#{entry?.queueNumber}) to another queue. A new queue number will be assigned.
        </DialogDescription>
      </DialogHeader>
      <div className="p-6 space-y-3">
        <div>
          <FieldLabel required>Target Queue</FieldLabel>
          <Select value={targetQueueId} onValueChange={setTargetQueueId}>
            <SelectTrigger>
              <SelectValue placeholder="Select target queue..." />
            </SelectTrigger>
            <SelectContent>
              {eligibleQueues.length === 0 ? (
                <SelectItem value="_none" disabled>
                  No other queues available
                </SelectItem>
              ) : (
                eligibleQueues.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.department?.name || "General"} ({q.entries?.length || 0} waiting)
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Textarea
            placeholder="Reason for transfer or special instructions..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>
      <DialogFooter className="p-6 pt-4 shrink-0 border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} className="bg-amber-600 hover:bg-amber-700">
          <ArrowRightLeft className="w-4 h-4 mr-1" /> Transfer
        </Button>
      </DialogFooter>
    </>
  );
}

// =====================================================================
// SKIP / NO-SHOW DIALOG
// =====================================================================
function SkipDialog({
  open,
  entry,
  onClose,
  onConfirm,
}: {
  open: boolean;
  entry: any | null;
  onClose: () => void;
  onConfirm: (reason: string, isNoShow: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden" size="compact">
        {/* Keyed body — fresh form state per entry, no effect needed */}
        {entry && (
          <SkipDialogBody
            key={entry.id}
            entry={entry}
            onConfirm={onConfirm}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SkipDialogBody({
  entry,
  onClose,
  onConfirm,
}: {
  entry: any;
  onClose: () => void;
  onConfirm: (reason: string, isNoShow: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [isNoShow, setIsNoShow] = useState(false);

  const submit = () => {
    if (!reason.trim()) {
      toast.error("Please provide a reason");
      return;
    }
    onConfirm(reason.trim(), isNoShow);
  };

  return (
    <>
      <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <DialogTitle className="text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          {isNoShow ? "Mark as No-Show" : "Skip Patient"}
        </DialogTitle>
        <DialogDescription className="text-white/80">
          Record why{" "}
          <span className="font-semibold text-slate-900">
            {entry?.patient?.firstName} {entry?.patient?.lastName}
          </span>{" "}
          (#{entry?.queueNumber}) is being {isNoShow ? "marked as no-show (cancelled)" : "skipped"}.
        </DialogDescription>
      </DialogHeader>
      <div className="p-6 space-y-3">
        <div className="flex-1 overflow-y-auto p-6 flex gap-2">
          <Button
            size="sm"
            variant={!isNoShow ? "default" : "outline"}
            onClick={() => setIsNoShow(false)}
            className={!isNoShow ? "bg-amber-600 hover:bg-amber-700" : ""}
          >
            <SkipForward className="w-4 h-4 mr-1" /> Skip
          </Button>
          <Button
            size="sm"
            variant={isNoShow ? "default" : "outline"}
            onClick={() => setIsNoShow(true)}
            className={isNoShow ? "bg-rose-600 hover:bg-rose-700" : ""}
          >
            <XCircle className="w-4 h-4 mr-1" /> No-Show
          </Button>
        </div>
        <div>
          <FieldLabel required>Reason</FieldLabel>
          <Textarea
            placeholder={isNoShow ? "e.g., Patient did not arrive..." : "e.g., Patient stepped out briefly..."}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
      </div>
      <DialogFooter className="p-6 pt-4 shrink-0 border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          className={isNoShow ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"}
        >
          {isNoShow ? "Mark No-Show" : "Skip Patient"}
        </Button>
      </DialogFooter>
    </>
  );
}

// =====================================================================
// ADD-TO-QUEUE DIALOG (preserved from original)
// =====================================================================
function AddToQueueDialog({
  open,
  onClose,
  facilityId,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  facilityId: string | null;
  onAdded: () => void;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [queueId, setQueueId] = useState("");
  const [priority, setPriority] = useState("routine");
  const [saving, setSaving] = useState(false);

  const { data: queuesData } = useQuery({
    queryKey: ["queue", facilityId],
    queryFn: () => fetchJson(`/api/queue?facilityId=${facilityId}`),
    enabled: !!facilityId && open,
  });

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  const queues: any[] = queuesData?.items || [];

  const submit = async () => {
    if (!patientId) {
      toast.error("Please select a patient");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueId: queueId || undefined,
          patientId,
          priority,
          facilityId: facilityId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Patient added to queue");
      setPatientQuery("");
      setPatientId("");
      setQueueId("");
      setPriority("routine");
      onAdded();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden" size="compact">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <DialogTitle className="text-white">Add Patient to Queue</DialogTitle>
          <DialogDescription className="text-white/80">Add a patient to today&apos;s queue.</DialogDescription>
        </DialogHeader>
        <div className="p-6 space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <Input
              placeholder="Search patient..."
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
            />
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPatientId(p.id);
                      setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
                    }}
                    className="w-full text-left p-2 hover:bg-amber-50 text-sm border-b last:border-0"
                  >
                    <span className="font-medium">
                      {p.firstName} {p.lastName}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label>Queue (department)</Label>
            <Select value={queueId || "new"} onValueChange={(v) => setQueueId(v === "new" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">+ Create new queue</SelectItem>
                {queues.map((q: any) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.department?.name || "General"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priority || undefined} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className="bg-amber-600 hover:bg-amber-700">
            {saving ? "Adding..." : "Add to Queue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

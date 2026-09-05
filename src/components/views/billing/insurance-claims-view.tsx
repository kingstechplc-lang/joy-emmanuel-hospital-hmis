"use client";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, ShieldCheck, Search, Send, Check, X, DollarSign, RefreshCw, Stethoscope,
  AlertCircle, CheckCircle2, Download, Layers, LayoutDashboard, ListFilter,
  Eye, Activity, History, MessageSquare, CreditCard, Wallet, ClipboardList,
  Clock, AlertTriangle, FileText, TrendingUp, Hash, Calendar, Building2, User,
  ArrowRight, Loader2, Stethoscope as StethoscopeIcon, FileCode2
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatCurrency,
  safeJson, PageHeader, MiniStatCard, ClearableSearch, usePagination, Pagination } from "@/components/ui-helpers"
import { EntitySelect, type EntitySelectValue } from "@/components/ui/entity-select";

import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "partially_approved", label: "Partially Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "paid", label: "Paid" },
  { value: "resubmitted", label: "Resubmitted" },
];

// Work queue definitions — key, label, description, icon, accent color, status filter to apply
type WorkQueueDef = {
  key: string;
  title: string;
  description: string;
  icon: any;
  accent: "amber" | "cyan" | "teal" | "orange" | "rose" | "violet" | "emerald";
  status: string;
};

const WORK_QUEUES: WorkQueueDef[] = [
  { key: "pendingValidation", title: "Pending Validation", description: "Drafts needing review before submission", icon: ClipboardList, accent: "amber", status: "draft" },
  { key: "readyForSubmission", title: "Ready for Submission", description: "Validated claims awaiting submit action", icon: TrendingUp, accent: "cyan", status: "draft" },
  { key: "submittedAwaitingResponse", title: "Awaiting Response", description: "Submitted — waiting on payer decision", icon: Clock, accent: "teal", status: "submitted" },
  { key: "openQueries", title: "Open Queries", description: "Claims with open queries from the payer", icon: MessageSquare, accent: "orange", status: "submitted" },
  { key: "rejectedClaims", title: "Rejected Claims", description: "Rejected — review and resubmit if eligible", icon: X, accent: "rose", status: "rejected" },
  { key: "resubmissions", title: "Resubmissions", description: "Claims queued for resubmission", icon: RefreshCw, accent: "violet", status: "resubmitted" },
  { key: "awaitingPayment", title: "Awaiting Payment", description: "Approved claims awaiting payer payment", icon: Wallet, accent: "emerald", status: "approved" },
];

export function InsuranceClaimsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"dashboard" | "list">("dashboard");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [partialClaim, setPartialClaim] = useState<any | null>(null);
  const [detailClaimId, setDetailClaimId] = useState<string | null>(null);
  const [validateClaim, setValidateClaim] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const statsParams = new URLSearchParams();
  if (activeFacilityId) statsParams.set("facilityId", activeFacilityId);
  const statsQs = statsParams.toString() ? `?${statsParams.toString()}` : "";

  // Dashboard stats query
  const statsQuery = useQuery({
    queryKey: ["insurance-claims-stats", activeFacilityId],
    queryFn: () => fetchJson(`/api/insurance-claims/stats${statsQs}`),
    enabled: !!activeFacilityId,
  });

  const kpis = statsQuery.data?.kpis || {};
  const workQueues = statsQuery.data?.workQueues || {};

  // Export handler — downloads CSV/TSV/JSON from the export API
  const handleExport = async (format: "csv" | "tsv" | "json") => {
    const exportParams = new URLSearchParams();
    exportParams.set("format", format);
    if (activeFacilityId) exportParams.set("facilityId", activeFacilityId);
    if (statusFilter !== "all") exportParams.set("status", statusFilter);
    try {
      const res = await fetch(`/api/insurance-claims/export?${exportParams.toString()}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nhis-claims-${new Date().toISOString().slice(0, 10)}.${format === "tsv" ? "tsv" : format === "json" ? "json" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    }
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["insurance-claims", activeFacilityId, statusFilter],
    queryFn: () => fetchJson(`/api/insurance-claims${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["insurance-claims"] });
    qc.invalidateQueries({ queryKey: ["insurance-claims-stats"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
  };

  const doAction = async (id: string, action: string, successMsg: string, extra?: any) => {
    try {
      const res = await fetch(`/api/insurance-claims/${id}`, {
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

  // Jump from dashboard work queue to filtered claims list
  const goToList = (status: string) => {
    setStatusFilter(status);
    setActiveTab("list");
  };

  const items: any[] = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 10);
  const totalClaims = kpis.total ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Insurance Claims"
        description="Manage NHIS and private insurance claims — dashboard, validation, queries, payments, and bulk generation"
        icon={ShieldCheck}
        gradient="from-emerald-600 to-teal-700"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => handleExport("csv")} disabled={!can("insurance.view")} className="gap-2 bg-white/20 border-white/30 text-white hover:bg-white/30">
              <Download className="w-4 h-4" /> CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport("tsv")} disabled={!can("insurance.view")} className="gap-2 bg-white/20 border-white/30 text-white hover:bg-white/30">
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button variant="outline" onClick={() => handleExport("json")} disabled={!can("insurance.view")} className="gap-2 bg-white/20 border-white/30 text-white hover:bg-white/30">
              <Download className="w-4 h-4" /> JSON
            </Button>
            {can("insurance.claim") && (
              <Button onClick={() => setShowBulk(true)} className="gap-2 bg-white/20 border-white/30 text-white hover:bg-white/30">
                <Layers className="w-4 h-4" /> Bulk Generate
              </Button>
            )}
            <Button onClick={() => setShowNew(true)} disabled={!can("insurance.claim")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" /> New Claim
            </Button>
          </div>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view insurance claims.</CardContent></Card>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "dashboard" | "list")}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="dashboard" className="gap-2 data-[state=active]:bg-white">
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-2 data-[state=active]:bg-white">
            <ListFilter className="w-4 h-4" /> Claims List
            {totalClaims > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{totalClaims}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ===================================================== */}
        {/* DASHBOARD TAB — KPIs + Work Queues                     */}
        {/* ===================================================== */}
        <TabsContent value="dashboard" className="space-y-4">
          {statsQuery.isLoading ? (
            <LoadingState rows={4} />
          ) : statsQuery.isError ? (
            <ErrorState message="Failed to load dashboard stats" onRetry={() => statsQuery.refetch()} />
          ) : (
            <>
              {/* KPI CARDS — 8 mini stat cards in a grid */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Key Performance Indicators</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MiniStatCard label="Total Claims" value={kpis.total ?? 0} icon={FileText} gradient="from-slate-700 to-slate-900" sublabel="All time" />
                  <MiniStatCard label="Draft" value={kpis.draft ?? 0} icon={ClipboardList} gradient="from-amber-500 to-orange-600" sublabel="Awaiting validation" />
                  <MiniStatCard label="Submitted" value={kpis.submitted ?? 0} icon={Send} gradient="from-cyan-500 to-teal-600" sublabel="With payer" />
                  <MiniStatCard label="Approved" value={kpis.approved ?? 0} icon={CheckCircle2} gradient="from-emerald-500 to-green-600" sublabel="Full approval" />
                  <MiniStatCard label="Rejected" value={kpis.rejected ?? 0} icon={X} gradient="from-rose-500 to-red-600" sublabel="Needs review" />
                  <MiniStatCard label="Paid" value={kpis.paid ?? 0} icon={Wallet} gradient="from-emerald-600 to-teal-700" sublabel="Settled" />
                  <MiniStatCard label="Open Queries" value={kpis.openQueries ?? 0} icon={MessageSquare} gradient="from-orange-500 to-amber-600" sublabel="Awaiting response" />
                  <MiniStatCard label="Outstanding" value={formatCurrency(kpis.outstanding)} icon={DollarSign} gradient="from-rose-600 to-pink-700" sublabel="Claimed − Paid" />
                </div>
              </div>

              {/* FINANCIAL SUMMARY */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-emerald-700" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Total Claimed</p>
                    </div>
                    <p className="text-2xl font-extrabold text-emerald-900 tabular-nums">{formatCurrency(kpis.totalClaimAmount)}</p>
                  </CardContent>
                </Card>
                <Card className="border-teal-200 bg-teal-50/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-4 h-4 text-teal-700" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Total Approved</p>
                    </div>
                    <p className="text-2xl font-extrabold text-teal-900 tabular-nums">{formatCurrency(kpis.totalApprovedAmount)}</p>
                  </CardContent>
                </Card>
                <Card className="border-amber-200 bg-amber-50/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet className="w-4 h-4 text-amber-700" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Total Paid</p>
                    </div>
                    <p className="text-2xl font-extrabold text-amber-900 tabular-nums">{formatCurrency(kpis.totalPaidAmount)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* WORK QUEUES */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-emerald-600" />
                      Work Queues
                    </CardTitle>
                    <p className="text-xs text-slate-500">Click any queue to view filtered claims</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {WORK_QUEUES.map((q) => (
                      <WorkQueueCard
                        key={q.key}
                        title={q.title}
                        description={q.description}
                        count={workQueues[q.key] ?? 0}
                        icon={q.icon}
                        accent={q.accent}
                        onClick={() => goToList(q.status)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ===================================================== */}
        {/* CLAIMS LIST TAB — filterable table with row actions    */}
        {/* ===================================================== */}
        <TabsContent value="list" className="space-y-3">
          <Card>
            <CardContent className="p-3 flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-semibold text-slate-600">Filter:</span>
              </div>
              <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
                <SelectTrigger className="md:w-52 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {statusFilter !== "all" && (
                <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")} className="h-9 text-xs gap-1">
                  <X className="w-3 h-3" /> Clear
                </Button>
              )}
              <div className="ml-auto text-xs text-slate-500">
                {items.length} claim{items.length === 1 ? "" : "s"}
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <LoadingState rows={6} />
          ) : isError ? (
            <ErrorState message="Failed to load insurance claims" onRetry={() => refetch()} />
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  title="No insurance claims"
                  description={statusFilter === "all" ? "Create a new claim against an outstanding invoice." : `No claims match the "${statusFilter}" filter.`}
                  action={<Button onClick={() => setShowNew(true)} disabled={!can("insurance.claim")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Claim</Button>}
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
                        <th className="text-left p-3 font-semibold text-slate-700">Claim #</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Provider</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Invoice Total</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Claim Amount</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Approved</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Submitted</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedItems.map((c: any) => (
                        <tr key={c.id} className="border-b hover:bg-emerald-50/40">
                          <td className="p-3">
                            <button
                              onClick={() => setDetailClaimId(c.id)}
                              className="font-mono text-xs text-emerald-700 hover:text-emerald-900 hover:underline font-semibold"
                              title="View claim details"
                            >
                              {c.claimNumber}
                            </button>
                            {c.isNhisValidated && (
                              <Badge variant="secondary" className="ml-2 text-[9px] bg-emerald-100 text-emerald-700">
                                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Validated
                              </Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-slate-900">{c.patient?.firstName} {c.patient?.lastName}</div>
                            <div className="text-xs text-slate-500">{c.patient?.patientNumber}</div>
                          </td>
                          <td className="p-3">
                            <div className="text-sm text-slate-700">{c.insuranceProvider?.name}</div>
                            <div className="text-[10px] text-slate-500">{c.insuranceProvider?.code}</div>
                          </td>
                          <td className="p-3 text-right font-mono text-xs">{formatCurrency(c.invoice?.total)}</td>
                          <td className="p-3 text-right font-mono text-xs font-semibold">{formatCurrency(c.claimAmount)}</td>
                          <td className="p-3 text-right font-mono text-xs text-emerald-700">{formatCurrency(c.approvedAmount)}</td>
                          <td className="p-3"><StatusBadge status={c.status} /></td>
                          <td className="p-3 text-xs text-slate-600">{c.submittedAt ? formatDate(c.submittedAt) : "—"}</td>
                          <td className="p-3 text-right">
                            <div className="flex flex-wrap gap-1 justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDetailClaimId(c.id)}
                                className="gap-1 h-7 text-xs"
                                title="View details"
                              >
                                <Eye className="w-3.5 h-3.5" /> View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setValidateClaim(c)}
                                className="gap-1 h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                title="Run validation checks"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" /> Validate
                              </Button>
                              {c.status === "draft" && can("insurance.claim") && (
                                <Button size="sm" onClick={() => doAction(c.id, "submit", "Claim submitted to provider")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                                  <Send className="w-3 h-3" /> Submit
                                </Button>
                              )}
                              {c.status === "submitted" && can("insurance.claim") && (
                                <>
                                  <Button size="sm" onClick={() => doAction(c.id, "approve", "Claim approved for full amount")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                                    <Check className="w-3 h-3" /> Approve
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setPartialClaim(c)} className="gap-1 h-7 text-xs">
                                    <DollarSign className="w-3 h-3" /> Partial
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => doAction(c.id, "reject", "Claim rejected", { reason: "Provider rejected claim" })} className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700">
                                    <X className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                              {["approved", "partially_approved"].includes(c.status) && can("insurance.claim") && (
                                <Button size="sm" onClick={() => doAction(c.id, "pay", "Claim paid — insurance payment recorded")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                                  <DollarSign className="w-3 h-3" /> Mark Paid
                                </Button>
                              )}
                              {c.status === "rejected" && can("insurance.claim") && (
                                <Button size="sm" variant="outline" onClick={() => doAction(c.id, "resubmit", "Claim resubmitted")} className="gap-1 h-7 text-xs">
                                  <RefreshCw className="w-3 h-3" /> Resubmit
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <NewClaimDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} facilityId={activeFacilityId} />

      {showBulk && (
        <BulkClaimsDialog facilityId={activeFacilityId} onClose={() => setShowBulk(false)} onCreated={() => { setShowBulk(false); invalidate(); }} />
      )}

      {partialClaim && (
        <PartialApprovalDialog claim={partialClaim} onClose={() => setPartialClaim(null)} onDone={() => { setPartialClaim(null); invalidate(); }} />
      )}

      {detailClaimId && (
        <ClaimDetailDialog
          claimId={detailClaimId}
          onClose={() => setDetailClaimId(null)}
          onChanged={() => invalidate()}
          canEdit={can("insurance.claim")}
        />
      )}

      {validateClaim && (
        <ValidateResultDialog
          claim={validateClaim}
          onClose={() => setValidateClaim(null)}
          onValidated={() => invalidate()}
        />
      )}
    </div>
  );
}

// =====================================================================
// WORK QUEUE CARD — clickable card with icon + count
// =====================================================================
function WorkQueueCard({
  title,
  description,
  count,
  icon: Icon,
  accent,
  onClick,
}: {
  title: string;
  description: string;
  count: number;
  icon: any;
  accent: "amber" | "cyan" | "teal" | "orange" | "rose" | "violet" | "emerald";
  onClick: () => void;
}) {
  const accentMap: Record<string, { bg: string; text: string; ring: string; count: string }> = {
    amber: { bg: "bg-amber-100", text: "text-amber-700", ring: "hover:border-amber-400 hover:bg-amber-50", count: "text-amber-900" },
    cyan: { bg: "bg-cyan-100", text: "text-cyan-700", ring: "hover:border-cyan-400 hover:bg-cyan-50", count: "text-cyan-900" },
    teal: { bg: "bg-teal-100", text: "text-teal-700", ring: "hover:border-teal-400 hover:bg-teal-50", count: "text-teal-900" },
    orange: { bg: "bg-orange-100", text: "text-orange-700", ring: "hover:border-orange-400 hover:bg-orange-50", count: "text-orange-900" },
    rose: { bg: "bg-rose-100", text: "text-rose-700", ring: "hover:border-rose-400 hover:bg-rose-50", count: "text-rose-900" },
    violet: { bg: "bg-violet-100", text: "text-violet-700", ring: "hover:border-violet-400 hover:bg-violet-50", count: "text-violet-900" },
    emerald: { bg: "bg-emerald-100", text: "text-emerald-700", ring: "hover:border-emerald-400 hover:bg-emerald-50", count: "text-emerald-900" },
  };
  const a = accentMap[accent];
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-xl border-2 border-slate-200 bg-white transition-all group ${a.ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${a.bg} ${a.text}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{title}</p>
            <p className="text-[11px] text-slate-500 line-clamp-2">{description}</p>
          </div>
        </div>
        <span className={`text-2xl font-extrabold tabular-nums ${a.count} flex-shrink-0`}>{count}</span>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-slate-400 group-hover:text-emerald-600 transition-colors">
        <span>View claims</span>
        <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
      </div>
    </button>
  );
}

// =====================================================================
// VALIDATE RESULT DIALOG — runs validation and shows the result
// =====================================================================
function ValidateResultDialog({
  claim,
  onClose,
  onValidated,
}: {
  claim: any;
  onClose: () => void;
  onValidated: () => void;
}) {
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/insurance-claims/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimId: claim.id }),
        });
        if (!res.ok) {
          const err = await safeJson(res);
          throw new Error(err.error || "Validation failed");
        }
        const data = await safeJson(res);
        if (!cancelled) {
          setResult(data);
          setLoading(false);
          if (data.isValid) toast.success("Claim passed all validation checks");
          else toast.warning(`Claim has ${data.issues?.length || 0} issue(s)`);
          onValidated();
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [claim.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <ShieldCheck className="w-5 h-5" /> Claim Validation
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Claim <span className="font-mono font-semibold text-slate-700">{claim.claimNumber}</span> — automated NHIS / payer compliance check
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-sm text-slate-600">Running validation checks…</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Validation failed</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          </div>
        ) : result ? (
          <div className="space-y-4">
            {/* Completeness meter */}
            <div className="p-4 rounded-lg border bg-slate-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Completeness</span>
                <span className={`text-lg font-extrabold tabular-nums ${result.completeness >= 80 ? "text-emerald-700" : result.completeness >= 50 ? "text-amber-700" : "text-rose-700"}`}>
                  {result.completeness}%
                </span>
              </div>
              <Progress
                value={result.completeness}
                className={`h-2 ${result.completeness >= 80 ? "[&_[data-slot=progress-indicator]]:bg-emerald-500" : result.completeness >= 50 ? "[&_[data-slot=progress-indicator]]:bg-amber-500" : "[&_[data-slot=progress-indicator]]:bg-rose-500"}`}
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                {result.checksPassed} of {result.checksTotal} checks passed
              </p>
            </div>

            {/* Valid / Invalid banner */}
            {result.isValid ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold">Claim is valid — ready for submission</span>
              </div>
            ) : (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-sm text-rose-700">
                <AlertCircle className="w-5 h-5" />
                <span className="font-semibold">Claim has blocking issues — cannot submit</span>
              </div>
            )}

            {/* Upstream Readiness Summary (from the claim-readiness engine) */}
            {result.upstreamReadiness && (
              <div className={`p-3 rounded-lg border ${
                result.upstreamReadiness.status === "ready_for_export" ? "bg-emerald-50 border-emerald-200" :
                result.upstreamReadiness.status === "ready_for_validation" ? "bg-amber-50 border-amber-200" :
                "bg-rose-50 border-rose-200"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Encounter Readiness
                  </span>
                  <span className={`text-sm font-bold ${
                    result.upstreamReadiness.status === "ready_for_export" ? "text-emerald-700" :
                    result.upstreamReadiness.status === "ready_for_validation" ? "text-amber-700" :
                    "text-rose-700"
                  }`}>
                    {result.upstreamReadiness.readinessScore}% ({result.upstreamReadiness.checksPassed}/{result.upstreamReadiness.checksTotal})
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mb-1">
                  Status: <span className="font-semibold capitalize">{result.upstreamReadiness.status.replace(/_/g, " ")}</span>
                  {" — "}
                  {result.upstreamReadiness.checksFailed} failed, {result.upstreamReadiness.checksTotal - result.upstreamReadiness.checksPassed - result.upstreamReadiness.checksFailed} passed/warning
                </p>
                {result.upstreamReadiness.failureSummary && (
                  <pre className="text-[10px] text-rose-700 whitespace-pre-wrap font-sans mt-1.5">
                    {result.upstreamReadiness.failureSummary}
                  </pre>
                )}
              </div>
            )}

            {/* Issues */}
            {result.issues && result.issues.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-rose-700 mb-2 flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Issues ({result.issues.length})
                </p>
                <ul className="space-y-1.5">
                  {result.issues.map((issue: string, i: number) => (
                    <li key={i} className="text-xs bg-rose-50 border border-rose-200 rounded p-2 text-rose-700 flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {result.warnings && result.warnings.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Warnings ({result.warnings.length})
                </p>
                <ul className="space-y-1.5">
                  {result.warnings.map((warn: string, i: number) => (
                    <li key={i} className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-700 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{warn}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* All good */}
            {result.isValid && (!result.warnings || result.warnings.length === 0) && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> No issues or warnings. Claim is fully compliant.
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// CLAIM DETAIL DIALOG — comprehensive multi-tab detail view
// =====================================================================
function ClaimDetailDialog({
  claimId,
  onClose,
  onChanged,
  canEdit,
}: {
  claimId: string;
  onClose: () => void;
  onChanged: () => void;
  canEdit: boolean;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const selectEncounter = useAppStore((s) => s.selectEncounter);
  const setView = useAppStore((s) => s.setView);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["insurance-claim-detail", claimId],
    queryFn: () => fetchJson(`/api/insurance-claims/${claimId}`),
    enabled: !!claimId,
  });

  const claim = data?.item;

  const refresh = () => {
    refetch();
    onChanged();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <ShieldCheck className="w-5 h-5" />
            Claim Detail
            {claim && <span className="font-mono text-sm text-slate-500">— {claim.claimNumber}</span>}
            {claim && <StatusBadge status={claim.status} />}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Full claim record — overview, diagnoses, line items, timeline, queries, and payments.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState rows={5} />
        ) : isError ? (
          <ErrorState message="Failed to load claim detail" onRetry={() => refetch()} />
        ) : !claim ? (
          <EmptyState title="Claim not found" />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-slate-100 flex-wrap h-auto">
              <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-white"><FileText className="w-3.5 h-3.5" /> Overview</TabsTrigger>
              <TabsTrigger value="diagnoses" className="gap-1.5 data-[state=active]:bg-white"><StethoscopeIcon className="w-3.5 h-3.5" /> Diagnoses {claim.claimDiagnoses?.length > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1">{claim.claimDiagnoses.length}</Badge>}</TabsTrigger>
              <TabsTrigger value="items" className="gap-1.5 data-[state=active]:bg-white"><Layers className="w-3.5 h-3.5" /> Items {claim.claimItems?.length > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1">{claim.claimItems.length}</Badge>}</TabsTrigger>
              <TabsTrigger value="timeline" className="gap-1.5 data-[state=active]:bg-white"><History className="w-3.5 h-3.5" /> Timeline</TabsTrigger>
              <TabsTrigger value="queries" className="gap-1.5 data-[state=active]:bg-white"><MessageSquare className="w-3.5 h-3.5" /> Queries {claim.claimQueries?.length > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-amber-100 text-amber-700">{claim.claimQueries.filter((q:any)=>q.status==="open").length}</Badge>}</TabsTrigger>
              <TabsTrigger value="payments" className="gap-1.5 data-[state=active]:bg-white"><CreditCard className="w-3.5 h-3.5" /> Payments {claim.claimPayments?.length > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-emerald-100 text-emerald-700">{claim.claimPayments.length}</Badge>}</TabsTrigger>
            </TabsList>

            {/* OVERVIEW */}
            <TabsContent value="overview" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Claim Information</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    <InfoRow label="Claim Number" value={<span className="font-mono">{claim.claimNumber}</span>} />
                    <InfoRow label="Status" value={<StatusBadge status={claim.status} />} />
                    <InfoRow label="Claim Type" value={claim.claimType} />
                    <InfoRow label="Created" value={formatDate(claim.createdAt, true)} />
                    <InfoRow label="Submitted" value={claim.submittedAt ? formatDate(claim.submittedAt, true) : "—"} />
                    <InfoRow label="Approved" value={claim.approvedAt ? formatDate(claim.approvedAt, true) : "—"} />
                    <InfoRow label="Rejected" value={claim.rejectedAt ? formatDate(claim.rejectedAt, true) : "—"} />
                    {claim.rejectionReason && <InfoRow label="Rejection Reason" value={<span className="text-rose-700">{claim.rejectionReason}</span>} />}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Patient & Provider</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    <InfoRow label="Patient" value={claim.patient ? `${claim.patient.firstName} ${claim.patient.lastName}` : "—"} />
                    <InfoRow label="Patient #" value={claim.patient?.patientNumber} />
                    <InfoRow label="Sex" value={claim.patient?.sex || "—"} />
                    <InfoRow label="Phone" value={claim.patient?.phone || "—"} />
                    <InfoRow label="Provider" value={claim.insuranceProvider?.name} />
                    <InfoRow label="Provider Code" value={claim.insuranceProvider?.code} />
                    <InfoRow label="Provider Phone" value={claim.insuranceProvider?.phone || "—"} />
                    <InfoRow label="Facility" value={claim.facility?.name} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> NHIS Compliance</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    <InfoRow label="NHIS Number" value={claim.nhisNumber || "—"} />
                    <InfoRow label="Primary ICD-10" value={claim.primaryDiagnosisCode || "—"} />
                    <InfoRow label="Diagnosis Name" value={claim.primaryDiagnosisName || "—"} />
                    <InfoRow label="G-DRG Code" value={claim.gdrgCode || "—"} />
                    <InfoRow label="G-DRG Name" value={claim.gdrgName || "—"} />
                    <InfoRow label="NHIS Tariff" value={claim.nhisTariff != null ? formatCurrency(claim.nhisTariff) : "—"} />
                    <InfoRow label="Submission Ref" value={claim.claimSubmissionRef || "—"} />
                    <InfoRow
                      label="NHIS Validated"
                      value={claim.isNhisValidated
                        ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3 mr-1" /> Yes</Badge>
                        : <Badge variant="secondary" className="bg-amber-100 text-amber-700"><AlertCircle className="w-3 h-3 mr-1" /> No</Badge>}
                    />
                    {claim.nhisValidationNotes && (
                      <div className="text-xs text-slate-500 bg-slate-50 border rounded p-2 mt-1">{claim.nhisValidationNotes}</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Financial Summary</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    <InfoRow label="Invoice Total" value={<span className="font-mono">{formatCurrency(claim.invoice?.total)}</span>} />
                    <InfoRow label="Invoice Balance" value={<span className="font-mono">{formatCurrency(claim.invoice?.balance)}</span>} />
                    <InfoRow label="Claim Amount" value={<span className="font-mono font-semibold">{formatCurrency(claim.claimAmount)}</span>} />
                    <InfoRow label="Approved Amount" value={<span className="font-mono text-emerald-700 font-semibold">{formatCurrency(claim.approvedAmount)}</span>} />
                    <InfoRow label="Total Paid (records)" value={<span className="font-mono text-emerald-700">{formatCurrency((claim.claimPayments || []).reduce((s: number, p: any) => s + (p.amount || 0), 0))}</span>} />
                    <InfoRow label="Outstanding" value={<span className="font-mono text-rose-700 font-semibold">{formatCurrency((claim.approvedAmount || claim.claimAmount) - (claim.claimPayments || []).reduce((s: number, p: any) => s + (p.amount || 0), 0))}</span>} />
                    {claim.batch && (
                      <InfoRow label="Batch" value={<span className="font-mono text-xs">{claim.batch.batchNumber}</span>} />
                    )}
                  </CardContent>
                </Card>
              </div>

              {claim.invoice && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-600">Linked Invoice</CardTitle></CardHeader>
                  <CardContent className="text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-semibold">{claim.invoice.invoiceNumber}</span>
                        <Badge variant="secondary" className="ml-2"><StatusBadge status={claim.invoice.status} /></Badge>
                      </div>
                      <div className="text-xs text-slate-500">
                        Total {formatCurrency(claim.invoice.total)} • Paid {formatCurrency(claim.invoice.amountPaid)} • Balance {formatCurrency(claim.invoice.balance)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* DIAGNOSES */}
            <TabsContent value="diagnoses">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Claim Diagnoses (ICD-10)</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {!claim.claimDiagnoses || claim.claimDiagnoses.length === 0 ? (
                    <EmptyState title="No diagnoses recorded" description="ICD-10 diagnoses will appear here once added." icon={StethoscopeIcon} />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                          <tr>
                            <th className="text-left p-2.5 font-semibold text-slate-700">Code</th>
                            <th className="text-left p-2.5 font-semibold text-slate-700">Name</th>
                            <th className="text-left p-2.5 font-semibold text-slate-700">Type</th>
                            <th className="text-left p-2.5 font-semibold text-slate-700">Catalog</th>
                            <th className="text-left p-2.5 font-semibold text-slate-700">Primary</th>
                          </tr>
                        </thead>
                        <tbody>
                          {claim.claimDiagnoses.map((d: any) => (
                            <tr key={d.id} className="border-b hover:bg-slate-50">
                              <td className="p-2.5 font-mono text-xs font-semibold text-emerald-700">{d.diagnosisCode}</td>
                              <td className="p-2.5">{d.diagnosisName}</td>
                              <td className="p-2.5">
                                <Badge variant="secondary" className="text-[10px] capitalize">{d.diagnosisType}</Badge>
                              </td>
                              <td className="p-2.5 text-xs text-slate-500">{d.catalog ? `${d.catalog.codeSystem || "ICD-10"} • ${d.catalog.category || "—"}` : "Manual entry"}</td>
                              <td className="p-2.5">{d.isPrimary ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <span className="text-slate-300">—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ITEMS */}
            <TabsContent value="items">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Claim Line Items</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {!claim.claimItems || claim.claimItems.length === 0 ? (
                    <EmptyState title="No structured items" description="Line items (services, drugs, labs) will appear here." icon={Layers} />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                          <tr>
                            <th className="text-left p-2.5 font-semibold text-slate-700">Type</th>
                            <th className="text-left p-2.5 font-semibold text-slate-700">Code</th>
                            <th className="text-left p-2.5 font-semibold text-slate-700">Description</th>
                            <th className="text-left p-2.5 font-semibold text-slate-700">Date</th>
                            <th className="text-right p-2.5 font-semibold text-slate-700">Qty</th>
                            <th className="text-right p-2.5 font-semibold text-slate-700">Unit Price</th>
                            <th className="text-right p-2.5 font-semibold text-slate-700">Claimed</th>
                            <th className="text-right p-2.5 font-semibold text-slate-700">Approved</th>
                            <th className="text-left p-2.5 font-semibold text-slate-700">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {claim.claimItems.map((it: any) => (
                            <tr key={it.id} className="border-b hover:bg-slate-50">
                              <td className="p-2.5"><Badge variant="secondary" className="text-[10px] capitalize">{it.itemType}</Badge></td>
                              <td className="p-2.5 font-mono text-xs">{it.serviceCode || "—"}</td>
                              <td className="p-2.5">{it.description}</td>
                              <td className="p-2.5 text-xs text-slate-500">{formatDate(it.serviceDate)}</td>
                              <td className="p-2.5 text-right font-mono">{it.quantity}</td>
                              <td className="p-2.5 text-right font-mono text-xs">{formatCurrency(it.unitPrice)}</td>
                              <td className="p-2.5 text-right font-mono text-xs font-semibold">{formatCurrency(it.claimedAmount)}</td>
                              <td className="p-2.5 text-right font-mono text-xs text-emerald-700">{formatCurrency(it.approvedAmount)}</td>
                              <td className="p-2.5"><StatusBadge status={it.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2">
                          <tr>
                            <td colSpan={6} className="p-2.5 text-right font-semibold text-slate-700">Totals</td>
                            <td className="p-2.5 text-right font-mono font-bold">{formatCurrency(claim.claimItems.reduce((s: number, it: any) => s + (it.claimedAmount || 0), 0))}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-emerald-700">{formatCurrency(claim.claimItems.reduce((s: number, it: any) => s + (it.approvedAmount || 0), 0))}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TIMELINE */}
            <TabsContent value="timeline">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Claim Timeline</CardTitle></CardHeader>
                <CardContent>
                  <Timeline claim={claim} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* QUERIES */}
            <TabsContent value="queries">
              <QueriesTab claim={claim} canEdit={canEdit} onChanged={refresh} />
            </TabsContent>

            {/* PAYMENTS */}
            <TabsContent value="payments">
              <PaymentsTab claim={claim} canEdit={canEdit} onChanged={refresh} />
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          {claim?.encounterId && (
            <Button
              variant="outline"
              className="mr-auto"
              onClick={() => {
                selectEncounter(claim.encounterId);
                setView("nhia_claims");
                onClose();
              }}
            >
              <FileCode2 className="w-3.5 h-3.5 mr-1.5" />
              Open in NHIA CLAIM-it
            </Button>
          )}
          {claim?.encounterId && (
            <Button
              variant="outline"
              onClick={() => {
                selectEncounter(claim.encounterId);
                setView("nhis_workflow");
                onClose();
              }}
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
              Open NHIS Workflow
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// INFO ROW — simple label / value row for overview cards
// =====================================================================
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-800 text-right">{value}</span>
    </div>
  );
}

// =====================================================================
// TIMELINE — chronological events built from claim timestamps
// =====================================================================
function Timeline({ claim }: { claim: any }) {
  type TEvent = { label: string; date: string; icon: any; color: string; detail?: string };
  const events: TEvent[] = [];

  if (claim.createdAt) events.push({ label: "Claim Created", date: claim.createdAt, icon: FileText, color: "slate", detail: `Draft claim ${claim.claimNumber} created` });
  if (claim.isNhisValidated) events.push({ label: "NHIS Validation Passed", date: claim.createdAt, icon: ShieldCheck, color: "emerald", detail: "All required NHIS fields verified" });
  if (claim.submittedAt) events.push({ label: "Submitted to Provider", date: claim.submittedAt, icon: Send, color: "cyan", detail: `Sent to ${claim.insuranceProvider?.name || "payer"}` });
  if (claim.approvedAt) events.push({ label: claim.status === "partially_approved" ? "Partially Approved" : "Approved", date: claim.approvedAt, icon: CheckCircle2, color: "emerald", detail: `Approved amount: ${formatCurrency(claim.approvedAmount)}` });
  if (claim.rejectedAt) events.push({ label: "Rejected", date: claim.rejectedAt, icon: X, color: "rose", detail: claim.rejectionReason || "Provider rejected claim" });
  if (claim.status === "paid") events.push({ label: "Marked Paid", date: claim.updatedAt, icon: Wallet, color: "emerald", detail: "Insurance payment recorded" });

  // Add queries as timeline events
  (claim.claimQueries || []).forEach((q: any) => {
    events.push({ label: `Query Raised: ${q.queryReason}`, date: q.queriedAt, icon: MessageSquare, color: "amber", detail: q.queryCode ? `Code: ${q.queryCode}` : undefined });
    if (q.response && q.responseAt) {
      events.push({ label: `Query Response: ${q.queryReason}`, date: q.responseAt, icon: MessageSquare, color: "teal", detail: q.response });
    }
  });

  // Add payments as timeline events
  (claim.claimPayments || []).forEach((p: any) => {
    events.push({ label: `Payment Recorded: ${formatCurrency(p.amount)}`, date: p.paymentDate, icon: CreditCard, color: "emerald", detail: p.paymentReference ? `Ref: ${p.paymentReference}` : undefined });
  });

  // Sort chronologically
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (events.length === 0) {
    return <EmptyState title="No timeline events" description="Events will appear as the claim progresses." icon={History} />;
  }

  const colorMap: Record<string, { bg: string; text: string; line: string }> = {
    slate: { bg: "bg-slate-100", text: "text-slate-700", line: "bg-slate-200" },
    emerald: { bg: "bg-emerald-100", text: "text-emerald-700", line: "bg-emerald-200" },
    cyan: { bg: "bg-cyan-100", text: "text-cyan-700", line: "bg-cyan-200" },
    rose: { bg: "bg-rose-100", text: "text-rose-700", line: "bg-rose-200" },
    amber: { bg: "bg-amber-100", text: "text-amber-700", line: "bg-amber-200" },
    teal: { bg: "bg-teal-100", text: "text-teal-700", line: "bg-teal-200" },
  };

  return (
    <div className="relative pl-2">
      {events.map((ev, i) => {
        const c = colorMap[ev.color] || colorMap.slate;
        const Icon = ev.icon;
        const isLast = i === events.length - 1;
        return (
          <div key={i} className="flex gap-3 pb-6 relative">
            {/* Vertical line */}
            {!isLast && <div className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${c.line}`} />}
            {/* Icon */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${c.bg} ${c.text} border-2 border-white shadow-sm`}>
              <Icon className="w-4 h-4" />
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-slate-800">{ev.label}</p>
              <p className="text-xs text-slate-500">{formatDate(ev.date, true)}</p>
              {ev.detail && <p className="text-xs text-slate-600 mt-0.5">{ev.detail}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =====================================================================
// QUERIES TAB — list existing queries + form to add new
// =====================================================================
function QueriesTab({ claim, canEdit, onChanged }: { claim: any; canEdit: boolean; onChanged: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [queryReason, setQueryReason] = useState("");
  const [queryCode, setQueryCode] = useState("");
  const [responseDeadline, setResponseDeadline] = useState("");
  const [assignedToName, setAssignedToName] = useState("");
  const [saving, setSaving] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");

  const queries: any[] = claim.claimQueries || [];

  const submit = async () => {
    if (!queryReason.trim()) { toast.error("Query reason is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/insurance-claims/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: claim.id,
          queryReason: queryReason.trim(),
          queryCode: queryCode.trim() || undefined,
          responseDeadline: responseDeadline || undefined,
          assignedToName: assignedToName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed to create query");
      }
      toast.success("Query raised on claim");
      setQueryReason(""); setQueryCode(""); setResponseDeadline(""); setAssignedToName("");
      setShowForm(false);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const respond = async (queryId: string) => {
    if (!responseText.trim()) { toast.error("Response cannot be empty"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/insurance-claims/queries/${queryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: responseText.trim(), status: "responded" }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed to respond");
      }
      toast.success("Response recorded");
      setRespondingTo(null);
      setResponseText("");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">Claim Queries ({queries.length})</h4>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> {showForm ? "Cancel" : "Raise Query"}
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-3 space-y-2.5">
            <div>
              <FieldLabel required>Query Reason</FieldLabel>
              <Textarea
                value={queryReason}
                onChange={(e) => setQueryReason(e.target.value)}
                placeholder="e.g., Missing ICD-10 diagnosis, invalid NHIS membership number, undocumented service…"
                className="min-h-16"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div>
                <FieldLabel>Query Code</FieldLabel>
                <Input value={queryCode} onChange={(e) => setQueryCode(e.target.value)} placeholder="Payer-specific code" />
              </div>
              <div>
                <FieldLabel>Response Deadline</FieldLabel>
                <Input type="date" value={responseDeadline} onChange={(e) => setResponseDeadline(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Assigned To</FieldLabel>
                <Input value={assignedToName} onChange={(e) => setAssignedToName(e.target.value)} placeholder="Reviewer name" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={submit} disabled={saving} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />} Submit Query
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {queries.length === 0 ? (
        <EmptyState title="No queries on this claim" description="Queries raised by the payer will appear here." icon={MessageSquare} />
      ) : (
        <div className="space-y-2">
          {queries.map((q: any) => (
            <Card key={q.id} className={q.status === "open" ? "border-amber-300" : "border-slate-200"}>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={`text-[10px] capitalize ${q.status === "open" ? "bg-amber-100 text-amber-700" : q.status === "responded" || q.status === "closed" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                        {q.status}
                      </Badge>
                      {q.queryCode && <Badge variant="outline" className="text-[10px] font-mono">{q.queryCode}</Badge>}
                      {q.assignedToName && <span className="text-xs text-slate-500">Assigned: {q.assignedToName}</span>}
                    </div>
                    <p className="text-sm font-medium text-slate-800 mt-1">{q.queryReason}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Raised: {formatDate(q.queriedAt, true)}{q.responseDeadline ? ` • Deadline: ${formatDate(q.responseDeadline)}` : ""}</p>
                    {q.response && (
                      <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
                        <p className="font-semibold mb-0.5">Response ({q.responseAt ? formatDate(q.responseAt, true) : "—"}):</p>
                        {q.response}
                      </div>
                    )}
                  </div>
                  {canEdit && q.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => { setRespondingTo(respondingTo === q.id ? null : q.id); setResponseText(""); }} className="gap-1 text-xs h-7 flex-shrink-0">
                      <MessageSquare className="w-3 h-3" /> Respond
                    </Button>
                  )}
                </div>
                {respondingTo === q.id && (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      placeholder="Type your response to this query…"
                      className="min-h-16"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setRespondingTo(null); setResponseText(""); }}>Cancel</Button>
                      <Button size="sm" onClick={() => respond(q.id)} disabled={saving} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send Response
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// PAYMENTS TAB — list existing payments + form to record new
// =====================================================================
function PaymentsTab({ claim, canEdit, onChanged }: { claim: any; canEdit: boolean; onChanged: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<number>(0);
  const [adjustment, setAdjustment] = useState<number>(0);
  const [paymentStatus, setPaymentStatus] = useState("received");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const payments: any[] = claim.claimPayments || [];
  const totalPaid = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
  const approvedAmount = claim.approvedAmount || claim.claimAmount;
  const outstanding = Math.max(0, approvedAmount - totalPaid);

  const submit = async () => {
    if (!amount || amount <= 0) { toast.error("Payment amount must be greater than zero"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/insurance-claims/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: claim.id,
          paymentReference: paymentReference.trim() || undefined,
          paymentDate: paymentDate || undefined,
          amount,
          adjustment: adjustment || 0,
          paymentStatus,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed to record payment");
      }
      toast.success("Payment recorded");
      setPaymentReference(""); setAmount(0); setAdjustment(0); setNotes(""); setPaymentStatus("received");
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setShowForm(false);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Approved</p>
          <p className="text-sm font-extrabold text-emerald-900 tabular-nums">{formatCurrency(approvedAmount)}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-700">Paid</p>
          <p className="text-sm font-extrabold text-teal-900 tabular-nums">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">Outstanding</p>
          <p className="text-sm font-extrabold text-rose-900 tabular-nums">{formatCurrency(outstanding)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">Payment Records ({payments.length})</h4>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> {showForm ? "Cancel" : "Record Payment"}
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="p-3 space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div>
                <FieldLabel required>Amount</FieldLabel>
                <Input type="number" step="0.01" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} placeholder="0.00" />
              </div>
              <div>
                <FieldLabel>Adjustment (write-off / deduction)</FieldLabel>
                <Input type="number" step="0.01" value={adjustment || ""} onChange={(e) => setAdjustment(Number(e.target.value))} placeholder="0.00" />
              </div>
              <div>
                <FieldLabel>Payment Reference</FieldLabel>
                <Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Payer reference / cheque no." />
              </div>
              <div>
                <FieldLabel>Payment Date</FieldLabel>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Payment Status</FieldLabel>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="cleared">Cleared</SelectItem>
                    <SelectItem value="disputed">Disputed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <FieldLabel>Notes</FieldLabel>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" className="min-h-12" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={submit} disabled={saving} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />} Record Payment
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {payments.length === 0 ? (
        <EmptyState title="No payments recorded" description="Payer payments will appear here once recorded." icon={CreditCard} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-2.5 font-semibold text-slate-700">Date</th>
                    <th className="text-left p-2.5 font-semibold text-slate-700">Reference</th>
                    <th className="text-right p-2.5 font-semibold text-slate-700">Amount</th>
                    <th className="text-right p-2.5 font-semibold text-slate-700">Adjustment</th>
                    <th className="text-left p-2.5 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-2.5 font-semibold text-slate-700">Recorded By</th>
                    <th className="text-left p-2.5 font-semibold text-slate-700">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p: any) => (
                    <tr key={p.id} className="border-b hover:bg-slate-50">
                      <td className="p-2.5 text-xs">{formatDate(p.paymentDate, true)}</td>
                      <td className="p-2.5 font-mono text-xs">{p.paymentReference || "—"}</td>
                      <td className="p-2.5 text-right font-mono font-semibold text-emerald-700">{formatCurrency(p.amount)}</td>
                      <td className="p-2.5 text-right font-mono text-xs text-rose-600">{p.adjustment ? `-${formatCurrency(p.adjustment)}` : "—"}</td>
                      <td className="p-2.5"><StatusBadge status={p.paymentStatus} /></td>
                      <td className="p-2.5 text-xs text-slate-600">{p.recordedByName || "—"}</td>
                      <td className="p-2.5 text-xs text-slate-500 max-w-xs truncate" title={p.notes || ""}>{p.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NewClaimDialog({ open, onClose, onCreated, facilityId }: { open: boolean; onClose: () => void; onCreated: () => void; facilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [claimAmount, setClaimAmount] = useState(0);
  const [claimType, setClaimType] = useState("outpatient");
  const [nhisNumber, setNhisNumber] = useState("");
  const [primaryDx, setPrimaryDx] = useState<EntitySelectValue | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search-claim", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  // Get patient's full record to read insurance providers + NHIS number
  const { data: patientData } = useQuery({
    queryKey: ["patient-detail-claim", patientId],
    queryFn: () => fetchJson(`/api/patients/${patientId}`),
    enabled: !!patientId,
  });

  // Get outstanding invoices
  const { data: invoicesData } = useQuery({
    queryKey: ["patient-invoices-claim", patientId, facilityId],
    queryFn: () => fetchJson(`/api/invoices?patientId=${patientId}${facilityId ? `&facilityId=${facilityId}` : ""}`),
    enabled: !!patientId,
  });

  const outstandingInvoices = (invoicesData?.items || []).filter((i: any) => i.balance > 0 && i.status !== "cancelled");
  const insuranceProviders = patientData?.patient?.insurance || [];

  // Detect if selected provider is NHIS
  const selectedProvider = insuranceProviders.find((pi: any) => pi.insuranceProviderId === providerId);
  const isNhisProvider = selectedProvider?.insuranceProvider?.code?.toUpperCase().includes("NHIS") ||
    selectedProvider?.insuranceProvider?.name?.toUpperCase().includes("NHIS") || false;

  // Auto-fill NHIS number from patient's insurance record
  const providerNhishNumber = selectedProvider?.membershipNumber || "";

  // NHIS validation checks
  const nhisValidationIssues: string[] = [];
  if (isNhisProvider) {
    if (!nhisNumber) nhisValidationIssues.push("NHIS membership number required");
    if (!primaryDx?.id) nhisValidationIssues.push("Primary ICD-10 diagnosis required (select from catalog)");
  }
  const isNhisValid = nhisValidationIssues.length === 0;

  const selectPatient = (p: any) => {
    setPatientId(p.id);
    setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
    setInvoiceId(""); setProviderId(""); setClaimAmount(0);
    setNhisNumber(""); setPrimaryDx(null);
  };

  const selectInvoice = (id: string) => {
    const inv = outstandingInvoices.find((i: any) => i.id === id);
    if (inv) {
      setInvoiceId(inv.id);
      setClaimAmount(inv.balance);
    }
  };

  const selectProvider = (id: string) => {
    setProviderId(id);
    // Auto-fill NHIS number if available
    const pi = insuranceProviders.find((p: any) => p.insuranceProviderId === id);
    if (pi?.membershipNumber) setNhisNumber(pi.membershipNumber);
  };

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    if (!invoiceId) { toast.error("Please select an outstanding invoice"); return; }
    if (!providerId) { toast.error("Please select an insurance provider"); return; }
    if (!claimAmount || claimAmount <= 0) { toast.error("Claim amount must be > 0"); return; }
    if (isNhisProvider && !isNhisValid) {
      toast.error("NHIS validation failed: " + nhisValidationIssues.join(", "));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/insurance-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          facilityId,
          insuranceProviderId: providerId,
          invoiceId,
          claimAmount,
          claimType,
          nhisNumber: nhisNumber || undefined,
          primaryDiagnosisCatalogId: primaryDx?.id || undefined,
          primaryDiagnosisCode: primaryDx?.code || undefined,
          primaryDiagnosisName: primaryDx?.label || undefined,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success(isNhisProvider ? "NHIS claim created as draft — validated ✓" : "Claim created as draft");
      setPatientQuery(""); setPatientId(""); setInvoiceId(""); setProviderId(""); setClaimAmount(0);
      setNhisNumber(""); setPrimaryDx(null); setClaimType("outpatient");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><ShieldCheck className="w-5 h-5" /> New Insurance Claim</DialogTitle>
          <DialogDescription className="text-white/80">
            File a claim against an outstanding invoice. NHIS claims require ICD-10 diagnosis codes and NHIS membership number per Ghana NHIS policy.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
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
            <>
              <div>
                <FieldLabel required>Insurance Provider</FieldLabel>
                {insuranceProviders.length === 0 ? (
                  <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded">This patient has no registered insurance. Add insurance in the patient record first.</div>
                ) : (
                  <Select value={providerId || undefined} onValueChange={selectProvider}>
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>
                      {insuranceProviders.map((pi: any) => (
                        <SelectItem key={pi.id} value={pi.insuranceProviderId}>
                          {pi.insuranceProvider?.name}
                          {pi.insuranceProvider?.code?.toUpperCase().includes("NHIS") && <Badge variant="secondary" className="ml-2 text-[9px]">NHIS</Badge>}
                          {pi.membershipNumber ? ` • ${pi.membershipNumber}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* NHIS fields — shown when NHIS provider is selected */}
              {isNhisProvider && (
                <div className="border border-emerald-200 rounded-lg p-3 bg-emerald-50/30 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Ghana NHIS Compliance
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel required>NHIS Membership Number</FieldLabel>
                      <Input value={nhisNumber} onChange={(e) => setNhisNumber(e.target.value)} placeholder="NHIS number or Ghana Card" />
                      {providerNhishNumber && providerNhishNumber !== nhisNumber && (
                        <p className="text-[10px] text-slate-500 mt-1">Auto-filled from patient record</p>
                      )}
                    </div>
                    <div>
                      <FieldLabel required>Claim Type</FieldLabel>
                      <Select value={claimType} onValueChange={setClaimType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="outpatient">Outpatient</SelectItem>
                          <SelectItem value="inpatient">Inpatient</SelectItem>
                          <SelectItem value="day_case">Day Case</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Primary Diagnosis — ICD-10 from catalog */}
                  <EntitySelect
                    label="Primary Diagnosis (ICD-10) — required for NHIS"
                    required
                    endpoint="/api/diagnoses/catalog"
                    queryParam="q"
                    queryParams={{ limit: "20" }}
                    getLabel={(item: any) => item.name}
                    getId={(item: any) => item.id}
                    getSubtitle={(item: any) => {
                      const parts = [item.category, item.nhisGdrgCode ? `G-DRG: ${item.nhisGdrgCode}` : null].filter(Boolean);
                      return parts.length ? parts.join(" · ") : null;
                    }}
                    getCode={(item: any) => item.code}
                    placeholder="Search ICD-10 diagnosis by name or code (e.g., 'I10', 'malaria')..."
                    value={primaryDx}
                    onChange={setPrimaryDx}
                    allowManual
                  />

                  {/* NHIS validation status */}
                  {nhisValidationIssues.length > 0 ? (
                    <div className="flex items-start gap-2 p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">NHIS Validation Issues:</p>
                        <ul className="list-disc list-inside mt-1">
                          {nhisValidationIssues.map((issue, i) => <li key={i}>{issue}</li>)}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" /> NHIS validation passed — ready for CLAIM-it submission
                    </div>
                  )}
                </div>
              )}

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

              <div>
                <FieldLabel required>Claim Amount</FieldLabel>
                <Input type="number" step="0.01" value={claimAmount} onChange={(e) => setClaimAmount(Number(e.target.value))} />
                <p className="text-[10px] text-slate-500 mt-1">Defaulted to invoice balance</p>
              </div>
            </>
          )}
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !patientId || !invoiceId || !providerId || !claimAmount || (isNhisProvider && !isNhisValid)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Creating..." : <><ShieldCheck className="w-4 h-4" /> Create Draft Claim</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartialApprovalDialog({ claim, onClose, onDone }: { claim: any; onClose: () => void; onDone: () => void }) {
  const [approvedAmount, setApprovedAmount] = useState(claim.claimAmount);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!approvedAmount || approvedAmount <= 0) { toast.error("Approved amount must be > 0"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/insurance-claims/${claim.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "partially_approve", approvedAmount }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success(`Claim partially approved for ${formatCurrency(approvedAmount)}`);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><DollarSign className="w-5 h-5" /> Partial Approval</DialogTitle>
          <DialogDescription className="text-white/80">
            Claim {claim.claimNumber} • Original claim amount: {formatCurrency(claim.claimAmount)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <div>
            <FieldLabel required>Approved Amount</FieldLabel>
            <Input type="number" step="0.01" value={approvedAmount} onChange={(e) => setApprovedAmount(Number(e.target.value))} />
            <p className="text-[10px] text-slate-500 mt-1">Must be less than the claim amount ({formatCurrency(claim.claimAmount)})</p>
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Approving..." : "Confirm Partial Approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// BULK CLAIMS DIALOG — generate multiple NHIS claims in batch
// =====================================================================
function BulkClaimsDialog({ facilityId, onClose, onCreated }: { facilityId: string | null; onClose: () => void; onCreated: () => void }) {
  const [providerId, setProviderId] = useState("");
  const [claimType, setClaimType] = useState("outpatient");
  const [defaultDx, setDefaultDx] = useState<EntitySelectValue | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [searchPatient, setSearchPatient] = useState("");
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<any>(null);

  // Fetch all outstanding invoices for the facility
  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ["bulk-invoices", facilityId],
    queryFn: () => fetchJson(`/api/invoices?facilityId=${facilityId || ""}&status=unpaid&limit=200`),
    enabled: !!facilityId,
  });

  // Fetch NHIS insurance providers
  const { data: providersData } = useQuery({
    queryKey: ["nhis-providers"],
    queryFn: () => fetchJson("/api/insurance-providers"),
  });
  const providers = (providersData?.items || providersData?.providers || []).filter((p: any) =>
    p.code?.toUpperCase().includes("NHIS") || p.name?.toUpperCase().includes("NHIS") || true
  );

  // Search patients to filter invoices
  const { data: patientsData } = useQuery({
    queryKey: ["bulk-patient-search", searchPatient],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(searchPatient)}`),
    enabled: searchPatient.length >= 2,
  });

  const allInvoices: any[] = invoicesData?.items || [];
  const outstandingInvoices = allInvoices.filter((i: any) => i.balance > 0 && i.status !== "cancelled");

  // Filter by patient search
  const filteredInvoices = searchPatient.length >= 2 && patientsData?.patients
    ? outstandingInvoices.filter((inv: any) =>
        patientsData.patients.some((p: any) => p.id === inv.patientId))
    : outstandingInvoices;

  const toggleInvoice = (id: string) => {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedInvoices(new Set(filteredInvoices.map((i: any) => i.id)));
  };

  const clearAll = () => {
    setSelectedInvoices(new Set());
  };

  const submit = async () => {
    if (!facilityId) { toast.error("No facility selected"); return; }
    if (!providerId) { toast.error("Please select an insurance provider"); return; }
    if (selectedInvoices.size === 0) { toast.error("Select at least one invoice"); return; }

    setSaving(true);
    setResults(null);
    try {
      const items = Array.from(selectedInvoices).map((invoiceId) => {
        const inv = outstandingInvoices.find((i: any) => i.id === invoiceId);
        return {
          patientId: inv?.patientId,
          invoiceId,
          claimAmount: inv?.balance,
          primaryDiagnosisCatalogId: defaultDx?.id,
          primaryDiagnosisCode: defaultDx?.code,
          primaryDiagnosisName: defaultDx?.label,
        };
      });

      const res = await fetch("/api/insurance-claims/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId,
          insuranceProviderId: providerId,
          claimType,
          items,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Bulk generation failed");
      }
      const data = await safeJson(res);
      setResults(data);
      if (data.summary.failed === 0) {
        toast.success(`Generated ${data.summary.success} claims successfully`);
        onCreated();
      } else {
        toast.warning(`${data.summary.success} created, ${data.summary.failed} failed — see results`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Layers className="w-5 h-5" />
            Bulk NHIS Claim Generation
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Select multiple outstanding invoices and generate NHIS claims in a single batch.
            All claims will be created as drafts with the same provider and diagnosis.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          /* Results view */
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">{results.summary.success}</p>
                <p className="text-xs text-emerald-600">Claims Created</p>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-rose-700">{results.summary.failed}</p>
                <p className="text-xs text-rose-600">Failed</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-700">{results.summary.total}</p>
                <p className="text-xs text-slate-600">Total Processed</p>
              </div>
            </div>

            {results.created.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-700">Created Claims ({results.created.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Claim #</th>
                          <th className="text-left p-2">Amount</th>
                          <th className="text-left p-2">Validated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.created.map((c: any) => (
                          <tr key={c.claimId} className="border-b">
                            <td className="p-2 font-mono">{c.claimNumber}</td>
                            <td className="p-2">{formatCurrency(c.claimAmount)}</td>
                            <td className="p-2">{c.isNhisValidated ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {results.failed.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-rose-700">Failed ({results.failed.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-32 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Invoice ID</th>
                          <th className="text-left p-2">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.failed.map((f: any, i: number) => (
                          <tr key={i} className="border-b">
                            <td className="p-2 font-mono text-[10px]">{f.invoiceId?.slice(-8) || "—"}</td>
                            <td className="p-2 text-rose-600">{f.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <DialogFooter className="p-6 pt-4 shrink-0 border-t">
              <Button onClick={onCreated} className="gap-2 bg-emerald-600 hover:bg-emerald-700">Done</Button>
            </DialogFooter>
          </div>
        ) : (
          /* Setup + selection view */
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {/* Provider + claim type + default diagnosis */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Insurance Provider</FieldLabel>
                <Select value={providerId || undefined} onValueChange={setProviderId}>
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {providers.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.code?.toUpperCase().includes("NHIS") && <Badge variant="secondary" className="ml-2 text-[9px]">NHIS</Badge>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel required>Claim Type</FieldLabel>
                <Select value={claimType} onValueChange={setClaimType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outpatient">Outpatient</SelectItem>
                    <SelectItem value="inpatient">Inpatient</SelectItem>
                    <SelectItem value="day_case">Day Case</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <EntitySelect
              label="Default Primary Diagnosis (applied to all claims) — optional"
              endpoint="/api/diagnoses/catalog"
              queryParam="q"
              queryParams={{ limit: "20" }}
              getLabel={(item: any) => item.name}
              getId={(item: any) => item.id}
              getSubtitle={(item: any) => item.category}
              getCode={(item: any) => item.code}
              placeholder="Search ICD-10 diagnosis to apply to all claims..."
              value={defaultDx}
              onChange={setDefaultDx}
              allowManual
            />

            {/* Patient search filter */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <Input
                placeholder="Filter by patient name or number (optional)..."
                value={searchPatient}
                onChange={(e) => setSearchPatient(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Invoice selection table */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">
                  Outstanding Invoices ({filteredInvoices.length})
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={selectAll} disabled={filteredInvoices.length === 0}>Select All</Button>
                  <Button size="sm" variant="outline" onClick={clearAll} disabled={selectedInvoices.size === 0}>Clear</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? <LoadingState rows={4} /> :
                 filteredInvoices.length === 0 ? <p className="p-4 text-sm text-slate-500 text-center">No outstanding invoices found.</p> :
                 <div className="max-h-64 overflow-y-auto">
                   <table className="w-full text-xs">
                     <thead className="bg-slate-50 sticky top-0">
                       <tr>
                         <th className="p-2 w-8"><input type="checkbox" checked={selectedInvoices.size === filteredInvoices.length && filteredInvoices.length > 0} onChange={(e) => e.target.checked ? selectAll() : clearAll()} /></th>
                         <th className="text-left p-2">Invoice #</th>
                         <th className="text-left p-2">Patient</th>
                         <th className="text-right p-2">Balance</th>
                       </tr>
                     </thead>
                     <tbody>
                       {filteredInvoices.slice(0, 100).map((inv: any) => (
                         <tr key={inv.id} className={`border-b cursor-pointer hover:bg-slate-50 ${selectedInvoices.has(inv.id) ? "bg-emerald-50" : ""}`} onClick={() => toggleInvoice(inv.id)}>
                           <td className="p-2"><input type="checkbox" checked={selectedInvoices.has(inv.id)} onChange={() => toggleInvoice(inv.id)} /></td>
                           <td className="p-2 font-mono">{inv.invoiceNumber}</td>
                           <td className="p-2">{inv.patient?.firstName} {inv.patient?.lastName} <span className="text-slate-400">({inv.patient?.patientNumber})</span></td>
                           <td className="p-2 text-right font-semibold">{formatCurrency(inv.balance)}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                   {filteredInvoices.length > 100 && <p className="p-2 text-center text-xs text-slate-500">Showing first 100 of {filteredInvoices.length}. Refine search to see more.</p>}
                 </div>}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                <strong className="text-emerald-700">{selectedInvoices.size}</strong> invoice{selectedInvoices.size === 1 ? "" : "s"} selected
              </span>
              <span className="text-slate-500">
                Total: {formatCurrency(Array.from(selectedInvoices).reduce((sum, id) => sum + (outstandingInvoices.find((i: any) => i.id === id)?.balance || 0), 0))}
              </span>
            </div>

            <DialogFooter className="p-6 pt-4 shrink-0 border-t">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={saving || !providerId || selectedInvoices.size === 0} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</> : <><Layers className="w-4 h-4" /> Generate {selectedInvoices.size} Claims</>}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

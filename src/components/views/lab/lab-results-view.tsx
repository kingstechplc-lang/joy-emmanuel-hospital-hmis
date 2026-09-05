"use client";
import { useState, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, AlertTriangle, History, TestTube, CheckCircle2, Gauge, RefreshCw, FlaskConical, Send, Clock, MoreHorizontal, Printer, FileText } from "lucide-react";
import { PrintButton, PrintLayout } from "@/components/print/print-layout";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, safeJson, PageHeader, ClearableSearch, MiniStatCard} from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "verified", label: "Verified" },
  { value: "released", label: "Released" },
  { value: "amended", label: "Amended" },
  { value: "entered", label: "Entered" },
];

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
];

const ABNORMAL_FLAG_COLORS: Record<string, string> = {
  normal: "bg-emerald-100 text-emerald-700 border-emerald-200",
  low: "bg-amber-100 text-amber-700 border-amber-200",
  high: "bg-amber-100 text-amber-700 border-amber-200",
  critical_low: "bg-rose-100 text-rose-700 border-rose-200",
  critical_high: "bg-rose-100 text-rose-700 border-rose-200",
};

export function LabResultsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [amendResult, setAmendResult] = useState<any | null>(null);
  // State for the result-selection dialog (shown when main-row Amend is clicked
  // and the order has multiple amendable results — prevents silent first-result selection)
  const [amendSelectGroup, setAmendSelectGroup] = useState<any[] | null>(null);

  // KPI range state
  const [kpiRange, setKpiRange] = useState("today");
  const [kpiCustomStart, setKpiCustomStart] = useState("");
  const [kpiCustomEnd, setKpiCustomEnd] = useState("");

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (abnormalOnly) params.set("abnormalOnly", "1");
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["lab-results", activeFacilityId, statusFilter, abnormalOnly, search],
    queryFn: () => fetchJson(`/api/lab-results${qs}`),
    enabled: !!activeFacilityId,
  });

  // KPI query (server-side aggregate)
  const kpiQuery = useQuery({
    queryKey: ["lab-results-stats", activeFacilityId, kpiRange, kpiCustomStart, kpiCustomEnd],
    queryFn: () => {
      const p = new URLSearchParams();
      if (activeFacilityId) p.set("facilityId", activeFacilityId);
      p.set("range", kpiRange);
      if (kpiRange === "custom" && kpiCustomStart && kpiCustomEnd) {
        p.set("startDate", kpiCustomStart);
        p.set("endDate", kpiCustomEnd);
      }
      return fetchJson(`/api/lab-results/stats?${p.toString()}`);
    },
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lab-results"] });
    qc.invalidateQueries({ queryKey: ["lab-results-stats"] });
  };

  const k = kpiQuery.data?.kpis;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laboratory Results"
        description="View, verify, and release lab test results"
        icon={TestTube}
        gradient="from-cyan-500 to-blue-600"
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view lab results.</CardContent></Card>
      )}

      {/* KPI / Statistics Dashboard */}
      {activeFacilityId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-cyan-600" /> Lab Results Statistics
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Live KPIs from the database for the selected date range.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-slate-500">Range:</Label>
                <Select value={kpiRange} onValueChange={setKpiRange}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RANGE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {kpiRange === "custom" && (
                  <div className="flex items-center gap-1">
                    <Input type="date" value={kpiCustomStart} onChange={(e) => setKpiCustomStart(e.target.value)} className="h-8 w-36 text-xs" />
                    <span className="text-xs text-slate-400">to</span>
                    <Input type="date" value={kpiCustomEnd} onChange={(e) => setKpiCustomEnd(e.target.value)} className="h-8 w-36 text-xs" />
                  </div>
                )}
                <Button variant="ghost" size="sm" disabled={kpiQuery.isFetching} onClick={() => kpiQuery.refetch()} className="h-8 px-2" title="Refresh KPIs">
                  <RefreshCw className={`w-3.5 h-3.5 ${kpiQuery.isFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {kpiQuery.isError ? (
              <ErrorState message="Failed to load KPIs" onRetry={() => kpiQuery.refetch()} />
            ) : kpiQuery.isLoading || !k ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" aria-hidden="true" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MiniStatCard label="Total Results" value={k.totalResults?.value ?? 0} icon={TestTube} gradient="from-cyan-500 to-cyan-600" />
                <MiniStatCard label="Today's Results" value={k.todayResults?.value ?? 0} icon={FlaskConical} gradient="from-blue-500 to-blue-600" />
                <MiniStatCard label="Abnormal" value={k.abnormalResults?.value ?? 0} icon={AlertTriangle} gradient="from-amber-500 to-amber-600" />
                <MiniStatCard label="Critical" value={k.criticalResults?.value ?? 0} icon={AlertTriangle} gradient="from-red-500 to-rose-600" />
                <MiniStatCard label="Pending Verification" value={k.pendingVerification?.value ?? 0} icon={Clock} gradient="from-orange-500 to-orange-600" />
                <MiniStatCard label="Released" value={k.released?.value ?? 0} icon={Send} gradient="from-emerald-500 to-emerald-600" />
                <MiniStatCard label="Amended" value={k.amended?.value ?? 0} icon={History} gradient="from-violet-500 to-violet-600" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search + Filter controls */}
      {activeFacilityId && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Search Lab Results</Label>
              <ClearableSearch
                value={search}
                onChange={setSearch}
                placeholder="Search by order number, patient name, or MRN…"
                inputClassName="text-sm"
                className="max-w-3xl"
              />
              <p className="text-[10px] text-slate-500 mt-1">Server-side search via lab order number and patient fields.</p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
                <SelectTrigger className="md:w-48 h-8 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <Checkbox checked={abnormalOnly} onCheckedChange={(v) => setAbnormalOnly(!!v)} />
                Show abnormal only
              </label>
              {(statusFilter !== "all" || abnormalOnly || search) && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setStatusFilter("all"); setAbnormalOnly(false); setSearch(""); }}>
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load lab results" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="No lab results" description="Verified/released results will appear here once lab orders are processed." />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700 w-6"></th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Order #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Tests</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Flag Summary</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Entered</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Group results by labOrder.id so the same patient+encounter is shown only once.
                    // Each group expands to reveal the individual test results in a NESTED panel.
                    // CRITICAL: We retain each result's real LabResult ID (r.id) so per-result
                    // Amend and Print Test actions always target the correct result — never the
                    // first result by array order.
                    const groups: Record<string, any[]> = {};
                    for (const r of data.items as any[]) {
                      const orderId = r.labOrderItem?.labOrder?.id || "unknown";
                      if (!groups[orderId]) groups[orderId] = [];
                      groups[orderId].push(r);
                    }

                    return Object.entries(groups).map(([orderId, results]) => {
                      // Note: `first` is only used for shared display context (patient, order
                      // number, encounter) — NEVER for amend/print identification.
                      const first = results[0];
                      const patient = first.labOrderItem?.labOrder?.patient;
                      const orderNumber = first.labOrderItem?.labOrder?.orderNumber;
                      const encounter = first.labOrderItem?.labOrder?.encounter;
                      const facility = first.labOrderItem?.labOrder?.facility;
                      const orderingClinician = first.labOrderItem?.labOrder?.orderingClinician;
                      const testCount = results.length;
                      const testNames = results.map((r: any) => r.labOrderItem?.laboratoryTest?.name || "Test");

                      // Aggregate flag info
                      const hasCritical = results.some((r: any) => r.criticalFlag || r.abnormalFlag === "critical_low" || r.abnormalFlag === "critical_high");
                      const hasAbnormal = results.some((r: any) => r.abnormalFlag && r.abnormalFlag !== "normal" && !r.criticalFlag && r.abnormalFlag !== "critical_low" && r.abnormalFlag !== "critical_high");
                      const allNormal = results.every((r: any) => !r.abnormalFlag || r.abnormalFlag === "normal");

                      // Aggregate status — use the most "advanced" status
                      const statusPriority: Record<string, number> = { released: 5, verified: 4, resulted: 3, amended: 3, entered: 2 };
                      const aggregateStatus = results.reduce((acc: string, r: any) => {
                        const rP = statusPriority[r.status] || 0;
                        const accP = statusPriority[acc] || 0;
                        return rP > accP ? r.status : acc;
                      }, "entered");

                      // Latest enteredAt
                      const latestEntered = results
                        .map((r: any) => r.enteredAt ? new Date(r.enteredAt).getTime() : 0)
                        .reduce((max: number, t: number) => Math.max(max, t), 0);

                      const groupKey = orderId;
                      const expanded = expandedId === groupKey;

                      // Determine amendable results in this group (for the main-row Amend action)
                      const amendableResults = results.filter((r: any) => (r.status === "verified" || r.status === "released") && can("lab.amend"));

                      return (
                        <Fragment key={groupKey}>
                          {/* === PARENT ROW: Lab Order === */}
                          <tr
                            className={`border-b hover:bg-emerald-50/40 cursor-pointer ${hasCritical ? "bg-rose-50/40" : hasAbnormal ? "bg-amber-50/30" : ""}`}
                            onClick={() => setExpandedId(expanded ? null : groupKey)}
                          >
                            <td className="p-3 text-slate-400">
                              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </td>
                            <td className="p-3">
                              <div className="font-medium text-slate-900">{patient?.firstName} {patient?.lastName}</div>
                              <div className="text-xs text-slate-500">{patient?.patientNumber}</div>
                              {encounter?.encounterNumber && (
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">Enc: {encounter.encounterNumber}</div>
                              )}
                            </td>
                            <td className="p-3 font-mono text-xs text-slate-700">{orderNumber}</td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                {testNames.slice(0, 3).map((name: any, i: number) => (
                                  <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                                    {name}
                                  </span>
                                ))}
                                {testCount > 3 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-medium">
                                    +{testCount - 3} more
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              {hasCritical ? (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Critical
                                </Badge>
                              ) : hasAbnormal ? (
                                <Badge className="bg-amber-100 text-amber-700 border border-amber-200">Abnormal</Badge>
                              ) : allNormal ? (
                                <span className="text-xs text-slate-500">All Normal</span>
                              ) : (
                                <span className="text-xs text-slate-500">—</span>
                              )}
                            </td>
                            <td className="p-3 text-xs text-slate-600">
                              {latestEntered ? formatDate(new Date(latestEntered), true) : "—"}
                            </td>
                            <td className="p-3"><StatusBadge status={aggregateStatus} /></td>
                            <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                              {/* Main-row Amend: open result-selection dialog instead of
                                  silently picking the first result. */}
                              {amendableResults.length === 1 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setAmendResult(amendableResults[0])}
                                  className="gap-1 h-7 text-xs"
                                  title={`Amend ${amendableResults[0].labOrderItem?.laboratoryTest?.name || "result"}`}
                                >
                                  <History className="w-3 h-3" /> Amend
                                </Button>
                              )}
                              {amendableResults.length > 1 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setAmendSelectGroup(amendableResults)}
                                  className="gap-1 h-7 text-xs"
                                  title="Select which result to amend"
                                >
                                  <History className="w-3 h-3" /> Amend…
                                </Button>
                              )}
                            </td>
                          </tr>

                          {/* === NESTED RESULTS PANEL (visually distinct from main table) === */}
                          {expanded && (
                            <tr>
                              <td colSpan={8} className="p-0 bg-slate-100/60">
                                <div className="px-6 py-4 border-l-4 border-emerald-300 ml-3 my-2 bg-white rounded-r-lg shadow-sm">
                                  <div className="flex items-center justify-between mb-3">
                                    <div>
                                      <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                        <TestTube className="w-4 h-4 text-emerald-600" />
                                        Laboratory Results
                                        <span className="text-xs font-normal text-slate-500">
                                          ({testCount} test{testCount > 1 ? "s" : ""} for order {orderNumber})
                                        </span>
                                      </h4>
                                      <p className="text-[10px] text-slate-500 mt-0.5">
                                        Patient: {patient?.firstName} {patient?.lastName} • Encounter: {encounter?.encounterNumber || "—"}
                                      </p>
                                    </div>
                                    {/* Full-order print action — prints ALL tests in this order */}
                                    {results.some((r: any) => r.status === "released" || r.status === "verified") && (
                                      <PrintButton
                                        label="Print Full Report"
                                        className="text-xs h-8"
                                        renderContent={() => (
                                          <PrintLayout
                                            title="Laboratory Test Report"
                                            subtitle={orderNumber}
                                            documentNumber={orderNumber}
                                            facility={facility}
                                            patient={patient}
                                            signatory={orderingClinician ? `Dr. ${orderingClinician.firstName} ${orderingClinician.lastName}` : undefined}
                                            signatoryRole="Ordering Physician"
                                          >
                                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                              <thead>
                                                <tr style={{ background: "#f1f5f9" }}>
                                                  <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Test</th>
                                                  <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Result</th>
                                                  <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Unit</th>
                                                  <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Ref Range</th>
                                                  <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Flag</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {results.map((r: any) => (
                                                  <tr key={r.id}>
                                                    <td style={{ padding: "6px 8px", fontWeight: 500 }}>{r.labOrderItem?.laboratoryTest?.name}</td>
                                                    <td style={{ padding: "6px 8px", fontWeight: 700, color: r.criticalFlag ? "#be123c" : r.abnormalFlag && r.abnormalFlag !== "normal" ? "#d97706" : "#0f172a" }}>
                                                      {(r.numericValue ?? r.resultValue) || "—"}
                                                      {r.criticalFlag && " ⚠ CRITICAL"}
                                                    </td>
                                                    <td style={{ padding: "6px 8px" }}>{r.unit || "—"}</td>
                                                    <td style={{ padding: "6px 8px" }}>{r.referenceRange || "—"}</td>
                                                    <td style={{ padding: "6px 8px" }}>{r.abnormalFlag?.replace(/_/g, " ") || "normal"}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                            <div style={{ marginTop: "16px", fontSize: "11px", color: "#64748b" }}>
                                              <p><strong>Result entered:</strong> {latestEntered ? new Date(latestEntered).toLocaleString("en-GB") : "—"}</p>
                                              <p><strong>Order:</strong> {orderNumber}</p>
                                              <p><strong>Patient:</strong> {patient?.firstName} {patient?.lastName} ({patient?.patientNumber})</p>
                                            </div>
                                          </PrintLayout>
                                        )}
                                      />
                                    )}
                                  </div>

                                  {/* Individual results — clean nested table */}
                                  <div className="overflow-x-auto rounded border border-slate-200">
                                    <table className="w-full text-xs bg-white">
                                      <thead className="bg-slate-100">
                                        <tr>
                                          <th className="text-left p-2 font-semibold text-slate-700">Test</th>
                                          <th className="text-left p-2 font-semibold text-slate-700">Result</th>
                                          <th className="text-left p-2 font-semibold text-slate-700">Ref Range</th>
                                          <th className="text-left p-2 font-semibold text-slate-700">Flag</th>
                                          <th className="text-left p-2 font-semibold text-slate-700">Entered</th>
                                          <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                                          <th className="text-right p-2 font-semibold text-slate-700">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {results.map((r: any) => {
                                          const isAbnormal = r.abnormalFlag && r.abnormalFlag !== "normal";
                                          const isCritical = r.criticalFlag || r.abnormalFlag === "critical_low" || r.abnormalFlag === "critical_high";
                                          return (
                                            <tr key={r.id} className={`border-t hover:bg-emerald-50/30 ${isCritical ? "bg-rose-50/30" : ""}`}>
                                              <td className="p-2">
                                                <div className="font-medium text-slate-900">{r.labOrderItem?.laboratoryTest?.name}</div>
                                                <div className="text-[10px] text-slate-500">{r.labOrderItem?.laboratoryTest?.code}</div>
                                              </td>
                                              <td className="p-2">
                                                <span className={`font-mono font-semibold ${isCritical ? "text-rose-700" : isAbnormal ? "text-amber-700" : "text-slate-900"}`}>
                                                  {r.numericValue != null ? r.numericValue : r.resultValue || "—"}
                                                  {r.unit && <span className="text-[10px] text-slate-500 ml-1">{r.unit}</span>}
                                                </span>
                                              </td>
                                              <td className="p-2 text-slate-600">{r.referenceRange || "—"}</td>
                                              <td className="p-2">
                                                {isCritical ? (
                                                  <Badge variant="destructive" className="gap-1 text-[10px]"><AlertTriangle className="w-3 h-3" /> {r.abnormalFlag?.replace("_", " ")}</Badge>
                                                ) : isAbnormal ? (
                                                  <Badge className={`${ABNORMAL_FLAG_COLORS[r.abnormalFlag]} border text-[10px]`}>{r.abnormalFlag}</Badge>
                                                ) : (
                                                  <span className="text-slate-500">Normal</span>
                                                )}
                                              </td>
                                              <td className="p-2 text-slate-600">{formatDate(r.enteredAt, true)}</td>
                                              <td className="p-2"><StatusBadge status={r.status} /></td>
                                              <td className="p-2 text-right whitespace-nowrap">
                                                {/* Per-result Amend — uses r.id directly (no first-result fallback) */}
                                                {(r.status === "verified" || r.status === "released") && can("lab.amend") && (
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setAmendResult(r)}
                                                    className="gap-1 h-6 text-[10px] mr-1"
                                                    title={`Amend ${r.labOrderItem?.laboratoryTest?.name}`}
                                                  >
                                                    <History className="w-3 h-3" /> Amend
                                                  </Button>
                                                )}
                                                {/* Per-result Print Test — prints ONLY this single result */}
                                                {(r.status === "verified" || r.status === "released") && (
                                                  <PrintButton
                                                    label="Print Test"
                                                    className="text-[10px] h-6 mr-1"
                                                    renderContent={() => (
                                                      <PrintLayout
                                                        title="Laboratory Test Report"
                                                        subtitle={r.labOrderItem?.laboratoryTest?.name}
                                                        documentNumber={orderNumber}
                                                        facility={facility}
                                                        patient={patient}
                                                        signatory={orderingClinician ? `Dr. ${orderingClinician.firstName} ${orderingClinician.lastName}` : undefined}
                                                        signatoryRole="Ordering Physician"
                                                      >
                                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                                          <tbody>
                                                            <tr>
                                                              <td style={{ padding: "6px 8px", fontWeight: 600, width: "30%" }}>Test</td>
                                                              <td style={{ padding: "6px 8px" }}>{r.labOrderItem?.laboratoryTest?.name}</td>
                                                            </tr>
                                                            <tr style={{ background: "#f8fafc" }}>
                                                              <td style={{ padding: "6px 8px", fontWeight: 600 }}>Specimen</td>
                                                              <td style={{ padding: "6px 8px" }}>{r.labOrderItem?.laboratoryTest?.specimenType || "—"}</td>
                                                            </tr>
                                                            <tr>
                                                              <td style={{ padding: "6px 8px", fontWeight: 600 }}>Result</td>
                                                              <td style={{ padding: "6px 8px", fontWeight: 700, color: r.criticalFlag ? "#be123c" : r.abnormalFlag && r.abnormalFlag !== "normal" ? "#d97706" : "#0f172a" }}>
                                                                {(r.numericValue ?? r.resultValue) || "—"}
                                                                {r.criticalFlag && " ⚠ CRITICAL"}
                                                              </td>
                                                            </tr>
                                                            <tr style={{ background: "#f8fafc" }}>
                                                              <td style={{ padding: "6px 8px", fontWeight: 600 }}>Unit</td>
                                                              <td style={{ padding: "6px 8px" }}>{r.unit || "—"}</td>
                                                            </tr>
                                                            <tr>
                                                              <td style={{ padding: "6px 8px", fontWeight: 600 }}>Reference Range</td>
                                                              <td style={{ padding: "6px 8px" }}>{r.referenceRange || "—"}</td>
                                                            </tr>
                                                            <tr style={{ background: "#f8fafc" }}>
                                                              <td style={{ padding: "6px 8px", fontWeight: 600 }}>Flag</td>
                                                              <td style={{ padding: "6px 8px" }}>{r.abnormalFlag?.replace(/_/g, " ") || "normal"}</td>
                                                            </tr>
                                                            <tr>
                                                              <td style={{ padding: "6px 8px", fontWeight: 600 }}>Status</td>
                                                              <td style={{ padding: "6px 8px" }}>{r.status}</td>
                                                            </tr>
                                                          </tbody>
                                                        </table>
                                                        <div style={{ marginTop: "16px", fontSize: "11px", color: "#64748b" }}>
                                                          <p><strong>Lab Order:</strong> {orderNumber}</p>
                                                          <p><strong>Encounter:</strong> {encounter?.encounterNumber || "—"}</p>
                                                          <p><strong>Result entered:</strong> {r.enteredAt ? new Date(r.enteredAt).toLocaleString("en-GB") : "—"}</p>
                                                          <p><strong>Verified:</strong> {r.verifiedAt ? new Date(r.verifiedAt).toLocaleString("en-GB") : "—"}</p>
                                                          <p><strong>Released:</strong> {r.releasedAt ? new Date(r.releasedAt).toLocaleString("en-GB") : "—"}</p>
                                                          {r.resultNotes && <p><strong>Notes:</strong> {r.resultNotes}</p>}
                                                        </div>
                                                      </PrintLayout>
                                                    )}
                                                  />
                                                )}
                                                {r.criticalFlag && !r.criticalAcknowledgedAt && (
                                                  <AcknowledgeButton resultId={r.id} onDone={() => refetch()} />
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Critical result acknowledgement summary if any unacknowledged criticals */}
                                  {results.filter((r: any) => r.criticalFlag && !r.criticalAcknowledgedAt).length > 0 && (
                                    <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 flex items-center gap-2">
                                      <AlertTriangle className="w-4 h-4" />
                                      <span>
                                        {results.filter((r: any) => r.criticalFlag && !r.criticalAcknowledgedAt).length} unacknowledged critical result(s) in this order — see Acknowledge buttons above.
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result-Selection Dialog — shown when the user clicks "Amend…" on a main row
          with multiple amendable results. Forces explicit selection of the exact
          LabResult to amend — eliminates the silent first-result bug. */}
      {amendSelectGroup && (
        <Dialog open onOpenChange={() => setAmendSelectGroup(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader className="-mx-6 -mt-6 px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-cyan-600 to-blue-700 text-white">
              <DialogTitle className="flex items-center gap-2 text-white">
                <History className="w-5 h-5 text-emerald-600" /> Select Result to Amend
              </DialogTitle>
              <DialogDescription className="text-white/80">
                This lab order has multiple amendable results. Choose the specific result you want to amend. The original will be preserved for audit.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              {amendSelectGroup.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setAmendResult(r);
                    setAmendSelectGroup(null);
                  }}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 text-sm">
                      {r.labOrderItem?.laboratoryTest?.name || "Test"}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Current value: <span className="font-mono">{r.numericValue != null ? r.numericValue : r.resultValue || "—"}</span>
                      {r.unit && <span className="ml-1">{r.unit}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.criticalFlag && (
                      <Badge variant="destructive" className="gap-1 text-[10px]">
                        <AlertTriangle className="w-3 h-3" /> Critical
                      </Badge>
                    )}
                    <StatusBadge status={r.status} />
                  </div>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAmendSelectGroup(null)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {amendResult && (
        <AmendResultDialog result={amendResult} onClose={() => setAmendResult(null)} onAmended={() => { setAmendResult(null); invalidate(); }} />
      )}
    </div>
  );
}

function AmendResultDialog({ result, onClose, onAmended }: { result: any; onClose: () => void; onAmended: () => void }) {
  const [form, setForm] = useState({
    resultValue: result.resultValue || "",
    numericValue: result.numericValue ?? "",
    unit: result.unit || "",
    referenceRange: result.referenceRange || "",
    abnormalFlag: result.abnormalFlag || "normal",
    criticalFlag: !!result.criticalFlag,
    resultNotes: result.resultNotes || "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  const setField = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/lab-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amendedFromId: result.id, ...form }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Result amended (original preserved)");
      onAmended();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="-mx-6 -mt-6 px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-cyan-600 to-blue-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><History className="w-5 h-5 text-emerald-600" /> Amend Result</DialogTitle>
          <DialogDescription className="text-white/80">
            A new amended result will be created. The original is preserved for audit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-slate-50 p-3 rounded text-sm space-y-1">
            <div className="font-medium text-slate-900">{result.labOrderItem?.laboratoryTest?.name}</div>
            <div className="text-xs text-slate-500">Patient: {result.labOrderItem?.labOrder?.patient?.firstName} {result.labOrderItem?.labOrder?.patient?.lastName}</div>
            <div className="text-xs text-slate-500">Order #: <span className="font-mono">{result.labOrderItem?.labOrder?.orderNumber}</span></div>
            <div className="text-[10px] text-slate-400 font-mono">Result ID: {result.id}</div>
            <div className="text-xs text-slate-500 mt-1">Original value: <span className="font-mono">{result.numericValue ?? result.resultValue ?? "—"}</span></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">New Result Value</Label>
              <Input value={form.resultValue} onChange={(e) => setField("resultValue", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">New Numeric Value</Label>
              <Input type="number" value={form.numericValue} onChange={(e) => setField("numericValue", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Unit</Label>
              <Input value={form.unit} onChange={(e) => setField("unit", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Reference Range</Label>
              <Input value={form.referenceRange} onChange={(e) => setField("referenceRange", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Abnormal Flag</Label>
              <Select value={form.abnormalFlag || undefined} onValueChange={(v) => setField("abnormalFlag", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical_low">Critical Low</SelectItem>
                  <SelectItem value="critical_high">Critical High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox checked={form.criticalFlag} onCheckedChange={(v) => setField("criticalFlag", !!v)} id="amend-crit" />
              <Label htmlFor="amend-crit" className="text-xs">Critical value</Label>
            </div>
          </div>
          <div>
            <Label className="text-xs">Reason for amendment</Label>
            <Textarea value={form.reason} onChange={(e) => setField("reason", e.target.value)} rows={2} placeholder="Why is this result being amended?" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.resultNotes} onChange={(e) => setField("resultNotes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Amending..." : "Create Amendment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// AcknowledgeButton — record clinician acknowledgement of a critical result
// =====================================================================
function AcknowledgeButton({ resultId, onDone }: { resultId: string; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState("electronic");
  const [notes, setNotes] = useState("");

  const ack = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-results/${resultId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, notes }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed"); }
      toast.success("Critical result acknowledged");
      setNotes("");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={method} onValueChange={setMethod}>
        <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="phone">Phone</SelectItem>
          <SelectItem value="in_person">In person</SelectItem>
          <SelectItem value="electronic">Electronic</SelectItem>
          <SelectItem value="other">Other</SelectItem>
        </SelectContent>
      </Select>
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Acknowledgement notes (optional)" className="h-7 flex-1 text-xs" />
      <Button size="sm" onClick={ack} disabled={saving} className="h-7 bg-rose-600 hover:bg-rose-700 text-xs gap-1">
        <CheckCircle2 className="w-3 h-3" /> {saving ? "Ack..." : "Acknowledge"}
      </Button>
    </div>
  );
}

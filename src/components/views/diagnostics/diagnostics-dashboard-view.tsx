"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  RefreshCw,
  FlaskConical,
  ScanLine,
  Scissors,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Microscope,
  Beaker,
  XCircle,
  Timer,
  Gauge,
  TrendingUp,
  TrendingDown,
  ClipboardList,
  FileText,
  CalendarDays,
} from "lucide-react";
import {
  EmptyState,
  LoadingState,
  ErrorState,
  PageHeader,
  MiniStatCard,
  safeJson,
  StatusBadge,
  formatDate,
} from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
];

// Helper to format minutes into a readable duration
function formatMinutes(min: number | null): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Helper to render a delta indicator
function DeltaIndicator({ delta }: { delta?: number | null }) {
  if (delta === undefined || delta === null) {
    return <span className="text-[10px] text-slate-400 italic">no prior data</span>;
  }
  const cls = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-slate-500";
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : null;
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`text-[10px] flex items-center gap-0.5 ${cls}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {sign}
      {delta.toFixed(1)}% vs prev
    </span>
  );
}

// =====================================================================
// Main Diagnostics Dashboard View
// =====================================================================
export function DiagnosticsDashboardView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setView = useAppStore((s) => s.setView);

  // KPI range state
  const [kpiRange, setKpiRange] = useState("today");
  const [kpiCustomStart, setKpiCustomStart] = useState("");
  const [kpiCustomEnd, setKpiCustomEnd] = useState("");

  // Permission flags
  const canLab = can("lab.view");
  const canImaging = can("imaging.view");
  const canProc = can("procedure.view");

  // Fetch KPIs (server-side aggregate)
  const kpiQuery = useQuery({
    queryKey: ["diagnostics-stats", activeFacilityId, kpiRange, kpiCustomStart, kpiCustomEnd],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeFacilityId) params.set("facilityId", activeFacilityId);
      params.set("range", kpiRange);
      params.set("compare", "true");
      if (kpiRange === "custom" && kpiCustomStart && kpiCustomEnd) {
        params.set("startDate", kpiCustomStart);
        params.set("endDate", kpiCustomEnd);
      }
      return fetchJson(`/api/diagnostics/stats?${params.toString()}`);
    },
    enabled: !!activeFacilityId,
  });

  const data = kpiQuery.data;
  const overall = data?.overall;
  const lab = data?.lab;
  const imaging = data?.imaging;
  const procedures = data?.procedures;
  const labDelta = data?.labDelta;
  const imagingDelta = data?.imagingDelta;
  const proceduresDelta = data?.proceduresDelta;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Diagnostics Dashboard"
        description="Unified overview of laboratory, imaging, and procedure activity across the facility"
        icon={Gauge}
        gradient="from-purple-500 to-indigo-600"
      />

      {!activeFacilityId && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
            Please select an active facility from the top bar to view diagnostics KPIs.
          </CardContent>
        </Card>
      )}

      {activeFacilityId && (
        <>
          {/* Range selector */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-purple-600" /> Diagnostics Statistics
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Live KPIs from the database. Comparison % shown against the prior comparable period.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs text-slate-500">Range:</Label>
                  <Select value={kpiRange} onValueChange={setKpiRange}>
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RANGE_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {kpiRange === "custom" && (
                    <div className="flex items-center gap-1">
                      <Input
                        type="date"
                        value={kpiCustomStart}
                        onChange={(e) => setKpiCustomStart(e.target.value)}
                        className="h-8 w-36 text-xs"
                      />
                      <span className="text-xs text-slate-400">to</span>
                      <Input
                        type="date"
                        value={kpiCustomEnd}
                        onChange={(e) => setKpiCustomEnd(e.target.value)}
                        className="h-8 w-36 text-xs"
                      />
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={kpiQuery.isFetching}
                    onClick={() => kpiQuery.refetch()}
                    className="h-8 px-2"
                    title="Refresh KPIs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${kpiQuery.isFetching ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {kpiQuery.isError ? (
                <ErrorState message="Failed to load diagnostics KPIs" onRetry={() => kpiQuery.refetch()} />
              ) : kpiQuery.isLoading || !data ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" aria-hidden="true" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Overall KPIs */}
                  <div className="mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5" /> Overall
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      <MiniStatCard
                        label="Total Diagnostics"
                        value={overall?.totalDiagnostics ?? 0}
                        icon={Activity}
                        gradient="from-indigo-500 to-indigo-600"
                        sublabel={
                          data?.overallDelta?.totalDiagnostics !== undefined
                            ? `${data.overallDelta.totalDiagnostics > 0 ? "+" : ""}${data.overallDelta.totalDiagnostics?.toFixed(1)}% vs prev`
                            : undefined
                        }
                      />
                      <MiniStatCard
                        label="Today's Diagnostics"
                        value={overall?.todayDiagnostics ?? 0}
                        icon={CalendarDays}
                        gradient="from-cyan-500 to-cyan-600"
                      />
                      <MiniStatCard
                        label="Pending"
                        value={overall?.pendingDiagnostics ?? 0}
                        icon={Clock}
                        gradient="from-amber-500 to-amber-600"
                      />
                      <MiniStatCard
                        label="Completed"
                        value={overall?.completedDiagnostics ?? 0}
                        icon={CheckCircle2}
                        gradient="from-emerald-500 to-emerald-600"
                      />
                      <MiniStatCard
                        label="Urgent Workload"
                        value={overall?.urgentWorkload ?? 0}
                        icon={AlertTriangle}
                        gradient="from-rose-500 to-rose-600"
                      />
                    </div>
                  </div>

                  {/* Lab section */}
                  {canLab && lab && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <FlaskConical className="w-3.5 h-3.5 text-purple-600" /> Laboratory
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setView("lab_orders")}
                        >
                          Go to Lab Orders →
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <MiniStatCard
                          label="Total Lab Orders"
                          value={lab.totalOrders}
                          icon={FlaskConical}
                          gradient="from-purple-500 to-purple-600"
                          sublabel={
                            labDelta?.totalOrders !== null && labDelta?.totalOrders !== undefined
                              ? `${labDelta.totalOrders > 0 ? "+" : ""}${labDelta.totalOrders.toFixed(1)}% vs prev`
                              : undefined
                          }
                        />
                        <MiniStatCard
                          label="Today's Orders"
                          value={lab.todayOrders}
                          icon={CalendarDays}
                          gradient="from-violet-500 to-violet-600"
                        />
                        <MiniStatCard
                          label="Pending Collection"
                          value={lab.pendingCollection}
                          icon={Beaker}
                          gradient="from-amber-500 to-amber-600"
                        />
                        <MiniStatCard
                          label="Processing"
                          value={lab.processing}
                          icon={Microscope}
                          gradient="from-blue-500 to-blue-600"
                        />
                        <MiniStatCard
                          label="Verification Pending"
                          value={lab.verificationPending}
                          icon={ClipboardList}
                          gradient="from-orange-500 to-orange-600"
                        />
                        <MiniStatCard
                          label="Critical Results"
                          value={lab.criticalResults}
                          icon={AlertTriangle}
                          gradient="from-red-500 to-rose-600"
                        />
                        <MiniStatCard
                          label="Completed"
                          value={lab.completed}
                          icon={CheckCircle2}
                          gradient="from-emerald-500 to-emerald-600"
                          sublabel={
                            labDelta?.completed !== null && labDelta?.completed !== undefined
                              ? `${labDelta.completed > 0 ? "+" : ""}${labDelta.completed.toFixed(1)}% vs prev`
                              : undefined
                          }
                        />
                        <MiniStatCard
                          label="Cancelled"
                          value={lab.cancelled}
                          icon={XCircle}
                          gradient="from-slate-500 to-slate-600"
                        />
                        <MiniStatCard
                          label="Avg Lab TAT"
                          value={formatMinutes(lab.avgTatMinutes)}
                          icon={Timer}
                          gradient="from-teal-500 to-cyan-600"
                          sublabel={lab.avgTatSampleSize > 0 ? `n=${lab.avgTatSampleSize}` : undefined}
                        />
                      </div>
                    </div>
                  )}

                  {/* Imaging section */}
                  {canImaging && imaging && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <ScanLine className="w-3.5 h-3.5 text-cyan-600" /> Imaging
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setView("imaging")}
                        >
                          Go to Imaging →
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <MiniStatCard
                          label="Total Studies"
                          value={imaging.totalStudies}
                          icon={ScanLine}
                          gradient="from-cyan-500 to-cyan-600"
                          sublabel={
                            imagingDelta?.totalStudies !== null && imagingDelta?.totalStudies !== undefined
                              ? `${imagingDelta.totalStudies > 0 ? "+" : ""}${imagingDelta.totalStudies.toFixed(1)}% vs prev`
                              : undefined
                          }
                        />
                        <MiniStatCard
                          label="Pending"
                          value={imaging.pending}
                          icon={Clock}
                          gradient="from-amber-500 to-amber-600"
                        />
                        <MiniStatCard
                          label="Performed"
                          value={imaging.performed}
                          icon={ScanLine}
                          gradient="from-blue-500 to-blue-600"
                        />
                        <MiniStatCard
                          label="Reporting Pending"
                          value={imaging.reportingPending}
                          icon={FileText}
                          gradient="from-orange-500 to-orange-600"
                        />
                        <MiniStatCard
                          label="Verification Pending"
                          value={imaging.verificationPending}
                          icon={ClipboardList}
                          gradient="from-violet-500 to-violet-600"
                        />
                        <MiniStatCard
                          label="Completed"
                          value={imaging.completed}
                          icon={CheckCircle2}
                          gradient="from-emerald-500 to-emerald-600"
                          sublabel={
                            imagingDelta?.completed !== null && imagingDelta?.completed !== undefined
                              ? `${imagingDelta.completed > 0 ? "+" : ""}${imagingDelta.completed.toFixed(1)}% vs prev`
                              : undefined
                          }
                        />
                        <MiniStatCard
                          label="Avg Imaging TAT"
                          value={formatMinutes(imaging.avgTatMinutes)}
                          icon={Timer}
                          gradient="from-teal-500 to-cyan-600"
                          sublabel={imaging.avgTatSampleSize > 0 ? `n=${imaging.avgTatSampleSize}` : undefined}
                        />
                      </div>
                    </div>
                  )}

                  {/* Procedures section */}
                  {canProc && procedures && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <Scissors className="w-3.5 h-3.5 text-rose-600" /> Procedures
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setView("procedures")}
                        >
                          Go to Procedures →
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <MiniStatCard
                          label="Total Procedures"
                          value={procedures.totalProcedures}
                          icon={Scissors}
                          gradient="from-rose-500 to-rose-600"
                          sublabel={
                            proceduresDelta?.totalProcedures !== null &&
                            proceduresDelta?.totalProcedures !== undefined
                              ? `${proceduresDelta.totalProcedures > 0 ? "+" : ""}${proceduresDelta.totalProcedures.toFixed(1)}% vs prev`
                              : undefined
                          }
                        />
                        <MiniStatCard
                          label="Scheduled"
                          value={procedures.scheduled}
                          icon={CalendarDays}
                          gradient="from-amber-500 to-amber-600"
                        />
                        <MiniStatCard
                          label="In Progress"
                          value={procedures.inProgress}
                          icon={Activity}
                          gradient="from-blue-500 to-blue-600"
                        />
                        <MiniStatCard
                          label="Completed"
                          value={procedures.completed}
                          icon={CheckCircle2}
                          gradient="from-emerald-500 to-emerald-600"
                          sublabel={
                            proceduresDelta?.completed !== null && proceduresDelta?.completed !== undefined
                              ? `${proceduresDelta.completed > 0 ? "+" : ""}${proceduresDelta.completed.toFixed(1)}% vs prev`
                              : undefined
                          }
                        />
                        <MiniStatCard
                          label="Cancelled"
                          value={procedures.cancelled}
                          icon={XCircle}
                          gradient="from-slate-500 to-slate-600"
                        />
                        <MiniStatCard
                          label="Documentation Pending"
                          value={procedures.documentationPending}
                          icon={FileText}
                          gradient="from-orange-500 to-orange-600"
                        />
                      </div>
                    </div>
                  )}

                  {/* Definitions tooltip area */}
                  <details className="mt-6 group">
                    <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 flex items-center gap-1">
                      <ClipboardList className="w-3 h-3" /> KPI definitions (click to expand)
                    </summary>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-200">
                      {data?.kpiDefinitions &&
                        Object.entries(data.kpiDefinitions).map(([k, v]) => (
                          <div key={k}>
                            <span className="font-mono font-semibold text-slate-700">{k}</span>:{" "}
                            <span>{v as string}</span>
                          </div>
                        ))}
                    </div>
                  </details>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick navigation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Navigation</CardTitle>
              <CardDescription className="text-xs">
                Jump to the relevant diagnostic module
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {canLab && (
                  <button
                    onClick={() => setView("lab_orders")}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center group-hover:bg-purple-600 transition">
                      <FlaskConical className="w-5 h-5 text-purple-600 group-hover:text-white transition" />
                    </div>
                    <span className="text-xs font-medium text-slate-700 text-center">Lab Orders</span>
                  </button>
                )}
                {canLab && (
                  <button
                    onClick={() => setView("lab_results")}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-teal-300 hover:bg-teal-50 transition group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center group-hover:bg-teal-600 transition">
                      <Microscope className="w-5 h-5 text-teal-600 group-hover:text-white transition" />
                    </div>
                    <span className="text-xs font-medium text-slate-700 text-center">Lab Results</span>
                  </button>
                )}
                {canImaging && (
                  <button
                    onClick={() => setView("imaging")}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50 transition group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center group-hover:bg-cyan-600 transition">
                      <ScanLine className="w-5 h-5 text-cyan-600 group-hover:text-white transition" />
                    </div>
                    <span className="text-xs font-medium text-slate-700 text-center">Imaging</span>
                  </button>
                )}
                {canProc && (
                  <button
                    onClick={() => setView("procedures")}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-rose-300 hover:bg-rose-50 transition group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center group-hover:bg-rose-600 transition">
                      <Scissors className="w-5 h-5 text-rose-600 group-hover:text-white transition" />
                    </div>
                    <span className="text-xs font-medium text-slate-700 text-center">Procedures</span>
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

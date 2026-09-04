"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, ScanLine, Search, CalendarClock, Stethoscope, FileText, CheckCircle2, Send, X, Gauge, RefreshCw, Clock, XCircle, CalendarDays, Timer, ChevronDown, ChevronUp, History, Printer, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, safeJson, PageHeader, ClearableSearch, MiniStatCard} from "@/components/ui-helpers"
import { PrintButton, PrintLayout } from "@/components/print/print-layout";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "ordered", label: "Ordered" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "verified", label: "Verified" },
  { value: "released", label: "Released" },
  { value: "cancelled", label: "Cancelled" },
];

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
];

const PROCEDURE_TYPES = [
  { value: "X-Ray", label: "X-Ray" },
  { value: "Ultrasound", label: "Ultrasound (US)" },
  { value: "CT Scan", label: "CT Scan" },
  { value: "MRI", label: "MRI" },
  { value: "Other", label: "Other" },
];

function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function ImagingView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [actionOrder, setActionOrder] = useState<any | null>(null);
  // Expandable row state — one expanded order at a time (by order.id)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Amend dialog state — holds the order whose report should be amended.
  // The amend always targets order.report.id (the latest report version),
  // never a first-by-array fallback.
  const [amendOrder, setAmendOrder] = useState<any | null>(null);

  // KPI range state
  const [kpiRange, setKpiRange] = useState("today");
  const [kpiCustomStart, setKpiCustomStart] = useState("");
  const [kpiCustomEnd, setKpiCustomEnd] = useState("");

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["imaging", activeFacilityId, statusFilter, search],
    queryFn: () => fetchJson(`/api/imaging${qs}`),
    enabled: !!activeFacilityId,
  });

  // KPI query (server-side aggregate)
  const kpiQuery = useQuery({
    queryKey: ["imaging-stats", activeFacilityId, kpiRange, kpiCustomStart, kpiCustomEnd],
    queryFn: () => {
      const p = new URLSearchParams();
      if (activeFacilityId) p.set("facilityId", activeFacilityId);
      p.set("range", kpiRange);
      p.set("compare", "true");
      if (kpiRange === "custom" && kpiCustomStart && kpiCustomEnd) {
        p.set("startDate", kpiCustomStart);
        p.set("endDate", kpiCustomEnd);
      }
      return fetchJson(`/api/imaging/stats?${p.toString()}`);
    },
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["imaging"] });
    qc.invalidateQueries({ queryKey: ["imaging-stats"] });
  };

  const k = kpiQuery.data?.kpis;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Radiology & Imaging"
        description="Manage imaging requests, reports, and verification"
        icon={ScanLine}
        gradient="from-blue-500 to-indigo-600"
        actions={
          <Button onClick={() => setShowNew(true)} disabled={!can("imaging.order")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Imaging Order
        </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view imaging orders.</CardContent></Card>
      )}

      {/* KPI / Statistics Dashboard */}
      {activeFacilityId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-blue-600" /> Imaging Statistics
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Live KPIs from the database. Comparison % shown against the prior comparable period.
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
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" aria-hidden="true" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MiniStatCard label="Total Studies" value={k.totalStudies?.value ?? 0} icon={ScanLine} gradient="from-blue-500 to-indigo-600" sublabel={k.totalStudies?.deltaPct !== null && k.totalStudies?.deltaPct !== undefined ? `${k.totalStudies.deltaPct > 0 ? "+" : ""}${k.totalStudies.deltaPct.toFixed(1)}% vs prev` : undefined} />
                <MiniStatCard label="Today's Studies" value={k.todayStudies?.value ?? 0} icon={CalendarDays} gradient="from-cyan-500 to-cyan-600" />
                <MiniStatCard label="Pending" value={k.pending?.value ?? 0} icon={Clock} gradient="from-amber-500 to-amber-600" />
                <MiniStatCard label="Performed" value={k.performed?.value ?? 0} icon={ScanLine} gradient="from-blue-500 to-blue-600" />
                <MiniStatCard label="Reporting Pending" value={k.reportingPending?.value ?? 0} icon={FileText} gradient="from-orange-500 to-orange-600" />
                <MiniStatCard label="Verification Pending" value={k.verificationPending?.value ?? 0} icon={Stethoscope} gradient="from-violet-500 to-violet-600" />
                <MiniStatCard label="Completed" value={k.completed?.value ?? 0} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" sublabel={k.completed?.deltaPct !== null && k.completed?.deltaPct !== undefined ? `${k.completed.deltaPct > 0 ? "+" : ""}${k.completed.deltaPct.toFixed(1)}% vs prev` : undefined} />
                <MiniStatCard label="Cancelled" value={k.cancelled?.value ?? 0} icon={XCircle} gradient="from-slate-500 to-slate-600" />
                <MiniStatCard label="Avg TAT" value={formatMinutes(k.avgTatMinutes?.value)} icon={Timer} gradient="from-teal-500 to-cyan-600" sublabel={k.avgTatMinutes?.sampleSize && k.avgTatMinutes.sampleSize > 0 ? `n=${k.avgTatMinutes.sampleSize}` : undefined} />
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
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Search Imaging Orders</Label>
              <ClearableSearch
                value={search}
                onChange={setSearch}
                placeholder="Search by procedure name, accession number, patient name, or MRN…"
                inputClassName="text-sm"
                className="max-w-3xl"
              />
              <p className="text-[10px] text-slate-500 mt-1">Server-side search across procedure name, accession number, and patient fields.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
                <SelectTrigger className="md:w-48 h-8 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {(statusFilter !== "all" || search) && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setStatusFilter("all"); setSearch(""); }}>
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
        <ErrorState message="Failed to load imaging orders" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No imaging orders"
              description="Create a new imaging order to begin the radiology workflow."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("imaging.order")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Imaging Order</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700 w-6"></th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Procedure</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Priority</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Ordered</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Scheduled</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((o: any) => {
                    const expanded = expandedId === o.id;
                    const report = o.report; // latest report (already flattened by API)
                    const canAmend = (o.status === "verified" || o.status === "released") && report && can("imaging.verify");
                    return (
                      <>
                        <tr key={o.id} className={`border-b hover:bg-emerald-50/40 ${expanded ? "bg-emerald-50/30" : ""}`}>
                          <td className="p-3 text-slate-400 cursor-pointer" onClick={() => setExpandedId(expanded ? null : o.id)}>
                            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-slate-900">{o.patient?.firstName} {o.patient?.lastName}</div>
                            <div className="text-xs text-slate-500">{o.patient?.patientNumber}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-slate-900">{o.procedureName}</div>
                            {o.procedureCode && <div className="text-xs text-slate-500 font-mono">{o.procedureCode}</div>}
                            {o.modality && (
                              <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">{o.modality}{o.bodySite ? ` • ${o.bodySite}` : ""}</div>
                            )}
                          </td>
                          <td className="p-3">
                            {o.priority === "stat" ? (
                              <Badge variant="destructive" className="text-[10px]">STAT</Badge>
                            ) : o.priority === "urgent" ? (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">URGENT</Badge>
                            ) : (
                              <span className="text-xs text-slate-500 capitalize">{o.priority}</span>
                            )}
                          </td>
                          <td className="p-3"><StatusBadge status={o.status} /></td>
                          <td className="p-3 text-xs text-slate-600">{formatDate(o.orderedAt, true)}</td>
                          <td className="p-3 text-xs text-slate-600">{formatDate(o.scheduledAt, true)}</td>
                          <td className="p-3 text-right">
                            <div className="flex flex-wrap gap-1 justify-end">
                              {o.status === "ordered" && can("imaging.perform") && (
                                <Button size="sm" variant="outline" onClick={() => setActionOrder(o)} className="gap-1 h-7 text-xs">
                                  <CalendarClock className="w-3 h-3" /> Schedule
                                </Button>
                              )}
                              {o.status === "scheduled" && can("imaging.perform") && (
                                <Button size="sm" onClick={() => setActionOrder(o)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                                  <Stethoscope className="w-3 h-3" /> Perform
                                </Button>
                              )}
                              {o.status === "in_progress" && can("imaging.report") && (
                                <Button size="sm" onClick={() => setActionOrder(o)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                                  <FileText className="w-3 h-3" /> Enter Report
                                </Button>
                              )}
                              {o.status === "completed" && can("imaging.verify") && (
                                <Button size="sm" onClick={() => setActionOrder(o)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                                  <CheckCircle2 className="w-3 h-3" /> Verify
                                </Button>
                              )}
                              {o.status === "verified" && can("imaging.verify") && (
                                <Button size="sm" onClick={() => doAction(o.id, "release", "Report released", invalidate)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                                  <Send className="w-3 h-3" /> Release
                                </Button>
                              )}
                              {(o.status === "ordered" || o.status === "scheduled") && can("imaging.order") && (
                                <Button size="sm" variant="ghost" onClick={() => doAction(o.id, "cancel", "Order cancelled", invalidate)} className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700">
                                  <X className="w-3 h-3" />
                                </Button>
                              )}
                              {/* Always show a "View" button so the action column is never empty
                                  for terminal-state orders (verified/released/cancelled). */}
                              {!["ordered", "scheduled", "in_progress", "completed", "verified"].includes(o.status) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setExpandedId(expanded ? null : o.id)}
                                  className="gap-1 h-7 text-xs"
                                  title="View order details"
                                >
                                  <ScanLine className="w-3 h-3" /> View
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* === NESTED REPORT PANEL (visually distinct from main table) === */}
                        {expanded && (
                          <tr>
                            <td colSpan={8} className="p-0 bg-slate-100/60">
                              <div className="px-6 py-4 border-l-4 border-blue-300 ml-3 my-2 bg-white rounded-r-lg shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                  <div>
                                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                      <FileText className="w-4 h-4 text-blue-600" />
                                      Imaging Report
                                      {report && (
                                        <span className="text-xs font-normal text-slate-500">
                                          (Order {o.orderNumber || o.id.slice(-6)} • Version {report.version || 1})
                                        </span>
                                      )}
                                    </h4>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                      Patient: {o.patient?.firstName} {o.patient?.lastName} • Encounter: {o.encounter?.encounterNumber || "—"}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/* Print Report — prints the CURRENT (latest) report only */}
                                    {report && (report.status === "verified" || report.status === "released") && (
                                      <PrintButton
                                        label="Print Report"
                                        className="text-xs h-8"
                                        renderContent={() => (
                                          <PrintLayout
                                            title="Imaging Report"
                                            subtitle={o.procedureName}
                                            documentNumber={o.orderNumber || o.id}
                                            facility={o.facility}
                                            patient={o.patient}
                                            signatory={report.reportedBy ? `Dr. ${report.reportedBy.firstName} ${report.reportedBy.lastName}` : undefined}
                                            signatoryRole="Reporting Radiologist"
                                          >
                                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                              <tbody>
                                                <tr>
                                                  <td style={{ padding: "6px 8px", fontWeight: 600, width: "30%" }}>Procedure</td>
                                                  <td style={{ padding: "6px 8px" }}>{o.procedureName}</td>
                                                </tr>
                                                {o.modality && (
                                                  <tr style={{ background: "#f8fafc" }}>
                                                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>Modality</td>
                                                    <td style={{ padding: "6px 8px" }}>{o.modality}</td>
                                                  </tr>
                                                )}
                                                {o.bodySite && (
                                                  <tr>
                                                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>Body Site</td>
                                                    <td style={{ padding: "6px 8px" }}>{o.bodySite}{o.laterality && o.laterality !== "na" ? ` (${o.laterality})` : ""}</td>
                                                  </tr>
                                                )}
                                                {report.technique && (
                                                  <tr style={{ background: "#f8fafc" }}>
                                                    <td style={{ padding: "6px 8px", fontWeight: 600, verticalAlign: "top" }}>Technique</td>
                                                    <td style={{ padding: "6px 8px", whiteSpace: "pre-wrap" }}>{report.technique}</td>
                                                  </tr>
                                                )}
                                                <tr>
                                                  <td style={{ padding: "6px 8px", fontWeight: 600, verticalAlign: "top" }}>Findings</td>
                                                  <td style={{ padding: "6px 8px", whiteSpace: "pre-wrap" }}>{report.findings || "—"}</td>
                                                </tr>
                                                <tr style={{ background: "#f8fafc" }}>
                                                  <td style={{ padding: "6px 8px", fontWeight: 600, verticalAlign: "top" }}>Impression</td>
                                                  <td style={{ padding: "6px 8px", whiteSpace: "pre-wrap" }}>{report.impression || "—"}</td>
                                                </tr>
                                                {report.recommendations && (
                                                  <tr>
                                                    <td style={{ padding: "6px 8px", fontWeight: 600, verticalAlign: "top" }}>Recommendations</td>
                                                    <td style={{ padding: "6px 8px", whiteSpace: "pre-wrap" }}>{report.recommendations}</td>
                                                  </tr>
                                                )}
                                                <tr style={{ background: "#f8fafc" }}>
                                                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>Status</td>
                                                  <td style={{ padding: "6px 8px" }}>{report.status}</td>
                                                </tr>
                                              </tbody>
                                            </table>
                                            <div style={{ marginTop: "16px", fontSize: "11px", color: "#64748b" }}>
                                              <p><strong>Order:</strong> {o.orderNumber || o.id}</p>
                                              <p><strong>Encounter:</strong> {o.encounter?.encounterNumber || "—"}</p>
                                              <p><strong>Reported:</strong> {report.reportedAt ? new Date(report.reportedAt).toLocaleString("en-GB") : "—"}</p>
                                              <p><strong>Verified:</strong> {report.verifiedAt ? new Date(report.verifiedAt).toLocaleString("en-GB") : "—"}</p>
                                              <p><strong>Released:</strong> {report.releasedAt ? new Date(report.releasedAt).toLocaleString("en-GB") : "—"}</p>
                                              {report.amendmentReason && <p><strong>Amendment reason:</strong> {report.amendmentReason}</p>}
                                            </div>
                                          </PrintLayout>
                                        )}
                                      />
                                    )}
                                    {/* Amend action — uses the real report.id */}
                                    {canAmend && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setAmendOrder(o)}
                                        className="gap-1 h-8 text-xs"
                                        title="Amend this report (creates a new version; original is preserved)"
                                      >
                                        <History className="w-3.5 h-3.5" /> Amend
                                      </Button>
                                    )}
                                  </div>
                                </div>

                                {report ? (
                                  <div className="space-y-3 text-sm">
                                    {/* Report ID shown for transparency (mirrors the Lab Results pattern) */}
                                    <div className="text-[10px] text-slate-400 font-mono">Report ID: {report.id}</div>

                                    {report.clinicalIndication && (
                                      <div>
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Clinical Indication</p>
                                        <p className="text-slate-900 whitespace-pre-wrap">{report.clinicalIndication}</p>
                                      </div>
                                    )}
                                    {report.technique && (
                                      <div>
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Technique</p>
                                        <p className="text-slate-900 whitespace-pre-wrap">{report.technique}</p>
                                      </div>
                                    )}
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Findings</p>
                                      <p className="text-slate-900 whitespace-pre-wrap">{report.findings || "—"}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Impression</p>
                                      <p className="text-slate-900 whitespace-pre-wrap">{report.impression || "—"}</p>
                                    </div>
                                    {report.recommendations && (
                                      <div>
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Recommendations</p>
                                        <p className="text-slate-900 whitespace-pre-wrap">{report.recommendations}</p>
                                      </div>
                                    )}
                                    {report.differentialDiagnosis && (
                                      <div>
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Differential Diagnosis</p>
                                        <p className="text-slate-900 whitespace-pre-wrap">{report.differentialDiagnosis}</p>
                                      </div>
                                    )}
                                    {report.followUpRecommendation && (
                                      <div>
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Follow-up Recommendation</p>
                                        <p className="text-slate-900 whitespace-pre-wrap">{report.followUpRecommendation}</p>
                                      </div>
                                    )}

                                    {/* Amendment chain notice if this is an amended version */}
                                    {report.amendedFromId && (
                                      <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center gap-2">
                                        <History className="w-3.5 h-3.5" />
                                        <span>
                                          Amended report (Version {report.version}). Reason: {report.amendmentReason || "—"}
                                        </span>
                                      </div>
                                    )}

                                    {/* Report metadata footer */}
                                    <div className="pt-2 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-slate-600">
                                      <div>
                                        <span className="text-slate-500">Reported:</span>{" "}
                                        {report.reportedAt ? formatDate(report.reportedAt, true) : "—"}
                                      </div>
                                      <div>
                                        <span className="text-slate-500">Verified:</span>{" "}
                                        {report.verifiedAt ? formatDate(report.verifiedAt, true) : "—"}
                                      </div>
                                      <div>
                                        <span className="text-slate-500">Released:</span>{" "}
                                        {report.releasedAt ? formatDate(report.releasedAt, true) : "—"}
                                      </div>
                                      <div>
                                        <span className="text-slate-500">Status:</span>{" "}
                                        <StatusBadge status={report.status} />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-sm text-slate-500 italic py-4 text-center">
                                    No report has been entered for this order yet.
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <NewImagingOrderDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); invalidate(); }}
        defaultFacilityId={activeFacilityId}
      />

      {actionOrder && (
        <ActionDialog
          order={actionOrder}
          onClose={() => setActionOrder(null)}
          onChanged={() => { setActionOrder(null); invalidate(); }}
        />
      )}

      {/* Amend Report Dialog — targets the order's latest report by order.id.
          The amend API uses the existing latest report (isLatest=true) as the
          original; the order.id is the correct identifier at this level. */}
      {amendOrder && (
        <AmendReportDialog
          order={amendOrder}
          onClose={() => setAmendOrder(null)}
          onAmended={() => { setAmendOrder(null); invalidate(); }}
        />
      )}
    </div>
  );
}

async function doAction(id: string, action: string, successMsg: string, onDone: () => void) {
  try {
    const res = await fetch(`/api/imaging/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err.error || "Failed");
    }
    toast.success(successMsg);
    onDone();
  } catch (e: any) {
    toast.error(e.message);
  }
}

function NewImagingOrderDialog({ open, onClose, onCreated, defaultFacilityId }: { open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [procedureType, setProcedureType] = useState("X-Ray");
  const [procedureName, setProcedureName] = useState("");
  const [procedureCode, setProcedureCode] = useState("");
  const [priority, setPriority] = useState("routine");
  const [indication, setIndication] = useState("");
  const [modality, setModality] = useState("x_ray");
  const [bodySite, setBodySite] = useState("");
  const [laterality, setLaterality] = useState("na");
  const [contrastRequired, setContrastRequired] = useState(false);
  const [contrastNotes, setContrastNotes] = useState("");
  const [diagnosisRef, setDiagnosisRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });
  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters", patientId, defaultFacilityId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}&facilityId=${defaultFacilityId || ""}`),
    enabled: !!patientId,
  });

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    const name = procedureName || procedureType;
    if (!name) { toast.error("Procedure name required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/imaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId, encounterId: encounterId || undefined, facilityId: defaultFacilityId,
          procedureName: name, procedureCode, priority, indication,
          modality, bodySite, laterality, contrastRequired, contrastNotes,
          clinicalIndication: indication, diagnosisRef, notes,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Imaging order created");
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setProcedureType("X-Ray"); setProcedureName(""); setProcedureCode("");
      setPriority("routine"); setIndication("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
          <DialogTitle className="flex items-center gap-2"><ScanLine className="w-5 h-5 text-emerald-600" /> New Imaging Order</DialogTitle>
          <DialogDescription>Schedule a radiology study for a patient.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <ClearableSearch value={patientQuery} onChange={setPatientQuery} placeholder="Search patient..." className="" inputClassName="" />
            </div>
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => { setPatientId(p.id); setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); }} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {patientId && (
            <div>
              <Label>Encounter</Label>
              <Select value={encounterId || undefined} onValueChange={setEncounterId}>
                <SelectTrigger><SelectValue placeholder="Auto-create an imaging encounter" /></SelectTrigger>
                <SelectContent>
                  {(encountersData?.items || []).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.encounterNumber} • {e.encounterType} • {formatDate(e.startAt, true)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Procedure Type</Label>
              <Select value={procedureType || undefined} onValueChange={(v) => { setProcedureType(v); if (!procedureName) setProcedureName(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROCEDURE_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Procedure Code</Label>
              <Input value={procedureCode} onChange={(e) => setProcedureCode(e.target.value)} placeholder="e.g. XR-CHST-001" />
            </div>
          </div>
          <div>
            <Label>Procedure Name</Label>
            <Input value={procedureName} onChange={(e) => setProcedureName(e.target.value)} placeholder="e.g. Chest X-Ray PA view" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority || undefined} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="stat">STAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Indication</Label>
            <Textarea value={indication} onChange={(e) => setIndication(e.target.value)} rows={2} placeholder="Clinical reason for the study" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Modality</Label>
              <Select value={modality} onValueChange={setModality}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="x_ray">X-Ray</SelectItem>
                  <SelectItem value="ultrasound">Ultrasound</SelectItem>
                  <SelectItem value="ct">CT Scan</SelectItem>
                  <SelectItem value="mri">MRI</SelectItem>
                  <SelectItem value="mammography">Mammography</SelectItem>
                  <SelectItem value="fluoroscopy">Fluoroscopy</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Body Site</Label>
              <Input value={bodySite} onChange={(e) => setBodySite(e.target.value)} placeholder="e.g., Chest, Abdomen, Skull" />
            </div>
            <div>
              <Label>Laterality</Label>
              <Select value={laterality} onValueChange={setLaterality}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="na">N/A</SelectItem>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                  <SelectItem value="bilateral">Bilateral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Diagnosis Reference</Label>
              <Input value={diagnosisRef} onChange={(e) => setDiagnosisRef(e.target.value)} placeholder="ICD-10 code or diagnosis name" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={contrastRequired} onChange={(e) => setContrastRequired(e.target.checked)} className="rounded" />
                Contrast Required
              </label>
            </div>
          </div>
          {contrastRequired && (
            <div>
              <Label>Contrast Notes</Label>
              <Input value={contrastNotes} onChange={(e) => setContrastNotes(e.target.value)} placeholder="Contrast agent, dose, etc." />
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional notes for radiology..." />
          </div>
        </div>
        <DialogFooter className="px-6 py-4 shrink-0 border-t bg-white">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Creating..." : "Create Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  if (order.status === "ordered") return <ScheduleDialog order={order} onClose={onClose} onChanged={onChanged} />;
  if (order.status === "scheduled") return <PerformDialog order={order} onClose={onClose} onChanged={onChanged} />;
  if (order.status === "in_progress") return <ReportDialog order={order} onClose={onClose} onChanged={onChanged} />;
  if (order.status === "completed") return <VerifyDialog order={order} onClose={onClose} onChanged={onChanged} />;
  return null;
}

function ScheduleDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const defaultSchedule = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
  const [scheduledAt, setScheduledAt] = useState(defaultSchedule);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/imaging/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule", scheduledAt }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Imaging scheduled");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5 text-emerald-600" /> Schedule Imaging</DialogTitle>
          <DialogDescription>{order.procedureName} • {order.patient?.firstName} {order.patient?.lastName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Scheduled At</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Scheduling..." : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PerformDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const [accessionNumber, setAccessionNumber] = useState(order.accessionNumber || "");
  const [studyInstanceUid, setStudyInstanceUid] = useState(order.studyInstanceUid || "");
  const [contrastUsed, setContrastUsed] = useState(order.contrastRequired || false);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/imaging/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "perform", accessionNumber, studyInstanceUid, contrastUsed }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Imaging in progress");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Stethoscope className="w-5 h-5 text-emerald-600" /> Perform Imaging</DialogTitle>
          <DialogDescription>Confirm the imaging procedure has begun. {order.procedureName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Accession Number (optional)</Label>
            <Input value={accessionNumber} onChange={(e) => setAccessionNumber(e.target.value)} placeholder="PACS/RIS accession number" />
          </div>
          <div>
            <Label>Study Instance UID (optional, DICOM)</Label>
            <Input value={studyInstanceUid} onChange={(e) => setStudyInstanceUid(e.target.value)} placeholder="DICOM Study Instance UID" className="font-mono text-xs" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={contrastUsed} onChange={(e) => setContrastUsed(e.target.checked)} className="rounded" />
            Contrast used
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Starting..." : "Mark In Progress"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const initialFindings = (order.report?.findings || "").replace(/^Indication:[^\n]*\n?/i, "").trim();
  const [findings, setFindings] = useState(initialFindings);
  const [impression, setImpression] = useState(order.report?.impression || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/imaging/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "report", findings, impression }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Report entered");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-600" /> Imaging Report</DialogTitle>
          <DialogDescription>{order.procedureName} • {order.patient?.firstName} {order.patient?.lastName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {order.report?.findings?.startsWith("Indication:") && (
            <div className="bg-slate-50 p-3 rounded text-sm">
              <span className="text-slate-500">Indication: </span>
              <span className="font-medium text-slate-900">{order.report.findings.replace(/^Indication:\s*/, "").trim()}</span>
            </div>
          )}
          <div>
            <Label>Findings</Label>
            <Textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={8} placeholder="Describe imaging findings in detail..." />
          </div>
          <div>
            <Label>Impression</Label>
            <Textarea value={impression} onChange={(e) => setImpression(e.target.value)} rows={4} placeholder="Radiologist's impression / conclusion..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving..." : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerifyDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/imaging/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Report verified");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Verify Report</DialogTitle>
          <DialogDescription>Confirm the imaging report is verified. {order.procedureName}</DialogDescription>
        </DialogHeader>
        {order.report && (
          <div className="bg-slate-50 p-3 rounded text-sm space-y-1">
            <div className="font-medium text-slate-900">Findings:</div>
            <div className="text-xs text-slate-700 whitespace-pre-wrap">{order.report.findings || "—"}</div>
            {order.report.impression && (
              <>
                <div className="font-medium text-slate-900 mt-2">Impression:</div>
                <div className="text-xs text-slate-700 whitespace-pre-wrap">{order.report.impression}</div>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Verifying..." : "Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// AmendReportDialog — for amending an imaging report.
// Mirrors the Lab Results AmendResultDialog pattern: shows the target
// report's real ID for transparency, requires an amendment reason, and
// submits to PATCH /api/imaging/{orderId} with action="amend".
// The API uses the order's existing latest report (isLatest=true) as the
// original — the order.id is the correct identifier at this level (there
// is only ONE current report per imaging order, unlike lab where each
// test has its own result).
// =====================================================================
function AmendReportDialog({ order, onClose, onAmended }: { order: any; onClose: () => void; onAmended: () => void }) {
  const report = order.report;
  const [form, setForm] = useState({
    findings: report?.findings || "",
    impression: report?.impression || "",
    technique: report?.technique || "",
    recommendations: report?.recommendations || "",
    amendmentReason: "",
  });
  const [saving, setSaving] = useState(false);

  const setField = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.amendmentReason.trim()) {
      toast.error("Amendment reason is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/imaging/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "amend",
          findings: form.findings,
          impression: form.impression,
          technique: form.technique,
          recommendations: form.recommendations,
          amendmentReason: form.amendmentReason,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Report amended (original preserved)");
      onAmended();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" /> Amend Imaging Report
          </DialogTitle>
          <DialogDescription>
            A new amended report version will be created. The original is preserved for audit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-slate-50 p-3 rounded text-sm space-y-1">
            <div className="font-medium text-slate-900">{order.procedureName}</div>
            <div className="text-xs text-slate-500">Patient: {order.patient?.firstName} {order.patient?.lastName}</div>
            <div className="text-xs text-slate-500">Order #: <span className="font-mono">{order.orderNumber || order.id}</span></div>
            {report && (
              <div className="text-[10px] text-slate-400 font-mono">Report ID: {report.id} (Version {report.version || 1})</div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label className="text-xs">Technique</Label>
              <Textarea value={form.technique} onChange={(e) => setField("technique", e.target.value)} rows={2} />
            </div>
            <div>
              <Label className="text-xs">Findings</Label>
              <Textarea value={form.findings} onChange={(e) => setField("findings", e.target.value)} rows={4} />
            </div>
            <div>
              <Label className="text-xs">Impression</Label>
              <Textarea value={form.impression} onChange={(e) => setField("impression", e.target.value)} rows={3} />
            </div>
            <div>
              <Label className="text-xs">Recommendations</Label>
              <Textarea value={form.recommendations} onChange={(e) => setField("recommendations", e.target.value)} rows={2} />
            </div>
            <div>
              <Label className="text-xs text-rose-600">Amendment Reason (required)</Label>
              <Input
                value={form.amendmentReason}
                onChange={(e) => setField("amendmentReason", e.target.value)}
                placeholder="e.g., Corrected findings, additional observation, transcription error"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !form.amendmentReason.trim()} className="gap-2 bg-blue-600 hover:bg-blue-700">
            {saving ? "Amending..." : "Amend Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

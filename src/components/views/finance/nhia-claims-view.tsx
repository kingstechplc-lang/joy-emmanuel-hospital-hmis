"use client";
import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShieldCheck, FileCode2, Download, RefreshCw, Activity, AlertCircle, CheckCircle2,
  XCircle, Clock, Zap, Eye, Loader2, FileText, Building2, User, ChevronRight,
  Wifi, WifiOff, Hash, Calendar, Stethoscope, Pill, Receipt, TrendingUp,
  ListChecks, AlertTriangle, Info, Copy, Check, ServerCog, FileCheck2, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader, MiniStatCard, EmptyState, LoadingState, ErrorState,
  formatCurrency, formatDate, formatRelative, safeJson, ModuleHelp, usePagination, Pagination,
} from "@/components/ui-helpers";

// =====================================================================
// Helpers
// =====================================================================
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return safeJson(res);
}

async function postJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const txt = await res.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { /* keep null */ }
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-300", icon: FileText },
  validated: { label: "Validated", color: "bg-blue-100 text-blue-700 border-blue-300", icon: CheckCircle2 },
  xml_generated: { label: "XML Generated", color: "bg-violet-100 text-violet-700 border-violet-300", icon: FileCode2 },
  exported: { label: "Exported", color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: FileCheck2 },
  failed: { label: "Failed", color: "bg-rose-100 text-rose-700 border-rose-300", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] || { label: status, color: "bg-slate-100 text-slate-700", icon: AlertCircle };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${meta.color}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

// =====================================================================
// HELP / DOCUMENTATION
// =====================================================================
const HELP_SECTIONS = [
  {
    title: "What is NHIA CLAIM-it?",
    content: `CLAIM-it is the National Health Insurance Authority's desktop application for submitting insurance claims.

This module generates XML files that conform to the CLAIM-it schema, so your HMIS data can be imported into CLAIM-it without manual re-entry.

Workflow:
  1. Encounter is completed (diagnoses recorded, NHIS invoice issued, drugs dispensed)
  2. Click "Validate" to run the validation engine — fix any errors
  3. Click "Generate XML" to produce the claim XML file
  4. Download the XML and import it into CLAIM-it desktop app`,
  },
  {
    title: "Eligibility Criteria",
    content: `An encounter is eligible for NHIA claim generation when ALL of the following are true:
  • Has an NHIS invoice (status: issued, paid, or partially_paid)
  • Has at least one diagnosis recorded
  • Patient has an active NHIS insurance record with membership number

If you don't see an encounter in the "Eligible Encounters" tab, verify these conditions are met.`,
  },
  {
    title: "Validation Errors vs Warnings",
    content: `ERRORS (red) — Block XML generation. Must be fixed before submission.
  Examples: missing NHIS number, missing primary diagnosis, invalid ICD-10 code, totals mismatch.

WARNINGS (amber) — Do not block generation, but should be reviewed.
  Examples: missing tariff code on a service, missing Ghana Card PIN, missing patient DOB.`,
  },
  {
    title: "Transport Modes",
    content: `FILE MODE (default): Generates the XML and lets you download it as a file.
  Use this for the standard CLAIM-it desktop workflow — download to USB/flash drive, import into CLAIM-it.

BRIDGE MODE: Sends the XML directly to the CLAIM-it HMS bridge (localhost:31719).
  Requires the bridge service to be running on the facility's local network.
  Check the Bridge Status indicator in the top-right of the dashboard.`,
  },
  {
    title: "Architecture",
    content: `The module follows a 4-layer decoupled architecture:

  1. ADAPTER (ClaimsDataAdapter): Maps HMIS Prisma models → ICO (Intermediate Claims Object)
  2. VALIDATOR (ClaimsValidator): Pure-function validation, no DB access
  3. SERIALIZER (XMLSerializer): ICO → NHIA XML string
  4. TRANSPORT (NHIAClaimItTransport): File export OR bridge POST

All tag names are configurable in src/integrations/nhia/claim-it/config/tags.ts.
If NHIA changes a tag, update it there — no business logic changes needed.`,
  },
];

// =====================================================================
// MAIN VIEW
// =====================================================================
export function NhiaClaimsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canGenerate = can("nhia_claim.generate");
  const canConfig = can("nhia_claim.config");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"dashboard" | "eligible" | "history">("dashboard");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("");
  const [showValidate, setShowValidate] = useState<any | null>(null);
  const [showXml, setShowXml] = useState<any | null>(null);
  const [showDetail, setShowDetail] = useState<any | null>(null);

  // --- Queries ---
  const baseParams = new URLSearchParams();
  if (activeFacilityId) baseParams.set("facilityId", activeFacilityId);
  const baseQs = baseParams.toString() ? `?${baseParams.toString()}` : "";

  const statsQuery = useQuery({
    queryKey: ["nhia-claims-stats", activeFacilityId],
    queryFn: () => fetchJson(`/api/nhia-claims/stats${baseQs}`),
    enabled: !!activeFacilityId,
  });

  const healthQuery = useQuery({
    queryKey: ["nhia-claims-health"],
    queryFn: () => fetchJson("/api/nhia-claims/health"),
    refetchInterval: 30000,
  });

  const eligibleQuery = useQuery({
    queryKey: ["nhia-claims-eligible", activeFacilityId],
    queryFn: () => fetchJson(`/api/nhia-claims/encounters${baseQs}&limit=100`),
    enabled: !!activeFacilityId && activeTab === "eligible",
  });

  const historyParams = new URLSearchParams();
  if (activeFacilityId) historyParams.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") historyParams.set("status", statusFilter);
  if (periodFilter) historyParams.set("period", periodFilter);
  const historyQs = historyParams.toString() ? `?${historyParams.toString()}` : "";

  const historyQuery = useQuery({
    queryKey: ["nhia-claims-history", activeFacilityId, statusFilter, periodFilter],
    queryFn: () => fetchJson(`/api/nhia-claims${historyQs}&limit=200`),
    enabled: !!activeFacilityId && activeTab === "history",
  });

  // --- Mutations ---
  const validateMutation = useMutation({
    mutationFn: (encounterId: string) => postJson("/api/nhia-claims/validate", { encounterId }),
    onSuccess: (data) => {
      setShowValidate(data);
      qc.invalidateQueries({ queryKey: ["nhia-claims-eligible"] });
    },
    onError: (e: any) => toast.error(`Validation failed: ${e.message}`),
  });

  const generateMutation = useMutation({
    mutationFn: ({ encounterId, transportMode, skipValidation }: { encounterId: string; transportMode?: string; skipValidation?: boolean }) =>
      postJson("/api/nhia-claims", { encounterId, transportMode, skipValidation, persist: true }),
    onSuccess: (data) => {
      const v = data.validation;
      if (v?.valid) {
        toast.success(`Claim XML generated: ${data.ico?.header?.claimNumber}`);
      } else {
        toast.warning(`Claim generated with ${v?.errors?.length || 0} error(s) — see details`);
      }
      setShowXml(data);
      qc.invalidateQueries({ queryKey: ["nhia-claims-stats"] });
      qc.invalidateQueries({ queryKey: ["nhia-claims-history"] });
      qc.invalidateQueries({ queryKey: ["nhia-claims-eligible"] });
    },
    onError: (e: any) => toast.error(`Generation failed: ${e.message}`),
  });

  // --- Render ---
  if (!activeFacilityId) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Building2 className="w-12 h-12 mx-auto mb-4 text-slate-400" />
          <h3 className="text-lg font-semibold mb-1">No Facility Selected</h3>
          <p className="text-sm text-slate-500">
            Select a facility in the top bar to view NHIA claims.
          </p>
        </CardContent>
      </Card>
    );
  }

  const k = statsQuery.data?.kpis || {};
  const breakdown = statsQuery.data?.statusBreakdown || {};
  const recent = statsQuery.data?.recentActivity || [];
  const bridgeReachable = healthQuery.data?.reachable;
  const bridgeUrl = healthQuery.data?.bridgeUrl;

  return (
    <div className="space-y-5 fade-in-up">
      {/* Header */}
      <PageHeader
        title="NHIA CLAIM-it Integration"
        description="Generate XML claim files conforming to Ghana's National Health Insurance Authority CLAIM-it schema."
        icon={ShieldCheck}
        gradient="from-indigo-600 via-blue-600 to-cyan-600"
        actions={
          <>
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ["nhia-claims-stats"] });
                qc.invalidateQueries({ queryKey: ["nhia-claims-history"] });
                qc.invalidateQueries({ queryKey: ["nhia-claims-eligible"] });
                qc.invalidateQueries({ queryKey: ["nhia-claims-health"] });
                toast.success("Refreshed");
              }}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
            <ModuleHelp title="NHIA CLAIM-it" sections={HELP_SECTIONS} buttonLabel="Help" />
          </>
        }
      />

      {/* Bridge status banner */}
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border ${bridgeReachable ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="flex items-center gap-2.5">
          {bridgeReachable ? (
            <Wifi className="w-4 h-4 text-emerald-600" />
          ) : (
            <WifiOff className="w-4 h-4 text-amber-600" />
          )}
          <div>
            <p className="text-sm font-semibold text-slate-800">
              CLAIM-it Bridge: {bridgeReachable ? "Reachable" : "Not Reachable"}
            </p>
            <p className="text-xs text-slate-500">
              {bridgeUrl || "http://localhost:31719"} —{" "}
              {bridgeReachable
                ? `Bridge mode available (v${healthQuery.data?.version || "?"})`
                : "Only file-export mode available (download XML manually)"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono bg-white">
            mode: {healthQuery.data?.configuredTransport || "file"}
          </Badge>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MiniStatCard label="Total Exports" value={k.totalExports ?? 0} icon={FileCode2} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="Valid" value={k.validExports ?? 0} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" sublabel={`${k.successRate ?? 0}% success`} />
        <MiniStatCard label="Failed" value={k.failedExports ?? 0} icon={XCircle} gradient="from-rose-500 to-red-600" />
        <MiniStatCard label="Claim Amount" value={formatCurrency(k.totalClaimAmount ?? 0)} icon={TrendingUp} gradient="from-violet-500 to-purple-600" />
        <MiniStatCard label="Downloads" value={k.totalDownloads ?? 0} icon={Download} gradient="from-cyan-500 to-blue-600" />
        <MiniStatCard label="Bridge" value={bridgeReachable ? "Online" : "Offline"} icon={bridgeReachable ? Wifi : WifiOff} gradient={bridgeReachable ? "from-emerald-500 to-teal-600" : "from-amber-500 to-orange-600"} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="dashboard"><Activity className="w-4 h-4 mr-1.5" /> Dashboard</TabsTrigger>
          <TabsTrigger value="eligible"><ListChecks className="w-4 h-4 mr-1.5" /> Eligible Encounters</TabsTrigger>
          <TabsTrigger value="history"><FileText className="w-4 h-4 mr-1.5" /> Generation History</TabsTrigger>
        </TabsList>

        {/* DASHBOARD TAB */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Status breakdown */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><ListChecks className="w-4 h-4 text-slate-500" /> Status Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(STATUS_META).map(([key, meta]) => {
                  const count = breakdown[key] || 0;
                  const total = k.totalExports || 0;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="w-32 shrink-0">
                        <StatusBadge status={key} />
                      </div>
                      <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden relative">
                        <div
                          className={`h-full transition-all ${meta.color.split(" ")[0].replace("bg-", "bg-")}`}
                          style={{ width: `${pct}%`, opacity: 0.7 }}
                        />
                        <span className="absolute inset-0 flex items-center justify-end px-2 text-xs font-bold text-slate-700">
                          {count} ({pct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
                {Object.keys(breakdown).length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-6">No claims generated yet.</p>
                )}
              </CardContent>
            </Card>

            {/* Recent activity */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-slate-500" /> Recent Activity</CardTitle></CardHeader>
              <CardContent>
                {recent.length === 0 ? (
                  <EmptyState title="No activity yet" description="Generated claims will appear here." icon={Clock} />
                ) : (
                  <div className="space-y-2">
                    {recent.map((r: any) => (
                      <button
                        key={r.id}
                        onClick={() => setShowDetail(r)}
                        className="w-full text-left p-2.5 rounded-md border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-3"
                      >
                        <StatusBadge status={r.status} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{r.claimNumber}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {r.patientName || "Unknown"} • {r.encounterId?.slice(-8)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-slate-700">{formatCurrency(r.grossAmount)}</p>
                          <p className="text-[10px] text-slate-500">{formatRelative(r.generatedAt)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick start guide */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Info className="w-4 h-4 text-blue-500" /> Quick Start</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-xs font-bold text-blue-700 mb-1">STEP 1 — Find Eligible Encounter</p>
                <p className="text-xs text-slate-600">Go to <b>Eligible Encounters</b> tab. Only encounters with NHIS invoices, diagnoses, and member numbers are listed.</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs font-bold text-amber-700 mb-1">STEP 2 — Validate</p>
                <p className="text-xs text-slate-600">Click "Validate" to preview the ICO and check for errors before generating XML.</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-xs font-bold text-emerald-700 mb-1">STEP 3 — Generate & Download</p>
                <p className="text-xs text-slate-600">Click "Generate XML", then "Download XML". Import the file into CLAIM-it desktop app.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ELIGIBLE ENCOUNTERS TAB */}
        <TabsContent value="eligible">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Encounters Eligible for NHIA Claim Generation</CardTitle>
                <Button size="sm" variant="outline" onClick={() => eligibleQuery.refetch()} disabled={eligibleQuery.isFetching}>
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${eligibleQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {eligibleQuery.isLoading ? <LoadingState rows={5} /> :
               eligibleQuery.error ? <ErrorState message={(eligibleQuery.error as any)?.message} onRetry={() => eligibleQuery.refetch()} /> :
               eligibleQuery.data?.items?.length === 0 ? (
                <EmptyState
                  title="No Eligible Encounters"
                  description="An encounter becomes eligible when it has: (1) an NHIS invoice, (2) at least one diagnosis, and (3) the patient has an NHIS membership number."
                  icon={ListChecks}
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-xs uppercase tracking-wider text-slate-500">
                        <th className="text-left px-3 py-2 font-bold">Encounter</th>
                        <th className="text-left px-3 py-2 font-bold">Patient</th>
                        <th className="text-left px-3 py-2 font-bold">NHIS #</th>
                        <th className="text-left px-3 py-2 font-bold">Primary Dx</th>
                        <th className="text-right px-3 py-2 font-bold">Invoice</th>
                        <th className="text-right px-3 py-2 font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {eligibleQuery.data?.items?.map((e: any) => (
                        <tr key={e.encounterId} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <div className="font-mono text-xs text-slate-700">{e.encounterNumber}</div>
                            <div className="text-[10px] text-slate-400">{formatDate(e.visitDate)}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-800">{e.patientName}</div>
                            <div className="text-[10px] text-slate-400">{e.patientNumber} • {e.patientSex}</div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs text-slate-700">{e.nhisNumber}</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-xs font-semibold text-slate-700">{e.primaryDiagnosisCode}</div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[180px]">{e.primaryDiagnosisName}</div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="text-sm font-bold text-slate-800">{formatCurrency(e.invoiceTotal)}</div>
                            <div className="text-[10px] text-slate-400">{e.invoiceNumber}</div>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs mr-1"
                              disabled={!canGenerate || validateMutation.isPending}
                              onClick={() => {
                                validateMutation.reset();
                                validateMutation.mutate(e.encounterId);
                                setShowValidate({ __loading: true, encounter: e });
                              }}
                            >
                              <Eye className="w-3 h-3 mr-1" /> Validate
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700"
                              disabled={!canGenerate || generateMutation.isPending}
                              onClick={() => {
                                if (!canGenerate) return;
                                generateMutation.reset();
                                generateMutation.mutate({ encounterId: e.encounterId, transportMode: "file" });
                                setShowXml({ __loading: true, encounter: e });
                              }}
                            >
                              {generateMutation.isPending && generateMutation.variables?.encounterId === e.encounterId ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Zap className="w-3 h-3 mr-1" />
                              )}
                              Generate XML
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">XML Generation History</CardTitle>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Period (yyyy-MM)"
                    value={periodFilter}
                    onChange={(e) => setPeriodFilter(e.target.value)}
                    className="w-32 h-8 text-xs"
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-8 text-xs border border-slate-200 rounded-md px-2"
                  >
                    <option value="all">All Statuses</option>
                    {Object.entries(STATUS_META).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {historyQuery.isLoading ? <LoadingState rows={6} /> :
               historyQuery.error ? <ErrorState message={(historyQuery.error as any)?.message} onRetry={() => historyQuery.refetch()} /> :
               historyQuery.data?.items?.length === 0 ? (
                <EmptyState title="No Generation Records" description="Generate XML from an eligible encounter to see it here." icon={FileText} />
              ) : (
                <HistoryTable
                  items={historyQuery.data?.items || []}
                  onView={(r) => setShowDetail(r)}
                  onDownload={(r) => {
                    window.open(`/api/nhia-claims/download?id=${r.id}`, "_blank");
                    toast.success("Download started");
                  }}
                  canGenerate={canGenerate}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* VALIDATE MODAL */}
      {showValidate && (
        <ValidateDialog
          data={showValidate}
          onClose={() => setShowValidate(null)}
          onGenerate={(encounterId) => {
            setShowValidate(null);
            generateMutation.reset();
            generateMutation.mutate({ encounterId, transportMode: "file" });
            setShowXml({ __loading: true, encounter: showValidate.encounter });
          }}
          canGenerate={canGenerate}
          isValidating={validateMutation.isPending}
        />
      )}

      {/* XML PREVIEW MODAL */}
      {showXml && (
        <XmlPreviewDialog
          data={showXml}
          onClose={() => setShowXml(null)}
          onDownload={() => {
            if (showXml?.item?.id) {
              window.open(`/api/nhia-claims/download?id=${showXml.item.id}`, "_blank");
              toast.success("Download started");
            }
          }}
          canDownload={!!showXml?.item?.id}
        />
      )}

      {/* DETAIL MODAL */}
      {showDetail && (
        <DetailDialog
          record={showDetail}
          onClose={() => setShowDetail(null)}
          onDownload={() => {
            window.open(`/api/nhia-claims/download?id=${showDetail.id}`, "_blank");
            toast.success("Download started");
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// HISTORY TABLE
// =====================================================================
function HistoryTable({ items, onView, onDownload, canGenerate }: {
  items: any[];
  onView: (r: any) => void;
  onDownload: (r: any) => void;
  canGenerate: boolean;
}) {
  const pagination = usePagination(items, 15);
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-xs uppercase tracking-wider text-slate-500">
              <th className="text-left px-3 py-2 font-bold">Claim #</th>
              <th className="text-left px-3 py-2 font-bold">Patient</th>
              <th className="text-left px-3 py-2 font-bold">Status</th>
              <th className="text-center px-3 py-2 font-bold">Errors</th>
              <th className="text-center px-3 py-2 font-bold">Warnings</th>
              <th className="text-right px-3 py-2 font-bold">Amount</th>
              <th className="text-left px-3 py-2 font-bold">Generated</th>
              <th className="text-right px-3 py-2 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagination.pagedItems.map((r: any) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <button onClick={() => onView(r)} className="text-xs font-mono font-semibold text-blue-600 hover:underline">
                    {r.claimNumber}
                  </button>
                  {r.batchRef && <div className="text-[10px] text-slate-400 font-mono">{r.batchRef}</div>}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800 text-xs">{r.patientName || "—"}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{r.encounterId?.slice(-12)}</div>
                </td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2 text-center">
                  {r.errorCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-rose-600 font-bold text-xs">
                      <XCircle className="w-3 h-3" /> {r.errorCount}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  {r.warningCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-600 font-bold text-xs">
                      <AlertTriangle className="w-3 h-3" /> {r.warningCount}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="font-bold text-slate-800">{formatCurrency(r.grossAmount)}</div>
                  <div className="text-[10px] text-slate-400">{r.itemCount} items</div>
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs text-slate-700">{formatRelative(r.generatedAt)}</div>
                  <div className="text-[10px] text-slate-400">{r.generatedByName || "—"}</div>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onView(r)} title="View details">
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    disabled={!canGenerate || !r.xmlPayload}
                    onClick={() => onDownload(r)}
                    title="Download XML"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
      />
    </>
  );
}

// =====================================================================
// VALIDATE DIALOG (pre-generation preview)
// =====================================================================
function ValidateDialog({ data, onClose, onGenerate, canGenerate, isValidating }: {
  data: any;
  onClose: () => void;
  onGenerate: (encounterId: string) => void;
  canGenerate: boolean;
  isValidating: boolean;
}) {
  const ico = data?.ico;
  const validation = data?.validation;
  const warnings: string[] = data?.warnings || [];
  const encounter = data?.encounter;
  const isLoading = data?.__loading;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Eye className="w-5 h-5" /> Validation Preview
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {encounter ? `${encounter.encounterNumber} • ${encounter.patientName}` : "Building intermediate claims object..."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                <p className="text-sm text-slate-500">Validating encounter...</p>
              </div>
            ) : (
              <>
                {/* Validation summary */}
                <div className={`rounded-lg p-4 border-2 ${validation?.valid ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>
                  <div className="flex items-center gap-3">
                    {validation?.valid ? (
                      <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                    ) : (
                      <XCircle className="w-8 h-8 text-rose-600" />
                    )}
                    <div>
                      <p className={`font-bold text-lg ${validation?.valid ? "text-emerald-700" : "text-rose-700"}`}>
                        {validation?.valid ? "VALID — Ready to Generate XML" : `${validation?.errors?.length || 0} Error(s) Found`}
                      </p>
                      <p className="text-xs text-slate-600">
                        {validation?.valid
                          ? "All required fields are present. Click Generate XML below."
                          : "Fix the errors below, then re-validate. Errors block XML generation."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Errors */}
                {validation?.errors?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> Errors ({validation.errors.length})
                    </p>
                    <div className="space-y-1.5">
                      {validation.errors.map((err: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-rose-50 border border-rose-200">
                          <span className="font-mono text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded shrink-0">
                            {err.code}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-700">{err.message}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{err.field}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {validation?.warnings?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Warnings ({validation.warnings.length})
                    </p>
                    <div className="space-y-1.5">
                      {validation.warnings.map((warn: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200">
                          <span className="font-mono text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                            {warn.code}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-700">{warn.message}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{warn.field}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Adapter warnings */}
                {warnings.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5" /> Adapter Notes ({warnings.length})
                    </p>
                    <div className="space-y-1">
                      {warnings.map((w: string, i: number) => (
                        <div key={i} className="text-xs text-slate-600 p-2 bg-slate-50 rounded-md border border-slate-200">
                          • {w}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ICO summary */}
                {ico && (
                  <div>
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">ICO Summary</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 bg-slate-50 rounded-md">
                        <p className="text-slate-400 text-[10px] uppercase">Claim #</p>
                        <p className="font-mono font-semibold text-slate-800">{ico.header?.claimNumber}</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-md">
                        <p className="text-slate-400 text-[10px] uppercase">Batch</p>
                        <p className="font-mono font-semibold text-slate-800">{ico.header?.claimBatchRef}</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-md">
                        <p className="text-slate-400 text-[10px] uppercase">Period</p>
                        <p className="font-mono font-semibold text-slate-800">{ico.header?.submissionPeriod}</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-md">
                        <p className="text-slate-400 text-[10px] uppercase">Facility</p>
                        <p className="font-semibold text-slate-800">{ico.facility?.facilityCode}</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-md">
                        <p className="text-slate-400 text-[10px] uppercase">Patient</p>
                        <p className="font-semibold text-slate-800 truncate">{ico.patient?.surname} {ico.patient?.otherNames}</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-md">
                        <p className="text-slate-400 text-[10px] uppercase">NHIS #</p>
                        <p className="font-mono font-semibold text-slate-800">{ico.patient?.nhisNumber || "—"}</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-md">
                        <p className="text-slate-400 text-[10px] uppercase">Diagnoses</p>
                        <p className="font-semibold text-slate-800">{ico.diagnoses?.length}</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-md">
                        <p className="text-slate-400 text-[10px] uppercase">Items</p>
                        <p className="font-semibold text-slate-800">{(ico.services?.length || 0) + (ico.drugs?.length || 0)}</p>
                      </div>
                    </div>

                    {/* Totals */}
                    <div className="mt-3 p-3 rounded-md bg-gradient-to-br from-slate-700 to-slate-900 text-white">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div>
                          <p className="text-slate-400 text-[10px] uppercase">Services</p>
                          <p className="font-bold">{formatCurrency(ico.totals?.totalServiceAmount)}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-[10px] uppercase">Drugs</p>
                          <p className="font-bold">{formatCurrency(ico.totals?.totalDrugAmount)}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-[10px] uppercase">Gross</p>
                          <p className="font-bold">{formatCurrency(ico.totals?.grossAmount)}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-[10px] uppercase">NHIS</p>
                          <p className="font-bold text-emerald-300">{formatCurrency(ico.totals?.nhisAmount)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-3 shrink-0 border-t bg-slate-50">
          <Button variant="outline" onClick={onClose} className="h-9">Close</Button>
          <Button
            disabled={!canGenerate || isLoading || !validation?.valid}
            onClick={() => onGenerate(encounter?.encounterId)}
            className="h-9 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
          >
            <Zap className="w-4 h-4 mr-1.5" /> Generate XML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// XML PREVIEW DIALOG (post-generation)
// =====================================================================
function XmlPreviewDialog({ data, onClose, onDownload, canDownload }: {
  data: any;
  onClose: () => void;
  onDownload: () => void;
  canDownload: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const xml = data?.xml;
  const item = data?.item;
  const validation = data?.validation;
  const warnings = data?.warnings || [];
  const isLoading = data?.__loading;

  const handleCopy = useCallback(async () => {
    if (!xml) return;
    try {
      await navigator.clipboard.writeText(xml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("XML copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }, [xml]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileCode2 className="w-5 h-5" /> XML Generation Result
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {item?.claimNumber ? `${item.claimNumber} • ${item.xmlSizeBytes || 0} bytes` : "Generating XML..."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin mb-3" />
                <p className="text-sm text-slate-500">Generating XML...</p>
              </div>
            ) : (
              <>
                {/* Result summary */}
                <div className={`rounded-lg p-3 border-2 ${validation?.valid ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"} flex items-center gap-3`}>
                  {validation?.valid ? (
                    <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-7 h-7 text-rose-600 shrink-0" />
                  )}
                  <div>
                    <p className={`font-bold ${validation?.valid ? "text-emerald-700" : "text-rose-700"}`}>
                      {validation?.valid ? "XML Generated Successfully" : "Generation Completed with Errors"}
                    </p>
                    <p className="text-xs text-slate-600">
                      {item ? `Status: ${item.status} • ${item.errorCount} errors • ${item.warningCount} warnings` : ""}
                      {item?.filePath ? ` • Saved to: ${item.filePath}` : ""}
                    </p>
                  </div>
                </div>

                {/* XML content */}
                {xml && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">XML Payload</p>
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={handleCopy}>
                        {copied ? <Check className="w-3 h-3 mr-1 text-emerald-600" /> : <Copy className="w-3 h-3 mr-1" />}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 p-3 rounded-lg max-h-[400px] overflow-auto leading-relaxed">
                      {xml}
                    </pre>
                  </div>
                )}

                {/* Errors if any */}
                {validation?.errors?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-1">Errors</p>
                    <div className="space-y-1">
                      {validation.errors.slice(0, 10).map((err: any, i: number) => (
                        <div key={i} className="text-xs text-slate-700 p-1.5 bg-rose-50 rounded">
                          <span className="font-mono font-bold text-rose-700">[{err.code}]</span> {err.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-3 shrink-0 border-t bg-slate-50">
          <Button variant="outline" onClick={onClose} className="h-9">Close</Button>
          <Button
            disabled={!canDownload || isLoading}
            onClick={onDownload}
            className="h-9 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800"
          >
            <Download className="w-4 h-4 mr-1.5" /> Download XML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// DETAIL DIALOG (view a persisted generation record)
// =====================================================================
function DetailDialog({ record, onClose, onDownload }: {
  record: any;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const setView = useAppStore((s) => s.setView);
  const selectEncounter = useAppStore((s) => s.selectEncounter);
  const errors = useMemo(() => {
    try { return record.validationErrors ? JSON.parse(record.validationErrors) : []; } catch { return []; }
  }, [record]);
  const adapterWarnings = useMemo(() => {
    try { return record.adapterWarnings ? JSON.parse(record.adapterWarnings) : []; } catch { return []; }
  }, [record]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-slate-800 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileCheck2 className="w-5 h-5" /> {record.claimNumber}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Generated {formatRelative(record.generatedAt)} by {record.generatedByName || "—"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">
            {/* Status row */}
            <div className="flex items-center gap-3">
              <StatusBadge status={record.status} />
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-600">Batch: <span className="font-mono">{record.batchRef || "—"}</span></span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-600">Period: <span className="font-mono">{record.submissionPeriod || "—"}</span></span>
            </div>

            {/* IDs */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-slate-400 text-[10px] uppercase">Encounter</p>
                <p className="font-mono text-slate-700 truncate">{record.encounterId}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-slate-400 text-[10px] uppercase">Patient</p>
                <p className="font-semibold text-slate-700 truncate">{record.patientName || "—"}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-slate-400 text-[10px] uppercase">Invoice</p>
                <p className="font-mono text-slate-700 truncate">{record.invoiceId || "—"}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-slate-400 text-[10px] uppercase">Insurance Claim</p>
                <p className="font-mono text-slate-700 truncate">{record.insuranceClaimId || "—"}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-slate-400 text-[10px] uppercase">Transport</p>
                <p className="font-semibold text-slate-700">{record.transportMode || "—"}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-slate-400 text-[10px] uppercase">XML Size</p>
                <p className="font-semibold text-slate-700">{record.xmlSizeBytes ? `${record.xmlSizeBytes} bytes` : "—"}</p>
              </div>
            </div>

            {/* Financials */}
            <div className="p-3 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-white">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Financial Summary</p>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
                <div><p className="text-slate-400 text-[10px]">Services</p><p className="font-bold">{formatCurrency(record.totalServiceAmount)}</p></div>
                <div><p className="text-slate-400 text-[10px]">Drugs</p><p className="font-bold">{formatCurrency(record.totalDrugAmount)}</p></div>
                <div><p className="text-slate-400 text-[10px]">Gross</p><p className="font-bold">{formatCurrency(record.grossAmount)}</p></div>
                <div><p className="text-slate-400 text-[10px]">NHIS</p><p className="font-bold text-emerald-300">{formatCurrency(record.nhisAmount)}</p></div>
                <div><p className="text-slate-400 text-[10px]">Patient</p><p className="font-bold text-amber-300">{formatCurrency(record.patientAmount)}</p></div>
                <div><p className="text-slate-400 text-[10px]">Net</p><p className="font-bold">{formatCurrency(record.netAmount)}</p></div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-600 text-xs flex gap-4 text-slate-300">
                <span>Items: <b className="text-white">{record.itemCount}</b></span>
                <span>Diagnoses: <b className="text-white">{record.diagnosisCount}</b></span>
                <span>Downloads: <b className="text-white">{record.downloadCount}</b></span>
                {record.downloadedAt && <span>Last downloaded: <b className="text-white">{formatRelative(record.downloadedAt)}</b></span>}
              </div>
            </div>

            {/* Transport error */}
            {record.transportError && (
              <div className="p-3 rounded-md bg-rose-50 border border-rose-200">
                <p className="text-xs font-bold text-rose-700 flex items-center gap-1 mb-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Transport Error
                </p>
                <p className="text-xs text-slate-700 font-mono">{record.transportError}</p>
              </div>
            )}

            {/* Submission ref */}
            {record.submissionRef && (
              <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200">
                <p className="text-xs font-bold text-emerald-700 flex items-center gap-1 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Bridge Submission Reference
                </p>
                <p className="text-xs text-slate-700 font-mono">{record.submissionRef}</p>
              </div>
            )}

            {/* Validation errors */}
            {errors.length > 0 && (
              <div>
                <p className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-1.5">Validation Errors ({errors.length})</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {errors.map((err: any, i: number) => (
                    <div key={i} className="text-xs p-1.5 bg-rose-50 rounded border border-rose-200">
                      <span className="font-mono font-bold text-rose-700">[{err.code}]</span>{" "}
                      <span className="text-slate-700">{err.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Adapter warnings */}
            {adapterWarnings.length > 0 && (
              <div>
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1.5">Adapter Notes ({adapterWarnings.length})</p>
                <div className="space-y-1">
                  {adapterWarnings.map((w: string, i: number) => (
                    <div key={i} className="text-xs p-1.5 bg-amber-50 rounded border border-amber-200 text-slate-700">• {w}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-3 shrink-0 border-t bg-slate-50">
          <Button
            variant="outline"
            className="h-9 mr-auto"
            onClick={() => {
              if (record.encounterId) selectEncounter(record.encounterId);
              setView("insurance_claims");
              onClose();
            }}
          >
            <ShieldCheck className="w-4 h-4 mr-1.5" /> View Insurance Claim
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => {
              if (record.encounterId) selectEncounter(record.encounterId);
              setView("nhis_workflow");
              onClose();
            }}
          >
            <ShieldCheck className="w-4 h-4 mr-1.5" /> Open NHIS Workflow
          </Button>
          <Button variant="outline" onClick={onClose} className="h-9">Close</Button>
          <Button
            disabled={!record.xmlPayload}
            onClick={onDownload}
            className="h-9 bg-gradient-to-r from-slate-700 to-slate-900"
          >
            <Download className="w-4 h-4 mr-1.5" /> Download XML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

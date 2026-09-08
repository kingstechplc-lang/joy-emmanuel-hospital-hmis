"use client";

// =====================================================================
// CLINICAL ALERT CENTER — CDSS alert management view
// =====================================================================
// Displays clinical decision support alerts organized by severity,
// with lifecycle actions (acknowledge, dismiss, override, escalate,
// resolve).  Follows the existing HMIS design patterns:
//   - PageHeader with gradient banner
//   - MiniStatCard KPIs
//   - Filter bar
//   - Alert cards with severity-colored gradients
//   - Lifecycle action buttons per alert
// =====================================================================

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldAlert, AlertTriangle, Activity, CheckCircle2, XCircle,
  ArrowUpCircle, Bell, RefreshCcw, Filter, ChevronDown, ChevronUp,
  AlertOctagon, Pill, FlaskConical, HeartPulse, Eye, Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, PageHeader, MiniStatCard,
  formatDate, formatRelative, safeJson,
} from "@/components/ui-helpers";

const SEVERITY_CONFIG: Record<string, { label: string; gradient: string; border: string; bg: string; text: string; icon: any }> = {
  critical: { label: "CRITICAL", gradient: "from-rose-600 to-red-700", border: "border-rose-300", bg: "bg-rose-50", text: "text-rose-700", icon: AlertOctagon },
  high:     { label: "HIGH",     gradient: "from-orange-500 to-amber-600", border: "border-orange-300", bg: "bg-orange-50", text: "text-orange-700", icon: AlertTriangle },
  moderate: { label: "MODERATE", gradient: "from-amber-400 to-yellow-500", border: "border-amber-300", bg: "bg-amber-50", text: "text-amber-700", icon: AlertTriangle },
  low:      { label: "LOW",      gradient: "from-blue-400 to-cyan-500", border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", icon: Activity },
  info:     { label: "INFO",     gradient: "from-slate-400 to-slate-500", border: "border-slate-200", bg: "bg-slate-50", text: "text-slate-600", icon: Bell },
};

const ALERT_TYPE_CONFIG: Record<string, { label: string; icon: any }> = {
  drug_allergy:          { label: "Drug Allergy",           icon: Pill },
  drug_drug_interaction: { label: "Drug Interaction",      icon: FlaskConical },
  therapeutic_duplication:{ label: "Therapeutic Duplication",icon: Pill },
  critical_lab:          { label: "Critical Lab Result",   icon: FlaskConical },
  abnormal_vital:        { label: "Abnormal Vital Signs",  icon: HeartPulse },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active:      { label: "Active",       className: "bg-rose-100 text-rose-700 border-rose-200" },
  acknowledged:{ label: "Acknowledged", className: "bg-blue-100 text-blue-700 border-blue-200" },
  dismissed:   { label: "Dismissed",    className: "bg-slate-100 text-slate-500 border-slate-200" },
  overridden:  { label: "Overridden",   className: "bg-amber-100 text-amber-700 border-amber-200" },
  resolved:    { label: "Resolved",     className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  escalated:   { label: "Escalated",    className: "bg-purple-100 text-purple-700 border-purple-200" },
  expired:     { label: "Expired",      className: "bg-slate-100 text-slate-400 border-slate-200" },
};

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function ClinicalAlertCenterView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canAcknowledge = user?.roles?.includes("super_admin") || perms.includes("clinical_alert.acknowledge") || perms.includes("cdss.view");
  const canOverride = user?.roles?.includes("super_admin") || perms.includes("clinical_alert.override");
  const canEscalate = user?.roles?.includes("super_admin") || perms.includes("clinical_alert.escalate");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const selectEncounter = useAppStore((s) => s.selectEncounter);
  const setView = useAppStore((s) => s.setView);
  const qc = useQueryClient();
  const [filter, setFilter] = useState("active");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [overrideDialog, setOverrideDialog] = useState<any | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (filter !== "all") params.set("status", filter);
  if (typeFilter !== "all") params.set("alertType", typeFilter);
  if (severityFilter !== "all") params.set("severity", severityFilter);
  params.set("limit", "100");
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["cdss-alerts", activeFacilityId, filter, typeFilter, severityFilter],
    queryFn: () => fetchJson(`/api/cdss/alerts${qs}`),
    enabled: !!activeFacilityId,
    refetchInterval: 30000,
  });

  const alerts: any[] = data?.items || [];

  // KPI counts
  const kpis = useMemo(() => {
    const allAlerts = alerts;
    const active = allAlerts.filter((a) => a.status === "active");
    const critical = active.filter((a) => a.severity === "critical");
    const high = active.filter((a) => a.severity === "high");
    const allergy = active.filter((a) => a.alertType === "drug_allergy");
    const lab = active.filter((a) => a.alertType === "critical_lab");
    const vitals = active.filter((a) => a.alertType === "abnormal_vital");
    return { total: allAlerts.length, active: active.length, critical: critical.length, high: high.length, allergy: allergy.length, lab: lab.length, vitals: vitals.length };
  }, [alerts]);

  // Lifecycle mutation
  const lifecycleMut = useMutation({
    mutationFn: async (payload: { action: string; alertId: string; note?: string; reason?: string }) => {
      const res = await fetch("/api/cdss/alerts", {
        method: "POST",
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
      const verb = vars.action === "acknowledge" ? "acknowledged" : vars.action === "dismiss" ? "dismissed" : vars.action === "override" ? "overridden" : vars.action === "escalate" ? "escalated" : "resolved";
      toast.success(`Alert ${verb}`);
      qc.invalidateQueries({ queryKey: ["cdss-alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleOverride = () => {
    if (!overrideDialog || !overrideReason.trim()) {
      toast.error("Override reason is required");
      return;
    }
    lifecycleMut.mutate({ action: "override", alertId: overrideDialog.id, reason: overrideReason });
    setOverrideDialog(null);
    setOverrideReason("");
  };

  const goToPatient360 = (patientId: string) => {
    selectPatient(patientId);
    setView("patient_360");
  };

  const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
  const sortedAlerts = [...alerts].sort((a, b) => (severityOrder[a.severity as keyof typeof severityOrder] ?? 5) - (severityOrder[b.severity as keyof typeof severityOrder] ?? 5));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clinical Alert Center"
        description="Real-time clinical decision support alerts — drug-allergy, drug interactions, critical lab results, and abnormal vitals. Auto-refreshes every 30 seconds."
        icon={ShieldAlert}
        gradient="from-rose-600 to-red-700"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="bg-white/90 border-0 text-slate-700 hover:bg-white">
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <MiniStatCard label="Total Alerts" value={kpis.total} icon={Bell} gradient="from-slate-500 to-slate-600" />
        <MiniStatCard label="Active" value={kpis.active} icon={AlertTriangle} gradient="from-rose-500 to-red-600" />
        <MiniStatCard label="Critical" value={kpis.critical} icon={AlertOctagon} gradient="from-rose-600 to-red-700" />
        <MiniStatCard label="High" value={kpis.high} icon={AlertTriangle} gradient="from-orange-500 to-amber-600" />
        <MiniStatCard label="Drug Allergy" value={kpis.allergy} icon={Pill} gradient="from-purple-500 to-violet-600" />
        <MiniStatCard label="Critical Lab" value={kpis.lab} icon={FlaskConical} gradient="from-cyan-500 to-blue-600" />
        <MiniStatCard label="Abnormal Vitals" value={kpis.vitals} icon={HeartPulse} gradient="from-emerald-500 to-teal-600" />
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-3 w-full flex flex-wrap gap-2 items-center">
          <div className="flex gap-1 border rounded-md p-0.5">
            {["active", "acknowledged", "overridden", "resolved", "escalated", "all"].map((s) => (
              <Button key={s} variant={filter === s ? "default" : "ghost"} size="sm" className="h-7 capitalize" onClick={() => setFilter(s)}>
                {s}
              </Button>
            ))}
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="drug_allergy">Drug Allergy</SelectItem>
              <SelectItem value="drug_drug_interaction">Drug Interaction</SelectItem>
              <SelectItem value="critical_lab">Critical Lab</SelectItem>
              <SelectItem value="abnormal_vital">Abnormal Vitals</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All Severities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Search alerts..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs h-8 text-xs" />
        </CardContent>
      </Card>

      {/* Alert List */}
      <Card className="w-full">
        <CardContent className="p-0 w-full">
          {isLoading ? (
            <LoadingState rows={5} />
          ) : isError ? (
            <ErrorState message="Failed to load clinical alerts" onRetry={() => refetch()} />
          ) : sortedAlerts.length === 0 ? (
            <EmptyState
              title={filter === "active" ? "No active clinical alerts" : "No alerts match your filters"}
              description={filter === "active" ? "All clear! No outstanding clinical safety alerts at this time." : "Try adjusting your filter criteria."}
              icon={CheckCircle2}
            />
          ) : (
            <div className="divide-y w-full">
              {sortedAlerts
                .filter((a) => {
                  if (!search.trim()) return true;
                  const q = search.toLowerCase();
                  return a.title?.toLowerCase().includes(q) || a.message?.toLowerCase().includes(q) || a.alertType?.toLowerCase().includes(q);
                })
                .map((alert) => {
                  const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
                  const typeCfg = ALERT_TYPE_CONFIG[alert.alertType] || { label: alert.alertType, icon: Bell };
                  const statusCfg = STATUS_CONFIG[alert.status] || STATUS_CONFIG.active;
                  const isExpanded = expandedId === alert.id;
                  const evidence = alert.evidence ? (typeof alert.evidence === "string" ? JSON.parse(alert.evidence) : alert.evidence) : {};
                  const SevIcon = sev.icon;
                  const TypeIcon = typeCfg.icon;

                  return (
                    <div key={alert.id} className={`w-full border-l-4 ${sev.border.replace("border-", "border-l-")} transition-all hover:shadow-sm`}>
                      {/* Alert header row */}
                      <div className={`p-3 sm:p-4 ${sev.bg} ${isExpanded ? "rounded-t-lg" : ""}`} >
                        <div className="flex items-start gap-3">
                          {/* Severity icon */}
                          <div className={`shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${sev.gradient} flex items-center justify-center text-white shadow-sm`}>
                            <SevIcon className="w-5 h-5" />
                          </div>

                          {/* Alert content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {/* Severity badge */}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md text-white bg-gradient-to-r ${sev.gradient} shadow-sm`}>
                                {sev.label}
                              </span>
                              {/* Alert type badge */}
                              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-white ${sev.text}">
                                <TypeIcon className="w-3 h-3" /> {typeCfg.label}
                              </span>
                              {/* Status badge */}
                              {alert.status !== "active" && (
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${statusCfg.className}`}>
                                  {statusCfg.label}
                                </span>
                              )}
                              {/* Timestamp */}
                              <span className="text-[10px] text-slate-400">{formatRelative(alert.createdAt)}</span>
                            </div>

                            <p className={`text-sm font-semibold ${sev.text} mb-1`}>{alert.title}</p>
                            <p className="text-xs text-slate-600 leading-relaxed break-words">{alert.message}</p>

                            {/* Recommendation */}
                            {alert.recommendation && (
                              <p className="text-xs text-slate-500 italic mt-1.5 flex items-start gap-1">
                                <Stethoscope className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>{alert.recommendation}</span>
                              </p>
                            )}

                            {/* Action buttons */}
                            {alert.status === "active" && (
                              <div className="flex flex-wrap gap-1.5 mt-2.5">
                                {canAcknowledge && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-blue-200 hover:bg-blue-50 text-blue-700"
                                    disabled={lifecycleMut.isPending}
                                    onClick={() => lifecycleMut.mutate({ action: "acknowledge", alertId: alert.id })}>
                                    <CheckCircle2 className="w-3 h-3" /> Acknowledge
                                  </Button>
                                )}
                                {canOverride && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-amber-200 hover:bg-amber-50 text-amber-700"
                                    disabled={lifecycleMut.isPending}
                                    onClick={() => setOverrideDialog(alert)}>
                                    <XCircle className="w-3 h-3" /> Override
                                  </Button>
                                )}
                                {canEscalate && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-purple-200 hover:bg-purple-50 text-purple-700"
                                    disabled={lifecycleMut.isPending}
                                    onClick={() => lifecycleMut.mutate({ action: "escalate", alertId: alert.id })}>
                                    <ArrowUpCircle className="w-3 h-3" /> Escalate
                                  </Button>
                                )}
                                {canAcknowledge && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-slate-200 hover:bg-slate-50 text-slate-500"
                                    disabled={lifecycleMut.isPending}
                                    onClick={() => lifecycleMut.mutate({ action: "dismiss", alertId: alert.id })}>
                                    <XCircle className="w-3 h-3" /> Dismiss
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                                  onClick={() => setExpandedId(isExpanded ? null : alert.id)}>
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  {isExpanded ? "Hide" : "Details"}
                                </Button>
                              </div>
                            )}

                            {/* Lifecycle timestamps */}
                            {(alert.status === "acknowledged" || alert.status === "overridden" || alert.status === "resolved" || alert.status === "escalated") && (
                              <div className="text-[10px] text-slate-400 mt-2 flex flex-wrap gap-2">
                                {alert.acknowledgedAt && <span>Ack: {formatDate(alert.acknowledgedAt, true)}</span>}
                                {alert.overrideAt && <span>Override: {formatDate(alert.overrideAt, true)}</span>}
                                {alert.overrideReason && <span>Reason: {alert.overrideReason}</span>}
                                {alert.escalatedAt && <span>Escalated: {formatDate(alert.escalatedAt, true)}</span>}
                                {alert.resolvedAt && <span>Resolved: {formatDate(alert.resolvedAt, true)}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="p-4 bg-white border-t">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            {/* Evidence */}
                            {evidence && Object.keys(evidence).length > 0 && (
                              <div>
                                <p className="font-bold uppercase tracking-wider text-slate-500 mb-1.5">Clinical Evidence</p>
                                <div className="space-y-1">
                                  {Object.entries(evidence).map(([k, v]) => (
                                    <div key={k} className="flex gap-2">
                                      <span className="font-medium text-slate-600 capitalize min-w-[120px]">{k.replace(/([A-Z])/g, " $1").trim()}:</span>
                                      <span className="text-slate-800">{String(v ?? "—")}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Meta */}
                            <div>
                              <p className="font-bold uppercase tracking-wider text-slate-500 mb-1.5">Alert Metadata</p>
                              <div className="space-y-1">
                                <div className="flex gap-2"><span className="font-medium text-slate-600 min-w-[120px]">Alert ID:</span><span className="text-slate-800 font-mono">{alert.id}</span></div>
                                <div className="flex gap-2"><span className="font-medium text-slate-600 min-w-[120px]">Rule ID:</span><span className="text-slate-800 font-mono">{alert.ruleId || "—"}</span></div>
                                <div className="flex gap-2"><span className="font-medium text-slate-600 min-w-[120px]">Source:</span><span className="text-slate-800">{alert.sourceType || "—"} {alert.sourceId ? `(${alert.sourceId.slice(-8)})` : ""}</span></div>
                                <div className="flex gap-2"><span className="font-medium text-slate-600 min-w-[120px]">Patient ID:</span><span className="text-slate-800 font-mono">{alert.patientId?.slice(-8) || "—"}</span></div>
                                <div className="flex gap-2"><span className="font-medium text-slate-600 min-w-[120px]">Encounter ID:</span><span className="text-slate-800 font-mono">{alert.encounterId?.slice(-8) || "—"}</span></div>
                                <div className="flex gap-2"><span className="font-medium text-slate-600 min-w-[120px]">Created:</span><span className="text-slate-800">{formatDate(alert.createdAt, true)}</span></div>
                                {alert.acknowledgedNote && <div className="flex gap-2"><span className="font-medium text-slate-600 min-w-[120px]">Ack Note:</span><span className="text-slate-800">{alert.acknowledgedNote}</span></div>}
                              </div>
                              {alert.patientId && (
                                <Button size="sm" variant="ghost" className="h-7 mt-2 text-xs gap-1 text-purple-700 hover:bg-purple-50"
                                  onClick={() => goToPatient360(alert.patientId)}>
                                  <Eye className="w-3 h-3" /> View Patient 360
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Override Dialog */}
      {overrideDialog && (
        <Dialog open onOpenChange={(o) => !o && setOverrideDialog(null)}>
          <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="compact">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
              <DialogTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Override Clinical Alert
              </DialogTitle>
              <DialogDescription className="text-white/80">
                You are overriding a {overrideDialog.severity} clinical safety alert. This action is auditable.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-semibold text-amber-900">{overrideDialog.title}</p>
                <p className="text-amber-700 text-xs mt-1">{overrideDialog.message}</p>
              </div>
              <div>
                <Label className="text-sm font-semibold">Override Reason (required)</Label>
                <Textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={3} placeholder="Document the clinical rationale for overriding this safety alert..." />
              </div>
            </div>
            <DialogFooter className="p-6 pt-4 shrink-0 border-t">
              <Button variant="outline" onClick={() => setOverrideDialog(null)}>Cancel</Button>
              <Button onClick={handleOverride} disabled={!overrideReason.trim() || lifecycleMut.isPending} className="bg-amber-600 hover:bg-amber-700 gap-2">
                <XCircle className="w-4 h-4" /> Confirm Override
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

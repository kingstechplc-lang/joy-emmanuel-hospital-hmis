"use client";

// =====================================================================
// DISCHARGE SUMMARY CENTER
// =====================================================================
// Lists, drafts, reviews, approves, finalizes, amends and prints
// DischargeSummary documents for clinical encounters.
//
// Workflow:
//   1. Clinician clicks "New Discharge Summary" → selects an encounter
//      from a searchable picker (filtered to encounters with at least
//      one consultation/diagnosis/prescription).
//   2. The draft is auto-assembled from encounter data (see
//      `src/lib/discharge-summary/assembler.ts`) and saved as
//      status="draft".
//   3. Clinician reviews/edits the content in the editor dialog, then:
//        - Submit for Review  → status="reviewed"
//        - Approve            → status="approved"  (requires finalize perm)
//        - Finalize           → status="finalized" (requires finalize perm)
//        - Amend              → status="amended" with reason
//   4. Print the finalized summary via PrintButton + DischargeSummaryTemplate.
//
// Permissions (already seeded into role definitions):
//   - discharge_summary.view     — see + open the list
//   - discharge_summary.create    — create drafts, review, update
//   - discharge_summary.finalize  — approve, finalize, amend
//   - discharge_summary.print     — print (also given to viewers)
// =====================================================================

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Plus, RefreshCcw, CheckCircle2, XCircle, Eye,
  Printer, AlertTriangle, Clock, FileCheck2, FileEdit, FilePen,
  Stethoscope, Activity, Pill, FlaskConical, Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, PageHeader, MiniStatCard,
  formatDate, formatRelative, safeJson,
} from "@/components/ui-helpers";
import { PrintButton } from "@/components/print/print-layout";
import { DischargeSummaryTemplate } from "@/components/print/templates/discharge-summary-template";

// ─── Status config ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  draft:     { label: "Draft",      className: "bg-slate-100 text-slate-700 border-slate-200", icon: FileEdit },
  reviewed:  { label: "Reviewed",   className: "bg-blue-100 text-blue-700 border-blue-200", icon: Eye },
  approved:  { label: "Approved",   className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: FileCheck2 },
  finalized: { label: "Finalized",  className: "bg-emerald-600 text-white border-emerald-700", icon: CheckCircle2 },
  amended:   { label: "Amended",    className: "bg-amber-100 text-amber-700 border-amber-200", icon: FilePen },
};

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function DischargeSummaryView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canCreate = user?.roles?.includes("super_admin") || perms.includes("discharge_summary.create");
  const canFinalize = user?.roles?.includes("super_admin") || perms.includes("discharge_summary.finalize");
  const canPrint = user?.roles?.includes("super_admin") || perms.includes("discharge_summary.print") || perms.includes("discharge_summary.view");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [amendDialogId, setAmendDialogId] = useState<string | null>(null);
  const [amendReason, setAmendReason] = useState("");

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (filter !== "all") params.set("status", filter);
  params.set("limit", "200");
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["discharge-summaries", activeFacilityId, filter],
    queryFn: () => fetchJson(`/api/discharge-summaries${qs}`),
    enabled: !!activeFacilityId,
    refetchInterval: 60000,
  });

  const summaries: any[] = data?.items || [];

  // KPIs
  const kpis = useMemo(() => {
    return {
      total: summaries.length,
      drafts: summaries.filter((s) => s.status === "draft").length,
      reviewed: summaries.filter((s) => s.status === "reviewed").length,
      approved: summaries.filter((s) => s.status === "approved").length,
      finalized: summaries.filter((s) => s.status === "finalized").length,
      amended: summaries.filter((s) => s.status === "amended").length,
    };
  }, [summaries]);

  // Create draft
  const createMut = useMutation({
    mutationFn: async (payload: { encounterId: string }) => {
      const res = await fetch("/api/discharge-summaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to create draft");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Draft created: ${data.summaryNumber}`);
      qc.invalidateQueries({ queryKey: ["discharge-summaries"] });
      setNewDialogOpen(false);
      setEditorId(data.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Lifecycle
  const lifecycleMut = useMutation({
    mutationFn: async (payload: { id: string; action: string; content?: string; reason?: string }) => {
      const res = await fetch(`/api/discharge-summaries/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (_d, vars) => {
      const verb =
        vars.action === "review" ? "submitted for review" :
        vars.action === "approve" ? "approved" :
        vars.action === "finalize" ? "finalized" :
        vars.action === "amend" ? "amended" : "updated";
      toast.success(`Summary ${verb}`);
      qc.invalidateQueries({ queryKey: ["discharge-summaries"] });
      if (vars.action === "amend") {
        setAmendDialogId(null);
        setAmendReason("");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleAmend = () => {
    if (!amendDialogId || !amendReason.trim()) {
      toast.error("Amendment reason is required");
      return;
    }
    lifecycleMut.mutate({ id: amendDialogId, action: "amend", reason: amendReason });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Discharge Summaries"
        description="Generate, review, approve, finalize and print discharge summaries for clinical encounters. Auto-assembled from encounter diagnoses, consultations, investigations, prescriptions and vitals."
        icon={FileText}
        gradient="from-emerald-600 to-teal-700"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="bg-white/90 border-0 text-slate-700 hover:bg-white">
              <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            {canCreate && (
              <Button size="sm" onClick={() => setNewDialogOpen(true)} className="bg-white/95 hover:bg-white text-emerald-700 border-0">
                <Plus className="w-4 h-4 mr-1" /> New Summary
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniStatCard label="Total" value={kpis.total} icon={FileText} gradient="from-slate-500 to-slate-600" />
        <MiniStatCard label="Drafts" value={kpis.drafts} icon={FileEdit} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="Reviewed" value={kpis.reviewed} icon={Eye} gradient="from-cyan-500 to-teal-600" />
        <MiniStatCard label="Approved" value={kpis.approved} icon={FileCheck2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Finalized" value={kpis.finalized} icon={CheckCircle2} gradient="from-emerald-600 to-teal-700" />
        <MiniStatCard label="Amended" value={kpis.amended} icon={FilePen} gradient="from-amber-500 to-orange-600" />
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-3 w-full flex flex-wrap gap-2 items-center">
          <div className="flex gap-1 border rounded-md p-0.5">
            {["all", "draft", "reviewed", "approved", "finalized", "amended"].map((s) => (
              <Button key={s} variant={filter === s ? "default" : "ghost"} size="sm" className="h-7 capitalize" onClick={() => setFilter(s)}>
                {s === "all" ? "All" : STATUS_CONFIG[s]?.label || s}
              </Button>
            ))}
          </div>
          <Input placeholder="Search by patient, summary #, diagnosis..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm h-8 text-xs" />
        </CardContent>
      </Card>

      {/* Summary List */}
      <Card className="w-full">
        <CardContent className="p-0 w-full">
          {isLoading ? (
            <LoadingState rows={5} />
          ) : isError ? (
            <ErrorState message="Failed to load discharge summaries" onRetry={() => refetch()} />
          ) : summaries.length === 0 ? (
            <EmptyState
              title={filter === "all" ? "No discharge summaries yet" : `No ${filter} summaries`}
              description={filter === "all" ? "Click 'New Summary' to generate a discharge summary for a patient encounter." : "Try a different filter."}
              icon={FileText}
            />
          ) : (
            <div className="divide-y w-full">
              {summaries
                .filter((s) => {
                  if (!search.trim()) return true;
                  const q = search.toLowerCase();
                  const patientName = `${s.patient?.firstName || ""} ${s.patient?.lastName || ""}`.toLowerCase();
                  return (
                    s.summaryNumber?.toLowerCase().includes(q) ||
                    patientName.includes(q) ||
                    s.patient?.patientNumber?.toLowerCase().includes(q) ||
                    s.primaryDiagnosisName?.toLowerCase().includes(q) ||
                    s.encounter?.encounterNumber?.toLowerCase().includes(q)
                  );
                })
                .map((s) => {
                  const status = STATUS_CONFIG[s.status] || STATUS_CONFIG.draft;
                  const SIcon = status.icon;
                  const patientName = `${s.patient?.firstName || ""} ${s.patient?.lastName || ""}`.trim() || "—";
                  const isFinalized = s.status === "finalized";
                  const isAmended = s.status === "amended";

                  return (
                    <div key={s.id} className="p-3 sm:p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start gap-3">
                        {/* Status icon */}
                        <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm ${
                          s.status === "finalized" ? "bg-gradient-to-br from-emerald-600 to-teal-700" :
                          s.status === "amended" ? "bg-gradient-to-br from-amber-500 to-orange-600" :
                          s.status === "approved" ? "bg-gradient-to-br from-emerald-500 to-emerald-600" :
                          s.status === "reviewed" ? "bg-gradient-to-br from-cyan-500 to-teal-600" :
                          "bg-gradient-to-br from-blue-500 to-blue-600"
                        }`}>
                          <SIcon className="w-5 h-5" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${status.className}`}>
                              {status.label.toUpperCase()}
                            </span>
                            <span className="font-mono text-xs text-slate-500">{s.summaryNumber}</span>
                            <span className="text-[10px] text-slate-400">·</span>
                            <span className="text-xs text-slate-700 font-medium">{patientName}</span>
                            {s.patient?.patientNumber && (
                              <span className="text-[10px] text-slate-400 font-mono">({s.patient.patientNumber})</span>
                            )}
                            <span className="text-[10px] text-slate-400">· {formatRelative(s.createdAt)}</span>
                            {s.version > 1 && (
                              <span className="text-[10px] text-amber-600 font-semibold">v{s.version}</span>
                            )}
                          </div>

                          <p className="text-sm text-slate-800 mb-0.5">
                            {s.primaryDiagnosisName || (
                              <span className="text-slate-400 italic">No primary diagnosis</span>
                            )}
                          </p>
                          {s.primaryDiagnosisCode && (
                            <p className="text-xs text-slate-500 font-mono mb-1">
                              ICD-10: {s.primaryDiagnosisCode}
                            </p>
                          )}

                          <div className="flex items-center gap-3 text-[10px] text-slate-400">
                            <span className="flex items-center gap-0.5">
                              <Stethoscope className="w-3 h-3" />
                              {s.encounter?.encounterType?.replace(/_/g, " ") || "—"}
                            </span>
                            {s.encounter?.encounterNumber && (
                              <span className="font-mono">{s.encounter.encounterNumber}</span>
                            )}
                            {(s as any).attendingClinician && (
                              <span className="flex items-center gap-0.5">
                                <Activity className="w-3 h-3" />
                                Dr. {(s as any).attendingClinician.lastName}
                              </span>
                            )}
                            {s.finalizedAt && (
                              <span className="flex items-center gap-0.5 text-emerald-600">
                                <CheckCircle2 className="w-3 h-3" /> Finalized {formatDate(s.finalizedAt, true)}
                              </span>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-1.5 mt-2.5">
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                              onClick={() => setEditorId(s.id)}>
                              <Eye className="w-3 h-3" /> Open
                            </Button>
                            {canPrint && s.status !== "draft" && (
                              <PrintButton
                                label="Print"
                                className="h-7 px-2 text-xs gap-1 border-slate-200"
                                documentType="discharge"
                                recordId={s.summaryNumber}
                                recordSummary={`${patientName} — ${s.primaryDiagnosisName || "Discharge summary"}`}
                                renderContent={() => <DischargeSummaryTemplate summary={s} />}
                              />
                            )}
                            {canCreate && s.status === "draft" && (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-blue-200 hover:bg-blue-50 text-blue-700"
                                disabled={lifecycleMut.isPending}
                                onClick={() => lifecycleMut.mutate({ id: s.id, action: "review" })}>
                                <Eye className="w-3 h-3" /> Submit for Review
                              </Button>
                            )}
                            {canFinalize && s.status === "reviewed" && (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-emerald-200 hover:bg-emerald-50 text-emerald-700"
                                disabled={lifecycleMut.isPending}
                                onClick={() => lifecycleMut.mutate({ id: s.id, action: "approve" })}>
                                <FileCheck2 className="w-3 h-3" /> Approve
                              </Button>
                            )}
                            {canFinalize && (s.status === "reviewed" || s.status === "approved" || s.status === "draft") && (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-medium"
                                disabled={lifecycleMut.isPending}
                                onClick={() => lifecycleMut.mutate({ id: s.id, action: "finalize" })}>
                                <CheckCircle2 className="w-3 h-3" /> Finalize
                              </Button>
                            )}
                            {canFinalize && (isFinalized || isAmended) && (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-amber-200 hover:bg-amber-50 text-amber-700"
                                disabled={lifecycleMut.isPending}
                                onClick={() => setAmendDialogId(s.id)}>
                                <FilePen className="w-3 h-3" /> Amend
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Summary Dialog — encounter picker */}
      {newDialogOpen && (
        <NewSummaryDialog
          open={newDialogOpen}
          onClose={() => setNewDialogOpen(false)}
          facilityId={activeFacilityId!}
          onPick={(encounterId) => createMut.mutate({ encounterId })}
          isPending={createMut.isPending}
        />
      )}

      {/* Editor Dialog */}
      {editorId && (
        <DischargeSummaryEditorDialog
          id={editorId}
          onClose={() => setEditorId(null)}
          canCreate={canCreate}
          canFinalize={canFinalize}
          canPrint={canPrint}
          lifecycleMut={lifecycleMut}
        />
      )}

      {/* Amend Dialog */}
      {amendDialogId && (
        <Dialog open onOpenChange={(o) => !o && setAmendDialogId(null)}>
          <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="compact">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
              <DialogTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Amend Discharge Summary
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Amendment creates a new version. The previous finalized content is preserved in the audit log.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-3">
              <div>
                <Label className="text-sm font-semibold">Amendment Reason (required)</Label>
                <Textarea
                  value={amendReason}
                  onChange={(e) => setAmendReason(e.target.value)}
                  rows={4}
                  placeholder="Document the clinical or administrative reason for amending this discharge summary..."
                />
              </div>
            </div>
            <DialogFooter className="p-6 pt-4 shrink-0 border-t">
              <Button variant="outline" onClick={() => setAmendDialogId(null)}>Cancel</Button>
              <Button onClick={handleAmend} disabled={!amendReason.trim() || lifecycleMut.isPending} className="bg-amber-600 hover:bg-amber-700 gap-2">
                <FilePen className="w-4 h-4" /> Confirm Amendment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// =====================================================================
// NEW SUMMARY DIALOG — searchable encounter picker
// =====================================================================
function NewSummaryDialog({
  open, onClose, facilityId, onPick, isPending,
}: {
  open: boolean;
  onClose: () => void;
  facilityId: string;
  onPick: (encounterId: string) => void;
  isPending: boolean;
}) {
  const [search, setSearch] = useState("");

  // Fetch encounters with patient + latest consultation for the picker
  const { data, isLoading } = useQuery({
    queryKey: ["encounters-for-summary", facilityId, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("facilityId", facilityId);
      params.set("limit", "50");
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/encounters?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load encounters");
      return safeJson(res);
    },
    enabled: open && !!facilityId,
    refetchInterval: 30000,
  });

  const encounters: any[] = data?.items || data?.encounters || [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="wide">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <Plus className="w-5 h-5" /> New Discharge Summary
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Select an encounter to generate a draft discharge summary. The content will be auto-assembled from the encounter's diagnoses, consultations, investigations, prescriptions and vitals.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by patient name, encounter number, or MRN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-10"
            />
          </div>
          {isLoading ? (
            <LoadingState rows={5} />
          ) : encounters.length === 0 ? (
            <EmptyState title="No encounters found" description="Try a different search, or register a new patient / consultation first." icon={Stethoscope} />
          ) : (
            <div className="space-y-2">
              {encounters.map((e) => {
                const patientName = `${e.patient?.firstName || ""} ${e.patient?.lastName || ""}`.trim() || "—";
                const isEligible = (e.status === "completed" || e.status === "discharged" || e.status === "in_progress");
                return (
                  <button
                    key={e.id}
                    onClick={() => isEligible && onPick(e.id)}
                    disabled={!isEligible || isPending}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      isEligible
                        ? "border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 cursor-pointer"
                        : "border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm text-slate-900">{patientName}</span>
                          {e.patient?.patientNumber && (
                            <span className="text-[10px] text-slate-400 font-mono">({e.patient.patientNumber})</span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                            e.status === "completed" || e.status === "discharged"
                              ? "bg-emerald-100 text-emerald-700"
                              : e.status === "in_progress"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-100 text-slate-600"
                          }`}>
                            {e.status?.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span className="font-mono">{e.encounterNumber}</span>
                          <span className="capitalize">{e.encounterType?.replace(/_/g, " ")}</span>
                          <span>· {formatDate(e.startAt, true)}</span>
                        </div>
                      </div>
                      {!isEligible && (
                        <span className="text-[10px] text-slate-400 italic">Only completed/discharged encounters can have summaries</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t bg-slate-50">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// EDITOR DIALOG — view/edit content + take lifecycle actions
// =====================================================================
function DischargeSummaryEditorDialog({
  id, onClose, canCreate, canFinalize, canPrint, lifecycleMut,
}: {
  id: string;
  onClose: () => void;
  canCreate: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  lifecycleMut: any;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["discharge-summary", id],
    queryFn: () => fetchJson(`/api/discharge-summaries/${id}`),
  });

  const summary = data;
  const content = useMemo(() => {
    if (!summary?.content) return {};
    if (typeof summary.content === "object") return summary.content;
    try { return JSON.parse(summary.content); } catch { return {}; }
  }, [summary?.content]);

  const isFinalized = summary?.status === "finalized";
  const isAmended = summary?.status === "amended";
  const isLocked = isFinalized || isAmended;

  const patientName = `${summary?.patient?.firstName || ""} ${summary?.patient?.lastName || ""}`.trim() || "—";
  const attendingName = summary?.attendingClinician
    ? `${summary.attendingClinician.firstName} ${summary.attendingClinician.lastName}`
    : "—";
  const finalizerName = summary?.finalizedBy
    ? `${summary.finalizedBy.firstName} ${summary.finalizedBy.lastName}`
    : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[92vh] flex flex-col p-0 gap-0 overflow-hidden" size="2xl">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5" /> {summary?.summaryNumber || "Loading..."}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {patientName} · {summary?.encounter?.encounterNumber || "—"} · Status: {summary?.status || "—"}
            {summary?.version && summary.version > 1 && ` · v${summary.version}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4 bg-slate-50">
          {isLoading ? (
            <LoadingState rows={6} />
          ) : isError ? (
            <ErrorState message="Failed to load discharge summary" />
          ) : !summary ? (
            <EmptyState title="Summary not found" icon={FileText} />
          ) : (
            <>
              {/* Locked banner */}
              {isLocked && (
                <div className={`rounded-lg border p-3 text-sm ${isAmended ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                  <div className="flex items-start gap-2">
                    {isAmended ? <AlertTriangle className="w-4 h-4 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 mt-0.5" />}
                    <div>
                      <p className="font-semibold">
                        {isAmended ? "This summary has been amended." : "This summary is finalized."}
                      </p>
                      <p className="text-xs mt-0.5">
                        {isAmended
                          ? `Amended on ${formatDate(summary.amendedAt, true)} — Reason: ${summary.amendmentReason || "—"}`
                          : `Finalized on ${formatDate(summary.finalizedAt, true)} by ${finalizerName || "—"}.`}
                        <br />
                        Content is locked. Use Amend to create a new version with corrections.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Patient + Encounter info */}
              <Card>
                <CardContent className="p-4 w-full">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">Patient & Encounter</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <div><span className="text-slate-500 font-medium">Patient:</span> <span className="text-slate-900">{patientName}</span></div>
                    <div><span className="text-slate-500 font-medium">MRN:</span> <span className="text-slate-900 font-mono">{summary.patient?.patientNumber || "—"}</span></div>
                    <div><span className="text-slate-500 font-medium">Sex:</span> <span className="text-slate-900 capitalize">{summary.patient?.sex || "—"}</span></div>
                    <div><span className="text-slate-500 font-medium">Encounter #:</span> <span className="text-slate-900 font-mono">{summary.encounter?.encounterNumber || "—"}</span></div>
                    <div><span className="text-slate-500 font-medium">Encounter Type:</span> <span className="text-slate-900 capitalize">{summary.encounter?.encounterType?.replace(/_/g, " ") || "—"}</span></div>
                    <div><span className="text-slate-500 font-medium">Attending:</span> <span className="text-slate-900">{attendingName}</span></div>
                    {summary.admission && (
                      <>
                        <div><span className="text-slate-500 font-medium">Admission #:</span> <span className="text-slate-900 font-mono">{summary.admission.admissionNumber}</span></div>
                        <div><span className="text-slate-500 font-medium">Admitted:</span> <span className="text-slate-900">{formatDate(summary.admission.admittedAt, true)}</span></div>
                        <div><span className="text-slate-500 font-medium">Discharged:</span> <span className="text-slate-900">{summary.admission.dischargedAt ? formatDate(summary.admission.dischargedAt, true) : "—"}</span></div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Primary Diagnosis */}
              <Card>
                <CardContent className="p-4 w-full">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Primary Diagnosis</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-900 font-medium">{summary.primaryDiagnosisName || content?.primaryDiagnosisName || "—"}</span>
                    {summary.primaryDiagnosisCode && (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono">
                        ICD-10: {summary.primaryDiagnosisCode}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Diagnoses section */}
              {content?.diagnoses?.length > 0 && (
                <Card>
                  <CardContent className="p-4 w-full">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                      <Stethoscope className="w-4 h-4" /> All Diagnoses ({content.diagnoses.length})
                    </h3>
                    <ul className="space-y-1 text-xs">
                      {content.diagnoses.map((d: any, i: number) => (
                        <li key={d.id || i} className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${d.isPrimary ? "bg-emerald-100 text-emerald-700 font-semibold" : "bg-slate-100 text-slate-600"}`}>
                            {d.diagnosisType?.replace(/_/g, " ") || "diagnosis"}
                          </span>
                          <span className="text-slate-900">{d.diagnosisName}</span>
                          {d.diagnosisCode && <span className="text-slate-500 font-mono text-[10px]">({d.diagnosisCode})</span>}
                          {d.clinicalStatus && <span className="text-slate-400">· {d.clinicalStatus.replace(/_/g, " ")}</span>}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Investigations */}
              {content?.investigations?.length > 0 && (
                <Card>
                  <CardContent className="p-4 w-full">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                      <FlaskConical className="w-4 h-4" /> Investigations ({content.investigations.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="text-left p-2">Test</th>
                            <th className="text-left p-2">Result</th>
                            <th className="text-left p-2">Flag</th>
                            <th className="text-left p-2">Reference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {content.investigations.map((inv: any, i: number) => (
                            <tr key={inv.id || i} className={inv.isCritical ? "bg-rose-50" : inv.abnormalFlag && inv.abnormalFlag !== "normal" ? "bg-amber-50" : ""}>
                              <td className="p-2">{inv.componentName ? `${inv.testName} — ${inv.componentName}` : inv.testName}</td>
                              <td className="p-2 font-medium">{inv.resultValue}{inv.unit ? ` ${inv.unit}` : ""}</td>
                              <td className="p-2">
                                {inv.abnormalFlag && inv.abnormalFlag !== "normal" ? (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${inv.isCritical ? "bg-rose-600 text-white" : "bg-amber-200 text-amber-800"}`}>
                                    {inv.abnormalFlag.replace(/_/g, " ").toUpperCase()}
                                  </span>
                                ) : <span className="text-slate-400">—</span>}
                              </td>
                              <td className="p-2 text-slate-500">{inv.referenceRange || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Discharge Medications */}
              {content?.dischargeMedications?.length > 0 && (
                <Card>
                  <CardContent className="p-4 w-full">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                      <Pill className="w-4 h-4" /> Discharge Medications ({content.dischargeMedications.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="text-left p-2">Medication</th>
                            <th className="text-left p-2">Dose</th>
                            <th className="text-left p-2">Frequency</th>
                            <th className="text-left p-2">Route</th>
                            <th className="text-left p-2">Duration</th>
                            <th className="text-left p-2">Instructions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {content.dischargeMedications.map((m: any, i: number) => (
                            <tr key={m.itemId || i}>
                              <td className="p-2 font-medium">{m.medicationName}</td>
                              <td className="p-2">{m.dose || "—"}</td>
                              <td className="p-2">{m.frequency || "—"}{m.isPRN ? " (PRN)" : m.isSTAT ? " (STAT)" : ""}</td>
                              <td className="p-2">{m.route || "—"}</td>
                              <td className="p-2">{m.duration || "—"}</td>
                              <td className="p-2 text-slate-500">{m.instructions || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Vitals snapshot */}
              {content?.vitalsSnapshot?.triage && (
                <Card>
                  <CardContent className="p-4 w-full">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4" /> Vitals Snapshot
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      {[
                        { l: "Temperature", v: content.vitalsSnapshot.triage.temperature, u: "°C" },
                        { l: "Pulse", v: content.vitalsSnapshot.triage.pulse, u: "bpm" },
                        { l: "Respiratory Rate", v: content.vitalsSnapshot.triage.respiratoryRate, u: "/min" },
                        { l: "Blood Pressure", v: content.vitalsSnapshot.triage.systolicBp && content.vitalsSnapshot.triage.diastolicBp ? `${content.vitalsSnapshot.triage.systolicBp}/${content.vitalsSnapshot.triage.diastolicBp}` : null, u: "mmHg" },
                        { l: "O2 Saturation", v: content.vitalsSnapshot.triage.oxygenSaturation, u: "%" },
                        { l: "Weight", v: content.vitalsSnapshot.triage.weight, u: "kg" },
                        { l: "Height", v: content.vitalsSnapshot.triage.height, u: "cm" },
                        { l: "BMI", v: content.vitalsSnapshot.triage.bmi, u: "kg/m²" },
                      ].filter((x) => x.v != null).map((x) => (
                        <div key={x.l} className="p-2 rounded border border-slate-200 bg-white">
                          <div className="text-slate-500 text-[10px]">{x.l}</div>
                          <div className="text-slate-900 font-medium">{x.v} {x.u}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">Recorded {formatDate(content.vitalsSnapshot.triage.recordedAt, true)}</p>
                  </CardContent>
                </Card>
              )}

              {/* Clinical narrative — latest consultation */}
              {content?.consultations?.length > 0 && (
                <Card>
                  <CardContent className="p-4 w-full space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Clinical Summary (latest consultation)</h3>
                    {(() => {
                      const c = content.consultations[content.consultations.length - 1];
                      return (
                        <div className="space-y-2 text-xs">
                          {c.chiefComplaint && <div><span className="font-semibold text-slate-700">Chief Complaint:</span> <span className="text-slate-900">{c.chiefComplaint}</span></div>}
                          {c.historyPresentingIllness && (
                            <div><span className="font-semibold text-slate-700">History:</span> <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{c.historyPresentingIllness}</p></div>
                          )}
                          {c.physicalExamination && (
                            <div><span className="font-semibold text-slate-700">Examination:</span> <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{c.physicalExamination}</p></div>
                          )}
                          {c.assessment && (
                            <div><span className="font-semibold text-slate-700">Assessment:</span> <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{c.assessment}</p></div>
                          )}
                          {c.treatmentPlan && (
                            <div><span className="font-semibold text-slate-700">Treatment Plan:</span> <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{c.treatmentPlan}</p></div>
                          )}
                          {c.followUpPlan && (
                            <div><span className="font-semibold text-slate-700">Follow-up Plan:</span> <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{c.followUpPlan}</p></div>
                          )}
                          {c.patientInstructions && (
                            <div><span className="font-semibold text-slate-700">Patient Instructions:</span> <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{c.patientInstructions}</p></div>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* Discharge Record (if linked) */}
              {summary.dischargeRecord && (
                <Card>
                  <CardContent className="p-4 w-full">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Linked Discharge Record</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      <div><span className="text-slate-500 font-medium">Discharge #:</span> <span className="text-slate-900 font-mono">{summary.dischargeRecord.dischargeNumber || "—"}</span></div>
                      <div><span className="text-slate-500 font-medium">Type:</span> <span className="text-slate-900 capitalize">{summary.dischargeRecord.dischargeType?.replace(/_/g, " ") || "—"}</span></div>
                      <div><span className="text-slate-500 font-medium">Disposition:</span> <span className="text-slate-900">{summary.dischargeRecord.disposition || "—"}</span></div>
                      <div><span className="text-slate-500 font-medium">Discharged At:</span> <span className="text-slate-900">{summary.dischargeRecord.dischargedAt ? formatDate(summary.dischargeRecord.dischargedAt, true) : "—"}</span></div>
                      {summary.dischargeRecord.followUpClinic && <div><span className="text-slate-500 font-medium">Follow-up Clinic:</span> <span className="text-slate-900">{summary.dischargeRecord.followUpClinic}</span></div>}
                      {summary.dischargeRecord.followUpAppointmentDate && <div><span className="text-slate-500 font-medium">Follow-up Date:</span> <span className="text-slate-900">{formatDate(summary.dischargeRecord.followUpAppointmentDate, true)}</span></div>}
                    </div>
                    {summary.dischargeRecord.adviceOnDischarge && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-semibold text-slate-700 mb-1">Advice on Discharge:</p>
                        <p className="text-xs text-slate-700 whitespace-pre-wrap">{summary.dischargeRecord.adviceOnDischarge}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <DialogFooter className="p-4 pt-3 shrink-0 border-t bg-white">
          <div className="flex flex-wrap gap-2 w-full justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {canPrint && summary && (
              <PrintButton
                label="Print Summary"
                className="border-slate-200"
                documentType="discharge"
                recordId={summary.summaryNumber}
                recordSummary={`${patientName} — ${summary.primaryDiagnosisName || "Discharge summary"}`}
                renderContent={() => <DischargeSummaryTemplate summary={summary} />}
              />
            )}
            {canCreate && summary?.status === "draft" && (
              <Button
                variant="outline"
                disabled={lifecycleMut.isPending}
                onClick={() => lifecycleMut.mutate({ id: summary.id, action: "review" })}
                className="border-blue-200 hover:bg-blue-50 text-blue-700"
              >
                <Eye className="w-4 h-4" /> Submit for Review
              </Button>
            )}
            {canFinalize && summary?.status === "reviewed" && (
              <Button
                variant="outline"
                disabled={lifecycleMut.isPending}
                onClick={() => lifecycleMut.mutate({ id: summary.id, action: "approve" })}
                className="border-emerald-200 hover:bg-emerald-50 text-emerald-700"
              >
                <FileCheck2 className="w-4 h-4" /> Approve
              </Button>
            )}
            {canFinalize && summary && (summary.status === "reviewed" || summary.status === "approved" || summary.status === "draft") && (
              <Button
                disabled={lifecycleMut.isPending}
                onClick={() => lifecycleMut.mutate({ id: summary.id, action: "finalize" })}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <CheckCircle2 className="w-4 h-4" /> Finalize
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

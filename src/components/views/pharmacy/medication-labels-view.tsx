"use client";

// =====================================================================
// MedicationLabelsView — Pharmacy Label Management Center
// =====================================================================
// Lists all medication labels minted at this facility, with filters,
// KPIs, and per-row actions (Reprint, Void, View detail). Used by
// pharmacists and admins to audit label printing history and to manage
// the lifecycle (void a mis-printed label, reprint a damaged one).
//
// Features:
//   - KPI cards: Total / Active / Printed Today / Voided / High-Alert
//   - Status filter bar: All / Active / Voided
//   - Search by patient name, MRN, medication name, or token
//   - Per-row: Patient + medication + lot/expiry summary, status badge,
//     print count, last printed date/by, Reprint button, Void button,
//     View button, Patient 360 jump
//   - Animated slide-in for new labels via framer-motion
//   - Special HIGH ALERT row highlighting (rose border) when
//     isHighAlert is true
// =====================================================================

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Pill, RefreshCcw, XCircle, Eye, Clock, Printer,
  CheckCircle2, AlertTriangle, ShieldAlert, FileX, Tag, Activity,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, PageHeader, MiniStatCard,
  formatDate, formatRelative, safeJson,
} from "@/components/ui-helpers";
import { MedicationLabelTemplate } from "@/components/print/templates/medication-label-template";
import { PrintButton } from "@/components/print/print-layout";
import type { MedicationLabelContent } from "@/lib/medication-label/assembler";

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  active:  { label: "Active",  className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  voided:  { label: "Voided",  className: "bg-rose-100 text-rose-700 border-rose-200", icon: XCircle },
};

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function MedicationLabelsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canPrint = user?.roles?.includes("super_admin") || perms.includes("medication_label.print");
  const canReprint = user?.roles?.includes("super_admin") || perms.includes("medication_label.reprint");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const setView = useAppStore((s) => s.setView);
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [voidDialog, setVoidDialog] = useState<any | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [viewDialog, setViewDialog] = useState<any | null>(null);
  const [viewDialogContent, setViewDialogContent] = useState<MedicationLabelContent | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (filter !== "all") params.set("status", filter);
  params.set("limit", "200");
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["medication-labels-list", activeFacilityId, filter],
    queryFn: () => fetchJson(`/api/medication-labels${qs}`),
    enabled: !!activeFacilityId,
    refetchInterval: 30000,
  });

  const labels: any[] = data?.items || [];

  // KPIs
  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: labels.length,
      active: labels.filter((l) => l.status === "active").length,
      voided: labels.filter((l) => l.status === "voided").length,
      printedToday: labels.filter(
        (l) => l.lastPrintedAt && l.lastPrintedAt.toString().slice(0, 10) === today,
      ).length,
      highAlert: labels.filter((l) => l.isHighAlert).length,
    };
  }, [labels]);

  // Lifecycle mutations
  const reprintMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/medication-labels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reprint" }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to reprint");
      return data;
    },
    onSuccess: () => {
      toast.success("Reprint recorded");
      qc.invalidateQueries({ queryKey: ["medication-labels-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const voidMut = useMutation({
    mutationFn: async () => {
      if (!voidDialog) return;
      const res = await fetch(`/api/medication-labels/${voidDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void", reason: voidReason }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to void");
      return data;
    },
    onSuccess: () => {
      toast.success("Label voided");
      setVoidDialog(null);
      setVoidReason("");
      qc.invalidateQueries({ queryKey: ["medication-labels-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleVoid = () => {
    if (!voidDialog || !voidReason.trim()) {
      toast.error("Void reason is required");
      return;
    }
    voidMut.mutate();
  };

  // Fetch the full label content for the view dialog
  const openViewDialog = async (label: any) => {
    setViewDialog(label);
    setViewDialogContent(null);
    try {
      const res = await fetch(`/api/medication-labels/${label.id}`);
      if (!res.ok) throw new Error("Failed to load label");
      const data = await safeJson(res);
      // Parse the content snapshot
      const content = data.content
        ? typeof data.content === "string"
          ? JSON.parse(data.content)
          : data.content
        : null;
      setViewDialogContent(content);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const goToPatient360 = (patientId: string) => {
    selectPatient(patientId);
    setView("patient_360");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Medication Labels"
        description="Mint, reprint, and void pharmacy medication labels with QR codes. Each label encodes the 5 Rights of medication administration — scan the QR with any smartphone or handheld scanner at the bedside to verify right patient, drug, dose, route, and time."
        icon={Pill}
        gradient="from-amber-500 via-orange-500 to-rose-500"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="bg-white/90 border-0 text-slate-700 hover:bg-white">
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStatCard label="Total" value={kpis.total} icon={Tag} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Active" value={kpis.active} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Voided" value={kpis.voided} icon={XCircle} gradient="from-rose-500 to-red-600" />
        <MiniStatCard label="Printed Today" value={kpis.printedToday} icon={Printer} gradient="from-cyan-500 to-blue-600" />
        <MiniStatCard label="High Alert" value={kpis.highAlert} icon={ShieldAlert} gradient="from-rose-600 to-red-700" />
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-3 w-full flex flex-wrap gap-2 items-center">
          <div className="flex gap-1 border rounded-md p-0.5">
            {["all", "active", "voided"].map((s) => (
              <Button key={s} variant={filter === s ? "default" : "ghost"} size="sm" className="h-7 capitalize" onClick={() => setFilter(s)}>
                {s === "all" ? "All" : STATUS_CONFIG[s]?.label || s}
              </Button>
            ))}
          </div>
          <Input placeholder="Search by patient, MRN, medication, or token..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm h-8 text-xs" />
        </CardContent>
      </Card>

      {/* Label List */}
      <Card className="w-full">
        <CardContent className="p-0 w-full">
          {isLoading ? (
            <LoadingState rows={5} />
          ) : isError ? (
            <ErrorState message="Failed to load medication labels" onRetry={() => refetch()} />
          ) : labels.length === 0 ? (
            <EmptyState
              title={filter === "all" ? "No medication labels minted yet" : `No ${filter} labels`}
              description={filter === "all" ? "Open the Dispensing view and dispense a prescription to print the first label." : "Try a different filter."}
              icon={Pill}
            />
          ) : (
            <div className="divide-y w-full">
              <AnimatePresence>
                {labels
                  .filter((l) => {
                    if (!search.trim()) return true;
                    const q = search.toLowerCase();
                    const patientName = `${l.patient?.firstName || ""} ${l.patient?.lastName || ""}`.toLowerCase();
                    const medName = `${l.prescriptionItem?.medication?.genericName || ""} ${l.prescriptionItem?.medication?.brandName || ""}`.toLowerCase();
                    return (
                      patientName.includes(q) ||
                      l.patient?.patientNumber?.toLowerCase().includes(q) ||
                      medName.includes(q) ||
                      l.token?.toLowerCase().includes(q) ||
                      l.genericName?.toLowerCase().includes(q)
                    );
                  })
                  .map((l, idx) => {
                    const status = STATUS_CONFIG[l.status] || STATUS_CONFIG.active;
                    const SIcon = status.icon;
                    const patientName = `${l.patient?.firstName || ""} ${l.patient?.lastName || ""}`.trim() || "—";
                    const medName = l.prescriptionItem?.medication
                      ? `${l.prescriptionItem.medication.genericName}${l.prescriptionItem.medication.brandName ? ` (${l.prescriptionItem.medication.brandName})` : ""}${l.prescriptionItem.medication.strength ? ` ${l.prescriptionItem.medication.strength}` : ""}`
                      : l.genericName || "—";
                    const tokenShort = l.token?.slice(-8).toUpperCase();
                    const lastPrintedByName = l.lastPrintedBy
                      ? `${l.lastPrintedBy.firstName} ${l.lastPrintedBy.lastName}`
                      : null;
                    const isHighAlert = !!l.isHighAlert;
                    const isControlled = l.controlledStatus && l.controlledStatus !== "none";
                    const batchInfo = l.inventoryBatch
                      ? `Lot ${l.inventoryBatch.batchNumber}${l.inventoryBatch.expiryDate ? ` · exp ${formatDate(l.inventoryBatch.expiryDate)}` : ""}`
                      : null;

                    return (
                      <motion.div
                        key={l.id}
                        initial={idx < 5 ? { opacity: 0, y: 10 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.4) }}
                        className={`p-3 sm:p-4 hover:bg-slate-50 transition-colors ${isHighAlert ? "border-l-4 border-l-rose-500" : isControlled ? "border-l-4 border-l-amber-500" : ""}`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Status / alert icon */}
                          <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm ${
                            l.status === "voided" ? "bg-gradient-to-br from-rose-500 to-red-600" :
                            isHighAlert ? "bg-gradient-to-br from-rose-600 to-red-700" :
                            isControlled ? "bg-gradient-to-br from-amber-500 to-orange-600" :
                            "bg-gradient-to-br from-emerald-500 to-emerald-600"
                          }`}>
                            {isHighAlert && l.status === "active" ? <ShieldAlert className="w-5 h-5" /> :
                             isControlled && l.status === "active" ? <AlertTriangle className="w-5 h-5" /> :
                             <SIcon className="w-5 h-5" />}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${status.className}`}>
                                {status.label.toUpperCase()}
                              </span>
                              {isHighAlert && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-600 text-white">
                                  ⚠ HIGH ALERT
                                </span>
                              )}
                              {isControlled && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500 text-white uppercase">
                                  {l.controlledStatus}
                                </span>
                              )}
                              <span className="text-sm font-semibold text-slate-900 truncate">{medName}</span>
                              <span className="text-[10px] text-slate-400">·</span>
                              <span className="text-sm text-slate-700">{patientName}</span>
                              {l.patient?.patientNumber && (
                                <span className="text-[10px] text-slate-500 font-mono">({l.patient.patientNumber})</span>
                              )}
                              <span className="text-[10px] text-slate-400">·</span>
                              <span className="text-[10px] text-slate-500 font-mono">MLN-{tokenShort}</span>
                              <span className="text-[10px] text-slate-400">· {formatRelative(l.createdAt)}</span>
                              {l.printCount > 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                                  ×{l.printCount} prints
                                </span>
                              )}
                            </div>

                            {/* Meta info row */}
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-2 flex-wrap">
                              {batchInfo && (
                                <span className="font-mono">{batchInfo}</span>
                              )}
                              {l.prescriptionItem?.dose && (
                                <span>· {l.prescriptionItem.dose} {l.prescriptionItem.frequency || ""}</span>
                              )}
                              {l.prescriptionItem?.dispensedQuantity != null && l.prescriptionItem.dispensedQuantity > 0 && (
                                <span>· Dispensed: {l.prescriptionItem.dispensedQuantity}</span>
                              )}
                              {lastPrintedByName && (
                                <>
                                  <span>·</span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Last printed by {lastPrintedByName}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-1.5">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                                onClick={() => openViewDialog(l)}>
                                <Eye className="w-3 h-3" /> View
                              </Button>
                              {canPrint && l.status === "active" && viewDialogContent && l.id === viewDialog?.id && (
                                <PrintButton
                                  label="Reprint"
                                  className="h-7 px-2 text-xs gap-1 border-amber-200 text-amber-700"
                                  documentType="medication_label"
                                  paperSize="THERMAL_58"
                                  recordId={l.id}
                                  recordSummary={`Med label: ${medName} for ${patientName}`}
                                  renderContent={() => <MedicationLabelTemplate content={viewDialogContent} paperSize="THERMAL_58" showIssuedAt />}
                                />
                              )}
                              {canReprint && l.status === "active" && (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-rose-200 hover:bg-rose-50 text-rose-700"
                                  disabled={voidMut.isPending}
                                  onClick={() => setVoidDialog(l)}>
                                  <XCircle className="w-3 h-3" /> Void
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                                onClick={() => goToPatient360(l.patientId)}>
                                <Activity className="w-3 h-3" /> Patient 360
                              </Button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Void Dialog */}
      {voidDialog && (
        <Dialog open onOpenChange={(o) => !o && setVoidDialog(null)}>
          <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="compact">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-rose-600 to-red-700 text-white">
              <DialogTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Void Medication Label
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Voiding marks this label as invalid. Anyone scanning its QR code will see a "label no longer valid" warning — they should NOT administer this medication based on this label.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-3">
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
                <p className="font-semibold text-rose-900">{voidDialog.genericName || voidDialog.prescriptionItem?.medication?.genericName}</p>
                <p className="text-rose-700 text-xs mt-1">
                  For {voidDialog.patient?.firstName} {voidDialog.patient?.lastName} · MRN {voidDialog.patient?.patientNumber}
                </p>
                <p className="text-rose-700 text-xs mt-1 font-mono">
                  MLN-{voidDialog.token?.slice(-8).toUpperCase()}
                </p>
                {voidDialog.isHighAlert && (
                  <p className="text-rose-700 text-xs mt-2 font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" /> HIGH ALERT MEDICATION — handle with extra caution when voiding.
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm font-semibold">Reason for voiding (required)</Label>
                <Textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={4}
                  placeholder="e.g., label was damaged, wrong lot number printed, label attached to wrong medication, patient returned medication..."
                />
              </div>
            </div>
            <DialogFooter className="p-6 pt-4 shrink-0 border-t">
              <Button variant="outline" onClick={() => setVoidDialog(null)}>Cancel</Button>
              <Button onClick={handleVoid} disabled={!voidReason.trim() || voidMut.isPending} className="bg-rose-600 hover:bg-rose-700 gap-2">
                <FileX className="w-4 h-4" /> Confirm Void
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* View Dialog — shows the label content */}
      {viewDialog && (
        <Dialog open onOpenChange={(o) => !o && setViewDialog(null)}>
          <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="medium">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white">
              <DialogTitle className="text-white flex items-center gap-2">
                <Pill className="w-5 h-5" /> Medication Label Detail
              </DialogTitle>
              <DialogDescription className="text-white/80">
                MLN-{viewDialog.token?.slice(-8).toUpperCase()} · {viewDialog.genericName || viewDialog.prescriptionItem?.medication?.genericName}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4 bg-slate-50">
              {/* Detail meta */}
              <Card>
                <CardContent className="p-4 w-full">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Label Info</h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className="text-slate-500 font-medium">Status:</span> <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${STATUS_CONFIG[viewDialog.status]?.className}`}>{viewDialog.status?.toUpperCase()}</span></div>
                    <div><span className="text-slate-500 font-medium">Print count:</span> <span className="text-slate-900 font-semibold">{viewDialog.printCount}</span></div>
                    <div><span className="text-slate-500 font-medium">Created:</span> <span className="text-slate-900">{formatDate(viewDialog.createdAt, true)}</span></div>
                    <div><span className="text-slate-500 font-medium">Last printed:</span> <span className="text-slate-900">{viewDialog.lastPrintedAt ? formatDate(viewDialog.lastPrintedAt, true) : "—"}</span></div>
                    <div><span className="text-slate-500 font-medium">First printed by:</span> <span className="text-slate-900">{viewDialog.firstPrintedBy ? `${viewDialog.firstPrintedBy.firstName} ${viewDialog.firstPrintedBy.lastName}` : "—"}</span></div>
                    <div><span className="text-slate-500 font-medium">Last printed by:</span> <span className="text-slate-900">{viewDialog.lastPrintedBy ? `${viewDialog.lastPrintedBy.firstName} ${viewDialog.lastPrintedBy.lastName}` : "—"}</span></div>
                    {viewDialog.voidReason && (
                      <div className="col-span-2"><span className="text-slate-500 font-medium">Void reason:</span> <span className="text-slate-900 italic">"{viewDialog.voidReason}"</span></div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Token + verify URL */}
              <Card>
                <CardContent className="p-4 w-full">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Verification Token</h3>
                  <div className="font-mono text-xs break-all bg-slate-100 p-2 rounded border">
                    {viewDialog.token}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5">
                    Scanning the QR code with any smartphone opens the verify endpoint, which returns the patient identity, medication, dose, lot, and expiry — for bedside verification of the 5 Rights.
                  </p>
                </CardContent>
              </Card>

              {/* Live label preview (if content was loaded) */}
              {viewDialogContent && (
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Label Preview</h3>
                  <div className="bg-white rounded-lg shadow p-2 max-w-xs mx-auto">
                    <MedicationLabelTemplate content={viewDialogContent} paperSize="THERMAL_58" showIssuedAt={false} />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="p-4 pt-3 shrink-0 border-t bg-white">
              <Button variant="outline" onClick={() => setViewDialog(null)}>Close</Button>
              {canPrint && viewDialog.status === "active" && viewDialogContent && (
                <PrintButton
                  label="Reprint"
                  className="border-amber-200 text-amber-700"
                  documentType="medication_label"
                  paperSize="THERMAL_58"
                  recordId={viewDialog.id}
                  recordSummary={`Reprint: ${viewDialog.genericName || "Medication"}`}
                  renderContent={() => <MedicationLabelTemplate content={viewDialogContent} paperSize="THERMAL_58" showIssuedAt />}
                />
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

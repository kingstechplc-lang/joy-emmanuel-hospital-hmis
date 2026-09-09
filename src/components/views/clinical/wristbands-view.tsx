"use client";

// =====================================================================
// WristbandsView — Wristband Management Center
// =====================================================================
// Lists all wristbands minted at this facility, with filters, KPIs,
// and per-row actions (Reprint, Void, View detail). Used by admins and
// records officers to audit wristband printing history and to manage
// the lifecycle (void a lost wristband, reprint a smudged one).
//
// Features:
//   - KPI cards: Total / Active / Printed Today / Voided
//   - Status filter bar: All / Active / Replaced / Voided
//   - Search by patient name, MRN, or token shorthand
//   - Per-row: Patient identity (name + MRN + DOB), encounter #, status
//     badge, print count, last printed date/by, Reprint button, Void
//     button, View button
//   - Animated slide-in for new wristbands via framer-motion
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
  QrCode, RefreshCcw, XCircle, Eye, Clock, Printer,
  CheckCircle2, AlertTriangle, Activity, ScanLine, FileX,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, PageHeader, MiniStatCard,
  formatDate, formatRelative, safeJson,
} from "@/components/ui-helpers";
import { WristbandTemplate } from "@/components/print/templates/wristband-template";
import { PrintButton } from "@/components/print/print-layout";
import type { WristbandContent } from "@/lib/wristband/assembler";

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  active:    { label: "Active",    className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  replaced:  { label: "Replaced",  className: "bg-amber-100 text-amber-700 border-amber-200", icon: RefreshCcw },
  voided:    { label: "Voided",    className: "bg-rose-100 text-rose-700 border-rose-200", icon: XCircle },
};

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function WristbandsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canPrint = user?.roles?.includes("super_admin") || perms.includes("wristband.print");
  const canReprint = user?.roles?.includes("super_admin") || perms.includes("wristband.reprint");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const setView = useAppStore((s) => s.setView);
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [voidDialog, setVoidDialog] = useState<any | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [viewDialog, setViewDialog] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (filter !== "all") params.set("status", filter);
  params.set("limit", "200");
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["wristbands", activeFacilityId, filter],
    queryFn: () => fetchJson(`/api/patient-wristbands${qs}`),
    enabled: !!activeFacilityId,
    refetchInterval: 30000,
  });

  const wristbands: any[] = data?.items || [];

  // KPIs
  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: wristbands.length,
      active: wristbands.filter((w) => w.status === "active").length,
      replaced: wristbands.filter((w) => w.status === "replaced").length,
      voided: wristbands.filter((w) => w.status === "voided").length,
      printedToday: wristbands.filter(
        (w) => w.lastPrintedAt && w.lastPrintedAt.toString().slice(0, 10) === today,
      ).length,
    };
  }, [wristbands]);

  // Lifecycle mutations
  const reprintMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/patient-wristbands/${id}`, {
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
      qc.invalidateQueries({ queryKey: ["wristbands"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const voidMut = useMutation({
    mutationFn: async () => {
      if (!voidDialog) return;
      const res = await fetch(`/api/patient-wristbands/${voidDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void", reason: voidReason }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to void");
      return data;
    },
    onSuccess: () => {
      toast.success("Wristband voided");
      setVoidDialog(null);
      setVoidReason("");
      qc.invalidateQueries({ queryKey: ["wristbands"] });
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

  const goToPatient360 = (patientId: string) => {
    selectPatient(patientId);
    setView("patient_360");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Patient Wristbands"
        description="Mint, reprint, and void patient identification wristbands with QR codes. Scan a wristband's QR code with any smartphone or handheld scanner to verify patient identity at the point of care."
        icon={QrCode}
        gradient="from-violet-600 via-purple-600 to-fuchsia-600"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="bg-white/90 border-0 text-slate-700 hover:bg-white">
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStatCard label="Total" value={kpis.total} icon={QrCode} gradient="from-violet-500 to-purple-600" />
        <MiniStatCard label="Active" value={kpis.active} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Replaced" value={kpis.replaced} icon={RefreshCcw} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Voided" value={kpis.voided} icon={XCircle} gradient="from-rose-500 to-red-600" />
        <MiniStatCard label="Printed Today" value={kpis.printedToday} icon={Printer} gradient="from-cyan-500 to-blue-600" />
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-3 w-full flex flex-wrap gap-2 items-center">
          <div className="flex gap-1 border rounded-md p-0.5">
            {["all", "active", "replaced", "voided"].map((s) => (
              <Button key={s} variant={filter === s ? "default" : "ghost"} size="sm" className="h-7 capitalize" onClick={() => setFilter(s)}>
                {s === "all" ? "All" : STATUS_CONFIG[s]?.label || s}
              </Button>
            ))}
          </div>
          <Input placeholder="Search by patient name, MRN, or token..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm h-8 text-xs" />
        </CardContent>
      </Card>

      {/* Wristband List */}
      <Card className="w-full">
        <CardContent className="p-0 w-full">
          {isLoading ? (
            <LoadingState rows={5} />
          ) : isError ? (
            <ErrorState message="Failed to load wristbands" onRetry={() => refetch()} />
          ) : wristbands.length === 0 ? (
            <EmptyState
              title={filter === "all" ? "No wristbands minted yet" : `No ${filter} wristbands`}
              description={filter === "all" ? "Open a patient record or encounter to print the first wristband." : "Try a different filter."}
              icon={QrCode}
            />
          ) : (
            <div className="divide-y w-full">
              <AnimatePresence>
                {wristbands
                  .filter((w) => {
                    if (!search.trim()) return true;
                    const q = search.toLowerCase();
                    const patientName = `${w.patient?.firstName || ""} ${w.patient?.lastName || ""}`.toLowerCase();
                    return (
                      patientName.includes(q) ||
                      w.patient?.patientNumber?.toLowerCase().includes(q) ||
                      w.token?.toLowerCase().includes(q) ||
                      w.encounter?.encounterNumber?.toLowerCase().includes(q)
                    );
                  })
                  .map((w, idx) => {
                    const status = STATUS_CONFIG[w.status] || STATUS_CONFIG.active;
                    const SIcon = status.icon;
                    const patientName = `${w.patient?.firstName || ""} ${w.patient?.lastName || ""}`.trim() || "—";
                    const tokenShort = w.token?.slice(-8).toUpperCase();
                    const lastPrintedByName = w.lastPrintedBy
                      ? `${w.lastPrintedBy.firstName} ${w.lastPrintedBy.lastName}`
                      : null;

                    return (
                      <motion.div
                        key={w.id}
                        initial={idx < 5 ? { opacity: 0, y: 10 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.4) }}
                        className="p-3 sm:p-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {/* Status icon */}
                          <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm ${
                            w.status === "active" ? "bg-gradient-to-br from-emerald-500 to-emerald-600" :
                            w.status === "replaced" ? "bg-gradient-to-br from-amber-500 to-orange-600" :
                            "bg-gradient-to-br from-rose-500 to-red-600"
                          }`}>
                            <SIcon className="w-5 h-5" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${status.className}`}>
                                {status.label.toUpperCase()}
                              </span>
                              <span className="text-sm font-semibold text-slate-900">{patientName}</span>
                              {w.patient?.patientNumber && (
                                <span className="text-[10px] text-slate-500 font-mono">({w.patient.patientNumber})</span>
                              )}
                              <span className="text-[10px] text-slate-400">·</span>
                              <span className="text-[10px] text-slate-500 font-mono">WBN-{tokenShort}</span>
                              <span className="text-[10px] text-slate-400">·</span>
                              <span className="text-[10px] text-slate-400">{formatRelative(w.createdAt)}</span>
                              {w.printCount > 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                                  ×{w.printCount} prints
                                </span>
                              )}
                              {w.patient?.bloodGroup && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">
                                  {w.patient.bloodGroup}
                                </span>
                              )}
                            </div>

                            {/* Meta info row */}
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-2">
                              {w.patient?.dateOfBirth && (
                                <span>DOB: {formatDate(w.patient.dateOfBirth)}</span>
                              )}
                              {w.patient?.sex && (
                                <span className="capitalize">· {w.patient.sex}</span>
                              )}
                              {w.encounter && (
                                <>
                                  <span>·</span>
                                  <span className="font-mono">{w.encounter.encounterNumber}</span>
                                  <span className="capitalize">· {w.encounter.encounterType.replace(/_/g, " ")}</span>
                                </>
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
                                onClick={() => setViewDialog(w)}>
                                <Eye className="w-3 h-3" /> View
                              </Button>
                              {canPrint && w.status === "active" && (
                                <PrintButton
                                  label="Reprint"
                                  className="h-7 px-2 text-xs gap-1 border-violet-200 text-violet-700"
                                  documentType="wristband"
                                  paperSize="THERMAL_58"
                                  recordId={w.id}
                                  recordSummary={`Reprint wristband for ${patientName}`}
                                  renderContent={() => <WristbandReprintContent wristband={w} />}
                                />
                              )}
                              {canReprint && w.status === "active" && (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-rose-200 hover:bg-rose-50 text-rose-700"
                                  disabled={voidMut.isPending}
                                  onClick={() => setVoidDialog(w)}>
                                  <XCircle className="w-3 h-3" /> Void
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                                onClick={() => goToPatient360(w.patientId)}>
                                <ScanLine className="w-3 h-3" /> Patient 360
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
                <AlertTriangle className="w-5 h-5" /> Void Wristband
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Voiding marks this wristband as invalid. Anyone scanning its QR code will see a "wristband no longer valid" message.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-3">
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
                <p className="font-semibold text-rose-900">
                  {voidDialog.patient?.firstName} {voidDialog.patient?.lastName}
                </p>
                <p className="text-rose-700 text-xs mt-1 font-mono">
                  MRN: {voidDialog.patient?.patientNumber} · WBN-{voidDialog.token?.slice(-8).toUpperCase()}
                </p>
              </div>
              <div>
                <Label className="text-sm font-semibold">Reason for voiding (required)</Label>
                <Textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={4}
                  placeholder="e.g., wristband was lost, damaged, or attached to the wrong patient..."
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

      {/* View Dialog — shows the wristband content */}
      {viewDialog && (
        <Dialog open onOpenChange={(o) => !o && setViewDialog(null)}>
          <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="medium">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white">
              <DialogTitle className="text-white flex items-center gap-2">
                <QrCode className="w-5 h-5" /> Wristband Detail
              </DialogTitle>
              <DialogDescription className="text-white/80">
                WBN-{viewDialog.token?.slice(-8).toUpperCase()} · {viewDialog.patient?.firstName} {viewDialog.patient?.lastName}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4 bg-slate-50">
              {/* Detail meta */}
              <Card>
                <CardContent className="p-4 w-full">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Wristband Info</h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className="text-slate-500 font-medium">Status:</span> <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${STATUS_CONFIG[viewDialog.status]?.className}`}>{viewDialog.status?.toUpperCase()}</span></div>
                    <div><span className="text-slate-500 font-medium">Print count:</span> <span className="text-slate-900 font-semibold">{viewDialog.printCount}</span></div>
                    <div><span className="text-slate-500 font-medium">Created:</span> <span className="text-slate-900">{formatDate(viewDialog.createdAt, true)}</span></div>
                    <div><span className="text-slate-500 font-medium">Last printed:</span> <span className="text-slate-900">{viewDialog.lastPrintedAt ? formatDate(viewDialog.lastPrintedAt, true) : "—"}</span></div>
                    <div><span className="text-slate-500 font-medium">First printed by:</span> <span className="text-slate-900">{viewDialog.firstPrintedBy ? `${viewDialog.firstPrintedBy.firstName} ${viewDialog.firstPrintedBy.lastName}` : "—"}</span></div>
                    <div><span className="text-slate-500 font-medium">Last printed by:</span> <span className="text-slate-900">{viewDialog.lastPrintedBy ? `${viewDialog.lastPrintedBy.firstName} ${viewDialog.lastPrintedBy.lastName}` : "—"}</span></div>
                    {viewDialog.replacementReason && (
                      <div className="col-span-2"><span className="text-slate-500 font-medium">Void reason:</span> <span className="text-slate-900 italic">"{viewDialog.replacementReason}"</span></div>
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
                    Scanning the QR code with any smartphone opens the verify endpoint, which returns the patient's identity and active allergies.
                  </p>
                </CardContent>
              </Card>
            </div>
            <DialogFooter className="p-4 pt-3 shrink-0 border-t bg-white">
              <Button variant="outline" onClick={() => setViewDialog(null)}>Close</Button>
              {canPrint && viewDialog.status === "active" && (
                <PrintButton
                  label="Reprint"
                  className="border-violet-200 text-violet-700"
                  documentType="wristband"
                  paperSize="THERMAL_58"
                  recordId={viewDialog.id}
                  recordSummary={`Reprint wristband for ${viewDialog.patient?.firstName} ${viewDialog.patient?.lastName}`}
                  renderContent={() => <WristbandReprintContent wristband={viewDialog} />}
                />
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Helper: build a wristband content object from a row (for reprint rendering)
function WristbandReprintContent({ wristband }: { wristband: any }) {
  // Construct a minimal WristbandContent from the list-row shape.
  // (The list endpoint already includes patient + encounter + facility
  // relations. If the row doesn't have the full content snapshot, we
  // build one from the patient/encounter fields.)
  const content: WristbandContent = wristband.content || {
    patient: {
      id: wristband.patientId,
      patientNumber: wristband.patient?.patientNumber || "—",
      firstName: wristband.patient?.firstName || "",
      lastName: wristband.patient?.lastName || "",
      middleName: null,
      fullName: `${wristband.patient?.firstName || ""} ${wristband.patient?.lastName || ""}`.trim(),
      dateOfBirth: wristband.patient?.dateOfBirth || null,
      age: null,
      sex: wristband.patient?.sex,
      bloodGroup: wristband.patient?.bloodGroup,
      phone: null,
      photoUrl: null,
    },
    encounter: wristband.encounter
      ? {
          id: wristband.encounter.id,
          encounterNumber: wristband.encounter.encounterNumber,
          encounterType: wristband.encounter.encounterType,
          priority: "routine",
          startAt: wristband.encounter.startAt,
          department: null,
        }
      : undefined,
    facility: {
      id: wristband.facilityId,
      name: wristband.facility?.name || "Facility",
      code: wristband.facility?.code,
      phone: wristband.facility?.phone,
      // Logo: pulled from organization.logoUrl when available (the
      // Facility model has no logoUrl column). For the list-row
      // fallback path we don't always have this, so null is OK — the
      // template will simply omit the logo image.
      logoUrl: (wristband.facility as any)?.organization?.logoUrl || null,
    },
    organization: {
      id: "",
      name: "",
      logoUrl: (wristband.facility as any)?.organization?.logoUrl || null,
    },
    allergies: [],
    hasAllergyAlert: false,
    allergySummary: null,
    highestAllergySeverity: null,
    qrPayload: `/wb/${wristband.token}`,
    token: wristband.token,
    issuedAt: wristband.lastPrintedAt || wristband.createdAt,
  };
  return <WristbandTemplate content={content} paperSize="THERMAL_58" showIssuedAt />;
}

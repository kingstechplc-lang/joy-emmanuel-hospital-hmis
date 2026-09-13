"use client";

// =====================================================================
// BulkPrescriptionView — Phase 11
// =====================================================================
// Allows pharmacists to approve multiple pending prescriptions at once.
// Shows a list of pending prescriptions with patient info and medication
// items. The user selects which to approve and clicks "Approve Selected".
//
// SAFETY:
//   - Only pending prescriptions are shown
//   - CDSS allergy/interaction checks run per prescription — critical
//     alerts are flagged "requires review" (still approved, but pharmacist
//     reviews at dispense time)
//   - Stock availability NOT checked at approval (checked at dispense)
// =====================================================================

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Pill, RefreshCcw, Loader2, CheckCircle2, AlertCircle,
  Upload, AlertTriangle, X, FlaskConical, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { safeJson } from "@/components/ui-helpers";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

async function sendJson(url: string, method: string, body?: any) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

export function BulkPrescriptionView({ facilityId }: { facilityId: string | null }) {
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitResult, setSubmitResult] = useState<any>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["prescriptions-bulk", facilityId],
    queryFn: () => fetchJson(`/api/prescriptions/bulk-approve${facilityId ? `?facilityId=${facilityId}` : ""}`),
    enabled: !!facilityId,
    staleTime: 0,
  });

  const items: any[] = data?.items || [];

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const approveMut = useMutation({
    mutationFn: () =>
      sendJson("/api/prescriptions/bulk-approve", "POST", {
        prescriptionIds: Array.from(selected),
      }),
    onSuccess: (data) => {
      setSubmitResult(data);
      toast.success(`${data.successCount} approved, ${data.requiresReviewCount} need review, ${data.skippedCount} skipped, ${data.failedCount} failed`);
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      qc.invalidateQueries({ queryKey: ["prescriptions-bulk"] });
      setSelected(new Set());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Pill className="w-5 h-5 text-pink-600" />
            Batch Prescription Approval
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Approve multiple pending prescriptions at once. CDSS alerts are checked per prescription.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); setSubmitResult(null); }} disabled={isFetching} className="gap-1.5">
            <RefreshCcw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {items.length > 0 && (
            <Button
              size="sm"
              onClick={() => {
                confirmAction({
                  title: "Batch Approve Prescriptions",
                  description: `You are about to approve ${selected.size} prescription(s). Each will be checked for drug allergies and interactions. Prescriptions with critical CDSS alerts will be flagged for review.`,
                  confirmText: "Approve Selected",
                  variant: "warning",
                  onConfirm: () => approveMut.mutate(),
                });
              }}
              disabled={approveMut.isPending || selected.size === 0}
              className="gap-1.5 bg-gradient-to-r from-pink-500 to-rose-600 text-white"
            >
              {approveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Approve {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {items.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <Badge variant="secondary" className="gap-1">
            <Pill className="w-3 h-3" /> {items.length} pending
          </Badge>
          {selected.size > 0 && (
            <Badge variant="outline" className="gap-1 text-pink-700 border-pink-200 bg-pink-50">
              <CheckCircle2 className="w-3 h-3" /> {selected.size} selected
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={toggleAll} className="h-6 text-xs gap-1">
            {selected.size === items.length ? "Deselect All" : "Select All"}
          </Button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="py-8 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" />
          <p className="text-sm text-slate-500 mt-2">Loading pending prescriptions...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && !submitResult && (
        <Card>
          <CardContent className="p-8 text-center">
            <Pill className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No pending prescriptions</p>
            <p className="text-xs text-slate-500 mt-1">All prescriptions have been approved, dispensed, or cancelled.</p>
          </CardContent>
        </Card>
      )}

      {/* Prescription list */}
      {!isLoading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((rx) => {
            const isSelected = selected.has(rx.id);
            const rowResult = submitResult?.results?.find((r: any) => r.prescriptionId === rx.id);
            return (
              <Card
                key={rx.id}
                className={`overflow-hidden border-slate-200 transition ${
                  rowResult?.status === "success" ? "border-emerald-200 bg-emerald-50/20" :
                  rowResult?.status === "requires_review" ? "border-amber-200 bg-amber-50/20" :
                  rowResult?.status === "failed" ? "border-rose-200 bg-rose-50/20" :
                  rowResult?.status === "skipped" ? "border-slate-200 bg-slate-50/50" :
                  isSelected ? "border-pink-200 bg-pink-50/10" : ""
                }`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div className="pt-1">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(rx.id)}
                        disabled={!!rowResult}
                      />
                    </div>

                    {/* Patient + prescription info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-900">
                          {rx.patient?.firstName} {rx.patient?.lastName}
                        </p>
                        <Badge variant="outline" className="text-[10px]">{rx.patient?.patientNumber}</Badge>
                        <Badge variant="outline" className="text-[10px]">{rx.prescriptionNumber}</Badge>
                        {rx.prescriber && (
                          <span className="text-xs text-slate-400">
                            Prescribed by {rx.prescriber.firstName} {rx.prescriber.lastName}
                          </span>
                        )}
                      </div>

                      {/* Medication items */}
                      <div className="space-y-1">
                        {rx.items?.map((item: any, idx: number) => (
                          <div key={item.id || idx} className="flex items-center gap-2 text-xs bg-slate-50/50 rounded px-2 py-1">
                            <Pill className="w-3 h-3 text-pink-500 shrink-0" />
                            <span className="font-medium text-slate-700">{item.medicationName}</span>
                            {item.dose && <span className="text-slate-500">{item.dose}</span>}
                            {item.frequency && <span className="text-slate-500">· {item.frequency}</span>}
                            {item.route && <span className="text-slate-500">· {item.route}</span>}
                            {item.duration && <span className="text-slate-500">· {item.duration}</span>}
                          </div>
                        ))}
                      </div>

                      {/* Row result badge */}
                      {rowResult && (
                        <div className="mt-1">
                          {rowResult.status === "success" && (
                            <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Approved
                            </Badge>
                          )}
                          {rowResult.status === "requires_review" && (
                            <Badge className="bg-amber-100 text-amber-700 gap-1" title={rowResult.reason}>
                              <ShieldAlert className="w-3 h-3" /> Requires Review
                            </Badge>
                          )}
                          {rowResult.status === "failed" && (
                            <Badge className="bg-rose-100 text-rose-700 gap-1" title={rowResult.error}>
                              <AlertCircle className="w-3 h-3" /> Failed
                            </Badge>
                          )}
                          {rowResult.status === "skipped" && (
                            <Badge className="bg-slate-100 text-slate-600 gap-1" title={rowResult.reason}>
                              <X className="w-3 h-3" /> Skipped
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Submit summary */}
      {submitResult && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h4 className="text-sm font-bold text-slate-900">Batch Summary</h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-2 rounded-lg bg-emerald-100/50">
                <p className="text-xl font-bold text-emerald-700">{submitResult.successCount}</p>
                <p className="text-xs text-slate-500">Approved</p>
              </div>
              {submitResult.requiresReviewCount > 0 && (
                <div className="text-center p-2 rounded-lg bg-amber-100/50">
                  <p className="text-xl font-bold text-amber-700">{submitResult.requiresReviewCount}</p>
                  <p className="text-xs text-slate-500">Review Needed</p>
                </div>
              )}
              <div className="text-center p-2 rounded-lg bg-slate-100/50">
                <p className="text-xl font-bold text-slate-600">{submitResult.skippedCount}</p>
                <p className="text-xs text-slate-500">Skipped</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-rose-100/50">
                <p className="text-xl font-bold text-rose-600">{submitResult.failedCount}</p>
                <p className="text-xs text-slate-500">Failed</p>
              </div>
            </div>
            {submitResult.results?.some((r: any) => r.status === "requires_review") && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" /> CDSS Alerts — Review Before Dispensing:
                </p>
                {submitResult.results
                  .filter((r: any) => r.status === "requires_review")
                  .map((r: any, i: number) => (
                    <p key={i} className="text-xs text-amber-600 ml-5">
                      {r.reason}
                    </p>
                  ))}
              </div>
            )}
            {submitResult.results?.some((r: any) => r.status === "failed") && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold text-rose-700 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Failed:
                </p>
                {submitResult.results
                  .filter((r: any) => r.status === "failed")
                  .map((r: any, i: number) => (
                    <p key={i} className="text-xs text-rose-600 ml-5">
                      {r.error}
                    </p>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {confirmDialogEl}
    </div>
  );
}

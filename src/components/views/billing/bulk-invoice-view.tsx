"use client";

// =====================================================================
// BulkInvoiceView — Phase 10
// =====================================================================
// Allows billing staff to generate invoices for multiple encounters
// at once. Shows a preview of eligible encounters with their service
// counts, lets the user select which ones to invoice, and generates
// one invoice per encounter.
//
// Workflow:
//   1. Load eligible encounters (GET /api/invoices/bulk)
//   2. User selects encounters (checkboxes or "Select All")
//   3. Click "Generate Invoices" → POST /api/invoices/bulk
//   4. Show success/skipped/failed summary per encounter
// =====================================================================

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Receipt, RefreshCcw, Loader2, CheckCircle2, AlertCircle,
  Upload, AlertTriangle, X, FileText, FlaskConical, ScanLine,
  Activity, Stethoscope, Pill,
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

export function BulkInvoiceView({ facilityId }: { facilityId: string | null }) {
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitResult, setSubmitResult] = useState<any>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["invoices-bulk", facilityId],
    queryFn: () => fetchJson(`/api/invoices/bulk${facilityId ? `?facilityId=${facilityId}` : ""}`),
    enabled: !!facilityId,
    staleTime: 0,
  });

  const items: any[] = data?.items || [];

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const generateMut = useMutation({
    mutationFn: () =>
      sendJson("/api/invoices/bulk", "POST", {
        encounterIds: Array.from(selected),
        facilityId,
      }),
    onSuccess: (data) => {
      setSubmitResult(data);
      toast.success(`${data.successCount} invoices generated, ${data.skippedCount} skipped, ${data.failedCount} failed`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-bulk"] });
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
            <Receipt className="w-5 h-5 text-rose-600" />
            Bulk Invoice Generation
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Generate invoices for multiple encounters at once. Only encounters with unbilled services are shown.
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
                  title: "Generate Bulk Invoices",
                  description: `You are about to generate ${selected.size} invoice(s). Each encounter will get a separate invoice with its billable services. Existing invoices will not be overwritten.`,
                  confirmText: "Generate Invoices",
                  variant: "warning",
                  onConfirm: () => generateMut.mutate(),
                });
              }}
              disabled={generateMut.isPending || selected.size === 0}
              className="gap-1.5 bg-gradient-to-r from-rose-500 to-red-600 text-white"
            >
              {generateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Generate {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {items.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1">
            <Receipt className="w-3 h-3" /> {items.length} eligible
          </Badge>
          {selected.size > 0 && (
            <Badge variant="outline" className="gap-1 text-rose-700 border-rose-200 bg-rose-50">
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
          <p className="text-sm text-slate-500 mt-2">Loading eligible encounters...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && !submitResult && (
        <Card>
          <CardContent className="p-8 text-center">
            <Receipt className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No eligible encounters</p>
            <p className="text-xs text-slate-500 mt-1">All encounters with services already have invoices, or there are no unbilled encounters at this facility.</p>
          </CardContent>
        </Card>
      )}

      {/* Encounter list */}
      {!isLoading && items.length > 0 && (
        <Card className="overflow-hidden border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">
                    <Checkbox
                      checked={selected.size === items.length && items.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Patient
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Encounter
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Services
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const isSelected = selected.has(item.id);
                  const rowResult = submitResult?.results?.find((r: any) => r.encounterId === item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-slate-100 hover:bg-slate-50/30 transition ${
                        rowResult?.status === "success" ? "bg-emerald-50/30" :
                        rowResult?.status === "failed" ? "bg-rose-50/30" :
                        rowResult?.status === "skipped" ? "bg-slate-50/50" : ""
                      } ${isSelected ? "bg-rose-50/20" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(item.id)}
                          disabled={!!rowResult}
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {item.patient?.firstName} {item.patient?.lastName}
                        </div>
                        <div className="text-xs text-slate-400">{item.patient?.patientNumber}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-xs font-medium text-slate-600">{item.encounterNumber}</div>
                        <div className="text-xs text-slate-400 capitalize">{item.encounterType}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {item.serviceCounts.consultations > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-0.5">
                              <Stethoscope className="w-2.5 h-2.5" /> {item.serviceCounts.consultations}
                            </Badge>
                          )}
                          {item.serviceCounts.labOrders > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-0.5">
                              <FlaskConical className="w-2.5 h-2.5" /> {item.serviceCounts.labOrders}
                            </Badge>
                          )}
                          {item.serviceCounts.imagingOrders > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-0.5">
                              <ScanLine className="w-2.5 h-2.5" /> {item.serviceCounts.imagingOrders}
                            </Badge>
                          )}
                          {item.serviceCounts.procedures > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-0.5">
                              <Activity className="w-2.5 h-2.5" /> {item.serviceCounts.procedures}
                            </Badge>
                          )}
                          {item.serviceCounts.prescriptions > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-0.5">
                              <Pill className="w-2.5 h-2.5" /> {item.serviceCounts.prescriptions}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {rowResult?.status === "success" && (
                          <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Generated
                          </Badge>
                        )}
                        {rowResult?.status === "failed" && (
                          <Badge className="bg-rose-100 text-rose-700 gap-1" title={rowResult.error}>
                            <AlertCircle className="w-3 h-3" /> Failed
                          </Badge>
                        )}
                        {rowResult?.status === "skipped" && (
                          <Badge className="bg-slate-100 text-slate-600 gap-1" title={rowResult.reason}>
                            <X className="w-3 h-3" /> Skipped
                          </Badge>
                        )}
                        {!rowResult && (
                          <Badge variant="outline" className="text-[10px] capitalize">{item.status}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Submit summary */}
      {submitResult && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h4 className="text-sm font-bold text-slate-900">Batch Summary</h4>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 rounded-lg bg-emerald-100/50">
                <p className="text-xl font-bold text-emerald-700">{submitResult.successCount}</p>
                <p className="text-xs text-slate-500">Generated</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-slate-100/50">
                <p className="text-xl font-bold text-slate-600">{submitResult.skippedCount}</p>
                <p className="text-xs text-slate-500">Skipped</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-rose-100/50">
                <p className="text-xl font-bold text-rose-600">{submitResult.failedCount}</p>
                <p className="text-xs text-slate-500">Failed</p>
              </div>
            </div>
            {submitResult.results?.some((r: any) => r.status === "failed") && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold text-rose-700 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Failed:
                </p>
                {submitResult.results
                  .filter((r: any) => r.status === "failed")
                  .map((r: any, i: number) => (
                    <p key={i} className="text-xs text-rose-600 ml-5">
                      Encounter: {r.error}
                    </p>
                  ))}
              </div>
            )}
            {submitResult.results?.some((r: any) => r.status === "skipped") && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Skipped:
                </p>
                {submitResult.results
                  .filter((r: any) => r.status === "skipped")
                  .map((r: any, i: number) => (
                    <p key={i} className="text-xs text-slate-500 ml-5">
                      {r.reason}
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

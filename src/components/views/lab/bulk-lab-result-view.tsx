"use client";

// =====================================================================
// BulkLabResultView — Phase 9
// =====================================================================
// Allows lab scientists to enter multiple lab results in a single
// grid. Each row shows: patient name, MRN, test name, unit, reference
// range, and input fields for result value + flag + notes.
//
// Workflow:
//   1. Load pending items (GET /api/lab-results/bulk)
//   2. Lab scientist fills in result values for each row
//   3. Click "Submit Results" → POST /api/lab-results/bulk
//   4. Show success/failure summary per row
//
// Safety:
//   - Rows with empty values are skipped (not failed)
//   - Rows with existing results are skipped (not overwritten)
//   - Each row is validated independently
//   - Partial success is reported
// =====================================================================

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FlaskConical, RefreshCcw, Loader2, CheckCircle2, AlertCircle,
  Upload, AlertTriangle, Eye, X,
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

const ABNORMAL_FLAGS = [
  { value: "normal", label: "Normal", color: "bg-emerald-100 text-emerald-700" },
  { value: "low", label: "Low", color: "bg-blue-100 text-blue-700" },
  { value: "high", label: "High", color: "bg-amber-100 text-amber-700" },
  { value: "critical_low", label: "Critical Low", color: "bg-rose-100 text-rose-700" },
  { value: "critical_high", label: "Critical High", color: "bg-rose-100 text-rose-700" },
  { value: "abnormal", label: "Abnormal", color: "bg-orange-100 text-orange-700" },
  { value: "positive", label: "Positive", color: "bg-rose-100 text-rose-700" },
  { value: "negative", label: "Negative", color: "bg-emerald-100 text-emerald-700" },
];

export function BulkLabResultView({ facilityId }: { facilityId: string | null }) {
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();
  const [rows, setRows] = useState<any[]>([]);
  const [resultData, setResultData] = useState<Record<string, any>>({});
  const [submitResult, setSubmitResult] = useState<any>(null);

  // Load pending lab items
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["lab-results-bulk", facilityId],
    queryFn: () => fetchJson(`/api/lab-results/bulk${facilityId ? `?facilityId=${facilityId}` : ""}`),
    enabled: !!facilityId,
    staleTime: 0,
  });

  const items: any[] = data?.items || [];

  // Initialize result data when items load
  const initResultData = () => {
    const initial: Record<string, any> = {};
    for (const item of items) {
      if (!initial[item.id]) {
        initial[item.id] = {
          resultValue: "",
          numericValue: "",
          unit: item.unit || "",
          referenceRange: item.referenceRange || "",
          abnormalFlag: "normal",
          criticalFlag: false,
          resultNotes: "",
        };
      }
    }
    setResultData(initial);
    setSubmitResult(null);
  };

  // Update a single row's data
  const updateRow = (itemId: string, field: string, value: any) => {
    setResultData((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  // Submit mutation
  const submitMut = useMutation({
    mutationFn: () => {
      const results = items.map((item) => ({
        labOrderItemId: item.id,
        resultValue: resultData[item.id]?.resultValue || "",
        numericValue: resultData[item.id]?.numericValue !== "" ? Number(resultData[item.id]?.numericValue) : null,
        unit: resultData[item.id]?.unit || "",
        referenceRange: resultData[item.id]?.referenceRange || "",
        abnormalFlag: resultData[item.id]?.abnormalFlag || "normal",
        criticalFlag: resultData[item.id]?.criticalFlag || false,
        resultNotes: resultData[item.id]?.resultNotes || "",
      }));
      return sendJson("/api/lab-results/bulk", "POST", { results });
    },
    onSuccess: (data) => {
      setSubmitResult(data);
      toast.success(`${data.successCount} results saved, ${data.skippedCount} skipped, ${data.failedCount} failed`);
      qc.invalidateQueries({ queryKey: ["lab-results"] });
      qc.invalidateQueries({ queryKey: ["lab-results-bulk"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Count rows with data entered
  const filledRows = items.filter((item) => {
    const d = resultData[item.id];
    return d && (d.resultValue?.trim() || d.numericValue !== "");
  }).length;

  return (
    <div className="space-y-4 fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-cyan-600" />
            Bulk Lab Result Entry
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Enter multiple lab results at once. Each row is validated independently.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetch(); initResultData(); }}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCcw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {items.length > 0 && (
            <Button
              size="sm"
              onClick={() => {
                confirmAction({
                  title: "Submit Bulk Results",
                  description: `You have ${filledRows} rows with results entered out of ${items.length} total. Rows with empty values will be skipped. Existing results will not be overwritten.`,
                  confirmText: "Submit Results",
                  variant: "warning",
                  onConfirm: () => submitMut.mutate(),
                });
              }}
              disabled={submitMut.isPending || filledRows === 0}
              className="gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
            >
              {submitMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Submit Results ({filledRows})
            </Button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {items.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1">
            <FlaskConical className="w-3 h-3" /> {items.length} pending
          </Badge>
          <Badge variant="outline" className="gap-1 text-emerald-700">
            <CheckCircle2 className="w-3 h-3" /> {filledRows} filled
          </Badge>
          <Badge variant="outline" className="gap-1 text-slate-500">
            {items.length - filledRows} empty
          </Badge>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="py-8 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" />
          <p className="text-sm text-slate-500 mt-2">Loading pending lab tests...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && !submitResult && (
        <Card>
          <CardContent className="p-8 text-center">
            <FlaskConical className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No pending lab results</p>
            <p className="text-xs text-slate-500 mt-1">All lab orders are either completed, cancelled, or awaiting sample collection.</p>
          </CardContent>
        </Card>
      )}

      {/* Results grid */}
      {!isLoading && items.length > 0 && (
        <Card className="overflow-hidden border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Patient
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Test
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Result Value
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Numeric
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Unit
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Flag
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const d = resultData[item.id] || {};
                  const rowResult = submitResult?.results?.find((r: any) => r.labOrderItemId === item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-slate-100 hover:bg-slate-50/30 transition ${
                        rowResult?.status === "success" ? "bg-emerald-50/30" :
                        rowResult?.status === "failed" ? "bg-rose-50/30" :
                        rowResult?.status === "skipped" ? "bg-slate-50/50" : ""
                      }`}
                    >
                      {/* Patient */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {item.patient?.firstName} {item.patient?.lastName}
                        </div>
                        <div className="text-xs text-slate-400">
                          {item.patient?.patientNumber} · {item.orderNumber}
                        </div>
                      </td>

                      {/* Test name */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="font-medium text-slate-700">{item.testName}</div>
                        {item.testCode && <div className="text-xs text-slate-400">{item.testCode}</div>}
                      </td>

                      {/* Result Value (text) */}
                      <td className="px-3 py-2">
                        <Input
                          type="text"
                          value={d.resultValue || ""}
                          onChange={(e) => updateRow(item.id, "resultValue", e.target.value)}
                          placeholder="e.g., Positive"
                          className="h-8 text-xs w-32"
                          disabled={!!rowResult}
                        />
                      </td>

                      {/* Numeric Value */}
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          value={d.numericValue || ""}
                          onChange={(e) => updateRow(item.id, "numericValue", e.target.value)}
                          placeholder="e.g., 7.2"
                          className="h-8 text-xs w-20"
                          disabled={!!rowResult}
                        />
                      </td>

                      {/* Unit */}
                      <td className="px-3 py-2">
                        <Input
                          type="text"
                          value={d.unit || ""}
                          onChange={(e) => updateRow(item.id, "unit", e.target.value)}
                          placeholder="g/dL"
                          className="h-8 text-xs w-16"
                          disabled={!!rowResult}
                        />
                      </td>

                      {/* Flag */}
                      <td className="px-3 py-2">
                        <Select
                          value={d.abnormalFlag || "normal"}
                          onValueChange={(v) => updateRow(item.id, "abnormalFlag", v)}
                          disabled={!!rowResult}
                        >
                          <SelectTrigger className="h-8 text-xs w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ABNORMAL_FLAGS.map((f) => (
                              <SelectItem key={f.value} value={f.value} className="text-xs">
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Notes */}
                      <td className="px-3 py-2">
                        <Input
                          type="text"
                          value={d.resultNotes || ""}
                          onChange={(e) => updateRow(item.id, "resultNotes", e.target.value)}
                          placeholder="Notes..."
                          className="h-8 text-xs w-32"
                          disabled={!!rowResult}
                        />
                      </td>

                      {/* Row result status (after submit) */}
                      {rowResult && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          {rowResult.status === "success" && (
                            <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Saved
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
                        </td>
                      )}
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
                <p className="text-xs text-slate-500">Saved</p>
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
                  <AlertTriangle className="w-3.5 h-3.5" /> Failed rows:
                </p>
                {submitResult.results
                  .filter((r: any) => r.status === "failed")
                  .map((r: any, i: number) => (
                    <p key={i} className="text-xs text-rose-600 ml-5">
                      Row {r.index + 1}: {r.error}
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

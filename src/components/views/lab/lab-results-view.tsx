"use client";
import { useState, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, AlertTriangle, History } from "lucide-react";
import { PrintButton, PrintLayout } from "@/components/print/print-layout";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "verified", label: "Verified" },
  { value: "released", label: "Released" },
  { value: "amended", label: "Amended" },
  { value: "entered", label: "Entered" },
];

const ABNORMAL_FLAG_COLORS: Record<string, string> = {
  normal: "bg-emerald-100 text-emerald-700 border-emerald-200",
  low: "bg-amber-100 text-amber-700 border-amber-200",
  high: "bg-amber-100 text-amber-700 border-amber-200",
  critical_low: "bg-rose-100 text-rose-700 border-rose-200",
  critical_high: "bg-rose-100 text-rose-700 border-rose-200",
};

export function LabResultsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [amendResult, setAmendResult] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (abnormalOnly) params.set("abnormalOnly", "1");
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["lab-results", activeFacilityId, statusFilter, abnormalOnly],
    queryFn: () => fetchJson(`/api/lab-results${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["lab-results"] });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Lab Results</h2>
          <p className="text-sm text-slate-500">Verified and released results. Click a row to expand details.</p>
        </div>
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view lab results.</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-2 items-center">
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <Checkbox checked={abnormalOnly} onCheckedChange={(v) => setAbnormalOnly(!!v)} />
            Show abnormal only
          </label>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load lab results" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="No lab results" description="Verified/released results will appear here once lab orders are processed." />
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
                    <th className="text-left p-3 font-semibold text-slate-700">Test</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Result</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Ref Range</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Flag</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Entered</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r: any) => {
                    const isAbnormal = r.abnormalFlag && r.abnormalFlag !== "normal";
                    const isCritical = r.criticalFlag || (r.abnormalFlag === "critical_low" || r.abnormalFlag === "critical_high");
                    const expanded = expandedId === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr className={`border-b hover:bg-emerald-50/40 cursor-pointer ${isCritical ? "bg-rose-50/40" : ""}`} onClick={() => setExpandedId(expanded ? null : r.id)}>
                          <td className="p-3 text-slate-400">
                            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-slate-900">{r.labOrderItem?.labOrder?.patient?.firstName} {r.labOrderItem?.labOrder?.patient?.lastName}</div>
                            <div className="text-xs text-slate-500">{r.labOrderItem?.labOrder?.patient?.patientNumber}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-slate-900">{r.labOrderItem?.laboratoryTest?.name}</div>
                            <div className="text-xs text-slate-500">{r.labOrderItem?.laboratoryTest?.code}</div>
                          </td>
                          <td className="p-3">
                            <span className={`font-mono font-semibold ${isCritical ? "text-rose-700" : isAbnormal ? "text-amber-700" : "text-slate-900"}`}>
                              {r.numericValue != null ? r.numericValue : r.resultValue || "—"}
                              {r.unit && <span className="text-xs text-slate-500 ml-1">{r.unit}</span>}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-slate-600">{r.referenceRange || "—"}</td>
                          <td className="p-3">
                            {isCritical ? (
                              <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> {r.abnormalFlag?.replace("_", " ")}</Badge>
                            ) : isAbnormal ? (
                              <Badge className={`${ABNORMAL_FLAG_COLORS[r.abnormalFlag]} border`}>{r.abnormalFlag}</Badge>
                            ) : (
                              <span className="text-xs text-slate-500">Normal</span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-slate-600">{formatDate(r.enteredAt, true)}</td>
                          <td className="p-3"><StatusBadge status={r.status} /></td>
                          <td className="p-3 text-right">
                            {(r.status === "verified" || r.status === "released") && can("lab.amend") && (
                              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setAmendResult(r); }} className="gap-1 h-7 text-xs">
                                <History className="w-3 h-3" /> Amend
                              </Button>
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-slate-50">
                            <td colSpan={9} className="p-4">
                              <div className="grid md:grid-cols-2 gap-4 text-sm">
                                <div className="space-y-1">
                                  <div><span className="text-slate-500">Result:</span> <span className="font-medium">{r.resultValue || "—"}</span></div>
                                  <div><span className="text-slate-500">Numeric:</span> <span className="font-medium">{r.numericValue ?? "—"}</span> {r.unit}</div>
                                  <div><span className="text-slate-500">Reference range:</span> <span className="font-medium">{r.referenceRange || "—"}</span></div>
                                  <div><span className="text-slate-500">Abnormal flag:</span> <span className="font-medium capitalize">{r.abnormalFlag?.replace("_", " ") || "—"}</span></div>
                                  <div><span className="text-slate-500">Critical:</span> <span className="font-medium">{r.criticalFlag ? "Yes" : "No"}</span></div>
                                  {r.resultNotes && <div><span className="text-slate-500">Notes:</span> <span className="font-medium">{r.resultNotes}</span></div>}
                                </div>
                                <div className="space-y-1">
                                  <div><span className="text-slate-500">Order #:</span> <span className="font-mono text-xs">{r.labOrderItem?.labOrder?.orderNumber}</span></div>
                                  <div><span className="text-slate-500">Entered at:</span> <span className="font-medium">{formatDate(r.enteredAt, true)}</span></div>
                                  <div><span className="text-slate-500">Verified at:</span> <span className="font-medium">{formatDate(r.verifiedAt, true)}</span></div>
                                  {r.amendedFromId && (
                                    <Badge variant="outline" className="gap-1 mt-2"><History className="w-3 h-3" /> Amended from previous result</Badge>
                                  )}
                                </div>
                              </div>
                              {r.status === "released" || r.status === "verified" ? (
                                <div className="mt-3 pt-3 border-t border-slate-200">
                                  <PrintButton
                                    label="Print Lab Report"
                                    renderContent={() => (
                                      <PrintLayout
                                        title="Laboratory Test Report"
                                        subtitle={r.labOrderItem?.laboratoryTest?.name || "Laboratory Test"}
                                        documentNumber={r.labOrderItem?.labOrder?.orderNumber}
                                        facility={r.labOrderItem?.labOrder?.facility}
                                        patient={r.labOrderItem?.labOrder?.patient}
                                        signatory={r.labOrderItem?.labOrder?.orderingClinician ? `Dr. ${r.labOrderItem.labOrder.orderingClinician.firstName} ${r.labOrderItem.labOrder.orderingClinician.lastName}` : undefined}
                                        signatoryRole="Ordering Physician"
                                      >
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                          <thead>
                                            <tr style={{ background: "#f1f5f9" }}>
                                              <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Test</th>
                                              <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Result</th>
                                              <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Unit</th>
                                              <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Ref Range</th>
                                              <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Flag</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            <tr>
                                              <td style={{ padding: "6px 8px", fontWeight: 500 }}>{r.labOrderItem?.laboratoryTest?.name}</td>
                                              <td style={{ padding: "6px 8px", fontWeight: 700, color: r.criticalFlag ? "#be123c" : r.abnormalFlag && r.abnormalFlag !== "normal" ? "#d97706" : "#0f172a" }}>
                                                {(r.numericValue ?? r.resultValue) || "—"}
                                                {r.criticalFlag && " ⚠ CRITICAL"}
                                              </td>
                                              <td style={{ padding: "6px 8px" }}>{r.unit || "—"}</td>
                                              <td style={{ padding: "6px 8px" }}>{r.referenceRange || "—"}</td>
                                              <td style={{ padding: "6px 8px" }}>{r.abnormalFlag?.replace(/_/g, " ") || "normal"}</td>
                                            </tr>
                                          </tbody>
                                        </table>
                                        {r.resultNotes && (
                                          <div style={{ marginTop: "12px", padding: "8px", background: "#f8fafc", borderRadius: "4px", fontSize: "11px" }}>
                                            <strong>Notes:</strong> {r.resultNotes}
                                          </div>
                                        )}
                                        <div style={{ marginTop: "16px", fontSize: "11px", color: "#64748b" }}>
                                          <p><strong>Specimen:</strong> {r.labOrderItem?.laboratoryTest?.specimenType || "—"}</p>
                                          <p><strong>Collected:</strong> {r.labOrderItem?.labOrder?.samples?.[0]?.collectedAt ? new Date(r.labOrderItem.labOrder.samples[0].collectedAt).toLocaleString("en-GB") : "—"}</p>
                                          <p><strong>Result entered:</strong> {r.enteredAt ? new Date(r.enteredAt).toLocaleString("en-GB") : "—"}</p>
                                          <p><strong>Verified:</strong> {r.verifiedAt ? new Date(r.verifiedAt).toLocaleString("en-GB") : "—"}</p>
                                          <p><strong>Status:</strong> {r.status}</p>
                                        </div>
                                      </PrintLayout>
                                    )}
                                  />
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {amendResult && (
        <AmendResultDialog result={amendResult} onClose={() => setAmendResult(null)} onAmended={() => { setAmendResult(null); invalidate(); }} />
      )}
    </div>
  );
}

function AmendResultDialog({ result, onClose, onAmended }: { result: any; onClose: () => void; onAmended: () => void }) {
  const [form, setForm] = useState({
    resultValue: result.resultValue || "",
    numericValue: result.numericValue ?? "",
    unit: result.unit || "",
    referenceRange: result.referenceRange || "",
    abnormalFlag: result.abnormalFlag || "normal",
    criticalFlag: !!result.criticalFlag,
    resultNotes: result.resultNotes || "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  const setField = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/lab-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amendedFromId: result.id, ...form }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Result amended (original preserved)");
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
          <DialogTitle className="flex items-center gap-2"><History className="w-5 h-5 text-emerald-600" /> Amend Result</DialogTitle>
          <DialogDescription>
            A new amended result will be created. The original is preserved for audit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-slate-50 p-3 rounded text-sm space-y-1">
            <div className="font-medium text-slate-900">{result.labOrderItem?.laboratoryTest?.name}</div>
            <div className="text-xs text-slate-500">Patient: {result.labOrderItem?.labOrder?.patient?.firstName} {result.labOrderItem?.labOrder?.patient?.lastName}</div>
            <div className="text-xs text-slate-500">Original value: <span className="font-mono">{result.numericValue ?? result.resultValue ?? "—"}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">New Result Value</Label>
              <Input value={form.resultValue} onChange={(e) => setField("resultValue", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">New Numeric Value</Label>
              <Input type="number" value={form.numericValue} onChange={(e) => setField("numericValue", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Unit</Label>
              <Input value={form.unit} onChange={(e) => setField("unit", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Reference Range</Label>
              <Input value={form.referenceRange} onChange={(e) => setField("referenceRange", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Abnormal Flag</Label>
              <Select value={form.abnormalFlag || undefined} onValueChange={(v) => setField("abnormalFlag", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical_low">Critical Low</SelectItem>
                  <SelectItem value="critical_high">Critical High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox checked={form.criticalFlag} onCheckedChange={(v) => setField("criticalFlag", !!v)} id="amend-crit" />
              <Label htmlFor="amend-crit" className="text-xs">Critical value</Label>
            </div>
          </div>
          <div>
            <Label className="text-xs">Reason for amendment</Label>
            <Textarea value={form.reason} onChange={(e) => setField("reason", e.target.value)} rows={2} placeholder="Why is this result being amended?" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.resultNotes} onChange={(e) => setField("resultNotes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Amending..." : "Create Amendment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

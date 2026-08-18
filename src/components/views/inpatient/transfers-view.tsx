"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, ArrowRightLeft, Search, Check, X, Ban } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative } from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "requested", label: "Requested" },
  { value: "approved", label: "Approved" },
  { value: "accepted", label: "Accepted" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function TransfersView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["transfers", activeFacilityId, statusFilter],
    queryFn: () => fetchJson(`/api/transfers${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["transfers"] });
    qc.invalidateQueries({ queryKey: ["beds"] });
    qc.invalidateQueries({ queryKey: ["admissions"] });
  };

  const doAction = async (id: string, action: string, successMsg: string) => {
    try {
      const res = await fetch(`/api/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success(successMsg);
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Patient Transfers</h2>
          <p className="text-sm text-slate-500">Ward-to-ward and facility-to-facility transfers with bed assignment handoff</p>
        </div>
        <Button onClick={() => setShowNew(true)} disabled={!can("admission.transfer")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Transfer
        </Button>
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view transfers.</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3">
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load transfers" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No transfers"
              description="Create a transfer request to move a patient between wards or facilities."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("admission.transfer")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Transfer</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">From → To</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Reason</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Requested</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t: any) => (
                    <tr key={t.id} className="border-b hover:bg-emerald-50/40">
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{t.patient?.firstName} {t.patient?.lastName}</div>
                        <div className="text-xs text-slate-500">{t.patient?.patientNumber}</div>
                      </td>
                      <td className="p-3">
                        <div className="text-xs">
                          <div className="text-slate-700 font-medium">{t.fromFacility?.name}</div>
                          <div className="text-emerald-700">↓</div>
                          <div className="text-slate-700 font-medium">{t.toFacility?.name}</div>
                        </div>
                      </td>
                      <td className="p-3 text-xs text-slate-700 max-w-xs truncate">{t.reason || "—"}</td>
                      <td className="p-3"><StatusBadge status={t.status} /></td>
                      <td className="p-3 text-xs text-slate-600">{formatDate(t.requestedAt, true)}<br/><span className="text-[10px] text-slate-400">{formatRelative(t.requestedAt)}</span></td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {t.status === "requested" && can("admission.transfer") && (
                            <Button size="sm" variant="outline" onClick={() => doAction(t.id, "approve", "Transfer approved — bed assigned at target")} className="gap-1 h-7 text-xs bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-700">
                              <Check className="w-3 h-3" /> Approve
                            </Button>
                          )}
                          {t.status === "approved" && can("admission.transfer") && (
                            <Button size="sm" variant="outline" onClick={() => doAction(t.id, "accept", "Transfer accepted at target facility")} className="gap-1 h-7 text-xs">
                              <Check className="w-3 h-3" /> Accept
                            </Button>
                          )}
                          {t.status === "accepted" && can("admission.transfer") && (
                            <Button size="sm" onClick={() => doAction(t.id, "complete", "Transfer completed")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <Check className="w-3 h-3" /> Complete
                            </Button>
                          )}
                          {["requested", "approved", "accepted"].includes(t.status) && can("admission.transfer") && (
                            <Button size="sm" variant="ghost" onClick={() => doAction(t.id, "cancel", "Transfer cancelled")} className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700">
                              <X className="w-3 h-3" /> Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <NewTransferDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} fromFacilityId={activeFacilityId} />
    </div>
  );
}

function NewTransferDialog({ open, onClose, onCreated, fromFacilityId }: { open: boolean; onClose: () => void; onCreated: () => void; fromFacilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [admissionId, setAdmissionId] = useState("");
  const [toFacilityId, setToFacilityId] = useState("");
  const [toWardId, setToWardId] = useState("");
  const [toBedId, setToBedId] = useState("");
  const [reason, setReason] = useState("");
  const [clinicalSummary, setClinicalSummary] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search-transfer", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  const { data: admissionsData } = useQuery({
    queryKey: ["patient-admissions-transfer", patientId, fromFacilityId],
    queryFn: () => fetchJson(`/api/admissions?patientId=${patientId}&status=admitted${fromFacilityId ? `&facilityId=${fromFacilityId}` : ""}`),
    enabled: !!patientId,
  });

  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities-transfer"],
    queryFn: () => fetchJson(`/api/facilities`),
  });

  const { data: toWardsData } = useQuery({
    queryKey: ["wards-transfer", toFacilityId],
    queryFn: () => fetchJson(`/api/wards?facilityId=${toFacilityId}`),
    enabled: !!toFacilityId,
  });

  const { data: toBedsData } = useQuery({
    queryKey: ["ward-beds-transfer", toWardId],
    queryFn: () => fetchJson(`/api/beds?wardId=${toWardId}&status=available`),
    enabled: !!toWardId,
  });

  const selectedAdmission = (admissionsData?.items || []).find((a: any) => a.id === admissionId);
  const fromBedAssignment = selectedAdmission?.bedAssignments?.[0];

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    if (!admissionId) { toast.error("Please select an admission to transfer"); return; }
    if (!fromFacilityId) { toast.error("No active facility selected"); return; }
    if (!toFacilityId) { toast.error("Please select a target facility"); return; }
    if (!toWardId) { toast.error("Please select a target ward"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          admissionId,
          fromFacilityId,
          toFacilityId,
          fromWardId: fromBedAssignment?.wardId || undefined,
          fromBedId: fromBedAssignment?.bedId || undefined,
          toWardId,
          toBedId: toBedId || undefined,
          reason,
          clinicalSummary,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Transfer request created");
      setPatientQuery(""); setPatientId(""); setAdmissionId("");
      setToFacilityId(""); setToWardId(""); setToBedId(""); setReason(""); setClinicalSummary("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-emerald-600" /> New Patient Transfer</DialogTitle>
          <DialogDescription>Move a patient between wards or facilities. On approval, the source bed is released and the target bed is occupied atomically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search patient..." value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} className="pl-9" />
            </div>
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => { setPatientId(p.id); setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); setAdmissionId(""); }} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {patientId && (
            <div>
              <Label>Admission (current inpatient stay)</Label>
              <Select value={admissionId || undefined} onValueChange={setAdmissionId}>
                <SelectTrigger><SelectValue placeholder="Select the admission to transfer" /></SelectTrigger>
                <SelectContent>
                  {(admissionsData?.items || []).length === 0 ? (
                    <SelectItem value="_none" disabled>No active admissions for this patient</SelectItem>
                  ) : (
                    (admissionsData?.items || []).map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.admissionNumber} • {a.bedAssignments?.[0]?.ward?.name || "No bed"} • {a.bedAssignments?.[0]?.bed?.bedNumber || "—"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {admissionId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From Facility</Label>
                <Input value={selectedAdmission?.facility?.name || fromFacilityId || ""} disabled className="bg-slate-50" />
              </div>
              <div>
                <FieldLabel required>To Facility</FieldLabel>
                <Select value={toFacilityId || undefined} onValueChange={(v) => { setToFacilityId(v); setToWardId(""); setToBedId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select target facility" /></SelectTrigger>
                  <SelectContent>
                    {(facilitiesData?.facilities || []).map((f: any) => (
                      <SelectItem key={f.id} value={f.id}>{f.name} ({f.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {toFacilityId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Target Ward</FieldLabel>
                <Select value={toWardId || undefined} onValueChange={(v) => { setToWardId(v); setToBedId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select ward" /></SelectTrigger>
                  <SelectContent>
                    {(toWardsData?.items || []).map((w: any) => (
                      <SelectItem key={w.id} value={w.id}>{w.name} • {w.bedStats?.available || 0} available</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Bed (optional — will occupy on approval)</Label>
                <Select value={toBedId || undefined} onValueChange={setToBedId}>
                  <SelectTrigger><SelectValue placeholder="No target bed" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— No target bed —</SelectItem>
                    {(toBedsData?.items || []).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>Bed {b.bedNumber}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div>
            <Label>Reason for Transfer</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Requires ICU care not available at source facility" />
          </div>

          <div>
            <Label>Clinical Summary</Label>
            <Textarea value={clinicalSummary} onChange={(e) => setClinicalSummary(e.target.value)} rows={3} placeholder="Current diagnosis, treatment so far, ongoing medications, and any precautions..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !patientId || !admissionId || !toFacilityId || !toWardId} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Creating..." : "Create Transfer Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Activity, Search, RefreshCw, Share2, Stethoscope, FileText, Pill, Receipt, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, calculateAge, safeJson, PageHeader, usePagination, Pagination} from "@/components/ui-helpers";
import { SpecialtyReferralButton } from "@/components/ui/specialty-referral-button";
import { EncounterDetailDialog } from "@/components/views/clinical/encounter-detail-dialog";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const ENCOUNTER_TYPES = [
  { value: "opd", label: "OPD Visit" },
  { value: "emergency", label: "Emergency" },
  { value: "inpatient", label: "Inpatient" },
  { value: "follow_up", label: "Follow-up" },
  { value: "laboratory", label: "Laboratory" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "imaging", label: "Imaging" },
  { value: "procedure", label: "Procedure" },
  { value: "maternity", label: "Maternity" },
];

export function EncountersView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setView = useAppStore((s) => s.setView);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const selectEncounter = useAppStore((s) => s.selectEncounter);
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("startAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showNew, setShowNew] = useState(false);

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (activeFacilityId) params.set("facilityId", activeFacilityId);
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return `?${params.toString()}`;
  };

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["encounters", activeFacilityId, statusFilter, typeFilter, sortBy, sortOrder, startDate, endDate],
    queryFn: () => fetchJson(`/api/encounters${buildQuery()}&limit=100`),
  });

  const openEncounter = (e: any) => {
    // Open encounter detail dialog
    setDetailEncounter(e);
  };

  // --- Quick action handlers ---
  const canEdit = can("encounter.edit");
  const canClose = can("encounter.close");
  const canCreate = can("encounter.create");

  const [detailEncounter, setDetailEncounter] = useState<any | null>(null);

  const closeMutation = useMutation({
    mutationFn: async (encounterId: string) => {
      const res = await fetch(`/api/encounters/${encounterId}/close`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!res.ok) { const e = await safeJson(res).catch(() => ({})); throw new Error(e.error || "Failed to close"); }
      return safeJson(res);
    },
    onSuccess: (data: any) => {
      toast.success(data.message || "Encounter closed");
      if (data.warnings?.length > 0) toast.warning(`Warnings: ${data.warnings.join(", ")}`);
      qc.invalidateQueries({ queryKey: ["encounters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ encounterId, reason }: { encounterId: string; reason: string }) => {
      const res = await fetch(`/api/encounters/${encounterId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", reason }) });
      if (!res.ok) { const e = await safeJson(res).catch(() => ({})); throw new Error(e.error || "Failed to cancel"); }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Encounter cancelled");
      qc.invalidateQueries({ queryKey: ["encounters"] });
      setCancelEncounter(null);
      setCancelReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [cancelEncounter, setCancelEncounter] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Encounters"
        description="View and manage all patient encounters across the facility"
        icon={Activity}
        gradient="from-blue-500 to-blue-600"
        actions={
          <Button onClick={() => setShowNew(true)} className="bg-white/20 border border-white/30 text-white hover:bg-white/30">
            <Plus className="w-4 h-4 mr-1" /> New Encounter
          </Button>
        }
      />

      {!activeFacilityId && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-700 bg-amber-50 border-amber-200">
            Please select an active facility from the top bar to view encounters.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="admitted">Admitted</SelectItem>
                <SelectItem value="discharged">Discharged</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={typeFilter || "all"} onValueChange={(v) => setTypeFilter(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ENCOUNTER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sort By</Label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="startAt">Visit Date</SelectItem>
                <SelectItem value="encounterNumber">Encounter #</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="createdAt">Created</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Date Range</Label>
            <div className="flex gap-1">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-xs" placeholder="From" />
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-xs" placeholder="To" />
            </div>
          </div>
          <div className="flex items-end gap-1">
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }} className="gap-1">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(""); setTypeFilter(""); setStartDate(""); setEndDate(""); setSortBy("startAt"); setSortOrder("desc"); }} className="text-xs">
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load encounters" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No encounters found"
              description="Adjust filters or create a new encounter."
              action={
                <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="w-4 h-4" /> New Encounter
                </Button>
              }
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
                    <th className="text-left p-3 font-semibold text-slate-700">Encounter #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Facility</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Priority</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Started</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((e: any) => (
                    <tr key={e.id} onClick={() => openEncounter(e)} className="border-b hover:bg-emerald-50/50 cursor-pointer">
                      <td className="p-3 font-mono text-xs">{e.encounterNumber}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{e.patient?.firstName} {e.patient?.lastName}</div>
                        <div className="text-xs text-slate-500">{e.patient?.patientNumber} • {calculateAge(e.patient?.dateOfBirth)}y</div>
                      </td>
                      <td className="p-3 text-slate-700">{e.facility?.name}</td>
                      <td className="p-3 capitalize">{e.encounterType}</td>
                      <td className="p-3"><StatusBadge status={e.priority} /></td>
                      <td className="p-3"><StatusBadge status={e.status} /></td>
                      <td className="p-3 text-slate-600">{formatDate(e.startAt, true)}</td>
                      <td className="p-3 text-right whitespace-nowrap" onClick={(ev) => ev.stopPropagation()}>
                        {/* Quick Actions */}
                        <button
                          onClick={() => { selectPatient(e.patient.id); selectEncounter(e.id); setView("triage"); }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-1.5 py-1 rounded mr-1"
                          title="Triage"
                        >
                          <Stethoscope className="w-3 h-3" /> Triage
                        </button>
                        <button
                          onClick={() => { selectPatient(e.patient.id); selectEncounter(e.id); setView("consultations"); }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-1.5 py-1 rounded mr-1"
                          title="Consultation"
                        >
                          <FileText className="w-3 h-3" /> Consult
                        </button>
                        <button
                          onClick={() => { selectPatient(e.patient.id); selectEncounter(e.id); setView("prescriptions"); }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-600 hover:text-teal-700 hover:bg-teal-50 px-1.5 py-1 rounded mr-1"
                          title="Prescribe"
                        >
                          <Pill className="w-3 h-3" /> Rx
                        </button>
                        <button
                          onClick={() => { selectPatient(e.patient.id); selectEncounter(e.id); setView("billing_invoices"); }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-1.5 py-1 rounded mr-1"
                          title="Bill"
                        >
                          <Receipt className="w-3 h-3" /> Bill
                        </button>
                        {canClose && !["completed", "cancelled", "discharged"].includes(e.status) && (
                          <button
                            onClick={() => closeMutation.mutate(e.id)}
                            disabled={closeMutation.isPending}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 px-1.5 py-1 rounded mr-1"
                            title="Close Encounter"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Close
                          </button>
                        )}
                        {canClose && !["completed", "cancelled", "discharged"].includes(e.status) && (
                          <button
                            onClick={() => { setCancelEncounter(e); }}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-1.5 py-1 rounded"
                            title="Cancel Encounter"
                          >
                            <XCircle className="w-3 h-3" /> Cancel
                          </button>
                        )}
                        <SpecialtyReferralButton
                          patient={e.patient}
                          fromDepartment={e.encounterType?.toUpperCase() || "OPD"}
                          label=""
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-amber-600 hover:text-amber-700"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Server-side Pagination */}
      {data?.items && data.items.length > 0 && (
        <Pagination
          page={data.page || 1}
          pageSize={data.limit || 50}
          totalPages={data.totalPages || 1}
          totalItems={data.totalCount || data.items.length}
          onPageChange={(p) => {
            // Client-side pagination using the loaded items (limit=100 from API)
            // The API supports server-side pagination but we load 100 at a time for the current UI
          }}
          onPageSizeChange={() => {}}
        />
      )}

      <NewEncounterDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => {
        qc.invalidateQueries({ queryKey: ["encounters"] });
        setShowNew(false);
      }} defaultFacilityId={activeFacilityId} />

      {/* Cancel Encounter Dialog */}
      {cancelEncounter && (
        <Dialog open onOpenChange={() => setCancelEncounter(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><XCircle className="w-5 h-5 text-rose-600" /> Cancel Encounter</DialogTitle>
              <DialogDescription>
                Cancel <span className="font-mono font-semibold">{cancelEncounter.encounterNumber}</span> — {cancelEncounter.patient?.firstName} {cancelEncounter.patient?.lastName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label>Reason for Cancellation *</Label>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Patient left without being seen, duplicate, etc."
              />
              <p className="text-xs text-amber-600">This action cannot be undone. The encounter will be marked as cancelled with an audit record.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelEncounter(null)}>Don't Cancel</Button>
              <Button
                onClick={() => cancelMutation.mutate({ encounterId: cancelEncounter.id, reason: cancelReason })}
                disabled={cancelMutation.isPending || !cancelReason.trim()}
                className="bg-rose-600 hover:bg-rose-700"
              >
                {cancelMutation.isPending ? "Cancelling..." : "Confirm Cancel"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Encounter Detail Dialog */}
      {detailEncounter && (
        <EncounterDetailDialog
          encounter={detailEncounter}
          canClose={canClose}
          canEdit={canEdit}
          onClose={() => setDetailEncounter(null)}
          onNavigate={(view) => {
            selectPatient(detailEncounter.patient?.id);
            selectEncounter(detailEncounter.id);
            setView(view);
            setDetailEncounter(null);
          }}
          onClosed={(id) => {
            closeMutation.mutate(id);
            setDetailEncounter(null);
          }}
          onCancelled={(e) => {
            setCancelEncounter(e);
            setDetailEncounter(null);
          }}
        />
      )}
    </div>
  );
}

function NewEncounterDialog({ open, onClose, onCreated, defaultFacilityId }: { open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId: string | null }) {
  const qc = useQueryClient();
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [facilityId, setFacilityId] = useState(defaultFacilityId || "");
  const [departmentId, setDepartmentId] = useState("");
  const [encounterType, setEncounterType] = useState("opd");
  const [priority, setPriority] = useState("routine");
  const [saving, setSaving] = useState(false);

  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities-list"],
    queryFn: () => fetchJson("/api/facilities"),
  });

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  const { data: departmentsData } = useQuery({
    queryKey: ["departments-list", facilityId],
    queryFn: () => fetchJson(`/api/departments?facilityId=${facilityId}`),
    enabled: !!facilityId,
  });

  const create = async () => {
    if (!patientId || !facilityId) {
      toast.error("Please select patient and facility");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId, facilityId, departmentId: departmentId || undefined,
          encounterType, priority,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || `Failed (${res.status})`);
      }
      toast.success("Encounter created");
      qc.invalidateQueries({ queryKey: ["encounters"] });
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New Encounter</DialogTitle>
          <DialogDescription>Open a new clinical encounter for a patient at this facility.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <Input
              placeholder="Search patient by name, number, phone, Ghana Card..."
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
            />
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPatientId(p.id);
                      setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
                    }}
                    className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0"
                  >
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber} • {p.phone || "no phone"}</span>
                  </button>
                ))}
              </div>
            )}
            {patientId && <p className="text-xs text-emerald-700 mt-1">✓ Patient selected</p>}
          </div>

          <div>
            <FieldLabel required>Facility</FieldLabel>
            <Select value={facilityId || undefined} onValueChange={setFacilityId}>
              <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
              <SelectContent>
                {(facilitiesData?.items || facilitiesData?.facilities || []).map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Department</Label>
            <Select value={departmentId || "none"} onValueChange={(v) => setDepartmentId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {(departmentsData?.items || departmentsData?.departments || []).map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={encounterType || undefined} onValueChange={setEncounterType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENCOUNTER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority || undefined} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            {saving ? <Activity className="w-4 h-4 animate-pulse" /> : <Activity className="w-4 h-4" />}
            {saving ? "Creating..." : "Create Encounter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

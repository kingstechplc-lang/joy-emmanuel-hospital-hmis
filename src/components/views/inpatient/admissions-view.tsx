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
import { Badge } from "@/components/ui/badge";
import { Plus, BedDouble, LogOut, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative, safeJson, PageHeader} from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "admitted", label: "Admitted" },
  { value: "discharged", label: "Discharged" },
  { value: "transferred", label: "Transferred" },
  { value: "cancelled", label: "Cancelled" },
];

const ADMISSION_TYPES = [
  { value: "emergency", label: "Emergency" },
  { value: "elective", label: "Elective" },
  { value: "transfer", label: "Transfer" },
  { value: "day_case", label: "Day Case" },
];

export function AdmissionsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [dischargeAdmission, setDischargeAdmission] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admissions", activeFacilityId, statusFilter],
    queryFn: () => fetchJson(`/api/admissions${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admissions"] });
    qc.invalidateQueries({ queryKey: ["beds"] });
    qc.invalidateQueries({ queryKey: ["wards"] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admissions"
        description="Manage patient admissions to wards and beds"
        icon={BedDouble}
        gradient="from-amber-500 to-orange-600"
        actions={
          <Button onClick={() => setShowNew(true)} disabled={!can("admission.create")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Admission
        </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view admissions.</CardContent></Card>
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
        <ErrorState message="Failed to load admissions" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No admissions"
              description="Create a new admission to assign a patient to a bed."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("admission.create")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Admission</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Admission #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Ward / Bed</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Admitted</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a: any) => {
                    const ba = a.bedAssignments?.[0];
                    return (
                      <tr key={a.id} className="border-b hover:bg-emerald-50/40">
                        <td className="p-3 font-mono text-xs text-slate-700">{a.admissionNumber}</td>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{a.patient?.firstName} {a.patient?.lastName}</div>
                          <div className="text-xs text-slate-500">{a.patient?.patientNumber}</div>
                        </td>
                        <td className="p-3">
                          {ba ? (
                            <div>
                              <div className="text-sm font-medium text-slate-900">{ba.ward?.name}</div>
                              <div className="text-xs text-slate-500">Bed {ba.bed?.bedNumber}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">No active bed</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px] capitalize">{a.admissionType || "—"}</Badge>
                        </td>
                        <td className="p-3 text-xs text-slate-600">
                          <div>{formatDate(a.admittedAt)}</div>
                          <div className="text-[10px] text-slate-400">{formatRelative(a.admittedAt)}</div>
                        </td>
                        <td className="p-3"><StatusBadge status={a.status} /></td>
                        <td className="p-3 text-right">
                          {a.status === "admitted" && can("admission.discharge") && (
                            <Button size="sm" onClick={() => setDischargeAdmission(a)} className="gap-1 h-7 text-xs bg-rose-600 hover:bg-rose-700">
                              <LogOut className="w-3 h-3" /> Discharge
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <NewAdmissionDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); invalidate(); }}
        facilityId={activeFacilityId}
      />

      {dischargeAdmission && (
        <DischargeDialog
          admission={dischargeAdmission}
          onClose={() => setDischargeAdmission(null)}
          onDone={() => { setDischargeAdmission(null); invalidate(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// New Admission Dialog — transactional create (admission + bed assignment)
// ============================================================
function NewAdmissionDialog({ open, onClose, onCreated, facilityId }: { open: boolean; onClose: () => void; onCreated: () => void; facilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [wardId, setWardId] = useState("");
  const [bedId, setBedId] = useState("");
  const [admissionType, setAdmissionType] = useState("elective");
  const [admissionReason, setAdmissionReason] = useState("");
  const [admissionDiagnosis, setAdmissionDiagnosis] = useState("");
  const [attendingClinicianId, setAttendingClinicianId] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters", patientId, facilityId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}&facilityId=${facilityId || ""}`),
    enabled: !!patientId && !!facilityId,
  });

  const { data: wardsData } = useQuery({
    queryKey: ["wards", facilityId],
    queryFn: () => fetchJson(`/api/wards?facilityId=${facilityId}`),
    enabled: !!facilityId,
  });

  // Fetch available beds in the selected ward
  const { data: bedsData } = useQuery({
    queryKey: ["ward-beds", wardId],
    queryFn: () => fetchJson(`/api/beds?wardId=${wardId}&status=available`),
    enabled: !!wardId,
  });

  const selectPatient = (p: any) => {
    setPatientId(p.id);
    setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
  };

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    if (!facilityId) { toast.error("No active facility selected"); return; }
    if (!wardId) { toast.error("Please select a ward"); return; }
    if (!bedId) { toast.error("Please select an available bed"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          encounterId: encounterId || undefined,
          facilityId,
          wardId,
          bedId,
          admissionType,
          admissionReason,
          admissionDiagnosis,
          attendingClinicianId: attendingClinicianId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed to create admission");
      }
      toast.success("Admission created and bed assigned");
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setWardId(""); setBedId(""); setAdmissionReason(""); setAdmissionDiagnosis("");
      setAttendingClinicianId("");
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
          <DialogTitle className="flex items-center gap-2"><BedDouble className="w-5 h-5 text-emerald-600" /> New Admission</DialogTitle>
          <DialogDescription>Admit a patient and assign a bed. The admission and bed assignment are created atomically — if the bed is unavailable, the operation is rolled back.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search by name, number, phone, Ghana Card..." value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} className="pl-9" />
            </div>
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => selectPatient(p)} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {patientId && (
            <div>
              <Label>Encounter (optional — auto-creates an inpatient encounter if blank)</Label>
              <Select value={encounterId || undefined} onValueChange={setEncounterId}>
                <SelectTrigger><SelectValue placeholder="Auto-create inpatient encounter" /></SelectTrigger>
                <SelectContent>
                  {(encountersData?.items || []).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.encounterNumber} • {e.encounterType} • {formatDate(e.startAt, true)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <FieldLabel required>Ward</FieldLabel>
            <Select value={wardId || undefined} onValueChange={(v) => { setWardId(v); setBedId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select ward" /></SelectTrigger>
              <SelectContent>
                {(wardsData?.items || []).map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} {w.code ? `(${w.code})` : ""} • {w.bedStats?.available || 0} available / {w.bedStats?.total || 0}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {wardId && (
            <div>
              <FieldLabel required>Bed (only available beds shown)</FieldLabel>
              <Select value={bedId || undefined} onValueChange={setBedId}>
                <SelectTrigger><SelectValue placeholder="Select an available bed" /></SelectTrigger>
                <SelectContent>
                  {(bedsData?.items || []).length === 0 ? (
                    <SelectItem value="_none" disabled>No available beds in this ward</SelectItem>
                  ) : (
                    (bedsData?.items || []).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        Bed {b.bedNumber} {b.bedType ? `• ${b.bedType}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Admission Type</Label>
              <Select value={admissionType || undefined} onValueChange={setAdmissionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ADMISSION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Attending Clinician ID (optional)</Label>
              <Input value={attendingClinicianId} onChange={(e) => setAttendingClinicianId(e.target.value)} placeholder="Defaults to current user" />
            </div>
          </div>

          <div>
            <Label>Admission Reason</Label>
            <Textarea value={admissionReason} onChange={(e) => setAdmissionReason(e.target.value)} rows={2} placeholder="Reason for admission (e.g. severe abdominal pain)" />
          </div>

          <div>
            <Label>Admission Diagnosis</Label>
            <Textarea value={admissionDiagnosis} onChange={(e) => setAdmissionDiagnosis(e.target.value)} rows={2} placeholder="Provisional diagnosis at admission" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !patientId || !wardId || !bedId} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Creating..." : <><BedDouble className="w-4 h-4" /> Admit & Assign Bed</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Discharge Dialog — captures discharge details then submits via PATCH /api/admissions/[id]?action=discharge
// ============================================================
function DischargeDialog({ admission, onClose, onDone }: { admission: any; onClose: () => void; onDone: () => void }) {
  const [dischargeSummary, setDischargeSummary] = useState("");
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [procedures, setProcedures] = useState("");
  const [medications, setMedications] = useState("");
  const [followUpPlan, setFollowUpPlan] = useState("");
  const [disposition, setDisposition] = useState("home");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!disposition) { toast.error("Disposition required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admissions/${admission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "discharge",
          dischargeSummary, finalDiagnosis, procedures, medications, followUpPlan, disposition,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed to discharge");
      }
      toast.success("Patient discharged. Bed released and encounter closed.");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const ba = admission.bedAssignments?.[0];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><LogOut className="w-5 h-5 text-rose-600" /> Discharge Patient</DialogTitle>
          <DialogDescription>
            {admission.patient?.firstName} {admission.patient?.lastName} ({admission.patient?.patientNumber}) •
            Admission {admission.admissionNumber}
            {ba ? ` • Bed ${ba.bed?.bedNumber} (${ba.ward?.name})` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Discharge Summary</Label>
            <Textarea value={dischargeSummary} onChange={(e) => setDischargeSummary(e.target.value)} rows={3} placeholder="Course of treatment during admission..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Final Diagnosis</Label>
              <Input value={finalDiagnosis} onChange={(e) => setFinalDiagnosis(e.target.value)} placeholder="Final diagnosis at discharge" />
            </div>
            <div>
              <Label>Disposition</Label>
              <Select value={disposition || undefined} onValueChange={setDisposition}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="transferred">Transferred</SelectItem>
                  <SelectItem value="referred">Referred</SelectItem>
                  <SelectItem value="deceased">Deceased</SelectItem>
                  <SelectItem value="ama">Left Against Medical Advice</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Procedures Performed</Label>
            <Textarea value={procedures} onChange={(e) => setProcedures(e.target.value)} rows={2} placeholder="Procedures performed during admission (one per line)" />
          </div>
          <div>
            <Label>Medications on Discharge</Label>
            <Textarea value={medications} onChange={(e) => setMedications(e.target.value)} rows={2} placeholder="Discharge medications (one per line)" />
          </div>
          <div>
            <Label>Follow-up Plan</Label>
            <Textarea value={followUpPlan} onChange={(e) => setFollowUpPlan(e.target.value)} rows={2} placeholder="Follow-up instructions, appointment date, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-rose-600 hover:bg-rose-700">
            {saving ? "Discharging..." : <><XCircle className="w-4 h-4" /> Confirm Discharge</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Plus, LogOut, Search, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, calculateAge, safeJson, PageHeader} from "@/components/ui-helpers";
import { DiagnosisPicker } from "@/components/ui/diagnosis-picker";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const DISPOSITIONS = [
  { value: "home", label: "Home" },
  { value: "transferred", label: "Transferred" },
  { value: "referred", label: "Referred" },
  { value: "deceased", label: "Deceased" },
  { value: "ama", label: "Left Against Medical Advice" },
];

export function DischargesView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [diagnosisDischarge, setDiagnosisDischarge] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["discharges", activeFacilityId],
    queryFn: () => fetchJson(`/api/discharges${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["discharges"] });
    qc.invalidateQueries({ queryKey: ["admissions"] });
    qc.invalidateQueries({ queryKey: ["beds"] });
  };

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Discharges"
        description="Process and track patient discharges"
        icon={LogOut}
        gradient="from-indigo-500 to-blue-600"
        actions={
          <Button onClick={() => setShowNew(true)} disabled={!can("admission.discharge")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Discharge
        </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view discharges.</CardContent></Card>
      )}

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load discharges" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No discharge records"
              description="Discharge a patient from the admissions list to create a record here."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("admission.discharge")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Discharge</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Admission</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Final Diagnosis</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Disposition</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Discharged</th>
                    <th className="text-left p-3 font-semibold text-slate-700">By</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d: any) => (
                    <tr key={d.id} className="border-b hover:bg-emerald-50/40">
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{d.patient?.firstName} {d.patient?.lastName}</div>
                        <div className="text-xs text-slate-500">{d.patient?.patientNumber}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-mono text-xs text-slate-700">{d.admission?.admissionNumber}</div>
                        <div className="text-[10px] text-slate-400">{d.admission?.facility?.name}</div>
                      </td>
                      <td className="p-3 text-xs text-slate-700">{d.finalDiagnosis || "—"}</td>
                      <td className="p-3"><StatusBadge status={d.disposition || "home"} /></td>
                      <td className="p-3 text-xs text-slate-600">{formatDate(d.dischargedAt, true)}</td>
                      <td className="p-3 text-xs text-slate-600">{d.dischargedBy?.firstName} {d.dischargedBy?.lastName}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-indigo-600 hover:text-indigo-700" onClick={() => setDiagnosisDischarge(d)} title="View / Manage Diagnoses">
                          <Stethoscope className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <NewDischargeDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} facilityId={activeFacilityId} />

      {diagnosisDischarge && (
        <DiagnosisDialog
          discharge={diagnosisDischarge}
          canManage={can("diagnosis.create")}
          onClose={() => setDiagnosisDischarge(null)}
        />
      )}
    </div>
  );
}

function NewDischargeDialog({ open, onClose, onCreated, facilityId }: { open: boolean; onClose: () => void; onCreated: () => void; facilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [admissionId, setAdmissionId] = useState("");
  const [dischargeSummary, setDischargeSummary] = useState("");
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [procedures, setProcedures] = useState("");
  const [medications, setMedications] = useState("");
  const [followUpPlan, setFollowUpPlan] = useState("");
  const [disposition, setDisposition] = useState("home");
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search-discharge", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  const { data: admissionsData } = useQuery({
    queryKey: ["patient-admissions-discharge", patientId, facilityId],
    queryFn: () => fetchJson(`/api/admissions?patientId=${patientId}&status=admitted${facilityId ? `&facilityId=${facilityId}` : ""}`),
    enabled: !!patientId,
  });

  const selectPatient = (p: any) => {
    setPatientId(p.id);
    setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
    setAdmissionId("");
  };

  // Find the selected admission to get encounterId for DiagnosisPicker
  const selectedAdmission = (admissionsData?.items || []).find((a: any) => a.id === admissionId);
  const encounterId = selectedAdmission?.encounterId;

  const submit = async () => {
    if (!admissionId) { toast.error("Please select an admission to discharge"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/discharges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissionId,
          dischargeSummary, finalDiagnosis, procedures, medications, followUpPlan, disposition,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Patient discharged. Bed released and encounter closed.");
      setPatientQuery(""); setPatientId(""); setAdmissionId("");
      setDischargeSummary(""); setFinalDiagnosis(""); setProcedures("");
      setMedications(""); setFollowUpPlan(""); setDisposition("home");
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
          <DialogTitle className="flex items-center gap-2"><LogOut className="w-5 h-5 text-rose-600" /> New Discharge</DialogTitle>
          <DialogDescription>Discharge a patient — this releases their bed, closes their encounter, and creates a discharge record. The operation is atomic.</DialogDescription>
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
              <Label>Admission (must be admitted)</Label>
              <Select value={admissionId || undefined} onValueChange={setAdmissionId}>
                <SelectTrigger><SelectValue placeholder="Select an active admission" /></SelectTrigger>
                <SelectContent>
                  {(admissionsData?.items || []).length === 0 ? (
                    <SelectItem value="_none" disabled>No active admissions for this patient</SelectItem>
                  ) : (
                    (admissionsData?.items || []).map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.admissionNumber} • Admitted {formatDate(a.admittedAt)} {a.bedAssignments?.[0]?.bed ? `• Bed ${a.bedAssignments[0].bed.bedNumber}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

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
                  {DISPOSITIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
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

          {/* Discharge Diagnoses — Centralized Diagnosis Engine */}
          {patientId && encounterId && (
            <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50/30 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                <Stethoscope className="w-3.5 h-3.5" /> Discharge Diagnoses (Structured)
              </p>
              <p className="text-[10px] text-slate-500">
                Record structured discharge diagnoses (principal, final, secondary) from the centralized catalog. These appear in the patient's diagnosis history and flow into reporting.
              </p>
              <DiagnosisPicker
                patientId={patientId}
                encounterId={encounterId}
                canManage={true}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !admissionId} className="gap-2 bg-rose-600 hover:bg-rose-700">
            {saving ? "Discharging..." : <><LogOut className="w-4 h-4" /> Confirm Discharge</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Diagnosis Dialog — view/manage diagnoses for a discharge's encounter
// ============================================================
function DiagnosisDialog({ discharge, canManage, onClose }: { discharge: any; canManage: boolean; onClose: () => void }) {
  const patientId = discharge.patientId || discharge.patient?.id;
  const encounterId = discharge.admission?.encounterId;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-indigo-600" />
            Diagnoses — {discharge.patient?.firstName} {discharge.patient?.lastName}
          </DialogTitle>
          <DialogDescription>
            Discharge {discharge.admission?.admissionNumber || ""}
            {discharge.finalDiagnosis && ` • Final Dx: ${discharge.finalDiagnosis}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {patientId && encounterId ? (
            <DiagnosisPicker
              patientId={patientId}
              encounterId={encounterId}
              canManage={canManage}
            />
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">
              No linked encounter found for this discharge. Diagnoses require an encounter to attach to.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

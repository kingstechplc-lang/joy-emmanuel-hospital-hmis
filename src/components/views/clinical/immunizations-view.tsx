"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Syringe, Save } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, calculateAge } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

const COMMON_VACCINES = [
  "BCG (Tuberculosis)",
  "OPV (Polio) - Birth dose",
  "OPV (Polio) - 1st dose",
  "OPV (Polio) - 2nd dose",
  "OPV (Polio) - 3rd dose",
  "Pentavalent (DPT-HepB-Hib) - 1st dose",
  "Pentavalent (DPT-HepB-Hib) - 2nd dose",
  "Pentavalent (DPT-HepB-Hib) - 3rd dose",
  "Rotavirus - 1st dose",
  "Rotavirus - 2nd dose",
  "Pneumococcal (PCV) - 1st dose",
  "Pneumococcal (PCV) - 2nd dose",
  "Pneumococcal (PCV) - 3rd dose",
  "Measles-Rubella (MR) - 1st dose",
  "Measles-Rubella (MR) - 2nd dose",
  "Yellow Fever",
  "Meningococcal",
  "Hepatitis A",
  "Hepatitis B - birth dose",
  "HPV (Cervical Cancer)",
  "Tetanus Toxoid (TT)",
  "COVID-19",
  "Influenza",
  "Typhoid",
  "Cholera",
  "Rabies",
];

export function ImmunizationsView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["immunizations", activeFacilityId],
    queryFn: () => fetchJson(`/api/immunizations?facilityId=${activeFacilityId}`),
    enabled: !!activeFacilityId,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Immunizations</h2>
          <p className="text-sm text-slate-500">Record of vaccines administered at this facility.</p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> Record Immunization
        </Button>
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view immunizations.</CardContent></Card>
      )}

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load immunizations" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No immunizations recorded"
              description="Record the first immunization administered at this facility."
              action={<Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> Record Immunization</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Vaccine</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Dose</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Batch #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Administered</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Next Due</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i: any) => (
                    <tr key={i.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{i.patient?.firstName} {i.patient?.lastName}</div>
                        <div className="text-xs text-slate-500">{i.patient?.patientNumber} • {calculateAge(i.patient?.dateOfBirth)}y</div>
                      </td>
                      <td className="p-3">{i.vaccineName}</td>
                      <td className="p-3">{i.dose || "—"}</td>
                      <td className="p-3 font-mono text-xs">{i.batchNumber || "—"}</td>
                      <td className="p-3 text-slate-600">{formatDate(i.administeredAt, true)}</td>
                      <td className="p-3">
                        {i.nextDueAt ? (
                          <span className={new Date(i.nextDueAt) < new Date() ? "text-rose-600 font-medium" : "text-slate-700"}>
                            {formatDate(i.nextDueAt)}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <NewImmunizationDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); qc.invalidateQueries({ queryKey: ["immunizations"] }); }}
        defaultFacilityId={activeFacilityId}
      />
    </div>
  );
}

function NewImmunizationDialog({ open, onClose, onCreated, defaultFacilityId }: { open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [vaccineName, setVaccineName] = useState("");
  const [dose, setDose] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [administeredAt, setAdministeredAt] = useState(new Date().toISOString().split("T")[0]);
  const [nextDueAt, setNextDueAt] = useState("");
  const [facilityId, setFacilityId] = useState(defaultFacilityId || "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });
  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities-list"],
    queryFn: () => fetchJson("/api/facilities"),
  });

  const submit = async () => {
    if (!patientId || !vaccineName || !facilityId) {
      toast.error("Patient, vaccine, and facility are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/immunizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId, vaccineName, dose, batchNumber,
          administeredAt: new Date(administeredAt).toISOString(),
          nextDueAt: nextDueAt ? new Date(nextDueAt).toISOString() : undefined,
          facilityId, notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Immunization recorded");
      setPatientQuery(""); setPatientId(""); setVaccineName(""); setDose("");
      setBatchNumber(""); setNextDueAt(""); setNotes("");
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
          <DialogTitle>Record Immunization</DialogTitle>
          <DialogDescription>Log a vaccine administered to a patient.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Patient *</Label>
            <Input placeholder="Search patient..." value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => { setPatientId(p.id); setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); }} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Vaccine *</Label>
            <Select value={vaccineName} onValueChange={setVaccineName}>
              <SelectTrigger><SelectValue placeholder="Select vaccine" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {COMMON_VACCINES.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Dose</Label>
              <Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="e.g. 1st dose" />
            </div>
            <div>
              <Label>Batch Number</Label>
              <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="Lot/Batch #" />
            </div>
          </div>

          <div>
            <Label>Facility *</Label>
            <Select value={facilityId} onValueChange={setFacilityId}>
              <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
              <SelectContent>
                {(facilitiesData?.items || facilitiesData?.facilities || []).map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date Administered *</Label>
              <Input type="date" value={administeredAt} onChange={(e) => setAdministeredAt(e.target.value)} />
            </div>
            <div>
              <Label>Next Due Date</Label>
              <Input type="date" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Adverse reactions, observations..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Save className="w-4 h-4 animate-pulse" /> : <Syringe className="w-4 h-4" />}
            {saving ? "Saving..." : "Record Immunization"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

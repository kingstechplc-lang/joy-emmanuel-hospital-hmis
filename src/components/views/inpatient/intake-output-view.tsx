"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Droplets, Plus, RefreshCcw, Search, AlertCircle, TrendingDown, TrendingUp, Activity } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, formatDate, calculateAge, safeJson} from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

const ENTRY_TYPE_OPTIONS = [
  { value: "intake", label: "Intake" },
  { value: "output", label: "Output" },
];

const FLUID_TYPE_OPTIONS = [
  { value: "oral", label: "Oral" },
  { value: "iv", label: "IV Fluid" },
  { value: "urine", label: "Urine" },
  { value: "drainage", label: "Drainage" },
  { value: "blood_loss", label: "Blood Loss" },
  { value: "other", label: "Other" },
];

const ENTRY_TYPE_COLOR: Record<string, string> = {
  intake: "bg-emerald-100 text-emerald-700 border-emerald-200",
  output: "bg-amber-100 text-amber-700 border-amber-200",
};

export function IntakeOutputView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");

  // Search patients (debounced through queryKey)
  const { data: patientResults } = useQuery({
    queryKey: ["intake-output-patient-search", patientSearch],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientSearch)}`),
    enabled: patientSearch.length >= 2 && !selectedPatientId,
  });
  const searchedPatients = patientResults?.items || patientResults?.patients || [];

  // Load admitted patients for the active facility — easier default picker
  const { data: admissionsData, isLoading: loadingAdmissions } = useQuery({
    queryKey: ["intake-output-admissions", activeFacilityId],
    queryFn: () => fetchJson(`/api/admissions?facilityId=${activeFacilityId}&status=admitted&limit=200`),
    enabled: !!activeFacilityId,
  });
  const admittedPatients = (admissionsData?.items || []).map((a: any) => ({
    id: a.patient?.id,
    patientNumber: a.patient?.patientNumber,
    firstName: a.patient?.firstName,
    lastName: a.patient?.lastName,
    sex: a.patient?.sex,
    dateOfBirth: a.patient?.dateOfBirth,
    admissionId: a.id,
    admissionNumber: a.admissionNumber,
    encounterId: a.encounterId,
    ward: a.bedAssignments?.[0]?.ward?.name,
    bed: a.bedAssignments?.[0]?.bed?.bedNumber,
  }));

  // Filter admitted patients by search
  const filteredAdmitted = admittedPatients.filter((p: any) => {
    if (!patientSearch || p.id === selectedPatientId) return p.id === selectedPatientId || !patientSearch;
    const q = patientSearch.toLowerCase();
    return (
      p.firstName?.toLowerCase().includes(q) ||
      p.lastName?.toLowerCase().includes(q) ||
      p.patientNumber?.toLowerCase().includes(q)
    );
  });

  // Load entries for selected patient
  const { data: entriesData, isLoading: loadingEntries, isError: entriesError, refetch: refetchEntries } = useQuery({
    queryKey: ["intake-output-entries", selectedPatientId],
    queryFn: () => fetchJson(`/api/intake-output?patientId=${selectedPatientId}`),
    enabled: !!selectedPatientId,
  });

  const entries = entriesData?.items || [];
  const dailyTotals = entriesData?.dailyTotals || [];
  const summary = entriesData?.summary || { totalIntake: 0, totalOutput: 0 };

  const selectPatient = (p: any) => {
    setSelectedPatientId(p.id);
    setSelectedPatient(p);
    setPatientSearch("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Droplets className="w-6 h-6 text-teal-600" />
            Intake / Output Chart
          </h2>
          <p className="text-sm text-slate-500">
            Track inpatient fluid intake and output with daily totals and net balance
          </p>
        </div>
        {can("clinical.view") && selectedPatientId && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Record Entry
          </Button>
        )}
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view admitted patients.</CardContent></Card>
      )}

      {/* Patient picker */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <FieldLabel required>Select Admitted Patient</FieldLabel>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search admitted patient by name or number..."
                value={selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName} (${selectedPatient.patientNumber})` : patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  if (selectedPatientId) {
                    setSelectedPatientId("");
                    setSelectedPatient(null);
                  }
                }}
                className="pl-9"
              />
            </div>
            {patientSearch.length >= 2 && !selectedPatientId && (
              <div className="mt-2 border rounded-md max-h-60 overflow-y-auto">
                {loadingAdmissions ? (
                  <div className="p-3 text-sm text-slate-500">Loading admitted patients...</div>
                ) : filteredAdmitted.length === 0 && searchedPatients.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">No matching admitted patients found.</div>
                ) : (
                  <>
                    {filteredAdmitted.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => selectPatient(p)}
                        className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0"
                      >
                        <div className="font-medium text-slate-900">
                          {p.firstName} {p.lastName}
                          <span className="ml-2 text-xs text-slate-500">{p.patientNumber}</span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {p.admissionNumber} • {p.ward || "—"} / Bed {p.bed || "—"}
                        </div>
                      </button>
                    ))}
                    {filteredAdmitted.length === 0 && searchedPatients.slice(0, 5).map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => selectPatient({ ...p, admissionId: "", admissionNumber: "", encounterId: "", ward: null, bed: null })}
                        className="w-full text-left p-2 hover:bg-amber-50 text-sm border-b last:border-0"
                      >
                        <div className="font-medium text-slate-900">
                          {p.firstName} {p.lastName}
                          <span className="ml-2 text-xs text-slate-500">{p.patientNumber}</span>
                        </div>
                        <div className="text-xs text-amber-700">Not currently admitted — record anyway</div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {selectedPatient && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm">
              <div className="font-medium text-slate-900">
                {selectedPatient.firstName} {selectedPatient.lastName}
                <span className="ml-2 text-xs text-slate-600">{selectedPatient.patientNumber}</span>
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {selectedPatient.sex || "—"}, {calculateAge(selectedPatient.dateOfBirth)}y
                {selectedPatient.admissionNumber && ` • ${selectedPatient.admissionNumber}`}
                {selectedPatient.ward && ` • ${selectedPatient.ward} / Bed ${selectedPatient.bed || "—"}`}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!selectedPatientId ? (
        <Card><CardContent className="p-6">
          <EmptyState
            title="Select a patient to view intake/output chart"
            description="Pick an admitted patient to record and review their fluid balance."
            icon={Droplets}
          />
        </CardContent></Card>
      ) : loadingEntries ? (
        <LoadingState rows={5} />
      ) : entriesError ? (
        <ErrorState message="Failed to load intake/output entries" onRetry={() => refetchEntries()} />
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Total Intake
                </div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">{summary.totalIntake.toLocaleString()} ml</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide">
                  <TrendingDown className="w-3.5 h-3.5 text-amber-600" /> Total Output
                </div>
                <div className="text-2xl font-bold text-amber-700 mt-1">{summary.totalOutput.toLocaleString()} ml</div>
              </CardContent>
            </Card>
            <Card className="col-span-2 md:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide">
                  <Activity className="w-3.5 h-3.5 text-teal-600" /> Net Balance
                </div>
                <div className={`text-2xl font-bold mt-1 ${(summary.totalIntake - summary.totalOutput) >= 0 ? "text-teal-700" : "text-rose-700"}`}>
                  {(summary.totalIntake - summary.totalOutput).toLocaleString()} ml
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily totals */}
          {dailyTotals.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="p-3 border-b bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-700">Daily Totals</h3>
                </div>
                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Intake (ml)</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Output (ml)</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Net (ml)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyTotals.map((t: any) => (
                        <tr key={t.date} className="border-b hover:bg-slate-50">
                          <td className="p-3 text-slate-900">{formatDate(t.date)}</td>
                          <td className="p-3 text-right text-emerald-700 font-medium">{t.intake.toLocaleString()}</td>
                          <td className="p-3 text-right text-amber-700 font-medium">{t.output.toLocaleString()}</td>
                          <td className={`p-3 text-right font-medium ${t.net >= 0 ? "text-teal-700" : "text-rose-700"}`}>
                            {t.net >= 0 ? "+" : ""}{t.net.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entries table */}
          <Card>
            <CardContent className="p-0">
              <div className="p-3 border-b bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Recorded Entries ({entries.length})</h3>
                {can("clinical.view") && (
                  <Button size="sm" onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 h-8">
                    <Plus className="w-3.5 h-3.5" /> Record Entry
                  </Button>
                )}
              </div>
              {entries.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No entries recorded yet"
                    description="Record the first fluid intake or output entry for this patient."
                    icon={AlertCircle}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Time</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Fluid</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Amount (ml)</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Notes</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Recorded By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e: any) => (
                        <tr key={e.id} className="border-b hover:bg-slate-50">
                          <td className="p-3">
                            <div className="text-slate-900">{formatDate(e.recordedAt, true)}</div>
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${ENTRY_TYPE_COLOR[e.entryType] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                              {e.entryType}
                            </span>
                          </td>
                          <td className="p-3 capitalize text-slate-700">{e.fluidType.replace(/_/g, " ")}</td>
                          <td className={`p-3 text-right font-medium ${e.entryType === "intake" ? "text-emerald-700" : "text-amber-700"}`}>
                            {e.amount.toLocaleString()}
                          </td>
                          <td className="p-3 text-slate-700 max-w-xs truncate">{e.notes || "—"}</td>
                          <td className="p-3 text-xs text-slate-500">
                            {e.recordedBy ? `${e.recordedBy.firstName} ${e.recordedBy.lastName}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {showNew && selectedPatient && (
        <NewEntryDialog
          patient={selectedPatient}
          facilityId={activeFacilityId || ""}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}

function NewEntryDialog({
  patient,
  facilityId,
  onClose,
}: {
  patient: any;
  facilityId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const [form, setForm] = useState({
    entryType: "intake",
    fluidType: "oral",
    amount: "",
    recordedAt: "",
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/intake-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          encounterId: patient.encounterId || undefined,
          admissionId: patient.admissionId || undefined,
          facilityId,
          entryType: form.entryType,
          fluidType: form.fluidType,
          amount: Number(form.amount),
          recordedAt: form.recordedAt ? new Date(form.recordedAt).toISOString() : undefined,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Entry recorded");
      qc.invalidateQueries({ queryKey: ["intake-output-entries", patient.id] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-teal-600" /> Record Intake / Output Entry
          </DialogTitle>
          <DialogDescription>
            Patient: {patient.firstName} {patient.lastName} ({patient.patientNumber})
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Entry Type</FieldLabel>
            <Select value={form.entryType || undefined} onValueChange={(v) => setForm({ ...form, entryType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENTRY_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Fluid Type</FieldLabel>
            <Select value={form.fluidType || undefined} onValueChange={(v) => setForm({ ...form, fluidType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FLUID_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Amount (ml)</FieldLabel>
            <Input
              type="number"
              min="0"
              step="1"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="e.g., 250"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Recorded At</Label>
            <Input
              type="datetime-local"
              value={form.recordedAt}
              onChange={(e) => setForm({ ...form, recordedAt: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Optional notes (e.g., vomited, IV rate change, dressing soaked)..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.amount || Number(form.amount) < 0}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {mutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Droplets className="w-4 h-4" />}
            Save Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

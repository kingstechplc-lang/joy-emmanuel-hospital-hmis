"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Stethoscope, Save } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate } from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

const TRIAGE_CATEGORIES = [
  { value: "1_immediate", label: "1 — Immediate (Resuscitation)", color: "bg-rose-500 text-white" },
  { value: "2_urgent", label: "2 — Urgent (Emergency)", color: "bg-amber-500 text-white" },
  { value: "3_standard", label: "3 — Standard (Acute)", color: "bg-emerald-500 text-white" },
  { value: "4_non_urgent", label: "4 — Non-urgent (Routine)", color: "bg-slate-400 text-white" },
];

export function TriageView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [mode, setMode] = useState<"form" | "history">("form");

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Triage & Vitals</h2>
          <p className="text-sm text-slate-500">Record patient vitals and assign a triage category.</p>
        </div>
        <div className="flex gap-1 border rounded">
          <Button size="sm" variant={mode === "form" ? "default" : "ghost"} onClick={() => setMode("form")} className={mode === "form" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
            <Activity className="w-4 h-4 mr-1" /> New Triage
          </Button>
          <Button size="sm" variant={mode === "history" ? "default" : "ghost"} onClick={() => setMode("history")} className={mode === "history" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
            History
          </Button>
        </div>
      </div>

      {mode === "form" ? (
        <TriageForm facilityId={activeFacilityId} onCreated={() => qc.invalidateQueries({ queryKey: ["triage"] })} />
      ) : (
        <TriageHistory facilityId={activeFacilityId} />
      )}
    </div>
  );
}

function TriageForm({ facilityId, onCreated }: { facilityId: string | null; onCreated: () => void }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [encounterMode, setEncounterMode] = useState<"existing" | "new">("existing");

  const [v, setV] = useState({
    temperature: "", pulse: "", respiratoryRate: "",
    systolicBp: "", diastolicBp: "", oxygenSaturation: "",
    weight: "", height: "", bloodGlucose: "",
    painScore: "", consciousnessLevel: "alert",
    triageCategory: "3_standard",
    chiefComplaint: "", notes: "", recordVitalSigns: true,
  });

  const setField = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }));

  // BMI calculation
  const bmi = useMemo(() => {
    const w = parseFloat(v.weight);
    const h = parseFloat(v.height);
    if (!w || !h) return null;
    const hm = h / 100;
    if (hm <= 0) return null;
    return Math.round((w / (hm * hm)) * 10) / 10;
  }, [v.weight, v.height]);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters", patientId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}`),
    enabled: !!patientId,
  });

  const createEncounter = async (): Promise<string | null> => {
    if (!patientId || !facilityId) return null;
    const res = await fetch("/api/encounters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId, facilityId, encounterType: "emergency", priority: "urgent",
      }),
    });
    if (!res.ok) throw new Error("Failed to create encounter");
    const data = await res.json();
    return data.item.id as string;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let encId: string | null = encounterId || null;
      if (encounterMode === "new" || !encId) {
        encId = await createEncounter();
      }
      if (!encId) throw new Error("No encounter selected");
      const payload: any = {
        encounterId: encId,
        patientId,
        temperature: v.temperature ? parseFloat(v.temperature) : undefined,
        pulse: v.pulse ? parseInt(v.pulse) : undefined,
        respiratoryRate: v.respiratoryRate ? parseInt(v.respiratoryRate) : undefined,
        systolicBp: v.systolicBp ? parseInt(v.systolicBp) : undefined,
        diastolicBp: v.diastolicBp ? parseInt(v.diastolicBp) : undefined,
        oxygenSaturation: v.oxygenSaturation ? parseFloat(v.oxygenSaturation) : undefined,
        weight: v.weight ? parseFloat(v.weight) : undefined,
        height: v.height ? parseFloat(v.height) : undefined,
        bloodGlucose: v.bloodGlucose ? parseFloat(v.bloodGlucose) : undefined,
        painScore: v.painScore ? parseInt(v.painScore) : undefined,
        consciousnessLevel: v.consciousnessLevel,
        triageCategory: v.triageCategory,
        chiefComplaint: v.chiefComplaint,
        notes: v.notes,
        recordVitalSigns: v.recordVitalSigns,
      };
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Triage recorded");
      onCreated();
      // Reset
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setV({ ...v, chiefComplaint: "", notes: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">New Triage Record</CardTitle>
        <CardDescription>Record vitals and assign triage category. A VitalSign entry is created automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <FieldLabel required>Patient</FieldLabel>
          <Input placeholder="Search patient..." value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
          {patientsData?.patients && patientsData.patients.length > 0 && (
            <div className="mt-1 max-h-40 overflow-y-auto border rounded bg-white">
              {patientsData.patients.map((p: any) => (
                <button key={p.id} onClick={() => { setPatientId(p.id); setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); }} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                  <span className="font-medium">{p.firstName} {p.lastName}</span>
                  <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {patientId && (
          <div>
            <Label>Encounter</Label>
            <div className="flex gap-2 mb-2">
              <Button size="sm" type="button" variant={encounterMode === "existing" ? "default" : "outline"} onClick={() => setEncounterMode("existing")} className={encounterMode === "existing" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>Existing</Button>
              <Button size="sm" type="button" variant={encounterMode === "new" ? "default" : "outline"} onClick={() => setEncounterMode("new")} className={encounterMode === "new" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>Create New (Emergency)</Button>
            </div>
            {encounterMode === "existing" && (
              <Select value={encounterId} onValueChange={setEncounterId}>
                <SelectTrigger><SelectValue placeholder="Select encounter" /></SelectTrigger>
                <SelectContent>
                  {(encountersData?.items || []).filter((e: any) => e.status === "open" || e.status === "in_progress").map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.encounterNumber} • {e.encounterType} • {formatDate(e.startAt, true)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {encounterMode === "new" && (
              <p className="text-xs text-slate-500">A new emergency encounter will be created at <strong>{facilityId ? "active facility" : "no facility"}</strong>.</p>
            )}
          </div>
        )}

        {/* Vital signs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <VitalInput label="Temp (°C)" value={v.temperature} onChange={(val) => setField("temperature", val)} placeholder="36.5" />
          <VitalInput label="Pulse (bpm)" value={v.pulse} onChange={(val) => setField("pulse", val)} placeholder="72" />
          <VitalInput label="Resp Rate" value={v.respiratoryRate} onChange={(val) => setField("respiratoryRate", val)} placeholder="16" />
          <VitalInput label="Systolic BP" value={v.systolicBp} onChange={(val) => setField("systolicBp", val)} placeholder="120" />
          <VitalInput label="Diastolic BP" value={v.diastolicBp} onChange={(val) => setField("diastolicBp", val)} placeholder="80" />
          <VitalInput label="SpO₂ (%)" value={v.oxygenSaturation} onChange={(val) => setField("oxygenSaturation", val)} placeholder="98" />
          <VitalInput label="Weight (kg)" value={v.weight} onChange={(val) => setField("weight", val)} placeholder="65" />
          <VitalInput label="Height (cm)" value={v.height} onChange={(val) => setField("height", val)} placeholder="170" />
          <VitalInput label="Glucose (mmol/L)" value={v.bloodGlucose} onChange={(val) => setField("bloodGlucose", val)} placeholder="5.5" />
          <VitalInput label="Pain (0-10)" value={v.painScore} onChange={(val) => setField("painScore", val)} placeholder="0" />
          <div>
            <Label className="text-xs">Consciousness</Label>
            <Select value={v.consciousnessLevel} onValueChange={(val) => setField("consciousnessLevel", val)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alert">A — Alert</SelectItem>
                <SelectItem value="voice">V — Voice</SelectItem>
                <SelectItem value="pain">P — Pain</SelectItem>
                <SelectItem value="unresponsive">U — Unresponsive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">BMI (auto)</Label>
            <Input value={bmi ?? ""} disabled placeholder="—" />
          </div>
        </div>

        <div>
          <Label>Triage Category</Label>
          <Select value={v.triageCategory} onValueChange={(val) => setField("triageCategory", val)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TRIAGE_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Chief Complaint</Label>
          <Textarea value={v.chiefComplaint} onChange={(e) => setField("chiefComplaint", e.target.value)} placeholder="Patient's main complaint..." rows={2} />
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea value={v.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Additional triage notes..." rows={2} />
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !patientId} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saveMutation.isPending ? <Save className="w-4 h-4 animate-pulse" /> : <Stethoscope className="w-4 h-4" />}
            {saveMutation.isPending ? "Saving..." : "Save Triage Record"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function VitalInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function TriageHistory({ facilityId }: { facilityId: string | null }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["triage", facilityId],
    queryFn: () => fetchJson(`/api/triage?facilityId=${facilityId}`),
    enabled: !!facilityId,
  });

  if (!facilityId) return <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility.</CardContent></Card>;
  if (isLoading) return <LoadingState rows={5} />;
  if (isError) return <ErrorState message="Failed to load triage records" onRetry={() => refetch()} />;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Recent Triage Records</CardTitle></CardHeader>
      <CardContent className="p-0">
        {(!data?.items || data.items.length === 0) ? (
          <EmptyState title="No triage records yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Encounter</th>
                  <th className="text-left p-3 font-semibold text-slate-700">BP</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Temp</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Pulse</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Category</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((t: any) => (
                  <tr key={t.id} className="border-b hover:bg-slate-50">
                    <td className="p-3">{t.patient?.firstName} {t.patient?.lastName}</td>
                    <td className="p-3 font-mono text-xs">{t.encounter?.encounterNumber}</td>
                    <td className="p-3">{t.systolicBp ? `${t.systolicBp}/${t.diastolicBp}` : "—"}</td>
                    <td className="p-3">{t.temperature ? `${t.temperature}°C` : "—"}</td>
                    <td className="p-3">{t.pulse ? `${t.pulse}` : "—"}</td>
                    <td className="p-3"><StatusBadge status={t.triageCategory || "—"} /></td>
                    <td className="p-3 text-slate-600">{formatDate(t.recordedAt, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

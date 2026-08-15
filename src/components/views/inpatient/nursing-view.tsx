"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, NotebookPen, ClipboardList, Search } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

const NOTE_TYPES = [
  { value: "assessment", label: "Assessment" },
  { value: "intervention", label: "Intervention" },
  { value: "handover", label: "Handover" },
  { value: "observation", label: "Observation" },
  { value: "wound", label: "Wound Care" },
];

export function NursingView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [patientFilter, setPatientFilter] = useState("");
  const [showNewNote, setShowNewNote] = useState(false);
  const [showNewCarePlan, setShowNewCarePlan] = useState(false);

  const params = new URLSearchParams();
  params.set("type", "both");
  if (patientFilter) params.set("patientId", patientFilter);
  const qs = `?${params.toString()}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["nursing", patientFilter],
    queryFn: () => fetchJson(`/api/nursing${qs}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["nursing"] });

  const notes: any[] = data?.notes || [];
  const carePlans: any[] = data?.carePlans || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Nursing Notes & Care Plans</h2>
          <p className="text-sm text-slate-500">Document nursing assessments, interventions, handovers, and care plans</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowNewCarePlan(true)} disabled={!can("clinical.create")} variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
            <ClipboardList className="w-4 h-4" /> New Care Plan
          </Button>
          <Button onClick={() => setShowNewNote(true)} disabled={!can("clinical.create")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New Note
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col md:flex-row gap-2">
            <Input
              placeholder="Filter by Patient ID (leave empty to show all)"
              value={patientFilter}
              onChange={(e) => setPatientFilter(e.target.value)}
              className="md:w-80"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load nursing records" onRetry={() => refetch()} />
      ) : (
        <Tabs defaultValue="notes">
          <TabsList>
            <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
            <TabsTrigger value="care_plans">Care Plans ({carePlans.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="notes" className="space-y-2">
            {notes.length === 0 ? (
              <Card><CardContent className="p-6">
                <EmptyState title="No nursing notes" description="Create a nursing note for a patient." />
              </CardContent></Card>
            ) : (
              <div className="space-y-2">
                {notes.map((n: any) => (
                  <Card key={n.id}>
                    <CardContent className="p-3">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px] capitalize">{n.noteType || "note"}</Badge>
                            <span className="text-sm font-medium text-slate-900">{n.patient?.firstName} {n.patient?.lastName}</span>
                            <span className="text-xs text-slate-500">{n.patient?.patientNumber}</span>
                          </div>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</p>
                          <div className="mt-2 text-xs text-slate-500">
                            By {n.nurse?.firstName || "—"} {n.nurse?.lastName || ""} • {formatDate(n.createdAt, true)} ({formatRelative(n.createdAt)})
                            {n.admission && ` • Admission ${n.admission.admissionNumber}`}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="care_plans" className="space-y-2">
            {carePlans.length === 0 ? (
              <Card><CardContent className="p-6">
                <EmptyState title="No care plans" description="Create a care plan for a patient." />
              </CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {carePlans.map((cp: any) => (
                  <Card key={cp.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-emerald-600" />
                        {cp.problem || "Care Plan"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm pt-0">
                      <div className="text-xs text-slate-500">
                        {cp.patient?.firstName} {cp.patient?.lastName} ({cp.patient?.patientNumber})
                        {cp.admission && ` • ${cp.admission.admissionNumber}`}
                      </div>
                      {cp.goal && <div><span className="font-semibold text-slate-700">Goal:</span> {cp.goal}</div>}
                      {cp.interventions && <div><span className="font-semibold text-slate-700">Interventions:</span> <span className="whitespace-pre-wrap">{cp.interventions}</span></div>}
                      {cp.evaluation && <div><span className="font-semibold text-slate-700">Evaluation:</span> {cp.evaluation}</div>}
                      <div className="text-xs text-slate-500 pt-1">By {cp.createdBy?.firstName || "—"} {cp.createdBy?.lastName || ""} • {formatDate(cp.createdAt, true)}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <NewNursingNoteDialog open={showNewNote} onClose={() => setShowNewNote(false)} onCreated={() => { setShowNewNote(false); invalidate(); }} />
      <NewCarePlanDialog open={showNewCarePlan} onClose={() => setShowNewCarePlan(false)} onCreated={() => { setShowNewCarePlan(false); invalidate(); }} />
    </div>
  );
}

function PatientPicker({ patientId, setPatientId, setEncounterId }: { patientId: string; setPatientId: (id: string) => void; setEncounterId: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const { data } = useQuery({
    queryKey: ["patient-search-nursing", query],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
  });
  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters-nursing", patientId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}`),
    enabled: !!patientId,
  });
  const { data: admissionsData } = useQuery({
    queryKey: ["patient-admissions-nursing", patientId],
    queryFn: () => fetchJson(`/api/admissions?patientId=${patientId}&status=admitted`),
    enabled: !!patientId,
  });

  return (
    <>
      <div>
        <Label>Patient *</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search patient..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPatientId(""); }}
            className="pl-9"
          />
        </div>
        {data?.patients && data.patients.length > 0 && (
          <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
            {data.patients.map((p: any) => (
              <button
                key={p.id}
                onClick={() => { setPatientId(p.id); setQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); setEncounterId(""); }}
                className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0"
              >
                <span className="font-medium">{p.firstName} {p.lastName}</span>
                <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {patientId && (
        <>
          <div>
            <Label>Encounter *</Label>
            <Select value={encountersData?.items?.[0]?.id || ""} onValueChange={setEncounterId}>
              <SelectTrigger><SelectValue placeholder="Select encounter" /></SelectTrigger>
              <SelectContent>
                {(encountersData?.items || []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.encounterNumber} • {e.encounterType} • {formatDate(e.startAt, true)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Admission (optional — select if this note belongs to an inpatient admission)</Label>
            <Select
              value={admissionsData?.items?.[0]?.id || ""}
              onValueChange={(v) => { if (v !== "_none") { setEncounterId(admissionsData?.items?.find((a: any) => a.id === v)?.encounterId || ""); } }}
            >
              <SelectTrigger><SelectValue placeholder="No active admission" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— No active admission —</SelectItem>
                {(admissionsData?.items || []).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.admissionNumber} • Admitted {formatDate(a.admittedAt)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </>
  );
}

function NewNursingNoteDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [admissionId, setAdmissionId] = useState("");
  const [noteType, setNoteType] = useState("assessment");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    if (!encounterId) { toast.error("Please select an encounter"); return; }
    if (!content) { toast.error("Please enter note content"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/nursing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordType: "note", patientId, encounterId, admissionId: admissionId || undefined, noteType, content }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Nursing note created");
      setPatientId(""); setEncounterId(""); setAdmissionId(""); setNoteType("assessment"); setContent("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><NotebookPen className="w-5 h-5 text-emerald-600" /> New Nursing Note</DialogTitle>
          <DialogDescription>Record an assessment, intervention, handover, observation, or wound care note.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <PatientPicker patientId={patientId} setPatientId={setPatientId} setEncounterId={(id) => { setEncounterId(id); setAdmissionId(""); }} />
          <div>
            <Label>Note Type</Label>
            <Select value={noteType} onValueChange={setNoteType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NOTE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Content *</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="Enter the nursing note..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving..." : "Save Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewCarePlanDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [problem, setProblem] = useState("");
  const [goal, setGoal] = useState("");
  const [interventions, setInterventions] = useState("");
  const [evaluation, setEvaluation] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    if (!encounterId) { toast.error("Please select an encounter"); return; }
    if (!problem) { toast.error("Please describe the problem"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/nursing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordType: "care_plan", patientId, encounterId, problem, goal, interventions, evaluation }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Care plan created");
      setPatientId(""); setEncounterId(""); setProblem(""); setGoal(""); setInterventions(""); setEvaluation("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-emerald-600" /> New Care Plan</DialogTitle>
          <DialogDescription>Define the nursing problem, goal, interventions, and evaluation plan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <PatientPicker patientId={patientId} setPatientId={setPatientId} setEncounterId={setEncounterId} />
          <div>
            <Label>Problem *</Label>
            <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={2} placeholder="Nursing problem (e.g. Acute pain related to surgical incision)" />
          </div>
          <div>
            <Label>Goal</Label>
            <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="Expected outcome (e.g. Patient reports pain ≤3/10 within 24h)" />
          </div>
          <div>
            <Label>Interventions</Label>
            <Textarea value={interventions} onChange={(e) => setInterventions(e.target.value)} rows={3} placeholder="One per line" />
          </div>
          <div>
            <Label>Evaluation</Label>
            <Textarea value={evaluation} onChange={(e) => setEvaluation(e.target.value)} rows={2} placeholder="How effectiveness will be evaluated" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving..." : "Save Care Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

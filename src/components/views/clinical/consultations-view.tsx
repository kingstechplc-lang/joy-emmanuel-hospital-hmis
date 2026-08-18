"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, ClipboardList, PenSquare, Save, Check, X, Lock } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate } from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export function ConsultationsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canCreate = user?.roles?.includes("super_admin") || perms.includes("clinical.create");
  const canSign = user?.roles?.includes("super_admin") || perms.includes("clinical.sign");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [viewConsult, setViewConsult] = useState<any | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["consultations", activeFacilityId],
    queryFn: () => fetchJson(`/api/consultations?facilityId=${activeFacilityId}`),
    enabled: !!activeFacilityId,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Consultations</h2>
          <p className="text-sm text-slate-500">Clinical consultation notes. Drafts can be signed once finalized.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New Consultation
          </Button>
        )}
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view consultations.</CardContent></Card>
      )}

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load consultations" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No consultations yet"
              description={canCreate ? "Start a new consultation note for an encounter." : "Consultations can only be created by doctors, specialists, physician assistants, clinical officers, or medical officers."}
              action={canCreate ? <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Consultation</Button> : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.items.map((c: any) => (
            <Card key={c.id} className="hover:shadow-sm cursor-pointer" onClick={() => setViewConsult(c)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {c.patient?.firstName} {c.patient?.lastName} — {c.chiefComplaint || "No chief complaint"}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {c.clinician ? `Dr. ${c.clinician.firstName} ${c.clinician.lastName}` : "Unassigned"} • {c.encounter?.facility?.name || "—"} • {formatDate(c.createdAt, true)}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canCreate && (
        <NewConsultationDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); qc.invalidateQueries({ queryKey: ["consultations"] }); }} defaultFacilityId={activeFacilityId} />
      )}
      {viewConsult && (
        <ViewConsultationDialog consultation={viewConsult} onClose={() => setViewConsult(null)} onChanged={() => {
          setViewConsult(null);
          qc.invalidateQueries({ queryKey: ["consultations"] });
        }} />
      )}
    </div>
  );
}

function NewConsultationDialog({ open, onClose, onCreated, defaultFacilityId }: { open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [form, setForm] = useState({
    chiefComplaint: "", historyPresentingIllness: "", pastMedicalHistory: "",
    pastSurgicalHistory: "", medicationHistory: "", familyHistory: "",
    socialHistory: "", reviewOfSystems: "", physicalExamination: "",
    assessment: "", treatmentPlan: "", followUpPlan: "",
  });
  const [saving, setSaving] = useState(false);

  const setField = (k: string, val: string) => setForm((p) => ({ ...p, [k]: val }));

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });
  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters", patientId, defaultFacilityId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}&facilityId=${defaultFacilityId || ""}`),
    enabled: !!patientId,
  });

  const submit = async () => {
    if (!patientId || !encounterId) {
      toast.error("Please select patient and encounter");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, encounterId, ...form }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Consultation created (draft)");
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setForm({ chiefComplaint: "", historyPresentingIllness: "", pastMedicalHistory: "", pastSurgicalHistory: "", medicationHistory: "", familyHistory: "", socialHistory: "", reviewOfSystems: "", physicalExamination: "", assessment: "", treatmentPlan: "", followUpPlan: "" });
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Consultation Note</DialogTitle>
          <DialogDescription>Will be saved as draft. Sign after completion.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
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
          {patientId && (
            <div>
              <FieldLabel required>Encounter</FieldLabel>
              <Select value={encounterId || undefined} onValueChange={setEncounterId}>
                <SelectTrigger><SelectValue placeholder="Select encounter" /></SelectTrigger>
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

          <Tabs defaultValue="complaint">
            <TabsList className="flex w-max flex-wrap">
              <TabsTrigger value="complaint">Complaint</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="exam">Exam</TabsTrigger>
              <TabsTrigger value="plan">Plan</TabsTrigger>
            </TabsList>
            <TabsContent value="complaint" className="space-y-3 mt-3">
              <Section label="Chief Complaint"><Textarea value={form.chiefComplaint} onChange={(e) => setField("chiefComplaint", e.target.value)} rows={2} /></Section>
              <Section label="History of Presenting Illness (HPI)"><Textarea value={form.historyPresentingIllness} onChange={(e) => setField("historyPresentingIllness", e.target.value)} rows={4} /></Section>
              <Section label="Review of Systems"><Textarea value={form.reviewOfSystems} onChange={(e) => setField("reviewOfSystems", e.target.value)} rows={3} /></Section>
            </TabsContent>
            <TabsContent value="history" className="space-y-3 mt-3">
              <Section label="Past Medical History"><Textarea value={form.pastMedicalHistory} onChange={(e) => setField("pastMedicalHistory", e.target.value)} rows={3} /></Section>
              <Section label="Past Surgical History"><Textarea value={form.pastSurgicalHistory} onChange={(e) => setField("pastSurgicalHistory", e.target.value)} rows={3} /></Section>
              <Section label="Medication History"><Textarea value={form.medicationHistory} onChange={(e) => setField("medicationHistory", e.target.value)} rows={3} /></Section>
              <Section label="Family History"><Textarea value={form.familyHistory} onChange={(e) => setField("familyHistory", e.target.value)} rows={3} /></Section>
              <Section label="Social History"><Textarea value={form.socialHistory} onChange={(e) => setField("socialHistory", e.target.value)} rows={3} /></Section>
            </TabsContent>
            <TabsContent value="exam" className="space-y-3 mt-3">
              <Section label="Physical Examination"><Textarea value={form.physicalExamination} onChange={(e) => setField("physicalExamination", e.target.value)} rows={6} /></Section>
              <Section label="Assessment"><Textarea value={form.assessment} onChange={(e) => setField("assessment", e.target.value)} rows={4} /></Section>
            </TabsContent>
            <TabsContent value="plan" className="space-y-3 mt-3">
              <Section label="Treatment Plan"><Textarea value={form.treatmentPlan} onChange={(e) => setField("treatmentPlan", e.target.value)} rows={4} /></Section>
              <Section label="Follow-up Plan"><Textarea value={form.followUpPlan} onChange={(e) => setField("followUpPlan", e.target.value)} rows={2} /></Section>
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Save className="w-4 h-4 animate-pulse" /> : <ClipboardList className="w-4 h-4" />}
            {saving ? "Saving..." : "Save Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ViewConsultationDialog({ consultation: c, onClose, onChanged }: { consultation: any; onClose: () => void; onChanged: () => void }) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canEdit = user?.roles?.includes("super_admin") || perms.includes("clinical.create") || perms.includes("clinical.edit");
  const canSign = user?.roles?.includes("super_admin") || perms.includes("clinical.sign");
  const canAmend = user?.roles?.includes("super_admin") || perms.includes("clinical.amend");

  const [editable, setEditable] = useState<any>(c);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);

  const sign = async () => {
    setSigning(true);
    try {
      const res = await fetch(`/api/consultations/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to sign");
      }
      toast.success("Consultation signed");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSigning(false);
    }
  };

  const update = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/consultations/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editable),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Consultation updated");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const setField = (k: string, v: string) => setEditable((p: any) => ({ ...p, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" /> Consultation Note
            <StatusBadge status={editable.status} />
          </DialogTitle>
          <DialogDescription>
            {c.patient?.firstName} {c.patient?.lastName} • {c.encounter?.encounterNumber} • Created {formatDate(c.createdAt, true)}
            {c.signedAt && ` • Signed ${formatDate(c.signedAt, true)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Chief Complaint" value={editable.chiefComplaint || ""} onChange={(v) => setField("chiefComplaint", v)} />
          <Field label="HPI" value={editable.historyPresentingIllness || ""} onChange={(v) => setField("historyPresentingIllness", v)} multiline />
          <Field label="Past Medical History" value={editable.pastMedicalHistory || ""} onChange={(v) => setField("pastMedicalHistory", v)} multiline />
          <Field label="Past Surgical History" value={editable.pastSurgicalHistory || ""} onChange={(v) => setField("pastSurgicalHistory", v)} multiline />
          <Field label="Medication History" value={editable.medicationHistory || ""} onChange={(v) => setField("medicationHistory", v)} multiline />
          <Field label="Family History" value={editable.familyHistory || ""} onChange={(v) => setField("familyHistory", v)} multiline />
          <Field label="Social History" value={editable.socialHistory || ""} onChange={(v) => setField("socialHistory", v)} multiline />
          <Field label="Review of Systems" value={editable.reviewOfSystems || ""} onChange={(v) => setField("reviewOfSystems", v)} multiline />
          <Field label="Physical Examination" value={editable.physicalExamination || ""} onChange={(v) => setField("physicalExamination", v)} multiline />
          <Field label="Assessment" value={editable.assessment || ""} onChange={(v) => setField("assessment", v)} multiline />
          <Field label="Treatment Plan" value={editable.treatmentPlan || ""} onChange={(v) => setField("treatmentPlan", v)} multiline />
          <Field label="Follow-up Plan" value={editable.followUpPlan || ""} onChange={(v) => setField("followUpPlan", v)} multiline />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="gap-1"><X className="w-4 h-4" /> Close</Button>
          {editable.status !== "signed" && canEdit && (
            <>
              <Button onClick={update} disabled={saving} variant="outline" className="gap-1">
                <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
              </Button>
              {canSign && (
                <Button onClick={sign} disabled={signing} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                  {signing ? <PenSquare className="w-4 h-4 animate-pulse" /> : <Check className="w-4 h-4" />}
                  {signing ? "Signing..." : "Sign Consultation"}
                </Button>
              )}
            </>
          )}
          {editable.status === "signed" && canAmend && (
            <Button onClick={update} disabled={saving} variant="outline" className="gap-1">
              <PenSquare className="w-4 h-4" /> {saving ? "Saving..." : "Amend Note"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div>
      <Label className="text-xs font-semibold text-slate-700">{label}</Label>
      {multiline ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="mt-1" />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
      )}
    </div>
  );
}

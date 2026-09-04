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
import { Plus, NotebookPen, ClipboardList, Search, Activity, AlertTriangle, Bandage, ArrowRightLeft, ShieldAlert, CheckCircle2, FileText, PenLine } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, formatDate, formatRelative, safeJson, PageHeader, MiniStatCard, ClearableSearch} from "@/components/ui-helpers"
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const NOTE_TYPES = [
  { value: "initial_assessment", label: "Initial Assessment" },
  { value: "assessment", label: "Assessment" },
  { value: "progress", label: "Progress Note" },
  { value: "soap", label: "SOAP Note" },
  { value: "focus_dar", label: "Focus/DAR Note" },
  { value: "shift_note", label: "Shift Note" },
  { value: "narrative", label: "Narrative Note" },
  { value: "observation", label: "Observation" },
  { value: "intervention", label: "Intervention" },
  { value: "wound", label: "Wound Care" },
  { value: "handover", label: "Handover Note" },
  { value: "post_procedure", label: "Post-Procedure" },
  { value: "post_op", label: "Post-Operative" },
  { value: "emergency", label: "Emergency" },
  { value: "discharge", label: "Discharge Note" },
  { value: "transfer", label: "Transfer Note" },
  { value: "incident", label: "Incident Note" },
];

const SHIFTS = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "night", label: "Night" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  submitted: "bg-blue-100 text-blue-700",
  signed: "bg-emerald-100 text-emerald-700",
  amended: "bg-violet-100 text-violet-700",
};

const TASK_TYPES = [
  { value: "vitals", label: "Vital Signs" },
  { value: "medication", label: "Medication" },
  { value: "wound_care", label: "Wound Care" },
  { value: "repositioning", label: "Repositioning" },
  { value: "intake_output", label: "Intake/Output" },
  { value: "patient_education", label: "Patient Education" },
  { value: "monitoring", label: "Monitoring" },
  { value: "specimen_collection", label: "Specimen Collection" },
  { value: "other", label: "Other" },
];

const WOUND_TYPES = [
  { value: "surgical", label: "Surgical" },
  { value: "pressure", label: "Pressure" },
  { value: "diabetic", label: "Diabetic" },
  { value: "venous", label: "Venous" },
  { value: "burn", label: "Burn" },
  { value: "traumatic", label: "Traumatic" },
  { value: "other", label: "Other" },
];

const RISK_TYPES = [
  { value: "fall_risk", label: "Fall Risk" },
  { value: "pressure_injury", label: "Pressure Injury" },
  { value: "other", label: "Other" },
];

export function NursingView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [mainTab, setMainTab] = useState("dashboard");
  const [patientFilter, setPatientFilter] = useState("");
  const [showNewNote, setShowNewNote] = useState(false);
  const [showNewCarePlan, setShowNewCarePlan] = useState(false);
  const [showEscalation, setShowEscalation] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [showWound, setShowWound] = useState(false);
  const [showRisk, setShowRisk] = useState(false);
  const [showHandover, setShowHandover] = useState(false);

  const params = new URLSearchParams();
  params.set("type", "both");
  if (patientFilter) params.set("patientId", patientFilter);
  const qs = `?${params.toString()}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["nursing", patientFilter],
    queryFn: () => fetchJson(`/api/nursing${qs}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["nursing"] });
    qc.invalidateQueries({ queryKey: ["nursing-stats"] });
    qc.invalidateQueries({ queryKey: ["nursing-escalations"] });
    qc.invalidateQueries({ queryKey: ["nursing-tasks"] });
    qc.invalidateQueries({ queryKey: ["nursing-wounds"] });
    qc.invalidateQueries({ queryKey: ["nursing-handovers"] });
  };

  const notes: any[] = data?.notes || [];
  const carePlans: any[] = data?.carePlans || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Nursing Documentation"
        description="Comprehensive nursing clinical documentation — notes, care plans, handovers, escalations, tasks, wound care, and risk assessments"
        icon={NotebookPen}
        gradient="from-teal-500 to-cyan-600"
      />

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5"><Activity className="w-4 h-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5"><NotebookPen className="w-4 h-4" /> Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="care_plans" className="gap-1.5"><ClipboardList className="w-4 h-4" /> Care Plans ({carePlans.length})</TabsTrigger>
          <TabsTrigger value="handovers" className="gap-1.5"><ArrowRightLeft className="w-4 h-4" /> Handovers</TabsTrigger>
          <TabsTrigger value="escalations" className="gap-1.5"><AlertTriangle className="w-4 h-4" /> Escalations</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5"><CheckCircle2 className="w-4 h-4" /> Tasks</TabsTrigger>
          <TabsTrigger value="wounds" className="gap-1.5"><Bandage className="w-4 h-4" /> Wounds</TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5"><Activity className="w-4 h-4" /> Patient Timeline</TabsTrigger>
        </TabsList>

        {/* DASHBOARD TAB */}
        <TabsContent value="dashboard" className="space-y-4">
          <NursingDashboard facilityId={activeFacilityId} />
          {/* Quick Action Buttons */}
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">Quick Actions</div>
              <div className="flex flex-wrap gap-2">
                {can("nursing.note.create") && <Button onClick={() => setShowNewNote(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Note</Button>}
                {can("nursing.care_plan.manage") && <Button onClick={() => setShowNewCarePlan(true)} variant="outline" className="gap-2 border-emerald-300 text-emerald-700"><ClipboardList className="w-4 h-4" /> Care Plan</Button>}
                {can("nursing.handover") && <Button onClick={() => setShowHandover(true)} variant="outline" className="gap-2"><ArrowRightLeft className="w-4 h-4" /> Handover</Button>}
                {can("nursing.escalate") && <Button onClick={() => setShowEscalation(true)} variant="outline" className="gap-2 text-amber-700 border-amber-300"><AlertTriangle className="w-4 h-4" /> Escalate</Button>}
                {can("nursing.task.manage") && <Button onClick={() => setShowTask(true)} variant="outline" className="gap-2"><CheckCircle2 className="w-4 h-4" /> Task</Button>}
                {can("nursing.wound_care") && <Button onClick={() => setShowWound(true)} variant="outline" className="gap-2"><Bandage className="w-4 h-4" /> Wound Care</Button>}
                {can("nursing.risk_assessment") && <Button onClick={() => setShowRisk(true)} variant="outline" className="gap-2"><ShieldAlert className="w-4 h-4" /> Risk Assessment</Button>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NOTES TAB */}
        <TabsContent value="notes" className="space-y-3">
          <Card>
            <CardContent className="p-3 flex flex-wrap gap-2 items-center">
              <Input placeholder="Filter by Patient ID" value={patientFilter} onChange={(e) => setPatientFilter(e.target.value)} className="md:w-80" />
              {can("nursing.note.create") && <Button onClick={() => setShowNewNote(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 ml-auto"><Plus className="w-4 h-4" /> New Note</Button>}
            </CardContent>
          </Card>
          {isLoading ? <LoadingState rows={6} /> : isError ? <ErrorState message="Failed to load notes" onRetry={() => refetch()} /> :
            notes.length === 0 ? <Card><CardContent className="p-6"><EmptyState title="No nursing notes" /></CardContent></Card> : (
              <div className="space-y-2">
                {notes.map((n: any) => (
                  <Card key={n.id}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px] capitalize">{n.noteType?.replace(/_/g, " ") || "note"}</Badge>
                            {n.shift && <Badge variant="outline" className="text-[10px] capitalize">{n.shift}</Badge>}
                            <Badge className={`text-[10px] ${STATUS_COLORS[n.status] || "bg-slate-100 text-slate-700"}`}>{n.status}</Badge>
                            {n.isEscalation && <Badge className="text-[10px] bg-rose-100 text-rose-700">⚠ Escalation</Badge>}
                            <span className="text-sm font-medium text-slate-900">{n.patient?.firstName} {n.patient?.lastName}</span>
                            <span className="text-xs text-slate-500">{n.patient?.patientNumber}</span>
                          </div>
                          {/* SOAP fields if present */}
                          {n.subjective && <div className="text-xs text-slate-600 mt-1"><strong>S:</strong> {n.subjective}</div>}
                          {n.objective && <div className="text-xs text-slate-600"><strong>O:</strong> {n.objective}</div>}
                          {n.assessment && <div className="text-xs text-slate-600"><strong>A:</strong> {n.assessment}</div>}
                          {n.plan && <div className="text-xs text-slate-600"><strong>P:</strong> {n.plan}</div>}
                          {/* Content (always) */}
                          <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{n.content}</p>
                          <div className="mt-2 text-xs text-slate-500">
                            By {n.nurse?.firstName || "—"} {n.nurse?.lastName || ""} • {formatDate(n.createdAt, true)}
                            {n.signedAt && ` • Signed ${formatDate(n.signedAt, true)}`}
                            {n.admission && ` • ${n.admission.admissionNumber}`}
                          </div>
                        </div>
                        {/* Status action buttons */}
                        <div className="flex flex-col gap-1">
                          {n.status === "draft" && can("nursing.note.sign") && (
                            <Button size="sm" variant="ghost" className="h-6 text-xs text-emerald-600" onClick={() => signNote(n.id, invalidate)}>
                              <PenLine className="w-3 h-3" /> Sign
                            </Button>
                          )}
                          {n.status === "signed" && can("nursing.note.amend") && (
                            <Button size="sm" variant="ghost" className="h-6 text-xs text-violet-600" onClick={() => amendNote(n.id, invalidate)}>
                              <FileText className="w-3 h-3" /> Amend
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          }
        </TabsContent>

        {/* CARE PLANS TAB */}
        <TabsContent value="care_plans" className="space-y-3">
          <div className="flex justify-end">
            {can("nursing.care_plan.manage") && <Button onClick={() => setShowNewCarePlan(true)} variant="outline" className="gap-2"><ClipboardList className="w-4 h-4" /> New Care Plan</Button>}
          </div>
          {carePlans.length === 0 ? <Card><CardContent className="p-6"><EmptyState title="No care plans" /></CardContent></Card> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {carePlans.map((cp: any) => (
                <Card key={cp.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-emerald-600" />
                      {cp.problem || "Care Plan"}
                      {cp.status && <Badge className={`text-[10px] ${cp.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{cp.status}</Badge>}
                      {cp.priority && <Badge variant="outline" className="text-[10px]">{cp.priority}</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm pt-0">
                    <div className="text-xs text-slate-500">{cp.patient?.firstName} {cp.patient?.lastName} ({cp.patient?.patientNumber})</div>
                    {cp.nursingDiagnosis && <div><span className="font-semibold">Nursing Dx:</span> {cp.nursingDiagnosis}</div>}
                    {cp.goal && <div><span className="font-semibold">Goal:</span> {cp.goal}</div>}
                    {cp.interventions && <div><span className="font-semibold">Interventions:</span> <span className="whitespace-pre-wrap">{cp.interventions}</span></div>}
                    {cp.expectedOutcome && <div><span className="font-semibold">Expected:</span> {cp.expectedOutcome}</div>}
                    {cp.evaluation && <div><span className="font-semibold">Evaluation:</span> {cp.evaluation}</div>}
                    <div className="text-xs text-slate-500 pt-1">By {cp.createdBy?.firstName || "—"} • {formatDate(cp.createdAt, true)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* HANDOVERS TAB */}
        <TabsContent value="handovers" className="space-y-3">
          <HandoversTab facilityId={activeFacilityId} patientId={patientFilter} canManage={can("nursing.handover")} onShowDialog={() => setShowHandover(true)} onChanged={invalidate} />
        </TabsContent>

        {/* ESCALATIONS TAB */}
        <TabsContent value="escalations" className="space-y-3">
          <EscalationsTab facilityId={activeFacilityId} patientId={patientFilter} canEscalate={can("nursing.escalate")} onShowDialog={() => setShowEscalation(true)} onChanged={invalidate} />
        </TabsContent>

        {/* TASKS TAB */}
        <TabsContent value="tasks" className="space-y-3">
          <TasksTab facilityId={activeFacilityId} patientId={patientFilter} canManage={can("nursing.task.manage")} onShowDialog={() => setShowTask(true)} onChanged={invalidate} />
        </TabsContent>

        {/* WOUNDS TAB */}
        <TabsContent value="wounds" className="space-y-3">
          <WoundsTab facilityId={activeFacilityId} patientId={patientFilter} canManage={can("nursing.wound_care")} onShowDialog={() => setShowWound(true)} onChanged={invalidate} />
        </TabsContent>

        {/* TIMELINE TAB */}
        <TabsContent value="timeline" className="space-y-3">
          <TimelineTab patientId={patientFilter} />
        </TabsContent>
      </Tabs>

      {showNewNote && <NewNursingNoteDialog onClose={() => setShowNewNote(false)} onCreated={() => { setShowNewNote(false); invalidate(); }} />}
      {showNewCarePlan && <NewCarePlanDialog onClose={() => setShowNewCarePlan(false)} onCreated={() => { setShowNewCarePlan(false); invalidate(); }} />}
      {showHandover && <HandoverDialog onClose={() => setShowHandover(false)} onCreated={() => { setShowHandover(false); invalidate(); }} />}
      {showEscalation && <EscalationDialog onClose={() => setShowEscalation(false)} onCreated={() => { setShowEscalation(false); invalidate(); }} />}
      {showTask && <TaskDialog onClose={() => setShowTask(false)} onCreated={() => { setShowTask(false); invalidate(); }} />}
      {showWound && <WoundDialog onClose={() => setShowWound(false)} onCreated={() => { setShowWound(false); invalidate(); }} />}
      {showRisk && <RiskDialog onClose={() => setShowRisk(false)} onCreated={() => { setShowRisk(false); invalidate(); }} />}
    </div>
  );
}

// ============================================================
// Note action helpers
// ============================================================
async function signNote(id: string, onDone: () => void) {
  try {
    const res = await fetch(`/api/nursing/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sign" }) });
    if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
    toast.success("Note signed");
    onDone();
  } catch (e: any) { toast.error(e.message); }
}

async function amendNote(id: string, onDone: () => void) {
  const reason = prompt("Enter amendment reason:");
  if (!reason) return;
  try {
    const res = await fetch(`/api/nursing/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "amend", reason }) });
    if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
    toast.success("Note amended — new version created");
    onDone();
  } catch (e: any) { toast.error(e.message); }
}

// ============================================================
// Nursing Dashboard
// ============================================================
function NursingDashboard({ facilityId }: { facilityId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["nursing-stats", facilityId],
    queryFn: () => fetchJson(`/api/nursing/stats?facilityId=${facilityId || ""}`),
  });
  if (isLoading) return <LoadingState rows={4} />;
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      <MiniStatCard label="Notes Today" value={data.notesToday} icon={NotebookPen} gradient="from-teal-500 to-cyan-600" />
      <MiniStatCard label="Draft Notes" value={data.draftNotes} icon={PenLine} gradient="from-amber-500 to-amber-600" />
      <MiniStatCard label="Signed Notes" value={data.signedNotes} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
      <MiniStatCard label="Active Care Plans" value={data.activeCarePlans} icon={ClipboardList} gradient="from-blue-500 to-blue-600" />
      <MiniStatCard label="Open Escalations" value={data.openEscalations} icon={AlertTriangle} gradient="from-amber-500 to-orange-600" />
      <MiniStatCard label="Critical Esc." value={data.criticalEscalations} icon={ShieldAlert} gradient="from-rose-500 to-rose-600" />
      <MiniStatCard label="Pending Tasks" value={data.pendingTasks} icon={CheckCircle2} gradient="from-amber-500 to-amber-600" />
      <MiniStatCard label="Overdue Tasks" value={data.overdueTasks} icon={AlertTriangle} gradient="from-rose-500 to-rose-600" />
      <MiniStatCard label="Done Today" value={data.completedTasksToday} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
      <MiniStatCard label="Active Handovers" value={data.activeHandovers} icon={ArrowRightLeft} gradient="from-violet-500 to-violet-600" />
      <MiniStatCard label="Open Wounds" value={data.openWounds} icon={Bandage} gradient="from-cyan-500 to-cyan-600" />
      <MiniStatCard label="Risk Reviews Due" value={data.pendingRiskAssessments} icon={ShieldAlert} gradient="from-amber-500 to-amber-600" />
    </div>
  );
}

// ============================================================
// PatientPicker (reused)
// ============================================================
function PatientPicker({ patientId, setPatientId, setEncounterId, setAdmissionId }: { patientId: string; setPatientId: (id: string) => void; setEncounterId: (id: string) => void; setAdmissionId?: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const { data } = useQuery({
    queryKey: ["patient-search-nursing", query],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
  });
  const { data: encountersData } = useQuery({
    queryKey: ["patient-enc-nursing", patientId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}`),
    enabled: !!patientId,
  });
  const { data: admissionsData } = useQuery({
    queryKey: ["patient-adm-nursing", patientId],
    queryFn: () => fetchJson(`/api/admissions?patientId=${patientId}&status=admitted`),
    enabled: !!patientId,
  });
  return (
    <>
      <div>
        <FieldLabel required>Patient</FieldLabel>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <ClearableSearch value={query} onChange={(v) => { setQuery(v); setPatientId(""); }} placeholder="Search patient..." className="" inputClassName="" />
        </div>
        {data?.patients && data.patients.length > 0 && (
          <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
            {data.patients.map((p: any) => (
              <button key={p.id} onClick={() => { setPatientId(p.id); setQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); setEncounterId(""); if (setAdmissionId) setAdmissionId(""); }} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                <span className="font-medium">{p.firstName} {p.lastName}</span>
                <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {patientId && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel required>Encounter</FieldLabel>
            <Select value={encountersData?.items?.[0]?.id || undefined} onValueChange={setEncounterId}>
              <SelectTrigger><SelectValue placeholder="Select encounter" /></SelectTrigger>
              <SelectContent>{(encountersData?.items || []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.encounterNumber} • {e.encounterType}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {setAdmissionId && (
            <div>
              <Label>Admission</Label>
              <Select value={admissionsData?.items?.[0]?.id || ""} onValueChange={(v) => { if (v !== "_none") { setAdmissionId(v); setEncounterId(admissionsData?.items?.find((a: any) => a.id === v)?.encounterId || ""); } }}>
                <SelectTrigger><SelectValue placeholder="No active admission" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {(admissionsData?.items || []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.admissionNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ============================================================
// New Nursing Note Dialog (enhanced with SOAP + shift + noteType)
// ============================================================
function NewNursingNoteDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [admissionId, setAdmissionId] = useState("");
  const [noteType, setNoteType] = useState("soap");
  const [shift, setShift] = useState("morning");
  const [content, setContent] = useState("");
  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [saving, setSaving] = useState(false);
  const isSOAP = noteType === "soap" || noteType === "progress" || noteType === "initial_assessment";

  const submit = async () => {
    if (!patientId) { toast.error("Select a patient"); return; }
    if (!encounterId) { toast.error("Select an encounter"); return; }
    if (!content && !subjective && !objective && !assessment && !plan) { toast.error("Enter at least note content or SOAP fields"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/nursing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordType: "note", patientId, encounterId, admissionId: admissionId || undefined, noteType, shift, content: content || "—", subjective: isSOAP ? subjective || undefined : undefined, objective: isSOAP ? objective || undefined : undefined, assessment: isSOAP ? assessment || undefined : undefined, plan: isSOAP ? plan || undefined : undefined }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Nursing note created (draft)");
      onClose(); onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
          <DialogTitle className="flex items-center gap-2 text-white"><NotebookPen className="w-5 h-5 text-emerald-600" /> New Nursing Note</DialogTitle>
          <DialogDescription className="text-white/80">Note is created as DRAFT. Sign it to make it part of the clinical record.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <PatientPicker patientId={patientId} setPatientId={setPatientId} setEncounterId={setEncounterId} setAdmissionId={setAdmissionId} />
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Note Type</Label>
              <Select value={noteType} onValueChange={setNoteType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{NOTE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label>Shift</Label>
              <Select value={shift} onValueChange={setShift}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SHIFTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          {isSOAP && (
            <div className="space-y-2 border rounded p-3 bg-slate-50">
              <div className="text-xs font-semibold text-slate-600">SOAP Format</div>
              <div><Label>S — Subjective</Label><Textarea value={subjective} onChange={(e) => setSubjective(e.target.value)} rows={2} placeholder="Patient's complaint, history..." /></div>
              <div><Label>O — Objective</Label><Textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={2} placeholder="Examination findings, vitals..." /></div>
              <div><Label>A — Assessment</Label><Textarea value={assessment} onChange={(e) => setAssessment(e.target.value)} rows={2} placeholder="Nursing assessment..." /></div>
              <div><Label>P — Plan</Label><Textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={2} placeholder="Nursing plan..." /></div>
            </div>
          )}
          <div><FieldLabel required={!isSOAP}>Content {isSOAP && "(additional notes)"}</FieldLabel><Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="Enter the nursing note..." /></div>
        </div>
        <DialogFooter className="px-6 py-4 shrink-0 border-t bg-white">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving..." : "Save as Draft"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// New Care Plan Dialog (enhanced)
// ============================================================
function NewCarePlanDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [problem, setProblem] = useState("");
  const [goal, setGoal] = useState("");
  const [interventions, setInterventions] = useState("");
  const [evaluation, setEvaluation] = useState("");
  const [priority, setPriority] = useState("medium");
  const [nursingDiagnosis, setNursingDiagnosis] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!patientId || !encounterId || !problem) { toast.error("Patient, encounter, and problem are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/nursing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordType: "care_plan", patientId, encounterId, problem, goal, interventions, evaluation, priority, nursingDiagnosis, expectedOutcome }) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Care plan created"); onClose(); onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b"><DialogTitle className="flex items-center gap-2 text-white"><ClipboardList className="w-5 h-5 text-emerald-600" /> New Care Plan</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <PatientPicker patientId={patientId} setPatientId={setPatientId} setEncounterId={setEncounterId} />
          <div><FieldLabel required>Problem</FieldLabel><Textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={2} placeholder="e.g., Acute pain related to surgical incision" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
            <div><Label>Nursing Diagnosis</Label><Input value={nursingDiagnosis} onChange={(e) => setNursingDiagnosis(e.target.value)} placeholder="e.g., Acute Pain" /></div>
          </div>
          <div><Label>Goal</Label><Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} /></div>
          <div><Label>Expected Outcome</Label><Input value={expectedOutcome} onChange={(e) => setExpectedOutcome(e.target.value)} /></div>
          <div><Label>Interventions</Label><Textarea value={interventions} onChange={(e) => setInterventions(e.target.value)} rows={3} /></div>
          <div><Label>Evaluation</Label><Textarea value={evaluation} onChange={(e) => setEvaluation(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter className="px-6 py-4 shrink-0 border-t bg-white"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving..." : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Handover Dialog
// ============================================================
function HandoverDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [shiftType, setShiftType] = useState("morning");
  const [currentCondition, setCurrentCondition] = useState("");
  const [background, setBackground] = useState("");
  const [medicationsDue, setMedicationsDue] = useState("");
  const [pendingTasks, setPendingTasks] = useState("");
  const [safetyConcerns, setSafetyConcerns] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!patientId) { toast.error("Select a patient"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/nursing/handovers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId, encounterId, shiftType, currentCondition, background, medicationsDue, pendingTasks, safetyConcerns }) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Handover created"); onClose(); onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
      <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b"><DialogTitle className="flex items-center gap-2 text-white"><ArrowRightLeft className="w-5 h-5 text-emerald-600" /> Nursing Handover</DialogTitle><DialogDescription className="text-white/80">SBAR-format patient handover</DialogDescription></DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        <PatientPicker patientId={patientId} setPatientId={setPatientId} setEncounterId={setEncounterId} />
        <div><Label>Shift</Label><Select value={shiftType} onValueChange={setShiftType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SHIFTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Current Condition</Label><Textarea value={currentCondition} onChange={(e) => setCurrentCondition(e.target.value)} rows={2} /></div>
        <div><Label>Background</Label><Textarea value={background} onChange={(e) => setBackground(e.target.value)} rows={2} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Medications Due</Label><Textarea value={medicationsDue} onChange={(e) => setMedicationsDue(e.target.value)} rows={2} /></div>
          <div><Label>Pending Tasks</Label><Textarea value={pendingTasks} onChange={(e) => setPendingTasks(e.target.value)} rows={2} /></div>
        </div>
        <div><Label>Safety Concerns</Label><Textarea value={safetyConcerns} onChange={(e) => setSafetyConcerns(e.target.value)} rows={2} /></div>
      </div>
      <DialogFooter className="px-6 py-4 shrink-0 border-t bg-white"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving..." : "Create Handover"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// ============================================================
// Escalation Dialog
// ============================================================
function EscalationDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [concern, setConcern] = useState("");
  const [priority, setPriority] = useState("routine");
  const [escalatedTo, setEscalatedTo] = useState("doctor");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!patientId || !concern) { toast.error("Patient and concern are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/nursing/escalations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId, encounterId, concern, priority, escalatedTo, notes }) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Escalation created"); onClose(); onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md">
      <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle className="flex items-center gap-2 text-white"><AlertTriangle className="w-5 h-5 text-amber-600" /> Escalate Concern</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <PatientPicker patientId={patientId} setPatientId={setPatientId} setEncounterId={setEncounterId} />
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="routine">Routine</SelectItem><SelectItem value="urgent">Urgent</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
          <div><Label>Escalate To</Label><Select value={escalatedTo} onValueChange={setEscalatedTo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="doctor">Doctor</SelectItem><SelectItem value="specialist">Specialist</SelectItem><SelectItem value="nurse_in_charge">Nurse-in-Charge</SelectItem><SelectItem value="emergency_team">Emergency Team</SelectItem></SelectContent></Select></div>
        </div>
        <div><FieldLabel required>Concern</FieldLabel><Textarea value={concern} onChange={(e) => setConcern(e.target.value)} rows={3} placeholder="Describe the clinical concern..." /></div>
        <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={saving} className={`gap-2 ${priority === "critical" ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"}`}>{saving ? "Saving..." : "Escalate"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// ============================================================
// Task Dialog
// ============================================================
function TaskDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [taskType, setTaskType] = useState("vitals");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState(new Date().toISOString().slice(0, 16));
  const [frequency, setFrequency] = useState("once");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!patientId || !title || !dueAt) { toast.error("Patient, title, and due time are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/nursing/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId, encounterId, taskType, title, description, dueAt, frequency }) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Task created"); onClose(); onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md">
      <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle className="flex items-center gap-2 text-white"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> New Nursing Task</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <PatientPicker patientId={patientId} setPatientId={setPatientId} setEncounterId={setEncounterId} />
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Task Type</Label><Select value={taskType} onValueChange={setTaskType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TASK_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Frequency</Label><Select value={frequency} onValueChange={setFrequency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="once">Once</SelectItem><SelectItem value="every_4h">Every 4h</SelectItem><SelectItem value="every_8h">Every 8h</SelectItem><SelectItem value="daily">Daily</SelectItem><SelectItem value="prn">PRN</SelectItem></SelectContent></Select></div>
        </div>
        <div><FieldLabel required>Title</FieldLabel><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Record vital signs" /></div>
        <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div><FieldLabel required>Due At</FieldLabel><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving..." : "Create Task"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// ============================================================
// Wound Dialog
// ============================================================
function WoundDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [woundLocation, setWoundLocation] = useState("");
  const [woundType, setWoundType] = useState("surgical");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [stage, setStage] = useState("");
  const [appearance, setAppearance] = useState("");
  const [exudateType, setExudateType] = useState("");
  const [dressingType, setDressingType] = useState("");
  const [treatmentGiven, setTreatmentGiven] = useState("");
  const [painScore, setPainScore] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!patientId || !woundLocation) { toast.error("Patient and wound location are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/nursing/wounds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId, encounterId, woundLocation, woundType, length: length ? Number(length) : undefined, width: width ? Number(width) : undefined, depth: depth ? Number(depth) : undefined, stage, appearance, exudateType, dressingType, treatmentGiven, painScore: painScore ? Number(painScore) : undefined, notes }) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Wound assessment created"); onClose(); onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
      <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b"><DialogTitle className="flex items-center gap-2 text-white"><Bandage className="w-5 h-5 text-emerald-600" /> Wound Assessment</DialogTitle></DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        <PatientPicker patientId={patientId} setPatientId={setPatientId} setEncounterId={setEncounterId} />
        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel required>Location</FieldLabel><Input value={woundLocation} onChange={(e) => setWoundLocation(e.target.value)} placeholder="e.g., Right heel" /></div>
          <div><Label>Wound Type</Label><Select value={woundType} onValueChange={setWoundType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{WOUND_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Length (cm)</Label><Input type="number" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} /></div>
          <div><Label>Width (cm)</Label><Input type="number" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} /></div>
          <div><Label>Depth (cm)</Label><Input type="number" step="0.1" value={depth} onChange={(e) => setDepth(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Stage</Label><Select value={stage || undefined} onValueChange={setStage}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectItem value="stage_1">Stage 1</SelectItem><SelectItem value="stage_2">Stage 2</SelectItem><SelectItem value="stage_3">Stage 3</SelectItem><SelectItem value="stage_4">Stage 4</SelectItem><SelectItem value="unstageable">Unstageable</SelectItem><SelectItem value="partial">Partial</SelectItem><SelectItem value="full">Full</SelectItem></SelectContent></Select></div>
          <div><Label>Appearance</Label><Select value={appearance || undefined} onValueChange={setAppearance}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectItem value="healthy">Healthy</SelectItem><SelectItem value="granulating">Granulating</SelectItem><SelectItem value="sloughy">Sloughy</SelectItem><SelectItem value="necrotic">Necrotic</SelectItem><SelectItem value="infected">Infected</SelectItem></SelectContent></Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Exudate</Label><Select value={exudateType || undefined} onValueChange={setExudateType}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="serous">Serous</SelectItem><SelectItem value="sanguineous">Sanguineous</SelectItem><SelectItem value="purulent">Purulent</SelectItem></SelectContent></Select></div>
          <div><Label>Pain Score (0-10)</Label><Input type="number" min="0" max="10" value={painScore} onChange={(e) => setPainScore(e.target.value)} /></div>
        </div>
        <div><Label>Dressing Type</Label><Input value={dressingType} onChange={(e) => setDressingType(e.target.value)} placeholder="e.g., Hydrocolloid" /></div>
        <div><Label>Treatment Given</Label><Textarea value={treatmentGiven} onChange={(e) => setTreatmentGiven(e.target.value)} rows={2} /></div>
        <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
      </div>
      <DialogFooter className="px-6 py-4 shrink-0 border-t bg-white"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving..." : "Save Assessment"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// ============================================================
// Risk Assessment Dialog
// ============================================================
function RiskDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [assessmentType, setAssessmentType] = useState("fall_risk");
  const [riskLevel, setRiskLevel] = useState("low");
  const [riskScore, setRiskScore] = useState("");
  const [riskFactors, setRiskFactors] = useState("");
  const [preventionPlan, setPreventionPlan] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!patientId || !assessmentType) { toast.error("Patient and assessment type are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/nursing/risk-assessments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId, encounterId, assessmentType, riskLevel, riskScore: riskScore ? Number(riskScore) : undefined, riskFactors, preventionPlan, notes }) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Risk assessment created"); onClose(); onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md">
      <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle className="flex items-center gap-2 text-white"><ShieldAlert className="w-5 h-5 text-amber-600" /> Risk Assessment</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <PatientPicker patientId={patientId} setPatientId={setPatientId} setEncounterId={setEncounterId} />
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Assessment Type</Label><Select value={assessmentType} onValueChange={setAssessmentType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RISK_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Risk Level</Label><Select value={riskLevel} onValueChange={setRiskLevel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="moderate">Moderate</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="severe">Severe</SelectItem></SelectContent></Select></div>
        </div>
        <div><Label>Risk Score</Label><Input type="number" value={riskScore} onChange={(e) => setRiskScore(e.target.value)} /></div>
        <div><Label>Risk Factors</Label><Textarea value={riskFactors} onChange={(e) => setRiskFactors(e.target.value)} rows={2} placeholder="Identified risk factors..." /></div>
        <div><Label>Prevention Plan</Label><Textarea value={preventionPlan} onChange={(e) => setPreventionPlan(e.target.value)} rows={2} /></div>
        <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={saving} className="gap-2 bg-amber-600 hover:bg-amber-700">{saving ? "Saving..." : "Save Assessment"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// ============================================================
// Sub-tabs: Handovers, Escalations, Tasks, Wounds
// ============================================================
function HandoversTab({ facilityId, patientId, canManage, onShowDialog, onChanged }: any) {
  const { data, isLoading } = useQuery({ queryKey: ["nursing-handovers", patientId], queryFn: () => fetchJson(`/api/nursing/handovers?patientId=${patientId || ""}`) });
  const items = data?.items || [];
  return (
    <div className="space-y-3">
      {canManage && <div className="flex justify-end"><Button onClick={onShowDialog} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Handover</Button></div>}
      {isLoading ? <LoadingState rows={3} /> : items.length === 0 ? <EmptyState title="No handovers" /> : items.map((h: any) => (
        <Card key={h.id}><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Badge variant="outline" className="capitalize">{h.shiftType}</Badge><Badge className={`text-[10px] ${h.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{h.status}</Badge></div>
          {h.currentCondition && <div className="text-sm"><strong>Condition:</strong> {h.currentCondition}</div>}
          {h.background && <div className="text-sm"><strong>Background:</strong> {h.background}</div>}
          {h.medicationsDue && <div className="text-sm"><strong>Meds Due:</strong> {h.medicationsDue}</div>}
          {h.pendingTasks && <div className="text-sm"><strong>Pending:</strong> {h.pendingTasks}</div>}
          {h.safetyConcerns && <div className="text-sm text-amber-700"><strong>Safety:</strong> {h.safetyConcerns}</div>}
          <div className="text-xs text-slate-500 mt-1">{formatDate(h.handoverDate, true)}</div>
        </CardContent></Card>
      ))}
    </div>
  );
}

function EscalationsTab({ facilityId, patientId, canEscalate, onShowDialog, onChanged }: any) {
  const { data, isLoading } = useQuery({ queryKey: ["nursing-escalations", patientId], queryFn: () => fetchJson(`/api/nursing/escalations?patientId=${patientId || ""}`) });
  const items = data?.items || [];

  const escalateAction = async (id: string, action: string) => {
    let body: any = { action };
    if (action === "respond") {
      const response = prompt("Enter response:");
      if (!response) return;
      body.response = response;
    } else if (action === "resolve") {
      const resolution = prompt("Enter resolution:");
      if (!resolution) return;
      body.resolution = resolution;
    }
    try {
      const res = await fetch(`/api/nursing/escalations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success(`Escalation ${action === "acknowledge" ? "acknowledged" : action === "respond" ? "responded to" : "resolved"}`);
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-3">
      {canEscalate && <div className="flex justify-end"><Button onClick={onShowDialog} className="gap-2 bg-amber-600 hover:bg-amber-700"><AlertTriangle className="w-4 h-4" /> Escalate</Button></div>}
      {isLoading ? <LoadingState rows={3} /> : items.length === 0 ? <EmptyState title="No escalations" /> : items.map((e: any) => (
        <Card key={e.id}><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge className={`text-[10px] ${e.priority === "critical" ? "bg-rose-100 text-rose-700" : e.priority === "urgent" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>{e.priority}</Badge>
            <Badge className={`text-[10px] ${e.status === "resolved" ? "bg-emerald-100 text-emerald-700" : e.status === "open" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{e.status}</Badge>
            <span className="text-xs text-slate-500">→ {e.escalatedTo}</span>
          </div>
          <div className="text-sm font-medium">{e.concern}</div>
          {e.response && <div className="text-sm text-slate-600 mt-1"><strong>Response:</strong> {e.response}</div>}
          {e.resolution && <div className="text-sm text-emerald-700 mt-1"><strong>Resolution:</strong> {e.resolution}</div>}
          <div className="text-xs text-slate-500 mt-1">{formatDate(e.escalatedAt, true)}</div>
          {/* Inline action buttons */}
          {e.status !== "resolved" && (
            <div className="flex gap-1 mt-2">
              {e.status === "open" && <Button size="sm" variant="ghost" className="h-6 text-xs text-blue-600" onClick={() => escalateAction(e.id, "acknowledge")}>Acknowledge</Button>}
              {e.status !== "open" && <Button size="sm" variant="ghost" className="h-6 text-xs text-amber-600" onClick={() => escalateAction(e.id, "respond")}>Respond</Button>}
              <Button size="sm" variant="ghost" className="h-6 text-xs text-emerald-600" onClick={() => escalateAction(e.id, "resolve")}>Resolve</Button>
            </div>
          )}
        </CardContent></Card>
      ))}
    </div>
  );
}

function TasksTab({ facilityId, patientId, canManage, onShowDialog, onChanged }: any) {
  const { data, isLoading } = useQuery({ queryKey: ["nursing-tasks", patientId], queryFn: () => fetchJson(`/api/nursing/tasks?patientId=${patientId || ""}`) });
  const items = data?.items || [];
  const now = new Date();

  const taskAction = async (id: string, action: string) => {
    let body: any = { action };
    if (action === "complete") {
      const notes = prompt("Completion notes (optional):");
      if (notes === null) return;
      body.completionNotes = notes || undefined;
    }
    try {
      const res = await fetch(`/api/nursing/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success(`Task ${action}d`);
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-3">
      {canManage && <div className="flex justify-end"><Button onClick={onShowDialog} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Task</Button></div>}
      {isLoading ? <LoadingState rows={3} /> : items.length === 0 ? <EmptyState title="No tasks" /> : (
        <Card><CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b sticky top-0"><tr>
                <th className="text-left p-2 font-semibold text-slate-700">Task</th>
                <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                <th className="text-left p-2 font-semibold text-slate-700">Due</th>
                <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                {canManage && <th className="text-right p-2 font-semibold text-slate-700">Actions</th>}
              </tr></thead>
              <tbody>
                {items.map((t: any) => {
                  const overdue = t.status === "pending" && new Date(t.dueAt) < now;
                  return (
                    <tr key={t.id} className="border-b hover:bg-slate-50">
                      <td className="p-2"><div className="font-medium text-slate-900">{t.title}</div>{t.description && <div className="text-xs text-slate-500">{t.description}</div>}</td>
                      <td className="p-2 capitalize text-xs">{t.taskType?.replace(/_/g, " ")}</td>
                      <td className={`p-2 text-xs ${overdue ? "text-rose-600 font-medium" : "text-slate-600"}`}>{formatDate(t.dueAt, true)}{overdue ? " ⚠" : ""}{t.frequency && <div className="text-[10px] text-slate-400">{t.frequency}</div>}</td>
                      <td className="p-2"><Badge className={`text-[10px] ${t.status === "completed" ? "bg-emerald-100 text-emerald-700" : overdue ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{t.status}</Badge></td>
                      {canManage && (
                        <td className="p-2 text-right">
                          {t.status === "pending" || t.status === "due" ? (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-6 text-xs text-emerald-600" onClick={() => taskAction(t.id, "complete")}><CheckCircle2 className="w-3 h-3" /> Complete</Button>
                              <Button size="sm" variant="ghost" className="h-6 text-xs text-rose-600" onClick={() => taskAction(t.id, "cancel")}>Cancel</Button>
                            </div>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}

function WoundsTab({ facilityId, patientId, canManage, onShowDialog, onChanged }: any) {
  const { data, isLoading } = useQuery({ queryKey: ["nursing-wounds", patientId], queryFn: () => fetchJson(`/api/nursing/wounds?patientId=${patientId || ""}`) });
  const items = data?.items || [];
  return (
    <div className="space-y-3">
      {canManage && <div className="flex justify-end"><Button onClick={onShowDialog} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Assessment</Button></div>}
      {isLoading ? <LoadingState rows={3} /> : items.length === 0 ? <EmptyState title="No wound assessments" /> : items.map((w: any) => (
        <Card key={w.id}><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Badge variant="outline">{w.woundType}</Badge>{w.stage && <Badge className="text-[10px] bg-violet-100 text-violet-700">{w.stage.replace(/_/g, " ")}</Badge>}{w.appearance && <Badge className="text-[10px] bg-slate-100 text-slate-700">{w.appearance}</Badge>}</div>
          <div className="text-sm"><strong>Location:</strong> {w.woundLocation}</div>
          {(w.length || w.width || w.depth) && <div className="text-xs text-slate-600">Dimensions: {w.length}×{w.width}×{w.depth} cm</div>}
          {w.dressingType && <div className="text-xs"><strong>Dressing:</strong> {w.dressingType}</div>}
          {w.treatmentGiven && <div className="text-xs"><strong>Treatment:</strong> {w.treatmentGiven}</div>}
          {w.painScore != null && <div className="text-xs">Pain: {w.painScore}/10</div>}
          <div className="text-xs text-slate-500 mt-1">{formatDate(w.assessedAt, true)}</div>
        </CardContent></Card>
      ))}
    </div>
  );
}

// ============================================================
// Patient Timeline Tab — unified chronological nursing view
// ============================================================
function TimelineTab({ patientId }: { patientId: string }) {
  const [searchPatient, setSearchPatient] = useState("");
  const [resolvedPatientId, setResolvedPatientId] = useState(patientId || "");

  const { data: patientData } = useQuery({
    queryKey: ["patient-search-timeline", searchPatient],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(searchPatient)}`),
    enabled: searchPatient.length >= 2,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["nursing-timeline", resolvedPatientId],
    queryFn: () => fetchJson(`/api/nursing/timeline?patientId=${resolvedPatientId}`),
    enabled: !!resolvedPatientId,
  });

  const timeline: any[] = data?.timeline || [];
  const counts = data?.counts;

  const iconMap: Record<string, string> = {
    nursing_note: "📝", care_plan: "📋", handover: "🔄", escalation: "⚠️",
    task: "✅", wound: "🩹", risk_assessment: "🛡️", intervention: "💉",
    vitals: "📊", intake_output: "💧",
  };
  const colorMap: Record<string, string> = {
    nursing_note: "border-l-emerald-400", care_plan: "border-l-blue-400", handover: "border-l-violet-400",
    escalation: "border-l-rose-400", task: "border-l-amber-400", wound: "border-l-cyan-400",
    risk_assessment: "border-l-orange-400", intervention: "border-l-teal-400",
    vitals: "border-l-indigo-400", intake_output: "border-l-sky-400",
  };

  return (
    <div className="space-y-3">
      {/* Patient search */}
      <Card><CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
            <ClearableSearch value={searchPatient} onChange={(v) => { setSearchPatient(v); setResolvedPatientId(""); }} placeholder="Search patient for timeline..." className="flex-1" inputClassName="" />
        </div>
        {patientData?.patients && patientData.patients.length > 0 && (
          <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
            {patientData.patients.map((p: any) => (
              <button key={p.id} onClick={() => { setResolvedPatientId(p.id); setSearchPatient(`${p.firstName} ${p.lastName} (${p.patientNumber})`); }} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                <span className="font-medium">{p.firstName} {p.lastName}</span>
                <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent></Card>

      {/* Counts summary */}
      {counts && (
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(counts).filter(([, v]: [string, any]) => v > 0).map(([k, v]: [string, any]) => (
            <Badge key={k} variant="outline" className="capitalize">{k.replace(/_/g, " ")}: {v}</Badge>
          ))}
        </div>
      )}

      {/* Timeline */}
      {!resolvedPatientId ? (
        <Card><CardContent className="p-6"><EmptyState title="Select a patient" description="Search for a patient to view their unified nursing timeline." /></CardContent></Card>
      ) : isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load timeline" onRetry={() => refetch()} />
      ) : timeline.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No nursing events" description="No nursing documentation found for this patient." /></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {timeline.map((entry: any, i: number) => (
            <div key={i} className={`border-l-4 ${colorMap[entry.type] || "border-l-slate-300"} bg-white border border-slate-200 rounded-r-lg p-3 shadow-sm`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-700 capitalize">{iconMap[entry.type]} {entry.type.replace(/_/g, " ")}</span>
                    {entry.status && <Badge className={`text-[10px] ${entry.status === "signed" ? "bg-emerald-100 text-emerald-700" : entry.status === "active" ? "bg-emerald-100 text-emerald-700" : entry.status === "resolved" ? "bg-emerald-100 text-emerald-700" : entry.status === "completed" ? "bg-emerald-100 text-emerald-700" : entry.status === "open" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{entry.status}</Badge>}
                  </div>
                  <div className="text-sm text-slate-900 mt-1">{entry.summary}</div>
                  {entry.detail && <div className="text-xs text-slate-600 mt-0.5">{entry.detail}</div>}
                </div>
                <div className="text-[10px] text-slate-400 whitespace-nowrap">{formatDate(entry.date, true)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

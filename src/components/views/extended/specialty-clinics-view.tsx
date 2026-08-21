"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Stethoscope, Plus, Search, RefreshCcw, Eye, AlertCircle, Activity,
  Heart, Eye as EyeIcon, Ear, Brain, Bone, Pill, Baby, Syringe, User,
  CheckCircle2, Clock, ArrowRight, Calendar, FileText, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative,
  safeJson, PageHeader, MiniStatCard,
} from "@/components/ui-helpers";
import { DataTable } from "@/components/ui/data-table";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

const SPECIALTIES = [
  { code: "DENTAL", label: "Dental", icon: User, gradient: "from-blue-500 to-blue-600" },
  { code: "OPHTH", label: "Ophthalmology", icon: EyeIcon, gradient: "from-cyan-500 to-cyan-600" },
  { code: "ENT", label: "ENT", icon: Ear, gradient: "from-purple-500 to-purple-600" },
  { code: "PHYSIO", label: "Physiotherapy", icon: Activity, gradient: "from-teal-500 to-teal-600" },
  { code: "PSYCH", label: "Psychiatry", icon: Brain, gradient: "from-violet-500 to-purple-600" },
  { code: "DERM", label: "Dermatology", icon: User, gradient: "from-amber-500 to-orange-600" },
  { code: "CARDIO", label: "Cardiology", icon: Heart, gradient: "from-rose-500 to-red-600" },
  { code: "NEURO", label: "Neurology", icon: Brain, gradient: "from-indigo-500 to-blue-600" },
  { code: "ORTHO", label: "Orthopaedics", icon: Bone, gradient: "from-slate-500 to-slate-700" },
  { code: "URO", label: "Urology", icon: Pill, gradient: "from-emerald-500 to-teal-600" },
  { code: "ENDO", label: "Endocrinology", icon: Activity, gradient: "from-pink-500 to-rose-600" },
  { code: "PAED", label: "Paediatrics", icon: Baby, gradient: "from-amber-500 to-orange-600" },
];

export function SpecialtyClinicsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canManage = can("specialty.manage");
  const canView = can("specialty.view");
  const [activeTab, setActiveTab] = useState("dashboard");

  if (!canView) {
    return (
      <Card><CardContent className="p-12 text-center">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
        <p className="text-sm text-slate-500">You don&apos;t have permission to access Specialty Clinics.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4 fade-in-up">
      <PageHeader
        title="Specialty Clinics"
        description="Multi-specialty clinical encounters — Dental, Eye, ENT, Cardiology, Neurology, Orthopaedics, Dermatology, Psychiatry, and more"
        icon={Stethoscope}
        gradient="from-purple-500 to-purple-600"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto gap-1 p-1 bg-slate-100 rounded-lg tabs-scroll">
          <TabsTrigger value="dashboard" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Dashboard</TabsTrigger>
          <TabsTrigger value="encounters" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Encounters</TabsTrigger>
          <TabsTrigger value="new" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">New Encounter</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4"><DashboardTab /></TabsContent>
        <TabsContent value="encounters" className="mt-4"><EncountersTab canManage={canManage} /></TabsContent>
        <TabsContent value="new" className="mt-4"><NewEncounterTab canManage={canManage} /></TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["specialty-dashboard"],
    queryFn: () => fetchJson("/api/specialty?limit=500"),
    staleTime: 0,
  });
  const encounters: any[] = data?.items || [];

  const inProgress = encounters.filter((e) => e.status === "in_progress");
  const completed = encounters.filter((e) => e.status === "completed");
  const today = encounters.filter((e) => {
    const d = new Date(e.startTime);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  // By specialty
  const bySpecialty = SPECIALTIES.map((s) => ({
    ...s,
    total: encounters.filter((e) => e.departmentCode === s.code).length,
    today: today.filter((e) => e.departmentCode === s.code).length,
    active: inProgress.filter((e) => e.departmentCode === s.code).length,
  })).filter((s) => s.total > 0);

  return (
    <div className="space-y-4">
      {isLoading ? <LoadingState rows={4} /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStatCard label="Total Encounters" value={encounters.length} icon={Stethoscope} gradient="from-purple-500 to-purple-600" />
            <MiniStatCard label="Today" value={today.length} icon={Calendar} gradient="from-blue-500 to-blue-600" />
            <MiniStatCard label="In Progress" value={inProgress.length} icon={Clock} gradient="from-amber-500 to-orange-600" />
            <MiniStatCard label="Completed" value={completed.length} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
          </div>

          {/* Specialty breakdown */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-4 rounded-full bg-gradient-to-b from-purple-500 to-purple-600" />
                Encounters by Specialty
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {bySpecialty.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">No encounters yet</p> :
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {bySpecialty.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.code} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${s.gradient} text-white p-3 shadow-md card-hover-lift`}>
                      <Icon className="absolute top-2 right-2 w-6 h-6 text-white/20" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">{s.label}</p>
                      <p className="text-2xl font-extrabold">{s.total}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-white/70">
                        <span>Today: {s.today}</span>
                        {s.active > 0 && <span className="text-amber-200">● {s.active} active</span>}
                      </div>
                    </div>
                  );
                })}
              </div>}
            </CardContent>
          </Card>

          {/* Recent encounters */}
          {encounters.length > 0 && (
            <Card className="shadow-sm border-slate-200 overflow-hidden">
              <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-2 h-4 rounded-full bg-gradient-to-b from-purple-500 to-purple-600" />
                  Recent Encounters
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  headers={["Encounter #", "Patient", "Specialty", "Chief Complaint", "Diagnosis", "Status", "Date"]}
                  rows={encounters.slice(0, 10).map((e) => {
                    const sp = SPECIALTIES.find((s) => s.code === e.departmentCode) || SPECIALTIES[0];
                    return {
                      cells: [
                        <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-purple-500 to-purple-600 px-2 py-0.5 rounded-md font-semibold">{e.encounterNumber}</span>,
                        <span key="p" className="text-sm font-medium text-slate-900">{e.patientName}</span>,
                        <span key="s" className="text-xs text-slate-600">{sp.label}</span>,
                        <span key="c" className="text-xs text-slate-500 max-w-[150px] truncate inline-block">{e.chiefComplaint}</span>,
                        <span key="d" className="text-xs text-slate-500 max-w-[150px] truncate inline-block">{e.diagnosis || "—"}</span>,
                        <StatusBadge key="st" status={e.status} />,
                        <span key="dt" className="text-xs text-slate-500">{formatDate(e.startTime)}</span>,
                      ],
                      sortValues: [e.encounterNumber, e.patientName, sp.label, e.chiefComplaint, e.diagnosis || "", e.status, e.startTime],
                    };
                  })}
                  gradient="from-purple-500 to-purple-600"
                  pageSize={10}
                  sortable={false}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// =====================================================================
// ENCOUNTERS TAB
// =====================================================================
function EncountersTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewEncounter, setViewEncounter] = useState<any>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (specialtyFilter !== "all") params.set("departmentCode", specialtyFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["specialty-encounters", params.toString()],
    queryFn: () => fetchJson(`/api/specialty?${params.toString()}`),
    staleTime: 0,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/specialty/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => { toast.success("Encounter updated"); setViewEncounter(null); qc.invalidateQueries({ queryKey: ["specialty-encounters"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <Input placeholder="Search by patient, complaint, diagnosis..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Specialties</SelectItem>{SPECIALTIES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }} disabled={isFetching}>
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={5} /> :
       items.length === 0 ? <EmptyState title="No encounters" description="Create a new specialty encounter to get started." icon={Stethoscope} /> :
       <DataTable
         headers={["Encounter #", "Patient", "Specialty", "Type", "Chief Complaint", "Clinician", "Status", "Date", "Actions"]}
         rows={items.map((e) => {
           const sp = SPECIALTIES.find((s) => s.code === e.departmentCode) || SPECIALTIES[0];
           return {
             cells: [
               <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-purple-500 to-purple-600 px-2 py-0.5 rounded-md font-semibold">{e.encounterNumber}</span>,
               <span key="p" className="text-sm font-medium text-slate-900">{e.patientName}</span>,
               <span key="s" className="text-xs text-slate-600">{sp.label}</span>,
               <span key="ct" className="text-xs text-slate-500 capitalize">{(e.clinicType || "new").replace(/_/g, " ")}</span>,
               <span key="c" className="text-xs text-slate-500 max-w-[150px] truncate inline-block">{e.chiefComplaint}</span>,
               <span key="cl" className="text-xs text-slate-600">{e.clinicianName || "—"}</span>,
               <StatusBadge key="st" status={e.status} />,
               <span key="d" className="text-xs text-slate-500">{formatRelative(e.startTime)}</span>,
               <Button key="a" variant="ghost" size="sm" onClick={() => setViewEncounter(e)}><Eye className="w-4 h-4" /></Button>,
             ],
             sortValues: [e.encounterNumber, e.patientName, sp.label, e.clinicType || "", e.chiefComplaint, e.clinicianName || "", e.status, e.startTime, ""],
             onClick: () => setViewEncounter(e),
           };
         })}
         gradient="from-purple-500 to-purple-600"
         pageSize={10}
       />}

      {viewEncounter && (
        <EncounterDetail
          encounter={viewEncounter}
          canManage={canManage}
          onClose={() => setViewEncounter(null)}
          onUpdate={(id, data) => updateMutation.mutate({ id, data })}
          loading={updateMutation.isPending}
        />
      )}
    </div>
  );
}

// =====================================================================
// ENCOUNTER DETAIL — with specialty-specific form fields
// =====================================================================
function EncounterDetail({ encounter, canManage, onClose, onUpdate, loading }: {
  encounter: any; canManage: boolean; onClose: () => void; onUpdate: (id: string, data: any) => void; loading: boolean;
}) {
  const sp = SPECIALTIES.find((s) => s.code === encounter.departmentCode) || SPECIALTIES[0];
  const [form, setForm] = useState({
    chiefComplaint: encounter.chiefComplaint || "",
    history: encounter.history || "",
    examination: encounter.examination || "",
    diagnosis: encounter.diagnosis || "",
    treatmentPlan: encounter.treatmentPlan || "",
    procedureDone: encounter.procedureDone || "",
    prescription: encounter.prescription || "",
    followUpDate: encounter.followUpDate ? new Date(encounter.followUpDate).toISOString().slice(0, 10) : "",
    status: encounter.status || "in_progress",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  // Specialty-specific fields
  const specialtyFields: Record<string, { label: string; key: string; placeholder: string }[]> = {
    CARDIO: [
      { label: "Chest Pain", key: "history", placeholder: "Onset, duration, character, radiation..." },
      { label: "Cardiovascular Exam", key: "examination", placeholder: "Heart sounds, murmurs, JVP, pulses..." },
    ],
    DERM: [
      { label: "Skin Lesion Description", key: "examination", placeholder: "Location, size, color, morphology..." },
      { label: "Duration & Symptoms", key: "history", placeholder: "Itching, pain, progression..." },
    ],
    OPHTH: [
      { label: "Visual Acuity", key: "history", placeholder: "Right: 6/_, Left: 6/_" },
      { label: "Eye Examination", key: "examination", placeholder: "Conjunctiva, cornea, pupil, fundus..." },
    ],
    ENT: [
      { label: "Ear/Nose/Throat Symptoms", key: "history", placeholder: "Hearing loss, discharge, pain..." },
      { label: "ENT Examination", key: "examination", placeholder: "Otoscopy, nasal exam, oral exam..." },
    ],
    ORTHO: [
      { label: "Musculoskeletal Complaint", key: "history", placeholder: "Pain location, mechanism of injury..." },
      { label: "Orthopaedic Exam", key: "examination", placeholder: "ROM, swelling, deformity, neurovascular..." },
    ],
    NEURO: [
      { label: "Neurological Symptoms", key: "history", placeholder: "Headache, weakness, seizures..." },
      { label: "Neurological Exam", key: "examination", placeholder: "CNS, motor, sensory, cerebellar..." },
    ],
    PSYCH: [
      { label: "Mental State", key: "history", placeholder: "Mood, anxiety, sleep, thoughts..." },
      { label: "Psychiatric Assessment", key: "examination", placeholder: "Appearance, behavior, cognition..." },
    ],
    URO: [
      { label: "Urological Symptoms", key: "history", placeholder: "Dysuria, frequency, hematuria..." },
      { label: "Genitourinary Exam", key: "examination", placeholder: "Abdominal, genital exam..." },
    ],
  };

  const fields = specialtyFields[encounter.departmentCode] || [];

  const save = () => {
    const payload: any = { ...form };
    if (form.followUpDate) payload.followUpDate = new Date(form.followUpDate).toISOString();
    if (form.status === "completed") payload.endTime = new Date().toISOString();
    onUpdate(encounter.id, payload);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <sp.icon className="w-5 h-5 text-purple-600" />
            {encounter.encounterNumber} — {encounter.patientName}
          </DialogTitle>
          <DialogDescription>
            {sp.label} · {(encounter.clinicType || "new").replace(/_/g, " ")} · {formatDate(encounter.startTime, true)}
          </DialogDescription>
        </DialogHeader>

        {/* Patient info */}
        <div className="grid grid-cols-4 gap-3 text-xs bg-slate-50 p-3 rounded-lg">
          <div><Label className="text-slate-500">Patient</Label><div className="font-semibold">{encounter.patientName}</div></div>
          <div><Label className="text-slate-500">Age/Sex</Label><div>{encounter.patientAge ? `${encounter.patientAge}y` : "—"} {encounter.patientSex || ""}</div></div>
          <div><Label className="text-slate-500">Clinician</Label><div>{encounter.clinicianName || "—"}</div></div>
          <div><Label className="text-slate-500">Status</Label><div><StatusBadge status={encounter.status} /></div></div>
        </div>

        {/* Clinical form */}
        <div className="space-y-3">
          <div>
            <FieldLabel>Chief Complaint</FieldLabel>
            <Input value={form.chiefComplaint} onChange={(e) => set("chiefComplaint", e.target.value)} disabled={!canManage} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{fields[0]?.label || "History"}</FieldLabel>
              <Textarea value={form.history} onChange={(e) => set("history", e.target.value)} rows={4} placeholder={fields[0]?.placeholder || "Patient history..."} disabled={!canManage} />
            </div>
            <div>
              <FieldLabel>{fields[1]?.label || "Examination"}</FieldLabel>
              <Textarea value={form.examination} onChange={(e) => set("examination", e.target.value)} rows={4} placeholder={fields[1]?.placeholder || "Examination findings..."} disabled={!canManage} />
            </div>
          </div>
          <div>
            <FieldLabel>Diagnosis</FieldLabel>
            <Textarea value={form.diagnosis} onChange={(e) => set("diagnosis", e.target.value)} rows={2} placeholder="Primary and secondary diagnoses..." disabled={!canManage} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Treatment Plan</FieldLabel>
              <Textarea value={form.treatmentPlan} onChange={(e) => set("treatmentPlan", e.target.value)} rows={3} disabled={!canManage} />
            </div>
            <div>
              <FieldLabel>Procedure Done</FieldLabel>
              <Textarea value={form.procedureDone} onChange={(e) => set("procedureDone", e.target.value)} rows={3} disabled={!canManage} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Prescription</FieldLabel>
              <Textarea value={form.prescription} onChange={(e) => set("prescription", e.target.value)} rows={3} placeholder="Medications prescribed..." disabled={!canManage} />
            </div>
            <div>
              <Label>Follow-up Date</Label>
              <Input type="date" value={form.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} disabled={!canManage} />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)} disabled={!canManage}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {canManage && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={save} disabled={loading} className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
              {loading ? "Saving..." : "Save Encounter"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// NEW ENCOUNTER TAB
// =====================================================================
function NewEncounterTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    patientName: "", patientId: "", patientAge: "", patientSex: "male",
    departmentCode: "CARDIO", clinicType: "new", chiefComplaint: "",
    clinicianName: "",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/specialty", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Specialty encounter created");
      qc.invalidateQueries({ queryKey: ["specialty-encounters"] });
      qc.invalidateQueries({ queryKey: ["specialty-dashboard"] });
      // Reset form
      setForm({ patientName: "", patientId: "", patientAge: "", patientSex: "male", departmentCode: form.departmentCode, clinicType: "new", chiefComplaint: "", clinicianName: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedSpecialty = SPECIALTIES.find((s) => s.code === form.departmentCode) || SPECIALTIES[0];

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <selectedSpecialty.icon className="w-4 h-4 text-purple-600" />
            New Specialty Encounter
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="col-span-2"><FieldLabel>Patient Name</FieldLabel><Input value={form.patientName} onChange={(e) => set("patientName", e.target.value)} placeholder="Full name" /></div>
            <div><Label>Patient ID (optional)</Label><Input value={form.patientId} onChange={(e) => set("patientId", e.target.value)} placeholder="Existing MRN" /></div>
            <div><Label>Age</Label><Input type="number" value={form.patientAge} onChange={(e) => set("patientAge", e.target.value)} /></div>
            <div><Label>Sex</Label><Select value={form.patientSex} onValueChange={(v) => set("patientSex", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent></Select></div>
            <div>
              <FieldLabel>Specialty</FieldLabel>
              <Select value={form.departmentCode} onValueChange={(v) => set("departmentCode", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SPECIALTIES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Visit Type</Label>
              <Select value={form.clinicType} onValueChange={(v) => set("clinicType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="new">New Consultation</SelectItem><SelectItem value="follow_up">Follow-up</SelectItem><SelectItem value="review">Review</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Clinician</Label><Input value={form.clinicianName} onChange={(e) => set("clinicianName", e.target.value)} placeholder="Doctor name" /></div>
            <div className="col-span-2 md:col-span-3"><FieldLabel>Chief Complaint</FieldLabel><Textarea value={form.chiefComplaint} onChange={(e) => set("chiefComplaint", e.target.value)} rows={2} placeholder="Presenting complaint..." /></div>
          </div>

          {/* Specialty info card */}
          <div className={`mt-4 p-3 rounded-xl bg-gradient-to-r ${selectedSpecialty.gradient} text-white`}>
            <div className="flex items-center gap-2">
              <selectedSpecialty.icon className="w-5 h-5" />
              <span className="font-bold">{selectedSpecialty.label}</span>
            </div>
            <p className="text-xs text-white/80 mt-1">
              After creating the encounter, you can record history, examination, diagnosis, treatment plan, procedures, prescriptions, and follow-up.
            </p>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => {
                const payload = { ...form };
                if (payload.patientAge) payload.patientAge = parseInt(payload.patientAge);
                createMutation.mutate(payload);
              }}
              disabled={createMutation.isPending || !form.patientName || !form.chiefComplaint}
              className="bg-gradient-to-r from-purple-500 to-purple-600 text-white"
            >
              {createMutation.isPending ? "Creating..." : "Create Encounter"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Specialty quick-select cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {SPECIALTIES.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.code}
              onClick={() => set("departmentCode", s.code)}
              className={`relative overflow-hidden rounded-xl p-3 text-white shadow-md transition-all hover:-translate-y-1 ${form.departmentCode === s.code ? `bg-gradient-to-br ${s.gradient} ring-2 ring-purple-400` : `bg-gradient-to-br ${s.gradient} opacity-60 hover:opacity-100`}`}
            >
              <Icon className="absolute top-1 right-1 w-5 h-5 text-white/20" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">{s.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

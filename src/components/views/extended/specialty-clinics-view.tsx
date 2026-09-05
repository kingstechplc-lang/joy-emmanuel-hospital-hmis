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
import { Badge } from "@/components/ui/badge";
import {
  Stethoscope, Plus, Search, RefreshCcw, Eye, AlertCircle, Activity,
  Heart, Eye as EyeIcon, Ear, Brain, Bone, Pill, Baby, Syringe, User,
  CheckCircle2, Clock, ArrowRight, Calendar, FileText, TrendingUp,
  CalendarPlus, ClipboardList, Building2, Share2, Phone, MapPin,
  Trash2, Edit, ChevronRight, Users, Clipboard, FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative,
  safeJson, PageHeader, MiniStatCard, ClearableSearch} from "@/components/ui-helpers"
import { DataTable } from "@/components/ui/data-table";
import { FieldLabel } from "@/components/ui/required-label";
import { PatientPicker, type PatientPickerValue } from "@/components/ui/patient-picker";
import { DepartmentSelect, type EntitySelectValue } from "@/components/ui/entity-select";
import { DiagnosisPicker } from "@/components/ui/diagnosis-picker";
import { useAppStore } from "@/stores/app-store";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

async function sendJson(url: string, method: string, body: any) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

// =====================================================================
// SPECIALTY CONFIG — 12 specialties with their visual identity
// =====================================================================
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

const SPECIALTY_MAP = Object.fromEntries(SPECIALTIES.map((s) => [s.code, s]));

const DAYS_OF_WEEK = [
  { code: "MON", label: "Mon" }, { code: "TUE", label: "Tue" }, { code: "WED", label: "Wed" },
  { code: "THU", label: "Thu" }, { code: "FRI", label: "Fri" }, { code: "SAT", label: "Sat" }, { code: "SUN", label: "Sun" },
];

export function SpecialtyClinicsView({ initialTab }: { initialTab?: string }) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canManage = can("specialty.manage");
  const canView = can("specialty.view");
  const canAppointments = can("specialty.appointments") || canManage;
  const canReferrals = can("specialty.referrals") || canManage;

  // Map sidebar view keys to tabs
  const tabFromKey: Record<string, string> = {
    specialty_clinics_appointments: "appointments",
    specialty_clinics_referrals: "referrals",
    specialty_clinics_clinics: "clinics",
  };
  const [activeTab, setActiveTab] = useState(initialTab ? (tabFromKey[initialTab] || "dashboard") : "dashboard");

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
        title="Specialty Clinics Management"
        description="Multi-specialty clinical care — Dental, Eye, ENT, Cardiology, Neurology, Orthopaedics, Dermatology, Psychiatry, Urology, Endocrinology, Paediatrics & Physiotherapy"
        icon={Stethoscope}
        gradient="from-purple-500 to-purple-600"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto gap-1 p-1 bg-slate-100 rounded-lg tabs-scroll">
          <TabsTrigger value="dashboard" className="text-xs whitespace-nowrap flex-1 min-w-[80px]">Dashboard</TabsTrigger>
          <TabsTrigger value="encounters" className="text-xs whitespace-nowrap flex-1 min-w-[80px]">Encounters</TabsTrigger>
          <TabsTrigger value="appointments" className="text-xs whitespace-nowrap flex-1 min-w-[80px]">Appointments</TabsTrigger>
          <TabsTrigger value="clinics" className="text-xs whitespace-nowrap flex-1 min-w-[80px]">Clinics</TabsTrigger>
          <TabsTrigger value="referrals" className="text-xs whitespace-nowrap flex-1 min-w-[80px]">Referrals</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4"><DashboardTab /></TabsContent>
        <TabsContent value="encounters" className="mt-4"><EncountersTab canManage={canManage} /></TabsContent>
        <TabsContent value="appointments" className="mt-4"><AppointmentsTab canManage={canAppointments} /></TabsContent>
        <TabsContent value="clinics" className="mt-4"><ClinicsTab canManage={canManage} /></TabsContent>
        <TabsContent value="referrals" className="mt-4"><ReferralsTab canManage={canReferrals} /></TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab() {
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["specialty-stats"],
    queryFn: () => fetchJson("/api/specialty/stats"),
    staleTime: 30_000,
  });
  const { data: encData, isLoading: encLoading } = useQuery({
    queryKey: ["specialty-dashboard-enc"],
    queryFn: () => fetchJson("/api/specialty?limit=10"),
    staleTime: 0,
  });
  const { data: apptData, isLoading: apptLoading } = useQuery({
    queryKey: ["specialty-dashboard-appt"],
    queryFn: () => fetchJson(`/api/specialty/appointments?date=${new Date().toISOString().slice(0, 10)}&limit=10`),
    staleTime: 0,
  });

  const stats = statsData?.totals || {};
  const bySpecialty: any[] = statsData?.bySpecialty || [];
  const todayBySpecialty: any[] = statsData?.todayBySpecialty || [];
  const encounters: any[] = encData?.items || [];
  const todayAppointments: any[] = apptData?.items || [];

  return (
    <div className="space-y-4">
      {statsLoading ? <LoadingState rows={4} /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStatCard label="Total Encounters" value={stats.encounters ?? 0} icon={Stethoscope} gradient="from-purple-500 to-purple-600" />
            <MiniStatCard label="Today's Appts" value={stats.todayAppointments ?? 0} icon={Calendar} gradient="from-blue-500 to-blue-600" />
            <MiniStatCard label="Pending Referrals" value={stats.pendingReferrals ?? 0} icon={Share2} gradient="from-amber-500 to-orange-600" />
            <MiniStatCard label="Active Clinics" value={stats.activeClinics ?? 0} icon={Building2} gradient="from-emerald-500 to-emerald-600" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStatCard label="In Progress" value={stats.inProgress ?? 0} icon={Clock} gradient="from-cyan-500 to-cyan-600" />
            <MiniStatCard label="Completed" value={stats.completed ?? 0} icon={CheckCircle2} gradient="from-teal-500 to-teal-600" />
            <MiniStatCard label="Scheduled Appts" value={stats.scheduledAppointments ?? 0} icon={CalendarPlus} gradient="from-indigo-500 to-blue-600" />
            <MiniStatCard label="Urgent Referrals" value={stats.urgentReferrals ?? 0} icon={AlertCircle} gradient="from-rose-500 to-red-600" />
          </div>

          {/* Specialty breakdown grid */}
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
                  const sp = SPECIALTY_MAP[s.code] || SPECIALTIES[0];
                  const Icon = sp.icon;
                  const todayCount = todayBySpecialty.find((t) => t.code === s.code)?.count || 0;
                  return (
                    <div key={s.code} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${sp.gradient} text-white p-3 shadow-md card-hover-lift`}>
                      <Icon className="absolute top-2 right-2 w-6 h-6 text-white/20" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">{sp.label}</p>
                      <p className="text-2xl font-extrabold">{s.count}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-white/70">
                        <span>Total encounters</span>
                        {todayCount > 0 && <span className="text-amber-200">· {todayCount} appts today</span>}
                      </div>
                    </div>
                  );
                })}
              </div>}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Today's appointments */}
            <Card className="shadow-sm border-slate-200 overflow-hidden">
              <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-2 h-4 rounded-full bg-gradient-to-b from-blue-500 to-blue-600" />
                  Today&apos;s Appointments
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {apptLoading ? <LoadingState rows={3} /> :
                 todayAppointments.length === 0 ? <EmptyState title="No appointments today" description="Schedule appointments in the Appointments tab." icon={Calendar} /> :
                 <div className="divide-y divide-slate-100">
                  {todayAppointments.slice(0, 8).map((a) => {
                    const sp = SPECIALTY_MAP[a.departmentCode] || SPECIALTIES[0];
                    return (
                      <div key={a.id} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${sp.gradient} text-white flex items-center justify-center flex-shrink-0`}>
                          <sp.icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{a.patientName}</p>
                          <p className="text-xs text-slate-500">{sp.label} · {a.startTime || "—"} {a.clinicianName ? `· ${a.clinicianName}` : ""}</p>
                        </div>
                        <StatusBadge status={a.status} />
                      </div>
                    );
                  })}
                 </div>}
              </CardContent>
            </Card>

            {/* Recent encounters */}
            <Card className="shadow-sm border-slate-200 overflow-hidden">
              <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-2 h-4 rounded-full bg-gradient-to-b from-purple-500 to-purple-600" />
                  Recent Encounters
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {encLoading ? <LoadingState rows={3} /> :
                 encounters.length === 0 ? <EmptyState title="No encounters yet" description="Create your first specialty encounter." icon={Stethoscope} /> :
                 <div className="divide-y divide-slate-100">
                  {encounters.slice(0, 8).map((e) => {
                    const sp = SPECIALTY_MAP[e.departmentCode] || SPECIALTIES[0];
                    return (
                      <div key={e.id} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${sp.gradient} text-white flex items-center justify-center flex-shrink-0`}>
                          <sp.icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{e.patientName}</p>
                          <p className="text-xs text-slate-500 truncate">{e.encounterNumber} · {e.chiefComplaint?.slice(0, 60) || "—"}</p>
                        </div>
                        <StatusBadge status={e.status} />
                      </div>
                    );
                  })}
                 </div>}
              </CardContent>
            </Card>
          </div>
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
  const [showNew, setShowNew] = useState(false);

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
    mutationFn: async ({ id, data }: { id: string; data: any }) => sendJson(`/api/specialty/${id}`, "PATCH", data),
    onSuccess: () => {
      toast.success("Encounter updated");
      setViewEncounter(null);
      qc.invalidateQueries({ queryKey: ["specialty-encounters"] });
      qc.invalidateQueries({ queryKey: ["specialty-stats"] });
      qc.invalidateQueries({ queryKey: ["specialty-dashboard-enc"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search by patient, complaint, diagnosis, encounter #..." className="pl-0" />
          </div>
          <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Specialties</SelectItem>{SPECIALTIES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }} disabled={isFetching}>
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setShowNew(true)} className="gap-1 bg-gradient-to-r from-purple-500 to-purple-600 text-white">
              <Plus className="w-4 h-4" /> New Encounter
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={5} /> :
       items.length === 0 ? <EmptyState title="No encounters" description="Create a new specialty encounter to get started." icon={Stethoscope} /> :
       <DataTable
         headers={["Encounter #", "Patient", "Specialty", "Type", "Chief Complaint", "Clinician", "Status", "Date", "Actions"]}
         rows={items.map((e) => {
           const sp = SPECIALTY_MAP[e.departmentCode] || SPECIALTIES[0];
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

      {showNew && (
        <NewEncounterDialog
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            qc.invalidateQueries({ queryKey: ["specialty-encounters"] });
            qc.invalidateQueries({ queryKey: ["specialty-stats"] });
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// NEW ENCOUNTER DIALOG
// =====================================================================
function NewEncounterDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const setView = useAppStore((s) => s.setView);
  const [patient, setPatient] = useState<PatientPickerValue | null>(null);
  const [form, setForm] = useState({
    departmentCode: "CARDIO", clinicType: "new", chiefComplaint: "",
    clinicianName: "",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const createMutation = useMutation({
    mutationFn: (payload: any) => sendJson("/api/specialty", "POST", payload),
    onSuccess: () => {
      toast.success("Specialty encounter created");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedSpecialty = SPECIALTY_MAP[form.departmentCode] || SPECIALTIES[0];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <selectedSpecialty.icon className="w-5 h-5" />
            New Specialty Encounter
          </DialogTitle>
          <DialogDescription className="text-white/80">Create a clinical encounter for a specialty consultation, procedure, or follow-up.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <PatientPicker
            label="Patient"
            required
            value={patient}
            onChange={setPatient}
            onRegisterNew={() => {
              onClose();
              setView("patient_new");
            }}
          />

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                <SelectContent>
                  <SelectItem value="new">New Consultation</SelectItem>
                  <SelectItem value="follow_up">Follow-up</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Clinician</Label><Input value={form.clinicianName} onChange={(e) => set("clinicianName", e.target.value)} placeholder="Doctor name" /></div>
            <div className="col-span-2 md:col-span-3"><FieldLabel>Chief Complaint</FieldLabel><Textarea value={form.chiefComplaint} onChange={(e) => set("chiefComplaint", e.target.value)} rows={2} placeholder="Presenting complaint..." /></div>
          </div>

          <div className={`p-3 rounded-xl bg-gradient-to-r ${selectedSpecialty.gradient} text-white`}>
            <div className="flex items-center gap-2">
              <selectedSpecialty.icon className="w-5 h-5" />
              <span className="font-bold">{selectedSpecialty.label}</span>
            </div>
            <p className="text-xs text-white/80 mt-1">
              After creating the encounter, you can record history, examination, diagnosis, treatment plan, procedures, prescriptions, and follow-up.
            </p>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!patient) return;
              const payload: any = {
                ...form,
                patientId: patient.patientId,
                patientName: patient.patientName,
                patientAge: patient.patientAge || null,
                patientSex: patient.patientSex || null,
              };
              createMutation.mutate(payload);
            }}
            disabled={createMutation.isPending || !patient?.patientName || !form.chiefComplaint}
            className="bg-gradient-to-r from-purple-500 to-purple-600 text-white"
          >
            {createMutation.isPending ? "Creating..." : "Create Encounter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// ENCOUNTER DETAIL — with specialty-specific form fields + procedures + notes
// =====================================================================
function EncounterDetail({ encounter, canManage, onClose, onUpdate, loading }: {
  encounter: any; canManage: boolean; onClose: () => void; onUpdate: (id: string, data: any) => void; loading: boolean;
}) {
  const qc = useQueryClient();
  const setView = useAppStore((s) => s.setView);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const sp = SPECIALTY_MAP[encounter.departmentCode] || SPECIALTIES[0];
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

  // Specialty-specific field labels/placeholders
  const specialtyFields: Record<string, { label: string; key: string; placeholder: string }[]> = {
    CARDIO: [
      { label: "Cardiac History", key: "history", placeholder: "Chest pain onset, duration, character, radiation; risk factors..." },
      { label: "Cardiovascular Exam", key: "examination", placeholder: "Heart sounds, murmurs, JVP, pulses, BP, edema..." },
    ],
    DERM: [
      { label: "Skin Lesion Description", key: "examination", placeholder: "Location, size, color, morphology, distribution..." },
      { label: "Duration & Symptoms", key: "history", placeholder: "Itching, pain, progression, exacerbating factors..." },
    ],
    OPHTH: [
      { label: "Visual Acuity & History", key: "history", placeholder: "Right: 6/_, Left: 6/_, redness, pain, discharge..." },
      { label: "Eye Examination", key: "examination", placeholder: "Conjunctiva, cornea, pupil, fundus, IOP..." },
    ],
    ENT: [
      { label: "Ear/Nose/Throat Symptoms", key: "history", placeholder: "Hearing loss, discharge, pain, obstruction..." },
      { label: "ENT Examination", key: "examination", placeholder: "Otoscopy, nasal exam, oral exam, larynx..." },
    ],
    ORTHO: [
      { label: "Musculoskeletal History", key: "history", placeholder: "Pain location, mechanism of injury, duration..." },
      { label: "Orthopaedic Exam", key: "examination", placeholder: "ROM, swelling, deformity, neurovascular..." },
    ],
    NEURO: [
      { label: "Neurological Symptoms", key: "history", placeholder: "Headache, weakness, seizures, sensory changes..." },
      { label: "Neurological Exam", key: "examination", placeholder: "CNS, motor, sensory, cerebellar, cranial nerves..." },
    ],
    PSYCH: [
      { label: "Mental State History", key: "history", placeholder: "Mood, anxiety, sleep, thoughts, behavior changes..." },
      { label: "Psychiatric Assessment", key: "examination", placeholder: "Appearance, behavior, cognition, insight..." },
    ],
    URO: [
      { label: "Urological Symptoms", key: "history", placeholder: "Dysuria, frequency, hematuria, retention..." },
      { label: "Genitourinary Exam", key: "examination", placeholder: "Abdominal, genital, prostate exam..." },
    ],
    DENTAL: [
      { label: "Dental History", key: "history", placeholder: "Tooth pain, sensitivity, swelling, trauma..." },
      { label: "Oral Examination", key: "examination", placeholder: "Teeth, gums, oral mucosa, occlusion..." },
    ],
    PHYSIO: [
      { label: "Functional History", key: "history", placeholder: "Mobility, ADLs, pain, prior physio..." },
      { label: "Physio Assessment", key: "examination", placeholder: "ROM, strength, gait, special tests..." },
    ],
    ENDO: [
      { label: "Endocrine History", key: "history", placeholder: "Weight changes, polyuria, heat/cold intolerance..." },
      { label: "Endocrine Exam", key: "examination", placeholder: "Thyroid, skin, hydration, anthropometry..." },
    ],
    PAED: [
      { label: "Paediatric History", key: "history", placeholder: "Birth, immunization, feeding, developmental milestones..." },
      { label: "Paediatric Exam", key: "examination", placeholder: "Growth parameters, systemic exam, developmental..." },
    ],
  };
  const fields = specialtyFields[encounter.departmentCode] || [];

  const save = () => {
    const payload: any = { ...form };
    if (form.followUpDate) payload.followUpDate = new Date(form.followUpDate).toISOString();
    if (form.status === "completed") payload.endTime = new Date().toISOString();
    onUpdate(encounter.id, payload);
  };

  // Procedures
  const procedures: any[] = encounter.procedures || [];
  const notes: any[] = encounter.notes || [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <sp.icon className="w-5 h-5" />
            {encounter.encounterNumber} — {encounter.patientName}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {sp.label} · {(encounter.clinicType || "new").replace(/_/g, " ")} · {formatDate(encounter.startTime, true)}
          </DialogDescription>
        </DialogHeader>

        {/* Patient info — with internal links */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50 p-3 rounded-lg">
          <div>
            <Label className="text-slate-500">Patient</Label>
            {encounter.patientId ? (
              <button
                onClick={() => { selectPatient(encounter.patientId); onClose(); setView("patient_360"); }}
                className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1"
                title="View Patient 360"
              >
                {encounter.patientName}
                <ArrowRight className="w-3 h-3" />
              </button>
            ) : (
              <div className="font-semibold text-amber-700 flex items-center gap-1" title="Not linked to a patient record">
                {encounter.patientName}
                <AlertCircle className="w-3 h-3" />
              </div>
            )}
          </div>
          <div><Label className="text-slate-500">Age/Sex</Label><div>{encounter.patientAge ? `${encounter.patientAge}y` : "—"} {encounter.patientSex || ""}</div></div>
          <div><Label className="text-slate-500">Clinician</Label><div>{encounter.clinicianName || "—"}</div></div>
          <div><Label className="text-slate-500">Status</Label><div><StatusBadge status={encounter.status} /></div></div>
        </div>

        {/* Quick actions — cross-module internal links */}
        <div className="flex flex-wrap gap-2">
          {encounter.patientId && (
            <Button size="sm" variant="outline" onClick={() => { selectPatient(encounter.patientId); onClose(); setView("patient_360"); }} className="text-emerald-700">
              <Eye className="w-3.5 h-3.5 mr-1" /> Patient 360
            </Button>
          )}
          {encounter.patientId && (
            <Button size="sm" variant="outline" onClick={() => { selectPatient(encounter.patientId); onClose(); setView("lab_orders"); }} className="text-blue-700">
              <FlaskConical className="w-3.5 h-3.5 mr-1" /> Order Lab
            </Button>
          )}
          {encounter.patientId && form.prescription && (
            <Button size="sm" variant="outline" onClick={() => { selectPatient(encounter.patientId); onClose(); setView("prescriptions"); }} className="text-rose-700">
              <Pill className="w-3.5 h-3.5 mr-1" /> Send to Pharmacy
            </Button>
          )}
          {encounter.patientId && (
            <Button size="sm" variant="outline" onClick={() => { selectPatient(encounter.patientId); onClose(); setView("imaging"); }} className="text-cyan-700">
              <Activity className="w-3.5 h-3.5 mr-1" /> Order Imaging
            </Button>
          )}
        </div>

        {/* Clinical form */}
        <div className="space-y-3">
          <div>
            <FieldLabel>Chief Complaint</FieldLabel>
            <Input value={form.chiefComplaint} onChange={(e) => set("chiefComplaint", e.target.value)} disabled={!canManage} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Treatment Plan</FieldLabel>
              <Textarea value={form.treatmentPlan} onChange={(e) => set("treatmentPlan", e.target.value)} rows={3} disabled={!canManage} />
            </div>
            <div>
              <FieldLabel>Procedure Done</FieldLabel>
              <Textarea value={form.procedureDone} onChange={(e) => set("procedureDone", e.target.value)} rows={3} disabled={!canManage} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

        {/* Procedures section */}
        <ProceduresSection encounterId={encounter.id} procedures={procedures} canManage={canManage} />

        {/* Diagnosis section — centralized Diagnosis Engine */}
        {encounter.patientId && (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-4 rounded-full bg-gradient-to-b from-indigo-500 to-purple-600" />
                Diagnoses
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <DiagnosisPicker
                patientId={encounter.patientId}
                encounterId={encounter.id}
                specialty={encounter.departmentCode}
                canManage={canManage}
              />
            </CardContent>
          </Card>
        )}

        {/* Clinical notes section */}
        <ClinicalNotesSection encounterId={encounter.id} notes={notes} canManage={canManage} />

        {canManage && (
          <DialogFooter className="p-6 pt-4 shrink-0 border-t">
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
// PROCEDURES SECTION (embedded in encounter detail)
// =====================================================================
function ProceduresSection({ encounterId, procedures, canManage }: { encounterId: string; procedures: any[]; canManage: boolean }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    procedureName: "", procedureCode: "", bodySite: "", laterality: "n/a",
    performedByName: "", anesthesiaType: "none", findings: "", complications: "", notes: "",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const createMut = useMutation({
    mutationFn: (payload: any) => sendJson("/api/specialty/procedures", "POST", { ...payload, specialtyEncounterId: encounterId }),
    onSuccess: () => {
      toast.success("Procedure added");
      setShowForm(false);
      setForm({ procedureName: "", procedureCode: "", bodySite: "", laterality: "n/a", performedByName: "", anesthesiaType: "none", findings: "", complications: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["specialty-encounters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => sendJson(`/api/specialty/procedures/${id}`, "PATCH", { status: "completed" }),
    onSuccess: () => {
      toast.success("Procedure marked completed");
      qc.invalidateQueries({ queryKey: ["specialty-encounters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Clipboard className="w-4 h-4 text-purple-600" />
          Procedures Performed
          {procedures.length > 0 && <Badge variant="secondary" className="ml-1">{procedures.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        {procedures.length === 0 ? <p className="text-xs text-slate-400 py-2 text-center">No procedures recorded yet.</p> :
          procedures.map((p) => (
            <div key={p.id} className="border border-slate-200 rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{p.procedureName}</p>
                  <p className="text-xs text-slate-500">
                    {p.bodySite ? `${p.bodySite} · ` : ""}
                    {p.laterality && p.laterality !== "n/a" ? `${p.laterality} · ` : ""}
                    {p.anesthesiaType && p.anesthesiaType !== "none" ? `${p.anesthesiaType} anesthesia · ` : ""}
                    {p.performedByName || "Unspecified clinician"}
                  </p>
                  {p.findings && <p className="text-xs text-slate-700 mt-1"><span className="font-semibold">Findings:</span> {p.findings}</p>}
                  {p.complications && <p className="text-xs text-rose-700 mt-1"><span className="font-semibold">Complications:</span> {p.complications}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={p.status} />
                  {p.status === "in_progress" && canManage && (
                    <Button size="sm" variant="outline" onClick={() => completeMut.mutate(p.id)}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Complete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}

        {canManage && showForm && (
          <div className="border border-purple-200 rounded-lg p-3 bg-purple-50/50 space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <div className="col-span-2"><FieldLabel>Procedure Name</FieldLabel><Input value={form.procedureName} onChange={(e) => set("procedureName", e.target.value)} placeholder="e.g., Dental extraction, ECG, Biopsy" /></div>
              <div><Label>Procedure Code</Label><Input value={form.procedureCode} onChange={(e) => set("procedureCode", e.target.value)} /></div>
              <div><Label>Body Site</Label><Input value={form.bodySite} onChange={(e) => set("bodySite", e.target.value)} placeholder="e.g., Right upper arm" /></div>
              <div><Label>Laterality</Label><Select value={form.laterality} onValueChange={(v) => set("laterality", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="n/a">N/A</SelectItem><SelectItem value="left">Left</SelectItem><SelectItem value="right">Right</SelectItem><SelectItem value="bilateral">Bilateral</SelectItem></SelectContent></Select></div>
              <div><Label>Anesthesia</Label><Select value={form.anesthesiaType} onValueChange={(v) => set("anesthesiaType", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="local">Local</SelectItem><SelectItem value="topical">Topical</SelectItem><SelectItem value="sedation">Sedation</SelectItem><SelectItem value="general">General</SelectItem></SelectContent></Select></div>
              <div><Label>Performed By</Label><Input value={form.performedByName} onChange={(e) => set("performedByName", e.target.value)} /></div>
              <div className="col-span-2 md:col-span-3"><Label>Findings</Label><Textarea value={form.findings} onChange={(e) => set("findings", e.target.value)} rows={2} /></div>
              <div className="col-span-2 md:col-span-3"><Label>Complications</Label><Textarea value={form.complications} onChange={(e) => set("complications", e.target.value)} rows={2} placeholder="None..." /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" disabled={!form.procedureName || createMut.isPending} onClick={() => createMut.mutate(form)} className="bg-purple-600 text-white">
                {createMut.isPending ? "Adding..." : "Add Procedure"}
              </Button>
            </div>
          </div>
        )}

        {canManage && !showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="w-full border-dashed">
            <Plus className="w-4 h-4 mr-1" /> Add Procedure
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// CLINICAL NOTES SECTION (addenda, nursing notes, observations)
// =====================================================================
function ClinicalNotesSection({ encounterId, notes, canManage }: { encounterId: string; notes: any[]; canManage: boolean }) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState("addendum");

  const createMut = useMutation({
    mutationFn: () => sendJson("/api/specialty/notes", "POST", { specialtyEncounterId: encounterId, content, noteType }),
    onSuccess: () => {
      toast.success("Note added");
      setContent("");
      qc.invalidateQueries({ queryKey: ["specialty-encounters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <FileText className="w-4 h-4 text-purple-600" />
          Clinical Notes &amp; Addenda
          {notes.length > 0 && <Badge variant="secondary" className="ml-1">{notes.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        {notes.length === 0 ? <p className="text-xs text-slate-400 py-2 text-center">No notes yet.</p> :
          notes.map((n) => (
            <div key={n.id} className="border border-slate-200 rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between gap-2 mb-1">
                <Badge variant="outline" className="capitalize text-[10px]">{n.noteType}</Badge>
                <span className="text-[10px] text-slate-400">{formatDate(n.authoredAt, true)} · {n.authoredByName || "Unknown"}</span>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</p>
            </div>
          ))}

        {canManage && (
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
            <div className="flex gap-2 items-center">
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="addendum">Addendum</SelectItem>
                  <SelectItem value="nursing">Nursing Note</SelectItem>
                  <SelectItem value="observation">Observation</SelectItem>
                  <SelectItem value="phone_call">Phone Call</SelectItem>
                  <SelectItem value="handover">Handover</SelectItem>
                </SelectContent>
              </Select>
              <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Add a clinical note..." className="flex-1 h-8" />
              <Button size="sm" disabled={!content || createMut.isPending} onClick={() => createMut.mutate()} className="bg-purple-600 text-white h-8">
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// APPOINTMENTS TAB
// =====================================================================
function AppointmentsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (specialtyFilter !== "all") params.set("departmentCode", specialtyFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (dateFilter) params.set("date", dateFilter);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["specialty-appointments", params.toString()],
    queryFn: () => fetchJson(`/api/specialty/appointments?${params.toString()}`),
    staleTime: 0,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => sendJson(`/api/specialty/appointments/${id}`, "PATCH", data),
    onSuccess: () => {
      toast.success("Appointment updated");
      qc.invalidateQueries({ queryKey: ["specialty-appointments"] });
      qc.invalidateQueries({ queryKey: ["specialty-stats"] });
      qc.invalidateQueries({ queryKey: ["specialty-dashboard-appt"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = (data?.items || []).filter((a: any) =>
    !search || a.patientName?.toLowerCase().includes(search.toLowerCase()) || a.appointmentNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const statusActions = [
    { from: "scheduled", to: "checked_in", label: "Check In", icon: User },
    { from: "checked_in", to: "in_consult", label: "Start Consult", icon: Stethoscope },
    { from: "in_consult", to: "completed", label: "Complete", icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search patient or appointment #" className="pl-0" />
          </div>
          <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Specialties</SelectItem>{SPECIALTIES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="checked_in">Checked In</SelectItem>
              <SelectItem value="in_consult">In Consult</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no_show">No-Show</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-[150px]" />
          <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }} disabled={isFetching}>
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setShowNew(true)} className="gap-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white">
              <Plus className="w-4 h-4" /> New Appt
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={5} /> :
       items.length === 0 ? <EmptyState title="No appointments" description="Schedule a new specialty appointment." icon={Calendar} /> :
       <DataTable
         headers={["Appt #", "Patient", "Specialty", "Date", "Time", "Type", "Clinician", "Status", "Actions"]}
         rows={items.map((a) => {
           const sp = SPECIALTY_MAP[a.departmentCode] || SPECIALTIES[0];
           return {
             cells: [
               <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-blue-500 to-blue-600 px-2 py-0.5 rounded-md font-semibold">{a.appointmentNumber}</span>,
               <span key="p" className="text-sm font-medium text-slate-900">{a.patientName}</span>,
               <span key="s" className="text-xs text-slate-600">{sp.label}</span>,
               <span key="d" className="text-xs text-slate-500">{formatDate(a.appointmentDate)}</span>,
               <span key="t" className="text-xs text-slate-500 font-mono">{a.startTime || "—"}</span>,
               <span key="ct" className="text-xs text-slate-500 capitalize">{(a.type || "new").replace(/_/g, " ")}</span>,
               <span key="cl" className="text-xs text-slate-600">{a.clinicianName || "—"}</span>,
               <StatusBadge key="st" status={a.status} />,
               <div key="a" className="flex gap-1">
                 {statusActions.filter((sa) => sa.from === a.status).map((sa) => (
                   <Button key={sa.to} size="sm" variant="outline" className="h-7 px-2 text-[10px]"
                     onClick={() => updateMutation.mutate({ id: a.id, data: { status: sa.to } })}>
                     <sa.icon className="w-3 h-3 mr-1" /> {sa.label}
                   </Button>
                 ))}
                 {a.status === "scheduled" && (
                   <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-rose-600 hover:text-rose-700"
                     onClick={() => updateMutation.mutate({ id: a.id, data: { status: "cancelled" } })}>
                     Cancel
                   </Button>
                 )}
               </div>,
             ],
             sortValues: [a.appointmentNumber, a.patientName, sp.label, a.appointmentDate, a.startTime || "", a.type || "", a.clinicianName || "", a.status, ""],
           };
         })}
         gradient="from-blue-500 to-blue-600"
         pageSize={10}
       />}

      {showNew && (
        <NewAppointmentDialog
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            qc.invalidateQueries({ queryKey: ["specialty-appointments"] });
            qc.invalidateQueries({ queryKey: ["specialty-stats"] });
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// NEW APPOINTMENT DIALOG
// =====================================================================
function NewAppointmentDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const setView = useAppStore((s) => s.setView);
  const [patient, setPatient] = useState<PatientPickerValue | null>(null);
  const [form, setForm] = useState({
    departmentCode: "CARDIO", clinicId: "", clinicianName: "",
    appointmentDate: new Date().toISOString().slice(0, 10),
    startTime: "09:00", endTime: "09:30",
    type: "new", source: "walk_in", reason: "",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const createMut = useMutation({
    mutationFn: (payload: any) => sendJson("/api/specialty/appointments", "POST", payload),
    onSuccess: () => { toast.success("Appointment scheduled"); onCreated(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedSpecialty = SPECIALTY_MAP[form.departmentCode] || SPECIALTIES[0];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <CalendarPlus className="w-5 h-5" />
            New Specialty Appointment
          </DialogTitle>
          <DialogDescription className="text-white/80">Schedule a patient for a specialty consultation, follow-up, or procedure.</DialogDescription>
        </DialogHeader>

        <PatientPicker
          label="Patient"
          required
          value={patient}
          onChange={setPatient}
          onRegisterNew={() => {
            onClose();
            setView("patient_new");
          }}
        />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><FieldLabel>Specialty</FieldLabel><Select value={form.departmentCode} onValueChange={(v) => set("departmentCode", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SPECIALTIES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Appointment Date</Label><Input type="date" value={form.appointmentDate} onChange={(e) => set("appointmentDate", e.target.value)} /></div>
          <div><Label>Start Time</Label><Input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} /></div>
          <div><Label>End Time</Label><Input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} /></div>
          <div><Label>Type</Label><Select value={form.type} onValueChange={(v) => set("type", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="follow_up">Follow-up</SelectItem><SelectItem value="review">Review</SelectItem><SelectItem value="procedure">Procedure</SelectItem></SelectContent></Select></div>
          <div><Label>Source</Label><Select value={form.source} onValueChange={(v) => set("source", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="walk_in">Walk-in</SelectItem><SelectItem value="phone">Phone</SelectItem><SelectItem value="referral">Referral</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent></Select></div>
          <div><Label>Clinician</Label><Input value={form.clinicianName} onChange={(e) => set("clinicianName", e.target.value)} placeholder="Optional" /></div>
          <div className="col-span-2 md:col-span-3"><FieldLabel>Reason for Visit</FieldLabel><Textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} rows={2} /></div>
        </div>

        <div className={`p-3 rounded-xl bg-gradient-to-r ${selectedSpecialty.gradient} text-white`}>
          <div className="flex items-center gap-2">
            <selectedSpecialty.icon className="w-5 h-5" />
            <span className="font-bold">{selectedSpecialty.label}</span>
          </div>
          <p className="text-xs text-white/80 mt-1">
            Patient will be scheduled for {form.appointmentDate} at {form.startTime || "the selected time"}.
          </p>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!patient) return;
              const payload: any = {
                ...form,
                patientId: patient.patientId,
                patientName: patient.patientName,
                patientAge: patient.patientAge || null,
                patientSex: patient.patientSex || null,
                patientPhone: patient.patientPhone || null,
              };
              payload.appointmentDate = new Date(form.appointmentDate + "T00:00:00");
              createMut.mutate(payload);
            }}
            disabled={createMut.isPending || !patient?.patientName || !form.appointmentDate}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white"
          >
            {createMut.isPending ? "Scheduling..." : "Schedule Appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// CLINICS TAB — clinic configuration management
// =====================================================================
function ClinicsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["specialty-clinics"],
    queryFn: () => fetchJson("/api/specialty/clinics"),
    staleTime: 0,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => sendJson(`/api/specialty/clinics/${id}`, "DELETE", null),
    onSuccess: () => { toast.success("Clinic deleted"); qc.invalidateQueries({ queryKey: ["specialty-clinics"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => sendJson(`/api/specialty/clinics/${id}`, "PATCH", { isActive }),
    onSuccess: () => { toast.success("Clinic updated"); qc.invalidateQueries({ queryKey: ["specialty-clinics"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700">Clinic Configurations</p>
            <p className="text-xs text-slate-500">Define clinic days, time slots, lead clinicians, and locations for each specialty.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }} disabled={isFetching}>
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => { setEditItem(null); setShowForm(true); }} className="gap-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
              <Plus className="w-4 h-4" /> New Clinic
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={4} /> :
       items.length === 0 ? <EmptyState title="No clinics configured" description="Configure your first specialty clinic." icon={Building2} /> :
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
         {items.map((c) => {
           const sp = SPECIALTY_MAP[c.code] || SPECIALTIES[0];
           const Icon = sp.icon;
           const days: string[] = c.clinicDays ? (() => { try { return JSON.parse(c.clinicDays); } catch { return []; } })() : [];
           return (
             <Card key={c.id} className={`shadow-sm border-slate-200 overflow-hidden ${!c.isActive ? "opacity-60" : ""}`}>
               <div className={`h-2 bg-gradient-to-r ${sp.gradient}`} />
               <CardContent className="p-4">
                 <div className="flex items-start justify-between gap-2 mb-3">
                   <div className="flex items-center gap-2">
                     <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${sp.gradient} text-white flex items-center justify-center`}>
                       <Icon className="w-5 h-5" />
                     </div>
                     <div>
                       <p className="font-bold text-slate-900">{c.name}</p>
                       <p className="text-xs text-slate-500">{sp.label}</p>
                     </div>
                   </div>
                   <StatusBadge status={c.isActive ? "active" : "inactive"} />
                 </div>
                 {c.description && <p className="text-xs text-slate-600 mb-3 line-clamp-2">{c.description}</p>}
                 <div className="space-y-1 text-xs text-slate-600">
                   {c.leadClinicianName && <div className="flex items-center gap-2"><User className="w-3 h-3 text-slate-400" /> Lead: {c.leadClinicianName}</div>}
                   {c.location && <div className="flex items-center gap-2"><MapPin className="w-3 h-3 text-slate-400" /> {c.location}</div>}
                   <div className="flex items-center gap-2"><Clock className="w-3 h-3 text-slate-400" /> {c.startTime || "—"} – {c.endTime || "—"}</div>
                   <div className="flex items-center gap-2"><Calendar className="w-3 h-3 text-slate-400" />
                     {days.length > 0 ? days.join(", ") : "No days set"}
                     {` · ${c.slotDurationMin || 30}min slots`}
                   </div>
                 </div>
                 {canManage && (
                   <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                     <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditItem(c); setShowForm(true); }}>
                       <Edit className="w-3 h-3 mr-1" /> Edit
                     </Button>
                     <Button size="sm" variant="outline" onClick={() => toggleActiveMut.mutate({ id: c.id, isActive: !c.isActive })}>
                       {c.isActive ? "Deactivate" : "Activate"}
                     </Button>
                     <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => { if (confirm("Delete this clinic configuration?")) deleteMut.mutate(c.id); }}>
                       <Trash2 className="w-3 h-3" />
                     </Button>
                   </div>
                 )}
               </CardContent>
             </Card>
           );
         })}
       </div>}

      {showForm && (
        <ClinicFormDialog
          item={editItem}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSaved={() => { setShowForm(false); setEditItem(null); qc.invalidateQueries({ queryKey: ["specialty-clinics"] }); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// CLINIC FORM DIALOG (create + edit)
// =====================================================================
function ClinicFormDialog({ item, onClose, onSaved }: { item: any | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: item?.code || "CARDIO",
    name: item?.name || "",
    description: item?.description || "",
    leadClinicianName: item?.leadClinicianName || "",
    location: item?.location || "",
    startTime: item?.startTime || "08:00",
    endTime: item?.endTime || "13:00",
    slotDurationMin: item?.slotDurationMin ?? 30,
    maxDailyBookings: item?.maxDailyBookings ?? 20,
    isActive: item?.isActive ?? true,
  });
  const [days, setDays] = useState<string[]>((() => {
    if (!item?.clinicDays) return ["MON", "WED", "FRI"];
    try { return JSON.parse(item.clinicDays); } catch { return []; }
  })());
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  const toggleDay = (d: string) => setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { ...form, clinicDays: JSON.stringify(days) };
      if (item) return sendJson(`/api/specialty/clinics/${item.id}`, "PATCH", payload);
      return sendJson("/api/specialty/clinics", "POST", payload);
    },
    onSuccess: () => { toast.success(item ? "Clinic updated" : "Clinic created"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2"><Building2 className="w-5 h-5" /> {item ? "Edit Clinic" : "New Clinic Configuration"}</DialogTitle>
          <DialogDescription className="text-white/80">Configure the operating days, time slots, and lead clinician for a specialty clinic.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <FieldLabel>Specialty</FieldLabel>
            <Select value={form.code} onValueChange={(v) => set("code", v)} disabled={!!item}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SPECIALTIES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><FieldLabel>Clinic Name</FieldLabel><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g., Tuesday Cardiology Clinic" /></div>
          <div className="col-span-2 md:col-span-3"><Label>Description</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional" rows={3} /></div>
          <div><Label>Lead Clinician</Label><Input value={form.leadClinicianName} onChange={(e) => set("leadClinicianName", e.target.value)} /></div>
          <div><Label>Location</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Room / Suite" /></div>
          <div><Label>Slot Duration (min)</Label><Input type="number" value={form.slotDurationMin} onChange={(e) => set("slotDurationMin", parseInt(e.target.value) || 30)} /></div>
          <div><Label>Start Time</Label><Input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} /></div>
          <div><Label>End Time</Label><Input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} /></div>
          <div><Label>Max Daily Bookings</Label><Input type="number" value={form.maxDailyBookings} onChange={(e) => set("maxDailyBookings", parseInt(e.target.value) || 20)} /></div>
          <div className="col-span-2 md:col-span-3">
            <FieldLabel>Clinic Days</FieldLabel>
            <div className="flex gap-1">
              {DAYS_OF_WEEK.map((d) => (
                <button key={d.code} type="button" onClick={() => toggleDay(d.code)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${days.includes(d.code) ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
            {saveMut.isPending ? "Saving..." : item ? "Update Clinic" : "Create Clinic"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// REFERRALS TAB — incoming/outgoing specialty referrals
// =====================================================================
function ReferralsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [specialtyFilter, setSpecialtyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);

  // Fetch from the unified /api/referrals endpoint with kind=specialty filter.
  // This consolidates specialty referrals into the same lifecycle as
  // inter-facility referrals (timeline, feedback, communication log, etc.).
  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  params.set("kind", "specialty");
  if (specialtyFilter !== "all") params.set("toDepartmentCode", specialtyFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);
  params.set("limit", "200");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["specialty-referrals", activeFacilityId, params.toString()],
    queryFn: () => fetchJson(`/api/referrals?${params.toString()}`),
    enabled: !!activeFacilityId,
    staleTime: 0,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => sendJson(`/api/referrals/${id}`, "PATCH", data),
    onSuccess: () => {
      toast.success("Referral updated");
      qc.invalidateQueries({ queryKey: ["specialty-referrals"] });
      qc.invalidateQueries({ queryKey: ["specialty-stats"] });
      qc.invalidateQueries({ queryKey: ["referrals"] });
      qc.invalidateQueries({ queryKey: ["referrals-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700">Specialty Referrals</p>
            <p className="text-xs text-slate-500">Incoming referrals from OPD/ER/other departments to specialty clinics. Unified with the main Referrals lifecycle.</p>
          </div>
          <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Specialties</SelectItem>{SPECIALTIES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="sent">Pending</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="rejected">Declined</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }} disabled={isFetching}>
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setShowNew(true)} className="gap-1 bg-gradient-to-r from-amber-500 to-orange-600 text-white">
              <Plus className="w-4 h-4" /> New Referral
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={5} /> :
       items.length === 0 ? <EmptyState title="No referrals" description="Create a new referral to a specialty clinic." icon={Share2} /> :
       <DataTable
         headers={["Referral #", "Patient", "To Specialty", "From", "Urgency", "Reason", "Status", "Date", "Actions"]}
         rows={items.map((r) => {
           const sp = SPECIALTY_MAP[r.toDepartmentCode] || SPECIALTIES[0];
           const urgencyColor = r.urgency === "emergency" ? "bg-rose-100 text-rose-700" : r.urgency === "urgent" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700";
           const patientName = r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : "Unknown";
           return {
             cells: [
               <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-amber-500 to-orange-600 px-2 py-0.5 rounded-md font-semibold">{r.referralNumber || r.id.slice(-8).toUpperCase()}</span>,
               <span key="p" className="text-sm font-medium text-slate-900">{patientName}</span>,
               <span key="ts" className="text-xs text-slate-600">{sp.label}</span>,
               <span key="fd" className="text-xs text-slate-500">{r.referringDepartmentId || r.referringFacility?.name || "OPD"}</span>,
               <span key="u" className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${urgencyColor}`}>{r.urgency}</span>,
               <span key="r" className="text-xs text-slate-500 max-w-[160px] truncate inline-block">{r.reason}</span>,
               <StatusBadge key="st" status={r.status} />,
               <span key="d" className="text-xs text-slate-500">{formatDate(r.referredAt)}</span>,
               <div key="a" className="flex gap-1">
                 {(r.status === "sent" || r.status === "acknowledged") && (
                   <>
                     <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] text-emerald-600" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "accepted" } })}>
                       <CheckCircle2 className="w-3 h-3 mr-1" /> Accept
                     </Button>
                     <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-rose-600" onClick={() => {
                       const reason = window.prompt("Rejection reason:");
                       if (reason) updateMutation.mutate({ id: r.id, data: { status: "rejected", rejectionReason: reason } });
                     }}>
                       Decline
                     </Button>
                   </>
                 )}
                 {r.status === "accepted" && (
                   <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "scheduled" } })}>
                     <Calendar className="w-3 h-3 mr-1" /> Schedule
                   </Button>
                 )}
                 {r.status === "scheduled" && (
                   <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] text-emerald-600" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "completed" } })}>
                     <CheckCircle2 className="w-3 h-3 mr-1" /> Complete
                   </Button>
                 )}
               </div>,
             ],
             sortValues: [r.referralNumber || "", patientName, sp.label, r.referringDepartmentId || "", r.urgency, r.reason, r.status, r.referredAt, ""],
           };
         })}
         gradient="from-amber-500 to-orange-600"
         pageSize={10}
       />}

      {showNew && (
        <NewReferralDialog
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            qc.invalidateQueries({ queryKey: ["specialty-referrals"] });
            qc.invalidateQueries({ queryKey: ["specialty-stats"] });
            qc.invalidateQueries({ queryKey: ["referrals"] });
            qc.invalidateQueries({ queryKey: ["referrals-stats"] });
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// NEW REFERRAL DIALOG
// =====================================================================
function NewReferralDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const setView = useAppStore((s) => s.setView);
  const [patient, setPatient] = useState<PatientPickerValue | null>(null);
  const [fromDept, setFromDept] = useState<EntitySelectValue | null>(null);
  const [form, setForm] = useState({
    fromClinicianName: "",
    toDepartmentCode: "CARDIO", toClinicianName: "",
    urgency: "routine", reason: "", clinicalSummary: "",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const createMut = useMutation({
    mutationFn: async (payload: any) => {
      // Transform into unified Referral schema (kind=specialty)
      const referralPayload: any = {
        kind: "specialty",
        referralType: "specialist",
        toDepartmentCode: payload.toDepartmentCode,
        patientIdFrom: payload.patientId,
        referringFacilityId: useAppStore.getState().activeFacilityId,
        receivingFacilityName: `${payload.toDepartmentCode} Clinic${payload.toClinicianName ? ` — ${payload.toClinicianName}` : ""}`,
        receivingProviderName: payload.toClinicianName || undefined,
        referringDepartmentId: payload.fromDepartment || undefined,
        reason: payload.reason,
        clinicalSummary: payload.clinicalSummary || undefined,
        urgency: payload.urgency || "routine",
        status: "sent",
      };
      return sendJson("/api/referrals", "POST", referralPayload);
    },
    onSuccess: () => { toast.success("Referral created"); onCreated(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedSpecialty = SPECIALTY_MAP[form.toDepartmentCode] || SPECIALTIES[0];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            New Specialty Referral
          </DialogTitle>
          <DialogDescription className="text-white/80">Refer a patient to a specialty clinic for consultation or procedure.</DialogDescription>
        </DialogHeader>

        <PatientPicker
          label="Patient"
          required
          value={patient}
          onChange={setPatient}
          onRegisterNew={() => {
            onClose();
            setView("patient_new");
          }}
        />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><Label>Urgency</Label><Select value={form.urgency} onValueChange={(v) => set("urgency", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="routine">Routine</SelectItem><SelectItem value="urgent">Urgent</SelectItem><SelectItem value="emergency">Emergency</SelectItem></SelectContent></Select></div>
          <div className="col-span-2">
            <DepartmentSelect
              label="From Department"
              required
              value={fromDept}
              onChange={setFromDept}
              allowManual
            />
          </div>
          <div><Label>Referring Clinician</Label><Input value={form.fromClinicianName} onChange={(e) => set("fromClinicianName", e.target.value)} /></div>
          <div>
            <FieldLabel>To Specialty</FieldLabel>
            <Select value={form.toDepartmentCode} onValueChange={(v) => set("toDepartmentCode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SPECIALTIES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Receiving Clinician (optional)</Label><Input value={form.toClinicianName} onChange={(e) => set("toClinicianName", e.target.value)} /></div>
          <div className="col-span-2 md:col-span-3"><FieldLabel>Reason for Referral</FieldLabel><Textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} rows={2} placeholder="Brief reason for referral..." /></div>
          <div className="col-span-2 md:col-span-3"><Label>Clinical Summary</Label><Textarea value={form.clinicalSummary} onChange={(e) => set("clinicalSummary", e.target.value)} rows={3} placeholder="Relevant history, findings, current medications..." /></div>
        </div>

        <div className={`p-3 rounded-xl bg-gradient-to-r ${selectedSpecialty.gradient} text-white`}>
          <div className="flex items-center gap-2">
            <selectedSpecialty.icon className="w-5 h-5" />
            <span className="font-bold">Refer to {selectedSpecialty.label}</span>
            {form.urgency !== "routine" && <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full uppercase">{form.urgency}</span>}
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!patient) return;
              const payload: any = {
                ...form,
                fromDepartment: fromDept?.label || null,
                patientId: patient.patientId,
                patientName: patient.patientName,
                patientAge: patient.patientAge || null,
                patientSex: patient.patientSex || null,
                patientPhone: patient.patientPhone || null,
              };
              createMut.mutate(payload);
            }}
            disabled={createMut.isPending || !patient?.patientName || !form.reason || !fromDept?.label}
            className="bg-gradient-to-r from-amber-500 to-orange-600 text-white"
          >
            {createMut.isPending ? "Creating..." : "Create Referral"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

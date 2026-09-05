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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardCheck, Plus, RefreshCcw, Eye, Stethoscope, Calendar, AlertCircle, Users, Activity, CheckCircle2, Play, StopCircle, FileText, ListChecks, PenLine, Droplets } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, formatDate, formatRelative, calculateAge, safeJson, PageHeader, MiniStatCard, ClearableSearch } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";
import { SearchableSelect } from "@/components/ui/searchable-select";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) { const e = await safeJson(res).catch(() => ({})); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

const ROUND_TYPES = [
  { value: "daily", label: "Daily Ward Round" },
  { value: "consultant", label: "Consultant Round" },
  { value: "specialist", label: "Specialist Round" },
  { value: "mdt", label: "Multidisciplinary Round" },
  { value: "post_op", label: "Post-Operative Round" },
  { value: "emergency", label: "Emergency Round" },
  { value: "maternity", label: "Maternity Round" },
  { value: "pediatric", label: "Pediatric Round" },
  { value: "icu", label: "ICU/HDU Round" },
  { value: "weekend", label: "Weekend Round" },
  { value: "night", label: "Night Round" },
  { value: "discharge_planning", label: "Discharge Planning Round" },
  { value: "transfer_review", label: "Transfer Review" },
  { value: "follow_up", label: "Follow-Up Round" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "stat", label: "STAT" },
];

const ACTION_TYPES = [
  { value: "order_lab", label: "Order Lab" },
  { value: "review_lab", label: "Review Lab" },
  { value: "order_imaging", label: "Order Imaging" },
  { value: "review_imaging", label: "Review Imaging" },
  { value: "adjust_medication", label: "Adjust Medication" },
  { value: "request_consult", label: "Request Consult" },
  { value: "perform_procedure", label: "Perform Procedure" },
  { value: "nursing_intervention", label: "Nursing Intervention" },
  { value: "patient_education", label: "Patient Education" },
  { value: "discharge_preparation", label: "Discharge Preparation" },
  { value: "referral", label: "Referral" },
  { value: "transfer", label: "Transfer" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "other", label: "Other" },
];

const PROGRESS_STATUSES = [
  { value: "improving", label: "Improving" },
  { value: "stable", label: "Stable" },
  { value: "deteriorating", label: "Deteriorating" },
  { value: "new_concern", label: "New Concern" },
  { value: "resolved", label: "Resolved" },
  { value: "awaiting_investigation", label: "Awaiting Investigation" },
  { value: "awaiting_procedure", label: "Awaiting Procedure" },
  { value: "awaiting_specialist", label: "Awaiting Specialist" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-rose-100 text-rose-700",
  rescheduled: "bg-violet-100 text-violet-700",
};

export function WardRoundsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [wardFilter, setWardFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ward-rounds"] });
    qc.invalidateQueries({ queryKey: ["ward-rounds-stats"] });
    qc.invalidateQueries({ queryKey: ["ward-round-detail"] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ward Rounds"
        description="Comprehensive inpatient clinical review — schedule rounds, review patients, document SOAP notes, track action items"
        icon={ClipboardCheck}
        gradient="from-indigo-500 to-blue-600"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5"><Activity className="w-4 h-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="rounds" className="gap-1.5"><ClipboardCheck className="w-4 h-4" /> Rounds</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <WardRoundDashboard facilityId={activeFacilityId} />
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">Quick Actions</div>
              <div className="flex flex-wrap gap-2">
                {can("ward_round.create") && <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> Schedule Round</Button>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rounds" className="space-y-3">
          <Card>
            <CardContent className="p-3 flex flex-wrap gap-3 items-center">
              <Select value={wardFilter} onValueChange={setWardFilter}>
                <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Wards</SelectItem>
                  <WardOptions facilityId={activeFacilityId} />
                </SelectContent>
              </Select>
              <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="md:w-40" />
              {dateFilter && <Button size="sm" variant="ghost" onClick={() => setDateFilter("")}>Clear</Button>}
              {can("ward_round.create") && <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 ml-auto"><Plus className="w-4 h-4" /> New Round</Button>}
            </CardContent>
          </Card>

          <RoundsList facilityId={activeFacilityId} wardFilter={wardFilter} dateFilter={dateFilter} onView={(id) => setViewingId(id)} />
        </TabsContent>
      </Tabs>

      {showNew && <NewWardRoundDialog onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} />}
      {viewingId && <WardRoundDetailDialog roundId={viewingId} onClose={() => setViewingId(null)} onChanged={invalidate} canManage={can("ward_round.document")} canSign={can("ward_round.sign")} canComplete={can("ward_round.complete")} canAction={can("ward_round.action.manage")} />}
    </div>
  );
}

// Ward options helper
function WardOptions({ facilityId }: { facilityId: string | null }) {
  const { data } = useQuery({ queryKey: ["wr-wards", facilityId], queryFn: () => fetchJson(`/api/wards?facilityId=${facilityId || ""}`), enabled: !!facilityId });
  return <>{(data?.items || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</>;
}

// Dashboard
function WardRoundDashboard({ facilityId }: { facilityId: string | null }) {
  const { data, isLoading } = useQuery({ queryKey: ["ward-rounds-stats", facilityId], queryFn: () => fetchJson(`/api/ward-rounds/stats?facilityId=${facilityId || ""}`) });
  if (isLoading) return <LoadingState rows={4} />;
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      <MiniStatCard label="Today's Rounds" value={data.todayRounds} icon={ClipboardCheck} gradient="from-indigo-500 to-blue-600" />
      <MiniStatCard label="Scheduled" value={data.scheduledRounds} icon={Calendar} gradient="from-blue-500 to-blue-600" />
      <MiniStatCard label="Active" value={data.activeRounds} icon={Play} gradient="from-amber-500 to-amber-600" />
      <MiniStatCard label="Completed Today" value={data.completedToday} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
      <MiniStatCard label="Patients Reviewed" value={data.reviewedToday} icon={Users} gradient="from-teal-500 to-cyan-600" />
      <MiniStatCard label="Pending Actions" value={data.pendingActions} icon={ListChecks} gradient="from-amber-500 to-orange-600" />
      <MiniStatCard label="Actions Done" value={data.completedActionsToday} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
      <MiniStatCard label="Overdue Actions" value={data.overdueActions} icon={AlertCircle} gradient="from-rose-500 to-rose-600" />
      <MiniStatCard label="Total Rounds" value={data.totalRounds} icon={ClipboardCheck} gradient="from-slate-500 to-slate-600" />
      <MiniStatCard label="Total Patients" value={data.totalPatients} icon={Users} gradient="from-violet-500 to-violet-600" />
      <MiniStatCard label="Cancelled Today" value={data.cancelledToday} icon={AlertCircle} gradient="from-rose-500 to-rose-600" />
    </div>
  );
}

// Rounds List
function RoundsList({ facilityId, wardFilter, dateFilter, onView }: any) {
  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  if (wardFilter !== "all") params.set("wardId", wardFilter);
  if (dateFilter) params.set("date", dateFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["ward-rounds", facilityId, wardFilter, dateFilter], queryFn: () => fetchJson(`/api/ward-rounds${qs}`) });
  const items = data?.items || [];

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load ward rounds" onRetry={() => refetch()} />;
  if (items.length === 0) return <Card><CardContent className="p-6"><EmptyState title="No ward rounds" description="Schedule a new ward round to get started." /></CardContent></Card>;

  return (
    <div className="space-y-2">
      {items.map((r: any) => (
        <Card key={r.id} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => onView(r.id)}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {r.ward && <Badge variant="outline" className="text-emerald-700 border-emerald-200">{r.ward.name}</Badge>}
                  <Badge variant="outline" className="text-xs capitalize">{r.roundType?.replace(/_/g, " ") || "daily"}</Badge>
                  <Badge className={`text-[10px] ${STATUS_COLORS[r.status] || "bg-slate-100 text-slate-700"}`}>{r.status?.replace(/_/g, " ") || "scheduled"}</Badge>
                  <Badge variant="outline" className="text-xs">{r.priority || "routine"}</Badge>
                  <span className="text-xs text-slate-500">{formatDate(r.roundDate, true)}</span>
                </div>
                {r.notes && <p className="text-sm text-slate-700 line-clamp-1">{r.notes}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Stethoscope className="w-3 h-3" /> {r.consultant ? `${r.consultant.firstName} ${r.consultant.lastName}` : "—"}</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {r.patientsSeenIds?.length || 0} patient(s)</span>
                </div>
              </div>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><Eye className="w-4 h-4" /></Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// New Ward Round Dialog (enhanced with roundType, priority, status)
function NewWardRoundDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [form, setForm] = useState({
    facilityId: activeFacilityId || "", wardId: "", consultantId: "",
    roundDate: "", notes: "", planChanges: "",
    roundType: "daily", priority: "routine",
  });
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const { data: wardsData } = useQuery({ queryKey: ["wr-form-wards", form.facilityId], queryFn: () => fetchJson(`/api/wards?facilityId=${form.facilityId}`), enabled: !!form.facilityId });
  const { data: usersData } = useQuery({ queryKey: ["wr-users"], queryFn: () => fetchJson("/api/users/assignable") });
  const { data: admissionsData } = useQuery({ queryKey: ["wr-admissions", form.facilityId], queryFn: () => fetchJson(`/api/admissions?facilityId=${form.facilityId}&status=admitted&limit=200`), enabled: !!form.facilityId });
  const wards = wardsData?.items || [];
  const users = usersData?.items || [];
  const admissions = (admissionsData?.items || []).filter((a: any) => !form.wardId || a.bedAssignments?.some((ba: any) => ba.wardId === form.wardId));
  const filteredAdmissions = admissions.filter((a: any) => !search || a.patient?.firstName?.toLowerCase().includes(search.toLowerCase()) || a.patient?.lastName?.toLowerCase().includes(search.toLowerCase()) || a.patient?.patientNumber?.toLowerCase().includes(search.toLowerCase()));

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ward-rounds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, facilityId: form.facilityId, wardId: form.wardId || undefined, consultantId: form.consultantId || undefined, roundDate: form.roundDate ? new Date(form.roundDate).toISOString() : undefined, patientsSeen: selectedPatientIds, notes: form.notes || undefined, planChanges: form.planChanges || undefined }) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => { toast.success("Ward round scheduled"); onCreated(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><ClipboardCheck className="w-5 h-5" /> Schedule Ward Round</DialogTitle>
          <DialogDescription className="text-white/80">Schedule a round with type, priority, consultant, and patient list.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><Label>Ward</Label><Select value={form.wardId || "_none"} onValueChange={(v) => setForm({ ...form, wardId: v === "_none" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="_none">— All wards —</SelectItem>{wards.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Round Type</Label><Select value={form.roundType} onValueChange={(v) => setForm({ ...form, roundType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROUND_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Consultant</Label><SearchableSelect options={users.map((u: any) => ({ value: u.id, label: u.name || `${u.firstName} ${u.lastName}`, description: `@${u.username}`, secondary: u.professionalRole || u.roles?.[0] || null, initials: u.initials }))} value={form.consultantId} onValueChange={(v) => setForm({ ...form, consultantId: v })} placeholder="Select consultant" searchPlaceholder="Search..." emptyText="No staff found" /></div>
            <div><Label>Round Date / Time</Label><Input type="datetime-local" value={form.roundDate} onChange={(e) => setForm({ ...form, roundDate: e.target.value })} /></div>
          </div>
          <div>
            <FieldLabel required>Patients</FieldLabel>
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search admitted patients..." className="mb-2" />
            <div className="border rounded max-h-48 overflow-y-auto">
              {filteredAdmissions.length === 0 ? <div className="p-3 text-center text-sm text-slate-500">No admitted patients</div> : filteredAdmissions.map((a: any) => (
                <label key={a.id} className="flex items-center gap-2 p-2 hover:bg-emerald-50 cursor-pointer border-b last:border-0">
                  <Checkbox checked={selectedPatientIds.includes(a.id)} onCheckedChange={() => setSelectedPatientIds((p) => p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id])} />
                  <div className="flex-1 text-sm"><span className="font-medium">{a.patient?.firstName} {a.patient?.lastName}</span> <span className="text-xs text-slate-500 ml-1">{a.patient?.patientNumber} · {a.admissionNumber}</span></div>
                </label>
              ))}
            </div>
            <div className="text-xs text-slate-500 mt-1">{selectedPatientIds.length} selected</div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <div><Label>Plan Changes</Label><Textarea value={form.planChanges} onChange={(e) => setForm({ ...form, planChanges: e.target.value })} rows={2} /></div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || selectedPatientIds.length === 0} className="gap-2 bg-emerald-600 hover:bg-emerald-700">{mutation.isPending ? "Saving..." : "Schedule Round"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Ward Round Detail Dialog (enhanced with tabs: Overview, Patients, Notes, Actions)
function WardRoundDetailDialog({ roundId, onClose, onChanged, canManage, canSign, canComplete, canAction }: any) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["ward-round-detail", roundId], queryFn: () => fetchJson(`/api/ward-rounds/${roundId}`) });
  const r = data?.item;
  const [detailTab, setDetailTab] = useState("overview");
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [showAddPatient, setShowAddPatient] = useState(false);

  if (isLoading) return <Dialog open onOpenChange={onClose}><DialogContent className="max-w-4xl"><div className="p-8 text-center text-slate-500">Loading…</div></DialogContent></Dialog>;
  if (!r) return <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden"><div className="p-4 text-rose-600">Not found</div></DialogContent></Dialog>;

  const lifecycleAction = async (action: string) => {
    try {
      const res = await fetch(`/api/ward-rounds/${roundId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success(`Round ${action === "start" ? "started" : action === "complete" ? "completed" : "cancelled"}`);
      onChanged(); refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="text-white flex items-center gap-2 text-xl flex-wrap">
            <ClipboardCheck className="w-5 h-5" />
            <span>{r.ward?.name || "General Round"}</span>
            <Badge className={`text-[10px] ${STATUS_COLORS[r.status] || "bg-slate-100 text-slate-700"}`}>{r.status?.replace(/_/g, " ")}</Badge>
            <Badge variant="outline" className="capitalize">{r.roundType?.replace(/_/g, " ")}</Badge>
            <Badge variant="outline">{r.priority}</Badge>
          </DialogTitle>
          <DialogDescription className="text-white/80">{formatDate(r.roundDate, true)} • Consultant: {r.consultant ? `${r.consultant.firstName} ${r.consultant.lastName}` : "—"}</DialogDescription>
        </DialogHeader>

        {/* Lifecycle buttons */}
        {r.status === "scheduled" && canManage && (
          <div className="px-6 py-2 border-b flex gap-2">
            <Button size="sm" onClick={() => lifecycleAction("start")} className="gap-1.5 bg-amber-600 hover:bg-amber-700"><Play className="w-3.5 h-3.5" /> Start Round</Button>
            <Button size="sm" variant="outline" onClick={() => lifecycleAction("cancel")} className="text-rose-600">Cancel</Button>
          </div>
        )}
        {r.status === "in_progress" && canComplete && (
          <div className="px-6 py-2 border-b flex gap-2">
            <Button size="sm" onClick={() => lifecycleAction("complete")} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"><StopCircle className="w-3.5 h-3.5" /> Complete Round</Button>
            <Button size="sm" variant="outline" onClick={() => lifecycleAction("cancel")} className="text-rose-600">Cancel</Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <TabsList className="flex flex-wrap h-auto w-full mb-3">
              <TabsTrigger value="overview" className="gap-1.5"><Activity className="w-4 h-4" /> Overview</TabsTrigger>
              <TabsTrigger value="patients" className="gap-1.5"><Users className="w-4 h-4" /> Patients ({r.roundPatients?.length || 0})</TabsTrigger>
              <TabsTrigger value="notes" className="gap-1.5"><FileText className="w-4 h-4" /> Notes ({r.roundNotes?.length || 0})</TabsTrigger>
              <TabsTrigger value="actions" className="gap-1.5"><ListChecks className="w-4 h-4" /> Actions ({r.roundActions?.length || 0})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-3">
              {r.notes && <div className="bg-slate-50 rounded p-3"><div className="text-xs text-slate-500 font-medium uppercase mb-1">Round Notes</div><div className="text-sm whitespace-pre-wrap">{r.notes}</div></div>}
              {r.planChanges && <div className="bg-amber-50 rounded p-3 border border-amber-100"><div className="text-xs text-amber-700 font-medium uppercase mb-1">Plan Changes</div><div className="text-sm whitespace-pre-wrap">{r.planChanges}</div></div>}
              <div className="text-xs text-slate-500">Created by {r.createdBy?.firstName} {r.createdBy?.lastName} • {formatDate(r.createdAt, true)}{r.completedAt && ` • Completed ${formatDate(r.completedAt, true)}`}</div>
            </TabsContent>

            <TabsContent value="patients" className="space-y-3">
              {canManage && r.status === "in_progress" && <Button size="sm" onClick={() => setShowAddPatient(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Patient</Button>}
              {(r.roundPatients || []).length === 0 ? <EmptyState title="No patients in this round" /> : (
                <div className="space-y-2">
                  {(r.roundPatients || []).map((rp: any) => (
                    <div key={rp.id} className="border rounded p-3 bg-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-slate-900">{rp.patient?.firstName} {rp.patient?.lastName}</span>
                          <span className="ml-2 text-xs text-slate-500">{rp.patient?.patientNumber}</span>
                          <Badge className={`ml-2 text-[10px] ${rp.reviewStatus === "reviewed" ? "bg-emerald-100 text-emerald-700" : rp.reviewStatus === "not_available" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{rp.reviewStatus?.replace(/_/g, " ")}</Badge>
                          {rp.progressStatus && <Badge variant="outline" className="ml-1 text-[10px] capitalize">{rp.progressStatus?.replace(/_/g, " ")}</Badge>}
                        </div>
                        {canManage && r.status === "in_progress" && rp.reviewStatus === "pending" && (
                          <Button size="sm" variant="ghost" className="h-6 text-xs text-emerald-600" onClick={async () => {
                            const res = await fetch(`/api/ward-rounds/${roundId}/patients`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wardRoundPatientId: rp.id, action: "review" }) });
                            if (res.ok) { toast.success("Patient marked reviewed"); onChanged(); refetch(); } else toast.error("Failed");
                          }}>Mark Reviewed</Button>
                        )}
                      </div>
                      {rp.overnightEvents && <div className="text-xs text-slate-600 mt-1">Overnight: {rp.overnightEvents}</div>}
                      {rp.clinicalAlerts && <div className="text-xs text-rose-600 mt-1">⚠ {rp.clinicalAlerts}</div>}
                      {/* Read-only I&O clinical summary — referenced from existing I&O records, never duplicated */}
                      <WardRoundIOSummary patientId={rp.patientId} admissionId={rp.admissionId} />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="notes" className="space-y-3">
              {canManage && r.status === "in_progress" && <Button size="sm" onClick={() => setShowNoteDialog(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Add SOAP Note</Button>}
              {(r.roundNotes || []).length === 0 ? <EmptyState title="No round notes" /> : (
                <div className="space-y-2">
                  {(r.roundNotes || []).map((n: any) => (
                    <div key={n.id} className="border rounded p-3 bg-white">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px]">{n.patient?.firstName} {n.patient?.lastName}</Badge>
                        <Badge className={`text-[10px] ${n.status === "signed" ? "bg-emerald-100 text-emerald-700" : n.status === "amended" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"}`}>{n.status}</Badge>
                        {n.progressStatus && <Badge variant="outline" className="text-[10px] capitalize">{n.progressStatus?.replace(/_/g, " ")}</Badge>}
                      </div>
                      {n.subjective && <div className="text-xs text-slate-600"><strong>S:</strong> {n.subjective}</div>}
                      {n.objective && <div className="text-xs text-slate-600"><strong>O:</strong> {n.objective}</div>}
                      {n.assessment && <div className="text-xs text-slate-600"><strong>A:</strong> {n.assessment}</div>}
                      {n.plan && <div className="text-xs text-slate-600"><strong>P:</strong> {n.plan}</div>}
                      {n.content && <div className="text-sm text-slate-700 mt-1">{n.content}</div>}
                      <div className="text-xs text-slate-500 mt-1">{formatDate(n.authoredAt, true)}{n.signedAt && ` • Signed ${formatDate(n.signedAt, true)}`}</div>
                      {n.status === "draft" && canSign && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs text-emerald-600 mt-1" onClick={async () => {
                          const res = await fetch(`/api/ward-rounds/${roundId}/notes`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sign", noteId: n.id }) });
                          if (res.ok) { toast.success("Note signed"); onChanged(); refetch(); } else toast.error("Failed");
                        }}><PenLine className="w-3 h-3" /> Sign</Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="actions" className="space-y-3">
              {canAction && r.status === "in_progress" && <Button size="sm" onClick={() => setShowActionDialog(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Action</Button>}
              {(r.roundActions || []).length === 0 ? <EmptyState title="No action items" /> : (
                <div className="space-y-2">
                  {(r.roundActions || []).map((a: any) => (
                    <div key={a.id} className="border rounded p-3 bg-white flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] capitalize">{a.actionType?.replace(/_/g, " ")}</Badge>
                          <Badge className={`text-[10px] ${a.status === "completed" ? "bg-emerald-100 text-emerald-700" : a.status === "cancelled" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{a.status}</Badge>
                          <Badge variant="outline" className="text-[10px]">{a.priority}</Badge>
                        </div>
                        <div className="text-sm font-medium mt-1">{a.title}</div>
                        {a.patient && <div className="text-xs text-slate-500">{a.patient.firstName} {a.patient.lastName}</div>}
                        {a.assignedToName && <div className="text-xs text-slate-500">→ {a.assignedToName} ({a.assignedToRole || "—"})</div>}
                        {a.dueDate && <div className="text-xs text-slate-500">Due: {formatDate(a.dueDate)}</div>}
                      </div>
                      {canAction && a.status === "pending" && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs text-emerald-600" onClick={async () => {
                          const res = await fetch(`/api/ward-rounds/${roundId}/actions`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionId: a.id, action: "complete" }) });
                          if (res.ok) { toast.success("Action completed"); onChanged(); refetch(); } else toast.error("Failed");
                        }}>Complete</Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>

      {showNoteDialog && <NoteDialog roundId={roundId} onClose={() => setShowNoteDialog(false)} onCreated={() => { setShowNoteDialog(false); onChanged(); refetch(); }} />}
      {showActionDialog && <ActionDialog roundId={roundId} patients={r.roundPatients || []} onClose={() => setShowActionDialog(false)} onCreated={() => { setShowActionDialog(false); onChanged(); refetch(); }} />}
      {showAddPatient && <AddPatientDialog roundId={roundId} facilityId={r.facilityId} onClose={() => setShowAddPatient(false)} onCreated={() => { setShowAddPatient(false); onChanged(); refetch(); }} />}
    </Dialog>
  );
}

// SOAP Note Dialog
function NoteDialog({ roundId, onClose, onCreated }: any) {
  const [form, setForm] = useState({ patientId: "", subjective: "", objective: "", assessment: "", plan: "", content: "", progressStatus: "" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.patientId) { toast.error("Select a patient"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/ward-rounds/${roundId}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Note created (draft)"); onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
      <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle>SOAP Round Note</DialogTitle></DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        <div><FieldLabel required>Patient</FieldLabel><Input value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} placeholder="Patient ID" /></div>
        <div><Label>S — Subjective</Label><Textarea value={form.subjective} onChange={(e) => setForm({ ...form, subjective: e.target.value })} rows={2} placeholder="Patient complaints, overnight events..." /></div>
        <div><Label>O — Objective</Label><Textarea value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} rows={2} placeholder="Examination findings, vitals..." /></div>
        <div><Label>A — Assessment</Label><Textarea value={form.assessment} onChange={(e) => setForm({ ...form, assessment: e.target.value })} rows={2} placeholder="Clinical assessment, progress..." /></div>
        <div><Label>P — Plan</Label><Textarea value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} rows={2} placeholder="Treatment plan, decisions..." /></div>
        <div><Label>Progress Status</Label><Select value={form.progressStatus || "_none"} onValueChange={(v) => setForm({ ...form, progressStatus: v === "_none" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="_none">— None —</SelectItem>{PROGRESS_STATUSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Additional Notes</Label><Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={2} /></div>
      </div>
      <DialogFooter className="p-6 pt-4 shrink-0 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving..." : "Save as Draft"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// Action Item Dialog
function ActionDialog({ roundId, patients, onClose, onCreated }: any) {
  const [form, setForm] = useState({ patientId: "", actionType: "order_lab", title: "", description: "", assignedToName: "", assignedToRole: "", dueDate: "", priority: "routine" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.title) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/ward-rounds/${roundId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, patientId: form.patientId || undefined, dueDate: form.dueDate || undefined }) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Action item created"); onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
      <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle>Add Action Item</DialogTitle></DialogHeader>
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        <div><Label>Action Type</Label><Select value={form.actionType} onValueChange={(v) => setForm({ ...form, actionType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ACTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
        <div><FieldLabel required>Title</FieldLabel><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Review CT scan result" /></div>
        <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Assigned To</Label><Input value={form.assignedToName} onChange={(e) => setForm({ ...form, assignedToName: e.target.value })} placeholder="Name" /></div>
          <div><Label>Role</Label><Input value={form.assignedToRole} onChange={(e) => setForm({ ...form, assignedToRole: e.target.value })} placeholder="e.g., Doctor" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          <div><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></div>
        </div>
      </div>
      <DialogFooter className="p-6 pt-4 shrink-0 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving..." : "Create Action"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// Add Patient Dialog
function AddPatientDialog({ roundId, facilityId, onClose, onCreated }: any) {
  const [search, setSearch] = useState("");
  const { data: admissionsData } = useQuery({ queryKey: ["wr-add-patient", facilityId], queryFn: () => fetchJson(`/api/admissions?facilityId=${facilityId}&status=admitted&limit=200`), enabled: !!facilityId });
  const admissions = (admissionsData?.items || []).filter((a: any) => !search || a.patient?.firstName?.toLowerCase().includes(search.toLowerCase()) || a.patient?.lastName?.toLowerCase().includes(search.toLowerCase()));
  const [saving, setSaving] = useState(false);
  const add = async (patientId: string, admissionId: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/ward-rounds/${roundId}/patients`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId, admissionId: admissionId || undefined }) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Patient added to round"); onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
      <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle>Add Patient to Round</DialogTitle></DialogHeader>
      <ClearableSearch value={search} onChange={setSearch} placeholder="Search admitted patients..." className="mb-2" />
      <div className="flex-1 overflow-y-auto p-6 max-h-60 overflow-y-auto border rounded">
        {admissions.length === 0 ? <div className="p-3 text-center text-sm text-slate-500">No patients found</div> : admissions.map((a: any) => (
          <button key={a.id} onClick={() => add(a.patientId, a.id)} disabled={saving} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
            <span className="font-medium">{a.patient?.firstName} {a.patient?.lastName}</span>
            <span className="ml-2 text-xs text-slate-500">{a.patient?.patientNumber} · {a.admissionNumber}</span>
          </button>
        ))}
      </div>
    </DialogContent></Dialog>
  );
}

// =====================================================================
// WARD ROUND — I&O CLINICAL SUMMARY (read-only, references existing records)
//   Displays current intake/output, 24h balance, urine, drains, NG losses,
//   trend, and missing entries — pulled from /api/intake-output.
//   Never duplicates data; opens the full I&O view for editing.
// =====================================================================
function WardRoundIOSummary({ patientId, admissionId }: { patientId: string; admissionId?: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["wr-io-summary", patientId, admissionId],
    queryFn: () => fetchJson(`/api/intake-output?patientId=${patientId}&admissionId=${admissionId || ""}&view=summary`),
    enabled: !!patientId,
  });
  if (isLoading) return <div className="mt-2 text-[10px] text-slate-400">Loading I&O summary…</div>;
  if (!data?.summary) return null;
  const s = data.summary;
  const today = s.today || {};
  const rolling = s.rolling24h || {};
  const monitoring = s.monitoringPeriod;

  const fmtMl = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} ml`);
  const fmtSigned = (n: number | null | undefined) => {
    if (n == null) return "—";
    return `${n > 0 ? "+" : ""}${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} ml`;
  };

  return (
    <div className="mt-2 border-t pt-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-1">
        <Droplets className="w-3 h-3 text-teal-600" /> Fluid Balance Summary
        {monitoring ? (
          <span className="ml-1 text-cyan-700">· monitoring active ({monitoring.monitoringLevel})</span>
        ) : (
          <span className="ml-1 text-slate-400">· no active monitoring</span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-1.5 text-[11px]">
        <div className="bg-emerald-50 rounded px-1.5 py-1">
          <div className="text-[9px] text-slate-500">Today intake</div>
          <div className="font-bold text-emerald-700">{fmtMl(today.intake)}</div>
        </div>
        <div className="bg-amber-50 rounded px-1.5 py-1">
          <div className="text-[9px] text-slate-500">Today output</div>
          <div className="font-bold text-amber-700">{fmtMl(today.output)}</div>
        </div>
        <div className="bg-teal-50 rounded px-1.5 py-1">
          <div className="text-[9px] text-slate-500">Today net</div>
          <div className={`font-bold ${(today.net || 0) >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSigned(today.net)}</div>
        </div>
        <div className="bg-blue-50 rounded px-1.5 py-1">
          <div className="text-[9px] text-slate-500">24h net</div>
          <div className={`font-bold ${(rolling.net || 0) >= 0 ? "text-blue-700" : "text-rose-700"}`}>{fmtSigned(rolling.net)}</div>
        </div>
        <div className="bg-violet-50 rounded px-1.5 py-1">
          <div className="text-[9px] text-slate-500">24h urine</div>
          <div className="font-bold text-violet-700">{fmtMl(rolling.urine)}</div>
          {rolling.urinePerHour ? <div className="text-[9px] text-slate-500">{rolling.urinePerHour.toFixed(0)} ml/h</div> : null}
        </div>
        <div className={`rounded px-1.5 py-1 ${(s.missingCount || 0) > 0 ? "bg-rose-50" : "bg-slate-50"}`}>
          <div className="text-[9px] text-slate-500">Missing slots</div>
          <div className={`font-bold ${(s.missingCount || 0) > 0 ? "text-rose-700" : "text-emerald-700"}`}>{s.missingCount || 0}</div>
        </div>
      </div>
      {/* Output breakdown for clinical context */}
      {(rolling.drains > 0 || rolling.ng > 0 || rolling.vomit > 0) && (
        <div className="mt-1 text-[10px] text-slate-600">
          {rolling.drains > 0 && <span className="mr-2">Drains: <span className="font-medium text-amber-700">{fmtMl(rolling.drains)}</span></span>}
          {rolling.ng > 0 && <span className="mr-2">NG: <span className="font-medium text-rose-700">{fmtMl(rolling.ng)}</span></span>}
          {rolling.vomit > 0 && <span className="mr-2">Vomit: <span className="font-medium text-rose-700">{fmtMl(rolling.vomit)}</span></span>}
        </div>
      )}
      {/* Weight-based urine output (only if weight exists) */}
      {rolling.urinePerKgPerHour != null && s.weightKg && (
        <div className="mt-1 text-[10px] text-slate-600">
          Urine/kg/h: <span className="font-medium text-violet-700">{rolling.urinePerKgPerHour.toFixed(2)} ml/kg/h</span>
          <span className="ml-1 text-slate-400">(weight {s.weightKg} kg)</span>
        </div>
      )}
      {/* Documented targets */}
      {(monitoring?.dailyTargetMl || monitoring?.dailyLimitMl) && (
        <div className="mt-1 text-[10px]">
          {monitoring?.dailyTargetMl && <span className="mr-2 text-emerald-700">Target: {fmtMl(monitoring.dailyTargetMl)}</span>}
          {monitoring?.dailyLimitMl && <span className="text-rose-700">Restriction: {fmtMl(monitoring.dailyLimitMl)}</span>}
        </div>
      )}
      {s.lastEntry && (
        <div className="mt-1 text-[10px] text-slate-500">
          Last entry: {s.lastEntry.entryType} {fmtMl(s.lastEntry.amount)} ({s.lastEntry.category || s.lastEntry.source}) · {formatRelative(s.lastEntry.eventAt)}
        </div>
      )}
      <div className="mt-1 text-[10px] text-slate-400">
        ⚠ This is a referenced summary — open Intake & Output module to record new entries. Missing entries are NOT treated as 0 mL.
      </div>
    </div>
  );
}

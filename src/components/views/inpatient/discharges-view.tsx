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
import {
  LogOut, Plus, RefreshCcw, Search as SearchIcon, AlertCircle, Activity, CheckCircle2,
  Clock, FileText, ListChecks, Printer, Download, Stethoscope, Bed, User, DollarSign,
  Pill, ClipboardCheck, ChevronRight, ChevronLeft, X, Play, Pause, FileBarChart,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative, calculateAge,
  safeJson, PageHeader, MiniStatCard, ClearableSearch, usePagination, Pagination,
} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

// ---- Constants ----
const DISCHARGE_TYPES = [
  { value: "routine", label: "Routine / Planned Discharge" },
  { value: "transfer_to_facility", label: "Transfer to Another Facility" },
  { value: "transfer_to_ward", label: "Transfer to Another Ward" },
  { value: "ama", label: "Against Medical Advice (DAMA)" },
  { value: "absconded", label: "Left Before Completion (Absconded)" },
  { value: "deceased", label: "Death / Expired" },
  { value: "other", label: "Other" },
];

const DISPOSITIONS = [
  { value: "home", label: "Home" },
  { value: "transferred", label: "Transferred" },
  { value: "referred", label: "Referred" },
  { value: "deceased", label: "Deceased" },
  { value: "ama", label: "Left Against Medical Advice" },
  { value: "absconded", label: "Absconded" },
  { value: "other", label: "Other" },
];

const CONDITIONS = [
  { value: "stable", label: "Stable" },
  { value: "improved", label: "Improved" },
  { value: "recovered", label: "Recovered" },
  { value: "referred", label: "Referred" },
  { value: "transferred", label: "Transferred" },
  { value: "unchanged", label: "Unchanged" },
  { value: "deteriorated", label: "Deteriorated" },
  { value: "other", label: "Other" },
];

const DELAY_REASONS = [
  "Awaiting test results", "Awaiting medication", "Awaiting transport",
  "Awaiting insurance authorization", "Clinical observation",
  "Family arrangements", "Awaiting documentation", "Other",
];

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-blue-100 text-blue-700 border-blue-200",
  clinical_review: "bg-violet-100 text-violet-700 border-violet-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending_clearance: "bg-amber-100 text-amber-700 border-amber-200",
  pending_billing: "bg-amber-100 text-amber-700 border-amber-200",
  pending_medication: "bg-amber-100 text-amber-700 border-amber-200",
  pending_documentation: "bg-amber-100 text-amber-700 border-amber-200",
  ready: "bg-teal-100 text-teal-700 border-teal-200",
  discharged: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  delayed: "bg-orange-100 text-orange-700 border-orange-200",
};

const CHECKLIST_CATEGORIES: Record<string, { label: string; icon: any; color: string }> = {
  clinical: { label: "Clinical", icon: Stethoscope, color: "text-blue-600" },
  nursing: { label: "Nursing", icon: ClipboardCheck, color: "text-violet-600" },
  pharmacy: { label: "Pharmacy", icon: Pill, color: "text-amber-600" },
  financial: { label: "Financial", icon: DollarSign, color: "text-emerald-600" },
  records: { label: "Records", icon: FileText, color: "text-slate-600" },
  follow_up: { label: "Follow-up", icon: Clock, color: "text-cyan-600" },
  transport: { label: "Transport", icon: Activity, color: "text-orange-600" },
  patient_education: { label: "Patient Education", icon: User, color: "text-pink-600" },
};

const MED_ACTIONS = [
  { value: "continue", label: "Continue", color: "text-emerald-700 bg-emerald-50" },
  { value: "stop", label: "Stop", color: "text-rose-700 bg-rose-50" },
  { value: "change", label: "Change", color: "text-amber-700 bg-amber-50" },
  { value: "new", label: "New", color: "text-blue-700 bg-blue-50" },
  { value: "hold", label: "Hold", color: "text-slate-700 bg-slate-50" },
];

// =====================================================================
// MAIN VIEW
// =====================================================================
export function DischargesView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canDischarge = can("admission.discharge");
  const canEdit = can("admission.edit") || canDischarge;

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [showNew, setShowNew] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["discharges"] });
    qc.invalidateQueries({ queryKey: ["discharge-stats"] });
    qc.invalidateQueries({ queryKey: ["admissions"] });
    qc.invalidateQueries({ queryKey: ["beds"] });
  };

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (typeFilter !== "all") params.set("dischargeType", typeFilter);
  if (dateFilter) {
    params.set("from", dateFilter);
    params.set("to", dateFilter);
  }
  const qs = params.toString() ? `?${params.toString()}` : "";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Discharges"
        description="Complete hospital discharge lifecycle — request, review, clearance, finalize, summary, follow-up"
        icon={LogOut}
        gradient="from-indigo-500 to-blue-600"
        actions={
          <Button onClick={() => setShowNew(true)} disabled={!canDischarge || !activeFacilityId} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Request Discharge
          </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view discharges.</CardContent></Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5"><Activity className="w-4 h-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5"><ListChecks className="w-4 h-4" /> Work Queue</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><Clock className="w-4 h-4" /> History</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><FileBarChart className="w-4 h-4" /> Reports</TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* DASHBOARD */}
        {/* ============================================================ */}
        <TabsContent value="dashboard" className="space-y-4">
          <DischargeDashboard facilityId={activeFacilityId} />
        </TabsContent>

        {/* ============================================================ */}
        {/* WORK QUEUE — pending discharges */}
        {/* ============================================================ */}
        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardContent className="p-3 flex flex-wrap gap-3 items-center">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="md:w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="pending_clearance">Pending clearance</SelectItem>
                  <SelectItem value="ready">Ready for discharge</SelectItem>
                  <SelectItem value="delayed">Delayed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="md:w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {DISCHARGE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="md:w-40 h-8 text-xs" />
              {(statusFilter !== "all" || typeFilter !== "all" || dateFilter) && (
                <Button size="sm" variant="ghost" onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setDateFilter(""); }} className="h-8 text-xs">Clear filters</Button>
              )}
            </CardContent>
          </Card>
          <DischargeQueue facilityId={activeFacilityId} qs={qs} onView={(id) => setViewingId(id)} canEdit={canEdit} />
        </TabsContent>

        {/* ============================================================ */}
        {/* HISTORY — finalized discharges */}
        {/* ============================================================ */}
        <TabsContent value="history" className="space-y-4">
          <DischargeHistory facilityId={activeFacilityId} onView={(id) => setViewingId(id)} />
        </TabsContent>

        {/* ============================================================ */}
        {/* REPORTS */}
        {/* ============================================================ */}
        <TabsContent value="reports" className="space-y-4">
          <ReportsPanel facilityId={activeFacilityId} />
        </TabsContent>
      </Tabs>

      {showNew && (
        <NewDischargeDialog
          facilityId={activeFacilityId || ""}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); invalidate(); setViewingId(id); setTab("queue"); }}
        />
      )}
      {viewingId && (
        <DischargeDetailDialog
          dischargeId={viewingId}
          onClose={() => setViewingId(null)}
          onChanged={invalidate}
          canEdit={canEdit}
          canDischarge={canDischarge}
        />
      )}
    </div>
  );
}

// =====================================================================
// DASHBOARD
// =====================================================================
function DischargeDashboard({ facilityId }: { facilityId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["discharge-stats", facilityId],
    queryFn: () => fetchJson(`/api/discharges/stats?facilityId=${facilityId || ""}`),
    enabled: !!facilityId,
  });
  if (isLoading) return <LoadingState rows={4} />;
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <MiniStatCard label="Today's Discharges" value={data.todayDischarges} icon={LogOut} gradient="from-indigo-500 to-blue-600" />
      <MiniStatCard label="Pending Requests" value={data.pending} icon={Clock} gradient="from-blue-500 to-blue-600" />
      <MiniStatCard label="Approved" value={data.approved} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
      <MiniStatCard label="Ready" value={data.ready} icon={Play} gradient="from-teal-500 to-cyan-600" />
      <MiniStatCard label="Delayed" value={data.delayed} icon={AlertCircle} gradient="from-orange-500 to-orange-600" />
      <MiniStatCard label="Cancelled" value={data.cancelled} icon={X} gradient="from-rose-500 to-rose-600" />
      <MiniStatCard label="Total Discharged" value={data.finalized} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
      <MiniStatCard label="This Week" value={data.weekDischarges} icon={Activity} gradient="from-cyan-500 to-cyan-600" />
      <MiniStatCard label="This Month" value={data.monthDischarges} icon={FileText} gradient="from-violet-500 to-violet-600" />
      <MiniStatCard label="Avg LOS (days)" value={data.los?.average ?? "—"} icon={Clock} gradient="from-slate-500 to-slate-600" />
      <MiniStatCard label="Pending Clinical" value={data.pendingClinical} icon={Stethoscope} gradient="from-blue-500 to-blue-600" />
      <MiniStatCard label="Pending Pharmacy" value={data.pendingPharmacy} icon={Pill} gradient="from-amber-500 to-amber-600" />
    </div>
  );
}

// =====================================================================
// WORK QUEUE
// =====================================================================
function DischargeQueue({ facilityId, qs, onView, canEdit }: any) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["discharges-queue", facilityId, qs],
    queryFn: () => fetchJson(`/api/discharges${qs}&includeChecklist=true`),
    enabled: !!facilityId,
  });
  const items = (data?.items || []).filter((d: any) => d.status !== "discharged");
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 15);

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load discharge queue" onRetry={() => refetch()} />;
  if (items.length === 0) return <Card><CardContent className="p-6"><EmptyState title="No pending discharges" description="Request a discharge from the button above to begin." icon={ListChecks} /></CardContent></Card>;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                <th className="text-left p-3 font-semibold text-slate-700">Ward / Bed</th>
                <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                <th className="text-left p-3 font-semibold text-slate-700">Clearance</th>
                <th className="text-left p-3 font-semibold text-slate-700">Requested</th>
                <th className="text-left p-3 font-semibold text-slate-700">Proposed</th>
                <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((d: any) => {
                const ba = d.admission?.bedAssignments?.[0];
                const clearances = [
                  { key: "C", label: "Clinical", done: d.clinicalCleared, color: "bg-blue-100 text-blue-700 border-blue-200" },
                  { key: "N", label: "Nursing", done: d.nursingCleared, color: "bg-violet-100 text-violet-700 border-violet-200" },
                  { key: "P", label: "Pharmacy", done: d.pharmacyCleared, color: "bg-amber-100 text-amber-700 border-amber-200" },
                  { key: "F", label: "Financial", done: d.financialCleared, color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                ];
                const checklistComplete = (d.checklist || []).filter((c: any) => c.status === "completed").length;
                const checklistTotal = (d.checklist || []).length;
                return (
                  <tr key={d.id} className="border-b hover:bg-emerald-50/40 cursor-pointer" onClick={() => onView(d.id)}>
                    <td className="p-3">
                      <div className="font-medium text-slate-900">{d.patient?.firstName} {d.patient?.lastName}</div>
                      <div className="text-xs text-slate-500">{d.patient?.patientNumber} • {d.admission?.admissionNumber}</div>
                    </td>
                    <td className="p-3 text-xs">
                      <div className="font-medium text-slate-700">{ba?.ward?.name || "—"}</div>
                      <div className="text-slate-500">Bed {ba?.bed?.bedNumber || "—"}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px] capitalize">{(d.dischargeType || "routine").replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge className={`text-[10px] ${STATUS_COLORS[d.status] || "bg-slate-100 text-slate-700"}`}>{d.status.replace(/_/g, " ")}</Badge>
                      {checklistTotal > 0 && (
                        <div className="text-[9px] text-slate-500 mt-0.5">{checklistComplete}/{checklistTotal} checklist</div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-0.5">
                        {clearances.map((c) => (
                          <span key={c.key} title={c.label} className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold border ${c.done ? "bg-emerald-500 text-white border-emerald-600" : "bg-slate-100 text-slate-400 border-slate-200"}`}>
                            {c.key}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-slate-500">{d.requestedAt ? formatRelative(d.requestedAt) : "—"}</td>
                    <td className="p-3 text-xs text-slate-500">{d.proposedDischargeAt ? formatDate(d.proposedDischargeAt, true) : "—"}</td>
                    <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onView(d.id)}>Open <ChevronRight className="w-3 h-3" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </CardContent>
    </Card>
  );
}

// =====================================================================
// HISTORY — finalized discharges
// =====================================================================
function DischargeHistory({ facilityId, onView }: any) {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  params.set("from", from);
  params.set("to", to);
  const qs = `?${params.toString()}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["discharges-history", facilityId, from, to],
    queryFn: () => fetchJson(`/api/discharges${qs}`),
    enabled: !!facilityId,
  });
  const allItems = (data?.items || []).filter((d: any) => d.isFinalized);
  const filtered = allItems.filter((d: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${d.patient?.firstName} ${d.patient?.lastName}`.toLowerCase().includes(q)
      || d.patient?.patientNumber?.toLowerCase().includes(q)
      || d.admission?.admissionNumber?.toLowerCase().includes(q)
      || d.dischargeNumber?.toLowerCase().includes(q)
      || (d.finalDiagnosis || "").toLowerCase().includes(q);
  });
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(filtered, 15);

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load discharge history" onRetry={() => refetch()} />;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <ClearableSearch value={search} onChange={setSearch} placeholder="Search patient, admission #, discharge #, diagnosis..." className="flex-1 min-w-[200px]" />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 h-8 text-xs" />
          <span className="text-xs text-slate-400">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 h-8 text-xs" />
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => window.open(`/api/discharges/export?facilityId=${facilityId}&from=${from}&to=${to}`, "_blank")}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No discharge records" description="No finalized discharges match your filters." icon={Clock} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Discharge #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Admission</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Final Diagnosis</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Condition</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Discharged</th>
                    <th className="text-left p-3 font-semibold text-slate-700">LOS</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((d: any) => {
                    const los = d.admissionDate ? ((new Date(d.dischargedAt).getTime() - new Date(d.admissionDate).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1) : "—";
                    return (
                      <tr key={d.id} className="border-b hover:bg-emerald-50/40 cursor-pointer" onClick={() => onView(d.id)}>
                        <td className="p-3 font-mono text-xs text-slate-700">{d.dischargeNumber || "—"}</td>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{d.patient?.firstName} {d.patient?.lastName}</div>
                          <div className="text-xs text-slate-500">{d.patient?.patientNumber}</div>
                        </td>
                        <td className="p-3 font-mono text-xs text-slate-700">{d.admission?.admissionNumber}</td>
                        <td className="p-3"><Badge variant="outline" className="text-[10px] capitalize">{(d.dischargeType || "routine").replace(/_/g, " ")}</Badge></td>
                        <td className="p-3 text-xs text-slate-700 max-w-xs truncate">{d.finalDiagnosis || "—"}</td>
                        <td className="p-3 text-xs capitalize text-slate-700">{d.dischargeConditions || "—"}</td>
                        <td className="p-3 text-xs text-slate-500">{formatDate(d.dischargedAt, true)}</td>
                        <td className="p-3 text-xs text-slate-700">{los} d</td>
                        <td className="p-3 text-right"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onView(d.id)}>Open <ChevronRight className="w-3 h-3" /></Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// NEW DISCHARGE REQUEST DIALOG
// =====================================================================
function NewDischargeDialog({ facilityId, onClose, onCreated }: any) {
  const [admissionId, setAdmissionId] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<any>({
    dischargeType: "routine",
    disposition: "home",
    proposedDischargeAt: "",
    requestReason: "",
    dischargeSummary: "",
    finalDiagnosis: "",
    primaryDiagnosisCode: "",
    primaryDiagnosisName: "",
    dischargeConditions: "improved",
    adviceOnDischarge: "",
    followUpPlan: "",
    followUpAppointmentDate: "",
    followUpClinic: "",
    // Transfer
    transferDestination: "", transferReceivingFacility: "", transferReceivingDept: "",
    transferContactPerson: "", transferContactPhone: "", transferReason: "", transferTransportMethod: "",
    // DAMA
    damaReason: "", damaRisksExplained: false, damaAdviceProvided: "", damaWitnessName: "",
    // Death
    deathDate: "", deathCause: "",
    // Absconded
    abscondedLastSeenAt: "", abscondedLastLocation: "", abscondedCircumstances: "", abscondedStaffNotified: "",
    // Instructions
    instructionsMedication: "", instructionsDiet: "", instructionsActivity: "", instructionsWoundCare: "",
    instructionsFollowUp: "", instructionsWarningSigns: "", instructionsEmergency: "", instructionsOther: "",
  });
  const [saving, setSaving] = useState(false);

  // Load admitted patients
  const { data: admissionsData, isLoading: loadingAdmissions } = useQuery({
    queryKey: ["discharge-admissions", facilityId],
    queryFn: () => fetchJson(`/api/admissions?facilityId=${facilityId}&status=admitted&limit=200`),
    enabled: !!facilityId,
  });
  const admittedPatients = (admissionsData?.items || []).filter((a: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.patient?.firstName?.toLowerCase().includes(q)
      || a.patient?.lastName?.toLowerCase().includes(q)
      || a.patient?.patientNumber?.toLowerCase().includes(q)
      || a.admissionNumber?.toLowerCase().includes(q);
  });

  const submit = async () => {
    if (!admissionId) { toast.error("Select a patient/admission"); return; }
    setSaving(true);
    try {
      const payload: any = { ...form, admissionId, immediateFinalize: false };
      // Convert dates
      if (form.proposedDischargeAt) payload.proposedDischargeAt = new Date(form.proposedDischargeAt).toISOString();
      if (form.followUpAppointmentDate) payload.followUpAppointmentDate = new Date(form.followUpAppointmentDate).toISOString();
      if (form.deathDate) payload.deathDate = new Date(form.deathDate).toISOString();
      if (form.abscondedLastSeenAt) payload.abscondedLastSeenAt = new Date(form.abscondedLastSeenAt).toISOString();
      const res = await fetch("/api/discharges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      const data = await safeJson(res);
      toast.success("Discharge requested — admission remains active until finalization");
      onCreated(data.item?.id);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const selectedAdmission = (admissionsData?.items || []).find((a: any) => a.id === admissionId);
  const isTransfer = form.dischargeType === "transfer_to_facility" || form.dischargeType === "transfer_to_ward";
  const isDAMA = form.dischargeType === "ama";
  const isDeath = form.dischargeType === "deceased";
  const isAbsconded = form.dischargeType === "absconded";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><LogOut className="w-5 h-5" /> Request Discharge</DialogTitle>
          <DialogDescription className="text-white/80">Initiate a discharge request. The admission remains active until the discharge is finalized.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Patient selection */}
          <div>
            <FieldLabel required>Select Admitted Patient</FieldLabel>
            {!admissionId ? (
              <>
                <ClearableSearch value={search} onChange={setSearch} placeholder="Search admitted patient by name, number, or admission #..." />
                <div className="mt-2 border rounded max-h-48 overflow-y-auto">
                  {loadingAdmissions ? <div className="p-3 text-sm text-slate-500">Loading...</div> :
                    admittedPatients.length === 0 ? <div className="p-3 text-sm text-slate-500">No matching admitted patients</div> :
                    admittedPatients.map((a: any) => (
                      <button key={a.id} onClick={() => setAdmissionId(a.id)} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                        <div className="font-medium">{a.patient?.firstName} {a.patient?.lastName} <span className="text-xs text-slate-500 ml-1">{a.patient?.patientNumber}</span></div>
                        <div className="text-xs text-slate-500">{a.admissionNumber} • {a.bedAssignments?.[0]?.ward?.name || "—"} / Bed {a.bedAssignments?.[0]?.bed?.bedNumber || "—"}</div>
                      </button>
                    ))
                  }
                </div>
              </>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm flex items-center justify-between">
                <div>
                  <div className="font-medium">{selectedAdmission?.patient?.firstName} {selectedAdmission?.patient?.lastName}</div>
                  <div className="text-xs text-slate-600">{selectedAdmission?.admissionNumber} • {selectedAdmission?.bedAssignments?.[0]?.ward?.name} / Bed {selectedAdmission?.bedAssignments?.[0]?.bed?.bedNumber}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setAdmissionId("")}>Change</Button>
              </div>
            )}
          </div>

          {admissionId && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel required>Discharge Type</FieldLabel>
                  <Select value={form.dischargeType} onValueChange={(v) => setForm({ ...form, dischargeType: v, disposition: v === "deceased" ? "deceased" : v === "ama" ? "ama" : v === "absconded" ? "absconded" : v === "transfer_to_facility" ? "transferred" : "home" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DISCHARGE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel required>Disposition</FieldLabel>
                  <Select value={form.disposition} onValueChange={(v) => setForm({ ...form, disposition: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DISPOSITIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Proposed Discharge Date/Time</Label>
                  <Input type="datetime-local" value={form.proposedDischargeAt} onChange={(e) => setForm({ ...form, proposedDischargeAt: e.target.value })} />
                </div>
                <div>
                  <FieldLabel required>Condition at Discharge</FieldLabel>
                  <Select value={form.dischargeConditions} onValueChange={(v) => setForm({ ...form, dischargeConditions: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Reason for Discharge / Request Notes</Label>
                <Textarea value={form.requestReason} onChange={(e) => setForm({ ...form, requestReason: e.target.value })} rows={2} placeholder="e.g., Patient recovered; ready for discharge home" />
              </div>

              {/* Discharge-type-specific sections */}
              {isTransfer && (
                <div className="border rounded p-3 bg-blue-50 space-y-2">
                  <div className="text-sm font-medium text-blue-900">Transfer Details</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={form.transferReceivingFacility} onChange={(e) => setForm({ ...form, transferReceivingFacility: e.target.value })} placeholder="Receiving facility" />
                    <Input value={form.transferReceivingDept} onChange={(e) => setForm({ ...form, transferReceivingDept: e.target.value })} placeholder="Receiving department" />
                    <Input value={form.transferContactPerson} onChange={(e) => setForm({ ...form, transferContactPerson: e.target.value })} placeholder="Contact person" />
                    <Input value={form.transferContactPhone} onChange={(e) => setForm({ ...form, transferContactPhone: e.target.value })} placeholder="Contact phone" />
                    <Textarea value={form.transferReason} onChange={(e) => setForm({ ...form, transferReason: e.target.value })} placeholder="Transfer reason" rows={3} />
                    <Input value={form.transferTransportMethod} onChange={(e) => setForm({ ...form, transferTransportMethod: e.target.value })} placeholder="Transport method (ambulance, private, etc.)" />
                  </div>
                </div>
              )}

              {isDAMA && (
                <div className="border rounded p-3 bg-rose-50 space-y-2">
                  <div className="text-sm font-medium text-rose-900">DAMA — Against Medical Advice</div>
                  <Textarea value={form.damaReason} onChange={(e) => setForm({ ...form, damaReason: e.target.value })} rows={2} placeholder="Reason patient is leaving against advice" />
                  <div className="flex items-center gap-2">
                    <Checkbox id="damaRisks" checked={form.damaRisksExplained} onCheckedChange={(v) => setForm({ ...form, damaRisksExplained: !!v })} />
                    <Label htmlFor="damaRisks" className="text-xs">Risks explained to patient/caregiver</Label>
                  </div>
                  <Textarea value={form.damaAdviceProvided} onChange={(e) => setForm({ ...form, damaAdviceProvided: e.target.value })} rows={2} placeholder="Alternative care advice provided" />
                  <Input value={form.damaWitnessName} onChange={(e) => setForm({ ...form, damaWitnessName: e.target.value })} placeholder="Witness name (if required)" />
                </div>
              )}

              {isDeath && (
                <div className="border rounded p-3 bg-slate-100 space-y-2">
                  <div className="text-sm font-medium text-slate-900">Death Documentation</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="datetime-local" value={form.deathDate} onChange={(e) => setForm({ ...form, deathDate: e.target.value })} placeholder="Date/time of death" />
                    <Input value={form.deathCause} onChange={(e) => setForm({ ...form, deathCause: e.target.value })} placeholder="Cause of death (if documented)" />
                  </div>
                </div>
              )}

              {isAbsconded && (
                <div className="border rounded p-3 bg-amber-50 space-y-2">
                  <div className="text-sm font-medium text-amber-900">Absconded / Left Without Notice</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="datetime-local" value={form.abscondedLastSeenAt} onChange={(e) => setForm({ ...form, abscondedLastSeenAt: e.target.value })} placeholder="Last seen at" />
                    <Input value={form.abscondedLastLocation} onChange={(e) => setForm({ ...form, abscondedLastLocation: e.target.value })} placeholder="Last known location" />
                  </div>
                  <Textarea value={form.abscondedCircumstances} onChange={(e) => setForm({ ...form, abscondedCircumstances: e.target.value })} rows={2} placeholder="Circumstances" />
                  <Input value={form.abscondedStaffNotified} onChange={(e) => setForm({ ...form, abscondedStaffNotified: e.target.value })} placeholder="Staff notified" />
                </div>
              )}

              {/* Clinical summary */}
              <div className="border-t pt-3">
                <div className="text-sm font-semibold text-slate-700 mb-2">Clinical Summary (optional at request stage)</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Input value={form.primaryDiagnosisCode} onChange={(e) => setForm({ ...form, primaryDiagnosisCode: e.target.value })} placeholder="Primary diagnosis code (ICD-10)" />
                  <Input value={form.primaryDiagnosisName} onChange={(e) => setForm({ ...form, primaryDiagnosisName: e.target.value })} placeholder="Primary diagnosis name" />
                </div>
                <Textarea value={form.finalDiagnosis} onChange={(e) => setForm({ ...form, finalDiagnosis: e.target.value })} rows={2} placeholder="Final diagnosis" className="mb-2" />
                <Textarea value={form.dischargeSummary} onChange={(e) => setForm({ ...form, dischargeSummary: e.target.value })} rows={3} placeholder="Clinical summary / discharge summary" />
              </div>

              {/* Follow-up */}
              <div className="border-t pt-3">
                <div className="text-sm font-semibold text-slate-700 mb-2">Follow-up</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={form.followUpAppointmentDate} onChange={(e) => setForm({ ...form, followUpAppointmentDate: e.target.value })} placeholder="Follow-up date" />
                  <Input value={form.followUpClinic} onChange={(e) => setForm({ ...form, followUpClinic: e.target.value })} placeholder="Follow-up clinic/department" />
                </div>
              </div>

              {/* Discharge instructions */}
              <div className="border-t pt-3">
                <div className="text-sm font-semibold text-slate-700 mb-2">Discharge Instructions (optional at request stage)</div>
                <div className="grid grid-cols-2 gap-2">
                  <Textarea value={form.instructionsMedication} onChange={(e) => setForm({ ...form, instructionsMedication: e.target.value })} rows={1} placeholder="Medication instructions" />
                  <Textarea value={form.instructionsDiet} onChange={(e) => setForm({ ...form, instructionsDiet: e.target.value })} rows={1} placeholder="Diet instructions" />
                  <Textarea value={form.instructionsActivity} onChange={(e) => setForm({ ...form, instructionsActivity: e.target.value })} rows={1} placeholder="Activity restrictions" />
                  <Textarea value={form.instructionsWoundCare} onChange={(e) => setForm({ ...form, instructionsWoundCare: e.target.value })} rows={1} placeholder="Wound care instructions" />
                  <Textarea value={form.instructionsWarningSigns} onChange={(e) => setForm({ ...form, instructionsWarningSigns: e.target.value })} rows={1} placeholder="Warning signs to watch for" />
                  <Textarea value={form.instructionsEmergency} onChange={(e) => setForm({ ...form, instructionsEmergency: e.target.value })} rows={1} placeholder="Emergency contact instructions" />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !admissionId} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            {saving ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Request Discharge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// DISCHARGE DETAIL DIALOG — tabs: Overview / Clinical / Checklist / Medications / Clearance / Summary
// =====================================================================
function DischargeDetailDialog({ dischargeId, onClose, onChanged, canEdit, canDischarge }: any) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["discharge-detail", dischargeId],
    queryFn: () => fetchJson(`/api/discharges/${dischargeId}`),
  });
  const [detailTab, setDetailTab] = useState("overview");
  const d = data?.item;

  const lifecycle = async (action: string, extra: any = {}) => {
    try {
      const res = await fetch("/api/discharges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dischargeId, action, ...extra }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success(`Discharge ${action}ed`);
      onChanged(); refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) return <Dialog open onOpenChange={onClose}><DialogContent className="max-w-4xl"><div className="p-8 text-center text-slate-500">Loading…</div></DialogContent></Dialog>;
  if (!d) return <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden"><div className="p-4 text-rose-600">Not found</div></DialogContent></Dialog>;

  const isFinalized = d.isFinalized;
  const ba = d.admission?.bedAssignments?.[0];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2 text-xl flex-wrap">
            <LogOut className="w-5 h-5" />
            <span>{d.patient?.firstName} {d.patient?.lastName}</span>
            <span className="text-xs text-white/80">{d.patient?.patientNumber}</span>
            <Badge className={`text-[10px] ${STATUS_COLORS[d.status] || "bg-slate-100 text-slate-700"}`}>{d.status.replace(/_/g, " ")}</Badge>
            {d.dischargeNumber && <Badge variant="outline" className="text-[10px] font-mono text-white border-white/40">{d.dischargeNumber}</Badge>}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {d.admission?.admissionNumber} • {ba?.ward?.name || "—"} / Bed {ba?.bed?.bedNumber || "—"}
            {" • "}Admitted {formatDate(d.admission?.admittedAt, true)}
            {isFinalized && ` • Discharged ${formatDate(d.dischargedAt, true)}`}
          </DialogDescription>
        </DialogHeader>

        {/* Lifecycle action buttons */}
        {!isFinalized && (
          <div className="px-6 py-2 border-b flex flex-wrap gap-2 bg-slate-50">
            {d.status === "requested" && canEdit && (
              <Button size="sm" onClick={() => lifecycle("approve")} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 h-8"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</Button>
            )}
            {d.status === "delayed" && canEdit && (
              <Button size="sm" onClick={() => lifecycle("resume")} className="gap-1.5 bg-blue-600 hover:bg-blue-700 h-8"><Play className="w-3.5 h-3.5" /> Resume</Button>
            )}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => {
                const reason = prompt("Delay reason:");
                if (!reason) return;
                const dept = prompt("Responsible department (optional):") || "";
                const expected = prompt("Expected discharge date (YYYY-MM-DD, optional):") || "";
                lifecycle("delay", { delayReason: reason, delayDepartment: dept, expectedDischargeAt: expected || undefined });
              }} className="gap-1.5 h-8"><Pause className="w-3.5 h-3.5" /> Mark Delayed</Button>
            )}
            {d.status !== "cancelled" && canEdit && (
              <Button size="sm" variant="outline" onClick={() => {
                const reason = prompt("Reason for cancelling this discharge:");
                if (!reason) return;
                lifecycle("cancel", { cancelReason: reason });
              }} className="gap-1.5 text-rose-600 h-8"><X className="w-3.5 h-3.5" /> Cancel</Button>
            )}
            {canDischarge && (
              <Button size="sm" onClick={() => {
                if (!confirm("Finalize this discharge? This will close the admission, release the bed (set to cleaning), and create the final discharge record. This cannot be undone.")) return;
                lifecycle("finalize");
              }} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 ml-auto h-8"><LogOut className="w-3.5 h-3.5" /> Finalize Discharge</Button>
            )}
          </div>
        )}
        {isFinalized && (
          <div className="px-6 py-2 border-b flex flex-wrap gap-2 bg-emerald-50">
            <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3 mr-1" /> Finalized</Badge>
            <span className="text-xs text-slate-600">Discharge #{d.dischargeNumber} • Finalized by {d.finalizedBy?.firstName} {d.finalizedBy?.lastName} • {formatDate(d.finalizedAt, true)}</span>
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs gap-1.5" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Print Summary</Button>
            {canEdit && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => {
                const reason = prompt("Amendment reason (required):");
                if (!reason) return;
                const newSummary = prompt("New discharge summary (leave blank to keep):", d.dischargeSummary || "");
                lifecycle("amend", { amendmentReason: reason, dischargeSummary: newSummary || undefined });
              }}><FileText className="w-3.5 h-3.5" /> Amend</Button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <TabsList className="flex flex-wrap h-auto w-full mb-3">
              <TabsTrigger value="overview" className="gap-1.5"><Activity className="w-4 h-4" /> Overview</TabsTrigger>
              <TabsTrigger value="clinical" className="gap-1.5"><Stethoscope className="w-4 h-4" /> Clinical Review</TabsTrigger>
              <TabsTrigger value="checklist" className="gap-1.5"><ListChecks className="w-4 h-4" /> Checklist ({(d.checklist || []).filter((c: any) => c.status === "completed").length}/{(d.checklist || []).length})</TabsTrigger>
              <TabsTrigger value="medications" className="gap-1.5"><Pill className="w-4 h-4" /> Medications ({(d.medicationsReconciliation || []).length})</TabsTrigger>
              <TabsTrigger value="clearance" className="gap-1.5"><CheckCircle2 className="w-4 h-4" /> Clearance</TabsTrigger>
              <TabsTrigger value="summary" className="gap-1.5"><FileText className="w-4 h-4" /> Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="border rounded p-2"><div className="text-[10px] uppercase text-slate-500">Discharge Type</div><div className="font-medium capitalize">{(d.dischargeType || "routine").replace(/_/g, " ")}</div></div>
                <div className="border rounded p-2"><div className="text-[10px] uppercase text-slate-500">Disposition</div><div className="font-medium capitalize">{d.disposition || "—"}</div></div>
                <div className="border rounded p-2"><div className="text-[10px] uppercase text-slate-500">Condition</div><div className="font-medium capitalize">{d.dischargeConditions || "—"}</div></div>
                <div className="border rounded p-2"><div className="text-[10px] uppercase text-slate-500">Proposed</div><div className="font-medium">{d.proposedDischargeAt ? formatDate(d.proposedDischargeAt, true) : "—"}</div></div>
              </div>
              {d.finalDiagnosis && <div className="bg-slate-50 rounded p-3"><div className="text-xs text-slate-500 font-medium uppercase mb-1">Final Diagnosis</div><div className="text-sm">{d.finalDiagnosis}</div></div>}
              {d.dischargeSummary && <div className="bg-slate-50 rounded p-3"><div className="text-xs text-slate-500 font-medium uppercase mb-1">Discharge Summary</div><div className="text-sm whitespace-pre-wrap">{d.dischargeSummary}</div></div>}
              {d.requestReason && <div className="bg-blue-50 rounded p-3"><div className="text-xs text-blue-700 font-medium uppercase mb-1">Request Reason</div><div className="text-sm">{d.requestReason}</div></div>}
              {d.cancelReason && <div className="bg-rose-50 rounded p-3 border border-rose-200"><div className="text-xs text-rose-700 font-medium uppercase mb-1">Cancel Reason</div><div className="text-sm">{d.cancelReason}</div></div>}
              {d.delayReason && <div className="bg-orange-50 rounded p-3 border border-orange-200"><div className="text-xs text-orange-700 font-medium uppercase mb-1">Delay Reason</div><div className="text-sm">{d.delayReason} {d.delayDepartment && `(${d.delayDepartment})`}</div>{d.expectedDischargeAt && <div className="text-xs text-slate-600 mt-1">Expected: {formatDate(d.expectedDischargeAt, true)}</div>}</div>}
              <div className="text-xs text-slate-500">
                Requested by {d.requestedBy?.firstName} {d.requestedBy?.lastName} • {formatDate(d.requestedAt, true)}
                {d.approvedAt && ` • Approved by ${d.approvedBy?.firstName} ${d.approvedBy?.lastName} • ${formatDate(d.approvedAt, true)}`}
              </div>
            </TabsContent>

            <TabsContent value="clinical" className="space-y-3">
              <ClinicalReview dischargeId={dischargeId} />
            </TabsContent>

            <TabsContent value="checklist" className="space-y-3">
              <ChecklistPanel dischargeId={dischargeId} checklist={d.checklist || []} canEdit={canEdit && !isFinalized} onChanged={() => { refetch(); onChanged(); }} />
            </TabsContent>

            <TabsContent value="medications" className="space-y-3">
              <MedicationReconciliationPanel dischargeId={dischargeId} medications={d.medicationsReconciliation || []} canEdit={canEdit && !isFinalized} onChanged={() => { refetch(); onChanged(); }} />
            </TabsContent>

            <TabsContent value="clearance" className="space-y-3">
              <ClearancePanel discharge={d} canEdit={canEdit && !isFinalized} onChanged={() => { refetch(); onChanged(); }} />
            </TabsContent>

            <TabsContent value="summary" className="space-y-3">
              <DischargeSummary discharge={d} />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// CLINICAL REVIEW — pulls diagnoses, labs, imaging, vitals, etc.
// =====================================================================
function ClinicalReview({ dischargeId }: { dischargeId: string }) {
  const { data } = useQuery({
    queryKey: ["discharge-detail", dischargeId],
    queryFn: () => fetchJson(`/api/discharges/${dischargeId}`),
  });
  const c = data?.clinical || {};
  const billing = data?.billing || {};

  return (
    <div className="space-y-3">
      {/* Diagnoses */}
      <Card><CardContent className="p-3">
        <div className="text-xs font-semibold text-slate-700 uppercase mb-2">Diagnoses ({(c.diagnoses || []).length})</div>
        {(c.diagnoses || []).length === 0 ? <div className="text-xs text-slate-400">No diagnoses recorded</div> :
          <div className="space-y-1">{(c.diagnoses || []).slice(0, 10).map((dg: any) => (
            <div key={dg.id} className="text-xs flex items-center gap-2">
              <Badge variant="outline" className="text-[9px] capitalize">{dg.diagnosisType}</Badge>
              <span className="font-medium text-slate-900">{dg.diagnosisName}</span>
              {dg.diagnosisCode && <span className="text-slate-500 font-mono">{dg.diagnosisCode}</span>}
              {dg.isChronic && <Badge className="text-[9px] bg-rose-100 text-rose-700">Chronic</Badge>}
            </div>
          ))}</div>
        }
      </CardContent></Card>

      {/* Allergies */}
      <Card><CardContent className="p-3">
        <div className="text-xs font-semibold text-slate-700 uppercase mb-2">Allergies ({(c.allergies || []).length})</div>
        {(c.allergies || []).length === 0 ? <div className="text-xs text-emerald-700">No known allergies</div> :
          <div className="flex flex-wrap gap-1">{(c.allergies || []).map((a: any) => (
            <Badge key={a.id} className="text-[10px] bg-rose-100 text-rose-700 border-rose-200">{a.allergen} {a.severity && `(${a.severity})`}</Badge>
          ))}</div>
        }
      </CardContent></Card>

      {/* Recent Vitals */}
      <Card><CardContent className="p-3">
        <div className="text-xs font-semibold text-slate-700 uppercase mb-2">Recent Vitals ({(c.vitals || []).length})</div>
        {(c.vitals || []).length === 0 ? <div className="text-xs text-slate-400">No vitals recorded</div> :
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{(c.vitals || []).slice(0, 4).map((v: any) => (
            <div key={v.id} className="text-xs border rounded p-2">
              <div className="text-[10px] text-slate-500">{formatDate(v.recordedAt, true)}</div>
              <div className="font-mono">T:{v.temperature || "—"} P:{v.pulse || "—"} BP:{v.systolicBp || "—"}/{v.diastolicBp || "—"}</div>
              <div className="font-mono text-[10px]">RR:{v.respiratoryRate || "—"} SpO₂:{v.oxygenSaturation || "—"}</div>
            </div>
          ))}</div>
        }
      </CardContent></Card>

      {/* Recent Labs */}
      <Card><CardContent className="p-3">
        <div className="text-xs font-semibold text-slate-700 uppercase mb-2">Recent Lab Orders ({(c.labOrders || []).length})</div>
        {(c.labOrders || []).length === 0 ? <div className="text-xs text-slate-400">No lab orders</div> :
          <div className="space-y-1">{(c.labOrders || []).slice(0, 5).map((lo: any) => (
            <div key={lo.id} className="text-xs">
              <span className="font-medium">{lo.orderNumber || lo.id}</span>
              <span className="ml-2 text-slate-500">{formatDate(lo.orderedAt, true)}</span>
              <span className="ml-2 text-slate-600">{lo.items?.length || 0} test(s)</span>
            </div>
          ))}</div>
        }
      </CardContent></Card>

      {/* Recent Imaging */}
      <Card><CardContent className="p-3">
        <div className="text-xs font-semibold text-slate-700 uppercase mb-2">Recent Imaging ({(c.imagingOrders || []).length})</div>
        {(c.imagingOrders || []).length === 0 ? <div className="text-xs text-slate-400">No imaging orders</div> :
          <div className="space-y-1">{(c.imagingOrders || []).slice(0, 5).map((io: any) => (
            <div key={io.id} className="text-xs">
              <span className="font-medium">{io.studyType}</span>
              <span className="ml-2 text-slate-500">{formatDate(io.orderedAt, true)}</span>
              <Badge variant="outline" className="ml-2 text-[9px]">{io.status}</Badge>
            </div>
          ))}</div>
        }
      </CardContent></Card>

      {/* Billing summary */}
      <Card><CardContent className="p-3">
        <div className="text-xs font-semibold text-slate-700 uppercase mb-2">Billing Summary</div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="border rounded p-2"><div className="text-[10px] text-slate-500">Total Billed</div><div className="font-bold text-slate-900">{billing.totalBilled?.toLocaleString() || 0}</div></div>
          <div className="border rounded p-2"><div className="text-[10px] text-slate-500">Total Paid</div><div className="font-bold text-emerald-700">{billing.totalPaid?.toLocaleString() || 0}</div></div>
          <div className="border rounded p-2"><div className="text-[10px] text-slate-500">Outstanding</div><div className="font-bold text-rose-700">{billing.outstandingBalance?.toLocaleString() || 0}</div></div>
        </div>
      </CardContent></Card>
    </div>
  );
}

// =====================================================================
// CHECKLIST PANEL
// =====================================================================
function ChecklistPanel({ dischargeId, checklist, canEdit, onChanged }: any) {
  const grouped: Record<string, any[]> = {};
  for (const item of checklist) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  const updateItem = async (itemId: string, status: string, notes?: string) => {
    try {
      const res = await fetch(`/api/discharges/${dischargeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checklist_update", checklistItemId: itemId, status, notes }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  const completed = checklist.filter((c: any) => c.status === "completed").length;
  const total = checklist.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-700">Discharge Checklist</div>
          <Badge className={`text-[10px] ${pct === 100 ? "bg-emerald-100 text-emerald-700" : pct > 50 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>{completed}/{total} ({pct}%)</Badge>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
        </div>
      </CardContent></Card>

      {Object.entries(grouped).map(([cat, items]) => {
        const cfg = CHECKLIST_CATEGORIES[cat] || { label: cat, icon: ListChecks, color: "text-slate-600" };
        const Icon = cfg.icon;
        return (
          <Card key={cat}><CardContent className="p-3">
            <div className="text-xs font-semibold text-slate-700 uppercase mb-2 flex items-center gap-1.5"><Icon className={`w-3.5 h-3.5 ${cfg.color}`} /> {cfg.label}</div>
            <div className="space-y-1">
              {items.map((item: any) => (
                <div key={item.id} className="flex items-center gap-2 text-xs border-b last:border-0 py-1">
                  {canEdit ? (
                    <Select value={item.status} onValueChange={(v) => updateItem(item.id, v)}>
                      <SelectTrigger className="w-32 h-7 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="not_applicable">N/A</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className={`text-[9px] ${item.status === "completed" ? "bg-emerald-100 text-emerald-700" : item.status === "blocked" ? "bg-rose-100 text-rose-700" : item.status === "not_applicable" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-700"}`}>{item.status === "not_applicable" ? "N/A" : item.status}</Badge>
                  )}
                  <span className={`flex-1 ${item.status === "completed" ? "line-through text-slate-500" : "text-slate-900"}`}>{item.label}</span>
                  {item.required && <span className="text-rose-500 text-[10px]">*</span>}
                  {item.completedBy && <span className="text-[10px] text-slate-500">{item.completedBy?.firstName || "—"} • {formatRelative(item.completedAt)}</span>}
                </div>
              ))}
            </div>
          </CardContent></Card>
        );
      })}
    </div>
  );
}

// =====================================================================
// MEDICATION RECONCILIATION PANEL
// =====================================================================
function MedicationReconciliationPanel({ dischargeId, medications, canEdit, onChanged }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [newMed, setNewMed] = useState<any>({ medicationName: "", strength: "", dose: "", route: "PO", frequency: "", duration: "", quantity: "", instructions: "", action: "continue", preAdmission: false, inpatient: false });

  const addMed = async () => {
    if (!newMed.medicationName) { toast.error("Medication name is required"); return; }
    try {
      const res = await fetch(`/api/discharges/${dischargeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "medication_add", ...newMed }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Medication added");
      setShowAdd(false);
      setNewMed({ medicationName: "", strength: "", dose: "", route: "PO", frequency: "", duration: "", quantity: "", instructions: "", action: "continue", preAdmission: false, inpatient: false });
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  const updateMed = async (medId: string, field: string, value: any) => {
    try {
      const res = await fetch(`/api/discharges/${dischargeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "medication_update", medicationId: medId, [field]: value }),
      });
      if (!res.ok) throw new Error("Failed");
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-700">Medication Reconciliation</div>
          <div className="text-xs text-slate-500">Compare pre-admission, inpatient, and discharge medications. Each requires an action: continue, stop, change, new, or hold.</div>
        </div>
        {canEdit && <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 h-8"><Plus className="w-3.5 h-3.5" /> Add Medication</Button>}
      </CardContent></Card>

      {medications.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No medications reconciled" description="Add discharge medications to begin reconciliation." icon={Pill} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-700">Medication</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Strength / Dose</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Route / Freq</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Duration / Qty</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Action</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Flags</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Dispensed</th>
                  </tr>
                </thead>
                <tbody>
                  {medications.map((m: any) => (
                    <tr key={m.id} className="border-b hover:bg-slate-50">
                      <td className="p-2">
                        <div className="font-medium text-slate-900">{m.medicationName}</div>
                        {m.instructions && <div className="text-[10px] text-slate-500">{m.instructions}</div>}
                      </td>
                      <td className="p-2 text-xs">{m.strength || "—"} / {m.dose || "—"}</td>
                      <td className="p-2 text-xs">{m.route || "—"} / {m.frequency || "—"}</td>
                      <td className="p-2 text-xs">{m.duration || "—"} / {m.quantity || "—"}</td>
                      <td className="p-2">
                        {canEdit ? (
                          <Select value={m.action} onValueChange={(v) => updateMed(m.id, "action", v)}>
                            <SelectTrigger className="h-7 text-[10px] w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {MED_ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={`text-[9px] ${MED_ACTIONS.find((a) => a.value === m.action)?.color || ""}`}>{m.action}</Badge>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {m.preAdmission && <Badge variant="outline" className="text-[9px] mr-1">Pre-adm</Badge>}
                        {m.inpatient && <Badge variant="outline" className="text-[9px]">Inpatient</Badge>}
                      </td>
                      <td className="p-2 text-center">
                        {canEdit ? (
                          <Checkbox checked={m.dispensed} onCheckedChange={(v) => updateMed(m.id, "dispensed", !!v)} />
                        ) : m.dispensed ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" /> : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showAdd && (
        <Dialog open onOpenChange={setShowAdd}>
          <DialogContent className="max-w-lg p-0 gap-0 flex flex-col overflow-hidden">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white"><DialogTitle>Add Discharge Medication</DialogTitle></DialogHeader>
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-2">
              <div className="col-span-2"><FieldLabel required>Medication Name</FieldLabel><Input value={newMed.medicationName} onChange={(e) => setNewMed({ ...newMed, medicationName: e.target.value })} placeholder="e.g., Amoxicillin" /></div>
              <div><Label>Strength</Label><Input value={newMed.strength} onChange={(e) => setNewMed({ ...newMed, strength: e.target.value })} placeholder="500mg" /></div>
              <div><Label>Dose</Label><Input value={newMed.dose} onChange={(e) => setNewMed({ ...newMed, dose: e.target.value })} placeholder="1 tab" /></div>
              <div><Label>Route</Label><Input value={newMed.route} onChange={(e) => setNewMed({ ...newMed, route: e.target.value })} placeholder="PO" /></div>
              <div><Label>Frequency</Label><Input value={newMed.frequency} onChange={(e) => setNewMed({ ...newMed, frequency: e.target.value })} placeholder="TDS" /></div>
              <div><Label>Duration</Label><Input value={newMed.duration} onChange={(e) => setNewMed({ ...newMed, duration: e.target.value })} placeholder="7 days" /></div>
              <div><Label>Quantity</Label><Input value={newMed.quantity} onChange={(e) => setNewMed({ ...newMed, quantity: e.target.value })} placeholder="21 tabs" /></div>
              <div className="col-span-2"><Label>Instructions</Label><Textarea value={newMed.instructions} onChange={(e) => setNewMed({ ...newMed, instructions: e.target.value })} placeholder="Take with food" rows={3} /></div>
              <div>
                <FieldLabel required>Action</FieldLabel>
                <Select value={newMed.action} onValueChange={(v) => setNewMed({ ...newMed, action: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MED_ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3 pb-2">
                <label className="flex items-center gap-1 text-xs"><Checkbox checked={newMed.preAdmission} onCheckedChange={(v) => setNewMed({ ...newMed, preAdmission: !!v })} /> Pre-admission</label>
                <label className="flex items-center gap-1 text-xs"><Checkbox checked={newMed.inpatient} onCheckedChange={(v) => setNewMed({ ...newMed, inpatient: !!v })} /> Inpatient</label>
              </div>
            </div>
            <DialogFooter className="p-6 pt-4 shrink-0 border-t">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={addMed} className="bg-emerald-600 hover:bg-emerald-700">Add Medication</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// =====================================================================
// CLEARANCE PANEL
// =====================================================================
function ClearancePanel({ discharge, canEdit, onChanged }: any) {
  const clearances = [
    { key: "clinical", label: "Clinical Clearance", icon: Stethoscope, done: discharge.clinicalCleared, by: discharge.clinicalClearedBy, at: discharge.clinicalClearedAt, color: "text-blue-600" },
    { key: "nursing", label: "Nursing Clearance", icon: ClipboardCheck, done: discharge.nursingCleared, by: discharge.nursingClearedBy, at: discharge.nursingClearedAt, color: "text-violet-600" },
    { key: "pharmacy", label: "Pharmacy / Medication Clearance", icon: Pill, done: discharge.pharmacyCleared, by: discharge.pharmacyClearedBy, at: discharge.pharmacyClearedAt, color: "text-amber-600" },
    { key: "financial", label: "Financial Clearance", icon: DollarSign, done: discharge.financialCleared, by: discharge.financialClearedBy, at: discharge.financialClearedAt, color: "text-emerald-600" },
  ];

  const toggleClearance = async (type: string, currentVal: boolean) => {
    try {
      const res = await fetch("/api/discharges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dischargeId: discharge.id, action: "clear", clearanceType: type, cleared: !currentVal }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success(`${type} clearance ${!currentVal ? "marked" : "unmarked"}`);
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  const allCleared = clearances.every((c) => c.done);

  return (
    <div className="space-y-3">
      <Card><CardContent className={`p-3 ${allCleared ? "bg-emerald-50" : "bg-amber-50"}`}>
        <div className="flex items-center gap-2 text-sm">
          {allCleared ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className={`font-medium ${allCleared ? "text-emerald-700" : "text-amber-700"}`}>
            {allCleared ? "All clearances complete — ready for discharge finalization" : "Clearances pending — complete all required clearances before finalization"}
          </span>
        </div>
      </CardContent></Card>

      <div className="grid grid-cols-2 gap-3">
        {clearances.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.key} className={c.done ? "border-emerald-200 bg-emerald-50/50" : ""}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-5 h-5 ${c.color}`} />
                    <div>
                      <div className="text-sm font-medium text-slate-900">{c.label}</div>
                      {c.done ? (
                        <div className="text-[10px] text-emerald-700">Cleared by {c.by?.firstName} {c.by?.lastName} • {formatRelative(c.at)}</div>
                      ) : (
                        <div className="text-[10px] text-slate-500">Pending</div>
                      )}
                    </div>
                  </div>
                  {c.done && <CheckCircle2 className="w-5 h-5" />}
                </div>
                {canEdit && (
                  <Button size="sm" variant={c.done ? "outline" : "default"} className={`w-full h-7 text-xs ${c.done ? "" : "bg-emerald-600 hover:bg-emerald-700"}`} onClick={() => toggleClearance(c.key, c.done)}>
                    {c.done ? "Mark Pending" : "Mark Cleared"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card><CardContent className="p-3 bg-blue-50 border-blue-200">
        <div className="text-xs text-blue-900">
          <strong>Clinical vs Administrative Clearance:</strong> Clinical clearance (clinical, nursing) and administrative clearance (pharmacy, financial) are kept separate. A financial issue does NOT automatically block clinical discharge. Hospital policy determines which clearances are required before finalization.
        </div>
      </CardContent></Card>
    </div>
  );
}

// =====================================================================
// DISCHARGE SUMMARY — printable view
// =====================================================================
function DischargeSummary({ discharge: d }: any) {
  return (
    <div className="space-y-3">
      <Card><CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-bold text-slate-900">Discharge Summary</div>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5 h-8"><Printer className="w-3.5 h-3.5" /> Print</Button>
        </div>

        {/* Patient information */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3 pb-3 border-b">
          <div><div className="text-[10px] text-slate-500 uppercase">Patient</div><div className="font-medium">{d.patient?.firstName} {d.patient?.lastName}</div></div>
          <div><div className="text-[10px] text-slate-500 uppercase">Patient #</div><div className="font-mono">{d.patient?.patientNumber}</div></div>
          <div><div className="text-[10px] text-slate-500 uppercase">Sex / DOB</div><div>{d.patient?.sex || "—"} / {d.patient?.dateOfBirth ? formatDate(d.patient.dateOfBirth) : "—"}</div></div>
          <div><div className="text-[10px] text-slate-500 uppercase">Phone</div><div>{d.patient?.phone || "—"}</div></div>
        </div>

        {/* Admission information */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3 pb-3 border-b">
          <div><div className="text-[10px] text-slate-500 uppercase">Admission #</div><div className="font-mono">{d.admission?.admissionNumber}</div></div>
          <div><div className="text-[10px] text-slate-500 uppercase">Admitted</div><div>{formatDate(d.admission?.admittedAt, true)}</div></div>
          <div><div className="text-[10px] text-slate-500 uppercase">Discharged</div><div>{formatDate(d.dischargedAt, true)}</div></div>
          <div><div className="text-[10px] text-slate-500 uppercase">Length of Stay</div><div className="font-medium">{d.admissionDate ? `${((new Date(d.dischargedAt).getTime() - new Date(d.admissionDate).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)} days` : "—"}</div></div>
        </div>

        {/* Clinical information */}
        <div className="space-y-2 text-sm">
          {d.primaryDiagnosisName && <div><div className="text-[10px] text-slate-500 uppercase">Primary Diagnosis</div><div className="font-medium">{d.primaryDiagnosisName} {d.primaryDiagnosisCode && <span className="text-xs text-slate-500 font-mono">({d.primaryDiagnosisCode})</span>}</div></div>}
          {d.finalDiagnosis && <div><div className="text-[10px] text-slate-500 uppercase">Final Diagnosis</div><div>{d.finalDiagnosis}</div></div>}
          {d.dischargeSummary && <div><div className="text-[10px] text-slate-500 uppercase">Clinical Summary</div><div className="whitespace-pre-wrap">{d.dischargeSummary}</div></div>}
          {d.procedures && <div><div className="text-[10px] text-slate-500 uppercase">Procedures Performed</div><div className="whitespace-pre-wrap">{d.procedures}</div></div>}
          {d.dischargeConditions && <div><div className="text-[10px] text-slate-500 uppercase">Condition at Discharge</div><div className="capitalize">{d.dischargeConditions}</div></div>}
          {d.adviceOnDischarge && <div><div className="text-[10px] text-slate-500 uppercase">Advice on Discharge</div><div className="whitespace-pre-wrap">{d.adviceOnDischarge}</div></div>}
        </div>

        {/* Discharge information */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mt-3 pt-3 border-t">
          <div><div className="text-[10px] text-slate-500 uppercase">Discharge Type</div><div className="capitalize">{(d.dischargeType || "routine").replace(/_/g, " ")}</div></div>
          <div><div className="text-[10px] text-slate-500 uppercase">Disposition</div><div className="capitalize">{d.disposition || "—"}</div></div>
          <div><div className="text-[10px] text-slate-500 uppercase">Discharge #</div><div className="font-mono">{d.dischargeNumber || "—"}</div></div>
        </div>

        {/* Follow-up */}
        {(d.followUpAppointmentDate || d.followUpClinic || d.followUpPlan) && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-[10px] text-slate-500 uppercase mb-1">Follow-up</div>
            <div className="text-sm">
              {d.followUpAppointmentDate && <div>Date: {formatDate(d.followUpAppointmentDate, true)}</div>}
              {d.followUpClinic && <div>Clinic: {d.followUpClinic}</div>}
              {d.followUpPlan && <div className="whitespace-pre-wrap mt-1">{d.followUpPlan}</div>}
            </div>
          </div>
        )}

        {/* Instructions */}
        {(d.instructionsMedication || d.instructionsDiet || d.instructionsActivity || d.instructionsWoundCare || d.instructionsWarningSigns || d.instructionsEmergency) && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-[10px] text-slate-500 uppercase mb-1">Discharge Instructions</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {d.instructionsMedication && <div><strong>Medication:</strong> {d.instructionsMedication}</div>}
              {d.instructionsDiet && <div><strong>Diet:</strong> {d.instructionsDiet}</div>}
              {d.instructionsActivity && <div><strong>Activity:</strong> {d.instructionsActivity}</div>}
              {d.instructionsWoundCare && <div><strong>Wound care:</strong> {d.instructionsWoundCare}</div>}
              {d.instructionsWarningSigns && <div><strong>Warning signs:</strong> {d.instructionsWarningSigns}</div>}
              {d.instructionsEmergency && <div><strong>Emergency:</strong> {d.instructionsEmergency}</div>}
            </div>
          </div>
        )}

        {/* Transfer info */}
        {(d.transferReceivingFacility || d.transferDestination) && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-[10px] text-slate-500 uppercase mb-1">Transfer Information</div>
            <div className="text-sm space-y-0.5">
              {d.transferReceivingFacility && <div>Receiving facility: {d.transferReceivingFacility}</div>}
              {d.transferReceivingDept && <div>Department: {d.transferReceivingDept}</div>}
              {d.transferContactPerson && <div>Contact: {d.transferContactPerson} {d.transferContactPhone && `(${d.transferContactPhone})`}</div>}
              {d.transferReason && <div>Reason: {d.transferReason}</div>}
              {d.transferTransportMethod && <div>Transport: {d.transferTransportMethod}</div>}
            </div>
          </div>
        )}

        {/* DAMA */}
        {d.dischargeType === "ama" && d.damaReason && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-[10px] text-rose-700 uppercase mb-1">Against Medical Advice</div>
            <div className="text-sm space-y-0.5">
              <div>Reason: {d.damaReason}</div>
              {d.damaRisksExplained && <div>Risks explained: Yes</div>}
              {d.damaAdviceProvided && <div>Advice provided: {d.damaAdviceProvided}</div>}
              {d.damaWitnessName && <div>Witness: {d.damaWitnessName}</div>}
            </div>
          </div>
        )}

        {/* Death */}
        {d.dischargeType === "deceased" && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-[10px] text-slate-700 uppercase mb-1">Death Documentation</div>
            <div className="text-sm space-y-0.5">
              {d.deathDate && <div>Date/time of death: {formatDate(d.deathDate, true)}</div>}
              {d.deathCause && <div>Cause: {d.deathCause}</div>}
            </div>
          </div>
        )}

        {/* Signatures */}
        <div className="mt-4 pt-3 border-t grid grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-2">Discharging Clinician</div>
            <div className="border-b border-slate-300 h-8"></div>
            <div className="mt-1">{d.dischargedBy?.firstName} {d.dischargedBy?.lastName}</div>
            <div className="text-[10px] text-slate-500">{formatDate(d.dischargedAt, true)}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-2">Patient / Caregiver Acknowledgement</div>
            <div className="border-b border-slate-300 h-8"></div>
            <div className="mt-1">{d.caregiverName || "—"}</div>
            <div className="text-[10px] text-slate-500">{d.acknowledgedAt ? formatDate(d.acknowledgedAt, true) : ""}</div>
          </div>
        </div>
      </CardContent></Card>
    </div>
  );
}

// =====================================================================
// REPORTS PANEL
// =====================================================================
function ReportsPanel({ facilityId }: any) {
  const [reportType, setReportType] = useState("daily");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("type", reportType);
      if (facilityId) params.set("facilityId", facilityId);
      if (reportType === "daily" || reportType === "monthly") params.set("date", date);
      if (reportType === "los" || reportType === "by_type" || reportType === "audit") { params.set("from", from); params.set("to", to); }
      const data = await fetchJson(`/api/discharges/reports?${params.toString()}`);
      setResult(data);
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  const reportTypes = [
    { value: "daily", label: "Daily Discharge Report", needsDate: true },
    { value: "monthly", label: "Monthly Discharge Report", needsDate: true },
    { value: "pending", label: "Pending Discharges", needsDate: false },
    { value: "los", label: "Length of Stay Report", needsRange: true },
    { value: "by_type", label: "Discharge Type Breakdown", needsRange: true },
    { value: "delayed", label: "Delayed Discharges", needsDate: false },
    { value: "audit", label: "Audit Log", needsRange: true },
  ];
  const currentReportType = reportTypes.find((r) => r.value === reportType);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <FieldLabel required>Report Type</FieldLabel>
              <Select value={reportType} onValueChange={(v) => { setReportType(v); setResult(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {reportTypes.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {currentReportType?.needsDate && (
              <div><Label>Date {reportType === "monthly" ? "(any day in month)" : ""}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            )}
            {currentReportType?.needsRange && (
              <>
                <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
                <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              </>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {result ? `${result.count || 0} record(s) found` : "Configure parameters and click Generate"}
            </div>
            <div className="flex gap-2">
              {result && (result.items?.length > 0 || reportType === "by_type") && (
                <Button variant="outline" onClick={() => window.open(`/api/discharges/export?facilityId=${facilityId}&from=${from}&to=${to}`, "_blank")} className="gap-2 h-8">
                  <Download className="w-4 h-4" /> CSV Export
                </Button>
              )}
              <Button onClick={generate} disabled={loading} className="gap-2 bg-indigo-600 hover:bg-indigo-700 h-8">
                {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <FileBarChart className="w-4 h-4" />} Generate Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="p-4">
            {/* Empty state */}
            {(!result.items || result.items.length === 0) && reportType !== "by_type" && (
              <div className="text-center py-8">
                <FileBarChart className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <div className="text-sm font-medium text-slate-700">No records found for this report</div>
                <div className="text-xs text-slate-500 mt-1">
                  {reportType === "daily" && `No discharges (requested or finalized) on ${date}.`}
                  {reportType === "monthly" && `No discharges in ${result.month}.`}
                  {reportType === "pending" && "No pending discharge requests. Create one from the Work Queue tab."}
                  {reportType === "delayed" && "No delayed discharges. All clear!"}
                  {reportType === "los" && `No finalized discharges with admission date between ${from} and ${to}.`}
                  {reportType === "audit" && `No discharge audit events between ${from} and ${to}.`}
                </div>
                {(reportType === "daily" || reportType === "monthly" || reportType === "pending") && (
                  <div className="text-[10px] text-slate-400 mt-2 max-w-md mx-auto">
                    Tip: Discharge reports include both pending requests AND finalized discharges. To populate reports,
                    admit a patient from the Admissions module, then request a discharge from the Work Queue tab.
                  </div>
                )}
              </div>
            )}

            {/* Daily report — table */}
            {reportType === "daily" && result.items?.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-2">Daily Discharge Report — {result.date}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="text-left p-2 font-semibold text-slate-700">Discharge #</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Patient</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Admission #</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Ward / Bed</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Diagnosis</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Discharged By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((d: any) => {
                        const ba = d.admission?.bedAssignments?.[0];
                        return (
                          <tr key={d.id} className="border-b hover:bg-slate-50">
                            <td className="p-2 font-mono text-[10px]">{d.dischargeNumber || "—"}</td>
                            <td className="p-2"><div className="font-medium">{d.patient?.firstName} {d.patient?.lastName}</div><div className="text-[10px] text-slate-500">{d.patient?.patientNumber}</div></td>
                            <td className="p-2 font-mono text-[10px]">{d.admission?.admissionNumber}</td>
                            <td className="p-2 text-[10px]">{ba?.ward?.name || "—"} / {ba?.bed?.bedNumber || "—"}</td>
                            <td className="p-2 capitalize">{(d.dischargeType || "routine").replace(/_/g, " ")}</td>
                            <td className="p-2"><Badge className={`text-[9px] ${STATUS_COLORS[d.status] || ""}`}>{d.status.replace(/_/g, " ")}</Badge></td>
                            <td className="p-2 text-[10px] max-w-xs truncate">{d.finalDiagnosis || "—"}</td>
                            <td className="p-2 text-[10px]">{d.dischargedBy?.firstName || d.requestedBy?.firstName || "—"} {d.dischargedBy?.lastName || d.requestedBy?.lastName || ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Monthly report — summary + table */}
            {reportType === "monthly" && result.items?.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-3">Monthly Discharge Report — {result.month}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                  <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Total</div><div className="text-xl font-bold text-indigo-700">{result.count}</div></div>
                  {Object.entries(result.byStatus || {}).slice(0, 3).map(([s, c]) => (
                    <div key={s} className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500 capitalize">{s.replace(/_/g, " ")}</div><div className="text-xl font-bold text-slate-700">{c as number}</div></div>
                  ))}
                </div>
                {Object.keys(result.byType || {}).length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-slate-500 uppercase mb-1">By Type</div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(result.byType).map(([t, c]) => (
                        <Badge key={t} variant="outline" className="text-[10px] capitalize">{t.replace(/_/g, " ")}: {c as number}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="text-left p-2 font-semibold text-slate-700">Patient</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Admission #</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((d: any) => (
                        <tr key={d.id} className="border-b hover:bg-slate-50">
                          <td className="p-2"><div className="font-medium">{d.patient?.firstName} {d.patient?.lastName}</div><div className="text-[10px] text-slate-500">{d.patient?.patientNumber}</div></td>
                          <td className="p-2 font-mono text-[10px]">{d.admission?.admissionNumber}</td>
                          <td className="p-2 capitalize">{(d.dischargeType || "routine").replace(/_/g, " ")}</td>
                          <td className="p-2"><Badge className={`text-[9px] ${STATUS_COLORS[d.status] || ""}`}>{d.status.replace(/_/g, " ")}</Badge></td>
                          <td className="p-2 text-[10px]">{formatDate(d.dischargedAt, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pending discharges */}
            {reportType === "pending" && result.items?.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-2">Pending Discharges — {result.count} total</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="text-left p-2 font-semibold text-slate-700">Patient</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Ward / Bed</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Requested</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Requested By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((d: any) => {
                        const ba = d.admission?.bedAssignments?.[0];
                        return (
                          <tr key={d.id} className="border-b hover:bg-slate-50">
                            <td className="p-2"><div className="font-medium">{d.patient?.firstName} {d.patient?.lastName}</div><div className="text-[10px] text-slate-500">{d.patient?.patientNumber}</div></td>
                            <td className="p-2 text-[10px]">{ba?.ward?.name || "—"} / {ba?.bed?.bedNumber || "—"}</td>
                            <td className="p-2 capitalize">{(d.dischargeType || "routine").replace(/_/g, " ")}</td>
                            <td className="p-2"><Badge className={`text-[9px] ${STATUS_COLORS[d.status] || ""}`}>{d.status.replace(/_/g, " ")}</Badge></td>
                            <td className="p-2 text-[10px]">{formatDate(d.requestedAt, true)}</td>
                            <td className="p-2 text-[10px]">{d.requestedBy?.firstName} {d.requestedBy?.lastName}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* LOS report */}
            {reportType === "los" && result.items?.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-2">Length of Stay Report — {result.from?.slice(0, 10)} to {result.to?.slice(0, 10)}</div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Average LOS</div><div className="text-xl font-bold text-indigo-700">{result.avgLOS} days</div></div>
                  <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Min LOS</div><div className="text-xl font-bold text-emerald-700">{Math.min(...result.items.map((i: any) => i.los))} days</div></div>
                  <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Max LOS</div><div className="text-xl font-bold text-amber-700">{Math.max(...result.items.map((i: any) => i.los))} days</div></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="text-left p-2 font-semibold text-slate-700">Patient</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Admission #</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Ward</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Admitted</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Discharged</th>
                        <th className="text-right p-2 font-semibold text-slate-700">LOS (days)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((d: any, i: number) => (
                        <tr key={i} className="border-b hover:bg-slate-50">
                          <td className="p-2 font-medium">{d.patient?.firstName} {d.patient?.lastName}</td>
                          <td className="p-2 font-mono text-[10px]">{d.admission?.admissionNumber}</td>
                          <td className="p-2 text-[10px]">{d.admission?.bedAssignments?.[0]?.ward?.name || "—"}</td>
                          <td className="p-2 text-[10px]">{formatDate(d.admissionDate, true)}</td>
                          <td className="p-2 text-[10px]">{formatDate(d.dischargedAt, true)}</td>
                          <td className="p-2 text-right font-bold text-indigo-700">{d.los}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* By type breakdown */}
            {reportType === "by_type" && (
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-3">Discharge Type Breakdown — {result.from?.slice(0, 10)} to {result.to?.slice(0, 10)}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                  {result.items?.map((t: any) => (
                    <div key={t.type} className="border rounded p-3 text-center">
                      <div className="text-[10px] text-slate-500 capitalize">{t.type.replace(/_/g, " ")}</div>
                      <div className="text-2xl font-bold text-indigo-700">{t.count}</div>
                    </div>
                  )) || <div className="text-xs text-slate-500">No data</div>}
                </div>
                {result.byStatus && result.byStatus.length > 0 && (
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase mb-1">By Status</div>
                    <div className="flex flex-wrap gap-1">
                      {result.byStatus.map((s: any) => (
                        <Badge key={s.status} className={`text-[10px] ${STATUS_COLORS[s.status] || ""}`}>{s.status.replace(/_/g, " ")}: {s.count}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Delayed discharges */}
            {reportType === "delayed" && result.items?.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-2">Delayed Discharges — {result.count} total</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="text-left p-2 font-semibold text-slate-700">Patient</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Ward / Bed</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Delay Reason</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Department</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Delayed At</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Expected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((d: any) => {
                        const ba = d.admission?.bedAssignments?.[0];
                        return (
                          <tr key={d.id} className="border-b hover:bg-slate-50">
                            <td className="p-2"><div className="font-medium">{d.patient?.firstName} {d.patient?.lastName}</div><div className="text-[10px] text-slate-500">{d.patient?.patientNumber}</div></td>
                            <td className="p-2 text-[10px]">{ba?.ward?.name || "—"} / {ba?.bed?.bedNumber || "—"}</td>
                            <td className="p-2 text-[10px]">{d.delayReason}</td>
                            <td className="p-2 text-[10px]">{d.delayDepartment || "—"}</td>
                            <td className="p-2 text-[10px]">{formatDate(d.delayedAt, true)}</td>
                            <td className="p-2 text-[10px]">{d.expectedDischargeAt ? formatDate(d.expectedDischargeAt, true) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Audit log */}
            {reportType === "audit" && result.items?.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-2">Discharge Audit Log — {result.from?.slice(0, 10)} to {result.to?.slice(0, 10)}</div>
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-semibold text-slate-700">Date/Time</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Action</th>
                        <th className="text-left p-2 font-semibold text-slate-700">User</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Resource ID</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((log: any) => (
                        <tr key={log.id} className="border-b hover:bg-slate-50">
                          <td className="p-2 text-[10px]">{formatDate(log.createdAt, true)}</td>
                          <td className="p-2"><Badge variant="outline" className="text-[9px]">{log.action}</Badge></td>
                          <td className="p-2 text-[10px]">{log.user?.firstName} {log.user?.lastName}</td>
                          <td className="p-2 font-mono text-[10px]">{log.resourceId?.slice(-8)}</td>
                          <td className="p-2 text-[10px] text-slate-600 max-w-xs truncate">{log.newValues || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

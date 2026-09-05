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
  ArrowRightLeft, Plus, RefreshCcw, AlertCircle, Activity, CheckCircle2,
  Clock, FileText, ListChecks, Printer, Download, Stethoscope, Bed, User,
  ChevronRight, X, Play, Pause, FileBarChart, Truck, Phone, ArrowRight,
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
const TRANSFER_CATEGORIES_INTERNAL = [
  { value: "ward", label: "Ward Transfer" },
  { value: "bed", label: "Bed Transfer" },
  { value: "department", label: "Department Transfer" },
  { value: "specialty", label: "Specialty Transfer" },
  { value: "icu", label: "ICU Transfer" },
  { value: "emergency", label: "Emergency Transfer" },
  { value: "theatre", label: "Theatre Transfer" },
  { value: "imaging", label: "Imaging Transfer" },
  { value: "procedure", label: "Procedure Transfer" },
  { value: "other", label: "Other" },
];

const TRANSFER_CATEGORIES_EXTERNAL = [
  { value: "facility", label: "Facility Transfer" },
  { value: "referral", label: "Referral Transfer" },
  { value: "specialist", label: "Specialist Transfer" },
  { value: "rehabilitation", label: "Rehabilitation Transfer" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "routine", label: "Routine", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "urgent", label: "Urgent", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "emergency", label: "Emergency", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "critical", label: "Critical", color: "bg-rose-100 text-rose-700 border-rose-200" },
];

const TRANSFER_REASONS = [
  "Higher level of care", "Specialist review", "ICU care", "Bed availability",
  "Clinical requirement", "Diagnostic procedure", "Surgery", "Rehabilitation",
  "Infection control", "Patient request", "Facility capacity", "Other",
];

const DELAY_REASONS = [
  "No bed available", "Transport unavailable", "Receiving facility unavailable",
  "Clinical condition changed", "Family arrangements", "Documentation pending",
  "Insurance/authorization", "Other",
];

const TRANSPORT_METHODS = [
  { value: "hospital_ambulance", label: "Hospital Ambulance" },
  { value: "private_ambulance", label: "Private Ambulance" },
  { value: "family_vehicle", label: "Family/Private Vehicle" },
  { value: "wheelchair", label: "Wheelchair Transport" },
  { value: "stretcher", label: "Stretcher Transport" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-blue-100 text-blue-700 border-blue-200",
  pending_review: "bg-violet-100 text-violet-700 border-violet-200",
  pending_approval: "bg-violet-100 text-violet-700 border-violet-200",
  pending_destination: "bg-amber-100 text-amber-700 border-amber-200",
  accepted: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  pending_bed: "bg-amber-100 text-amber-700 border-amber-200",
  pending_transport: "bg-amber-100 text-amber-700 border-amber-200",
  ready: "bg-teal-100 text-teal-700 border-teal-200",
  in_transit: "bg-cyan-100 text-cyan-700 border-cyan-200",
  arrived: "bg-indigo-100 text-indigo-700 border-indigo-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  delayed: "bg-orange-100 text-orange-700 border-orange-200",
};

const CHECKLIST_CATEGORIES: Record<string, { label: string; icon: any; color: string }> = {
  clinical: { label: "Clinical", icon: Stethoscope, color: "text-blue-600" },
  nursing: { label: "Nursing", icon: User, color: "text-violet-600" },
  destination: { label: "Destination", icon: Bed, color: "text-emerald-600" },
  transport: { label: "Transport", icon: Truck, color: "text-amber-600" },
  documentation: { label: "Documentation", icon: FileText, color: "text-slate-600" },
};

// =====================================================================
// MAIN VIEW
// =====================================================================
export function TransfersView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canTransfer = can("admission.transfer");
  const canEdit = can("admission.edit") || canTransfer;

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [showNew, setShowNew] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["transfers"] });
    qc.invalidateQueries({ queryKey: ["transfer-stats"] });
    qc.invalidateQueries({ queryKey: ["admissions"] });
    qc.invalidateQueries({ queryKey: ["beds"] });
  };

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (typeFilter !== "all") params.set("transferType", typeFilter);
  if (priorityFilter !== "all") params.set("priority", priorityFilter);
  if (search) params.set("q", search);
  const qs = params.toString() ? `?${params.toString()}` : "";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Patient Transfers"
        description="Internal & external patient transfer coordination — request, approve, transport, handover, complete"
        icon={ArrowRightLeft}
        gradient="from-cyan-500 to-blue-600"
        actions={
          <Button onClick={() => setShowNew(true)} disabled={!canTransfer || !activeFacilityId} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New Transfer
          </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view transfers.</CardContent></Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5"><Activity className="w-4 h-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5"><ListChecks className="w-4 h-4" /> Work Queue</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><Clock className="w-4 h-4" /> History</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><FileBarChart className="w-4 h-4" /> Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <TransferDashboard facilityId={activeFacilityId} />
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardContent className="p-3 flex flex-wrap gap-3 items-center">
              <ClearableSearch value={search} onChange={setSearch} placeholder="Search patient, admission #, transfer #..." className="flex-1 min-w-[200px]" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="md:w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="pending_transport">Pending transport</SelectItem>
                  <SelectItem value="in_transit">In transit</SelectItem>
                  <SelectItem value="arrived">Arrived</SelectItem>
                  <SelectItem value="delayed">Delayed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="md:w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="md:w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          <TransferQueue facilityId={activeFacilityId} qs={qs} onView={(id) => setViewingId(id)} />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <TransferHistory facilityId={activeFacilityId} onView={(id) => setViewingId(id)} />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <ReportsPanel facilityId={activeFacilityId} />
        </TabsContent>
      </Tabs>

      {showNew && (
        <NewTransferDialog
          facilityId={activeFacilityId || ""}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); invalidate(); setViewingId(id); setTab("queue"); }}
        />
      )}
      {viewingId && (
        <TransferDetailDialog
          transferId={viewingId}
          onClose={() => setViewingId(null)}
          onChanged={invalidate}
          canEdit={canEdit}
          canTransfer={canTransfer}
        />
      )}
    </div>
  );
}

// =====================================================================
// DASHBOARD
// =====================================================================
function TransferDashboard({ facilityId }: { facilityId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["transfer-stats", facilityId],
    queryFn: () => fetchJson(`/api/transfers/stats?facilityId=${facilityId || ""}`),
    enabled: !!facilityId,
  });
  if (isLoading) return <LoadingState rows={4} />;
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <MiniStatCard label="Today's Transfers" value={data.todayTransfers || 0} icon={ArrowRightLeft} gradient="from-cyan-500 to-blue-600" />
      <MiniStatCard label="Pending" value={data.pending} icon={Clock} gradient="from-blue-500 to-blue-600" />
      <MiniStatCard label="Approved" value={data.approved} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
      <MiniStatCard label="Accepted" value={data.accepted} icon={CheckCircle2} gradient="from-teal-500 to-cyan-600" />
      <MiniStatCard label="In Transit" value={data.inTransit} icon={Truck} gradient="from-cyan-500 to-cyan-600" />
      <MiniStatCard label="Completed" value={data.completed} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
      <MiniStatCard label="Internal" value={data.internal} icon={ArrowRight} gradient="from-violet-500 to-violet-600" />
      <MiniStatCard label="External" value={data.external} icon={ArrowRight} gradient="from-indigo-500 to-indigo-600" />
      <MiniStatCard label="Delayed" value={data.delayed} icon={AlertCircle} gradient="from-orange-500 to-orange-600" />
      <MiniStatCard label="Cancelled" value={data.cancelled} icon={X} gradient="from-rose-500 to-rose-600" />
      <MiniStatCard label="Rejected" value={data.rejected} icon={X} gradient="from-rose-500 to-rose-600" />
      <MiniStatCard label="Total" value={data.totalTransfers} icon={Activity} gradient="from-slate-500 to-slate-600" />
      {data.avgDurationHours != null && (
        <MiniStatCard label="Avg Duration (h)" value={data.avgDurationHours} icon={Clock} gradient="from-slate-500 to-slate-600" />
      )}
    </div>
  );
}

// =====================================================================
// WORK QUEUE
// =====================================================================
function TransferQueue({ facilityId, qs, onView }: any) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["transfers-queue", facilityId, qs],
    queryFn: () => fetchJson(`/api/transfers${qs}`),
    enabled: !!facilityId,
  });
  const items = (data?.items || []).filter((t: any) => t.status !== "completed");
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 15);

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load transfer queue" onRetry={() => refetch()} />;
  if (items.length === 0) return <Card><CardContent className="p-6"><EmptyState title="No pending transfers" description="Create a transfer request from the button above to begin." icon={ListChecks} /></CardContent></Card>;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                <th className="text-left p-3 font-semibold text-slate-700">From → To</th>
                <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                <th className="text-left p-3 font-semibold text-slate-700">Priority</th>
                <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                <th className="text-left p-3 font-semibold text-slate-700">Transport</th>
                <th className="text-left p-3 font-semibold text-slate-700">Requested</th>
                <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((t: any) => {
                const ba = t.admission?.bedAssignments?.[0];
                return (
                  <tr key={t.id} className="border-b hover:bg-cyan-50/40 cursor-pointer" onClick={() => onView(t.id)}>
                    <td className="p-3">
                      <div className="font-medium text-slate-900">{t.patient?.firstName} {t.patient?.lastName}</div>
                      <div className="text-xs text-slate-500">{t.patient?.patientNumber} • {t.admission?.admissionNumber}</div>
                      {ba && <div className="text-[10px] text-slate-500">{ba.ward?.name} / Bed {ba.bed?.bedNumber}</div>}
                    </td>
                    <td className="p-3 text-xs">
                      <div className="font-medium text-slate-700">{t.fromFacility?.name}</div>
                      <div className="text-slate-500">→ {t.toFacility?.name}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={`text-[10px] ${t.transferType === "internal" ? "bg-violet-100 text-violet-700" : "bg-indigo-100 text-indigo-700"}`}>{t.transferType}</Badge>
                      {t.transferCategory && <div className="text-[9px] text-slate-500 capitalize mt-0.5">{t.transferCategory.replace(/_/g, " ")}</div>}
                    </td>
                    <td className="p-3">
                      <Badge className={`text-[10px] ${PRIORITIES.find((p) => p.value === t.priority)?.color || ""}`}>{t.priority}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge className={`text-[10px] ${STATUS_COLORS[t.status] || "bg-slate-100 text-slate-700"}`}>{t.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="p-3 text-xs text-slate-600">
                      {t.transportMethod ? <span className="capitalize">{t.transportMethod.replace(/_/g, " ")}</span> : <span className="text-slate-300">—</span>}
                      {t.escortRequired && t.escortRequired !== "none" && <div className="text-[9px] text-amber-700">Escort: {t.escortRequired}</div>}
                    </td>
                    <td className="p-3 text-xs text-slate-500">{formatRelative(t.requestedAt)}</td>
                    <td className="p-3 text-right"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onView(t.id)}>Open <ChevronRight className="w-3 h-3" /></Button></td>
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
// HISTORY
// =====================================================================
function TransferHistory({ facilityId, onView }: any) {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  params.set("from", from);
  params.set("to", to);
  if (search) params.set("q", search);
  const qs = `?${params.toString()}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["transfers-history", facilityId, from, to, search],
    queryFn: () => fetchJson(`/api/transfers${qs}`),
    enabled: !!facilityId,
  });
  const allItems = (data?.items || []).filter((t: any) => t.status === "completed");
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(allItems, 15);

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load transfer history" onRetry={() => refetch()} />;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <ClearableSearch value={search} onChange={setSearch} placeholder="Search patient, admission #, transfer #..." className="flex-1 min-w-[200px]" />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 h-8 text-xs" />
          <span className="text-xs text-slate-400">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 h-8 text-xs" />
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => window.open(`/api/transfers/export?facilityId=${facilityId}&from=${from}&to=${to}`, "_blank")}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </CardContent>
      </Card>

      {allItems.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No completed transfers" description="No finalized transfers match your filters." icon={Clock} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Transfer #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">From → To</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Priority</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Completed</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((t: any) => (
                    <tr key={t.id} className="border-b hover:bg-cyan-50/40 cursor-pointer" onClick={() => onView(t.id)}>
                      <td className="p-3 font-mono text-xs text-slate-700">{t.transferNumber || "—"}</td>
                      <td className="p-3"><div className="font-medium">{t.patient?.firstName} {t.patient?.lastName}</div><div className="text-xs text-slate-500">{t.patient?.patientNumber}</div></td>
                      <td className="p-3 text-xs"><div>{t.fromFacility?.name}</div><div className="text-slate-500">→ {t.toFacility?.name}</div></td>
                      <td className="p-3"><Badge variant="outline" className={`text-[10px] ${t.transferType === "internal" ? "bg-violet-100 text-violet-700" : "bg-indigo-100 text-indigo-700"}`}>{t.transferType}</Badge></td>
                      <td className="p-3"><Badge className={`text-[10px] ${PRIORITIES.find((p) => p.value === t.priority)?.color || ""}`}>{t.priority}</Badge></td>
                      <td className="p-3 text-xs text-slate-500">{formatDate(t.completedAt, true)}</td>
                      <td className="p-3 text-right"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onView(t.id)}>Open <ChevronRight className="w-3 h-3" /></Button></td>
                    </tr>
                  ))}
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
// NEW TRANSFER REQUEST DIALOG
// =====================================================================
function NewTransferDialog({ facilityId, onClose, onCreated }: any) {
  const [admissionId, setAdmissionId] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<any>({
    transferType: "internal",
    transferCategory: "ward",
    priority: "routine",
    toFacilityId: "",
    toWardId: "",
    toBedId: "",
    toDepartment: "",
    toAddress: "",
    toContactPerson: "",
    toContactPhone: "",
    toContactEmail: "",
    receivingClinicianName: "",
    reason: "",
    clinicalSummary: "",
    transportMethod: "hospital_ambulance",
    escortRequired: "none",
    oxygenRequired: false,
    cardiacMonitoring: false,
    ivAccess: false,
    isolationPrecautions: "",
    handoverSummary: "",
    nursingHandover: "",
    clinicalNotes: "",
    specialRequirements: "",
  });
  const [saving, setSaving] = useState(false);

  // Load admitted patients
  const { data: admissionsData, isLoading: loadingAdmissions } = useQuery({
    queryKey: ["transfer-admissions", facilityId],
    queryFn: () => fetchJson(`/api/admissions?facilityId=${facilityId}&status=admitted&limit=200`),
    enabled: !!facilityId,
  });
  const admittedPatients = (admissionsData?.items || []).filter((a: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.patient?.firstName?.toLowerCase().includes(q)
      || a.patient?.lastName?.toLowerCase().includes(q)
      || a.patient?.patientNumber?.toLowerCase().includes(q);
  });

  // Load facilities
  const { data: facilitiesData } = useQuery({
    queryKey: ["transfer-facilities"],
    queryFn: () => fetchJson(`/api/facilities`),
  });
  const facilities = facilitiesData?.items || [];

  // Load destination wards (when toFacilityId changes)
  const { data: destWardsData } = useQuery({
    queryKey: ["transfer-dest-wards", form.toFacilityId],
    queryFn: () => fetchJson(`/api/wards?facilityId=${form.toFacilityId}`),
    enabled: !!form.toFacilityId,
  });
  const destWards = destWardsData?.items || [];

  // Load destination beds (when toWardId changes)
  const { data: destBedsData } = useQuery({
    queryKey: ["transfer-dest-beds", form.toWardId],
    queryFn: () => fetchJson(`/api/beds?wardId=${form.toWardId}&status=available`),
    enabled: !!form.toWardId,
  });
  const destBeds = destBedsData?.items || [];

  const submit = async () => {
    if (!admissionId) { toast.error("Select a patient/admission"); return; }
    if (!form.toFacilityId) { toast.error("Select destination facility"); return; }
    if (!form.reason) { toast.error("Reason is required"); return; }
    setSaving(true);
    try {
      const payload: any = { ...form, admissionId, fromFacilityId: facilityId };
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      const data = await safeJson(res);
      toast.success("Transfer request created");
      onCreated(data.item?.id);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const selectedAdmission = (admissionsData?.items || []).find((a: any) => a.id === admissionId);
  const isInternal = form.transferType === "internal";
  const isExternal = form.transferType === "external";
  const categories = isInternal ? TRANSFER_CATEGORIES_INTERNAL : TRANSFER_CATEGORIES_EXTERNAL;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><ArrowRightLeft className="w-5 h-5 text-cyan-600" /> New Patient Transfer</DialogTitle>
          <DialogDescription className="text-white/80">Request a patient transfer. The patient stays in their current location until the transfer is approved and executed.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Patient selection */}
          <div>
            <FieldLabel required>Select Admitted Patient</FieldLabel>
            {!admissionId ? (
              <>
                <ClearableSearch value={search} onChange={setSearch} placeholder="Search admitted patient by name or number..." />
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
              {/* Transfer type & priority */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <FieldLabel required>Transfer Type</FieldLabel>
                  <Select value={form.transferType} onValueChange={(v) => setForm({ ...form, transferType: v, transferCategory: v === "internal" ? "ward" : "facility" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="external">External</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel required>Category</FieldLabel>
                  <Select value={form.transferCategory} onValueChange={(v) => setForm({ ...form, transferCategory: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel required>Priority</FieldLabel>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Destination */}
              <div className="border rounded p-3 bg-slate-50 space-y-2">
                <div className="text-sm font-medium text-slate-700">Destination</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel required>Destination Facility</FieldLabel>
                    <Select value={form.toFacilityId} onValueChange={(v) => setForm({ ...form, toFacilityId: v, toWardId: "", toBedId: "" })}>
                      <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                      <SelectContent>
                        {facilities.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {isInternal && (
                    <div>
                      <Label>Destination Ward</Label>
                      <Select value={form.toWardId} onValueChange={(v) => setForm({ ...form, toWardId: v, toBedId: "" })} disabled={!form.toFacilityId}>
                        <SelectTrigger><SelectValue placeholder="Select ward" /></SelectTrigger>
                        <SelectContent>
                          {destWards.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {isInternal && (
                    <div>
                      <Label>Destination Bed (optional)</Label>
                      <Select value={form.toBedId} onValueChange={(v) => setForm({ ...form, toBedId: v })} disabled={!form.toWardId}>
                        <SelectTrigger><SelectValue placeholder="Select bed" /></SelectTrigger>
                        <SelectContent>
                          {destBeds.length === 0 && <SelectItem value="_none" disabled>No available beds</SelectItem>}
                          {destBeds.filter((b: any) => b.status === "available").map((b: any) => <SelectItem key={b.id} value={b.id}>Bed {b.bedNumber} ({b.status})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {isExternal && (
                    <>
                      <div><Label>Department</Label><Input value={form.toDepartment} onChange={(e) => setForm({ ...form, toDepartment: e.target.value })} placeholder="e.g., Cardiology" /></div>
                      <div><Label>Contact Person</Label><Input value={form.toContactPerson} onChange={(e) => setForm({ ...form, toContactPerson: e.target.value })} placeholder="Receiving contact" /></div>
                      <div><Label>Contact Phone</Label><Input value={form.toContactPhone} onChange={(e) => setForm({ ...form, toContactPhone: e.target.value })} placeholder="Phone" /></div>
                      <div><Label>Contact Email</Label><Input value={form.toContactEmail} onChange={(e) => setForm({ ...form, toContactEmail: e.target.value })} placeholder="Email" /></div>
                      <div className="col-span-2"><Label>Address</Label><Input value={form.toAddress} onChange={(e) => setForm({ ...form, toAddress: e.target.value })} placeholder="Facility address" /></div>
                    </>
                  )}
                </div>
              </div>

              {/* Reason & clinical summary */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel required>Reason</FieldLabel>
                  <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                    <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>
                      {TRANSFER_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Receiving Clinician (name)</Label>
                  <Input value={form.receivingClinicianName} onChange={(e) => setForm({ ...form, receivingClinicianName: e.target.value })} placeholder="e.g., Dr. Mensah" />
                </div>
              </div>
              <div>
                <Label>Clinical Summary</Label>
                <Textarea value={form.clinicalSummary} onChange={(e) => setForm({ ...form, clinicalSummary: e.target.value })} rows={2} placeholder="Brief clinical summary for receiving team" />
              </div>
              <div>
                <Label>Handover Summary</Label>
                <Textarea value={form.handoverSummary} onChange={(e) => setForm({ ...form, handoverSummary: e.target.value })} rows={2} placeholder="Clinical handover notes (diagnosis, current condition, ongoing treatment)" />
              </div>

              {/* Transport */}
              <div className="border rounded p-3 bg-amber-50 space-y-2">
                <div className="text-sm font-medium text-slate-700">Transport</div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Transport Method</Label>
                    <Select value={form.transportMethod} onValueChange={(v) => setForm({ ...form, transportMethod: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRANSPORT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Escort</Label>
                    <Select value={form.escortRequired} onValueChange={(v) => setForm({ ...form, escortRequired: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="nurse">Nurse</SelectItem>
                        <SelectItem value="clinician">Clinician</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Isolation Precautions</Label>
                    <Input value={form.isolationPrecautions} onChange={(e) => setForm({ ...form, isolationPrecautions: e.target.value })} placeholder="e.g., Contact" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1"><Checkbox checked={form.oxygenRequired} onCheckedChange={(v) => setForm({ ...form, oxygenRequired: !!v })} /> Oxygen required</label>
                  <label className="flex items-center gap-1"><Checkbox checked={form.cardiacMonitoring} onCheckedChange={(v) => setForm({ ...form, cardiacMonitoring: !!v })} /> Cardiac monitoring</label>
                  <label className="flex items-center gap-1"><Checkbox checked={form.ivAccess} onCheckedChange={(v) => setForm({ ...form, ivAccess: !!v })} /> IV access</label>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 shrink-0 border-t bg-white">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !admissionId} className="gap-2 bg-cyan-600 hover:bg-cyan-700">
            {saving ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />} Create Transfer Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// TRANSFER DETAIL DIALOG
// =====================================================================
function TransferDetailDialog({ transferId, onClose, onChanged, canEdit, canTransfer }: any) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["transfer-detail", transferId],
    queryFn: () => fetchJson(`/api/transfers/${transferId}`),
  });
  const [detailTab, setDetailTab] = useState("overview");
  const t = data?.item;

  const lifecycle = async (action: string, extra: any = {}) => {
    try {
      const res = await fetch("/api/transfers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferId, action, ...extra }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success(`Transfer ${action}ed`);
      onChanged(); refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) return <Dialog open onOpenChange={onClose}><DialogContent className="max-w-4xl"><div className="p-8 text-center text-slate-500">Loading…</div></DialogContent></Dialog>;
  if (!t) return <Dialog open onOpenChange={onClose}><DialogContent><div className="p-4 text-rose-600">Not found</div></DialogContent></Dialog>;

  const isFinalized = t.isFinalized;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="flex items-center gap-2 text-xl flex-wrap">
            <ArrowRightLeft className="w-5 h-5 text-cyan-600" />
            <span>{t.patient?.firstName} {t.patient?.lastName}</span>
            <span className="text-xs text-slate-500">{t.patient?.patientNumber}</span>
            <Badge className={`text-[10px] ${STATUS_COLORS[t.status] || "bg-slate-100 text-slate-700"}`}>{t.status.replace(/_/g, " ")}</Badge>
            <Badge className={`text-[10px] ${PRIORITIES.find((p) => p.value === t.priority)?.color || ""}`}>{t.priority}</Badge>
            {t.transferNumber && <Badge variant="outline" className="text-[10px] font-mono">{t.transferNumber}</Badge>}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {t.fromFacility?.name} → {t.toFacility?.name}
            {" • "}{t.transferType} {t.transferCategory && `(${t.transferCategory.replace(/_/g, " ")})`}
            {" • "}Requested {formatDate(t.requestedAt, true)}
          </DialogDescription>
        </DialogHeader>

        {/* Lifecycle buttons */}
        {!isFinalized && (
          <div className="px-6 py-2 border-b flex flex-wrap gap-2 bg-slate-50">
            {t.status === "requested" && canEdit && (
              <Button size="sm" onClick={() => lifecycle("approve")} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 h-8"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</Button>
            )}
            {t.status === "approved" && canEdit && (
              <Button size="sm" onClick={() => lifecycle("accept")} className="gap-1.5 bg-teal-600 hover:bg-teal-700 h-8"><CheckCircle2 className="w-3.5 h-3.5" /> Accept at Destination</Button>
            )}
            {(t.status === "accepted" || t.status === "ready") && canEdit && (
              <Button size="sm" onClick={() => {
                const cond = prompt("Condition at departure (optional):") || "";
                lifecycle("depart", { conditionAtDeparture: cond });
              }} className="gap-1.5 bg-cyan-600 hover:bg-cyan-700 h-8"><ArrowRight className="w-3.5 h-3.5" /> Mark Departed</Button>
            )}
            {t.status === "in_transit" && canEdit && (
              <Button size="sm" onClick={() => {
                const cond = prompt("Condition on arrival (optional):") || "";
                lifecycle("arrive", { conditionOnArrival: cond });
              }} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 h-8"><CheckCircle2 className="w-3.5 h-3.5" /> Mark Arrived</Button>
            )}
            {t.status === "arrived" && canTransfer && (
              <Button size="sm" onClick={() => lifecycle("complete")} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 h-8"><CheckCircle2 className="w-3.5 h-3.5" /> Complete Transfer</Button>
            )}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => {
                const reason = prompt("Delay reason:");
                if (!reason) return;
                const dept = prompt("Responsible department (optional):") || "";
                const expected = prompt("Expected transfer date (YYYY-MM-DD, optional):") || "";
                lifecycle("delay", { delayReason: reason, delayDepartment: dept, expectedTransferAt: expected || undefined });
              }} className="gap-1.5 h-8"><Pause className="w-3.5 h-3.5" /> Mark Delayed</Button>
            )}
            {canEdit && t.status !== "rejected" && (
              <Button size="sm" variant="outline" onClick={() => {
                const reason = prompt("Reason for rejecting this transfer:");
                if (!reason) return;
                lifecycle("reject", { rejectionReason: reason });
              }} className="gap-1.5 text-rose-600 h-8"><X className="w-3.5 h-3.5" /> Reject</Button>
            )}
            {canEdit && t.status !== "cancelled" && (
              <Button size="sm" variant="outline" onClick={() => {
                const reason = prompt("Reason for cancelling this transfer:");
                if (!reason) return;
                lifecycle("cancel", { cancelReason: reason });
              }} className="gap-1.5 text-rose-600 h-8"><X className="w-3.5 h-3.5" /> Cancel</Button>
            )}
            {t.status === "delayed" && canEdit && (
              <Button size="sm" onClick={() => lifecycle("resume")} className="gap-1.5 bg-blue-600 hover:bg-blue-700 h-8"><Play className="w-3.5 h-3.5" /> Resume</Button>
            )}
          </div>
        )}
        {isFinalized && (
          <div className="px-6 py-2 border-b flex flex-wrap gap-2 bg-emerald-50">
            <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3 mr-1" /> Finalized</Badge>
            <span className="text-xs text-slate-600">Transfer #{t.transferNumber} • Completed by {t.completedBy?.firstName} {t.completedBy?.lastName} • {formatDate(t.completedAt, true)}</span>
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs gap-1.5" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Print Summary</Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <TabsList className="flex flex-wrap h-auto w-full mb-3">
              <TabsTrigger value="overview" className="gap-1.5"><Activity className="w-4 h-4" /> Overview</TabsTrigger>
              <TabsTrigger value="handover" className="gap-1.5"><Stethoscope className="w-4 h-4" /> Clinical Handover</TabsTrigger>
              <TabsTrigger value="checklist" className="gap-1.5"><ListChecks className="w-4 h-4" /> Checklist ({(t.checklist || []).filter((c: any) => c.status === "completed").length}/{(t.checklist || []).length})</TabsTrigger>
              <TabsTrigger value="timeline" className="gap-1.5"><Clock className="w-4 h-4" /> Timeline</TabsTrigger>
              <TabsTrigger value="communications" className="gap-1.5"><Phone className="w-4 h-4" /> Communications ({(t.communications || []).length})</TabsTrigger>
              <TabsTrigger value="summary" className="gap-1.5"><FileText className="w-4 h-4" /> Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="border rounded p-2"><div className="text-[10px] uppercase text-slate-500">Type</div><div className="font-medium capitalize">{t.transferType} {t.transferCategory && `(${t.transferCategory.replace(/_/g, " ")})`}</div></div>
                <div className="border rounded p-2"><div className="text-[10px] uppercase text-slate-500">Priority</div><div className="font-medium capitalize">{t.priority}</div></div>
                <div className="border rounded p-2"><div className="text-[10px] uppercase text-slate-500">Transport</div><div className="font-medium capitalize">{(t.transportMethod || "—").replace(/_/g, " ")}</div></div>
                <div className="border rounded p-2"><div className="text-[10px] uppercase text-slate-500">Escort</div><div className="font-medium capitalize">{t.escortRequired || "—"}</div></div>
              </div>
              {t.reason && <div className="bg-slate-50 rounded p-3"><div className="text-xs text-slate-500 font-medium uppercase mb-1">Reason</div><div className="text-sm">{t.reason}</div></div>}
              {t.clinicalSummary && <div className="bg-slate-50 rounded p-3"><div className="text-xs text-slate-500 font-medium uppercase mb-1">Clinical Summary</div><div className="text-sm whitespace-pre-wrap">{t.clinicalSummary}</div></div>}
              {t.handoverSummary && <div className="bg-blue-50 rounded p-3"><div className="text-xs text-blue-700 font-medium uppercase mb-1">Handover Summary</div><div className="text-sm whitespace-pre-wrap">{t.handoverSummary}</div></div>}
              {t.rejectionReason && <div className="bg-rose-50 rounded p-3 border border-rose-200"><div className="text-xs text-rose-700 font-medium uppercase mb-1">Rejection Reason</div><div className="text-sm">{t.rejectionReason}</div></div>}
              {t.cancelReason && <div className="bg-rose-50 rounded p-3 border border-rose-200"><div className="text-xs text-rose-700 font-medium uppercase mb-1">Cancel Reason</div><div className="text-sm">{t.cancelReason}</div></div>}
              {t.delayReason && <div className="bg-orange-50 rounded p-3 border border-orange-200"><div className="text-xs text-orange-700 font-medium uppercase mb-1">Delay Reason</div><div className="text-sm">{t.delayReason} {t.delayDepartment && `(${t.delayDepartment})`}</div></div>}
              {t.conditionAtDeparture && <div className="bg-cyan-50 rounded p-3"><div className="text-xs text-cyan-700 font-medium uppercase mb-1">Condition at Departure</div><div className="text-sm">{t.conditionAtDeparture}</div></div>}
              {t.conditionOnArrival && <div className="bg-indigo-50 rounded p-3"><div className="text-xs text-indigo-700 font-medium uppercase mb-1">Condition on Arrival</div><div className="text-sm">{t.conditionOnArrival}</div></div>}
              <div className="text-xs text-slate-500">
                Requested by {t.requestedBy?.firstName} {t.requestedBy?.lastName} • {formatDate(t.requestedAt, true)}
                {t.approvedAt && ` • Approved by ${t.approvedBy?.firstName} ${t.approvedBy?.lastName} • ${formatDate(t.approvedAt, true)}`}
              </div>
            </TabsContent>

            <TabsContent value="handover" className="space-y-3">
              <ClinicalHandover transferId={transferId} />
            </TabsContent>

            <TabsContent value="checklist" className="space-y-3">
              <ChecklistPanel transferId={transferId} checklist={t.checklist || []} canEdit={canEdit && !isFinalized} onChanged={() => { refetch(); onChanged(); }} />
            </TabsContent>

            <TabsContent value="timeline" className="space-y-3">
              <TransferTimeline transfer={t} />
            </TabsContent>

            <TabsContent value="communications" className="space-y-3">
              <CommunicationsPanel transferId={transferId} communications={t.communications || []} onChanged={() => { refetch(); onChanged(); }} />
            </TabsContent>

            <TabsContent value="summary" className="space-y-3">
              <TransferSummary transfer={t} />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// CLINICAL HANDOVER
// =====================================================================
function ClinicalHandover({ transferId }: { transferId: string }) {
  const { data } = useQuery({
    queryKey: ["transfer-detail", transferId],
    queryFn: () => fetchJson(`/api/transfers/${transferId}`),
  });
  const c = data?.clinical || {};
  return (
    <div className="space-y-3">
      <Card><CardContent className="p-3">
        <div className="text-xs font-semibold text-slate-700 uppercase mb-2">Diagnoses ({(c.diagnoses || []).length})</div>
        {(c.diagnoses || []).length === 0 ? <div className="text-xs text-slate-400">No diagnoses recorded</div> :
          <div className="space-y-1">{(c.diagnoses || []).slice(0, 5).map((dg: any) => (
            <div key={dg.id} className="text-xs flex items-center gap-2">
              <Badge variant="outline" className="text-[9px] capitalize">{dg.diagnosisType}</Badge>
              <span className="font-medium text-slate-900">{dg.diagnosisName}</span>
              {dg.diagnosisCode && <span className="text-slate-500 font-mono">{dg.diagnosisCode}</span>}
            </div>
          ))}</div>
        }
      </CardContent></Card>

      <Card><CardContent className="p-3">
        <div className="text-xs font-semibold text-slate-700 uppercase mb-2">Allergies ({(c.allergies || []).length})</div>
        {(c.allergies || []).length === 0 ? <div className="text-xs text-emerald-700">No known allergies</div> :
          <div className="flex flex-wrap gap-1">{(c.allergies || []).map((a: any) => (
            <Badge key={a.id} className="text-[10px] bg-rose-100 text-rose-700 border-rose-200">{a.allergen} {a.severity && `(${a.severity})`}</Badge>
          ))}</div>
        }
      </CardContent></Card>

      <Card><CardContent className="p-3">
        <div className="text-xs font-semibold text-slate-700 uppercase mb-2">Recent Vitals</div>
        {(c.vitals || []).length === 0 ? <div className="text-xs text-slate-400">No vitals recorded</div> :
          <div className="grid grid-cols-3 gap-2">{(c.vitals || []).slice(0, 3).map((v: any) => (
            <div key={v.id} className="text-xs border rounded p-2">
              <div className="text-[10px] text-slate-500">{formatDate(v.recordedAt, true)}</div>
              <div className="font-mono">T:{v.temperature || "—"} P:{v.pulse || "—"} BP:{v.systolicBp || "—"}/{v.diastolicBp || "—"}</div>
            </div>
          ))}</div>
        }
      </CardContent></Card>

      <Card><CardContent className="p-3">
        <div className="text-xs font-semibold text-slate-700 uppercase mb-2">Recent Medications</div>
        {(c.prescriptions || []).length === 0 ? <div className="text-xs text-slate-400">No prescriptions</div> :
          <div className="space-y-1">{(c.prescriptions || []).slice(0, 5).map((p: any) => (
            <div key={p.id} className="text-xs"><span className="font-medium">{p.prescriptionNumber}</span> <span className="text-slate-500">{formatDate(p.prescribedAt, true)}</span></div>
          ))}</div>
        }
      </CardContent></Card>

      <Card><CardContent className="p-3">
        <div className="text-xs font-semibold text-slate-700 uppercase mb-2">Recent Labs</div>
        {(c.labOrders || []).length === 0 ? <div className="text-xs text-slate-400">No lab orders</div> :
          <div className="space-y-1">{(c.labOrders || []).slice(0, 3).map((lo: any) => (
            <div key={lo.id} className="text-xs"><span className="font-medium">{lo.orderNumber}</span> <span className="text-slate-500">{formatDate(lo.orderedAt, true)}</span></div>
          ))}</div>
        }
      </CardContent></Card>
    </div>
  );
}

// =====================================================================
// CHECKLIST PANEL
// =====================================================================
function ChecklistPanel({ transferId, checklist, canEdit, onChanged }: any) {
  const grouped: Record<string, any[]> = {};
  for (const item of checklist) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  const updateItem = async (itemId: string, status: string, notes?: string) => {
    try {
      const res = await fetch("/api/transfers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferId, action: "checklist_update", checklistItemId: itemId, status, notes }),
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
          <div className="text-sm font-semibold text-slate-700">Transfer Checklist</div>
          <Badge className={`text-[10px] ${pct === 100 ? "bg-emerald-100 text-emerald-700" : pct > 50 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>{completed}/{total} ({pct}%)</Badge>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-cyan-500"}`} style={{ width: `${pct}%` }} />
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
// TIMELINE
// =====================================================================
function TransferTimeline({ transfer: t }: any) {
  const events: { label: string; time: string | null; user?: string }[] = [
    { label: "Transfer Requested", time: t.requestedAt, user: t.requestedBy ? `${t.requestedBy.firstName} ${t.requestedBy.lastName}` : undefined },
    { label: "Approved", time: t.approvedAt, user: t.approvedBy ? `${t.approvedBy.firstName} ${t.approvedBy.lastName}` : undefined },
    { label: "Accepted at Destination", time: t.acceptedAt, user: t.acceptedBy ? `${t.acceptedBy.firstName} ${t.acceptedBy.lastName}` : undefined },
    { label: "Patient Departed", time: t.departedAt, user: t.departedBy ? `${t.departedBy.firstName} ${t.departedBy.lastName}` : undefined },
    { label: "Patient Arrived", time: t.arrivedAt, user: t.arrivedBy ? `${t.arrivedBy.firstName} ${t.arrivedBy.lastName}` : undefined },
    { label: "Transfer Completed", time: t.completedAt, user: t.completedBy ? `${t.completedBy.firstName} ${t.completedBy.lastName}` : undefined },
  ].filter((e) => e.time);

  const rejectedEvent = t.rejectedAt ? { label: "Rejected", time: t.rejectedAt, user: t.rejectedBy ? `${t.rejectedBy.firstName} ${t.rejectedBy.lastName}` : undefined } : null;
  const cancelledEvent = t.cancelledAt ? { label: "Cancelled", time: t.cancelledAt, user: t.cancelledBy ? `${t.cancelledBy.firstName} ${t.cancelledBy.lastName}` : undefined } : null;
  const delayedEvent = t.delayedAt ? { label: "Delayed", time: t.delayedAt } : null;

  return (
    <Card><CardContent className="p-4">
      <div className="text-sm font-semibold text-slate-700 mb-3">Transfer Timeline</div>
      {events.length === 0 && !rejectedEvent && !cancelledEvent && !delayedEvent ? (
        <div className="text-xs text-slate-400">No timeline events yet</div>
      ) : (
        <div className="space-y-3">
          {events.map((e, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-cyan-500 mt-0.5"></div>
                {i < events.length - 1 && <div className="w-0.5 h-6 bg-slate-200"></div>}
              </div>
              <div className="flex-1 pb-3">
                <div className="text-sm font-medium text-slate-900">{e.label}</div>
                <div className="text-xs text-slate-500">{formatDate(e.time, true)}</div>
                {e.user && <div className="text-[10px] text-slate-400">by {e.user}</div>}
              </div>
            </div>
          ))}
          {delayedEvent && (
            <div className="flex items-start gap-3">
              <div className="w-3 h-3 rounded-full bg-orange-500 mt-0.5"></div>
              <div><div className="text-sm font-medium text-orange-700">{delayedEvent.label}</div><div className="text-xs text-slate-500">{formatDate(delayedEvent.time, true)}</div></div>
            </div>
          )}
          {rejectedEvent && (
            <div className="flex items-start gap-3">
              <div className="w-3 h-3 rounded-full bg-rose-500 mt-0.5"></div>
              <div><div className="text-sm font-medium text-rose-700">{rejectedEvent.label}</div><div className="text-xs text-slate-500">{formatDate(rejectedEvent.time, true)}</div>{rejectedEvent.user && <div className="text-[10px] text-slate-400">by {rejectedEvent.user}</div>}</div>
            </div>
          )}
          {cancelledEvent && (
            <div className="flex items-start gap-3">
              <div className="w-3 h-3 rounded-full bg-rose-500 mt-0.5"></div>
              <div><div className="text-sm font-medium text-rose-700">{cancelledEvent.label}</div><div className="text-xs text-slate-500">{formatDate(cancelledEvent.time, true)}</div>{cancelledEvent.user && <div className="text-[10px] text-slate-400">by {cancelledEvent.user}</div>}</div>
            </div>
          )}
        </div>
      )}
    </CardContent></Card>
  );
}

// =====================================================================
// COMMUNICATIONS PANEL
// =====================================================================
function CommunicationsPanel({ transferId, communications, onChanged }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [newComm, setNewComm] = useState<any>({ recipientName: "", recipientDepartment: "", recipientFacility: "", messageType: "call", message: "", outcome: "delivered" });

  const addComm = async () => {
    if (!newComm.recipientName) { toast.error("Recipient name is required"); return; }
    try {
      const res = await fetch(`/api/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_communication", ...newComm }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Communication logged");
      setShowAdd(false);
      setNewComm({ recipientName: "", recipientDepartment: "", recipientFacility: "", messageType: "call", message: "", outcome: "delivered" });
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-3 flex items-center justify-between">
        <div><div className="text-sm font-semibold text-slate-700">Communication Log</div><div className="text-xs text-slate-500">Track all calls, emails, and notifications related to this transfer.</div></div>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 h-8"><Plus className="w-3.5 h-3.5" /> Log Communication</Button>
      </CardContent></Card>

      {communications.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No communications logged" description="Log calls, emails, and notifications here." icon={Phone} /></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {communications.map((c: any) => (
            <Card key={c.id}><CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] capitalize">{c.messageType}</Badge>
                <Badge className={`text-[9px] ${c.outcome === "accepted" ? "bg-emerald-100 text-emerald-700" : c.outcome === "rejected" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{c.outcome}</Badge>
                <span className="text-xs text-slate-500 ml-auto">{formatDate(c.sentAt, true)}</span>
              </div>
              <div className="text-sm"><span className="font-medium">{c.senderName}</span> → <span className="font-medium">{c.recipientName}</span></div>
              {c.recipientDepartment && <div className="text-xs text-slate-500">{c.recipientDepartment} {c.recipientFacility && `• ${c.recipientFacility}`}</div>}
              {c.message && <div className="text-xs text-slate-600 mt-1">{c.message}</div>}
            </CardContent></Card>
          ))}
        </div>
      )}

      {showAdd && (
        <Dialog open onOpenChange={setShowAdd}>
          <DialogContent className="max-w-md">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle>Log Communication</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <div><FieldLabel required>Recipient Name</FieldLabel><Input value={newComm.recipientName} onChange={(e) => setNewComm({ ...newComm, recipientName: e.target.value })} placeholder="e.g., Dr. Mensah" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Department</Label><Input value={newComm.recipientDepartment} onChange={(e) => setNewComm({ ...newComm, recipientDepartment: e.target.value })} /></div>
                <div><Label>Facility</Label><Input value={newComm.recipientFacility} onChange={(e) => setNewComm({ ...newComm, recipientFacility: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><FieldLabel required>Type</FieldLabel>
                  <Select value={newComm.messageType} onValueChange={(v) => setNewComm({ ...newComm, messageType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="call">Call</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="internal_notification">Internal</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Outcome</Label>
                  <Select value={newComm.outcome} onValueChange={(v) => setNewComm({ ...newComm, outcome: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="delivered">Delivered</SelectItem><SelectItem value="acknowledged">Acknowledged</SelectItem><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="rejected">Rejected</SelectItem><SelectItem value="no_response">No Response</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Message</Label><Textarea value={newComm.message} onChange={(e) => setNewComm({ ...newComm, message: e.target.value })} rows={2} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={addComm} className="bg-emerald-600 hover:bg-emerald-700">Log</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// =====================================================================
// TRANSFER SUMMARY (printable)
// =====================================================================
function TransferSummary({ transfer: t }: any) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-bold text-slate-900">Transfer Summary</div>
        <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5 h-8"><Printer className="w-3.5 h-3.5" /> Print</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3 pb-3 border-b">
        <div><div className="text-[10px] text-slate-500 uppercase">Patient</div><div className="font-medium">{t.patient?.firstName} {t.patient?.lastName}</div></div>
        <div><div className="text-[10px] text-slate-500 uppercase">Patient #</div><div className="font-mono">{t.patient?.patientNumber}</div></div>
        <div><div className="text-[10px] text-slate-500 uppercase">Transfer #</div><div className="font-mono">{t.transferNumber || "—"}</div></div>
        <div><div className="text-[10px] text-slate-500 uppercase">Admission #</div><div className="font-mono">{t.admission?.admissionNumber}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-[10px] text-slate-500 uppercase mb-1">From</div>
          <div className="font-medium">{t.fromFacility?.name}</div>
          {t.admission?.bedAssignments?.[0] && <div className="text-xs text-slate-600">{t.admission.bedAssignments[0].ward?.name} / Bed {t.admission.bedAssignments[0].bed?.bedNumber}</div>}
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase mb-1">To</div>
          <div className="font-medium">{t.toFacility?.name}</div>
          {t.toDepartment && <div className="text-xs text-slate-600">{t.toDepartment}</div>}
          {t.toContactPerson && <div className="text-xs text-slate-600">{t.toContactPerson} {t.toContactPhone && `• ${t.toContactPhone}`}</div>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs mt-3 pt-3 border-t">
        <div><div className="text-[10px] text-slate-500 uppercase">Type</div><div className="capitalize">{t.transferType} {t.transferCategory && `(${t.transferCategory.replace(/_/g, " ")})`}</div></div>
        <div><div className="text-[10px] text-slate-500 uppercase">Priority</div><div className="capitalize">{t.priority}</div></div>
        <div><div className="text-[10px] text-slate-500 uppercase">Transport</div><div className="capitalize">{(t.transportMethod || "—").replace(/_/g, " ")}</div></div>
      </div>
      {t.reason && <div className="mt-3 pt-3 border-t"><div className="text-[10px] text-slate-500 uppercase mb-1">Reason</div><div className="text-sm">{t.reason}</div></div>}
      {t.clinicalSummary && <div className="mt-2"><div className="text-[10px] text-slate-500 uppercase mb-1">Clinical Summary</div><div className="text-sm whitespace-pre-wrap">{t.clinicalSummary}</div></div>}
      {t.handoverSummary && <div className="mt-2"><div className="text-[10px] text-slate-500 uppercase mb-1">Handover Summary</div><div className="text-sm whitespace-pre-wrap">{t.handoverSummary}</div></div>}
      <div className="mt-4 pt-3 border-t grid grid-cols-2 gap-4 text-xs">
        <div>
          <div className="text-[10px] text-slate-500 uppercase mb-2">Requested By</div>
          <div className="border-b border-slate-300 h-8"></div>
          <div className="mt-1">{t.requestedBy?.firstName} {t.requestedBy?.lastName}</div>
          <div className="text-[10px] text-slate-500">{formatDate(t.requestedAt, true)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase mb-2">Completed By</div>
          <div className="border-b border-slate-300 h-8"></div>
          <div className="mt-1">{t.completedBy?.firstName} {t.completedBy?.lastName || "—"}</div>
          <div className="text-[10px] text-slate-500">{t.completedAt ? formatDate(t.completedAt, true) : ""}</div>
        </div>
      </div>
    </CardContent></Card>
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
      if (reportType === "daily") params.set("date", date);
      if (["internal", "external", "by_priority", "performance", "audit"].includes(reportType)) { params.set("from", from); params.set("to", to); }
      const data = await fetchJson(`/api/transfers/reports?${params.toString()}`);
      setResult(data);
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  const reportTypes = [
    { value: "daily", label: "Daily Transfer Report", needsDate: true },
    { value: "internal", label: "Internal Transfers", needsRange: true },
    { value: "external", label: "External Transfers", needsRange: true },
    { value: "delayed", label: "Delayed Transfers", needsDate: false },
    { value: "by_priority", label: "By Priority Breakdown", needsRange: true },
    { value: "performance", label: "Performance Report", needsRange: true },
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
            {currentReportType?.needsDate && <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
            {currentReportType?.needsRange && (
              <>
                <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
                <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              </>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">{result ? `${result.count || 0} record(s) found` : "Configure parameters and click Generate"}</div>
            <div className="flex gap-2">
              {result && result.items?.length > 0 && (
                <Button variant="outline" onClick={() => window.open(`/api/transfers/export?facilityId=${facilityId}&from=${from}&to=${to}`, "_blank")} className="gap-2 h-8">
                  <Download className="w-4 h-4" /> CSV Export
                </Button>
              )}
              <Button onClick={generate} disabled={loading} className="gap-2 bg-cyan-600 hover:bg-cyan-700 h-8">
                {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <FileBarChart className="w-4 h-4" />} Generate Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="p-4">
            {(!result.items || result.items.length === 0) && reportType !== "by_priority" ? (
              <div className="text-center py-8">
                <FileBarChart className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <div className="text-sm font-medium text-slate-700">No records found for this report</div>
                <div className="text-xs text-slate-500 mt-1">
                  {reportType === "daily" && `No transfers on ${date}.`}
                  {reportType === "internal" && `No internal transfers between ${from} and ${to}.`}
                  {reportType === "external" && `No external transfers between ${from} and ${to}.`}
                  {reportType === "delayed" && "No delayed transfers. All clear!"}
                  {reportType === "performance" && `No completed transfers between ${from} and ${to}.`}
                  {reportType === "audit" && `No transfer audit events between ${from} and ${to}.`}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b bg-slate-50">
                    <tr>
                      <th className="text-left p-2 font-semibold text-slate-700">Transfer #</th>
                      <th className="text-left p-2 font-semibold text-slate-700">Patient</th>
                      <th className="text-left p-2 font-semibold text-slate-700">From → To</th>
                      <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                      <th className="text-left p-2 font-semibold text-slate-700">Priority</th>
                      <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                      <th className="text-left p-2 font-semibold text-slate-700">Requested</th>
                      {reportType === "performance" && <th className="text-right p-2 font-semibold text-slate-700">Duration (h)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(result.items || []).map((t: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-slate-50">
                        <td className="p-2 font-mono text-[10px]">{t.transferNumber || "—"}</td>
                        <td className="p-2"><div className="font-medium">{t.patient?.firstName} {t.patient?.lastName}</div><div className="text-[10px] text-slate-500">{t.patient?.patientNumber}</div></td>
                        <td className="p-2 text-[10px]"><div>{t.fromFacility?.name}</div><div className="text-slate-500">→ {t.toFacility?.name}</div></td>
                        <td className="p-2 capitalize">{t.transferType}</td>
                        <td className="p-2 capitalize">{t.priority}</td>
                        <td className="p-2 capitalize">{t.status?.replace(/_/g, " ")}</td>
                        <td className="p-2 text-[10px]">{formatDate(t.requestedAt || t.createdAt, true)}</td>
                        {reportType === "performance" && <td className="p-2 text-right font-bold text-cyan-700">{t.totalHours ?? "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reportType === "performance" && result.avgTotalHours != null && (
                  <div className="mt-3 p-3 bg-slate-50 rounded text-sm"><strong>Average Total Duration:</strong> {result.avgTotalHours} hours</div>
                )}
                {reportType === "by_priority" && (
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    {result.items?.map((p: any) => (
                      <div key={p.priority} className="border rounded p-3 text-center"><div className="text-[10px] text-slate-500 capitalize">{p.priority}</div><div className="text-2xl font-bold text-cyan-700">{p.count}</div></div>
                    )) || <div className="text-xs text-slate-500">No data</div>}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

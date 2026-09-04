"use client";
import { useState, useCallback } from "react";
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
  ClipboardCheck, Search, UserPlus, ShieldCheck, ShieldX, ShieldAlert, Clock,
  Users, Activity, FileText, CheckCircle2, AlertCircle, RefreshCcw, Plus,
  ArrowRight, FolderOpen, ArrowLeftRight, FileEdit, Eye, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative,
  calculateAge, safeJson, PageHeader, MiniStatCard, ClearableSearch} from "@/components/ui-helpers"
import { DataTable } from "@/components/ui/data-table";
import { FieldLabel } from "@/components/ui/required-label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PatientPicker, type PatientPickerValue } from "@/components/ui/patient-picker";
import { DepartmentSelect, type EntitySelectValue } from "@/components/ui/entity-select";
import { useAppStore } from "@/stores/app-store";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res);
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

export function RecordsDeskView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setView = useAppStore((s) => s.setView);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const selectEncounter = useAppStore((s) => s.selectEncounter);
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="space-y-4 fade-in-up">
      <PageHeader
        title="Records Desk"
        description="Medical Records & Health Information Management — patient search, check-in, record requests, tracking, and amendments"
        icon={ClipboardCheck}
        gradient="from-emerald-500 to-teal-600"
        actions={
          <>
            <Button size="sm" onClick={() => setView("patient_new")} className="bg-white/20 border border-white/30 text-white hover:bg-white/30">
              <UserPlus className="w-4 h-4 mr-1" /> Register
            </Button>
            <Button size="sm" onClick={() => setView("patients")} className="bg-white/20 border border-white/30 text-white hover:bg-white/30">
              <Users className="w-4 h-4 mr-1" /> All Patients
            </Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto gap-1 p-1 bg-slate-100 rounded-lg">
          <TabsTrigger value="dashboard" className="text-xs whitespace-nowrap flex-1 min-w-[80px]">Dashboard</TabsTrigger>
          <TabsTrigger value="checkin" className="text-xs whitespace-nowrap flex-1 min-w-[80px]">Check-in</TabsTrigger>
          <TabsTrigger value="requests" className="text-xs whitespace-nowrap flex-1 min-w-[80px]">Requests</TabsTrigger>
          <TabsTrigger value="amendments" className="text-xs whitespace-nowrap flex-1 min-w-[80px]">Amendments</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab activeFacilityId={activeFacilityId} />
        </TabsContent>
        <TabsContent value="checkin" className="mt-4">
          <CheckInTab activeFacilityId={activeFacilityId} setView={setView} selectPatient={selectPatient} selectEncounter={selectEncounter} />
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          <RequestsTab />
        </TabsContent>
        <TabsContent value="amendments" className="mt-4">
          <AmendmentsTab canEdit={user?.roles?.includes("super_admin") || (user?.permissions || []).includes("patient.edit")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab({ activeFacilityId }: { activeFacilityId: string | null }) {
  const facilityParam = activeFacilityId ? `?facilityId=${activeFacilityId}` : "";
  const { data: stats, isLoading } = useQuery({
    queryKey: ["records-stats", facilityParam],
    queryFn: () => fetchJson(`/api/records/stats${facilityParam}`),
    refetchInterval: 30000,
  });

  const { data: requestData } = useQuery({
    queryKey: ["record-requests-dashboard"],
    queryFn: () => fetchJson("/api/record-requests?limit=500"),
  });
  const requests: any[] = requestData?.items || [];

  const recordStats = {
    totalRequests: requests.length,
    pending: requests.filter((r) => r.status === "requested" || r.status === "approved").length,
    issued: requests.filter((r) => r.status === "issued" || r.status === "in_use").length,
    overdue: requests.filter((r) => {
      if (r.status === "returned" || r.status === "closed") return false;
      if (!r.issuedAt) return false;
      const issueTime = new Date(r.issuedAt).getTime();
      const hoursSince = (Date.now() - issueTime) / (1000 * 60 * 60);
      return hoursSince > 24;
    }).length,
  };

  return (
    <div className="space-y-4">
      {isLoading ? <LoadingState rows={4} /> : (
        <>
          {/* Patient KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniStatCard label="Today's Check-ins" value={stats?.todayCheckIns ?? 0} icon={Clock} gradient="from-emerald-500 to-emerald-600" />
            <MiniStatCard label="Active Encounters" value={stats?.activeEncounters ?? 0} icon={Activity} gradient="from-blue-500 to-blue-600" />
            <MiniStatCard label="New Patients Today" value={stats?.todayNewPatients ?? 0} icon={UserPlus} gradient="from-purple-500 to-purple-600" />
            <MiniStatCard label="NHIS Valid" value={stats?.insuranceBreakdown?.nhisValid ?? 0} icon={ShieldCheck} gradient="from-teal-500 to-teal-600" />
            <MiniStatCard label="Self-Pay" value={stats?.insuranceBreakdown?.selfPay ?? 0} icon={ShieldX} gradient="from-slate-500 to-slate-600" />
            <MiniStatCard label="NHIS Expired" value={stats?.insuranceBreakdown?.expired ?? 0} icon={ShieldAlert} gradient="from-rose-500 to-red-600" />
          </div>

          {/* Record Request KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStatCard label="Total Requests" value={recordStats.totalRequests} icon={FolderOpen} gradient="from-indigo-500 to-blue-600" />
            <MiniStatCard label="Pending" value={recordStats.pending} icon={Clock} gradient="from-amber-500 to-orange-600" />
            <MiniStatCard label="Issued/In Use" value={recordStats.issued} icon={ArrowRight} gradient="from-purple-500 to-purple-600" />
            <MiniStatCard label="Overdue (>24h)" value={recordStats.overdue} icon={AlertCircle} gradient="from-rose-500 to-red-600" />
          </div>

          {/* Recent Check-ins */}
          {stats?.recentCheckIns?.length > 0 && (
            <Card className="shadow-sm border-slate-200 overflow-hidden">
              <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-2 h-4 rounded-full bg-gradient-to-b from-emerald-500 to-teal-600" />
                  Recent Check-ins ({stats.recentCheckIns.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
                        <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Patient</th>
                        <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">MRN</th>
                        <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Type</th>
                        <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Eligibility</th>
                        <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.recentCheckIns.slice(0, 8).map((enc: any) => (
                        <tr key={enc.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2 text-sm font-medium text-slate-900">{enc.patient.firstName} {enc.patient.lastName}</td>
                          <td className="px-4 py-2 text-xs font-mono text-slate-600">{enc.patient.patientNumber}</td>
                          <td className="px-4 py-2"><span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-medium">{enc.encounterType}</span></td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                              enc.patient.eligibility === "valid" ? "bg-emerald-100 text-emerald-700" :
                              enc.patient.eligibility === "expired" ? "bg-rose-100 text-rose-700" :
                              enc.patient.eligibility === "self_pay" ? "bg-slate-100 text-slate-600" :
                              "bg-amber-100 text-amber-700"
                            }`}>{enc.patient.eligibility?.replace(/_/g, " ") || "—"}</span>
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-500">{formatRelative(enc.startAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// =====================================================================
// CHECK-IN TAB (existing check-in functionality, enhanced UI)
// =====================================================================
function CheckInTab({ activeFacilityId, setView, selectPatient, selectEncounter }: { activeFacilityId: string | null; setView: (v: any) => void; selectPatient: (id: string) => void; selectEncounter: (id: string) => void }) {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkInPatient, setCheckInPatient] = useState<any | null>(null);
  const [encounterType, setEncounterType] = useState("opd");
  const [priority, setPriority] = useState("routine");

  const searchPatients = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}&limit=20`);
      const d = await safeJson(res);
      setSearchResults(d.patients || []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  }, []);

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!activeFacilityId) throw new Error("No facility selected");
      if (!checkInPatient) throw new Error("No patient selected");
      const res = await fetch("/api/records/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: checkInPatient.id, facilityId: activeFacilityId, encounterType, priority, addToQueue: true }),
      });
      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(data.error || `Check-in failed (HTTP ${res.status})`);
      return data;
    },
    onSuccess: (data) => {
      // After check-in, offer the NHIS Workflow shortcut if an encounter was created
      // (not when patient was already checked in)
      const encounterId = data.encounter?.id;
      const payerType = data.encounterCoverage?.payerType || data.payerType;
      const isNhls = payerType === "nhis" || payerType === "NHIS";

      // Surface coverage warnings (multi-insurance or creation failure)
      if (data.coverageWarning) {
        toast.warning(data.coverageWarning, isNhls && encounterId ? {
          duration: 8000,
          action: {
            label: "Open NHIS Workflow →",
            onClick: () => {
              selectEncounter(encounterId);
              setView("nhis_workflow");
            },
          },
        } : { duration: 8000 });
      }

      toast.success(data.message || "Patient checked in successfully", isNhls && encounterId ? {
        action: {
          label: "Open NHIS Workflow →",
          onClick: () => {
            selectEncounter(encounterId);
            setView("nhis_workflow");
          },
        },
      } : undefined);

      qc.invalidateQueries({ queryKey: ["records-stats"] });
      qc.invalidateQueries({ queryKey: ["encounters"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
      setCheckInPatient(null);
      selectPatient(data.patient.id);
      setView("patient_360");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Patient Search */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-600" /> Find & Check-in Patient
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <SearchableSelect
            options={searchResults.map((p) => ({
              value: p.id,
              label: `${p.firstName} ${p.lastName}`,
              description: p.phone || undefined,
              secondary: p.patientNumber,
              initials: `${p.firstName?.[0] || ""}${p.lastName?.[0] || ""}`.toUpperCase(),
            }))}
            value=""
            onValueChange={(v) => { const p = searchResults.find((p) => p.id === v); if (p) setCheckInPatient(p); }}
            onSearch={(q) => searchPatients(q)}
            placeholder="Search patient by name, MRN, phone, or Ghana Card..."
            searchPlaceholder="Type at least 2 characters to search..."
            emptyText="No patients found"
            label="Search Existing Patient"
            required
          />

          {/* Selected patient preview */}
          {checkInPatient && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h4 className="font-bold text-slate-900">{checkInPatient.firstName} {checkInPatient.lastName}</h4>
                  <p className="text-xs text-slate-600">
                    MRN: <span className="font-mono font-semibold">{checkInPatient.patientNumber}</span> ·
                    {checkInPatient.sex ? ` ${checkInPatient.sex}` : ""} ·
                    {checkInPatient.dateOfBirth ? ` ${calculateAge(checkInPatient.dateOfBirth)}y` : ""} ·
                    {checkInPatient.bloodGroup ? ` Blood: ${checkInPatient.bloodGroup}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCheckInPatient(null)}>✕ Clear</Button>
              </div>
              <div className="flex flex-wrap gap-3 mt-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Encounter Type</Label>
                  <Select value={encounterType} onValueChange={setEncounterType}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="opd">OPD</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="routine">Routine</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => checkInMutation.mutate()}
                    disabled={checkInMutation.isPending || !activeFacilityId}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md"
                  >
                    {checkInMutation.isPending ? "Checking in..." : "Check In Patient"}
                  </Button>
                </div>
              </div>
              {!activeFacilityId && <p className="text-xs text-amber-600 mt-2">⚠ Select a facility from the top bar to check in.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// RECORD REQUESTS TAB
// =====================================================================
function RequestsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [viewItem, setViewItem] = useState<any>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (priorityFilter !== "all") params.set("priority", priorityFilter);

  const { data, isLoading, refetch, isFetching } = useQuery({
    staleTime: 0,
    queryKey: ["record-requests", params.toString()],
    queryFn: () => fetchJson(`/api/record-requests?${params.toString()}`),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/record-requests", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => { toast.success("Record request created"); setShowForm(false); qc.invalidateQueries({ queryKey: ["record-requests"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/record-requests/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Status → ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["record-requests"] });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search by patient, MRN, department..." className="pl-0" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="requested">Requested</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="retrieving">Retrieving</SelectItem>
              <SelectItem value="issued">Issued</SelectItem>
              <SelectItem value="in_use">In Use</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="routine">Routine</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="emergency">Emergency</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }} disabled={isFetching} variant="outline"><RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white">
            <Plus className="w-4 h-4 mr-1" /> New Request
          </Button>
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={4} /> :
       items.length === 0 ? <EmptyState title="No record requests" description="Create a request when a department needs a patient's physical record." icon={FolderOpen} /> :
       <Card className="shadow-sm border-slate-200 overflow-hidden">
         <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
           <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
             <span className="w-2 h-4 rounded-full bg-gradient-to-b from-indigo-500 to-blue-600" />
             Record Requests ({items.length})
           </CardTitle>
         </CardHeader>
         <CardContent className="p-0">
           <DataTable
             headers={["Req #", "Patient", "MRN", "Dept", "Priority", "Status", "Requested", "Actions"]}
             rows={items.map((item) => {
               const isOverdue = item.issuedAt && (Date.now() - new Date(item.issuedAt).getTime()) / (1000 * 60 * 60) > 24 && item.status !== "returned" && item.status !== "closed";
               return {
                 cells: [
                   <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-indigo-500 to-blue-600 px-2 py-0.5 rounded-md font-semibold">{item.requestNumber}</span>,
                   <span key="p" className="text-sm font-medium text-slate-900">{item.patientName}</span>,
                   <span key="m" className="text-xs font-mono text-slate-500">{item.patientNumber || "—"}</span>,
                   <span key="d" className="text-xs text-slate-600">{item.requestingDepartment || "—"}</span>,
                   <StatusBadge key="pr" status={item.priority} />,
                   <span key="st"><StatusBadge status={item.status} />{isOverdue && <span className="ml-1 text-[10px] text-rose-600 font-bold">OVERDUE</span>}</span>,
                   <span key="c" className="text-xs text-slate-500">{formatRelative(item.requestedAt)}</span>,
                   <Button key="a" variant="ghost" size="sm" onClick={() => setViewItem(item)}><Eye className="w-4 h-4" /></Button>,
                 ],
                 sortValues: [item.requestNumber, item.patientName, item.patientNumber || "", item.requestingDepartment || "", item.priority, item.status, item.requestedAt, ""],
                 onClick: () => setViewItem(item),
                 rowClassName: isOverdue ? "bg-rose-50/30" : "",
               };
             })}
             gradient="from-indigo-500 to-blue-600"
             pageSize={10}
           />
         </CardContent>
       </Card>}

      {showForm && (
        <Dialog open onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="-mx-6 -mt-6 px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white"><DialogTitle className="flex items-center gap-2 text-white"><FolderOpen className="w-5 h-5 text-indigo-600" /> New Record Request</DialogTitle></DialogHeader>
            <RequestForm onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      )}

      {viewItem && (
        <Dialog open onOpenChange={() => setViewItem(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="-mx-6 -mt-6 px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
              <DialogTitle className="flex items-center gap-2 text-white">{viewItem.requestNumber} — {viewItem.patientName}</DialogTitle>
              <DialogDescription className="text-white/80">Requested {formatDate(viewItem.requestedAt, true)}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-lg">
              <div><Label className="text-slate-500">Priority</Label><div><StatusBadge status={viewItem.priority} /></div></div>
              <div><Label className="text-slate-500">Status</Label><div><StatusBadge status={viewItem.status} /></div></div>
              <div><Label className="text-slate-500">Department</Label><div>{viewItem.requestingDepartment || "—"}</div></div>
              {viewItem.patientNumber && <div><Label className="text-slate-500">MRN</Label><div className="font-mono">{viewItem.patientNumber}</div></div>}
              {viewItem.requestingStaffName && <div><Label className="text-slate-500">Requested By</Label><div>{viewItem.requestingStaffName}</div></div>}
              {viewItem.assignedToName && <div><Label className="text-slate-500">Assigned To</Label><div>{viewItem.assignedToName}</div></div>}
              {viewItem.issuedAt && <div><Label className="text-slate-500">Issued</Label><div>{formatDate(viewItem.issuedAt, true)}</div></div>}
              {viewItem.returnedAt && <div><Label className="text-slate-500">Returned</Label><div>{formatDate(viewItem.returnedAt, true)}</div></div>}
            </div>
            {viewItem.purpose && <div><Label className="text-slate-500">Purpose</Label><p className="text-sm text-slate-700">{viewItem.purpose}</p></div>}
            {viewItem.notes && <div><Label className="text-slate-500">Notes</Label><p className="text-sm text-slate-600">{viewItem.notes}</p></div>}
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {viewItem.status === "requested" && <Button size="sm" variant="outline" onClick={() => updateStatus(viewItem.id, "approved")}>Approve</Button>}
              {viewItem.status === "approved" && <Button size="sm" variant="outline" onClick={() => updateStatus(viewItem.id, "retrieving")}>Start Retrieval</Button>}
              {viewItem.status === "retrieving" && <Button size="sm" variant="outline" onClick={() => updateStatus(viewItem.id, "issued")}>Issue Record</Button>}
              {(viewItem.status === "issued" || viewItem.status === "in_use") && <Button size="sm" variant="outline" className="text-emerald-600" onClick={() => updateStatus(viewItem.id, "returned")}>Mark Returned</Button>}
              {viewItem.status === "returned" && <Button size="sm" variant="outline" onClick={() => updateStatus(viewItem.id, "closed")}>Close</Button>}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function RequestForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [patient, setPatient] = useState<PatientPickerValue | null>(null);
  const [department, setDepartment] = useState<EntitySelectValue | null>(null);
  const [form, setForm] = useState({
    requestingStaffName: "",
    purpose: "", priority: "routine",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  const submit = () => {
    if (!patient) return;
    onSubmit({
      ...form,
      patientId: patient.patientId,
      patientName: patient.patientName,
      patientNumber: patient.patientNumber,
      requestingDepartment: department?.label || null,
    });
  };
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <PatientPicker
          label="Patient"
          required
          value={patient}
          onChange={setPatient}
          onRegisterNew={() => {
            // caller can hook this if needed
          }}
        />
      </div>
      <div className="col-span-2">
        <DepartmentSelect
          label="Requesting Department"
          value={department}
          onChange={setDepartment}
          allowManual
        />
      </div>
      <div>
        <Label>Priority</Label>
        <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="routine">Routine</SelectItem><SelectItem value="urgent">Urgent</SelectItem><SelectItem value="emergency">Emergency</SelectItem></SelectContent>
        </Select>
      </div>
      <div><Label>Requesting Staff</Label><Input value={form.requestingStaffName} onChange={(e) => set("requestingStaffName", e.target.value)} /></div>
      <div className="col-span-2"><Label>Purpose</Label><Textarea value={form.purpose} onChange={(e) => set("purpose", e.target.value)} rows={2} placeholder="Why is the record needed?" /></div>
      <DialogFooter><Button onClick={submit} disabled={loading || !patient?.patientName}>{loading ? "Creating..." : "Create Request"}</Button></DialogFooter>
    </div>
  );
}

// =====================================================================
// AMENDMENTS TAB
// =====================================================================
function AmendmentsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading, refetch, isFetching } = useQuery({
    staleTime: 0,
    queryKey: ["record-amendments", params.toString()],
    queryFn: () => fetchJson(`/api/record-amendments?${params.toString()}`),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/record-amendments", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => { toast.success("Amendment request submitted"); setShowForm(false); qc.invalidateQueries({ queryKey: ["record-amendments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateAmendment = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/record-amendments/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Amendment ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["record-amendments"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search amendments..." className="pl-0" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="applied">Applied</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }} disabled={isFetching} variant="outline"><RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
            <Plus className="w-4 h-4 mr-1" /> Request Amendment
          </Button>
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={4} /> :
       items.length === 0 ? <EmptyState title="No amendments" description="Request a record correction or amendment." icon={FileEdit} /> :
       <div className="space-y-2">
         {items.map((item) => (
           <div key={item.id} className="border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all bg-white card-hover-lift">
             <div className="flex items-start justify-between gap-3">
               <div className="flex-1">
                 <div className="flex items-center gap-2 mb-1">
                   <span className="font-mono text-xs text-white bg-gradient-to-r from-amber-500 to-orange-600 px-2 py-0.5 rounded-md font-semibold uppercase">{item.amendmentType}</span>
                   <span className="font-bold text-slate-900">{item.patientName}</span>
                   <StatusBadge status={item.status} />
                 </div>
                 <p className="text-xs text-slate-600 mt-1"><strong>Reason:</strong> {item.reason}</p>
                 {item.field && <p className="text-xs text-slate-500 mt-1"><strong>Field:</strong> {item.field} — <span className="text-rose-600 line-through">{item.originalValue}</span> → <span className="text-emerald-600 font-medium">{item.correctedValue}</span></p>}
                 <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                   <span>By: {item.requestedByName || "—"}</span>
                   <span>{formatRelative(item.requestedAt)}</span>
                   {item.approvedByName && <span>Approved by: {item.approvedByName}</span>}
                 </div>
               </div>
               {canEdit && item.status === "pending" && (
                 <div className="flex gap-1">
                   <Button size="sm" variant="outline" className="text-emerald-600" onClick={() => updateAmendment(item.id, "approved")}>Approve</Button>
                   <Button size="sm" variant="outline" className="text-rose-600" onClick={() => updateAmendment(item.id, "rejected")}>Reject</Button>
                 </div>
               )}
               {canEdit && item.status === "approved" && (
                 <Button size="sm" variant="outline" onClick={() => updateAmendment(item.id, "applied")}>Mark Applied</Button>
               )}
             </div>
           </div>
         ))}
       </div>}

      {showForm && (
        <Dialog open onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="-mx-6 -mt-6 px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white"><DialogTitle className="flex items-center gap-2 text-white"><FileEdit className="w-5 h-5" /> Request Record Amendment</DialogTitle></DialogHeader>
            <AmendmentForm onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AmendmentForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [patient, setPatient] = useState<PatientPickerValue | null>(null);
  const [form, setForm] = useState({
    amendmentType: "demographic", field: "", originalValue: "", correctedValue: "", reason: "",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  const submit = () => {
    if (!patient) return;
    onSubmit({
      ...form,
      patientId: patient.patientId,
      patientName: patient.patientName,
    });
  };
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <PatientPicker
          label="Patient"
          required
          value={patient}
          onChange={setPatient}
        />
      </div>
      <div>
        <FieldLabel>Amendment Type</FieldLabel>
        <Select value={form.amendmentType} onValueChange={(v) => set("amendmentType", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="demographic">Demographic</SelectItem>
            <SelectItem value="clinical">Clinical</SelectItem>
            <SelectItem value="document">Document</SelectItem>
            <SelectItem value="record_correction">Record Correction</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>Field</Label><Input value={form.field} onChange={(e) => set("field", e.target.value)} placeholder="e.g., date_of_birth, phone" /></div>
      <div><Label>Original Value</Label><Input value={form.originalValue} onChange={(e) => set("originalValue", e.target.value)} /></div>
      <div><Label>Corrected Value</Label><Input value={form.correctedValue} onChange={(e) => set("correctedValue", e.target.value)} /></div>
      <div className="col-span-2"><FieldLabel>Reason</FieldLabel><Textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} rows={3} placeholder="Why is this correction needed?" /></div>
      <DialogFooter><Button onClick={submit} disabled={loading || !patient?.patientName || !form.reason}>{loading ? "Submitting..." : "Submit Request"}</Button></DialogFooter>
    </div>
  );
}

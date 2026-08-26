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
  Sparkles, Plus, Search, RefreshCcw, Eye, Pencil, Trash2, AlertCircle,
  Wrench, Brush, Shield, Truck, UtensilsCrossed, Trash, Clock, CheckCircle2,
  TrendingUp, ClipboardCheck, Calendar, Cpu, Activity,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative,
  safeJson, PageHeader, MiniStatCard, ClearableSearch} from "@/components/ui-helpers"
import { DataTable } from "@/components/ui/data-table";
import { FieldLabel } from "@/components/ui/required-label";
import { PatientPicker, type PatientPickerValue } from "@/components/ui/patient-picker";
import { DepartmentSelect, type EntitySelectValue } from "@/components/ui/entity-select";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res);
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

const SERVICE_TYPES = [
  { value: "laundry", label: "Laundry", icon: Brush, gradient: "from-cyan-500 to-blue-600" },
  { value: "housekeeping", label: "Housekeeping", icon: Sparkles, gradient: "from-teal-500 to-teal-600" },
  { value: "catering", label: "Catering", icon: UtensilsCrossed, gradient: "from-amber-500 to-orange-600" },
  { value: "waste", label: "Waste Mgmt", icon: Trash, gradient: "from-emerald-500 to-emerald-600" },
  { value: "security", label: "Security", icon: Shield, gradient: "from-rose-500 to-red-600" },
  { value: "transport", label: "Transport", icon: Truck, gradient: "from-indigo-500 to-blue-600" },
];

const INSPECTION_TYPES = [
  { value: "all", label: "All Types" },
  { value: "safety", label: "Safety" },
  { value: "cleanliness", label: "Cleanliness" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "fire_safety", label: "Fire Safety" },
  { value: "equipment", label: "Equipment" },
  { value: "security", label: "Security" },
];

export function SupportServicesView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canManage = can("support_services.manage");
  const canView = can("support_services.view");
  const [activeTab, setActiveTab] = useState("dashboard");

  if (!canView) {
    return (
      <Card><CardContent className="p-12 text-center">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
        <p className="text-sm text-slate-500">You don&apos;t have permission to access Support Services.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4 fade-in-up">
      <PageHeader
        title="Support Services & Facility Operations"
        description="Hospital support services — laundry, housekeeping, catering, waste, security, transport, maintenance, and inspections"
        icon={Sparkles}
        gradient="from-teal-500 to-teal-600"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto gap-1 p-1 bg-slate-100 rounded-lg">
          <TabsTrigger value="dashboard" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Dashboard</TabsTrigger>
          <TabsTrigger value="requests" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Requests</TabsTrigger>
          <TabsTrigger value="maintenance" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Maintenance</TabsTrigger>
          <TabsTrigger value="inspections" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Inspections</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          <RequestsTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="maintenance" className="mt-4">
          <MaintenanceTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="inspections" className="mt-4">
          <InspectionsTab canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["service-requests-dashboard"],
    queryFn: () => fetchJson("/api/service-requests?limit=500"),
  });
  const requests: any[] = data?.items || [];

  const stats = {
    total: requests.length,
    requested: requests.filter((r) => r.status === "requested").length,
    assigned: requests.filter((r) => r.status === "assigned").length,
    inProgress: requests.filter((r) => r.status === "in_progress").length,
    completed: requests.filter((r) => r.status === "completed").length,
    urgent: requests.filter((r) => r.priority === "urgent" || r.priority === "emergency").length,
  };

  // By service type
  const byType = SERVICE_TYPES.map((t) => ({
    ...t,
    count: requests.filter((r) => r.serviceType === t.value).length,
    open: requests.filter((r) => r.serviceType === t.value && r.status !== "completed" && r.status !== "cancelled").length,
  }));

  return (
    <div className="space-y-4">
      {isLoading ? <LoadingState rows={4} /> : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniStatCard label="Total Requests" value={stats.total} icon={Sparkles} gradient="from-teal-500 to-teal-600" />
            <MiniStatCard label="Requested" value={stats.requested} icon={Clock} gradient="from-amber-500 to-orange-600" />
            <MiniStatCard label="Assigned" value={stats.assigned} icon={ClipboardCheck} gradient="from-blue-500 to-blue-600" />
            <MiniStatCard label="In Progress" value={stats.inProgress} icon={Activity} gradient="from-purple-500 to-purple-600" />
            <MiniStatCard label="Completed" value={stats.completed} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
            <MiniStatCard label="Urgent/Emergency" value={stats.urgent} icon={AlertCircle} gradient="from-rose-500 to-red-600" />
          </div>

          {/* By Service Type */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-4 rounded-full bg-gradient-to-b from-teal-500 to-teal-600" />
                Requests by Service Type
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {byType.map((t) => {
                  const Icon = t.icon;
                  return (
                    <div key={t.value} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${t.gradient} text-white p-3 shadow-md card-hover-lift`}>
                      <Icon className="absolute top-2 right-2 w-6 h-6 text-white/20" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">{t.label}</p>
                      <p className="text-2xl font-extrabold">{t.count}</p>
                      {t.open > 0 && <p className="text-[10px] text-white/70">{t.open} open</p>}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// =====================================================================
// REQUESTS TAB
// =====================================================================
function RequestsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [serviceType, setServiceType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [viewItem, setViewItem] = useState<any>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (serviceType !== "all") params.set("serviceType", serviceType);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (priorityFilter !== "all") params.set("priority", priorityFilter);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    staleTime: 0,
    queryKey: ["service-requests", params.toString()],
    queryFn: () => fetchJson(`/api/service-requests?${params.toString()}`),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Service request created");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["service-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search by title, location, patient..." className="pl-0" />
          </div>
          <Select value={serviceType} onValueChange={setServiceType}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Service" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {SERVICE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="requested">Requested</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="routine">Routine</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="emergency">Emergency</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }} disabled={isFetching} variant="outline"><RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-teal-500 to-teal-600 text-white">
            <Plus className="w-4 h-4 mr-1" /> New Request
          </Button>
        </CardContent>
      </Card>

      {/* Request list */}
      <Card className="shadow-sm border-slate-200 overflow-hidden">
        <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span className="w-2 h-4 rounded-full bg-gradient-to-b from-teal-500 to-teal-600" />
            Service Requests ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <LoadingState rows={5} /> :
           isError ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> :
           items.length === 0 ? <EmptyState title="No requests" description="Create a new service request to get support." icon={Sparkles} /> :
           <DataTable
             headers={["Request #", "Title", "Service", "Priority", "Status", "Location", "Created", "Actions"]}
             rows={items.map((item) => {
               const typeInfo = SERVICE_TYPES.find((t) => t.value === item.serviceType) || SERVICE_TYPES[0];
               const TypeIcon = typeInfo.icon;
               return {
                 cells: [
                   <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-slate-600 to-slate-700 px-2 py-0.5 rounded-md font-semibold">{item.requestNumber}</span>,
                   <span key="t" className="text-sm font-medium text-slate-900 max-w-xs truncate inline-block">{item.title}</span>,
                   <span key="s" className="inline-flex items-center gap-1 text-xs text-slate-600"><TypeIcon className="w-3 h-3" />{typeInfo.label}</span>,
                   <StatusBadge key="p" status={item.priority} />,
                   <StatusBadge key="st" status={item.status} />,
                   <span key="l" className="text-xs text-slate-500">{item.location || "—"}</span>,
                   <span key="c" className="text-xs text-slate-500">{formatRelative(item.createdAt)}</span>,
                   <Button key="a" variant="ghost" size="sm" onClick={() => setViewItem(item)}><Eye className="w-4 h-4" /></Button>,
                 ],
                 sortValues: [item.requestNumber, item.title, typeInfo.label, item.priority, item.status, item.location || "", item.createdAt, ""],
                 onClick: () => setViewItem(item),
               };
             })}
             gradient="from-teal-500 to-teal-600"
             pageSize={10}
           />}
        </CardContent>
      </Card>

      {showForm && <RequestForm open={showForm} onOpenChange={setShowForm} onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />}
      {viewItem && <RequestDetail item={viewItem} canManage={canManage} onClose={() => setViewItem(null)} />}
    </div>
  );
}

function RequestForm({ open, onOpenChange, onSubmit, loading }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: any) => void; loading: boolean }) {
  const [patient, setPatient] = useState<PatientPickerValue | null>(null);
  const [department, setDepartment] = useState<EntitySelectValue | null>(null);
  const [form, setForm] = useState({
    serviceType: "housekeeping", title: "", description: "", priority: "routine",
    location: "", quantity: "", unit: "pcs",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const submit = () => {
    const payload: any = { ...form };
    if (patient) {
      payload.patientId = patient.patientId;
      payload.patientName = patient.patientName;
    }
    if (department) {
      payload.departmentCode = department.code || department.label;
    }
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-teal-600" /> New Service Request</DialogTitle>
          <DialogDescription>Request a support service for your department or facility.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Service Type</FieldLabel>
            <Select value={form.serviceType} onValueChange={(v) => set("serviceType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SERVICE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Priority</FieldLabel>
            <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><FieldLabel>Title</FieldLabel><Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Brief summary of the request" /></div>
          <div className="col-span-2"><FieldLabel>Description</FieldLabel><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Detailed description..." /></div>
          <div><Label>Location</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Ward / Room / Area" /></div>
          <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="e.g., 50" /></div>
          <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="pcs / kg / meal / bag / trip" /></div>
          <div className="col-span-2">
            <DepartmentSelect
              label="Department (optional)"
              value={department}
              onChange={setDepartment}
              allowManual
            />
          </div>
          <div className="col-span-2">
            <PatientPicker
              label="Patient (optional — link if service is patient-related)"
              value={patient}
              onChange={setPatient}
              allowManual
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={loading || !form.title}>{loading ? "Creating..." : "Create Request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestDetail({ item, canManage, onClose }: { item: any; canManage: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const typeInfo = SERVICE_TYPES.find((t) => t.value === item.serviceType) || SERVICE_TYPES[0];
  const TypeIcon = typeInfo.icon;

  const updateStatus = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/service-requests/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Status changed to ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["service-requests"] });
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TypeIcon className="w-5 h-5 text-teal-600" />
            {item.requestNumber} — {item.title}
          </DialogTitle>
          <DialogDescription>Created {formatDate(item.createdAt, true)}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-lg">
          <div><Label className="text-slate-500">Service Type</Label><div className="font-semibold">{typeInfo.label}</div></div>
          <div><Label className="text-slate-500">Priority</Label><div><StatusBadge status={item.priority} /></div></div>
          <div><Label className="text-slate-500">Status</Label><div><StatusBadge status={item.status} /></div></div>
          <div><Label className="text-slate-500">Location</Label><div>{item.location || "—"}</div></div>
          <div><Label className="text-slate-500">Department</Label><div>{item.departmentCode || "—"}</div></div>
          <div><Label className="text-slate-500">Assigned To</Label><div>{item.assignedToName || "Unassigned"}</div></div>
          {item.quantity && <div><Label className="text-slate-500">Quantity</Label><div>{item.quantity} {item.unit || ""}</div></div>}
          {item.cost && <div><Label className="text-slate-500">Cost</Label><div>₵{item.cost}</div></div>}
          {item.completedAt && <div><Label className="text-slate-500">Completed</Label><div>{formatDate(item.completedAt, true)}</div></div>}
        </div>
        {item.description && (
          <div><Label className="text-slate-500">Description</Label><p className="mt-1 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg p-3">{item.description}</p></div>
        )}
        {item.notes && (
          <div><Label className="text-slate-500">Notes</Label><p className="mt-1 text-sm text-slate-600">{item.notes}</p></div>
        )}
        {canManage && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {item.status === "requested" && <Button size="sm" variant="outline" onClick={() => updateStatus("assigned")}>Assign</Button>}
            {item.status === "assigned" && <Button size="sm" variant="outline" onClick={() => updateStatus("in_progress")}>Start Work</Button>}
            {item.status === "in_progress" && <Button size="sm" variant="outline" className="text-emerald-600" onClick={() => updateStatus("completed")}>Mark Completed</Button>}
            {item.status !== "cancelled" && <Button size="sm" variant="outline" className="text-rose-600" onClick={() => updateStatus("cancelled")}>Cancel</Button>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// MAINTENANCE TAB
// =====================================================================
function MaintenanceTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading, refetch, isFetching } = useQuery({
    staleTime: 0,
    queryKey: ["maintenance-schedule", params.toString()],
    queryFn: () => fetchJson(`/api/maintenance-schedule?${params.toString()}`),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/maintenance-schedule", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => { toast.success("Maintenance scheduled"); setShowForm(false); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];
  const stats = {
    total: items.length,
    scheduled: items.filter((i) => i.status === "scheduled").length,
    inProgress: items.filter((i) => i.status === "in_progress").length,
    completed: items.filter((i) => i.status === "completed").length,
    overdue: items.filter((i) => i.status === "overdue" || (i.scheduledDate && new Date(i.scheduledDate) < new Date() && i.status !== "completed")).length,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard label="Total" value={stats.total} icon={Wrench} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="Scheduled" value={stats.scheduled} icon={Calendar} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Completed" value={stats.completed} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Overdue" value={stats.overdue} icon={AlertCircle} gradient="from-rose-500 to-red-600" />
      </div>

      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search maintenance..." className="pl-0" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }} disabled={isFetching} variant="outline"><RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          {canManage && <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white"><Plus className="w-4 h-4 mr-1" /> Schedule</Button>}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={4} /> :
       items.length === 0 ? <EmptyState title="No maintenance scheduled" description="Schedule preventive or corrective maintenance tasks." icon={Wrench} /> :
       <div className="space-y-2">
         {items.map((item) => {
           const isOverdue = item.scheduledDate && new Date(item.scheduledDate) < new Date() && item.status !== "completed";
           return (
             <div key={item.id} className={`border rounded-xl p-4 hover:shadow-md transition-all bg-white card-hover-lift ${isOverdue ? "border-rose-300 bg-rose-50/30" : "border-slate-200"}`}>
               <div className="flex items-start justify-between gap-3">
                 <div className="flex-1">
                   <div className="flex items-center gap-2 mb-1">
                     <span className="font-mono text-xs text-white bg-gradient-to-r from-blue-500 to-blue-600 px-2 py-0.5 rounded-md font-semibold">{item.maintenanceType}</span>
                     <span className="font-bold text-slate-900">{item.title}</span>
                     <StatusBadge status={isOverdue ? "overdue" : item.status} />
                   </div>
                   {item.description && <p className="text-xs text-slate-600 mt-1">{item.description}</p>}
                   <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                     <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(item.scheduledAt, true)}</span>
                     {item.assignedToName && <span>→ {item.assignedToName}</span>}
                     {item.frequency && <span className="bg-slate-100 px-1.5 py-0.5 rounded font-medium uppercase">{item.frequency}</span>}
                     {item.cost && <span>₵{item.cost}</span>}
                   </div>
                 </div>
               </div>
             </div>
           );
         })}
       </div>}

      {showForm && canManage && (
        <Dialog open onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Wrench className="w-5 h-5" /> Schedule Maintenance</DialogTitle></DialogHeader>
            <MaintenanceForm onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function MaintenanceForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({
    maintenanceType: "preventive", title: "", description: "", scheduledDate: "",
    assignedToName: "", frequency: "monthly", location: "", notes: "",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Maintenance Type</FieldLabel>
          <Select value={form.maintenanceType} onValueChange={(v) => set("maintenanceType", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="preventive">Preventive</SelectItem>
              <SelectItem value="corrective">Corrective</SelectItem>
              <SelectItem value="calibration">Calibration</SelectItem>
              <SelectItem value="inspection">Inspection</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><FieldLabel>Scheduled Date</FieldLabel><Input type="datetime-local" value={form.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)} /></div>
      </div>
      <div><FieldLabel>Title</FieldLabel><Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g., AC servicing - Laboratory" /></div>
      <div><FieldLabel>Description</FieldLabel><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Assigned To</Label><Input value={form.assignedToName} onChange={(e) => set("assignedToName", e.target.value)} /></div>
        <div>
          <Label>Frequency</Label>
          <Select value={form.frequency} onValueChange={(v) => set("frequency", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="annually">Annually</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>Location</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} /></div>
      <DialogFooter><Button onClick={() => onSubmit(form)} disabled={loading || !form.title || !form.scheduledDate}>{loading ? "Scheduling..." : "Schedule Maintenance"}</Button></DialogFooter>
    </div>
  );
}

// =====================================================================
// INSPECTIONS TAB
// =====================================================================
function InspectionsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (typeFilter !== "all") params.set("inspectionType", typeFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading, refetch, isFetching } = useQuery({
    staleTime: 0,
    queryKey: ["facility-inspections", params.toString()],
    queryFn: () => fetchJson(`/api/facility-inspections?${params.toString()}`),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/facility-inspections", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => { toast.success("Inspection recorded"); setShowForm(false); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search inspections..." className="pl-0" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{INSPECTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }} disabled={isFetching} variant="outline"><RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          {canManage && <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-teal-500 to-teal-600 text-white"><Plus className="w-4 h-4 mr-1" /> New Inspection</Button>}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={4} /> :
       items.length === 0 ? <EmptyState title="No inspections" description="Record facility inspections for safety, cleanliness, equipment, etc." icon={ClipboardCheck} /> :
       <div className="space-y-2">
         {items.map((item) => (
           <div key={item.id} className="border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all bg-white card-hover-lift">
             <div className="flex items-start justify-between gap-3">
               <div className="flex-1">
                 <div className="flex items-center gap-2 mb-1">
                   <span className="font-mono text-xs text-white bg-gradient-to-r from-teal-500 to-teal-600 px-2 py-0.5 rounded-md font-semibold uppercase">{item.inspectionType}</span>
                   <span className="font-bold text-slate-900">{item.title}</span>
                   <StatusBadge status={item.status} />
                   <StatusBadge status={item.severity} />
                 </div>
                 {item.findings && <p className="text-xs text-slate-600 mt-1">{item.findings}</p>}
                 <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                   <span>{formatDate(item.inspectedAt, true)}</span>
                   {item.location && <span>📍 {item.location}</span>}
                   {item.inspectorName && <span>by {item.inspectorName}</span>}
                   {item.correctiveAction && <span className="text-amber-600">⚠ {item.correctiveAction}</span>}
                 </div>
               </div>
             </div>
           </div>
         ))}
       </div>}

      {showForm && canManage && (
        <Dialog open onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><ClipboardCheck className="w-5 h-5" /> New Facility Inspection</DialogTitle></DialogHeader>
            <InspectionForm onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function InspectionForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({
    inspectionType: "safety", title: "", description: "", inspectorName: "",
    location: "", departmentCode: "", findings: "", severity: "low", correctiveAction: "",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Inspection Type</FieldLabel>
          <Select value={form.inspectionType} onValueChange={(v) => set("inspectionType", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{INSPECTION_TYPES.filter((t) => t.value !== "all").map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel>Severity</FieldLabel>
          <Select value={form.severity} onValueChange={(v) => set("severity", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div><FieldLabel>Title</FieldLabel><Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g., Monthly fire safety inspection" /></div>
      <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Inspector</Label><Input value={form.inspectorName} onChange={(e) => set("inspectorName", e.target.value)} /></div>
        <div><Label>Location</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} /></div>
      </div>
      <div><Label>Findings</Label><Textarea value={form.findings} onChange={(e) => set("findings", e.target.value)} rows={3} placeholder="What was found during the inspection..." /></div>
      <div><Label>Corrective Action</Label><Input value={form.correctiveAction} onChange={(e) => set("correctiveAction", e.target.value)} placeholder="Action taken or required" /></div>
      <DialogFooter><Button onClick={() => onSubmit(form)} disabled={loading || !form.title}>{loading ? "Recording..." : "Record Inspection"}</Button></DialogFooter>
    </div>
  );
}

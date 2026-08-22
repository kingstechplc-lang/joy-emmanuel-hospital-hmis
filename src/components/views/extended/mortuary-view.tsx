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
  Skull, Plus, Search, RefreshCcw, Eye, DoorOpen, UserX, Building2, Phone,
  FileText, AlertCircle, Download, Activity, Boxes, MapPin, Clock,
  CheckCircle2, Calendar, Users as UsersIcon, ArrowRight, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative,
  safeJson, PageHeader, MiniStatCard,
} from "@/components/ui-helpers";
import { DataTable } from "@/components/ui/data-table";
import { FieldLabel } from "@/components/ui/required-label";
import { PatientPicker, type PatientPickerValue } from "@/components/ui/patient-picker";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "admitted", label: "Admitted" },
  { value: "stored", label: "In Storage" },
  { value: "released", label: "Released" },
  { value: "transferred_out", label: "Transferred Out" },
];
const PLACE_OF_DEATH = [
  { value: "facility", label: "This Facility" },
  { value: "home", label: "Home" },
  { value: "roadside", label: "Roadside" },
  { value: "other_facility", label: "Another Facility" },
  { value: "unknown", label: "Unknown" },
];
const STORAGE_TYPES = [
  { value: "all", label: "All Types" },
  { value: "refrigerator", label: "Refrigerator" },
  { value: "freezer", label: "Freezer" },
  { value: "shelf", label: "Shelf" },
  { value: "room", label: "Room" },
  { value: "other", label: "Other" },
];

export function MortuaryView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canManage = can("mortuary.manage");
  const canView = can("mortuary.view");
  const [activeTab, setActiveTab] = useState("dashboard");

  if (!canView) {
    return (
      <Card><CardContent className="p-12 text-center">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
        <p className="text-sm text-slate-500">You don&apos;t have permission to access the mortuary.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4 fade-in-up">
      <PageHeader
        title="Mortuary & Decedent Management"
        description="Manage deceased persons, body intake, storage, viewing, release, and chain of custody"
        icon={Skull}
        gradient="from-slate-600 to-slate-800"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto gap-1 p-1 bg-slate-100 rounded-lg tabs-scroll">
          <TabsTrigger value="dashboard" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Dashboard</TabsTrigger>
          <TabsTrigger value="cases" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Cases</TabsTrigger>
          <TabsTrigger value="storage" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Storage</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="cases" className="mt-4">
          <CasesTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="storage" className="mt-4">
          <StorageTab canManage={canManage} />
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
    queryKey: ["mortuary-dashboard"],
    queryFn: () => fetchJson("/api/mortuary?limit=500"),
    staleTime: 0,
  });
  const cases: any[] = data?.items || [];

  const inStorage = cases.filter((c) => c.admissionStatus === "admitted" || c.admissionStatus === "stored");
  const released = cases.filter((c) => c.admissionStatus === "released");
  const broughtIn = cases.filter((c) => c.placeOfDeath !== "facility");
  const longStay = inStorage.filter((c) => {
    const days = (Date.now() - new Date(c.admittedAt).getTime()) / (1000 * 60 * 60 * 24);
    return days > 30;
  });
  const awaitingRelease = inStorage.filter((c) => c.admissionStatus === "stored");

  return (
    <div className="space-y-4">
      {isLoading ? <LoadingState rows={4} /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniStatCard label="Total Cases" value={cases.length} icon={Skull} gradient="from-slate-600 to-slate-800" />
            <MiniStatCard label="In Storage" value={inStorage.length} icon={Boxes} gradient="from-amber-500 to-orange-600" />
            <MiniStatCard label="Released" value={released.length} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
            <MiniStatCard label="Brought-in" value={broughtIn.length} icon={UserX} gradient="from-rose-500 to-red-600" />
            <MiniStatCard label="Awaiting Release" value={awaitingRelease.length} icon={Clock} gradient="from-blue-500 to-blue-600" />
            <MiniStatCard label="Long-stay (>30d)" value={longStay.length} icon={AlertCircle} gradient="from-purple-500 to-purple-600" />
          </div>

          {/* Recent Admissions */}
          {cases.length > 0 && (
            <Card className="shadow-sm border-slate-200 overflow-hidden">
              <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-2 h-4 rounded-full bg-gradient-to-b from-slate-600 to-slate-800" />
                  Recent Cases ({Math.min(cases.length, 10)})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  headers={["Admission #", "Deceased", "Age/Sex", "DOD", "Place", "Status", "Admitted"]}
                  rows={cases.slice(0, 10).map((item) => ({
                    cells: [
                      <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-slate-600 to-slate-700 px-2 py-0.5 rounded-md font-semibold">{item.admissionNumber}</span>,
                      <span key="na" className="text-sm font-medium text-slate-900">{item.deceasedName}</span>,
                      <span key="ag" className="text-xs text-slate-500">{item.deceasedAge ? `${item.deceasedAge}y` : "—"} {item.deceasedSex || ""}</span>,
                      <span key="d" className="text-xs text-slate-500">{formatDate(item.dateOfDeath)}</span>,
                      <span key="p" className="text-xs text-slate-500">{item.placeOfDeath || "—"}</span>,
                      <StatusBadge key="s" status={item.admissionStatus} />,
                      <span key="ad" className="text-xs text-slate-500">{formatRelative(item.admittedAt)}</span>,
                    ],
                    sortValues: [item.admissionNumber, item.deceasedName, item.deceasedAge || 0, item.dateOfDeath, item.placeOfDeath || "", item.admissionStatus, item.admittedAt],
                  }))}
                  gradient="from-slate-700 to-slate-800"
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
// CASES TAB
// =====================================================================
function CasesTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [viewCase, setViewCase] = useState<any>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["mortuary", params.toString()],
    queryFn: () => fetchJson(`/api/mortuary?${params.toString()}`),
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/mortuary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => { toast.success("Deceased person admitted to mortuary"); setShowForm(false); qc.invalidateQueries({ queryKey: ["mortuary"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard label="Total Admissions" value={items.length} icon={Skull} gradient="from-slate-600 to-slate-800" />
        <MiniStatCard label="In Storage" value={items.filter((i) => i.admissionStatus === "admitted" || i.admissionStatus === "stored").length} icon={Boxes} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Released" value={items.filter((i) => i.admissionStatus === "released").length} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Brought-in" value={items.filter((i) => i.placeOfDeath !== "facility").length} icon={UserX} gradient="from-rose-500 to-red-600" />
      </div>

      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <Input placeholder="Search by name, body tag, ID, next of kin..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }} disabled={isFetching}>
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {canManage && <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-slate-600 to-slate-800 text-white"><Plus className="w-4 h-4 mr-1" /> Admit Deceased</Button>}
        </CardContent>
      </Card>

      <Card className="shadow-sm border-slate-200 overflow-hidden">
        <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span className="w-2 h-4 rounded-full bg-gradient-to-b from-slate-600 to-slate-800" />
            Deceased Records ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <LoadingState rows={5} /> :
           isError ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> :
           items.length === 0 ? <EmptyState title="No deceased records" description="Admit a deceased person to get started." icon={Skull} /> :
           <DataTable
             headers={["Admission #", "Deceased", "Age/Sex", "DOD", "Place", "Status", "Admitted", "Actions"]}
             rows={items.map((item) => ({
               cells: [
                 <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-slate-600 to-slate-700 px-2 py-0.5 rounded-md font-semibold">{item.admissionNumber}</span>,
                 <span key="na" className="text-sm font-medium text-slate-900">{item.deceasedName}</span>,
                 <span key="ag" className="text-xs text-slate-500">{item.deceasedAge ? `${item.deceasedAge}y` : "—"} {item.deceasedSex || ""}</span>,
                 <span key="d" className="text-xs text-slate-500">{formatDate(item.dateOfDeath)}</span>,
                 <span key="p" className="text-xs text-slate-500">{item.placeOfDeath || "—"}</span>,
                 <StatusBadge key="s" status={item.admissionStatus} />,
                 <span key="ad" className="text-xs text-slate-500">{formatRelative(item.admittedAt)}</span>,
                 <Button key="a" variant="ghost" size="sm" onClick={() => setViewCase(item)}><Eye className="w-4 h-4" /></Button>,
               ],
               sortValues: [item.admissionNumber, item.deceasedName, item.deceasedAge || 0, item.dateOfDeath, item.placeOfDeath || "", item.admissionStatus, item.admittedAt, ""],
               onClick: () => setViewCase(item),
             }))}
             gradient="from-slate-700 to-slate-800"
             pageSize={10}
           />}
        </CardContent>
      </Card>

      {showForm && <AdmitForm open={showForm} onOpenChange={setShowForm} onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />}
      {viewCase && <CaseDetail item={viewCase} canManage={canManage} onClose={() => setViewCase(null)} />}
    </div>
  );
}

// =====================================================================
// ADMIT FORM
// =====================================================================
function AdmitForm({ open, onOpenChange, onSubmit, loading }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: any) => void; loading: boolean }) {
  const [patient, setPatient] = useState<PatientPickerValue | null>(null);
  const [form, setForm] = useState({
    deceasedAge: "", deceasedSex: "male", deceasedDob: "", nationalId: "",
    nextOfKinName: "", nextOfKinPhone: "", nextOfKinRelation: "",
    dateOfDeath: "", placeOfDeath: "facility", causeOfDeath: "", deathCertificateNo: "",
    broughtBy: "", broughtByPhone: "", sourceFacility: "", sourceNotes: "",
    storageLocation: "", bodyTag: "",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const submit = () => {
    const payload: any = { ...form };
    if (patient) {
      payload.patientId = patient.patientId;
      payload.deceasedName = patient.patientName;
      if (patient.patientAge != null) payload.deceasedAge = patient.patientAge;
      if (patient.patientSex) payload.deceasedSex = patient.patientSex;
    }
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Skull className="w-5 h-5" /> Admit Deceased Person</DialogTitle>
          <DialogDescription>Record a deceased person — works for both facility deaths and bodies brought in from outside.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <PatientPicker
            label="Deceased Patient (link to record if known)"
            value={patient}
            onChange={setPatient}
            placeholder="Search patient record if deceased was a facility patient..."
            allowManual
          />
          {!patient?.patientId && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              No patient record linked — enter the deceased name manually below.
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {!patient?.patientId && (
              <div className="col-span-2"><FieldLabel>Deceased Name</FieldLabel><Input value={patient?.patientName || ""} onChange={(e) => setPatient({ patientId: null, patientName: e.target.value })} placeholder="Full name" /></div>
            )}
            <div><Label>Age</Label><Input type="number" value={form.deceasedAge} onChange={(e) => set("deceasedAge", e.target.value)} disabled={!!patient?.patientAge} placeholder={patient?.patientAge ? `${patient.patientAge} (from record)` : ""} /></div>
            <div><Label>Sex</Label><Select value={form.deceasedSex} onValueChange={(v) => set("deceasedSex", v)} disabled={!!patient?.patientSex}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent></Select></div>
            <div><Label>Date of Birth</Label><Input type="date" value={form.deceasedDob} onChange={(e) => set("deceasedDob", e.target.value)} /></div>
            <div><Label>National ID</Label><Input value={form.nationalId} onChange={(e) => set("nationalId", e.target.value)} /></div>
            <div><FieldLabel>Date & Time of Death</FieldLabel><Input type="datetime-local" value={form.dateOfDeath} onChange={(e) => set("dateOfDeath", e.target.value)} /></div>
            <div><Label>Place of Death</Label><Select value={form.placeOfDeath} onValueChange={(v) => set("placeOfDeath", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PLACE_OF_DEATH.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Cause of Death</Label><Input value={form.causeOfDeath} onChange={(e) => set("causeOfDeath", e.target.value)} /></div>
            <div><Label>Death Certificate #</Label><Input value={form.deathCertificateNo} onChange={(e) => set("deathCertificateNo", e.target.value)} /></div>
            {form.placeOfDeath === "other_facility" && <div><Label>Source Facility</Label><Input value={form.sourceFacility} onChange={(e) => set("sourceFacility", e.target.value)} /></div>}
            <div><Label>Brought By</Label><Input value={form.broughtBy} onChange={(e) => set("broughtBy", e.target.value)} /></div>
            <div><Label>Brought By Phone</Label><Input value={form.broughtByPhone} onChange={(e) => set("broughtByPhone", e.target.value)} /></div>
          </div>
          <div className="border-t pt-3"><h4 className="text-sm font-semibold text-slate-700 mb-2">Next of Kin</h4>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Name</Label><Input value={form.nextOfKinName} onChange={(e) => set("nextOfKinName", e.target.value)} /></div>
              <div><Label>Phone</Label><Input value={form.nextOfKinPhone} onChange={(e) => set("nextOfKinPhone", e.target.value)} /></div>
              <div><Label>Relationship</Label><Input value={form.nextOfKinRelation} onChange={(e) => set("nextOfKinRelation", e.target.value)} placeholder="Spouse / Son / ..." /></div>
            </div>
          </div>
          <div className="border-t pt-3"><h4 className="text-sm font-semibold text-slate-700 mb-2">Storage</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Storage Location</Label><Input value={form.storageLocation} onChange={(e) => set("storageLocation", e.target.value)} placeholder="Chamber A-3 / Freezer 3" /></div>
              <div><Label>Body Tag (auto if blank)</Label><Input value={form.bodyTag} onChange={(e) => set("bodyTag", e.target.value)} placeholder="Auto-generated" /></div>
            </div>
          </div>
          <div><Label>Source Notes</Label><Textarea value={form.sourceNotes} onChange={(e) => set("sourceNotes", e.target.value)} rows={2} placeholder="Additional notes about source or circumstances..." /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={loading || !patient?.patientName || !form.dateOfDeath}>{loading ? "Admitting..." : "Admit to Mortuary"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// CASE DETAIL — with timeline + release + viewing
// =====================================================================
function CaseDetail({ item, canManage, onClose }: { item: any; canManage: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [movements, setMovements] = useState<any[]>([]);
  const [viewings, setViewings] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(true);
  const [showRelease, setShowRelease] = useState(false);
  const [showViewing, setShowViewing] = useState(false);

  // Fetch movements (timeline)
  useState(() => {
    Promise.all([
      fetch(`/api/mortuary/${item.id}/movements`).then((r) => r.json()),
      fetch(`/api/mortuary/${item.id}/viewings`).then((r) => r.json()),
    ]).then(([m, v]) => {
      setMovements(m.items || []);
      setViewings(v.items || []);
      setLoadingTimeline(false);
    }).catch(() => setLoadingTimeline(false));
  });

  const releaseMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/mortuary/${item.id}/release`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => { toast.success("Body released to family / undertaker"); setShowRelease(false); qc.invalidateQueries({ queryKey: ["mortuary"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const scheduleViewing = async (data: any) => {
    try {
      const res = await fetch(`/api/mortuary/${item.id}/viewings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed");
      toast.success("Viewing scheduled");
      setShowViewing(false);
      // Refresh viewings
      const v = await (await fetch(`/api/mortuary/${item.id}/viewings`)).json();
      setViewings(v.items || []);
      const m = await (await fetch(`/api/mortuary/${item.id}/movements`)).json();
      setMovements(m.items || []);
    } catch (e: any) { toast.error(e.message); }
  };

  const movementIcons: Record<string, any> = {
    admitted: DoorOpen, stored: Boxes, moved: ArrowRight, viewed: UsersIcon, released: CheckCircle2, transferred: ArrowRight,
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Skull className="w-5 h-5" /> {item.deceasedName}</DialogTitle>
          <DialogDescription>Mortuary Admission — {item.admissionNumber}</DialogDescription>
        </DialogHeader>

        {/* Case info grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-lg">
          <div><Label className="text-slate-500">Body Tag</Label><div className="font-mono font-semibold">{item.bodyTag || "—"}</div></div>
          <div><Label className="text-slate-500">Age / Sex</Label><div>{item.deceasedAge ? `${item.deceasedAge}y` : "—"} / {item.deceasedSex || "—"}</div></div>
          <div><Label className="text-slate-500">Date of Death</Label><div>{formatDate(item.dateOfDeath, true)}</div></div>
          <div><Label className="text-slate-500">Place of Death</Label><div>{item.placeOfDeath || "—"}</div></div>
          <div><Label className="text-slate-500">Cause of Death</Label><div>{item.causeOfDeath || "—"}</div></div>
          <div><Label className="text-slate-500">Death Cert #</Label><div>{item.deathCertificateNo || "—"}</div></div>
          <div><Label className="text-slate-500">National ID</Label><div>{item.nationalId || "—"}</div></div>
          <div><Label className="text-slate-500">Source Facility</Label><div>{item.sourceFacility || "—"}</div></div>
          <div><Label className="text-slate-500">Brought By</Label><div>{item.broughtBy || "—"}</div></div>
          <div><Label className="text-slate-500">Storage Location</Label><div className="font-semibold">{item.storageLocation || "—"}</div></div>
          <div><Label className="text-slate-500">Status</Label><div><StatusBadge status={item.admissionStatus} /></div></div>
          <div><Label className="text-slate-500">Admitted</Label><div>{formatDate(item.admittedAt, true)}</div></div>
        </div>

        {/* Next of Kin */}
        {item.nextOfKinName && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <Label className="text-blue-700 font-semibold">Next of Kin</Label>
            <div className="text-xs text-slate-700 mt-1">
              {item.nextOfKinName} ({item.nextOfKinRelation || "—"})
              {item.nextOfKinPhone && <span className="ml-2 flex items-center gap-1 inline-flex"><Phone className="w-3 h-3" />{item.nextOfKinPhone}</span>}
            </div>
          </div>
        )}

        {/* Release info (if released) */}
        {item.releasedAt && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <Label className="text-emerald-700 font-semibold">Released</Label>
            <div className="text-xs text-slate-700 mt-1">
              Released at: {formatDate(item.releasedAt, true)} to {item.releasedTo}
              {item.undertakingCompany && <span className="block mt-1">Funeral Home: {item.undertakingCompany}</span>}
              {item.releaseNotes && <span className="block mt-1">Notes: {item.releaseNotes}</span>}
            </div>
          </div>
        )}

        {/* Actions */}
        {canManage && item.admissionStatus !== "released" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowViewing(true)}><Calendar className="w-4 h-4 mr-1" /> Schedule Viewing</Button>
            <Button size="sm" className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white" onClick={() => setShowRelease(true)}><DoorOpen className="w-4 h-4 mr-1" /> Release Body</Button>
          </div>
        )}

        {/* Timeline */}
        <div className="border-t pt-3">
          <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Activity className="w-4 h-4" /> Case Timeline ({movements.length})</h4>
          {loadingTimeline ? <LoadingState rows={3} /> : movements.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No movements recorded yet</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {movements.map((m, i) => {
                const Icon = movementIcons[m.movementType] || ArrowRight;
                return (
                  <div key={m.id} className="flex items-start gap-3 text-xs">
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5 text-slate-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 capitalize">{m.movementType.replace(/_/g, " ")}</span>
                        <span className="text-slate-400">{formatDate(m.movedAt, true)}</span>
                      </div>
                      <p className="text-slate-600 mt-0.5">
                        {m.fromLocation && <span>From: {m.fromLocation} </span>}
                        {m.toLocation && <span>→ To: {m.toLocation}</span>}
                      </p>
                      {m.reason && <p className="text-slate-500 italic">{m.reason}</p>}
                      <p className="text-slate-400 text-[10px]">by {m.movedByName || "—"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Viewings */}
        {viewings.length > 0 && (
          <div className="border-t pt-3">
            <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><UsersIcon className="w-4 h-4" /> Viewings ({viewings.length})</h4>
            <div className="space-y-1">
              {viewings.map((v) => (
                <div key={v.id} className="text-xs flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <div>
                    <span className="font-medium text-slate-800">{v.viewerName}</span>
                    <span className="text-slate-500 ml-2">({v.viewerRelation || "—"})</span>
                    <span className="text-slate-400 ml-2">{formatDate(v.scheduledAt, true)}</span>
                  </div>
                  <StatusBadge status={v.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Release dialog */}
        {showRelease && <ReleaseForm open={showRelease} onOpenChange={setShowRelease} onSubmit={(d) => releaseMutation.mutate(d)} loading={releaseMutation.isPending} />}

        {/* Viewing dialog */}
        {showViewing && <ViewingForm open={showViewing} onOpenChange={setShowViewing} onSubmit={scheduleViewing} />}
      </DialogContent>
    </Dialog>
  );
}

function ReleaseForm({ open, onOpenChange, onSubmit, loading }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({ releasedTo: "", releasedToPhone: "", releasedToIdType: "national_id", releasedToIdNo: "", undertakingCompany: "", releaseNotes: "" });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><DoorOpen className="w-5 h-5" /> Release Body</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><FieldLabel>Released To (Name)</FieldLabel><Input value={form.releasedTo} onChange={(e) => set("releasedTo", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={form.releasedToPhone} onChange={(e) => set("releasedToPhone", e.target.value)} /></div>
            <div><Label>ID Type</Label><Select value={form.releasedToIdType} onValueChange={(v) => set("releasedToIdType", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="national_id">National ID</SelectItem><SelectItem value="driving">Driving License</SelectItem><SelectItem value="passport">Passport</SelectItem><SelectItem value="voter">Voter Card</SelectItem></SelectContent></Select></div>
          </div>
          <div><Label>ID Number</Label><Input value={form.releasedToIdNo} onChange={(e) => set("releasedToIdNo", e.target.value)} /></div>
          <div><Label>Funeral Home / Undertaking Company</Label><Input value={form.undertakingCompany} onChange={(e) => set("undertakingCompany", e.target.value)} /></div>
          <div><Label>Release Notes</Label><Textarea value={form.releaseNotes} onChange={(e) => set("releaseNotes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => onSubmit(form)} disabled={loading || !form.releasedTo}>{loading ? "Releasing..." : "Confirm Release"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewingForm({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: any) => void }) {
  const [form, setForm] = useState({ viewerName: "", viewerRelation: "", viewerPhone: "", numVisitors: 1, scheduledAt: "", notes: "" });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> Schedule Viewing</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><FieldLabel>Viewer Name</FieldLabel><Input value={form.viewerName} onChange={(e) => set("viewerName", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Relationship</Label><Input value={form.viewerRelation} onChange={(e) => set("viewerRelation", e.target.value)} placeholder="Spouse / Son" /></div>
            <div><Label>Phone</Label><Input value={form.viewerPhone} onChange={(e) => set("viewerPhone", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Visitors</Label><Input type="number" value={form.numVisitors} onChange={(e) => set("numVisitors", parseInt(e.target.value) || 1)} /></div>
            <div><FieldLabel>Scheduled At</FieldLabel><Input type="datetime-local" value={form.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => onSubmit(form)} disabled={!form.viewerName || !form.scheduledAt}>Schedule</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// STORAGE TAB
// =====================================================================
function StorageTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["mortuary-storage", params.toString()],
    queryFn: () => fetchJson(`/api/mortuary-storage?${params.toString()}`),
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/mortuary-storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => { toast.success("Storage unit created"); setShowForm(false); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/mortuary-storage/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Status → ${newStatus}`);
      refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  const items: any[] = data?.items || [];
  const totalCapacity = items.length;
  const occupied = items.filter((i) => i.status === "occupied").length;
  const available = items.filter((i) => i.status === "available").length;
  const maintenance = items.filter((i) => i.status === "maintenance" || i.status === "out_of_service").length;
  const occupancyRate = totalCapacity > 0 ? Math.round((occupied / totalCapacity) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStatCard label="Total Units" value={totalCapacity} icon={Boxes} gradient="from-slate-600 to-slate-800" />
        <MiniStatCard label="Available" value={available} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Occupied" value={occupied} icon={MapPin} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Maintenance" value={maintenance} icon={AlertCircle} gradient="from-rose-500 to-red-600" />
        <MiniStatCard label="Occupancy" value={`${occupancyRate}%`} icon={TrendingUp} gradient="from-blue-500 to-blue-600" />
      </div>

      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <Input placeholder="Search storage units..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="occupied">Occupied</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="out_of_service">Out of Service</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }} disabled={isFetching}>
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {canManage && <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-slate-600 to-slate-800 text-white"><Plus className="w-4 h-4 mr-1" /> Add Unit</Button>}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={4} /> :
       items.length === 0 ? <EmptyState title="No storage units" description="Add mortuary storage compartments to track body locations." icon={Boxes} /> :
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
         {items.map((unit) => (
           <Card key={unit.id} className={`border-slate-200 shadow-sm rounded-xl overflow-hidden ${unit.status === "occupied" ? "border-amber-300" : unit.status === "maintenance" ? "border-rose-300" : "border-emerald-300"}`}>
             <div className={`p-3 ${unit.status === "occupied" ? "bg-amber-50" : unit.status === "maintenance" ? "bg-rose-50" : unit.status === "available" ? "bg-emerald-50" : "bg-slate-50"}`}>
               <div className="flex items-center justify-between mb-1">
                 <div className="flex items-center gap-2">
                   <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${unit.status === "occupied" ? "bg-amber-500" : unit.status === "maintenance" ? "bg-rose-500" : unit.status === "available" ? "bg-emerald-500" : "bg-slate-500"}`}>
                     <Boxes className="w-4 h-4" />
                   </div>
                   <div>
                     <h3 className="font-bold text-slate-900 text-sm">{unit.name}</h3>
                     <p className="text-[10px] text-slate-500 uppercase">{unit.storageType}</p>
                   </div>
                 </div>
                 <StatusBadge status={unit.status} />
               </div>
               {unit.location && <p className="text-xs text-slate-500 mt-1">📍 {unit.location}</p>}
               {canManage && (
                 <div className="flex gap-1 mt-2">
                   {unit.status !== "available" && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => updateStatus(unit.id, "available")}>Mark Available</Button>}
                   {unit.status !== "maintenance" && <Button size="sm" variant="outline" className="h-6 text-[10px] text-rose-600" onClick={() => updateStatus(unit.id, "maintenance")}>Maintenance</Button>}
                 </div>
               )}
             </div>
           </Card>
         ))}
       </div>}

      {showForm && canManage && (
        <Dialog open onOpenChange={setShowForm}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Boxes className="w-5 h-5" /> Add Storage Unit</DialogTitle></DialogHeader>
            <StorageForm onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function StorageForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({ name: "", storageType: "refrigerator", location: "", capacity: 1, notes: "" });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-3">
      <div><FieldLabel>Unit Name</FieldLabel><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g., Refrigerator 1 - Compartment A" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Type</Label><Select value={form.storageType} onValueChange={(v) => set("storageType", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="refrigerator">Refrigerator</SelectItem><SelectItem value="freezer">Freezer</SelectItem><SelectItem value="shelf">Shelf</SelectItem><SelectItem value="room">Room</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
        <div><Label>Capacity</Label><Input type="number" value={form.capacity} onChange={(e) => set("capacity", parseInt(e.target.value) || 1)} /></div>
      </div>
      <div><Label>Location</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Building / Room description" /></div>
      <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
      <DialogFooter><Button onClick={() => onSubmit(form)} disabled={loading || !form.name}>{loading ? "Creating..." : "Create Unit"}</Button></DialogFooter>
    </div>
  );
}

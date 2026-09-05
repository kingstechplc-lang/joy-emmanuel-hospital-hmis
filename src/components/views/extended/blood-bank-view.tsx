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
  HeartPulse, Droplet, Syringe, Plus, Search, RefreshCcw, Eye,
  AlertCircle, Download, Beaker, CheckCircle2, XCircle, Clock,
  Activity, TrendingUp, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative,
  safeJson, PageHeader, MiniStatCard, ClearableSearch} from "@/components/ui-helpers"
import { DataTable } from "@/components/ui/data-table";
import { FieldLabel } from "@/components/ui/required-label";
import { PatientPicker, type PatientPickerValue } from "@/components/ui/patient-picker";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const COMPONENT_TYPES = [
  { value: "whole_blood", label: "Whole Blood" },
  { value: "prbc", label: "PRBC" },
  { value: "ffp", label: "FFP" },
  { value: "platelets", label: "Platelets" },
  { value: "cryo", label: "Cryoprecipitate" },
];

export function BloodBankView({ initialTab }: { initialTab?: string }) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canManage = can("bloodbank.manage");
  const canView = can("bloodbank.view");

  // Map sidebar view keys to tabs
  const tabFromKey: Record<string, string> = {
    blood_donors: "donors",
    blood_units: "inventory",
    blood_transfusions: "transfusions",
  };
  const [activeTab, setActiveTab] = useState(initialTab ? (tabFromKey[initialTab] || "dashboard") : "dashboard");

  if (!canView) {
    return (
      <Card><CardContent className="p-12 text-center">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
        <p className="text-sm text-slate-500">You don&apos;t have permission to access the Blood Bank.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4 fade-in-up">
      <PageHeader
        title="Blood Bank & Transfusion Management"
        description="Complete blood bank — donors, donations, inventory, crossmatch, transfusion tracking, and reaction monitoring"
        icon={HeartPulse}
        gradient="from-rose-500 to-red-600"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto gap-1 p-1 bg-slate-100 rounded-lg tabs-scroll">
          <TabsTrigger value="dashboard" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Dashboard</TabsTrigger>
          <TabsTrigger value="donors" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Donors</TabsTrigger>
          <TabsTrigger value="inventory" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Inventory</TabsTrigger>
          <TabsTrigger value="transfusions" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Transfusions</TabsTrigger>
          <TabsTrigger value="crossmatch" className="text-xs whitespace-nowrap flex-1 min-w-[70px]">Crossmatch</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4"><DashboardTab /></TabsContent>
        <TabsContent value="donors" className="mt-4"><DonorsTab canManage={canManage} /></TabsContent>
        <TabsContent value="inventory" className="mt-4"><InventoryTab canManage={canManage} /></TabsContent>
        <TabsContent value="transfusions" className="mt-4"><TransfusionsTab canManage={can("bloodbank.transfuse")} /></TabsContent>
        <TabsContent value="crossmatch" className="mt-4"><CrossmatchTab canManage={canManage} /></TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab() {
  const { data: donorsData, isLoading: loadingDonors } = useQuery({
    queryKey: ["bb-donors-dashboard"],
    queryFn: () => fetchJson("/api/blood-bank/donors?limit=500"),
    staleTime: 0,
  });
  const { data: unitsData, isLoading: loadingUnits } = useQuery({
    queryKey: ["bb-units-dashboard"],
    queryFn: () => fetchJson("/api/blood-bank/units?limit=500"),
    staleTime: 0,
  });
  const { data: txData, isLoading: loadingTx } = useQuery({
    queryKey: ["bb-transfusions-dashboard"],
    queryFn: () => fetchJson("/api/blood-bank/transfusions?limit=500"),
    staleTime: 0,
  });

  const donors: any[] = donorsData?.items || [];
  const units: any[] = unitsData?.items || [];
  const transfusions: any[] = txData?.items || [];

  const available = units.filter((u) => u.status === "available");
  const reserved = units.filter((u) => u.status === "reserved");
  const expired = units.filter((u) => u.status === "expired" || (u.expiryDate && new Date(u.expiryDate) < new Date() && u.status === "available"));
  const eligibleDonors = donors.filter((d) => d.eligibilityStatus === "eligible");
  const activeTx = transfusions.filter((t) => t.status === "in_progress");
  const reactions = transfusions.filter((t) => t.reactionObserved);

  // Blood group inventory
  const bgInventory = BLOOD_GROUPS.map((bg) => ({
    group: bg,
    available: available.filter((u) => u.bloodGroup === bg).length,
    total: units.filter((u) => u.bloodGroup === bg).length,
  }));

  return (
    <div className="space-y-4">
      {(loadingDonors || loadingUnits || loadingTx) ? <LoadingState rows={4} /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            <MiniStatCard label="Total Donors" value={donors.length} icon={HeartPulse} gradient="from-rose-500 to-red-600" />
            <MiniStatCard label="Eligible Donors" value={eligibleDonors.length} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
            <MiniStatCard label="Available Units" value={available.length} icon={Droplet} gradient="from-blue-500 to-blue-600" />
            <MiniStatCard label="Reserved" value={reserved.length} icon={Clock} gradient="from-amber-500 to-orange-600" />
            <MiniStatCard label="Expired" value={expired.length} icon={AlertCircle} gradient="from-slate-500 to-slate-600" />
            <MiniStatCard label="Active Transfusions" value={activeTx.length} icon={Syringe} gradient="from-purple-500 to-purple-600" />
            <MiniStatCard label="Reactions" value={reactions.length} icon={AlertCircle} gradient="from-rose-600 to-red-700" />
          </div>

          {/* Blood Group Inventory */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-4 rounded-full bg-gradient-to-b from-rose-500 to-red-600" />
                Blood Group Inventory
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {bgInventory.map((bg) => (
                  <div key={bg.group} className={`text-center p-3 rounded-xl ${bg.available > 0 ? "bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-md" : "bg-slate-100 text-slate-400"}`}>
                    <p className="text-lg font-extrabold">{bg.group}</p>
                    <p className={`text-2xl font-extrabold ${bg.available > 0 ? "text-white" : "text-slate-400"}`}>{bg.available}</p>
                    <p className={`text-[10px] ${bg.available > 0 ? "text-white/70" : "text-slate-400"}`}>available</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// =====================================================================
// DONORS TAB
// =====================================================================
function DonorsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [bgFilter, setBgFilter] = useState("all");
  const [eligibilityFilter, setEligibilityFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [viewDonor, setViewDonor] = useState<any>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (bgFilter !== "all") params.set("bloodGroup", bgFilter);
  if (eligibilityFilter !== "all") params.set("eligibilityStatus", eligibilityFilter);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["bb-donors", params.toString()],
    queryFn: () => fetchJson(`/api/blood-bank/donors?${params.toString()}`),
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/blood-bank/donors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => { toast.success("Donor registered"); setShowForm(false); qc.invalidateQueries({ queryKey: ["bb-donors"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search donors..." className="pl-0" />
          </div>
          <Select value={bgFilter} onValueChange={setBgFilter}><SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Blood Groups</SelectItem>{BLOOD_GROUPS.map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}</SelectContent></Select>
          <Select value={eligibilityFilter} onValueChange={setEligibilityFilter}><SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Eligibility</SelectItem><SelectItem value="eligible">Eligible</SelectItem><SelectItem value="deferred">Deferred</SelectItem><SelectItem value="banned">Banned</SelectItem></SelectContent></Select>
          <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }} disabled={isFetching}><RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          {canManage && <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-rose-500 to-red-600 text-white"><Plus className="w-4 h-4 mr-1" /> Register Donor</Button>}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={5} /> :
       items.length === 0 ? <EmptyState title="No donors" description="Register blood donors to build your donor database." icon={HeartPulse} /> :
       <DataTable
         headers={["Donor #", "Name", "Age/Sex", "Blood Group", "Donations", "Last Donation", "Eligibility", "Actions"]}
         rows={items.map((item) => ({
           cells: [
             <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-rose-500 to-red-600 px-2 py-0.5 rounded-md font-semibold">{item.donorNumber}</span>,
             <span key="na" className="text-sm font-medium text-slate-900">{item.fullName}</span>,
             <span key="ag" className="text-xs text-slate-500">{item.age ? `${item.age}y` : "—"} {item.sex || ""}</span>,
             <span key="bg" className={`text-sm font-bold px-2 py-0.5 rounded-md ${item.bloodGroup ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-400"}`}>{item.bloodGroup || "—"}</span>,
             <span key="dc" className="text-xs text-slate-600">{item.donationCount || 0}</span>,
             <span key="ld" className="text-xs text-slate-500">{item.lastDonationAt ? formatDate(item.lastDonationAt) : "—"}</span>,
             <StatusBadge key="el" status={item.eligibilityStatus} />,
             <Button key="a" variant="ghost" size="sm" onClick={() => setViewDonor(item)}><Eye className="w-4 h-4" /></Button>,
           ],
           sortValues: [item.donorNumber, item.fullName, item.age || 0, item.bloodGroup || "", item.donationCount || 0, item.lastDonationAt || "", item.eligibilityStatus, ""],
           onClick: () => setViewDonor(item),
         }))}
         gradient="from-rose-500 to-red-600"
         pageSize={10}
       />}

      {showForm && <DonorForm open={showForm} onOpenChange={setShowForm} onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />}
      {viewDonor && <DonorDetail donor={viewDonor} onClose={() => setViewDonor(null)} />}
    </div>
  );
}

function DonorForm({ open, onOpenChange, onSubmit, loading }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({ fullName: "", age: "", sex: "male", bloodGroup: "O+", phone: "", email: "", address: "", donorType: "voluntary", occupation: "" });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white"><DialogTitle className="text-white flex items-center gap-2"><HeartPulse className="w-5 h-5 text-rose-600" /> Register Blood Donor</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><FieldLabel>Full Name</FieldLabel><Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} /></div>
          <div><Label>Age</Label><Input type="number" value={form.age} onChange={(e) => set("age", e.target.value)} /></div>
          <div><Label>Sex</Label><Select value={form.sex} onValueChange={(v) => set("sex", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent></Select></div>
          <div><Label>Blood Group</Label><Select value={form.bloodGroup} onValueChange={(v) => set("bloodGroup", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BLOOD_GROUPS.map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Donor Type</Label><Select value={form.donorType} onValueChange={(v) => set("donorType", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="voluntary">Voluntary</SelectItem><SelectItem value="replacement">Replacement</SelectItem><SelectItem value="autologous">Autologous</SelectItem><SelectItem value="directed">Directed</SelectItem></SelectContent></Select></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div className="col-span-2"><Label>Address</Label><Textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} /></div>
          <div><Label>Occupation</Label><Input value={form.occupation} onChange={(e) => set("occupation", e.target.value)} /></div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => onSubmit(form)} disabled={loading || !form.fullName}>{loading ? "Registering..." : "Register Donor"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DonorDetail({ donor, onClose }: { donor: any; onClose: () => void }) {
  const { data: donationsData } = useQuery({
    queryKey: ["bb-donor-donations", donor.id],
    queryFn: () => fetchJson(`/api/blood-bank/donations?donorId=${donor.id}`),
    enabled: !!donor.id,
  });
  const donations: any[] = donationsData?.items || [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2"><HeartPulse className="w-5 h-5 text-rose-600" /> {donor.fullName}</DialogTitle>
          <DialogDescription className="text-white/80">{donor.donorNumber}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-lg">
          <div><Label className="text-slate-500">Blood Group</Label><div className="font-bold text-rose-600 text-lg">{donor.bloodGroup || "—"}</div></div>
          <div><Label className="text-slate-500">Age / Sex</Label><div>{donor.age ? `${donor.age}y` : "—"} / {donor.sex || "—"}</div></div>
          <div><Label className="text-slate-500">Eligibility</Label><div><StatusBadge status={donor.eligibilityStatus} /></div></div>
          <div><Label className="text-slate-500">Donor Type</Label><div className="capitalize">{donor.donorType || "—"}</div></div>
          <div><Label className="text-slate-500">Total Donations</Label><div className="font-semibold">{donor.donationCount || 0}</div></div>
          <div><Label className="text-slate-500">Last Donation</Label><div>{donor.lastDonationAt ? formatDate(donor.lastDonationAt) : "—"}</div></div>
          {donor.phone && <div><Label className="text-slate-500">Phone</Label><div>{donor.phone}</div></div>}
          {donor.email && <div><Label className="text-slate-500">Email</Label><div>{donor.email}</div></div>}
          {donor.occupation && <div><Label className="text-slate-500">Occupation</Label><div>{donor.occupation}</div></div>}
        </div>
        {/* Screening results */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <Label className="text-amber-700 font-semibold">Screening Results</Label>
          <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
            <div className="text-center"><div className="text-slate-500">HBsAg</div><div className={`font-bold ${donor.hbsAg === "Negative" || donor.hbsAg === "Non-reactive" ? "text-emerald-600" : donor.hbsAg ? "text-rose-600" : "text-slate-400"}`}>{donor.hbsAg || "—"}</div></div>
            <div className="text-center"><div className="text-slate-500">HCV Ab</div><div className={`font-bold ${donor.hcvAb === "Negative" || donor.hcvAb === "Non-reactive" ? "text-emerald-600" : donor.hcvAb ? "text-rose-600" : "text-slate-400"}`}>{donor.hcvAb || "—"}</div></div>
            <div className="text-center"><div className="text-slate-500">HIV Ab</div><div className={`font-bold ${donor.hivAb === "Negative" || donor.hivAb === "Non-reactive" ? "text-emerald-600" : donor.hivAb ? "text-rose-600" : "text-slate-400"}`}>{donor.hivAb || "—"}</div></div>
            <div className="text-center"><div className="text-slate-500">Syphilis</div><div className={`font-bold ${donor.syphilis === "Negative" || donor.syphilis === "Non-reactive" ? "text-emerald-600" : donor.syphilis ? "text-rose-600" : "text-slate-400"}`}>{donor.syphilis || "—"}</div></div>
          </div>
        </div>
        {/* Donation history */}
        {donations.length > 0 && (
          <div className="border-t pt-3">
            <h4 className="text-sm font-bold text-slate-800 mb-2">Donation History ({donations.length})</h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {donations.map((d) => (
                <div key={d.id} className="text-xs flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <div><span className="font-mono font-semibold">{d.donationNumber}</span> — {formatDate(d.collectionDate)}</div>
                  <div className="flex items-center gap-2"><span className="text-slate-500">{d.volumeMl}ml</span><StatusBadge status={d.status} /></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// INVENTORY TAB (Blood Units)
// =====================================================================
function InventoryTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bgFilter, setBgFilter] = useState("all");
  const [compFilter, setCompFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (bgFilter !== "all") params.set("bloodGroup", bgFilter);
  if (compFilter !== "all") params.set("componentType", compFilter);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["bb-units", params.toString()],
    queryFn: () => fetchJson(`/api/blood-bank/units?${params.toString()}`),
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/blood-bank/units", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => { toast.success("Blood unit registered"); setShowForm(false); qc.invalidateQueries({ queryKey: ["bb-units"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];
  const available = items.filter((u) => u.status === "available");
  const expiringSoon = available.filter((u) => {
    if (!u.expiryDate) return false;
    const days = (new Date(u.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days <= 7 && days > 0;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard label="Total Units" value={items.length} icon={Droplet} gradient="from-rose-500 to-red-600" />
        <MiniStatCard label="Available" value={available.length} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Expiring Soon (≤7d)" value={expiringSoon.length} icon={Clock} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Expired/Discarded" value={items.filter((u) => u.status === "expired" || u.status === "discarded").length} icon={AlertCircle} gradient="from-slate-500 to-slate-600" />
      </div>

      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" /><ClearableSearch value={search} onChange={setSearch} placeholder="Search by unit number..." className="pl-0" /></div>
          <Select value={bgFilter} onValueChange={setBgFilter}><SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Groups</SelectItem>{BLOOD_GROUPS.map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}</SelectContent></Select>
          <Select value={compFilter} onValueChange={setCompFilter}><SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Components</SelectItem>{COMPONENT_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="available">Available</SelectItem><SelectItem value="reserved">Reserved</SelectItem><SelectItem value="issued">Issued</SelectItem><SelectItem value="transfused">Transfused</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="discarded">Discarded</SelectItem></SelectContent></Select>
          <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }} disabled={isFetching}><RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          {canManage && <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-rose-500 to-red-600 text-white"><Plus className="w-4 h-4 mr-1" /> Add Unit</Button>}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={5} /> :
       items.length === 0 ? <EmptyState title="No blood units" description="Register collected blood units to track inventory." icon={Droplet} /> :
       <DataTable
         headers={["Unit #", "Group", "Component", "Volume", "Collected", "Expiry", "Status", "Reserved For"]}
         rows={items.map((item) => {
           const isExpiringSoon = item.expiryDate && (new Date(item.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 7 && item.status === "available";
           const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date() && item.status === "available";
           return {
             cells: [
               <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-rose-500 to-red-600 px-2 py-0.5 rounded-md font-semibold">{item.unitNumber}</span>,
               <span key="bg" className="text-sm font-bold text-rose-600">{item.bloodGroup}</span>,
               <span key="ct" className="text-xs text-slate-600">{COMPONENT_TYPES.find((c) => c.value === item.componentType)?.label || item.componentType}</span>,
               <span key="v" className="text-xs text-slate-500">{item.volumeMl}ml</span>,
               <span key="c" className="text-xs text-slate-500">{formatDate(item.collectionDate)}</span>,
               <span key="e" className={`text-xs ${isExpired ? "text-rose-600 font-bold" : isExpiringSoon ? "text-amber-600 font-bold" : "text-slate-500"}`}>{formatDate(item.expiryDate)}{isExpired && " ⚠ EXPIRED"}{isExpiringSoon && " ⚠ SOON"}</span>,
               <StatusBadge key="s" status={item.status} />,
               <span key="r" className="text-xs text-slate-500">{item.reservedForPatientName || "—"}</span>,
             ],
             sortValues: [item.unitNumber, item.bloodGroup, item.componentType, item.volumeMl, item.collectionDate, item.expiryDate, item.status, item.reservedForPatientName || ""],
           };
         })}
         gradient="from-rose-500 to-red-600"
         pageSize={10}
       />}

      {showForm && <UnitForm open={showForm} onOpenChange={setShowForm} onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />}
    </div>
  );
}

function UnitForm({ open, onOpenChange, onSubmit, loading }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({ donorId: "", bloodGroup: "O+", componentType: "whole_blood", volumeMl: "450", expiryDate: "", storageTemp: "2-6°C" });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white"><DialogTitle className="text-white flex items-center gap-2"><Droplet className="w-5 h-5 text-rose-600" /> Register Blood Unit</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><FieldLabel>Donor ID</FieldLabel><Input value={form.donorId} onChange={(e) => set("donorId", e.target.value)} placeholder="Donor ID from donor registry" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Blood Group</Label><Select value={form.bloodGroup} onValueChange={(v) => set("bloodGroup", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BLOOD_GROUPS.map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Component</Label><Select value={form.componentType} onValueChange={(v) => set("componentType", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COMPONENT_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Volume (ml)</Label><Input type="number" value={form.volumeMl} onChange={(e) => set("volumeMl", e.target.value)} /></div>
            <div><FieldLabel>Expiry Date</FieldLabel><Input type="datetime-local" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} /></div>
            <div><Label>Storage Temp</Label><Input value={form.storageTemp} onChange={(e) => set("storageTemp", e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => onSubmit(form)} disabled={loading || !form.donorId || !form.expiryDate}>{loading ? "Registering..." : "Register Unit"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// TRANSFUSIONS TAB
// =====================================================================
function TransfusionsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["bb-transfusions", params.toString()],
    queryFn: () => fetchJson(`/api/blood-bank/transfusions?${params.toString()}`),
    staleTime: 0,
  });

  const items: any[] = data?.items || [];

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/blood-bank/transfusions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus, completedAt: newStatus === "completed" ? new Date().toISOString() : undefined }) });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Transfusion ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["bb-transfusions"] });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard label="Total" value={items.length} icon={Syringe} gradient="from-rose-500 to-red-600" />
        <MiniStatCard label="In Progress" value={items.filter((t) => t.status === "in_progress").length} icon={Activity} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Completed" value={items.filter((t) => t.status === "completed").length} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Reactions" value={items.filter((t) => t.reactionObserved).length} icon={AlertCircle} gradient="from-rose-600 to-red-700" />
      </div>

      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" /><ClearableSearch value={search} onChange={setSearch} placeholder="Search by patient or transfusion #" className="pl-0" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="aborted">Aborted</SelectItem></SelectContent></Select>
          <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }} disabled={isFetching}><RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={4} /> :
       items.length === 0 ? <EmptyState title="No transfusions" description="Transfusion records will appear here when blood units are issued." icon={Syringe} /> :
       <DataTable
         headers={["Tx #", "Patient", "Blood Group", "Unit #", "Component", "Volume", "Reaction", "Status", "Actions"]}
         rows={items.map((item) => ({
           cells: [
             <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-rose-500 to-red-600 px-2 py-0.5 rounded-md font-semibold">{item.transfusionNumber}</span>,
             <span key="p" className="text-sm font-medium text-slate-900">{item.patientName}</span>,
             <span key="bg" className="text-sm font-bold text-rose-600">{item.bloodGroup}</span>,
             <span key="u" className="font-mono text-xs text-slate-500">{item.unitNumber}</span>,
             <span key="ct" className="text-xs text-slate-600">{COMPONENT_TYPES.find((c) => c.value === item.componentType)?.label || item.componentType}</span>,
             <span key="v" className="text-xs text-slate-500">{item.volumeMl}ml</span>,
             item.reactionObserved ? <span key="r" className="text-xs font-bold text-rose-600">⚠ YES</span> : <span key="r" className="text-xs text-emerald-600">✓ No</span>,
             <StatusBadge key="s" status={item.status} />,
             canManage && item.status === "in_progress" ? <Button key="a" size="sm" variant="outline" className="text-emerald-600 h-7 text-xs" onClick={() => updateStatus(item.id, "completed")}>Complete</Button> : <span key="a" />,
           ],
           sortValues: [item.transfusionNumber, item.patientName, item.bloodGroup, item.unitNumber, item.componentType, item.volumeMl, item.reactionObserved ? "yes" : "no", item.status, ""],
         }))}
         gradient="from-rose-500 to-red-600"
         pageSize={10}
       />}
    </div>
  );
}

// =====================================================================
// CROSSMATCH TAB
// =====================================================================
function CrossmatchTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (resultFilter !== "all") params.set("status", resultFilter);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["bb-crossmatch", params.toString()],
    queryFn: () => fetchJson(`/api/blood-bank/crossmatch?${params.toString()}`),
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/blood-bank/crossmatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => { toast.success("Crossmatch test recorded"); setShowForm(false); qc.invalidateQueries({ queryKey: ["bb-crossmatch"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard label="Total Tests" value={items.length} icon={Beaker} gradient="from-rose-500 to-red-600" />
        <MiniStatCard label="Compatible" value={items.filter((t) => t.crossmatchResult === "compatible").length} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Incompatible" value={items.filter((t) => t.crossmatchResult === "incompatible").length} icon={XCircle} gradient="from-rose-500 to-red-600" />
        <MiniStatCard label="Pending" value={items.filter((t) => t.crossmatchResult === "pending").length} icon={Clock} gradient="from-amber-500 to-orange-600" />
      </div>

      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" /><ClearableSearch value={search} onChange={setSearch} placeholder="Search by patient or unit..." className="pl-0" /></div>
          <Select value={resultFilter} onValueChange={setResultFilter}><SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Results</SelectItem><SelectItem value="compatible">Compatible</SelectItem><SelectItem value="incompatible">Incompatible</SelectItem><SelectItem value="pending">Pending</SelectItem></SelectContent></Select>
          <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }} disabled={isFetching}><RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          {canManage && <Button size="sm" onClick={() => setShowForm(true)} className="bg-gradient-to-r from-rose-500 to-red-600 text-white"><Plus className="w-4 h-4 mr-1" /> New Crossmatch</Button>}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={4} /> :
       items.length === 0 ? <EmptyState title="No crossmatch tests" description="Record compatibility tests before transfusions." icon={Beaker} /> :
       <DataTable
         headers={["XM #", "Patient", "Patient BG", "Unit #", "Donor BG", "Result", "Method", "Tested By", "Date"]}
         rows={items.map((item) => ({
           cells: [
             <span key="n" className="font-mono text-xs text-white bg-gradient-to-r from-rose-500 to-red-600 px-2 py-0.5 rounded-md font-semibold">{item.crossmatchNumber}</span>,
             <span key="p" className="text-sm font-medium text-slate-900">{item.patientName}</span>,
             <span key="pbg" className="text-xs text-slate-600">{item.patientBloodGroup || "—"}</span>,
             <span key="u" className="font-mono text-xs text-slate-500">{item.unitNumber}</span>,
             <span key="dbg" className="text-xs font-bold text-rose-600">{item.donorBloodGroup}</span>,
             <span key={`r-${item.id}`} className={`text-xs font-bold px-2 py-0.5 rounded-md ${item.crossmatchResult === "compatible" ? "bg-emerald-100 text-emerald-700" : item.crossmatchResult === "incompatible" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{item.crossmatchResult}</span>,
             <span key="m" className="text-xs text-slate-500">{item.method || "—"}</span>,
             <span key="tb" className="text-xs text-slate-500">{item.testedBy || "—"}</span>,
             <span key="d" className="text-xs text-slate-500">{formatDate(item.testedAt)}</span>,
           ],
           sortValues: [item.crossmatchNumber, item.patientName, item.patientBloodGroup || "", item.unitNumber, item.donorBloodGroup, item.crossmatchResult, item.method || "", item.testedBy || "", item.testedAt],
         }))}
         gradient="from-rose-500 to-red-600"
         pageSize={10}
       />}

      {showForm && <CrossmatchForm open={showForm} onOpenChange={setShowForm} onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} />}
    </div>
  );
}

function CrossmatchForm({ open, onOpenChange, onSubmit, loading }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: any) => void; loading: boolean }) {
  const [patient, setPatient] = useState<PatientPickerValue | null>(null);
  const [form, setForm] = useState({ patientBloodGroup: "O+", unitId: "", crossmatchResult: "pending", method: "gel_card", notes: "" });
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white"><DialogTitle className="text-white flex items-center gap-2"><Beaker className="w-5 h-5 text-rose-600" /> New Crossmatch Test</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <PatientPicker
            label="Patient (recipient)"
            required
            value={patient}
            onChange={setPatient}
          />
          <div><Label>Patient Blood Group</Label><Select value={form.patientBloodGroup} onValueChange={(v) => set("patientBloodGroup", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BLOOD_GROUPS.map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}</SelectContent></Select></div>
          <div><FieldLabel>Blood Unit ID</FieldLabel><Input value={form.unitId} onChange={(e) => set("unitId", e.target.value)} placeholder="Unit ID from blood inventory" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Result</Label><Select value={form.crossmatchResult} onValueChange={(v) => set("crossmatchResult", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="compatible">Compatible</SelectItem><SelectItem value="incompatible">Incompatible</SelectItem></SelectContent></Select></div>
            <div><Label>Method</Label><Select value={form.method} onValueChange={(v) => set("method", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gel_card">Gel Card</SelectItem><SelectItem value="tube">Tube Method</SelectItem><SelectItem value="immediate_spin">Immediate Spin</SelectItem></SelectContent></Select></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={loading || !patient?.patientName || !form.unitId}>{loading ? "Recording..." : "Record Test"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

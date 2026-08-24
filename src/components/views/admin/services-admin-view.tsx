"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DollarSign, Plus, RefreshCw, Loader2, Activity, Search, X,
  TrendingUp, AlertTriangle, CheckCircle2, FileText, ChevronDown,
  ChevronRight, ShieldAlert, PackageX, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge,
  formatDate, safeJson, PageHeader, MiniStatCard,
} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const SERVICE_CATEGORIES = [
  "consultation", "lab", "imaging", "procedure", "pharmacy",
  "admission", "nursing", "theatre", "maternity", "emergency",
  "dental", "eye", "ent", "physiotherapy", "immunization",
  "blood_bank", "ambulance", "medical_report", "health_screening",
  "administrative", "other",
];

const SERVICE_TYPES = [
  "consultation", "investigation", "procedure", "treatment",
  "admission", "bed_room", "professional", "diagnostic",
  "pharmacy_service", "nursing_service", "theatre_service",
  "emergency_service", "administrative_service", "other",
];

const UNITS_OF_MEASURE = [
  "service", "visit", "test", "procedure", "day", "hour", "session", "item", "other",
];

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `GH¢ ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// =====================================================================
// MAIN VIEW
// =====================================================================
export function ServicesAdminView() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Services & Pricing"
        description="Central service catalog — pricing, NHIS tariffs, facility overrides, and billing integration."
        icon={DollarSign}
        gradient="from-emerald-500 to-teal-600"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <Activity className="w-4 h-4" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="catalog" className="gap-1.5">
            <DollarSign className="w-4 h-4" /> Catalog
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="catalog" className="space-y-4">
          <CatalogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["services-stats"],
    queryFn: () => fetchJson("/api/services/stats"),
    refetchInterval: 60000,
  });

  const kpis = data?.kpis || {};

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-600" />
          Services KPIs
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
            {isFetching ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                <span className="text-emerald-700 font-medium">Refreshing…</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3 text-slate-400" />
                <span>Auto-refresh every 60s</span>
              </>
            )}
          </span>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniStatCard label="Active" value={kpis.totalActive ?? 0} icon={DollarSign} gradient="from-emerald-500 to-teal-600" sublabel="Services" />
        <MiniStatCard label="Inactive" value={kpis.totalInactive ?? 0} icon={X} gradient="from-slate-400 to-slate-500" sublabel="Archived" />
        <MiniStatCard label="Billable" value={kpis.totalBillable ?? 0} icon={CheckCircle2} gradient="from-blue-500 to-indigo-600" sublabel="Chargeable" />
        <MiniStatCard label="NHIS" value={kpis.totalNhisEligible ?? 0} icon={ShieldAlert} gradient="from-purple-500 to-pink-600" sublabel="Eligible" />
        <MiniStatCard label="No Price" value={kpis.totalWithoutPrice ?? 0} icon={AlertTriangle} gradient="from-amber-500 to-orange-600" sublabel="GH¢ 0" />
        <MiniStatCard label="Facility Prices" value={kpis.totalFacilityPrices ?? 0} icon={BarChart3} gradient="from-cyan-500 to-blue-600" sublabel="Overrides" />
      </div>

      {/* Top billed services */}
      {data?.topBilled && data.topBilled.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            Top Billed Services (Last 30 Days)
          </h3>
          <Card>
            <CardContent className="p-4 space-y-2">
              {data.topBilled.map((s: any, i: number) => {
                const maxCount = data.topBilled[0].count || 1;
                const pct = Math.round((s.count / maxCount) * 100);
                return (
                  <div key={s.id || i} className="flex items-center gap-2">
                    <div className="w-48 text-xs text-slate-600 truncate">
                      {s.name} <span className="font-mono text-slate-400">({s.code})</span>
                    </div>
                    <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-md flex items-center justify-end pr-2"
                        style={{ width: `${pct}%` }}
                      >
                        <span className="text-[10px] font-bold text-white">{s.count}</span>
                      </div>
                    </div>
                    <div className="w-24 text-right text-xs text-slate-600">
                      {formatCurrency(s.revenue)}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}

      {/* Category breakdown */}
      {data?.byCategory && data.byCategory.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-2">
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            By Category
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.byCategory.map((c: any) => (
              <Badge key={c.name} variant="outline" className="text-xs capitalize">
                {c.name?.replace(/_/g, " ") || "Uncategorized"}: {c.count}
              </Badge>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// =====================================================================
// CATALOG TAB — list + search + create/edit + detail
// =====================================================================
function CatalogTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editService, setEditService] = useState<any | null>(null);
  const [detailService, setDetailService] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());
  params.set("status", statusFilter);
  if (categoryFilter !== "all") params.set("category", categoryFilter);
  params.set("limit", "500");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["services-admin", search, statusFilter, categoryFilter],
    queryFn: () => fetchJson(`/api/services?${params.toString()}`),
  });

  const items = data?.items || [];
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["services-admin"] });
    qc.invalidateQueries({ queryKey: ["services"] });
    qc.invalidateQueries({ queryKey: ["services-stats"] });
  };

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, code, NHIS code…"
                className="pl-8 h-9 text-sm"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {SERVICE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditService(null); setShowForm(true); }}>
              <Plus className="w-4 h-4" /> Add Service
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="No services found" description="Add a service or adjust your search." icon={DollarSign} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr className="text-left text-slate-600">
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Code</th>
                    <th className="px-3 py-2 font-semibold">Category</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold text-right">Default Price</th>
                    <th className="px-3 py-2 font-semibold text-right">NHIS Price</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Flags</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((s: any) => (
                    <tr key={s.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetailService(s)}>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {s.name}
                        {s.shortName && <span className="text-[10px] text-slate-400 ml-1">({s.shortName})</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-600">{s.code}</td>
                      <td className="px-3 py-2 text-slate-600 capitalize">{s.category?.replace(/_/g, " ") || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 capitalize">{s.serviceType?.replace(/_/g, " ") || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(s.defaultPrice)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-purple-700">{s.nhisPrice ? formatCurrency(s.nhisPrice) : "—"}</td>
                      <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {s.nhisEligible && <Badge variant="outline" className="text-[9px] py-0 h-4 text-purple-700 border-purple-300">NHIS</Badge>}
                          {!s.isBillable && <Badge variant="secondary" className="text-[9px] py-0 h-4">Non-bill</Badge>}
                          {s.facilityPrice && <Badge variant="outline" className="text-[9px] py-0 h-4 text-blue-700 border-blue-300">Fac override</Badge>}
                          {s.defaultPrice === 0 && s.isBillable && <Badge variant="destructive" className="text-[9px] py-0 h-4">No price!</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditService(s); setShowForm(true); }}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-slate-400 text-center">{items.length} service(s) shown</p>

      {showForm && (
        <ServiceForm
          service={editService}
          onClose={() => { setShowForm(false); setEditService(null); }}
          onSaved={() => { setShowForm(false); setEditService(null); invalidate(); }}
        />
      )}

      {detailService && (
        <ServiceDetailDialog
          serviceId={detailService.id}
          onClose={() => setDetailService(null)}
          onEdit={() => { setEditService(detailService); setDetailService(null); setShowForm(true); }}
        />
      )}
    </>
  );
}

// =====================================================================
// SERVICE FORM — create/edit
// =====================================================================
function ServiceForm({ service, onClose, onSaved }: { service: any | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!service;
  const [form, setForm] = useState({
    name: service?.name || "",
    shortName: service?.shortName || "",
    code: service?.code || "",
    category: service?.category || "other",
    serviceType: service?.serviceType || "",
    description: service?.description || "",
    defaultPrice: service?.defaultPrice?.toString() || "0",
    nhisPrice: service?.nhisPrice?.toString() || "",
    insurancePrice: service?.insurancePrice?.toString() || "",
    cashPrice: service?.cashPrice?.toString() || "",
    isBillable: service?.isBillable ?? true,
    isTaxable: service?.isTaxable ?? false,
    nhisEligible: service?.nhisEligible ?? false,
    nhisServiceCode: service?.nhisServiceCode || "",
    unitOfMeasure: service?.unitOfMeasure || "",
    status: service?.status || "active",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name || !form.code) { toast.error("Name and code are required"); return; }
    setSaving(true);
    try {
      const url = isEdit ? `/api/services/${service.id}` : "/api/services";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          defaultPrice: form.defaultPrice ? parseFloat(form.defaultPrice) : 0,
          nhisPrice: form.nhisPrice ? parseFloat(form.nhisPrice) : null,
          insurancePrice: form.insurancePrice ? parseFloat(form.insurancePrice) : null,
          cashPrice: form.cashPrice ? parseFloat(form.cashPrice) : null,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(isEdit ? "Service updated" : "Service created");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            {isEdit ? "Edit Service" : "Add Service"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the service master record." : "Create a new billable service in the master catalog."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="col-span-2">
              <FieldLabel required>Service Name</FieldLabel>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. General Consultation" className="h-8 text-sm" />
            </div>
            <div>
              <Label>Short Name</Label>
              <Input value={form.shortName} onChange={(e) => set("shortName", e.target.value)} placeholder="e.g. Consult" className="h-8 text-sm" />
            </div>
            <div>
              <FieldLabel required>Code</FieldLabel>
              <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. CONS-001" className="h-8 text-sm font-mono" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service Type</Label>
              <Select value={form.serviceType || "none"} onValueChange={(v) => set("serviceType", v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <FieldLabel required>Default Price (GH¢)</FieldLabel>
              <Input type="number" step="0.01" min="0" value={form.defaultPrice} onChange={(e) => set("defaultPrice", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label>NHIS Price (GH¢)</Label>
              <Input type="number" step="0.01" min="0" value={form.nhisPrice} onChange={(e) => set("nhisPrice", e.target.value)} placeholder="Tariff" className="h-8 text-sm" />
            </div>
            <div>
              <Label>Insurance Price</Label>
              <Input type="number" step="0.01" min="0" value={form.insurancePrice} onChange={(e) => set("insurancePrice", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label>Cash Price</Label>
              <Input type="number" step="0.01" min="0" value={form.cashPrice} onChange={(e) => set("cashPrice", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Billing flags */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="text-xs font-semibold text-slate-700">Billing Configuration</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px]">Unit of Measure</Label>
                <Select value={form.unitOfMeasure || "none"} onValueChange={(v) => set("unitOfMeasure", v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {UNITS_OF_MEASURE.map((u) => <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">NHIS Service Code</Label>
                <Input value={form.nhisServiceCode} onChange={(e) => set("nhisServiceCode", e.target.value)} placeholder="NHIS tariff code" className="h-8 text-sm font-mono" />
              </div>
              <div>
                <Label className="text-[10px]">Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                    <SelectItem value="temporarily_unavailable">Temporarily Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.isBillable} onCheckedChange={(v) => set("isBillable", !!v)} />
                <span className="text-xs font-medium text-slate-700">Billable</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.isTaxable} onCheckedChange={(v) => set("isTaxable", !!v)} />
                <span className="text-xs font-medium text-slate-700">Taxable</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.nhisEligible} onCheckedChange={(v) => set("nhisEligible", !!v)} />
                <span className="text-xs font-medium text-slate-700">NHIS Eligible</span>
              </label>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Service description, inclusions, exclusions…" className="text-sm" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving…" : isEdit ? "Update Service" : "Create Service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// SERVICE DETAIL DIALOG
// =====================================================================
function ServiceDetailDialog({ serviceId, onClose, onEdit }: { serviceId: string; onClose: () => void; onEdit: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["service-detail", serviceId],
    queryFn: () => fetchJson(`/api/services/${serviceId}`),
  });

  if (isLoading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl"><LoadingState rows={3} /></DialogContent>
      </Dialog>
    );
  }

  const s = data?.item;
  if (!s) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            <span>{s.name}</span>
            <Badge variant="outline" className="font-mono text-[10px]">{s.code}</Badge>
            <StatusBadge status={s.status} />
          </DialogTitle>
          <DialogDescription>
            {s.category?.replace(/_/g, " ") || "Uncategorized"}
            {s.serviceType && ` · ${s.serviceType.replace(/_/g, " ")}`}
            {s.unitOfMeasure && ` · per ${s.unitOfMeasure}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Pricing grid */}
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-slate-400 uppercase mb-2">Pricing</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Default</div>
                  <div className="font-bold text-slate-800">{formatCurrency(s.defaultPrice)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">NHIS</div>
                  <div className="font-bold text-purple-700">{s.nhisPrice ? formatCurrency(s.nhisPrice) : "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Insurance</div>
                  <div className="font-bold text-slate-700">{s.insurancePrice ? formatCurrency(s.insurancePrice) : "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Cash</div>
                  <div className="font-bold text-slate-700">{s.cashPrice ? formatCurrency(s.cashPrice) : "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {s.isBillable ? <Badge variant="outline" className="text-[9px] text-emerald-700">Billable</Badge> : <Badge variant="secondary" className="text-[9px]">Non-billable</Badge>}
                {s.isTaxable && <Badge variant="outline" className="text-[9px]">Taxable</Badge>}
                {s.nhisEligible && <Badge variant="outline" className="text-[9px] text-purple-700">NHIS Eligible</Badge>}
                {s.nhisServiceCode && <Badge variant="outline" className="text-[9px] font-mono">NHIS: {s.nhisServiceCode}</Badge>}
              </div>
            </CardContent>
          </Card>

          {/* Facility prices */}
          {s.facilityPrices?.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <div className="text-[10px] text-slate-400 uppercase mb-2">Facility-Specific Prices</div>
                <div className="space-y-1 text-xs">
                  {s.facilityPrices.map((fp: any) => (
                    <div key={fp.id} className="flex items-center justify-between">
                      <span className="text-slate-700">{fp.facility?.name || "—"}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatCurrency(fp.price)}</span>
                        {fp.nhisPrice && <Badge variant="outline" className="text-[9px] text-purple-700">NHIS: {formatCurrency(fp.nhisPrice)}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Price history */}
          {s.priceHistory?.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <div className="text-[10px] text-slate-400 uppercase mb-2">Price History</div>
                <div className="space-y-1 text-xs">
                  {s.priceHistory.slice(0, 10).map((ph: any) => (
                    <div key={ph.id} className="flex items-center justify-between">
                      <span className="text-slate-600">
                        <Badge variant="outline" className="text-[9px] mr-1">{ph.priceType}</Badge>
                        {formatCurrency(ph.oldPrice)} → <span className="font-medium">{formatCurrency(ph.newPrice)}</span>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatDate(ph.effectiveDate)}
                        {ph.changedBy && ` · ${ph.changedBy.firstName} ${ph.changedBy.lastName}`}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Usage summary */}
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-slate-400 uppercase mb-2">Usage Summary</div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <div className="text-2xl font-extrabold text-emerald-600">{s._count?.invoiceItems ?? 0}</div>
                  <div className="text-[10px] text-slate-500">Invoice Items</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-purple-600">{s._count?.vaccineCatalogs ?? 0}</div>
                  <div className="text-[10px] text-slate-500">Vaccine Catalogs</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {s.description && (
            <Card>
              <CardContent className="p-3">
                <div className="text-[10px] text-slate-400 uppercase mb-1">Description</div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap">{s.description}</div>
              </CardContent>
            </Card>
          )}

          {s.createdBy && (
            <div className="text-[10px] text-slate-400">
              Created by {s.createdBy.firstName} {s.createdBy.lastName} · {formatDate(s.createdAt)}
              {s.updatedBy && ` · Updated by ${s.updatedBy.firstName} ${s.updatedBy.lastName} · ${formatDate(s.updatedAt)}`}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={onEdit} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
            <FileText className="w-4 h-4" /> Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

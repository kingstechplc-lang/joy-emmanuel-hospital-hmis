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
  Upload, Download, Package, Zap, CheckSquare,
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
          <TabsTrigger value="packages" className="gap-1.5">
            <Package className="w-4 h-4" /> Packages
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="catalog" className="space-y-4">
          <CatalogTab />
        </TabsContent>
        <TabsContent value="packages" className="space-y-4">
          <PackagesTab />
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
  const [showImport, setShowImport] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

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
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => window.open("/api/services/export", "_blank")}>
              <Download className="w-4 h-4" /> Export
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setShowImport(true)}>
              <Upload className="w-4 h-4" /> Import
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setShowBulk(true)}>
              <Zap className="w-4 h-4" /> Bulk Update
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

      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); invalidate(); }}
        />
      )}

      {showBulk && (
        <BulkUpdateDialog
          onClose={() => setShowBulk(false)}
          onUpdated={() => { setShowBulk(false); invalidate(); }}
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
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            {isEdit ? "Edit Service" : "Add Service"}
          </DialogTitle>
          <DialogDescription className="text-white/80">
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

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
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
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="text-white flex items-center gap-2 flex-wrap">
            <DollarSign className="w-5 h-5" />
            <span>{s.name}</span>
            <Badge variant="outline" className="font-mono text-[10px]">{s.code}</Badge>
            <StatusBadge status={s.status} />
          </DialogTitle>
          <DialogDescription className="text-white/80">
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

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={onEdit} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
            <FileText className="w-4 h-4" /> Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// PACKAGES TAB — service bundles
// =====================================================================
function PackagesTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editPkg, setEditPkg] = useState<any | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["service-packages"],
    queryFn: () => fetchJson("/api/services/packages?status=all"),
  });

  const items = data?.items || [];
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["service-packages"] });
    qc.invalidateQueries({ queryKey: ["services-stats"] });
  };

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3 flex items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700">Service Packages</p>
            <p className="text-xs text-slate-500">Bundle multiple services into a single priced package (e.g. Maternity Package, ANC Package).</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditPkg(null); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> Add Package
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={3} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No packages" description="Create a service package to bundle multiple services." icon={Package} /></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((pkg: any) => (
            <Card key={pkg.id} className="cursor-pointer hover:shadow-md hover:border-emerald-300 transition-all" onClick={() => setEditPkg(pkg)}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-mono text-[10px]">{pkg.code}</Badge>
                      <span className="font-medium text-slate-800">{pkg.name}</span>
                      <StatusBadge status={pkg.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {pkg.components?.length || 0} component(s) · {formatCurrency(pkg.packagePrice)}
                      {pkg.nhisPrice && ` · NHIS: ${formatCurrency(pkg.nhisPrice)}`}
                    </div>
                    {pkg.description && <div className="text-xs text-slate-400 mt-1 line-clamp-1">{pkg.description}</div>}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {pkg.components?.slice(0, 3).map((c: any) => (
                      <Badge key={c.id} variant="outline" className="text-[9px]">{c.service?.name}</Badge>
                    ))}
                    {pkg.components?.length > 3 && <Badge variant="outline" className="text-[9px]">+{pkg.components.length - 3}</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <PackageForm
          pkg={editPkg}
          onClose={() => { setShowForm(false); setEditPkg(null); }}
          onSaved={() => { setShowForm(false); setEditPkg(null); invalidate(); }}
        />
      )}
    </>
  );
}

// =====================================================================
// PACKAGE FORM — create/edit
// =====================================================================
function PackageForm({ pkg, onClose, onSaved }: { pkg: any | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!pkg;
  const [name, setName] = useState(pkg?.name || "");
  const [code, setCode] = useState(pkg?.code || "");
  const [description, setDescription] = useState(pkg?.description || "");
  const [packagePrice, setPackagePrice] = useState(pkg?.packagePrice?.toString() || "0");
  const [nhisPrice, setNhisPrice] = useState(pkg?.nhisPrice?.toString() || "");
  const [components, setComponents] = useState<any[]>(pkg?.components?.map((c: any) => ({ serviceId: c.serviceId, name: c.service?.name, quantity: c.quantity, overridePrice: c.overridePrice })) || []);
  const [saving, setSaving] = useState(false);

  const { data: servicesData } = useQuery({
    queryKey: ["services-for-packages"],
    queryFn: () => fetchJson("/api/services?status=active&limit=500"),
  });
  const availableServices = servicesData?.items || [];

  const addComponent = (serviceId: string) => {
    const svc = availableServices.find((s: any) => s.id === serviceId);
    if (!svc) return;
    if (components.find((c) => c.serviceId === serviceId)) return;
    setComponents([...components, { serviceId, name: svc.name, quantity: 1, overridePrice: null }]);
  };

  const removeComponent = (serviceId: string) => {
    setComponents(components.filter((c) => c.serviceId !== serviceId));
  };

  const submit = async () => {
    if (!name || !code) { toast.error("Name and code are required"); return; }
    setSaving(true);
    try {
      const url = isEdit ? `/api/services/packages/${pkg.id}` : "/api/services/packages";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, code, description,
          packagePrice: parseFloat(packagePrice) || 0,
          nhisPrice: nhisPrice ? parseFloat(nhisPrice) : null,
          components: components.map((c) => ({ serviceId: c.serviceId, quantity: c.quantity, overridePrice: c.overridePrice })),
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(isEdit ? "Package updated" : "Package created");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="text-white flex items-center gap-2"><Package className="w-5 h-5" /> {isEdit ? "Edit Package" : "Add Package"}</DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel required>Package Name</FieldLabel><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maternity Package" className="h-8 text-sm" /></div>
            <div><FieldLabel required>Code</FieldLabel><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. MAT-PKG-001" className="h-8 text-sm font-mono" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel required>Package Price (GH¢)</FieldLabel><Input type="number" step="0.01" value={packagePrice} onChange={(e) => setPackagePrice(e.target.value)} className="h-8 text-sm" /></div>
            <div><Label>NHIS Price (GH¢)</Label><Input type="number" step="0.01" value={nhisPrice} onChange={(e) => setNhisPrice(e.target.value)} className="h-8 text-sm" /></div>
          </div>
          <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-sm" /></div>

          {/* Component services */}
          <div>
            <Label className="text-xs font-semibold">Component Services</Label>
            <Select onValueChange={addComponent}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="+ Add a service to this package" /></SelectTrigger>
              <SelectContent>
                {availableServices.filter((s: any) => !components.find((c) => c.serviceId === s.id)).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.code}) — {formatCurrency(s.defaultPrice)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {components.length > 0 && (
              <div className="mt-2 space-y-1">
                {components.map((c) => (
                  <div key={c.serviceId} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-md text-xs">
                    <span className="flex-1 font-medium text-slate-700">{c.name}</span>
                    <Input type="number" min="1" value={c.quantity} onChange={(e) => setComponents(components.map((x) => x.serviceId === c.serviceId ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))} className="h-7 w-16 text-xs" />
                    <Input type="number" step="0.01" placeholder="override" value={c.overridePrice || ""} onChange={(e) => setComponents(components.map((x) => x.serviceId === c.serviceId ? { ...x, overridePrice: e.target.value ? parseFloat(e.target.value) : null } : x))} className="h-7 w-24 text-xs" />
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-600" onClick={() => removeComponent(c.serviceId)}><X className="w-3 h-3" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving…" : isEdit ? "Update Package" : "Create Package"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// IMPORT DIALOG
// =====================================================================
function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const parseCSV = (text: string) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    const services: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const svc: any = {};
      headers.forEach((h, idx) => { if (values[idx]) svc[h] = values[idx]; });
      if (svc.name && svc.code) services.push(svc);
    }
    return services;
  };

  const handleImport = async () => {
    const svcs = parseCSV(csvText);
    if (svcs.length === 0) { toast.error("No valid services found. Ensure headers include 'name' and 'code'."); return; }
    setImporting(true);
    try {
      const res = await fetch("/api/services/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: svcs }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
      toast.success(`Imported: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped`);
      if (data.created > 0 || data.updated > 0) onImported();
    } catch (e: any) { toast.error(e.message); }
    finally { setImporting(false); }
  };

  const sample = `name,code,category,serviceType,defaultPrice,nhisPrice,nhisEligible,unitOfMeasure
General Consultation,CONS-001,consultation,consultation,50,30,true,visit
Full Blood Count,LAB-001,lab,investigation,25,15,true,test
Ultrasound Scan,RAD-001,imaging,diagnostic,150,80,true,test`;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle className="text-white flex items-center gap-2"><Upload className="w-5 h-5" /> Import Services (CSV)</DialogTitle></DialogHeader>
        <div className="p-6 space-y-3">
          <Button variant="outline" size="sm" onClick={() => setCsvText(sample)}>Load Sample</Button>
          <Textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={10} className="text-xs font-mono" placeholder="name,code,category,serviceType,defaultPrice,nhisPrice,nhisEligible,unitOfMeasure" />
          {result && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <div className="font-semibold">Import Results:</div>
              <div className="text-emerald-600">✓ Created: {result.created}</div>
              <div className="text-blue-600">↻ Updated: {result.updated}</div>
              <div className="text-amber-600">↺ Skipped: {result.skipped}</div>
              {result.errors?.length > 0 && <div className="text-rose-600">✗ Errors: {result.errors.length}</div>}
            </div>
          )}
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleImport} disabled={importing || !csvText.trim()} className="bg-emerald-600 hover:bg-emerald-700">
            {importing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
            {importing ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// BULK PRICE UPDATE DIALOG
// =====================================================================
function BulkUpdateDialog({ onClose, onUpdated }: { onClose: () => void; onUpdated: () => void }) {
  const [action, setAction] = useState("percentage_increase");
  const [value, setValue] = useState("10");
  const [priceType, setPriceType] = useState("default");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { data: servicesData } = useQuery({
    queryKey: ["services-for-bulk"],
    queryFn: () => fetchJson("/api/services?status=active&limit=500"),
  });
  const allServices = servicesData?.items || [];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleAll = () => {
    if (selectedIds.size === allServices.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(allServices.map((s: any) => s.id)));
  };

  const handleUpdate = async () => {
    if (selectedIds.size === 0) { toast.error("Select at least one service"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/services/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceIds: [...selectedIds],
          action,
          value: parseFloat(value),
          priceType,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
      toast.success(`${data.updated} service(s) updated`);
      onUpdated();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle className="text-white flex items-center gap-2"><Zap className="w-5 h-5" /> Bulk Price Update</DialogTitle></DialogHeader>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px]">Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage_increase">% Increase</SelectItem>
                  <SelectItem value="percentage_decrease">% Decrease</SelectItem>
                  <SelectItem value="fixed_set">Fixed Set Price</SelectItem>
                  <SelectItem value="activate">Activate</SelectItem>
                  <SelectItem value="deactivate">Deactivate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!["activate", "deactivate"].includes(action) && (
              <div>
                <Label className="text-[10px]">Value</Label>
                <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 text-sm" />
              </div>
            )}
            {!["activate", "deactivate"].includes(action) && (
              <div>
                <Label className="text-[10px]">Price Type</Label>
                <Select value={priceType} onValueChange={setPriceType}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default Price</SelectItem>
                    <SelectItem value="nhis">NHIS Price</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox checked={selectedIds.size === allServices.length && allServices.length > 0} onCheckedChange={toggleAll} />
            <span className="text-xs font-medium text-slate-700">Select All ({allServices.length})</span>
            <span className="text-xs text-slate-400">· {selectedIds.size} selected</span>
          </div>

          <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-md">
            {allServices.map((s: any) => (
              <label key={s.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0">
                <Checkbox
                  checked={selectedIds.has(s.id)}
                  onCheckedChange={() => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      return next;
                    });
                  }}
                />
                <span className="text-xs flex-1">{s.name} <span className="font-mono text-slate-400">({s.code})</span></span>
                <span className="text-xs text-slate-600">{formatCurrency(s.defaultPrice)}</span>
                {s.nhisPrice && <span className="text-xs text-purple-700">{formatCurrency(s.nhisPrice)}</span>}
              </label>
            ))}
          </div>

          {result && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <div className="font-semibold mb-1">Update Results:</div>
              <div className="text-emerald-600">✓ Updated: {result.updated} service(s)</div>
              {result.changes?.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto">
                  {result.changes.slice(0, 10).map((c: any) => (
                    <div key={c.id} className="text-[10px] text-slate-600">{c.name}: {formatCurrency(c.oldPrice)} → {formatCurrency(c.newPrice)}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleUpdate} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Zap className="w-4 h-4 mr-1" />}
            {loading ? "Updating…" : "Update Selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

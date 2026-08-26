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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Stethoscope, Plus, Search, RefreshCcw, Eye, AlertCircle, Edit, Trash2,
  Star, Upload, Database, ToggleLeft, ToggleRight, FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, safeJson, PageHeader, MiniStatCard, ClearableSearch } from "@/components/ui-helpers"
import { DataTable } from "@/components/ui/data-table";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

async function sendJson(url: string, method: string, body?: any) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

const CODE_SYSTEMS = ["ICD-10", "ICD-11", "SNOMED_CT", "LOCAL", "OTHER"];
const CATEGORIES = [
  "cardiovascular", "endocrine", "respiratory", "infectious", "gastrointestinal",
  "musculoskeletal", "neurological", "mental_health", "dermatological",
  "genitourinary", "eye", "ent", "dental", "obstetric", "symptoms", "other",
];

export function DiagnosisEngineView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canManageCatalog = can("diagnosis.catalog.manage");
  const canImport = can("diagnosis.import") || canManageCatalog;
  const canView = can("diagnosis.view") || canManageCatalog;

  const [activeTab, setActiveTab] = useState("catalog");

  if (!canView) {
    return (
      <Card><CardContent className="p-12 text-center">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
        <p className="text-sm text-slate-500">You don&apos;t have permission to access the Diagnosis Engine.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4 fade-in-up">
      <PageHeader
        title="Diagnosis Engine"
        description="Centralized diagnosis catalog — ICD-10/ICD-11 codes, synonyms, categories, and terminology management for the entire HMIS"
        icon={Stethoscope}
        gradient="from-indigo-500 to-purple-600"
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto tabs-scroll">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`text-xs whitespace-nowrap px-4 py-2 rounded-md font-medium transition-colors ${activeTab === "catalog" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:bg-slate-200"}`}
        >
          Catalog
        </button>
        <button
          onClick={() => setActiveTab("stats")}
          className={`text-xs whitespace-nowrap px-4 py-2 rounded-md font-medium transition-colors ${activeTab === "stats" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:bg-slate-200"}`}
        >
          Statistics
        </button>
      </div>

      {activeTab === "catalog" && <CatalogTab canManage={canManageCatalog} canImport={canImport} />}
      {activeTab === "stats" && <StatsTab />}
    </div>
  );
}

// =====================================================================
// CATALOG TAB — searchable master list with CRUD
// =====================================================================
function CatalogTab({ canManage, canImport }: { canManage: boolean; canImport: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [codeSystemFilter, setCodeSystemFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (categoryFilter !== "all") params.set("category", categoryFilter);
  if (codeSystemFilter !== "all") params.set("codeSystem", codeSystemFilter);
  if (activeFilter !== "all") params.set("isActive", activeFilter);
  params.set("limit", "500");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["diagnosis-catalog", params.toString()],
    queryFn: () => fetchJson(`/api/diagnoses/catalog?${params.toString()}`),
    staleTime: 0,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => sendJson(`/api/diagnoses/catalog/${id}`, "DELETE"),
    onSuccess: (res: any) => {
      if (res.deactivated) {
        toast.success(`Deactivated — ${res.reason}`);
      } else {
        toast.success("Diagnosis deleted");
      }
      qc.invalidateQueries({ queryKey: ["diagnosis-catalog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      sendJson(`/api/diagnoses/catalog/${id}`, "PATCH", { isActive }),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["diagnosis-catalog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedMut = useMutation({
    mutationFn: () => sendJson("/api/diagnoses/seed", "POST"),
    onSuccess: (res: any) => {
      toast.success(`Seeded ${res.created} diagnoses (${res.skipped} already existed)`);
      qc.invalidateQueries({ queryKey: ["diagnosis-catalog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search by name, code, or synonym..." className="pl-0" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={codeSystemFilter} onValueChange={setCodeSystemFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Systems</SelectItem>
              {CODE_SYSTEMS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }} disabled={isFetching}>
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {canImport && (
            <Button size="sm" variant="outline" onClick={() => seedMut.mutate()} disabled={seedMut.isPending} className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
              <Database className="w-4 h-4 mr-1" /> {seedMut.isPending ? "Seeding..." : "Seed ICD-10 Catalog"}
            </Button>
          )}
          {canManage && (
            <Button size="sm" onClick={() => { setEditItem(null); setShowForm(true); }} className="gap-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
              <Plus className="w-4 h-4" /> New Diagnosis
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard label="Total" value={items.length} icon={Stethoscope} gradient="from-indigo-500 to-purple-600" />
        <MiniStatCard label="Active" value={items.filter((i) => i.isActive).length} icon={ToggleRight} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Inactive" value={items.filter((i) => !i.isActive).length} icon={ToggleLeft} gradient="from-slate-400 to-slate-500" />
        <MiniStatCard label="Chronic Default" value={items.filter((i) => i.isChronicDefault).length} icon={AlertCircle} gradient="from-rose-500 to-red-600" />
      </div>

      {/* Table */}
      {isLoading ? <LoadingState rows={6} /> :
       items.length === 0 ? <EmptyState title="No diagnoses found" description={canImport ? "Seed the catalog with common ICD-10 diagnoses, or add your own." : "No diagnoses match your search."} icon={Stethoscope}
         action={canImport ? <Button onClick={() => seedMut.mutate()} disabled={seedMut.isPending} className="gap-1 bg-indigo-600 text-white"><Database className="w-4 h-4" /> Seed Catalog</Button> : undefined} /> :
       <Card className="shadow-sm border-slate-200 overflow-hidden">
         <CardContent className="p-0">
           <DataTable
             headers={["Code", "Name", "Category", "Code System", "Chronic", "Specialty", "Active", "Actions"]}
             rows={items.map((item) => {
               let synonyms: string[] = [];
               try { synonyms = item.synonyms ? JSON.parse(item.synonyms) : []; } catch {}
               return {
                 cells: [
                   <span key="c" className="font-mono text-xs text-white bg-gradient-to-r from-indigo-500 to-purple-600 px-2 py-0.5 rounded-md font-semibold">{item.code}</span>,
                   <div key="n">
                     <div className="text-sm font-medium text-slate-900">{item.name}</div>
                     {synonyms.length > 0 && <div className="text-[10px] text-slate-500 mt-0.5">aka: {synonyms.slice(0, 3).join(", ")}{synonyms.length > 3 ? ` +${synonyms.length - 3}` : ""}</div>}
                   </div>,
                   <Badge key="cat" variant="outline" className="capitalize text-[10px]">{item.category || "—"}</Badge>,
                   <span key="cs" className="text-xs text-slate-600">{item.codeSystem}</span>,
                   item.isChronicDefault ? <Badge key="ch" variant="outline" className="text-[9px] border-rose-300 text-rose-700 bg-rose-50">CHRONIC</Badge> : <span key="ch" className="text-xs text-slate-400">—</span>,
                   <span key="sp" className="text-xs text-slate-600">{item.specialty || "—"}</span>,
                   <StatusBadge key="a" status={item.isActive ? "active" : "inactive"} />,
                   <div key="act" className="flex gap-1">
                     {canManage && (
                       <>
                         <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditItem(item); setShowForm(true); }} title="Edit">
                           <Edit className="w-3.5 h-3.5" />
                         </Button>
                         <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => toggleActiveMut.mutate({ id: item.id, isActive: !item.isActive })} title={item.isActive ? "Deactivate" : "Activate"}>
                           {item.isActive ? <ToggleRight className="w-3.5 h-3.5 text-emerald-600" /> : <ToggleLeft className="w-3.5 h-3.5 text-slate-400" />}
                         </Button>
                         <Button size="sm" variant="ghost" className="h-7 px-2 text-rose-600" onClick={() => { if (confirm(`Delete "${item.name}" (${item.code})?`)) deleteMut.mutate(item.id); }} title="Delete">
                           <Trash2 className="w-3.5 h-3.5" />
                         </Button>
                       </>
                     )}
                   </div>,
                 ],
                 sortValues: [item.code, item.name, item.category || "", item.codeSystem, item.isChronicDefault ? "1" : "0", item.specialty || "", item.isActive ? "1" : "0", ""],
               };
             })}
             gradient="from-indigo-500 to-purple-600"
             pageSize={15}
           />
         </CardContent>
       </Card>}

      {showForm && canManage && (
        <DiagnosisCatalogForm
          item={editItem}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSaved={() => { setShowForm(false); setEditItem(null); qc.invalidateQueries({ queryKey: ["diagnosis-catalog"] }); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// DIAGNOSIS CATALOG FORM (create + edit)
// =====================================================================
function DiagnosisCatalogForm({ item, onClose, onSaved }: { item: any | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: item?.code || "",
    codeSystem: item?.codeSystem || "ICD-10",
    name: item?.name || "",
    description: item?.description || "",
    category: item?.category || "other",
    synonyms: item?.synonyms ? (() => { try { return JSON.parse(item.synonyms).join(", "); } catch { return ""; } })() : "",
    specialty: item?.specialty || "",
    isChronicDefault: item?.isChronicDefault ?? false,
    isActive: item?.isActive ?? true,
    version: item?.version || "ICD-10-2023",
    source: item?.source || "WHO",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        synonyms: form.synonyms ? JSON.stringify(form.synonyms.split(",").map((s) => s.trim()).filter(Boolean)) : null,
      };
      if (item) return sendJson(`/api/diagnoses/catalog/${item.id}`, "PATCH", payload);
      return sendJson("/api/diagnoses/catalog", "POST", payload);
    },
    onSuccess: () => { toast.success(item ? "Diagnosis updated" : "Diagnosis created"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-indigo-600" />
            {item ? "Edit Diagnosis" : "New Diagnosis Catalog Entry"}
          </DialogTitle>
          <DialogDescription>Standardized diagnosis with code (ICD-10/ICD-11/SNOMED), synonyms, and category.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <FieldLabel>Code *</FieldLabel>
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g., I10, E11.9" disabled={!!item} />
          </div>
          <div>
            <FieldLabel>Code System</FieldLabel>
            <Select value={form.codeSystem} onValueChange={(v) => set("codeSystem", v)} disabled={!!item}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CODE_SYSTEMS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Category</FieldLabel>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 md:col-span-3">
            <FieldLabel>Name *</FieldLabel>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g., Essential (primary) hypertension" />
          </div>
          <div className="col-span-2 md:col-span-3">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Optional clinical description..." />
          </div>
          <div className="col-span-2 md:col-span-3">
            <Label>Synonyms (comma-separated)</Label>
            <Input value={form.synonyms} onChange={(e) => set("synonyms", e.target.value)} placeholder="e.g., HTN, High BP, High blood pressure" />
            <p className="text-[10px] text-slate-500 mt-1">These will match in the diagnosis search.</p>
          </div>
          <div>
            <Label>Specialty (optional)</Label>
            <Input value={form.specialty} onChange={(e) => set("specialty", e.target.value)} placeholder="e.g., CARDIO, DERM" />
          </div>
          <div>
            <Label>Version</Label>
            <Input value={form.version} onChange={(e) => set("version", e.target.value)} placeholder="e.g., ICD-10-2023" />
          </div>
          <div>
            <Label>Source</Label>
            <Input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="e.g., WHO, Local" />
          </div>
          <div className="col-span-2 md:col-span-3 flex gap-4 items-center">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isChronicDefault} onChange={(e) => set("isChronicDefault", e.target.checked)} className="w-4 h-4" />
              <span>Typically chronic condition</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="w-4 h-4" />
              <span>Active (available for selection)</span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.code || !form.name} className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
            {saveMut.isPending ? "Saving..." : item ? "Update Diagnosis" : "Create Diagnosis"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// STATS TAB — catalog statistics + usage insights
// =====================================================================
function StatsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["diagnosis-catalog-stats"],
    queryFn: () => fetchJson("/api/diagnoses/catalog?limit=1000&isActive=all"),
    staleTime: 60_000,
  });
  const items: any[] = data?.items || [];

  const byCategory = items.reduce((acc: Record<string, number>, d) => {
    const c = d.category || "uncategorized";
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});
  const byCodeSystem = items.reduce((acc: Record<string, number>, d) => {
    const s = d.codeSystem || "UNKNOWN";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {isLoading ? <LoadingState rows={4} /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStatCard label="Total Diagnoses" value={items.length} icon={Database} gradient="from-indigo-500 to-purple-600" />
            <MiniStatCard label="Active" value={items.filter((i) => i.isActive).length} icon={ToggleRight} gradient="from-emerald-500 to-emerald-600" />
            <MiniStatCard label="With Synonyms" value={items.filter((i) => i.synonyms).length} icon={FileText} gradient="from-blue-500 to-blue-600" />
            <MiniStatCard label="Chronic Default" value={items.filter((i) => i.isChronicDefault).length} icon={AlertCircle} gradient="from-rose-500 to-red-600" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">By Category</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(byCategory).sort((a: any, b: any) => b[1] - a[1]).map(([cat, count]: any) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-sm capitalize text-slate-700">{cat.replace(/_/g, " ")}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">By Code System</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(byCodeSystem).sort((a: any, b: any) => b[1] - a[1]).map(([sys, count]: any) => (
                  <div key={sys} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{sys}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

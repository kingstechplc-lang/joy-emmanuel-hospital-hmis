"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
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
  Pill, Plus, RefreshCw, Loader2, Activity, AlertTriangle, Search, X,
  PackageX, Calendar, TrendingUp, ShieldAlert, Barcode, Beaker,
  FileText, CheckCircle2, ChevronDown, ChevronRight,
  Upload, CheckSquare, Square, Zap,
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

const MEDICATION_CATEGORIES = [
  "analgesics", "antibiotics", "antimalarials", "antihypertensives", "antidiabetics",
  "antihistamines", "antacids", "antiemetics", "antifungals", "antivirals",
  "cardiovascular", "respiratory", "dermatological", "obstetric", "paediatric",
  "emergency", "surgical", "vitamins_supplements", "other",
];

const DOSAGE_FORMS = [
  "tablet", "capsule", "syrup", "suspension", "solution", "injection",
  "cream", "ointment", "gel", "lotion", "drops", "suppository",
  "powder", "sachet", "inhaler", "patch", "other",
];

const ROUTES = [
  "oral", "iv", "im", "sc", "topical", "rectal", "vaginal",
  "ophthalmic", "otic", "nasal", "inhalation", "sublingual", "buccal", "other",
];

// =====================================================================
// MAIN VIEW
// =====================================================================
export function MedicationsAdminView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Medications"
        description="Central medication master catalog — classification, safety flags, formulary, and inventory integration."
        icon={Pill}
        gradient="from-indigo-500 to-blue-600"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <Activity className="w-4 h-4" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="catalog" className="gap-1.5">
            <Pill className="w-4 h-4" /> Catalog
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <DashboardTab facilityId={activeFacilityId} />
        </TabsContent>
        <TabsContent value="catalog" className="space-y-4">
          <CatalogTab facilityId={activeFacilityId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab({ facilityId }: { facilityId: string | null }) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["medications-stats", facilityId],
    queryFn: () => fetchJson(`/api/medications/stats${facilityId ? `?facilityId=${facilityId}` : ""}`),
    refetchInterval: 60000,
  });

  const kpis = data?.kpis || {};

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-600" />
          Medication Catalog KPIs
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
            {isFetching ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                <span className="text-indigo-700 font-medium">Refreshing…</span>
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <MiniStatCard label="Active Meds" value={kpis.totalActive ?? 0} icon={Pill} gradient="from-indigo-500 to-blue-600" sublabel="In formulary" />
        <MiniStatCard label="Inactive" value={kpis.totalInactive ?? 0} icon={X} gradient="from-slate-400 to-slate-500" sublabel="Archived/deactivated" />
        <MiniStatCard label="High Alert" value={kpis.totalHighAlert ?? 0} icon={ShieldAlert} gradient="from-rose-500 to-red-600" sublabel="ISMP flagged" />
        <MiniStatCard label="Controlled" value={kpis.totalControlled ?? 0} icon={AlertTriangle} gradient="from-orange-500 to-amber-600" sublabel="Restricted substances" />
      </div>

      {facilityId && (
        <>
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-2">
            <PackageX className="w-4 h-4 text-amber-600" />
            Stock Alerts (This Facility)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MiniStatCard label="Low Stock" value={kpis.lowStockCount ?? 0} icon={PackageX} gradient="from-amber-500 to-orange-600" sublabel="At/below reorder level" />
            <MiniStatCard label="Near Expiry" value={kpis.nearExpiryCount ?? 0} icon={Calendar} gradient="from-yellow-500 to-amber-500" sublabel="Expiring within 30 days" />
            <MiniStatCard label="Expired" value={kpis.expiredBatchCount ?? 0} icon={AlertTriangle} gradient="from-rose-500 to-red-600" sublabel="Past expiry date" />
          </div>
        </>
      )}

      {/* Top prescribed chart */}
      {data?.topPrescribed && data.topPrescribed.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            Top Prescribed (Last 30 Days)
          </h3>
          <Card>
            <CardContent className="p-4 space-y-2">
              {data.topPrescribed.map((m: any, i: number) => {
                const maxCount = data.topPrescribed[0].count || 1;
                const pct = Math.round((m.count / maxCount) * 100);
                return (
                  <div key={m.id || i} className="flex items-center gap-2">
                    <div className="w-48 text-xs text-slate-600 truncate">
                      {m.genericName} {m.strength || ""}
                    </div>
                    <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-md flex items-center justify-end pr-2"
                        style={{ width: `${pct}%` }}
                      >
                        <span className="text-[10px] font-bold text-white">{m.count}</span>
                      </div>
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
            <Beaker className="w-4 h-4 text-indigo-600" />
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
function CatalogTab({ facilityId }: { facilityId: string | null }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editMed, setEditMed] = useState<any | null>(null);
  const [detailMed, setDetailMed] = useState<any | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("analgesics");
  const [bulkLoading, setBulkLoading] = useState(false);

  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (categoryFilter !== "all") params.set("category", categoryFilter);
  params.set("limit", "500");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["medications", search, statusFilter, categoryFilter],
    queryFn: () => fetchJson(`/api/medications?${params.toString()}`),
  });

  const items = data?.items || [];
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["medications"] });
    qc.invalidateQueries({ queryKey: ["medications-stats"] });
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
                placeholder="Search by generic name, brand, barcode, ATC code, manufacturer…"
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
                <SelectItem value="discontinued">Discontinued</SelectItem>
                <SelectItem value="restricted">Restricted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {MEDICATION_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setShowImport(true)}>
              <Upload className="w-4 h-4" /> Import CSV
            </Button>
            <Button size="sm" className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700" onClick={() => { setEditMed(null); setShowForm(true); }}>
              <Plus className="w-4 h-4" /> Add Medication
            </Button>
          </div>

          {/* Bulk actions bar (visible when items are selected) */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mt-2 p-2 bg-indigo-50 border border-indigo-200 rounded-md">
              <span className="text-xs font-medium text-indigo-700">
                {selectedIds.size} selected
              </span>
              <Button
                variant="outline" size="sm" className="h-7 text-xs"
                disabled={bulkLoading}
                onClick={async () => {
                  setBulkLoading(true);
                  try {
                    const res = await fetch("/api/medications/bulk", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ medicationIds: [...selectedIds], action: "activate" }),
                    });
                    const d = await safeJson(res);
                    if (!res.ok) throw new Error(d.error);
                    toast.success(`${d.updated} medication(s) activated`);
                    setSelectedIds(new Set());
                    invalidate();
                  } catch (e: any) { toast.error(e.message); }
                  finally { setBulkLoading(false); }
                }}
              >
                <CheckCircle2 className="w-3 h-3" /> Activate
              </Button>
              <Button
                variant="outline" size="sm" className="h-7 text-xs"
                disabled={bulkLoading}
                onClick={async () => {
                  setBulkLoading(true);
                  try {
                    const res = await fetch("/api/medications/bulk", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ medicationIds: [...selectedIds], action: "deactivate" }),
                    });
                    const d = await safeJson(res);
                    if (!res.ok) throw new Error(d.error);
                    toast.success(`${d.updated} medication(s) deactivated`);
                    setSelectedIds(new Set());
                    invalidate();
                  } catch (e: any) { toast.error(e.message); }
                  finally { setBulkLoading(false); }
                }}
              >
                <X className="w-3 h-3" /> Deactivate
              </Button>
              <div className="flex items-center gap-1">
                <Select value={bulkCategory} onValueChange={setBulkCategory}>
                  <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEDICATION_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline" size="sm" className="h-7 text-xs"
                  disabled={bulkLoading}
                  onClick={async () => {
                    setBulkLoading(true);
                    try {
                      const res = await fetch("/api/medications/bulk", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ medicationIds: [...selectedIds], action: "setCategory", value: bulkCategory }),
                      });
                      const d = await safeJson(res);
                      if (!res.ok) throw new Error(d.error);
                      toast.success(`${d.updated} medication(s) set to ${bulkCategory}`);
                      setSelectedIds(new Set());
                      invalidate();
                    } catch (e: any) { toast.error(e.message); }
                    finally { setBulkLoading(false); }
                  }}
                >
                  <Zap className="w-3 h-3" /> Set Category
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="No medications found" description="Add a medication to the catalog or adjust your search." icon={Pill} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr className="text-left text-slate-600">
                    <th className="px-2 py-2 w-8">
                      <Checkbox
                        checked={selectedIds.size === items.length && items.length > 0}
                        onCheckedChange={(v) => {
                          if (v) setSelectedIds(new Set(items.map((m: any) => m.id)));
                          else setSelectedIds(new Set());
                        }}
                      />
                    </th>
                    <th className="px-3 py-2 font-semibold">Generic Name</th>
                    <th className="px-3 py-2 font-semibold">Brand</th>
                    <th className="px-3 py-2 font-semibold">Strength</th>
                    <th className="px-3 py-2 font-semibold">Form</th>
                    <th className="px-3 py-2 font-semibold">Route</th>
                    <th className="px-3 py-2 font-semibold">Category</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Flags</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((m: any) => (
                    <tr key={m.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetailMed(m)}>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(m.id)}
                          onCheckedChange={(v) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(m.id);
                              else next.delete(m.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">{m.genericName}</td>
                      <td className="px-3 py-2 text-slate-600">{m.brandName || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{m.strength || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 capitalize">{m.dosageForm?.replace(/_/g, " ") || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 capitalize">{m.route || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 capitalize">{m.medicationCategory?.replace(/_/g, " ") || "—"}</td>
                      <td className="px-3 py-2"><StatusBadge status={m.status} /></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {m.isHighAlert && (
                            <Badge variant="destructive" className="text-[9px] py-0 h-4">High Alert</Badge>
                          )}
                          {m.controlledStatus && m.controlledStatus !== "none" && (
                            <Badge variant="outline" className="text-[9px] py-0 h-4 text-orange-700 border-orange-300">Controlled</Badge>
                          )}
                          {m.prescriptionStatus === "otc" && (
                            <Badge variant="secondary" className="text-[9px] py-0 h-4">OTC</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditMed(m); setShowForm(true); }}>
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

      <p className="text-xs text-slate-400 text-center">{items.length} medication(s) shown</p>

      {showForm && (
        <MedicationForm
          med={editMed}
          onClose={() => { setShowForm(false); setEditMed(null); }}
          onSaved={() => { setShowForm(false); setEditMed(null); invalidate(); }}
        />
      )}

      {detailMed && (
        <MedicationDetailDialog
          medId={detailMed.id}
          onClose={() => setDetailMed(null)}
          onEdit={() => { setEditMed(detailMed); setDetailMed(null); setShowForm(true); }}
        />
      )}

      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); invalidate(); }}
        />
      )}
    </>
  );
}

// =====================================================================
// IMPORT DIALOG — CSV/JSON bulk import
// =====================================================================
function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const parseCSV = (text: string) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    const medications: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const med: any = {};
      headers.forEach((h, idx) => {
        if (values[idx]) med[h] = values[idx];
      });
      if (med.genericName) medications.push(med);
    }
    return medications;
  };

  const handleImport = async () => {
    const meds = parseCSV(csvText);
    if (meds.length === 0) {
      toast.error("No valid medications found in CSV. Ensure the first row has headers including 'genericName'.");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/medications/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medications: meds }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
      toast.success(`Imported: ${data.created} created, ${data.skipped} skipped`);
      if (data.created > 0) onImported();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  const sampleCSV = `genericName,brandName,strength,dosageForm,route,medicationCategory,therapeuticClass,manufacturer
Paracetamol,Panadol,500mg,tablet,oral,analgesics,Analgesic,GSK
Amoxicillin,Amoxil,250mg,capsule,oral,antibiotics,Penicillin,GSK
Artemether/Lumefantrine,Coartem,20/120mg,tablet,oral,antimalarials,Antimalarial,Novartis`;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-600" />
            Import Medications (CSV)
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Paste CSV data with headers in the first row. Required column: <code>genericName</code>.
            Optional: brandName, strength, dosageForm, route, medicationCategory, therapeuticClass, atcCode, barcode, manufacturer, nhisCode.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setCsvText(sampleCSV)}
            >
              Load Sample
            </Button>
            <span className="text-[10px] text-slate-400">
              Click "Load Sample" to see the expected format
            </span>
          </div>

          <Textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={12}
            className="text-xs font-mono"
            placeholder="genericName,brandName,strength,dosageForm,route,medicationCategory,therapeuticClass,manufacturer&#10;Paracetamol,Panadol,500mg,tablet,oral,analgesics,Analgesic,GSK&#10;..."
          />

          {result && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <div className="font-semibold text-slate-700">Import Results:</div>
              <div className="text-emerald-600">✓ Created: {result.created}</div>
              <div className="text-amber-600">↺ Skipped (duplicates): {result.skipped}</div>
              {result.errors?.length > 0 && (
                <div className="text-rose-600">
                  ✗ Errors: {result.errors.length}
                  <ul className="ml-4 mt-1">
                    {result.errors.slice(0, 5).map((err: any, i: number) => (
                      <li key={i}>Row {err.row}: {err.genericName} — {err.error}</li>
                    ))}
                    {result.errors.length > 5 && <li>...and {result.errors.length - 5} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleImport} disabled={importing || !csvText.trim()} className="bg-indigo-600 hover:bg-indigo-700">
            {importing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
            {importing ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// MEDICATION FORM — create/edit
// =====================================================================
function MedicationForm({ med, onClose, onSaved }: { med: any | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!med;
  const [form, setForm] = useState({
    genericName: med?.genericName || "",
    brandName: med?.brandName || "",
    strength: med?.strength || "",
    strengthUnit: med?.strengthUnit || "",
    dosageForm: med?.dosageForm || "",
    route: med?.route || "",
    unit: med?.unit || "",
    description: med?.description || "",
    medicationCategory: med?.medicationCategory || "",
    therapeuticClass: med?.therapeuticClass || "",
    atcCode: med?.atcCode || "",
    barcode: med?.barcode || "",
    productCode: med?.productCode || "",
    nhisCode: med?.nhisCode || "",
    manufacturer: med?.manufacturer || "",
    countryOfOrigin: med?.countryOfOrigin || "",
    prescriptionStatus: med?.prescriptionStatus || "prescription_required",
    controlledStatus: med?.controlledStatus || "",
    isHighAlert: med?.isHighAlert || false,
    pregnancyCategory: med?.pregnancyCategory || "",
    lactationSafety: med?.lactationSafety || "",
    defaultDose: med?.defaultDose || "",
    defaultFrequency: med?.defaultFrequency || "",
    defaultRoute: med?.defaultRoute || "",
    defaultDuration: med?.defaultDuration || "",
    formularyStatus: med?.formularyStatus || "formulary",
    storageConditions: med?.storageConditions || "",
    status: med?.status || "active",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.genericName) { toast.error("Generic name is required"); return; }
    setSaving(true);
    try {
      const url = isEdit ? `/api/medications/${med.id}` : "/api/medications";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(isEdit ? "Medication updated" : "Medication created");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <Pill className="w-5 h-5 text-indigo-600" />
            {isEdit ? "Edit Medication" : "Add Medication"}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {isEdit ? "Update the medication master record." : "Create a new medication in the master catalog."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Core identification */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <FieldLabel required>Generic Name</FieldLabel>
              <Input value={form.genericName} onChange={(e) => set("genericName", e.target.value)} placeholder="e.g. Paracetamol" className="h-8 text-sm" />
            </div>
            <div>
              <Label>Brand Name</Label>
              <Input value={form.brandName} onChange={(e) => set("brandName", e.target.value)} placeholder="e.g. Panadol" className="h-8 text-sm" />
            </div>
            <div>
              <Label>Strength</Label>
              <Input value={form.strength} onChange={(e) => set("strength", e.target.value)} placeholder="e.g. 500mg" className="h-8 text-sm" />
            </div>
            <div>
              <Label>Strength Unit</Label>
              <Select value={form.strengthUnit || "none"} onValueChange={(v) => set("strengthUnit", v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {["mg", "mL", "%", "IU", "mcg", "g"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dosage Form</Label>
              <Select value={form.dosageForm || "none"} onValueChange={(v) => set("dosageForm", v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {DOSAGE_FORMS.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Route</Label>
              <Select value={form.route || "none"} onValueChange={(v) => set("route", v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {ROUTES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Classification */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={form.medicationCategory || "none"} onValueChange={(v) => set("medicationCategory", v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {MEDICATION_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Therapeutic Class</Label>
              <Input value={form.therapeuticClass} onChange={(e) => set("therapeuticClass", e.target.value)} placeholder="e.g. Penicillin" className="h-8 text-sm" />
            </div>
            <div>
              <Label>ATC Code</Label>
              <Input value={form.atcCode} onChange={(e) => set("atcCode", e.target.value)} placeholder="e.g. N02BE01" className="h-8 text-sm" />
            </div>
          </div>

          {/* Identification codes */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="GTIN/EAN" className="h-8 text-sm" />
            </div>
            <div>
              <Label>Product Code</Label>
              <Input value={form.productCode} onChange={(e) => set("productCode", e.target.value)} placeholder="SKU" className="h-8 text-sm" />
            </div>
            <div>
              <Label>NHIS Code</Label>
              <Input value={form.nhisCode} onChange={(e) => set("nhisCode", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Manufacturer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Manufacturer</Label>
              <Input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label>Country of Origin</Label>
              <Input value={form.countryOfOrigin} onChange={(e) => set("countryOfOrigin", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Safety flags */}
          <div className="p-3 bg-rose-50/30 border border-rose-200 rounded-lg space-y-2">
            <div className="text-xs font-semibold text-rose-800 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Safety & Regulatory
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-[10px]">Prescription Status</Label>
                <Select value={form.prescriptionStatus} onValueChange={(v) => set("prescriptionStatus", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prescription_required">Prescription Required</SelectItem>
                    <SelectItem value="otc">Over-the-Counter</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Controlled Status</Label>
                <Select value={form.controlledStatus || "none"} onValueChange={(v) => set("controlledStatus", v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="class_a">Class A</SelectItem>
                    <SelectItem value="class_b">Class B</SelectItem>
                    <SelectItem value="class_c">Class C</SelectItem>
                    <SelectItem value="class_d">Class D</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Pregnancy Category</Label>
                <Select value={form.pregnancyCategory || "none"} onValueChange={(v) => set("pregnancyCategory", v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {["A", "B", "C", "D", "X", "unknown"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Lactation Safety</Label>
                <Select value={form.lactationSafety || "none"} onValueChange={(v) => set("lactationSafety", v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    <SelectItem value="safe">Safe</SelectItem>
                    <SelectItem value="use_with_caution">Use with caution</SelectItem>
                    <SelectItem value="avoid">Avoid</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={form.isHighAlert} onCheckedChange={(v) => set("isHighAlert", !!v)} />
              <span className="text-xs font-medium text-slate-700">ISMP High-Alert Medication</span>
            </label>
          </div>

          {/* Defaults for prescribing */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label>Default Dose</Label>
              <Input value={form.defaultDose} onChange={(e) => set("defaultDose", e.target.value)} placeholder="e.g. 500mg" className="h-8 text-sm" />
            </div>
            <div>
              <Label>Default Frequency</Label>
              <Input value={form.defaultFrequency} onChange={(e) => set("defaultFrequency", e.target.value)} placeholder="e.g. BD" className="h-8 text-sm" />
            </div>
            <div>
              <Label>Default Route</Label>
              <Input value={form.defaultRoute} onChange={(e) => set("defaultRoute", e.target.value)} placeholder="e.g. Oral" className="h-8 text-sm" />
            </div>
            <div>
              <Label>Default Duration</Label>
              <Input value={form.defaultDuration} onChange={(e) => set("defaultDuration", e.target.value)} placeholder="e.g. 5 days" className="h-8 text-sm" />
            </div>
          </div>

          {/* Formulary + storage + status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Formulary Status</Label>
              <Select value={form.formularyStatus} onValueChange={(v) => set("formularyStatus", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="formulary">Formulary</SelectItem>
                  <SelectItem value="non_formulary">Non-formulary</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                  <SelectItem value="not_available">Not Available</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Storage</Label>
              <Select value={form.storageConditions || "none"} onValueChange={(v) => set("storageConditions", v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="room_temp">Room temp</SelectItem>
                  <SelectItem value="refrigerate">Refrigerate</SelectItem>
                  <SelectItem value="freeze">Freeze</SelectItem>
                  <SelectItem value="cold_chain">Cold chain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="discontinued">Discontinued</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                  <SelectItem value="temporarily_unavailable">Temporarily Unavailable</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Clinical notes, indications, contraindications…" className="text-sm" />
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? "Saving…" : isEdit ? "Update Medication" : "Create Medication"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// MEDICATION DETAIL DIALOG
// =====================================================================
function MedicationDetailDialog({ medId, onClose, onEdit }: { medId: string; onClose: () => void; onEdit: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["medication-detail", medId],
    queryFn: () => fetchJson(`/api/medications/${medId}`),
  });

  if (isLoading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl"><LoadingState rows={3} /></DialogContent>
      </Dialog>
    );
  }

  const m = data?.item;
  if (!m) return null;
  const inventoryItems = data?.inventoryItems || [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="text-white flex items-center gap-2 flex-wrap">
            <Pill className="w-5 h-5 text-indigo-600" />
            <span>{m.genericName}</span>
            {m.brandName && <span className="text-sm text-slate-500">({m.brandName})</span>}
            <StatusBadge status={m.status} />
            {m.isHighAlert && <Badge variant="destructive" className="text-[9px]">High Alert</Badge>}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {m.strength} {m.dosageForm} · {m.route} · {m.medicationCategory?.replace(/_/g, " ") || "Uncategorized"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Details grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {m.therapeuticClass && <div><div className="text-[10px] text-slate-400 uppercase">Therapeutic Class</div><div className="font-medium">{m.therapeuticClass}</div></div>}
            {m.atcCode && <div><div className="text-[10px] text-slate-400 uppercase">ATC Code</div><div className="font-mono">{m.atcCode}</div></div>}
            {m.barcode && <div><div className="text-[10px] text-slate-400 uppercase">Barcode</div><div className="font-mono">{m.barcode}</div></div>}
            {m.productCode && <div><div className="text-[10px] text-slate-400 uppercase">Product Code</div><div className="font-mono">{m.productCode}</div></div>}
            {m.nhisCode && (
              <>
                <div><div className="text-[10px] text-slate-400 uppercase">NHIS Code</div><div className="font-mono">{m.nhisCode}</div></div>
                {m.nhisTariffAmount != null && <div><div className="text-[10px] text-slate-400 uppercase">NHIS Tariff</div><div className="font-medium text-emerald-700">GH¢ {m.nhisTariffAmount.toFixed(2)}</div></div>}
                {m.nhisPrescribingLevel && <div><div className="text-[10px] text-slate-400 uppercase">NHIS Level</div><Badge variant="outline" className="text-[9px]">{m.nhisPrescribingLevel}</Badge></div>}
                {m.nhisUnitOfPricing && <div><div className="text-[10px] text-slate-400 uppercase">NHIS Unit</div><div>{m.nhisUnitOfPricing}</div></div>}
              </>
            )}
            {m.manufacturer && <div><div className="text-[10px] text-slate-400 uppercase">Manufacturer</div><div>{m.manufacturer}</div></div>}
            {m.prescriptionStatus && <div><div className="text-[10px] text-slate-400 uppercase">Rx Status</div><div className="capitalize">{m.prescriptionStatus.replace(/_/g, " ")}</div></div>}
            {m.controlledStatus && m.controlledStatus !== "none" && <div><div className="text-[10px] text-slate-400 uppercase">Controlled</div><div className="capitalize text-orange-700 font-medium">{m.controlledStatus.replace(/_/g, " ")}</div></div>}
            {m.pregnancyCategory && <div><div className="text-[10px] text-slate-400 uppercase">Pregnancy Cat.</div><div>{m.pregnancyCategory}</div></div>}
            {m.lactationSafety && <div><div className="text-[10px] text-slate-400 uppercase">Lactation</div><div className="capitalize">{m.lactationSafety.replace(/_/g, " ")}</div></div>}
            {m.formularyStatus && <div><div className="text-[10px] text-slate-400 uppercase">Formulary</div><div className="capitalize">{m.formularyStatus.replace(/_/g, " ")}</div></div>}
            {m.storageConditions && <div><div className="text-[10px] text-slate-400 uppercase">Storage</div><div className="capitalize">{m.storageConditions.replace(/_/g, " ")}</div></div>}
          </div>

          {/* Defaults */}
          {(m.defaultDose || m.defaultFrequency || m.defaultRoute || m.defaultDuration) && (
            <Card>
              <CardContent className="p-3">
                <div className="text-[10px] text-slate-400 uppercase mb-2">Prescribing Defaults</div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {m.defaultDose && <div><span className="text-slate-400">Dose:</span> {m.defaultDose}</div>}
                  {m.defaultFrequency && <div><span className="text-slate-400">Freq:</span> {m.defaultFrequency}</div>}
                  {m.defaultRoute && <div><span className="text-slate-400">Route:</span> {m.defaultRoute}</div>}
                  {m.defaultDuration && <div><span className="text-slate-400">Duration:</span> {m.defaultDuration}</div>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Usage summary */}
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-slate-400 uppercase mb-2">Usage Summary</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-2xl font-extrabold text-indigo-600">{m._count?.prescriptionItems ?? 0}</div>
                  <div className="text-[10px] text-slate-500">Prescriptions</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-emerald-600">{m._count?.inventoryItems ?? 0}</div>
                  <div className="text-[10px] text-slate-500">Inventory Items</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-purple-600">{m._count?.administrations ?? 0}</div>
                  <div className="text-[10px] text-slate-500">Administrations</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inventory items */}
          {inventoryItems.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <div className="text-[10px] text-slate-400 uppercase mb-2">Linked Inventory</div>
                <div className="space-y-1 text-xs">
                  {inventoryItems.slice(0, 5).map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between">
                      <span className="text-slate-700">{inv.name} ({inv.sku})</span>
                      <div className="flex items-center gap-2">
                        {inv.facilityInventory?.map((fi: any) => (
                          <Badge key={fi.facilityId} variant="outline" className="text-[9px]">
                            {fi.currentQuantity} / {fi.minimumQuantity || "—"} units
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {m.description && (
            <Card>
              <CardContent className="p-3">
                <div className="text-[10px] text-slate-400 uppercase mb-1">Description</div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap">{m.description}</div>
              </CardContent>
            </Card>
          )}

          {m.createdBy && (
            <div className="text-[10px] text-slate-400">
              Created by {m.createdBy.firstName} {m.createdBy.lastName} · {formatDate(m.createdAt)}
              {m.updatedBy && ` · Updated by ${m.updatedBy.firstName} ${m.updatedBy.lastName} · ${formatDate(m.updatedAt)}`}
            </div>
          )}
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={onEdit} className="bg-indigo-600 hover:bg-indigo-700 gap-1.5">
            <FileText className="w-4 h-4" /> Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

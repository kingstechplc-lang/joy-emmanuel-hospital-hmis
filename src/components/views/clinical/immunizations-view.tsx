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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus, Syringe, RefreshCw, Loader2, Activity, Clock, AlertTriangle,
  Search, X, Filter, Calendar, AlertOctagon, PackageX, Trash2,
  Beaker, ThermometerSun, FileText, TrendingUp, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge,
  formatDate, calculateAge, safeJson, PageHeader, MiniStatCard,
} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

// =====================================================================
// MAIN VIEW
// =====================================================================
export function ImmunizationsView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Immunizations"
        description="Vaccination management — schedule engine, batch tracking, AEFI, wastage, and cold chain."
        icon={Syringe}
        gradient="from-teal-500 to-cyan-600"
      />

      {!activeFacilityId && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
            Select a facility to manage immunizations.
          </CardContent>
        </Card>
      )}

      {activeFacilityId && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-1.5">
              <Activity className="w-4 h-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="records" className="gap-1.5">
              <Syringe className="w-4 h-4" /> Records
            </TabsTrigger>
            <TabsTrigger value="due" className="gap-1.5">
              <Clock className="w-4 h-4" /> Due List
            </TabsTrigger>
            <TabsTrigger value="aefi" className="gap-1.5">
              <AlertOctagon className="w-4 h-4" /> AEFI
            </TabsTrigger>
            <TabsTrigger value="catalog" className="gap-1.5">
              <Beaker className="w-4 h-4" /> Catalog
            </TabsTrigger>
            <TabsTrigger value="wastage" className="gap-1.5">
              <Trash2 className="w-4 h-4" /> Wastage
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <DashboardTab facilityId={activeFacilityId} />
          </TabsContent>
          <TabsContent value="records" className="space-y-4">
            <RecordsTab facilityId={activeFacilityId} />
          </TabsContent>
          <TabsContent value="due" className="space-y-4">
            <DueListTab facilityId={activeFacilityId} />
          </TabsContent>
          <TabsContent value="aefi" className="space-y-4">
            <AEFITab facilityId={activeFacilityId} />
          </TabsContent>
          <TabsContent value="catalog" className="space-y-4">
            <CatalogTab facilityId={activeFacilityId} />
          </TabsContent>
          <TabsContent value="wastage" className="space-y-4">
            <WastageTab facilityId={activeFacilityId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab({ facilityId }: { facilityId: string }) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["immunization-stats", facilityId],
    queryFn: () => fetchJson(`/api/immunizations/stats?facilityId=${facilityId}`),
    refetchInterval: 30000,
  });

  const kpis = data?.kpis || {};

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Activity className="w-4 h-4 text-teal-600" />
          Immunization KPIs
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
            {isFetching ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-teal-600" />
                <span className="text-teal-700 font-medium">Refreshing…</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3 text-slate-400" />
                <span>Auto-refresh every 30s</span>
              </>
            )}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              toast.promise(refetch(), {
                loading: "Refreshing…",
                success: "Data refreshed",
                error: "Refresh failed",
              });
            }}
            disabled={isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MiniStatCard
          label="Total"
          value={kpis.total ?? 0}
          icon={Syringe}
          gradient="from-teal-500 to-cyan-600"
          sublabel="All records"
        />
        <MiniStatCard
          label="Today"
          value={kpis.today ?? 0}
          icon={Calendar}
          gradient="from-emerald-500 to-teal-600"
          sublabel="Administered today"
        />
        <MiniStatCard
          label="This Week"
          value={kpis.thisWeek ?? 0}
          icon={TrendingUp}
          gradient="from-blue-500 to-cyan-600"
          sublabel="Last 7 days"
        />
        <MiniStatCard
          label="Overdue"
          value={kpis.overdue ?? 0}
          icon={AlertTriangle}
          gradient="from-rose-500 to-orange-600"
          sublabel="Past due date"
        />
        <MiniStatCard
          label="AEFI Open"
          value={kpis.aefiOpen ?? 0}
          icon={AlertOctagon}
          gradient="from-purple-500 to-rose-600"
          sublabel="Adverse events"
        />
      </div>

      {/* Stock alerts */}
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-2">
        <PackageX className="w-4 h-4 text-amber-600" />
        Stock &amp; Batch Alerts
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <PackageX className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-amber-700">{kpis.lowStock ?? 0}</div>
              <div className="text-xs text-amber-700">Low-stock vaccine items</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-rose-700" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-rose-700">{kpis.expiredStock ?? 0}</div>
              <div className="text-xs text-rose-700">Expired vaccine batches</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top vaccines chart */}
      {data?.byVaccine && data.byVaccine.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-2">
            <TrendingUp className="w-4 h-4 text-teal-600" />
            Top Vaccines Administered (All Time)
          </h3>
          <Card>
            <CardContent className="p-4 space-y-2">
              {data.byVaccine.map((v: any) => {
                const maxCount = data.byVaccine[0]._count || data.byVaccine[0].count || 1;
                const count = v._count || v.count || 0;
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={v.vaccineName || v.name} className="flex items-center gap-2">
                    <div className="w-40 text-xs text-slate-600 truncate">{v.vaccineName || v.name}</div>
                    <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-md flex items-center justify-end pr-2"
                        style={{ width: `${pct}%` }}
                      >
                        <span className="text-[10px] font-bold text-white">{count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

// =====================================================================
// RECORDS TAB — list + administer
// =====================================================================
function RecordsTab({ facilityId }: { facilityId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  params.set("facilityId", facilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (search.trim()) params.set("search", search.trim());
  params.set("limit", "200");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["immunizations", facilityId, statusFilter, search],
    queryFn: () => fetchJson(`/api/immunizations?${params.toString()}`),
  });

  const items = data?.items || [];

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
                placeholder="Search by patient, vaccine, or batch…"
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[150px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="missed">Missed</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
                <SelectItem value="deferred">Deferred</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-teal-600 hover:bg-teal-700"
              onClick={() => setShowNew(true)}
            >
              <Plus className="w-4 h-4" /> Record Immunization
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No immunization records"
              description="Record a vaccination to get started."
              icon={Syringe}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr className="text-left text-slate-600">
                    <th className="px-3 py-2 font-semibold">Patient</th>
                    <th className="px-3 py-2 font-semibold">Vaccine</th>
                    <th className="px-3 py-2 font-semibold">Dose</th>
                    <th className="px-3 py-2 font-semibold">Batch #</th>
                    <th className="px-3 py-2 font-semibold">Administered</th>
                    <th className="px-3 py-2 font-semibold">Next Due</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">AEFI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((r: any) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">
                          {r.patient?.firstName} {r.patient?.lastName}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {r.patient?.patientNumber} · {calculateAge(r.patient?.dateOfBirth)}y
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{r.vaccineName}</td>
                      <td className="px-3 py-2 text-slate-600">{r.dose || "—"}</td>
                      <td className="px-3 py-2 font-mono text-slate-600">{r.batchNumber || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(r.administeredAt, true)}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.nextDueAt ? (
                          <span className={new Date(r.nextDueAt) < new Date() ? "text-rose-600 font-medium" : ""}>
                            {formatDate(r.nextDueAt)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2">
                        {r._count?.aefiRecords > 0 ? (
                          <Badge variant="destructive" className="text-[9px]">
                            {r._count.aefiRecords} AEFI
                          </Badge>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showNew && (
        <AdministerImmunizationDialog
          facilityId={facilityId}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            qc.invalidateQueries({ queryKey: ["immunizations"] });
            qc.invalidateQueries({ queryKey: ["immunization-stats"] });
          }}
        />
      )}
    </>
  );
}

// =====================================================================
// ADMINISTER IMMUNIZATION DIALOG
// =====================================================================
function AdministerImmunizationDialog({
  facilityId,
  onClose,
  onCreated,
}: {
  facilityId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [vaccineCatalogId, setVaccineCatalogId] = useState("");
  const [vaccineName, setVaccineName] = useState("");
  const [dose, setDose] = useState("");
  const [doseNumber, setDoseNumber] = useState("");
  const [batchId, setBatchId] = useState("");
  const [route, setRoute] = useState("");
  const [site, setSite] = useState("");
  const [administeredAt, setAdministeredAt] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [consentStatus, setConsentStatus] = useState("not_required");
  const [guardianName, setGuardianName] = useState("");
  const [indication, setIndication] = useState("routine");
  const [createAppointment, setCreateAppointment] = useState(true);
  const [createInvoice, setCreateInvoice] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load vaccine catalog
  const { data: catalogData } = useQuery({
    queryKey: ["vaccine-catalog"],
    queryFn: () => fetchJson("/api/vaccine-catalog"),
  });

  // Load patient search results
  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  // Load available batches when a vaccine is selected
  const selectedVaccine = catalogData?.items?.find((v: any) => v.id === vaccineCatalogId);
  const { data: batchesData } = useQuery({
    queryKey: ["vaccine-batches", facilityId, selectedVaccine?.inventoryItemId],
    queryFn: () =>
      fetchJson(
        `/api/inventory?facilityId=${facilityId}&type=vaccine${
          selectedVaccine?.inventoryItemId ? `&itemId=${selectedVaccine.inventoryItemId}` : ""
        }`
      ),
    enabled: !!selectedVaccine?.inventoryItemId,
  });

  // Compute available batches (non-expired, in-stock)
  const availableBatches = (() => {
    if (!batchesData?.items) return [];
    const now = new Date();
    const batches: any[] = [];
    for (const item of batchesData.items) {
      if (item.batches) {
        for (const b of item.batches) {
          if (b.quantity > 0 && (!b.expiryDate || new Date(b.expiryDate) >= now)) {
            batches.push({ ...b, itemName: item.name, inventoryItemId: item.id });
          }
        }
      }
    }
    return batches.sort((a, b) => {
      const aExp = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
      const bExp = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
      return aExp - bExp; // FEFO — earliest expiry first
    });
  })();

  const submit = async () => {
    if (!patientId || !vaccineName || !facilityId) {
      toast.error("Patient, vaccine, and facility are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/immunizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          vaccineCatalogId: vaccineCatalogId || undefined,
          vaccineName,
          dose: dose || undefined,
          doseNumber: doseNumber ? parseInt(doseNumber) : undefined,
          batchId: batchId || undefined,
          route: route || undefined,
          site: site || undefined,
          administeredAt,
          facilityId,
          indication,
          consentStatus,
          guardianName: guardianName || undefined,
          notes: notes || undefined,
          deductStock: !!batchId,
          createAppointment,
          createInvoice,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed");
      }
      // Build a richer success message if appointment/invoice were created
      const extras: string[] = [];
      if (data.appointmentId) extras.push("appointment booked");
      if (data.invoiceId) extras.push("invoice item created");
      toast.success(
        extras.length > 0
          ? `Immunization recorded — ${extras.join(" + ")}`
          : "Immunization recorded"
      );
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <Syringe className="w-5 h-5 text-teal-600" />
            Record Immunization
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Administer a vaccine. Select a batch to auto-deduct stock and enforce FEFO + expiry checks.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {/* Patient search */}
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <Input
              placeholder="Search patient by name or MRN..."
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
            />
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPatientId(p.id);
                      setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
                    }}
                    className="w-full text-left p-2 hover:bg-teal-50 text-sm border-b last:border-0"
                  >
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">
                      {p.patientNumber} · {calculateAge(p.dateOfBirth)}y · {p.sex?.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Vaccine selection from catalog */}
          <div>
            <FieldLabel required>Vaccine</FieldLabel>
            <Select
              value={vaccineCatalogId || "custom"}
              onValueChange={(v) => {
                if (v === "custom") {
                  setVaccineCatalogId("");
                  setVaccineName("");
                  setRoute("");
                  setSite("");
                } else {
                  const vaccine = catalogData?.items?.find((vc: any) => vc.id === v);
                  setVaccineCatalogId(v);
                  setVaccineName(vaccine?.name || "");
                  setRoute(vaccine?.defaultRoute || "");
                  setSite(vaccine?.defaultSite || "");
                  // Default dose number to the next due dose if catalog has schedule
                  if (vaccine?.scheduleDoses?.length > 0) {
                    setDoseNumber(String(vaccine.scheduleDoses[0].doseNumber));
                    setDose(vaccine.scheduleDoses[0].doseLabel);
                  }
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select vaccine" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">— Custom / Other —</SelectItem>
                {catalogData?.items?.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.code} — {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* If custom vaccine, show free-text name input */}
          {!vaccineCatalogId && (
            <div>
              <FieldLabel required>Vaccine Name (custom)</FieldLabel>
              <Input
                value={vaccineName}
                onChange={(e) => setVaccineName(e.target.value)}
                placeholder="e.g. COVID-19 Booster"
              />
            </div>
          )}

          {/* Dose + batch + route + site */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Dose Label</Label>
              <Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="e.g. 1st dose" />
            </div>
            <div>
              <Label>Dose Number</Label>
              <Input
                type="number"
                min={1}
                value={doseNumber}
                onChange={(e) => setDoseNumber(e.target.value)}
                placeholder="1, 2, 3..."
              />
            </div>
            <div className="col-span-2">
              <Label>Batch / Lot (FEFO sorted)</Label>
              <Select value={batchId || "none"} onValueChange={(v) => setBatchId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select batch (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No batch (historical/external) —</SelectItem>
                  {availableBatches.map((b: any) => {
                    const exp = b.expiryDate ? new Date(b.expiryDate) : null;
                    const nearExpiry = exp && (exp.getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000;
                    return (
                      <SelectItem key={b.id} value={b.id}>
                        {b.batchNumber} · {b.quantity}u
                        {exp ? ` · exp ${formatDate(b.expiryDate)}` : ""}
                        {nearExpiry ? " · ⚠ near-expiry" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {availableBatches.length === 0 && selectedVaccine?.inventoryItemId && (
                <p className="text-[10px] text-rose-600 mt-1">No in-stock batches available for this vaccine.</p>
              )}
            </div>
            <div>
              <Label>Route</Label>
              <Select value={route || "none"} onValueChange={(v) => setRoute(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="IM">Intramuscular</SelectItem>
                  <SelectItem value="SC">Subcutaneous</SelectItem>
                  <SelectItem value="Oral">Oral</SelectItem>
                  <SelectItem value="Intradermal">Intradermal</SelectItem>
                  <SelectItem value="Nasal">Nasal</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Site</Label>
              <Select value={site || "none"} onValueChange={(v) => setSite(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="Left deltoid">Left deltoid</SelectItem>
                  <SelectItem value="Right deltoid">Right deltoid</SelectItem>
                  <SelectItem value="Left thigh">Left thigh</SelectItem>
                  <SelectItem value="Right thigh">Right thigh</SelectItem>
                  <SelectItem value="Oral">Oral</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date / Time Administered</Label>
              <Input
                type="datetime-local"
                value={administeredAt}
                onChange={(e) => setAdministeredAt(e.target.value)}
              />
            </div>
            <div>
              <Label>Indication</Label>
              <Select value={indication} onValueChange={setIndication}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="catch_up">Catch-up</SelectItem>
                  <SelectItem value="campaign">Campaign</SelectItem>
                  <SelectItem value="occupational">Occupational</SelectItem>
                  <SelectItem value="travel">Travel</SelectItem>
                  <SelectItem value="maternal">Maternal</SelectItem>
                  <SelectItem value="clinical_indication">Clinical indication</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Consent</Label>
              <Select value={consentStatus} onValueChange={setConsentStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_required">Not required</SelectItem>
                  <SelectItem value="obtained">Obtained</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {consentStatus === "obtained" && (
              <div>
                <Label>Guardian Name (if minor)</Label>
                <Input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="Parent/guardian" />
              </div>
            )}
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Adverse reactions, observations…" />
          </div>

          {/* Post-administration actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createAppointment}
                onChange={(e) => setCreateAppointment(e.target.checked)}
                className="w-4 h-4"
              />
              <div>
                <div className="text-sm font-medium text-slate-700">Book next-dose appointment</div>
                <div className="text-[10px] text-slate-500">
                  Auto-creates a follow-up appointment on the next due date
                </div>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createInvoice}
                onChange={(e) => setCreateInvoice(e.target.checked)}
                className="w-4 h-4"
              />
              <div>
                <div className="text-sm font-medium text-slate-700">
                  Bill to invoice
                  {!selectedVaccine?.serviceId && (
                    <span className="ml-1 text-[10px] text-amber-600">
                      (no service linked — will be skipped)
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500">
                  Creates an invoice item using the vaccine's linked service price
                </div>
              </div>
            </label>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-teal-600 hover:bg-teal-700">
            {saving ? "Recording…" : "Record Immunization"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// DUE LIST TAB
// =====================================================================
function DueListTab({ facilityId }: { facilityId: string }) {
  const [filter, setFilter] = useState("all");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["immunization-due", facilityId, filter],
    queryFn: () =>
      fetchJson(`/api/immunizations/due?facilityId=${facilityId}&filter=${filter}`),
  });

  const items = data?.items || [];

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700">Due &amp; Overdue Vaccinations</p>
            <p className="text-xs text-slate-500">
              Computed from the patient schedule engine — patients under 18 with due or overdue doses.
            </p>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="due_now">Due now</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No due vaccinations"
              description="All patients under 18 are up to date with their immunization schedule."
              icon={CheckCircle2}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr className="text-left text-slate-600">
                    <th className="px-3 py-2 font-semibold">Patient</th>
                    <th className="px-3 py-2 font-semibold">Vaccine</th>
                    <th className="px-3 py-2 font-semibold">Dose</th>
                    <th className="px-3 py-2 font-semibold">Due Date</th>
                    <th className="px-3 py-2 font-semibold">Days</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((entry: any, i: number) => (
                    <tr key={`${entry.patient.id}-${entry.vaccineCatalogId}-${entry.doseNumber}-${i}`} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">
                          {entry.patient.firstName} {entry.patient.lastName}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {entry.patient.patientNumber} · {calculateAge(entry.patient.dateOfBirth)}y
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{entry.vaccineName}</td>
                      <td className="px-3 py-2 text-slate-600">{entry.doseLabel}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(entry.dueDate)}</td>
                      <td className="px-3 py-2">
                        <span className={entry.daysUntilDue < 0 ? "text-rose-600 font-medium" : "text-slate-600"}>
                          {entry.daysUntilDue < 0
                            ? `${Math.abs(entry.daysUntilDue)}d overdue`
                            : entry.daysUntilDue === 0
                            ? "Due today"
                            : `in ${entry.daysUntilDue}d`}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={
                            entry.status === "overdue"
                              ? "bg-rose-100 text-rose-700 border-rose-200 text-[10px]"
                              : "bg-amber-100 text-amber-700 border-amber-200 text-[10px]"
                          }
                        >
                          {entry.status === "overdue" ? "Overdue" : "Due now"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// Need CheckCircle2 import — add it
import { CheckCircle2 } from "lucide-react";

// =====================================================================
// AEFI TAB — list adverse events
// =====================================================================
function AEFITab({ facilityId }: { facilityId: string }) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["aefi-list", facilityId],
    queryFn: () => fetchJson(`/api/immunizations?facilityId=${facilityId}&limit=500`),
  });

  // Filter to immunizations that have AEFI records
  const aefiItems = (data?.items || []).filter((r: any) => r._count?.aefiRecords > 0);

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3 flex items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700">Adverse Events Following Immunization (AEFI)</p>
            <p className="text-xs text-slate-500">Immunizations with reported adverse events. Click a record to view/report AEFI details.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={3} />
      ) : aefiItems.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No AEFI reports"
              description="No adverse events have been recorded for immunizations at this facility."
              icon={AlertOctagon}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {aefiItems.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm text-slate-800">
                      {r.patient?.firstName} {r.patient?.lastName} — {r.vaccineName}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Administered {formatDate(r.administeredAt, true)} · Batch {r.batchNumber || "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.aefiRecords?.map((a: any) => (
                      <Badge
                        key={a.id}
                        variant="outline"
                        className={
                          a.severity === "severe" || a.severity === "fatal"
                            ? "bg-rose-100 text-rose-700 border-rose-200"
                            : a.severity === "moderate"
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        }
                      >
                        {a.severity} · {a.status}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// =====================================================================
// CATALOG TAB — manage vaccine catalog
// =====================================================================
function CatalogTab({ facilityId }: { facilityId: string }) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["vaccine-catalog"],
    queryFn: () => fetchJson("/api/vaccine-catalog?includeInactive=true"),
  });

  const items = data?.items || [];

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3 flex items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700">Vaccine Catalog</p>
            <p className="text-xs text-slate-500">
              Configurable vaccine master list with EPI schedule rules. Run{" "}
              <code className="text-[10px] bg-slate-100 px-1 rounded">npx tsx scripts/seed-vaccine-catalog.ts &lt;orgId&gt;</code>{" "}
              to seed the standard WHO EPI antigens.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No vaccines in catalog"
              description="Run the seed script to populate the standard WHO EPI antigens, or create vaccines manually via the API."
              icon={Beaker}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((v: any) => (
            <Card key={v.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-teal-100 text-teal-700 border-teal-200 font-mono">{v.code}</Badge>
                      <span className="font-medium text-sm text-slate-800">{v.name}</span>
                      {!v.isActive && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {v.diseasePrevented || "—"} · {v.vaccineType || "—"} · {v.ageGroup || "—"}
                      {v.defaultRoute && ` · ${v.defaultRoute}`}
                      {v.defaultSite && ` · ${v.defaultSite}`}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>{v.totalDosesInSeries} dose{v.totalDosesInSeries === 1 ? "" : "s"} in series</div>
                    <div>{v.scheduleDoses?.length || 0} schedule rules</div>
                  </div>
                </div>
                {v.scheduleDoses && v.scheduleDoses.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-100">
                    {v.scheduleDoses.map((d: any) => (
                      <Badge key={d.id} variant="outline" className="text-[10px]">
                        Dose {d.doseNumber}: {d.doseLabel} (due day {d.ageAtDueDays})
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// =====================================================================
// WASTAGE TAB — record + list wastage
// =====================================================================
function WastageTab({ facilityId }: { facilityId: string }) {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["vaccine-wastage", facilityId],
    queryFn: () => fetchJson(`/api/vaccine-wastage?facilityId=${facilityId}`),
  });

  const items = data?.items || [];

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3 flex items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700">Vaccine Wastage</p>
            <p className="text-xs text-slate-500">Track wasted doses and deduct from inventory with an auditable transaction.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5 bg-rose-600 hover:bg-rose-700" onClick={() => setShowNew(true)}>
            <Trash2 className="w-4 h-4" /> Record Wastage
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={3} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="No wastage records" description="Record wasted vaccine doses here." icon={Trash2} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr className="text-left text-slate-600">
                    <th className="px-3 py-2 font-semibold">Vaccine</th>
                    <th className="px-3 py-2 font-semibold">Batch</th>
                    <th className="px-3 py-2 font-semibold text-right">Qty</th>
                    <th className="px-3 py-2 font-semibold">Reason</th>
                    <th className="px-3 py-2 font-semibold">Disposed By</th>
                    <th className="px-3 py-2 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((w: any) => (
                    <tr key={w.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700">{w.vaccineName}</td>
                      <td className="px-3 py-2 font-mono text-slate-600">{w.batchNumber || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-rose-600">{w.quantity}</td>
                      <td className="px-3 py-2 text-slate-600">{w.reason.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {w.disposedBy ? `${w.disposedBy.firstName} ${w.disposedBy.lastName}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(w.disposedAt, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showNew && (
        <WastageDialog
          facilityId={facilityId}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            qc.invalidateQueries({ queryKey: ["vaccine-wastage"] });
            qc.invalidateQueries({ queryKey: ["immunization-stats"] });
          }}
        />
      )}
    </>
  );
}

// =====================================================================
// WASTAGE DIALOG
// =====================================================================
function WastageDialog({
  facilityId,
  onClose,
  onCreated,
}: {
  facilityId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [vaccineName, setVaccineName] = useState("");
  const [batchId, setBatchId] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("broken_vial");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Load vaccine inventory items to find batches
  const { data: inventoryData } = useQuery({
    queryKey: ["vaccine-inventory", facilityId],
    queryFn: () => fetchJson(`/api/inventory?facilityId=${facilityId}&type=vaccine`),
  });

  const availableBatches = (() => {
    if (!inventoryData?.items) return [];
    const batches: any[] = [];
    for (const item of inventoryData.items) {
      if (item.batches) {
        for (const b of item.batches) {
          if (b.quantity > 0) {
            batches.push({ ...b, itemName: item.name, inventoryItemId: item.id });
          }
        }
      }
    }
    return batches;
  })();

  const submit = async () => {
    if (!vaccineName || !quantity || !reason) {
      toast.error("Vaccine name, quantity, and reason are required");
      return;
    }
    setSaving(true);
    try {
      const selectedBatch = availableBatches.find((b) => b.id === batchId);
      const res = await fetch("/api/vaccine-wastage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaccineName,
          batchId: batchId || undefined,
          batchNumber: batchId ? selectedBatch?.batchNumber : batchNumber || undefined,
          inventoryItemId: selectedBatch?.inventoryItemId || undefined,
          quantity: parseInt(quantity),
          reason,
          notes: notes || undefined,
          facilityId,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Wastage recorded — inventory deducted");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-rose-600" />
            Record Vaccine Wastage
          </DialogTitle>
          <DialogDescription className="text-white/80">
            This will deduct the wasted quantity from the selected batch and create an auditable inventory transaction.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Select Batch (or enter manually)</FieldLabel>
            <Select
              value={batchId || "manual"}
              onValueChange={(v) => {
                if (v === "manual") {
                  setBatchId("");
                  setVaccineName("");
                } else {
                  const b = availableBatches.find((x) => x.id === v);
                  setBatchId(v);
                  setVaccineName(b?.itemName || "");
                  setBatchNumber(b?.batchNumber || "");
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">— Manual entry —</SelectItem>
                {availableBatches.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.itemName} · {b.batchNumber} · {b.quantity}u
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!batchId && (
            <>
              <div>
                <FieldLabel required>Vaccine Name</FieldLabel>
                <Input value={vaccineName} onChange={(e) => setVaccineName(e.target.value)} placeholder="e.g. BCG Vaccine" />
              </div>
              <div>
                <Label>Batch Number</Label>
                <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="Lot #" />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Quantity Wasted</FieldLabel>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <FieldLabel required>Reason</FieldLabel>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="broken_vial">Broken vial</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="cold_chain_issue">Cold-chain issue</SelectItem>
                  <SelectItem value="open_vial_wastage">Open-vial wastage</SelectItem>
                  <SelectItem value="spillage">Spillage</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional details…" />
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
            {saving ? "Recording…" : "Record Wastage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

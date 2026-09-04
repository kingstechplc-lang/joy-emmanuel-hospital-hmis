"use client";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, FlaskConical, Search, TestTube, Microscope, CheckCircle2, Send, X, Beaker, AlertTriangle, Gauge, RefreshCw, Clock, XCircle, CalendarDays, Timer } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, safeJson, PageHeader, ClearableSearch, MiniStatCard} from "@/components/ui-helpers"

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "ordered", label: "Ordered" },
  { value: "collected", label: "Collected" },
  { value: "received", label: "Received" },
  { value: "processing", label: "Processing" },
  { value: "resulted", label: "Resulted" },
  { value: "verified", label: "Verified" },
  { value: "released", label: "Released" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "stat", label: "STAT" },
];

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
];

function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function LabOrdersView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [actionOrder, setActionOrder] = useState<any | null>(null);

  // KPI range state
  const [kpiRange, setKpiRange] = useState("today");
  const [kpiCustomStart, setKpiCustomStart] = useState("");
  const [kpiCustomEnd, setKpiCustomEnd] = useState("");

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (priorityFilter !== "all") params.set("priority", priorityFilter);
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["lab-orders", activeFacilityId, statusFilter, priorityFilter, search],
    queryFn: () => fetchJson(`/api/lab-orders${qs}`),
    enabled: !!activeFacilityId,
  });

  // KPI query (server-side aggregate)
  const kpiQuery = useQuery({
    queryKey: ["lab-orders-stats", activeFacilityId, kpiRange, kpiCustomStart, kpiCustomEnd],
    queryFn: () => {
      const p = new URLSearchParams();
      if (activeFacilityId) p.set("facilityId", activeFacilityId);
      p.set("range", kpiRange);
      p.set("compare", "true");
      if (kpiRange === "custom" && kpiCustomStart && kpiCustomEnd) {
        p.set("startDate", kpiCustomStart);
        p.set("endDate", kpiCustomEnd);
      }
      return fetchJson(`/api/lab-orders/stats?${p.toString()}`);
    },
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lab-orders"] });
    qc.invalidateQueries({ queryKey: ["lab-orders-stats"] });
  };

  const k = kpiQuery.data?.kpis;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laboratory Orders"
        description="Manage lab test orders and track sample collection"
        icon={FlaskConical}
        gradient="from-purple-500 to-purple-600"
        actions={
          <Button onClick={() => setShowNew(true)} disabled={!can("lab.order")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Lab Order
        </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view lab orders.</CardContent></Card>
      )}

      {/* KPI / Statistics Dashboard */}
      {activeFacilityId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-purple-600" /> Lab Order Statistics
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Live KPIs from the database. Comparison % shown against the prior comparable period.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-slate-500">Range:</Label>
                <Select value={kpiRange} onValueChange={setKpiRange}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RANGE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {kpiRange === "custom" && (
                  <div className="flex items-center gap-1">
                    <Input type="date" value={kpiCustomStart} onChange={(e) => setKpiCustomStart(e.target.value)} className="h-8 w-36 text-xs" />
                    <span className="text-xs text-slate-400">to</span>
                    <Input type="date" value={kpiCustomEnd} onChange={(e) => setKpiCustomEnd(e.target.value)} className="h-8 w-36 text-xs" />
                  </div>
                )}
                <Button variant="ghost" size="sm" disabled={kpiQuery.isFetching} onClick={() => kpiQuery.refetch()} className="h-8 px-2" title="Refresh KPIs">
                  <RefreshCw className={`w-3.5 h-3.5 ${kpiQuery.isFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {kpiQuery.isError ? (
              <ErrorState message="Failed to load KPIs" onRetry={() => kpiQuery.refetch()} />
            ) : kpiQuery.isLoading || !k ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" aria-hidden="true" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MiniStatCard label="Total Orders" value={k.totalOrders?.value ?? 0} icon={FlaskConical} gradient="from-purple-500 to-purple-600" sublabel={k.totalOrders?.deltaPct !== null && k.totalOrders?.deltaPct !== undefined ? `${k.totalOrders.deltaPct > 0 ? "+" : ""}${k.totalOrders.deltaPct.toFixed(1)}% vs prev` : undefined} />
                <MiniStatCard label="Today's Orders" value={k.todayOrders?.value ?? 0} icon={CalendarDays} gradient="from-cyan-500 to-cyan-600" />
                <MiniStatCard label="Pending Collection" value={k.pendingCollection?.value ?? 0} icon={Beaker} gradient="from-amber-500 to-amber-600" />
                <MiniStatCard label="Processing" value={k.processing?.value ?? 0} icon={Microscope} gradient="from-blue-500 to-blue-600" />
                <MiniStatCard label="Verification Pending" value={k.verificationPending?.value ?? 0} icon={Clock} gradient="from-orange-500 to-orange-600" />
                <MiniStatCard label="Critical Results" value={k.criticalResults?.value ?? 0} icon={AlertTriangle} gradient="from-red-500 to-rose-600" />
                <MiniStatCard label="Completed" value={k.completed?.value ?? 0} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" sublabel={k.completed?.deltaPct !== null && k.completed?.deltaPct !== undefined ? `${k.completed.deltaPct > 0 ? "+" : ""}${k.completed.deltaPct.toFixed(1)}% vs prev` : undefined} />
                <MiniStatCard label="Cancelled" value={k.cancelled?.value ?? 0} icon={XCircle} gradient="from-slate-500 to-slate-600" />
                <MiniStatCard label="Avg TAT" value={formatMinutes(k.avgTatMinutes?.value)} icon={Timer} gradient="from-teal-500 to-cyan-600" sublabel={k.avgTatMinutes?.sampleSize && k.avgTatMinutes.sampleSize > 0 ? `n=${k.avgTatMinutes.sampleSize}` : undefined} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search + Filter controls */}
      {activeFacilityId && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Search Lab Orders</Label>
              <ClearableSearch
                value={search}
                onChange={setSearch}
                placeholder="Search by order number, patient name, or MRN…"
                inputClassName="text-sm"
                className="max-w-3xl"
              />
              <p className="text-[10px] text-slate-500 mt-1">Server-side search across lab order number and patient fields.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
                <SelectTrigger className="md:w-48 h-8 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={priorityFilter || undefined} onValueChange={setPriorityFilter}>
                <SelectTrigger className="md:w-44 h-8 text-xs"><SelectValue placeholder="All Priorities" /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {(statusFilter !== "all" || priorityFilter !== "all" || search) && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setStatusFilter("all"); setPriorityFilter("all"); setSearch(""); }}>
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load lab orders" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No lab orders"
              description="Create a new lab order to begin the lab workflow."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("lab.order")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Lab Order</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Order #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Tests</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Priority</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Ordered</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((o: any) => (
                    <tr key={o.id} className="border-b hover:bg-emerald-50/40">
                      <td className="p-3 font-mono text-xs text-slate-700">{o.orderNumber}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{o.patient?.firstName} {o.patient?.lastName}</div>
                        <div className="text-xs text-slate-500">{o.patient?.patientNumber}</div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(o.items || []).slice(0, 3).map((it: any) => (
                            <span key={it.id} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                              {it.laboratoryTest?.name}
                            </span>
                          ))}
                          {(o.items || []).length > 3 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-medium">
                              +{o.items.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {o.priority === "stat" ? (
                          <Badge variant="destructive" className="text-[10px]">STAT</Badge>
                        ) : o.priority === "urgent" ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">URGENT</Badge>
                        ) : (
                          <span className="text-xs text-slate-500 capitalize">{o.priority}</span>
                        )}
                      </td>
                      <td className="p-3"><StatusBadge status={o.status} /></td>
                      <td className="p-3 text-xs text-slate-600">{formatDate(o.orderedAt, true)}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end items-center">
                          {o.status === "ordered" && can("lab.collect") && (
                            <Button size="sm" variant="outline" onClick={() => setActionOrder(o)} className="gap-1 h-7 text-xs">
                              <TestTube className="w-3 h-3" /> Collect
                            </Button>
                          )}
                          {o.status === "collected" && can("lab.collect") && (
                            <Button size="sm" variant="outline" onClick={() => setActionOrder(o)} className="gap-1 h-7 text-xs">
                              <Beaker className="w-3 h-3" /> Receive
                            </Button>
                          )}
                          {o.status === "received" && can("lab.process") && (
                            <Button size="sm" variant="outline" onClick={() => doAction(o.id, "process", "Processing started", invalidate)} className="gap-1 h-7 text-xs">
                              <Microscope className="w-3 h-3" /> Process
                            </Button>
                          )}
                          {o.status === "processing" && can("lab.result") && (
                            <Button size="sm" onClick={() => setActionOrder(o)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <FlaskConical className="w-3 h-3" /> Enter Result
                            </Button>
                          )}
                          {o.status === "resulted" && can("lab.verify") && (
                            <Button size="sm" onClick={() => setActionOrder(o)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <CheckCircle2 className="w-3 h-3" /> Verify
                            </Button>
                          )}
                          {o.status === "verified" && can("lab.verify") && (
                            <Button size="sm" onClick={() => doAction(o.id, "release", "Results released", invalidate)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <Send className="w-3 h-3" /> Release
                            </Button>
                          )}
                          {o.status === "ordered" && can("lab.order") && (
                            <Button size="sm" variant="ghost" onClick={() => doAction(o.id, "cancel", "Order cancelled", invalidate)} className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700" title="Cancel order">
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                          {/* Always show a "View" button so the action column is never empty,
                              even for terminal statuses (completed/released/cancelled) */}
                          {!["ordered", "collected", "received", "processing", "resulted", "verified"].includes(o.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActionOrder(o)}
                              className="gap-1 h-7 text-xs"
                              title="View order details"
                            >
                              <Search className="w-3 h-3" /> View
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <NewLabOrderDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); invalidate(); }}
        defaultFacilityId={activeFacilityId}
      />

      {actionOrder && (
        <ActionDialog
          order={actionOrder}
          onClose={() => setActionOrder(null)}
          onChanged={() => { setActionOrder(null); invalidate(); }}
        />
      )}
    </div>
  );
}

async function doAction(id: string, action: string, successMsg: string, onDone: () => void) {
  try {
    const res = await fetch(`/api/lab-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err.error || "Failed");
    }
    toast.success(successMsg);
    onDone();
  } catch (e: any) {
    toast.error(e.message);
  }
}

function NewLabOrderDialog({ open, onClose, onCreated, defaultFacilityId }: { open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [priority, setPriority] = useState("routine");
  const [notes, setNotes] = useState("");
  const [clinicalIndication, setClinicalIndication] = useState("");
  const [diagnosisRef, setDiagnosisRef] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<any[] | null>(null);
  const [isDuplicateOverride, setIsDuplicateOverride] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });
  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters", patientId, defaultFacilityId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}&facilityId=${defaultFacilityId || ""}`),
    enabled: !!patientId,
  });
  const { data: catalogData } = useQuery({
    queryKey: ["lab-tests-catalog"],
    queryFn: () => fetchJson(`/api/lab-tests`),
  });

  const toggleTest = (id: string) =>
    setSelectedTestIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    if (selectedTestIds.length === 0) { toast.error("Please select at least one test"); return; }
    setSaving(true);
    setDuplicates(null);
    try {
      const res = await fetch("/api/lab-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          encounterId: encounterId || undefined,
          facilityId: defaultFacilityId,
          testIds: selectedTestIds,
          priority,
          notes,
          clinicalIndication: clinicalIndication || undefined,
          diagnosisRef: diagnosisRef || undefined,
          departmentId: departmentId || undefined,
          isDuplicateOverride,
        }),
      });
      if (res.status === 409) {
        const err = await safeJson(res);
        if (err.code === "DUPLICATE_DETECTED" && err.duplicates) {
          setDuplicates(err.duplicates);
          setIsDuplicateOverride(false);
          setSaving(false);
          return;
        }
        throw new Error(err.error || "Duplicate detected");
      }
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Lab order created");
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setSelectedTestIds([]); setPriority("routine"); setNotes("");
      setClinicalIndication(""); setDiagnosisRef(""); setDepartmentId("");
      setDuplicates(null); setIsDuplicateOverride(false);
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
          <DialogTitle className="flex items-center gap-2 text-white"><FlaskConical className="w-5 h-5" /> New Lab Order</DialogTitle>
          <DialogDescription className="text-white/80">Select patient, choose tests from the catalog, and set priority.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {duplicates && duplicates.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded p-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                <AlertTriangle className="w-4 h-4" /> Duplicate order detected
              </div>
              <div className="text-xs text-amber-800">The same test(s) were recently ordered for this patient:</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {duplicates.map((d: any, i: number) => (
                  <div key={i} className="text-xs text-amber-900 bg-white border rounded p-2">
                    <div><strong>{d.orderNumber}</strong> · {formatDate(d.orderedAt, true)} · {d.status}</div>
                    <div className="text-amber-700">Tests: {d.tests.map((t: any) => t.name).join(", ")}</div>
                    {d.orderingClinician && <div className="text-amber-600">Ordered by: {d.orderingClinician}</div>}
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-amber-900">
                <Checkbox checked={isDuplicateOverride} onCheckedChange={(v) => setIsDuplicateOverride(!!v)} />
                Override warning and create this order anyway (confirm legitimate repeat testing)
              </label>
            </div>
          )}
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <ClearableSearch value={patientQuery} onChange={setPatientQuery} placeholder="Search patient..." className="" inputClassName="" />
            </div>
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => { setPatientId(p.id); setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); }} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {patientId && (
            <div>
              <Label>Encounter</Label>
              <Select value={encounterId || undefined} onValueChange={setEncounterId}>
                <SelectTrigger><SelectValue placeholder="Auto-create a laboratory encounter" /></SelectTrigger>
                <SelectContent>
                  {(encountersData?.items || []).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.encounterNumber} • {e.encounterType} • {formatDate(e.startAt, true)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority || undefined} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="stat">STAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel required>Tests ({selectedTestIds.length} selected)</FieldLabel>
            <div className="max-h-56 overflow-y-auto border rounded p-2 space-y-1 bg-slate-50">
              {(catalogData?.items || []).length === 0 ? (
                <p className="text-xs text-slate-500 p-2">No tests in catalog. Add tests in Settings → Lab Test Catalog.</p>
              ) : (
                (catalogData?.items || []).map((t: any) => (
                  <label key={t.id} className="flex items-center gap-2 p-2 rounded hover:bg-white cursor-pointer">
                    <Checkbox checked={selectedTestIds.includes(t.id)} onCheckedChange={() => toggleTest(t.id)} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">{t.name}</div>
                      <div className="text-xs text-slate-500">
                        {t.code}{t.category ? ` • ${t.category}` : ""}{t.specimenType ? ` • ${t.specimenType}` : ""}
                      </div>
                    </div>
                    {t.referenceRange && <span className="text-[10px] text-slate-500">Ref: {t.referenceRange}</span>}
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <Label>Clinical Indication</Label>
            <Textarea value={clinicalIndication} onChange={(e) => setClinicalIndication(e.target.value)} rows={2} placeholder="Reason for ordering the test(s) — e.g., Fever, rule out malaria" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <div>
                <Label>Diagnosis Reference</Label>
                <Input value={diagnosisRef} onChange={(e) => setDiagnosisRef(e.target.value)} placeholder="ICD-10 code or diagnosis name" />
              </div>
              <div>
                <Label>Department ID</Label>
                <Input value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} placeholder="Ordering department cuid (optional)" />
              </div>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional notes / instructions for lab..." />
          </div>
        </div>
        <DialogFooter className="px-6 py-4 shrink-0 border-t bg-white">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Creating..." : "Create Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const { status } = order;
  const [showReject, setShowReject] = useState(false);
  const [showRecollect, setShowRecollect] = useState(false);

  // If a sample has been rejected, show recollect option
  const hasRejectedSample = order.samples?.some((s: any) => s.status === "rejected");

  if (showReject) return <RejectSampleDialog order={order} onClose={() => setShowReject(false)} onChanged={onChanged} />;
  if (showRecollect) return <RecollectSampleDialog order={order} onClose={() => setShowRecollect(false)} onChanged={onChanged} />;

  if (status === "ordered") return <CollectSampleDialog order={order} onClose={onClose} onChanged={onChanged} />;
  if (status === "collected") return (
    <>
      <ReceiveSampleDialog order={order} onClose={onClose} onChanged={onChanged} />
      <Button variant="outline" size="sm" className="absolute bottom-4 left-4 text-rose-600" onClick={() => setShowReject(true)}>
        Reject Sample
      </Button>
    </>
  );
  if (status === "processing") return <EnterResultDialog order={order} onClose={onClose} onChanged={onChanged} />;
  if (status === "resulted") return <VerifyDialog order={order} onClose={onClose} onChanged={onChanged} />;
  if (hasRejectedSample && (status === "received" || status === "processing")) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-3">
          A sample was rejected for this order. You can request a recollection.
        </div>
        <Button onClick={() => setShowRecollect(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
          <TestTube className="w-4 h-4" /> Recollect Sample
        </Button>
      </div>
    );
  }
  // Fallback for any other status (verified, released, cancelled, completed, etc.)
  return <OrderDetailsDialog order={order} onClose={onClose} />;
}

// Read-only details dialog shown for terminal-state orders (verified, released, cancelled, completed)
function OrderDetailsDialog({ order, onClose }: { order: any; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-purple-600 to-violet-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <FlaskConical className="w-5 h-5 text-purple-600" /> Lab Order {order.orderNumber}
            <StatusBadge status={order.status} />
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {order.patient ? `${order.patient.firstName} ${order.patient.lastName} (${order.patient.patientNumber})` : "—"} • {formatDate(order.orderedAt, true)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Order #</p>
              <p className="font-mono text-slate-900">{order.orderNumber}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Priority</p>
              <p className="text-slate-900 capitalize">{order.priority}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Ordering Clinician</p>
              <p className="text-slate-900">
                {order.orderingClinician ? `Dr. ${order.orderingClinician.firstName} ${order.orderingClinician.lastName}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Encounter #</p>
              <p className="font-mono text-slate-900">{order.encounter?.encounterNumber || "—"}</p>
            </div>
            {order.clinicalIndication && (
              <div className="col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Clinical Indication</p>
                <p className="text-slate-900">{order.clinicalIndication}</p>
              </div>
            )}
            {order.notes && (
              <div className="col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Notes</p>
                <p className="text-slate-900 whitespace-pre-wrap">{order.notes}</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Tests</p>
            <div className="space-y-1">
              {(order.items || []).map((it: any) => (
                <div key={it.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                  <div>
                    <p className="font-medium text-slate-900">{it.laboratoryTest?.name}</p>
                    <p className="text-xs text-slate-500">{it.laboratoryTest?.code}</p>
                  </div>
                  <StatusBadge status={it.status} />
                </div>
              ))}
            </div>
          </div>

          {(order.samples || []).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Samples</p>
              <div className="space-y-1">
                {order.samples.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <div>
                      <p className="font-mono text-slate-900">{s.sampleNumber}</p>
                      <p className="text-xs text-slate-500">
                        {s.specimenType || "—"} {s.collectedAt && `• Collected ${formatDate(s.collectedAt, true)}`}
                      </p>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {order.cancelledAt && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700">
              <p><span className="font-semibold">Cancelled:</span> {formatDate(order.cancelledAt, true)}</p>
              {order.cancellationReason && <p><span className="font-semibold">Reason:</span> {order.cancellationReason}</p>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CollectSampleDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const [sampleNumber, setSampleNumber] = useState(`S-${Date.now().toString().slice(-6)}`);
  const [specimenType, setSpecimenType] = useState(order.items?.[0]?.laboratoryTest?.specimenType || "");
  const [collectedById, setCollectedById] = useState("");
  const [collectionLocation, setCollectionLocation] = useState("");
  const [container, setContainer] = useState("");
  const [volume, setVolume] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!sampleNumber) { toast.error("Sample number required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "collect", sampleNumber, specimenType, collectedById, collectionLocation, container, volume }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Sample collected");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-purple-600 to-violet-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><TestTube className="w-5 h-5" /> Collect Sample</DialogTitle>
          <DialogDescription className="text-white/80">Order {order.orderNumber} • {order.patient?.firstName} {order.patient?.lastName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Sample Number</FieldLabel>
            <Input value={sampleNumber} onChange={(e) => setSampleNumber(e.target.value)} />
          </div>
          <div>
            <Label>Specimen Type</Label>
            <Input value={specimenType} onChange={(e) => setSpecimenType(e.target.value)} placeholder="e.g. Whole blood, Serum, Urine" />
          </div>
          <div>
            <Label>Collection Location (optional)</Label>
            <Input value={collectionLocation} onChange={(e) => setCollectionLocation(e.target.value)} placeholder="e.g., Ward 2, OPD Room 3" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Container (optional)</Label>
              <Input value={container} onChange={(e) => setContainer(e.target.value)} placeholder="e.g., EDTA tube" />
            </div>
            <div>
              <Label>Volume (optional)</Label>
              <Input value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="e.g., 3 mL" />
            </div>
          </div>
          <div>
            <Label>Collected By (User ID, optional)</Label>
            <Input value={collectedById} onChange={(e) => setCollectedById(e.target.value)} placeholder="Defaults to current user" />
          </div>
          <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded">
            {(order.items || []).length} test(s) on this order. Sample will be tagged to all items.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving..." : "Collect Sample"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectSampleDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const [sampleId, setSampleId] = useState(order.samples?.[0]?.id || "");
  const [rejectionReasonCode, setRejectionReasonCode] = useState("insufficient");
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!sampleId) { toast.error("Select a sample to reject"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", sampleId, rejectionReasonCode, rejectionReason, rejectionNotes }),
      });
      if (!res.ok) { const err = await safeJson(res); throw new Error(err.error || "Failed"); }
      toast.success("Sample rejected — recollection available");
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-purple-600 to-violet-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-rose-700"><AlertTriangle className="w-5 h-5" /> Reject Sample</DialogTitle>
          <DialogDescription className="text-white/80">Order {order.orderNumber} • {order.patient?.firstName} {order.patient?.lastName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Sample</FieldLabel>
            <Select value={sampleId} onValueChange={setSampleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(order.samples || []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.sampleNumber} ({s.specimenType || "—"}) — {s.status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel required>Rejection Reason</FieldLabel>
            <Select value={rejectionReasonCode} onValueChange={setRejectionReasonCode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="insufficient">Insufficient specimen</SelectItem>
                <SelectItem value="wrong_container">Wrong container</SelectItem>
                <SelectItem value="wrong_specimen">Wrong specimen type</SelectItem>
                <SelectItem value="leakage">Leakage</SelectItem>
                <SelectItem value="clotted">Clotted specimen</SelectItem>
                <SelectItem value="hemolysed">Hemolysed specimen</SelectItem>
                <SelectItem value="labeling">Labeling problem</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Additional reason details (optional)</Label>
            <Input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Free-text details" />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={rejectionNotes} onChange={(e) => setRejectionNotes(e.target.value)} rows={2} placeholder="Any additional notes for the recollection..." />
          </div>
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            The rejected sample will be preserved in history. You can request a recollection afterwards.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-rose-600 hover:bg-rose-700">
            {saving ? "Saving..." : "Reject Sample"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecollectSampleDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const rejectedSamples = (order.samples || []).filter((s: any) => s.status === "rejected");
  const [sampleId, setSampleId] = useState(rejectedSamples[0]?.id || "");
  const [newSampleNumber, setNewSampleNumber] = useState(`S-${Date.now().toString().slice(-6)}`);
  const [specimenType, setSpecimenType] = useState(rejectedSamples[0]?.specimenType || "");
  const [collectionLocation, setCollectionLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!sampleId) { toast.error("Select the rejected sample to recollect"); return; }
    if (!newSampleNumber) { toast.error("New sample number required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recollect", sampleId, newSampleNumber, specimenType, collectionLocation }),
      });
      if (!res.ok) { const err = await safeJson(res); throw new Error(err.error || "Failed"); }
      toast.success("Sample recollected — workflow restarted");
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-purple-600 to-violet-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><TestTube className="w-5 h-5" /> Recollect Sample</DialogTitle>
          <DialogDescription className="text-white/80">Order {order.orderNumber} • {order.patient?.firstName} {order.patient?.lastName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Rejected sample to replace</FieldLabel>
            <Select value={sampleId} onValueChange={(v) => { setSampleId(v); const s = rejectedSamples.find((x: any) => x.id === v); if (s) setSpecimenType(s.specimenType || ""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {rejectedSamples.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.sampleNumber} — {s.rejectionReasonCode || "rejected"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel required>New Sample Number</FieldLabel>
            <Input value={newSampleNumber} onChange={(e) => setNewSampleNumber(e.target.value)} />
          </div>
          <div>
            <Label>Specimen Type</Label>
            <Input value={specimenType} onChange={(e) => setSpecimenType(e.target.value)} placeholder="e.g., Whole Blood" />
          </div>
          <div>
            <Label>Collection Location</Label>
            <Input value={collectionLocation} onChange={(e) => setCollectionLocation(e.target.value)} placeholder="e.g., Ward 2" />
          </div>
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
            The original rejected sample remains in history. A new sample will be created and linked to the original via a recollection chain.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving..." : "Recollect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveSampleDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "receive" }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Sample received at lab");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-purple-600 to-violet-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><Beaker className="w-5 h-5" /> Receive Sample</DialogTitle>
          <DialogDescription className="text-white/80">Confirm sample received at the lab. Order {order.orderNumber}</DialogDescription>
        </DialogHeader>
        <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded">
          <div className="font-medium text-slate-900">{order.patient?.firstName} {order.patient?.lastName}</div>
          <div className="text-xs mt-1">Order has {(order.samples || []).length} sample(s).</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Receiving..." : "Receive Sample"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnterResultDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  // local state per item
  const [results, setResults] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  // initialize state from items
  const items = order.items || [];
  const initIfNeeded = () => {
    items.forEach((it: any) => {
      if (!results[it.id]) {
        setResults((p) => ({
          ...p,
          [it.id]: {
            resultValue: "",
            numericValue: "",
            unit: it.laboratoryTest?.unit || "",
            referenceRange: it.laboratoryTest?.referenceRange || "",
            abnormalFlag: "normal",
            criticalFlag: false,
            resultNotes: "",
          },
        }));
      }
    });
  };
  initIfNeeded();

  const setField = (itemId: string, key: string, value: any) =>
    setResults((p) => ({ ...p, [itemId]: { ...(p[itemId] || {}), [key]: value } }));

  const submit = async () => {
    const payload = items.map((it: any) => ({
      labOrderItemId: it.id,
      ...(results[it.id] || {}),
    }));
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "result", results: payload }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Results entered");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-purple-600 to-violet-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><FlaskConical className="w-5 h-5" /> Enter Results</DialogTitle>
          <DialogDescription className="text-white/80">Order {order.orderNumber} • {order.patient?.firstName} {order.patient?.lastName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {items.map((it: any) => {
            const r = results[it.id] || {};
            return (
              <Card key={it.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-900">{it.laboratoryTest?.name}</div>
                      <div className="text-xs text-slate-500">{it.laboratoryTest?.code} • {it.laboratoryTest?.category || "—"}</div>
                    </div>
                    {r.criticalFlag && (
                      <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> CRITICAL</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs">Result Value</Label>
                      <Input value={r.resultValue || ""} onChange={(e) => setField(it.id, "resultValue", e.target.value)} placeholder="e.g. Positive" />
                    </div>
                    <div>
                      <Label className="text-xs">Numeric Value</Label>
                      <Input value={r.numericValue || ""} type="number" onChange={(e) => setField(it.id, "numericValue", e.target.value)} placeholder="e.g. 12.5" />
                    </div>
                    <div>
                      <Label className="text-xs">Unit</Label>
                      <Input value={r.unit || ""} onChange={(e) => setField(it.id, "unit", e.target.value)} placeholder="mg/dL" />
                    </div>
                    <div>
                      <Label className="text-xs">Reference Range</Label>
                      <Input value={r.referenceRange || ""} onChange={(e) => setField(it.id, "referenceRange", e.target.value)} placeholder="e.g. 8.5-10.5" />
                    </div>
                    <div>
                      <Label className="text-xs">Abnormal Flag</Label>
                      <Select value={r.abnormalFlag || "normal"} onValueChange={(v) => setField(it.id, "abnormalFlag", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical_low">Critical Low</SelectItem>
                          <SelectItem value="critical_high">Critical High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <Checkbox checked={!!r.criticalFlag} onCheckedChange={(v) => setField(it.id, "criticalFlag", !!v)} id={`crit-${it.id}`} />
                      <Label htmlFor={`crit-${it.id}`} className="text-xs">Critical value</Label>
                    </div>
                    <div className="col-span-2 md:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Input value={r.resultNotes || ""} onChange={(e) => setField(it.id, "resultNotes", e.target.value)} placeholder="Comments..." />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving..." : "Submit Results"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerifyDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Results verified");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-purple-600 to-violet-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><CheckCircle2 className="w-5 h-5" /> Verify Results</DialogTitle>
          <DialogDescription className="text-white/80">You are about to verify all results on order {order.orderNumber}. This will mark them ready for release.</DialogDescription>
        </DialogHeader>
        <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded">
          <div className="font-medium text-slate-900">{order.patient?.firstName} {order.patient?.lastName}</div>
          <div className="text-xs mt-1">{(order.items || []).length} test result(s) to verify.</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Verifying..." : "Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

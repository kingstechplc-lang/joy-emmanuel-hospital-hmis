"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Scissors, Search, Save, X, Gauge, RefreshCw, Clock, XCircle, CheckCircle2, CalendarDays, FileText, Activity } from "lucide-react";
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
  { value: "requested", label: "Requested" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
];

export function ProceduresView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [viewProc, setViewProc] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  // KPI range state
  const [kpiRange, setKpiRange] = useState("today");
  const [kpiCustomStart, setKpiCustomStart] = useState("");
  const [kpiCustomEnd, setKpiCustomEnd] = useState("");

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["procedures", activeFacilityId, statusFilter, search],
    queryFn: () => fetchJson(`/api/procedures${qs}`),
    enabled: !!activeFacilityId,
  });

  // KPI query (server-side aggregate)
  const kpiQuery = useQuery({
    queryKey: ["procedures-stats", activeFacilityId, kpiRange, kpiCustomStart, kpiCustomEnd],
    queryFn: () => {
      const p = new URLSearchParams();
      if (activeFacilityId) p.set("facilityId", activeFacilityId);
      p.set("range", kpiRange);
      if (kpiRange === "custom" && kpiCustomStart && kpiCustomEnd) {
        p.set("startDate", kpiCustomStart);
        p.set("endDate", kpiCustomEnd);
      }
      return fetchJson(`/api/procedures/stats?${p.toString()}`);
    },
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["procedures"] });
    qc.invalidateQueries({ queryKey: ["procedures-stats"] });
  };

  const k = kpiQuery.data?.kpis;

  const extractConsent = (notes?: string | null) => {
    if (!notes) return null;
    const m = notes.match(/^CONSENT: (taken|not_taken)/i);
    return m ? m[1].toLowerCase() : null;
  };
  const stripConsent = (notes?: string | null) => (notes || "").replace(/^CONSENT: (taken|not_taken)\n?/i, "").trim();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Procedures"
        description="Record and track medical procedures performed"
        icon={Scissors}
        gradient="from-teal-500 to-teal-600"
        actions={
          <Button onClick={() => setShowNew(true)} disabled={!can("procedure.perform")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Procedure
        </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view procedures.</CardContent></Card>
      )}

      {/* KPI / Statistics Dashboard */}
      {activeFacilityId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-teal-600" /> Procedure Statistics
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Live KPIs from the database for the selected date range.
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
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" aria-hidden="true" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MiniStatCard label="Total Procedures" value={k.totalProcedures?.value ?? 0} icon={Scissors} gradient="from-teal-500 to-teal-600" />
                <MiniStatCard label="Today's Procedures" value={k.todayProcedures?.value ?? 0} icon={CalendarDays} gradient="from-cyan-500 to-cyan-600" />
                <MiniStatCard label="Requested" value={k.requested?.value ?? 0} icon={FileText} gradient="from-amber-500 to-amber-600" />
                <MiniStatCard label="Scheduled" value={k.scheduled?.value ?? 0} icon={Clock} gradient="from-blue-500 to-blue-600" />
                <MiniStatCard label="In Progress" value={k.inProgress?.value ?? 0} icon={Activity} gradient="from-violet-500 to-violet-600" />
                <MiniStatCard label="Completed" value={k.completed?.value ?? 0} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
                <MiniStatCard label="Cancelled" value={k.cancelled?.value ?? 0} icon={XCircle} gradient="from-slate-500 to-slate-600" />
                <MiniStatCard label="Documentation Pending" value={k.documentationPending?.value ?? 0} icon={FileText} gradient="from-orange-500 to-orange-600" />
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
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Search Procedures</Label>
              <ClearableSearch
                value={search}
                onChange={setSearch}
                placeholder="Search by procedure name, code, patient name, or MRN…"
                inputClassName="text-sm"
                className="max-w-3xl"
              />
              <p className="text-[10px] text-slate-500 mt-1">Server-side search across procedure name, procedure code, and patient fields.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
                <SelectTrigger className="md:w-48 h-8 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {(statusFilter !== "all" || search) && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setStatusFilter("all"); setSearch(""); }}>
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
        <ErrorState message="Failed to load procedures" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No procedures recorded"
              description="Record a procedure performed on a patient."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("procedure.perform")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Procedure</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Procedure</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Performer</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Performed At</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Consent</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p: any) => {
                    const consent = extractConsent(p.notes);
                    return (
                      <tr key={p.id} className="border-b hover:bg-emerald-50/40 cursor-pointer" onClick={() => setViewProc(p)}>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{p.patient?.firstName} {p.patient?.lastName}</div>
                          <div className="text-xs text-slate-500">{p.patient?.patientNumber}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{p.procedureName}</div>
                          {p.procedureCode && <div className="text-xs text-slate-500 font-mono">{p.procedureCode}</div>}
                        </td>
                        <td className="p-3 text-slate-700">
                          {p.performedBy ? `Dr. ${p.performedBy.firstName} ${p.performedBy.lastName}` : "—"}
                        </td>
                        <td className="p-3 text-xs text-slate-600">{formatDate(p.performedAt, true)}</td>
                        <td className="p-3">
                          {consent === "taken" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">Taken</span>
                          ) : consent === "not_taken" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-rose-100 text-rose-700 border-rose-200">Not Taken</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3"><StatusBadge status={p.status} /></td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setViewProc(p); }} className="gap-1 h-7 text-xs">
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <NewProcedureDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); invalidate(); }}
        defaultFacilityId={activeFacilityId}
      />

      {viewProc && (
        <ViewProcedureDialog
          procedure={viewProc}
          extractConsent={extractConsent}
          stripConsent={stripConsent}
          onClose={() => setViewProc(null)}
          onChanged={() => { setViewProc(null); invalidate(); }}
        />
      )}
    </div>
  );
}

function NewProcedureDialog({ open, onClose, onCreated, defaultFacilityId }: { open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [procedureCatalogId, setProcedureCatalogId] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [procedureCode, setProcedureCode] = useState("");
  const [category, setCategory] = useState("");
  const [performedById, setPerformedById] = useState("");
  const [performedAt, setPerformedAt] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [procedureRoom, setProcedureRoom] = useState("");
  const [indication, setIndication] = useState("");
  const [diagnosisRef, setDiagnosisRef] = useState("");
  const [findings, setFindings] = useState("");
  const [outcome, setOutcome] = useState("");
  const [complications, setComplications] = useState("");
  const [specimensSent, setSpecimensSent] = useState("");
  const [consumablesUsed, setConsumablesUsed] = useState("");
  const [followUpInstructions, setFollowUpInstructions] = useState("");
  const [notes, setNotes] = useState("");
  const [consentStatus, setConsentStatus] = useState("taken");
  const [consentNotes, setConsentNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");

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
    queryKey: ["procedure-catalog", catalogSearch],
    queryFn: () => fetchJson(`/api/procedures-catalog?q=${encodeURIComponent(catalogSearch)}&status=active`),
    enabled: catalogSearch.length >= 1,
  });

  const selectCatalog = (c: any) => {
    setProcedureCatalogId(c.id);
    setProcedureName(c.name);
    setProcedureCode(c.code || "");
    setCategory(c.category || "");
    setCatalogSearch("");
  };

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    if (!procedureName && !procedureCatalogId) { toast.error("Procedure name or catalog selection is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/procedures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId, encounterId: encounterId || undefined, facilityId: defaultFacilityId,
          procedureCatalogId: procedureCatalogId || undefined,
          procedureName, procedureCode, category,
          performedById: performedById || undefined,
          performedAt: performedAt || undefined,
          scheduledAt: scheduledAt || undefined,
          procedureRoom: procedureRoom || undefined,
          indication, diagnosisRef, findings, outcome, complications,
          specimensSent, consumablesUsed, followUpInstructions,
          notes, consentStatus, consentNotes,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Procedure recorded");
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setProcedureCatalogId(""); setProcedureName(""); setProcedureCode(""); setCategory("");
      setPerformedById(""); setPerformedAt(""); setScheduledAt(""); setProcedureRoom("");
      setIndication(""); setDiagnosisRef(""); setFindings(""); setOutcome("");
      setComplications(""); setSpecimensSent(""); setConsumablesUsed(""); setFollowUpInstructions("");
      setNotes(""); setConsentStatus("taken"); setConsentNotes("");
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
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><Scissors className="w-5 h-5" /> New Procedure</DialogTitle>
          <DialogDescription className="text-white/80">Request or record a procedure for a patient.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
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
                <SelectTrigger><SelectValue placeholder="Auto-create a procedure encounter" /></SelectTrigger>
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
              <FieldLabel required>Procedure Name</FieldLabel>
              <Input value={procedureName} onChange={(e) => setProcedureName(e.target.value)} placeholder="e.g. Appendectomy" />
            </div>
            <div>
              <Label>Procedure Code</Label>
              <Input value={procedureCode} onChange={(e) => setProcedureCode(e.target.value)} placeholder="e.g. ICD-9-CM 47.01" />
            </div>
          </div>

          {/* Catalog search */}
          <div>
            <Label>Search Procedure Catalog (optional)</Label>
            <ClearableSearch value={catalogSearch} onChange={setCatalogSearch} placeholder="Search catalog by name or code..." className="" inputClassName="" />
            {catalogData?.items && catalogData.items.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                {catalogData.items.slice(0, 10).map((c: any) => (
                  <button key={c.id} type="button" onClick={() => selectCatalog(c)} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-slate-500 ml-2 font-mono">{c.code}</span>
                    {c.category && <span className="text-xs text-slate-500 ml-2">• {c.category}</span>}
                  </button>
                ))}
              </div>
            )}
            {procedureCatalogId && (
              <div className="text-xs text-emerald-700 mt-1">✓ Linked to catalog entry</div>
            )}
          </div>

          <div>
            <Label>Category</Label>
            <Select value={category || undefined} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minor">Minor</SelectItem>
                <SelectItem value="major">Major</SelectItem>
                <SelectItem value="diagnostic">Diagnostic</SelectItem>
                <SelectItem value="therapeutic">Therapeutic</SelectItem>
                <SelectItem value="bedside">Bedside</SelectItem>
                <SelectItem value="outpatient">Outpatient</SelectItem>
                <SelectItem value="inpatient">Inpatient</SelectItem>
                <SelectItem value="specialty">Specialty</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Scheduled At (optional)</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} placeholder="If scheduling for later" />
            </div>
            <div>
              <Label>Procedure Room (optional)</Label>
              <Input value={procedureRoom} onChange={(e) => setProcedureRoom(e.target.value)} placeholder="e.g., Theatre 1, Bedside" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Performer (User ID, optional)</Label>
              <Input value={performedById} onChange={(e) => setPerformedById(e.target.value)} placeholder="Defaults to current user" />
            </div>
            <div>
              <Label>Performed At (leave empty to create as request)</Label>
              <Input type="datetime-local" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Indication</Label>
            <Textarea value={indication} onChange={(e) => setIndication(e.target.value)} rows={2} placeholder="Why the procedure was performed" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Diagnosis Reference</Label>
              <Input value={diagnosisRef} onChange={(e) => setDiagnosisRef(e.target.value)} placeholder="ICD-10 code or diagnosis name" />
            </div>
            <div>
              <Label>Follow-Up Instructions (optional)</Label>
              <Input value={followUpInstructions} onChange={(e) => setFollowUpInstructions(e.target.value)} placeholder="e.g., Review in 2 weeks" />
            </div>
          </div>
          <div>
            <Label>Findings</Label>
            <Textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={3} placeholder="Procedure findings" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Outcome</Label>
              <Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2} placeholder="Result / outcome" />
            </div>
            <div>
              <Label>Complications (optional)</Label>
              <Textarea value={complications} onChange={(e) => setComplications(e.target.value)} rows={2} placeholder="Any complications during procedure" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Specimens Sent (optional)</Label>
              <Input value={specimensSent} onChange={(e) => setSpecimensSent(e.target.value)} placeholder="e.g., Tissue biopsy to lab" />
            </div>
            <div>
              <Label>Consumables Used (optional)</Label>
              <Input value={consumablesUsed} onChange={(e) => setConsumablesUsed(e.target.value)} placeholder="e.g., Suture pack, gloves" />
            </div>
          </div>

          <div>
            <Label>Consent Status</Label>
            <RadioGroup value={consentStatus} onValueChange={setConsentStatus} className="flex gap-6 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="taken" id="consent-taken" />
                <span className="text-sm">Consent Taken</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="not_taken" id="consent-not" />
                <span className="text-sm">Not Taken</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="refused" id="consent-refused" />
                <span className="text-sm">Refused</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="not_applicable" id="consent-na" />
                <span className="text-sm">N/A</span>
              </label>
            </RadioGroup>
          </div>
          {consentStatus === "taken" || consentStatus === "refused" ? (
            <div>
              <Label>Consent Notes (optional)</Label>
              <Input value={consentNotes} onChange={(e) => setConsentNotes(e.target.value)} placeholder="e.g., Written consent on file" />
            </div>
          ) : null}

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional notes..." />
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving..." : "Save Procedure"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewProcedureDialog({ procedure, extractConsent, stripConsent, onClose, onChanged }: {
  procedure: any;
  extractConsent: (n?: string | null) => string | null;
  stripConsent: (n?: string | null) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editable, setEditable] = useState<any>(procedure);
  const [saving, setSaving] = useState(false);
  const setField = (k: string, v: any) => setEditable((p: any) => ({ ...p, [k]: v }));

  const consent = extractConsent(procedure.notes);
  const [consentStatus, setConsentStatus] = useState(consent || "taken");
  const [notesBody, setNotesBody] = useState(stripConsent(procedure.notes));

  const update = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/procedures/${procedure.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          procedureName: editable.procedureName,
          procedureCode: editable.procedureCode,
          indication: editable.indication,
          findings: editable.findings,
          outcome: editable.outcome,
          notes: notesBody,
          consentStatus,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Procedure updated");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><Scissors className="w-5 h-5" /> Procedure Record <StatusBadge status={editable.status} /></DialogTitle>
          <DialogDescription className="text-white/80">
            {procedure.patient?.firstName} {procedure.patient?.lastName} • {procedure.encounter?.encounterNumber || "—"} • Performed {formatDate(procedure.performedAt, true)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Procedure Name</Label>
              <Input value={editable.procedureName || ""} onChange={(e) => setField("procedureName", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Procedure Code</Label>
              <Input value={editable.procedureCode || ""} onChange={(e) => setField("procedureCode", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Indication</Label>
            <Textarea value={editable.indication || ""} onChange={(e) => setField("indication", e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Findings</Label>
            <Textarea value={editable.findings || ""} onChange={(e) => setField("findings", e.target.value)} rows={4} />
          </div>
          <div>
            <Label className="text-xs">Outcome</Label>
            <Textarea value={editable.outcome || ""} onChange={(e) => setField("outcome", e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Consent Status</Label>
            <RadioGroup value={consentStatus} onValueChange={setConsentStatus} className="flex gap-6 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="taken" id="edit-consent-taken" />
                <span className="text-sm">Taken</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="not_taken" id="edit-consent-not" />
                <span className="text-sm">Not Taken</span>
              </label>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notesBody} onChange={(e) => setNotesBody(e.target.value)} rows={2} />
          </div>
          <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded">
            Performed by: {procedure.performedBy ? `Dr. ${procedure.performedBy.firstName} ${procedure.performedBy.lastName}` : "—"} • Facility: {procedure.facility?.name || "—"}
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose} className="gap-1"><X className="w-4 h-4" /> Close</Button>
          <Button onClick={update} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Save className="w-4 h-4 animate-pulse" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Droplets, Plus, RefreshCcw, AlertCircle, TrendingDown, TrendingUp, Activity,
  ClipboardList, Clock, Beaker, Stethoscope, ListChecks, BellRing, FileBarChart, Play, StopCircle,
  Settings2, ChevronRight, Scale, Download, Printer, Copy, Calculator, FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, formatDate, formatRelative, calculateAge, safeJson,
  PageHeader, MiniStatCard, ClearableSearch,
} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine,
} from "recharts";

// =====================================================================
// Helpers
// =====================================================================
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

// ---- Intake categories (structured) ----
const INTAKE_CATEGORIES = [
  { value: "oral", label: "Oral", examples: "Water, tea, juice, milk, ORS" },
  { value: "enteral", label: "Enteral", examples: "NG feeding, PEG feeding" },
  { value: "iv", label: "IV Fluid", examples: "Normal saline, Ringer's lactate, Dextrose" },
  { value: "medication", label: "Medication", examples: "IV med volume, flushes, diluent" },
  { value: "blood_product", label: "Blood Product", examples: "Whole blood, packed cells, plasma, platelets" },
  { value: "other", label: "Other", examples: "Other configured intake" },
];

const INTAKE_ROUTES = [
  { value: "oral", label: "Oral" },
  { value: "iv", label: "IV" },
  { value: "enteral", label: "Enteral" },
  { value: "ng", label: "NG" },
  { value: "peg", label: "PEG" },
  { value: "blood_product", label: "Blood Product" },
  { value: "other", label: "Other" },
];

// ---- Output categories (structured) ----
const OUTPUT_CATEGORIES = [
  { value: "urine", label: "Urine", examples: "Voided, catheter" },
  { value: "drains", label: "Drains", examples: "Surgical, chest, JP" },
  { value: "gi", label: "GI Losses", examples: "Vomit, NG aspirate, stool, diarrhoea" },
  { value: "other", label: "Other", examples: "Ostomy, fistula, wound drainage" },
];

const OUTPUT_ROUTES = [
  { value: "voided", label: "Voided" },
  { value: "catheter", label: "Catheter" },
  { value: "ng", label: "NG" },
  { value: "drain", label: "Drain" },
  { value: "ostomy", label: "Ostomy" },
  { value: "other", label: "Other" },
];

const COLLECTION_METHODS = [
  { value: "measured_volume", label: "Measured volume" },
  { value: "estimated", label: "Estimated" },
  { value: "counted", label: "Counted" },
  { value: "other", label: "Other" },
];

const MEASUREMENT_TYPES = [
  { value: "measured", label: "Measured" },
  { value: "estimated", label: "Estimated" },
];

const CATHETER_STATUSES = [
  { value: "none", label: "None" },
  { value: "indwelling", label: "Indwelling (Foley)" },
  { value: "supra_pubic", label: "Supra-pubic" },
  { value: "in_out", label: "In/Out catheterization" },
  { value: "external", label: "External" },
];

const MONITORING_LEVELS = [
  { value: "standard", label: "Standard (hourly)", interval: 60 },
  { value: "enhanced", label: "Enhanced (every 30 min)", interval: 30 },
  { value: "intensive", label: "Intensive / ICU (every 15 min)", interval: 15 },
];

const ENTRY_STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  recorded: "bg-emerald-100 text-emerald-700 border-emerald-200",
  verified: "bg-blue-100 text-blue-700 border-blue-200",
  amended: "bg-violet-100 text-violet-700 border-violet-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200 line-through",
};

const ENTRY_TYPE_COLOR: Record<string, string> = {
  intake: "bg-emerald-100 text-emerald-700 border-emerald-200",
  output: "bg-amber-100 text-amber-700 border-amber-200",
};

const ALERT_SEVERITY_COLOR: Record<string, string> = {
  info: "bg-blue-100 text-blue-700 border-blue-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  critical: "bg-rose-100 text-rose-700 border-rose-200",
};

function fmtMl(n: number | null | undefined, suffix = " ml") {
  if (n == null) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

function fmtSignedMl(n: number | null | undefined) {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} ml`;
}

function fmtTimeAgo(dateStr: string | Date | null | undefined) {
  if (!dateStr) return "—";
  return formatRelative(dateStr);
}

// =====================================================================
// MAIN VIEW
// =====================================================================
export function IntakeOutputView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canAmend = can("clinical.amend") || can("clinical.edit");
  const canSign = can("clinical.sign");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [showNewIntake, setShowNewIntake] = useState(false);
  const [showNewOutput, setShowNewOutput] = useState(false);
  const [showMonitoring, setShowMonitoring] = useState(false);
  const [showReport, setShowReport] = useState<string | null>(null);

  // Search patients
  const { data: patientResults } = useQuery({
    queryKey: ["io-patient-search", patientSearch],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientSearch)}`),
    enabled: patientSearch.length >= 2 && !selectedPatientId,
  });
  const searchedPatients = patientResults?.items || patientResults?.patients || [];

  // Admitted patients for active facility
  const { data: admissionsData, isLoading: loadingAdmissions } = useQuery({
    queryKey: ["io-admissions", activeFacilityId],
    queryFn: () => fetchJson(`/api/admissions?facilityId=${activeFacilityId}&status=admitted&limit=200`),
    enabled: !!activeFacilityId,
  });
  const admittedPatients = (admissionsData?.items || []).map((a: any) => ({
    id: a.patient?.id,
    patientNumber: a.patient?.patientNumber,
    firstName: a.patient?.firstName,
    lastName: a.patient?.lastName,
    sex: a.patient?.sex,
    dateOfBirth: a.patient?.dateOfBirth,
    admissionId: a.id,
    admissionNumber: a.admissionNumber,
    encounterId: a.encounterId,
    ward: a.bedAssignments?.[0]?.ward?.name,
    bed: a.bedAssignments?.[0]?.bed?.bedNumber,
  }));

  // Filter admitted patients by search
  const filteredAdmitted = admittedPatients.filter((p: any) => {
    if (!patientSearch || p.id === selectedPatientId) return p.id === selectedPatientId || !patientSearch;
    const q = patientSearch.toLowerCase();
    return (
      p.firstName?.toLowerCase().includes(q) ||
      p.lastName?.toLowerCase().includes(q) ||
      p.patientNumber?.toLowerCase().includes(q)
    );
  });

  const selectPatient = (p: any) => {
    setSelectedPatientId(p.id);
    setSelectedPatient(p);
    setPatientSearch("");
    setTab("balance");
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["io-summary", selectedPatientId] });
    qc.invalidateQueries({ queryKey: ["io-entries", selectedPatientId] });
    qc.invalidateQueries({ queryKey: ["io-stats", activeFacilityId] });
    qc.invalidateQueries({ queryKey: ["io-ward", activeFacilityId] });
    qc.invalidateQueries({ queryKey: ["io-monitoring", selectedPatientId] });
    qc.invalidateQueries({ queryKey: ["io-alerts", selectedPatientId] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Intake & Output"
        description="Inpatient fluid balance monitoring — record intake/output, track hourly/shift/24h balance, monitor urine, drains, NG losses, and detect missing entries"
        icon={Droplets}
        gradient="from-teal-500 to-cyan-600"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5"><Activity className="w-4 h-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="balance" className="gap-1.5"><Droplets className="w-4 h-4" /> Patient Balance</TabsTrigger>
          <TabsTrigger value="ward" className="gap-1.5"><ClipboardList className="w-4 h-4" /> Ward View</TabsTrigger>
          <TabsTrigger value="handover" className="gap-1.5"><FileText className="w-4 h-4" /> Handover</TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5"><BellRing className="w-4 h-4" /> Alerts</TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5"><Settings2 className="w-4 h-4" /> Config</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><FileBarChart className="w-4 h-4" /> Reports</TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* DASHBOARD */}
        {/* ============================================================ */}
        <TabsContent value="dashboard" className="space-y-4">
          <IODashboard facilityId={activeFacilityId} />
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">Quick Actions</div>
              <div className="flex flex-wrap gap-2">
                {can("clinical.create") && selectedPatientId && (
                  <>
                    <Button onClick={() => setShowNewIntake(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> Record Intake</Button>
                    <Button onClick={() => setShowNewOutput(true)} className="gap-2 bg-amber-600 hover:bg-amber-700"><Plus className="w-4 h-4" /> Record Output</Button>
                    <Button onClick={() => setShowMonitoring(true)} variant="outline" className="gap-2"><Settings2 className="w-4 h-4" /> Monitoring Period</Button>
                  </>
                )}
                {!selectedPatientId && (
                  <div className="text-sm text-slate-500">Select a patient from the Patient Balance tab to record entries.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* PATIENT BALANCE */}
        {/* ============================================================ */}
        <TabsContent value="balance" className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <FieldLabel required>Select Admitted Patient</FieldLabel>
                <ClearableSearch
                  placeholder="Search admitted patient by name or number..."
                  value={selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName} (${selectedPatient.patientNumber})` : patientSearch}
                  onChange={(v) => {
                    setPatientSearch(v);
                    if (selectedPatientId && v !== `${selectedPatient?.firstName} ${selectedPatient?.lastName} (${selectedPatient?.patientNumber})`) {
                      setSelectedPatientId("");
                      setSelectedPatient(null);
                    }
                  }}
                />
                {patientSearch.length >= 2 && !selectedPatientId && (
                  <div className="mt-2 border rounded-md max-h-60 overflow-y-auto">
                    {loadingAdmissions ? (
                      <div className="p-3 text-sm text-slate-500">Loading admitted patients...</div>
                    ) : filteredAdmitted.length === 0 && searchedPatients.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500">No matching admitted patients found.</div>
                    ) : (
                      <>
                        {filteredAdmitted.map((p: any) => (
                          <button
                            key={p.id}
                            onClick={() => selectPatient(p)}
                            className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0"
                          >
                            <div className="font-medium text-slate-900">
                              {p.firstName} {p.lastName}
                              <span className="ml-2 text-xs text-slate-500">{p.patientNumber}</span>
                            </div>
                            <div className="text-xs text-slate-500">
                              {p.admissionNumber} • {p.ward || "—"} / Bed {p.bed || "—"}
                            </div>
                          </button>
                        ))}
                        {filteredAdmitted.length === 0 && searchedPatients.slice(0, 5).map((p: any) => (
                          <button
                            key={p.id}
                            onClick={() => selectPatient({ ...p, admissionId: "", admissionNumber: "", encounterId: "", ward: null, bed: null })}
                            className="w-full text-left p-2 hover:bg-amber-50 text-sm border-b last:border-0"
                          >
                            <div className="font-medium text-slate-900">
                              {p.firstName} {p.lastName}
                              <span className="ml-2 text-xs text-slate-500">{p.patientNumber}</span>
                            </div>
                            <div className="text-xs text-amber-700">Not currently admitted — record anyway</div>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              {selectedPatient && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900">
                      {selectedPatient.firstName} {selectedPatient.lastName}
                      <span className="ml-2 text-xs text-slate-600">{selectedPatient.patientNumber}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {selectedPatient.sex || "—"}, {calculateAge(selectedPatient.dateOfBirth)}y
                      {selectedPatient.admissionNumber && ` • ${selectedPatient.admissionNumber}`}
                      {selectedPatient.ward && ` • ${selectedPatient.ward} / Bed ${selectedPatient.bed || "—"}`}
                    </div>
                  </div>
                  {can("clinical.create") && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setShowNewIntake(true)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 h-8"><Plus className="w-3.5 h-3.5" /> Intake</Button>
                      <Button size="sm" onClick={() => setShowNewOutput(true)} className="gap-1.5 bg-amber-600 hover:bg-amber-700 h-8"><Plus className="w-3.5 h-3.5" /> Output</Button>
                      <Button size="sm" onClick={() => setShowMonitoring(true)} variant="outline" className="gap-1.5 h-8"><Settings2 className="w-3.5 h-3.5" /> Monitor</Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {!selectedPatientId ? (
            <Card><CardContent className="p-6">
              <EmptyState
                title="Select a patient to view fluid balance"
                description="Pick an admitted patient to record and review their intake/output, hourly balance, urine, drains, and missing entries."
                icon={Droplets}
              />
            </CardContent></Card>
          ) : (
            <PatientBalancePanel
              patient={selectedPatient}
              facilityId={activeFacilityId || ""}
              canAmend={canAmend}
              canSign={canSign}
              canRecord={can("clinical.create")}
              onInvalidate={invalidateAll}
            />
          )}
        </TabsContent>

        {/* ============================================================ */}
        {/* WARD VIEW */}
        {/* ============================================================ */}
        <TabsContent value="ward" className="space-y-4">
          <WardBulkView facilityId={activeFacilityId} onSelectPatient={(p) => selectPatient(p)} />
        </TabsContent>

        {/* ============================================================ */}
        {/* HANDOVER */}
        {/* ============================================================ */}
        <TabsContent value="handover" className="space-y-4">
          <HandoverPanel facilityId={activeFacilityId} />
        </TabsContent>

        {/* ============================================================ */}
        {/* ALERTS */}
        {/* ============================================================ */}
        <TabsContent value="alerts" className="space-y-4">
          <AlertsPanel facilityId={activeFacilityId} canAck={can("clinical.edit") || can("clinical.sign")} />
        </TabsContent>

        {/* ============================================================ */}
        {/* CONFIG */}
        {/* ============================================================ */}
        <TabsContent value="config" className="space-y-4">
          <AlertConfigPanel facilityId={activeFacilityId} />
        </TabsContent>

        {/* ============================================================ */}
        {/* REPORTS */}
        {/* ============================================================ */}
        <TabsContent value="reports" className="space-y-4">
          <ReportsPanel facilityId={activeFacilityId} patient={selectedPatient} />
        </TabsContent>
      </Tabs>

      {showNewIntake && selectedPatient && (
        <NewEntryDialog
          entryType="intake"
          patient={selectedPatient}
          facilityId={activeFacilityId || ""}
          onClose={() => setShowNewIntake(false)}
          onSaved={() => { setShowNewIntake(false); invalidateAll(); }}
        />
      )}
      {showNewOutput && selectedPatient && (
        <NewEntryDialog
          entryType="output"
          patient={selectedPatient}
          facilityId={activeFacilityId || ""}
          onClose={() => setShowNewOutput(false)}
          onSaved={() => { setShowNewOutput(false); invalidateAll(); }}
        />
      )}
      {showMonitoring && selectedPatient && (
        <MonitoringDialog
          patient={selectedPatient}
          facilityId={activeFacilityId || ""}
          onClose={() => setShowMonitoring(false)}
          onSaved={() => { setShowMonitoring(false); invalidateAll(); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// DASHBOARD — facility-wide stats
// =====================================================================
function IODashboard({ facilityId }: { facilityId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["io-stats", facilityId],
    queryFn: () => fetchJson(`/api/intake-output/stats?facilityId=${facilityId || ""}`),
  });
  if (isLoading) return <LoadingState rows={4} />;
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <MiniStatCard label="Today's Intake" value={fmtMl(data.todayIntakeMl)} icon={TrendingUp} gradient="from-emerald-500 to-emerald-600" />
      <MiniStatCard label="Today's Output" value={fmtMl(data.todayOutputMl)} icon={TrendingDown} gradient="from-amber-500 to-amber-600" />
      <MiniStatCard label="Today's Net" value={fmtSignedMl(data.todayNetMl)} icon={Activity} gradient="from-teal-500 to-cyan-600" />
      <MiniStatCard label="Entries Today" value={data.todayEntries} icon={ClipboardList} gradient="from-blue-500 to-blue-600" />
      <MiniStatCard label="Patients Monitored" value={data.patientsMonitoredToday} icon={Stethoscope} gradient="from-violet-500 to-violet-600" />
      <MiniStatCard label="Active Monitoring" value={data.activeMonitoringPeriods} icon={Play} gradient="from-cyan-500 to-cyan-600" />
      <MiniStatCard label="Missing Entries" value={data.missingEntryPatients} icon={AlertCircle} gradient="from-rose-500 to-rose-600" />
      <MiniStatCard label="Active Alerts" value={data.activeAlerts} icon={BellRing} gradient="from-amber-500 to-orange-600" />
      <MiniStatCard label="Critical Alerts" value={data.criticalAlerts} icon={AlertCircle} gradient="from-rose-600 to-rose-700" />
      <MiniStatCard label="Ack'd Today" value={data.acknowledgedToday} icon={ListChecks} gradient="from-emerald-500 to-emerald-600" />
    </div>
  );
}

// =====================================================================
// PATIENT BALANCE PANEL — comprehensive per-patient view
// =====================================================================
function PatientBalancePanel({ patient, facilityId, canAmend, canSign, canRecord, onInvalidate }: any) {
  const [balanceTab, setBalanceTab] = useState("summary");
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().slice(0, 10));

  // Summary (today, 24h, urine, drain, ng, missing, monitoring period)
  const { data: summaryData, isLoading: loadingSummary, isError: summaryErr, refetch: refetchSummary } = useQuery({
    queryKey: ["io-summary", patient.id],
    queryFn: () => fetchJson(`/api/intake-output?patientId=${patient.id}&admissionId=${patient.admissionId || ""}&view=summary`),
    enabled: !!patient.id,
    refetchInterval: 30000,
  });

  // Hourly for selected date
  const { data: hourlyData, isLoading: loadingHourly } = useQuery({
    queryKey: ["io-hourly", patient.id, dateFilter],
    queryFn: () => fetchJson(`/api/intake-output?patientId=${patient.id}&admissionId=${patient.admissionId || ""}&view=hourly&date=${dateFilter}`),
    enabled: !!patient.id && balanceTab === "hourly",
  });

  // Shift totals for selected date
  const { data: shiftData, isLoading: loadingShift } = useQuery({
    queryKey: ["io-shift", patient.id, dateFilter],
    queryFn: () => fetchJson(`/api/intake-output?patientId=${patient.id}&admissionId=${patient.admissionId || ""}&view=shift&date=${dateFilter}`),
    enabled: !!patient.id && balanceTab === "shift",
  });

  // Rolling 24h
  const { data: rollingData } = useQuery({
    queryKey: ["io-rolling", patient.id],
    queryFn: () => fetchJson(`/api/intake-output?patientId=${patient.id}&view=rolling24h`),
    enabled: !!patient.id && balanceTab === "rolling",
  });

  // Cumulative (admission-scoped)
  const { data: cumulativeData, isLoading: loadingCumulative } = useQuery({
    queryKey: ["io-cumulative", patient.id, patient.admissionId],
    queryFn: () => fetchJson(`/api/intake-output?patientId=${patient.id}&admissionId=${patient.admissionId || ""}&view=cumulative`),
    enabled: !!patient.id && balanceTab === "cumulative" && !!patient.admissionId,
  });

  // Full entries list with filters
  const { data: entriesData, isLoading: loadingEntries } = useQuery({
    queryKey: ["io-entries", patient.id],
    queryFn: () => fetchJson(`/api/intake-output?patientId=${patient.id}&view=list&limit=500`),
    enabled: !!patient.id && balanceTab === "entries",
  });

  if (loadingSummary) return <LoadingState rows={5} />;
  if (summaryErr) return <ErrorState message="Failed to load fluid balance summary" onRetry={() => refetchSummary()} />;

  const s = summaryData?.summary || {};
  const today = s.today || {};
  const rolling = s.rolling24h || {};
  const monitoring = s.monitoringPeriod;

  return (
    <div className="space-y-4">
      {/* Summary stats — Today + Rolling 24h */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-emerald-600" /> Today Intake</div>
            <div className="text-lg font-bold text-emerald-700 mt-1">{fmtMl(today.intake)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1"><TrendingDown className="w-3 h-3 text-amber-600" /> Today Output</div>
            <div className="text-lg font-bold text-amber-700 mt-1">{fmtMl(today.output)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1"><Activity className="w-3 h-3 text-teal-600" /> Today Net</div>
            <div className={`text-lg font-bold mt-1 ${(today.net || 0) >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSignedMl(today.net)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3 text-blue-600" /> 24h Net</div>
            <div className={`text-lg font-bold mt-1 ${(rolling.net || 0) >= 0 ? "text-blue-700" : "text-rose-700"}`}>{fmtSignedMl(rolling.net)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1"><Beaker className="w-3 h-3 text-violet-600" /> 24h Urine</div>
            <div className="text-lg font-bold text-violet-700 mt-1">{fmtMl(rolling.urine)}</div>
            <div className="text-[10px] text-slate-500">{rolling.urinePerHour ? `${rolling.urinePerHour.toFixed(0)} ml/h` : "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1"><AlertCircle className="w-3 h-3 text-rose-600" /> Missing</div>
            <div className={`text-lg font-bold mt-1 ${s.missingCount > 0 ? "text-rose-700" : "text-emerald-700"}`}>{s.missingCount || 0}</div>
            <div className="text-[10px] text-slate-500">slots in 24h</div>
          </CardContent>
        </Card>
      </div>

      {/* Monitoring period banner */}
      {monitoring ? (
        <Card>
          <CardContent className="p-3 bg-cyan-50 border-cyan-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 capitalize"><Play className="w-3 h-3 mr-1" /> Monitoring Active</Badge>
                <span className="text-slate-700 capitalize">{monitoring.monitoringLevel}</span>
                <span className="text-slate-500">• Interval: {monitoring.intervalMinutes} min</span>
                <span className="text-slate-500">• Started {formatRelative(monitoring.startedAt)}</span>
                {monitoring.dailyTargetMl && <span className="text-emerald-700">• Target {fmtMl(monitoring.dailyTargetMl)}</span>}
                {monitoring.dailyLimitMl && <span className="text-rose-700">• Restriction {fmtMl(monitoring.dailyLimitMl)}</span>}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Scale className="w-3.5 h-3.5" /> Weight: {s.weightKg ? `${s.weightKg} kg` : "—"}
                {s.weightSource && <span>(from vitals, {formatRelative(s.weightSource.recordedAt)})</span>}
              </div>
            </div>
            {rolling.urinePerKgPerHour != null && s.weightKg && (
              <div className="mt-2 text-xs text-slate-600">
                Urine output (weight-based): <span className="font-medium text-violet-700">{rolling.urinePerKgPerHour.toFixed(2)} ml/kg/h</span> (24h window, weight {s.weightKg} kg)
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="p-3 bg-amber-50 border-amber-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-amber-700">
              <AlertCircle className="w-4 h-4 inline mr-1" /> No active monitoring period — missing-entry detection and shift totals use defaults. Start a monitoring period to enable accurate tracking.
            </div>
          </div>
        </CardContent></Card>
      )}

      {/* Missing entries */}
      {s.missingSlots && s.missingSlots.length > 0 && (
        <Card>
          <CardContent className="p-3 bg-rose-50 border-rose-200">
            <div className="text-sm font-medium text-rose-700 mb-1 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" /> Missing I&O entries ({s.missingSlots.length} slots in last 24h)
            </div>
            <div className="text-xs text-rose-700 flex flex-wrap gap-2">
              {s.missingSlots.slice(-6).map((slot: any, i: number) => (
                <Badge key={i} variant="outline" className="bg-white text-rose-700 border-rose-200 text-[10px]">
                  {new Date(slot.start).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </Badge>
              ))}
              {s.missingSlots.length > 6 && <span className="text-rose-700">+{s.missingSlots.length - 6} more</span>}
            </div>
            <div className="text-[10px] text-rose-600 mt-1">⚠ Missing entries are NOT treated as 0 mL — they are undocumented periods requiring attention.</div>
          </CardContent>
        </Card>
      )}

      {/* Last entry */}
      {s.lastEntry && (
        <Card>
          <CardContent className="p-3 bg-slate-50">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Last entry</div>
            <div className="text-sm mt-1">
              <Badge className={`text-[10px] mr-2 ${ENTRY_TYPE_COLOR[s.lastEntry.entryType] || ""}`}>{s.lastEntry.entryType}</Badge>
              <span className="font-medium">{fmtMl(s.lastEntry.amount)}</span>
              <span className="ml-2 text-slate-600">{s.lastEntry.category || s.lastEntry.source}</span>
              <span className="ml-2 text-xs text-slate-500">{formatRelative(s.lastEntry.eventAt)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed balance tabs */}
      <Tabs value={balanceTab} onValueChange={setBalanceTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="summary" className="gap-1.5"><Activity className="w-4 h-4" /> Summary</TabsTrigger>
          <TabsTrigger value="hourly" className="gap-1.5"><Clock className="w-4 h-4" /> Hourly</TabsTrigger>
          <TabsTrigger value="shift" className="gap-1.5"><ClipboardList className="w-4 h-4" /> Shift</TabsTrigger>
          <TabsTrigger value="rolling" className="gap-1.5"><RefreshCcw className="w-4 h-4" /> 24h Rolling</TabsTrigger>
          <TabsTrigger value="cumulative" className="gap-1.5"><TrendingUp className="w-4 h-4" /> Cumulative</TabsTrigger>
          <TabsTrigger value="entries" className="gap-1.5"><ListChecks className="w-4 h-4" /> All Entries</TabsTrigger>
        </TabsList>

        {/* SUMMARY TAB */}
        <TabsContent value="summary" className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm font-semibold text-slate-700 mb-2">Today's Breakdown</div>
                <BreakdownRow label="Oral intake" value={today.intake} color="emerald" />
                <BreakdownRow label="Urine output" value={today.urine} color="violet" />
                <BreakdownRow label="Drain output" value={today.drains} color="amber" />
                <BreakdownRow label="NG / GI losses" value={(today.ng || 0) + (today.vomit || 0)} color="rose" />
                <div className="border-t mt-2 pt-2 flex justify-between text-sm">
                  <span className="font-medium text-slate-700">Net balance</span>
                  <span className={`font-bold ${(today.net || 0) >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSignedMl(today.net)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm font-semibold text-slate-700 mb-2">Rolling 24h Breakdown</div>
                <BreakdownRow label="Total intake" value={rolling.intake} color="emerald" />
                <BreakdownRow label="Total output" value={rolling.output} color="amber" />
                <BreakdownRow label="Urine output" value={rolling.urine} color="violet" />
                <BreakdownRow label="Drain output" value={rolling.drains} color="amber" />
                <BreakdownRow label="NG / GI losses" value={(rolling.ng || 0) + (rolling.vomit || 0)} color="rose" />
                <div className="border-t mt-2 pt-2 flex justify-between text-sm">
                  <span className="font-medium text-slate-700">Net balance</span>
                  <span className={`font-bold ${(rolling.net || 0) >= 0 ? "text-blue-700" : "text-rose-700"}`}>{fmtSignedMl(rolling.net)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick trend chart (7-day) */}
          <QuickTrendChart patientId={patient.id} />
        </TabsContent>

        {/* HOURLY TAB */}
        <TabsContent value="hourly" className="space-y-3">
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-40" />
              {hourlyData?.summary && (
                <div className="text-xs text-slate-500 ml-auto">
                  Coverage: {hourlyData.summary.coveragePct}% ({hourlyData.summary.recordedHours}/24h)
                </div>
              )}
            </CardContent>
          </Card>

          {loadingHourly ? <LoadingState rows={6} /> : (
            <>
              {/* Hourly chart */}
              {hourlyData?.hourly && (
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm font-semibold text-slate-700 mb-3">Hourly Intake vs Output</div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hourlyData.hourly.map((h: any) => ({ ...h, hour: h.hour.slice(0, 2) }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="intake" name="Intake (ml)" fill="#10b981" />
                          <Bar dataKey="output" name="Output (ml)" fill="#f59e0b" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Hourly table */}
              {hourlyData?.hourly && (
                <Card>
                  <CardContent className="p-0">
                    <div className="p-3 border-b bg-slate-50">
                      <h3 className="text-sm font-semibold text-slate-700">Hourly Breakdown — {dateFilter}</h3>
                    </div>
                    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="border-b bg-slate-50 sticky top-0">
                          <tr>
                            <th className="text-left p-2 font-semibold text-slate-700">Hour</th>
                            <th className="text-right p-2 font-semibold text-slate-700">Intake (ml)</th>
                            <th className="text-right p-2 font-semibold text-slate-700">Output (ml)</th>
                            <th className="text-right p-2 font-semibold text-slate-700">Net (ml)</th>
                            <th className="text-center p-2 font-semibold text-slate-700">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hourlyData.hourly.map((h: any) => (
                            <tr key={h.hour} className={`border-b hover:bg-slate-50 ${h.entries === 0 ? "bg-rose-50/40" : ""}`}>
                              <td className="p-2 text-slate-900 font-mono">{h.hour}</td>
                              <td className="p-2 text-right text-emerald-700 font-medium">{h.intake == null ? "—" : h.intake.toLocaleString()}</td>
                              <td className="p-2 text-right text-amber-700 font-medium">{h.output == null ? "—" : h.output.toLocaleString()}</td>
                              <td className={`p-2 text-right font-medium ${h.net == null ? "text-slate-400" : h.net >= 0 ? "text-teal-700" : "text-rose-700"}`}>
                                {h.net == null ? "—" : (h.net >= 0 ? "+" : "") + h.net.toLocaleString()}
                              </td>
                              <td className="p-2 text-center">
                                {h.entries === 0 ? (
                                  <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 text-[10px]">MISSING</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 text-[10px]">{h.entries} entr{h.entries === 1 ? "y" : "ies"}</Badge>
                                )}
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
          )}
        </TabsContent>

        {/* SHIFT TAB */}
        <TabsContent value="shift" className="space-y-3">
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-40" />
            </CardContent>
          </Card>
          {loadingShift ? <LoadingState rows={3} /> : shiftData?.shiftTotals && (
            <div className="grid md:grid-cols-3 gap-3">
              {shiftData.shiftTotals.map((s: any) => (
                <Card key={s.shift}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold capitalize text-slate-700">{s.shift}</div>
                      {s.missing ? (
                        <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 text-[10px]">MISSING</Badge>
                      ) : (
                        <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 text-[10px]">{s.entryCount} entries</Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{s.start} – {s.end}</div>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-slate-600">Intake</span><span className="text-emerald-700 font-medium">{fmtMl(s.intake)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600">Output</span><span className="text-amber-700 font-medium">{fmtMl(s.output)}</span></div>
                      <div className="flex justify-between border-t pt-1"><span className="font-medium text-slate-700">Net</span><span className={`font-bold ${s.net >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSignedMl(s.net)}</span></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ROLLING 24h TAB */}
        <TabsContent value="rolling" className="space-y-3">
          {rollingData && (
            <Card>
              <CardContent className="p-4">
                <div className="text-sm font-semibold text-slate-700 mb-3">Rolling 24-hour Balance (last 24h)</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-emerald-50 p-3 rounded"><div className="text-xs text-slate-500">Total Intake</div><div className="text-xl font-bold text-emerald-700">{fmtMl(rollingData.summary?.totalIntake)}</div></div>
                  <div className="bg-amber-50 p-3 rounded"><div className="text-xs text-slate-500">Total Output</div><div className="text-xl font-bold text-amber-700">{fmtMl(rollingData.summary?.totalOutput)}</div></div>
                  <div className="bg-teal-50 p-3 rounded"><div className="text-xs text-slate-500">Net Balance</div><div className={`text-xl font-bold ${(rollingData.summary?.netBalance || 0) >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSignedMl(rollingData.summary?.netBalance)}</div></div>
                  <div className="bg-violet-50 p-3 rounded"><div className="text-xs text-slate-500">Urine Output</div><div className="text-xl font-bold text-violet-700">{fmtMl(rollingData.summary?.urineOutput)}</div><div className="text-[10px] text-slate-500">{rollingData.summary?.urinePerHour ? `${rollingData.summary.urinePerHour.toFixed(0)} ml/h` : "—"}</div></div>
                </div>
                {rollingData.summary?.byCategory && Object.keys(rollingData.summary.byCategory).length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs text-slate-500 uppercase mb-2">By category</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.entries(rollingData.summary.byCategory).map(([cat, v]: any) => (
                        <div key={cat} className="border rounded p-2 text-xs">
                          <div className="font-medium capitalize text-slate-700">{cat.replace(/_/g, " ")}</div>
                          <div className="text-emerald-700">+{v.intake.toLocaleString()} ml in</div>
                          <div className="text-amber-700">−{v.output.toLocaleString()} ml out</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* CUMULATIVE TAB */}
        <TabsContent value="cumulative" className="space-y-3">
          {loadingCumulative ? <LoadingState rows={4} /> : cumulativeData?.cumulative && (
            <>
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm font-semibold text-slate-700 mb-3">Admission Cumulative Balance</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-3 rounded"><div className="text-xs text-slate-500">Days monitored</div><div className="text-xl font-bold text-slate-700">{cumulativeData.summary.dayCount}</div></div>
                    <div className="bg-emerald-50 p-3 rounded"><div className="text-xs text-slate-500">Total intake</div><div className="text-xl font-bold text-emerald-700">{fmtMl(cumulativeData.summary.totalIntake)}</div></div>
                    <div className="bg-amber-50 p-3 rounded"><div className="text-xs text-slate-500">Total output</div><div className="text-xl font-bold text-amber-700">{fmtMl(cumulativeData.summary.totalOutput)}</div></div>
                    <div className="bg-teal-50 p-3 rounded"><div className="text-xs text-slate-500">Cumulative net</div><div className={`text-xl font-bold ${(cumulativeData.summary.cumulative || 0) >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSignedMl(cumulativeData.summary.cumulative)}</div></div>
                  </div>
                </CardContent>
              </Card>
              {cumulativeData.cumulative.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm font-semibold text-slate-700 mb-3">Cumulative Balance Trend</div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={cumulativeData.cumulative}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="cumulative" name="Cumulative (ml)" stroke="#0d9488" strokeWidth={2} />
                          <Line type="monotone" dataKey="net" name="Daily net (ml)" stroke="#6366f1" strokeWidth={1} strokeDasharray="3 3" />
                          <ReferenceLine y={0} stroke="#94a3b8" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="p-0">
                  <div className="p-3 border-b bg-slate-50"><h3 className="text-sm font-semibold text-slate-700">Daily Breakdown</h3></div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Intake (ml)</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Output (ml)</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Net (ml)</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Cumulative (ml)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cumulativeData.cumulative.map((d: any) => (
                          <tr key={d.date} className="border-b hover:bg-slate-50">
                            <td className="p-3 text-slate-900">{formatDate(d.date)}</td>
                            <td className="p-3 text-right text-emerald-700 font-medium">{d.intake.toLocaleString()}</td>
                            <td className="p-3 text-right text-amber-700 font-medium">{d.output.toLocaleString()}</td>
                            <td className={`p-3 text-right font-medium ${d.net >= 0 ? "text-teal-700" : "text-rose-700"}`}>{d.net >= 0 ? "+" : ""}{d.net.toLocaleString()}</td>
                            <td className={`p-3 text-right font-bold ${d.cumulative >= 0 ? "text-teal-700" : "text-rose-700"}`}>{d.cumulative >= 0 ? "+" : ""}{d.cumulative.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
          {!patient.admissionId && (
            <Card><CardContent className="p-6"><EmptyState title="No admission linked" description="Cumulative balance requires a linked admission to scope the calculation correctly." icon={AlertCircle} /></CardContent></Card>
          )}
        </TabsContent>

        {/* ENTRIES TAB */}
        <TabsContent value="entries" className="space-y-3">
          {loadingEntries ? <LoadingState rows={6} /> : (
            <EntriesTable
              entries={entriesData?.items || []}
              patientId={patient.id}
              canAmend={canAmend}
              canSign={canSign}
              onInvalidate={onInvalidate}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---- Breakdown row helper ----
function BreakdownRow({ label, value, color }: { label: string; value: number | null | undefined; color: string }) {
  const colorClass: Record<string, string> = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    violet: "text-violet-700",
    rose: "text-rose-700",
    teal: "text-teal-700",
  };
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-slate-600">{label}</span>
      <span className={`font-medium ${colorClass[color] || "text-slate-700"}`}>{fmtMl(value)}</span>
    </div>
  );
}

// ---- Quick 7-day trend chart ----
function QuickTrendChart({ patientId }: { patientId: string }) {
  const { data } = useQuery({
    queryKey: ["io-trend", patientId],
    queryFn: () => fetchJson(`/api/intake-output/reports?type=trend&patientId=${patientId}&days=7`),
    enabled: !!patientId,
  });
  if (!data?.trend || data.trend.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm font-semibold text-slate-700 mb-3">7-Day Trend</div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="intake" name="Intake (ml)" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="output" name="Output (ml)" stroke="#f59e0b" strokeWidth={2} />
              <Line type="monotone" dataKey="cumulative" name="Cumulative (ml)" stroke="#0d9488" strokeWidth={2} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// ENTRIES TABLE — with filters, amend/verify/cancel actions
// =====================================================================
function EntriesTable({ entries, patientId, canAmend, canSign, onInvalidate }: any) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [amendTarget, setAmendTarget] = useState<any | null>(null);

  const filtered = entries.filter((e: any) => {
    if (typeFilter !== "all" && e.entryType !== typeFilter) return false;
    if (categoryFilter !== "all" && (e.category || e.fluidType) !== categoryFilter) return false;
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${e.source || ""} ${e.notes || ""} ${e.category || ""} ${e.fluidType || ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const allCategories = Array.from(new Set(entries.map((e: any) => e.category || e.fluidType).filter(Boolean)));

  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-3 border-b bg-slate-50 flex flex-wrap gap-2 items-center">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="intake">Intake</SelectItem>
              <SelectItem value="output">Output</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {allCategories.map((c: any) => <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="recorded">Recorded</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="amended">Amended</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <ClearableSearch value={search} onChange={setSearch} placeholder="Search source / notes..." className="w-56" inputClassName="h-8 text-xs" />
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => {
              const url = `/api/intake-output/export?patientId=${patientId}&format=csv`;
              window.open(url, "_blank");
            }}>
              <Download className="w-3.5 h-3.5" /> CSV
            </Button>
            <div className="text-xs text-slate-500">{filtered.length} of {entries.length} entries</div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6"><EmptyState title="No entries match filters" icon={ListChecks} /></div>
        ) : (
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-semibold text-slate-700">Event Time</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Category</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Source</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Route</th>
                  <th className="text-right p-2 font-semibold text-slate-700">Amount</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Recorded By</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e: any) => {
                  const isLateEntry = e.eventAt && e.recordedAt && new Date(e.recordedAt).getTime() - new Date(e.eventAt).getTime() > 5 * 60 * 1000;
                  return (
                    <tr key={e.id} className={`border-b hover:bg-slate-50 ${e.status === "cancelled" ? "opacity-50" : ""}`}>
                      <td className="p-2">
                        <div className="text-slate-900">{formatDate(e.eventAt, true)}</div>
                        {isLateEntry && <div className="text-[9px] text-amber-700">late entry</div>}
                      </td>
                      <td className="p-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${ENTRY_TYPE_COLOR[e.entryType] || ""}`}>{e.entryType}</span>
                      </td>
                      <td className="p-2 capitalize text-slate-700">{(e.category || e.fluidType || "—").replace(/_/g, " ")}</td>
                      <td className="p-2 text-slate-700 max-w-[160px] truncate">
                        {e.source || "—"}
                        {e.drainLabel && <span className="ml-1 text-[10px] text-slate-500">[{e.drainLabel}]</span>}
                      </td>
                      <td className="p-2 capitalize text-slate-700">{e.route?.replace(/_/g, " ") || "—"}</td>
                      <td className={`p-2 text-right font-medium ${e.entryType === "intake" ? "text-emerald-700" : "text-amber-700"}`}>
                        {e.amount.toLocaleString()}
                        <span className="text-[9px] text-slate-500 ml-0.5">{e.unit}</span>
                        {e.measurementType === "estimated" && <span className="text-[9px] text-amber-700 ml-1">(est.)</span>}
                        {e.originalAmount != null && e.originalAmount !== e.amount && (
                          <div className="text-[9px] text-slate-500 line-through">{e.originalAmount.toLocaleString()}</div>
                        )}
                      </td>
                      <td className="p-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${ENTRY_STATUS_COLOR[e.status] || ""}`}>{e.status}</span>
                      </td>
                      <td className="p-2 text-slate-500">
                        {e.recordedBy ? `${e.recordedBy.firstName} ${e.recordedBy.lastName}` : "—"}
                        <div className="text-[9px] text-slate-400">{formatRelative(e.recordedAt)}</div>
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          {e.status === "recorded" && canSign && (
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] text-blue-600 px-1.5"
                              onClick={async () => {
                                try {
                                  const res = await fetch("/api/intake-output", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: e.id, action: "verify" }) });
                                  if (!res.ok) throw new Error("Failed");
                                  toast.success("Entry verified"); onInvalidate();
                                } catch (err: any) { toast.error(err.message); }
                              }}
                            >Verify</Button>
                          )}
                          {e.status !== "cancelled" && e.status !== "verified" && canAmend && (
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] text-violet-600 px-1.5" onClick={() => setAmendTarget(e)}>Amend</Button>
                          )}
                          {e.status !== "cancelled" && canAmend && (
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] text-rose-600 px-1.5"
                              onClick={async () => {
                                const reason = prompt("Reason for cancelling this entry:");
                                if (!reason) return;
                                try {
                                  const res = await fetch("/api/intake-output", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: e.id, action: "cancel", reason }) });
                                  if (!res.ok) throw new Error("Failed");
                                  toast.success("Entry cancelled"); onInvalidate();
                                } catch (err: any) { toast.error(err.message); }
                              }}
                            >Cancel</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {amendTarget && (
        <AmendDialog entry={amendTarget} onClose={() => setAmendTarget(null)} onSaved={() => { setAmendTarget(null); onInvalidate(); }} />
      )}
    </Card>
  );
}

// =====================================================================
// AMEND DIALOG
// =====================================================================
function AmendDialog({ entry, onClose, onSaved }: any) {
  const [amount, setAmount] = useState(String(entry.amount));
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState(entry.notes || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { toast.error("Reason is required for amendment"); return; }
    if (Number(amount) < 0) { toast.error("Amount must be non-negative"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/intake-output", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: entry.id, action: "amend", amount: Number(amount), reason, notes }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Entry amended — original value preserved in audit log");
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle>Amend Entry</DialogTitle>
          <DialogDescription className="text-white/80">
            Original amount: <span className="font-medium text-slate-700">{entry.amount.toLocaleString()} {entry.unit}</span>
            <br />The original value will be preserved in <span className="font-medium">originalAmount</span> and the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>New Amount ({entry.unit || "ml"})</FieldLabel>
            <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <FieldLabel required>Reason for Amendment</FieldLabel>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g., Volume misread at bedside; correct value verified with charge nurse." />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-violet-600 hover:bg-violet-700 gap-2">
            {saving ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <PenLineIcon />} Amend Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function PenLineIcon() { return <span className="text-xs">✎</span>; }

// =====================================================================
// NEW ENTRY DIALOG — rich structured form for intake or output
// =====================================================================
function NewEntryDialog({ entryType, patient, facilityId, onClose, onSaved }: any) {
  const qc = useQueryClient();
  const isIntake = entryType === "intake";
  const categories = isIntake ? INTAKE_CATEGORIES : OUTPUT_CATEGORIES;
  const routes = isIntake ? INTAKE_ROUTES : OUTPUT_ROUTES;

  const defaultCategory = categories[0].value;
  const [form, setForm] = useState<any>({
    entryType,
    category: defaultCategory,
    source: "",
    route: routes[0].value,
    collectionMethod: "measured_volume",
    drainLabel: "",
    catheterStatus: "none",
    measurementType: "measured",
    amount: "",
    unit: "ml",
    eventAt: "", // empty = now
    notes: "",
    status: "recorded",
  });
  const [saving, setSaving] = useState(false);
  const [showIvCalc, setShowIvCalc] = useState(false);

  // Fetch last entry of same type for "Copy Last" quick action
  const { data: lastEntryData } = useQuery({
    queryKey: ["io-last-entry", patient.id, entryType],
    queryFn: () => fetchJson(`/api/intake-output?patientId=${patient.id}&view=list&limit=1`),
    enabled: !!patient.id,
  });
  const lastEntry = (lastEntryData?.items || []).find((e: any) => e.entryType === entryType);

  const copyLast = () => {
    if (!lastEntry) return;
    setForm({
      ...form,
      category: lastEntry.category || form.category,
      source: lastEntry.source || "",
      route: lastEntry.route || form.route,
      collectionMethod: lastEntry.collectionMethod || form.collectionMethod,
      drainLabel: lastEntry.drainLabel || "",
      catheterStatus: lastEntry.catheterStatus || form.catheterStatus,
      measurementType: lastEntry.measurementType || form.measurementType,
      amount: String(lastEntry.amount),
      unit: lastEntry.unit || "ml",
      notes: lastEntry.notes || "",
    });
    toast.success("Copied from last entry — review and save");
  };

  // IV rate calculator: total volume ÷ hours = ml/h
  const [ivTotalVolume, setIvTotalVolume] = useState("");
  const [ivHours, setIvHours] = useState("");
  const ivRate = ivTotalVolume && ivHours ? (Number(ivTotalVolume) / Number(ivHours)).toFixed(1) : null;
  const applyIvRate = () => {
    if (!ivRate) return;
    setForm({ ...form, amount: String(Math.round(Number(ivRate))), source: form.source || `IV fluid ${ivTotalVolume}ml over ${ivHours}h`, category: "iv", route: "iv" });
    setShowIvCalc(false);
    toast.success(`Applied rate: ${ivRate} ml/h`);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        patientId: patient.id,
        encounterId: patient.encounterId || undefined,
        admissionId: patient.admissionId || undefined,
        facilityId,
        entryType: form.entryType,
        category: form.category,
        fluidType: form.category, // legacy compat
        source: form.source || undefined,
        route: form.route || undefined,
        collectionMethod: !isIntake ? form.collectionMethod : undefined,
        drainLabel: form.category === "drains" ? form.drainLabel || undefined : undefined,
        catheterStatus: form.category === "urine" ? form.catheterStatus || undefined : undefined,
        measurementType: form.measurementType,
        unit: form.unit,
        amount: Number(form.amount),
        eventAt: form.eventAt ? new Date(form.eventAt).toISOString() : undefined,
        notes: form.notes || undefined,
        status: form.status,
      };
      const res = await fetch("/api/intake-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success(`${isIntake ? "Intake" : "Output"} entry recorded`);
      qc.invalidateQueries({ queryKey: ["io-summary", patient.id] });
      qc.invalidateQueries({ queryKey: ["io-entries", patient.id] });
      qc.invalidateQueries({ queryKey: ["io-stats", facilityId] });
      qc.invalidateQueries({ queryKey: ["io-ward", facilityId] });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedCat = categories.find((c) => c.value === form.category);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className={`px-6 pt-6 pb-3 shrink-0 border-b ${isIntake ? "bg-emerald-50" : "bg-amber-50"}`}>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isIntake ? <TrendingUp className="w-5 h-5 text-emerald-600" /> : <TrendingDown className="w-5 h-5 text-amber-600" />}
            Record {isIntake ? "Intake" : "Output"} Entry
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Patient: {patient.firstName} {patient.lastName} ({patient.patientNumber})
          </DialogDescription>
          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 mt-2">
            {lastEntry && (
              <Button size="sm" variant="outline" onClick={copyLast} className="h-7 text-xs gap-1.5 bg-white">
                <Copy className="w-3 h-3" /> Copy last {entryType} entry ({lastEntry.amount} {lastEntry.unit})
              </Button>
            )}
            {isIntake && (
              <Button size="sm" variant="outline" onClick={() => setShowIvCalc(!showIvCalc)} className="h-7 text-xs gap-1.5 bg-white">
                <Calculator className="w-3 h-3" /> IV Rate Calculator
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* IV Rate Calculator (collapsible) */}
        {isIntake && showIvCalc && (
          <div className="px-6 py-3 border-b bg-blue-50">
            <div className="text-xs font-medium text-blue-900 mb-2 flex items-center gap-1.5"><Calculator className="w-3.5 h-3.5" /> IV Flow Rate Calculator</div>
            <div className="grid grid-cols-4 gap-2 items-end">
              <div>
                <Label className="text-[10px]">Total volume (ml)</Label>
                <Input type="number" min="0" value={ivTotalVolume} onChange={(e) => setIvTotalVolume(e.target.value)} placeholder="e.g., 1000" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px]">Over (hours)</Label>
                <Input type="number" min="0" step="0.5" value={ivHours} onChange={(e) => setIvHours(e.target.value)} placeholder="e.g., 8" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px]">Rate</Label>
                <div className="h-8 flex items-center font-bold text-blue-700 text-sm">{ivRate ? `${ivRate} ml/h` : "—"}</div>
              </div>
              <Button size="sm" onClick={applyIvRate} disabled={!ivRate} className="h-8 bg-blue-600 hover:bg-blue-700">Apply</Button>
            </div>
            <div className="text-[10px] text-blue-700 mt-1">This is a documentation helper only — it calculates the hourly rate to record per hour. The system does NOT prescribe infusion rates.</div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Category</FieldLabel>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v, route: routes.find((r) => r.value === v)?.value || routes[0].value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedCat?.examples && <div className="text-[10px] text-slate-500 mt-1">e.g., {selectedCat.examples}</div>}
            </div>
            <div>
              <FieldLabel required>Route</FieldLabel>
              <Select value={form.route} onValueChange={(v) => setForm({ ...form, route: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {routes.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Source / Fluid Name</Label>
            <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder={isIntake ? "e.g., Normal Saline 0.9%, Water, ORS" : "e.g., Urine, NG aspirate, Surgical drain #1, Vomit"} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel required>Amount</FieldLabel>
              <Input type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="e.g., 250" />
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ml">ml</SelectItem>
                  <SelectItem value="L">L</SelectItem>
                  <SelectItem value="oz">oz</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Measurement</Label>
              <Select value={form.measurementType} onValueChange={(v) => setForm({ ...form, measurementType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEASUREMENT_TYPES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Output-specific fields */}
          {!isIntake && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Collection Method</Label>
                <Select value={form.collectionMethod} onValueChange={(v) => setForm({ ...form, collectionMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLLECTION_METHODS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.category === "urine" && (
                <div>
                  <Label>Catheter Status</Label>
                  <Select value={form.catheterStatus} onValueChange={(v) => setForm({ ...form, catheterStatus: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATHETER_STATUSES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.category === "drains" && (
                <div>
                  <Label>Drain Label</Label>
                  <Input value={form.drainLabel} onChange={(e) => setForm({ ...form, drainLabel: e.target.value })} placeholder="e.g., JP-1, Chest-L, Surgical-R" />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Event Time (when fluid occurred)</Label>
              <Input type="datetime-local" value={form.eventAt} onChange={(e) => setForm({ ...form, eventAt: e.target.value })} />
              <div className="text-[10px] text-slate-500 mt-1">Leave blank for "now". Filling a past time creates a late entry — both event time and documentation time are preserved.</div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recorded">Recorded</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional clinical context (e.g., vomited after lunch, dressing soaked, IV rate changed)..." />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 shrink-0 border-t bg-white">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.amount || Number(form.amount) < 0}
            className={`gap-2 ${isIntake ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}`}
          >
            {mutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Save Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// MONITORING DIALOG — start/end monitoring period + targets
// =====================================================================
function MonitoringDialog({ patient, facilityId, onClose, onSaved }: any) {
  const qc = useQueryClient();
  const { data: periodsData } = useQuery({
    queryKey: ["io-monitoring", patient.id],
    queryFn: () => fetchJson(`/api/intake-output/monitoring?patientId=${patient.id}`),
  });
  const periods = periodsData?.items || [];
  const activePeriod = periods.find((p: any) => p.status === "active");

  const [form, setForm] = useState<any>({
    monitoringLevel: "standard",
    intervalMinutes: 60,
    dailyTargetMl: "",
    dailyLimitMl: "",
    targetSource: "clinician",
    notes: "",
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/intake-output/monitoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          admissionId: patient.admissionId || undefined,
          encounterId: patient.encounterId || undefined,
          facilityId,
          monitoringLevel: form.monitoringLevel,
          intervalMinutes: form.intervalMinutes,
          dailyTargetMl: form.dailyTargetMl ? Number(form.dailyTargetMl) : undefined,
          dailyLimitMl: form.dailyLimitMl ? Number(form.dailyLimitMl) : undefined,
          targetSource: form.targetSource,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Monitoring period started");
      qc.invalidateQueries({ queryKey: ["io-monitoring", patient.id] });
      qc.invalidateQueries({ queryKey: ["io-summary", patient.id] });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const endMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/intake-output/monitoring", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId: activePeriod.id, action: "end" }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Monitoring period ended");
      qc.invalidateQueries({ queryKey: ["io-monitoring", patient.id] });
      qc.invalidateQueries({ queryKey: ["io-summary", patient.id] });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
          <DialogTitle className="flex items-center gap-2 text-white"><Settings2 className="w-5 h-5 text-cyan-600" /> Monitoring Period</DialogTitle>
          <DialogDescription className="text-white/80">Start, end, or update fluid-balance monitoring for this patient.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {activePeriod ? (
            <div className="bg-cyan-50 border border-cyan-200 rounded p-3 text-sm">
              <div className="font-medium text-cyan-700 flex items-center gap-1.5"><Play className="w-4 h-4" /> Active monitoring</div>
              <div className="text-xs text-slate-600 mt-1">
                Level: <span className="capitalize">{activePeriod.monitoringLevel}</span> • Interval: {activePeriod.intervalMinutes} min<br />
                Started: {formatDate(activePeriod.startedAt, true)}<br />
                {activePeriod.dailyTargetMl && <span>Daily target: {fmtMl(activePeriod.dailyTargetMl)}<br /></span>}
                {activePeriod.dailyLimitMl && <span>Fluid restriction: {fmtMl(activePeriod.dailyLimitMl)}<br /></span>}
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-700">
              No active monitoring period. Start one to enable missing-entry detection and shift totals.
            </div>
          )}

          {!activePeriod && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel required>Monitoring Level</FieldLabel>
                  <Select value={form.monitoringLevel} onValueChange={(v) => {
                    const lvl = MONITORING_LEVELS.find((l) => l.value === v);
                    setForm({ ...form, monitoringLevel: v, intervalMinutes: lvl?.interval || 60 });
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONITORING_LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Interval (minutes)</Label>
                  <Select value={String(form.intervalMinutes)} onValueChange={(v) => setForm({ ...form, intervalMinutes: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                      <SelectItem value="240">4 hours</SelectItem>
                      <SelectItem value="480">8 hours</SelectItem>
                      <SelectItem value="720">12 hours</SelectItem>
                      <SelectItem value="1440">24 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Daily Intake Target (ml)</Label>
                  <Input type="number" min="0" value={form.dailyTargetMl} onChange={(e) => setForm({ ...form, dailyTargetMl: e.target.value })} placeholder="e.g., 2000" />
                  <div className="text-[10px] text-slate-500 mt-1">Documented clinical target (optional)</div>
                </div>
                <div>
                  <Label>Fluid Restriction Limit (ml)</Label>
                  <Input type="number" min="0" value={form.dailyLimitMl} onChange={(e) => setForm({ ...form, dailyLimitMl: e.target.value })} placeholder="e.g., 1500" />
                  <div className="text-[10px] text-rose-700 mt-1">Only if clinically documented</div>
                </div>
              </div>
              <div>
                <Label>Target Source</Label>
                <Select value={form.targetSource} onValueChange={(v) => setForm({ ...form, targetSource: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clinician">Clinician order</SelectItem>
                    <SelectItem value="care_plan">Care plan</SelectItem>
                    <SelectItem value="order">Standing order</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
            </>
          )}

          {periods.length > 0 && (
            <div>
              <div className="text-xs uppercase text-slate-500 mb-1">Period history</div>
              <div className="max-h-32 overflow-y-auto border rounded">
                {periods.slice(0, 10).map((p: any) => (
                  <div key={p.id} className="p-2 border-b last:border-0 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium capitalize">{p.monitoringLevel}</span>
                      <Badge className={p.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>{p.status}</Badge>
                    </div>
                    <div className="text-slate-500">{formatDate(p.startedAt, true)} {p.endedAt && `→ ${formatDate(p.endedAt, true)}`}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 shrink-0 border-t bg-white">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {activePeriod ? (
            <Button onClick={() => endMutation.mutate()} disabled={endMutation.isPending} className="gap-2 bg-rose-600 hover:bg-rose-700">
              <StopCircle className="w-4 h-4" /> End Monitoring
            </Button>
          ) : (
            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending} className="gap-2 bg-cyan-600 hover:bg-cyan-700">
              {startMutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start Monitoring
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// WARD BULK VIEW — for nursing supervisors
// =====================================================================
function WardBulkView({ facilityId, onSelectPatient }: any) {
  const [wardFilter, setWardFilter] = useState("all");
  const { data: wardsData } = useQuery({
    queryKey: ["io-wards", facilityId],
    queryFn: () => fetchJson(`/api/wards?facilityId=${facilityId || ""}`),
    enabled: !!facilityId,
  });

  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  if (wardFilter !== "all") params.set("wardId", wardFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["io-ward", facilityId, wardFilter],
    queryFn: () => fetchJson(`/api/intake-output/ward${qs}`),
    enabled: !!facilityId,
    refetchInterval: 60000,
  });

  if (!facilityId) return <Card><CardContent className="p-6"><EmptyState title="Select a facility" icon={AlertCircle} /></CardContent></Card>;
  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load ward view" onRetry={() => refetch()} />;

  const items = data?.items || [];
  const summary = data?.summary || {};

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard label="Patients" value={summary.totalPatients || 0} icon={Stethoscope} gradient="from-violet-500 to-violet-600" />
        <MiniStatCard label="Monitored" value={summary.monitored || 0} icon={Play} gradient="from-cyan-500 to-cyan-600" />
        <MiniStatCard label="Missing entries" value={summary.withMissingEntries || 0} icon={AlertCircle} gradient="from-rose-500 to-rose-600" />
        <MiniStatCard label="Ward net today" value={fmtSignedMl((summary.totalIntakeToday || 0) - (summary.totalOutputToday || 0))} icon={Activity} gradient="from-teal-500 to-cyan-600" />
      </div>

      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <Label className="text-xs">Ward</Label>
          <Select value={wardFilter} onValueChange={setWardFilter}>
            <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All wards</SelectItem>
              {(wardsData?.items || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No admitted patients" icon={Stethoscope} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Bed</th>
                    <th className="text-center p-3 font-semibold text-slate-700">Monitor</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Intake</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Output</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Net</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Urine</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Last Entry</th>
                    <th className="text-center p-3 font-semibold text-slate-700">Status</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => (
                    <tr key={it.patientId} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{it.patient?.firstName} {it.patient?.lastName}</div>
                        <div className="text-[10px] text-slate-500">{it.patient?.patientNumber} • {it.admission?.admissionNumber}</div>
                      </td>
                      <td className="p-3 text-slate-700">
                        <div>{it.ward?.name || "—"}</div>
                        <div className="text-[10px] text-slate-500">Bed {it.bed?.bedNumber || "—"}</div>
                      </td>
                      <td className="p-3 text-center">
                        {it.monitoringStatus === "active" ? (
                          <Badge className="bg-cyan-100 text-cyan-700 text-[10px] capitalize">{it.monitoringLevel}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500 text-[10px]">none</Badge>
                        )}
                      </td>
                      <td className="p-3 text-right text-emerald-700 font-medium">{fmtMl(it.today.intake)}</td>
                      <td className="p-3 text-right text-amber-700 font-medium">{fmtMl(it.today.output)}</td>
                      <td className={`p-3 text-right font-medium ${it.today.net >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSignedMl(it.today.net)}</td>
                      <td className="p-3 text-right text-violet-700 font-medium">{fmtMl(it.today.urine)}</td>
                      <td className="p-3 text-xs text-slate-500">
                        {it.lastEntry ? (
                          <>
                            <Badge className={`text-[9px] mr-1 ${ENTRY_TYPE_COLOR[it.lastEntry.entryType] || ""}`}>{it.lastEntry.entryType}</Badge>
                            {fmtMl(it.lastEntry.amount)} {formatRelative(it.lastEntry.eventAt)}
                          </>
                        ) : "—"}
                      </td>
                      <td className="p-3 text-center">
                        {it.missingEntry ? (
                          <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 text-[10px]">⚠ MISSING</Badge>
                        ) : it.monitoringStatus === "active" ? (
                          <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 text-[10px]">OK</Badge>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onSelectPatient({ id: it.patientId, ...it.patient, admissionId: it.admissionId, admissionNumber: it.admission?.admissionNumber, ward: it.ward?.name, bed: it.bed?.bedNumber, encounterId: null })}>
                          Open <ChevronRight className="w-3 h-3" />
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
    </div>
  );
}

// =====================================================================
// ALERTS PANEL
// =====================================================================
function AlertsPanel({ facilityId, canAck }: any) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("active");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["io-alerts", facilityId, statusFilter],
    queryFn: () => fetchJson(`/api/intake-output/alerts?facilityId=${facilityId || ""}&status=${statusFilter}&limit=100`),
    enabled: !!facilityId,
    refetchInterval: 30000,
  });

  const ackMutation = useMutation({
    mutationFn: async ({ alertId, actionTaken, notes }: any) => {
      const res = await fetch("/api/intake-output/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, actionTaken, notes }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Alert acknowledged");
      qc.invalidateQueries({ queryKey: ["io-alerts", facilityId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [ackTarget, setAckTarget] = useState<any | null>(null);

  if (!facilityId) return <Card><CardContent className="p-6"><EmptyState title="Select a facility" icon={AlertCircle} /></CardContent></Card>;
  if (isLoading) return <LoadingState rows={5} />;
  if (isError) return <ErrorState message="Failed to load alerts" onRetry={() => refetch()} />;

  const items = data?.items || [];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-slate-500">{items.length} alert(s)</div>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No alerts" description="All clear — no alerts in this status." icon={BellRing} /></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((a: any) => (
            <Card key={a.id}>
              <CardContent className="p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`text-[10px] ${ALERT_SEVERITY_COLOR[a.severity] || ""}`}>{a.severity}</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{a.code?.replace(/_/g, " ")}</Badge>
                      <span className="text-xs text-slate-500">{formatRelative(a.raisedAt)}</span>
                    </div>
                    <div className="font-medium text-slate-900 text-sm">{a.title}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{a.message}</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Patient: {a.patient?.firstName} {a.patient?.lastName} ({a.patient?.patientNumber})
                      {a.thresholdValue != null && a.actualValue != null && ` • Threshold: ${a.thresholdValue} • Actual: ${a.actualValue}`}
                    </div>
                    {a.status === "acknowledged" && a.acknowledgedBy && (
                      <div className="text-[10px] text-emerald-700 mt-1">
                        ✓ Acked by {a.acknowledgedBy.firstName} {a.acknowledgedBy.lastName} {formatRelative(a.acknowledgedAt)}
                        {a.actionTaken && ` — ${a.actionTaken}`}
                      </div>
                    )}
                  </div>
                  {a.status === "active" && canAck && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAckTarget(a)}>Acknowledge</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {ackTarget && (
        <AckAlertDialog
          alert={ackTarget}
          onClose={() => setAckTarget(null)}
          onSubmit={(actionTaken, notes) => {
            ackMutation.mutate({ alertId: ackTarget.id, actionTaken, notes });
            setAckTarget(null);
          }}
        />
      )}
    </div>
  );
}

function AckAlertDialog({ alert, onClose, onSubmit }: any) {
  const [actionTaken, setActionTaken] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle>Acknowledge Alert</DialogTitle>
          <DialogDescription className="text-white/80">{alert.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Action Taken</Label>
            <Input value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} placeholder="e.g., Notified Dr. Mensah; reviewed I&O chart" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit(actionTaken, notes)} className="bg-emerald-600 hover:bg-emerald-700">Acknowledge</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// REPORTS PANEL
// =====================================================================
function ReportsPanel({ facilityId, patient }: any) {
  const [reportType, setReportType] = useState("daily");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const reportTypes = [
    { value: "daily", label: "Daily I&O (single patient, single day)", needs: "patient,date" },
    { value: "shift", label: "Shift report (single patient, single day)", needs: "patient,date" },
    { value: "rolling24h", label: "Rolling 24-hour (single patient)", needs: "patient" },
    { value: "patient", label: "Patient fluid balance (admission-scoped)", needs: "patient" },
    { value: "ward", label: "Ward I&O (facility-wide today)", needs: "facility" },
    { value: "urine", label: "Urine output report", needs: "patient" },
    { value: "drain", label: "Drain output report", needs: "patient" },
    { value: "missing", label: "Missing documentation report", needs: "patient" },
    { value: "trend", label: "7-day trend (single patient)", needs: "patient" },
    { value: "audit", label: "Audit log (facility-wide)", needs: "facility" },
  ];

  const generate = async () => {
    const params = new URLSearchParams();
    params.set("type", reportType);
    if (facilityId) params.set("facilityId", facilityId);
    if (patient?.id) params.set("patientId", patient.id);
    if (patient?.admissionId) params.set("admissionId", patient.admissionId);
    if (reportType === "daily" || reportType === "shift") params.set("date", date);
    if (reportType === "rolling24h" || reportType === "patient" || reportType === "urine" || reportType === "drain" || reportType === "audit" || reportType === "trend") {
      params.set("from", from);
      params.set("to", to);
    }
    setLoading(true);
    try {
      const data = await fetchJson(`/api/intake-output/reports?${params.toString()}`);
      setResult(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const needsPatient = ["daily", "shift", "rolling24h", "patient", "urine", "drain", "missing", "trend"].includes(reportType);
  const hasPatient = !!patient?.id;
  const canGenerate = !needsPatient || hasPatient;

  // Helper to format ml values
  const fmtMl = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} ml`);
  const fmtSigned = (n: number | null | undefined) => {
    if (n == null) return "—";
    return `${n > 0 ? "+" : ""}${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} ml`;
  };

  // Determine if result is empty
  const isEmpty = (r: any) => {
    if (!r) return true;
    if (r.type === "daily" || r.type === "shift" || r.type === "rolling24h") return !r.entries || r.entries.length === 0;
    if (r.type === "patient") return !r.entries || r.entries.length === 0;
    if (r.type === "ward") return !r.items || r.items.length === 0;
    if (r.type === "urine" || r.type === "drain") return !r.entries || r.entries.length === 0;
    if (r.type === "missing") return !r.missingSlots || r.missingSlots.length === 0;
    if (r.type === "trend") return !r.trend || r.trend.length === 0;
    if (r.type === "audit") return !r.items || r.items.length === 0;
    return false;
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <FieldLabel required>Report Type</FieldLabel>
              <Select value={reportType} onValueChange={(v) => { setReportType(v); setResult(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {reportTypes.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(reportType === "daily" || reportType === "shift") && (
              <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            )}
            {["rolling24h", "patient", "urine", "drain", "audit", "trend"].includes(reportType) && (
              <>
                <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
                <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              </>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {needsPatient && !hasPatient ? (
                <span className="text-amber-700">⚠ This report requires a patient. Select one from the Patient Balance tab.</span>
              ) : hasPatient ? (
                `Patient: ${patient.firstName} ${patient.lastName} (${patient.patientNumber})`
              ) : (
                "Facility-wide report — no patient required."
              )}
            </div>
            <div className="flex gap-2">
              {result && !isEmpty(result) && (
                <Button variant="outline" onClick={() => window.print()} className="gap-2 h-8">
                  <Printer className="w-4 h-4" /> Print
                </Button>
              )}
              {result && !isEmpty(result) && hasPatient && (
                <Button variant="outline" onClick={() => window.open(`/api/intake-output/export?patientId=${patient.id}&format=csv`, "_blank")} className="gap-2 h-8">
                  <Download className="w-4 h-4" /> CSV Export
                </Button>
              )}
              <Button onClick={generate} disabled={loading || !canGenerate} className="gap-2 bg-teal-600 hover:bg-teal-700 h-8">
                {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <FileBarChart className="w-4 h-4" />} Generate Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="p-4">
            {/* EMPTY STATE */}
            {isEmpty(result) ? (
              <div className="text-center py-8">
                <FileBarChart className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <div className="text-sm font-medium text-slate-700">No records found for this report</div>
                <div className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  {result.type === "daily" && `No I&O entries found for ${date}. Record intake/output entries from the Patient Balance tab to populate this report.`}
                  {result.type === "shift" && `No I&O entries found for ${date}.`}
                  {result.type === "rolling24h" && `No I&O entries in the last 24 hours.`}
                  {result.type === "patient" && `No I&O entries found for this admission in the selected range.`}
                  {result.type === "ward" && `No admitted patients found at this facility. Admit a patient from the Admissions module to see ward I&O data.`}
                  {result.type === "urine" && `No urine output entries found between ${from} and ${to}.`}
                  {result.type === "drain" && `No drain output entries found between ${from} and ${to}.`}
                  {result.type === "missing" && (result.monitoringActive === false ? "No active monitoring period — start one from the Patient Balance tab to enable missing-entry detection." : "No missing documentation slots detected — all slots have entries!")}
                  {result.type === "trend" && `No I&O data in the last 7 days.`}
                  {result.type === "audit" && `No I&O audit events between ${from} and ${to}.`}
                </div>
                {(result.type === "daily" || result.type === "shift" || result.type === "rolling24h" || result.type === "patient" || result.type === "urine" || result.type === "drain") && (
                  <div className="text-[10px] text-slate-400 mt-2 max-w-md mx-auto">
                    Tip: To populate I&O reports, select a patient from the Patient Balance tab, then record intake and output entries.
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* DAILY REPORT */}
                {result.type === "daily" && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-2">Daily I&O Report — {result.date}</div>
                    {result.patient && <div className="text-xs text-slate-500 mb-2">Patient: {result.patient.firstName} {result.patient.lastName} ({result.patient.patientNumber})</div>}
                    {result.summary && (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Intake</div><div className="text-lg font-bold text-emerald-700">{fmtMl(result.summary.intake)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Output</div><div className="text-lg font-bold text-amber-700">{fmtMl(result.summary.output)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Net</div><div className={`text-lg font-bold ${(result.summary.net || 0) >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSigned(result.summary.net)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Urine</div><div className="text-lg font-bold text-violet-700">{fmtMl(result.summary.urine)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Drains</div><div className="text-lg font-bold text-amber-700">{fmtMl(result.summary.drains)}</div></div>
                      </div>
                    )}
                    {result.hourly && result.hourly.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[10px] text-slate-500 uppercase mb-1">Hourly Breakdown</div>
                        <div className="overflow-x-auto max-h-48 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="border-b bg-slate-50 sticky top-0"><tr><th className="text-left p-2">Hour</th><th className="text-right p-2">Intake</th><th className="text-right p-2">Output</th><th className="text-right p-2">Net</th><th className="text-center p-2">Status</th></tr></thead>
                            <tbody>
                              {result.hourly.map((h: any) => (
                                <tr key={h.hour} className={`border-b ${h.missing ? "bg-rose-50/40" : ""}`}>
                                  <td className="p-2 font-mono">{h.hour}</td>
                                  <td className="p-2 text-right text-emerald-700">{h.intake == null ? "—" : h.intake.toLocaleString()}</td>
                                  <td className="p-2 text-right text-amber-700">{h.output == null ? "—" : h.output.toLocaleString()}</td>
                                  <td className={`p-2 text-right ${h.net == null ? "text-slate-400" : h.net >= 0 ? "text-teal-700" : "text-rose-700"}`}>{h.net == null ? "—" : (h.net >= 0 ? "+" : "") + h.net.toLocaleString()}</td>
                                  <td className="p-2 text-center">{h.missing ? <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 text-[9px]">MISSING</Badge> : <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 text-[9px]">✓</Badge>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Entries ({result.entries?.length || 0})</div>
                      <div className="overflow-x-auto max-h-60 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="border-b bg-slate-50 sticky top-0"><tr><th className="text-left p-2">Time</th><th className="text-left p-2">Type</th><th className="text-left p-2">Category</th><th className="text-left p-2">Source</th><th className="text-right p-2">Amount</th></tr></thead>
                          <tbody>
                            {(result.entries || []).map((e: any) => (
                              <tr key={e.id} className="border-b">
                                <td className="p-2">{formatDate(e.eventAt, true)}</td>
                                <td className="p-2"><Badge className={`text-[9px] ${ENTRY_TYPE_COLOR[e.entryType] || ""}`}>{e.entryType}</Badge></td>
                                <td className="p-2 capitalize">{(e.category || e.fluidType || "—").replace(/_/g, " ")}</td>
                                <td className="p-2">{e.source || "—"}</td>
                                <td className={`p-2 text-right font-medium ${e.entryType === "intake" ? "text-emerald-700" : "text-amber-700"}`}>{e.amount.toLocaleString()} {e.unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* SHIFT REPORT */}
                {result.type === "shift" && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-2">Shift Report — {result.date}</div>
                    {result.shiftTotals && result.shiftTotals.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {result.shiftTotals.map((s: any) => (
                          <div key={s.shift} className="border rounded p-2">
                            <div className="text-xs font-medium capitalize text-slate-700">{s.shift}</div>
                            <div className="text-[10px] text-slate-500">{s.start} – {s.end}</div>
                            <div className="text-xs mt-1 space-y-0.5">
                              <div className="flex justify-between"><span>Intake</span><span className="text-emerald-700 font-medium">{fmtMl(s.intake)}</span></div>
                              <div className="flex justify-between"><span>Output</span><span className="text-amber-700 font-medium">{fmtMl(s.output)}</span></div>
                              <div className="flex justify-between border-t pt-0.5"><span className="font-medium">Net</span><span className={`font-bold ${s.net >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSigned(s.net)}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ROLLING 24H */}
                {result.type === "rolling24h" && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-2">Rolling 24-Hour Balance</div>
                    {result.summary && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Total Intake</div><div className="text-lg font-bold text-emerald-700">{fmtMl(result.summary.intake)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Total Output</div><div className="text-lg font-bold text-amber-700">{fmtMl(result.summary.output)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Net Balance</div><div className={`text-lg font-bold ${(result.summary.net || 0) >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSigned(result.summary.net)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Entries</div><div className="text-lg font-bold text-slate-700">{result.entries?.length || 0}</div></div>
                      </div>
                    )}
                    <div className="overflow-x-auto max-h-60 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="border-b bg-slate-50 sticky top-0"><tr><th className="text-left p-2">Time</th><th className="text-left p-2">Type</th><th className="text-left p-2">Category</th><th className="text-right p-2">Amount</th></tr></thead>
                        <tbody>
                          {(result.entries || []).map((e: any) => (
                            <tr key={e.id} className="border-b">
                              <td className="p-2">{formatDate(e.eventAt, true)}</td>
                              <td className="p-2"><Badge className={`text-[9px] ${ENTRY_TYPE_COLOR[e.entryType] || ""}`}>{e.entryType}</Badge></td>
                              <td className="p-2 capitalize">{(e.category || e.fluidType || "—").replace(/_/g, " ")}</td>
                              <td className={`p-2 text-right font-medium ${e.entryType === "intake" ? "text-emerald-700" : "text-amber-700"}`}>{e.amount.toLocaleString()} ml</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* PATIENT REPORT */}
                {result.type === "patient" && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-2">Patient Fluid Balance (Admission-Scoped)</div>
                    {result.summary && (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Total Intake</div><div className="text-lg font-bold text-emerald-700">{fmtMl(result.summary.totalIntake)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Total Output</div><div className="text-lg font-bold text-amber-700">{fmtMl(result.summary.totalOutput)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Net Balance</div><div className={`text-lg font-bold ${(result.summary.netBalance || 0) >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSigned(result.summary.netBalance)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Cumulative</div><div className={`text-lg font-bold ${(result.summary.cumulative || 0) >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSigned(result.summary.cumulative)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Days</div><div className="text-lg font-bold text-slate-700">{result.summary.dayCount}</div></div>
                      </div>
                    )}
                    {result.dailyCumulative && result.dailyCumulative.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="border-b bg-slate-50"><tr><th className="text-left p-2">Date</th><th className="text-right p-2">Intake</th><th className="text-right p-2">Output</th><th className="text-right p-2">Net</th><th className="text-right p-2">Cumulative</th></tr></thead>
                          <tbody>
                            {result.dailyCumulative.map((d: any) => (
                              <tr key={d.date} className="border-b">
                                <td className="p-2">{formatDate(d.date)}</td>
                                <td className="p-2 text-right text-emerald-700">{d.intake.toLocaleString()}</td>
                                <td className="p-2 text-right text-amber-700">{d.output.toLocaleString()}</td>
                                <td className={`p-2 text-right ${d.net >= 0 ? "text-teal-700" : "text-rose-700"}`}>{d.net >= 0 ? "+" : ""}{d.net.toLocaleString()}</td>
                                <td className={`p-2 text-right font-bold ${d.cumulative >= 0 ? "text-teal-700" : "text-rose-700"}`}>{d.cumulative >= 0 ? "+" : ""}{d.cumulative.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* WARD REPORT */}
                {result.type === "ward" && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-2">Ward I&O Report — {result.date || "Today"}</div>
                    {result.summary && (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Patients</div><div className="text-lg font-bold text-slate-700">{result.summary.totalPatients}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">With Entries</div><div className="text-lg font-bold text-emerald-700">{result.summary.withEntries}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Missing</div><div className="text-lg font-bold text-rose-700">{result.summary.missing}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Total Intake</div><div className="text-lg font-bold text-emerald-700">{fmtMl(result.summary.totalIntake)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Total Output</div><div className="text-lg font-bold text-amber-700">{fmtMl(result.summary.totalOutput)}</div></div>
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="border-b bg-slate-50"><tr><th className="text-left p-2">Patient</th><th className="text-left p-2">Ward / Bed</th><th className="text-right p-2">Intake</th><th className="text-right p-2">Output</th><th className="text-right p-2">Net</th><th className="text-center p-2">Status</th></tr></thead>
                        <tbody>
                          {(result.items || []).map((it: any) => (
                            <tr key={it.patientId} className="border-b">
                              <td className="p-2"><div className="font-medium">{it.patient?.firstName} {it.patient?.lastName}</div><div className="text-[10px] text-slate-500">{it.patient?.patientNumber}</div></td>
                              <td className="p-2 text-[10px]">{it.ward?.name || "—"} / Bed {it.bed?.bedNumber || "—"}</td>
                              <td className="p-2 text-right text-emerald-700">{fmtMl(it.todayIntake)}</td>
                              <td className="p-2 text-right text-amber-700">{fmtMl(it.todayOutput)}</td>
                              <td className={`p-2 text-right ${it.todayNet >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSigned(it.todayNet)}</td>
                              <td className="p-2 text-center">{it.missing ? <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 text-[9px]">MISSING</Badge> : <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 text-[9px]">OK</Badge>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* URINE REPORT */}
                {result.type === "urine" && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-2">Urine Output Report</div>
                    {result.summary && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Total Urine</div><div className="text-lg font-bold text-violet-700">{fmtMl(result.summary.totalUrine)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Per Hour</div><div className="text-lg font-bold text-violet-700">{result.summary.urinePerHour ? `${result.summary.urinePerHour.toFixed(0)} ml/h` : "—"}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Per kg/h</div><div className="text-lg font-bold text-violet-700">{result.summary.urinePerKgPerHour ? `${result.summary.urinePerKgPerHour.toFixed(2)} ml/kg/h` : "—"}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Weight</div><div className="text-lg font-bold text-slate-700">{result.summary.weightKg ? `${result.summary.weightKg} kg` : "—"}</div></div>
                      </div>
                    )}
                    <div className="overflow-x-auto max-h-60 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="border-b bg-slate-50 sticky top-0"><tr><th className="text-left p-2">Time</th><th className="text-right p-2">Volume</th><th className="text-left p-2">Route</th><th className="text-left p-2">Catheter</th></tr></thead>
                        <tbody>
                          {(result.entries || []).map((e: any) => (
                            <tr key={e.id} className="border-b">
                              <td className="p-2">{formatDate(e.eventAt, true)}</td>
                              <td className="p-2 text-right font-medium text-violet-700">{e.amount.toLocaleString()} ml</td>
                              <td className="p-2 capitalize">{e.route || "—"}</td>
                              <td className="p-2 capitalize">{e.catheterStatus || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* DRAIN REPORT */}
                {result.type === "drain" && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-2">Drain Output Report</div>
                    {result.summary && (
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Total Drain Output</div><div className="text-lg font-bold text-amber-700">{fmtMl(result.summary.totalDrainOutput)}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Drains</div><div className="text-lg font-bold text-slate-700">{result.summary.drainCount}</div></div>
                        <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Entries</div><div className="text-lg font-bold text-slate-700">{result.summary.entryCount}</div></div>
                      </div>
                    )}
                    {result.byDrain && result.byDrain.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[10px] text-slate-500 uppercase mb-1">By Drain</div>
                        <div className="flex flex-wrap gap-1">
                          {result.byDrain.map((d: any) => (
                            <Badge key={d.label} variant="outline" className="text-[10px]">{d.label}: {fmtMl(d.total)}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="overflow-x-auto max-h-60 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="border-b bg-slate-50 sticky top-0"><tr><th className="text-left p-2">Time</th><th className="text-left p-2">Drain Label</th><th className="text-right p-2">Volume</th></tr></thead>
                        <tbody>
                          {(result.entries || []).map((e: any) => (
                            <tr key={e.id} className="border-b">
                              <td className="p-2">{formatDate(e.eventAt, true)}</td>
                              <td className="p-2">{e.drainLabel || "Unlabeled"}</td>
                              <td className="p-2 text-right font-medium text-amber-700">{e.amount.toLocaleString()} ml</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* MISSING REPORT */}
                {result.type === "missing" && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-2">Missing Documentation Report</div>
                    {result.monitoringActive === false ? (
                      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-700">
                        No active monitoring period. Start one from the Patient Balance tab to enable missing-entry detection.
                      </div>
                    ) : (
                      <>
                        {result.summary && (
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Missing Slots</div><div className="text-lg font-bold text-rose-700">{result.summary.missingCount}</div></div>
                            <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Interval</div><div className="text-lg font-bold text-slate-700">{result.summary.intervalMinutes} min</div></div>
                            <div className="border rounded p-2 text-center"><div className="text-[10px] text-slate-500">Window</div><div className="text-lg font-bold text-slate-700">{result.summary.windowHours}h</div></div>
                          </div>
                        )}
                        {result.missingSlots && result.missingSlots.length > 0 ? (
                          <div className="space-y-1">
                            {result.missingSlots.map((slot: any, i: number) => (
                              <div key={i} className="border rounded p-2 text-xs flex items-center gap-2">
                                <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 text-[9px]">MISSING</Badge>
                                <span className="text-slate-700">{formatDate(slot.start, true)}</span>
                                <span className="text-slate-400">→</span>
                                <span className="text-slate-700">{formatDate(slot.end, true)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm text-emerald-700">
                            ✓ No missing documentation slots — all slots have entries!
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* TREND REPORT */}
                {result.type === "trend" && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-2">7-Day Trend</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="border-b bg-slate-50"><tr><th className="text-left p-2">Date</th><th className="text-right p-2">Intake</th><th className="text-right p-2">Output</th><th className="text-right p-2">Net</th><th className="text-right p-2">Cumulative</th></tr></thead>
                        <tbody>
                          {(result.trend || []).map((d: any) => (
                            <tr key={d.date} className="border-b">
                              <td className="p-2">{formatDate(d.date)}</td>
                              <td className="p-2 text-right text-emerald-700">{d.intake.toLocaleString()}</td>
                              <td className="p-2 text-right text-amber-700">{d.output.toLocaleString()}</td>
                              <td className={`p-2 text-right ${d.net >= 0 ? "text-teal-700" : "text-rose-700"}`}>{d.net >= 0 ? "+" : ""}{d.net.toLocaleString()}</td>
                              <td className={`p-2 text-right font-bold ${d.cumulative >= 0 ? "text-teal-700" : "text-rose-700"}`}>{d.cumulative >= 0 ? "+" : ""}{d.cumulative.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* AUDIT REPORT */}
                {result.type === "audit" && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-2">I&O Audit Log — {from} to {to}</div>
                    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="border-b bg-slate-50 sticky top-0"><tr><th className="text-left p-2">Date/Time</th><th className="text-left p-2">Action</th><th className="text-left p-2">User</th><th className="text-left p-2">Resource ID</th><th className="text-left p-2">Details</th></tr></thead>
                        <tbody>
                          {(result.items || []).map((log: any) => (
                            <tr key={log.id} className="border-b">
                              <td className="p-2 text-[10px]">{formatDate(log.createdAt, true)}</td>
                              <td className="p-2"><Badge variant="outline" className="text-[9px]">{log.action}</Badge></td>
                              <td className="p-2 text-[10px]">{log.user?.firstName} {log.user?.lastName}</td>
                              <td className="p-2 font-mono text-[10px]">{log.resourceId?.slice(-8)}</td>
                              <td className="p-2 text-[10px] text-slate-600 max-w-xs truncate">{log.newValues || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// HANDOVER PANEL — nursing shift handover summary
// =====================================================================
function HandoverPanel({ facilityId }: { facilityId: string | null }) {
  const [wardFilter, setWardFilter] = useState("all");
  const { data: wardsData } = useQuery({
    queryKey: ["io-wards", facilityId],
    queryFn: () => fetchJson(`/api/wards?facilityId=${facilityId || ""}`),
    enabled: !!facilityId,
  });

  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  if (wardFilter !== "all") params.set("wardId", wardFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["io-handover", facilityId, wardFilter],
    queryFn: () => fetchJson(`/api/intake-output/handover${qs}`),
    enabled: !!facilityId,
  });

  if (!facilityId) return <Card><CardContent className="p-6"><EmptyState title="Select a facility" icon={AlertCircle} /></CardContent></Card>;
  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load handover summary" onRetry={() => refetch()} />;

  const items = data?.items || [];
  const summary = data?.summary || {};

  const handlePrint = () => window.print();

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div>
            <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 capitalize">{data?.shiftName} shift</Badge>
            <span className="ml-2 text-xs text-slate-500">
              {data?.shiftStart && new Date(data.shiftStart).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
              {" → "}
              {data?.shiftEnd && new Date(data.shiftEnd).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
            </span>
          </div>
          <Select value={wardFilter} onValueChange={setWardFilter}>
            <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All wards</SelectItem>
              {(wardsData?.items || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handlePrint} className="ml-auto gap-1.5 h-8"><Printer className="w-3.5 h-3.5" /> Print Handover</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStatCard label="Patients" value={summary.totalPatients || 0} icon={Stethoscope} gradient="from-violet-500 to-violet-600" />
        <MiniStatCard label="Monitored" value={summary.monitored || 0} icon={Play} gradient="from-cyan-500 to-cyan-600" />
        <MiniStatCard label="With alerts" value={summary.withAlerts || 0} icon={BellRing} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Missing entries" value={summary.withMissingEntries || 0} icon={AlertCircle} gradient="from-rose-500 to-rose-600" />
        <MiniStatCard label="Shift net" value={fmtSignedMl((summary.shiftTotalIntake || 0) - (summary.shiftTotalOutput || 0))} icon={Activity} gradient="from-teal-500 to-cyan-600" />
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No admitted patients" icon={Stethoscope} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient / Bed</th>
                    <th className="text-center p-3 font-semibold text-slate-700">Monitor</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Shift Intake</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Shift Output</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Shift Net</th>
                    <th className="text-right p-3 font-semibold text-slate-700">24h Urine</th>
                    <th className="text-right p-3 font-semibold text-slate-700">24h Net</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Alerts / Missing</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Last Entry</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => (
                    <tr key={it.patientId} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{it.patient?.firstName} {it.patient?.lastName}</div>
                        <div className="text-[10px] text-slate-500">
                          {it.patient?.patientNumber} • {it.ward?.name} / Bed {it.bed?.bedNumber}
                          {it.admission?.admissionReason && <span className="ml-1">• {it.admission.admissionReason}</span>}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {it.monitoring.active ? (
                          <Badge className="bg-cyan-100 text-cyan-700 text-[10px] capitalize">{it.monitoring.level}</Badge>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                        {it.monitoring.dailyLimitMl && <div className="text-[9px] text-rose-700 mt-0.5">Restriction: {fmtMl(it.monitoring.dailyLimitMl)}</div>}
                      </td>
                      <td className="p-3 text-right text-emerald-700 font-medium">{fmtMl(it.shift.intake)}</td>
                      <td className="p-3 text-right text-amber-700 font-medium">{fmtMl(it.shift.output)}</td>
                      <td className={`p-3 text-right font-medium ${it.shift.net >= 0 ? "text-teal-700" : "text-rose-700"}`}>{fmtSignedMl(it.shift.net)}</td>
                      <td className="p-3 text-right text-violet-700 font-medium">
                        {fmtMl(it.rolling24h.urine)}
                        <div className="text-[9px] text-slate-500">{it.rolling24h.urinePerHour ? `${it.rolling24h.urinePerHour.toFixed(0)} ml/h` : ""}</div>
                      </td>
                      <td className={`p-3 text-right font-medium ${it.rolling24h.net >= 0 ? "text-blue-700" : "text-rose-700"}`}>{fmtSignedMl(it.rolling24h.net)}</td>
                      <td className="p-3">
                        {it.alerts.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {it.alerts.slice(0, 2).map((a: any) => (
                              <Badge key={a.id} className={`text-[9px] ${ALERT_SEVERITY_COLOR[a.severity] || ""}`}>{a.severity}</Badge>
                            ))}
                            {it.alerts.length > 2 && <span className="text-[9px] text-slate-500">+{it.alerts.length - 2}</span>}
                          </div>
                        )}
                        {it.missingSlots > 0 && (
                          <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 text-[9px] mt-1">⚠ {it.missingSlots} missing</Badge>
                        )}
                      </td>
                      <td className="p-3 text-xs text-slate-500">
                        {it.lastEntry ? (
                          <>
                            <Badge className={`text-[9px] mr-1 ${ENTRY_TYPE_COLOR[it.lastEntry.entryType] || ""}`}>{it.lastEntry.entryType}</Badge>
                            {fmtMl(it.lastEntry.amount)} {formatRelative(it.lastEntry.eventAt)}
                          </>
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
    </div>
  );
}

// =====================================================================
// ALERT CONFIG PANEL — manage alert thresholds
// =====================================================================
function AlertConfigPanel({ facilityId }: { facilityId: string | null }) {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["io-alert-configs", facilityId],
    queryFn: () => fetchJson(`/api/intake-output/alert-configs?facilityId=${facilityId || ""}`),
    enabled: !!facilityId,
  });

  const toggleActive = async (cfg: any) => {
    try {
      const res = await fetch("/api/intake-output/alert-configs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: cfg.id, active: !cfg.active }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Config ${!cfg.active ? "activated" : "deactivated"}`);
      qc.invalidateQueries({ queryKey: ["io-alert-configs", facilityId] });
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteConfig = async (cfg: any) => {
    if (!confirm(`Deactivate alert config "${cfg.name}"?`)) return;
    try {
      const res = await fetch(`/api/intake-output/alert-configs?configId=${cfg.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Config deactivated");
      qc.invalidateQueries({ queryKey: ["io-alert-configs", facilityId] });
    } catch (e: any) { toast.error(e.message); }
  };

  if (!facilityId) return <Card><CardContent className="p-6"><EmptyState title="Select a facility" icon={AlertCircle} /></CardContent></Card>;
  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message="Failed to load alert configs" onRetry={() => refetch()} />;

  const items = data?.items || [];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-700">Alert Configurations</div>
            <div className="text-xs text-slate-500">Define thresholds that automatically raise alerts when documented values cross them. Configurable per facility / ward / patient group.</div>
          </div>
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Config</Button>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card><CardContent className="p-6">
          <EmptyState
            title="No alert configs yet"
            description="Create your first alert config to start receiving automatic notifications when documented values cross thresholds (e.g., low urine output, missing entries, negative balance)."
            icon={BellRing}
          />
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((cfg: any) => (
            <Card key={cfg.id} className={!cfg.active ? "opacity-60" : ""}>
              <CardContent className="p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-900">{cfg.name}</span>
                    <Badge className={`text-[10px] ${ALERT_SEVERITY_COLOR[cfg.severity] || ""}`}>{cfg.severity}</Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">{cfg.code?.replace(/_/g, " ")}</Badge>
                    {cfg.ward && <Badge variant="outline" className="text-[10px]">{cfg.ward.name}</Badge>}
                    <Badge variant="outline" className="text-[10px]">{cfg.patientGroup || "all"}</Badge>
                  </div>
                  <div className="text-xs text-slate-600">
                    When <span className="font-mono">{cfg.metric.replace(/_/g, " ")}</span>
                    {" "}<span className="font-mono">{cfg.operator}</span>
                    {" "}<span className="font-mono font-bold">{cfg.threshold}</span>
                    {" "}over <span className="font-mono">{cfg.windowMinutes} min</span> window
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditTarget(cfg)}>Edit</Button>
                  <Button size="sm" variant="ghost" className={`h-7 text-xs ${cfg.active ? "text-amber-600" : "text-emerald-600"}`} onClick={() => toggleActive(cfg)}>
                    {cfg.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600" onClick={() => deleteConfig(cfg)}>Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-4 bg-blue-50 border-blue-200">
          <div className="text-xs text-blue-900">
            <strong>How alerts work:</strong> The system automatically evaluates all active configs after each I&O entry is recorded.
            When a threshold is crossed, an alert is raised in the Alerts tab and audit-logged. When the value returns to normal range,
            the alert is auto-resolved. The system NEVER diagnoses — alerts simply state "Configured threshold reached" with the actual value.
          </div>
        </CardContent>
      </Card>

      {showNew && <AlertConfigDialog facilityId={facilityId} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); qc.invalidateQueries({ queryKey: ["io-alert-configs", facilityId] }); }} />}
      {editTarget && <AlertConfigDialog facilityId={facilityId} existing={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); qc.invalidateQueries({ queryKey: ["io-alert-configs", facilityId] }); }} />}
    </div>
  );
}

function AlertConfigDialog({ facilityId, existing, onClose, onSaved }: any) {
  const isEdit = !!existing;
  const [form, setForm] = useState<any>(existing || {
    name: "",
    code: "low_urine",
    metric: "urine_output_per_hour",
    operator: "lt",
    threshold: 30,
    windowMinutes: 1440,
    patientGroup: "all",
    wardId: "",
    severity: "warning",
    active: true,
  });

  const { data: wardsData } = useQuery({
    queryKey: ["io-cfg-wards", facilityId],
    queryFn: () => fetchJson(`/api/wards?facilityId=${facilityId}`),
    enabled: !!facilityId,
  });

  const submit = async () => {
    if (!form.name || form.threshold == null) { toast.error("Name and threshold are required"); return; }
    try {
      const url = "/api/intake-output/alert-configs";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit
        ? { configId: existing.id, name: form.name, threshold: Number(form.threshold), operator: form.operator, severity: form.severity, active: form.active, windowMinutes: Number(form.windowMinutes), patientGroup: form.patientGroup, wardId: form.wardId || null }
        : { facilityId, name: form.name, code: form.code, metric: form.metric, operator: form.operator, threshold: Number(form.threshold), windowMinutes: Number(form.windowMinutes), patientGroup: form.patientGroup, wardId: form.wardId || null, severity: form.severity, active: form.active };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success(isEdit ? "Config updated" : "Config created");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
          <DialogTitle className="flex items-center gap-2 text-white"><Settings2 className="w-5 h-5 text-cyan-600" /> {isEdit ? "Edit Alert Config" : "New Alert Config"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div>
            <FieldLabel required>Config Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Low urine output — adult" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Alert Code</FieldLabel>
              <Select value={form.code} onValueChange={(v) => setForm({ ...form, code: v })} disabled={isEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low_urine">Low urine output</SelectItem>
                  <SelectItem value="high_output">High output</SelectItem>
                  <SelectItem value="negative_balance">Negative balance</SelectItem>
                  <SelectItem value="positive_balance">Positive balance</SelectItem>
                  <SelectItem value="missing_entry">Missing entries</SelectItem>
                  <SelectItem value="documented_change">Documented change</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel required>Metric</FieldLabel>
              <Select value={form.metric} onValueChange={(v) => setForm({ ...form, metric: v })} disabled={isEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urine_output_per_hour">Urine output (ml/h)</SelectItem>
                  <SelectItem value="urine_output_per_kg_per_hour">Urine output (ml/kg/h)</SelectItem>
                  <SelectItem value="urine_output_24h">Urine output 24h (ml)</SelectItem>
                  <SelectItem value="net_balance_24h">Net balance 24h (ml)</SelectItem>
                  <SelectItem value="total_intake_24h">Total intake 24h (ml)</SelectItem>
                  <SelectItem value="total_output_24h">Total output 24h (ml)</SelectItem>
                  <SelectItem value="drain_output_24h">Drain output 24h (ml)</SelectItem>
                  <SelectItem value="missing_entries">Missing documentation slots</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel required>Operator</FieldLabel>
              <Select value={form.operator} onValueChange={(v) => setForm({ ...form, operator: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lt">&lt; less than</SelectItem>
                  <SelectItem value="gt">&gt; greater than</SelectItem>
                  <SelectItem value="lte">≤ less or equal</SelectItem>
                  <SelectItem value="gte">≥ greater or equal</SelectItem>
                  <SelectItem value="eq">= equals</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel required>Threshold</FieldLabel>
              <Input type="number" step="any" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
            </div>
            <div>
              <FieldLabel required>Window (min)</FieldLabel>
              <Select value={String(form.windowMinutes)} onValueChange={(v) => setForm({ ...form, windowMinutes: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                  <SelectItem value="480">8 hours</SelectItem>
                  <SelectItem value="720">12 hours</SelectItem>
                  <SelectItem value="1440">24 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Patient Group</Label>
              <Select value={form.patientGroup} onValueChange={(v) => setForm({ ...form, patientGroup: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All patients</SelectItem>
                  <SelectItem value="icu">ICU only</SelectItem>
                  <SelectItem value="pediatric">Pediatric</SelectItem>
                  <SelectItem value="maternity">Maternity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ward (optional)</Label>
              <Select value={form.wardId || "_none"} onValueChange={(v) => setForm({ ...form, wardId: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">All wards</SelectItem>
                  {(wardsData?.items || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <FieldLabel required>Severity</FieldLabel>
            <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded">
            <strong>Preview:</strong> Alert fires when <span className="font-mono">{form.metric.replace(/_/g, " ")}</span> <span className="font-mono">{form.operator}</span> <span className="font-mono font-bold">{form.threshold}</span> over the last <span className="font-mono">{form.windowMinutes} min</span>.
            <br /><span className="text-[10px]">⚠ The system never diagnoses — alerts only state "Configured threshold reached" with the actual documented value.</span>
          </div>
        </div>
        <DialogFooter className="px-6 py-4 shrink-0 border-t bg-white">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} className="bg-cyan-600 hover:bg-cyan-700">{isEdit ? "Update Config" : "Create Config"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

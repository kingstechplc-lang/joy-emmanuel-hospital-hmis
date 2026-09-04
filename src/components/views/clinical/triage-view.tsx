"use client";
import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Activity, Stethoscope, Save, Eye, Heart, AlertTriangle, AlertOctagon,
  CheckCircle, RefreshCw, ChevronDown, Brain, ShieldAlert, Filter, Clock,
  Droplet, Timer, TrendingUp, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, MiniStatCard,
  formatDate, safeJson, PageHeader, calculateAge,
} from "@/components/ui-helpers";
import { SpecialtyReferralButton } from "@/components/ui/specialty-referral-button";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

// =====================================================================
// CONSTANTS
// =====================================================================
const TRIAGE_CATEGORIES = [
  { value: "1_immediate", label: "1 — Immediate (Resuscitation)", color: "bg-rose-500 text-white", short: "1", gradient: "from-rose-500 to-red-600" },
  { value: "2_urgent", label: "2 — Urgent (Emergency)", color: "bg-amber-500 text-white", short: "2", gradient: "from-amber-500 to-orange-500" },
  { value: "3_standard", label: "3 — Standard (Acute)", color: "bg-emerald-500 text-white", short: "3", gradient: "from-emerald-500 to-emerald-600" },
  { value: "4_non_urgent", label: "4 — Non-Urgent (Routine)", color: "bg-slate-400 text-white", short: "4", gradient: "from-slate-400 to-slate-500" },
];

const CONSCIOUSNESS_LEVELS = [
  { value: "alert", label: "A — Alert" },
  { value: "confused", label: "Confused" },
  { value: "drowsy", label: "Drowsy" },
  { value: "voice", label: "V — Responds to Voice" },
  { value: "pain", label: "P — Responds to Pain" },
  { value: "unresponsive", label: "U — Unresponsive" },
];

const GENERAL_APPEARANCES = [
  { value: "well", label: "Well-looking" },
  { value: "mild_distress", label: "Mild distress" },
  { value: "moderate_distress", label: "Moderate distress" },
  { value: "severe_distress", label: "Severe distress" },
  { value: "toxic", label: "Toxic appearance" },
  { value: "shock", label: "In shock" },
  { value: "unresponsive", label: "Unresponsive" },
];

// =====================================================================
// CLIENT-SIDE ABNORMAL VITAL CHECKS
// (Thresholds must match the server: /api/triage POST)
// =====================================================================
type AbnormalAlert = { level: "critical" | "abnormal"; message: string; field: string };

function checkAbnormalVitals(v: {
  temperature?: number | null;
  pulse?: number | null;
  respiratoryRate?: number | null;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  oxygenSaturation?: number | null;
  bloodGlucose?: number | null;
  painScore?: number | null;
  gcsTotal?: number | null;
}): AbnormalAlert[] {
  const alerts: AbnormalAlert[] = [];
  const {
    temperature, pulse, respiratoryRate, systolicBp, diastolicBp,
    oxygenSaturation, bloodGlucose, painScore, gcsTotal,
  } = v;

  if (temperature != null) {
    if (temperature >= 39.5) alerts.push({ level: "critical", message: `CRITICAL: Temperature ${temperature}°C (≥39.5)`, field: "temperature" });
    else if (temperature < 35.0) alerts.push({ level: "critical", message: `CRITICAL: Temperature ${temperature}°C (hypothermia)`, field: "temperature" });
    else if (temperature >= 38.5) alerts.push({ level: "abnormal", message: `ABNORMAL: Temperature ${temperature}°C (fever)`, field: "temperature" });
  }
  if (pulse != null) {
    if (pulse >= 130) alerts.push({ level: "critical", message: `CRITICAL: Pulse ${pulse} bpm (≥130)`, field: "pulse" });
    else if (pulse < 40) alerts.push({ level: "critical", message: `CRITICAL: Pulse ${pulse} bpm (<40)`, field: "pulse" });
    else if (pulse >= 110) alerts.push({ level: "abnormal", message: `ABNORMAL: Pulse ${pulse} bpm (tachycardia)`, field: "pulse" });
    else if (pulse < 50) alerts.push({ level: "abnormal", message: `ABNORMAL: Pulse ${pulse} bpm (bradycardia)`, field: "pulse" });
  }
  if (respiratoryRate != null) {
    if (respiratoryRate >= 30) alerts.push({ level: "critical", message: `CRITICAL: RR ${respiratoryRate}/min (≥30)`, field: "respiratoryRate" });
    else if (respiratoryRate < 8) alerts.push({ level: "critical", message: `CRITICAL: RR ${respiratoryRate}/min (<8)`, field: "respiratoryRate" });
    else if (respiratoryRate >= 24) alerts.push({ level: "abnormal", message: `ABNORMAL: RR ${respiratoryRate}/min (tachypnea)`, field: "respiratoryRate" });
  }
  if (systolicBp != null) {
    if (systolicBp >= 180) alerts.push({ level: "critical", message: `CRITICAL: Systolic BP ${systolicBp} mmHg (≥180)`, field: "systolicBp" });
    else if (systolicBp < 90) alerts.push({ level: "critical", message: `CRITICAL: Systolic BP ${systolicBp} mmHg (<90)`, field: "systolicBp" });
    else if (systolicBp >= 140) alerts.push({ level: "abnormal", message: `ABNORMAL: Systolic BP ${systolicBp} mmHg (hypertension)`, field: "systolicBp" });
  }
  if (diastolicBp != null) {
    if (diastolicBp >= 120) alerts.push({ level: "critical", message: `CRITICAL: Diastolic BP ${diastolicBp} mmHg (≥120)`, field: "diastolicBp" });
    else if (diastolicBp < 50) alerts.push({ level: "critical", message: `CRITICAL: Diastolic BP ${diastolicBp} mmHg (<50)`, field: "diastolicBp" });
  }
  if (oxygenSaturation != null) {
    if (oxygenSaturation < 90) alerts.push({ level: "critical", message: `CRITICAL: SpO₂ ${oxygenSaturation}% (<90%)`, field: "oxygenSaturation" });
    else if (oxygenSaturation < 94) alerts.push({ level: "abnormal", message: `ABNORMAL: SpO₂ ${oxygenSaturation}% (low)`, field: "oxygenSaturation" });
  }
  if (bloodGlucose != null) {
    if (bloodGlucose >= 400) alerts.push({ level: "critical", message: `CRITICAL: Blood glucose ${bloodGlucose} mg/dL (≥400)`, field: "bloodGlucose" });
    else if (bloodGlucose < 50) alerts.push({ level: "critical", message: `CRITICAL: Blood glucose ${bloodGlucose} mg/dL (<50)`, field: "bloodGlucose" });
    else if (bloodGlucose >= 250) alerts.push({ level: "abnormal", message: `ABNORMAL: Blood glucose ${bloodGlucose} mg/dL (high)`, field: "bloodGlucose" });
  }
  if (painScore != null && painScore >= 7) {
    alerts.push({ level: "abnormal", message: `ABNORMAL: Pain score ${painScore}/10 (severe)`, field: "painScore" });
  }
  if (gcsTotal != null && gcsTotal > 0) {
    if (gcsTotal <= 8) alerts.push({ level: "critical", message: `CRITICAL: GCS ${gcsTotal}/15 (≤8 = coma)`, field: "gcs" });
    else if (gcsTotal <= 12) alerts.push({ level: "abnormal", message: `ABNORMAL: GCS ${gcsTotal}/15 (moderate impairment)`, field: "gcs" });
  }
  return alerts;
}

function getAlert(alerts: AbnormalAlert[], field: string): AbnormalAlert | undefined {
  return alerts.find((a) => a.field === field);
}

function parseAbnormalAlerts(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// =====================================================================
// MAIN VIEW
// =====================================================================
export function TriageView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");

  const handleCreated = () => {
    qc.invalidateQueries({ queryKey: ["triage"] });
    qc.invalidateQueries({ queryKey: ["triage-stats"] });
    setTab("history");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Triage & Vitals"
        description="Record triage assessments, monitor vital signs, and track abnormal alerts"
        icon={Activity}
        gradient="from-rose-500 to-red-600"
        actions={
          <SpecialtyReferralButton
            label="Refer to Specialty"
            fromDepartment="ER"
            variant="default"
            size="sm"
            className="bg-white/20 border border-white/30 text-white hover:bg-white/30"
          />
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="form" className="gap-1.5">
            <Stethoscope className="w-3.5 h-3.5" />
            New Triage
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <TriageDashboard facilityId={activeFacilityId} />
        </TabsContent>
        <TabsContent value="form">
          <TriageForm facilityId={activeFacilityId} onCreated={handleCreated} />
        </TabsContent>
        <TabsContent value="history">
          <TriageHistory facilityId={activeFacilityId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB — KPIs + Escalations + Acuity breakdown (30s auto-refresh)
// =====================================================================
function TriageDashboard({ facilityId }: { facilityId: string | null }) {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["triage-stats", facilityId],
    queryFn: () => fetchJson(`/api/triage/stats?facilityId=${facilityId || ""}`),
    enabled: !!facilityId,
    refetchInterval: 30000,
  });

  if (!facilityId) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-amber-700 bg-amber-50 rounded-lg">
          Select a facility to view the triage dashboard.
        </CardContent>
      </Card>
    );
  }
  if (isError) return <ErrorState message="Failed to load triage KPIs" onRetry={() => refetch()} />;

  const kpis = data?.kpis || {
    total: 0, immediate: 0, urgent: 0, standard: 0,
    nonUrgent: 0, reassessments: 0, abnormalAlerts: 0, escalations: 0,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Today&apos;s Triage Activity</h3>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            {isFetching ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-rose-600" />
                <span className="text-rose-700 font-medium">Refreshing…</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3" />
                Auto-refreshes every 30 seconds
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh Now
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniStatCard label="Total Today" value={kpis.total} icon={Activity} gradient="from-slate-600 to-slate-700" />
        <MiniStatCard label="Immediate" value={kpis.immediate} icon={Heart} gradient="from-rose-500 to-red-600" sublabel="Category 1" />
        <MiniStatCard label="Urgent" value={kpis.urgent} icon={AlertTriangle} gradient="from-amber-500 to-orange-500" sublabel="Category 2" />
        <MiniStatCard label="Standard" value={kpis.standard} icon={CheckCircle} gradient="from-emerald-500 to-emerald-600" sublabel="Category 3" />
        <MiniStatCard label="Abnormal Alerts" value={kpis.abnormalAlerts} icon={AlertOctagon} gradient="from-rose-400 to-pink-500" sublabel="Vital flags" />
        <MiniStatCard label="Reassessments" value={kpis.reassessments} icon={Timer} gradient="from-blue-500 to-cyan-500" sublabel="Follow-ups" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Escalations Card */}
        <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-rose-800">
              <ShieldAlert className="w-4 h-4" />
              Escalations
            </CardTitle>
            <CardDescription className="text-rose-700/70">
              Cases requiring higher-level care today
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-rose-700 tabular-nums">{kpis.escalations}</span>
              <span className="text-xs text-rose-600">escalations triggered</span>
            </div>
            <p className="text-xs text-rose-700/80 mt-2">
              {kpis.escalations > 0
                ? "Review escalated patients in the History tab."
                : "No escalations recorded today."}
            </p>
          </CardContent>
        </Card>

        {/* Acuity Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-700" />
              Acuity Distribution
            </CardTitle>
            <CardDescription>Breakdown by triage category (today)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {TRIAGE_CATEGORIES.map((cat) => {
                const count =
                  cat.value === "1_immediate" ? kpis.immediate :
                  cat.value === "2_urgent" ? kpis.urgent :
                  cat.value === "3_standard" ? kpis.standard :
                  kpis.nonUrgent;
                const pct = kpis.total > 0 ? (count / kpis.total) * 100 : 0;
                return (
                  <div key={cat.value} className="flex items-center gap-2">
                    <span className="text-xs text-slate-600 w-28 truncate">
                      {cat.label.split(" — ")[1] || cat.label}
                    </span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${cat.gradient} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 w-6 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =====================================================================
// NEW TRIAGE FORM — Enhanced with sections, GCS, pain, escalation
// =====================================================================
function TriageForm({ facilityId, onCreated }: { facilityId: string | null; onCreated: () => void }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [encounterId, setEncounterId] = useState("");
  const [encounterMode, setEncounterMode] = useState<"existing" | "new">("existing");

  const [v, setV] = useState({
    temperature: "", pulse: "", respiratoryRate: "",
    systolicBp: "", diastolicBp: "", oxygenSaturation: "",
    weight: "", height: "", bloodGlucose: "",
    painScore: "", painLocation: "", painCharacter: "",
    consciousnessLevel: "alert",
    gcsEye: "", gcsVerbal: "", gcsMotor: "",
    triageCategory: "3_standard",
    chiefComplaint: "", generalAppearance: "well", notes: "",
    escalationLevel: "", escalationReason: "",
    isReassessment: false, parentTriageId: "",
    recordVitalSigns: true,
  });

  const [gcsOpen, setGcsOpen] = useState(false);

  const setField = (k: string, val: any) => setV((p) => ({ ...p, [k]: val }));

  // BMI auto-calculation
  const bmi = useMemo(() => {
    const w = parseFloat(v.weight);
    const h = parseFloat(v.height);
    if (!w || !h) return null;
    const hm = h / 100;
    if (hm <= 0) return null;
    return Math.round((w / (hm * hm)) * 10) / 10;
  }, [v.weight, v.height]);

  // GCS total
  const gcsTotal = useMemo(() => {
    const e = parseInt(v.gcsEye);
    const ver = parseInt(v.gcsVerbal);
    const m = parseInt(v.gcsMotor);
    if (!e || !ver || !m) return null;
    return e + ver + m;
  }, [v.gcsEye, v.gcsVerbal, v.gcsMotor]);

  // Real-time abnormal vital checks
  const abnormalAlerts = useMemo(() => {
    return checkAbnormalVitals({
      temperature: v.temperature ? parseFloat(v.temperature) : null,
      pulse: v.pulse ? parseInt(v.pulse) : null,
      respiratoryRate: v.respiratoryRate ? parseInt(v.respiratoryRate) : null,
      systolicBp: v.systolicBp ? parseInt(v.systolicBp) : null,
      diastolicBp: v.diastolicBp ? parseInt(v.diastolicBp) : null,
      oxygenSaturation: v.oxygenSaturation ? parseFloat(v.oxygenSaturation) : null,
      bloodGlucose: v.bloodGlucose ? parseFloat(v.bloodGlucose) : null,
      painScore: v.painScore ? parseInt(v.painScore) : null,
      gcsTotal,
    });
  }, [v, gcsTotal]);

  const criticalCount = abnormalAlerts.filter((a) => a.level === "critical").length;
  const abnormalCount = abnormalAlerts.filter((a) => a.level === "abnormal").length;

  // Patient search
  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  // Encounters for selected patient
  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters", patientId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}`),
    enabled: !!patientId,
  });

  // Previous triage records (for reassessment parent)
  const { data: patientTriageData } = useQuery({
    queryKey: ["patient-triage", patientId],
    queryFn: () => fetchJson(`/api/triage?patientId=${patientId}&limit=20`),
    enabled: !!patientId && v.isReassessment,
  });

  const selectPatient = (p: any) => {
    setPatientId(p.id);
    setSelectedPatient(p);
    setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
  };

  const createEncounter = async (): Promise<string | null> => {
    if (!patientId || !facilityId) return null;
    const res = await fetch("/api/encounters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId, facilityId, encounterType: "emergency", priority: "urgent",
      }),
    });
    if (!res.ok) throw new Error("Failed to create encounter");
    const data = await safeJson(res);
    return data.item?.id as string;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let encId: string | null = encounterId || null;
      if (encounterMode === "new" || !encId) {
        encId = await createEncounter();
      }
      if (!encId) throw new Error("No encounter selected");
      const payload: any = {
        encounterId: encId,
        patientId,
        temperature: v.temperature ? parseFloat(v.temperature) : undefined,
        pulse: v.pulse ? parseInt(v.pulse) : undefined,
        respiratoryRate: v.respiratoryRate ? parseInt(v.respiratoryRate) : undefined,
        systolicBp: v.systolicBp ? parseInt(v.systolicBp) : undefined,
        diastolicBp: v.diastolicBp ? parseInt(v.diastolicBp) : undefined,
        oxygenSaturation: v.oxygenSaturation ? parseFloat(v.oxygenSaturation) : undefined,
        weight: v.weight ? parseFloat(v.weight) : undefined,
        height: v.height ? parseFloat(v.height) : undefined,
        bloodGlucose: v.bloodGlucose ? parseFloat(v.bloodGlucose) : undefined,
        painScore: v.painScore ? parseInt(v.painScore) : undefined,
        painLocation: v.painLocation || undefined,
        painCharacter: v.painCharacter || undefined,
        consciousnessLevel: v.consciousnessLevel,
        gcsEye: v.gcsEye ? parseInt(v.gcsEye) : undefined,
        gcsVerbal: v.gcsVerbal ? parseInt(v.gcsVerbal) : undefined,
        gcsMotor: v.gcsMotor ? parseInt(v.gcsMotor) : undefined,
        triageCategory: v.triageCategory,
        chiefComplaint: v.chiefComplaint,
        generalAppearance: v.generalAppearance,
        notes: v.notes,
        escalationLevel: v.escalationLevel || undefined,
        escalationReason: v.escalationReason || undefined,
        isReassessment: v.isReassessment,
        parentTriageId: v.isReassessment ? (v.parentTriageId || undefined) : undefined,
        recordVitalSigns: v.recordVitalSigns,
      };
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Triage recorded successfully");
      onCreated();
      // Reset patient + clinical fields
      setPatientQuery("");
      setPatientId("");
      setSelectedPatient(null);
      setEncounterId("");
      setV((p) => ({
        ...p,
        temperature: "", pulse: "", respiratoryRate: "",
        systolicBp: "", diastolicBp: "", oxygenSaturation: "",
        weight: "", height: "", bloodGlucose: "",
        painScore: "", painLocation: "", painCharacter: "",
        gcsEye: "", gcsVerbal: "", gcsMotor: "",
        chiefComplaint: "", notes: "",
        escalationLevel: "", escalationReason: "",
        isReassessment: false, parentTriageId: "",
      }));
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-rose-600" />
          New Triage Record
        </CardTitle>
        <CardDescription>
          Record vitals, assess acuity, and document abnormalities. A VitalSign entry is created automatically when enabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ============== PATIENT SECTION ============== */}
        <FormSection title="Patient" icon={<Heart className="w-4 h-4 text-rose-600" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Patient Search</FieldLabel>
              <Input
                placeholder="Search by name, MRN, phone, or Ghana Card..."
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
              />
              {patientsData?.patients && patientsData.patients.length > 0 && (
                <div className="mt-1 max-h-52 overflow-y-auto border rounded-md bg-white shadow-sm">
                  {patientsData.patients.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => selectPatient(p)}
                      className="w-full text-left p-2.5 hover:bg-rose-50 text-sm border-b last:border-0 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{p.firstName} {p.lastName}</span>
                        <span className="text-xs text-slate-500 font-mono">{p.patientNumber}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">
                          {p.sex === "M" ? "Male" : p.sex === "F" ? "Female" : "—"} • {calculateAge(p.dateOfBirth)}y
                        </span>
                        {p._count?.allergies > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-700 bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded">
                            <AlertOctagon className="w-2.5 h-2.5" />
                            {p._count.allergies} allergy
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedPatient && (
              <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Selected Patient</span>
                  {selectedPatient._count?.allergies > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded">
                      <AlertOctagon className="w-3 h-3" /> Allergy Warning
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {selectedPatient.firstName} {selectedPatient.lastName}
                </div>
                <div className="text-xs text-slate-600 grid grid-cols-2 gap-x-2 gap-y-0.5">
                  <span>MRN: <span className="font-mono">{selectedPatient.patientNumber}</span></span>
                  <span>Age: <span className="font-medium">{calculateAge(selectedPatient.dateOfBirth)}y</span></span>
                  <span>Sex: <span className="font-medium">
                    {selectedPatient.sex === "M" ? "Male" : selectedPatient.sex === "F" ? "Female" : "—"}
                  </span></span>
                  {selectedPatient.phone && <span>Phone: <span className="font-mono">{selectedPatient.phone}</span></span>}
                </div>
              </div>
            )}
          </div>

          {patientId && (
            <div className="mt-3">
              <Label>Encounter</Label>
              <div className="flex gap-2 mb-2">
                <Button
                  size="sm"
                  type="button"
                  variant={encounterMode === "existing" ? "default" : "outline"}
                  onClick={() => setEncounterMode("existing")}
                  className={encounterMode === "existing" ? "bg-rose-600 hover:bg-rose-700" : ""}
                >
                  Existing
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant={encounterMode === "new" ? "default" : "outline"}
                  onClick={() => setEncounterMode("new")}
                  className={encounterMode === "new" ? "bg-rose-600 hover:bg-rose-700" : ""}
                >
                  Create New (Emergency)
                </Button>
              </div>
              {encounterMode === "existing" && (
                <Select value={encounterId || undefined} onValueChange={setEncounterId}>
                  <SelectTrigger><SelectValue placeholder="Select encounter" /></SelectTrigger>
                  <SelectContent>
                    {(encountersData?.items || [])
                      .filter((e: any) => e.status === "open" || e.status === "in_progress")
                      .map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.encounterNumber} • {e.encounterType} • {formatDate(e.startAt, true)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              {encounterMode === "new" && (
                <p className="text-xs text-slate-500">
                  A new emergency encounter will be created at the active facility.
                </p>
              )}
            </div>
          )}
        </FormSection>

        {/* ============== VITAL SIGNS SECTION ============== */}
        <FormSection title="Vital Signs" icon={<Activity className="w-4 h-4 text-rose-600" />}>
          {/* Real-time abnormal alerts banner */}
          {abnormalAlerts.length > 0 && (
            <div className={`rounded-lg border p-3 mb-3 ${
              criticalCount > 0 ? "border-rose-300 bg-rose-50" : "border-amber-300 bg-amber-50"
            }`}>
              <div className="flex items-center gap-2 mb-1.5">
                <AlertOctagon className={`w-4 h-4 ${criticalCount > 0 ? "text-rose-600" : "text-amber-600"}`} />
                <span className={`text-sm font-bold ${criticalCount > 0 ? "text-rose-800" : "text-amber-800"}`}>
                  Real-time Vital Alerts
                </span>
                <span className="text-xs text-slate-600">
                  ({criticalCount} critical, {abnormalCount} abnormal)
                </span>
              </div>
              <ul className="space-y-1">
                {abnormalAlerts.map((a, i) => (
                  <li
                    key={i}
                    className={`text-xs font-medium flex items-start gap-1.5 ${
                      a.level === "critical" ? "text-rose-700" : "text-amber-700"
                    }`}
                  >
                    <span>{a.level === "critical" ? "⚠" : "•"}</span>
                    <span>{a.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <VitalInput label="Temp (°C)" value={v.temperature} onChange={(val) => setField("temperature", val)} placeholder="36.5" alert={getAlert(abnormalAlerts, "temperature")} />
            <VitalInput label="Pulse (bpm)" value={v.pulse} onChange={(val) => setField("pulse", val)} placeholder="72" alert={getAlert(abnormalAlerts, "pulse")} />
            <VitalInput label="Resp Rate" value={v.respiratoryRate} onChange={(val) => setField("respiratoryRate", val)} placeholder="16" alert={getAlert(abnormalAlerts, "respiratoryRate")} />
            <VitalInput label="Systolic BP" value={v.systolicBp} onChange={(val) => setField("systolicBp", val)} placeholder="120" alert={getAlert(abnormalAlerts, "systolicBp")} />
            <VitalInput label="Diastolic BP" value={v.diastolicBp} onChange={(val) => setField("diastolicBp", val)} placeholder="80" alert={getAlert(abnormalAlerts, "diastolicBp")} />
            <VitalInput label="SpO₂ (%)" value={v.oxygenSaturation} onChange={(val) => setField("oxygenSaturation", val)} placeholder="98" alert={getAlert(abnormalAlerts, "oxygenSaturation")} />
            <VitalInput label="Weight (kg)" value={v.weight} onChange={(val) => setField("weight", val)} placeholder="65" />
            <VitalInput label="Height (cm)" value={v.height} onChange={(val) => setField("height", val)} placeholder="170" />
            <VitalInput label="Glucose (mg/dL)" value={v.bloodGlucose} onChange={(val) => setField("bloodGlucose", val)} placeholder="90" alert={getAlert(abnormalAlerts, "bloodGlucose")} />
            <VitalInput label="Pain (0-10)" value={v.painScore} onChange={(val) => setField("painScore", val)} placeholder="0" alert={getAlert(abnormalAlerts, "painScore")} />
            <div>
              <Label className="text-xs">BMI (auto)</Label>
              <Input
                value={bmi ?? ""}
                disabled
                placeholder="—"
                className={bmi != null && (bmi < 18.5 || bmi >= 30) ? "bg-amber-50" : ""}
              />
              {bmi != null && (bmi < 18.5 || bmi >= 30) && (
                <p className="text-[10px] text-amber-700 mt-0.5 font-medium">
                  {bmi < 18.5 ? "Underweight" : "Obese"}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Consciousness</Label>
              <Select value={v.consciousnessLevel || undefined} onValueChange={(val) => setField("consciousnessLevel", val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONSCIOUSNESS_LEVELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </FormSection>

        {/* ============== PAIN ASSESSMENT ============== */}
        <FormSection title="Pain Assessment" icon={<Droplet className="w-4 h-4 text-rose-600" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Pain Location</Label>
              <Input
                value={v.painLocation}
                onChange={(e) => setField("painLocation", e.target.value)}
                placeholder="e.g., chest, lower right abdomen..."
              />
            </div>
            <div>
              <Label className="text-xs">Pain Character</Label>
              <Input
                value={v.painCharacter}
                onChange={(e) => setField("painCharacter", e.target.value)}
                placeholder="e.g., sharp, dull, throbbing, burning..."
              />
            </div>
          </div>
        </FormSection>

        {/* ============== GCS (collapsible) ============== */}
        <Collapsible open={gcsOpen} onOpenChange={setGcsOpen}>
          <Card className="border-slate-200">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="w-4 h-4 text-rose-600" />
                    Glasgow Coma Scale (GCS)
                    {gcsTotal != null && (
                      <Badge
                        variant="outline"
                        className={`ml-2 ${
                          gcsTotal <= 8 ? "border-rose-300 text-rose-700 bg-rose-50" :
                          gcsTotal <= 12 ? "border-amber-300 text-amber-700 bg-amber-50" :
                          "border-emerald-300 text-emerald-700 bg-emerald-50"
                        }`}
                      >
                        Total: {gcsTotal}/15
                      </Badge>
                    )}
                  </CardTitle>
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${gcsOpen ? "rotate-180" : ""}`} />
                </div>
                <CardDescription>Eye (1-4) + Verbal (1-5) + Motor (1-6) = Total /15</CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Eye Opening (1-4)</Label>
                    <Select value={v.gcsEye || undefined} onValueChange={(val) => setField("gcsEye", val)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="4">4 — Spontaneous</SelectItem>
                        <SelectItem value="3">3 — To voice</SelectItem>
                        <SelectItem value="2">2 — To pain</SelectItem>
                        <SelectItem value="1">1 — None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Verbal Response (1-5)</Label>
                    <Select value={v.gcsVerbal || undefined} onValueChange={(val) => setField("gcsVerbal", val)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 — Oriented</SelectItem>
                        <SelectItem value="4">4 — Confused</SelectItem>
                        <SelectItem value="3">3 — Inappropriate</SelectItem>
                        <SelectItem value="2">2 — Incomprehensible</SelectItem>
                        <SelectItem value="1">1 — None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Motor Response (1-6)</Label>
                    <Select value={v.gcsMotor || undefined} onValueChange={(val) => setField("gcsMotor", val)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">6 — Obeys commands</SelectItem>
                        <SelectItem value="5">5 — Localizes pain</SelectItem>
                        <SelectItem value="4">4 — Withdraws</SelectItem>
                        <SelectItem value="3">3 — Flexion (decorticate)</SelectItem>
                        <SelectItem value="2">2 — Extension (decerebrate)</SelectItem>
                        <SelectItem value="1">1 — None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">GCS Total</Label>
                    <div className={`flex items-center justify-center h-9 rounded-md border text-lg font-bold tabular-nums ${
                      gcsTotal == null ? "border-slate-200 bg-slate-50 text-slate-400" :
                      gcsTotal <= 8 ? "border-rose-300 bg-rose-50 text-rose-700" :
                      gcsTotal <= 12 ? "border-amber-300 bg-amber-50 text-amber-700" :
                      "border-emerald-300 bg-emerald-50 text-emerald-700"
                    }`}>
                      {gcsTotal != null ? `${gcsTotal}/15` : "—"}
                    </div>
                    {getAlert(abnormalAlerts, "gcs") && (
                      <p className={`text-[10px] mt-0.5 font-medium ${
                        getAlert(abnormalAlerts, "gcs")?.level === "critical" ? "text-rose-700" : "text-amber-700"
                      }`}>
                        {getAlert(abnormalAlerts, "gcs")?.message}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* ============== TRIAGE ASSESSMENT ============== */}
        <FormSection title="Triage Assessment" icon={<Stethoscope className="w-4 h-4 text-rose-600" />}>
          <div className="space-y-3">
            <div>
              <FieldLabel required>Chief Complaint</FieldLabel>
              <Textarea
                value={v.chiefComplaint}
                onChange={(e) => setField("chiefComplaint", e.target.value)}
                placeholder="Patient's main complaint..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">General Appearance</Label>
                <Select value={v.generalAppearance || undefined} onValueChange={(val) => setField("generalAppearance", val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GENERAL_APPEARANCES.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel required>Triage Category</FieldLabel>
                <Select value={v.triageCategory || undefined} onValueChange={(val) => setField("triageCategory", val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIAGE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={v.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Additional triage notes..."
                rows={2}
              />
            </div>
          </div>
        </FormSection>

        {/* ============== ESCALATION ============== */}
        <FormSection title="Escalation" icon={<ShieldAlert className="w-4 h-4 text-rose-600" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Escalation Level</Label>
              <Select value={v.escalationLevel || "none"} onValueChange={(val) => setField("escalationLevel", val === "none" ? "" : val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="nurse">Nurse</SelectItem>
                  <SelectItem value="clinician">Clinician</SelectItem>
                  <SelectItem value="emergency_team">Emergency Team</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Escalation Reason</Label>
              <Input
                value={v.escalationReason}
                onChange={(e) => setField("escalationReason", e.target.value)}
                placeholder="e.g., deteriorating vitals..."
              />
            </div>
          </div>
        </FormSection>

        {/* ============== REASSESSMENT ============== */}
        <FormSection title="Reassessment" icon={<RefreshCw className="w-4 h-4 text-rose-600" />}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="reassess"
                checked={v.isReassessment}
                onCheckedChange={(checked) => setField("isReassessment", checked === true)}
              />
              <Label htmlFor="reassess" className="text-sm cursor-pointer">
                Mark as reassessment (follow-up of previous triage)
              </Label>
            </div>
            {v.isReassessment && (
              <div>
                <Label className="text-xs">Parent Triage Record (optional)</Label>
                <Select value={v.parentTriageId || undefined} onValueChange={(val) => setField("parentTriageId", val)}>
                  <SelectTrigger><SelectValue placeholder="Select previous triage..." /></SelectTrigger>
                  <SelectContent>
                    {(patientTriageData?.items || []).map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {formatDate(t.recordedAt, true)} • {(t.triageCategory || "—").replace(/_/g, " ")}
                        {t.chiefComplaint ? ` • ${t.chiefComplaint.substring(0, 30)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {patientTriageData?.items?.length === 0 && (
                  <p className="text-xs text-slate-500 mt-1">No previous triage records found for this patient.</p>
                )}
              </div>
            )}
          </div>
        </FormSection>

        {/* ============== SUBMIT ============== */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-3 border-t">
          <div className="flex items-center gap-2">
            <Checkbox
              id="recVitals"
              checked={v.recordVitalSigns}
              onCheckedChange={(checked) => setField("recordVitalSigns", checked === true)}
            />
            <Label htmlFor="recVitals" className="text-sm cursor-pointer">
              Also create VitalSign record
            </Label>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !patientId}
            className="gap-2 bg-rose-600 hover:bg-rose-700"
          >
            {saveMutation.isPending ? <Save className="w-4 h-4 animate-pulse" /> : <Stethoscope className="w-4 h-4" />}
            {saveMutation.isPending ? "Saving..." : "Save Triage Record"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// SHARED FORM SECTION
// =====================================================================
function FormSection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-1.5">
        {icon}
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      </div>
      <div>{children}</div>
    </div>
  );
}

// =====================================================================
// VITAL INPUT (with inline alert)
// =====================================================================
function VitalInput({
  label, value, onChange, placeholder, alert,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  alert?: AbnormalAlert;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          alert
            ? alert.level === "critical"
              ? "border-rose-400 bg-rose-50 focus-visible:ring-rose-200"
              : "border-amber-400 bg-amber-50 focus-visible:ring-amber-200"
            : ""
        }
      />
      {alert && (
        <p className={`text-[10px] mt-0.5 font-medium ${alert.level === "critical" ? "text-rose-700" : "text-amber-700"}`}>
          {alert.level === "critical" ? "⚠ " : "• "}{alert.message}
        </p>
      )}
    </div>
  );
}

// =====================================================================
// TRIAGE HISTORY TAB — Vital History Timeline (table + detail dialog)
// =====================================================================
function TriageHistory({ facilityId }: { facilityId: string | null }) {
  const selectPatient = useAppStore((s) => s.selectPatient);
  const setView = useAppStore((s) => s.setView);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["triage", facilityId],
    queryFn: () => fetchJson(`/api/triage?facilityId=${facilityId}&limit=100`),
    enabled: !!facilityId,
  });

  const filtered = useMemo(() => {
    const items = data?.items || [];
    return items.filter((t: any) => {
      if (filterCategory !== "all" && t.triageCategory !== filterCategory) return false;
      if (filterDateFrom) {
        const from = new Date(filterDateFrom + "T00:00:00");
        if (new Date(t.recordedAt) < from) return false;
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo + "T23:59:59");
        if (new Date(t.recordedAt) > to) return false;
      }
      return true;
    });
  }, [data, filterCategory, filterDateFrom, filterDateTo]);

  if (!facilityId) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-amber-700 bg-amber-50 rounded-lg">
          Select a facility.
        </CardContent>
      </Card>
    );
  }
  if (isLoading) return <LoadingState rows={5} />;
  if (isError) return <ErrorState message="Failed to load triage records" onRetry={() => refetch()} />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Triage History &amp; Vital Timeline</CardTitle>
            <CardDescription>Chronological triage records with abnormal alerts and escalation flags</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-600">Filters:</span>
            </div>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="h-8 w-auto text-xs"
            />
            <span className="text-xs text-slate-400">to</span>
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="h-8 w-auto text-xs"
            />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {TRIAGE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <EmptyState
            title="No triage records found"
            description="Try adjusting filters or record a new triage."
          />
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                  <th className="text-left p-3 font-semibold text-slate-700">MRN</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Date/Time</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Category</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Flags</th>
                  <th className="text-left p-3 font-semibold text-slate-700">BP</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Temp</th>
                  <th className="text-left p-3 font-semibold text-slate-700">Pulse</th>
                  <th className="text-left p-3 font-semibold text-slate-700">SpO₂</th>
                  <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t: any) => {
                  const alerts = parseAbnormalAlerts(t.abnormalVitalsAlert);
                  const criticalAlerts = alerts.filter((a) => a.includes("CRITICAL")).length;
                  return (
                    <tr
                      key={t.id}
                      className="border-b hover:bg-rose-50/40 cursor-pointer transition-colors"
                      onClick={() => setSelected(t)}
                    >
                      <td className="p-3 font-medium">
                        {t.patient?.firstName} {t.patient?.lastName}
                        {t.isReassessment && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-700 bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded">
                            <RefreshCw className="w-2.5 h-2.5" />Reassess
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs">{t.patient?.patientNumber}</td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">{formatDate(t.recordedAt, true)}</td>
                      <td className="p-3"><TriageCategoryBadge category={t.triageCategory} /></td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {alerts.length > 0 && (
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                              criticalAlerts > 0
                                ? "text-rose-700 bg-rose-100 border-rose-200"
                                : "text-amber-700 bg-amber-100 border-amber-200"
                            }`}>
                              <AlertOctagon className="w-2.5 h-2.5" />
                              {alerts.length} alert{alerts.length > 1 ? "s" : ""}
                            </span>
                          )}
                          {t.escalationLevel && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-orange-700 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded">
                              <ShieldAlert className="w-2.5 h-2.5" />
                              {t.escalationLevel.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">{t.systolicBp ? `${t.systolicBp}/${t.diastolicBp}` : "—"}</td>
                      <td className="p-3">{t.temperature ? `${t.temperature}°C` : "—"}</td>
                      <td className="p-3">{t.pulse ?? "—"}</td>
                      <td className="p-3">{t.oxygenSaturation ? `${t.oxygenSaturation}%` : "—"}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-slate-600 hover:text-rose-700"
                            onClick={() => setSelected(t)}
                            title="View Detail"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {t.patientId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-slate-600 hover:text-emerald-700"
                              onClick={() => { selectPatient(t.patientId); setView("patient_360"); }}
                              title="View Patient 360"
                            >
                              <Heart className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {t.patient && (
                            <SpecialtyReferralButton
                              patient={t.patient}
                              fromDepartment="ER"
                              label=""
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-amber-600 hover:text-amber-700"
                            />
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
      <TriageDetailDialog record={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}

// =====================================================================
// TRIAGE CATEGORY BADGE
// =====================================================================
function TriageCategoryBadge({ category }: { category?: string | null }) {
  if (!category) return <span className="text-slate-400">—</span>;
  const cat = TRIAGE_CATEGORIES.find((c) => c.value === category);
  if (!cat) {
    return <Badge variant="outline" className="text-xs">{category.replace(/_/g, " ")}</Badge>;
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cat.color}`}>
      {cat.label.split(" — ")[0]}
    </span>
  );
}

// =====================================================================
// TRIAGE DETAIL DIALOG
// =====================================================================
function TriageDetailDialog({ record, onClose }: { record: any; onClose: () => void }) {
  if (!record) return null;
  const alerts = parseAbnormalAlerts(record.abnormalVitalsAlert);
  const cat = TRIAGE_CATEGORIES.find((c) => c.value === record.triageCategory);

  return (
    <Dialog open={!!record} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Activity className="w-5 h-5 text-rose-600" />
            Triage Record Detail
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {record.patient?.firstName} {record.patient?.lastName} • {formatDate(record.recordedAt, true)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Category banner */}
          {cat && (
            <div className={`rounded-lg p-3 text-white bg-gradient-to-r ${cat.gradient}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/80">Triage Category</p>
                  <p className="text-base font-bold">{cat.label}</p>
                </div>
                {record.isReassessment && (
                  <span className="text-xs bg-white/20 px-2 py-1 rounded inline-flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />Reassessment
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Abnormal alerts */}
          {alerts.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertOctagon className="w-4 h-4 text-rose-600" />
                <span className="text-sm font-bold text-rose-800">
                  Abnormal Vital Alerts ({alerts.length})
                </span>
              </div>
              <ul className="space-y-1">
                {alerts.map((a, i) => (
                  <li
                    key={i}
                    className={`text-xs font-medium ${a.includes("CRITICAL") ? "text-rose-700" : "text-amber-700"}`}
                  >
                    {a.includes("CRITICAL") ? "⚠ " : "• "}{a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Vitals grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DetailField label="Temperature" value={record.temperature ? `${record.temperature}°C` : null} />
            <DetailField label="Pulse" value={record.pulse ? `${record.pulse} bpm` : null} />
            <DetailField label="Resp Rate" value={record.respiratoryRate ? `${record.respiratoryRate}/min` : null} />
            <DetailField label="BP" value={record.systolicBp ? `${record.systolicBp}/${record.diastolicBp} mmHg` : null} />
            <DetailField label="SpO₂" value={record.oxygenSaturation ? `${record.oxygenSaturation}%` : null} />
            <DetailField label="Weight" value={record.weight ? `${record.weight} kg` : null} />
            <DetailField label="Height" value={record.height ? `${record.height} cm` : null} />
            <DetailField label="BMI" value={record.bmi ? record.bmi.toString() : null} />
            <DetailField label="Glucose" value={record.bloodGlucose ? `${record.bloodGlucose} mg/dL` : null} />
            <DetailField label="Pain Score" value={record.painScore != null ? `${record.painScore}/10` : null} />
            <DetailField label="Consciousness" value={record.consciousnessLevel ? record.consciousnessLevel.replace(/_/g, " ") : null} />
            <DetailField label="General Appearance" value={record.generalAppearance ? record.generalAppearance.replace(/_/g, " ") : null} />
          </div>

          {/* GCS */}
          {(record.gcsEye || record.gcsVerbal || record.gcsMotor) && (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                Glasgow Coma Scale
              </p>
              <div className="grid grid-cols-4 gap-2 text-sm">
                <DetailField label="Eye" value={record.gcsEye ? `${record.gcsEye}/4` : null} />
                <DetailField label="Verbal" value={record.gcsVerbal ? `${record.gcsVerbal}/5` : null} />
                <DetailField label="Motor" value={record.gcsMotor ? `${record.gcsMotor}/6` : null} />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Total</p>
                  <p className={`text-base font-bold ${
                    !record.gcsTotal ? "text-slate-400" :
                    record.gcsTotal <= 8 ? "text-rose-700" :
                    record.gcsTotal <= 12 ? "text-amber-700" :
                    "text-emerald-700"
                  }`}>
                    {record.gcsTotal ? `${record.gcsTotal}/15` : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Pain assessment */}
          {(record.painLocation || record.painCharacter) && (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                <Droplet className="w-3.5 h-3.5" />
                Pain Assessment
              </p>
              <div className="grid grid-cols-2 gap-2">
                <DetailField label="Location" value={record.painLocation} />
                <DetailField label="Character" value={record.painCharacter} />
              </div>
            </div>
          )}

          {/* Assessment notes */}
          {(record.chiefComplaint || record.notes) && (
            <div className="space-y-2">
              {record.chiefComplaint && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Chief Complaint</p>
                  <p className="text-sm text-slate-800">{record.chiefComplaint}</p>
                </div>
              )}
              {record.notes && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Notes</p>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{record.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Escalation */}
          {record.escalationLevel && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-bold text-orange-800">
                  Escalated to {record.escalationLevel.replace(/_/g, " ")}
                </span>
              </div>
              {record.escalationReason && (
                <p className="text-xs text-orange-700">{record.escalationReason}</p>
              )}
            </div>
          )}

          {/* Recorded by */}
          {record.recordedBy && (
            <p className="text-xs text-slate-500 border-t pt-2">
              Recorded by: {record.recordedBy.firstName} {record.recordedBy.lastName}
              {record.encounter?.encounterNumber && ` • Encounter: ${record.encounter.encounterNumber}`}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// DETAIL FIELD (small label/value pair)
// =====================================================================
function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value || "—"}</p>
    </div>
  );
}

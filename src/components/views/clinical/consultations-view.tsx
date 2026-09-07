"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus, ClipboardList, PenSquare, Save, Check, X, Lock, Share2, Eye,
  Clock, StickyNote, LayoutDashboard, ListChecks, Pill, FlaskConical,
  Image as ImageIcon, BedDouble, CalendarClock, RotateCw, Activity,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, MiniStatCard, PageHeader,
  formatDate, formatRelative, calculateAge, safeJson, ClearableSearch} from "@/components/ui-helpers"
import { SpecialtyReferralButton } from "@/components/ui/specialty-referral-button";
import { DiagnosisPicker } from "@/components/ui/diagnosis-picker";
import { FieldLabel } from "@/components/ui/required-label";

// =====================================================================
// CLINICAL FIELDS — the set of fields that can be "dirty" (changed by
// the clinician but not yet persisted).  Used by `hasUnsavedChanges`
// to detect whether an auto-save is needed before Quick Action navigation.
// =====================================================================
const CONSULTATION_EDITABLE_FIELDS = [
  "chiefComplaint", "historyPresentingIllness", "pastMedicalHistory",
  "pastSurgicalHistory", "medicationHistory", "familyHistory",
  "socialHistory", "reviewOfSystems", "physicalExamination",
  "assessment", "treatmentPlan", "followUpPlan",
  "disposition", "dispositionNotes", "patientInstructions",
] as const;

/** Returns true if any editable clinical field in `editable` differs from
 *  the persisted `original` consultation.  Used to decide whether an
 *  auto-save is needed before navigating to a side workflow (Lab/Imaging/Pharmacy).
 *  Both `null`/`undefined`/`""` are treated as equivalent (empty). */
function hasUnsavedChanges(editable: any, original: any): boolean {
  if (!editable || !original) return false;
  for (const f of CONSULTATION_EDITABLE_FIELDS) {
    const a = (editable[f] ?? "").trim();
    const b = (original[f] ?? "").trim();
    if (a !== b) return true;
  }
  return false;
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

// Disposition options — must match API values (lowercase snake_case)
const DISPOSITIONS = [
  { value: "outpatient", label: "Outpatient" },
  { value: "admission", label: "Admission" },
  { value: "referral", label: "Referral" },
  { value: "follow_up", label: "Follow-up" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "lab", label: "Lab" },
  { value: "imaging", label: "Imaging" },
  { value: "procedure", label: "Procedure" },
  { value: "discharge", label: "Discharge" },
  { value: "emergency", label: "Emergency" },
  { value: "other", label: "Other" },
];

export function ConsultationsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canCreate = user?.roles?.includes("super_admin") || perms.includes("clinical.create");
  const canSign = user?.roles?.includes("super_admin") || perms.includes("clinical.sign");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const setView = useAppStore((s) => s.setView);
  const selectedPatientId = useAppStore((s) => s.selectedPatientId);
  const selectedEncounterId = useAppStore((s) => s.selectedEncounterId);
  const selectedConsultationId = useAppStore((s) => s.selectedConsultationId);
  const selectConsultation = useAppStore((s) => s.selectConsultation);
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [viewConsult, setViewConsult] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "list">("list");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["consultations", activeFacilityId, selectedEncounterId],
    queryFn: () => {
      // When selectedEncounterId is set (e.g., from Queue navigation),
      // filter consultations by encounter so the relevant ones appear at
      // the top of the list.  The API returns all facility consultations
      // when no encounterId is provided.
      const url = selectedEncounterId
        ? `/api/consultations?facilityId=${activeFacilityId}&encounterId=${selectedEncounterId}`
        : `/api/consultations?facilityId=${activeFacilityId}`;
      return fetchJson(url);
    },
    enabled: !!activeFacilityId,
  });

  // Auto-open the consultation identified by selectedConsultationId (set
  // by the Queue view's "Continue Consultation" / "View Consultation"
  // buttons).  We only auto-open once per selectedConsultationId change —
  // the effect's dependency array ensures we don't loop.
  useEffect(() => {
    if (!selectedConsultationId || !data?.items) return;
    const found = data.items.find((c: any) => c.id === selectedConsultationId);
    if (found) {
      setViewConsult(found);
      // Clear the selectedConsultationId so the user can manually navigate
      // away and come back without the dialog auto-reopening.
      selectConsultation(null);
    }
  }, [selectedConsultationId, data, selectConsultation]);

  // When the user arrives from Queue with selectedPatientId +
  // selectedEncounterId set BUT no existing consultation (the Queue
  // "Start Consultation" path), auto-open the New Consultation dialog
  // so they don't have to click the button manually.  We only fire this
  // once per (patient, encounter) pair — the dependency array ensures
  // we don't loop, and we clear the trigger by setting activeTab to
  // "list" (the dialog renders regardless of tab).
  const [autoOpenFired, setAutoOpenFired] = useState<string | null>(null);
  useEffect(() => {
    if (
      canCreate &&
      selectedPatientId &&
      selectedEncounterId &&
      data?.items &&
      // Only auto-open when there are no consultations for this encounter
      // (otherwise the user wants to view an existing one, not create a
      // duplicate).
      !data.items.some((c: any) => c.encounterId === selectedEncounterId) &&
      autoOpenFired !== `${selectedPatientId}:${selectedEncounterId}`
    ) {
      setShowNew(true);
      setAutoOpenFired(`${selectedPatientId}:${selectedEncounterId}`);
    }
  }, [canCreate, selectedPatientId, selectedEncounterId, data, autoOpenFired]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Consultations"
        description="Record clinical consultations and patient assessments"
        icon={ClipboardList}
        gradient="from-purple-500 to-purple-600"
        actions={
          <>
            <SpecialtyReferralButton
              label="Refer to Specialty"
              fromDepartment="OPD"
              variant="default"
              size="sm"
              className="bg-white/20 border border-white/30 text-white hover:bg-white/30"
            />
            {canCreate ? (
              <Button onClick={() => setShowNew(true)} className="bg-white/20 border border-white/30 text-white hover:bg-white/30">
                <Plus className="w-4 h-4 mr-1" /> New Consultation
              </Button>
            ) : undefined}
          </>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view consultations.</CardContent></Card>
      )}

      {activeFacilityId && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "dashboard" | "list")}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="dashboard" className="gap-1.5">
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5">
              <ListChecks className="w-4 h-4" /> All Consultations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            <ConsultationsDashboard facilityId={activeFacilityId} canCreate={canCreate} onNew={() => setShowNew(true)} />
          </TabsContent>

          <TabsContent value="list" className="mt-4">
            {isLoading ? (
              <LoadingState rows={6} />
            ) : isError ? (
              <ErrorState message="Failed to load consultations" onRetry={() => refetch()} />
            ) : !data?.items || data.items.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    title="No consultations yet"
                    description={canCreate ? "Start a new consultation note for an encounter." : "Consultations can only be created by doctors, specialists, physician assistants, clinical officers, or medical officers."}
                    action={canCreate ? <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Consultation</Button> : undefined}
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {data.items.map((c: any) => (
                  <Card key={c.id} className="hover:shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => setViewConsult(c)}
                        >
                          <div className="font-medium text-slate-900 truncate flex items-center gap-2 flex-wrap">
                            <span className="truncate">
                              {c.patient?.firstName} {c.patient?.lastName}
                              {c.patient?.dateOfBirth && (
                                <span className="text-xs text-slate-500 ml-1 font-normal">
                                  · {calculateAge(c.patient.dateOfBirth)}y
                                  {c.patient.sex ? ` · ${c.patient.sex}` : ""}
                                </span>
                              )}
                            </span>
                            <span className="text-slate-400">—</span>
                            <span className="text-slate-700 truncate">{c.chiefComplaint || "No chief complaint"}</span>
                            {c.disposition && (
                              <span className="text-[10px] uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                                {DISPOSITIONS.find((d) => d.value === c.disposition)?.label || c.disposition}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {c.clinician ? `Dr. ${c.clinician.firstName} ${c.clinician.lastName}` : "Unassigned"} • {c.encounter?.facility?.name || "—"} • {formatDate(c.createdAt, true)} ({formatRelative(c.createdAt)})
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {c.patientId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-slate-600 hover:text-emerald-700"
                              onClick={() => { selectPatient(c.patientId); setView("patient_360"); }}
                              title="View Patient 360"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {c.patient && (
                            <SpecialtyReferralButton
                              patient={c.patient}
                              fromDepartment="OPD"
                              label=""
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-amber-600 hover:text-amber-700"
                            />
                          )}
                          <StatusBadge status={c.status} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {canCreate && (
        <NewConsultationDialog
          open={showNew}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            qc.invalidateQueries({ queryKey: ["consultations"] });
            qc.invalidateQueries({ queryKey: ["consultations-stats"] });
          }}
          defaultFacilityId={activeFacilityId}
          defaultPatientId={selectedPatientId}
          defaultEncounterId={selectedEncounterId}
          onOpenExisting={(consultation) => {
            // Close the New dialog and open the View dialog with the
            // existing consultation — this prevents creating a duplicate.
            setShowNew(false);
            setViewConsult(consultation);
          }}
        />
      )}
      {viewConsult && (
        <ViewConsultationDialog
          consultation={viewConsult}
          onClose={() => setViewConsult(null)}
          onChanged={() => {
            setViewConsult(null);
            qc.invalidateQueries({ queryKey: ["consultations"] });
            qc.invalidateQueries({ queryKey: ["consultations-stats"] });
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// CONSULTATIONS DASHBOARD — KPI grid + performance card, auto-refresh 30s
// =====================================================================
function ConsultationsDashboard({ facilityId, canCreate, onNew }: { facilityId: string | null; canCreate: boolean; onNew: () => void }) {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["consultations-stats", facilityId],
    queryFn: () => fetchJson(`/api/consultations/stats?facilityId=${facilityId}`),
    enabled: !!facilityId,
    refetchInterval: 30000, // auto-refresh every 30s
  });

  const kpis = data?.kpis || {
    total: 0, drafts: 0, signed: 0, amended: 0,
    admissions: 0, referrals: 0, followUps: 0, prescriptions: 0,
    avgDurationMin: 0,
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
        <div className="h-28 rounded-xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="Failed to load consultation KPIs" onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-600" />
          <p className="text-sm font-semibold text-slate-700">Today&apos;s Consultations</p>
          <span className="text-[10px] text-slate-400 inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> auto-refresh 30s
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5 h-7 text-xs">
          <RotateCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* KPI grid — 8 MiniStatCards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <MiniStatCard
          label="Total Today"
          value={kpis.total ?? 0}
          icon={ClipboardList}
          gradient="from-purple-500 to-purple-600"
          sublabel="All consultations"
        />
        <MiniStatCard
          label="Drafts"
          value={kpis.drafts ?? 0}
          icon={PenSquare}
          gradient="from-slate-500 to-slate-600"
          sublabel="Pending finalization"
        />
        <MiniStatCard
          label="Signed / Finalized"
          value={kpis.signed ?? 0}
          icon={Check}
          gradient="from-emerald-500 to-emerald-600"
          sublabel="Completed today"
        />
        <MiniStatCard
          label="Amended"
          value={kpis.amended ?? 0}
          icon={StickyNote}
          gradient="from-amber-500 to-amber-600"
          sublabel="Post-sign edits"
        />
        <MiniStatCard
          label="Admissions"
          value={kpis.admissions ?? 0}
          icon={BedDouble}
          gradient="from-rose-500 to-red-600"
          sublabel="Disposition: Admission"
        />
        <MiniStatCard
          label="Referrals"
          value={kpis.referrals ?? 0}
          icon={Share2}
          gradient="from-orange-500 to-orange-600"
          sublabel="Disposition: Referral"
        />
        <MiniStatCard
          label="Follow-ups"
          value={kpis.followUps ?? 0}
          icon={CalendarClock}
          gradient="from-cyan-500 to-cyan-600"
          sublabel="Disposition: Follow-up"
        />
        <MiniStatCard
          label="Prescriptions"
          value={kpis.prescriptions ?? 0}
          icon={Pill}
          gradient="from-pink-500 to-pink-600"
          sublabel="Disposition: Pharmacy"
        />
      </div>

      {/* Performance card — Average Consultation Duration */}
      <Card className="border-purple-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-600" />
            Average Consultation Duration
          </CardTitle>
          <CardDescription className="text-xs">
            Based on {kpis.signed ?? 0} finalized consultation(s) timed today. Auto-refreshes every 30 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-purple-700 tabular-nums">
              {kpis.avgDurationMin ?? 0}
            </span>
            <span className="text-sm text-slate-500">minutes</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-purple-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all"
              style={{ width: `${Math.min(100, ((kpis.avgDurationMin ?? 0) / 60) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Benchmark: 60 min max (typical OPD consult target).
          </p>
        </CardContent>
      </Card>

      {/* Quick action CTA when nothing happening today */}
      {kpis.total === 0 && canCreate && (
        <Card className="border-dashed border-purple-300">
          <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">No consultations recorded today</p>
              <p className="text-xs text-slate-500 mt-0.5">Start a new consultation note to begin tracking today&apos;s activity.</p>
            </div>
            <Button onClick={onNew} className="gap-2 bg-purple-600 hover:bg-purple-700 shrink-0">
              <Plus className="w-4 h-4" /> New Consultation
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// NEW CONSULTATION DIALOG — patient search + encounter selection + form
// =====================================================================
function NewConsultationDialog({
  open,
  onClose,
  onCreated,
  defaultFacilityId,
  defaultPatientId,
  defaultEncounterId,
  onOpenExisting,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultFacilityId: string | null;
  /** Pre-fill patient (from queue/encounter navigation context). */
  defaultPatientId?: string | null;
  /** Pre-fill encounter (from queue/encounter navigation context). */
  defaultEncounterId?: string | null;
  /** Called when the user chooses to open/continue/view an existing
   *  consultation for the selected encounter (instead of creating a
   *  duplicate).  The parent view should close this dialog and open
   *  the ViewConsultationDialog with the specified consultation. */
  onOpenExisting?: (consultation: any) => void;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState(defaultPatientId || "");
  const [encounterId, setEncounterId] = useState(defaultEncounterId || "");
  const [form, setForm] = useState({
    chiefComplaint: "", historyPresentingIllness: "", pastMedicalHistory: "",
    pastSurgicalHistory: "", medicationHistory: "", familyHistory: "",
    socialHistory: "", reviewOfSystems: "", physicalExamination: "",
    assessment: "", treatmentPlan: "", followUpPlan: "",
  });
  const [saving, setSaving] = useState(false);
  const autoSavingRef = useRef(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const navigateFromConsultation = useAppStore((s) => s.navigateFromConsultation);
  // Pull store setters so we can clear the selected patient/encounter
  // when the dialog is cancelled — otherwise the pre-filled data persists
  // across reopens (the store's selectedPatientId/selectedEncounterId
  // are passed as defaultPatientId/defaultEncounterId props and the
  // useState only initializes once per mount, not per open).
  const selectPatientStore = useAppStore((s) => s.selectPatient);
  const selectEncounterStore = useAppStore((s) => s.selectEncounter);

  // ─── RESET ON OPEN/CLOSE ───────────────────────────────────────────
  // When the dialog transitions from closed → open, re-initialize the
  // form state from the current defaultPatientId/defaultEncounterId
  // props (which may have changed since the last open).  When it
  // transitions open → closed, clear ALL state so the next open starts
  // fresh.  This fixes the "pre-filled data persists after Cancel" bug.
  // We use a ref to track the previous open state so we detect the
  // transition, not just the open state.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // Dialog just opened — initialize from current props.
      setPatientId(defaultPatientId || "");
      setEncounterId(defaultEncounterId || "");
      setPatientQuery(""); // Will be set by the prefill effect below
      setForm({
        chiefComplaint: "", historyPresentingIllness: "", pastMedicalHistory: "",
        pastSurgicalHistory: "", medicationHistory: "", familyHistory: "",
        socialHistory: "", reviewOfSystems: "", physicalExamination: "",
        assessment: "", treatmentPlan: "", followUpPlan: "",
      });
      setSaving(false);
      setAutoSaving(false);
      autoSavingRef.current = false;
    }
    if (!open && prevOpenRef.current) {
      // Dialog just closed — clear all state.
      setPatientId("");
      setEncounterId("");
      setPatientQuery("");
      setForm({
        chiefComplaint: "", historyPresentingIllness: "", pastMedicalHistory: "",
        pastSurgicalHistory: "", medicationHistory: "", familyHistory: "",
        socialHistory: "", reviewOfSystems: "", physicalExamination: "",
        assessment: "", treatmentPlan: "", followUpPlan: "",
      });
      // Clear the store's selectedPatientId/selectedEncounterId so the
      // next "New Consultation" open (via the sidebar button, not via
      // Queue navigation) starts completely fresh.  When the user arrives
      // via Queue navigation, the store is re-set before this dialog
      // opens, so clearing here doesn't break that flow.
      selectPatientStore(null);
      selectEncounterStore(null);
    }
    prevOpenRef.current = open;
  }, [open, defaultPatientId, defaultEncounterId, selectPatientStore, selectEncounterStore]);

  // When the dialog is open with a defaultPatientId (from the store's
  // selectedPatientId, set by Queue/Encounter navigation), resolve the
  // patient's display name so the search box shows them by name instead
  // of requiring the user to type.  We only fetch when we have an id and
  // no current query text (so we don't overwrite a user's search).
  // We also only fire this when the dialog is open, so we don't fetch
  // unnecessarily when the dialog is closed.
  const { data: defaultPatient } = useQuery({
    queryKey: ["patient-prefill", defaultPatientId],
    queryFn: () => fetchJson(`/api/patients/${defaultPatientId}`),
    enabled: !!defaultPatientId && !!open && !patientQuery,
  });
  useEffect(() => {
    if (open && defaultPatient?.patient && !patientQuery) {
      const p = defaultPatient.patient;
      setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
    }
  }, [defaultPatient, patientQuery]);

  const setField = (k: string, val: string) => setForm((p) => ({ ...p, [k]: val }));

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

  // ─── DUPLICATE CONSULTATION DETECTION (per spec §5, §6, §7) ────────
  // When the user selects patient + encounter, look up whether a
  // consultation already exists for that encounter.  If it does, the
  // dialog shows a "consultation exists" banner with Continue/View/Amend
  // actions instead of allowing a new consultation to be created.
  // This prevents accidental duplicate primary consultations.
  const { data: existingConsultData } = useQuery({
    queryKey: ["existing-consultation", encounterId],
    queryFn: () => fetchJson(`/api/consultations?encounterId=${encounterId}&limit=1`),
    enabled: !!encounterId,
  });
  const existingConsultation: any = (existingConsultData?.items || [])[0] || null;
  const consultationExists = !!existingConsultation;

  const submit = async () => {
    if (!patientId || !encounterId) {
      toast.error("Please select patient and encounter");
      return;
    }
    // If the client-side lookup already detected an existing consultation,
    // block the submit — the user should use Continue/View instead.
    if (consultationExists && existingConsultation) {
      toast.info("A consultation already exists for this encounter. Use 'Continue' or 'View' instead.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, encounterId, ...form }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        // Handle 409 Conflict — server caught a duplicate that the
        // client-side lookup missed (e.g., a race condition).  Offer
        // to open the existing consultation instead of creating a new one.
        if (res.status === 409 && err.existingConsultation) {
          toast.info("A consultation already exists for this encounter. Opening it...");
          // Fetch the full consultation record so we can open it.
          const fullRes = await fetchJson(`/api/consultations/${err.existingConsultation.id}`);
          if (fullRes && onOpenExisting) {
            onOpenExisting(fullRes);
          }
          return;
        }
        throw new Error(err.error || "Failed");
      }
      toast.success("Consultation created (draft)");
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setForm({ chiefComplaint: "", historyPresentingIllness: "", pastMedicalHistory: "", pastSurgicalHistory: "", medicationHistory: "", familyHistory: "", socialHistory: "", reviewOfSystems: "", physicalExamination: "", assessment: "", treatmentPlan: "", followUpPlan: "" });
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // =====================================================================
  // AUTO-SAVE NEW CONSULTATION + NAVIGATE TO SIDE WORKFLOW
  // (per spec §1: Quick Action from an unsaved/new consultation MUST
  // auto-save as DRAFT before navigating)
  //
  // Sequence:
  //   1. Validate patientId + encounterId (minimum for POST /api/consultations)
  //   2. Prevent rapid double-clicks via ref (per spec §14)
  //   3. POST to create consultation with status DRAFT
  //   4. On success: close dialog, invalidate queries, navigate with the
  //      new consultationId as context
  //   5. On failure: show error, DO NOT navigate, preserve all form data
  //      so the clinician's work is not lost (per spec §13)
  // =====================================================================
  const autoSaveNewAndNavigate = async (targetView: any) => {
    if (autoSavingRef.current || saving) return;
    if (!patientId || !encounterId) {
      toast.error("Please select a patient and encounter before using Quick Actions.");
      return;
    }
    // ─── DUPLICATE CHECK (per spec §9, §18) ─────────────────────────
    // Before POSTing, check if a consultation already exists for this
    // encounter.  If it does, do NOT create a duplicate — use the
    // existing consultation's id for navigation instead.  This prevents
    // the auto-save from making the duplicate problem worse.
    if (consultationExists && existingConsultation) {
      // Use the existing consultation's id — do NOT POST a new one.
      toast.info("Using existing consultation for this encounter.", { id: undefined });
      navigateFromConsultation({
        patientId,
        encounterId,
        consultationId: existingConsultation.id,
        targetView,
      });
      return;
    }
    autoSavingRef.current = true;
    setAutoSaving(true);
    const toastId = toast.loading("Saving consultation draft...");
    try {
      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, encounterId, ...form }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        // Handle 409 Conflict — server caught a duplicate (race condition).
        // Use the existing consultation instead of creating a new one.
        if (res.status === 409 && err.existingConsultation) {
          toast.info("A consultation already exists — using it.", { id: toastId });
          navigateFromConsultation({
            patientId,
            encounterId,
            consultationId: err.existingConsultation.id,
            targetView,
          });
          return;
        }
        throw new Error(err.error || "Failed to save consultation draft");
      }
      const data = await safeJson(res);
      const newConsultationId = data.id;
      toast.success("Consultation draft saved", { id: toastId });
      onCreated();
      navigateFromConsultation({
        patientId,
        encounterId,
        consultationId: newConsultationId,
        targetView,
      });
    } catch (e: any) {
      toast.error(
        `Unable to save consultation draft. ${e.message}. Your consultation has not been saved. Please try again.`,
        { id: toastId },
      );
      // DO NOT navigate — stay in the dialog so work is not lost.
    } finally {
      autoSavingRef.current = false;
      setAutoSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="xl">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <DialogTitle>New Consultation Note</DialogTitle>
          <DialogDescription className="text-white/80">Will be saved as draft. Sign after completion.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <ClearableSearch value={patientQuery} onChange={setPatientQuery} placeholder="Search patient..." className="" inputClassName="" />
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
              <FieldLabel required>Encounter</FieldLabel>
              <Select value={encounterId || undefined} onValueChange={setEncounterId}>
                <SelectTrigger><SelectValue placeholder="Select encounter" /></SelectTrigger>
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

          {/* ─── EXISTING CONSULTATION DETECTION (per spec §5, §6, §7) ──
              When a consultation already exists for the selected encounter,
              show a banner with Continue/View/Amend actions instead of
              allowing a new consultation to be created.  This prevents
              duplicate primary consultations. */}
          {consultationExists && existingConsultation && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    An existing consultation is already associated with this encounter.
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Status: <span className="font-medium uppercase">{existingConsultation.status}</span>
                    {existingConsultation.clinician && (
                      <> • Clinician: {existingConsultation.clinician.firstName} {existingConsultation.clinician.lastName}</>
                    )}
                    {existingConsultation.createdAt && (
                      <> • Created {formatDate(existingConsultation.createdAt, true)}</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {existingConsultation.status === "draft" && (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                    onClick={() => onOpenExisting?.(existingConsultation)}
                  >
                    <ClipboardList className="w-3.5 h-3.5" /> Continue Consultation
                  </Button>
                )}
                {(existingConsultation.status === "signed" || existingConsultation.status === "amended") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => onOpenExisting?.(existingConsultation)}
                  >
                    <Eye className="w-3.5 h-3.5" /> View Consultation
                  </Button>
                )}
                {/* "Amend" button is offered by the ViewConsultationDialog
                    itself (gated by clinical.amend permission), so we don't
                    need to duplicate that logic here.  The View button opens
                    the consultation; the user can amend from there. */}
              </div>
              <p className="text-[11px] text-amber-600">
                A new consultation cannot be created for this encounter. Use the buttons above to open the existing consultation.
              </p>
            </div>
          )}

          {/* Hide the form tabs when a consultation already exists — the
              clinician should use the existing consultation's form, not fill
              out a new one that would create a duplicate. */}
          {!consultationExists && (
          <Tabs defaultValue="complaint">
            <TabsList className="flex w-max flex-wrap">
              <TabsTrigger value="complaint">Complaint</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="exam">Exam</TabsTrigger>
              <TabsTrigger value="plan">Plan</TabsTrigger>
            </TabsList>
            <TabsContent value="complaint" className="space-y-3 mt-3">
              <Section label="Chief Complaint"><Textarea value={form.chiefComplaint} onChange={(e) => setField("chiefComplaint", e.target.value)} rows={2} /></Section>
              <Section label="History of Presenting Illness (HPI)"><Textarea value={form.historyPresentingIllness} onChange={(e) => setField("historyPresentingIllness", e.target.value)} rows={4} /></Section>
              <Section label="Review of Systems"><Textarea value={form.reviewOfSystems} onChange={(e) => setField("reviewOfSystems", e.target.value)} rows={3} /></Section>
            </TabsContent>
            <TabsContent value="history" className="space-y-3 mt-3">
              <Section label="Past Medical History"><Textarea value={form.pastMedicalHistory} onChange={(e) => setField("pastMedicalHistory", e.target.value)} rows={3} /></Section>
              <Section label="Past Surgical History"><Textarea value={form.pastSurgicalHistory} onChange={(e) => setField("pastSurgicalHistory", e.target.value)} rows={3} /></Section>
              <Section label="Medication History"><Textarea value={form.medicationHistory} onChange={(e) => setField("medicationHistory", e.target.value)} rows={3} /></Section>
              <Section label="Family History"><Textarea value={form.familyHistory} onChange={(e) => setField("familyHistory", e.target.value)} rows={3} /></Section>
              <Section label="Social History"><Textarea value={form.socialHistory} onChange={(e) => setField("socialHistory", e.target.value)} rows={3} /></Section>
            </TabsContent>
            <TabsContent value="exam" className="space-y-3 mt-3">
              <Section label="Physical Examination"><Textarea value={form.physicalExamination} onChange={(e) => setField("physicalExamination", e.target.value)} rows={6} /></Section>
              <Section label="Assessment"><Textarea value={form.assessment} onChange={(e) => setField("assessment", e.target.value)} rows={4} /></Section>
            </TabsContent>
            <TabsContent value="plan" className="space-y-3 mt-3">
              <Section label="Treatment Plan"><Textarea value={form.treatmentPlan} onChange={(e) => setField("treatmentPlan", e.target.value)} rows={4} /></Section>
              <Section label="Follow-up Plan"><Textarea value={form.followUpPlan} onChange={(e) => setField("followUpPlan", e.target.value)} rows={2} /></Section>
            </TabsContent>
          </Tabs>
          )}

          {/* Quick Actions row — auto-save the consultation as Draft then
              navigate to the destination module with the patient/encounter/
              consultation context pre-filled.  Only visible when patient +
              encounter are selected (minimum required to create a draft).
              Also hidden when a consultation already exists (to prevent
              creating a duplicate via auto-save — the user should use
              the existing consultation's Quick Actions instead).
              Buttons are disabled while a save is in-flight (per spec §14
              — prevents duplicate consultations from rapid double-clicks). */}
          {patientId && encounterId && !consultationExists && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50/50 p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 mr-1 hidden sm:inline">
                Quick Actions (saves draft first):
              </span>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-cyan-600 hover:bg-cyan-50"
                disabled={autoSaving || saving}
                onClick={() => autoSaveNewAndNavigate("lab_orders")}
                title="Save draft + navigate to Lab Orders with patient/encounter pre-filled">
                <FlaskConical className="w-3.5 h-3.5" /> <span className="text-xs">{autoSaving ? "Saving..." : "Order Lab"}</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-indigo-600 hover:bg-indigo-50"
                disabled={autoSaving || saving}
                onClick={() => autoSaveNewAndNavigate("imaging")}
                title="Save draft + navigate to Imaging with patient/encounter pre-filled">
                <ImageIcon className="w-3.5 h-3.5" /> <span className="text-xs">{autoSaving ? "Saving..." : "Request Imaging"}</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-pink-600 hover:bg-pink-50"
                disabled={autoSaving || saving}
                onClick={() => autoSaveNewAndNavigate("prescriptions")}
                title="Save draft + navigate to Prescription with patient/encounter/prescriber pre-filled">
                <Pill className="w-3.5 h-3.5" /> <span className="text-xs">{autoSaving ? "Saving..." : "Prescription"}</span>
              </Button>
            </div>
          )}
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose} disabled={autoSaving}>Cancel</Button>
          {/* Hide "Save Draft" when a consultation already exists — the
              user should use "Continue"/"View" from the banner instead. */}
          {!consultationExists && (
            <Button onClick={submit} disabled={saving || autoSaving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {saving || autoSaving ? <Save className="w-4 h-4 animate-pulse" /> : <ClipboardList className="w-4 h-4" />}
              {saving || autoSaving ? "Saving..." : "Save Draft"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// =====================================================================
// VIEW CONSULTATION DIALOG — full note editor + enhanced workflow
// =====================================================================
function ViewConsultationDialog({ consultation: c, onClose, onChanged }: { consultation: any; onClose: () => void; onChanged: () => void }) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canEdit = user?.roles?.includes("super_admin") || perms.includes("clinical.create") || perms.includes("clinical.edit");
  const canSign = user?.roles?.includes("super_admin") || perms.includes("clinical.sign");
  const canAmend = user?.roles?.includes("super_admin") || perms.includes("clinical.amend");

  const selectPatient = useAppStore((s) => s.selectPatient);
  const selectEncounter = useAppStore((s) => s.selectEncounter);
  const selectConsultation = useAppStore((s) => s.selectConsultation);
  const navigateFromConsultation = useAppStore((s) => s.navigateFromConsultation);
  const setView = useAppStore((s) => s.setView);
  const [editable, setEditable] = useState<any>(c);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [showAddendum, setShowAddendum] = useState(false);
  const [addendumText, setAddendumText] = useState("");
  const [addingAddendum, setAddingAddendum] = useState(false);
  // Auto-save state: when a Quick Action triggers an auto-save before
  // navigation, we track it here so the buttons show "Saving..." and rapid
  // double-clicks don't fire duplicate saves.  The ref is the source of
  // truth (synchronous); the state is for the UI.
  const autoSavingRef = useRef(false);
  const [autoSaving, setAutoSaving] = useState(false);

  const isSigned = editable.status === "signed" || editable.status === "amended";
  const lockFields = isSigned && !canAmend;

  // Calculate consultation duration (consultationStart → signedAt/consultationEnd)
  const durationMin = (() => {
    if (!editable.consultationStart) return null;
    const end = editable.signedAt || editable.consultationEnd;
    if (!end) return null;
    const ms = new Date(end).getTime() - new Date(editable.consultationStart).getTime();
    return ms > 0 ? Math.round(ms / 60000) : null;
  })();

  const setField = (k: string, v: string) => setEditable((p: any) => ({ ...p, [k]: v }));

  const finalize = async () => {
    // Client-side validation: chief complaint + assessment required
    if (!editable.chiefComplaint || !editable.chiefComplaint.trim()) {
      toast.error("Cannot finalize: Chief complaint is required");
      return;
    }
    if (!editable.assessment || !editable.assessment.trim()) {
      toast.error("Cannot finalize: Assessment is required");
      return;
    }
    setSigning(true);
    try {
      // 1) Save pending field changes (including disposition / instructions)
      const updateRes = await fetch(`/api/consultations/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chiefComplaint: editable.chiefComplaint,
          historyPresentingIllness: editable.historyPresentingIllness,
          pastMedicalHistory: editable.pastMedicalHistory,
          pastSurgicalHistory: editable.pastSurgicalHistory,
          medicationHistory: editable.medicationHistory,
          familyHistory: editable.familyHistory,
          socialHistory: editable.socialHistory,
          reviewOfSystems: editable.reviewOfSystems,
          physicalExamination: editable.physicalExamination,
          assessment: editable.assessment,
          treatmentPlan: editable.treatmentPlan,
          followUpPlan: editable.followUpPlan,
          disposition: editable.disposition,
          dispositionNotes: editable.dispositionNotes,
          patientInstructions: editable.patientInstructions,
        }),
      });
      if (!updateRes.ok) {
        const e = await safeJson(updateRes);
        throw new Error(e.error || "Failed to save changes before finalizing");
      }
      // 2) Finalize / sign
      const signRes = await fetch(`/api/consultations/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign" }),
      });
      if (!signRes.ok) {
        const e = await safeJson(signRes);
        throw new Error(e.error || "Failed to finalize consultation");
      }
      toast.success("Consultation finalized & signed");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSigning(false);
    }
  };

  const update = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/consultations/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editable),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Consultation updated");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const submitAddendum = async () => {
    if (!addendumText.trim()) {
      toast.error("Addendum text is required");
      return;
    }
    setAddingAddendum(true);
    try {
      const res = await fetch(`/api/consultations/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addendum", addendumText }),
      });
      if (!res.ok) {
        const e = await safeJson(res);
        throw new Error(e.error || "Failed to add addendum");
      }
      toast.success("Addendum added — original note preserved");
      setShowAddendum(false);
      setAddendumText("");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingAddendum(false);
    }
  };

  // Cross-module navigation: set patient + encounter + consultation context
  // before navigating so the destination view can pre-fill its "New" dialog.
  // For Lab/Imaging/Pharmacy, use navigateFromConsultation so the destination
  // view can offer a "Return to Consultation" button.
  const goToModule = (view: any) => {
    if (c.patientId) selectPatient(c.patientId);
    if (c.encounterId) selectEncounter(c.encounterId);
    if (c.id) selectConsultation(c.id);
    setView(view);
  };

  // Navigate to a side workflow (Lab/Imaging/Pharmacy) from this consultation.
  // CRITICAL (per spec): if the consultation has unsaved changes, auto-save
  // as DRAFT (or PATCH an existing draft, or amend a signed consultation per
  // existing amendment rules) BEFORE navigating.  Never navigate before the
  // save succeeds — on failure, stay in the consultation so work is not lost.
  // Uses a ref to prevent rapid double-clicks from creating duplicate saves.
  const goToSideWorkflow = async (targetView: any) => {
    if (!c.patientId || !c.encounterId || !c.id) {
      toast.error("Cannot navigate — consultation is missing patient/encounter/id context");
      return;
    }
    // Prevent rapid double-clicks (per spec §14)
    if (autoSavingRef.current) return;

    const dirty = hasUnsavedChanges(editable, c);

    // If nothing changed, just navigate — no save needed.
    if (!dirty) {
      navigateFromConsultation({
        patientId: c.patientId,
        encounterId: c.encounterId,
        consultationId: c.id,
        targetView,
      });
      return;
    }

    // Has unsaved changes — must auto-save first.
    // Permission check: if the consultation is signed, the user needs
    // amendment permission (the existing PATCH auto-flips status to
    // "amended" per the amendment rules).  If it's draft, edit/create
    // permission suffices.
    if (isSigned && !canAmend) {
      toast.error(
        "You have unsaved changes but lack amendment permission for this signed consultation. Please ask an authorized user to save.",
      );
      return;
    }
    if (!isSigned && !canEdit) {
      toast.error(
        "You have unsaved changes but lack permission to save this consultation.",
      );
      return;
    }

    // Auto-save: PATCH the current editable state.  The API auto-sets
    // consultationStart on first edit and auto-flips signed→amended.
    autoSavingRef.current = true;
    setAutoSaving(true);
    const toastId = toast.loading("Saving consultation draft...");

    try {
      const res = await fetch(`/api/consultations/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chiefComplaint: editable.chiefComplaint,
          historyPresentingIllness: editable.historyPresentingIllness,
          pastMedicalHistory: editable.pastMedicalHistory,
          pastSurgicalHistory: editable.pastSurgicalHistory,
          medicationHistory: editable.medicationHistory,
          familyHistory: editable.familyHistory,
          socialHistory: editable.socialHistory,
          reviewOfSystems: editable.reviewOfSystems,
          physicalExamination: editable.physicalExamination,
          assessment: editable.assessment,
          treatmentPlan: editable.treatmentPlan,
          followUpPlan: editable.followUpPlan,
          disposition: editable.disposition,
          dispositionNotes: editable.dispositionNotes,
          patientInstructions: editable.patientInstructions,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed to save consultation draft");
      }
      // Save succeeded — navigate now with the exact consultation context.
      toast.success("Consultation draft saved", { id: toastId });
      navigateFromConsultation({
        patientId: c.patientId,
        encounterId: c.encounterId,
        consultationId: c.id,
        targetView,
      });
    } catch (e: any) {
      // Save FAILED — DO NOT navigate.  Stay in the consultation so
      // the clinician's work is not lost.  Show a clear error.
      toast.error(
        `Unable to save consultation draft. ${e.message}. Your consultation has not been saved. Please try again.`,
        { id: toastId },
      );
    } finally {
      autoSavingRef.current = false;
      setAutoSaving(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="wide">
          <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
            <DialogTitle className="text-white flex items-center gap-2 flex-wrap">
              <ClipboardList className="w-5 h-5" /> Consultation Note
              <StatusBadge status={editable.status} />
              {editable.disposition && (
                <span className="text-[10px] uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                  {DISPOSITIONS.find((d) => d.value === editable.disposition)?.label || editable.disposition}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-white/80">
              {c.patient?.firstName} {c.patient?.lastName}
              {c.patient?.dateOfBirth && ` · ${calculateAge(c.patient.dateOfBirth)}y${c.patient.sex ? ` · ${c.patient.sex}` : ""}`}
              {" • "}Encounter {c.encounter?.encounterNumber}
              {" • "}Created {formatDate(c.createdAt, true)}
              {c.signedAt && ` • Signed ${formatDate(c.signedAt, true)}`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-3">
            {/* Quick Actions row — cross-module links */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50/50 p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 mr-1 hidden sm:inline">
                Quick Actions:
              </span>
              {c.patientId && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-purple-700 hover:bg-purple-100"
                  onClick={() => goToModule("patient_360")} title="Open Patient 360">
                  <Eye className="w-3.5 h-3.5" /> <span className="text-xs">Patient 360</span>
                </Button>
              )}
              {c.patient && (
                <SpecialtyReferralButton
                  patient={c.patient}
                  fromDepartment="OPD"
                  label="Refer"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-amber-600 hover:bg-amber-50"
                />
              )}
              {c.patientId && c.encounterId && c.id && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-pink-600 hover:bg-pink-50"
                  disabled={autoSaving || saving || signing}
                  onClick={() => goToSideWorkflow("prescriptions")} title="Send to Pharmacy — saves draft first if needed">
                  <Pill className="w-3.5 h-3.5" /> <span className="text-xs">{autoSaving ? "Saving..." : "Pharmacy"}</span>
                </Button>
              )}
              {c.patientId && c.encounterId && c.id && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-cyan-600 hover:bg-cyan-50"
                  disabled={autoSaving || saving || signing}
                  onClick={() => goToSideWorkflow("lab_orders")} title="Order Lab Tests — saves draft first if needed">
                  <FlaskConical className="w-3.5 h-3.5" /> <span className="text-xs">{autoSaving ? "Saving..." : "Lab"}</span>
                </Button>
              )}
              {c.patientId && c.encounterId && c.id && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-indigo-600 hover:bg-indigo-50"
                  disabled={autoSaving || saving || signing}
                  onClick={() => goToSideWorkflow("imaging")} title="Order Imaging — saves draft first if needed">
                  <ImageIcon className="w-3.5 h-3.5" /> <span className="text-xs">{autoSaving ? "Saving..." : "Imaging"}</span>
                </Button>
              )}
              {c.patientId && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-rose-600 hover:bg-rose-50"
                  onClick={() => goToModule("admissions")} title="Admit Patient">
                  <BedDouble className="w-3.5 h-3.5" /> <span className="text-xs">Admit</span>
                </Button>
              )}
              {c.patientId && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-teal-600 hover:bg-teal-50"
                  onClick={() => goToModule("procedures")} title="Schedule Procedure">
                  <Activity className="w-3.5 h-3.5" /> <span className="text-xs">Procedure</span>
                </Button>
              )}
            </div>

            {/* Consultation duration display */}
            {(editable.consultationStart || durationMin !== null) && (
              <div className="flex items-center gap-2 rounded-md bg-purple-50/40 border border-purple-100 px-3 py-2 text-xs flex-wrap">
                <Clock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                {editable.consultationStart && (
                  <span className="text-slate-700">
                    Started: <span className="font-semibold">{formatDate(editable.consultationStart, true)}</span>
                  </span>
                )}
                {durationMin !== null && (
                  <>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-700">
                      Duration: <span className="font-semibold text-purple-700">{durationMin} min</span>
                    </span>
                  </>
                )}
                {editable.signedAt && (
                  <>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-700">
                      Finalized: <span className="font-semibold">{formatDate(editable.signedAt, true)}</span>
                    </span>
                  </>
                )}
                {editable.status === "draft" && !editable.signedAt && (
                  <span className="ml-auto text-[10px] text-amber-600 font-medium uppercase tracking-wider">
                    In Progress
                  </span>
                )}
              </div>
            )}

            {/* Clinical note fields */}
            <Field label="Chief Complaint" value={editable.chiefComplaint || ""} onChange={(v) => setField("chiefComplaint", v)} required disabled={lockFields} />
            <Field label="HPI" value={editable.historyPresentingIllness || ""} onChange={(v) => setField("historyPresentingIllness", v)} multiline disabled={lockFields} />
            <Field label="Past Medical History" value={editable.pastMedicalHistory || ""} onChange={(v) => setField("pastMedicalHistory", v)} multiline disabled={lockFields} />
            <Field label="Past Surgical History" value={editable.pastSurgicalHistory || ""} onChange={(v) => setField("pastSurgicalHistory", v)} multiline disabled={lockFields} />
            <Field label="Medication History" value={editable.medicationHistory || ""} onChange={(v) => setField("medicationHistory", v)} multiline disabled={lockFields} />
            <Field label="Family History" value={editable.familyHistory || ""} onChange={(v) => setField("familyHistory", v)} multiline disabled={lockFields} />
            <Field label="Social History" value={editable.socialHistory || ""} onChange={(v) => setField("socialHistory", v)} multiline disabled={lockFields} />
            <Field label="Review of Systems" value={editable.reviewOfSystems || ""} onChange={(v) => setField("reviewOfSystems", v)} multiline disabled={lockFields} />
            <Field label="Physical Examination" value={editable.physicalExamination || ""} onChange={(v) => setField("physicalExamination", v)} multiline disabled={lockFields} />
            <Field label="Assessment" value={editable.assessment || ""} onChange={(v) => setField("assessment", v)} multiline required disabled={lockFields} />

            {/* Disposition + Disposition Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3 bg-slate-50/40">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Disposition</Label>
                <Select
                  value={editable.disposition || undefined}
                  onValueChange={(v) => setField("disposition", v)}
                  disabled={lockFields}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select disposition" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPOSITIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-700">Disposition Notes</Label>
                <Input
                  value={editable.dispositionNotes || ""}
                  onChange={(e) => setField("dispositionNotes", e.target.value)}
                  disabled={lockFields}
                  className="mt-1"
                  placeholder="e.g., Ward 4A, Dr. Mensah, ICU bed 3"
                />
              </div>
            </div>

            {/* Patient Instructions */}
            <Field label="Patient Instructions" value={editable.patientInstructions || ""} onChange={(v) => setField("patientInstructions", v)} multiline disabled={lockFields} />

            {/* Diagnoses — Centralized Diagnosis Engine */}
            {c.patientId && c.encounterId && (
              <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50/30 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                  <ClipboardList className="w-3.5 h-3.5" /> Diagnoses
                </p>
                <DiagnosisPicker
                  patientId={c.patientId}
                  encounterId={c.encounterId}
                  canManage={canEdit}
                />
              </div>
            )}

            <Field label="Treatment Plan" value={editable.treatmentPlan || ""} onChange={(v) => setField("treatmentPlan", v)} multiline disabled={lockFields} />
            <Field label="Follow-up Plan" value={editable.followUpPlan || ""} onChange={(v) => setField("followUpPlan", v)} multiline disabled={lockFields} />

            {/* Addendum display (for amended/signed consultations) */}
            {c.addendumText && (
              <div className="border-l-4 border-amber-400 bg-amber-50/60 p-3 rounded-r-md space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                  <StickyNote className="w-3.5 h-3.5" /> Addendum
                </p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.addendumText}</p>
                <p className="text-[10px] text-slate-500">
                  Added {c.addendumAt ? formatDate(c.addendumAt, true) : "—"}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Button variant="outline" onClick={onClose} className="gap-1 w-full sm:w-auto">
              <X className="w-4 h-4" /> Close
            </Button>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {!isSigned && canEdit && (
                <>
                  <Button onClick={update} disabled={saving} variant="outline" className="gap-1">
                    <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
                  </Button>
                  {canSign && (
                    <Button onClick={finalize} disabled={signing} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                      {signing ? <Check className="w-4 h-4 animate-pulse" /> : <Lock className="w-4 h-4" />}
                      {signing ? "Finalizing..." : "Finalize Consultation"}
                    </Button>
                  )}
                </>
              )}
              {isSigned && canAmend && (
                <>
                  <Button onClick={update} disabled={saving} variant="outline" className="gap-1">
                    <PenSquare className="w-4 h-4" /> {saving ? "Saving..." : "Amend Note"}
                  </Button>
                  <Button onClick={() => setShowAddendum(true)} variant="outline" className="gap-1 bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100">
                    <StickyNote className="w-4 h-4" /> Add Addendum
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nested Add Addendum dialog */}
      <Dialog open={showAddendum} onOpenChange={(o) => !o && setShowAddendum(false)}>
        <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden" size="medium">
          <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
            <DialogTitle className="flex items-center gap-2 text-white">
              <StickyNote className="w-4 h-4 text-amber-600" /> Add Addendum
            </DialogTitle>
            <DialogDescription className="text-white/80">
              The original signed note will be preserved. The addendum will be appended with your name and timestamp.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-2">
            <Label className="text-xs font-semibold text-slate-700">Addendum Text</Label>
            <Textarea
              value={addendumText}
              onChange={(e) => setAddendumText(e.target.value)}
              rows={6}
              placeholder="Enter addendum note (e.g., correction, follow-up clarification, additional finding)..."
            />
            <p className="text-[11px] text-slate-500">
              Signed by: <span className="font-medium">{user?.firstName || ""} {user?.lastName || ""}</span>
              {" • "}Timestamp will be set automatically.
            </p>
          </div>
          <DialogFooter className="p-6 pt-4 shrink-0 border-t">
            <Button variant="outline" onClick={() => setShowAddendum(false)}>Cancel</Button>
            <Button onClick={submitAddendum} disabled={addingAddendum} className="gap-1 bg-amber-600 hover:bg-amber-700">
              {addingAddendum ? <StickyNote className="w-4 h-4 animate-pulse" /> : <Check className="w-4 h-4" />}
              {addingAddendum ? "Adding..." : "Add Addendum"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value, onChange, multiline, required, disabled }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; required?: boolean; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </Label>
      {multiline ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} disabled={disabled} className="mt-1" />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="mt-1" />
      )}
    </div>
  );
}

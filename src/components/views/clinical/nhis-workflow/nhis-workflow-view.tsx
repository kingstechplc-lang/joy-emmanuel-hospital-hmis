"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShieldCheck, FileCode2, RefreshCw, Activity, AlertCircle, CheckCircle2, XCircle,
  Clock, Zap, Eye, Loader2, FileText, Building2, User, ChevronRight, ChevronDown,
  Wifi, WifiOff, Hash, Calendar, Stethoscope, Pill, Receipt, TrendingUp, ListChecks,
  AlertTriangle, Info, Copy, Check, ServerCog, FileCheck2, X, Fingerprint, KeyRound,
  ArrowRight, ArrowLeft, Plus, Search, ClipboardCheck, CreditCard, Lock,
} from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader, MiniStatCard, EmptyState, LoadingState, ErrorState,
  formatCurrency, formatDate, formatRelative, safeJson, ModuleHelp,
  StatusBadge, ColorfulBadge,
} from "@/components/ui-helpers";
import { PatientPicker, type PatientPickerValue } from "@/components/ui/patient-picker";
import { InsuranceProviderSelect, type EntitySelectValue } from "@/components/ui/entity-select";

// =====================================================================
// Helpers
// =====================================================================
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let err: any = null;
    try { err = txt ? JSON.parse(txt) : null; } catch { /* */ }
    throw new Error(err?.error || `HTTP ${res.status}`);
  }
  return safeJson(res);
}

async function postJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const txt = await res.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { /* */ }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`) as any;
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function patchJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const txt = await res.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { /* */ }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// =====================================================================
// STATUS METADATA — workflow-specific badges with icons + colors
// =====================================================================
const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  // Eligibility
  verified: { label: "Verified", color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2 },
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2 },
  manual_verified: { label: "Manual Verified", color: "bg-amber-100 text-amber-700 border-amber-300", icon: CheckCircle2 },
  not_verified: { label: "Not Verified", color: "bg-rose-100 text-rose-700 border-rose-300", icon: XCircle },
  failed: { label: "Failed", color: "bg-rose-100 text-rose-700 border-rose-300", icon: XCircle },
  unable_to_verify: { label: "Unable to Verify", color: "bg-slate-100 text-slate-700 border-slate-300", icon: AlertCircle },
  expired: { label: "Expired", color: "bg-rose-100 text-rose-700 border-rose-300", icon: Clock },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-300", icon: Clock },
  inactive: { label: "Inactive", color: "bg-slate-100 text-slate-700 border-slate-300", icon: XCircle },
  // Attendance
  not_required: { label: "Not Required", color: "bg-slate-100 text-slate-700 border-slate-300", icon: Info },
  // Coverage
  superseded: { label: "Superseded", color: "bg-slate-100 text-slate-500 border-slate-300", icon: Clock },
  cancelled: { label: "Cancelled", color: "bg-rose-100 text-rose-700 border-rose-300", icon: XCircle },
  // Readiness
  not_ready: { label: "Not Ready", color: "bg-rose-100 text-rose-700 border-rose-300", icon: XCircle },
  ready_for_validation: { label: "Ready for Validation", color: "bg-amber-100 text-amber-700 border-amber-300", icon: AlertCircle },
  validation_failed: { label: "Validation Failed", color: "bg-rose-100 text-rose-700 border-rose-300", icon: XCircle },
  ready_for_export: { label: "Ready for Export", color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2 },
  exported: { label: "Exported", color: "bg-blue-100 text-blue-700 border-blue-300", icon: FileCheck2 },
};

function WorkflowStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] || { label: status, color: "bg-slate-100 text-slate-700 border-slate-300", icon: AlertCircle };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${meta.color}`}>
      <Icon className="w-3 h-3" /> {meta.label}
    </span>
  );
}

// =====================================================================
// HELP CONTENT
// =====================================================================
const HELP_SECTIONS = [
  {
    title: "What is this workspace?",
    content: `The NHIS Workflow Workspace is the operational hub for moving a patient from arrival through claim readiness.

It exposes the upstream workflow that feeds the existing CLAIM-it XML integration:
  1. Select patient (from Patient Master Index)
  2. Select encounter (or create new)
  3. Choose encounter payer / coverage (NHIS, private, self-pay)
  4. Verify eligibility (using the actual verification method used by your facility)
  5. Capture attendance verification (CCC / OTAC / biometric)
  6. Manage pre-authorizations if required
  7. Evaluate claim readiness — see actionable checklist
  8. Proceed to existing CLAIM-it export when ready

This workspace never generates XML directly — it feeds the downstream CLAIM-it pipeline via the Generate XML button on the readiness panel.`,
  },
  {
    title: "Critical state distinctions",
    content: `The system keeps these concepts SEPARATE (never collapsed into one boolean):
  • MEMBERSHIP — patient has an NHIS/insurance record
  • ELIGIBILITY — the membership was verified for this encounter's date range
  • ATTENDANCE — the patient physically attended (CCC/OTAC code captured)
  • COVERAGE — the encounter's payer is selected (encounter-scoped, not patient-scoped)
  • CLAIM READINESS — all required data is present for claim submission
  • CLAIM ACCEPTANCE — the payer/NHIA accepted the submitted claim

Each is represented explicitly. A green "Verified" on one does NOT imply the others.`,
  },
  {
    title: "NHIA verification methods",
    content: `The system recognizes multiple NHIA verification evidence levels:

  LEVEL 1 — NHIA Direct Verified: Direct authorized NHIA API response.
            Requires NHIA_API_BASE_URL configuration. Not currently configured.

  LEVEL 2 — NHIA Operational Verification: NHIA-recognized facility-side
            operational process. Legitimate and NHIA-recognized.

  LEVEL 3 — NHIA Attendance Verified (OTAC/*929#): Patient generated OTAC,
            staff validated the code. Proves attendance, NOT eligibility.

  LEVEL 4 — External Verification: Staff verified through an authorized
            external NHIA/facility system.

  LEVEL 5 — Manual Record Check: Staff physically checked NHIS card,
            membership number, coverage dates.

All levels are legitimate verification evidence. The system accurately records
the method used rather than labeling everything non-API as "unverified."`,
  },
  {
    title: "Sensitive code handling",
    content: `Attendance codes (CCC, OTAC) are sensitive:
  • Frontend never displays stored hashed codes
  • Code fields are cleared after submission
  • Codes are not persisted in browser storage
  • HTTPS is enforced in production

The backend hashes codes (SHA-256) for replay-duplicate detection. The same OTAC cannot be reused across encounters.`,
  },
];

// =====================================================================
// MAIN VIEW
// =====================================================================
export function NhisWorkflowView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const selectEncounter = useAppStore((s) => s.selectEncounter);
  const setView = useAppStore((s) => s.setView);
  const storeSelectedPatientId = useAppStore((s) => s.selectedPatientId);
  const storeSelectedEncounterId = useAppStore((s) => s.selectedEncounterId);

  const qc = useQueryClient();
  const [selectedPatient, setSelectedPatient] = useState<PatientPickerValue | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [showCoverageDialog, setShowCoverageDialog] = useState(false);
  const [showEligibilityDialog, setShowEligibilityDialog] = useState(false);
  const [showAttendanceDialog, setShowAttendanceDialog] = useState(false);
  const [showAuthorizationDialog, setShowAuthorizationDialog] = useState(false);

  // --- Hydrate from app store on mount (when navigated from Records Desk / Claims / CLAIM-it) ---
  // When another view calls selectEncounter(id) + setView("nhis_workflow"), we need to
  // pick up that selection and pre-populate the local state so the user doesn't have
  // to re-search the patient and re-select the encounter.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated) return;
    // Pre-select encounter from store
    if (storeSelectedEncounterId && !selectedEncounterId) {
      setSelectedEncounterId(storeSelectedEncounterId);
    }
    // Pre-select patient from store — fetch minimal info to populate the PatientPicker chip
    if (storeSelectedPatientId && !selectedPatient) {
      fetchJson(`/api/patients/${storeSelectedPatientId}`).then((data) => {
        const p = data?.patient;
        if (p) {
          setSelectedPatient({
            patientId: p.id,
            patientName: `${p.firstName} ${p.middleName || ""} ${p.lastName}`.trim(),
            patientNumber: p.patientNumber,
            patientSex: p.sex,
            patientPhone: p.phone,
          });
        }
      }).catch(() => { /* non-fatal — user can search manually */ });
    }
    setHydrated(true);
  }, [hydrated, storeSelectedEncounterId, storeSelectedPatientId, selectedEncounterId, selectedPatient]);

  // --- Permissions ---
  const canManageCoverage = can("encounter_coverage.manage");
  const canCaptureAttendance = can("attendance_verification.capture");
  const canVerifyAttendance = can("attendance_verification.verify");
  const canEvaluateReadiness = can("claim_readiness.evaluate");
  const canManageAuthorizations = can("insurance_authorization.manage");
  const canManageEligibility = can("insurance_eligibility.manage") || can("insurance.claim");
  const canGenerateClaim = can("nhia_claim.generate");

  // --- Fetch encounters for selected patient ---
  const encountersQuery = useQuery({
    queryKey: ["nhis-workflow-encounters", selectedPatient?.patientId, activeFacilityId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${selectedPatient!.patientId}&facilityId=${activeFacilityId || ""}&limit=20`),
    enabled: !!selectedPatient?.patientId,
  });

  const encounters = encountersQuery.data?.items || [];

  // --- Fetch encounter coverage ---
  const coverageQuery = useQuery({
    queryKey: ["nhis-workflow-coverage", selectedEncounterId],
    queryFn: () => fetchJson(`/api/encounter-coverage?encounterId=${selectedEncounterId}`),
    enabled: !!selectedEncounterId,
  });
  const coverage = coverageQuery.data?.items?.[0] || null;

  // --- Fetch eligibility verifications for this encounter ---
  const eligibilityQuery = useQuery({
    queryKey: ["nhis-workflow-eligibility", selectedEncounterId, selectedPatient?.patientId],
    queryFn: () => fetchJson(`/api/eligibility?encounterId=${selectedEncounterId}&patientId=${selectedPatient?.patientId || ""}&limit=10`),
    enabled: !!selectedEncounterId,
  });
  const eligibilityHistory = eligibilityQuery.data?.items || [];
  const latestEligibility = eligibilityHistory[0] || null;

  // --- Fetch attendance verification ---
  const attendanceQuery = useQuery({
    queryKey: ["nhis-workflow-attendance", selectedEncounterId],
    queryFn: () => fetchJson(`/api/attendance-verification?encounterId=${selectedEncounterId}`),
    enabled: !!selectedEncounterId,
  });
  const attendance = attendanceQuery.data?.items?.[0] || null;

  // --- Fetch authorizations for this patient ---
  const authorizationsQuery = useQuery({
    queryKey: ["nhis-workflow-authorizations", selectedPatient?.patientId],
    queryFn: () => fetchJson(`/api/authorizations?patientId=${selectedPatient!.patientId}&limit=10`),
    enabled: !!selectedPatient?.patientId,
  });
  const authorizations = authorizationsQuery.data?.items || [];

  // --- Fetch latest claim readiness assessment ---
  const readinessQuery = useQuery({
    queryKey: ["nhis-workflow-readiness", selectedEncounterId],
    queryFn: () => fetchJson(`/api/claim-readiness/${selectedEncounterId}`),
    enabled: !!selectedEncounterId,
  });
  const readiness = readinessQuery.data?.item || null;

  // --- Check NHIA live API availability ---
  const nhiaApiAvailable = !!process.env.NHIA_API_BASE_URL; // Note: this is server-side only; client gets a hint from eligibility endpoint behavior

  // --- Invalidate helper ---
  const refreshAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["nhis-workflow-coverage"] });
    qc.invalidateQueries({ queryKey: ["nhis-workflow-eligibility"] });
    qc.invalidateQueries({ queryKey: ["nhis-workflow-attendance"] });
    qc.invalidateQueries({ queryKey: ["nhis-workflow-authorizations"] });
    qc.invalidateQueries({ queryKey: ["nhis-workflow-readiness"] });
  }, [qc]);

  // --- Render ---
  return (
    <div className="space-y-5 fade-in-up">
      <PageHeader
        title="NHIS Workflow Workspace"
        description="Operational hub for patient → payer → eligibility → attendance → coverage → claim readiness."
        icon={ShieldCheck}
        gradient="from-emerald-600 via-teal-600 to-cyan-600"
        actions={
          <>
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur"
              onClick={() => { refreshAll(); toast.success("Refreshed"); }}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
            <ModuleHelp title="NHIS Workflow" sections={HELP_SECTIONS} buttonLabel="Help" />
          </>
        }
      />

      {/* Facility check */}
      {!activeFacilityId && (
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-400" />
            <p className="text-sm text-slate-600">Select a facility in the top bar to begin.</p>
          </CardContent>
        </Card>
      )}

      {activeFacilityId && (
        <>
          {/* STEP 1: Patient selection */}
          <Card className="border-emerald-200 overflow-visible">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4 text-emerald-600" /> Find Patient</CardTitle>
              </div>
              <CardDescription className="text-xs">Search by name, MRN, phone, Ghana Card, or NHIS membership number.</CardDescription>
            </CardHeader>
            <CardContent>
              <PatientPicker
                value={selectedPatient}
                onChange={(v) => {
                  setSelectedPatient(v);
                  setSelectedEncounterId(null);
                  if (v?.patientId) selectPatient(v.patientId);
                }}
                onRegisterNew={() => setView("patient_new")}
              />
            </CardContent>
          </Card>

          {/* STEP 2: Encounter selection */}
          {selectedPatient && (
            <Card className="border-blue-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">2</div>
                  <CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-blue-600" /> Select Encounter</CardTitle>
                </div>
                <CardDescription className="text-xs">Recent encounters for this patient at the active facility.</CardDescription>
              </CardHeader>
              <CardContent>
                {encountersQuery.isLoading ? <LoadingState rows={3} /> :
                 encountersQuery.error ? <ErrorState message={(encountersQuery.error as any)?.message} onRetry={() => encountersQuery.refetch()} /> :
                 encounters.length === 0 ? (
                  <EmptyState
                    title="No encounters found"
                    description="This patient has no encounters at the active facility. Check in at the Records Desk first."
                    icon={ClipboardCheck}
                    action={<Button size="sm" onClick={() => setView("records_desk")}><Plus className="w-3.5 h-3.5 mr-1" /> Go to Records Desk</Button>}
                  />
                ) : (
                  <div className="space-y-1.5">
                    {encounters.map((e: any) => (
                      <button
                        key={e.id}
                        onClick={() => { setSelectedEncounterId(e.id); selectEncounter(e.id); }}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          selectedEncounterId === e.id
                            ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-slate-700">{e.encounterNumber}</span>
                              <Badge variant="outline" className="text-[10px] h-4">{e.encounterType}</Badge>
                              <Badge variant="outline" className="text-[10px] h-4">{e.status}</Badge>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {formatDate(e.startAt, true)} {e.department?.name ? `• ${e.department.name}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {e._count && (
                              <span className="text-[10px] text-slate-400">
                                {e._count.diagnoses || 0} dx · {e._count.consultations || 0} consults
                              </span>
                            )}
                            {selectedEncounterId === e.id && <Check className="w-4 h-4 text-blue-600" />}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 3+: NHIS Workflow panels (only show when encounter selected) */}
          {selectedEncounterId && selectedPatient && (
            <>
              {/* STEP 3: Encounter Coverage */}
              <CoveragePanel
                encounterId={selectedEncounterId}
                patientId={selectedPatient.patientId!}
                coverage={coverage}
                canManage={canManageCoverage}
                onChange={() => qc.invalidateQueries({ queryKey: ["nhis-workflow-coverage"] })}
                onOpenDialog={() => setShowCoverageDialog(true)}
              />

              {/* STEP 4: Eligibility */}
              <EligibilityPanel
                encounterId={selectedEncounterId}
                patientId={selectedPatient.patientId!}
                coverage={coverage}
                latestEligibility={latestEligibility}
                history={eligibilityHistory}
                canManage={canManageEligibility}
                onRefresh={() => qc.invalidateQueries({ queryKey: ["nhis-workflow-eligibility"] })}
                onOpenDialog={() => setShowEligibilityDialog(true)}
              />

              {/* STEP 5: Attendance Verification */}
              <AttendancePanel
                encounterId={selectedEncounterId}
                patientId={selectedPatient.patientId!}
                coverage={coverage}
                attendance={attendance}
                canCapture={canCaptureAttendance}
                canVerify={canVerifyAttendance}
                onRefresh={() => qc.invalidateQueries({ queryKey: ["nhis-workflow-attendance"] })}
                onOpenDialog={() => setShowAttendanceDialog(true)}
              />

              {/* STEP 6: Insurance Authorization (if applicable) */}
              <AuthorizationPanel
                patientId={selectedPatient.patientId!}
                authorizations={authorizations}
                canManage={canManageAuthorizations}
                coverage={coverage}
                onRefresh={() => qc.invalidateQueries({ queryKey: ["nhis-workflow-authorizations"] })}
                onOpenDialog={() => setShowAuthorizationDialog(true)}
              />

              {/* STEP 7: Claim Readiness */}
              <ReadinessPanel
                encounterId={selectedEncounterId}
                readiness={readiness}
                canEvaluate={canEvaluateReadiness}
                canGenerateClaim={canGenerateClaim}
                onEvaluate={async () => {
                  try {
                    await postJson("/api/claim-readiness", { encounterId: selectedEncounterId });
                    qc.invalidateQueries({ queryKey: ["nhis-workflow-readiness"] });
                    toast.success("Claim readiness evaluated");
                  } catch (e: any) {
                    toast.error(`Evaluation failed: ${e.message}`);
                  }
                }}
                onGenerateClaim={() => {
                  selectEncounter(selectedEncounterId);
                  setView("nhia_claims");
                }}
                onNavigate={(view) => setView(view as any)}
                evaluating={false}
              />
            </>
          )}

          {/* DIALOGS */}
          {showCoverageDialog && selectedEncounterId && selectedPatient && (
            <CoverageDialog
              encounterId={selectedEncounterId}
              patientId={selectedPatient.patientId!}
              existing={coverage}
              onClose={() => setShowCoverageDialog(false)}
              onSaved={() => {
                setShowCoverageDialog(false);
                qc.invalidateQueries({ queryKey: ["nhis-workflow-coverage"] });
              }}
            />
          )}

          {showEligibilityDialog && selectedEncounterId && selectedPatient && (
            <EligibilityDialog
              encounterId={selectedEncounterId}
              patientId={selectedPatient.patientId!}
              coverage={coverage}
              onClose={() => setShowEligibilityDialog(false)}
              onSaved={() => {
                setShowEligibilityDialog(false);
                qc.invalidateQueries({ queryKey: ["nhis-workflow-eligibility"] });
              }}
            />
          )}

          {showAttendanceDialog && selectedEncounterId && selectedPatient && (
            <AttendanceDialog
              encounterId={selectedEncounterId}
              patientId={selectedPatient.patientId!}
              coverage={coverage}
              existing={attendance}
              onClose={() => setShowAttendanceDialog(false)}
              onSaved={() => {
                setShowAttendanceDialog(false);
                qc.invalidateQueries({ queryKey: ["nhis-workflow-attendance"] });
              }}
            />
          )}

          {showAuthorizationDialog && selectedPatient && (
            <AuthorizationDialog
              patientId={selectedPatient.patientId!}
              encounterId={selectedEncounterId}
              onClose={() => setShowAuthorizationDialog(false)}
              onSaved={() => {
                setShowAuthorizationDialog(false);
                qc.invalidateQueries({ queryKey: ["nhis-workflow-authorizations"] });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

// =====================================================================
// COVERAGE PANEL
// =====================================================================
function CoveragePanel({ encounterId, patientId, coverage, canManage, onChange, onOpenDialog }: {
  encounterId: string;
  patientId: string;
  coverage: any;
  canManage: boolean;
  onChange: () => void;
  onOpenDialog: () => void;
}) {
  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold">3</div>
            <CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4 text-violet-600" /> Encounter Coverage</CardTitle>
          </div>
          {coverage && <WorkflowStatusBadge status={coverage.status} />}
        </div>
        <CardDescription className="text-xs">Which payer covers this specific encounter? (distinct from patient-level insurance)</CardDescription>
      </CardHeader>
      <CardContent>
        {!coverage ? (
          <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-slate-700">No payer selected for this encounter yet.</span>
            </div>
            {canManage && (
              <Button size="sm" onClick={onOpenDialog} className="bg-violet-600 hover:bg-violet-700">
                <Plus className="w-3.5 h-3.5 mr-1" /> Select Payer
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Payer</p>
                <p className="font-bold text-slate-800 uppercase">{coverage.payerType}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Provider</p>
                <p className="font-semibold text-slate-800">{coverage.insuranceProviderId ? "Linked" : "—"}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Coverage %</p>
                <p className="font-semibold text-slate-800">{coverage.coveragePercentage || 0}%</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Patient Copay</p>
                <p className="font-semibold text-slate-800">{formatCurrency(coverage.patientCopay || 0)}</p>
              </div>
            </div>
            {coverage.notes && <p className="text-xs text-slate-500 italic">"{coverage.notes}"</p>}
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-[11px] text-slate-400">Selected {formatRelative(coverage.selectedAt)} by {coverage.selectedByName || "—"}</p>
              {canManage && (
                <Button size="sm" variant="outline" onClick={onOpenDialog}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Change
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// ELIGIBILITY PANEL
// =====================================================================
function EligibilityPanel({ encounterId, patientId, coverage, latestEligibility, history, canManage, onRefresh, onOpenDialog }: {
  encounterId: string;
  patientId: string;
  coverage: any;
  latestEligibility: any;
  history: any[];
  canManage: boolean;
  onRefresh: () => void;
  onOpenDialog: () => void;
}) {
  const isInsurancePayer = coverage && ["nhis", "private_insurance", "corporate"].includes(coverage.payerType);

  if (!isInsurancePayer) {
    return (
      <Card className="border-slate-200 opacity-75">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-slate-400 text-white flex items-center justify-center text-xs font-bold">4</div>
            <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-slate-400" /> Eligibility</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Not required for non-insurance payer ({coverage?.payerType || "none"}).</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-bold">4</div>
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-amber-600" /> Eligibility Verification</CardTitle>
          </div>
          {latestEligibility && <WorkflowStatusBadge status={latestEligibility.verificationStatus} />}
        </div>
        <CardDescription className="text-xs">Verify the patient's insurance membership is active for this encounter's date.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!latestEligibility ? (
          <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-slate-700">No eligibility verification recorded.</span>
            </div>
            {canManage && (
              <Button size="sm" onClick={onOpenDialog} className="bg-amber-600 hover:bg-amber-700">
                <Zap className="w-3.5 h-3.5 mr-1" /> Verify Now
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Method</p>
                <p className="font-semibold text-slate-800 capitalize">{latestEligibility.verificationMethod}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Source</p>
                <p className="font-semibold text-slate-800 capitalize">{latestEligibility.verificationSource.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Reference</p>
                <p className="font-mono text-slate-800">{latestEligibility.verificationReference || "—"}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Verified At</p>
                <p className="font-semibold text-slate-800">{formatDate(latestEligibility.verificationDate, true)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Expires</p>
                <p className="font-semibold text-slate-800">{latestEligibility.expiresAt ? formatDate(latestEligibility.expiresAt) : "—"}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Verified By</p>
                <p className="font-semibold text-slate-800">{latestEligibility.verifiedByName || "—"}</p>
              </div>
            </div>
            {latestEligibility.resultMessage && (
              <p className="text-xs p-2 bg-slate-50 rounded border border-slate-200">{latestEligibility.resultMessage}</p>
            )}
            {/* Evidence-level indicator (replaces the old "not official NHIA" warning) */}
            {latestEligibility.verificationStatus === "verified" && (() => {
              const m = latestEligibility.verificationMethod;
              const s = latestEligibility.verificationSource;
              let evidenceLabel = "Manual Record Check";
              let evidenceColor = "bg-amber-50 border-amber-200 text-amber-700";
              if (s === "nhia_direct" || s === "nhia_integration") {
                evidenceLabel = "NHIA Direct Verified — direct API response";
                evidenceColor = "bg-emerald-50 border-emerald-200 text-emerald-700";
              } else if (s === "nhia_operational" || m === "facility_operational") {
                evidenceLabel = "NHIA Operational Verification — authorized facility process";
                evidenceColor = "bg-blue-50 border-blue-200 text-blue-700";
              } else if (s === "nhia_otac" || m === "otac") {
                evidenceLabel = "NHIA Attendance Verified — OTAC/*929# (attendance only, not eligibility)";
                evidenceColor = "bg-cyan-50 border-cyan-200 text-cyan-700";
              } else if (m === "external" || s === "external") {
                evidenceLabel = "External Verification Recorded — verified via external NHIA/facility system";
                evidenceColor = "bg-violet-50 border-violet-200 text-violet-700";
              }
              return (
                <div className={`flex items-start gap-2 p-2 border rounded text-xs ${evidenceColor}`}>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p>{evidenceLabel}</p>
                </div>
              );
            })()}
            {canManage && (
              <Button size="sm" variant="outline" onClick={onOpenDialog}>
                <RefreshCw className="w-3 h-3 mr-1" /> Re-verify
              </Button>
            )}
          </>
        )}

        {/* History */}
        {history.length > 1 && (
          <details className="mt-2">
            <summary className="text-xs font-semibold text-slate-600 cursor-pointer hover:text-slate-800">
              Verification History ({history.length})
            </summary>
            <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-slate-200">
              {history.slice(0, 5).map((h: any) => (
                <div key={h.id} className="text-xs flex items-center gap-2">
                  <WorkflowStatusBadge status={h.verificationStatus} />
                  <span className="text-slate-600">{formatDate(h.verificationDate, true)}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500 capitalize">{h.verificationMethod}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{h.verifiedByName || "—"}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// ATTENDANCE PANEL
// =====================================================================
function AttendancePanel({ encounterId, patientId, coverage, attendance, canCapture, canVerify, onRefresh, onOpenDialog }: {
  encounterId: string;
  patientId: string;
  coverage: any;
  attendance: any;
  canCapture: boolean;
  canVerify: boolean;
  onRefresh: () => void;
  onOpenDialog: () => void;
}) {
  const isNhis = coverage?.payerType === "nhis";

  if (!isNhis) {
    return (
      <Card className="border-slate-200 opacity-75">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-slate-400 text-white flex items-center justify-center text-xs font-bold">5</div>
            <CardTitle className="text-base flex items-center gap-2"><Fingerprint className="w-4 h-4 text-slate-400" /> Attendance Verification</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Not required for non-NHIS payer ({coverage?.payerType || "none"}).</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-cyan-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-cyan-600 text-white flex items-center justify-center text-xs font-bold">5</div>
            <CardTitle className="text-base flex items-center gap-2"><Fingerprint className="w-4 h-4 text-cyan-600" /> Attendance Verification</CardTitle>
          </div>
          {attendance && <WorkflowStatusBadge status={attendance.verificationStatus} />}
        </div>
        <CardDescription className="text-xs">CCC / OTAC / biometric code proving the patient physically attended for this encounter.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!attendance ? (
          <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-slate-700">No attendance verification recorded.</span>
            </div>
            {canCapture && (
              <Button size="sm" onClick={onOpenDialog} className="bg-cyan-600 hover:bg-cyan-700">
                <KeyRound className="w-3.5 h-3.5 mr-1" /> Capture Code
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Method</p>
                <p className="font-bold text-slate-800">{attendance.method}</p>
                {attendance.source === "nhia_otac" && (
                  <p className="text-[10px] text-cyan-600 font-semibold">NHIA *929# OTAC</p>
                )}
                {attendance.source === "nhia_operational" && (
                  <p className="text-[10px] text-blue-600 font-semibold">NHIA Operational</p>
                )}
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Code</p>
                <p className="font-mono font-bold text-slate-800">
                  {attendance.code ? "••••••••" : "—"}
                  <Lock className="w-3 h-3 inline ml-1 text-slate-400" />
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Reference</p>
                <p className="font-mono text-slate-800">{attendance.transactionRef || "—"}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Verified At</p>
                <p className="font-semibold text-slate-800">{attendance.verifiedAt ? formatDate(attendance.verifiedAt, true) : "—"}</p>
              </div>
            </div>
            {attendance.resultMessage && (
              <p className="text-xs p-2 bg-slate-50 rounded border border-slate-200">{attendance.resultMessage}</p>
            )}
            <div className="flex items-center gap-2 pt-2 border-t">
              <p className="text-[11px] text-slate-400 flex-1">Captured {formatRelative(attendance.capturedAt)} by {attendance.capturedByName || "—"}</p>
              {canCapture && (
                <Button size="sm" variant="outline" onClick={onOpenDialog}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Update
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// AUTHORIZATION PANEL
// =====================================================================
function AuthorizationPanel({ patientId, authorizations, canManage, coverage, onRefresh, onOpenDialog }: {
  patientId: string;
  authorizations: any[];
  canManage: boolean;
  coverage: any;
  onRefresh: () => void;
  onOpenDialog: () => void;
}) {
  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold">6</div>
            <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-orange-600" /> Pre-Authorizations</CardTitle>
          </div>
          {canManage && (
            <Button size="sm" variant="outline" onClick={onOpenDialog}>
              <Plus className="w-3.5 h-3.5 mr-1" /> New Authorization
            </Button>
          )}
        </div>
        <CardDescription className="text-xs">Insurance pre-authorizations for services requiring approval.</CardDescription>
      </CardHeader>
      <CardContent>
        {authorizations.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">No pre-authorizations on file for this patient.</p>
        ) : (
          <div className="space-y-2">
            {authorizations.map((a: any) => (
              <div key={a.id} className="p-2.5 border rounded-lg flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-700">{a.authorizationNumber}</span>
                    <WorkflowStatusBadge status={a.status} />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {a.approvedService || a.service?.name || "Service"} · {a.insuranceProvider?.name || "—"}
                    {a.expiryDate && <span> · expires {formatDate(a.expiryDate)}</span>}
                  </div>
                </div>
                {a.approvedAmount != null && (
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-800">{formatCurrency(a.approvedAmount)}</p>
                    <p className="text-[10px] text-slate-400">approved</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// READINESS PANEL — the crown jewel
// =====================================================================
function ReadinessPanel({ encounterId, readiness, canEvaluate, canGenerateClaim, onEvaluate, onGenerateClaim, onNavigate, evaluating }: {
  encounterId: string;
  readiness: any;
  canEvaluate: boolean;
  canGenerateClaim: boolean;
  onEvaluate: () => void | Promise<void>;
  onGenerateClaim: () => void;
  onNavigate: (view: string) => void;
  evaluating: boolean;
}) {
  const checks = useMemo(() => {
    if (!readiness?.checks) return [];
    try { return JSON.parse(readiness.checks); } catch { return []; }
  }, [readiness]);

  if (!readiness) {
    return (
      <Card className="border-indigo-200">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">7</div>
            <CardTitle className="text-base flex items-center gap-2"><ListChecks className="w-4 h-4 text-indigo-600" /> Claim Readiness</CardTitle>
          </div>
          <CardDescription className="text-xs">Evaluate whether this encounter has all required data for claim submission.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-sm text-slate-600">No readiness assessment yet.</p>
            {canEvaluate && (
              <Button size="sm" onClick={onEvaluate} disabled={evaluating} className="bg-indigo-600 hover:bg-indigo-700">
                {evaluating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1" />}
                Evaluate Readiness
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const status = readiness.status;
  const isReady = status === "ready_for_export" || status === "ready_for_validation";
  const allGreen = status === "ready_for_export";

  // Map check IDs to navigation targets
  const navMap: Record<string, string> = {
    patient_identified: "patient_360",
    correct_encounter: "encounters",
    payer_selected: "nhis_workflow",
    insurance_info_present: "patient_360",
    eligibility_verified: "nhis_workflow",
    attendance_verified: "nhis_workflow",
    diagnosis_present: "consultations",
    valid_clinical_services: "billing_invoices",
    valid_medicines: "dispense",
    required_codes: "patient_360",
    billing_totals: "billing_invoices",
    claim_info: "insurance_claims",
  };

  return (
    <Card className={`border-2 ${allGreen ? "border-emerald-300" : isReady ? "border-amber-300" : "border-rose-300"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">7</div>
            <CardTitle className="text-base flex items-center gap-2"><ListChecks className="w-4 h-4 text-indigo-600" /> Claim Readiness</CardTitle>
          </div>
          <WorkflowStatusBadge status={status} />
        </div>
        <CardDescription className="text-xs">
          Score: <b>{readiness.readinessScore}%</b> · {readiness.checksPassed}/{readiness.checksTotal} checks passed
          {readiness.evaluatedAt && ` · evaluated ${formatRelative(readiness.evaluatedAt)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Checklist */}
        <div className="space-y-1.5">
          {checks.map((check: any) => {
            const icon = check.status === "PASS" ? CheckCircle2
                       : check.status === "FAIL" ? XCircle
                       : check.status === "WARNING" ? AlertTriangle
                       : check.status === "SKIP" ? Info : AlertCircle;
            const Icon = icon;
            const color = check.status === "PASS" ? "text-emerald-600"
                        : check.status === "FAIL" ? "text-rose-600"
                        : check.status === "WARNING" ? "text-amber-600"
                        : check.status === "SKIP" ? "text-slate-400" : "text-slate-500";
            return (
              <div key={check.checkId} className="flex items-start gap-2 p-2 rounded-md hover:bg-slate-50">
                <Icon className={`w-4 h-4 ${color} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-800">{check.label}</p>
                    {check.source && <span className="text-[9px] text-slate-400 uppercase tracking-wide">{check.source}</span>}
                  </div>
                  <p className="text-[11px] text-slate-600">{check.message}</p>
                  {check.remediationHint && check.status === "FAIL" && (
                    <p className="text-[10px] text-amber-700 mt-0.5">→ {check.remediationHint}</p>
                  )}
                </div>
                {check.status === "FAIL" && navMap[check.checkId] && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2"
                    onClick={() => onNavigate(navMap[check.checkId])}
                  >
                    Open <ArrowRight className="w-2.5 h-2.5 ml-0.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Failure summary */}
        {readiness.failureSummary && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-md">
            <p className="text-[11px] font-bold text-rose-700 mb-1 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Failures
            </p>
            <pre className="text-[10px] text-slate-700 whitespace-pre-wrap font-sans">{readiness.failureSummary}</pre>
          </div>
        )}

        {/* Warnings summary */}
        {readiness.warningsSummary && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-[11px] font-bold text-amber-700 mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Warnings
            </p>
            <pre className="text-[10px] text-slate-700 whitespace-pre-wrap font-sans">{readiness.warningsSummary}</pre>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          {canEvaluate && (
            <Button size="sm" variant="outline" onClick={onEvaluate} disabled={evaluating}>
              {evaluating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
              Re-evaluate
            </Button>
          )}
          {allGreen && canGenerateClaim && (
            <Button size="sm" onClick={onGenerateClaim} className="bg-emerald-600 hover:bg-emerald-700 ml-auto">
              <FileCode2 className="w-3.5 h-3.5 mr-1" /> Generate Claim XML
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}
          {!allGreen && isReady && canGenerateClaim && (
            <Button size="sm" variant="outline" onClick={onGenerateClaim} className="ml-auto">
              <Eye className="w-3.5 h-3.5 mr-1" /> Preview Claim Anyway
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// COVERAGE DIALOG
// =====================================================================
function CoverageDialog({ encounterId, patientId, existing, onClose, onSaved }: {
  encounterId: string;
  patientId: string;
  existing: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const qc = useQueryClient();
  const setView = useAppStore((s) => s.setView);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const [payerType, setPayerType] = useState(existing?.payerType || "self_pay");
  const [patientInsuranceId, setPatientInsuranceId] = useState(existing?.patientInsuranceId || "");
  const [coveragePercentage, setCoveragePercentage] = useState(existing?.coveragePercentage?.toString() || "100");
  const [patientCopay, setPatientCopay] = useState(existing?.patientCopay?.toString() || "0");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [saving, setSaving] = useState(false);

  // Fetch patient's insurance records
  // NOTE: /api/patients/[id] returns { patient: { ..., insurance: [...] } } — insurance is nested under `patient`
  const insuranceQuery = useQuery({
    queryKey: ["patient-insurance-for-coverage", patientId],
    queryFn: () => fetchJson(`/api/patients/${patientId}`),
  });
  const patientInsurances = insuranceQuery.data?.patient?.insurance || [];
  const isInsurancePayer = ["nhis", "private_insurance", "corporate"].includes(payerType);

  // Cannot proceed if insurance payer selected but no insurance record available/selected
  // Phase 5: expired records require explicit override authorization
  const selectedInsurance = patientInsurances.find((pi: any) => pi.id === patientInsuranceId);
  const isSelectedExpired = selectedInsurance && selectedInsurance.coverageEnd && new Date(selectedInsurance.coverageEnd) < new Date();
  const canOverrideExpired = can("encounter_coverage.manage") || can("nhia_claim.config");
  const insuranceBlocked = isInsurancePayer && (patientInsurances.length === 0 || !patientInsuranceId || (isSelectedExpired && !canOverrideExpired));

  const handleSave = async () => {
    setSaving(true);
    try {
      await postJson("/api/encounter-coverage", {
        encounterId,
        payerType,
        patientInsuranceId: isInsurancePayer ? patientInsuranceId : null,
        coveragePercentage: parseFloat(coveragePercentage) || 0,
        patientCopay: parseFloat(patientCopay) || 0,
        notes: notes || null,
      });
      toast.success(existing ? "Coverage updated" : "Coverage selected");
      qc.invalidateQueries({ queryKey: ["nhis-workflow-coverage"] });
      onSaved();
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><CreditCard className="w-5 h-5 text-violet-600" /> Encounter Coverage</DialogTitle>
          <DialogDescription className="text-white/80">Select the payer for this encounter.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs font-semibold">Payer Type</Label>
            <Select value={payerType} onValueChange={(v) => {
              setPayerType(v);
              // Reset insurance selection when switching away from insurance-based payers
              if (!["nhis", "private_insurance", "corporate"].includes(v)) {
                setPatientInsuranceId("");
              }
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="self_pay">Self-Pay</SelectItem>
                <SelectItem value="nhis">NHIS</SelectItem>
                <SelectItem value="private_insurance">Private Insurance</SelectItem>
                <SelectItem value="corporate">Corporate</SelectItem>
                <SelectItem value="employer">Employer</SelectItem>
                <SelectItem value="government">Government</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isInsurancePayer && (
            <div>
              <Label className="text-xs font-semibold">Patient Insurance Record</Label>
              {patientInsurances.length === 0 ? (
                <div className="mt-1 p-3 bg-amber-50 border border-amber-200 rounded space-y-2">
                  <p className="text-xs text-amber-800 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>This patient has no insurance records on file. You must add one before selecting an insurance payer, or choose <b>Self-Pay</b> instead.</span>
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs w-full"
                    onClick={() => {
                      selectPatient(patientId);
                      setView("patient_360");
                      onClose();
                    }}
                  >
                    <User className="w-3 h-3 mr-1" /> Go to Patient 360 to Add Insurance
                  </Button>
                </div>
              ) : (
                <div className="mt-1 space-y-1.5 max-h-48 overflow-y-auto">
                  {patientInsurances.map((pi: any) => {
                    const now = new Date();
                    const isExpired = pi.coverageEnd && new Date(pi.coverageEnd) < now;
                    const isFuture = pi.coverageStart && new Date(pi.coverageStart) > now;
                    const isActive = !isExpired && !isFuture && pi.status === "active";
                    const isSelected = patientInsuranceId === pi.id;

                    return (
                      <button
                        key={pi.id}
                        type="button"
                        onClick={() => setPatientInsuranceId(pi.id)}
                        className={`w-full text-left p-2.5 rounded-lg border-2 transition-all ${
                          isSelected
                            ? "border-violet-500 bg-violet-50 ring-1 ring-violet-200"
                            : isExpired
                            ? "border-rose-200 bg-rose-50/30 hover:border-rose-300"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold text-slate-900">
                                {pi.insuranceProvider?.name || "Unknown Provider"}
                              </span>
                              {pi.insuranceProvider?.code && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">
                                  {pi.insuranceProvider.code}
                                </Badge>
                              )}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                isActive ? "bg-emerald-100 text-emerald-700" :
                                isExpired ? "bg-rose-100 text-rose-700" :
                                isFuture ? "bg-blue-100 text-blue-700" :
                                "bg-slate-100 text-slate-600"
                              }`}>
                                {isActive ? "ACTIVE" : isExpired ? "EXPIRED" : isFuture ? "FUTURE" : "INACTIVE"}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-1 space-y-0.5">
                              {pi.membershipNumber && (
                                <div>Member #: <span className="font-mono font-semibold">{pi.membershipNumber}</span></div>
                              )}
                              {pi.policyNumber && (
                                <div>Policy #: <span className="font-mono">{pi.policyNumber}</span></div>
                              )}
                              <div>
                                Coverage: {pi.coverageStart ? formatDate(pi.coverageStart) : "—"} → {pi.coverageEnd ? formatDate(pi.coverageEnd) : "—"}
                              </div>
                              {pi.relationshipToPrincipal && (
                                <div>Relationship: <span className="capitalize">{pi.relationshipToPrincipal}</span></div>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Helper for expired-only scenario (Phase 13 — Scenario B) */}
              {patientInsurances.length > 0 && patientInsurances.every((pi: any) =>
                (pi.coverageEnd && new Date(pi.coverageEnd) < new Date()) || pi.status !== "active"
              ) && (
                <p className="text-[11px] text-amber-700 mt-1.5 flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>Insurance records exist, but none are currently active. You can still select an expired record, but the claim may be rejected.</span>
                </p>
              )}
              {/* Phase 5: expired record override warning */}
              {isSelectedExpired && (
                <p className="text-[11px] text-rose-700 mt-1.5 flex items-start gap-1">
                  <Lock className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    The selected insurance record is <b>EXPIRED</b>.
                    {canOverrideExpired
                      ? " You have override permission — proceed with caution. The claim will likely be rejected."
                      : " Only users with encounter_coverage.manage or nhia_claim.config permission can override and select an expired record."}
                  </span>
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Coverage %</Label>
              <Input type="number" min="0" max="100" value={coveragePercentage} onChange={(e) => setCoveragePercentage(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold">Patient Copay (GHS)</Label>
              <Input type="number" min="0" step="0.01" value={patientCopay} onChange={(e) => setPatientCopay(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. corporate billing arrangement..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || insuranceBlocked}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            {existing ? "Update Coverage" : "Select Payer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// ELIGIBILITY DIALOG
// =====================================================================
function EligibilityDialog({ encounterId, patientId, coverage, onClose, onSaved }: {
  encounterId: string;
  patientId: string;
  coverage: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [method, setMethod] = useState("facility_operational");
  const [source, setSource] = useState("nhia_operational");
  const [status, setStatus] = useState("verified");
  const [coverageEnd, setCoverageEnd] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Direct NHIA API is not configured (NHIA_API_BASE_URL is a server-side env var).
  // The UI offers operational, OTAC, external, and manual methods which are all legitimate.
  // The eligibility API endpoint enforces the direct-API refusal server-side.

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await postJson("/api/eligibility", {
        patientId,
        encounterId,
        facilityId: coverage?.facilityId,
        insuranceProviderId: coverage?.insuranceProviderId,
        patientInsuranceId: coverage?.patientInsuranceId,
        membershipNumber: undefined, // will be resolved server-side
        verificationMethod: method,
        verificationSource: source,
        verificationStatus: status,
        coverageEnd: coverageEnd || undefined,
        verificationReference: reference || undefined,
        notes: notes || undefined,
      });
      toast.success("Eligibility verification recorded");
      qc.invalidateQueries({ queryKey: ["nhis-workflow-eligibility"] });
      onSaved();
    } catch (e: any) {
      if (e.status === 422) {
        setError(e.data?.error || "Direct NHIA API verification is not configured. Use facility_operational, otac, external, or manual method instead.");
      } else {
        setError(e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><ShieldCheck className="w-5 h-5 text-amber-600" /> Eligibility Verification</DialogTitle>
          <DialogDescription className="text-white/80">Record an eligibility check for this encounter.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {/* NHIA direct API availability notice (truthful, not dismissive) */}
          <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-xs flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-slate-700">
              <p className="font-semibold">Direct NHIA API: Not configured</p>
              <p className="mt-0.5">Direct API verification requires NHIA_API_BASE_URL. However, your facility can still record legitimate NHIA operational, OTAC, external, or manual verification using the options below.</p>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Verification Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="facility_operational">NHIA Facility/Operational Verification</SelectItem>
                <SelectItem value="otac">OTAC / *929# (Attendance)</SelectItem>
                <SelectItem value="external">External (NHIA/facility system)</SelectItem>
                <SelectItem value="manual">Manual Record Check (card check)</SelectItem>
                <SelectItem value="api" disabled>NHIA Direct API (not configured)</SelectItem>
                <SelectItem value="unavailable">Unavailable (service down)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold">Verification Source/Channel</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nhia_operational">NHIA Operational Channel</SelectItem>
                <SelectItem value="nhia_otac">NHIA OTAC (*929#)</SelectItem>
                <SelectItem value="external">External NHIA/Facility System</SelectItem>
                <SelectItem value="local">Local (HMIS database lookup)</SelectItem>
                <SelectItem value="manual">Manual Record Review</SelectItem>
                <SelectItem value="nhia_direct" disabled>NHIA Direct API (not configured)</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold">Result</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="manual_verified">Manual Verified</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="unable_to_verify">Unable to Verify</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="not_verified">Not Verified</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Coverage End (optional)</Label>
              <Input type="date" value={coverageEnd} onChange={(e) => setCoverageEnd(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold">Reference (optional)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. NHIA-REF-12345" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. called NHIS hotline, confirmed active..." />
          </div>

          {error && (
            <div className="p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700">
              <AlertCircle className="w-3.5 h-3.5 inline mr-1" /> {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Record Verification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// ATTENDANCE DIALOG
// =====================================================================
function AttendanceDialog({ encounterId, patientId, coverage, existing, onClose, onSaved }: {
  encounterId: string;
  patientId: string;
  coverage: any;
  existing: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [method, setMethod] = useState(existing?.method || "CCC");
  const [code, setCode] = useState(""); // Never pre-fill — security
  const [status, setStatus] = useState(existing?.verificationStatus || "pending");
  const [reference, setReference] = useState(existing?.transactionRef || "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Derive the source from the method — OTAC is NHIA OTAC, CCC is NHIA operational
      const derivedSource = method === "OTAC" ? "nhia_otac"
                          : method === "CCC" ? "nhia_operational"
                          : method === "BIOMETRIC" ? "nhia_operational"
                          : "local";
      const payload: any = {
        encounterId,
        patientInsuranceId: coverage?.patientInsuranceId,
        method,
        verificationStatus: status,
        transactionRef: reference || undefined,
        resultMessage: notes || undefined,
        source: derivedSource,
      };
      // Only send code if user entered one (don't send empty string — backend treats as "no code")
      if (code && method !== "NOT_REQUIRED") {
        payload.code = code;
      }
      await postJson("/api/attendance-verification", payload);
      toast.success(existing ? "Attendance updated" : "Attendance captured");
      setCode(""); // Clear immediately after save (security)
      qc.invalidateQueries({ queryKey: ["nhis-workflow-attendance"] });
      onSaved();
    } catch (e: any) {
      if (e.status === 409) {
        setError(e.data?.error || "Replay detected — this code has already been used.");
      } else {
        setError(e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><Fingerprint className="w-5 h-5 text-cyan-600" /> Attendance Verification</DialogTitle>
          <DialogDescription className="text-white/80">Capture the attendance code for this encounter.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {/* Security notice */}
          <div className="p-2 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Codes are hashed (SHA-256) on the server. OTAC codes cannot be reused across encounters.</span>
          </div>

          <div>
            <Label className="text-xs font-semibold">Method</Label>
            <Select value={method} onValueChange={(v) => { setMethod(v); if (v === "NOT_REQUIRED") setStatus("not_required"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CCC">CCC (Claim Center Code)</SelectItem>
                <SelectItem value="OTAC">OTAC (One-Time Attendance Code)</SelectItem>
                <SelectItem value="BIOMETRIC">Biometric</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
                <SelectItem value="NOT_REQUIRED">Not Required</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {method !== "NOT_REQUIRED" && (
            <div>
              <Label className="text-xs font-semibold">
                {method === "CCC" ? "CCC Code" : method === "OTAC" ? "OTAC Code" : method === "BIOMETRIC" ? "Biometric ID" : "Code"}
              </Label>
              <Input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={`Enter ${method} code...`}
                autoComplete="off"
                disabled={method === "NOT_REQUIRED"}
              />
              <p className="text-[10px] text-slate-500 mt-1">
                {existing?.code ? "Code on file: •••••••• (enter new code to replace)" : "Code will be hashed on save — not stored in plaintext."}
              </p>
            </div>
          )}

          <div>
            <Label className="text-xs font-semibold">Status</Label>
            <Select value={status} onValueChange={setStatus} disabled={method === "NOT_REQUIRED"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending (code captured, not yet confirmed)</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="not_required">Not Required</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold">Transaction Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. NHIA-TXN-12345" />
          </div>
          <div>
            <Label className="text-xs font-semibold">Notes / Reason</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. failed biometric, used manual fallback..." />
          </div>

          {error && (
            <div className="p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700">
              <AlertCircle className="w-3.5 h-3.5 inline mr-1" /> {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || (method !== "NOT_REQUIRED" && !code && !existing?.code)}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            {existing ? "Update Attendance" : "Capture Code"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// AUTHORIZATION DIALOG
// =====================================================================
function AuthorizationDialog({ patientId, encounterId, onClose, onSaved }: {
  patientId: string;
  encounterId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState<EntitySelectValue | null>(null);
  const [authNumber, setAuthNumber] = useState("");
  const [service, setService] = useState<EntitySelectValue | null>(null);
  const [approvedAmount, setApprovedAmount] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [status, setStatus] = useState("pending");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await postJson("/api/authorizations", {
        insuranceProviderId: provider?.id,
        patientId,
        serviceId: service?.id,
        authorizationNumber: authNumber || undefined,
        approvedAmount: approvedAmount ? parseFloat(approvedAmount) : undefined,
        expiryDate: expiryDate || undefined,
        status,
      });
      toast.success("Authorization created");
      qc.invalidateQueries({ queryKey: ["nhis-workflow-authorizations"] });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><FileText className="w-5 h-5 text-orange-600" /> New Pre-Authorization</DialogTitle>
          <DialogDescription className="text-white/80">Request or record an insurance pre-authorization.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs font-semibold">Insurance Provider</Label>
            <InsuranceProviderSelect value={provider} onChange={setProvider} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Authorization Number</Label>
              <Input value={authNumber} onChange={(e) => setAuthNumber(e.target.value)} placeholder="Auto-generated if blank" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Approved Amount (GHS)</Label>
              <Input type="number" min="0" step="0.01" value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Expiry Date</Label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && (
            <div className="p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700">
              <AlertCircle className="w-3.5 h-3.5 inline mr-1" /> {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !provider?.id}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Create Authorization
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

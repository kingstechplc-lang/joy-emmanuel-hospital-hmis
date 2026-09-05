"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { EntitySelect } from "@/components/ui/entity-select";
import {
  Plus, FileText, CheckCircle2, X, Pill, Search, Eye, Activity, AlertTriangle,
  LayoutDashboard, RefreshCw, Ban, StopCircle, History, ChevronDown, ShieldAlert,
  Copy, StickyNote, Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative,
  calculateAge, safeJson, PageHeader, MiniStatCard,
} from "@/components/ui-helpers";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

// =====================================================================
// Helpers
// =====================================================================
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

/** Parse a JSON-encoded warnings string (or already-parsed array) into string[]. */
function parseWarnings(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "partially_dispensed", label: "Partially Dispensed" },
  { value: "dispensed", label: "Dispensed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "discontinued", label: "Discontinued" },
];

const FREQUENCIES = ["OD", "BD", "TDS", "QDS", "Q4H", "Q6H", "Q8H", "Q12H", "PRN", "STAT", "Once weekly"];
const ROUTES = [
  { value: "oral", label: "Oral" },
  { value: "iv", label: "IV" },
  { value: "im", label: "IM" },
  { value: "sc", label: "SC" },
  { value: "topical", label: "Topical" },
  { value: "ophthalmic", label: "Ophthalmic" },
  { value: "otic", label: "Otic" },
  { value: "rectal", label: "Rectal" },
  { value: "vaginal", label: "Vaginal" },
  { value: "inhalation", label: "Inhalation" },
  { value: "sublingual", label: "Sublingual" },
];
const DURATION_UNITS = ["days", "weeks", "months"];

/** Doses-per-day map for auto quantity calc. */
const FREQ_PER_DAY: Record<string, number> = {
  OD: 1, BD: 2, TDS: 3, QDS: 4, Q4H: 6, Q6H: 4, Q8H: 3, Q12H: 2,
  STAT: 1, "Once weekly": 1 / 7, PRN: 0,
};

function autoCalcQuantity(frequency: string, durationValue: number, durationUnit: string): number {
  const perDay = FREQ_PER_DAY[frequency] ?? 0;
  if (!perDay || !durationValue) return 0;
  const days =
    durationUnit === "weeks" ? durationValue * 7 :
    durationUnit === "months" ? durationValue * 30 :
    durationValue;
  return Math.max(1, Math.ceil(perDay * days));
}

// =====================================================================
// Medication picker — EntitySelect wrapper tailored for our Medication model
// (genericName + brandName, not "name")
// =====================================================================
function MedicationPicker({
  value,
  onChange,
  disabled,
}: {
  value: { id: string | null; label: string; _raw?: any } | null;
  onChange: (v: { id: string | null; label: string; _raw?: any } | null) => void;
  disabled?: boolean;
}) {
  return (
    <EntitySelect
      label="Add medication"
      endpoint="/api/medications"
      queryParam="q"
      queryParams={{ status: "active" }}
      getLabel={(m) => `${m.genericName}${m.brandName ? ` (${m.brandName})` : ""}`}
      getId={(m) => m.id}
      getSubtitle={(m) => {
        const parts = [m.strength, m.dosageForm, m.route].filter(Boolean);
        return parts.length ? parts.join(" · ") : null;
      }}
      getCode={(m) => m.dosageForm || null}
      placeholder="Search medication by generic / brand name..."
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

// =====================================================================
// Main view
// =====================================================================
export function PrescriptionsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prescriptions"
        description="Manage patient prescriptions with allergy and duplicate safety checks"
        icon={FileText}
        gradient="from-amber-500 to-orange-600"
        actions={
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-white/20">
              <TabsTrigger value="dashboard" className="data-[state=active]:bg-white data-[state=active]:text-amber-700 text-white gap-1.5">
                <LayoutDashboard className="w-4 h-4" /> Dashboard
              </TabsTrigger>
              <TabsTrigger value="prescriptions" className="data-[state=active]:bg-white data-[state=active]:text-amber-700 text-white gap-1.5">
                <FileText className="w-4 h-4" /> Prescriptions
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {!activeFacilityId && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
            Select a facility to view prescriptions.
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsContent value="dashboard">
          <DashboardTab facilityId={activeFacilityId} canPrescribe={can("pharmacy.prescribe")} />
        </TabsContent>
        <TabsContent value="prescriptions">
          <PrescriptionsTab
            facilityId={activeFacilityId}
            can={can}
            defaultPrescriberId={user?.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// Dashboard tab — 8 KPI MiniStatCards with auto-refresh every 30s
// =====================================================================
function DashboardTab({ facilityId, canPrescribe }: { facilityId: string | null; canPrescribe: boolean }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["prescriptions-stats", facilityId],
    queryFn: () => {
      const qs = facilityId ? `?facilityId=${facilityId}` : "";
      return fetchJson(`/api/prescriptions/stats${qs}`);
    },
    enabled: !!facilityId,
    refetchInterval: 30_000,
  });

  const k = data?.kpis;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-600" /> Today&apos;s Prescription Overview
          </h3>
          <p className="text-xs text-slate-500">Auto-refreshes every 30 seconds</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load KPIs" onRetry={() => refetch()} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <MiniStatCard label="Total Today" value={k?.total ?? 0} icon={FileText} gradient="from-amber-500 to-orange-600" />
          <MiniStatCard label="Pending" value={k?.pending ?? 0} icon={Clock} gradient="from-yellow-500 to-amber-600" />
          <MiniStatCard label="Approved" value={k?.approved ?? 0} icon={CheckCircle2} gradient="from-emerald-500 to-green-600" />
          <MiniStatCard label="Partially Dispensed" value={k?.partiallyDispensed ?? 0} icon={Pill} gradient="from-orange-500 to-amber-600" />
          <MiniStatCard label="Dispensed" value={k?.dispensed ?? 0} icon={CheckCircle2} gradient="from-teal-500 to-emerald-600" />
          <MiniStatCard label="Cancelled" value={k?.cancelled ?? 0} icon={Ban} gradient="from-slate-500 to-slate-600" />
          <MiniStatCard label="Discontinued" value={k?.discontinued ?? 0} icon={StopCircle} gradient="from-rose-500 to-pink-600" />
          <MiniStatCard label="Allergy Alerts" value={k?.allergyAlerts ?? 0} icon={ShieldAlert} gradient="from-red-500 to-rose-600" />
        </div>
      )}

      <Card>
        <CardContent className="p-4 text-xs text-slate-500">
          <p className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <span>
              KPIs reflect prescriptions created today at the selected facility. The Allergy Alerts card
              counts today&apos;s prescriptions with documented allergy warnings. Switch to the Prescriptions
              tab to view, dispense, or discontinue individual records.
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// Prescriptions tab — filters + card list + actions
// =====================================================================
function PrescriptionsTab({
  facilityId,
  can,
  defaultPrescriberId,
}: {
  facilityId: string | null;
  can: (p: string) => boolean;
  defaultPrescriberId?: string;
}) {
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();
  const [statusFilter, setStatusFilter] = useState("all");
  const [patientSearch, setPatientSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [viewRx, setViewRx] = useState<any | null>(null);
  const [dispenseItem, setDispenseItem] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (patientSearch) params.set("patientSearch", patientSearch);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["prescriptions", facilityId, statusFilter, patientSearch],
    queryFn: () => fetchJson(`/api/prescriptions${qs}`),
    enabled: !!facilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["prescriptions"] });
    qc.invalidateQueries({ queryKey: ["prescriptions-stats"] });
    qc.invalidateQueries({ queryKey: ["dispense-queue"] });
  };

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-2 md:items-center">
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-56">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input
              className="pl-8"
              placeholder="Search patient name / MRN / phone"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button onClick={() => setShowNew(true)} disabled={!can("pharmacy.prescribe")} className="gap-2 bg-amber-600 hover:bg-amber-700">
            <Plus className="w-4 h-4" /> New Prescription
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load prescriptions" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No prescriptions"
              description="Create a new prescription to begin."
              icon={FileText}
              action={
                <Button onClick={() => setShowNew(true)} disabled={!can("pharmacy.prescribe")} className="gap-2 bg-amber-600 hover:bg-amber-700">
                  <Plus className="w-4 h-4" /> New Prescription
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {items.map((o: any) => {
            const allergyWarnings = parseWarnings(o.allergyWarnings);
            const duplicateWarnings = parseWarnings(o.duplicateWarnings);
            return (
              <PrescriptionCard
                key={o.id}
                rx={o}
                allergyWarnings={allergyWarnings}
                duplicateWarnings={duplicateWarnings}
                can={can}
                onView={() => setViewRx(o)}
                onDispense={() => setDispenseItem(o)}
                onApprove={async () => {
                  const res = await fetch(`/api/prescriptions/${o.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "approve" }),
                  });
                  if (res.ok) { toast.success("Prescription approved"); invalidate(); }
                  else { const e = await safeJson(res).catch(() => ({})); toast.error(e.error || "Failed"); }
                }}
                onCancel={() => {
                  confirmAction({
                    title: "Cancel this prescription?",
                    description: "Cancelling will mark the prescription as cancelled. Already-dispensed items will remain dispensed.",
                    confirmText: "Yes, cancel",
                    variant: "warning",
                    onConfirm: async () => {
                      const res = await fetch(`/api/prescriptions/${o.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "cancel" }),
                      });
                      if (res.ok) { toast.success("Prescription cancelled"); invalidate(); }
                      else { const e = await safeJson(res).catch(() => ({})); toast.error(e.error || "Failed"); }
                    },
                  });
                }}
                onDiscontinue={() => setViewRx(o)}
              />
            );
          })}
        </div>
      )}

      <NewPrescriptionDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); invalidate(); }}
        defaultFacilityId={facilityId || undefined}
        defaultPrescriberId={defaultPrescriberId}
      />

      {viewRx && (
        <ViewPrescriptionDialog
          prescription={viewRx}
          onClose={() => setViewRx(null)}
          onChanged={() => { setViewRx(null); invalidate(); }}
          can={can}
        />
      )}

      {dispenseItem && (
        <DispenseDialog
          prescription={dispenseItem}
          onClose={() => setDispenseItem(null)}
          onDone={() => { setDispenseItem(null); invalidate(); }}
        />
      )}
      {confirmDialogEl}
    </div>
  );
}

// =====================================================================
// Prescription card
// =====================================================================
function PrescriptionCard({
  rx, allergyWarnings, duplicateWarnings, can, onView, onDispense, onApprove, onCancel, onDiscontinue,
}: {
  rx: any;
  allergyWarnings: string[];
  duplicateWarnings: string[];
  can: (p: string) => boolean;
  onView: () => void;
  onDispense: () => void;
  onApprove: () => void;
  onCancel: () => void;
  onDiscontinue: () => void;
}) {
  const isActive = ["pending", "approved", "partially_dispensed"].includes(rx.status);
  const canCancel = ["pending", "approved", "partially_dispensed"].includes(rx.status);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500">{rx.prescriptionNumber}</span>
              <StatusBadge status={rx.status} />
              {allergyWarnings.length > 0 && (
                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 gap-1 text-[10px]">
                  <AlertTriangle className="w-3 h-3" /> Allergy Alert ({allergyWarnings.length})
                </Badge>
              )}
              {duplicateWarnings.length > 0 && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1 text-[10px]">
                  <Copy className="w-3 h-3" /> Duplicate ({duplicateWarnings.length})
                </Badge>
              )}
            </div>
            <div className="font-semibold text-slate-900 mt-1 truncate">
              {rx.patient?.firstName} {rx.patient?.lastName}
            </div>
            <div className="text-xs text-slate-500">
              MRN: {rx.patient?.patientNumber || "—"} · {calculateAge(rx.patient?.dateOfBirth)}y · {rx.patient?.sex || "—"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-slate-500">Items:</span>{" "}
            <span className="font-medium text-slate-700">{rx._count?.items ?? (rx.items?.length || 0)}</span>
          </div>
          <div>
            <span className="text-slate-500">Prescriber:</span>{" "}
            <span className="font-medium text-slate-700 truncate">
              {rx.prescriber ? `${rx.prescriber.firstName} ${rx.prescriber.lastName}` : "—"}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Prescribed:</span>{" "}
            <span className="font-medium text-slate-700">{formatRelative(rx.prescribedAt)}</span>
          </div>
          <div>
            <span className="text-slate-500">Encounter:</span>{" "}
            <span className="font-medium text-slate-700">{rx.encounter?.encounterNumber || "—"}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1 border-t">
          <Button size="sm" variant="outline" onClick={onView} className="gap-1 h-8 text-xs">
            <Eye className="w-3.5 h-3.5" /> View Details
          </Button>
          {rx.status === "pending" && can("pharmacy.dispense") && (
            <Button size="sm" onClick={onApprove} className="gap-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </Button>
          )}
          {["approved", "partially_dispensed"].includes(rx.status) && can("pharmacy.dispense") && (
            <Button size="sm" onClick={onDispense} className="gap-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
              <Pill className="w-3.5 h-3.5" /> Dispense
            </Button>
          )}
          {isActive && can("pharmacy.prescribe") && (
            <Button size="sm" variant="outline" onClick={onDiscontinue} className="gap-1 h-8 text-xs text-orange-700 border-orange-200 hover:bg-orange-50">
              <StopCircle className="w-3.5 h-3.5" /> Discontinue
            </Button>
          )}
          {canCancel && can("pharmacy.prescribe") && (
            <Button size="sm" variant="ghost" onClick={onCancel} className="gap-1 h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50">
              <Ban className="w-3.5 h-3.5" /> Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// New Prescription Dialog (enhanced)
// =====================================================================
function NewPrescriptionDialog({
  open, onClose, onCreated, defaultFacilityId, defaultPrescriberId,
}: {
  open: boolean; onClose: () => void; onCreated: () => void;
  defaultFacilityId?: string; defaultPrescriberId?: string;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patients, setPatients] = useState<any[]>([]);
  const [patientId, setPatientId] = useState("");
  const [patientAllergies, setPatientAllergies] = useState<any[]>([]);
  const [encounterId, setEncounterId] = useState("");
  const [encounters, setEncounters] = useState<any[]>([]);
  const [facilityId, setFacilityId] = useState(defaultFacilityId || "");
  const [facilities, setFacilities] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [medPickerValue, setMedPickerValue] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [activeRxMeds, setActiveRxMeds] = useState<{ medicationId: string; medName: string; rxNumber: string }[]>([]);
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const medPickerRef = useRef<HTMLDivElement>(null);
  const itemsEndRef = useRef<HTMLDivElement>(null);

  // Load facilities
  useEffect(() => {
    fetchJson("/api/facilities").then((d) => setFacilities(d.facilities || [])).catch(() => {});
  }, []);

  // Patient search (debounced)
  useEffect(() => {
    if (!patientQuery || patientId) return;
    const t = setTimeout(() => {
      fetch(`/api/patients?q=${encodeURIComponent(patientQuery)}&limit=10`)
        .then((r) => r.json())
        .then((d) => setPatients(d.patients || []))
        .catch(() => setPatients([]));
    }, 350);
    return () => clearTimeout(t);
  }, [patientQuery, patientId]);

  // When patient is selected: fetch full patient record (allergies) + active prescriptions
  useEffect(() => {
    if (!patientId) { setPatientAllergies([]); setActiveRxMeds([]); return; }
    fetchJson(`/api/patients/${patientId}`)
      .then((d) => {
        const al = (d.patient?.allergies || []).filter((a: any) => a.status === "active" || !a.status);
        setPatientAllergies(al);
      })
      .catch(() => setPatientAllergies([]));
    // Active prescriptions for duplicate detection
    fetchJson(`/api/prescriptions?patientId=${patientId}`)
      .then((d) => {
        const rxs = d.items || [];
        const meds: { medicationId: string; medName: string; rxNumber: string }[] = [];
        for (const rx of rxs) {
          if (!["pending", "approved", "partially_dispensed"].includes(rx.status)) continue;
          for (const it of rx.items || []) {
            if (!["pending", "partially_dispensed"].includes(it.status)) continue;
            meds.push({
              medicationId: it.medicationId,
              medName: it.medication?.genericName + (it.medication?.brandName ? ` (${it.medication.brandName})` : ""),
              rxNumber: rx.prescriptionNumber,
            });
          }
        }
        setActiveRxMeds(meds);
      })
      .catch(() => setActiveRxMeds([]));
  }, [patientId]);

  // Load encounters for the selected patient
  useEffect(() => {
    if (!patientId) { setEncounters([]); return; }
    fetchJson(`/api/encounters?patientId=${patientId}&limit=20`)
      .then((d) => setEncounters(d.items || []))
      .catch(() => setEncounters([]));
  }, [patientId]);

  // ===== Safety checks (client-side preview mirrors server logic) =====
  const allergyWarnings = useMemo(() => {
    const out: string[] = [];
    for (const it of items) {
      if (!it.medicationId || !it._medName) continue;
      const medNameLower = it._medName.toLowerCase();
      for (const allergy of patientAllergies) {
        if (allergy.allergen && medNameLower.includes(allergy.allergen.toLowerCase())) {
          out.push(
            `ALLERGY ALERT: ${it._medName} conflicts with documented allergy to ${allergy.allergen}` +
            `${allergy.severity ? ` (${allergy.severity})` : ""}` +
            `${allergy.reaction ? ` — Reaction: ${allergy.reaction}` : ""}`
          );
        }
      }
    }
    return out;
  }, [items, patientAllergies]);

  const duplicateWarnings = useMemo(() => {
    const out: string[] = [];
    for (const it of items) {
      if (!it.medicationId) continue;
      const dup = activeRxMeds.find((m) => m.medicationId === it.medicationId);
      if (dup) {
        out.push(`DUPLICATE: Patient already has an active prescription for ${dup.medName} (Rx ${dup.rxNumber})`);
      }
    }
    return out;
  }, [items, activeRxMeds]);

  const hasWarnings = allergyWarnings.length > 0 || duplicateWarnings.length > 0;

  // ===== Item management =====
  const addMedication = (v: any) => {
    if (!v?.id) return;
    const med = v._raw || {};
    setItems((prev) => [
      ...prev,
      {
        medicationId: v.id,
        _medName: `${med.genericName}${med.brandName ? ` (${med.brandName})` : ""}`,
        _strength: med.strength || "",
        _dosageForm: med.dosageForm || "",
        dose: "",
        frequency: "BD",
        route: med.route || "oral",
        durationValue: 5,
        durationUnit: "days",
        duration: "5 days",
        quantity: 10,
        quantityCalculated: true,
        instructions: "",
        isPRN: false,
        prnIndication: "",
        prnMaxFrequency: "",
        isSTAT: false,
        isOneTime: false,
        startDate: new Date().toISOString().slice(0, 10),
        endDate: "",
      },
    ]);
    setMedPickerValue(null);
  };

  // Auto-scroll to the newly added item so the user can immediately fill in details.
  // The medication picker is sticky so it stays visible without scrolling.
  useEffect(() => {
    if (items.length > 0 && itemsEndRef.current) {
      // Small delay to let DOM render the new item
      setTimeout(() => {
        itemsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }, [items.length]);

  const updateItem = (idx: number, field: string, value: any) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, [field]: value };
        // Auto-recompute duration string + quantity
        if (["durationValue", "durationUnit"].includes(field)) {
          next.duration = `${next.durationValue || ""} ${next.durationUnit || ""}`.trim();
        }
        if (next.quantityCalculated && ["frequency", "durationValue", "durationUnit", "quantityCalculated"].includes(field)) {
          const q = autoCalcQuantity(next.frequency, Number(next.durationValue) || 0, next.durationUnit);
          if (q > 0) next.quantity = q;
        }
        // STAT checkbox toggles frequency
        if (field === "isSTAT" && value) {
          next.frequency = "STAT";
        }
        // PRN checkbox toggles frequency
        if (field === "isPRN" && value) {
          next.frequency = "PRN";
        }
        return next;
      })
    );
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const reset = () => {
    setPatientQuery(""); setPatients([]); setPatientId(""); setPatientAllergies([]);
    setEncounterId(""); setEncounters([]); setActiveRxMeds([]);
    setNotes(""); setItems([]); setMedPickerValue(null);
    setAcknowledgeWarnings(false);
  };

  const handleSubmit = async () => {
    if (!patientId) return toast.error("Select a patient");
    if (!encounterId) return toast.error("Select an encounter (or create one first)");
    if (!facilityId) return toast.error("Select a facility");
    if (items.length === 0) return toast.error("Add at least one medication");
    if (hasWarnings && !acknowledgeWarnings) {
      return toast.error("Please acknowledge the allergy/duplicate warnings before submitting");
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId, encounterId, facilityId,
          prescriberId: defaultPrescriberId,
          notes,
          acknowledgeWarnings,
          items: items.map((it) => ({
            medicationId: it.medicationId,
            dose: it.dose,
            frequency: it.frequency,
            route: it.route,
            duration: it.duration,
            durationValue: it.durationValue ? Number(it.durationValue) : null,
            durationUnit: it.durationUnit,
            quantity: Number(it.quantity) || 0,
            quantityCalculated: it.quantityCalculated,
            instructions: it.instructions,
            isPRN: it.isPRN,
            prnIndication: it.prnIndication,
            prnMaxFrequency: it.prnMaxFrequency,
            isSTAT: it.isSTAT,
            isOneTime: it.isOneTime,
            startDate: it.startDate || null,
            endDate: it.endDate || null,
          })),
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Prescription created");
      reset();
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="2xl">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Plus className="w-5 h-5 text-amber-600" /> New Prescription
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Create a new prescription. Allergies and duplicate active prescriptions are checked automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Patient + Encounter + Facility */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Patient</Label>
              {!patientId ? (
                <div className="relative">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
                    <Input
                      className="pl-8"
                      placeholder="Search patient name / number / phone"
                      value={patientQuery}
                      onChange={(e) => setPatientQuery(e.target.value)}
                    />
                  </div>
                  {patients.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full bg-white border rounded shadow max-h-60 overflow-y-auto">
                      {patients.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setPatientId(p.id); setPatients([]);
                            setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
                          }}
                          className="w-full text-left p-2 hover:bg-amber-50 border-b last:border-b-0"
                        >
                          <div className="text-sm font-medium">{p.firstName} {p.lastName}</div>
                          <div className="text-xs text-slate-500">{p.patientNumber} · {p.phone || "no phone"}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input value={patientQuery} disabled className="bg-slate-50 text-xs" />
                  <Button size="sm" variant="ghost" onClick={() => { setPatientId(""); setPatientQuery(""); setEncounterId(""); setPatientAllergies([]); }}>Change</Button>
                </div>
              )}
              {patientId && patientAllergies.length > 0 && (
                <div className="mt-1 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-1.5">
                  <ShieldAlert className="w-3 h-3 inline mr-1" />
                  {patientAllergies.length} active allergen(s): {patientAllergies.map((a: any) => a.allergen).join(", ")}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Encounter</Label>
              <Select value={encounterId || undefined} onValueChange={setEncounterId} disabled={!patientId || encounters.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={patientId ? (encounters.length ? "Select encounter" : "No encounters") : "Select patient first"} />
                </SelectTrigger>
                <SelectContent>
                  {encounters.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.encounterNumber} · {e.encounterType} · {formatDate(e.startAt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Facility</Label>
              <Select value={facilityId || undefined} onValueChange={setFacilityId}>
                <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Medication picker — STICKY so it stays visible while items scroll below */}
          <div className="sticky top-0 z-20 bg-white pb-2 -mx-1 px-1 border-b border-slate-100">
            <div ref={medPickerRef}>
              <MedicationPicker value={medPickerValue} onChange={addMedication} disabled={!patientId} />
            </div>
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Prescription Items ({items.length})</Label>
              {items.map((it, idx) => (
                <PrescriptionItemEditor
                  key={idx}
                  item={it}
                  onChange={(field, value) => updateItem(idx, field, value)}
                  onRemove={() => removeItem(idx)}
                />
              ))}
              <div ref={itemsEndRef} />
            </div>
          )}

          {/* Allergy warnings banner */}
          {allergyWarnings.length > 0 && (
            <div className="bg-rose-50 border border-rose-300 rounded-lg p-3">
              <div className="flex items-center gap-2 text-rose-800 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" /> Allergy Warnings ({allergyWarnings.length})
              </div>
              <ul className="mt-2 space-y-1 text-xs text-rose-700 list-disc list-inside">
                {allergyWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Duplicate warnings banner */}
          {duplicateWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                <Copy className="w-4 h-4" /> Duplicate Medication Warnings ({duplicateWarnings.length})
              </div>
              <ul className="mt-2 space-y-1 text-xs text-amber-700 list-disc list-inside">
                {duplicateWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Acknowledge checkbox */}
          {hasWarnings && (
            <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <Checkbox
                id="ack-warnings"
                checked={acknowledgeWarnings}
                onCheckedChange={(v) => setAcknowledgeWarnings(!!v)}
                className="mt-0.5"
              />
              <Label htmlFor="ack-warnings" className="text-xs text-slate-700 cursor-pointer">
                I acknowledge the above warnings and confirm the prescription is clinically appropriate.
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  Required when allergy or duplicate warnings are present.
                </span>
              </Label>
            </div>
          )}

          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes for the pharmacist..."
              className="text-sm"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-amber-600 hover:bg-amber-700">
            {submitting ? "Creating..." : "Create Prescription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Prescription item editor (used inside New Prescription dialog)
// =====================================================================
function PrescriptionItemEditor({
  item,
  onChange,
  onRemove,
}: {
  item: any;
  onChange: (field: string, value: any) => void;
  onRemove: () => void;
}) {
  return (
    <Card className="border-amber-100">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <span className="font-medium text-sm">{item._medName}</span>
            <span className="ml-2 text-xs text-slate-500">{item._strength} · {item._dosageForm}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={onRemove} className="text-rose-600 h-7">
            <X className="w-3 h-3" />
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div>
            <Label className="text-[10px]">Dose</Label>
            <Input value={item.dose} onChange={(e) => onChange("dose", e.target.value)} placeholder="e.g. 500mg" className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Frequency</Label>
            <Select value={item.frequency || undefined} onValueChange={(v) => onChange("frequency", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Route</Label>
            <Select value={item.route || undefined} onValueChange={(v) => onChange("route", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROUTES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Duration (value)</Label>
            <Input
              type="number"
              min={1}
              value={item.durationValue}
              onChange={(e) => onChange("durationValue", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Duration (unit)</Label>
            <Select value={item.durationUnit || undefined} onValueChange={(v) => onChange("durationUnit", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATION_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <Label className="text-[10px]">Quantity</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={item.quantity}
                onChange={(e) => onChange("quantity", e.target.value)}
                disabled={item.quantityCalculated}
                placeholder="0"
                className="h-8 text-xs"
              />
              <Checkbox
                id={`auto-${item.medicationId}-${item._medName}`}
                checked={item.quantityCalculated}
                onCheckedChange={(v) => onChange("quantityCalculated", !!v)}
              />
              <Label htmlFor={`auto-${item.medicationId}-${item._medName}`} className="text-[10px] cursor-pointer whitespace-nowrap">Auto</Label>
            </div>
          </div>
          <div className="md:col-span-2">
            <Label className="text-[10px]">Instructions</Label>
            <Textarea value={item.instructions} onChange={(e) => onChange("instructions", e.target.value)} placeholder="After meals" className="text-xs" rows={3} />
          </div>
        </div>

        {/* PRN row */}
        <div className="flex flex-wrap items-center gap-4 p-2 bg-slate-50 rounded">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`prn-${item.medicationId}`}
              checked={item.isPRN}
              onCheckedChange={(v) => onChange("isPRN", !!v)}
            />
            <Label htmlFor={`prn-${item.medicationId}`} className="text-xs cursor-pointer">PRN (as needed)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`stat-${item.medicationId}`}
              checked={item.isSTAT}
              onCheckedChange={(v) => onChange("isSTAT", !!v)}
            />
            <Label htmlFor={`stat-${item.medicationId}`} className="text-xs cursor-pointer">STAT</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`ot-${item.medicationId}`}
              checked={item.isOneTime}
              onCheckedChange={(v) => onChange("isOneTime", !!v)}
            />
            <Label htmlFor={`ot-${item.medicationId}`} className="text-xs cursor-pointer">One-time</Label>
          </div>
        </div>

        {item.isPRN && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">PRN Indication</Label>
              <Input
                value={item.prnIndication}
                onChange={(e) => onChange("prnIndication", e.target.value)}
                placeholder="e.g. For pain"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px]">Max PRN Frequency</Label>
              <Input
                value={item.prnMaxFrequency}
                onChange={(e) => onChange("prnMaxFrequency", e.target.value)}
                placeholder="e.g. Q4H, max 4/day"
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Start Date</Label>
            <Input
              type="date"
              value={item.startDate}
              onChange={(e) => onChange("startDate", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">End Date (optional)</Label>
            <Input
              type="date"
              value={item.endDate}
              onChange={(e) => onChange("endDate", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// View Prescription Dialog (enhanced)
// =====================================================================
function ViewPrescriptionDialog({
  prescription, onClose, onChanged, can,
}: {
  prescription: any; onClose: () => void; onChanged: () => void;
  can: (p: string) => boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["prescription", prescription.id],
    queryFn: () => fetchJson(`/api/prescriptions/${prescription.id}`),
  });
  const full = data?.item || prescription;

  const allergyWarnings = parseWarnings(full?.allergyWarnings);
  const duplicateWarnings = parseWarnings(full?.duplicateWarnings);
  const isActive = ["pending", "approved", "partially_dispensed"].includes(full?.status);
  const canCancel = ["pending", "approved"].includes(full?.status);

  const [actionDialog, setActionDialog] = useState<{ type: "discontinue" | "cancel"; reason: string; submitting: boolean } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const submitAction = async () => {
    if (!actionDialog) return;
    if (actionDialog.type === "discontinue" && !actionDialog.reason.trim()) {
      return toast.error("Discontinuation reason is required");
    }
    setActionDialog({ ...actionDialog, submitting: true });
    try {
      const res = await fetch(`/api/prescriptions/${prescription.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionDialog.type,
          reason: actionDialog.reason || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(actionDialog.type === "discontinue" ? "Prescription discontinued" : "Prescription cancelled");
      setActionDialog(null);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
      setActionDialog({ ...actionDialog, submitting: false });
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="wide">
          <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileText className="w-4 h-4 text-amber-600" /> Prescription {full?.prescriptionNumber}
            </DialogTitle>
            <DialogDescription className="text-white/80">
              Prescribed {formatDate(full?.prescribedAt, true)} by{" "}
              {full?.prescriber ? `${full.prescriber.firstName} ${full.prescriber.lastName}` : "—"}
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <LoadingState rows={3} />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Patient</div>
                  <div className="font-medium">{full?.patient?.firstName} {full?.patient?.lastName}</div>
                  <div className="text-xs text-slate-500">{full?.patient?.patientNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Status</div>
                  <StatusBadge status={full?.status} />
                  {full?.warningsAcknowledged && (
                    <div className="text-[10px] text-slate-500 mt-1">Warnings acknowledged</div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-slate-500">Encounter</div>
                  <div className="text-xs">{full?.encounter?.encounterNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Facility</div>
                  <div className="text-xs">{full?.facility?.name}</div>
                </div>
              </div>

              {/* Allergy warnings */}
              {allergyWarnings.length > 0 && (
                <div className="bg-rose-50 border border-rose-300 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-rose-800 font-semibold text-sm">
                    <ShieldAlert className="w-4 h-4" /> Allergy Warnings ({allergyWarnings.length})
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-rose-700 list-disc list-inside">
                    {allergyWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Duplicate warnings */}
              {duplicateWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                    <Copy className="w-4 h-4" /> Duplicate Medication Warnings ({duplicateWarnings.length})
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-amber-700 list-disc list-inside">
                    {duplicateWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Discontinue info */}
              {full?.status === "discontinued" && (
                <div className="bg-orange-50 border border-orange-300 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-orange-800 font-semibold text-sm">
                    <StopCircle className="w-4 h-4" /> Discontinued
                  </div>
                  <div className="text-xs text-orange-700 mt-1">
                    {full.discontinuedAt && <>on {formatDate(full.discontinuedAt, true)} </>}
                    {full.discontinuedReason && <>— Reason: {full.discontinuedReason}</>}
                  </div>
                </div>
              )}
              {full?.status === "cancelled" && full?.cancelledReason && (
                <div className="bg-slate-50 border border-slate-300 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
                    <Ban className="w-4 h-4" /> Cancelled
                  </div>
                  <div className="text-xs text-slate-700 mt-1">Reason: {full.cancelledReason}</div>
                </div>
              )}

              {/* Items */}
              <div>
                <Label className="text-xs font-semibold">Items</Label>
                <div className="space-y-2 mt-1">
                  {(full?.items || []).map((it: any) => (
                    <Card key={it.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-sm">
                              {it.medication?.genericName} {it.medication?.brandName ? `(${it.medication.brandName})` : ""}
                            </div>
                            <div className="text-xs text-slate-500">
                              {it.medication?.strength} · {it.medication?.dosageForm}
                            </div>
                          </div>
                          <StatusBadge status={it.status} />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
                          <div><span className="text-slate-500">Dose:</span> {it.dose || "—"}</div>
                          <div><span className="text-slate-500">Frequency:</span> {it.frequency || "—"}</div>
                          <div><span className="text-slate-500">Route:</span> {it.route || "—"}</div>
                          <div><span className="text-slate-500">Duration:</span> {it.duration || "—"}</div>
                          <div><span className="text-slate-500">Quantity:</span> {it.quantity}</div>
                          <div><span className="text-slate-500">Dispensed:</span> {it.dispensedQuantity}/{it.quantity}</div>
                          {it.startDate && <div><span className="text-slate-500">Start:</span> {formatDate(it.startDate)}</div>}
                          {it.endDate && <div><span className="text-slate-500">End:</span> {formatDate(it.endDate)}</div>}
                        </div>
                        {(it.isPRN || it.isSTAT || it.isOneTime) && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {it.isPRN && <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">PRN{it.prnIndication ? ` · ${it.prnIndication}` : ""}</Badge>}
                            {it.isSTAT && <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">STAT</Badge>}
                            {it.isOneTime && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">One-time</Badge>}
                            {it.prnMaxFrequency && <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px]">Max: {it.prnMaxFrequency}</Badge>}
                          </div>
                        )}
                        {it.instructions && (
                          <div className="mt-2 text-xs bg-slate-50 rounded p-2">
                            <span className="text-slate-500">Instructions:</span> {it.instructions}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {full?.notes && (
                <div className="text-sm bg-amber-50 border border-amber-200 rounded p-3">
                  <div className="text-xs text-amber-700 font-semibold flex items-center gap-1">
                    <StickyNote className="w-3 h-3" /> Notes
                  </div>
                  <div className="text-xs text-amber-800 mt-1">{full.notes}</div>
                </div>
              )}

              {/* Medication history (collapsible) */}
              <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="border rounded-lg">
                <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-slate-50">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <History className="w-4 h-4 text-amber-600" /> Medication History for this Patient
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t p-3">
                    <MedicationHistoryPanel patientId={full?.patient?.id} excludeId={full?.id} />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          <DialogFooter className="flex flex-wrap gap-2">
            {isActive && can("pharmacy.prescribe") && (
              <Button
                variant="outline"
                onClick={() => setActionDialog({ type: "discontinue", reason: "", submitting: false })}
                className="gap-1.5 text-orange-700 border-orange-300 hover:bg-orange-50"
              >
                <StopCircle className="w-4 h-4" /> Discontinue
              </Button>
            )}
            {canCancel && can("pharmacy.prescribe") && (
              <Button
                variant="outline"
                onClick={() => setActionDialog({ type: "cancel", reason: "", submitting: false })}
                className="gap-1.5 text-rose-700 border-rose-300 hover:bg-rose-50"
              >
                <Ban className="w-4 h-4" /> Cancel
              </Button>
            )}
            <Button variant="outline" onClick={onClose} className="ml-auto">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discontinue / Cancel reason dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(o) => { if (!o) setActionDialog(null); }}>
        <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden" size="compact">
          <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
            <DialogTitle className="flex items-center gap-2 text-white">
              {actionDialog?.type === "discontinue" ? (
                <><StopCircle className="w-4 h-4 text-orange-600" /> Discontinue Prescription</>
              ) : (
                <><Ban className="w-4 h-4 text-rose-600" /> Cancel Prescription</>
              )}
            </DialogTitle>
            <DialogDescription className="text-white/80">
              {actionDialog?.type === "discontinue"
                ? "Discontinuing will stop this prescription. Please provide a reason (required)."
                : "Cancelling will mark this prescription as cancelled. A reason is optional."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-2">
            <Label className="text-xs">
              Reason{actionDialog?.type === "discontinue" ? " (required)" : " (optional)"}
            </Label>
            <Textarea
              value={actionDialog?.reason || ""}
              onChange={(e) => setActionDialog((prev) => prev ? { ...prev, reason: e.target.value } : prev)}
              placeholder={
                actionDialog?.type === "discontinue"
                  ? "e.g. Adverse reaction, therapy completed, switched to alternative..."
                  : "e.g. Entered in error, patient declined, duplicate..."
              }
              rows={3}
              autoFocus
            />
          </div>
          <DialogFooter className="p-6 pt-4 shrink-0 border-t">
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              onClick={submitAction}
              disabled={actionDialog?.submitting || (actionDialog?.type === "discontinue" && !actionDialog?.reason.trim())}
              className={
                actionDialog?.type === "discontinue"
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }
            >
              {actionDialog?.submitting
                ? "Submitting..."
                : actionDialog?.type === "discontinue" ? "Discontinue" : "Cancel Prescription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =====================================================================
// Medication history panel (collapsible content)
// =====================================================================
function MedicationHistoryPanel({ patientId, excludeId }: { patientId?: string; excludeId?: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["patient-prescriptions", patientId],
    queryFn: () => fetchJson(`/api/prescriptions?patientId=${patientId}`),
    enabled: !!patientId,
  });

  if (!patientId) return <div className="text-xs text-slate-500">No patient selected.</div>;
  if (isLoading) return <LoadingState rows={3} />;
  if (isError) return <ErrorState message="Failed to load medication history" />;

  const items = (data?.items || []).filter((rx: any) => rx.id !== excludeId);
  if (items.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic py-2">
        No previous prescriptions on file for this patient.
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {items.map((rx: any) => {
        const aw = parseWarnings(rx.allergyWarnings);
        const dw = parseWarnings(rx.duplicateWarnings);
        return (
          <div key={rx.id} className="border rounded p-2 text-xs bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-slate-500">{rx.prescriptionNumber}</span>
              <StatusBadge status={rx.status} />
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {formatDate(rx.prescribedAt, true)} · {rx._count?.items ?? (rx.items?.length || 0)} items
              {rx.prescriber ? ` · by ${rx.prescriber.firstName} ${rx.prescriber.lastName}` : ""}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(rx.items || []).slice(0, 4).map((it: any) => (
                <Badge key={it.id} variant="outline" className="text-[10px] bg-slate-50">
                  {it.medication?.genericName}
                  {it.medication?.brandName ? ` (${it.medication.brandName})` : ""}
                </Badge>
              ))}
              {(rx.items?.length || 0) > 4 && (
                <Badge variant="outline" className="text-[10px] bg-slate-50">
                  +{(rx.items?.length || 0) - 4} more
                </Badge>
              )}
            </div>
            {aw.length > 0 && (
              <div className="mt-1 text-[10px] text-rose-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {aw.length} allergy warning(s)
              </div>
            )}
            {dw.length > 0 && (
              <div className="mt-1 text-[10px] text-amber-700 flex items-center gap-1">
                <Copy className="w-3 h-3" /> {dw.length} duplicate warning(s)
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =====================================================================
// Dispense Dialog (per-item batch dispense)
// =====================================================================
function DispenseDialog({ prescription, onClose, onDone }: { prescription: any; onClose: () => void; onDone: () => void }) {
  const [full, setFull] = useState<any>(prescription);
  const [loading, setLoading] = useState(true);
  const [dispensing, setDispensing] = useState(false);
  const [dispenseMap, setDispenseMap] = useState<Record<string, { batchId: string; quantity: number; createInvoice: boolean }>>({});
  const [batchesByItem, setBatchesByItem] = useState<Record<string, any[]>>({});

  useEffect(() => {
    let active = true;
    fetchJson(`/api/prescriptions/${prescription.id}`)
      .then(async (d) => {
        if (!active) return;
        setFull(d.item);
        const facilityId = d.item?.facilityId;
        if (!facilityId) return;
        const newBatches: Record<string, any[]> = {};
        for (const it of d.item?.items || []) {
          const res = await fetch(`/api/inventory?facilityId=${facilityId}&type=medication&q=${encodeURIComponent(it.medication?.genericName || "")}`);
          if (res.ok) {
            const inv = await safeJson(res);
            const match = (inv.items || []).find((i: any) => i.medication?.id === it.medicationId || i.name.toLowerCase().includes((it.medication?.genericName || "").toLowerCase()));
            newBatches[it.id] = match?.batches || [];
          }
        }
        if (active) setBatchesByItem(newBatches);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [prescription.id]);

  const setItem = (itemId: string, field: "batchId" | "quantity" | "createInvoice", value: any) => {
    setDispenseMap((prev) => ({
      ...prev,
      [itemId]: {
        batchId: field === "batchId" ? value : prev[itemId]?.batchId || "",
        quantity: field === "quantity" ? Number(value) : prev[itemId]?.quantity || 0,
        createInvoice: field === "createInvoice" ? value : prev[itemId]?.createInvoice ?? true,
      },
    }));
  };

  const handleDispense = async (item: any) => {
    const cfg = dispenseMap[item.id];
    if (!cfg || !cfg.batchId) return toast.error("Select a batch");
    if (!cfg.quantity || cfg.quantity <= 0) return toast.error("Enter a quantity");
    const remaining = item.quantity - item.dispensedQuantity;
    if (cfg.quantity > remaining) return toast.error(`Cannot dispense more than ${remaining} remaining`);

    setDispensing(true);
    try {
      const res = await fetch("/api/dispense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prescriptionItemId: item.id,
          batchId: cfg.batchId,
          quantity: cfg.quantity,
          createInvoice: cfg.createInvoice,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Dispensed ${cfg.quantity} units${data.invoice ? " (invoice updated)" : ""}`);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDispensing(false);
    }
  };

  const allergyBanner = full?.patient && (full.patient as any).allergies?.length > 0;
  useEffect(() => {
    if (!full?.patient?.id) return;
    fetchJson(`/api/patients/${full.patient.id}`)
      .then((d) => {
        const al = d.patient?.allergies || [];
        if (al.length > 0) {
          setFull((prev: any) => ({ ...prev, patient: { ...prev.patient, allergies: al } }));
        }
      })
      .catch(() => {});
  }, [full?.patient?.id]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="xl">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Pill className="w-4 h-4 text-amber-600" /> Dispense: {full?.prescriptionNumber}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Patient: {full?.patient?.firstName} {full?.patient?.lastName} ({full?.patient?.patientNumber})
          </DialogDescription>
        </DialogHeader>

        {allergyBanner && (
          <div className="flex-1 overflow-y-auto p-6 bg-rose-50 border border-rose-300 rounded p-3 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-rose-800">Allergy Warning</div>
              <div className="text-xs text-rose-700 mt-1">
                This patient has {full?.patient?.allergies?.length} active allergen(s):
                {" "}{(full?.patient?.allergies || []).map((a: any) => `${a.allergen}${a.severity ? ` (${a.severity})` : ""}`).join(", ")}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <LoadingState rows={3} />
        ) : (
          <div className="space-y-2">
            {(full?.items || []).filter((it: any) => it.status !== "dispensed" && it.status !== "cancelled").map((it: any) => {
              const remaining = it.quantity - it.dispensedQuantity;
              const batches = batchesByItem[it.id] || [];
              return (
                <Card key={it.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{it.medication?.genericName} {it.medication?.brandName ? `(${it.medication.brandName})` : ""}</div>
                        <div className="text-xs text-slate-500">
                          {it.medication?.strength} · Qty {it.quantity} · Dispensed {it.dispensedQuantity}/{it.quantity} · Remaining {remaining}
                        </div>
                      </div>
                      <StatusBadge status={it.status} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                      <div className="md:col-span-2">
                        <Label className="text-[10px]">Select Batch</Label>
                        <Select value={dispenseMap[it.id]?.batchId || undefined} onValueChange={(v) => setItem(it.id, "batchId", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={batches.length === 0 ? "No batches available" : "Select batch"} /></SelectTrigger>
                          <SelectContent>
                            {batches.filter((b: any) => b.quantity > 0).map((b: any) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.batchNumber} · {b.quantity} in stock{b.expiryDate ? ` · exp ${formatDate(b.expiryDate)}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px]">Dispense Qty</Label>
                        <Input type="number" min={1} max={remaining} value={dispenseMap[it.id]?.quantity || ""} onChange={(e) => setItem(it.id, "quantity", e.target.value)} placeholder={`max ${remaining}`} className="h-8 text-xs" />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleDispense(it)}
                        disabled={dispensing}
                        className="bg-amber-600 hover:bg-amber-700 h-8 text-xs"
                      >
                        <Activity className="w-3 h-3 mr-1" /> Dispense
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`inv-${it.id}`}
                        checked={dispenseMap[it.id]?.createInvoice ?? true}
                        onCheckedChange={(v) => setItem(it.id, "createInvoice", !!v)}
                      />
                      <Label htmlFor={`inv-${it.id}`} className="text-xs text-slate-600 cursor-pointer">Add to patient invoice (auto-bill)</Label>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {(full?.items || []).filter((it: any) => it.status === "dispensed").length > 0 && (
              <div className="text-xs text-slate-500 mt-2">
                Already dispensed: {(full?.items || []).filter((it: any) => it.status === "dispensed").map((it: any) => it.medication?.genericName).join(", ")}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

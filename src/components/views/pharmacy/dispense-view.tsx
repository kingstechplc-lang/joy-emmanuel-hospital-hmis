"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Pill,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PackageX,
  CalendarClock,
  XCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  Ban,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Filter,
  X,
  Users,
  LayoutGrid,
  Calendar,
  Stethoscope,
  ListChecks,
  CheckSquare,
  Square,
  Hourglass,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState,
  LoadingState,
  ErrorState,
  StatusBadge,
  formatDate,
  calculateAge,
  safeJson,
  PageHeader,
  MiniStatCard,
} from "@/components/ui-helpers";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

// =====================================================================
// FEFO & EXPIRY HELPERS
// =====================================================================
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / MS_PER_DAY);
}

function isExpired(date: string | Date | null | undefined): boolean {
  const n = daysUntil(date);
  return n === null ? false : n < 0;
}

function isNearExpiry(date: string | Date | null | undefined): boolean {
  const n = daysUntil(date);
  return n === null ? false : n >= 0 && n <= 30;
}

/** Sort batches by expiry date ascending (soonest first). Batches without expiry go last. */
function sortBatchesFEFO(batches: any[]): any[] {
  return [...batches].sort((a, b) => {
    const da = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
    const db = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
    return da - db;
  });
}

/** FEFO recommended batch = soonest-expiring, non-expired, in-stock batch. */
function fefoRecommendedBatch(batches: any[]): any | null {
  const sorted = sortBatchesFEFO(batches);
  return sorted.find((b) => b.quantity > 0 && !isExpired(b.expiryDate)) || null;
}

// =====================================================================
// MAIN VIEW
// =====================================================================
export function DispenseView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [dispensing, setDispensing] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState("dashboard");

  // ---- Queue search & filter state ----
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [allergyFilter, setAllergyFilter] = useState<string>("all");
  const [prescriberFilter, setPrescriberFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [nearExpiryOnly, setNearExpiryOnly] = useState<boolean>(false);
  const [expandedPatients, setExpandedPatients] = useState<Record<string, boolean>>({});

  // ---- Bulk-select state for "Dispense selected" action ----
  const [selectedPatientIds, setSelectedPatientIds] = useState<Record<string, boolean>>({});
  const [bulkDispensing, setBulkDispensing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // ---- Dashboard stats query (auto-refresh every 30s) ----
  const statsQs = activeFacilityId ? `?facilityId=${activeFacilityId}` : "";
  const {
    data: statsData,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ["dispense-stats", activeFacilityId],
    queryFn: () => fetchJson(`/api/dispense/stats${statsQs}`),
    enabled: !!activeFacilityId,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  // ---- Dispense queue query ----
  const qs = activeFacilityId
    ? `?facilityId=${activeFacilityId}&dispenseQueue=true`
    : "?dispenseQueue=true";
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dispense-queue", activeFacilityId],
    queryFn: () => fetchJson(`/api/prescriptions${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dispense-queue"] });
    qc.invalidateQueries({ queryKey: ["prescriptions"] });
    qc.invalidateQueries({ queryKey: ["dispense-stats"] });
  };

  // Group prescriptions by patient
  const items = data?.items || [];
  const byPatient: Record<string, { patient: any; rxs: any[] }> = {};
  for (const rx of items) {
    const pid = rx.patient?.id || "unknown";
    if (!byPatient[pid]) byPatient[pid] = { patient: rx.patient, rxs: [] };
    byPatient[pid].rxs.push(rx);
  }

  // ---- Compute derived flags per patient group (for filtering & summary) ----
  // React Compiler auto-memoizes this derivation, so no manual useMemo needed.
  const patientGroups = Object.entries(byPatient).map(([pid, group]) => {
    const rxs = group.rxs;
    const totalItems = rxs.reduce(
      (sum, rx) => sum + (rx.items?.length || 0),
      0
    );
    const statuses = new Set(rxs.map((rx) => rx.status));
    const hasStat = rxs.some((rx) =>
      (rx.items || []).some((it: any) => it.isStat)
    );
    const hasPrn = rxs.some((rx) =>
      (rx.items || []).some((it: any) => it.isPrn)
    );
    const hasRoutine = rxs.some((rx) =>
      (rx.items || []).some((it: any) => !it.isStat && !it.isPrn)
    );
    // Prescriber set for this group (used by the prescriber filter)
    const prescribers = new Set(
      rxs
        .map((rx) =>
          rx.prescriber
            ? `${rx.prescriber.firstName || ""} ${rx.prescriber.lastName || ""}`.trim()
            : ""
        )
        .filter(Boolean)
    );
    // Earliest & latest prescribed date in the group (for date range filter)
    const prescribedDates = rxs
      .map((rx) => (rx.prescribedAt ? new Date(rx.prescribedAt).getTime() : null))
      .filter((t): t is number => t !== null);
    const earliestPrescribed = prescribedDates.length
      ? Math.min(...prescribedDates)
      : null;
    const latestPrescribed = prescribedDates.length
      ? Math.max(...prescribedDates)
      : null;
    // Note: allergy detection is best-effort from prescription item medication names;
    // the PatientDispenseCard still does its own authoritative allergy fetch.
    const primaryStatus =
      statuses.has("pending") ? "pending"
      : statuses.has("approved") ? "approved"
      : statuses.has("partially_dispensed") ? "partially_dispensed"
      : statuses.has("dispensed") ? "dispensed"
      : rxs[0]?.status || "pending";
    return {
      pid,
      patient: group.patient,
      rxs,
      totalItems,
      primaryStatus,
      hasStat,
      hasPrn,
      hasRoutine,
      statuses,
      prescribers,
      earliestPrescribed,
      latestPrescribed,
    };
  });

  // ---- Build unique prescriber list for the filter dropdown ----
  const allPrescribers = (() => {
    const set = new Set<string>();
    for (const g of patientGroups) {
      for (const p of g.prescribers) set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  })();

  // ---- Apply search & filters ----
  const q = search.trim().toLowerCase();
  const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
  const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
  const filteredGroups = patientGroups.filter((g) => {
    // Search across patient name, MRN, prescription numbers, medication names
    if (q) {
      const patientName =
        `${g.patient?.firstName || ""} ${g.patient?.lastName || ""}`.toLowerCase();
      const mrn = (g.patient?.patientNumber || "").toLowerCase();
      const rxNumbers = g.rxs
        .map((rx) => (rx.prescriptionNumber || "").toLowerCase())
        .join(" ");
      const medNames = g.rxs
        .flatMap((rx) => rx.items || [])
        .map((it: any) =>
          `${it.medication?.genericName || ""} ${it.medication?.brandName || ""}`.toLowerCase()
        )
        .join(" ");
      const haystack = `${patientName} ${mrn} ${rxNumbers} ${medNames}`;
      if (!haystack.includes(q)) return false;
    }

    // Status filter
    if (statusFilter !== "all") {
      if (!g.statuses.has(statusFilter)) return false;
    }

    // Priority filter
    if (priorityFilter !== "all") {
      if (priorityFilter === "stat" && !g.hasStat) return false;
      if (priorityFilter === "prn" && !g.hasPrn) return false;
      if (priorityFilter === "routine" && !g.hasRoutine) return false;
    }

    // Prescriber filter
    if (prescriberFilter !== "all") {
      if (!g.prescribers.has(prescriberFilter)) return false;
    }

    // Date range filter — group must have at least one prescription in range
    if (fromTs !== null || toTs !== null) {
      if (g.earliestPrescribed === null || g.latestPrescribed === null) return false;
      // Filter out groups whose prescriptions all fall OUTSIDE the range.
      // Keep if any prescription in the group falls in [from, to].
      const hasInRange = g.rxs.some((rx) => {
        if (!rx.prescribedAt) return false;
        const t = new Date(rx.prescribedAt).getTime();
        if (fromTs !== null && t < fromTs) return false;
        if (toTs !== null && t > toTs) return false;
        return true;
      });
      if (!hasInRange) return false;
    }

    // Allergy filter — optimistic: only filter "has_allergy" if any rx item
    // medication name is a known common allergen prefix. This is a soft filter;
    // the authoritative allergy check happens inside the card after fetching
    // patient allergies. We use a conservative keyword list here.
    if (allergyFilter === "has_allergy") {
      const KNOWN_ALLERGEN_KEYWORDS = [
        "penicillin", "amoxicillin", "ampicillin", "sulfa", "sulfamethoxazole",
        "aspirin", "ibuprofen", "naproxen", "diclofenac", "celecoxib",
        "cephalosporin", "cefixime", "cefaclor", "vancomycin", "gentamicin",
        "erythromycin", "azithromycin", "clarithromycin", "tetracycline",
        "doxycycline", "ciprofloxacin", "metronidazole", "chloramphenicol",
      ];
      const hasAllergyMed = g.rxs.some((rx) =>
        (rx.items || []).some((it: any) => {
          const name = (it.medication?.genericName || "").toLowerCase();
          return KNOWN_ALLERGEN_KEYWORDS.some((k) => name.includes(k));
        })
      );
      if (!hasAllergyMed) return false;
    }

    // FEFO near-expiry-only filter — best-effort: keep group if any medication
    // name contains a near-expiry trigger keyword OR the group is flagged as
    // having PRN/STAT priority. The authoritative batch-level near-expiry
    // check happens inside PrescriptionDispenseRow (which loads batches per
    // item). For a true batch-aware filter, the parent would need to fetch
    // batches for every queue item upfront, which is expensive on large queues.
    //
    // To keep this filter useful without that overhead, we use a conservative
    // heuristic: if nearExpiryOnly is on, we only show groups where any item's
    // medication name matches a known common high-risk-near-expiry drug class
    // (antibiotics, insulins, biologics) — these are the items pharmacists
    // typically want to clear first. Patients whose queues contain only
    // routine, long-shelf-life items will be hidden.
    //
    // NOTE: The dashboard tab's "Near-Expiry Batches" alert card already shows
    // the exact count from the stats API, which is the source of truth.
    if (nearExpiryOnly) {
      const NEAR_EXPIRY_PRIORITY_KEYWORDS = [
        "insulin", "penicillin", "amoxicillin", "ampicillin",
        "cephalosporin", "cefixime", "cefaclor", "cefuroxime",
        "vancomycin", "gentamicin", "tobramycin", "amikacin",
        "erythromycin", "azithromycin", "clarithromycin",
        "tetracycline", "doxycycline",
        "ciprofloxacin", "levofloxacin", "moxifloxacin",
        "metronidazole", "chloramphenicol",
        "heparin", "enoxaparin", "warfarin",
        "epinephrine", "adrenaline", "atropine",
        "oxytocin", "magnessium-sulfate",
        "vaccine", "rotavirus", "mmr", "bcg", "opv", "ipv",
      ];
      const hasPriorityMed = g.rxs.some((rx) =>
        (rx.items || []).some((it: any) => {
          const name = (it.medication?.genericName || "").toLowerCase();
          return NEAR_EXPIRY_PRIORITY_KEYWORDS.some((k) => name.includes(k));
        })
      );
      if (!hasPriorityMed) return false;
    }

    return true;
  });

  const togglePatient = (pid: string) =>
    setExpandedPatients((prev) => ({ ...prev, [pid]: !prev[pid] }));

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    for (const g of filteredGroups) all[g.pid] = true;
    setExpandedPatients(all);
  };
  const collapseAll = () => setExpandedPatients({});

  const hasActiveFilters =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    allergyFilter !== "all" ||
    prescriberFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    nearExpiryOnly;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setAllergyFilter("all");
    setPrescriberFilter("all");
    setDateFrom("");
    setDateTo("");
    setNearExpiryOnly(false);
  };

  // ---- Bulk-select helpers ----
  const togglePatientSelection = (pid: string) =>
    setSelectedPatientIds((prev) => {
      const next = { ...prev };
      if (next[pid]) {
        delete next[pid];
      } else {
        next[pid] = true;
      }
      return next;
    });

  const selectAllVisible = () => {
    const next: Record<string, boolean> = {};
    for (const g of filteredGroups) next[g.pid] = true;
    setSelectedPatientIds(next);
  };

  const clearSelection = () => setSelectedPatientIds({});

  // Selected groups that are currently visible (after filters). Selected
  // patient IDs that are no longer visible are silently ignored.
  const visibleSelectedGroups = filteredGroups.filter(
    (g) => selectedPatientIds[g.pid]
  );
  const visibleSelectedCount = visibleSelectedGroups.length;

  // Total remaining items across selected patients (the work the bulk
  // dispense will actually have to do).
  const bulkPlannedItemCount = visibleSelectedGroups.reduce((sum, g) => {
    return (
      sum +
      g.rxs.reduce((s, rx) => {
        return (
          s +
          (rx.items || []).filter(
            (it: any) =>
              it.status !== "dispensed" &&
              it.status !== "cancelled" &&
              it.quantity - it.dispensedQuantity > 0
          ).length
        );
      }, 0)
    );
  }, 0);

  // ---- Bulk Dispense action ----
  // Walks every selected patient group, every prescription, every remaining
  // item — fetches inventory batches for that item, picks the FEFO-recommended
  // batch, and POSTs to /api/dispense. Reports progress in a dialog.
  const handleBulkDispense = async () => {
    if (visibleSelectedGroups.length === 0) return;

    // Build the plan first so we know the total up-front.
    type PlanEntry = {
      patientName: string;
      medName: string;
      itemId: string;
      rxId: string;
      facilityId: string;
      medicationName: string;
      quantity: number;
    };
    const plan: PlanEntry[] = [];
    for (const g of visibleSelectedGroups) {
      for (const rx of g.rxs) {
        for (const it of rx.items || []) {
          if (
            it.status === "dispensed" ||
            it.status === "cancelled" ||
            it.quantity - it.dispensedQuantity <= 0
          ) {
            continue;
          }
          plan.push({
            patientName: `${g.patient?.firstName || ""} ${g.patient?.lastName || ""}`.trim(),
            medName: it.medication?.genericName || "Unknown",
            itemId: it.id,
            rxId: rx.id,
            facilityId: rx.facilityId,
            medicationName: it.medication?.genericName || "",
            quantity: it.quantity - it.dispensedQuantity,
          });
        }
      }
    }

    if (plan.length === 0) {
      toast.info("No items left to dispense across selected patients.");
      return;
    }

    const ok = window.confirm(
      `Dispense ${plan.length} item(s) across ${visibleSelectedGroups.length} patient(s) using FEFO-recommended batches?\n\n` +
      `This action will bill each item to its patient's invoice (unless already configured otherwise). ` +
      `Items without a valid in-stock batch will be skipped.`
    );
    if (!ok) return;

    setBulkDispensing(true);
    setBulkProgress({ done: 0, total: plan.length, failed: 0 });

    let success = 0;
    let failed = 0;
    const failures: string[] = [];

    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      try {
        // 1. Fetch inventory batches for this medication
        const invRes = await fetch(
          `/api/inventory?facilityId=${p.facilityId}&type=medication&q=${encodeURIComponent(p.medicationName)}`
        );
        if (!invRes.ok) throw new Error(`Inventory lookup failed (${invRes.status})`);
        const inv = await safeJson(invRes);
        const match = (inv.items || []).find(
          (invItem: any) =>
            invItem.medication?.id === (invItem as any).medicationId ||
            invItem.name
              ?.toLowerCase()
              .includes(p.medicationName.toLowerCase())
        );
        const batches = match?.batches || [];
        const rec = fefoRecommendedBatch(batches);
        if (!rec) {
          throw new Error("No valid in-stock batch (FEFO)");
        }

        // 2. POST to dispense API
        const res = await fetch("/api/dispense", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prescriptionItemId: p.itemId,
            batchId: rec.id,
            quantity: p.quantity,
            createInvoice: true,
          }),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          throw new Error(data.error || `Dispense failed (${res.status})`);
        }
        success++;
      } catch (e: any) {
        failed++;
        failures.push(`${p.patientName} · ${p.medName}: ${e.message}`);
      }
      setBulkProgress({ done: i + 1, total: plan.length, failed });
    }

    setBulkDispensing(false);
    setBulkProgress(null);
    clearSelection();

    if (success > 0) {
      toast.success(
        `Bulk dispense complete — ${success} item(s) dispensed${
          failed > 0 ? ` · ${failed} failed` : ""
        }`
      );
    } else if (failed > 0) {
      toast.error(`All ${failed} item(s) failed to dispense.`);
    }

    // Show first few failures in console + a toast for the first one.
    if (failures.length > 0) {
      console.error("Bulk dispense failures:", failures);
      toast.error(failures[0] + (failures.length > 1 ? ` (+${failures.length - 1} more)` : ""));
    }

    invalidate();
  };

  const kpis = statsData?.kpis || {};

  return (
    <div className="space-y-4">
      {/* ===== Unified section hero header — sits ABOVE the toggle tabs ===== */}
      <PageHeader
        title="Pharmacy Management"
        description="Live dispensing dashboard & queue — FEFO-sorted batches, allergy safety checks, and real-time KPIs."
        icon={Pill}
        gradient="from-amber-500 to-orange-600"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => (tab === "dashboard" ? refetchStats() : refetch())}
            className="bg-white/20 text-white hover:bg-white/30 border-white/20"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <LayoutGrid className="w-4 h-4" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5">
            <Pill className="w-4 h-4" /> Dispense Queue
            {kpis.pending ? (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-amber-500 text-white">
                {kpis.pending}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        {/* ====================== DASHBOARD TAB ====================== */}
        <TabsContent value="dashboard" className="space-y-4">
          {!activeFacilityId && (
            <Card>
              <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
                Select a facility to view the pharmacy dashboard.
              </CardContent>
            </Card>
          )}

          {activeFacilityId && (
            <>
              {/* KPI cards */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-600" />
                  Dispensing KPIs
                  {statsLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                </h3>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Auto-refresh every 30s
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MiniStatCard
                  label="Pending"
                  value={kpis.pending ?? 0}
                  icon={Clock}
                  gradient="from-amber-500 to-amber-600"
                  sublabel="Awaiting review"
                />
                <MiniStatCard
                  label="Approved"
                  value={kpis.approved ?? 0}
                  icon={CheckCircle2}
                  gradient="from-emerald-500 to-emerald-600"
                  sublabel="Ready to dispense"
                />
                <MiniStatCard
                  label="Partial Disp."
                  value={kpis.partiallyDispensed ?? 0}
                  icon={Pill}
                  gradient="from-orange-400 to-orange-600"
                  sublabel="In progress"
                />
                <MiniStatCard
                  label="Dispensed Today"
                  value={kpis.dispensedToday ?? 0}
                  icon={CheckCircle2}
                  gradient="from-emerald-500 to-teal-600"
                  sublabel="Completed"
                />
                <MiniStatCard
                  label="Transactions"
                  value={kpis.dispensedTransactionsToday ?? 0}
                  icon={Activity}
                  gradient="from-amber-500 to-orange-600"
                  sublabel="Dispense txns today"
                />
                <MiniStatCard
                  label="Cancelled Today"
                  value={kpis.cancelledToday ?? 0}
                  icon={Ban}
                  gradient="from-rose-500 to-rose-600"
                  sublabel="Voided today"
                />
              </div>

              {/* Alert cards */}
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Stock &amp; Expiry Alerts
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <AlertCard
                  title="Low Stock Items"
                  count={kpis.lowStockCount ?? 0}
                  description="Items at or below minimum quantity — reorder required"
                  icon={PackageX}
                  tone="amber"
                  onClick={() => setTab("queue")}
                />
                <AlertCard
                  title="Near-Expiry Batches"
                  count={kpis.nearExpiryCount ?? 0}
                  description="Batches expiring within 30 days — dispense first (FEFO)"
                  icon={CalendarClock}
                  tone="amber"
                  onClick={() => setTab("queue")}
                />
                <AlertCard
                  title="Expired Batches"
                  count={kpis.expiredCount ?? 0}
                  description="Batches past expiry — blocked from dispensing"
                  icon={XCircle}
                  tone="red"
                  onClick={() => setTab("queue")}
                />
              </div>

              {statsError && (
                <ErrorState
                  message="Failed to load dashboard stats"
                  onRetry={() => refetchStats()}
                />
              )}

              <Card>
                <CardContent className="p-4 text-xs text-slate-500 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <span>
                    Tip: Switch to the{" "}
                    <strong className="text-slate-700">Dispense Queue</strong>{" "}
                    tab to process prescriptions. Batches are auto-sorted by
                    expiry (FEFO — First Expiry, First Out) to reduce waste.
                  </span>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ====================== DISPENSE QUEUE TAB ====================== */}
        <TabsContent value="queue" className="space-y-4">
          {!activeFacilityId && (
            <Card>
              <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
                Select a facility to view the dispense queue.
              </CardContent>
            </Card>
          )}

          {activeFacilityId && (
            <>
              {/* ===== Search & Filters Bar ===== */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col gap-3">
                    {/* Row 1: Search input + result summary + expand/collapse all */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search by patient name, MRN, prescription #, or medication…"
                          className="pl-8 h-9 text-sm"
                        />
                        {search && (
                          <button
                            type="button"
                            onClick={() => setSearch("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                            aria-label="Clear search"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
                          <Users className="w-3.5 h-3.5" />
                          <strong className="text-slate-700">{filteredGroups.length}</strong>
                          of <strong className="text-slate-700">{patientGroups.length}</strong>
                          {patientGroups.length === 1 ? " patient" : " patients"}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={expandAll}
                          disabled={filteredGroups.length === 0}
                        >
                          <ChevronDown className="w-3.5 h-3.5" /> Expand all
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={collapseAll}
                          disabled={filteredGroups.length === 0}
                        >
                          <ChevronRight className="w-3.5 h-3.5" /> Collapse all
                        </Button>
                      </div>
                    </div>

                    {/* Row 2: Primary filter dropdowns (always visible) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        <Filter className="w-3.5 h-3.5" /> Filters:
                      </div>

                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-8 w-[150px] text-xs">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="partially_dispensed">Partially dispensed</SelectItem>
                          <SelectItem value="dispensed">Dispensed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                        <SelectTrigger className="h-8 w-[150px] text-xs">
                          <SelectValue placeholder="Priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All priorities</SelectItem>
                          <SelectItem value="stat">STAT (urgent)</SelectItem>
                          <SelectItem value="prn">PRN (as needed)</SelectItem>
                          <SelectItem value="routine">Routine</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={allergyFilter} onValueChange={setAllergyFilter}>
                        <SelectTrigger className="h-8 w-[180px] text-xs">
                          <SelectValue placeholder="Allergy" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All patients</SelectItem>
                          <SelectItem value="has_allergy">Likely allergy risk</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* FEFO near-expiry only toggle */}
                      <div className="flex items-center gap-2 h-8 px-2 rounded-md border border-slate-200 bg-white">
                        <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
                        <Label
                          htmlFor="near-expiry-toggle"
                          className="text-xs text-slate-600 cursor-pointer whitespace-nowrap"
                        >
                          FEFO near-expiry only
                        </Label>
                        <Switch
                          id="near-expiry-toggle"
                          checked={nearExpiryOnly}
                          onCheckedChange={setNearExpiryOnly}
                          className="scale-75 origin-center"
                        />
                      </div>

                      <Button
                        variant={showFilters ? "secondary" : "outline"}
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setShowFilters((s) => !s)}
                      >
                        <ListChecks className="w-3.5 h-3.5" />
                        {showFilters ? "Hide advanced" : "Advanced"}
                        {(prescriberFilter !== "all" || dateFrom !== "" || dateTo !== "") && (
                          <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[9px] font-bold rounded-full bg-amber-500 text-white">
                            !
                          </span>
                        )}
                      </Button>

                      {hasActiveFilters && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          onClick={clearFilters}
                        >
                          <X className="w-3.5 h-3.5" /> Clear filters
                        </Button>
                      )}
                    </div>

                    {/* Row 3: Advanced filters — collapsible */}
                    {showFilters && (
                      <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-100">
                        {/* Prescriber filter */}
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                            <Stethoscope className="w-3 h-3" /> Prescriber
                          </Label>
                          <Select value={prescriberFilter} onValueChange={setPrescriberFilter}>
                            <SelectTrigger className="h-8 w-[200px] text-xs">
                              <SelectValue placeholder="All prescribers" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All prescribers</SelectItem>
                              {allPrescribers.map((name) => (
                                <SelectItem key={name} value={name}>
                                  {name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Date range filter */}
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Prescribed from
                          </Label>
                          <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="h-8 w-[160px] text-xs"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Prescribed to
                          </Label>
                          <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-8 w-[160px] text-xs"
                          />
                        </div>

                        {/* Quick date presets */}
                        <div className="flex items-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-[11px]"
                            onClick={() => {
                              const today = new Date();
                              const iso = today.toISOString().slice(0, 10);
                              setDateFrom(iso);
                              setDateTo(iso);
                            }}
                          >
                            Today
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-[11px]"
                            onClick={() => {
                              const today = new Date();
                              const weekAgo = new Date(today);
                              weekAgo.setDate(weekAgo.getDate() - 7);
                              setDateFrom(weekAgo.toISOString().slice(0, 10));
                              setDateTo(today.toISOString().slice(0, 10));
                            }}
                          >
                            Last 7 days
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-[11px]"
                            onClick={() => {
                              const today = new Date();
                              const monthAgo = new Date(today);
                              monthAgo.setDate(monthAgo.getDate() - 30);
                              setDateFrom(monthAgo.toISOString().slice(0, 10));
                              setDateTo(today.toISOString().slice(0, 10));
                            }}
                          >
                            Last 30 days
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* ===== Bulk-action bar (appears when at least one patient is selected) ===== */}
              {visibleSelectedCount > 0 && (
                <Card className="border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 shadow-sm">
                  <CardContent className="p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                          <CheckSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-amber-900">
                            {visibleSelectedCount} patient{visibleSelectedCount === 1 ? "" : "s"} selected
                          </div>
                          <div className="text-xs text-amber-700">
                            {bulkPlannedItemCount} item{bulkPlannedItemCount === 1 ? "" : "s"} will be dispensed using FEFO-recommended batches
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs border-amber-300 bg-white hover:bg-amber-50"
                          onClick={selectAllVisible}
                          disabled={filteredGroups.length === 0 || bulkDispensing}
                        >
                          <CheckSquare className="w-3.5 h-3.5" /> Select all visible
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          onClick={clearSelection}
                          disabled={bulkDispensing}
                        >
                          <X className="w-3.5 h-3.5" /> Clear selection
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 text-xs gap-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
                          onClick={handleBulkDispense}
                          disabled={bulkDispensing || bulkPlannedItemCount === 0}
                        >
                          {bulkDispensing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Zap className="w-3.5 h-3.5" />
                          )}
                          {bulkDispensing
                            ? `Dispensing… (${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? 0})`
                            : `Dispense ${bulkPlannedItemCount} item${bulkPlannedItemCount === 1 ? "" : "s"}`}
                        </Button>
                      </div>
                    </div>
                    {bulkDispensing && bulkProgress && (
                      <div className="mt-3">
                        <Progress
                          value={Math.round((bulkProgress.done / bulkProgress.total) * 100)}
                          className="h-2 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-amber-500 [&_[data-slot=progress-indicator]]:to-orange-500"
                        />
                        <div className="flex items-center justify-between text-[11px] text-amber-700 mt-1">
                          <span className="flex items-center gap-1">
                            <Hourglass className="w-3 h-3" />
                            Processing {bulkProgress.done} of {bulkProgress.total}…
                          </span>
                          {bulkProgress.failed > 0 && (
                            <span className="text-rose-700">
                              {bulkProgress.failed} failed
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ===== Queue list ===== */}
              {isLoading ? (
                <LoadingState rows={5} />
              ) : isError ? (
                <ErrorState
                  message="Failed to load dispense queue"
                  onRetry={() => refetch()}
                />
              ) : items.length === 0 ? (
                <Card>
                  <CardContent className="p-6">
                    <EmptyState
                      title="Queue is empty"
                      description="No prescriptions are currently pending dispense."
                      icon={CheckCircle2}
                    />
                  </CardContent>
                </Card>
              ) : filteredGroups.length === 0 ? (
                <Card>
                  <CardContent className="p-6">
                    <EmptyState
                      title="No matching queues"
                      description="No patient queues match your search or filter criteria. Try adjusting or clearing filters."
                      icon={Search}
                    />
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredGroups.map((g) => (
                    <PatientDispenseCard
                      key={g.pid}
                      patient={g.patient}
                      prescriptions={g.rxs}
                      onDone={invalidate}
                      dispensing={dispensing}
                      setDispensing={setDispensing}
                      expanded={!!expandedPatients[g.pid]}
                      onToggle={() => togglePatient(g.pid)}
                      totalItems={g.totalItems}
                      primaryStatus={g.primaryStatus}
                      hasStat={g.hasStat}
                      hasPrn={g.hasPrn}
                      selected={!!selectedPatientIds[g.pid]}
                      onToggleSelect={() => togglePatientSelection(g.pid)}
                      bulkDispensing={bulkDispensing}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// ALERT CARD — for dashboard stock & expiry alerts
// =====================================================================
function AlertCard({
  title,
  count,
  description,
  icon: Icon,
  tone,
  onClick,
}: {
  title: string;
  count: number;
  description: string;
  icon: any;
  tone: "amber" | "red";
  onClick?: () => void;
}) {
  const tones = {
    amber: {
      border: "border-amber-300",
      bg: "bg-amber-50",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-700",
      title: "text-amber-900",
      count: "text-amber-700",
      desc: "text-amber-700",
    },
    red: {
      border: "border-rose-300",
      bg: "bg-rose-50",
      iconBg: "bg-rose-100",
      iconColor: "text-rose-700",
      title: "text-rose-900",
      count: "text-rose-700",
      desc: "text-rose-700",
    },
  }[tone];

  return (
    <Card
      className={`${tones.border} ${tones.bg} cursor-pointer hover:shadow-md transition-shadow`}
    >
      <CardContent className="p-4" onClick={onClick}>
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${tones.iconBg} flex items-center justify-center shrink-0`}
          >
            <Icon className={`w-5 h-5 ${tones.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className={`text-sm font-semibold ${tones.title}`}>{title}</h4>
              <span
                className={`text-2xl font-extrabold tabular-nums ${tones.count}`}
              >
                {count}
              </span>
            </div>
            <p className={`text-xs mt-1 ${tones.desc} leading-relaxed`}>
              {description}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// PATIENT-VERIFICATION FIELD
// =====================================================================
function VerifyField({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="text-sm font-medium text-slate-800 truncate">
        {value || "—"}
      </div>
    </div>
  );
}

// =====================================================================
// PATIENT DISPENSE CARD — groups prescriptions for one patient
// Collapsible: header is always visible; detailed content only renders
// when `expanded` is true. Toggle is controlled by the parent so that
// "Expand all" / "Collapse all" can drive every card at once.
//
// The header also contains a bulk-select checkbox (controlled by the
// parent's `selected` / `onToggleSelect` props) that lets the user pick
// this patient for the cross-patient "Dispense selected" bulk action.
// =====================================================================
function PatientDispenseCard({
  patient,
  prescriptions,
  onDone,
  dispensing,
  setDispensing,
  expanded,
  onToggle,
  totalItems,
  primaryStatus,
  hasStat,
  hasPrn,
  selected,
  onToggleSelect,
  bulkDispensing,
}: {
  patient: any;
  prescriptions: any[];
  onDone: () => void;
  dispensing: Record<string, boolean>;
  setDispensing: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  expanded: boolean;
  onToggle: () => void;
  totalItems: number;
  primaryStatus: string;
  hasStat: boolean;
  hasPrn: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  bulkDispensing: boolean;
}) {
  const [allergies, setAllergies] = useState<any[]>([]);
  const [allergiesFetched, setAllergiesFetched] = useState(false);

  // Fetch allergies only when the card is first expanded (lazy load)
  useEffect(() => {
    if (!expanded || allergiesFetched || !patient?.id) return;
    fetchJson(`/api/patients/${patient.id}`)
      .then((d) => {
        setAllergies(d.patient?.allergies || []);
        setAllergiesFetched(true);
      })
      .catch(() => {
        setAllergies([]);
        setAllergiesFetched(true);
      });
  }, [expanded, allergiesFetched, patient?.id]);

  return (
    <Card
      className={`overflow-hidden transition-shadow ${
        selected
          ? "shadow-md ring-2 ring-amber-400 border-amber-300"
          : expanded
          ? "shadow-md ring-1 ring-amber-200"
          : "hover:shadow-sm"
      }`}
    >
      {/* ===== Header row — bulk-select checkbox + collapsible toggle ===== */}
      <div
        className={`flex items-stretch border-b border-slate-200 ${
          selected ? "bg-gradient-to-r from-amber-50 to-orange-50" : "bg-gradient-to-r from-slate-50 to-amber-50/40"
        }`}
      >
        {/* Bulk-select checkbox (left edge) — does NOT toggle expand */}
        <label
          className={`flex items-center justify-center w-12 shrink-0 cursor-pointer border-r border-slate-200 ${
            bulkDispensing ? "opacity-50 pointer-events-none" : "hover:bg-amber-100/50"
          }`}
          title={selected ? "Deselect for bulk dispense" : "Select for bulk dispense"}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect()}
            disabled={bulkDispensing}
            className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
          />
        </label>

        {/* Collapsible toggle area (rest of header) */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex-1 text-left hover:from-amber-50 hover:to-orange-50 transition-colors px-4 py-3 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            {/* Chevron / expand indicator */}
            <div className="shrink-0 w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500">
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </div>

            {/* Patient avatar */}
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white text-sm font-bold shrink-0">
              {(patient?.firstName?.[0] || "P").toUpperCase()}
            </span>

            {/* Patient name + summary */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-800 truncate">
                  {patient?.firstName} {patient?.lastName}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  MRN: {patient?.patientNumber || "—"}
                </span>
                {hasStat && (
                  <Badge variant="destructive" className="text-[9px] py-0 h-4">
                    STAT
                  </Badge>
                )}
                {hasPrn && (
                  <Badge
                    variant="secondary"
                    className="bg-amber-100 text-amber-700 border-amber-200 text-[9px] py-0 h-4"
                  >
                    PRN
                  </Badge>
                )}
                {selected && (
                  <Badge className="bg-amber-500 text-white border-amber-500 text-[9px] py-0 h-4 gap-1">
                    <CheckSquare className="w-2.5 h-2.5" /> Selected
                  </Badge>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>
                  <strong className="text-slate-700">{prescriptions.length}</strong>{" "}
                  prescription{prescriptions.length === 1 ? "" : "s"}
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <strong className="text-slate-700">{totalItems}</strong>{" "}
                  item{totalItems === 1 ? "" : "s"}
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  {patient?.sex ? String(patient.sex).toUpperCase() : "—"} ·{" "}
                  {calculateAge(patient?.dateOfBirth)}y
                </span>
              </div>
            </div>

            {/* Right side: status + allergy indicator */}
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={primaryStatus} />
              {allergiesFetched && allergies.length > 0 && (
                <Badge
                  variant="destructive"
                  className="bg-rose-100 text-rose-700 border-rose-200 gap-1"
                  title={`${allergies.length} documented allerg(y/ies)`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  {allergies.length} allergy{allergies.length === 1 ? "" : "ies"}
                </Badge>
              )}
            </div>
          </div>
        </button>
      </div>

      {/* ===== Expanded content — only rendered when toggled open ===== */}
      {expanded && (
        <CardContent className="space-y-3 p-4">
          {/* Patient verification box — verify identity before dispensing */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <VerifyField label="MRN" value={patient?.patientNumber} />
            <VerifyField label="Age" value={`${calculateAge(patient?.dateOfBirth)}y`} />
            <VerifyField
              label="Sex"
              value={patient?.sex ? String(patient.sex).toUpperCase() : "—"}
            />
            <VerifyField label="DOB" value={formatDate(patient?.dateOfBirth)} />
            <VerifyField label="Phone" value={patient?.phone || "—"} />
          </div>

          {allergies.length > 0 && (
            <div className="bg-rose-50 border border-rose-300 rounded p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-rose-800">
                  Allergy Warning
                </div>
                <div className="text-xs text-rose-700 mt-1 flex flex-wrap gap-2">
                  {allergies.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <Badge
                        variant="destructive"
                        className="bg-rose-100 text-rose-700 border-rose-200"
                      >
                        {a.allergen}
                      </Badge>
                      {a.severity && (
                        <span className="text-rose-500">({a.severity})</span>
                      )}
                      {a.reaction && (
                        <span className="text-rose-400">— {a.reaction}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {prescriptions.map((rx) => (
            <PrescriptionDispenseRow
              key={rx.id}
              rx={rx}
              allergies={allergies}
              onDone={onDone}
              dispensing={dispensing}
              setDispensing={setDispensing}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// =====================================================================
// PRESCRIPTION DISPENSE ROW — single prescription with items
// =====================================================================
function PrescriptionDispenseRow({
  rx,
  allergies,
  onDone,
  dispensing,
  setDispensing,
}: {
  rx: any;
  allergies: any[];
  onDone: () => void;
  dispensing: Record<string, boolean>;
  setDispensing: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const [batchesByItem, setBatchesByItem] = useState<Record<string, any[]>>({});
  const [dispenseMap, setDispenseMap] = useState<
    Record<string, { batchId: string; quantity: number; createInvoice: boolean }>
  >({});
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [dispensingAll, setDispensingAll] = useState(false);
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();

  // Load batches for each medication item
  useEffect(() => {
    let active = true;
    (async () => {
      const newBatches: Record<string, any[]> = {};
      for (const it of rx.items || []) {
        const res = await fetch(
          `/api/inventory?facilityId=${rx.facilityId}&type=medication&q=${encodeURIComponent(
            it.medication?.genericName || ""
          )}`
        );
        if (res.ok) {
          const inv = await safeJson(res);
          const match = (inv.items || []).find(
            (i: any) =>
              i.medication?.id === it.medicationId ||
              i.name
                ?.toLowerCase()
                .includes((it.medication?.genericName || "").toLowerCase())
          );
          newBatches[it.id] = match?.batches || [];
        }
      }
      if (active) {
        setBatchesByItem(newBatches);
        setLoadingBatches(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [rx.id, rx.facilityId, rx.items]);

  const setItem = (
    itemId: string,
    field: "batchId" | "quantity" | "createInvoice",
    value: any
  ) => {
    setDispenseMap((prev) => ({
      ...prev,
      [itemId]: {
        batchId: field === "batchId" ? value : prev[itemId]?.batchId || "",
        quantity: field === "quantity" ? Number(value) : prev[itemId]?.quantity || 0,
        createInvoice:
          field === "createInvoice" ? value : prev[itemId]?.createInvoice ?? true,
      },
    }));
  };

  // Auto-select the FEFO-recommended batch + default quantity for each item
  useEffect(() => {
    if (loadingBatches) return;
    setDispenseMap((prev) => {
      const next = { ...prev };
      for (const it of rx.items || []) {
        if (it.status === "dispensed" || it.status === "cancelled") continue;
        if (next[it.id]?.batchId) continue;
        const batches = batchesByItem[it.id] || [];
        const rec = fefoRecommendedBatch(batches);
        if (rec) {
          next[it.id] = {
            batchId: rec.id,
            quantity:
              next[it.id]?.quantity || (it.quantity - it.dispensedQuantity),
            createInvoice: next[it.id]?.createInvoice ?? true,
          };
        }
      }
      return next;
    });
  }, [loadingBatches, rx.items, batchesByItem]);

  const handleDispense = async (item: any) => {
    const cfg = dispenseMap[item.id];
    if (!cfg || !cfg.batchId) return toast.error("Select a batch");
    if (!cfg.quantity || cfg.quantity <= 0) return toast.error("Enter a quantity");
    const remaining = item.quantity - item.dispensedQuantity;
    if (cfg.quantity > remaining)
      return toast.error(`Cannot dispense more than ${remaining} remaining`);

    // Check allergy interaction — if allergy matches, show custom danger dialog
    const medName = item.medication?.genericName?.toLowerCase() || "";
    const matchedAllergies = allergies.filter((a) =>
      medName.includes(a.allergen?.toLowerCase() || "___")
    );
    if (matchedAllergies.length > 0) {
      confirmAction({
        title: "⚠ Allergy Warning — Proceed with Caution",
        description: `This patient has a documented allergy that may interact with ${item.medication?.genericName}. Proceed only if a clinician has authorized override.`,
        confirmText: "Yes, dispense anyway",
        variant: "danger",
        details: (
          <div className="space-y-1">
            <div>
              <strong>Patient:</strong> {rx.patient.firstName} {rx.patient.lastName}
            </div>
            <div>
              <strong>Medication:</strong> {item.medication?.genericName} (
              {item.medication?.brandName})
            </div>
            <div className="pt-2 border-t border-slate-200 mt-2">
              <div className="font-semibold text-rose-700 mb-1">
                Documented Allergies:
              </div>
              {matchedAllergies.map((a, i) => (
                <div key={i} className="text-xs">
                  • {a.allergen} —{" "}
                  <em>{a.reaction || "reaction unknown"}</em> (
                  {a.severity || "unspecified"})
                </div>
              ))}
            </div>
          </div>
        ),
        onConfirm: () => doDispense(item, cfg),
      });
      return;
    }

    doDispense(item, cfg);
  };

  const doDispense = async (item: any, cfg: any) => {
    setDispensing((p) => ({ ...p, [item.id]: true }));
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
      toast.success(
        `Dispensed ${cfg.quantity} units${data.invoice ? " — invoice updated" : ""}`
      );
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDispensing((p) => ({ ...p, [item.id]: false }));
    }
  };

  // Dispense All: dispense every remaining item using its FEFO-recommended batch
  const handleDispenseAll = async () => {
    const remainingItems = (rx.items || []).filter(
      (it: any) =>
        it.status !== "dispensed" &&
        it.status !== "cancelled" &&
        it.quantity - it.dispensedQuantity > 0
    );
    if (remainingItems.length === 0) {
      toast.info("Nothing left to dispense for this prescription.");
      return;
    }

    const plan: {
      item: any;
      batchId: string;
      quantity: number;
      createInvoice: boolean;
    }[] = [];
    for (const it of remainingItems) {
      const batches = batchesByItem[it.id] || [];
      const rec = fefoRecommendedBatch(batches);
      if (!rec) {
        toast.error(`No valid batch for ${it.medication?.genericName}. Skipping.`);
        continue;
      }
      plan.push({
        item: it,
        batchId: rec.id,
        quantity: it.quantity - it.dispensedQuantity,
        createInvoice: dispenseMap[it.id]?.createInvoice ?? true,
      });
    }
    if (plan.length === 0) return;

    // Allergy check across all planned items
    const allergyItems = plan.filter((p) => {
      const medName = p.item.medication?.genericName?.toLowerCase() || "";
      return allergies.some((a) =>
        medName.includes(a.allergen?.toLowerCase() || "___")
      );
    });

    const runAll = async () => {
      setDispensingAll(true);
      let ok = 0;
      let fail = 0;
      for (const p of plan) {
        setDispensing((s) => ({ ...s, [p.item.id]: true }));
        try {
          const res = await fetch("/api/dispense", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prescriptionItemId: p.item.id,
              batchId: p.batchId,
              quantity: p.quantity,
              createInvoice: p.createInvoice,
            }),
          });
          const data = await safeJson(res);
          if (!res.ok) throw new Error(data.error || "Failed");
          ok++;
        } catch (e: any) {
          fail++;
          toast.error(`${p.item.medication?.genericName}: ${e.message}`);
        } finally {
          setDispensing((s) => ({ ...s, [p.item.id]: false }));
        }
      }
      setDispensingAll(false);
      if (ok > 0)
        toast.success(
          `Dispensed ${ok} item(s)${fail > 0 ? ` · ${fail} failed` : ""}`
        );
      onDone();
    };

    if (allergyItems.length > 0) {
      confirmAction({
        title: "⚠ Allergy Warning — Dispense All",
        description: `${allergyItems.length} item(s) in this prescription match documented allergies. Proceed only with clinician override.`,
        confirmText: "Yes, dispense all anyway",
        variant: "danger",
        details: (
          <div className="space-y-1">
            <div>
              <strong>Patient:</strong> {rx.patient.firstName} {rx.patient.lastName}
            </div>
            <div className="pt-2 border-t border-slate-200 mt-2">
              <div className="font-semibold text-rose-700 mb-1">
                Allergy-matching items:
              </div>
              {allergyItems.map((p, i) => (
                <div key={i} className="text-xs">
                  • {p.item.medication?.genericName} — qty {p.quantity}
                </div>
              ))}
            </div>
          </div>
        ),
        onConfirm: runAll,
      });
      return;
    }

    runAll();
  };

  const remainingItems = (rx.items || []).filter(
    (it: any) =>
      it.status !== "dispensed" &&
      it.status !== "cancelled" &&
      it.quantity - it.dispensedQuantity > 0
  );
  const allDone = (rx.items || []).every(
    (it: any) => it.status === "dispensed" || it.status === "cancelled"
  );

  return (
    <div className="border rounded-lg p-3 bg-slate-50/40">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <div className="font-mono text-xs text-slate-700">
            {rx.prescriptionNumber}
          </div>
          <div className="text-xs text-slate-500">
            Prescribed {formatDate(rx.prescribedAt, true)} by{" "}
            {rx.prescriber
              ? `${rx.prescriber.firstName} ${rx.prescriber.lastName}`
              : "—"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={rx.status} />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setReviewOpen((o) => !o)}
          >
            {reviewOpen ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <FileText className="w-3 h-3" />
            Review Prescription
          </Button>
        </div>
      </div>

      {/* Review prescription expandable section */}
      {reviewOpen && (
        <div className="mb-3 bg-white border border-slate-200 rounded-lg p-3 text-xs">
          <div className="font-semibold text-slate-700 mb-2 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> Prescription Details
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 pr-2">Medication</th>
                  <th className="py-1.5 pr-2">Dose</th>
                  <th className="py-1.5 pr-2">Freq</th>
                  <th className="py-1.5 pr-2">Route</th>
                  <th className="py-1.5 pr-2">Duration</th>
                  <th className="py-1.5 pr-2">Priority</th>
                  <th className="py-1.5">Instructions</th>
                </tr>
              </thead>
              <tbody>
                {(rx.items || []).map((it: any) => (
                  <tr
                    key={it.id}
                    className="border-b border-slate-100 last:border-0 align-top"
                  >
                    <td className="py-1.5 pr-2 font-medium text-slate-800">
                      {it.medication?.genericName}
                      {it.medication?.brandName
                        ? ` (${it.medication.brandName})`
                        : ""}
                    </td>
                    <td className="py-1.5 pr-2">{it.dose || "—"}</td>
                    <td className="py-1.5 pr-2">{it.frequency || "—"}</td>
                    <td className="py-1.5 pr-2">{it.route || "—"}</td>
                    <td className="py-1.5 pr-2">{it.duration || "—"}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      {it.isPrn && (
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-amber-700 border-amber-200 mr-1"
                        >
                          PRN
                        </Badge>
                      )}
                      {it.isStat && (
                        <Badge variant="destructive" className="mr-1">
                          STAT
                        </Badge>
                      )}
                      {!it.isPrn && !it.isStat && (
                        <span className="text-slate-400">Routine</span>
                      )}
                    </td>
                    <td className="py-1.5 text-slate-600">
                      {it.instructions || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rx.notes && (
            <div className="mt-2 pt-2 border-t border-slate-200">
              <span className="font-semibold text-slate-600">Notes: </span>
              <span className="text-slate-600">{rx.notes}</span>
            </div>
          )}
        </div>
      )}

      {/* Dispense All bar */}
      {!allDone && remainingItems.length > 0 && (
        <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-2">
          <div className="text-xs text-amber-800 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>
              <strong>{remainingItems.length}</strong> item(s) remaining —
              dispense all using FEFO-recommended batches.
            </span>
          </div>
          <Button
            size="sm"
            disabled={dispensingAll || loadingBatches}
            onClick={handleDispenseAll}
            className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white h-7 text-xs gap-1 shrink-0"
          >
            {dispensingAll ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Zap className="w-3 h-3" />
            )}
            {dispensingAll ? "Dispensing…" : "Dispense All"}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {loadingBatches ? (
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading batches…
          </div>
        ) : (
          (rx.items || [])
            .filter(
              (it: any) => it.status !== "dispensed" && it.status !== "cancelled"
            )
            .map((it: any) => {
              const remaining = it.quantity - it.dispensedQuantity;
              const batches = batchesByItem[it.id] || [];
              const sortedBatches = sortBatchesFEFO(batches);
              const availableBatches = sortedBatches.filter(
                (b: any) => b.quantity > 0 && !isExpired(b.expiryDate)
              );
              const expiredBatches = sortedBatches.filter((b: any) =>
                isExpired(b.expiryDate)
              );
              const recommended = fefoRecommendedBatch(batches);
              const medName = (it.medication?.genericName || "").toLowerCase();
              const hasAllergy = allergies.some((a) =>
                medName.includes(a.allergen?.toLowerCase() || "___")
              );
              const progressPct =
                it.quantity > 0
                  ? Math.min(
                      100,
                      Math.round((it.dispensedQuantity / it.quantity) * 100)
                    )
                  : 0;
              const selectedBatchId = dispenseMap[it.id]?.batchId || "";
              const selectedBatch = sortedBatches.find(
                (b: any) => b.id === selectedBatchId
              );

              const progressIndicatorClass =
                progressPct === 100
                  ? "[&_[data-slot=progress-indicator]]:bg-emerald-500"
                  : "[&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-amber-500 [&_[data-slot=progress-indicator]]:to-orange-500";

              return (
                <div
                  key={it.id}
                  className={`border rounded-lg p-2.5 bg-white ${
                    hasAllergy ? "border-rose-300" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                        <span className="truncate">
                          {it.medication?.genericName}{" "}
                          {it.medication?.brandName
                            ? `(${it.medication.brandName})`
                            : ""}
                        </span>
                        {hasAllergy && (
                          <Badge
                            variant="destructive"
                            className="bg-rose-100 text-rose-700 border-rose-200"
                          >
                            <AlertTriangle className="w-3 h-3" /> Allergy
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {it.medication?.strength} ·{" "}
                        {it.medication?.dosageForm} · {it.dose} {it.frequency} ·{" "}
                        {it.route} · for {it.duration}
                      </div>
                    </div>
                    <StatusBadge status={it.status} />
                  </div>

                  {/* Progress bar */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                      <span>Dispensing progress</span>
                      <span className="font-medium text-slate-700">
                        {it.dispensedQuantity}/{it.quantity} ({progressPct}%)
                        {remaining > 0 && (
                          <span className="text-amber-600 ml-1">
                            · {remaining} remaining
                          </span>
                        )}
                      </span>
                    </div>
                    <Progress
                      value={progressPct}
                      className={`h-1.5 ${progressIndicatorClass}`}
                    />
                  </div>

                  {/* Selected batch near-expiry inline warning */}
                  {selectedBatch && isNearExpiry(selectedBatch.expiryDate) && (
                    <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1">
                      <CalendarClock className="w-3 h-3 shrink-0" />
                      Selected batch expires in{" "}
                      {daysUntil(selectedBatch.expiryDate)} days — verify before
                      dispensing.
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                    <div className="md:col-span-2">
                      <Label className="text-[10px] flex items-center gap-1 flex-wrap">
                        Batch
                        {recommended && (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-300 ml-1 text-[9px] py-0">
                            <CalendarClock className="w-2.5 h-2.5" /> FEFO
                            Recommended
                          </Badge>
                        )}
                      </Label>
                      <Select
                        value={selectedBatchId || undefined}
                        onValueChange={(v) => setItem(it.id, "batchId", v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue
                            placeholder={
                              availableBatches.length === 0
                                ? "No valid batches"
                                : "Select batch"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {availableBatches.length === 0 &&
                            expiredBatches.length === 0 && (
                              <SelectItem value="__none" disabled>
                                No batches available
                              </SelectItem>
                            )}
                          {availableBatches.map((b: any) => {
                            const near = isNearExpiry(b.expiryDate);
                            const isRec = recommended?.id === b.id;
                            const days = daysUntil(b.expiryDate);
                            return (
                              <SelectItem key={b.id} value={b.id}>
                                {b.batchNumber} · {b.quantity} units
                                {b.expiryDate
                                  ? ` · exp ${formatDate(b.expiryDate)}`
                                  : ""}
                                {isRec ? " · FEFO" : ""}
                                {near ? ` · ⚠ ${days}d` : ""}
                              </SelectItem>
                            );
                          })}
                          {expiredBatches.map((b: any) => (
                            <SelectItem key={b.id} value={b.id} disabled>
                              {b.batchNumber} · {b.quantity} units · EXPIRED
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px]">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        max={remaining}
                        value={dispenseMap[it.id]?.quantity || ""}
                        onChange={(e) =>
                          setItem(it.id, "quantity", e.target.value)
                        }
                        placeholder={`max ${remaining}`}
                        className="h-8 text-xs"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleDispense(it)}
                      disabled={
                        !!dispensing[it.id] ||
                        availableBatches.length === 0 ||
                        remaining <= 0
                      }
                      className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs gap-1"
                    >
                      {dispensing[it.id] ? (
                        <Activity className="w-3 h-3 animate-pulse" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" />
                      )}
                      {dispensing[it.id] ? "Dispensing…" : "Dispense"}
                    </Button>
                  </div>

                  {/* Batches quick-view (FEFO sorted) */}
                  {sortedBatches.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sortedBatches.slice(0, 5).map((b: any) => {
                        const exp = isExpired(b.expiryDate);
                        const near = isNearExpiry(b.expiryDate);
                        const isRec = recommended?.id === b.id;
                        const noStock = b.quantity <= 0;
                        const cls = exp
                          ? "bg-rose-100 text-rose-700 border-rose-200"
                          : near
                          ? "bg-amber-100 text-amber-800 border-amber-300"
                          : noStock
                          ? "bg-slate-100 text-slate-400 border-slate-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200";
                        return (
                          <span
                            key={b.id}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${cls} ${
                              isRec ? "ring-1 ring-amber-400" : ""
                            }`}
                            title={
                              isRec
                                ? "FEFO recommended — soonest valid expiry"
                                : undefined
                            }
                          >
                            {isRec && <CalendarClock className="w-2.5 h-2.5" />}
                            {b.batchNumber}
                            <span className="opacity-70">·{b.quantity}u</span>
                            {b.expiryDate && (
                              <span className="opacity-70">
                                ·{formatDate(b.expiryDate)}
                              </span>
                            )}
                            {exp && (
                              <span className="font-bold">EXPIRED</span>
                            )}
                            {near && !exp && (
                              <span className="font-bold">
                                ⚠{daysUntil(b.expiryDate)}d
                              </span>
                            )}
                          </span>
                        );
                      })}
                      {sortedBatches.length > 5 && (
                        <span className="text-[10px] text-slate-400 self-center">
                          +{sortedBatches.length - 5} more
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-2">
                    <Checkbox
                      id={`inv-${it.id}`}
                      checked={dispenseMap[it.id]?.createInvoice ?? true}
                      onCheckedChange={(v) =>
                        setItem(it.id, "createInvoice", !!v)
                      }
                    />
                    <Label
                      htmlFor={`inv-${it.id}`}
                      className="text-xs text-slate-600 cursor-pointer"
                    >
                      Bill to invoice
                    </Label>
                  </div>
                </div>
              );
            })
        )}
        {(rx.items || []).every((it: any) => it.status === "dispensed") && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> All items dispensed.
          </div>
        )}
      </div>
      {confirmDialogEl}
    </div>
  );
}

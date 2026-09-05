"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/stores/app-store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Activity,
  Search,
  RefreshCw,
  Stethoscope,
  FileText,
  Pill,
  Receipt,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Users,
  CalendarDays,
  Clock,
  AlertTriangle,
  Ambulance,
  CalendarCheck,
  ShieldCheck,
  Wallet,
  Timer,
  Gauge,
  ListChecks,
  Filter,
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
  Pagination,
  MiniStatCard,
  ClearableSearch,
} from "@/components/ui-helpers";
import { SpecialtyReferralButton } from "@/components/ui/specialty-referral-button";
import { EncounterDetailDialog } from "@/components/views/clinical/encounter-detail-dialog";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const ENCOUNTER_TYPES = [
  { value: "opd", label: "OPD Visit" },
  { value: "emergency", label: "Emergency" },
  { value: "inpatient", label: "Inpatient" },
  { value: "follow_up", label: "Follow-up" },
  { value: "laboratory", label: "Laboratory" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "imaging", label: "Imaging" },
  { value: "procedure", label: "Procedure" },
  { value: "maternity", label: "Maternity" },
];

const ENCOUNTER_SOURCES = [
  { value: "walkin", label: "Walk-in" },
  { value: "appointment", label: "Appointment" },
  { value: "referral", label: "Referral" },
  { value: "emergency", label: "Emergency" },
  { value: "telemedicine", label: "Telemedicine" },
];

const ENCOUNTER_PRIORITIES = [
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "emergency", label: "Emergency" },
];

const PAYER_OPTIONS = [
  { value: "self_pay", label: "Self-pay" },
  { value: "nhis", label: "NHIS" },
  { value: "private_insurance", label: "Private Insurance" },
  { value: "corporate", label: "Corporate" },
  { value: "employer", label: "Employer" },
  { value: "government", label: "Government" },
  { value: "insured", label: "Any insured (non-self-pay)" },
];

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// =====================================================================
// Main Encounters View
// =====================================================================
export function EncountersView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setView = useAppStore((s) => s.setView);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const selectEncounter = useAppStore((s) => s.selectEncounter);
  const qc = useQueryClient();

  // -------------------------------------------------------------------
  // UI state — filters / search / pagination
  // -------------------------------------------------------------------
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [payerFilter, setPayerFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [sortBy, setSortBy] = useState("startAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showNew, setShowNew] = useState(false);

  // KPI range state
  const [kpiRange, setKpiRange] = useState("today");
  const [kpiCustomStart, setKpiCustomStart] = useState("");
  const [kpiCustomEnd, setKpiCustomEnd] = useState("");

  // Detail / cancel dialogs
  const [detailEncounter, setDetailEncounter] = useState<any | null>(null);
  const [cancelEncounter, setCancelEncounter] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // -------------------------------------------------------------------
  // Debounce the search input (300ms)
  // -------------------------------------------------------------------
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // -------------------------------------------------------------------
  // Build query string
  // -------------------------------------------------------------------
  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (activeFacilityId) params.set("facilityId", activeFacilityId);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (departmentFilter) params.set("department", departmentFilter);
    if (payerFilter) params.set("payer", payerFilter);
    if (providerFilter) params.set("provider", providerFilter);
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    return `?${params.toString()}`;
  }, [
    activeFacilityId,
    debouncedSearch,
    statusFilter,
    typeFilter,
    sourceFilter,
    priorityFilter,
    departmentFilter,
    payerFilter,
    providerFilter,
    sortBy,
    sortOrder,
    startDate,
    endDate,
    page,
    pageSize,
  ]);

  // -------------------------------------------------------------------
  // Reset to page 1 whenever any filter changes
  // -------------------------------------------------------------------
  const resetPage = useCallback(() => setPage(1), []);
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    statusFilter,
    typeFilter,
    sourceFilter,
    priorityFilter,
    departmentFilter,
    payerFilter,
    providerFilter,
    sortBy,
    sortOrder,
    startDate,
    endDate,
    pageSize,
  ]);

  // -------------------------------------------------------------------
  // Fetch encounters (server-side paginated + filtered)
  // -------------------------------------------------------------------
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: [
      "encounters",
      activeFacilityId,
      debouncedSearch,
      statusFilter,
      typeFilter,
      sourceFilter,
      priorityFilter,
      departmentFilter,
      payerFilter,
      providerFilter,
      sortBy,
      sortOrder,
      startDate,
      endDate,
      page,
      pageSize,
    ],
    queryFn: () => fetchJson(`/api/encounters${buildQuery()}`),
    enabled: !!activeFacilityId,
  });

  // -------------------------------------------------------------------
  // Fetch KPIs (server-side aggregate, scoped by facility + date range)
  // -------------------------------------------------------------------
  const kpiQuery = useQuery({
    queryKey: [
      "encounters-kpis",
      activeFacilityId,
      kpiRange,
      kpiCustomStart,
      kpiCustomEnd,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeFacilityId) params.set("facilityId", activeFacilityId);
      params.set("range", kpiRange);
      params.set("compare", "true");
      if (kpiRange === "custom" && kpiCustomStart && kpiCustomEnd) {
        params.set("startDate", kpiCustomStart);
        params.set("endDate", kpiCustomEnd);
      }
      return fetchJson(`/api/encounters/stats?${params.toString()}`);
    },
    enabled: !!activeFacilityId,
  });

  // -------------------------------------------------------------------
  // Fetch departments (for filter dropdown)
  // -------------------------------------------------------------------
  const { data: departmentsData } = useQuery({
    queryKey: ["departments-list", activeFacilityId],
    queryFn: () => fetchJson(`/api/departments?facilityId=${activeFacilityId}`),
    enabled: !!activeFacilityId,
  });

  // -------------------------------------------------------------------
  // Quick action handlers
  // -------------------------------------------------------------------
  const canEdit = can("encounter.edit");
  const canClose = can("encounter.close");
  const canCreate = can("encounter.create");

  const openEncounter = (e: any) => setDetailEncounter(e);

  const closeMutation = useMutation({
    mutationFn: async (encounterId: string) => {
      const res = await fetch(`/api/encounters/${encounterId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed to close");
      }
      return safeJson(res);
    },
    onSuccess: (data: any) => {
      toast.success(data.message || "Encounter closed");
      if (data.warnings?.length > 0)
        toast.warning(`Warnings: ${data.warnings.join(", ")}`);
      qc.invalidateQueries({ queryKey: ["encounters"] });
      qc.invalidateQueries({ queryKey: ["encounters-kpis"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ encounterId, reason }: { encounterId: string; reason: string }) => {
      const res = await fetch(`/api/encounters/${encounterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", reason }),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed to cancel");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Encounter cancelled");
      qc.invalidateQueries({ queryKey: ["encounters"] });
      qc.invalidateQueries({ queryKey: ["encounters-kpis"] });
      setCancelEncounter(null);
      setCancelReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // -------------------------------------------------------------------
  // Filter clear
  // -------------------------------------------------------------------
  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("");
    setTypeFilter("");
    setSourceFilter("");
    setPriorityFilter("");
    setDepartmentFilter("");
    setPayerFilter("");
    setProviderFilter("");
    setStartDate("");
    setEndDate("");
    setSortBy("startAt");
    setSortOrder("desc");
    setPage(1);
  };

  const hasActiveFilters =
    !!debouncedSearch ||
    !!statusFilter ||
    !!typeFilter ||
    !!sourceFilter ||
    !!priorityFilter ||
    !!departmentFilter ||
    !!payerFilter ||
    !!providerFilter ||
    !!startDate ||
    !!endDate;

  // =====================================================================
  // Render
  // =====================================================================
  return (
    <div className="space-y-4">
      <PageHeader
        title="Encounters"
        description="View and manage all patient encounters across the facility"
        icon={Activity}
        gradient="from-blue-500 to-blue-600"
        actions={
          canCreate ? (
            <Button
              onClick={() => setShowNew(true)}
              className="bg-white/20 border border-white/30 text-white hover:bg-white/30"
            >
              <Plus className="w-4 h-4 mr-1" /> New Encounter
            </Button>
          ) : undefined
        }
      />

      {!activeFacilityId && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-700 bg-amber-50 border-amber-200">
            Please select an active facility from the top bar to view encounters.
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* KPI / Statistics Dashboard                                    */}
      {/* Aligned with the existing HMIS design system — uses the same */}
      {/* MiniStatCard + gradient pattern as Discharges, Nursing, etc.  */}
      {/* ============================================================ */}
      {activeFacilityId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-blue-600" /> Encounter Statistics
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Live KPIs from the database. Comparison % shown against the prior comparable period.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-slate-500">Range:</Label>
                <Select value={kpiRange} onValueChange={setKpiRange}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {kpiRange === "custom" && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="date"
                      value={kpiCustomStart}
                      onChange={(e) => setKpiCustomStart(e.target.value)}
                      className="h-8 w-36 text-xs"
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <Input
                      type="date"
                      value={kpiCustomEnd}
                      onChange={(e) => setKpiCustomEnd(e.target.value)}
                      className="h-8 w-36 text-xs"
                    />
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={kpiQuery.isFetching}
                  onClick={() => kpiQuery.refetch()}
                  className="h-8 px-2"
                  title="Refresh KPIs"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${kpiQuery.isFetching ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {kpiQuery.isError ? (
              <ErrorState
                message="Failed to load KPIs"
                onRetry={() => kpiQuery.refetch()}
              />
            ) : kpiQuery.isLoading || !kpiQuery.data?.kpis ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {Array.from({ length: 11 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 rounded-xl bg-slate-100 animate-pulse"
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : (
              <EncounterKpiGrid kpis={kpiQuery.data.kpis} />
            )}
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* Search + Advanced Filters                                    */}
      {/* Uses ClearableSearch from ui-helpers (same pattern as        */}
      {/* Discharges, Nursing, Pharmacy, Inventory, etc.)              */}
      {/* ============================================================ */}
      {activeFacilityId && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {/* Search bar — prominent, uses shared ClearableSearch */}
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                Search Encounters
              </Label>
              <ClearableSearch
                value={search}
                onChange={(v) => setSearch(v)}
                placeholder="Search by encounter #, patient name, MRN, phone, Ghana Card, or external ID…"
                inputClassName="text-sm"
                className="max-w-3xl"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Server-side search across encounter number, external ID, patient name, MRN,
                phone, and patient identifiers (Ghana Card etc.). Minimum 1 character.
              </p>
            </div>

            {/* Filter grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-slate-500">Status</Label>
                <Select
                  value={statusFilter || "all"}
                  onValueChange={(v) => {
                    setStatusFilter(v === "all" ? "" : v);
                    resetPage();
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="admitted">Admitted</SelectItem>
                    <SelectItem value="discharged">Discharged</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] uppercase tracking-wider text-slate-500">Type</Label>
                <Select
                  value={typeFilter || "all"}
                  onValueChange={(v) => {
                    setTypeFilter(v === "all" ? "" : v);
                    resetPage();
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {ENCOUNTER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] uppercase tracking-wider text-slate-500">Source</Label>
                <Select
                  value={sourceFilter || "all"}
                  onValueChange={(v) => {
                    setSourceFilter(v === "all" ? "" : v);
                    resetPage();
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {ENCOUNTER_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] uppercase tracking-wider text-slate-500">Priority</Label>
                <Select
                  value={priorityFilter || "all"}
                  onValueChange={(v) => {
                    setPriorityFilter(v === "all" ? "" : v);
                    resetPage();
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All priorities</SelectItem>
                    {ENCOUNTER_PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] uppercase tracking-wider text-slate-500">Department</Label>
                <Select
                  value={departmentFilter || "all"}
                  onValueChange={(v) => {
                    setDepartmentFilter(v === "all" ? "" : v);
                    resetPage();
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {(departmentsData?.items || departmentsData?.departments || []).map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] uppercase tracking-wider text-slate-500">Payer</Label>
                <Select
                  value={payerFilter || "all"}
                  onValueChange={(v) => {
                    setPayerFilter(v === "all" ? "" : v);
                    resetPage();
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All payers</SelectItem>
                    {PAYER_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] uppercase tracking-wider text-slate-500">Sort By</Label>
                <Select
                  value={sortBy}
                  onValueChange={(v) => {
                    setSortBy(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="startAt">Visit Date</SelectItem>
                    <SelectItem value="encounterNumber">Encounter #</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="priority">Priority</SelectItem>
                    <SelectItem value="createdAt">Created</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] uppercase tracking-wider text-slate-500">Order</Label>
                <Select
                  value={sortOrder}
                  onValueChange={(v) => {
                    setSortOrder(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Descending</SelectItem>
                    <SelectItem value="asc">Ascending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 md:col-span-2 lg:col-span-2">
                <Label className="text-[10px] uppercase tracking-wider text-slate-500">Date Range</Label>
                <div className="flex gap-1">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      resetPage();
                    }}
                    className="text-xs h-8"
                    aria-label="Start date"
                  />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      resetPage();
                    }}
                    className="text-xs h-8"
                    aria-label="End date"
                  />
                </div>
              </div>

              <div className="flex items-end gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFetching}
                  onClick={() => {
                    toast.promise(refetch(), {
                      loading: "Refreshing...",
                      success: "Data refreshed",
                      error: "Failed",
                    });
                  }}
                  className="gap-1 h-8"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
                </Button>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="text-xs h-8 gap-1"
                  >
                    <Filter className="w-3 h-3" /> Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Active filter summary */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <Filter className="w-3 h-3" /> Active:
                </span>
                {debouncedSearch && (
                  <FilterChip>Search: “{debouncedSearch}”</FilterChip>
                )}
                {statusFilter && <FilterChip>Status: {statusFilter}</FilterChip>}
                {typeFilter && <FilterChip>Type: {typeFilter}</FilterChip>}
                {sourceFilter && <FilterChip>Source: {sourceFilter}</FilterChip>}
                {priorityFilter && <FilterChip>Priority: {priorityFilter}</FilterChip>}
                {departmentFilter && <FilterChip>Dept</FilterChip>}
                {payerFilter && <FilterChip>Payer: {payerFilter}</FilterChip>}
                {providerFilter && <FilterChip>Provider</FilterChip>}
                {(startDate || endDate) && (
                  <FilterChip>
                    Date: {startDate || "…"} → {endDate || "…"}
                  </FilterChip>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* Encounters Table                                             */}
      {/* ============================================================ */}
      {activeFacilityId && (
        <>
          {isLoading ? (
            <LoadingState rows={6} />
          ) : isError ? (
            <ErrorState message="Failed to load encounters" onRetry={() => refetch()} />
          ) : !data?.items || data.items.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  title={hasActiveFilters ? "No encounters match your filters" : "No encounters found"}
                  description={
                    hasActiveFilters
                      ? "Adjust or clear your filters to see more results."
                      : "Create a new encounter to get started."
                  }
                  action={
                    canCreate ? (
                      <Button
                        onClick={() => setShowNew(true)}
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Plus className="w-4 h-4" /> New Encounter
                      </Button>
                    ) : hasActiveFilters ? (
                      <Button variant="outline" onClick={clearAllFilters} className="gap-2">
                        Clear filters
                      </Button>
                    ) : undefined
                  }
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
                        <th className="text-left p-3 font-semibold text-slate-700">Encounter #</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                        <th className="text-left p-3 font-semibold text-slate-700 hidden md:table-cell">Facility</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                        <th className="text-left p-3 font-semibold text-slate-700 hidden sm:table-cell">Priority</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                        <th className="text-left p-3 font-semibold text-slate-700 hidden md:table-cell">Started</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((e: any) => (
                        <tr
                          key={e.id}
                          onClick={() => openEncounter(e)}
                          className="border-b hover:bg-emerald-50/50 cursor-pointer"
                        >
                          <td className="p-3 font-mono text-xs">{e.encounterNumber}</td>
                          <td className="p-3">
                            <div className="font-medium text-slate-900">
                              {e.patient?.firstName} {e.patient?.lastName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {e.patient?.patientNumber} • {calculateAge(e.patient?.dateOfBirth)}y
                            </div>
                          </td>
                          <td className="p-3 text-slate-700 hidden md:table-cell">
                            {e.facility?.name}
                          </td>
                          <td className="p-3 capitalize">{e.encounterType}</td>
                          <td className="p-3 hidden sm:table-cell">
                            <StatusBadge status={e.priority} />
                          </td>
                          <td className="p-3">
                            <StatusBadge status={e.status} />
                          </td>
                          <td className="p-3 text-slate-600 hidden md:table-cell">
                            {formatDate(e.startAt, true)}
                          </td>
                          <td
                            className="p-3 text-right whitespace-nowrap"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                selectPatient(e.patient.id);
                                selectEncounter(e.id);
                                setView("triage");
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-1.5 py-1 rounded mr-1"
                              title="Triage"
                            >
                              <Stethoscope className="w-3 h-3" /> Triage
                            </button>
                            <button
                              onClick={() => {
                                selectPatient(e.patient.id);
                                selectEncounter(e.id);
                                setView("consultations");
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-1.5 py-1 rounded mr-1"
                              title="Consultation"
                            >
                              <FileText className="w-3 h-3" /> Consult
                            </button>
                            <button
                              onClick={() => {
                                selectPatient(e.patient.id);
                                selectEncounter(e.id);
                                setView("prescriptions");
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-600 hover:text-teal-700 hover:bg-teal-50 px-1.5 py-1 rounded mr-1"
                              title="Prescribe"
                            >
                              <Pill className="w-3 h-3" /> Rx
                            </button>
                            <button
                              onClick={() => {
                                selectPatient(e.patient.id);
                                selectEncounter(e.id);
                                setView("billing_invoices");
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-1.5 py-1 rounded mr-1"
                              title="Bill"
                            >
                              <Receipt className="w-3 h-3" /> Bill
                            </button>
                            {canClose &&
                              !["completed", "cancelled", "discharged"].includes(e.status) && (
                                <button
                                  onClick={() => closeMutation.mutate(e.id)}
                                  disabled={closeMutation.isPending}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 px-1.5 py-1 rounded mr-1"
                                  title="Close Encounter"
                                >
                                  <CheckCircle2 className="w-3 h-3" /> Close
                                </button>
                              )}
                            {canClose &&
                              !["completed", "cancelled", "discharged"].includes(e.status) && (
                                <button
                                  onClick={() => setCancelEncounter(e)}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-1.5 py-1 rounded"
                                  title="Cancel Encounter"
                                >
                                  <XCircle className="w-3 h-3" /> Cancel
                                </button>
                              )}
                            <SpecialtyReferralButton
                              patient={e.patient}
                              fromDepartment={e.encounterType?.toUpperCase() || "OPD"}
                              label=""
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-amber-600 hover:text-amber-700"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Server-side Pagination */}
          {data?.items && data.items.length > 0 && (
            <Pagination
              page={data.page || 1}
              pageSize={data.limit || pageSize}
              totalPages={data.totalPages || 1}
              totalItems={data.totalCount || data.items.length}
              onPageChange={(p) => setPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* Dialogs                                                      */}
      {/* ============================================================ */}
      <NewEncounterDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["encounters"] });
          qc.invalidateQueries({ queryKey: ["encounters-kpis"] });
          setShowNew(false);
        }}
        defaultFacilityId={activeFacilityId}
      />

      {cancelEncounter && (
        <Dialog open onOpenChange={() => setCancelEncounter(null)}>
          <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
              <DialogTitle className="text-white flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600" /> Cancel Encounter
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Cancel{" "}
                <span className="font-mono font-semibold">
                  {cancelEncounter.encounterNumber}
                </span>{" "}
                — {cancelEncounter.patient?.firstName} {cancelEncounter.patient?.lastName}
              </DialogDescription>
            </DialogHeader>
            <div className="p-6 space-y-3">
              <Label>Reason for Cancellation *</Label>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Patient left without being seen, duplicate, etc."
              />
              <p className="text-xs text-amber-600">
                This action cannot be undone. The encounter will be marked as cancelled with an
                audit record.
              </p>
            </div>
            <DialogFooter className="p-6 pt-4 shrink-0 border-t">
              <Button variant="outline" onClick={() => setCancelEncounter(null)}>
                Don&apos;t Cancel
              </Button>
              <Button
                onClick={() =>
                  cancelMutation.mutate({
                    encounterId: cancelEncounter.id,
                    reason: cancelReason,
                  })
                }
                disabled={cancelMutation.isPending || !cancelReason.trim()}
                className="bg-rose-600 hover:bg-rose-700"
              >
                {cancelMutation.isPending ? "Cancelling..." : "Confirm Cancel"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {detailEncounter && (
        <EncounterDetailDialog
          encounter={detailEncounter}
          canClose={canClose}
          canEdit={canEdit}
          onClose={() => setDetailEncounter(null)}
          onNavigate={(view) => {
            selectPatient(detailEncounter.patient?.id);
            selectEncounter(detailEncounter.id);
            setView(view);
            setDetailEncounter(null);
          }}
          onClosed={(id) => {
            closeMutation.mutate(id);
            setDetailEncounter(null);
          }}
          onCancelled={(e) => {
            setCancelEncounter(e);
            setDetailEncounter(null);
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// EncounterKpiGrid — uses MiniStatCard from ui-helpers to match the
// existing HMIS design system (gradient backgrounds, watermark icon,
// hover-lift). Same pattern as DischargesView, NursingView, etc.
// =====================================================================
function EncounterKpiGrid({ kpis }: { kpis: any }) {
  // Compute average duration display string
  const avgDurationValue =
    kpis.avgDurationMinutes?.value !== null && kpis.avgDurationMinutes?.value !== undefined
      ? formatMinutes(kpis.avgDurationMinutes.value)
      : "—";
  const avgDurationSublabel =
    kpis.avgDurationMinutes?.sampleSize !== undefined && kpis.avgDurationMinutes?.sampleSize > 0
      ? `n=${kpis.avgDurationMinutes.sampleSize}`
      : undefined;

  // Build sublabels showing comparison % vs. previous period
  const buildSublabel = (kpi: any): string | undefined => {
    if (kpi?.deltaPct === undefined || kpi?.deltaPct === null) return undefined;
    const sign = kpi.deltaPct > 0 ? "+" : "";
    return `${sign}${kpi.deltaPct.toFixed(1)}% vs prev`;
  };

  // 11 KPI cards in the established MiniStatCard pattern
  // Colors mirror the gradients used by DischargesView / NursingView
  const cards: Array<{
    label: string;
    value: string | number;
    icon: any;
    gradient: string;
    sublabel?: string;
    title?: string;
  }> = [
    {
      label: "Total Encounters",
      value: kpis.total?.value ?? 0,
      icon: Activity,
      gradient: "from-blue-500 to-blue-600",
      sublabel: buildSublabel(kpis.total),
      title: kpis.total?.definition,
    },
    {
      label: "Today's Encounters",
      value: kpis.today?.value ?? 0,
      icon: CalendarDays,
      gradient: "from-cyan-500 to-cyan-600",
      sublabel: buildSublabel(kpis.today),
      title: kpis.today?.definition,
    },
    {
      label: "Active (Open)",
      value: kpis.active?.value ?? 0,
      icon: Clock,
      gradient: "from-amber-500 to-amber-600",
      sublabel: buildSublabel(kpis.active),
      title: kpis.active?.definition,
    },
    {
      label: "Closed",
      value: kpis.closed?.value ?? 0,
      icon: CheckCircle2,
      gradient: "from-emerald-500 to-emerald-600",
      sublabel: buildSublabel(kpis.closed),
      title: kpis.closed?.definition,
    },
    {
      label: "Cancelled",
      value: kpis.cancelled?.value ?? 0,
      icon: XCircle,
      gradient: "from-rose-500 to-rose-600",
      sublabel: buildSublabel(kpis.cancelled),
      title: kpis.cancelled?.definition,
    },
    {
      label: "Walk-in",
      value: kpis.walkIn?.value ?? 0,
      icon: Users,
      gradient: "from-slate-500 to-slate-600",
      sublabel: buildSublabel(kpis.walkIn),
      title: kpis.walkIn?.definition,
    },
    {
      label: "Appointment",
      value: kpis.appointment?.value ?? 0,
      icon: CalendarCheck,
      gradient: "from-indigo-500 to-indigo-600",
      sublabel: buildSublabel(kpis.appointment),
      title: kpis.appointment?.definition,
    },
    {
      label: "Emergency",
      value: kpis.emergency?.value ?? 0,
      icon: Ambulance,
      gradient: "from-red-500 to-rose-600",
      sublabel: buildSublabel(kpis.emergency),
      title: kpis.emergency?.definition,
    },
    {
      label: "Insured/NHIS",
      value: kpis.insured?.value ?? 0,
      icon: ShieldCheck,
      gradient: "from-violet-500 to-violet-600",
      sublabel: buildSublabel(kpis.insured),
      title: kpis.insured?.definition,
    },
    {
      label: "Self-Pay",
      value: kpis.selfPay?.value ?? 0,
      icon: Wallet,
      gradient: "from-teal-500 to-cyan-600",
      sublabel: buildSublabel(kpis.selfPay),
      title: kpis.selfPay?.definition,
    },
    {
      label: "Avg Duration",
      value: avgDurationValue,
      icon: Timer,
      gradient: "from-slate-600 to-slate-700",
      sublabel: avgDurationSublabel,
      title: kpis.avgDurationMinutes?.definition,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c, i) => (
        <div key={i} title={c.title} className="has-tooltip">
          <MiniStatCard
            label={c.label}
            value={c.value as any}
            icon={c.icon}
            gradient={c.gradient}
            sublabel={c.sublabel}
          />
        </div>
      ))}
    </div>
  );
}

function formatMinutes(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// =====================================================================
// FilterChip — small pill that summarizes an active filter
// (uses a softer style consistent with the HMIS color palette)
// =====================================================================
function FilterChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
      {children}
    </span>
  );
}

// =====================================================================
// New Encounter Dialog
// =====================================================================
function NewEncounterDialog({
  open,
  onClose,
  onCreated,
  defaultFacilityId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultFacilityId: string | null;
}) {
  const qc = useQueryClient();
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [facilityId, setFacilityId] = useState(defaultFacilityId || "");
  const [departmentId, setDepartmentId] = useState("");
  const [encounterType, setEncounterType] = useState("opd");
  const [priority, setPriority] = useState("routine");
  const [saving, setSaving] = useState(false);

  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities-list"],
    queryFn: () => fetchJson("/api/facilities"),
  });

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  const { data: departmentsData } = useQuery({
    queryKey: ["departments-list", facilityId],
    queryFn: () => fetchJson(`/api/departments?facilityId=${facilityId}`),
    enabled: !!facilityId,
  });

  const create = async () => {
    if (!patientId || !facilityId) {
      toast.error("Please select patient and facility");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          facilityId,
          departmentId: departmentId || undefined,
          encounterType,
          priority,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || `Failed (${res.status})`);
      }
      toast.success("Encounter created");
      qc.invalidateQueries({ queryKey: ["encounters"] });
      qc.invalidateQueries({ queryKey: ["encounters-kpis"] });
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <DialogTitle className="text-white">New Encounter</DialogTitle>
          <DialogDescription className="text-white/80">
            Open a new clinical encounter for a patient at this facility.
          </DialogDescription>
        </DialogHeader>
        <div className="p-6 space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <Input
              placeholder="Search patient by name, number, phone, Ghana Card..."
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
            />
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPatientId(p.id);
                      setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
                    }}
                    className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0"
                  >
                    <span className="font-medium">
                      {p.firstName} {p.lastName}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">
                      {p.patientNumber} • {p.phone || "no phone"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {patientId && (
              <p className="text-xs text-emerald-700 mt-1">✓ Patient selected</p>
            )}
          </div>

          <div>
            <FieldLabel required>Facility</FieldLabel>
            <Select value={facilityId || undefined} onValueChange={setFacilityId}>
              <SelectTrigger>
                <SelectValue placeholder="Select facility" />
              </SelectTrigger>
              <SelectContent>
                {(facilitiesData?.items || facilitiesData?.facilities || []).map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Department</Label>
            <Select
              value={departmentId || "none"}
              onValueChange={(v) => setDepartmentId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {(departmentsData?.items || departmentsData?.departments || []).map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={encounterType || undefined} onValueChange={setEncounterType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENCOUNTER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority || undefined} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={create}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {saving ? (
              <Activity className="w-4 h-4 animate-pulse" />
            ) : (
              <Activity className="w-4 h-4" />
            )}
            {saving ? "Creating..." : "Create Encounter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

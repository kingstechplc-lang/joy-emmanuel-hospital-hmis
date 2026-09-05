"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Share2,
  Plus,
  ArrowRight,
  ArrowLeft,
  Search,
  Filter,
  X,
  RefreshCw,
  Loader2,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
  Stethoscope,
  FileText,
  MessageSquare,
  Send,
  Ban,
  CheckCheck,
  MapPin,
  Phone,
  User as UserIcon,
  TrendingUp,
  ClipboardList,
  Zap,
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
import { FieldLabel } from "@/components/ui/required-label";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

// =====================================================================
// REFERRAL LIFECYCLE CONSTANTS — mirror the server-side transition map
// =====================================================================
const REFERRAL_STATUSES = [
  "draft", "submitted", "authorized", "sent", "acknowledged",
  "accepted", "rejected", "scheduled", "in_transit", "arrived",
  "under_care", "completed", "feedback_received", "follow_up",
  "closed", "cancelled", "expired", "returned", "redirected",
  "no_response", "unable_to_attend",
];

const REFERRAL_TYPES = [
  "internal", "external", "inter_facility", "specialist", "emergency",
  "routine", "diagnostic", "surgical", "maternal", "pediatric",
  "mental_health", "rehabilitation", "laboratory", "radiology",
  "pharmacy", "follow_up", "counter_referral",
];

const REFERRAL_REASON_CATEGORIES = [
  "specialist_evaluation", "higher_level_care", "advanced_investigation",
  "surgical_intervention", "emergency_management", "diagnostic_confirmation",
  "treatment_unavailable", "equipment_unavailable", "specialist_unavailable",
  "continuity_of_care", "follow_up", "other",
];

// =====================================================================
// MAIN VIEW
// =====================================================================
export function ReferralsView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [tab, setTab] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [selectedReferralId, setSelectedReferralId] = useState<string | null>(null);

  // ---- Search & filter state ----
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [feedbackFilter, setFeedbackFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ---- Stats query (auto-refresh 30s) ----
  const statsQs = activeFacilityId ? `?facilityId=${activeFacilityId}` : "";
  const {
    data: statsData,
    isLoading: statsLoading,
    isFetching: statsFetching,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ["referrals-stats", activeFacilityId],
    queryFn: () => fetchJson(`/api/referrals/stats${statsQs}`),
    enabled: !!activeFacilityId,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  // ---- List query ----
  const listParams = new URLSearchParams();
  if (activeFacilityId) listParams.set("facilityId", activeFacilityId);
  listParams.set("direction", tab);
  if (statusFilter !== "all") listParams.set("status", statusFilter);
  if (urgencyFilter !== "all") listParams.set("urgency", urgencyFilter);
  if (typeFilter !== "all") listParams.set("type", typeFilter);
  if (feedbackFilter !== "all") listParams.set("feedbackStatus", feedbackFilter);
  if (search.trim()) listParams.set("search", search.trim());
  if (dateFrom) listParams.set("dateFrom", dateFrom);
  if (dateTo) listParams.set("dateTo", dateTo);
  listParams.set("limit", "200");

  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["referrals", activeFacilityId, tab, statusFilter, urgencyFilter, typeFilter, feedbackFilter, search, dateFrom, dateTo],
    queryFn: () => fetchJson(`/api/referrals?${listParams.toString()}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["referrals"] });
    qc.invalidateQueries({ queryKey: ["referrals-stats"] });
  };

  const hasActiveFilters =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    urgencyFilter !== "all" ||
    typeFilter !== "all" ||
    feedbackFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setUrgencyFilter("all");
    setTypeFilter("all");
    setFeedbackFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const kpis = statsData?.kpis || {};
  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Referrals"
        description="Care coordination & referral lifecycle management — track incoming/outgoing referrals, accept, complete, and capture counter-referral feedback."
        icon={Share2}
        gradient="from-blue-500 to-indigo-600"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-white/80 flex items-center gap-1.5 bg-white/10 rounded-md px-2 py-1">
              {statsFetching || isFetching ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Refreshing…</span>
                </>
              ) : dataUpdatedAt ? (
                <>
                  <Clock className="w-3 h-3" />
                  <span>Updated {formatRelativeTime(dataUpdatedAt)}</span>
                </>
              ) : (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading…</span>
                </>
              )}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const p = refetch();
                toast.promise(p, {
                  loading: "Refreshing…",
                  success: "Data refreshed",
                  error: "Refresh failed",
                });
              }}
              disabled={isFetching}
              className="bg-white/20 text-white hover:bg-white/30 border-white/20 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              onClick={() => setShowNew(true)}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" /> New Referral
            </Button>
          </div>
        }
      />

      {!activeFacilityId && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
            Select a facility to view referrals.
          </CardContent>
        </Card>
      )}

      {activeFacilityId && (
        <>
          {/* ===== KPI dashboard ===== */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              Referral KPIs
              {statsLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            </h3>
            <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
              {statsFetching ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                  <span className="text-blue-700 font-medium">Refreshing…</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3 text-slate-400" />
                  <span>Auto-refresh every 30s</span>
                </>
              )}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniStatCard
              label="Total"
              value={kpis.total ?? 0}
              icon={Share2}
              gradient="from-blue-500 to-blue-600"
              sublabel="All referrals"
            />
            <MiniStatCard
              label="Pending"
              value={kpis.pending ?? 0}
              icon={Clock}
              gradient="from-amber-500 to-amber-600"
              sublabel="Awaiting review"
            />
            <MiniStatCard
              label="Urgent / Emerg."
              value={(kpis.urgent ?? 0) + (kpis.emergency ?? 0)}
              icon={AlertTriangle}
              gradient="from-orange-500 to-red-600"
              sublabel="High priority"
            />
            <MiniStatCard
              label="Accepted"
              value={kpis.accepted ?? 0}
              icon={CheckCircle2}
              gradient="from-emerald-500 to-emerald-600"
              sublabel="In progress"
            />
            <MiniStatCard
              label="Awaiting Feedback"
              value={kpis.awaitingFeedback ?? 0}
              icon={MessageSquare}
              gradient="from-indigo-500 to-purple-600"
              sublabel="Counter-referral pending"
            />
            <MiniStatCard
              label="Overdue"
              value={kpis.overdue ?? 0}
              icon={AlertTriangle}
              gradient="from-rose-500 to-rose-600"
              sublabel="Needs follow-up"
            />
          </div>

          {/* ===== Direction tabs ===== */}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="all" className="gap-1">
                <Share2 className="w-3.5 h-3.5" /> All
              </TabsTrigger>
              <TabsTrigger value="outgoing" className="gap-1">
                <ArrowRight className="w-3.5 h-3.5" /> Outgoing
              </TabsTrigger>
              <TabsTrigger value="incoming" className="gap-1">
                <ArrowLeft className="w-3.5 h-3.5" /> Incoming
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* ===== Search & filters ===== */}
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by referral #, patient name, MRN, reason, or facility…"
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
                  <span className="text-xs text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
                    <ClipboardList className="w-3.5 h-3.5" />
                    <strong className="text-slate-700">{items.length}</strong> results
                  </span>
                </div>

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
                      {REFERRAL_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue placeholder="Urgency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All urgencies</SelectItem>
                      <SelectItem value="routine">Routine</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                      <SelectItem value="stat">STAT</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={feedbackFilter} onValueChange={setFeedbackFilter}>
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue placeholder="Feedback" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All feedback</SelectItem>
                      <SelectItem value="awaiting">Awaiting feedback</SelectItem>
                      <SelectItem value="received">Feedback received</SelectItem>
                      <SelectItem value="reviewed">Reviewed</SelectItem>
                      <SelectItem value="follow_up_required">Follow-up required</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant={showAdvanced ? "secondary" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setShowAdvanced((s) => !s)}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    {showAdvanced ? "Hide advanced" : "Advanced"}
                    {(typeFilter !== "all" || dateFrom !== "" || dateTo !== "") && (
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

                {showAdvanced && (
                  <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-100">
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Referral type
                      </Label>
                      <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="h-8 w-[180px] text-xs">
                          <SelectValue placeholder="All types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All types</SelectItem>
                          {REFERRAL_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        From date
                      </Label>
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-8 w-[160px] text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        To date
                      </Label>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-8 w-[160px] text-xs"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-[11px]"
                      onClick={() => {
                        const today = new Date().toISOString().slice(0, 10);
                        setDateFrom(today);
                        setDateTo(today);
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
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ===== Referral list ===== */}
          {isLoading ? (
            <LoadingState rows={5} />
          ) : isError ? (
            <ErrorState message="Failed to load referrals" onRetry={() => refetch()} />
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  title={hasActiveFilters ? "No matching referrals" : "No referrals found"}
                  description={
                    hasActiveFilters
                      ? "No referrals match your filters. Try adjusting or clearing them."
                      : "Create a new referral to transfer a patient to another facility."
                  }
                  icon={hasActiveFilters ? Search : Share2}
                  action={
                    !hasActiveFilters && (
                      <Button
                        onClick={() => setShowNew(true)}
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Plus className="w-4 h-4" /> New Referral
                      </Button>
                    )
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {items.map((r: any) => (
                <ReferralCard
                  key={r.id}
                  referral={r}
                  onClick={() => setSelectedReferralId(r.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== New Referral Dialog ===== */}
      <NewReferralDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => {
          setShowNew(false);
          invalidate();
        }}
        defaultFacilityId={activeFacilityId}
      />

      {/* ===== Referral Detail Dialog ===== */}
      {selectedReferralId && (
        <ReferralDetailDialog
          referralId={selectedReferralId}
          onClose={() => setSelectedReferralId(null)}
          onUpdated={invalidate}
          activeFacilityId={activeFacilityId}
        />
      )}
    </div>
  );
}

// =====================================================================
// REFERRAL CARD — list row (clickable to open detail)
// =====================================================================
function ReferralCard({ referral: r, onClick }: { referral: any; onClick: () => void }) {
  const urgencyTone =
    r.urgency === "emergency"
      ? "bg-rose-100 text-rose-700 border-rose-200"
      : r.urgency === "urgent"
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : r.urgency === "stat"
      ? "bg-purple-100 text-purple-700 border-purple-200"
      : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <Card
      className="cursor-pointer hover:shadow-md hover:border-blue-300 transition-all"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {r.referralNumber && (
                <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                  {r.referralNumber}
                </span>
              )}
              <span className="font-medium text-slate-900">
                {r.patient?.firstName} {r.patient?.lastName}
              </span>
              <span className="text-xs text-slate-500">
                {r.patient?.patientNumber}
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">
                {r.patient?.sex ? String(r.patient.sex).toUpperCase() : "—"} ·{" "}
                {calculateAge(r.patient?.dateOfBirth)}y
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span className="flex items-center gap-1">
                <ArrowRight className="w-3 h-3" />
                From: {r.referringFacility?.name || "—"}
              </span>
              <span className="flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" />
                To: {r.receivingFacility?.name || r.receivingFacilityName || "—"}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(r.referredAt, true)}
              </span>
              {r.primaryDiagnosis && (
                <span className="flex items-center gap-1">
                  <Stethoscope className="w-3 h-3" />
                  {r.primaryDiagnosis.diagnosisName}
                </span>
              )}
            </div>
            {r.reason && (
              <div className="text-sm text-slate-700 mt-1 line-clamp-1">
                {r.reason}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            <Badge variant="outline" className={`text-[10px] ${urgencyTone}`}>
              {r.urgency}
            </Badge>
            <StatusBadge status={r.status} />
            {r.feedbackStatus && r.feedbackStatus !== "awaiting" && (
              <Badge variant="secondary" className="text-[10px]">
                {r.feedbackStatus.replace(/_/g, " ")}
              </Badge>
            )}
            {r._count?.messages > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <MessageSquare className="w-3 h-3" />
                {r._count.messages}
              </Badge>
            )}
            {r._count?.feedback > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1 text-emerald-700">
                <CheckCircle2 className="w-3 h-3" />
                {r._count.feedback}
              </Badge>
            )}
          </div>
        </div>
        {r.clinicalSummary && (
          <div className="mt-2 p-2 bg-slate-50 rounded text-xs text-slate-700 line-clamp-2">
            {r.clinicalSummary}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// NEW REFERRAL DIALOG
// =====================================================================
function NewReferralDialog({
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
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [referringFacilityId, setReferringFacilityId] = useState(defaultFacilityId || "");
  const [receivingFacilityId, setReceivingFacilityId] = useState("");
  const [receivingFacilityName, setReceivingFacilityName] = useState("");
  const [receivingProviderName, setReceivingProviderName] = useState("");
  const [receivingContact, setReceivingContact] = useState("");
  const [reason, setReason] = useState("");
  const [referralReasonCategory, setReferralReasonCategory] = useState("");
  const [clinicalSummary, setClinicalSummary] = useState("");
  const [urgency, setUrgency] = useState("routine");
  const [referralType, setReferralType] = useState("external");
  const [initialStatus, setInitialStatus] = useState("submitted");
  const [transportRequired, setTransportRequired] = useState(false);
  const [stabilizationPerformed, setStabilizationPerformed] = useState("");
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
  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters", patientId, referringFacilityId],
    queryFn: () =>
      fetchJson(`/api/encounters?patientId=${patientId}&facilityId=${referringFacilityId}`),
    enabled: !!patientId && !!referringFacilityId,
  });

  const submit = async () => {
    if (!patientId || !encounterId || !referringFacilityId) {
      toast.error("Patient, encounter, and referring facility are required");
      return;
    }
    if (!reason.trim()) {
      toast.error("A referral reason is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientIdFrom: patientId,
          encounterId,
          referringFacilityId,
          receivingFacilityId: receivingFacilityId || undefined,
          receivingFacilityName: receivingFacilityName || undefined,
          receivingProviderName: receivingProviderName || undefined,
          receivingContact: receivingContact || undefined,
          reason,
          referralReasonCategory: referralReasonCategory || undefined,
          clinicalSummary,
          urgency,
          referralType,
          status: initialStatus,
          transportRequired,
          stabilizationPerformed: stabilizationPerformed || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed");
      }
      toast.success(`Referral ${data.item?.referralNumber || ""} created`);
      // Reset form
      setPatientQuery("");
      setPatientId("");
      setEncounterId("");
      setReceivingFacilityId("");
      setReceivingFacilityName("");
      setReceivingProviderName("");
      setReceivingContact("");
      setReason("");
      setReferralReasonCategory("");
      setClinicalSummary("");
      setUrgency("routine");
      setReferralType("external");
      setInitialStatus("submitted");
      setTransportRequired(false);
      setStabilizationPerformed("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="xl">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <DialogTitle>New Patient Referral</DialogTitle>
          <DialogDescription className="text-white/80">
            Refer a patient to another facility or specialist. A unique referral
            number (REF-YYYY-000001) will be generated automatically.
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
                      setPatientQuery(
                        `${p.firstName} ${p.lastName} (${p.patientNumber})`
                      );
                    }}
                    className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0"
                  >
                    <span className="font-medium">
                      {p.firstName} {p.lastName}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">
                      {p.patientNumber} · {calculateAge(p.dateOfBirth)}y ·{" "}
                      {p.sex?.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Facilities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="min-w-0">
              <FieldLabel required>Referring Facility (Current)</FieldLabel>
              <Select
                value={referringFacilityId || undefined}
                onValueChange={setReferringFacilityId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select facility" />
                </SelectTrigger>
                <SelectContent>
                  {(facilitiesData?.items || facilitiesData?.facilities || []).map(
                    (f: any) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label>Receiving Facility (in HMIS)</Label>
              <Select
                value={receivingFacilityId || "none"}
                onValueChange={(v) => setReceivingFacilityId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— External / Not in HMIS —</SelectItem>
                  {(facilitiesData?.items || facilitiesData?.facilities || [])
                    .filter((f: any) => f.id !== referringFacilityId)
                    .map((f: any) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* External facility details (only when no HMIS facility selected) */}
          {!receivingFacilityId && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div>
                <Label>External Facility Name</Label>
                <Input
                  value={receivingFacilityName}
                  onChange={(e) => setReceivingFacilityName(e.target.value)}
                  placeholder="e.g. Korle-Bu Teaching Hospital"
                />
              </div>
              <div>
                <Label>Receiving Provider</Label>
                <Input
                  value={receivingProviderName}
                  onChange={(e) => setReceivingProviderName(e.target.value)}
                  placeholder="Dr. / specialty"
                />
              </div>
              <div>
                <Label>Contact (phone/email)</Label>
                <Input
                  value={receivingContact}
                  onChange={(e) => setReceivingContact(e.target.value)}
                  placeholder="+233..."
                />
              </div>
            </div>
          )}

          {/* Encounter */}
          {patientId && referringFacilityId && (
            <div>
              <FieldLabel required>Source Encounter</FieldLabel>
              <Select
                value={encounterId || undefined}
                onValueChange={setEncounterId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select encounter" />
                </SelectTrigger>
                <SelectContent>
                  {(encountersData?.items || []).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.encounterNumber} • {e.encounterType} •{" "}
                      {formatDate(e.startAt, true)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Reason */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Reason for Referral</FieldLabel>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. needs specialized cardiology consult" rows={3} />
            </div>
            <div>
              <Label>Reason Category</Label>
              <Select
                value={referralReasonCategory || "none"}
                onValueChange={(v) =>
                  setReferralReasonCategory(v === "none" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select category —</SelectItem>
                  {REFERRAL_REASON_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Clinical summary */}
          <div>
            <Label>Clinical Summary</Label>
            <Textarea
              value={clinicalSummary}
              onChange={(e) => setClinicalSummary(e.target.value)}
              placeholder="Brief clinical background, current management, relevant findings, vital signs, treatment given..."
              rows={4}
            />
          </div>

          {/* Urgency, type, status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <FieldLabel required>Urgency</FieldLabel>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="stat">STAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Referral Type</Label>
              <Select value={referralType} onValueChange={setReferralType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERRAL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Initial Status</Label>
              <Select value={initialStatus} onValueChange={setInitialStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft (save for later)</SelectItem>
                  <SelectItem value="submitted">Submitted (default)</SelectItem>
                  <SelectItem value="sent">Sent (already transmitted)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Transport + stabilization (emergency) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-2 border border-slate-200 rounded-md">
              <input
                type="checkbox"
                id="transport-required"
                checked={transportRequired}
                onChange={(e) => setTransportRequired(e.target.checked)}
                className="w-4 h-4"
              />
              <Label htmlFor="transport-required" className="text-sm cursor-pointer">
                Transport required (ambulance)
              </Label>
            </div>
            {(urgency === "emergency" || urgency === "stat" || transportRequired) && (
              <div>
                <Label>Stabilization Performed</Label>
                <Input
                  value={stabilizationPerformed}
                  onChange={(e) => setStabilizationPerformed(e.target.value)}
                  placeholder="e.g. IV access, Oxygen 4L, Fluids, Immobilization"
                />
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? "Submitting..." : "Create Referral"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// REFERRAL DETAIL DIALOG — full lifecycle view with timeline, feedback, comms
// =====================================================================
function ReferralDetailDialog({
  referralId,
  onClose,
  onUpdated,
  activeFacilityId,
}: {
  referralId: string;
  onClose: () => void;
  onUpdated: () => void;
  activeFacilityId: string | null;
}) {
  const [activeSection, setActiveSection] = useState<
    "overview" | "timeline" | "feedback" | "messages" | "actions"
  >("overview");
  const [newMessage, setNewMessage] = useState("");
  const [newMessageType, setNewMessageType] = useState("message");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["referral-detail", referralId],
    queryFn: () => fetchJson(`/api/referrals/${referralId}`),
  });

  const r = data?.item;

  // ---- Determine the user's role for this referral ----
  // The referring facility is the sender; the receiving facility is the
  // destination. Actions shown in the Actions tab are filtered by role so
  // each side only sees the actions they're allowed to perform.
  const isReferringFacility = !!r && !!activeFacilityId && r.referringFacilityId === activeFacilityId;
  const isReceivingFacility =
    !!r &&
    !!activeFacilityId &&
    !!r.receivingFacilityId &&
    r.receivingFacilityId === activeFacilityId &&
    r.referringFacilityId !== r.receivingFacilityId;
  // If neither (e.g., a third-party facility viewing, or an external
  // referral with no receiving facility in HMIS), show read-only.
  const userRole: "referring" | "receiving" | "observer" = isReferringFacility
    ? "referring"
    : isReceivingFacility
    ? "receiving"
    : "observer";

  const patchReferral = async (body: any, successMsg: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/referrals/${referralId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success(successMsg);
      refetch();
      onUpdated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusAction = (newStatus: string, label: string, requireReason = false) => {
    if (requireReason) {
      const reason = window.prompt(`Reason for ${label.toLowerCase()}:`);
      if (!reason) return;
      patchReferral(
        { status: newStatus, cancellationReason: reason, action: newStatus === "cancelled" ? "cancel" : undefined },
        `Referral ${label.toLowerCase()}`
      );
      return;
    }
    confirmAction({
      title: `${label} referral?`,
      description: `Change referral status to "${newStatus}".`,
      confirmText: label,
      onConfirm: () => patchReferral({ status: newStatus }, `Referral ${label.toLowerCase()}`),
    });
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    setSendingMessage(true);
    try {
      const res = await fetch(`/api/referrals/${referralId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: newMessage.trim(),
          messageType: newMessageType,
        }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("Message sent");
      setNewMessage("");
      refetch();
      onUpdated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingMessage(false);
    }
  };

  if (isLoading) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden" size="wide">
          <LoadingState rows={5} />
        </DialogContent>
      </Dialog>
    );
  }

  if (isError || !r) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden" size="wide">
          <ErrorState message="Failed to load referral" onRetry={() => refetch()} />
        </DialogContent>
      </Dialog>
    );
  }

  const events = r.events || [];
  const feedback = r.feedback || [];
  const messages = r.messages || [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="2xl">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2 flex-wrap">
            {r.referralNumber && (
              <span className="font-mono text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
                {r.referralNumber}
              </span>
            )}
            <span>Referral — {r.patient?.firstName} {r.patient?.lastName}</span>
            <StatusBadge status={r.status} />
            <Badge variant="outline" className="text-[10px]">
              {r.urgency}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Created {formatDate(r.referredAt, true)} by{" "}
            {r.referredBy
              ? `${r.referredBy.firstName} ${r.referredBy.lastName}`
              : "—"}
          </DialogDescription>
        </DialogHeader>

        {/* Section tabs */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
          {[
            { id: "overview", label: "Overview", icon: FileText },
            { id: "timeline", label: `Timeline (${events.length})`, icon: Activity },
            { id: "feedback", label: `Feedback (${feedback.length})`, icon: ClipboardList },
            { id: "messages", label: `Messages (${messages.length})`, icon: MessageSquare },
            { id: "actions", label: "Actions", icon: Zap },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors ${
                activeSection === s.id
                  ? "bg-blue-100 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>

        {/* ===== OVERVIEW ===== */}
        {activeSection === "overview" && (
          <div className="space-y-3">
            {/* Patient info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-slate-500" /> Patient
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Name</div>
                  <div className="font-medium">{r.patient?.firstName} {r.patient?.lastName}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">MRN</div>
                  <div className="font-mono">{r.patient?.patientNumber || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Age / Sex</div>
                  <div>{calculateAge(r.patient?.dateOfBirth)}y · {r.patient?.sex?.toUpperCase()}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Phone</div>
                  <div>{r.patient?.phone || "—"}</div>
                </div>
              </CardContent>
            </Card>

            {/* Referral info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-slate-500" /> Referral
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">From Facility</div>
                  <div>{r.referringFacility?.name || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">To Facility</div>
                  <div>
                    {r.receivingFacility?.name || r.receivingFacilityName || "—"}
                    {r.receivingProviderName && (
                      <span className="text-slate-500 ml-1">({r.receivingProviderName})</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Type / Urgency</div>
                  <div>{r.referralType?.replace(/_/g, " ")} · {r.urgency}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Reason Category</div>
                  <div>{r.referralReasonCategory?.replace(/_/g, " ") || "—"}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-[10px] text-slate-400 uppercase">Reason</div>
                  <div className="text-sm">{r.reason || "—"}</div>
                </div>
                {r.clinicalSummary && (
                  <div className="md:col-span-2">
                    <div className="text-[10px] text-slate-400 uppercase">Clinical Summary</div>
                    <div className="text-sm bg-slate-50 p-2 rounded whitespace-pre-wrap">{r.clinicalSummary}</div>
                  </div>
                )}
                {r.primaryDiagnosis && (
                  <div className="md:col-span-2">
                    <div className="text-[10px] text-slate-400 uppercase">Primary Diagnosis</div>
                    <div className="text-sm">
                      {r.primaryDiagnosis.diagnosisName}
                      {r.primaryDiagnosis.diagnosisCode && (
                        <span className="text-slate-500 ml-1">({r.primaryDiagnosis.diagnosisCode})</span>
                      )}
                    </div>
                  </div>
                )}
                {r.stabilizationPerformed && (
                  <div className="md:col-span-2">
                    <div className="text-[10px] text-slate-400 uppercase">Stabilization Performed</div>
                    <div className="text-sm">{r.stabilizationPerformed}</div>
                  </div>
                )}
                {r.transportRequired && (
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Transport</div>
                    <div className="text-sm">
                      Required
                      {r.transportStatus && (
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          {r.transportStatus.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                {r.appointmentDate && (
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Appointment</div>
                    <div className="text-sm">{formatDate(r.appointmentDate, true)}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===== TIMELINE ===== */}
        {activeSection === "timeline" && (
          <div className="space-y-2">
            {events.length === 0 ? (
              <EmptyState title="No events yet" description="Timeline events will appear here as the referral progresses." icon={Activity} />
            ) : (
              <div className="relative pl-6 space-y-3">
                {/* Vertical line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200" />
                {events.map((e: any) => (
                  <div key={e.id} className="relative">
                    {/* Dot */}
                    <div className={`absolute -left-[18px] top-1 w-3 h-3 rounded-full ring-2 ring-white ${
                      e.toStatus === "cancelled" ? "bg-rose-500"
                      : e.toStatus === "accepted" ? "bg-emerald-500"
                      : e.toStatus === "rejected" ? "bg-rose-500"
                      : e.toStatus === "completed" || e.toStatus === "closed" ? "bg-blue-500"
                      : "bg-slate-400"
                    }`} />
                    <div className="bg-white border border-slate-200 rounded-md p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{e.title}</span>
                        <span className="text-[10px] text-slate-400">{formatDate(e.createdAt, true)}</span>
                      </div>
                      {e.description && (
                        <div className="text-slate-600 mt-1">{e.description}</div>
                      )}
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
                        {e.actorUser && (
                          <span>by {e.actorUser.firstName} {e.actorUser.lastName}</span>
                        )}
                        {e.fromStatus && e.toStatus && (
                          <span>{e.fromStatus} → {e.toStatus}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== FEEDBACK (counter-referral) ===== */}
        {activeSection === "feedback" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Counter-referral feedback from the receiving facility. Submit interim updates or the final discharge summary.
              </p>
              <Button
                size="sm"
                onClick={() => setShowFeedbackForm(true)}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add Feedback
              </Button>
            </div>
            {feedback.length === 0 ? (
              <EmptyState title="No feedback yet" description="Feedback from the receiving facility will appear here." icon={ClipboardList} />
            ) : (
              <div className="space-y-2">
                {feedback.map((f: any) => (
                  <Card key={f.id} className={f.isFinal ? "border-emerald-300 bg-emerald-50/30" : ""}>
                    <CardContent className="p-3 text-xs">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {f.feedbackType.replace(/_/g, " ")}
                          </Badge>
                          {f.isFinal && (
                            <Badge className="bg-emerald-500 text-white text-[10px]">FINAL</Badge>
                          )}
                          {f.outcome && (
                            <Badge variant="secondary" className="text-[10px]">
                              {f.outcome.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {formatDate(f.createdAt, true)}
                        </span>
                      </div>
                      {f.authorUser && (
                        <div className="text-[10px] text-slate-500 mb-1">
                          by {f.authorUser.firstName} {f.authorUser.lastName}
                        </div>
                      )}
                      <div className="space-y-1">
                        {f.clinicalFindings && (
                          <div><strong className="text-slate-600">Findings:</strong> {f.clinicalFindings}</div>
                        )}
                        {f.diagnosis && (
                          <div><strong className="text-slate-600">Diagnosis:</strong> {f.diagnosis}</div>
                        )}
                        {f.treatmentProvided && (
                          <div><strong className="text-slate-600">Treatment:</strong> {f.treatmentProvided}</div>
                        )}
                        {f.proceduresPerformed && (
                          <div><strong className="text-slate-600">Procedures:</strong> {f.proceduresPerformed}</div>
                        )}
                        {f.investigationsDone && (
                          <div><strong className="text-slate-600">Investigations:</strong> {f.investigationsDone}</div>
                        )}
                        {f.medicationsPrescribed && (
                          <div><strong className="text-slate-600">Medications:</strong> {f.medicationsPrescribed}</div>
                        )}
                        {f.recommendations && (
                          <div><strong className="text-slate-600">Recommendations:</strong> {f.recommendations}</div>
                        )}
                        {f.followUpPlan && (
                          <div><strong className="text-slate-600">Follow-up:</strong> {f.followUpPlan}</div>
                        )}
                        {f.returnRecommendation && f.returnRecommendation !== "none" && (
                          <div><strong className="text-slate-600">Return:</strong> {f.returnRecommendation.replace(/_/g, " ")}</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {showFeedbackForm && (
              <FeedbackForm
                referralId={referralId}
                onClose={() => setShowFeedbackForm(false)}
                onSaved={() => {
                  setShowFeedbackForm(false);
                  refetch();
                  onUpdated();
                }}
              />
            )}
          </div>
        )}

        {/* ===== MESSAGES (communication log) ===== */}
        {activeSection === "messages" && (
          <div className="space-y-3">
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {messages.length === 0 ? (
                <EmptyState title="No messages" description="Send a message, info request, or log a phone call." icon={MessageSquare} />
              ) : (
                messages.map((m: any) => (
                  <div
                    key={m.id}
                    className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[80%] rounded-lg p-2 text-xs ${
                      m.direction === "outbound"
                        ? "bg-blue-50 border border-blue-200"
                        : "bg-slate-50 border border-slate-200"
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[9px] py-0">
                          {m.messageType.replace(/_/g, " ")}
                        </Badge>
                        {m.senderUser && (
                          <span className="text-[10px] text-slate-500">
                            {m.senderUser.firstName} {m.senderUser.lastName}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          {formatDate(m.createdAt, true)}
                        </span>
                      </div>
                      <div className="text-slate-700 whitespace-pre-wrap">{m.message}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {/* Compose */}
            <div className="border-t border-slate-200 pt-2 space-y-2">
              <div className="flex items-center gap-2">
                <Select value={newMessageType} onValueChange={setNewMessageType}>
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="message">Message</SelectItem>
                    <SelectItem value="info_request">Info Request</SelectItem>
                    <SelectItem value="info_response">Info Response</SelectItem>
                    <SelectItem value="phone_call_log">Phone Call Log</SelectItem>
                    <SelectItem value="system_note">System Note</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || sendingMessage}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                >
                  {sendingMessage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send
                </Button>
              </div>
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                rows={2}
                className="text-sm"
              />
            </div>
          </div>
        )}

        {/* ===== ACTIONS ===== */}
        {activeSection === "actions" && (
          <div className="space-y-3">
            {/* Role indicator banner */}
            <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
              userRole === "referring"
                ? "bg-blue-50 border-blue-200 text-blue-800"
                : userRole === "receiving"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-slate-50 border-slate-200 text-slate-600"
            }`}>
              {userRole === "referring" && (
                <>
                  <ArrowRight className="w-4 h-4" />
                  <span>
                    <strong>Referring facility.</strong> You are the sender. Actions
                    below let you transmit, redirect, request information, and close
                    the referral. Accept/Reject/Complete are performed by the
                    receiving facility.
                  </span>
                </>
              )}
              {userRole === "receiving" && (
                <>
                  <ArrowLeft className="w-4 h-4" />
                  <span>
                    <strong>Receiving facility.</strong> You are the destination.
                    Actions below let you acknowledge, accept/reject, schedule,
                    confirm arrival, mark completion, and submit counter-referral
                    feedback.
                  </span>
                </>
              )}
              {userRole === "observer" && (
                <>
                  <FileText className="w-4 h-4" />
                  <span>
                    <strong>Read-only view.</strong> Your facility is neither the
                    referrer nor the receiver for this referral. You can view the
                    timeline and details but cannot perform lifecycle actions.
                  </span>
                </>
              )}
            </div>

            {userRole === "observer" ? (
              <div className="text-center py-8 text-sm text-slate-400">
                No actions available — your facility is not a party to this referral.
              </div>
            ) : (
              <div className="space-y-4">
                {/* ===== REFERRING FACILITY ACTIONS ===== */}
                {userRole === "referring" && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                      <ArrowRight className="w-3.5 h-3.5" /> Referring Facility Actions
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {/* draft → submitted (advance from draft) */}
                      {r.status === "draft" && (
                        <ActionButton
                          icon={FileText}
                          label="Submit"
                          color="blue"
                          loading={actionLoading}
                          onClick={() => handleStatusAction("submitted", "Submit")}
                          description="Mark as ready to send"
                        />
                      )}
                      {/* submitted / authorized → sent (transmit) */}
                      {["submitted", "authorized"].includes(r.status) && (
                        <ActionButton
                          icon={Send}
                          label="Send"
                          color="blue"
                          loading={actionLoading}
                          onClick={() => handleStatusAction("sent", "Send")}
                          description="Transmit to receiving facility"
                        />
                      )}
                      {/* sent / acknowledged → redirect (change destination) */}
                      {["sent", "acknowledged"].includes(r.status) && (
                        <ActionButton
                          icon={MapPin}
                          label="Redirect"
                          color="amber"
                          loading={actionLoading}
                          onClick={() => {
                            const newFacilityId = window.prompt("Enter new receiving facility ID (from HMIS directory):");
                            if (!newFacilityId) return;
                            const reason = window.prompt("Reason for redirect:");
                            if (reason) {
                              patchReferral(
                                { action: "redirect", newReceivingFacilityId: newFacilityId, redirectReason: reason },
                                "Referral redirected"
                              );
                            }
                          }}
                          description="Change destination facility"
                        />
                      )}
                      {/* completed → mark feedback received (after receiving submits feedback) */}
                      {r.status === "completed" && (
                        <ActionButton
                          icon={ClipboardList}
                          label="Mark Feedback Received"
                          color="indigo"
                          loading={actionLoading}
                          onClick={() => handleStatusAction("feedback_received", "Mark feedback received")}
                          description="Acknowledge counter-referral"
                        />
                      )}
                      {/* completed / feedback_received → close */}
                      {["completed", "feedback_received", "follow_up", "rejected"].includes(r.status) && (
                        <ActionButton
                          icon={CheckCheck}
                          label="Close"
                          color="emerald"
                          loading={actionLoading}
                          onClick={() => {
                            const reason = window.prompt("Closure reason:");
                            if (reason) patchReferral({ action: "close", closureReason: reason }, "Referral closed");
                          }}
                          description="Finalize the referral lifecycle"
                        />
                      )}
                      {/* Request more information (jump to Messages tab) */}
                      {["sent", "acknowledged", "accepted", "scheduled", "in_transit", "arrived", "under_care", "completed"].includes(r.status) && (
                        <ActionButton
                          icon={MessageSquare}
                          label="Request Information"
                          color="indigo"
                          loading={false}
                          onClick={() => {
                            setActiveSection("messages");
                            setNewMessageType("info_request");
                          }}
                          description="Ask the receiving team a question"
                        />
                      )}
                      {/* Cancel — available from most non-terminal statuses */}
                      {!["cancelled", "closed", "expired", "rejected"].includes(r.status) && (
                        <ActionButton
                          icon={Ban}
                          label="Cancel Referral"
                          color="rose"
                          loading={actionLoading}
                          onClick={() => {
                            const reason = window.prompt("Cancellation reason:");
                            if (reason) patchReferral({ action: "cancel", cancellationReason: reason }, "Referral cancelled");
                          }}
                          description="Withdraw this referral"
                        />
                      )}
                      {/* Delete — only for unsent drafts */}
                      {r.status === "draft" && (
                        <ActionButton
                          icon={XCircle}
                          label="Delete Draft"
                          color="rose"
                          loading={actionLoading}
                          onClick={() => {
                            if (window.confirm("Permanently delete this draft referral? This cannot be undone.")) {
                              fetch(`/api/referrals/${referralId}`, { method: "DELETE" })
                                .then(() => {
                                  toast.success("Draft deleted");
                                  onClose();
                                  onUpdated();
                                })
                                .catch((e) => toast.error(e.message));
                            }
                          }}
                          description="Permanently remove draft"
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* ===== RECEIVING FACILITY ACTIONS ===== */}
                {userRole === "receiving" && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                      <ArrowLeft className="w-3.5 h-3.5" /> Receiving Facility Actions
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {/* sent → acknowledge (confirm receipt) */}
                      {r.status === "sent" && (
                        <ActionButton
                          icon={CheckCircle2}
                          label="Acknowledge"
                          color="blue"
                          loading={actionLoading}
                          onClick={() => handleStatusAction("acknowledged", "Acknowledge")}
                          description="Confirm receipt of referral"
                        />
                      )}
                      {/* sent / acknowledged → accept */}
                      {["sent", "acknowledged"].includes(r.status) && (
                        <ActionButton
                          icon={CheckCheck}
                          label="Accept"
                          color="emerald"
                          loading={actionLoading}
                          onClick={() => handleStatusAction("accepted", "Accept")}
                          description="Agree to receive patient"
                        />
                      )}
                      {/* sent / acknowledged → reject (with reason) */}
                      {["sent", "acknowledged"].includes(r.status) && (
                        <ActionButton
                          icon={XCircle}
                          label="Reject"
                          color="rose"
                          loading={actionLoading}
                          onClick={() => {
                            const reason = window.prompt("Rejection reason (required):");
                            if (reason) patchReferral({ status: "rejected", rejectionReason: reason }, "Referral rejected");
                          }}
                          description="Decline to receive"
                        />
                      )}
                      {/* accepted → schedule appointment */}
                      {r.status === "accepted" && (
                        <ActionButton
                          icon={Calendar}
                          label="Schedule"
                          color="blue"
                          loading={actionLoading}
                          onClick={() => handleStatusAction("scheduled", "Schedule")}
                          description="Book appointment for patient"
                        />
                      )}
                      {/* accepted / scheduled → mark in transit */}
                      {["accepted", "scheduled"].includes(r.status) && (
                        <ActionButton
                          icon={MapPin}
                          label="In Transit"
                          color="amber"
                          loading={actionLoading}
                          onClick={() => handleStatusAction("in_transit", "Mark in transit")}
                          description="Patient is on the way"
                        />
                      )}
                      {/* in_transit → confirm arrival */}
                      {r.status === "in_transit" && (
                        <ActionButton
                          icon={MapPin}
                          label="Confirm Arrival"
                          color="emerald"
                          loading={actionLoading}
                          onClick={() => handleStatusAction("arrived", "Confirm arrival")}
                          description="Patient has arrived"
                        />
                      )}
                      {/* arrived → mark under care */}
                      {r.status === "arrived" && (
                        <ActionButton
                          icon={Stethoscope}
                          label="Under Care"
                          color="blue"
                          loading={actionLoading}
                          onClick={() => handleStatusAction("under_care", "Mark under care")}
                          description="Begin clinical management"
                        />
                      )}
                      {/* under_care → complete */}
                      {r.status === "under_care" && (
                        <ActionButton
                          icon={CheckCircle2}
                          label="Complete"
                          color="emerald"
                          loading={actionLoading}
                          onClick={() => handleStatusAction("completed", "Complete")}
                          description="Finish clinical management"
                        />
                      )}
                      {/* completed / feedback_received / follow_up → submit feedback (counter-referral) */}
                      {["completed", "feedback_received", "follow_up"].includes(r.status) && (
                        <ActionButton
                          icon={ClipboardList}
                          label="Submit Feedback"
                          color="indigo"
                          loading={false}
                          onClick={() => {
                            setActiveSection("feedback");
                            setShowFeedbackForm(true);
                          }}
                          description="Send counter-referral to referring facility"
                        />
                      )}
                      {/* Request more info (jump to Messages tab) */}
                      {["sent", "acknowledged", "accepted", "scheduled", "in_transit", "arrived", "under_care", "completed"].includes(r.status) && (
                        <ActionButton
                          icon={MessageSquare}
                          label="Request Information"
                          color="indigo"
                          loading={false}
                          onClick={() => {
                            setActiveSection("messages");
                            setNewMessageType("info_request");
                          }}
                          description="Ask the referring team a question"
                        />
                      )}
                      {/* Respond to info request (jump to Messages tab) */}
                      <ActionButton
                        icon={MessageSquare}
                        label="Send Message"
                        color="blue"
                        loading={false}
                        onClick={() => {
                          setActiveSection("messages");
                          setNewMessageType("info_response");
                        }}
                        description="Reply to referring facility"
                      />
                      {/* Cancel — receiving facility can also cancel (e.g., capacity unavailable) */}
                      {!["cancelled", "closed", "expired", "rejected"].includes(r.status) && (
                        <ActionButton
                          icon={Ban}
                          label="Cancel"
                          color="rose"
                          loading={actionLoading}
                          onClick={() => {
                            const reason = window.prompt("Cancellation reason:");
                            if (reason) patchReferral({ action: "cancel", cancellationReason: reason }, "Referral cancelled");
                          }}
                          description="Cancel from receiving side"
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* ===== Current status info ===== */}
                <div className="text-xs text-slate-500 bg-slate-50 rounded-md p-2 border border-slate-200">
                  <strong className="text-slate-700">Current status:</strong>{" "}
                  <span className="font-mono">{r.status}</span>
                  {r.feedbackStatus && r.feedbackStatus !== "awaiting" && (
                    <>
                      {" · "}
                      <strong className="text-slate-700">Feedback:</strong>{" "}
                      <span className="font-mono">{r.feedbackStatus}</span>
                    </>
                  )}
                  <div className="mt-1 text-[10px] text-slate-400">
                    Only actions valid for the current status and your role are shown.
                    Each action is validated server-side and records a timeline event.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {confirmDialogEl}
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// ACTION BUTTON — for the detail dialog's Actions tab
// =====================================================================
function ActionButton({
  icon: Icon,
  label,
  color,
  onClick,
  loading,
  description,
}: {
  icon: any;
  label: string;
  color: "blue" | "emerald" | "rose" | "amber" | "indigo";
  onClick: () => void;
  loading?: boolean;
  description?: string;
}) {
  const colors = {
    blue: "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200",
    emerald: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200",
    amber: "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200",
    indigo: "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200",
  }[color];
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors disabled:opacity-50 ${colors}`}
    >
      <div className="flex items-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      {description && <span className="text-[10px] opacity-80">{description}</span>}
    </button>
  );
}

// =====================================================================
// FEEDBACK FORM — submit counter-referral feedback
// =====================================================================
function FeedbackForm({
  referralId,
  onClose,
  onSaved,
}: {
  referralId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [feedbackType, setFeedbackType] = useState("interim");
  const [clinicalFindings, setClinicalFindings] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatmentProvided, setTreatmentProvided] = useState("");
  const [proceduresPerformed, setProceduresPerformed] = useState("");
  const [investigationsDone, setInvestigationsDone] = useState("");
  const [outcome, setOutcome] = useState("");
  const [medicationsPrescribed, setMedicationsPrescribed] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [followUpPlan, setFollowUpPlan] = useState("");
  const [returnRecommendation, setReturnRecommendation] = useState("none");
  const [isFinal, setIsFinal] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!clinicalFindings.trim() && !diagnosis.trim() && !treatmentProvided.trim()) {
      toast.error("Please provide at least clinical findings, diagnosis, or treatment.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/referrals/${referralId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackType,
          clinicalFindings,
          diagnosis,
          treatmentProvided,
          proceduresPerformed,
          investigationsDone,
          outcome: outcome || undefined,
          medicationsPrescribed,
          recommendations,
          followUpPlan,
          returnRecommendation,
          isFinal,
        }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("Feedback submitted");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-800">New Feedback</h4>
          <div className="flex items-center gap-2">
            <Select value={feedbackType} onValueChange={setFeedbackType}>
              <SelectTrigger className="h-7 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interim">Interim</SelectItem>
                <SelectItem value="final">Final</SelectItem>
                <SelectItem value="discharge_summary">Discharge Summary</SelectItem>
                <SelectItem value="counter_referral">Counter-referral</SelectItem>
                <SelectItem value="specialist_response">Specialist Response</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={isFinal}
                onChange={(e) => setIsFinal(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              Mark as final
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Clinical Findings</Label>
            <Textarea value={clinicalFindings} onChange={(e) => setClinicalFindings(e.target.value)} rows={2} className="text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Diagnosis</Label>
            <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Treatment Provided</Label>
            <Textarea value={treatmentProvided} onChange={(e) => setTreatmentProvided(e.target.value)} rows={2} className="text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Procedures Performed</Label>
            <Input value={proceduresPerformed} onChange={(e) => setProceduresPerformed(e.target.value)} className="text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Investigations Done</Label>
            <Input value={investigationsDone} onChange={(e) => setInvestigationsDone(e.target.value)} className="text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Medications Prescribed</Label>
            <Input value={medicationsPrescribed} onChange={(e) => setMedicationsPrescribed(e.target.value)} className="text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Outcome</Label>
            <Select value={outcome || "none"} onValueChange={(v) => setOutcome(v === "none" ? "" : v)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="admitted">Admitted</SelectItem>
                <SelectItem value="treated_and_discharged">Treated & Discharged</SelectItem>
                <SelectItem value="procedure_completed">Procedure Completed</SelectItem>
                <SelectItem value="referred_further">Referred Further</SelectItem>
                <SelectItem value="returned_to_referring_facility">Returned to Referring Facility</SelectItem>
                <SelectItem value="patient_declined">Patient Declined</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Return Recommendation</Label>
            <Select value={returnRecommendation} onValueChange={setReturnRecommendation}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="follow_up_at_referring_facility">Follow-up at Referring Facility</SelectItem>
                <SelectItem value="follow_up_at_receiving_facility">Follow-up at Receiving Facility</SelectItem>
                <SelectItem value="refer_further">Refer Further</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Recommendations</Label>
          <Textarea value={recommendations} onChange={(e) => setRecommendations(e.target.value)} rows={2} className="text-xs" />
        </div>
        <div>
          <Label className="text-[10px]">Follow-up Plan</Label>
          <Textarea value={followUpPlan} onChange={(e) => setFollowUpPlan(e.target.value)} rows={2} className="text-xs" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Submitting..." : "Submit Feedback"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// HELPER — relative time formatter for the refresh indicator
// =====================================================================
function formatRelativeTime(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  const diff = Date.now() - timestamp;
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Baby, Plus, RefreshCw, Loader2, Activity, AlertTriangle,
  Search, Clock, Heart, Syringe, Calendar, TrendingUp, ChevronDown,
  CheckCircle2, Users, Stethoscope, FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge,
  formatDate, calculateAge, safeJson, PageHeader, MiniStatCard,
} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// =====================================================================
// MAIN VIEW
// =====================================================================
export function MaternityView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Maternity"
        description="Comprehensive maternal & obstetric care — pregnancy registration, ANC, labor & delivery, newborn, postnatal."
        icon={Baby}
        gradient="from-pink-500 to-rose-600"
      />

      {!activeFacilityId && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
            Select a facility to manage maternity records.
          </CardContent>
        </Card>
      )}

      {activeFacilityId && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-1.5">
              <Activity className="w-4 h-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="records" className="gap-1.5">
              <Baby className="w-4 h-4" /> Pregnancies
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <DashboardTab facilityId={activeFacilityId} />
          </TabsContent>
          <TabsContent value="records" className="space-y-4">
            <RecordsTab facilityId={activeFacilityId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab({ facilityId }: { facilityId: string }) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["maternity-stats", facilityId],
    queryFn: () => fetchJson(`/api/maternity/stats?facilityId=${facilityId}`),
    refetchInterval: 30000,
  });

  const kpis = data?.kpis || {};

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Activity className="w-4 h-4 text-pink-600" />
          Maternity KPIs
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
            {isFetching ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-pink-600" />
                <span className="text-pink-700 font-medium">Refreshing…</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3 text-slate-400" />
                <span>Auto-refresh every 30s</span>
              </>
            )}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              toast.promise(refetch(), {
                loading: "Refreshing…",
                success: "Data refreshed",
                error: "Refresh failed",
              });
            }}
            disabled={isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MiniStatCard
          label="Active Pregnancies"
          value={kpis.totalActive ?? 0}
          icon={Baby}
          gradient="from-pink-500 to-rose-600"
          sublabel="Currently registered"
        />
        <MiniStatCard
          label="New This Month"
          value={kpis.newThisMonth ?? 0}
          icon={TrendingUp}
          gradient="from-purple-500 to-pink-600"
          sublabel="New registrations"
        />
        <MiniStatCard
          label="High Risk"
          value={kpis.highRisk ?? 0}
          icon={AlertTriangle}
          gradient="from-orange-500 to-red-600"
          sublabel="Active high-risk"
        />
        <MiniStatCard
          label="Expected (7d)"
          value={kpis.expectedDeliveries ?? 0}
          icon={Calendar}
          gradient="from-blue-500 to-purple-600"
          sublabel="EDD within 7 days"
        />
        <MiniStatCard
          label="Deliveries Today"
          value={kpis.deliveriesToday ?? 0}
          icon={Heart}
          gradient="from-emerald-500 to-teal-600"
          sublabel="Delivered today"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard
          label="Deliveries (Month)"
          value={kpis.deliveriesThisMonth ?? 0}
          icon={CheckCircle2}
          gradient="from-teal-500 to-cyan-600"
        />
        <MiniStatCard
          label="Current Labor"
          value={kpis.currentLabor ?? 0}
          icon={Clock}
          gradient="from-amber-500 to-orange-600"
        />
        <MiniStatCard
          label="ANC Visits Today"
          value={kpis.ancVisitsToday ?? 0}
          icon={Stethoscope}
          gradient="from-indigo-500 to-blue-600"
        />
        <MiniStatCard
          label="Newborns (Month)"
          value={kpis.newbornsThisMonth ?? 0}
          icon={Baby}
          gradient="from-rose-500 to-pink-600"
        />
      </div>

      {/* Risk level breakdown */}
      {data?.byRiskLevel && Object.keys(data.byRiskLevel).length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-2">
            <AlertTriangle className="w-4 h-4 text-orange-600" />
            Risk Level Breakdown (Active Pregnancies)
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {(["low", "moderate", "high"] as const).map((level) => {
              const count = data.byRiskLevel[level] || 0;
              const colors = {
                low: "bg-emerald-50 border-emerald-200 text-emerald-800",
                moderate: "bg-amber-50 border-amber-200 text-amber-800",
                high: "bg-rose-50 border-rose-200 text-rose-800",
              };
              return (
                <Card key={level} className={`border ${colors[level]}`}>
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-extrabold">{count}</div>
                    <div className="text-xs font-medium capitalize">{level} risk</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// =====================================================================
// RECORDS TAB — list + register + detail
// =====================================================================
function RecordsTab({ facilityId }: { facilityId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params = new URLSearchParams();
  params.set("facilityId", facilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (riskFilter !== "all") params.set("riskLevel", riskFilter);
  if (search.trim()) params.set("search", search.trim());
  params.set("limit", "200");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["maternity", facilityId, statusFilter, riskFilter, search],
    queryFn: () => fetchJson(`/api/maternity?${params.toString()}`),
  });

  const items = data?.items || [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["maternity"] });
    qc.invalidateQueries({ queryKey: ["maternity-stats"] });
  };

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient name, MRN, or phone…"
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[140px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="miscarried">Miscarried</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
                <SelectItem value="referred">Referred</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="h-9 w-[130px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risk</SelectItem>
                <SelectItem value="low">Low risk</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="high">High risk</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-pink-600 hover:bg-pink-700"
              onClick={() => setShowNew(true)}
            >
              <Plus className="w-4 h-4" /> Register Pregnancy
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No maternity records"
              description="Register a new pregnancy to get started."
              icon={Baby}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((r: any) => (
            <PregnancyCard key={r.id} record={r} onClick={() => setSelectedId(r.id)} />
          ))}
        </div>
      )}

      {showNew && (
        <NewPregnancyDialog
          facilityId={facilityId}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            invalidate();
          }}
        />
      )}

      {selectedId && (
        <PregnancyDetailDialog
          recordId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={invalidate}
        />
      )}
    </>
  );
}

// =====================================================================
// PREGNANCY CARD — list row
// =====================================================================
function PregnancyCard({ record: r, onClick }: { record: any; onClick: () => void }) {
  const riskColors: Record<string, string> = {
    low: "bg-emerald-100 text-emerald-700 border-emerald-200",
    moderate: "bg-amber-100 text-amber-700 border-amber-200",
    high: "bg-rose-100 text-rose-700 border-rose-200",
  };

  const eddDaysLeft = r.eddFinal
    ? Math.ceil((new Date(r.eddFinal).getTime() - Date.now()) / MS_PER_DAY)
    : null;

  return (
    <Card
      className="cursor-pointer hover:shadow-md hover:border-pink-300 transition-all"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-slate-900">
                {r.patient?.firstName} {r.patient?.lastName}
              </span>
              <span className="text-xs text-slate-500">
                {r.patient?.patientNumber} · {calculateAge(r.patient?.dateOfBirth)}y
              </span>
              <Badge variant="outline" className={`text-[10px] ${riskColors[r.riskLevel] || riskColors.low}`}>
                {r.riskLevel} risk
              </Badge>
              <StatusBadge status={r.pregnancyStatus} />
              {r.pregnancyType && r.pregnancyType !== "singleton" && (
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {r.pregnancyType.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span>G{r.gravida ?? "?"} P{r.para ?? "?"}</span>
              {r.eddFinal && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  EDD: {formatDate(r.eddFinal)}
                  {eddDaysLeft !== null && eddDaysLeft > 0 && (
                    <span className="text-pink-600">({eddDaysLeft}d)</span>
                  )}
                  {eddDaysLeft !== null && eddDaysLeft <= 0 && r.pregnancyStatus === "active" && (
                    <span className="text-rose-600 font-medium">(overdue)</span>
                  )}
                </span>
              )}
              {r._count?.ancVisits > 0 && (
                <span className="flex items-center gap-1">
                  <Stethoscope className="w-3 h-3" /> {r._count.ancVisits} ANC visits
                </span>
              )}
              {r.newborns?.length > 0 && (
                <span className="flex items-center gap-1">
                  <Baby className="w-3 h-3" /> {r.newborns.length} newborn(s)
                </span>
              )}
            </div>
            {r.antenatalNotes && (
              <div className="text-sm text-slate-600 mt-1 line-clamp-1">{r.antenatalNotes}</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// NEW PREGNANCY DIALOG
// =====================================================================
function NewPregnancyDialog({
  facilityId,
  onClose,
  onCreated,
}: {
  facilityId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [gravida, setGravida] = useState("");
  const [para, setPara] = useState("");
  const [abortions, setAbortions] = useState("");
  const [livingChildren, setLivingChildren] = useState("");
  const [lmp, setLmp] = useState("");
  const [eddFinal, setEddFinal] = useState("");
  const [pregnancyType, setPregnancyType] = useState("singleton");
  const [riskLevel, setRiskLevel] = useState("low");
  const [bloodGroup, setBloodGroup] = useState("");
  const [rhStatus, setRhStatus] = useState("");
  const [antenatalNotes, setAntenatalNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  // Auto-calculate EDD from LMP (LMP + 280 days)
  const computedEdd = lmp
    ? new Date(new Date(lmp).getTime() + 280 * MS_PER_DAY).toISOString().slice(0, 10)
    : "";

  const submit = async () => {
    if (!patientId || !facilityId) {
      toast.error("Patient and facility are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/maternity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          facilityId,
          gravida: gravida ? parseInt(gravida) : undefined,
          para: para ? parseInt(para) : undefined,
          abortions: abortions ? parseInt(abortions) : undefined,
          livingChildren: livingChildren ? parseInt(livingChildren) : undefined,
          lmp: lmp || undefined,
          eddFinal: eddFinal || computedEdd || undefined,
          pregnancyType,
          riskLevel,
          bloodGroup: bloodGroup || undefined,
          rhStatus: rhStatus || undefined,
          antenatalNotes: antenatalNotes || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Pregnancy registered");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Baby className="w-5 h-5 text-pink-600" />
            Register Pregnancy
          </DialogTitle>
          <DialogDescription>
            Create a new pregnancy episode. EDD is auto-calculated from LMP (LMP + 280 days).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
                      setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
                    }}
                    className="w-full text-left p-2 hover:bg-pink-50 text-sm border-b last:border-0"
                  >
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">
                      {p.patientNumber} · {calculateAge(p.dateOfBirth)}y · {p.sex?.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Obstetric history */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label>Gravida</Label>
              <Input type="number" min={1} value={gravida} onChange={(e) => setGravida(e.target.value)} placeholder="G" />
            </div>
            <div>
              <Label>Para</Label>
              <Input type="number" min={0} value={para} onChange={(e) => setPara(e.target.value)} placeholder="P" />
            </div>
            <div>
              <Label>Abortions</Label>
              <Input type="number" min={0} value={abortions} onChange={(e) => setAbortions(e.target.value)} placeholder="A" />
            </div>
            <div>
              <Label>Living Children</Label>
              <Input type="number" min={0} value={livingChildren} onChange={(e) => setLivingChildren(e.target.value)} placeholder="LC" />
            </div>
          </div>

          {/* Pregnancy dating */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>LMP Date</FieldLabel>
              <Input type="date" value={lmp} onChange={(e) => setLmp(e.target.value)} />
            </div>
            <div>
              <FieldLabel>EDD (auto-calculated)</FieldLabel>
              <Input
                type="date"
                value={eddFinal || computedEdd}
                onChange={(e) => setEddFinal(e.target.value)}
                placeholder={computedEdd || "Auto from LMP"}
              />
              {lmp && !eddFinal && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Auto-calculated: {computedEdd} (override if needed)
                </p>
              )}
            </div>
          </div>

          {/* Pregnancy details */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Pregnancy Type</Label>
              <Select value={pregnancyType} onValueChange={setPregnancyType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="singleton">Singleton</SelectItem>
                  <SelectItem value="twin">Twin</SelectItem>
                  <SelectItem value="triplet">Triplet</SelectItem>
                  <SelectItem value="higher_order">Higher order</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Risk Level</Label>
              <Select value={riskLevel} onValueChange={setRiskLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Blood Group</Label>
              <Input value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} placeholder="O+, A-, etc." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rh Status</Label>
              <Select value={rhStatus || "none"} onValueChange={(v) => setRhStatus(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Antenatal Notes</Label>
            <Textarea value={antenatalNotes} onChange={(e) => setAntenatalNotes(e.target.value)} rows={2} placeholder="Initial assessment notes, risk factors, etc." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-pink-600 hover:bg-pink-700">
            {saving ? "Registering…" : "Register Pregnancy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// PREGNANCY DETAIL DIALOG — full lifecycle view with tabs
// =====================================================================
function PregnancyDetailDialog({
  recordId,
  onClose,
  onUpdated,
}: {
  recordId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [activeTab, setActiveTab] = useState("overview");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["maternity-detail", recordId],
    queryFn: () => fetchJson(`/api/maternity/${recordId}`),
  });

  if (isLoading) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-4xl">
          <LoadingState rows={5} />
        </DialogContent>
      </Dialog>
    );
  }

  if (isError || !data?.item) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-4xl">
          <ErrorState message="Failed to load maternity record" onRetry={() => refetch()} />
        </DialogContent>
      </Dialog>
    );
  }

  const r = data.item;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Baby className="w-5 h-5 text-pink-600" />
            <span>Pregnancy — {r.patient?.firstName} {r.patient?.lastName}</span>
            <StatusBadge status={r.pregnancyStatus} />
            <Badge variant="outline" className={`text-[10px] ${
              r.riskLevel === "high" ? "bg-rose-100 text-rose-700 border-rose-200"
              : r.riskLevel === "moderate" ? "bg-amber-100 text-amber-700 border-amber-200"
              : "bg-emerald-100 text-emerald-700 border-emerald-200"
            }`}>
              {r.riskLevel} risk
            </Badge>
          </DialogTitle>
          <DialogDescription>
            G{r.gravida ?? "?"} P{r.para ?? "?"} · EDD: {r.eddFinal ? formatDate(r.eddFinal) : "—"}
          </DialogDescription>
        </DialogHeader>

        {/* Section tabs */}
        <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
          {[
            { id: "overview", label: "Overview", icon: FileText },
            { id: "anc", label: `ANC (${r.ancVisits?.length || 0})`, icon: Stethoscope },
            { id: "newborn", label: `Newborns (${r.newborns?.length || 0})`, icon: Baby },
            { id: "labor", label: "Labor & Delivery", icon: Heart },
            { id: "postnatal", label: `Postnatal (${r.postnatalVisits?.length || 0})`, icon: CheckCircle2 },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveTab(s.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors ${
                activeTab === s.id
                  ? "bg-pink-100 text-pink-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && <OverviewSection record={r} />}
        {activeTab === "anc" && <AncSection recordId={recordId} visits={r.ancVisits || []} onUpdated={() => { refetch(); onUpdated(); }} />}
        {activeTab === "newborn" && <NewbornSection recordId={recordId} newborns={r.newborns || []} onUpdated={() => { refetch(); onUpdated(); }} />}
        {activeTab === "labor" && <LaborSection recordId={recordId} labor={r.laborAndDelivery} onUpdated={() => { refetch(); onUpdated(); }} />}
        {activeTab === "postnatal" && <PostnatalSection recordId={recordId} visits={r.postnatalVisits || []} onUpdated={() => { refetch(); onUpdated(); }} />}
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// OVERVIEW SECTION
// =====================================================================
function OverviewSection({ record: r }: { record: any }) {
  const eddDaysLeft = r.eddFinal
    ? Math.ceil((new Date(r.eddFinal).getTime() - Date.now()) / MS_PER_DAY)
    : null;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Patient</div>
            <div className="font-medium">{r.patient?.firstName} {r.patient?.lastName}</div>
            <div className="text-slate-500">{r.patient?.patientNumber} · {calculateAge(r.patient?.dateOfBirth)}y</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Obstetric</div>
            <div>G{r.gravida ?? "?"} P{r.para ?? "?"} A{r.abortions ?? "?"}</div>
            <div className="text-slate-500">Living: {r.livingChildren ?? "?"}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">EDD</div>
            <div>{r.eddFinal ? formatDate(r.eddFinal) : "—"}</div>
            {eddDaysLeft !== null && (
              <div className={eddDaysLeft > 0 ? "text-pink-600" : "text-rose-600"}>
                {eddDaysLeft > 0 ? `${eddDaysLeft} days` : `${Math.abs(eddDaysLeft)}d overdue`}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">LMP</div>
            <div>{r.lmp ? formatDate(r.lmp) : "—"}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Blood Group</div>
            <div>{r.bloodGroup || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Rh Status</div>
            <div>{r.rhStatus || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Pregnancy Type</div>
            <div className="capitalize">{r.pregnancyType?.replace(/_/g, " ") || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Risk Level</div>
            <div className="capitalize font-medium">{r.riskLevel}</div>
          </div>
        </CardContent>
      </Card>

      {r.antenatalNotes && (
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-400 uppercase mb-1">Antenatal Notes</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{r.antenatalNotes}</div>
          </CardContent>
        </Card>
      )}

      {r.deliveryDate && (
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-slate-400 uppercase mb-1">Delivery Summary</div>
            <div className="text-sm">
              {formatDate(r.deliveryDate, true)} · {r.deliveryType?.replace(/_/g, " ") || "—"} · {r.birthOutcome?.replace(/_/g, " ") || "—"}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// ANC SECTION
// =====================================================================
function AncSection({ recordId, visits, onUpdated }: { recordId: string; visits: any[]; onUpdated: () => void }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Antenatal care visits — vitals, examination, assessment.</p>
        <Button size="sm" className="gap-1.5 bg-pink-600 hover:bg-pink-700" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" /> Record ANC Visit
        </Button>
      </div>

      {visits.length === 0 ? (
        <EmptyState title="No ANC visits" description="Record antenatal care visits here." icon={Stethoscope} />
      ) : (
        <div className="space-y-2">
          {visits.map((v: any) => (
            <Card key={v.id}>
              <CardContent className="p-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {v.gestationalAge ? `${v.gestationalAge}w` : "GA?"}
                    </Badge>
                    <span className="font-medium text-slate-700">{formatDate(v.visitDate, true)}</span>
                  </div>
                  {v.recordedBy && (
                    <span className="text-[10px] text-slate-400">
                      by {v.recordedBy.firstName} {v.recordedBy.lastName}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  {v.weight && <div><span className="text-slate-400">Weight:</span> {v.weight}kg</div>}
                  {v.bpSystolic && <div><span className="text-slate-400">BP:</span> {v.bpSystolic}/{v.bpDiastolic}</div>}
                  {v.fundalHeight && <div><span className="text-slate-400">Fundal:</span> {v.fundalHeight}cm</div>}
                  {v.fetalHeartRate && <div><span className="text-slate-400">FHR:</span> {v.fetalHeartRate}bpm</div>}
                  {v.fetalMovement && <div><span className="text-slate-400">FM:</span> {v.fetalMovement}</div>}
                  {v.presentation && <div><span className="text-slate-400">Pres:</span> {v.presentation}</div>}
                </div>
                {v.symptoms && <div className="mt-1 text-slate-600"><span className="text-slate-400">Symptoms:</span> {v.symptoms}</div>}
                {v.clinicalAssessment && <div className="mt-1 text-slate-600"><span className="text-slate-400">Assessment:</span> {v.clinicalAssessment}</div>}
                {v.nextVisitDate && <div className="mt-1 text-pink-600">Next visit: {formatDate(v.nextVisitDate)}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <AncVisitForm
          recordId={recordId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); onUpdated(); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// ANC VISIT FORM
// =====================================================================
function AncVisitForm({ recordId, onClose, onSaved }: { recordId: string; onClose: () => void; onSaved: () => void }) {
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 16));
  const [gestationalAge, setGestationalAge] = useState("");
  const [weight, setWeight] = useState("");
  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");
  const [fundalHeight, setFundalHeight] = useState("");
  const [fetalHeartRate, setFetalHeartRate] = useState("");
  const [fetalMovement, setFetalMovement] = useState("present");
  const [presentation, setPresentation] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [clinicalAssessment, setClinicalAssessment] = useState("");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/maternity/${recordId}/anc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitDate,
          gestationalAge: gestationalAge ? parseInt(gestationalAge) : undefined,
          weight: weight ? parseFloat(weight) : undefined,
          bpSystolic: bpSystolic ? parseInt(bpSystolic) : undefined,
          bpDiastolic: bpDiastolic ? parseInt(bpDiastolic) : undefined,
          fundalHeight: fundalHeight ? parseFloat(fundalHeight) : undefined,
          fetalHeartRate: fetalHeartRate ? parseInt(fetalHeartRate) : undefined,
          fetalMovement,
          presentation: presentation || undefined,
          symptoms: symptoms || undefined,
          clinicalAssessment: clinicalAssessment || undefined,
          nextVisitDate: nextVisitDate || undefined,
          notes: notes || undefined,
          createAppointment: !!nextVisitDate,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      const extras: string[] = [];
      if (data.appointmentId) extras.push("next appointment booked");
      toast.success(
        extras.length > 0 ? `ANC visit recorded — ${extras.join(" + ")}` : "ANC visit recorded"
      );
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-pink-200 bg-pink-50/30">
      <CardContent className="p-3 space-y-2">
        <h4 className="text-sm font-semibold text-slate-800">New ANC Visit</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <Label className="text-[10px]">Date/Time</Label>
            <Input type="datetime-local" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">GA (weeks)</Label>
            <Input type="number" value={gestationalAge} onChange={(e) => setGestationalAge(e.target.value)} className="h-8 text-xs" placeholder="wks" />
          </div>
          <div>
            <Label className="text-[10px]">Weight (kg)</Label>
            <Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-8 text-xs" placeholder="kg" />
          </div>
          <div>
            <Label className="text-[10px]">BP (sys/dia)</Label>
            <div className="flex gap-1">
              <Input type="number" value={bpSystolic} onChange={(e) => setBpSystolic(e.target.value)} className="h-8 text-xs" placeholder="sys" />
              <Input type="number" value={bpDiastolic} onChange={(e) => setBpDiastolic(e.target.value)} className="h-8 text-xs" placeholder="dia" />
            </div>
          </div>
          <div>
            <Label className="text-[10px]">Fundal Height (cm)</Label>
            <Input type="number" step="0.1" value={fundalHeight} onChange={(e) => setFundalHeight(e.target.value)} className="h-8 text-xs" placeholder="cm" />
          </div>
          <div>
            <Label className="text-[10px]">FHR (bpm)</Label>
            <Input type="number" value={fetalHeartRate} onChange={(e) => setFetalHeartRate(e.target.value)} className="h-8 text-xs" placeholder="bpm" />
          </div>
          <div>
            <Label className="text-[10px]">Fetal Movement</Label>
            <Select value={fetalMovement} onValueChange={setFetalMovement}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="reduced">Reduced</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="not_assessed">Not assessed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Presentation</Label>
            <Select value={presentation || "none"} onValueChange={(v) => setPresentation(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="cephalic">Cephalic</SelectItem>
                <SelectItem value="breech">Breech</SelectItem>
                <SelectItem value="transverse">Transverse</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Symptoms / Complaints</Label>
          <Input value={symptoms} onChange={(e) => setSymptoms(e.target.value)} className="h-8 text-xs" placeholder="Patient complaints" />
        </div>
        <div>
          <Label className="text-[10px]">Clinical Assessment</Label>
          <Textarea value={clinicalAssessment} onChange={(e) => setClinicalAssessment(e.target.value)} rows={2} className="text-xs" placeholder="Clinical findings, diagnosis, plan" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Next Visit Date</Label>
            <Input type="date" value={nextVisitDate} onChange={(e) => setNextVisitDate(e.target.value)} className="h-8 text-xs" />
            {nextVisitDate && (
              <p className="text-[9px] text-pink-600 mt-0.5">✓ Auto-books an ANC appointment</p>
            )}
          </div>
          <div>
            <Label className="text-[10px]">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8 text-xs" placeholder="Additional notes" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving} className="bg-pink-600 hover:bg-pink-700">
            {saving ? "Saving…" : "Record Visit"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// NEWBORN SECTION
// =====================================================================
function NewbornSection({ recordId, newborns, onUpdated }: { recordId: string; newborns: any[]; onUpdated: () => void }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Newborn records linked to this delivery.</p>
        <Button size="sm" className="gap-1.5 bg-pink-600 hover:bg-pink-700" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" /> Add Newborn
        </Button>
      </div>

      {newborns.length === 0 ? (
        <EmptyState title="No newborn records" description="Record newborn details after delivery." icon={Baby} />
      ) : (
        <div className="space-y-2">
          {newborns.map((nb: any, i: number) => (
            <Card key={nb.id}>
              <CardContent className="p-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">Baby {i + 1}</Badge>
                    <span className="font-medium text-slate-700">
                      {nb.babyName || `Baby ${nb.sex === "male" ? "Boy" : nb.sex === "female" ? "Girl" : "Unknown"}`}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">{formatDate(nb.birthDate, true)}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  <div><span className="text-slate-400">Sex:</span> {nb.sex || "—"}</div>
                  <div><span className="text-slate-400">Weight:</span> {nb.birthWeight ? `${nb.birthWeight}kg` : "—"}</div>
                  <div><span className="text-slate-400">APGAR:</span> {nb.apgar1 ?? "?"}/{nb.apgar5 ?? "?"}/{nb.apgar10 ?? "?"}</div>
                  <div><span className="text-slate-400">GA:</span> {nb.gestationalAge ? `${nb.gestationalAge}w` : "—"}</div>
                  {nb.feedingStatus && <div><span className="text-slate-400">Feeding:</span> {nb.feedingStatus}</div>}
                  {nb.outcome && <div><span className="text-slate-400">Outcome:</span> {nb.outcome.replace(/_/g, " ")}</div>}
                </div>
                {nb.notes && <div className="mt-1 text-slate-600">{nb.notes}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <NewbornForm
          recordId={recordId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); onUpdated(); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// NEWBORN FORM
// =====================================================================
function NewbornForm({ recordId, onClose, onSaved }: { recordId: string; onClose: () => void; onSaved: () => void }) {
  const [birthDate, setBirthDate] = useState(new Date().toISOString().slice(0, 16));
  const [sex, setSex] = useState("");
  const [birthWeight, setBirthWeight] = useState("");
  const [birthLength, setBirthLength] = useState("");
  const [headCircumference, setHeadCircumference] = useState("");
  const [apgar1, setApgar1] = useState("");
  const [apgar5, setApgar5] = useState("");
  const [apgar10, setApgar10] = useState("");
  const [gestationalAge, setGestationalAge] = useState("");
  const [feedingStatus, setFeedingStatus] = useState("");
  const [resuscitation, setResuscitation] = useState("none");
  const [complications, setComplications] = useState("");
  const [outcome, setOutcome] = useState("stable");
  const [babyName, setBabyName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!birthDate) {
      toast.error("Birth date is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/maternity/${recordId}/newborns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate,
          sex: sex || undefined,
          birthWeight: birthWeight ? parseFloat(birthWeight) : undefined,
          birthLength: birthLength ? parseFloat(birthLength) : undefined,
          headCircumference: headCircumference ? parseFloat(headCircumference) : undefined,
          apgar1: apgar1 ? parseInt(apgar1) : undefined,
          apgar5: apgar5 ? parseInt(apgar5) : undefined,
          apgar10: apgar10 ? parseInt(apgar10) : undefined,
          gestationalAge: gestationalAge ? parseInt(gestationalAge) : undefined,
          feedingStatus: feedingStatus || undefined,
          resuscitation,
          complications: complications || undefined,
          outcome,
          babyName: babyName || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Newborn recorded");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-pink-200 bg-pink-50/30">
      <CardContent className="p-3 space-y-2">
        <h4 className="text-sm font-semibold text-slate-800">New Newborn Record</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <Label className="text-[10px]">Birth Date/Time</Label>
            <Input type="datetime-local" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Sex</Label>
            <Select value={sex || "unknown"} onValueChange={setSex}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Birth Weight (kg)</Label>
            <Input type="number" step="0.01" value={birthWeight} onChange={(e) => setBirthWeight(e.target.value)} className="h-8 text-xs" placeholder="kg" />
          </div>
          <div>
            <Label className="text-[10px]">Length (cm)</Label>
            <Input type="number" step="0.1" value={birthLength} onChange={(e) => setBirthLength(e.target.value)} className="h-8 text-xs" placeholder="cm" />
          </div>
          <div>
            <Label className="text-[10px]">Head Circ. (cm)</Label>
            <Input type="number" step="0.1" value={headCircumference} onChange={(e) => setHeadCircumference(e.target.value)} className="h-8 text-xs" placeholder="cm" />
          </div>
          <div>
            <Label className="text-[10px]">APGAR 1 min</Label>
            <Input type="number" min={0} max={10} value={apgar1} onChange={(e) => setApgar1(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">APGAR 5 min</Label>
            <Input type="number" min={0} max={10} value={apgar5} onChange={(e) => setApgar5(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">APGAR 10 min</Label>
            <Input type="number" min={0} max={10} value={apgar10} onChange={(e) => setApgar10(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">GA (weeks)</Label>
            <Input type="number" value={gestationalAge} onChange={(e) => setGestationalAge(e.target.value)} className="h-8 text-xs" placeholder="wks" />
          </div>
          <div>
            <Label className="text-[10px]">Feeding</Label>
            <Select value={feedingStatus || "none"} onValueChange={(v) => setFeedingStatus(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="breastfeeding">Breastfeeding</SelectItem>
                <SelectItem value="formula">Formula</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
                <SelectItem value="not_feeding">Not feeding</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Resuscitation</Label>
            <Select value={resuscitation} onValueChange={setResuscitation}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="stimulation">Stimulation</SelectItem>
                <SelectItem value="oxygen">Oxygen</SelectItem>
                <SelectItem value="bag_mask">Bag & Mask</SelectItem>
                <SelectItem value="intubation">Intubation</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stable">Stable</SelectItem>
                <SelectItem value="referred">Referred</SelectItem>
                <SelectItem value="admitted_nicu">Admitted NICU</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Baby Name (optional)</Label>
            <Input value={babyName} onChange={(e) => setBabyName(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Complications</Label>
            <Input value={complications} onChange={(e) => setComplications(e.target.value)} className="h-8 text-xs" placeholder="Neonatal complications" />
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-xs" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving} className="bg-pink-600 hover:bg-pink-700">
            {saving ? "Saving…" : "Record Newborn"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// LABOR SECTION
// =====================================================================
function LaborSection({ recordId, labor, onUpdated }: { recordId: string; labor: any; onUpdated: () => void }) {
  const [showForm, setShowForm] = useState(!labor);

  if (!labor && !showForm) {
    return (
      <div className="space-y-3">
        <EmptyState title="No labor & delivery record" description="Record labor assessment and delivery details here." icon={Heart} />
        <Button size="sm" className="gap-1.5 bg-pink-600 hover:bg-pink-700" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" /> Record Labor & Delivery
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {labor && !showForm && (
        <Card>
          <CardContent className="p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Labor & Delivery Record</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowForm(true)}>
                Edit
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {labor.admissionDate && <div><span className="text-slate-400">Admitted:</span> {formatDate(labor.admissionDate, true)}</div>}
              {labor.onsetOfLabor && <div><span className="text-slate-400">Onset:</span> {formatDate(labor.onsetOfLabor, true)}</div>}
              {labor.ruptureOfMembranes && <div><span className="text-slate-400">ROM:</span> {formatDate(labor.ruptureOfMembranes, true)}</div>}
              {labor.membraneStatus && <div><span className="text-slate-400">Membranes:</span> {labor.membraneStatus}</div>}
              {labor.cervicalDilation != null && <div><span className="text-slate-400">Dilation:</span> {labor.cervicalDilation}cm</div>}
              {labor.fetalHeartRate && <div><span className="text-slate-400">FHR:</span> {labor.fetalHeartRate}bpm</div>}
              {labor.deliveryDate && <div><span className="text-slate-400">Delivery:</span> {formatDate(labor.deliveryDate, true)}</div>}
              {labor.deliveryType && <div><span className="text-slate-400">Type:</span> {labor.deliveryType.replace(/_/g, " ")}</div>}
              {labor.estimatedBloodLoss != null && <div><span className="text-slate-400">EBL:</span> {labor.estimatedBloodLoss}mL</div>}
              {labor.maternalOutcome && <div><span className="text-slate-400">Maternal:</span> {labor.maternalOutcome}</div>}
            </div>
            {labor.notes && <div className="text-slate-600 mt-2">{labor.notes}</div>}
          </CardContent>
        </Card>
      )}

      {showForm && (
        <LaborForm
          recordId={recordId}
          existing={labor}
          onClose={() => { setShowForm(false); onUpdated(); }}
          onSaved={() => { setShowForm(false); onUpdated(); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// LABOR FORM (simplified — key fields)
// =====================================================================
function LaborForm({ recordId, existing, onClose, onSaved }: { recordId: string; existing: any; onClose: () => void; onSaved: () => void }) {
  const [admissionDate, setAdmissionDate] = useState(existing?.admissionDate ? new Date(existing.admissionDate).toISOString().slice(0, 16) : "");
  const [onsetOfLabor, setOnsetOfLabor] = useState(existing?.onsetOfLabor ? new Date(existing.onsetOfLabor).toISOString().slice(0, 16) : "");
  const [ruptureOfMembranes, setRuptureOfMembranes] = useState(existing?.ruptureOfMembranes ? new Date(existing.ruptureOfMembranes).toISOString().slice(0, 16) : "");
  const [membraneStatus, setMembraneStatus] = useState(existing?.membraneStatus || "");
  const [cervicalDilation, setCervicalDilation] = useState(existing?.cervicalDilation ?? "");
  const [fetalHeartRate, setFetalHeartRate] = useState(existing?.fetalHeartRate ?? "");
  const [deliveryDate, setDeliveryDate] = useState(existing?.deliveryDate ? new Date(existing.deliveryDate).toISOString().slice(0, 16) : "");
  const [deliveryType, setDeliveryType] = useState(existing?.deliveryType || "");
  const [deliveryIndication, setDeliveryIndication] = useState(existing?.deliveryIndication || "");
  const [estimatedBloodLoss, setEstimatedBloodLoss] = useState(existing?.estimatedBloodLoss ?? "");
  const [maternalOutcome, setMaternalOutcome] = useState(existing?.maternalOutcome || "");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/maternity/${recordId}/labor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissionDate: admissionDate || undefined,
          onsetOfLabor: onsetOfLabor || undefined,
          ruptureOfMembranes: ruptureOfMembranes || undefined,
          membraneStatus: membraneStatus || undefined,
          cervicalDilation: cervicalDilation ? parseInt(cervicalDilation) : undefined,
          fetalHeartRate: fetalHeartRate ? parseInt(fetalHeartRate) : undefined,
          deliveryDate: deliveryDate || undefined,
          deliveryType: deliveryType || undefined,
          deliveryIndication: deliveryIndication || undefined,
          estimatedBloodLoss: estimatedBloodLoss ? parseInt(estimatedBloodLoss) : undefined,
          maternalOutcome: maternalOutcome || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Labor & delivery recorded");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-pink-200 bg-pink-50/30">
      <CardContent className="p-3 space-y-2">
        <h4 className="text-sm font-semibold text-slate-800">Labor & Delivery</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div>
            <Label className="text-[10px]">Admission Date</Label>
            <Input type="datetime-local" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Onset of Labor</Label>
            <Input type="datetime-local" value={onsetOfLabor} onChange={(e) => setOnsetOfLabor(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Rupture of Membranes</Label>
            <Input type="datetime-local" value={ruptureOfMembranes} onChange={(e) => setRuptureOfMembranes(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Membrane Status</Label>
            <Select value={membraneStatus || "none"} onValueChange={(v) => setMembraneStatus(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="intact">Intact</SelectItem>
                <SelectItem value="ruptured">Ruptured</SelectItem>
                <SelectItem value="artificial_rupture">Artificial rupture</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Cervical Dilation (cm)</Label>
            <Input type="number" min={0} max={10} value={cervicalDilation} onChange={(e) => setCervicalDilation(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Fetal Heart Rate (bpm)</Label>
            <Input type="number" value={fetalHeartRate} onChange={(e) => setFetalHeartRate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Delivery Date</Label>
            <Input type="datetime-local" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Delivery Type</Label>
            <Select value={deliveryType || "none"} onValueChange={(v) => setDeliveryType(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="spontaneous_vaginal">Spontaneous vaginal</SelectItem>
                <SelectItem value="assisted_vaginal">Assisted vaginal</SelectItem>
                <SelectItem value="cesarean">Caesarean section</SelectItem>
                <SelectItem value="breech">Breech</SelectItem>
                <SelectItem value="vacuum">Vacuum</SelectItem>
                <SelectItem value="forceps">Forceps</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Indication (if C-section/assisted)</Label>
            <Input value={deliveryIndication} onChange={(e) => setDeliveryIndication(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Est. Blood Loss (mL)</Label>
            <Input type="number" value={estimatedBloodLoss} onChange={(e) => setEstimatedBloodLoss(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Maternal Outcome</Label>
            <Select value={maternalOutcome || "none"} onValueChange={(v) => setMaternalOutcome(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="stable">Stable</SelectItem>
                <SelectItem value="referred">Referred</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
                <SelectItem value="postpartum_complication">Postpartum complication</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-xs" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving} className="bg-pink-600 hover:bg-pink-700">
            {saving ? "Saving…" : "Save Labor & Delivery"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// POSTNATAL SECTION
// =====================================================================
function PostnatalSection({ recordId, visits, onUpdated }: { recordId: string; visits: any[]; onUpdated: () => void }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Postnatal care visits — maternal + newborn assessment.</p>
        <Button size="sm" className="gap-1.5 bg-pink-600 hover:bg-pink-700" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" /> Record Postnatal Visit
        </Button>
      </div>

      {visits.length === 0 ? (
        <EmptyState title="No postnatal visits" description="Record postnatal care visits here." icon={CheckCircle2} />
      ) : (
        <div className="space-y-2">
          {visits.map((v: any) => (
            <Card key={v.id}>
              <CardContent className="p-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{v.visitType}</Badge>
                    <span className="font-medium text-slate-700">{formatDate(v.visitDate, true)}</span>
                  </div>
                  {v.recordedBy && (
                    <span className="text-[10px] text-slate-400">
                      by {v.recordedBy.firstName} {v.recordedBy.lastName}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  {v.maternalStatus && <div><span className="text-slate-400">Status:</span> {v.maternalStatus}</div>}
                  {v.bpSystolic && <div><span className="text-slate-400">BP:</span> {v.bpSystolic}/{v.bpDiastolic}</div>}
                  {v.bleeding && <div><span className="text-slate-400">Bleeding:</span> {v.bleeding}</div>}
                  {v.breastfeeding && <div><span className="text-slate-400">Feeding:</span> {v.breastfeeding}</div>}
                  {v.newbornStatus && <div><span className="text-slate-400">Newborn:</span> {v.newbornStatus}</div>}
                </div>
                {v.notes && <div className="mt-1 text-slate-600">{v.notes}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <PostnatalForm
          recordId={recordId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); onUpdated(); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// POSTNATAL FORM
// =====================================================================
function PostnatalForm({ recordId, onClose, onSaved }: { recordId: string; onClose: () => void; onSaved: () => void }) {
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 16));
  const [visitType, setVisitType] = useState("routine");
  const [maternalStatus, setMaternalStatus] = useState("stable");
  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");
  const [bleeding, setBleeding] = useState("normal");
  const [pain, setPain] = useState("none");
  const [breastfeeding, setBreastfeeding] = useState("established");
  const [newbornStatus, setNewbornStatus] = useState("healthy");
  const [familyPlanningMethod, setFamilyPlanningMethod] = useState("none");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/maternity/${recordId}/postnatal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitDate,
          visitType,
          maternalStatus,
          bpSystolic: bpSystolic ? parseInt(bpSystolic) : undefined,
          bpDiastolic: bpDiastolic ? parseInt(bpDiastolic) : undefined,
          bleeding,
          pain,
          breastfeeding,
          newbornStatus,
          familyPlanningCounseling: familyPlanningMethod !== "none",
          familyPlanningMethod,
          notes: notes || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Postnatal visit recorded");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-pink-200 bg-pink-50/30">
      <CardContent className="p-3 space-y-2">
        <h4 className="text-sm font-semibold text-slate-800">New Postnatal Visit</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <Label className="text-[10px]">Date/Time</Label>
            <Input type="datetime-local" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Visit Type</Label>
            <Select value={visitType} onValueChange={setVisitType}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="6h">6 hours</SelectItem>
                <SelectItem value="6d">6 days</SelectItem>
                <SelectItem value="6w">6 weeks</SelectItem>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Maternal Status</Label>
            <Select value={maternalStatus} onValueChange={setMaternalStatus}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stable">Stable</SelectItem>
                <SelectItem value="complicated">Complicated</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">BP (sys/dia)</Label>
            <div className="flex gap-1">
              <Input type="number" value={bpSystolic} onChange={(e) => setBpSystolic(e.target.value)} className="h-8 text-xs" placeholder="sys" />
              <Input type="number" value={bpDiastolic} onChange={(e) => setBpDiastolic(e.target.value)} className="h-8 text-xs" placeholder="dia" />
            </div>
          </div>
          <div>
            <Label className="text-[10px]">Bleeding</Label>
            <Select value={bleeding} onValueChange={setBleeding}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="heavy">Heavy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Pain</Label>
            <Select value={pain} onValueChange={setPain}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="mild">Mild</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="severe">Severe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Breastfeeding</Label>
            <Select value={breastfeeding} onValueChange={setBreastfeeding}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="established">Established</SelectItem>
                <SelectItem value="difficulty">Difficulty</SelectItem>
                <SelectItem value="not_feeding">Not feeding</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Newborn Status</Label>
            <Select value={newbornStatus} onValueChange={setNewbornStatus}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="healthy">Healthy</SelectItem>
                <SelectItem value="concerns">Concerns</SelectItem>
                <SelectItem value="referred">Referred</SelectItem>
                <SelectItem value="admitted">Admitted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Family Planning</Label>
            <Select value={familyPlanningMethod} onValueChange={setFamilyPlanningMethod}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="pills">Pills</SelectItem>
                <SelectItem value="iud">IUD</SelectItem>
                <SelectItem value="implant">Implant</SelectItem>
                <SelectItem value="injection">Injection</SelectItem>
                <SelectItem value="condoms">Condoms</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-xs" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving} className="bg-pink-600 hover:bg-pink-700">
            {saving ? "Saving…" : "Record Visit"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

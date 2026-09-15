"use client";

// =====================================================================
// ANALYTICS DASHBOARD — 5 sub-dashboards with Recharts visualizations
// =====================================================================
// Tabs:
//   1. Morbidity & Mortality — top diagnoses + monthly trend
//   2. Antibiotic Stewardship — prescribing patterns + per-clinician
//   3. Revenue Cycle — revenue, outstanding, claim stats, NHIS
//   4. Staff Productivity — consultations per clinician + daily trend
//   5. Bed Occupancy — current occupancy + 30-day admission/discharge
// =====================================================================
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Activity, Pill, DollarSign, Users, BedDouble, Loader2,
  TrendingUp, AlertTriangle, Download,
} from "lucide-react";
import { toast } from "sonner";
import { safeJson, formatDate, formatCurrency } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json.error || `Failed: ${res.status}`);
  return json;
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
const PERIODS = [
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "1y", label: "Last Year" },
  { value: "all", label: "All Time" },
];

type Tab = "morbidity" | "antibiotic" | "revenue" | "productivity" | "beds";

export function AnalyticsDashboardView() {
  const [tab, setTab] = useState<Tab>("morbidity");
  const [period, setPeriod] = useState("90d");

  return (
    <div className="space-y-4 fade-in-up">
      {/* Page header */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-5 shadow-lg relative overflow-hidden">
        <Activity className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
        <h2 className="text-xl font-bold">Advanced Analytics</h2>
        <p className="text-sm text-white/80 mt-1">Clinical, financial, and operational insights across the hospital.</p>
      </div>

      {/* Tab selector + period filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "morbidity"} onClick={() => setTab("morbidity")} icon={<Activity className="w-4 h-4" />} label="Morbidity & Mortality" />
          <TabButton active={tab === "antibiotic"} onClick={() => setTab("antibiotic")} icon={<Pill className="w-4 h-4" />} label="Antibiotic Stewardship" />
          <TabButton active={tab === "revenue"} onClick={() => setTab("revenue")} icon={<DollarSign className="w-4 h-4" />} label="Revenue Cycle" />
          <TabButton active={tab === "productivity"} onClick={() => setTab("productivity")} icon={<Users className="w-4 h-4" />} label="Staff Productivity" />
          <TabButton active={tab === "beds"} onClick={() => setTab("beds")} icon={<BedDouble className="w-4 h-4" />} label="Bed Occupancy" />
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tab content */}
      {tab === "morbidity" && <MorbidityTab period={period} />}
      {tab === "antibiotic" && <AntibioticTab period={period} />}
      {tab === "revenue" && <RevenueTab period={period} />}
      {tab === "productivity" && <ProductivityTab period={period} />}
      {tab === "beds" && <BedsTab period={period} />}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? "bg-gradient-to-r from-indigo-600 to-purple-700 text-white shadow-md"
          : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon} {label}
    </button>
  );
}

// =====================================================================
// LOADING + ERROR STATES
// =====================================================================
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      <span className="ml-2 text-sm text-slate-500">Loading analytics...</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card><CardContent className="p-8 text-center">
      <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
      <p className="text-sm text-slate-700">{message}</p>
    </CardContent></Card>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="card-hover-lift">
      <CardContent className="p-4">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5 mb-3">{subtitle}</p>}
        {children}
      </CardContent>
    </Card>
  );
}

function KpiCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${color} text-white p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white/80">{label}</span>
        <div className="bg-white/20 rounded p-1">{icon}</div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

// =====================================================================
// TAB 1: MORBIDITY & MORTALITY
// =====================================================================
function MorbidityTab({ period }: { period: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["analytics-morbidity", period],
    queryFn: () => fetchJson(`/api/analytics/morbidity-mortality?period=${period}`),
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message="Failed to load morbidity & mortality data" />;

  const topDiagnoses = (data?.topDiagnoses || []).slice(0, 10);
  const monthlyTrend = data?.monthlyTrend || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Diagnoses" value={data?.totalDiagnoses || 0} icon={<Activity className="w-4 h-4" />} color="from-indigo-500 to-purple-600" />
        <KpiCard label="Primary Diagnoses" value={data?.totalPrimary || 0} icon={<TrendingUp className="w-4 h-4" />} color="from-emerald-500 to-teal-600" />
        <KpiCard label="Unique Conditions" value={data?.uniqueConditions || 0} icon={<Activity className="w-4 h-4" />} color="from-blue-500 to-cyan-600" />
        <KpiCard label="Period" value={PERIODS.find(p => p.value === period)?.label || period} icon={<Activity className="w-4 h-4" />} color="from-amber-500 to-orange-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top 10 Diagnoses" subtitle="By occurrence count">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topDiagnoses} layout="vertical" margin={{ left: 20, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" width={120} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Diagnosis Trend" subtitle="Monthly occurrence over the period">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyTrend} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="colorDiag" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} fill="url(#colorDiag)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Diagnosis table */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">All Diagnoses</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 text-xs">
                <tr>
                  <th className="text-left p-2 font-medium">Diagnosis</th>
                  <th className="text-left p-2 font-medium">Code</th>
                  <th className="text-right p-2 font-medium">Count</th>
                  <th className="text-right p-2 font-medium">Primary</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.topDiagnoses || []).map((d: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="p-2 text-slate-900">{d.name}</td>
                    <td className="p-2 text-slate-500 font-mono text-xs">{d.code || "—"}</td>
                    <td className="p-2 text-right font-medium text-slate-900">{d.count}</td>
                    <td className="p-2 text-right text-slate-600">{d.isPrimaryCount || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// TAB 2: ANTIBIOTIC STEWARDSHIP
// =====================================================================
function AntibioticTab({ period }: { period: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["analytics-antibiotic", period],
    queryFn: () => fetchJson(`/api/analytics/antibiotic-stewardship?period=${period}`),
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message="Failed to load antibiotic stewardship data" />;

  const topAntibiotics = data?.topAntibiotics || [];
  const byClinician = data?.byClinician || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Antibiotic Prescriptions" value={data?.totalAntibioticPrescriptions || 0} icon={<Pill className="w-4 h-4" />} color="from-purple-500 to-violet-600" />
        <KpiCard label="Unique Antibiotics" value={data?.uniqueAntibiotics || 0} icon={<Pill className="w-4 h-4" />} color="from-blue-500 to-cyan-600" />
        <KpiCard label="Prescribers" value={byClinician.length} icon={<Users className="w-4 h-4" />} color="from-emerald-500 to-teal-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top Antibiotics Prescribed" subtitle="By prescription count">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topAntibiotics} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Per-Clinician Breakdown" subtitle="Antibiotic vs total prescriptions">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byClinician.slice(0, 10)} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="clinicianName" tick={{ fontSize: 9 }} stroke="#94a3b8" angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="antibioticCount" name="Antibiotics" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="totalPrescriptions" name="Total Rx" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Clinician Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 text-xs">
                <tr>
                  <th className="text-left p-2 font-medium">Clinician</th>
                  <th className="text-right p-2 font-medium">Antibiotic Rx</th>
                  <th className="text-right p-2 font-medium">Total Rx</th>
                  <th className="text-right p-2 font-medium">% Antibiotic</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byClinician.map((c: any, i: number) => {
                  const pct = c.totalPrescriptions > 0 ? ((c.antibioticCount / c.totalPrescriptions) * 100).toFixed(1) : "0";
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 text-slate-900">{c.clinicianName}</td>
                      <td className="p-2 text-right font-medium text-purple-700">{c.antibioticCount}</td>
                      <td className="p-2 text-right text-slate-600">{c.totalPrescriptions}</td>
                      <td className="p-2 text-right text-slate-600">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// TAB 3: REVENUE CYCLE
// =====================================================================
function RevenueTab({ period }: { period: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["analytics-revenue", period],
    queryFn: () => fetchJson(`/api/analytics/revenue-cycle?period=${period}`),
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message="Failed to load revenue cycle data" />;

  const claimStats = data?.claimStats || {};
  const pieData = [
    { name: "Draft", value: claimStats.draft || 0 },
    { name: "Submitted", value: claimStats.submitted || 0 },
    { name: "Approved", value: claimStats.approved || 0 },
    { name: "Denied", value: claimStats.denied || 0 },
    { name: "Paid", value: claimStats.paid || 0 },
  ].filter(d => d.value > 0);
  const monthlyRevenue = data?.monthlyRevenue || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Revenue" value={formatCurrency(data?.totalRevenue || 0)} icon={<DollarSign className="w-4 h-4" />} color="from-emerald-500 to-teal-600" />
        <KpiCard label="Outstanding" value={formatCurrency(data?.outstandingBalance || 0)} icon={<AlertTriangle className="w-4 h-4" />} color="from-rose-500 to-red-600" />
        <KpiCard label="Avg Days to Payment" value={`${data?.avgDaysToPayment?.toFixed(1) || 0}d`} icon={<TrendingUp className="w-4 h-4" />} color="from-blue-500 to-cyan-600" />
        <KpiCard label="NHIS Approval Rate" value={`${data?.nhisApprovalRate?.toFixed(1) || 0}%`} icon={<Activity className="w-4 h-4" />} color="from-indigo-500 to-purple-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Monthly Revenue Trend" subtitle="Revenue collected per month">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyRevenue} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => formatCurrency(Number(v))} />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#colorRev)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Insurance Claim Status" subtitle="Distribution by status">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

// =====================================================================
// TAB 4: STAFF PRODUCTIVITY
// =====================================================================
function ProductivityTab({ period }: { period: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["analytics-productivity", period],
    queryFn: () => fetchJson(`/api/analytics/staff-productivity?period=${period}`),
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message="Failed to load staff productivity data" />;

  const byClinician = (data?.byClinician || []).slice(0, 15);
  const dailyTrend = data?.dailyTrend || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Total Consultations" value={data?.totalConsultations || 0} icon={<Users className="w-4 h-4" />} color="from-indigo-500 to-purple-600" />
        <KpiCard label="Active Clinicians" value={byClinician.length} icon={<Users className="w-4 h-4" />} color="from-blue-500 to-cyan-600" />
        <KpiCard label="Avg per Clinician/Day" value={(data?.avgPerClinicianPerDay || 0).toFixed(1)} icon={<TrendingUp className="w-4 h-4" />} color="from-emerald-500 to-teal-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Consultations per Clinician" subtitle="Top 15 by count">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byClinician} layout="vertical" margin={{ left: 20, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" width={100} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="consultationCount" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily Consultation Trend" subtitle="Total consultations per day">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyTrend} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#94a3b8" angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

// =====================================================================
// TAB 5: BED OCCUPANCY
// =====================================================================
function BedsTab({ period }: { period: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["analytics-beds", period],
    queryFn: () => fetchJson(`/api/analytics/bed-occupancy?period=${period}`),
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message="Failed to load bed occupancy data" />;

  const dailyTrend = data?.dailyTrend || [];
  const occupancyRate = data?.occupancyRate || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Beds" value={data?.totalBeds || 0} icon={<BedDouble className="w-4 h-4" />} color="from-indigo-500 to-purple-600" />
        <KpiCard label="Occupied" value={data?.occupiedBeds || 0} icon={<BedDouble className="w-4 h-4" />} color="from-rose-500 to-red-600" />
        <KpiCard label="Available" value={data?.availableBeds || 0} icon={<BedDouble className="w-4 h-4" />} color="from-emerald-500 to-teal-600" />
        <KpiCard label="Occupancy Rate" value={`${occupancyRate.toFixed(1)}%`} icon={<TrendingUp className="w-4 h-4" />} color={occupancyRate > 85 ? "from-rose-500 to-red-600" : "from-blue-500 to-cyan-600"} />
      </div>

      <ChartCard title="Admissions vs Discharges (Last 30 Days)" subtitle="Daily count of admissions and discharges">
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={dailyTrend} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="colorAdm" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="colorDis" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#94a3b8" angle={-15} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="admissions" name="Admissions" stroke="#6366f1" strokeWidth={2} fill="url(#colorAdm)" />
            <Area type="monotone" dataKey="discharges" name="Discharges" stroke="#10b981" strokeWidth={2} fill="url(#colorDis)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {occupancyRate > 85 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p><strong>High occupancy alert:</strong> Bed occupancy is above 85%. Consider expediting discharges or opening overflow beds.</p>
        </div>
      )}
    </div>
  );
}

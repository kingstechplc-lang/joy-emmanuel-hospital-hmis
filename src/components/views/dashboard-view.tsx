"use client";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { safeJson } from "@/components/ui-helpers";
import {
  Users, UserPlus, Calendar, BedDouble, Activity, Pill, FlaskConical,
  Receipt, TrendingUp, AlertTriangle, Clock, ArrowRight,
  ClipboardCheck, Stethoscope, ShieldCheck, ShieldX, Boxes,
  ScrollText, Shield, FileText, UserCog, BarChart3,
  ScanLine, CheckSquare, AlertCircle, RefreshCcw,
} from "lucide-react";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

// ─── Role-specific KPI definitions ───────────────────────────────
// Each role sees only the KPIs relevant to their job function.
// A KPI is shown if the user has the permission required by that KPI.

interface KpiDef {
  key: string;
  label: string;
  icon: any;
  color: string;
  perm: string;
  view: string;
  getValue: (stats: any) => any;
}

const ALL_KPIs: KpiDef[] = [
  // Records / Reception
  { key: "totalPatients", label: "Total Patients", icon: Users, color: "emerald", perm: "patient.view", view: "patients", getValue: (s) => s?.totalPatients ?? "—" },
  { key: "todayCheckIns", label: "Today's Check-ins", icon: ClipboardCheck, color: "emerald", perm: "encounter.view", view: "records_desk", getValue: (s) => s?.todayEncounters ?? "—" },
  { key: "todayNewPatients", label: "New Patients Today", icon: UserPlus, color: "purple", perm: "patient.view", view: "patients", getValue: (s) => s?.todayNewPatients ?? "—" },

  // Clinical
  { key: "todayEncounters", label: "Today's Encounters", icon: Activity, color: "blue", perm: "encounter.view", view: "encounters", getValue: (s) => s?.todayEncounters ?? "—" },
  { key: "todayAppointments", label: "Today's Appointments", icon: Calendar, color: "cyan", perm: "appointment.view", view: "appointments", getValue: (s) => s?.todayAppointments ?? "—" },
  { key: "activeAdmissions", label: "Active Admissions", icon: BedDouble, color: "amber", perm: "admission.view", view: "admissions", getValue: (s) => s?.activeAdmissions ?? "—" },
  { key: "bedOccupancy", label: "Bed Occupancy", icon: BedDouble, color: "teal", perm: "bed.manage", view: "beds", getValue: (s) => s?.bedOccupancy != null ? `${s.bedOccupancy}%` : "—" },
  { key: "todayDischarges", label: "Today's Discharges", icon: BedDouble, color: "indigo", perm: "admission.view", view: "discharges", getValue: (s) => s?.todayDischarges ?? "—" },
  { key: "todayCompletedProcedures", label: "Procedures Done Today", icon: Activity, color: "purple", perm: "procedure.view", view: "procedures", getValue: (s) => s?.todayCompletedProcedures ?? "—" },

  // Lab
  { key: "pendingLabOrders", label: "Pending Lab Orders", icon: FlaskConical, color: "purple", perm: "lab.view", view: "lab_orders", getValue: (s) => s?.pendingLabOrders ?? "—" },

  // Imaging
  { key: "pendingImagingOrders", label: "Pending Imaging", icon: ScanLine, color: "cyan", perm: "imaging.view", view: "imaging", getValue: (s) => s?.pendingImagingOrders ?? "—" },

  // Pharmacy
  { key: "pendingPrescriptions", label: "Pending Prescriptions", icon: Pill, color: "pink", perm: "pharmacy.view", view: "prescriptions", getValue: (s) => s?.pendingPrescriptions ?? "—" },

  // Referrals
  { key: "pendingReferrals", label: "Pending Referrals", icon: ArrowRight, color: "blue", perm: "clinical.view", view: "referrals", getValue: (s) => s?.pendingReferrals ?? "—" },

  // Finance
  { key: "outstandingInvoices", label: "Outstanding Invoices", icon: Receipt, color: "rose", perm: "billing.view", view: "billing_invoices", getValue: (s) => s?.outstandingInvoices ?? "—" },
  { key: "todayRevenue", label: "Today's Revenue (GHS)", icon: TrendingUp, color: "emerald", perm: "billing.view", view: "billing_payments", getValue: (s) => s?.todayRevenue != null ? Number(s.todayRevenue).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—" },

  // Inventory
  { key: "lowStockItems", label: "Low Stock Items", icon: AlertTriangle, color: "orange", perm: "inventory.view", view: "inventory", getValue: (s) => s?.lowStockItems ?? "—" },

  // Tasks
  { key: "pendingTasks", label: "Pending Tasks", icon: CheckSquare, color: "amber", perm: "task.assign", view: "tasks", getValue: (s) => s?.pendingTasksCount ?? "—" },

  // Security / Audit — for security roles, audit officers, etc.
  { key: "totalUsers", label: "Total Users", icon: UserCog, color: "blue", perm: "user.view", view: "settings_users", getValue: (s) => s?.totalUsers ?? "—" },
  { key: "auditLogs", label: "Recent Audit Events", icon: ScrollText, color: "teal", perm: "audit.view", view: "audit_logs", getValue: (s) => s?.recentAuditCount ?? "—" },
];

// Role-specific quick actions
const ALL_QUICK_ACTIONS: { label: string; view: any; icon: any; perm: string }[] = [
  { label: "Records Desk", view: "records_desk", icon: ClipboardCheck, perm: "patient.view" },
  { label: "Register Patient", view: "patient_new", icon: UserPlus, perm: "patient.create" },
  { label: "Find Patient", view: "patients", icon: Users, perm: "patient.view" },
  { label: "New Encounter", view: "encounters", icon: Activity, perm: "encounter.create" },
  { label: "Book Appointment", view: "appointments", icon: Calendar, perm: "appointment.create" },
  { label: "Triage & Vitals", view: "triage", icon: Activity, perm: "triage.view" },
  { label: "Consultation", view: "consultations", icon: Stethoscope, perm: "clinical.create" },
  { label: "Lab Orders", view: "lab_orders", icon: FlaskConical, perm: "lab.order" },
  { label: "Dispense", view: "dispense", icon: Pill, perm: "pharmacy.dispense" },
  { label: "New Invoice", view: "billing_invoices", icon: Receipt, perm: "billing.create" },
  { label: "Beds", view: "beds", icon: BedDouble, perm: "bed.manage" },
  { label: "Inventory", view: "inventory", icon: Boxes, perm: "inventory.view" },
  // Security / Admin
  { label: "Audit Logs", view: "audit_logs", icon: ScrollText, perm: "audit.view" },
  { label: "Security", view: "security", icon: Shield, perm: "security.dashboard" },
  { label: "Reports", view: "reports", icon: BarChart3, perm: "report.view" },
  { label: "Users", view: "settings_users", icon: UserCog, perm: "user.view" },
  { label: "Documents", view: "documents", icon: FileText, perm: "document.view" },
  { label: "Tasks", view: "tasks", icon: Clock, perm: "task.assign" },
];

export function DashboardView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setView = useAppStore((s) => s.setView);

  const facilityParam = activeFacilityId ? `?facilityId=${activeFacilityId}` : "";
  const { data: stats, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard-stats", activeFacilityId],
    queryFn: () => fetchJson(`/api/dashboard/stats${facilityParam}`),
    refetchInterval: 30000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const role = user?.role || "user";
  const firstName = user?.name?.split(" ")[0] || "User";
  const perms: string[] = user?.permissions || [];
  const isSuperAdmin = user?.roles?.includes("super_admin");
  const has = (p: string) => isSuperAdmin || perms.includes(p);

  // Filter KPIs by the user's permissions — only show relevant ones
  const visibleKPIs = ALL_KPIs.filter((kpi) => has(kpi.perm));

  // Filter quick actions by permissions
  const visibleActions = ALL_QUICK_ACTIONS.filter((a) => has(a.perm));

  // Determine which sections to show
  const showRecentPatients = has("patient.view");
  const showWardOccupancy = has("admission.view") || has("bed.manage");
  const showPendingTasks = true; // Tasks are always relevant (assigned to this user)

  return (
    <div className="space-y-6 fade-in-up">
      {/* Header — Welcome with action buttons */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Welcome back, {firstName} 👋
          </h2>
          <p className="text-slate-600 text-sm flex items-center gap-1.5 mt-1">
            <Calendar className="w-3.5 h-3.5 text-rose-500" />
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            <span className="text-slate-300 mx-1">•</span>
            <span className="capitalize">{role.replace(/_/g, " ")}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleActions.slice(0, 4).map((a, i) => {
            const Icon = a.icon;
            // First button is primary (red), rest are dark
            const isPrimary = i === 0;
            return (
              <Button
                key={a.view}
                onClick={() => setView(a.view)}
                size="sm"
                className={`gap-2 rounded-lg shadow-md ${
                  isPrimary
                    ? "bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white border-0"
                    : "bg-slate-800 hover:bg-slate-900 text-white border-0"
                }`}
              >
                <Icon className="w-4 h-4" />
                {a.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* KPI Cards — only show what's relevant to this role */}
      {isError && (
        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm font-semibold text-slate-900 mb-1">Failed to load dashboard stats</p>
            <p className="text-xs text-slate-500 mb-3">{(error as Error)?.message || "Please try again"}</p>
            <Button size="sm" variant="outline" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }}>
              <RefreshCcw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </CardContent>
        </Card>
      )}
      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-4 w-20 bg-slate-200 rounded animate-pulse mb-2" />
                <div className="h-8 w-16 bg-slate-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {!isLoading && !isError && visibleKPIs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {visibleKPIs.map((kpi) => (
            <StatCard
              key={kpi.key}
              label={kpi.label}
              value={kpi.getValue(stats)}
              icon={kpi.icon}
              color={kpi.color as any}
              onClick={() => setView(kpi.view as any)}
            />
          ))}
        </div>
      )}

      {/* Quick actions */}
      {visibleActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <CardDescription>Operations available to your role</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {visibleActions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.view}
                    onClick={() => setView(a.view)}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-600 transition">
                      <Icon className="w-5 h-5 text-emerald-600 group-hover:text-white transition" />
                    </div>
                    <span className="text-xs font-medium text-slate-700 text-center">{a.label}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two-column area — only show sections relevant to the role */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent patients — only if user can view patients */}
        {showRecentPatients && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Patients</CardTitle>
                <CardDescription>Latest registered patients across the organization</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setView("patients")} className="gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Button>
            </CardHeader>
            <CardContent>
              {stats?.recentPatients?.length === 0 || !stats?.recentPatients ? (
                <p className="text-sm text-slate-500 py-8 text-center">No patients yet</p>
              ) : (
                <div className="space-y-2">
                  {stats.recentPatients.map((p: any) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        useAppStore.getState().selectPatient(p.id);
                        setView("patient_360");
                      }}
                      className="flex items-center justify-between p-3 rounded-md border border-slate-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 font-semibold flex items-center justify-center">
                          {p.firstName[0]}{p.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{p.firstName} {p.lastName}</p>
                          <p className="text-xs text-slate-500">{p.patientNumber} • {p.sex || "—"} • {p.phone || "No phone"}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline">{p.status}</Badge>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {new Date(p.registrationDate).toLocaleDateString("en-GB")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Ward occupancy — only if user can view admissions or manage beds */}
        {showWardOccupancy && (
          <Card className={!showRecentPatients ? "lg:col-span-3" : ""}>
            <CardHeader>
              <CardTitle className="text-base">Ward Occupancy</CardTitle>
              <CardDescription>Current bed utilization</CardDescription>
            </CardHeader>
            <CardContent>
              {!stats?.wardOccupancy?.length ? (
                <p className="text-sm text-slate-500 py-8 text-center">No data</p>
              ) : (
                <div className="space-y-3">
                  {stats.wardOccupancy.slice(0, 6).map((w: any) => (
                    <div key={w.code}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700">{w.name}</span>
                        <span className="text-slate-500">{w.occupied}/{w.total}</span>
                      </div>
                      <Progress value={w.total > 0 ? (w.occupied / w.total) * 100 : 0} className="h-2" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pending tasks — always shown (assigned to this user specifically) */}
      {stats?.pendingTasks?.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" /> Pending Tasks
              </CardTitle>
              <CardDescription>Tasks assigned to you</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setView("tasks")} className="gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.pendingTasks.slice(0, 5).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded border border-slate-100">
                  <div className="flex items-center gap-2">
                    <Badge variant={t.priority === "urgent" ? "destructive" : t.priority === "high" ? "default" : "secondary"}>
                      {t.priority}
                    </Badge>
                    <span className="text-sm font-medium">{t.title}</span>
                  </div>
                  {t.dueAt && (
                    <span className="text-xs text-slate-500">Due: {new Date(t.dueAt).toLocaleString("en-GB")}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* If no KPIs are visible — show a welcome panel with pending tasks */}
      {visibleKPIs.length === 0 && visibleActions.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-emerald-500" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Welcome to Joy Emmanuel Hospital HMIS</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              You are logged in as <strong>{role.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</strong>.
              Your dashboard will display relevant statistics and quick actions based on your assigned permissions.
              If you need access to additional modules, please contact your system administrator.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, color, onClick,
}: {
  label: string;
  value: React.ReactNode;
  icon: any;
  color: string;
  onClick?: () => void;
}) {
  // Gradient class map — vibrant gradients matching the sample HMIS UI
  const gradientMap: Record<string, string> = {
    emerald: "kpi-gradient-emerald",
    blue: "kpi-gradient-blue",
    amber: "kpi-gradient-amber",
    purple: "kpi-gradient-purple",
    pink: "kpi-gradient-pink",
    cyan: "kpi-gradient-cyan",
    rose: "kpi-gradient-rose",
    teal: "kpi-gradient-teal",
    orange: "kpi-gradient-orange",
    indigo: "kpi-gradient-indigo",
    slate: "kpi-gradient-slate",
    green: "kpi-gradient-green",
    red: "kpi-gradient-red",
    yellow: "kpi-gradient-amber",
    violet: "kpi-gradient-violet",
  };
  const gradientClass = gradientMap[color] || gradientMap.slate;

  return (
    <Card
      onClick={onClick}
      className={`group relative ${gradientClass} text-white cursor-pointer overflow-hidden border-0 shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 rounded-2xl card-hover-lift`}
    >
      <CardContent className="p-5 relative z-10">
        {/* Watermark icon in top-right */}
        <div className="absolute top-4 right-4 text-white/20 pointer-events-none">
          <Icon className="w-12 h-12" strokeWidth={1.5} />
        </div>
        {/* Label */}
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/90 mb-2 pr-12">{label}</p>
        {/* Value */}
        <p className="text-3xl font-extrabold text-white tracking-tight tabular-nums">{value}</p>
        {/* Hover arrow */}
        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowRight className="w-4 h-4 text-white/70" />
        </div>
      </CardContent>
    </Card>
  );
}

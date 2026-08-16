"use client";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users, UserPlus, Calendar, BedDouble, Activity, Pill, FlaskConical,
  Receipt, TrendingUp, AlertTriangle, Clock, ArrowRight,
  ClipboardCheck, Stethoscope, ShieldCheck, ShieldX, Boxes,
} from "lucide-react";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
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

  // Lab
  { key: "pendingLabOrders", label: "Pending Lab Orders", icon: FlaskConical, color: "purple", perm: "lab.view", view: "lab_orders", getValue: (s) => s?.pendingLabOrders ?? "—" },

  // Pharmacy
  { key: "pendingPrescriptions", label: "Pending Prescriptions", icon: Pill, color: "pink", perm: "pharmacy.view", view: "prescriptions", getValue: (s) => s?.pendingPrescriptions ?? "—" },

  // Finance
  { key: "outstandingInvoices", label: "Outstanding Invoices", icon: Receipt, color: "rose", perm: "billing.view", view: "billing_invoices", getValue: (s) => s?.outstandingInvoices ?? "—" },
  { key: "todayRevenue", label: "Today's Revenue (GHS)", icon: TrendingUp, color: "emerald", perm: "billing.view", view: "billing_payments", getValue: (s) => s?.todayRevenue != null ? Number(s.todayRevenue).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—" },

  // Inventory
  { key: "lowStockItems", label: "Low Stock Items", icon: AlertTriangle, color: "orange", perm: "inventory.view", view: "inventory", getValue: (s) => s?.lowStockItems ?? "—" },
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
];

export function DashboardView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setView = useAppStore((s) => s.setView);

  const facilityParam = activeFacilityId ? `?facilityId=${activeFacilityId}` : "";
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", activeFacilityId],
    queryFn: () => fetchJson(`/api/dashboard/stats${facilityParam}`),
    refetchInterval: 30000,
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Welcome back, {firstName} 👋
          </h2>
          <p className="text-slate-600 text-sm">
            {role.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} • {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleActions.slice(0, 4).map((a) => {
            const Icon = a.icon;
            return (
              <Button key={a.view} onClick={() => setView(a.view)} size="sm" variant="outline" className="gap-2">
                <Icon className="w-4 h-4" />
                {a.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* KPI Cards — only show what's relevant to this role */}
      {visibleKPIs.length > 0 && (
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

      {/* If no KPIs are visible (shouldn't happen, but safety net) */}
      {visibleKPIs.length === 0 && visibleActions.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <ShieldX className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">No dashboard data available</h3>
            <p className="text-sm text-slate-500">Your role doesn&apos;t have any dashboard permissions assigned. Contact an administrator.</p>
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
  color: "emerald" | "blue" | "amber" | "purple" | "pink" | "cyan" | "rose" | "teal" | "orange";
  onClick?: () => void;
}) {
  const colorMap = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200/60", bar: "bg-emerald-500" },
    blue: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200/60", bar: "bg-blue-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200/60", bar: "bg-amber-500" },
    purple: { bg: "bg-purple-50", text: "text-purple-700", ring: "ring-purple-200/60", bar: "bg-purple-500" },
    pink: { bg: "bg-pink-50", text: "text-pink-700", ring: "ring-pink-200/60", bar: "bg-pink-500" },
    cyan: { bg: "bg-cyan-50", text: "text-cyan-700", ring: "ring-cyan-200/60", bar: "bg-cyan-500" },
    rose: { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200/60", bar: "bg-rose-500" },
    teal: { bg: "bg-teal-50", text: "text-teal-700", ring: "ring-teal-200/60", bar: "bg-teal-500" },
    orange: { bg: "bg-orange-50", text: "text-orange-700", ring: "ring-orange-200/60", bar: "bg-orange-500" },
  };
  const c = colorMap[color];
  return (
    <Card
      onClick={onClick}
      className="group relative hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden ring-1 ring-slate-200/50"
    >
      <div className={`absolute top-0 left-0 right-0 h-1 ${c.bar} opacity-80 group-hover:opacity-100 transition`} />
      <CardContent className="p-4 pt-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} ${c.text} ring-1 ${c.ring} group-hover:scale-110 transition-transform`}>
            <Icon className="w-5 h-5" />
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
        </div>
        <p className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
      </CardContent>
    </Card>
  );
}

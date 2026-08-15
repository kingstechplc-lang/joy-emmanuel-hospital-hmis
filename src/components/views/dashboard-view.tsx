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
} from "lucide-react";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

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

  // Role-specific quick actions
  const quickActions: { label: string; view: any; icon: any; perm?: string }[] = [
    { label: "Register Patient", view: "patient_new", icon: UserPlus, perm: "patient.create" },
    { label: "Find Patient", view: "patients", icon: Users, perm: "patient.view" },
    { label: "New Encounter", view: "encounters", icon: Activity, perm: "encounter.create" },
    { label: "Book Appointment", view: "appointments", icon: Calendar, perm: "appointment.create" },
    { label: "Lab Orders", view: "lab_orders", icon: FlaskConical, perm: "lab.order" },
    { label: "Dispense", view: "dispense", icon: Pill, perm: "pharmacy.dispense" },
    { label: "New Invoice", view: "billing_invoices", icon: Receipt, perm: "billing.create" },
    { label: "Beds", view: "beds", icon: BedDouble, perm: "bed.manage" },
  ];

  const visibleActions = quickActions.filter(
    (a) => !a.perm || user?.roles?.includes("super_admin") || user?.permissions?.includes(a.perm)
  );

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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
        <StatCard
          label="Total Patients"
          value={stats?.totalPatients ?? "—"}
          icon={Users}
          color="emerald"
          onClick={() => setView("patients")}
        />
        <StatCard
          label="Today's Encounters"
          value={stats?.todayEncounters ?? "—"}
          icon={Activity}
          color="blue"
          onClick={() => setView("encounters")}
        />
        <StatCard
          label="Active Admissions"
          value={stats?.activeAdmissions ?? "—"}
          icon={BedDouble}
          color="amber"
          onClick={() => setView("admissions")}
        />
        <StatCard
          label="Pending Lab Orders"
          value={stats?.pendingLabOrders ?? "—"}
          icon={FlaskConical}
          color="purple"
          onClick={() => setView("lab_orders")}
        />
        <StatCard
          label="Pending Prescriptions"
          value={stats?.pendingPrescriptions ?? "—"}
          icon={Pill}
          color="pink"
          onClick={() => setView("prescriptions")}
        />
        <StatCard
          label="Today's Appointments"
          value={stats?.todayAppointments ?? "—"}
          icon={Calendar}
          color="cyan"
          onClick={() => setView("appointments")}
        />
        <StatCard
          label="Outstanding Invoices"
          value={stats?.outstandingInvoices ?? "—"}
          icon={Receipt}
          color="rose"
          onClick={() => setView("billing_invoices")}
        />
        <StatCard
          label="Today's Revenue (GHS)"
          value={stats?.todayRevenue != null ? Number(stats.todayRevenue).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
          icon={TrendingUp}
          color="emerald"
          onClick={() => setView("billing_payments")}
        />
        <StatCard
          label="Bed Occupancy"
          value={stats?.bedOccupancy != null ? `${stats.bedOccupancy}%` : "—"}
          icon={BedDouble}
          color="teal"
          onClick={() => setView("beds")}
        />
        <StatCard
          label="Low Stock Items"
          value={stats?.lowStockItems ?? "—"}
          icon={AlertTriangle}
          color="orange"
          onClick={() => setView("inventory")}
        />
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
          <CardDescription>Frequently used operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      {/* Two-column area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent patients */}
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
                    onClick={() => setView("patient_360") /* would need to set selectedPatientId */}
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

        {/* Bed occupancy summary */}
        <Card>
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
      </div>

      {/* Pending tasks for role */}
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
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-purple-50 text-purple-700",
    pink: "bg-pink-50 text-pink-700",
    cyan: "bg-cyan-50 text-cyan-700",
    rose: "bg-rose-50 text-rose-700",
    teal: "bg-teal-50 text-teal-700",
    orange: "bg-orange-50 text-orange-700",
  };
  return (
    <Card className="hover:shadow-md transition cursor-pointer" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

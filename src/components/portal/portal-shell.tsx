"use client";

// =====================================================================
// PATIENT PORTAL SHELL — mirrors src/components/layout/app-shell.tsx
// =====================================================================
// Dark sidebar (slate-900) with teal/emerald accent (patient-facing
// variant of the staff app's rose/red accent). Topbar with patient
// name + logout. Main content area renders the active portal view.
// =====================================================================
import { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import {
  PORTAL_NAV_ITEMS, PORTAL_NAV_CATEGORIES, usePortalStore,
} from "@/stores/portal-store";
import {
  getPortalToken, portalFetchJson, portalLogout,
} from "@/lib/patient-portal/client";
import { formatDate, safeJson } from "@/components/ui-helpers";

export function PortalShell() {
  const view = usePortalStore((s) => s.view);
  const setView = usePortalStore((s) => s.setView);
  const sidebarCollapsed = usePortalStore((s) => s.sidebarCollapsed);
  const toggleSidebar = usePortalStore((s) => s.toggleSidebar);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [me, setMe] = useState<any>(null);

  const { data } = useQuery({
    queryKey: ["portal-me"],
    queryFn: () => portalFetchJson("/api/portal/me"),
    enabled: !!getPortalToken(),
  });

  useEffect(() => {
    if (data) setMe(data);
  }, [data]);

  const patient = me?.patient;
  const fullName = patient
    ? `${patient.firstName} ${patient.lastName}`
    : "Patient";
  const initials = patient
    ? `${patient.firstName?.[0] || ""}${patient.lastName?.[0] || ""}`.toUpperCase()
    : "PT";

  const navByCategory: Record<string, any[]> = {};
  for (const item of PORTAL_NAV_ITEMS) {
    if (!navByCategory[item.category]) navByCategory[item.category] = [];
    navByCategory[item.category].push(item);
  }

  const currentViewLabel =
    PORTAL_NAV_ITEMS.find((i) => i.key === view)?.label || "Dashboard";

  const renderView = () => {
    switch (view) {
      case "dashboard":
        return <PortalDashboardView patient={patient} onNavigate={setView} />;
      case "lab_results":
        return <PortalLabResultsView />;
      case "appointments":
        return <PortalAppointmentsView />;
      case "invoices":
        return <PortalInvoicesView />;
      default:
        return <PortalDashboardView patient={patient} onNavigate={setView} />;
    }
  };

  return (
    <div className="h-dvh flex bg-slate-50 overflow-hidden">
      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-slate-900">
          <SidebarContent
            navByCategory={navByCategory}
            currentView={view}
            onSelect={(v) => { setView(v); setMobileOpen(false); }}
            collapsed={false}
            patientName={fullName}
            patientNumber={patient?.patientNumber}
          />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside
        className={`${sidebarCollapsed ? "w-16" : "w-64"} hidden md:flex flex-col bg-slate-900 transition-all duration-200 shrink-0`}
      >
        <SidebarContent
          navByCategory={navByCategory}
          currentView={view}
          onSelect={setView}
          collapsed={sidebarCollapsed}
          patientName={fullName}
          patientNumber={patient?.patientNumber}
        />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 h-dvh overflow-hidden bg-slate-50">
        {/* Topbar */}
        <header className="h-16 border-b border-slate-200 bg-white px-4 md:px-6 flex items-center justify-between gap-4 shrink-0 z-30 shadow-sm">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button variant="ghost" size="icon" className="md:hidden hover:bg-slate-100" onClick={() => setMobileOpen(true)}>
              <Icons.Menu className="w-5 h-5 text-slate-700" />
            </Button>
            <Button variant="ghost" size="icon" className="hidden md:flex hover:bg-slate-100" onClick={toggleSidebar}>
              <Icons.Menu className="w-5 h-5 text-slate-700" />
            </Button>
            <div className="flex flex-col min-w-0">
              <h1 className="text-lg font-bold text-slate-900 truncate">{currentViewLabel}</h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200">
              <Icons.ShieldCheck className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-medium text-teal-800">Patient Portal</span>
            </div>
            <Avatar className="w-9 h-9 ring-2 ring-slate-200">
              <AvatarFallback className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white text-sm font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon" className="hover:bg-rose-50 text-slate-600 hover:text-rose-600" onClick={portalLogout} title="Log out">
              <Icons.LogOut className="w-5 h-5" />
            </Button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

// =====================================================================
// SIDEBAR
// =====================================================================
function SidebarContent({
  navByCategory, currentView, onSelect, collapsed, patientName, patientNumber,
}: {
  navByCategory: Record<string, any[]>;
  currentView: string;
  onSelect: (v: any) => void;
  collapsed: boolean;
  patientName: string;
  patientNumber?: string;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-900">
      <div className="h-16 border-b border-slate-700/50 flex items-center px-4 gap-3 shrink-0 bg-slate-950/50">
        <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-lg flex items-center justify-center text-white shrink-0 shadow-lg shadow-teal-900/30">
          <Icons.ShieldPlus className="w-5 h-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">Joy Emmanuel</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Patient Portal</p>
          </div>
        )}
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-3 sidebar-scroll">
        {PORTAL_NAV_CATEGORIES.map((cat) => (
          <div key={cat}>
            {!collapsed && (
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-1.5 mt-4">
                {cat}
              </p>
            )}
            <div className="space-y-0.5">
              {(navByCategory[cat] || []).map((item) => {
                const Icon = (Icons as any)[item.icon] || Icons.Circle;
                const isActive = currentView === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => onSelect(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                      isActive
                        ? "bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold shadow-lg shadow-teal-900/30"
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    } ${collapsed ? "justify-center" : ""}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-700/50 p-3 shrink-0 bg-slate-950/30">
        {collapsed ? (
          <div className="flex justify-center">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 leading-tight truncate">{patientName}</p>
            {patientNumber && <p className="text-[10px] text-slate-600 font-mono truncate">{patientNumber}</p>}
            <p className="text-[10px] text-slate-600 leading-tight">© 2026 Joy Emmanuel Hospital</p>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// VIEW COMPONENTS
// =====================================================================

function PortalDashboardView({ patient, onNavigate }: { patient: any; onNavigate: (v: any) => void }) {
  const fullName = patient ? `${patient.firstName} ${patient.lastName}` : "Patient";
  return (
    <div className="space-y-6 fade-in-up">
      <div className="rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-700 text-white p-6 shadow-lg relative overflow-hidden">
        <Icons.HeartPulse className="absolute top-4 right-4 w-20 h-20 text-white/15" strokeWidth={1.5} />
        <p className="text-sm text-white/80">Welcome back,</p>
        <h2 className="text-2xl font-bold mt-1">{fullName}</h2>
        {patient?.patientNumber && <p className="text-sm text-white/70 font-mono mt-2">{patient.patientNumber}</p>}
        {patient?.sex && (
          <p className="text-xs text-white/60 mt-2">
            {patient.sex && `Sex: ${patient.sex}`}
            {patient.dateOfBirth && ` • DOB: ${new Date(patient.dateOfBirth).toLocaleDateString()}`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <QuickStatCard title="Appointments" icon={<Icons.Calendar className="w-5 h-5" />} onClick={() => onNavigate("appointments")} gradient="from-blue-500 to-cyan-600" />
        <QuickStatCard title="Lab Results" icon={<Icons.FlaskConical className="w-5 h-5" />} onClick={() => onNavigate("lab_results")} gradient="from-purple-500 to-violet-600" />
        <QuickStatCard title="Invoices" icon={<Icons.Receipt className="w-5 h-5" />} onClick={() => onNavigate("invoices")} gradient="from-emerald-500 to-teal-600" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Quick Links</h3>
        <div className="space-y-1">
          <QuickLinkRow icon={<Icons.Calendar className="w-4 h-4 text-blue-600" />} title="View upcoming appointments" onClick={() => onNavigate("appointments")} />
          <QuickLinkRow icon={<Icons.FlaskConical className="w-4 h-4 text-purple-600" />} title="See my latest lab results" onClick={() => onNavigate("lab_results")} />
          <QuickLinkRow icon={<Icons.Receipt className="w-4 h-4 text-emerald-600" />} title="Check outstanding balance" onClick={() => onNavigate("invoices")} />
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
        <p className="text-xs text-slate-500">Need help? Call our front desk. For medical emergencies, dial 112 or visit the nearest emergency unit.</p>
      </div>
    </div>
  );
}

function QuickStatCard({ title, icon, onClick, gradient }: { title: string; icon: React.ReactNode; onClick: () => void; gradient: string; }) {
  return (
    <button onClick={onClick} className={`text-left rounded-xl bg-gradient-to-br ${gradient} text-white p-4 hover:shadow-lg transition-all duration-200 card-hover-lift`}>
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/20 backdrop-blur mb-2">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-white/70 mt-1 inline-flex items-center gap-0.5">View <Icons.ChevronRight className="w-3 h-3" /></p>
    </button>
  );
}

function QuickLinkRow({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void; }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 text-left transition-colors">
      {icon}
      <span className="text-sm text-slate-700 flex-1">{title}</span>
      <Icons.ChevronRight className="w-4 h-4 text-slate-400" />
    </button>
  );
}

// --- Lab Results ---
function PortalLabResultsView() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-lab-results"],
    queryFn: () => portalFetchJson("/api/portal/lab-results"),
  });
  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4 fade-in-up">
      <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-violet-700 text-white p-5 shadow-lg relative overflow-hidden">
        <Icons.FlaskConical className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
        <h2 className="text-xl font-bold">Lab Results</h2>
        <p className="text-sm text-white/80 mt-1">Results your doctor has reviewed and released to you.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Icons.Loader2 className="w-6 h-6 text-teal-500 animate-spin" /></div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
          <p className="text-sm text-rose-700 mb-2">Failed to load lab results</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Icons.FlaskConical className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-900">No lab results available yet</p>
          <p className="text-xs text-slate-500 mt-1">Results that your doctor has released will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((order: any) => {
            const isExpanded = expanded === order.id;
            const allResults = (order.items || []).flatMap((item: any) =>
              (item.results || []).map((r: any) => ({ ...r, testName: item.testName }))
            );
            return (
              <div key={order.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden card-hover-lift">
                <button onClick={() => setExpanded(isExpanded ? null : order.id)} className="w-full text-left p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Icons.FlaskConical className="w-4 h-4 text-purple-600" />
                        <p className="font-medium text-slate-900">Lab Order {order.orderNumber}</p>
                        <LabStatusPill status={order.status} />
                      </div>
                      <p className="text-xs text-slate-500">Ordered {formatDate(order.orderedAt, true)} • Released {formatDate(order.releasedToPatientAt, true)}</p>
                    </div>
                    {isExpanded ? <Icons.ChevronDown className="w-5 h-5 text-slate-400" /> : <Icons.ChevronRight className="w-5 h-5 text-slate-400" />}
                  </div>
                </button>
                {isExpanded && allResults.length > 0 && (
                  <div className="border-t bg-slate-50 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 text-slate-600 text-xs">
                        <tr><th className="text-left p-3 font-medium">Test</th><th className="text-left p-3 font-medium">Result</th><th className="text-left p-3 font-medium">Flag</th><th className="text-left p-3 font-medium">Reference</th></tr>
                      </thead>
                      <tbody className="divide-y">
                        {allResults.map((r: any, i: number) => {
                          const critical = r.criticalFlag;
                          const abnormal = r.abnormalFlag && r.abnormalFlag !== "normal";
                          return (
                            <tr key={r.id || i} className={critical ? "bg-rose-50" : abnormal ? "bg-amber-50" : "bg-white"}>
                              <td className="p-3 text-slate-900">{r.testName}</td>
                              <td className="p-3 font-medium text-slate-900">{r.resultValue || (r.numericValue != null ? r.numericValue : "—")} {r.unit && <span className="text-slate-500 text-xs">{r.unit}</span>}</td>
                              <td className="p-3">
                                {critical ? <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-rose-600 text-white">CRITICAL</span>
                                  : abnormal ? <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-200 text-amber-800 uppercase">{r.abnormalFlag.replace(/_/g, " ")}</span>
                                  : r.resultValue || r.numericValue != null ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Normal</span>
                                  : <span className="text-slate-400 text-xs">—</span>}
                              </td>
                              <td className="p-3 text-slate-500 text-xs">{r.referenceRange || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {isExpanded && allResults.length === 0 && (
                  <div className="border-t bg-slate-50 p-4 text-center text-sm text-slate-500">Results pending — the lab is still processing this order.</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LabStatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = { resulted: "bg-amber-100 text-amber-700", verified: "bg-blue-100 text-blue-700", released: "bg-emerald-100 text-emerald-700" };
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{status}</span>;
}

// --- Appointments ---
function PortalAppointmentsView() {
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-appointments", filter],
    queryFn: () => portalFetchJson(`/api/portal/appointments?status=${filter}`),
  });
  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4 fade-in-up">
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-700 text-white p-5 shadow-lg relative overflow-hidden">
        <Icons.Calendar className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
        <h2 className="text-xl font-bold">Appointments</h2>
        <p className="text-sm text-white/80 mt-1">Your upcoming and past visits.</p>
      </div>

      <div className="flex gap-2 bg-white p-1 rounded-lg border border-slate-200 w-full max-w-xs">
        {(["upcoming", "past", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-1.5 px-2 text-xs font-medium rounded transition-colors capitalize ${filter === f ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{f}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Icons.Loader2 className="w-6 h-6 text-teal-500 animate-spin" /></div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
          <p className="text-sm text-rose-700 mb-2">Failed to load appointments</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Icons.Calendar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-900">{filter === "upcoming" ? "No upcoming appointments" : "No appointments found"}</p>
          <p className="text-xs text-slate-500 mt-1">To book an appointment, please call the hospital front desk.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((apt: any) => (
            <div key={apt.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 card-hover-lift">
              <div className="flex items-start gap-3">
                <div className="text-center min-w-[64px]">
                  <div className="bg-teal-50 rounded-lg p-2">
                    <p className="text-xs text-teal-700 font-semibold uppercase">{new Date(apt.scheduledStart).toLocaleDateString("en", { month: "short" })}</p>
                    <p className="text-2xl font-bold text-teal-800">{new Date(apt.scheduledStart).getDate()}</p>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-semibold text-slate-900 capitalize">{apt.appointmentType?.replace(/_/g, " ") || "Appointment"}</p>
                    <AptStatusPill status={apt.status} />
                  </div>
                  <p className="text-sm text-slate-700">{formatDate(apt.scheduledStart, true)}</p>
                  {apt.department && <p className="text-xs text-slate-500">{apt.department.name}</p>}
                  {apt.facility && <p className="text-xs text-slate-500">{apt.facility.name}</p>}
                  {apt.reason && <p className="text-xs text-slate-600 mt-2 italic">Reason: {apt.reason}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AptStatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = { scheduled: "bg-emerald-100 text-emerald-700", completed: "bg-blue-100 text-blue-700", cancelled: "bg-rose-100 text-rose-700", no_show: "bg-amber-100 text-amber-700" };
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{status.replace(/_/g, " ")}</span>;
}

// --- Invoices ---
function PortalInvoicesView() {
  const [filter, setFilter] = useState<"unpaid" | "paid" | "all">("all");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-invoices", filter],
    queryFn: () => portalFetchJson(`/api/portal/invoices?status=${filter}`),
  });
  const items: any[] = data?.items || [];
  const totalOutstanding: number = data?.totalOutstanding || 0;

  return (
    <div className="space-y-4 fade-in-up">
      <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-5 shadow-lg relative overflow-hidden">
        <Icons.Receipt className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
        <h2 className="text-xl font-bold">Invoices & Receipts</h2>
        <p className="text-sm text-white/80 mt-1">Your billing history and outstanding balance.</p>
      </div>

      {totalOutstanding > 0 && (
        <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4 flex items-center gap-3 shadow-sm">
          <Icons.AlertCircle className="w-6 h-6 shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-white/80">Outstanding Balance</p>
            <p className="text-2xl font-bold">GHS {totalOutstanding.toFixed(2)}</p>
          </div>
          <p className="text-[10px] text-white/80 max-w-[40%]">Please visit the hospital cashier to make a payment.</p>
        </div>
      )}

      <div className="flex gap-2 bg-white p-1 rounded-lg border border-slate-200 w-full max-w-xs">
        {(["all", "unpaid", "paid"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-1.5 px-2 text-xs font-medium rounded transition-colors capitalize ${filter === f ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{f}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Icons.Loader2 className="w-6 h-6 text-teal-500 animate-spin" /></div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
          <p className="text-sm text-rose-700 mb-2">Failed to load invoices</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Icons.Receipt className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-900">{filter === "unpaid" ? "No outstanding invoices" : "No invoices found"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((inv: any) => (
            <div key={inv.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 card-hover-lift">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-slate-900">{inv.invoiceNumber}</p>
                    <InvStatusPill status={inv.status} />
                  </div>
                  <p className="text-xs text-slate-500">Issued {formatDate(inv.createdAt, true)}</p>
                  {inv.facility && <p className="text-xs text-slate-500">{inv.facility.name}</p>}
                  <p className="text-xs text-slate-500 capitalize">Type: {inv.invoiceType?.replace(/_/g, " ") || "patient"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="font-semibold text-slate-900">GHS {inv.total.toFixed(2)}</p>
                  {inv.balance > 0 ? (
                    <div className="mt-1">
                      <p className="text-[10px] text-slate-500">Balance</p>
                      <p className="text-sm font-medium text-rose-600">GHS {inv.balance.toFixed(2)}</p>
                    </div>
                  ) : <p className="text-[10px] text-emerald-600 font-medium mt-1">✓ Paid in full</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InvStatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = { issued: "bg-blue-100 text-blue-700", partially_paid: "bg-amber-100 text-amber-700", paid: "bg-emerald-100 text-emerald-700", overdue: "bg-rose-100 text-rose-700", cancelled: "bg-slate-100 text-slate-600", refunded: "bg-violet-100 text-violet-700" };
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{status.replace(/_/g, " ")}</span>;
}

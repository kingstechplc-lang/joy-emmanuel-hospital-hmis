"use client";

// =====================================================================
// PATIENT PORTAL SHELL — mirrors src/components/layout/app-shell.tsx
// =====================================================================
// Dark sidebar (slate-900) with teal/emerald accent (patient-facing
// variant of the staff app's rose/red accent). Topbar with patient
// name + logout. Main content area renders the active portal view.
//
// v2 — search + filters + detail dialogs
//   • Lab Results: search (order # / test name), status filter
//     (All / Resulted / Verified / Released), date-range filter,
//     "View Full Details" dialog with clinician comments, reference
//     ranges, and ordering clinician's name.
//     BUG FIX: LabOrderItem.testName never existed — the test name
//     comes from item.laboratoryTest?.name. All references updated.
//   • Appointments: search (reason / appointment #), type filter
//     (All / New / Follow-up / Walk-in / Telemedicine), "View
//     Details" dialog with full appointment info.
//   • Invoices: search (invoice #), type filter (Patient / Outpatient
//     / Inpatient / Emergency / Pharmacy / Lab / Imaging), date-range
//     filter, "View Details" dialog with full invoice info + a Print
//     button (window.print()).
//   • Search input debounces 300ms; filters fire immediately on
//     change. The dark sidebar + gradient banners + card-hover-lift
//     + fade-in-up design language is preserved.
// =====================================================================
import { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import {
  Search, Filter, X, Eye, Printer, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import {
  PORTAL_NAV_ITEMS, PORTAL_NAV_CATEGORIES, usePortalStore,
} from "@/stores/portal-store";
import {
  getPortalToken, portalFetch, portalFetchJson, portalLogout,
} from "@/lib/patient-portal/client";
import { formatDate, safeJson } from "@/components/ui-helpers";
import { toast } from "sonner";

// =====================================================================
// SHARED HOOKS / HELPERS
// =====================================================================

// Debounce any value — used for search inputs (300ms default).
function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// Build a query string from a params object, skipping empty / "all"
// values so the URL stays clean and the API can use sensible defaults.
function buildQuery(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v !== "all") usp.set(k, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

// A small labelled key-value row used inside detail dialogs.
function DetailRow({
  label, value, valueClassName = "",
}: {
  label: string;
  value: string | number | null | undefined;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5 truncate">
        {label}
      </p>
      <p className={`text-sm font-medium text-slate-900 break-words ${valueClassName}`}>
        {value === null || value === undefined || value === "" ? "—" : value}
      </p>
    </div>
  );
}

// A wider block (full-width) used for reason / notes / comments.
function DetailBlock({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-slate-700 italic bg-slate-50 rounded-md px-2.5 py-1.5 border border-slate-100">
        {value || "—"}
      </p>
    </div>
  );
}

// A clearable search input with the Search icon on the left and an X
// on the right. Used at the top of every filterable portal view.
function FilterSearchInput({
  value, onChange, placeholder, className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full p-0.5 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// Field label used above filter inputs / selects.
function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
      {children}
    </Label>
  );
}

// =====================================================================
// PORTAL SHELL
// =====================================================================
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
      case "telemedicine":
        return <PortalTelemedicineView />;
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
      <p className="text-xs text-white/70 mt-1 inline-flex items-center gap-0.5">View <ChevronRight className="w-3 h-3" /></p>
    </button>
  );
}

function QuickLinkRow({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void; }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 text-left transition-colors">
      {icon}
      <span className="text-sm text-slate-700 flex-1">{title}</span>
      <ChevronRight className="w-4 h-4 text-slate-400" />
    </button>
  );
}

// =====================================================================
// LAB RESULTS VIEW — search + status + date range + detail dialog
// =====================================================================
function PortalLabResultsView() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailOrder, setDetailOrder] = useState<any | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const query = buildQuery({
    search: debouncedSearch,
    status,
    dateFrom,
    dateTo,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-lab-results", debouncedSearch, status, dateFrom, dateTo],
    queryFn: () => portalFetchJson(`/api/portal/lab-results${query}`),
  });
  const items: any[] = data?.items || [];

  const hasActiveFilters = !!(search || status !== "all" || dateFrom || dateTo);

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setDateFrom("");
    setDateTo("");
  };

  // Flatten order.items[].results[] into a single list of result rows
  // for the inline preview. NOTE: the test name now correctly comes
  // from item.laboratoryTest?.name (the API no longer returns testName).
  const flattenResults = (order: any) =>
    (order.items || []).flatMap((item: any) =>
      (item.results || []).map((r: any) => ({
        ...r,
        testName: item.laboratoryTest?.name,
        testCode: item.laboratoryTest?.code,
        unit: r.unit || item.laboratoryTest?.unit,
        referenceRange: r.referenceRange || item.laboratoryTest?.referenceRange,
      }))
    );

  return (
    <div className="space-y-4 fade-in-up">
      <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-violet-700 text-white p-5 shadow-lg relative overflow-hidden">
        <Icons.FlaskConical className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
        <h2 className="text-xl font-bold">Lab Results</h2>
        <p className="text-sm text-white/80 mt-1">Results your doctor has reviewed and released to you.</p>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-end gap-3 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <FilterLabel>Search</FilterLabel>
          <FilterSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Order number or test name"
          />
        </div>
        <div>
          <FilterLabel>Status</FilterLabel>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="resulted">Resulted</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="released">Released</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <FilterLabel>From</FilterLabel>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" />
        </div>
        <div>
          <FilterLabel>To</FilterLabel>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500 hover:text-rose-600 hover:bg-rose-50">
            <X className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
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
          <p className="text-sm font-medium text-slate-900">No lab results match your filters</p>
          <p className="text-xs text-slate-500 mt-1">Try adjusting your search or filters. Results your doctor has released will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((order: any) => {
            const isExpanded = expanded === order.id;
            const allResults = flattenResults(order);
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
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
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
                    <div className="px-3 py-2 bg-white border-t border-slate-200">
                      <Button size="sm" variant="outline" onClick={() => setDetailOrder(order)}>
                        <Eye className="w-4 h-4 mr-1.5" /> View Full Details
                      </Button>
                    </div>
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

      {/* Detail dialog */}
      <Dialog open={!!detailOrder} onOpenChange={(o) => !o && setDetailOrder(null)}>
        {detailOrder && (
          <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden sm:max-w-2xl">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-purple-600 to-violet-700 text-white">
              <DialogTitle className="text-white flex items-center gap-2">
                <Icons.FlaskConical className="w-5 h-5 text-emerald-300" />
                Lab Order {detailOrder.orderNumber}
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Ordered {formatDate(detailOrder.orderedAt, true)} • Released {formatDate(detailOrder.releasedToPatientAt, true)}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
            {detailOrder.orderingClinician && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm flex items-center gap-2">
                <Icons.Stethoscope className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-slate-500">Ordering Clinician:</span>
                <span className="font-medium text-slate-900">
                  {detailOrder.orderingClinician.firstName} {detailOrder.orderingClinician.lastName}
                </span>
                <LabStatusPill status={detailOrder.status} />
              </div>
            )}

            <div className="space-y-2">
              {(detailOrder.items || []).map((item: any) => (
                <div key={item.id} className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{item.laboratoryTest?.name || "Test"}</p>
                      {item.laboratoryTest?.code && <p className="text-[10px] text-slate-500 font-mono">{item.laboratoryTest.code}</p>}
                    </div>
                    <LabStatusPill status={item.status} />
                  </div>
                  {(item.results || []).length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-500">No results recorded for this test.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {item.results.map((r: any) => {
                        const critical = r.criticalFlag;
                        const abnormal = r.abnormalFlag && r.abnormalFlag !== "normal";
                        const refRange = r.referenceRange || item.laboratoryTest?.referenceRange;
                        const unit = r.unit || item.laboratoryTest?.unit;
                        return (
                          <div key={r.id} className="px-3 py-2 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-900">{r.componentName || item.laboratoryTest?.name}</p>
                                <p className="text-slate-700">
                                  {r.resultValue || (r.numericValue != null ? r.numericValue : "—")}
                                  {unit && <span className="text-slate-500 text-xs ml-1">{unit}</span>}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                {critical ? <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-rose-600 text-white">CRITICAL</span>
                                  : abnormal ? <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-200 text-amber-800 uppercase">{r.abnormalFlag.replace(/_/g, " ")}</span>
                                  : <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Normal</span>}
                              </div>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              <span className="font-medium">Reference:</span> {refRange || "—"}
                              {r.releasedAt && <span className="ml-3">Released {formatDate(r.releasedAt, true)}</span>}
                            </div>
                            {(r.clinicianComment || r.resultNotes) && (
                              <div className="mt-1.5 text-xs text-slate-600 bg-slate-50 rounded px-2 py-1.5 border border-slate-100 space-y-1">
                                {r.clinicianComment && (
                                  <p><span className="font-medium not-italic text-slate-700">Clinician note:</span> <span className="italic">{r.clinicianComment}</span></p>
                                )}
                                {r.resultNotes && (
                                  <p><span className="font-medium not-italic text-slate-700">Result notes:</span> <span className="italic">{r.resultNotes}</span></p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            </div>
            <DialogFooter className="p-4 pt-3 shrink-0 border-t bg-white">
              <Button variant="outline" onClick={() => setDetailOrder(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function LabStatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = { resulted: "bg-amber-100 text-amber-700", verified: "bg-blue-100 text-blue-700", released: "bg-emerald-100 text-emerald-700" };
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{status}</span>;
}

// =====================================================================
// APPOINTMENTS VIEW — search + type filter + detail dialog
// (keeps the existing upcoming/past/all segmented control)
// =====================================================================
function PortalAppointmentsView() {
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [detailApt, setDetailApt] = useState<any | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const query = buildQuery({
    status: filter,
    search: debouncedSearch,
    type,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-appointments", filter, debouncedSearch, type],
    queryFn: () => portalFetchJson(`/api/portal/appointments${query}`),
  });
  const items: any[] = data?.items || [];

  const hasActiveFilters = !!(search || type !== "all");

  const clearFilters = () => {
    setSearch("");
    setType("all");
  };

  return (
    <div className="space-y-4 fade-in-up">
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-700 text-white p-5 shadow-lg relative overflow-hidden">
        <Icons.Calendar className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
        <h2 className="text-xl font-bold">Appointments</h2>
        <p className="text-sm text-white/80 mt-1">Your upcoming and past visits.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 bg-white p-1 rounded-lg border border-slate-200 w-full max-w-xs">
          {(["upcoming", "past", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-1.5 px-2 text-xs font-medium rounded transition-colors capitalize ${filter === f ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{f}</button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-end gap-3 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <FilterLabel>Search</FilterLabel>
          <FilterSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Reason or appointment number"
          />
        </div>
        <div>
          <FilterLabel>Type</FilterLabel>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="follow_up">Follow-up</SelectItem>
              <SelectItem value="walk_in">Walk-in</SelectItem>
              <SelectItem value="telemedicine">Telemedicine</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500 hover:text-rose-600 hover:bg-rose-50">
            <X className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
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
          <p className="text-sm font-medium text-slate-900">{filter === "upcoming" ? "No upcoming appointments" : "No appointments match your filters"}</p>
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-semibold text-slate-900 capitalize">{apt.appointmentType?.replace(/_/g, " ") || "Appointment"}</p>
                    <AptStatusPill status={apt.status} />
                  </div>
                  <p className="text-sm text-slate-700">{formatDate(apt.scheduledStart, true)}</p>
                  {apt.appointmentNumber && <p className="text-[10px] text-slate-500 font-mono mt-0.5">{apt.appointmentNumber}</p>}
                  {apt.department && <p className="text-xs text-slate-500">{apt.department.name}</p>}
                  {apt.facility && <p className="text-xs text-slate-500">{apt.facility.name}</p>}
                  {apt.reason && <p className="text-xs text-slate-600 mt-2 italic line-clamp-2">Reason: {apt.reason}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => setDetailApt(apt)} className="shrink-0">
                  <Eye className="w-4 h-4 mr-1.5" /> Details
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailApt} onOpenChange={(o) => !o && setDetailApt(null)}>
        {detailApt && (
          <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden sm:max-w-md">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-cyan-700 text-white">
              <DialogTitle className="text-white flex items-center gap-2">
                <Icons.Calendar className="w-5 h-5 text-cyan-200" />
                Appointment Details
              </DialogTitle>
              <DialogDescription className="text-white/80">
                {detailApt.appointmentNumber || "Appointment"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="Date" value={formatDate(detailApt.scheduledStart)} />
                <DetailRow
                  label="Time"
                  value={detailApt.scheduledStart
                    ? new Date(detailApt.scheduledStart).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                    : "—"}
                />
                <DetailRow label="Type" value={(detailApt.appointmentType || "").replace(/_/g, " ")} valueClassName="capitalize" />
                <DetailRow label="Status" value={(detailApt.status || "").replace(/_/g, " ")} valueClassName="capitalize" />
                <DetailRow label="Department" value={detailApt.department?.name} />
                <DetailRow label="Facility" value={detailApt.facility?.name} />
              </div>

              {detailApt.reason && <DetailBlock label="Reason" value={detailApt.reason} />}
              {detailApt.notes && <DetailBlock label="Notes" value={detailApt.notes} />}
            </div>

            <DialogFooter className="p-4 pt-3 shrink-0 border-t bg-white">
              <Button variant="outline" onClick={() => setDetailApt(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function AptStatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = { scheduled: "bg-emerald-100 text-emerald-700", completed: "bg-blue-100 text-blue-700", cancelled: "bg-rose-100 text-rose-700", no_show: "bg-amber-100 text-amber-700" };
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{status.replace(/_/g, " ")}</span>;
}

// =====================================================================
// INVOICES VIEW — search + type + date range + detail dialog (w/ Print)
// (keeps the existing unpaid/paid/all segmented control)
// =====================================================================
function PortalInvoicesView() {
  const [filter, setFilter] = useState<"unpaid" | "paid" | "all">("all");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailInv, setDetailInv] = useState<any | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const query = buildQuery({
    status: filter,
    search: debouncedSearch,
    type,
    dateFrom,
    dateTo,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-invoices", filter, debouncedSearch, type, dateFrom, dateTo],
    queryFn: () => portalFetchJson(`/api/portal/invoices${query}`),
  });
  const items: any[] = data?.items || [];
  const totalOutstanding: number = data?.totalOutstanding || 0;

  const hasActiveFilters = !!(search || type !== "all" || dateFrom || dateTo);

  const clearFilters = () => {
    setSearch("");
    setType("all");
    setDateFrom("");
    setDateTo("");
  };

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

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 bg-white p-1 rounded-lg border border-slate-200 w-full max-w-xs">
          {(["all", "unpaid", "paid"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-1.5 px-2 text-xs font-medium rounded transition-colors capitalize ${filter === f ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{f}</button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-end gap-3 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <FilterLabel>Search</FilterLabel>
          <FilterSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Invoice number"
          />
        </div>
        <div>
          <FilterLabel>Type</FilterLabel>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="patient">Patient</SelectItem>
              <SelectItem value="outpatient">Outpatient</SelectItem>
              <SelectItem value="inpatient">Inpatient</SelectItem>
              <SelectItem value="emergency">Emergency</SelectItem>
              <SelectItem value="pharmacy">Pharmacy</SelectItem>
              <SelectItem value="lab">Lab</SelectItem>
              <SelectItem value="imaging">Imaging</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <FilterLabel>From</FilterLabel>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" />
        </div>
        <div>
          <FilterLabel>To</FilterLabel>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500 hover:text-rose-600 hover:bg-rose-50">
            <X className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
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
          <p className="text-sm font-medium text-slate-900">{filter === "unpaid" ? "No outstanding invoices" : "No invoices match your filters"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((inv: any) => (
            <div key={inv.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 card-hover-lift">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-slate-900">{inv.invoiceNumber}</p>
                    <InvStatusPill status={inv.status} />
                  </div>
                  <p className="text-xs text-slate-500">Issued {formatDate(inv.createdAt, true)}</p>
                  {inv.facility && <p className="text-xs text-slate-500">{inv.facility.name}</p>}
                  <p className="text-xs text-slate-500 capitalize">Type: {inv.invoiceType?.replace(/_/g, " ") || "patient"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="font-semibold text-slate-900">GHS {inv.total.toFixed(2)}</p>
                  {inv.balance > 0 ? (
                    <div className="mt-1">
                      <p className="text-[10px] text-slate-500">Balance</p>
                      <p className="text-sm font-medium text-rose-600">GHS {inv.balance.toFixed(2)}</p>
                    </div>
                  ) : <p className="text-[10px] text-emerald-600 font-medium mt-1">✓ Paid in full</p>}
                  <Button size="sm" variant="outline" onClick={() => setDetailInv(inv)} className="mt-2">
                    <Eye className="w-4 h-4 mr-1.5" /> Details
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailInv} onOpenChange={(o) => !o && setDetailInv(null)}>
        {detailInv && (
          <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden sm:max-w-md">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
              <DialogTitle className="text-white flex items-center gap-2">
                <Icons.Receipt className="w-5 h-5 text-teal-200" />
                Invoice {detailInv.invoiceNumber}
              </DialogTitle>
              <DialogDescription className="text-white/80">
                View invoice details. Use Print to print this invoice.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-2 gap-3">
              <DetailRow label="Invoice #" value={detailInv.invoiceNumber} />
              <DetailRow label="Type" value={(detailInv.invoiceType || "").replace(/_/g, " ")} valueClassName="capitalize" />
              <DetailRow label="Status" value={(detailInv.status || "").replace(/_/g, " ")} valueClassName="capitalize" />
              <DetailRow label="Facility" value={detailInv.facility?.name} />
              <DetailRow label="Issued" value={formatDate(detailInv.issuedAt || detailInv.createdAt, true)} />
              <DetailRow label="Due" value={formatDate(detailInv.dueAt)} />
              <DetailRow label="Total" value={`GHS ${(detailInv.total || 0).toFixed(2)}`} />
              <DetailRow label="Amount Paid" value={`GHS ${(detailInv.amountPaid || 0).toFixed(2)}`} />
              <DetailRow
                label="Balance"
                value={`GHS ${(detailInv.balance || 0).toFixed(2)}`}
                valueClassName={detailInv.balance > 0 ? "text-rose-600 font-semibold" : "text-emerald-600 font-semibold"}
              />
              <DetailRow
                label="Currency"
                value={detailInv.currency || "GHS"}
              />
            </div>

            <DialogFooter className="p-4 pt-3 shrink-0 border-t bg-white">
              <Button variant="outline" onClick={() => setDetailInv(null)}>Close</Button>
              <Button onClick={() => window.print()} className="bg-emerald-600 hover:bg-emerald-700">
                <Printer className="w-4 h-4 mr-1.5" /> Print
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function InvStatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = { issued: "bg-blue-100 text-blue-700", partially_paid: "bg-amber-100 text-amber-700", paid: "bg-emerald-100 text-emerald-700", overdue: "bg-rose-100 text-rose-700", cancelled: "bg-slate-100 text-slate-600", refunded: "bg-violet-100 text-violet-700" };
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{status.replace(/_/g, " ")}</span>;
}

// =====================================================================
// TELEMEDICINE VIEW — patient-side video consultations
// =====================================================================
function PortalTelemedicineView() {
  const [activeRoom, setActiveRoom] = useState<any | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-telemedicine"],
    queryFn: () => portalFetchJson("/api/portal/telemedicine"),
  });

  const upcoming: any[] = data?.upcoming || [];
  const past: any[] = data?.past || [];

  // The portal telemedicine API returns roomUrl for each active room.
  // When the patient clicks Join Call, we:
  //   1. Call POST /api/portal/telemedicine/[roomId]/join to update the
  //      room status to "patient_waiting" (so the doctor sees the patient)
  //   2. Open the Daily.co iframe with the roomUrl
  const handleJoin = async (room: any) => {
    if (!room.roomUrl) {
      toast.error("Room not ready yet. Please wait for the doctor to start the call.");
      return;
    }
    setJoining(room.id);
    try {
      // Notify the server that the patient is joining (updates status)
      await portalFetchJson(`/api/portal/telemedicine/${room.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // Open the Daily.co iframe
      setActiveRoom({ id: room.id, roomUrl: room.roomUrl, status: "patient_waiting" });
    } catch (e: any) {
      // If the join endpoint fails, still open the iframe — the patient
      // can still join the call, the doctor just won't see them as
      // "waiting" in the queue
      console.error("[portal telemedicine] join endpoint failed:", e);
      setActiveRoom({ id: room.id, roomUrl: room.roomUrl, status: room.status });
    } finally {
      setJoining(null);
    }
  };

  // If we have an active room with a URL, show the video embed
  if (activeRoom?.roomUrl) {
    return (
      <div className="space-y-4 fade-in-up">
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-5 shadow-lg relative overflow-hidden">
          <Icons.Video className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
          <h2 className="text-xl font-bold">Video Consultation</h2>
          <p className="text-sm text-white/80 mt-1">
            {activeRoom.status === "patient_waiting"
              ? "Waiting for the doctor to admit you..."
              : "Your call is in progress."}
          </p>
        </div>

        <div className="rounded-xl overflow-hidden border border-slate-200 shadow-lg" style={{ height: "60vh" }}>
          {/* Use a simple iframe for the portal — no need for the full embed component */}
          <iframe
            src={activeRoom.roomUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            className="w-full h-full border-0"
            title="Video Consultation"
          />
        </div>

        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => {
              setActiveRoom(null);
              refetch();
            }}
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            Leave Call
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-in-up">
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-5 shadow-lg relative overflow-hidden">
        <Icons.Video className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
        <h2 className="text-xl font-bold">Video Consultations</h2>
        <p className="text-sm text-white/80 mt-1">Join your scheduled virtual appointments with your doctor.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Icons.Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
          <p className="text-sm text-rose-700 mb-2">Failed to load video consultations</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Icons.Video className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-900">No video consultations scheduled</p>
          <p className="text-xs text-slate-500 mt-1">When your doctor schedules a virtual appointment, it will appear here.</p>
        </div>
      ) : (
        <>
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Upcoming</h3>
              {upcoming.map((room: any) => (
                <div key={room.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 card-hover-lift">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Icons.Video className="w-4 h-4 text-indigo-600" />
                        <p className="font-semibold text-slate-900">Video Consultation</p>
                        <TeleStatusPill status={room.status} />
                      </div>
                      <p className="text-xs text-slate-500">
                        {room.appointment
                          ? formatDate(room.appointment.scheduledStart, true)
                          : formatDate(room.createdAt, true)}
                      </p>
                      {room.clinician && (
                        <p className="text-xs text-slate-500">
                          Dr. {room.clinician.firstName} {room.clinician.lastName}
                        </p>
                      )}
                      {room.appointment?.department && (
                        <p className="text-xs text-slate-500">{room.appointment.department.name}</p>
                      )}
                    </div>
                    {room._pending ? (
                      // Pending appointment — doctor hasn't created the room yet.
                      // Show a "Not ready" badge instead of a Join button.
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                        <Icons.Clock className="w-3.5 h-3.5" />
                        Waiting for doctor
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleJoin(room)}
                        disabled={joining === room.id}
                        className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
                      >
                        {joining === room.id ? (
                          <><Icons.Loader2 className="w-3.5 h-3.5 animate-spin" /> Joining...</>
                        ) : (
                          <><Icons.Video className="w-3.5 h-3.5" /> Join Call</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mt-6">Past Consultations</h3>
              {past.map((room: any) => (
                <div key={room.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 opacity-75">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Video Consultation</p>
                      <p className="text-xs text-slate-500">
                        {room.callEndedAt ? formatDate(room.callEndedAt, true) : formatDate(room.createdAt, true)}
                      </p>
                      {room.callDurationSec && (
                        <p className="text-xs text-slate-500">Duration: {Math.round(room.callDurationSec / 60)} min</p>
                      )}
                    </div>
                    <TeleStatusPill status={room.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TeleStatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-blue-100 text-blue-700",
    created: "bg-slate-100 text-slate-600",
    patient_waiting: "bg-amber-100 text-amber-700",
    in_progress: "bg-emerald-100 text-emerald-700",
    ended: "bg-slate-100 text-slate-500",
  };
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  const labels: Record<string, string> = {
    pending: "Scheduled",
    created: "Room Ready",
    patient_waiting: "Waiting",
    in_progress: "In Progress",
    ended: "Completed",
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{labels[status] || status}</span>;
}

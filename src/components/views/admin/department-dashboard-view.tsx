"use client";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Network, Boxes, Users, Activity, Archive, CheckCircle2,
  Building2, Stethoscope, FlaskConical, Pill, HeartPulse,
  Wallet, FileText, Wrench, Settings, ArrowRight, History,
  type LucideIcon,
} from "lucide-react";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatRelative, safeJson} from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

// ─── Category metadata ────────────────────────────────────────────
const CATEGORY_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  Clinical: { label: "Clinical", icon: Stethoscope, color: "emerald" },
  Diagnostic: { label: "Diagnostic", icon: FlaskConical, color: "teal" },
  "Pharmaceutical & Supply": { label: "Pharmaceutical & Supply", icon: Pill, color: "emerald" },
  "Nursing & Patient Care": { label: "Nursing & Patient Care", icon: HeartPulse, color: "teal" },
  "Finance & Administration": { label: "Finance & Administration", icon: Wallet, color: "emerald" },
  "Medical Records & Information": { label: "Medical Records & Information", icon: FileText, color: "teal" },
  "Technical & Support": { label: "Technical & Support", icon: Wrench, color: "emerald" },
  Management: { label: "Management", icon: Settings, color: "teal" },
};

const colorMap: Record<string, { bg: string; text: string; ring: string; bar: string }> = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200/60", bar: "bg-emerald-500" },
  teal: { bg: "bg-teal-50", text: "text-teal-700", ring: "ring-teal-200/60", bar: "bg-teal-500" },
  blue: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200/60", bar: "bg-blue-500" },
  amber: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200/60", bar: "bg-amber-500" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", ring: "ring-purple-200/60", bar: "bg-purple-500" },
  pink: { bg: "bg-pink-50", text: "text-pink-700", ring: "ring-pink-200/60", bar: "bg-pink-500" },
  cyan: { bg: "bg-cyan-50", text: "text-cyan-700", ring: "ring-cyan-200/60", bar: "bg-cyan-500" },
  rose: { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200/60", bar: "bg-rose-500" },
  orange: { bg: "bg-orange-50", text: "text-orange-700", ring: "ring-orange-200/60", bar: "bg-orange-500" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-200/60", bar: "bg-indigo-500" },
  slate: { bg: "bg-slate-50", text: "text-slate-700", ring: "ring-slate-200/60", bar: "bg-slate-500" },
  green: { bg: "bg-green-50", text: "text-green-700", ring: "ring-green-200/60", bar: "bg-green-500" },
  red: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-200/60", bar: "bg-red-500" },
  yellow: { bg: "bg-yellow-50", text: "text-yellow-700", ring: "ring-yellow-200/60", bar: "bg-yellow-500" },
  violet: { bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200/60", bar: "bg-violet-500" },
};

export function DepartmentDashboardView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setView = useAppStore((s) => s.setView);

  // Fetch all departments (including archived) for the org
  const params = new URLSearchParams();
  params.set("includeArchived", "true");
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  const qs = `?${params.toString()}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["department-dashboard", activeFacilityId],
    queryFn: () => fetchJson(`/api/departments${qs}`),
  });

  // Fetch recent department-related audit logs
  const auditQ = useQuery({
    queryKey: ["department-audit", "dashboard"],
    queryFn: () =>
      fetchJson(
        `/api/audit-logs?resourceType=department&limit=8&offset=0`
      ),
    enabled: can("audit.view"),
  });

  const departments: any[] = data?.items || [];
  const auditLogs: any[] = auditQ.data?.items || [];

  // ─── Compute summary stats ────────────────────────────────────
  const total = departments.length;
  const active = departments.filter((d) => d.status === "active").length;
  const inactive = departments.filter((d) => d.status === "inactive").length;
  const archived = departments.filter((d) => d.status === "archived").length;
  const closed = departments.filter((d) => d.status === "closed").length;
  const inactiveOrClosed = inactive + closed;

  const totalUnits = departments.reduce((sum, d) => sum + (d.unitsCount || 0), 0);
  const totalStaff = departments.reduce((sum, d) => sum + (d.staffCount || 0), 0);
  const totalServices = departments.reduce((sum, d) => sum + (d.servicesCount || 0), 0);
  const totalEncounters = departments.reduce((sum, d) => sum + (d.encountersCount || 0), 0);

  // Group by category
  const byCategory = departments.reduce<Record<string, number>>((acc, d) => {
    const c = d.category || "Clinical";
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});
  const categoryEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const maxCategoryCount = Math.max(1, ...categoryEntries.map(([, n]) => n));

  // Group by facility
  const byFacility = departments.reduce<Record<string, { name: string; count: number; units: number; staff: number }>>((acc, d) => {
    const id = d.facility?.id || d.facilityId || "unknown";
    const name = d.facility?.name || "Unknown";
    if (!acc[id]) acc[id] = { name, count: 0, units: 0, staff: 0 };
    acc[id].count += 1;
    acc[id].units += d.unitsCount || 0;
    acc[id].staff += d.staffCount || 0;
    return acc;
  }, {});
  const facilityEntries = Object.values(byFacility).sort((a, b) => b.count - a.count);

  // Top departments by staff count
  const topByStaff = [...departments]
    .filter((d) => d.status !== "archived")
    .sort((a, b) => (b.staffCount || 0) - (a.staffCount || 0))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Department Dashboard</h2>
          <p className="text-sm text-slate-500">
            Organization-wide overview of departments, units, and staffing
            {activeFacilityId ? " (filtered by selected facility)" : " (all facilities)"}
          </p>
        </div>
        {can("department.manage") && (
          <Button onClick={() => setView("settings_departments")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Network className="w-4 h-4" /> Manage Departments
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load department overview" onRetry={() => refetch()} />
      ) : total === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No departments found"
              description="Add departments to your facilities to see organization-wide statistics here."
              icon={Network}
              action={
                can("department.manage") && (
                  <Button onClick={() => setView("settings_departments")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                    <Network className="w-4 h-4" /> Go to Departments
                  </Button>
                )
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            <StatCard
              label="Total Departments"
              value={total}
              icon={Network}
              color="emerald"
              onClick={() => setView("settings_departments")}
            />
            <StatCard
              label="Active"
              value={active}
              icon={CheckCircle2}
              color="teal"
            />
            <StatCard
              label="Inactive / Closed"
              value={inactiveOrClosed}
              icon={Activity}
              color="emerald"
            />
            <StatCard
              label="Archived"
              value={archived}
              icon={Archive}
              color="teal"
            />
            <StatCard
              label="Total Units"
              value={totalUnits}
              icon={Boxes}
              color="emerald"
            />
          </div>

          {/* Secondary stats: Staff + Services */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            <StatCard
              label="Staff Assigned to Departments"
              value={totalStaff}
              icon={Users}
              color="teal"
            />
            <StatCard
              label="Department Services"
              value={totalServices}
              icon={FileText}
              color="emerald"
            />
            <StatCard
              label="Encounters Linked"
              value={totalEncounters}
              icon={Activity}
              color="teal"
            />
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Departments by Category */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-emerald-600" /> Departments by Category
                </CardTitle>
                <CardDescription>Distribution across the standard HMIS department categories</CardDescription>
              </CardHeader>
              <CardContent>
                {categoryEntries.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">No categories assigned yet</p>
                ) : (
                  <div className="space-y-3">
                    {categoryEntries.map(([cat, count]) => {
                      const meta = CATEGORY_META[cat] || { label: cat, icon: Network, color: "emerald" };
                      const c = colorMap[meta.color] || colorMap.emerald;
                      const pct = Math.round((count / maxCategoryCount) * 100);
                      const Icon = meta.icon;
                      return (
                        <div key={cat} className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.bg} ${c.text} ring-1 ${c.ring}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-slate-700 truncate">{meta.label}</span>
                              <span className="text-xs font-semibold text-slate-900 tabular-nums">{count}</span>
                            </div>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Department Changes */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="w-4 h-4 text-teal-600" /> Recent Changes
                  </CardTitle>
                  <CardDescription>Latest department activity</CardDescription>
                </div>
                {can("audit.view") && (
                  <Button variant="ghost" size="sm" onClick={() => setView("audit_logs")} className="gap-1">
                    View all <ArrowRight className="w-3 h-3" />
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!can("audit.view") ? (
                  <p className="text-sm text-slate-500 py-6 text-center">No audit access</p>
                ) : auditLogs.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">No recent department changes</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {auditLogs.map((log) => {
                      const user = log.user;
                      const userName = user ? `${user.firstName} ${user.lastName}` : "System";
                      const isArchive = log.action?.includes("ARCHIVED");
                      const isRestore = log.action?.includes("RESTORED");
                      const isCreate = log.action?.includes("CREATED");
                      const isUpdate = log.action?.includes("UPDATED");
                      const dot = isArchive
                        ? "bg-slate-400"
                        : isRestore
                        ? "bg-emerald-500"
                        : isCreate
                        ? "bg-teal-500"
                        : isUpdate
                        ? "bg-amber-400"
                        : "bg-slate-300";
                      return (
                        <div key={log.id} className="flex items-start gap-2.5 text-xs">
                          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900">{log.action?.replace(/_/g, " ")}</span>
                            </div>
                            <div className="text-slate-500 truncate">
                              by {userName} • {log.facility?.name || "—"}
                            </div>
                            <div className="text-[10px] text-slate-400">{formatRelative(log.createdAt)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Facilities breakdown + Top departments */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Departments by Facility */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-600" /> Departments by Facility
                </CardTitle>
                <CardDescription>Distribution and unit counts across facilities</CardDescription>
              </CardHeader>
              <CardContent>
                {facilityEntries.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">No facility data</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {facilityEntries.map((f) => (
                      <div
                        key={f.name}
                        className="flex items-center justify-between p-3 rounded-md border border-slate-100 hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="text-sm font-medium text-slate-900 truncate">{f.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
                          <span className="flex items-center gap-1">
                            <Network className="w-3 h-3" /> {f.count} dept
                          </span>
                          <span className="flex items-center gap-1">
                            <Boxes className="w-3 h-3" /> {f.units} units
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" /> {f.staff}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Departments by Staff */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-teal-600" /> Top Departments by Staff
                </CardTitle>
                <CardDescription>Departments with the most assigned staff</CardDescription>
              </CardHeader>
              <CardContent>
                {topByStaff.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">No staff assignments recorded</p>
                ) : (
                  <div className="space-y-2">
                    {topByStaff.map((d, idx) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between p-3 rounded-md border border-slate-100 hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900 truncate">{d.name}</span>
                              <code className="text-[10px] bg-slate-100 px-1 py-0.5 rounded">{d.code}</code>
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                              {d.facility?.name || "—"}
                              {d.category ? ` • ${d.category}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
                            <Users className="w-3 h-3 mr-1" /> {d.staffCount || 0}
                          </Badge>
                          <StatusBadge status={d.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* All departments quick-list */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">All Departments</CardTitle>
                <CardDescription>
                  {total} total • {active} active • {archived} archived
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setView("settings_departments")} className="gap-1">
                Open admin <ArrowRight className="w-3 h-3" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-1">
                {departments.map((d) => {
                  const meta = CATEGORY_META[d.category || "Clinical"] || { label: d.category || "Clinical", color: "emerald" };
                  const c = colorMap[meta.color] || colorMap.emerald;
                  return (
                    <div
                      key={d.id}
                      className="p-3 rounded-md border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-900 truncate">{d.name}</span>
                        <StatusBadge status={d.status} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <code className="bg-slate-100 px-1 py-0.5 rounded">{d.code}</code>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>
                          {meta.label}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 truncate">{d.facility?.name || "—"}</div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1"><Boxes className="w-3 h-3" /> {d.unitsCount || 0}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {d.staffCount || 0}</span>
                        <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {d.servicesCount || 0}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Stat Card (emerald/teal only) ─────────────────────────────────
function StatCard({
  label, value, icon: Icon, color, onClick,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  color: "emerald" | "teal";
  onClick?: () => void;
}) {
  const c = colorMap[color] || colorMap.emerald;
  return (
    <Card
      onClick={onClick}
      className={`group relative overflow-hidden ring-1 ring-slate-200/50 ${onClick ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200" : ""}`}
    >
      <div className={`absolute top-0 left-0 right-0 h-1 ${c.bar} opacity-80`} />
      <CardContent className="p-4 pt-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} ${c.text} ring-1 ${c.ring} ${onClick ? "group-hover:scale-110 transition-transform" : ""}`}>
            <Icon className="w-5 h-5" />
          </div>
          {onClick && (
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
          )}
        </div>
        <p className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
      </CardContent>
    </Card>
  );
}

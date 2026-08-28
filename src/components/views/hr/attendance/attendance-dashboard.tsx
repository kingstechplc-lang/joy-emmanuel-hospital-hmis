"use client";
// =====================================================================
// ATTENDANCE DASHBOARD — Real-time attendance statistics
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, UserCheck, UserX, Clock, LogIn, LogOut, Moon, Phone,
  AlertTriangle, FileEdit, Timer, CalendarDays, TrendingUp,
} from "lucide-react";
import {
  fetchJson, formatTime, formatMinutes, ColoredBadge, ATTENDANCE_STATUSES,
} from "./attendance-helpers";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui-helpers";

export function AttendanceDashboard() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["attendance-dashboard", activeFacilityId],
    queryFn: () => fetchJson(`/api/attendance/dashboard${qs}`),
    enabled: !!activeFacilityId,
    refetchInterval: 30000, // refresh every 30 seconds
  });

  if (!activeFacilityId) {
    return (
      <Card><CardContent className="p-6">
        <EmptyState title="No facility selected" description="Select a facility from the top bar to view the attendance dashboard." icon={AlertTriangle} />
      </CardContent></Card>
    );
  }

  if (isLoading) return <LoadingState rows={8} />;
  if (isError) return <ErrorState message="Failed to load dashboard data" onRetry={() => refetch()} />;

  const stats = data?.stats || {};
  const todaysAttendance = data?.todaysAttendance || [];
  const departmentStats = data?.departmentStats || [];

  return (
    <div className="space-y-6">
      {/* Today's Statistics */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-600" /> TODAY&apos;S ATTENDANCE — {new Date(data.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Scheduled" value={stats.totalScheduled ?? 0} icon={Users} color="from-blue-500 to-blue-600" />
          <StatCard label="Present" value={stats.present ?? 0} icon={UserCheck} color="from-emerald-500 to-emerald-600" />
          <StatCard label="Checked In" value={stats.checkedIn ?? 0} icon={LogIn} color="from-cyan-500 to-cyan-600" />
          <StatCard label="Checked Out" value={stats.checkedOut ?? 0} icon={LogOut} color="from-slate-500 to-slate-600" />
          <StatCard label="Late" value={stats.late ?? 0} icon={Clock} color="from-amber-500 to-amber-600" alert={stats.late > 0} />
          <StatCard label="Absent" value={stats.absent ?? 0} icon={UserX} color="from-rose-500 to-rose-600" alert={stats.absent > 0} />
          <StatCard label="On Leave" value={stats.onLeave ?? 0} icon={CalendarDays} color="from-purple-500 to-purple-600" />
          <StatCard label="Off Duty" value={stats.offDuty ?? 0} icon={Users} color="from-slate-400 to-slate-500" />
          <StatCard label="On Call" value={stats.onCall ?? 0} icon={Phone} color="from-indigo-500 to-indigo-600" />
          <StatCard label="Early Departures" value={stats.earlyDepartures ?? 0} icon={LogOut} color="from-orange-500 to-orange-600" alert={stats.earlyDepartures > 0} />
          <StatCard label="Overtime" value={stats.overtimeCount ?? 0} icon={Timer} color="from-fuchsia-500 to-fuchsia-600" />
          <StatCard label="Missing Check-Outs" value={stats.missingCheckouts ?? 0} icon={AlertTriangle} color="from-rose-500 to-rose-600" alert={stats.missingCheckouts > 0} />
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Total Worked Today</div>
            <div className="text-lg font-bold text-slate-900">{formatMinutes(stats.workedMinutes ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Total Overtime Today</div>
            <div className="text-lg font-bold text-fuchsia-700">{formatMinutes(stats.overtimeMinutes ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Pending Corrections</div>
            <div className="text-lg font-bold text-amber-700">{stats.pendingCorrections ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Open Exceptions</div>
            <div className="text-lg font-bold text-rose-700">{stats.openExceptions ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Live Attendance Board */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" /> LIVE ATTENDANCE BOARD ({todaysAttendance.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {todaysAttendance.length === 0 ? (
            <EmptyState title="No attendance records today" description="Check-in staff to see them on the live board." icon={LogIn} />
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {todaysAttendance.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {a.staff?.firstName} {a.staff?.lastName}
                      {a.isManualEntry && <Badge variant="outline" className="ml-2 text-xs">Manual</Badge>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {a.staff?.staffNumber} • {a.department?.name || "—"} • {a.shift?.shiftType || "No shift"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div className="text-xs">
                      <div className="text-slate-700">
                        {a.shift?.startTime && <span>S: {formatTime(a.shift.startTime)}</span>}
                        {a.shift?.endTime && <span> → {formatTime(a.shift.endTime)}</span>}
                      </div>
                      <div className="text-emerald-700">
                        {a.checkInAt && <span>In: {formatTime(a.checkInAt)}</span>}
                        {a.checkOutAt && <span> → Out: {formatTime(a.checkOutAt)}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      {a.lateMinutes > 0 && <div className="text-xs text-amber-700">Late: {a.lateMinutes}m</div>}
                      {a.workedMinutes > 0 && <div className="text-xs text-slate-600">Worked: {formatMinutes(a.workedMinutes)}</div>}
                      <ColoredBadge status={a.status} list={ATTENDANCE_STATUSES} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Department Breakdown */}
      {departmentStats.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">DEPARTMENT ATTENDANCE TODAY</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {departmentStats.map((d: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                  <span className="font-medium">{d.departmentId || "Unassigned"}</span>
                  <div className="flex gap-4 text-xs">
                    <span>Records: {d._count.id}</span>
                    <span>Worked: {formatMinutes(d._sum.workedMinutes || 0)}</span>
                    <span className="text-fuchsia-700">OT: {formatMinutes(d._sum.overtimeMinutes || 0)}</span>
                    {d._sum.lateMinutes > 0 && <span className="text-amber-700">Late: {formatMinutes(d._sum.lateMinutes || 0)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, alert }: { label: string; value: string | number; icon: any; color: string; alert?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${color} text-white p-3 shadow-sm ${alert ? "ring-2 ring-rose-300 ring-offset-1" : ""}`}>
      <div className="absolute top-1 right-1 text-white/20">
        <Icon className="w-8 h-8" strokeWidth={1.5} />
      </div>
      <div className="relative">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-white/80 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

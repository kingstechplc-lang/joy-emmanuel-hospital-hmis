"use client";
// =====================================================================
// WORKFORCE DASHBOARD — Real database statistics for shifts & leave
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarClock, Users, UserCheck, UserX, Moon, Phone, AlertTriangle,
  ArrowLeftRight, ShieldAlert, Clock, Plane, Calendar, TrendingUp, AlertCircle,
} from "lucide-react";
import {
  fetchJson, formatTime, ColoredBadge, SHIFT_STATUSES, LEAVE_STATUSES,
} from "./workforce-helpers";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui-helpers";
import { useState } from "react";

export function WorkforceDashboard() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [departmentId, setDepartmentId] = useState<string>("");

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (departmentId) params.set("departmentId", departmentId);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["workforce-dashboard", activeFacilityId, departmentId],
    queryFn: () => fetchJson(`/api/workforce-dashboard${qs}`),
    enabled: !!activeFacilityId,
    refetchInterval: 60000, // refresh every minute
  });

  if (!activeFacilityId) {
    return (
      <Card><CardContent className="p-6">
        <EmptyState title="No facility selected" description="Select a facility from the top bar to view the workforce dashboard." icon={AlertCircle} />
      </CardContent></Card>
    );
  }

  if (isLoading) return <LoadingState rows={8} />;
  if (isError) return <ErrorState message="Failed to load dashboard data" onRetry={() => refetch()} />;

  const shiftStats = data?.shiftStats || {};
  const leaveStats = data?.leaveStats || {};
  const shortages = data?.departmentsWithShortages || [];
  const todaysStaffing = data?.todaysStaffing || [];
  const onCallToday = data?.onCallToday || [];

  return (
    <div className="space-y-6">
      {/* Shift Statistics */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-blue-600" /> SHIFT STATISTICS — {new Date(data.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          <StatCard label="Total Shifts Today" value={shiftStats.totalShiftsToday ?? 0} icon={CalendarClock} color="from-blue-500 to-blue-600" />
          <StatCard label="Scheduled" value={shiftStats.scheduledStaff ?? 0} icon={Users} color="from-cyan-500 to-cyan-600" />
          <StatCard label="On Duty" value={shiftStats.staffOnDuty ?? 0} icon={UserCheck} color="from-emerald-500 to-emerald-600" />
          <StatCard label="Off Duty" value={shiftStats.staffOffDuty ?? 0} icon={UserX} color="from-slate-500 to-slate-600" />
          <StatCard label="Night Shift" value={shiftStats.nightShiftStaff ?? 0} icon={Moon} color="from-indigo-500 to-indigo-600" />
          <StatCard label="On-Call" value={shiftStats.onCallStaff ?? 0} icon={Phone} color="from-purple-500 to-purple-600" />
          <StatCard label="Unfilled Shifts" value={shiftStats.unfilledShifts ?? 0} icon={AlertTriangle} color="from-rose-500 to-rose-600" alert={shiftStats.unfilledShifts > 0} />
          <StatCard label="Shift Conflicts" value={shiftStats.shiftConflicts ?? 0} icon={AlertCircle} color="from-orange-500 to-orange-600" alert={shiftStats.shiftConflicts > 0} />
          <StatCard label="Pending Swaps" value={shiftStats.pendingSwaps ?? 0} icon={ArrowLeftRight} color="from-amber-500 to-amber-600" />
          <StatCard label="Coverage Requests" value={shiftStats.coverageRequests ?? 0} icon={ShieldAlert} color="from-red-500 to-red-600" alert={shiftStats.coverageRequests > 0} />
          <StatCard label="Overtime Hours" value={(shiftStats.overtimeHours ?? 0).toFixed(1)} icon={Clock} color="from-fuchsia-500 to-fuchsia-600" />
        </div>
      </div>

      {/* Leave Statistics */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Plane className="w-4 h-4 text-emerald-600" /> LEAVE STATISTICS
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="On Leave Today" value={leaveStats.staffOnLeave ?? 0} icon={Plane} color="from-emerald-500 to-emerald-600" />
          <StatCard label="Pending Requests" value={leaveStats.pendingLeaveRequests ?? 0} icon={Clock} color="from-amber-500 to-amber-600" alert={leaveStats.pendingLeaveRequests > 0} />
          <StatCard label="Approved (Total)" value={leaveStats.approvedLeave ?? 0} icon={UserCheck} color="from-emerald-500 to-emerald-600" />
          <StatCard label="Rejected" value={leaveStats.rejectedLeave ?? 0} icon={UserX} color="from-rose-500 to-rose-600" />
          <StatCard label="Cancelled" value={leaveStats.cancelledLeave ?? 0} icon={UserX} color="from-slate-500 to-slate-600" />
          <StatCard label="Returning Today" value={leaveStats.staffReturningToday ?? 0} icon={TrendingUp} color="from-cyan-500 to-cyan-600" />
          <StatCard label="Going On Leave Soon" value={leaveStats.staffGoingOnLeaveSoon ?? 0} icon={Calendar} color="from-blue-500 to-blue-600" />
          <StatCard label="Overdue Returns" value={leaveStats.overdueReturns ?? 0} icon={AlertTriangle} color="from-rose-500 to-rose-600" alert={leaveStats.overdueReturns > 0} />
        </div>
      </div>

      {/* Staffing Shortages */}
      {shortages.length > 0 && (
        <Card className="border-rose-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-4 h-4" /> DEPARTMENTS WITH STAFFING SHORTAGES
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {shortages.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 bg-rose-50 border border-rose-200 rounded-lg">
                  <div className="text-sm">
                    <span className="font-medium text-slate-900">{s.department?.name || "Unassigned"}</span>
                    <span className="text-slate-500 ml-2">at {s.facility?.name}</span>
                    {s.shiftType && s.shiftType !== "any" && (
                      <Badge variant="outline" className="ml-2 text-xs capitalize">{s.shiftType}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-rose-700 font-medium">Need: {s.required}</span>
                    <span className="text-slate-700">Have: {s.actual}</span>
                    <Badge variant="destructive" className="text-xs">Short by {s.shortage}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Staffing + On-Call */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" /> TODAY&apos;S STAFFING ({todaysStaffing.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {todaysStaffing.length === 0 ? (
              <EmptyState title="No shifts scheduled today" description="Schedule shifts to see them here." />
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2">
                {todaysStaffing.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {s.staff.firstName} {s.staff.lastName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {s.staff.staffNumber} • {s.staff.profession || s.staff.professionalRole || "—"} • {s.department?.name || "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-700">
                        {formatTime(s.startTime)} → {formatTime(s.endTime)}
                      </div>
                      <ColoredBadge status={s.status} list={SHIFT_STATUSES} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Phone className="w-4 h-4 text-purple-600" /> ON-CALL TODAY ({onCallToday.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {onCallToday.length === 0 ? (
              <EmptyState title="No on-call staff today" description="Assign on-call staff for emergency coverage." />
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2">
                {onCallToday.map((o: any) => (
                  <div key={o.id} className="flex items-center justify-between p-2 bg-purple-50 rounded-lg border border-purple-100">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 truncate flex items-center gap-2">
                        {o.staff.firstName} {o.staff.lastName}
                        {o.isPrimary && <Badge className="bg-purple-600 text-white text-xs">PRIMARY</Badge>}
                        {o.isBackup && <Badge variant="outline" className="text-xs">BACKUP</Badge>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {o.department?.name || "—"} • {o.contactMethod || "phone"}: {o.contactValue || o.staff.phone || "—"}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-600">
                      Esc #{o.escalationOrder}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, alert }: { label: string; value: string | number; icon: any; color: string; alert?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${color} text-white p-3 shadow-sm ${alert ? "ring-2 ring-rose-300 ring-offset-1 animate-pulse" : ""}`}>
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

"use client";
// =====================================================================
// ATTENDANCE TABS — Today, Records, Exceptions, Corrections, Overtime, Periods, Settings
// =====================================================================
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  LogIn, LogOut, Search, Plus, Check, X, AlertTriangle, Clock, Lock, Unlock,
  Send, FileText, Timer, Settings, Ban, ChevronLeft, ChevronRight, CalendarDays,
  RefreshCcw, UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchJson, usePermissions, ColoredBadge, ATTENDANCE_STATUSES, EXCEPTION_STATUSES,
  CORRECTION_STATUSES, OVERTIME_STATUSES, PERIOD_STATUSES, formatTime, formatDate,
  formatDateTime, formatMinutes, todayStr,
} from "./attendance-helpers";
import { EmptyState, LoadingState, ErrorState, ClearableSearch, usePagination, Pagination } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

// =====================================================================
// TODAY TAB — Live check-in/out board
// =====================================================================
export function TodayTab() {
  const { can } = usePermissions();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const today = todayStr();
  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  params.set("date", today);
  const qs = `?${params.toString()}`;

  const attendanceQ = useQuery({
    queryKey: ["attendance", "today", activeFacilityId, today],
    queryFn: () => fetchJson(`/api/attendance${qs}`),
    enabled: !!activeFacilityId,
    refetchInterval: 30000,
  });

  const staffQ = useQuery({
    queryKey: ["staff-for-attendance", activeFacilityId],
    queryFn: () => fetchJson(`/api/staff${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`),
    enabled: !!activeFacilityId,
  });

  const attendanceByStaffId: Record<string, any> = {};
  (attendanceQ.data?.items || []).forEach((a: any) => { attendanceByStaffId[a.staffId] = a; });

  const filteredStaff = (staffQ.data?.items || []).filter((s: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.staffNumber?.toLowerCase().includes(q);
  });

  const actionMutation = useMutation({
    mutationFn: async ({ staffId, action }: { staffId: string; action: "check_in" | "check_out" }) => {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, facilityId: activeFacilityId, action, date: today }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "check_in" ? "Checked in successfully" : "Checked out successfully");
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["attendance-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!activeFacilityId) {
    return <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Please select a facility to view today&apos;s attendance.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search staff by name or number" className="pl-8" />
          </div>
        </CardContent>
      </Card>

      {staffQ.isLoading || attendanceQ.isLoading ? (
        <LoadingState rows={6} />
      ) : filteredStaff.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No staff members found" description="Add staff members to the facility to begin tracking attendance." icon={UserCheck} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Shift</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Check In</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Check Out</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Worked</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    {can(["shift.manage", "attendance.record", "staff.manage"]) && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((s: any) => {
                    const att = attendanceByStaffId[s.id];
                    const isCheckedIn = !!att?.checkInAt;
                    const isCheckedOut = !!att?.checkOutAt;
                    const isOnLeave = s.employmentStatus === "on_leave";
                    return (
                      <tr key={s.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{s.firstName} {s.lastName}</div>
                          <div className="text-xs text-slate-500">{s.staffNumber} • {s.profession || s.professionalRole?.replace(/_/g, " ") || "—"}</div>
                        </td>
                        <td className="p-3 text-xs">
                          {att?.shift ? (
                            <div>
                              <div className="capitalize">{att.shift.shiftType || "—"}</div>
                              <div className="text-slate-500">{formatTime(att.shift.startTime)} → {formatTime(att.shift.endTime)}</div>
                            </div>
                          ) : <span className="text-slate-400">No shift</span>}
                        </td>
                        <td className="p-3">
                          {att?.checkInAt ? (
                            <span className="text-slate-700 flex items-center gap-1">
                              <LogIn className="w-3 h-3 text-emerald-600" />
                              {formatTime(att.checkInAt)}
                              {att.lateMinutes > 0 && <span className="text-xs text-amber-700 ml-1">(+{att.lateMinutes}m)</span>}
                            </span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="p-3">
                          {att?.checkOutAt ? (
                            <span className="text-slate-700 flex items-center gap-1">
                              <LogOut className="w-3 h-3 text-rose-600" />
                              {formatTime(att.checkOutAt)}
                              {att.earlyDepartureMinutes > 0 && <span className="text-xs text-orange-700 ml-1">(-{att.earlyDepartureMinutes}m)</span>}
                            </span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="p-3 text-slate-700">{att?.workedMinutes ? formatMinutes(att.workedMinutes) : "—"}</td>
                        <td className="p-3">
                          {isOnLeave ? (
                            <ColoredBadge status="on_leave" list={ATTENDANCE_STATUSES} />
                          ) : att ? (
                            <ColoredBadge status={att.status} list={ATTENDANCE_STATUSES} />
                          ) : (
                            <ColoredBadge status="off_duty" list={ATTENDANCE_STATUSES} />
                          )}
                        </td>
                        {can(["shift.manage", "attendance.record", "staff.manage"]) && (
                          <td className="p-3 text-right">
                            {isOnLeave ? (
                              <span className="text-xs text-slate-400">On leave</span>
                            ) : att?.isLocked ? (
                              <span className="text-xs text-slate-400">Locked</span>
                            ) : !isCheckedIn ? (
                              <Button size="sm" onClick={() => actionMutation.mutate({ staffId: s.id, action: "check_in" })} disabled={actionMutation.isPending} className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700">
                                <LogIn className="w-3.5 h-3.5" /> Check In
                              </Button>
                            ) : isCheckedIn && !isCheckedOut ? (
                              <Button size="sm" onClick={() => actionMutation.mutate({ staffId: s.id, action: "check_out" })} disabled={actionMutation.isPending} className="h-8 gap-1 bg-teal-600 hover:bg-teal-700">
                                <LogOut className="w-3.5 h-3.5" /> Check Out
                              </Button>
                            ) : (
                              <span className="text-xs text-emerald-600 flex items-center gap-1 justify-end">
                                <Check className="w-3.5 h-3.5" /> Done
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// RECORDS TAB — Full attendance history with filters
// =====================================================================
export function RecordsTab() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [staffFilter, setStaffFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (staffFilter !== "all") params.set("staffId", staffFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const qs = `?${params.toString()}`;

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["attendance", "records", activeFacilityId, staffFilter, statusFilter, dateFrom, dateTo],
    queryFn: () => fetchJson(`/api/attendance${qs}`),
    enabled: !!activeFacilityId,
  });

  const staffQ = useQuery({
    queryKey: ["staff-for-attendance-records", activeFacilityId],
    queryFn: () => fetchJson(`/api/staff${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`),
    enabled: !!activeFacilityId,
  });

  const items = data?.items || [];
  const staffList = staffQ.data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 15);

  if (!activeFacilityId) {
    return <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Please select a facility to view attendance records.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3 flex-wrap">
          <Select value={staffFilter || "all"} onValueChange={setStaffFilter}>
            <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staffList.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.staffNumber}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter || "all"} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {ATTENDANCE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="md:w-40" placeholder="From" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="md:w-40" placeholder="To" />
          <div className="flex-1" />
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }} className="gap-2">
            <RefreshCcw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState message="Failed to load attendance records" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No attendance records found" description="No records match your filters." icon={CalendarDays} /></CardContent></Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">Showing {items.length} record{items.length !== 1 ? "s" : ""}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Check In</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Check Out</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Worked</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Late</th>
                    <th className="text-left p-3 font-semibold text-slate-700">OT</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((a: any) => (
                    <tr key={a.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{a.staff?.firstName} {a.staff?.lastName}</div>
                        <div className="text-xs text-slate-500">{a.staff?.staffNumber}</div>
                      </td>
                      <td className="p-3">{formatDate(a.date)}</td>
                      <td className="p-3">{a.checkInAt ? formatTime(a.checkInAt) : <span className="text-slate-400">—</span>}</td>
                      <td className="p-3">{a.checkOutAt ? formatTime(a.checkOutAt) : <span className="text-slate-400">—</span>}</td>
                      <td className="p-3 text-slate-700">{a.workedMinutes ? formatMinutes(a.workedMinutes) : "—"}</td>
                      <td className="p-3">{a.lateMinutes > 0 ? <span className="text-amber-700">{a.lateMinutes}m</span> : "—"}</td>
                      <td className="p-3">{a.overtimeMinutes > 0 ? <span className="text-fuchsia-700">{formatMinutes(a.overtimeMinutes)}</span> : "—"}</td>
                      <td className="p-3"><ColoredBadge status={a.status} list={ATTENDANCE_STATUSES} /></td>
                      <td className="p-3 text-xs capitalize text-slate-500">{a.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// EXCEPTIONS TAB — Exception center
// =====================================================================
export function ExceptionsTab() {
  const { can } = usePermissions();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (status !== "all") params.set("status", status);
  const qs = `?${params.toString()}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["attendance-exceptions", activeFacilityId, status],
    queryFn: () => fetchJson(`/api/attendance/exceptions${qs}`),
    enabled: !!activeFacilityId,
  });

  const items = data?.items || [];

  const resolveMutation = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: "resolve" | "ignore" | "escalate"; note?: string }) => {
      const res = await fetch(`/api/attendance/exceptions/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action === "ignore" ? "ignored" : action === "escalate" ? "escalated" : "resolved", note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Exception ${vars.action}d`);
      qc.invalidateQueries({ queryKey: ["attendance-exceptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={status || "all"} onValueChange={setStatus}>
          <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {EXCEPTION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load exceptions" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No attendance exceptions" description="Exceptions are automatically detected for late arrivals, early departures, missing check-outs, and other anomalies." icon={AlertTriangle} /></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((e: any) => (
            <Card key={e.id} className={e.severity === "error" ? "border-rose-300" : e.severity === "warning" ? "border-amber-300" : ""}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ColoredBadge status={e.status} list={EXCEPTION_STATUSES} />
                      <Badge variant="outline" className="text-xs capitalize">{e.exceptionType.replace(/_/g, " ")}</Badge>
                      {e.severity === "error" && <Badge variant="destructive">ERROR</Badge>}
                      <span className="text-sm font-medium text-slate-900">{e.staff?.firstName} {e.staff?.lastName}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {formatDate(e.date)} • {e.facility?.name} • {e.department?.name || "—"}
                    </div>
                    <div className="text-sm text-slate-700 mt-1">{e.description}</div>
                    {e.resolutionNote && <div className="text-xs text-emerald-700 mt-1">Resolution: {e.resolutionNote}</div>}
                  </div>
                  {can(["shift.manage", "attendance.review", "attendance.manage"]) && e.status === "open" && (
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="outline" onClick={() => {
                        const note = prompt("Resolution note (optional):");
                        resolveMutation.mutate({ id: e.id, action: "resolve", note: note || undefined });
                      }} className="h-7 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                        <Check className="w-3 h-3 mr-1" /> Resolve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate({ id: e.id, action: "escalate" })} className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50">
                        Escalate
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        if (confirm("Ignore this exception? A reason is recommended.")) {
                          resolveMutation.mutate({ id: e.id, action: "ignore", note: "Ignored by supervisor" });
                        }
                      }} className="h-7 text-xs text-slate-500">
                        Ignore
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// CORRECTIONS TAB — Correction request workflow
// =====================================================================
export function CorrectionsTab() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");

  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  const qs = `?${params.toString()}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["attendance-corrections", status],
    queryFn: () => fetchJson(`/api/attendance/corrections${qs}`),
  });

  const items = data?.items || [];

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, comment }: { id: string; action: "approve" | "reject"; comment?: string }) => {
      const res = await fetch(`/api/attendance/corrections/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Correction ${vars.action}d`);
      qc.invalidateQueries({ queryKey: ["attendance-corrections"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={status || "all"} onValueChange={setStatus}>
          <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {CORRECTION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load corrections" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No attendance corrections" description="Staff can submit correction requests when they forget to check in/out or need to fix a record." icon={FileText} /></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((c: any) => (
            <Card key={c.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ColoredBadge status={c.status} list={CORRECTION_STATUSES} />
                      <span className="text-sm font-medium">{c.staff?.firstName} {c.staff?.lastName}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Attendance date: {formatDate(c.attendance?.date)} • Requested: {formatDateTime(c.createdAt)}
                    </div>
                    <div className="text-sm text-slate-700 mt-1">Reason: {c.reason}</div>
                    <div className="text-xs text-slate-600 mt-1 grid grid-cols-2 gap-2">
                      <div>
                        <span className="font-medium">Original:</span> {c.originalCheckInAt ? formatTime(c.originalCheckInAt) : "—"} → {c.originalCheckOutAt ? formatTime(c.originalCheckOutAt) : "—"}
                      </div>
                      <div>
                        <span className="font-medium">Requested:</span> {c.requestedCheckInAt ? formatTime(c.requestedCheckInAt) : "—"} → {c.requestedCheckOutAt ? formatTime(c.requestedCheckOutAt) : "—"}
                      </div>
                    </div>
                    {c.reviewComment && <div className="text-xs text-emerald-700 mt-1">Review: {c.reviewComment}</div>}
                  </div>
                </div>
                {can(["shift.manage", "attendance_correction.approve", "attendance.manage"]) && c.status === "pending" && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => {
                      const comment = prompt("Approval comment (optional):");
                      actionMutation.mutate({ id: c.id, action: "approve", comment: comment || undefined });
                    }} className="bg-emerald-600 hover:bg-emerald-700">
                      <Check className="w-3.5 h-3.5 mr-1" /> Approve & Apply
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      const comment = prompt("Rejection reason:");
                      actionMutation.mutate({ id: c.id, action: "reject", comment: comment || undefined });
                    }}>
                      <X className="w-3.5 h-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// OVERTIME TAB — Overtime records with approval workflow
// =====================================================================
export function OvertimeTab() {
  const { can } = usePermissions();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (status !== "all") params.set("status", status);
  const qs = `?${params.toString()}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["attendance-overtime", activeFacilityId, status],
    queryFn: () => fetchJson(`/api/attendance/overtime${qs}`),
    enabled: !!activeFacilityId,
  });

  const items = data?.items || [];

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: "approve" | "reject"; reason?: string }) => {
      const res = await fetch(`/api/attendance/overtime/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Overtime ${vars.action}d`);
      qc.invalidateQueries({ queryKey: ["attendance-overtime"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={status || "all"} onValueChange={setStatus}>
          <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {OVERTIME_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load overtime records" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No overtime records" description="Overtime is auto-calculated when staff work beyond their scheduled hours and requires supervisor approval." icon={Timer} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Overtime</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Category</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Reason</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    {can(["shift.manage", "overtime.manage"]) && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((o: any) => (
                    <tr key={o.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium">{o.staff?.firstName} {o.staff?.lastName}</div>
                        <div className="text-xs text-slate-500">{o.staff?.staffNumber}</div>
                      </td>
                      <td className="p-3">{formatDate(o.date)}</td>
                      <td className="p-3 font-medium text-fuchsia-700">{formatMinutes(o.overtimeMinutes)}</td>
                      <td className="p-3"><Badge variant="outline" className="capitalize text-xs">{o.category.replace(/_/g, " ")}</Badge></td>
                      <td className="p-3 max-w-xs truncate text-slate-600">{o.reason || "—"}</td>
                      <td className="p-3"><ColoredBadge status={o.status} list={OVERTIME_STATUSES} /></td>
                      {can(["shift.manage", "overtime.manage"]) && o.status === "pending" && (
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => actionMutation.mutate({ id: o.id, action: "approve" })} className="text-emerald-600">
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => {
                              const reason = prompt("Rejection reason:");
                              if (reason) actionMutation.mutate({ id: o.id, action: "reject", reason });
                            }} className="text-rose-600">
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// PERIODS TAB — Attendance period locking workflow
// =====================================================================
export function PeriodsTab() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["attendance-periods"],
    queryFn: () => fetchJson(`/api/attendance/periods`),
  });

  const items = data?.items || [];

  const lockMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/attendance/periods/${id}/lock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Period locked — ${data.item.totalRecords} records, ${formatMinutes(data.item.totalWorkedMinutes)} worked, ${formatMinutes(data.item.totalOvertimeMinutes)} overtime`);
      qc.invalidateQueries({ queryKey: ["attendance-periods"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlockMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/attendance/periods/${id}/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Period unlocked");
      qc.invalidateQueries({ queryKey: ["attendance-periods"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {can(["shift.manage", "attendance.manage"]) && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New Period
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={3} />
      ) : isError ? (
        <ErrorState message="Failed to load attendance periods" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No attendance periods" description="Create an attendance period to manage payroll locking workflow." icon={Lock} /></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p: any) => (
            <Card key={p.id} className={p.status === "locked" ? "border-slate-400" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">{p.name}</h4>
                    <div className="text-xs text-slate-500 mt-1">{p.facility?.name || "All facilities"}</div>
                    <div className="text-sm text-slate-700 mt-1">{formatDate(p.startDate)} → {formatDate(p.endDate)}</div>
                  </div>
                  <ColoredBadge status={p.status} list={PERIOD_STATUSES} />
                </div>
                {p.status === "locked" && (
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3 mt-2 p-2 bg-slate-50 rounded">
                    <div>Records: <span className="font-medium">{p.totalRecords}</span></div>
                    <div>Worked: <span className="font-medium">{formatMinutes(p.totalWorkedMinutes)}</span></div>
                    <div>Overtime: <span className="font-medium text-fuchsia-700">{formatMinutes(p.totalOvertimeMinutes)}</span></div>
                    <div>Exceptions: <span className="font-medium text-rose-700">{p.totalExceptions}</span></div>
                  </div>
                )}
                <div className="flex gap-1 mt-2">
                  {can(["shift.manage", "attendance_period.lock"]) && p.status !== "locked" && (
                    <Button size="sm" onClick={() => {
                      if (confirm(`Lock period "${p.name}"? This will lock all attendance records in the date range.`)) {
                        lockMutation.mutate(p.id);
                      }
                    }} className="bg-slate-600 hover:bg-slate-700">
                      <Lock className="w-3 h-3 mr-1" /> Lock
                    </Button>
                  )}
                  {can(["shift.manage", "attendance_period.unlock"]) && p.status === "locked" && (
                    <Button size="sm" variant="outline" onClick={() => {
                      const reason = prompt("Reason for unlocking (required):");
                      if (reason) unlockMutation.mutate({ id: p.id, reason });
                    }} className="text-orange-700 border-orange-300 hover:bg-orange-50">
                      <Unlock className="w-3 h-3 mr-1" /> Unlock
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showNew && <NewPeriodDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewPeriodDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/attendance/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, startDate, endDate, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Attendance period created");
      qc.invalidateQueries({ queryKey: ["attendance-periods"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Attendance Period</DialogTitle>
          <DialogDescription>Define a date range for attendance review and payroll locking.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Period Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., August 2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel required>Start Date</FieldLabel>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>End Date</FieldLabel>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name || !startDate || !endDate} className="bg-emerald-600 hover:bg-emerald-700">
            Create Period
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// SETTINGS TAB — Attendance policies configuration
// =====================================================================
export function SettingsTab() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [showNewPolicy, setShowNewPolicy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["attendance-policies"],
    queryFn: () => fetchJson(`/api/attendance/policies`),
  });

  const items = data?.items || [];

  const deletePolicy = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/attendance/policies/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast.success("Policy deactivated"); qc.invalidateQueries({ queryKey: ["attendance-policies"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Attendance Policies ({items.length})</CardTitle>
          {can(["attendance_policy.manage", "shift.manage"]) && <Button size="sm" onClick={() => setShowNewPolicy(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-3 h-3 mr-1" /> New Policy</Button>}
        </CardHeader>
        <CardContent>
          {isLoading ? <LoadingState rows={3} /> : items.length === 0 ? (
            <EmptyState title="No attendance policies configured" description="Attendance policies define grace periods, late thresholds, overtime rules, break rules, and rounding. Default values are used when no policy is set." icon={Settings} />
          ) : (
            <div className="space-y-2">
              {items.map((p: any) => (
                <div key={p.id} className="p-3 bg-slate-50 rounded text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{p.name}</div>
                    {can(["attendance_policy.manage", "shift.manage"]) && <Button size="sm" variant="ghost" onClick={() => { if (confirm("Deactivate this policy?")) deletePolicy.mutate(p.id); }} className="h-6 text-xs text-rose-600 hover:bg-rose-50"><Ban className="w-3 h-3" /></Button>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{p.facility?.name || "All facilities"} • {p.department?.name || "All departments"}</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mt-2">
                    <div>Grace: <span className="font-medium">{p.gracePeriodMinutes}m</span></div>
                    <div>Late threshold: <span className="font-medium">{p.lateThresholdMinutes}m</span></div>
                    <div>Early departure: <span className="font-medium">{p.earlyDepartureThresholdMinutes}m</span></div>
                    <div>Max daily hours: <span className="font-medium">{p.maxDailyHours}h</span></div>
                    <div>OT threshold: <span className="font-medium">{formatMinutes(p.overtimeThresholdMinutes)}</span></div>
                    <div>Break: <span className="font-medium">{p.breakDurationMinutes}m {p.paidBreaks ? "(paid)" : "(unpaid)"}</span></div>
                    <div>Rounding: <span className="font-medium">{p.roundingMinutes > 0 ? `${p.roundingMinutes}m (${p.roundingMode})` : "None"}</span></div>
                    <div>Night hours: <span className="font-medium">{p.nightStartHour}:00-{p.nightEndHour}:00</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Default Policy Values (used when no configured policy exists)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="p-2 bg-slate-50 rounded">Grace Period: <span className="font-medium">10 min</span></div>
            <div className="p-2 bg-slate-50 rounded">Early Departure: <span className="font-medium">15 min</span></div>
            <div className="p-2 bg-slate-50 rounded">Max Daily Hours: <span className="font-medium">13h</span></div>
            <div className="p-2 bg-slate-50 rounded">Overtime Threshold: <span className="font-medium">8h (480m)</span></div>
            <div className="p-2 bg-slate-50 rounded">Min Rest: <span className="font-medium">11h</span></div>
            <div className="p-2 bg-slate-50 rounded">Break: <span className="font-medium">30m (paid)</span></div>
            <div className="p-2 bg-slate-50 rounded">Night Hours: <span className="font-medium">19:00-07:00</span></div>
            <div className="p-2 bg-slate-50 rounded">Absence Processing: <span className="font-medium">After 2h</span></div>
          </div>
        </CardContent>
      </Card>
      {showNewPolicy && <NewAttendancePolicyDialog onClose={() => setShowNewPolicy(false)} />}
    </div>
  );
}

function NewAttendancePolicyDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [facilityId, setFacilityId] = useState("__none__");
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState("10");
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState("0");
  const [earlyDepartureThresholdMinutes, setEarlyDepartureThresholdMinutes] = useState("15");
  const [maxDailyHours, setMaxDailyHours] = useState("13");
  const [overtimeThresholdMinutes, setOvertimeThresholdMinutes] = useState("480");
  const [breakDurationMinutes, setBreakDurationMinutes] = useState("30");
  const [paidBreaks, setPaidBreaks] = useState(true);
  const [roundingMinutes, setRoundingMinutes] = useState("0");
  const [nightStartHour, setNightStartHour] = useState("19");
  const [nightEndHour, setNightEndHour] = useState("7");
  const [notes, setNotes] = useState("");

  const { data: facilitiesData } = useQuery({ queryKey: ["facilities-for-att-policy"], queryFn: () => fetchJson(`/api/facilities`) });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/attendance/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, facilityId: facilityId !== "__none__" ? facilityId : undefined,
          gracePeriodMinutes: parseInt(gracePeriodMinutes, 10),
          lateThresholdMinutes: parseInt(lateThresholdMinutes, 10),
          earlyDepartureThresholdMinutes: parseInt(earlyDepartureThresholdMinutes, 10),
          maxDailyHours: parseFloat(maxDailyHours),
          overtimeThresholdMinutes: parseInt(overtimeThresholdMinutes, 10),
          breakDurationMinutes: parseInt(breakDurationMinutes, 10),
          paidBreaks,
          roundingMinutes: parseInt(roundingMinutes, 10),
          nightStartHour: parseInt(nightStartHour, 10),
          nightEndHour: parseInt(nightEndHour, 10),
          notes,
        }),
      });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("Policy created"); qc.invalidateQueries({ queryKey: ["attendance-policies"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Attendance Policy</DialogTitle><DialogDescription>Configure grace periods, thresholds, break rules, and rounding for attendance calculations.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2"><FieldLabel required>Policy Name</FieldLabel><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Default Hospital Policy" /></div>
          <div className="space-y-1.5"><Label>Facility</Label><Select value={facilityId} onValueChange={setFacilityId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">All Facilities</SelectItem>{(facilitiesData?.items || []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Grace Period (minutes)</Label><Input type="number" value={gracePeriodMinutes} onChange={(e) => setGracePeriodMinutes(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Late Threshold (minutes)</Label><Input type="number" value={lateThresholdMinutes} onChange={(e) => setLateThresholdMinutes(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Early Departure Threshold (minutes)</Label><Input type="number" value={earlyDepartureThresholdMinutes} onChange={(e) => setEarlyDepartureThresholdMinutes(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Max Daily Hours</Label><Input type="number" step="0.5" value={maxDailyHours} onChange={(e) => setMaxDailyHours(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Overtime Threshold (minutes)</Label><Input type="number" value={overtimeThresholdMinutes} onChange={(e) => setOvertimeThresholdMinutes(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Break Duration (minutes)</Label><Input type="number" value={breakDurationMinutes} onChange={(e) => setBreakDurationMinutes(e.target.value)} /></div>
          <div className="space-y-1.5"><label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" checked={paidBreaks} onChange={(e) => setPaidBreaks(e.target.checked)} /> Paid Breaks</label></div>
          <div className="space-y-1.5"><Label>Rounding (minutes, 0=none)</Label><Input type="number" value={roundingMinutes} onChange={(e) => setRoundingMinutes(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Night Start Hour</Label><Input type="number" min="0" max="23" value={nightStartHour} onChange={(e) => setNightStartHour(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Night End Hour</Label><Input type="number" min="0" max="23" value={nightEndHour} onChange={(e) => setNightEndHour(e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name} className="bg-emerald-600 hover:bg-emerald-700">Create Policy</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// ANALYTICS TAB — Trends and comparisons
// =====================================================================
export function AnalyticsTab() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [departmentId, setDepartmentId] = useState("all");

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const qs = `?${params.toString()}`;

  const { data, isLoading } = useQuery({
    queryKey: ["attendance-analytics", activeFacilityId, dateFrom, dateTo],
    queryFn: () => fetchJson(`/api/attendance/analytics${qs}`),
  });

  const { data: deptsData } = useQuery({
    queryKey: ["depts-for-analytics", activeFacilityId],
    queryFn: () => fetchJson(`/api/departments${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`),
    enabled: !!activeFacilityId,
  });

  const allDepts = deptsData?.items || [];

  const summary = data?.summary || {};
  const trend = data?.trend || [];
  let deptComparison = data?.departmentComparison || [];
  const facComparison = data?.facilityComparison || [];

  // Client-side department filter
  if (departmentId !== "all") {
    deptComparison = deptComparison.filter((d: any) => d.departmentId === departmentId);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3 flex-wrap">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="md:w-40" placeholder="From" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="md:w-40" placeholder="To" />
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {allDepts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {(dateFrom || dateTo || departmentId !== "all") && (
            <Button variant="outline" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); setDepartmentId("all"); }}>Clear</Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? <LoadingState rows={6} /> : (
      <>
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">ATTENDANCE ANALYTICS {dateFrom || dateTo ? `(${dateFrom || "Start"} to ${dateTo || "Today"})` : "— Last 30 Days"}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatBox label="Total Records" value={summary.totalRecords ?? 0} />
          <StatBox label="Late Count" value={summary.lateCount ?? 0} color="text-amber-700" />
          <StatBox label="Early Departures" value={summary.earlyDepartureCount ?? 0} color="text-orange-700" />
          <StatBox label="Absent" value={summary.absentCount ?? 0} color="text-rose-700" />
          <StatBox label="Missing Check-Outs" value={summary.missingCheckoutCount ?? 0} color="text-rose-700" />
          <StatBox label="Overtime Records" value={summary.overtimeCount ?? 0} color="text-fuchsia-700" />
          <StatBox label="Total Worked" value={formatMinutes(summary.totalWorkedMinutes ?? 0)} />
          <StatBox label="Total Overtime" value={formatMinutes(summary.totalOvertimeMinutes ?? 0)} color="text-fuchsia-700" />
          <StatBox label="Total Late Minutes" value={formatMinutes(summary.totalLateMinutes ?? 0)} color="text-amber-700" />
          <StatBox label="On Leave Records" value={summary.onLeaveCount ?? 0} color="text-purple-700" />
          <StatBox label="Attendance Rate" value={`${summary.attendanceRate ?? 0}%`} color="text-emerald-700" />
        </div>
      </div>

      {/* Trend chart (simple bar visualization) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">14-Day Attendance Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-40">
            {trend.map((d: any, i: number) => {
              const max = Math.max(...trend.map((t: any) => t.present), 1);
              const height = (d.present / max) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.present} present, ${d.late} late, ${d.absent} absent`}>
                  <div className="w-full flex flex-col justify-end h-full">
                    <div className="bg-emerald-500 rounded-t" style={{ height: `${height}%` }} />
                  </div>
                  <div className="text-[8px] text-slate-500">{d.date.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Department comparison */}
      {deptComparison.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Department Comparison</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Department</th>
                    <th className="text-right p-2 font-semibold">Records</th>
                    <th className="text-right p-2 font-semibold">Worked</th>
                    <th className="text-right p-2 font-semibold">Overtime</th>
                    <th className="text-right p-2 font-semibold">Late</th>
                  </tr>
                </thead>
                <tbody>
                  {deptComparison.map((d: any, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="p-2 font-medium">{d.departmentName}</td>
                      <td className="p-2 text-right">{d.totalRecords}</td>
                      <td className="p-2 text-right">{formatMinutes(d.totalWorkedMinutes)}</td>
                      <td className="p-2 text-right text-fuchsia-700">{formatMinutes(d.totalOvertimeMinutes)}</td>
                      <td className="p-2 text-right text-amber-700">{formatMinutes(d.totalLateMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Facility comparison */}
      {facComparison.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Facility Comparison</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Facility</th>
                    <th className="text-right p-2 font-semibold">Records</th>
                    <th className="text-right p-2 font-semibold">Worked</th>
                    <th className="text-right p-2 font-semibold">Overtime</th>
                  </tr>
                </thead>
                <tbody>
                  {facComparison.map((f: any, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="p-2 font-medium">{f.facilityName}</td>
                      <td className="p-2 text-right">{f.totalRecords}</td>
                      <td className="p-2 text-right">{formatMinutes(f.totalWorkedMinutes)}</td>
                      <td className="p-2 text-right text-fuchsia-700">{formatMinutes(f.totalOvertimeMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      </>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-slate-500">{label}</div>
        <div className={`text-lg font-bold ${color || "text-slate-900"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

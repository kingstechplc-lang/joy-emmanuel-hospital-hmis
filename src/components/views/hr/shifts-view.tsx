"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Search, Plus, Check, X, Clock, Ban } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate } from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

const SHIFT_TYPES = [
  { value: "morning", label: "Morning" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "on_call", label: "On Call" },
];

const LEAVE_TYPES = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "maternity", label: "Maternity Leave" },
  { value: "paternity", label: "Paternity Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
  { value: "study", label: "Study Leave" },
];

export function ShiftsView() {
  const [tab, setTab] = useState("shifts");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Shifts &amp; Leave</h2>
        <p className="text-sm text-slate-500">Manage staff shifts, scheduling, and leave requests</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="leave">Leave Requests</TabsTrigger>
        </TabsList>
        <TabsContent value="shifts" className="mt-4">
          <ShiftsTab />
        </TabsContent>
        <TabsContent value="leave" className="mt-4">
          <LeaveTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ShiftsTab() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [shiftType, setShiftType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (shiftType !== "all") params.set("shiftType", shiftType);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["shifts", activeFacilityId, shiftType, statusFilter, search],
    queryFn: () => fetchJson(`/api/shifts${qs}`),
    enabled: !!activeFacilityId,
  });

  const items = (data?.items || []).filter((s: any) =>
    !search ||
    s.staff?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
    s.staff?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
    s.staff?.staffNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["shifts"] });

  const statusMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "complete" | "cancel" }) => {
      const res = await fetch(`/api/shifts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "complete" ? "Shift marked as completed" : "Shift cancelled");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view shifts.</CardContent></Card>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-col md:flex-row gap-2 flex-1">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search by staff name or number" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={shiftType || undefined} onValueChange={setShiftType}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shift Types</SelectItem>
              {SHIFT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no_show">No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {can("shift.manage") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={!activeFacilityId}>
            <Plus className="w-4 h-4" /> New Shift
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load shifts" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No shifts found" description="Schedule staff shifts to manage your facility operations." /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Shift Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Time</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Department</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    {can("shift.manage") && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((s: any) => (
                    <tr key={s.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{s.staff?.firstName} {s.staff?.lastName}</div>
                        <div className="text-xs text-slate-500">{s.staff?.staffNumber} • {s.staff?.professionalRole?.replace(/_/g, " ")}</div>
                      </td>
                      <td className="p-3">{formatDate(s.shiftDate)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-slate-700">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(s.startTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                          {s.endTime && <span className="text-slate-500">→ {new Date(s.endTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>}
                        </div>
                      </td>
                      <td className="p-3 capitalize">{s.shiftType}</td>
                      <td className="p-3">{s.department?.name || <span className="text-slate-400">—</span>}</td>
                      <td className="p-3"><StatusBadge status={s.status} /></td>
                      {can("shift.manage") && (
                        <td className="p-3 text-right">
                          {s.status === "scheduled" && (
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: s.id, action: "complete" })} className="h-8 px-2 text-emerald-600 hover:bg-emerald-50">
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: s.id, action: "cancel" })} className="h-8 px-2 text-rose-600 hover:bg-rose-50">
                                <Ban className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
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

      {showNew && <NewShiftDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function LeaveTab() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [leaveType, setLeaveType] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (leaveType !== "all") params.set("leaveType", leaveType);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["leave", statusFilter, leaveType],
    queryFn: () => fetchJson(`/api/leave${qs}`),
  });

  const items = data?.items || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["leave"] });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" | "cancel" }) => {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (_d, vars) => {
      toast.success(`Leave ${vars.action}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex gap-2">
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={leaveType || undefined} onValueChange={setLeaveType}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {LEAVE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {can("shift.manage") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New Leave
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load leave records" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No leave records" description="Submit a leave request to begin tracking time off." /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Dates</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Reason</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    {can("shift.manage") && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((l: any) => (
                    <tr key={l.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{l.staff?.firstName} {l.staff?.lastName}</div>
                        <div className="text-xs text-slate-500">{l.staff?.staffNumber}</div>
                      </td>
                      <td className="p-3 capitalize">{l.leaveType}</td>
                      <td className="p-3">
                        <div>{formatDate(l.startDate)}</div>
                        {l.endDate && <div className="text-xs text-slate-500">→ {formatDate(l.endDate)}</div>}
                      </td>
                      <td className="p-3 max-w-xs">
                        <div className="text-slate-700 truncate">{l.reason || "—"}</div>
                      </td>
                      <td className="p-3"><StatusBadge status={l.status} /></td>
                      {can("shift.manage") && (
                        <td className="p-3 text-right">
                          {l.status === "pending" && (
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => actionMutation.mutate({ id: l.id, action: "approve" })} className="h-8 px-2 text-emerald-600 hover:bg-emerald-50">
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => actionMutation.mutate({ id: l.id, action: "reject" })} className="h-8 px-2 text-rose-600 hover:bg-rose-50">
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
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

      {showNew && <NewLeaveDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewShiftDialog({ onClose }: { onClose: () => void }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [staffId, setStaffId] = useState("");
  const [departmentId, setDepartmentId] = useState("__none__");
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [shiftType, setShiftType] = useState("morning");

  const { data: staffData } = useQuery({
    queryKey: ["staff-for-shift", activeFacilityId],
    queryFn: () => fetchJson(`/api/staff${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`),
  });

  const { data: deptData } = useQuery({
    queryKey: ["depts-for-shift", activeFacilityId],
    queryFn: () => fetchJson(`/api/departments${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`),
    enabled: !!activeFacilityId,
  });

  const staffList = staffData?.items || [];
  const depts = deptData?.items || [];

  const mutation = useMutation({
    mutationFn: async () => {
      const startDate = new Date(`${shiftDate}T${startTime}`);
      const endDate = endTime ? new Date(`${shiftDate}T${endTime}`) : null;
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          facilityId: activeFacilityId,
          departmentId: departmentId && departmentId !== "__none__" ? departmentId : undefined,
          shiftDate: `${shiftDate}T00:00:00`,
          startTime: startDate.toISOString(),
          endTime: endDate?.toISOString(),
          shiftType,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Shift scheduled");
      qc.invalidateQueries({ queryKey: ["shifts"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle><CalendarClock className="w-5 h-5 inline mr-2" /> Schedule New Shift</DialogTitle>
          <DialogDescription>Assign a shift to a staff member at the active facility.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Staff Member</FieldLabel>
            <Select value={staffId || undefined} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {staffList.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.staffNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Shift Date</FieldLabel>
            <Input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Shift Type</Label>
            <Select value={shiftType || undefined} onValueChange={setShiftType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIFT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Start Time</FieldLabel>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>End Time</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Department (optional)</Label>
            <Select value={departmentId || undefined} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !staffId || !activeFacilityId} className="bg-emerald-600 hover:bg-emerald-700">
            Schedule Shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewLeaveDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();

  const [staffId, setStaffId] = useState("");
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const { data: staffData } = useQuery({
    queryKey: ["staff-for-leave"],
    queryFn: () => fetchJson("/api/staff"),
  });
  const staffList = staffData?.items || [];

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, leaveType, startDate, endDate: endDate || undefined, reason }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Leave request submitted");
      qc.invalidateQueries({ queryKey: ["leave"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit Leave Request</DialogTitle>
          <DialogDescription>File a new leave request for staff. Pending requests can be approved or rejected later.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Staff Member</FieldLabel>
            <Select value={staffId || undefined} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {staffList.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.staffNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Leave Type</Label>
            <Select value={leaveType || undefined} onValueChange={setLeaveType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Start Date</FieldLabel>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>End Date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Brief reason for leave..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !staffId} className="bg-emerald-600 hover:bg-emerald-700">
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Clock,
  LogIn,
  LogOut,
  Search,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CalendarDays,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState,
  LoadingState,
  ErrorState,
  StatusBadge,
  formatDate,
} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

function todayStr(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // YYYY-MM-DD in local time
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AttendanceView() {
  const [tab, setTab] = useState("today");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Staff Attendance</h2>
        <p className="text-sm text-slate-500">
          Track daily staff check-in / check-out and review attendance history
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="history">History (30 days)</TabsTrigger>
        </TabsList>
        <TabsContent value="today" className="mt-4">
          <TodayTab />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TodayTab() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canManage =
    user?.roles?.includes("super_admin") ||
    perms.includes("staff.manage") ||
    perms.includes("shift.manage");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [notesStaffId, setNotesStaffId] = useState<string | null>(null);

  // Fetch today's attendance for the active facility
  const today = todayStr();
  const attendanceQ = useQuery({
    queryKey: ["attendance", "today", activeFacilityId, today],
    queryFn: () =>
      fetchJson(
        `/api/attendance?facilityId=${activeFacilityId || ""}&date=${today}`
      ),
    enabled: !!activeFacilityId,
  });

  // Fetch staff for the active facility (to display all staff, not just those with attendance)
  const staffQ = useQuery({
    queryKey: ["staff-for-attendance", activeFacilityId],
    queryFn: () =>
      fetchJson(
        `/api/staff${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`
      ),
    enabled: !!activeFacilityId,
  });

  const attendanceByStaffId = useMemo(() => {
    const map: Record<string, any> = {};
    (attendanceQ.data?.items || []).forEach((a: any) => {
      map[a.staffId] = a;
    });
    return map;
  }, [attendanceQ.data]);

  // Stats
  const stats = useMemo(() => {
    const allStaff = staffQ.data?.items || [];
    const present = allStaff.filter(
      (s: any) =>
        attendanceByStaffId[s.id]?.status === "present" ||
        attendanceByStaffId[s.id]?.status === "late"
    ).length;
    const late = allStaff.filter(
      (s: any) => attendanceByStaffId[s.id]?.status === "late"
    ).length;
    const absent = allStaff.filter(
      (s: any) =>
        !attendanceByStaffId[s.id] ||
        attendanceByStaffId[s.id]?.status === "absent"
    ).length;
    const onLeave = allStaff.filter(
      (s: any) => s.employmentStatus === "on_leave"
    ).length;
    return { total: allStaff.length, present, late, absent, onLeave };
  }, [staffQ.data, attendanceByStaffId]);

  const filteredStaff = useMemo(() => {
    const allStaff = staffQ.data?.items || [];
    if (!search) return allStaff;
    const q = search.toLowerCase();
    return allStaff.filter(
      (s: any) =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
        s.staffNumber?.toLowerCase().includes(q) ||
        s.professionalRole?.toLowerCase().includes(q)
    );
  }, [staffQ.data, search]);

  const actionMutation = useMutation({
    mutationFn: async ({
      staffId,
      action,
      notes,
    }: {
      staffId: string;
      action: "check_in" | "check_out";
      notes?: string;
    }) => {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          facilityId: activeFacilityId,
          action,
          notes,
          date: today,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.action === "check_in" ? "Checked in successfully" : "Checked out successfully"
      );
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!activeFacilityId) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
          Please select a facility to view today&apos;s attendance.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Present Today"
          value={stats.present}
          icon={<CheckCircle2 className="w-5 h-5" />}
          color="emerald"
        />
        <StatCard
          label="Late"
          value={stats.late}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="amber"
        />
        <StatCard
          label="Absent"
          value={stats.absent}
          icon={<XCircle className="w-5 h-5" />}
          color="rose"
        />
        <StatCard
          label="On Leave"
          value={stats.onLeave}
          icon={<CalendarDays className="w-5 h-5" />}
          color="slate"
        />
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input
              className="pl-8"
              placeholder="Search staff by name, number, or role"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Staff list with check-in/out */}
      {staffQ.isLoading || attendanceQ.isLoading ? (
        <LoadingState rows={6} />
      ) : staffQ.isError || attendanceQ.isError ? (
        <ErrorState
          message="Failed to load attendance data"
          onRetry={() => {
            staffQ.refetch();
            attendanceQ.refetch();
          }}
        />
      ) : filteredStaff.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No staff members found"
              description="Add staff members to the facility to begin tracking attendance."
              icon={Users}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Check In</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Check Out</th>
                    {canManage && (
                      <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                    )}
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
                          <div className="font-medium text-slate-900">
                            {s.firstName} {s.lastName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {s.staffNumber} • {s.professionalRole?.replace(/_/g, " ") || "—"}
                          </div>
                        </td>
                        <td className="p-3">
                          {isOnLeave ? (
                            <StatusBadge status="on_leave" />
                          ) : att ? (
                            <StatusBadge status={att.status} />
                          ) : (
                            <StatusBadge status="absent" />
                          )}
                        </td>
                        <td className="p-3">
                          {att?.checkInAt ? (
                            <span className="text-slate-700 flex items-center gap-1">
                              <LogIn className="w-3 h-3 text-emerald-600" />
                              {formatTime(att.checkInAt)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          {att?.checkOutAt ? (
                            <span className="text-slate-700 flex items-center gap-1">
                              <LogOut className="w-3 h-3 text-rose-600" />
                              {formatTime(att.checkOutAt)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        {canManage && (
                          <td className="p-3 text-right">
                            {isOnLeave ? (
                              <span className="text-xs text-slate-400">On leave</span>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setNotesStaffId(s.id)
                                  }
                                  className="h-8 px-2 text-slate-600"
                                  disabled
                                  title="Notes"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                </Button>
                                {!isCheckedIn && (
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      actionMutation.mutate({
                                        staffId: s.id,
                                        action: "check_in",
                                      })
                                    }
                                    disabled={actionMutation.isPending}
                                    className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
                                  >
                                    <LogIn className="w-3.5 h-3.5" />
                                    Check In
                                  </Button>
                                )}
                                {isCheckedIn && !isCheckedOut && (
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      actionMutation.mutate({
                                        staffId: s.id,
                                        action: "check_out",
                                      })
                                    }
                                    disabled={actionMutation.isPending}
                                    className="h-8 gap-1 bg-teal-600 hover:bg-teal-700"
                                  >
                                    <LogOut className="w-3.5 h-3.5" />
                                    Check Out
                                  </Button>
                                )}
                                {isCheckedOut && (
                                  <span className="text-xs text-emerald-600 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Done
                                  </span>
                                )}
                              </div>
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

      {notesStaffId && (
        <NotesDialog
          staffId={notesStaffId}
          existing={attendanceByStaffId[notesStaffId]?.notes || ""}
          onClose={() => setNotesStaffId(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "emerald" | "amber" | "rose" | "slate";
}) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center border ${colorMap[color]}`}
        >
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
          <div className="text-xs text-slate-500">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function NotesDialog({
  staffId,
  existing,
  onClose,
}: {
  staffId: string;
  existing: string;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(existing);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attendance Notes</DialogTitle>
          <DialogDescription>
            Add an optional note for this staff member&apos;s attendance record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="e.g., Late due to traffic, on official duty, etc."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryTab() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [staffFilter, setStaffFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Build query for last 30 days
  const dateTo = todayStr();
  const dateFromObj = new Date();
  dateFromObj.setDate(dateFromObj.getDate() - 30);
  const dateFrom = `${dateFromObj.getFullYear()}-${String(
    dateFromObj.getMonth() + 1
  ).padStart(2, "0")}-${String(dateFromObj.getDate()).padStart(2, "0")}`;

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  params.set("dateFrom", dateFrom);
  params.set("dateTo", dateTo);
  if (staffFilter !== "all") params.set("staffId", staffFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = `?${params.toString()}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["attendance", "history", activeFacilityId, dateFrom, dateTo, staffFilter, statusFilter],
    queryFn: () => fetchJson(`/api/attendance${qs}`),
    enabled: !!activeFacilityId,
  });

  const staffQ = useQuery({
    queryKey: ["staff-for-attendance-history", activeFacilityId],
    queryFn: () =>
      fetchJson(
        `/api/staff${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`
      ),
    enabled: !!activeFacilityId,
  });

  const items = data?.items || [];
  const staffList = staffQ.data?.items || [];

  if (!activeFacilityId) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-amber-700 bg-amber-50">
          Please select a facility to view attendance history.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <Select value={staffFilter || undefined} onValueChange={setStaffFilter}>
            <SelectTrigger className="md:w-64">
              <SelectValue placeholder="All Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staffList.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.firstName} {s.lastName} — {s.staffNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="late">Late</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
              <SelectItem value="half_day">Half Day</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2"
          >
            <RefreshCcw className="w-4 h-4" /> Refresh
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState message="Failed to load attendance history" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No attendance records found"
              description="No attendance records match your filters for the last 30 days."
              icon={CalendarDays}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              Showing {items.length} attendance record{items.length !== 1 ? "s" : ""} (last 30 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Check In</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Check Out</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a: any) => (
                    <tr key={a.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-900">
                          {a.staff?.firstName} {a.staff?.lastName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {a.staff?.staffNumber} • {a.staff?.professionalRole?.replace(/_/g, " ") || "—"}
                        </div>
                      </td>
                      <td className="p-3">{formatDate(a.date)}</td>
                      <td className="p-3">
                        {a.checkInAt ? (
                          <span className="text-slate-700 flex items-center gap-1">
                            <LogIn className="w-3 h-3 text-emerald-600" />
                            {formatTime(a.checkInAt)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {a.checkOutAt ? (
                          <span className="text-slate-700 flex items-center gap-1">
                            <LogOut className="w-3 h-3 text-rose-600" />
                            {formatTime(a.checkOutAt)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3"><StatusBadge status={a.status} /></td>
                      <td className="p-3 max-w-xs">
                        <div className="text-slate-700 truncate" title={a.notes || ""}>
                          {a.notes || <span className="text-slate-400">—</span>}
                        </div>
                      </td>
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

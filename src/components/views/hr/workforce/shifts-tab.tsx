"use client";
// =====================================================================
// SHIFTS TAB — List, create, and manage staff shift assignments
// Includes conflict warnings, leave validation feedback, bulk action.
// =====================================================================
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, Search, Check, X, Ban, AlertTriangle, ArrowRightLeft, FileDown } from "lucide-react";
import { toast } from "sonner";
import { StaffSearchableSelect } from "@/components/ui/staff-searchable-select";
import {
  fetchJson, usePermissions, ColoredBadge, SHIFT_STATUSES, formatTime, formatDuration, calcDurationHours,
} from "./workforce-helpers";
import { EmptyState, LoadingState, ErrorState, ClearableSearch, formatDate } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

export function ShiftsTab() {
  const { can } = usePermissions();
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

  // Also fetch shift types for filter dropdown
  const { data: shiftTypesData } = useQuery({
    queryKey: ["shift-types", activeFacilityId],
    queryFn: () => fetchJson(`/api/shift-types${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`),
  });
  const shiftTypes = shiftTypesData?.items || [];

  const items = (data?.items || []).filter((s: any) =>
    !search ||
    s.staff?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
    s.staff?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
    s.staff?.staffNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["shifts"] });
    qc.invalidateQueries({ queryKey: ["workforce-dashboard"] });
  };

  const statusMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "complete" | "cancel" | "no_show" }) => {
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
      toast.success(`Shift ${vars.action === "complete" ? "completed" : vars.action === "cancel" ? "cancelled" : "marked no-show"}`);
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
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search by staff name or number" className="pl-8" />
          </div>
          <Select value={shiftType || "all"} onValueChange={setShiftType}>
            <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shift Types</SelectItem>
              {shiftTypes.map((t: any) => <SelectItem key={t.id} value={t.code.toLowerCase().replace(/-/g, "_")}>{t.name}</SelectItem>)}
              <SelectItem value="morning">Morning</SelectItem>
              <SelectItem value="evening">Evening</SelectItem>
              <SelectItem value="night">Night</SelectItem>
              <SelectItem value="on_call">On Call</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter || "all"} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {SHIFT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {can(["shift.manage", "shift.assign"]) && (
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
        <Card><CardContent className="p-6"><EmptyState title="No shifts found" description="Schedule staff shifts to manage your facility operations." icon={Plus} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Time</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Hours</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Department</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    {can(["shift.manage", "shift.assign"]) && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((s: any) => {
                    const hours = calcDurationHours(s.startTime, s.endTime);
                    return (
                      <tr key={s.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{s.staff?.firstName} {s.staff?.lastName}</div>
                          <div className="text-xs text-slate-500">{s.staff?.staffNumber} • {s.staff?.profession || s.staff?.professionalRole?.replace(/_/g, " ")}</div>
                        </td>
                        <td className="p-3">{formatDate(s.shiftDate)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 text-slate-700">
                            <span>{formatTime(s.startTime)}</span>
                            {s.endTime && <span className="text-slate-500">→ {formatTime(s.endTime)}</span>}
                          </div>
                          {s.isOvernight && <span className="text-xs text-indigo-600">overnight</span>}
                        </td>
                        <td className="p-3 text-slate-700">{formatDuration(hours)}</td>
                        <td className="p-3">
                          <span className="capitalize">{s.shiftType || s.shiftTypeRef?.name || "—"}</span>
                          {s.isOnCall && <span className="ml-1 text-xs text-purple-600">(on-call)</span>}
                        </td>
                        <td className="p-3">{s.department?.name || <span className="text-slate-400">—</span>}</td>
                        <td className="p-3"><ColoredBadge status={s.status} list={SHIFT_STATUSES} /></td>
                        {can(["shift.manage", "shift.assign"]) && (
                          <td className="p-3 text-right">
                            {s.status === "scheduled" && (
                              <div className="flex items-center justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: s.id, action: "complete" })} className="h-8 px-2 text-emerald-600 hover:bg-emerald-50" title="Mark completed">
                                  <Check className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: s.id, action: "no_show" })} className="h-8 px-2 text-orange-600 hover:bg-orange-50" title="Mark no-show">
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: s.id, action: "cancel" })} className="h-8 px-2 text-rose-600 hover:bg-rose-50" title="Cancel shift">
                                  <Ban className="w-3.5 h-3.5" />
                                </Button>
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

      {showNew && <NewShiftDialog onClose={() => setShowNew(false)} shiftTypes={shiftTypes} />}
    </div>
  );
}

function NewShiftDialog({ onClose, shiftTypes }: { onClose: () => void; shiftTypes: any[] }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [staffId, setStaffId] = useState("");
  const [departmentId, setDepartmentId] = useState("__none__");
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [shiftType, setShiftType] = useState("morning");
  const [shiftTypeId, setShiftTypeId] = useState("");
  const [notes, setNotes] = useState("");
  const [skipConflicts, setSkipConflicts] = useState(false);
  const [conflictWarnings, setConflictWarnings] = useState<any[]>([]);

  const { data: deptData } = useQuery({
    queryKey: ["depts-for-shift", activeFacilityId],
    queryFn: () => fetchJson(`/api/departments${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`),
    enabled: !!activeFacilityId,
  });

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
          shiftTypeId: shiftTypeId || undefined,
          notes,
          skipConflicts,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.conflictWarnings) setConflictWarnings(data.conflictWarnings);
        throw new Error(data.error || "Failed");
      }
      return data;
    },
    onSuccess: (data) => {
      toast.success("Shift scheduled");
      if (data.conflictWarnings?.length > 0) {
        toast.warning(`${data.conflictWarnings.length} conflict warning(s) — review the assignment.`);
      }
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["workforce-dashboard"] });
      onClose();
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden" size="medium">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">Schedule New Shift</DialogTitle>
          <DialogDescription className="text-white/80">Assign a shift to a staff member. The system will validate conflicts and leave status.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <StaffSearchableSelect
              value={staffId}
              onValueChange={setStaffId}
              label="Staff Member"
              required
            />
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
                <SelectItem value="morning">Morning</SelectItem>
                <SelectItem value="evening">Evening</SelectItem>
                <SelectItem value="night">Night</SelectItem>
                <SelectItem value="on_call">On Call</SelectItem>
                {shiftTypes.map((t: any) => <SelectItem key={t.id} value={t.code.toLowerCase().replace(/-/g, "_")}>{t.name}</SelectItem>)}
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
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any special instructions..." />
          </div>
        </div>

        {conflictWarnings.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>Conflict Detected</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 text-sm">
                {conflictWarnings.map((w, i) => <li key={i}>{w.message}</li>)}
              </ul>
              <label className="flex items-center gap-2 mt-2 text-xs">
                <input type="checkbox" checked={skipConflicts} onChange={(e) => setSkipConflicts(e.target.checked)} />
                Override conflicts and schedule anyway
              </label>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !staffId || !activeFacilityId} className="bg-emerald-600 hover:bg-emerald-700">
            Schedule Shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

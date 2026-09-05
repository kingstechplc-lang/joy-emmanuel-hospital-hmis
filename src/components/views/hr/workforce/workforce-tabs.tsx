"use client";
// =====================================================================
// SWAPS, COVERAGE, ON-CALL, BALANCES, CALENDAR, SETTINGS TABS
// All the remaining workforce management sub-views.
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
  Plus, ArrowRightLeft, Shield, Phone, Calendar, Settings, BookOpen,
  Check, X, AlertTriangle, UserCheck, Clock, Search, Ban, RotateCcw,
  Sun, Moon, Coffee, CalendarDays, FileText, ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchJson, usePermissions, ColoredBadge, SWAP_STATUSES, COVERAGE_STATUSES,
  AVAILABILITY_STATUSES, LEAVE_STATUSES, SHIFT_STATUSES, formatTime, formatDate, formatDateTime,
} from "./workforce-helpers";
import { EmptyState, LoadingState, ErrorState, ClearableSearch, MiniStatCard } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";
import { StaffSearchableSelect } from "@/components/ui/staff-searchable-select";

// =====================================================================
// SHIFT SWAPS TAB
// =====================================================================
export function SwapsTab() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["shift-swaps", status],
    queryFn: () => fetchJson(`/api/shift-swaps${qs}`),
  });

  const items = data?.items || [];

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: "approve" | "reject" | "cancel"; reason?: string }) => {
      const res = await fetch(`/api/shift-swaps/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Swap ${vars.action}d`);
      qc.invalidateQueries({ queryKey: ["shift-swaps"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["workforce-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <Select value={status || "all"} onValueChange={setStatus}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {SWAP_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {can(["shift.manage", "shift_swap.request"]) && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New Swap Request
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load swap requests" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No shift swap requests" description="Staff can request swaps with other team members. Approved swaps are applied to the roster." icon={ArrowRightLeft} /></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((s: any) => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <ColoredBadge status={s.status} list={SWAP_STATUSES} />
                      <span className="text-sm font-medium text-slate-900">
                        {s.requesterStaff?.firstName} {s.requesterStaff?.lastName}
                      </span>
                      <ArrowRightLeft className="w-3 h-3 text-slate-400" />
                      <span className="text-sm text-slate-700">
                        {s.targetStaff ? `${s.targetStaff.firstName} ${s.targetStaff.lastName}` : <span className="italic text-slate-400">No target yet</span>}
                      </span>
                    </div>
                    {s.reason && <div className="text-xs text-slate-500 mt-1">Reason: {s.reason}</div>}
                    {s.conflictWarnings && (
                      <Alert className="mt-2 py-2">
                        <AlertTriangle className="w-3 h-3" />
                        <AlertDescription className="text-xs">
                          {(() => {
                            try {
                              const warnings = JSON.parse(s.conflictWarnings);
                              return warnings.map((w: any, i: number) => <div key={i}>{w.message}</div>);
                            } catch { return "Conflict warnings detected"; }
                          })()}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {formatDateTime(s.createdAt)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-slate-50 rounded">
                    <div className="font-semibold text-slate-700">Requester&apos;s Shift</div>
                    <div>{s.requesterShift?.staff?.firstName} {s.requesterShift?.staff?.lastName}</div>
                    <div>{formatDate(s.requesterShift?.shiftDate)} • {formatTime(s.requesterShift?.startTime)} → {formatTime(s.requesterShift?.endTime)}</div>
                    <div className="text-slate-500">{s.requesterShift?.facility?.name} • {s.requesterShift?.department?.name || "—"}</div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded">
                    <div className="font-semibold text-slate-700">Target&apos;s Shift</div>
                    {s.targetShift ? (
                      <>
                        <div>{s.targetShift?.staff?.firstName} {s.targetShift?.staff?.lastName}</div>
                        <div>{formatDate(s.targetShift?.shiftDate)} • {formatTime(s.targetShift?.startTime)} → {formatTime(s.targetShift?.endTime)}</div>
                        <div className="text-slate-500">{s.targetShift?.facility?.name} • {s.targetShift?.department?.name || "—"}</div>
                      </>
                    ) : <div className="italic text-slate-400">No target shift</div>}
                  </div>
                </div>
                {can(["shift.manage", "shift_swap.approve"]) && s.status === "accepted" && (
                  <div className="flex justify-end gap-2 mt-3">
                    <Button size="sm" onClick={() => actionMutation.mutate({ id: s.id, action: "approve" })} className="bg-emerald-600 hover:bg-emerald-700">
                      <Check className="w-3.5 h-3.5 mr-1" /> Approve & Apply
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: s.id, action: "reject", reason: "Supervisor rejected" })}>
                      <X className="w-3.5 h-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                )}
                {s.status === "requested" && can(["shift.manage", "shift_swap.request"]) && (
                  <div className="flex justify-end gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: s.id, action: "cancel" })}>
                      <Ban className="w-3.5 h-3.5 mr-1" /> Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showNew && <NewSwapDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewSwapDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [requesterStaffId, setRequesterStaffId] = useState("");
  const [requesterShiftId, setRequesterShiftId] = useState("");
  const [targetStaffId, setTargetStaffId] = useState("");
  const [targetShiftId, setTargetShiftId] = useState("");
  const [reason, setReason] = useState("");

  // Fetch requester's shifts
  const { data: requesterShiftsData } = useQuery({
    queryKey: ["requester-shifts", requesterStaffId],
    queryFn: () => fetchJson(`/api/shifts?staffId=${requesterStaffId}&status=scheduled`),
    enabled: !!requesterStaffId,
  });
  const requesterShifts = requesterShiftsData?.items || [];

  // Fetch target's shifts
  const { data: targetShiftsData } = useQuery({
    queryKey: ["target-shifts", targetStaffId],
    queryFn: () => fetchJson(`/api/shifts?staffId=${targetStaffId}&status=scheduled`),
    enabled: !!targetStaffId,
  });
  const targetShifts = targetShiftsData?.items || [];

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shift-swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterStaffId,
          targetStaffId,
          requesterShiftId,
          targetShiftId: targetShiftId || undefined,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (data) => {
      toast.success("Swap request created");
      if (data.conflictWarnings?.length > 0) {
        toast.warning(`${data.conflictWarnings.length} conflict warning(s) detected.`);
      }
      qc.invalidateQueries({ queryKey: ["shift-swaps"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">Request Shift Swap</DialogTitle>
          <DialogDescription className="text-white/80">Select your shift and the target staff/shift to swap with. Conflicts will be validated.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <StaffSearchableSelect
            value={requesterStaffId}
            onValueChange={(v) => { setRequesterStaffId(v); setRequesterShiftId(""); }}
            label="Requester (You / On Behalf Of)"
            required
          />
          {requesterStaffId && (
            <div className="space-y-1.5">
              <FieldLabel required>Requester&apos;s Shift</FieldLabel>
              <Select value={requesterShiftId || undefined} onValueChange={setRequesterShiftId}>
                <SelectTrigger><SelectValue placeholder="Select a shift" /></SelectTrigger>
                <SelectContent>
                  {requesterShifts.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {formatDate(s.shiftDate)} {formatTime(s.startTime)} → {formatTime(s.endTime)} ({s.shiftType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <StaffSearchableSelect
            value={targetStaffId}
            onValueChange={(v) => { setTargetStaffId(v); setTargetShiftId(""); }}
            label="Target Staff (to swap with)"
            placeholder="Search target staff (optional)..."
            excludeIds={requesterStaffId ? [requesterStaffId] : []}
          />
          {targetStaffId && (
            <div className="space-y-1.5">
              <Label>Target&apos;s Shift (to swap with — optional)</Label>
              <Select value={targetShiftId || undefined} onValueChange={setTargetShiftId}>
                <SelectTrigger><SelectValue placeholder="Select target shift" /></SelectTrigger>
                <SelectContent>
                  {targetShifts.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {formatDate(s.shiftDate)} {formatTime(s.startTime)} → {formatTime(s.endTime)} ({s.shiftType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason for swap request..." />
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !requesterStaffId || !requesterShiftId} className="bg-emerald-600 hover:bg-emerald-700">
            Submit Swap Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// COVERAGE TAB
// =====================================================================
export function CoverageTab() {
  const { can } = usePermissions();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [assignDialog, setAssignDialog] = useState<any>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (status !== "all") params.set("status", status);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coverage", activeFacilityId, status],
    queryFn: () => fetchJson(`/api/coverage${qs}`),
    enabled: !!activeFacilityId,
  });

  const items = data?.items || [];

  const completeMutation = useMutation({
    mutationFn: async ({ id, action, notes }: { id: string; action: "complete" | "cancel"; notes?: string }) => {
      const res = await fetch(`/api/coverage/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action === "complete" ? "fulfilled" : "cancelled", notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Coverage ${vars.action}d`);
      qc.invalidateQueries({ queryKey: ["coverage"] });
      qc.invalidateQueries({ queryKey: ["workforce-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Select value={status || "all"} onValueChange={setStatus}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {COVERAGE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {can(["shift.manage", "coverage.manage"]) && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New Coverage Request
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load coverage requests" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No coverage requests" description="Create a coverage request when staff cannot make a shift." icon={Shield} /></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((c: any) => (
            <Card key={c.id} className={c.priority === "urgent" ? "border-rose-300" : c.priority === "high" ? "border-orange-300" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ColoredBadge status={c.status} list={COVERAGE_STATUSES} />
                      {c.priority === "urgent" && <Badge variant="destructive">URGENT</Badge>}
                      {c.priority === "high" && <Badge className="bg-orange-100 text-orange-700">HIGH</Badge>}
                      <span className="text-sm font-medium text-slate-900">
                        {c.originalStaff?.firstName} {c.originalStaff?.lastName}
                      </span>
                      {c.replacementStaff && (
                        <>
                          <ArrowRightLeft className="w-3 h-3 text-emerald-600" />
                          <span className="text-sm text-emerald-700">
                            {c.replacementStaff.firstName} {c.replacementStaff.lastName}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {formatDate(c.shiftDate)} • {formatTime(c.startTime)} → {formatTime(c.endTime)} • {c.facility?.name} • {c.department?.name || "—"}
                    </div>
                    {c.reason && <div className="text-xs text-slate-600 mt-1">Reason: {c.reason}</div>}
                    {c.requiredProfession && <div className="text-xs text-slate-600">Required: {c.requiredProfession} {c.requiredSpecialty ? `(${c.requiredSpecialty})` : ""}</div>}
                  </div>
                </div>
                {can(["shift.manage", "coverage.manage"]) && c.status === "open" && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => setAssignDialog(c)} className="bg-blue-600 hover:bg-blue-700">
                      <UserCheck className="w-3.5 h-3.5 mr-1" /> Find Replacement
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => completeMutation.mutate({ id: c.id, action: "cancel" })}>
                      <Ban className="w-3.5 h-3.5 mr-1" /> Cancel
                    </Button>
                  </div>
                )}
                {c.status === "assigned" && (
                  <div className="flex justify-end gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => completeMutation.mutate({ id: c.id, action: "complete" })}>
                      <Check className="w-3.5 h-3.5 mr-1" /> Mark Fulfilled
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showNew && <NewCoverageDialog onClose={() => setShowNew(false)} />}
      {assignDialog && <AssignCoverageDialog coverage={assignDialog} onClose={() => setAssignDialog(null)} />}
    </div>
  );
}

function NewCoverageDialog({ onClose }: { onClose: () => void }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [originalStaffId, setOriginalStaffId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [reason, setReason] = useState("sick");
  const [requiredProfession, setRequiredProfession] = useState("");
  const [requiredSpecialty, setRequiredSpecialty] = useState("");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");

  // Fetch original staff's shifts on the selected date
  const { data: staffShiftsData } = useQuery({
    queryKey: ["staff-shifts-coverage", originalStaffId, shiftDate],
    queryFn: () => fetchJson(`/api/shifts?staffId=${originalStaffId}&dateFrom=${shiftDate}&dateTo=${shiftDate}`),
    enabled: !!originalStaffId && !!shiftDate,
  });
  const staffShifts = staffShiftsData?.items || [];

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId: activeFacilityId,
          originalStaffId,
          shiftId: shiftId || undefined,
          shiftDate: `${shiftDate}T00:00:00`,
          startTime: new Date(`${shiftDate}T${startTime}`).toISOString(),
          endTime: new Date(`${shiftDate}T${endTime}`).toISOString(),
          reason,
          requiredProfession: requiredProfession || undefined,
          requiredSpecialty: requiredSpecialty || undefined,
          priority,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Coverage request created — managers notified");
      qc.invalidateQueries({ queryKey: ["coverage"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">New Coverage Request</DialogTitle>
          <DialogDescription className="text-white/80">Use this when staff cannot make a shift and a replacement is needed.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <StaffSearchableSelect
              value={originalStaffId}
              onValueChange={(v) => { setOriginalStaffId(v); setShiftId(""); }}
              label="Original Staff (who cannot attend)"
              required
            />
          </div>
          {staffShifts.length > 0 && (
            <div className="space-y-1.5 md:col-span-2">
              <Label>Link to Existing Shift (optional)</Label>
              <Select value={shiftId || undefined} onValueChange={setShiftId}>
                <SelectTrigger><SelectValue placeholder="Select a shift to cover" /></SelectTrigger>
                <SelectContent>
                  {staffShifts.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {formatTime(s.startTime)} → {formatTime(s.endTime)} ({s.shiftType}) — {s.department?.name || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <FieldLabel required>Shift Date</FieldLabel>
            <Input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Reason</FieldLabel>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sick">Sick</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Start Time</FieldLabel>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>End Time</FieldLabel>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Required Profession</Label>
            <Input value={requiredProfession} onChange={(e) => setRequiredProfession(e.target.value)} placeholder="e.g., nurse, doctor" />
          </div>
          <div className="space-y-1.5">
            <Label>Required Specialty</Label>
            <Input value={requiredSpecialty} onChange={(e) => setRequiredSpecialty(e.target.value)} placeholder="e.g., ICU, midwifery" />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !originalStaffId || !activeFacilityId} className="bg-emerald-600 hover:bg-emerald-700">
            Create Coverage Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignCoverageDialog({ coverage, onClose }: { coverage: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [selectedStaff, setSelectedStaff] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["suggest-replacement", coverage.id],
    queryFn: () => fetchJson("/api/coverage/suggest-replacement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverageRequestId: coverage.id }),
    }),
  });

  const candidates = data?.items || [];

  const assignMutation = useMutation({
    mutationFn: async (staffId: string) => {
      const res = await fetch(`/api/coverage/${coverage.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replacementStaffId: staffId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (data) => {
      toast.success("Replacement assigned");
      if (data.conflicts?.length > 0) {
        toast.warning(`${data.conflicts.length} conflict warning(s) — review the assignment.`);
      }
      qc.invalidateQueries({ queryKey: ["coverage"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">Find Replacement</DialogTitle>
          <DialogDescription className="text-white/80">
            Coverage for {coverage.originalStaff?.firstName} {coverage.originalStaff?.lastName} on {formatDate(coverage.shiftDate)} • {formatTime(coverage.startTime)} → {formatTime(coverage.endTime)}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <LoadingState rows={4} />
        ) : candidates.length === 0 ? (
          <EmptyState title="No suitable candidates" description="No available staff match the criteria. Try broadening the requirements." icon={UserCheck} />
        ) : (
          <div className="space-y-2">
            {candidates.map((c: any) => (
              <div key={c.staffId} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex-1">
                  <div className="font-medium text-slate-900">{c.name}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    Score: <span className="font-medium">{c.score}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.reasons.map((r: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">{r}</Badge>
                    ))}
                  </div>
                </div>
                <Button size="sm" onClick={() => assignMutation.mutate(c.staffId)} disabled={assignMutation.isPending}>
                  Assign
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// ON-CALL TAB
// =====================================================================
export function OnCallTab() {
  const { can } = usePermissions();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["on-call", activeFacilityId],
    queryFn: () => fetchJson(`/api/on-call${qs}`),
    enabled: !!activeFacilityId,
  });

  const items = data?.items || [];

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/on-call/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("On-call schedule cancelled");
      qc.invalidateQueries({ queryKey: ["on-call"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {can(["shift.manage", "on_call.manage"]) && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={!activeFacilityId}>
            <Plus className="w-4 h-4" /> New On-Call Assignment
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load on-call schedules" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No on-call schedules" description="Set up on-call staff for emergency coverage outside regular shifts." icon={Phone} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Facility / Dept</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Period</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Role</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Contact</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    {can(["shift.manage", "on_call.manage"]) && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((o: any) => (
                    <tr key={o.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{o.staff?.firstName} {o.staff?.lastName}</div>
                        <div className="text-xs text-slate-500">{o.staff?.staffNumber} • {o.specialty || "—"}</div>
                      </td>
                      <td className="p-3">
                        <div>{o.facility?.name}</div>
                        <div className="text-xs text-slate-500">{o.department?.name || "—"}</div>
                      </td>
                      <td className="p-3">
                        <div>{formatDateTime(o.startDate)}</div>
                        {o.endDate && <div className="text-xs text-slate-500">→ {formatDateTime(o.endDate)}</div>}
                      </td>
                      <td className="p-3">
                        {o.isPrimary && <Badge className="bg-purple-600 text-white">PRIMARY</Badge>}
                        {o.isBackup && <Badge variant="outline">BACKUP #{o.escalationOrder}</Badge>}
                        {!o.isPrimary && !o.isBackup && <span className="text-slate-400">—</span>}
                      </td>
                      <td className="p-3 text-xs">
                        <div className="capitalize">{o.contactMethod || "phone"}</div>
                        <div className="text-slate-700">{o.contactValue || o.staff?.phone || "—"}</div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="capitalize">{o.status}</Badge>
                      </td>
                      {can(["shift.manage", "on_call.manage"]) && (
                        <td className="p-3 text-right">
                          {o.status !== "cancelled" && (
                            <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(o.id)} className="text-rose-600">
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
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

      {showNew && <NewOnCallDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewOnCallDialog({ onClose }: { onClose: () => void }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [staffId, setStaffId] = useState("");
  const [departmentId, setDepartmentId] = useState("__none__");
  const [specialty, setSpecialty] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 16));
  const [endDate, setEndDate] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isBackup, setIsBackup] = useState(false);
  const [contactMethod, setContactMethod] = useState("phone");
  const [contactValue, setContactValue] = useState("");
  const [escalationOrder, setEscalationOrder] = useState("1");
  const [notes, setNotes] = useState("");

  const { data: deptData } = useQuery({
    queryKey: ["depts-for-oncall", activeFacilityId],
    queryFn: () => fetchJson(`/api/departments${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`),
    enabled: !!activeFacilityId,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/on-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          facilityId: activeFacilityId,
          departmentId: departmentId !== "__none__" ? departmentId : undefined,
          specialty: specialty || undefined,
          startDate: new Date(startDate).toISOString(),
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          isPrimary,
          isBackup,
          contactMethod,
          contactValue,
          escalationOrder: parseInt(escalationOrder, 10) || 0,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("On-call schedule created");
      qc.invalidateQueries({ queryKey: ["on-call"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">New On-Call Assignment</DialogTitle>
          <DialogDescription className="text-white/80">Assign staff to be on-call for a specified period.</DialogDescription>
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
            <Label>Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {(deptData?.items || []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Specialty</Label>
            <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g., Cardiology" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Start Date/Time</FieldLabel>
            <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>End Date/Time</Label>
            <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="flex gap-3 pt-1">
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={isPrimary} onChange={(e) => { setIsPrimary(e.target.checked); if (e.target.checked) setIsBackup(false); }} />
                Primary
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={isBackup} onChange={(e) => { setIsBackup(e.target.checked); if (e.target.checked) setIsPrimary(false); }} />
                Backup
              </label>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Escalation Order</Label>
            <Input type="number" min="0" value={escalationOrder} onChange={(e) => setEscalationOrder(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact Method</Label>
            <Select value={contactMethod} onValueChange={setContactMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="pager">Pager</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Contact Value</Label>
            <Input value={contactValue} onChange={(e) => setContactValue(e.target.value)} placeholder="Phone number / email" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !staffId || !activeFacilityId} className="bg-emerald-600 hover:bg-emerald-700">
            Create On-Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// LEAVE BALANCES TAB
// =====================================================================
export function LeaveBalancesTab() {
  const [leaveYear, setLeaveYear] = useState(String(new Date().getFullYear()));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["leave-balances", leaveYear],
    queryFn: () => fetchJson(`/api/leave-balances?leaveYear=${leaveYear}`),
  });

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={leaveYear} onValueChange={setLeaveYear}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i)).map((y) => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load leave balances" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No leave balances found" description="Leave balances are auto-created when leave types are configured and staff request leave." icon={BookOpen} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Leave Type</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Entitlement</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Accrued</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Used</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Pending</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Carried Fwd</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Adjustments</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((b: any) => {
                    const remaining = (b.entitlement || 0) + (b.accrued || 0) + (b.carriedForward || 0) + (b.adjustments || 0) - (b.used || 0) - (b.pending || 0);
                    return (
                      <tr key={b.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{b.staff?.firstName} {b.staff?.lastName}</div>
                          <div className="text-xs text-slate-500">{b.staff?.staffNumber}</div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            {b.leaveType?.colorHex && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.leaveType.colorHex }} />}
                            <span>{b.leaveType?.name}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right">{b.entitlement?.toFixed(1) || "0.0"}</td>
                        <td className="p-3 text-right">{b.accrued?.toFixed(1) || "0.0"}</td>
                        <td className="p-3 text-right text-rose-700">{b.used?.toFixed(1) || "0.0"}</td>
                        <td className="p-3 text-right text-amber-700">{b.pending?.toFixed(1) || "0.0"}</td>
                        <td className="p-3 text-right">{b.carriedForward?.toFixed(1) || "0.0"}</td>
                        <td className="p-3 text-right">{b.adjustments?.toFixed(1) || "0.0"}</td>
                        <td className={`p-3 text-right font-bold ${remaining < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                          {remaining.toFixed(1)}
                        </td>
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
// CALENDAR TAB — combined shift/leave/holiday/on-call calendar
// =====================================================================
export function CalendarTab() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const dateFrom = firstDay.toISOString().slice(0, 10);
  const dateTo = lastDay.toISOString().slice(0, 10);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  params.set("dateFrom", dateFrom);
  params.set("dateTo", dateTo);
  const qs = `?${params.toString()}`;

  const { data, isLoading } = useQuery({
    queryKey: ["workforce-calendar", activeFacilityId, dateFrom, dateTo],
    queryFn: () => fetchJson(`/api/workforce-calendar${qs}`),
  });

  const events = data?.events || [];

  // Group events by date
  const eventsByDate: Record<string, any[]> = {};
  for (const e of events) {
    const dateKey = new Date(e.date).toISOString().slice(0, 10);
    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
    eventsByDate[dateKey].push(e);
  }

  // Calendar grid
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay(); // 0=Sun
  const days: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h3 className="text-lg font-semibold text-slate-900">
          {currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </h3>
        <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="p-3">
          {isLoading ? (
            <LoadingState rows={6} />
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-slate-500 p-2">{d}</div>
              ))}
              {days.map((day, i) => {
                if (!day) return <div key={i} className="min-h-24 md:min-h-32 border border-slate-100 rounded bg-slate-50/50" />;
                const dateKey = day.toISOString().slice(0, 10);
                const dayEvents = eventsByDate[dateKey] || [];
                const isToday = new Date().toDateString() === day.toDateString();
                return (
                  <div key={i} className={`min-h-24 md:min-h-32 border rounded p-1 ${isToday ? "border-blue-400 bg-blue-50/30" : "border-slate-200"}`}>
                    <div className={`text-xs font-medium mb-1 ${isToday ? "text-blue-700" : "text-slate-700"}`}>{day.getDate()}</div>
                    <div className="space-y-0.5">
                        {dayEvents.slice(0, 4).map((e, idx) => (
                          <div key={idx} className="text-[10px] px-1 py-0.5 rounded truncate text-white" style={{ backgroundColor: e.color || "#64748b" }} title={`${e.type}: ${e.staffName || e.name || ""}`}>
                            {e.type === "holiday" ? e.name : `${e.staffName || ""} (${e.type === "shift" ? e.shiftType : e.type === "leave" ? e.leaveType : e.type === "on_call" ? "on-call" : ""})`}
                          </div>
                        ))}
                        {dayEvents.length > 4 && (
                          <div className="text-[10px] text-slate-500 px-1">+{dayEvents.length - 4} more</div>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-xs">
        <Legend color="#16a34a" label="Morning shift" />
        <Legend color="#c2410c" label="Evening shift" />
        <Legend color="#1e40af" label="Night shift" />
        <Legend color="#9333ea" label="On-call" />
        <Legend color="#db2777" label="Holiday / Leave" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
      <span className="text-slate-600">{label}</span>
    </div>
  );
}

// =====================================================================
// SETTINGS TAB — shift types, leave types, holidays, staffing requirements,
// and the seed-defaults button
// =====================================================================
export function SettingsTab() {
  const { can } = usePermissions();
  const [subTab, setSubTab] = useState("shift-types");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={subTab === "shift-types" ? "default" : "outline"} onClick={() => setSubTab("shift-types")}>Shift Types</Button>
        <Button size="sm" variant={subTab === "leave-types" ? "default" : "outline"} onClick={() => setSubTab("leave-types")}>Leave Types</Button>
        <Button size="sm" variant={subTab === "holidays" ? "default" : "outline"} onClick={() => setSubTab("holidays")}>Public Holidays</Button>
        <Button size="sm" variant={subTab === "staffing-requirements" ? "default" : "outline"} onClick={() => setSubTab("staffing-requirements")}>Staffing Requirements</Button>
        <Button size="sm" variant={subTab === "leave-policies" ? "default" : "outline"} onClick={() => setSubTab("leave-policies")}>Leave Policies</Button>
      </div>

      {subTab === "shift-types" && <ShiftTypesSettings canManage={can(["shift.manage"])} />}
      {subTab === "leave-types" && <LeaveTypesSettings canManage={can(["shift.manage", "leave.manage"])} />}
      {subTab === "holidays" && <HolidaysSettings canManage={can(["shift.manage", "holiday.manage"])} />}
      {subTab === "staffing-requirements" && <StaffingRequirementsSettings canManage={can(["shift.manage", "staffing_requirement.manage"])} />}
      {subTab === "leave-policies" && <LeavePoliciesSettings canManage={can(["shift.manage", "leave.manage", "leave_policy.manage"])} />}
    </div>
  );
}

function ShiftTypesSettings({ canManage }: { canManage: boolean }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["shift-types-settings", activeFacilityId],
    queryFn: () => fetchJson(`/api/shift-types${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`),
  });
  const items = data?.items || [];

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`/api/shift-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["shift-types"] });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Configured Shift Types ({items.length})</CardTitle>
        {canManage && <Button size="sm" onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-3 h-3 mr-1" /> New</Button>}
      </CardHeader>
      <CardContent>
        {isLoading ? <LoadingState rows={4} /> : items.length === 0 ? (
          <EmptyState title="No shift types configured" description="Click 'Seed Defaults' below to load standard shift types (Morning, Afternoon, Night, etc.)." icon={Settings} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {items.map((t: any) => (
              <div key={t.id} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {t.colorHex && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.colorHex }} />}
                    <span className="font-medium text-slate-900">{t.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{t.code}</Badge>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {t.startTime || "—"} → {t.endTime || "—"} • {t.workingHours ? `${t.workingHours}h` : "variable"}
                  {t.overnight && " • overnight"}
                  {t.isOnCall && " • on-call"}
                </div>
                <div className="flex justify-between items-center mt-2">
                  <Badge variant="outline" className="text-xs capitalize">{t.category}</Badge>
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => toggleActive.mutate({ id: t.id, active: !t.active })} className="h-6 text-xs">
                      {t.active ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <SeedDefaultsButton />
      </CardContent>
      {showNew && <NewShiftTypeDialog onClose={() => setShowNew(false)} facilityId={activeFacilityId || undefined} />}
    </Card>
  );
}

function NewShiftTypeDialog({ onClose, facilityId }: { onClose: () => void; facilityId?: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("regular");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [overnight, setOvernight] = useState(false);
  const [isOnCall, setIsOnCall] = useState(false);
  const [colorHex, setColorHex] = useState("#3b82f6");
  const [workingHours, setWorkingHours] = useState("8");
  const [defaultBreakMinutes, setDefaultBreakMinutes] = useState("60");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shift-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, code, category, startTime: startTime || null, endTime: endTime || null,
          overnight, isOnCall, colorHex, workingHours: workingHours ? parseFloat(workingHours) : null,
          defaultBreakMinutes: parseInt(defaultBreakMinutes, 10) || 0, description, facilityId: facilityId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Shift type created");
      qc.invalidateQueries({ queryKey: ["shift-types"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">Create New Shift Type</DialogTitle>
          <DialogDescription className="text-white/80">Configure a custom shift type for your facility.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel required>Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Morning" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Code</FieldLabel>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g., MORNING" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="rotational">Rotational</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="flexible">Flexible</SelectItem>
                <SelectItem value="on_call">On Call</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
                <SelectItem value="weekend">Weekend</SelectItem>
                <SelectItem value="holiday">Holiday</SelectItem>
                <SelectItem value="temporary">Temporary</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              <Input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="w-16 h-9 p-1" />
              <Input value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="flex-1" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Start Time</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>End Time</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Working Hours</Label>
            <Input type="number" step="0.5" value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} placeholder="8" />
          </div>
          <div className="space-y-1.5">
            <Label>Break (minutes)</Label>
            <Input type="number" value={defaultBreakMinutes} onChange={(e) => setDefaultBreakMinutes(e.target.value)} placeholder="60" />
          </div>
          <div className="space-y-1.5 md:col-span-2 flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={overnight} onChange={(e) => setOvernight(e.target.checked)} /> Overnight
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isOnCall} onChange={(e) => setIsOnCall(e.target.checked)} /> On-Call
            </label>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name || !code} className="bg-emerald-600 hover:bg-emerald-700">
            Create Shift Type
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaveTypesSettings({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["leave-types-settings"],
    queryFn: () => fetchJson(`/api/leave-types`),
  });
  const items = data?.items || [];

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`/api/leave-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["leave-types"] });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Configured Leave Types ({items.length})</CardTitle>
        {canManage && <Button size="sm" onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-3 h-3 mr-1" /> New</Button>}
      </CardHeader>
      <CardContent>
        {isLoading ? <LoadingState rows={4} /> : items.length === 0 ? (
          <EmptyState title="No leave types configured" description="Click 'Seed Defaults' below to load standard leave types (Annual, Sick, Maternity, etc.)." icon={Settings} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {items.map((t: any) => (
              <div key={t.id} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {t.colorHex && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.colorHex }} />}
                    <span className="font-medium">{t.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{t.code}</Badge>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Default: {t.defaultDays || 0} days • Category: {t.category}
                  {t.isSensitive && " • Sensitive"}
                  {t.requiresDocumentation && " • Doc required"}
                </div>
                {canManage && (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => toggleActive.mutate({ id: t.id, active: !t.active })} className="h-6 text-xs">
                      {t.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <SeedDefaultsButton />
      </CardContent>
      {showNew && <NewLeaveTypeDialog onClose={() => setShowNew(false)} />}
    </Card>
  );
}

function NewLeaveTypeDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("paid");
  const [colorHex, setColorHex] = useState("#10b981");
  const [defaultDays, setDefaultDays] = useState("30");
  const [accrualRatePerMonth, setAccrualRatePerMonth] = useState("2.5");
  const [carryForwardLimit, setCarryForwardLimit] = useState("15");
  const [minDurationDays, setMinDurationDays] = useState("1");
  const [maxDurationDays, setMaxDurationDays] = useState("");
  const [noticePeriodDays, setNoticePeriodDays] = useState("7");
  const [requiresDocumentation, setRequiresDocumentation] = useState(false);
  const [requiresApprovalHierarchy, setRequiresApprovalHierarchy] = useState(true);
  const [isSensitive, setIsSensitive] = useState(false);
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leave-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, code, category, colorHex,
          defaultDays: defaultDays ? parseFloat(defaultDays) : null,
          accrualRatePerMonth: accrualRatePerMonth ? parseFloat(accrualRatePerMonth) : null,
          carryForwardLimit: carryForwardLimit ? parseFloat(carryForwardLimit) : null,
          minDurationDays: parseFloat(minDurationDays) || 1,
          maxDurationDays: maxDurationDays ? parseFloat(maxDurationDays) : null,
          noticePeriodDays: parseInt(noticePeriodDays, 10) || 0,
          requiresDocumentation, requiresApprovalHierarchy, isSensitive, description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Leave type created");
      qc.invalidateQueries({ queryKey: ["leave-types"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">Create New Leave Type</DialogTitle>
          <DialogDescription className="text-white/80">Configure a custom leave type with policy rules.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel required>Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Annual Leave" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Code</FieldLabel>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g., ANNUAL" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="special">Special</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              <Input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="w-16 h-9 p-1" />
              <Input value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="flex-1" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Default Days</Label>
            <Input type="number" step="0.5" value={defaultDays} onChange={(e) => setDefaultDays(e.target.value)} placeholder="30" />
          </div>
          <div className="space-y-1.5">
            <Label>Accrual Rate (per month)</Label>
            <Input type="number" step="0.01" value={accrualRatePerMonth} onChange={(e) => setAccrualRatePerMonth(e.target.value)} placeholder="2.5" />
          </div>
          <div className="space-y-1.5">
            <Label>Carry Forward Limit</Label>
            <Input type="number" step="0.5" value={carryForwardLimit} onChange={(e) => setCarryForwardLimit(e.target.value)} placeholder="15" />
          </div>
          <div className="space-y-1.5">
            <Label>Min Duration (days)</Label>
            <Input type="number" step="0.5" value={minDurationDays} onChange={(e) => setMinDurationDays(e.target.value)} placeholder="1" />
          </div>
          <div className="space-y-1.5">
            <Label>Max Duration (days)</Label>
            <Input type="number" step="0.5" value={maxDurationDays} onChange={(e) => setMaxDurationDays(e.target.value)} placeholder="90" />
          </div>
          <div className="space-y-1.5">
            <Label>Notice Period (days)</Label>
            <Input type="number" value={noticePeriodDays} onChange={(e) => setNoticePeriodDays(e.target.value)} placeholder="7" />
          </div>
          <div className="space-y-1.5 md:col-span-2 flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={requiresDocumentation} onChange={(e) => setRequiresDocumentation(e.target.checked)} /> Requires Documentation
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={requiresApprovalHierarchy} onChange={(e) => setRequiresApprovalHierarchy(e.target.checked)} /> Approval Hierarchy
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isSensitive} onChange={(e) => setIsSensitive(e.target.checked)} /> Sensitive (restricted access)
            </label>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name || !code} className="bg-emerald-600 hover:bg-emerald-700">
            Create Leave Type
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HolidaysSettings({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const year = String(new Date().getFullYear());
  const { data, isLoading } = useQuery({
    queryKey: ["holidays-settings", year],
    queryFn: () => fetchJson(`/api/holidays?year=${year}`),
  });
  const items = data?.items || [];

  const deleteHoliday = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/holidays/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Holiday deleted");
      qc.invalidateQueries({ queryKey: ["holidays"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Public Holidays ({year}) — {items.length}</CardTitle>
        {canManage && <Button size="sm" onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-3 h-3 mr-1" /> New</Button>}
      </CardHeader>
      <CardContent>
        {isLoading ? <LoadingState rows={4} /> : items.length === 0 ? (
          <EmptyState title="No holidays configured" description="Click 'Seed Defaults' below to load standard public holidays." icon={CalendarDays} />
        ) : (
          <div className="space-y-1">
            {items.map((h: any) => (
              <div key={h.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                <div>
                  <span className="font-medium">{h.name}</span>
                  <span className="text-slate-500 ml-2">{formatDate(h.date)}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <Badge variant="outline" className="text-xs capitalize">{h.type}</Badge>
                  {h.isRecurring && <Badge variant="outline" className="text-xs">Annual</Badge>}
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete holiday "${h.name}"?`)) deleteHoliday.mutate(h.id); }} className="h-6 text-xs text-rose-600 hover:bg-rose-50">
                      <Ban className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <SeedDefaultsButton />
      </CardContent>
      {showNew && <NewHolidayDialog onClose={() => setShowNew(false)} />}
    </Card>
  );
}

function NewHolidayDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState("public");
  const [isRecurring, setIsRecurring] = useState(false);
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, date, type, isRecurring, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Holiday created");
      qc.invalidateQueries({ queryKey: ["holidays"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">Create New Public Holiday</DialogTitle>
          <DialogDescription className="text-white/80">Add a custom public holiday for your organization.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="space-y-1.5">
            <FieldLabel required>Holiday Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Independence Day" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Date</FieldLabel>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="religious">Religious</SelectItem>
                <SelectItem value="organizational">Organizational</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} /> Recurs annually
            </label>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name || !date} className="bg-emerald-600 hover:bg-emerald-700">
            Create Holiday
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StaffingRequirementsSettings({ canManage }: { canManage: boolean }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["staffing-req-settings", activeFacilityId],
    queryFn: () => fetchJson(`/api/staffing-requirements${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`),
    enabled: !!activeFacilityId,
  });
  const items = data?.items || [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/staffing-requirements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast.success("Requirement deactivated"); qc.invalidateQueries({ queryKey: ["staffing-req-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Staffing Requirements ({items.length})</CardTitle>
        {canManage && <Button size="sm" onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-3 h-3 mr-1" /> New</Button>}
      </CardHeader>
      <CardContent>
        {isLoading ? <LoadingState rows={3} /> : items.length === 0 ? (
          <EmptyState title="No staffing requirements configured" description="Configure minimum staffing per department/shift to detect shortages." icon={Settings} />
        ) : (
          <div className="space-y-1">
            {items.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                <div>
                  <span className="font-medium">{r.facility?.name}</span>
                  <span className="text-slate-500 ml-2">• {r.department?.name || "Any"}</span>
                  <span className="text-slate-500 ml-2">• {r.shiftType || "Any"}</span>
                  <span className="text-slate-500 ml-2">• {r.dayType}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{r.profession || "Any"}</Badge>
                  <Badge variant="outline">Min: {r.minCount}</Badge>
                  {r.idealCount && <Badge variant="outline">Ideal: {r.idealCount}</Badge>}
                  {canManage && <Button size="sm" variant="ghost" onClick={() => { if (confirm("Deactivate this requirement?")) deleteMutation.mutate(r.id); }} className="h-6 text-xs text-rose-600 hover:bg-rose-50"><Ban className="w-3 h-3" /></Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {showNew && <NewStaffingReqDialog onClose={() => setShowNew(false)} />}
    </Card>
  );
}

function NewStaffingReqDialog({ onClose }: { onClose: () => void }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [departmentId, setDepartmentId] = useState("__none__");
  const [shiftType, setShiftType] = useState("__none__");
  const [dayType, setDayType] = useState("weekday");
  const [profession, setProfession] = useState("");
  const [seniority, setSeniority] = useState("");
  const [minCount, setMinCount] = useState("1");
  const [idealCount, setIdealCount] = useState("");
  const [notes, setNotes] = useState("");

  const { data: deptData } = useQuery({
    queryKey: ["depts-for-staffing-req", activeFacilityId],
    queryFn: () => fetchJson(`/api/departments${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`),
    enabled: !!activeFacilityId,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staffing-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId: activeFacilityId,
          departmentId: departmentId !== "__none__" ? departmentId : undefined,
          shiftType: shiftType !== "__none__" ? shiftType : undefined,
          dayType,
          profession: profession || undefined,
          seniority: seniority || undefined,
          minCount: parseInt(minCount, 10),
          idealCount: idealCount ? parseInt(idealCount, 10) : undefined,
          notes,
        }),
      });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("Staffing requirement created"); qc.invalidateQueries({ queryKey: ["staffing-req-settings"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white"><DialogTitle className="text-white">New Staffing Requirement</DialogTitle><DialogDescription className="text-white/80">Define minimum staffing levels for a department/shift/day type.</DialogDescription></DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Any Department</SelectItem>
                {(deptData?.items || []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Shift Type</Label>
            <Select value={shiftType} onValueChange={setShiftType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Any Shift</SelectItem>
                <SelectItem value="morning">Morning</SelectItem>
                <SelectItem value="evening">Evening</SelectItem>
                <SelectItem value="night">Night</SelectItem>
                <SelectItem value="on_call">On Call</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Day Type</Label>
            <Select value={dayType} onValueChange={setDayType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekday">Weekday</SelectItem>
                <SelectItem value="weekend">Weekend</SelectItem>
                <SelectItem value="holiday">Holiday</SelectItem>
                <SelectItem value="any">Any Day</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Profession (optional)</Label><Input value={profession} onChange={(e) => setProfession(e.target.value)} placeholder="e.g., nurse" /></div>
          <div className="space-y-1.5"><Label>Seniority (optional)</Label><Input value={seniority} onChange={(e) => setSeniority(e.target.value)} placeholder="e.g., senior" /></div>
          <div className="space-y-1.5"><FieldLabel required>Min Count</FieldLabel><Input type="number" min="1" value={minCount} onChange={(e) => setMinCount(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Ideal Count (optional)</Label><Input type="number" value={idealCount} onChange={(e) => setIdealCount(e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !activeFacilityId} className="bg-emerald-600 hover:bg-emerald-700">Create Requirement</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeavePoliciesSettings({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["leave-policies-settings"],
    queryFn: () => fetchJson(`/api/leave-policies`),
  });
  const items = data?.items || [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/leave-policies/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast.success("Policy deactivated"); qc.invalidateQueries({ queryKey: ["leave-policies-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Leave Policies ({items.length})</CardTitle>
        {canManage && <Button size="sm" onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-3 h-3 mr-1" /> New</Button>}
      </CardHeader>
      <CardContent>
        {isLoading ? <LoadingState rows={3} /> : items.length === 0 ? (
          <EmptyState title="No leave policies configured" description="Leave policies define eligibility, approval hierarchy, accrual, and carry-forward rules." icon={FileText} />
        ) : (
          <div className="space-y-2">
            {items.map((p: any) => (
              <div key={p.id} className="p-3 bg-slate-50 rounded text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{p.name}</div>
                  {canManage && <Button size="sm" variant="ghost" onClick={() => { if (confirm("Deactivate this policy?")) deleteMutation.mutate(p.id); }} className="h-6 text-xs text-rose-600 hover:bg-rose-50"><Ban className="w-3 h-3" /></Button>}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {p.leaveType?.name} • {p.facility?.name || "All facilities"} • {p.department?.name || "All depts"}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Accrual: {p.accrualFrequency || "\u2014"} ({p.accrualAmount || 0}) • Carry-forward: {p.carryForwardEnabled ? `Yes (max ${p.carryForwardLimit || 0})` : "No"} • Negative: {p.negativeBalanceAllowed ? `Yes (max ${p.negativeBalanceLimit || 0})` : "No"}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {showNew && <NewLeavePolicyDialog onClose={() => setShowNew(false)} />}
    </Card>
  );
}

function NewLeavePolicyDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [facilityId, setFacilityId] = useState("__none__");
  const [departmentId, setDepartmentId] = useState("__none__");
  const [accrualFrequency, setAccrualFrequency] = useState("monthly");
  const [accrualAmount, setAccrualAmount] = useState("");
  const [carryForwardEnabled, setCarryForwardEnabled] = useState(false);
  const [carryForwardLimit, setCarryForwardLimit] = useState("");
  const [carryForwardExpiryMonths, setCarryForwardExpiryMonths] = useState("");
  const [negativeBalanceAllowed, setNegativeBalanceAllowed] = useState(false);
  const [negativeBalanceLimit, setNegativeBalanceLimit] = useState("");
  const [notes, setNotes] = useState("");

  const { data: leaveTypesData } = useQuery({ queryKey: ["leave-types-for-policy"], queryFn: () => fetchJson(`/api/leave-types`) });
  const { data: facilitiesData } = useQuery({ queryKey: ["facilities-for-policy"], queryFn: () => fetchJson(`/api/facilities`) });
  const { data: deptsData } = useQuery({ queryKey: ["depts-for-policy", facilityId], queryFn: () => fetchJson(`/api/departments${facilityId !== "__none__" ? `?facilityId=${facilityId}` : ""}`), enabled: facilityId !== "__none__" });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leave-policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, leaveTypeId,
          facilityId: facilityId !== "__none__" ? facilityId : undefined,
          departmentId: departmentId !== "__none__" ? departmentId : undefined,
          accrualFrequency: accrualFrequency || undefined,
          accrualAmount: accrualAmount ? parseFloat(accrualAmount) : undefined,
          carryForwardEnabled,
          carryForwardLimit: carryForwardLimit ? parseFloat(carryForwardLimit) : undefined,
          carryForwardExpiryMonths: carryForwardExpiryMonths ? parseInt(carryForwardExpiryMonths, 10) : undefined,
          negativeBalanceAllowed,
          negativeBalanceLimit: negativeBalanceLimit ? parseFloat(negativeBalanceLimit) : undefined,
          notes,
        }),
      });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("Leave policy created"); qc.invalidateQueries({ queryKey: ["leave-policies-settings"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white"><DialogTitle className="text-white">New Leave Policy</DialogTitle><DialogDescription className="text-white/80">Define accrual, carry-forward, and negative balance rules for a leave type.</DialogDescription></DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5 md:col-span-2"><FieldLabel required>Policy Name</FieldLabel><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Annual Leave Policy 2026" /></div>
          <div className="space-y-1.5">
            <FieldLabel required>Leave Type</FieldLabel>
            <Select value={leaveTypeId || "__none__"} onValueChange={setLeaveTypeId}>
              <SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">\u2014</SelectItem>
                {(leaveTypesData?.items || []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Facility (optional)</Label>
            <Select value={facilityId} onValueChange={(v) => { setFacilityId(v); setDepartmentId("__none__"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">All Facilities</SelectItem>
                {(facilitiesData?.items || []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Department (optional)</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">All Departments</SelectItem>
                {(deptsData?.items || []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Accrual Frequency</Label>
            <Select value={accrualFrequency} onValueChange={setAccrualFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="pro_rata">Pro-rata</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Accrual Amount (days)</Label><Input type="number" step="0.5" value={accrualAmount} onChange={(e) => setAccrualAmount(e.target.value)} placeholder="e.g., 2.5" /></div>
          <div className="space-y-1.5 md:col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={carryForwardEnabled} onChange={(e) => setCarryForwardEnabled(e.target.checked)} /> Allow Carry Forward</label></div>
          {carryForwardEnabled && (<>
            <div className="space-y-1.5"><Label>Carry Forward Limit (days)</Label><Input type="number" step="0.5" value={carryForwardLimit} onChange={(e) => setCarryForwardLimit(e.target.value)} placeholder="e.g., 15" /></div>
            <div className="space-y-1.5"><Label>Carry Forward Expiry (months)</Label><Input type="number" value={carryForwardExpiryMonths} onChange={(e) => setCarryForwardExpiryMonths(e.target.value)} placeholder="e.g., 3" /></div>
          </>)}
          <div className="space-y-1.5 md:col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={negativeBalanceAllowed} onChange={(e) => setNegativeBalanceAllowed(e.target.checked)} /> Allow Negative Balance</label></div>
          {negativeBalanceAllowed && <div className="space-y-1.5"><Label>Negative Balance Limit (days)</Label><Input type="number" step="0.5" value={negativeBalanceLimit} onChange={(e) => setNegativeBalanceLimit(e.target.value)} placeholder="e.g., 5" /></div>}
          <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name || !leaveTypeId} className="bg-emerald-600 hover:bg-emerald-700">Create Policy</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SeedDefaultsButton() {
  const qc = useQueryClient();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [loading, setLoading] = useState(false);

  const seed = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/seed-workforce-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facilityId: activeFacilityId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Seeded: ${data.results.shiftTypesCreated} shift types, ${data.results.leaveTypesCreated} leave types, ${data.results.holidaysCreated} holidays`);
      qc.invalidateQueries({ queryKey: ["shift-types"] });
      qc.invalidateQueries({ queryKey: ["leave-types"] });
      qc.invalidateQueries({ queryKey: ["holidays"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="text-sm text-blue-900 mb-2">
        No configuration yet? Seed standard defaults (Shift Types, Leave Types, Public Holidays) with one click.
      </div>
      <Button size="sm" onClick={seed} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
        <Settings className="w-3 h-3 mr-1" /> {loading ? "Seeding..." : "Seed Defaults"}
      </Button>
    </div>
  );
}

// =====================================================================
// AVAILABILITY TAB
// =====================================================================
export function AvailabilityTab() {
  const { can } = usePermissions();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  params.set("date", date);
  const qs = `?${params.toString()}`;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["staff-availability", activeFacilityId, date],
    queryFn: () => fetchJson(`/api/staff-availability${qs}`),
    enabled: !!activeFacilityId,
  });
  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        {can(["shift.manage", "staff_availability.manage"]) && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Set Availability
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No availability records" description="Set per-day availability for staff when they cannot make a shift." icon={UserCheck} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a: any) => (
                    <tr key={a.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium">{a.staff?.firstName} {a.staff?.lastName}</div>
                        <div className="text-xs text-slate-500">{a.staff?.staffNumber}</div>
                      </td>
                      <td className="p-3">{formatDate(a.date)}</td>
                      <td className="p-3"><ColoredBadge status={a.status} list={AVAILABILITY_STATUSES} /></td>
                      <td className="p-3 text-slate-700">{a.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showNew && <NewAvailabilityDialog onClose={() => setShowNew(false)} date={date} />}
    </div>
  );
}

function NewAvailabilityDialog({ onClose, date }: { onClose: () => void; date: string }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [status, setStatus] = useState("unavailable");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [availDate, setAvailDate] = useState(date);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          facilityId: activeFacilityId,
          date: availDate,
          status,
          reason,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Availability updated");
      qc.invalidateQueries({ queryKey: ["staff-availability"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">Set Staff Availability</DialogTitle>
          <DialogDescription className="text-white/80">Override a staff member&apos;s default availability for a specific date.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <StaffSearchableSelect
            value={staffId}
            onValueChange={setStaffId}
            label="Staff"
            required
          />
          <div className="space-y-1.5">
            <FieldLabel required>Date</FieldLabel>
            <Input type="date" value={availDate} onChange={(e) => setAvailDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Status</FieldLabel>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AVAILABILITY_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Family emergency" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !staffId} className="bg-emerald-600 hover:bg-emerald-700">
            Set Availability
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

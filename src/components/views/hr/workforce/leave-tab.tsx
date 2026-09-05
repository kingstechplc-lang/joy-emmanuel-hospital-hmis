"use client";
// =====================================================================
// LEAVE TAB — List, create, and approve/reject leave requests
// Includes balance check, conflict warnings, sensitive leave handling.
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
import { Plus, Search, Check, X, AlertTriangle, Lock, FileText, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { StaffSearchableSelect } from "@/components/ui/staff-searchable-select";
import {
  fetchJson, usePermissions, ColoredBadge, LEAVE_STATUSES, formatDate,
} from "./workforce-helpers";
import { EmptyState, LoadingState, ErrorState, ClearableSearch } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

export function LeaveTab() {
  const { can } = usePermissions();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [leaveType, setLeaveType] = useState("all");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (leaveType !== "all") params.set("leaveType", leaveType);
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["leave", activeFacilityId, statusFilter, leaveType, search],
    queryFn: () => fetchJson(`/api/leave${qs}`),
  });

  const { data: leaveTypesData } = useQuery({
    queryKey: ["leave-types", activeFacilityId],
    queryFn: () => fetchJson(`/api/leave-types${activeFacilityId ? `?facilityId=${activeFacilityId}` : ""}`),
  });
  const leaveTypes = leaveTypesData?.items || [];

  const items = (data?.items || []).filter((l: any) =>
    !search ||
    l.staff?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
    l.staff?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
    l.staff?.staffNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["leave"] });
    qc.invalidateQueries({ queryKey: ["workforce-dashboard"] });
    qc.invalidateQueries({ queryKey: ["leave-balances"] });
  };

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, reviewComment }: { id: string; action: "approve" | "reject" | "cancel" | "complete"; reviewComment?: string }) => {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewComment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (data, vars) => {
      toast.success(`Leave ${vars.action}${data.staffingWarning ? ` — Warning: ${data.staffingWarning}` : ""}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [reviewDialog, setReviewDialog] = useState<{ id: string; action: "approve" | "reject" | "cancel" } | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-col md:flex-row gap-2 flex-1">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search by staff name or number" className="pl-8" />
          </div>
          <Select value={statusFilter || "all"} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {LEAVE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={leaveType || "all"} onValueChange={setLeaveType}>
            <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {leaveTypes.map((t: any) => <SelectItem key={t.id} value={t.code.toLowerCase()}>{t.name}</SelectItem>)}
              <SelectItem value="annual">Annual</SelectItem>
              <SelectItem value="sick">Sick</SelectItem>
              <SelectItem value="maternity">Maternity</SelectItem>
              <SelectItem value="paternity">Paternity</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="study">Study</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {can(["shift.manage", "leave.request", "staff.manage"]) && (
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
        <Card><CardContent className="p-6"><EmptyState title="No leave records" description="Submit a leave request to begin tracking time off." icon={Plus} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Dates</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Return Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Reason</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    {can(["shift.manage", "leave.approve", "staff.manage"]) && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((l: any) => (
                    <tr key={l.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-900 flex items-center gap-1">
                          {l.staff?.firstName} {l.staff?.lastName}
                          {l.isSensitive && <Lock className="w-3 h-3 text-amber-600" />}
                        </div>
                        <div className="text-xs text-slate-500">{l.staff?.staffNumber}</div>
                      </td>
                      <td className="p-3">
                        <span className="capitalize">{l.leaveTypeRef?.name || l.leaveType}</span>
                        {l.partialDay && l.partialDay !== "full" && (
                          <div className="text-xs text-slate-500 capitalize">{l.partialDay.replace(/_/g, " ")}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <div>{formatDate(l.startDate)}</div>
                        {l.endDate && <div className="text-xs text-slate-500">→ {formatDate(l.endDate)}</div>}
                      </td>
                      <td className="p-3">
                        {l.returnDate ? formatDate(l.returnDate) : "—"}
                        {l.actualReturnDate && <div className="text-xs text-emerald-700">Actual: {formatDate(l.actualReturnDate)}</div>}
                      </td>
                      <td className="p-3 max-w-xs">
                        <div className="text-slate-700 truncate">{l.reason || (l.isSensitive ? <span className="italic text-slate-400">Restricted</span> : "—")}</div>
                      </td>
                      <td className="p-3"><ColoredBadge status={l.status} list={LEAVE_STATUSES} /></td>
                      {can(["shift.manage", "leave.approve", "staff.manage"]) && (
                        <td className="p-3 text-right">
                          {l.status === "pending" && (
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setReviewDialog({ id: l.id, action: "approve" })} className="h-8 px-2 text-emerald-600 hover:bg-emerald-50" title="Approve">
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setReviewDialog({ id: l.id, action: "reject" })} className="h-8 px-2 text-rose-600 hover:bg-rose-50" title="Reject">
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                          {l.status === "approved" && (
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => actionMutation.mutate({ id: l.id, action: "complete" })} className="h-8 px-2 text-emerald-600 hover:bg-emerald-50" title="Mark return to duty">
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setReviewDialog({ id: l.id, action: "cancel" })} className="h-8 px-2 text-rose-600 hover:bg-rose-50" title="Cancel approved leave">
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                          {(l.status === "pending" || l.status === "approved") && (
                            <Button size="sm" variant="ghost" onClick={() => setReviewDialog({ id: l.id, action: "cancel" })} className="h-8 px-2 text-slate-600 hover:bg-slate-100" title="Cancel">
                              <X className="w-3.5 h-3.5" />
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

      {showNew && <NewLeaveDialog onClose={() => setShowNew(false)} leaveTypes={leaveTypes} />}

      {reviewDialog && (
        <ReviewDialog
          onClose={() => setReviewDialog(null)}
          onSubmit={(comment) => {
            actionMutation.mutate({ id: reviewDialog.id, action: reviewDialog.action, reviewComment: comment });
            setReviewDialog(null);
          }}
          action={reviewDialog.action}
        />
      )}
    </div>
  );
}

function ReviewDialog({ onClose, onSubmit, action }: { onClose: () => void; onSubmit: (comment: string) => void; action: "approve" | "reject" | "cancel" }) {
  const [comment, setComment] = useState("");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden" size="compact">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white capitalize">{action} Leave Request</DialogTitle>
          <DialogDescription className="text-white/80">
            {action === "approve" && "Approving will deduct the leave days from the staff member's balance and mark them as on-leave."}
            {action === "reject" && "Rejecting will restore any pending balance deductions."}
            {action === "cancel" && "Cancelling will restore balances and (if approved) set the staff back to active status."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          <Label>Comment / Reason (optional)</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder={`Reason for ${action}...`} />
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSubmit(comment)}
            className={action === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}
          >
            Confirm {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewLeaveDialog({ onClose, leaveTypes }: { onClose: () => void; leaveTypes: any[] }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [staffId, setStaffId] = useState("");
  const [leaveType, setLeaveType] = useState("annual");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [reason, setReason] = useState("");
  const [partialDay, setPartialDay] = useState("full");
  const [hoursOff, setHoursOff] = useState("");
  const [contactDuringLeave, setContactDuringLeave] = useState("");
  const [supportingDocUrl, setSupportingDocUrl] = useState("");
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          facilityId: activeFacilityId,
          leaveType,
          leaveTypeId: leaveTypeId || undefined,
          startDate,
          endDate: endDate || undefined,
          returnDate: returnDate || undefined,
          reason,
          partialDay,
          hoursOff: hoursOff ? parseFloat(hoursOff) : undefined,
          contactDuringLeave,
          supportingDocUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success("Leave request submitted");
      if (data.conflictWarnings?.length > 0) {
        toast.warning(`${data.conflictWarnings.length} conflict warning(s) detected.`);
      }
      if (data.balanceCheck && !data.balanceCheck.canApprove) {
        toast.warning(`Balance check: ${data.balanceCheck.reason}`);
      }
      qc.invalidateQueries({ queryKey: ["leave"] });
      qc.invalidateQueries({ queryKey: ["workforce-dashboard"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="large">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">Submit Leave Request</DialogTitle>
          <DialogDescription className="text-white/80">The system will check leave balance, conflicts with shifts, and existing leave records.</DialogDescription>
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
            <Label>Leave Type</Label>
            <Select value={leaveTypeId || leaveType} onValueChange={(v) => {
              if (leaveTypes.find((t) => t.id === v)) {
                setLeaveTypeId(v);
                setLeaveType(v);
              } else {
                setLeaveType(v);
                setLeaveTypeId("");
              }
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {leaveTypes.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="sick">Sick</SelectItem>
                <SelectItem value="maternity">Maternity</SelectItem>
                <SelectItem value="paternity">Paternity</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="study">Study</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Partial Day</Label>
            <Select value={partialDay} onValueChange={setPartialDay}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Day</SelectItem>
                <SelectItem value="half_first">Half Day (First Half)</SelectItem>
                <SelectItem value="half_second">Half Day (Second Half)</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
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
          <div className="space-y-1.5">
            <Label>Expected Return Date</Label>
            <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
          {partialDay === "hours" && (
            <div className="space-y-1.5">
              <FieldLabel required>Hours Off</FieldLabel>
              <Input type="number" step="0.5" value={hoursOff} onChange={(e) => setHoursOff(e.target.value)} placeholder="e.g. 4" />
            </div>
          )}
          <div className="space-y-1.5 md:col-span-2">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Brief reason for leave..." />
          </div>
          <div className="space-y-1.5">
            <Label>Contact During Leave</Label>
            <Input value={contactDuringLeave} onChange={(e) => setContactDuringLeave(e.target.value)} placeholder="Phone / email" />
          </div>
          <div className="space-y-1.5">
            <Label>Supporting Document URL (optional)</Label>
            <Input value={supportingDocUrl} onChange={(e) => setSupportingDocUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>

        {result?.conflictWarnings?.length > 0 && (
          <Alert>
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>Conflict Warnings</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 text-sm">
                {result.conflictWarnings.map((w: any, i: number) => <li key={i}>{w.message}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {result?.balanceCheck && (
          <Alert variant={result.balanceCheck.canApprove ? "default" : "destructive"}>
            <FileText className="w-4 h-4" />
            <AlertTitle>Balance Check</AlertTitle>
            <AlertDescription>
              Requested: {result.balanceCheck.requestedDays} day(s) • Remaining: {result.balanceCheck.currentRemaining?.toFixed(1)} day(s)
              {!result.balanceCheck.canApprove && <div className="mt-1 font-medium">{result.balanceCheck.reason}</div>}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !staffId} className="bg-emerald-600 hover:bg-emerald-700">
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

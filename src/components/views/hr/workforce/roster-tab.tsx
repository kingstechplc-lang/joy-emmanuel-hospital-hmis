"use client";
// =====================================================================
// ROSTER TAB — Manage rosters (draft/review/publish/lock)
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
import { Badge } from "@/components/ui/badge";
import { Plus, Lock, Unlock, Send, Eye, Trash2, FileText, Calendar } from "lucide-react";
import { toast } from "sonner";
import {
  fetchJson, usePermissions, ColoredBadge, ROSTER_STATUSES, formatDate,
} from "./workforce-helpers";
import { EmptyState, LoadingState, ErrorState } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

export function RosterTab() {
  const { can } = usePermissions();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [viewRoster, setViewRoster] = useState<any>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rosters", activeFacilityId],
    queryFn: () => fetchJson(`/api/rosters${qs}`),
    enabled: !!activeFacilityId,
  });

  const items = data?.items || [];

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: "publish" | "lock" | "unlock" | "delete"; reason?: string }) => {
      const endpoint = action === "delete" ? `/api/rosters/${id}` : `/api/rosters/${id}/${action}`;
      const res = await fetch(endpoint, {
        method: action === "delete" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Roster ${vars.action}ed successfully`);
      qc.invalidateQueries({ queryKey: ["rosters"] });
      qc.invalidateQueries({ queryKey: ["workforce-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {can(["shift.manage", "roster.manage"]) && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={!activeFacilityId}>
            <Plus className="w-4 h-4" /> New Roster
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load rosters" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No rosters yet" description="Create a roster to organize shift assignments for a date range." icon={Calendar} /></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((r: any) => (
            <Card key={r.id} className={r.lockedAt ? "border-amber-300" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-slate-900 truncate">{r.name}</h4>
                    <div className="text-xs text-slate-500 mt-1">
                      {r.facility?.name} {r.department && `• ${r.department.name}`}
                    </div>
                  </div>
                  {r.lockedAt && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-300">
                      <Lock className="w-3 h-3 mr-1" /> LOCKED
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-slate-700 mb-2">
                  {formatDate(r.startDate)} → {formatDate(r.endDate)}
                </div>
                <div className="flex items-center justify-between text-xs mb-3">
                  <ColoredBadge status={r.status} list={ROSTER_STATUSES} />
                  <span className="text-slate-500">{r._count?.shifts || 0} shifts • v{r.versionNumber}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={() => setViewRoster(r)} className="h-7 text-xs">
                    <Eye className="w-3 h-3 mr-1" /> View
                  </Button>
                  {can(["shift.manage", "roster.publish"]) && r.status !== "published" && !r.lockedAt && (
                    <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: r.id, action: "publish" })} className="h-7 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                      <Send className="w-3 h-3 mr-1" /> Publish
                    </Button>
                  )}
                  {can(["shift.manage", "roster.lock"]) && r.status === "published" && !r.lockedAt && (
                    <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: r.id, action: "lock" })} className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50">
                      <Lock className="w-3 h-3 mr-1" /> Lock
                    </Button>
                  )}
                  {can(["shift.manage", "roster.lock"]) && r.lockedAt && (
                    <Button size="sm" variant="outline" onClick={() => {
                      const reason = prompt("Reason for unlocking (required):");
                      if (reason) actionMutation.mutate({ id: r.id, action: "unlock", reason });
                    }} className="h-7 text-xs text-orange-700 border-orange-300 hover:bg-orange-50">
                      <Unlock className="w-3 h-3 mr-1" /> Unlock
                    </Button>
                  )}
                  {can(["shift.manage", "roster.manage"]) && r.status !== "published" && !r.lockedAt && (
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (confirm(`Delete roster "${r.name}"? This will detach ${r._count?.shifts || 0} shifts (they will be preserved).`)) {
                        actionMutation.mutate({ id: r.id, action: "delete" });
                      }
                    }} className="h-7 text-xs text-rose-600 hover:bg-rose-50">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showNew && <NewRosterDialog onClose={() => setShowNew(false)} />}
      {viewRoster && <ViewRosterDialog roster={viewRoster} onClose={() => setViewRoster(null)} />}
    </div>
  );
}

function NewRosterDialog({ onClose }: { onClose: () => void }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [facilityId, setFacilityId] = useState(activeFacilityId || "");
  const [departmentId, setDepartmentId] = useState("__none__");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: deptData } = useQuery({
    queryKey: ["depts-for-roster", facilityId],
    queryFn: () => fetchJson(`/api/departments${facilityId ? `?facilityId=${facilityId}` : ""}`),
    enabled: !!facilityId,
  });
  const depts = deptData?.items || [];

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/rosters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          facilityId,
          departmentId: departmentId !== "__none__" ? departmentId : undefined,
          startDate,
          endDate,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Roster created (draft status)");
      qc.invalidateQueries({ queryKey: ["rosters"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">Create New Roster</DialogTitle>
          <DialogDescription className="text-white/80">A roster is a collection of shift assignments for a date range. It starts in draft status.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Roster Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., August 2026 Medical Ward" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Facility</FieldLabel>
            <Input value={facilityId} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Department (optional)</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Start Date</FieldLabel>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>End Date</FieldLabel>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name || !facilityId || !startDate || !endDate} className="bg-emerald-600 hover:bg-emerald-700">
            Create Draft Roster
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewRosterDialog({ roster, onClose }: { roster: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["roster", roster.id],
    queryFn: () => fetchJson(`/api/rosters/${roster.id}`),
  });

  const item = data?.item;
  const shifts = item?.shifts || [];

  // Group shifts by date
  const byDate: Record<string, any[]> = {};
  for (const s of shifts) {
    const dateKey = new Date(s.shiftDate).toISOString().slice(0, 10);
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(s);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white" className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> {roster.name}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {roster.facility?.name} • {formatDate(roster.startDate)} → {formatDate(roster.endDate)} • Status: <ColoredBadge status={roster.status} list={ROSTER_STATUSES} /> • v{roster.versionNumber}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState rows={4} />
        ) : shifts.length === 0 ? (
          <EmptyState title="No shifts assigned yet" description="Use the Shifts tab to assign shifts to this roster." icon={Plus} />
        ) : (
          <div className="space-y-3">
            {Object.entries(byDate).sort().map(([date, dayShifts]) => (
              <div key={date}>
                <div className="text-xs font-semibold text-slate-700 mb-1 sticky top-0 bg-white py-1">
                  {formatDate(date)} <span className="text-slate-500">({dayShifts.length} shifts)</span>
                </div>
                <div className="space-y-1">
                  {dayShifts.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{s.staff?.firstName} {s.staff?.lastName}</span>
                        <span className="text-slate-500 ml-2 text-xs">{s.staff?.staffNumber}</span>
                      </div>
                      <div className="text-right text-xs">
                        <div>{new Date(s.startTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} → {s.endTime ? new Date(s.endTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                        <div className="text-slate-500 capitalize">{s.shiftType || s.shiftTypeRef?.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight, Plus, RefreshCcw, Eye, Clock, UserCheck, LogOut, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative, safeJson} from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
import { SearchableSelect } from "@/components/ui/searchable-select";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

const SHIFT_OPTIONS = [
  { value: "all", label: "All Shifts" },
  { value: "morning", label: "Morning" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
];

const SHIFT_BADGE: Record<string, string> = {
  morning: "bg-amber-100 text-amber-700 border-amber-200",
  evening: "bg-teal-100 text-teal-700 border-teal-200",
  night: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

export function HandoverView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [todayOnly, setTodayOnly] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);

  // Load facility's departments for filter dropdown
  const { data: deptsData } = useQuery({
    queryKey: ["handover-departments", activeFacilityId],
    queryFn: () => fetchJson(`/api/departments?facilityId=${activeFacilityId || ""}`),
    enabled: !!activeFacilityId,
  });
  const departments = deptsData?.items || [];

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (departmentFilter !== "all") params.set("departmentId", departmentFilter);
  if (shiftFilter !== "all") params.set("shiftType", shiftFilter);
  params.set("today", todayOnly ? "true" : "false");
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["handovers", activeFacilityId, departmentFilter, shiftFilter, todayOnly],
    queryFn: () => fetchJson(`/api/handovers${qs}`),
    enabled: !!activeFacilityId,
  });

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-emerald-600" />
            Shift Handover
          </h2>
          <p className="text-sm text-slate-500">
            Digital shift handover notes for nursing and clinical staff continuity
          </p>
        </div>
        {can("clinical.view") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New Handover
          </Button>
        )}
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view handovers.</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <Select value={departmentFilter || undefined} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="md:w-56"><SelectValue placeholder="All Departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={shiftFilter || undefined} onValueChange={setShiftFilter}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SHIFT_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={todayOnly ? "default" : "outline"}
            onClick={() => setTodayOnly(!todayOnly)}
            className={`gap-2 ${todayOnly ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
          >
            <Clock className="w-4 h-4" /> {todayOnly ? "Today only" : "All dates"}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load handovers" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6">
          <EmptyState
            title="No handover records"
            description="Record shift handover notes for nursing and clinical continuity between shifts."
            icon={AlertCircle}
            action={can("clinical.view") && (
              <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4" /> New Handover
              </Button>
            )}
          />
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((h: any) => (
            <Card key={h.id} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setViewing(h)}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="outline" className={`capitalize ${SHIFT_BADGE[h.shiftType] || ""}`}>
                        {h.shiftType}
                      </Badge>
                      {h.department && <Badge variant="outline" className="text-emerald-700 border-emerald-200">{h.department.name}</Badge>}
                      <StatusBadge status={h.status} />
                      <span className="text-xs text-slate-500">
                        {formatDate(h.handoverDate, true)} ({formatRelative(h.handoverDate)})
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 line-clamp-2">{h.notes}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <LogOut className="w-3 h-3" /> Outgoing: {h.outgoingStaff ? `${h.outgoingStaff.firstName} ${h.outgoingStaff.lastName}` : "—"}
                      </span>
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-3 h-3" /> Incoming: {h.incomingStaff ? `${h.incomingStaff.firstName} ${h.incomingStaff.lastName}` : "—"}
                      </span>
                      {h.pendingTasks && (
                        <span className="flex items-center gap-1 text-amber-700">
                          <AlertCircle className="w-3 h-3" /> Pending tasks
                        </span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setViewing(h); }} className="h-8 w-8 p-0">
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showNew && <NewHandoverDialog onClose={() => setShowNew(false)} />}
      {viewing && <HandoverDetail handover={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function NewHandoverDialog({ onClose }: { onClose: () => void }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [form, setForm] = useState({
    facilityId: activeFacilityId || "",
    departmentId: "",
    shiftType: "morning",
    outgoingStaffId: "",
    incomingStaffId: "",
    notes: "",
    pendingTasks: "",
    handoverDate: "",
  });
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<any[]>([]);
  const [flaggedPatients, setFlaggedPatients] = useState<any[]>([]);

  // Departments for selected facility
  const { data: deptsData } = useQuery({
    queryKey: ["handover-form-depts", form.facilityId],
    queryFn: () => fetchJson(`/api/departments?facilityId=${form.facilityId}`),
    enabled: !!form.facilityId,
  });
  const departments = deptsData?.items || [];

  // Assignable users (nurses/clinical staff)
  const { data: usersData } = useQuery({
    queryKey: ["users-assignable-handover"],
    queryFn: () => fetchJson("/api/users/assignable"),
  });
  const users = usersData?.items || [];

  const searchPatients = async (q: string) => {
    setPatientQuery(q);
    if (q.length < 2) { setPatientResults([]); return; }
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}`);
      const d = await safeJson(res);
      setPatientResults(d.items || d.patients || []);
    } catch {
      setPatientResults([]);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/handovers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId: form.facilityId,
          departmentId: form.departmentId || undefined,
          shiftType: form.shiftType,
          outgoingStaffId: form.outgoingStaffId || undefined,
          incomingStaffId: form.incomingStaffId || undefined,
          patientsToFlag: flaggedPatients.map((p) => p.id),
          notes: form.notes,
          pendingTasks: form.pendingTasks || undefined,
          handoverDate: form.handoverDate ? new Date(form.handoverDate).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Handover recorded");
      qc.invalidateQueries({ queryKey: ["handovers"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-emerald-600" /> New Shift Handover
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Record handover notes between outgoing and incoming nursing/clinical staff.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel required>Facility</FieldLabel>
            <Input value={form.facilityId} disabled placeholder="Active facility" />
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={form.departmentId || undefined} onValueChange={(v) => setForm({ ...form, departmentId: v === "_none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— General (no specific department) —</SelectItem>
                {departments.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Shift</FieldLabel>
            <Select value={form.shiftType || undefined} onValueChange={(v) => setForm({ ...form, shiftType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Morning</SelectItem>
                <SelectItem value="evening">Evening</SelectItem>
                <SelectItem value="night">Night</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Handover Date / Time</Label>
            <Input
              type="datetime-local"
              value={form.handoverDate}
              onChange={(e) => setForm({ ...form, handoverDate: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Outgoing Staff</Label>
            <SearchableSelect
              options={users.map((u: any) => ({
                value: u.id,
                label: u.name || `${u.firstName} ${u.lastName}`,
                description: `@${u.username}`,
                secondary: u.professionalRole || u.roles?.[0] || null,
                initials: u.initials,
              }))}
              value={form.outgoingStaffId}
              onValueChange={(v) => setForm({ ...form, outgoingStaffId: v })}
              placeholder="Select outgoing staff"
              searchPlaceholder="Search by name or role..."
              emptyText="No staff found"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Incoming Staff</Label>
            <SearchableSelect
              options={users.map((u: any) => ({
                value: u.id,
                label: u.name || `${u.firstName} ${u.lastName}`,
                description: `@${u.username}`,
                secondary: u.professionalRole || u.roles?.[0] || null,
                initials: u.initials,
              }))}
              value={form.incomingStaffId}
              onValueChange={(v) => setForm({ ...form, incomingStaffId: v })}
              placeholder="Select incoming staff"
              searchPlaceholder="Search by name or role..."
              emptyText="No staff found"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Patients to Flag (optional)</Label>
            <Input
              value={patientQuery}
              onChange={(e) => searchPatients(e.target.value)}
              placeholder="Search patient by name or number to flag for follow-up..."
            />
            {patientResults.length > 0 && (
              <div className="border rounded mt-1 max-h-40 overflow-y-auto">
                {patientResults.slice(0, 8).map((p: any) => {
                  const already = flaggedPatients.some((f) => f.id === p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        if (!already) {
                          setFlaggedPatients([...flaggedPatients, p]);
                        }
                        setPatientQuery("");
                        setPatientResults([]);
                      }}
                      disabled={already}
                      className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0 disabled:opacity-50"
                    >
                      {already ? "✓ " : ""}{p.firstName} {p.lastName} — {p.patientNumber}
                    </button>
                  );
                })}
              </div>
            )}
            {flaggedPatients.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {flaggedPatients.map((p) => (
                  <Badge key={p.id} variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    {p.firstName} {p.lastName}
                    <button
                      type="button"
                      onClick={() => setFlaggedPatients(flaggedPatients.filter((f) => f.id !== p.id))}
                      className="ml-1 hover:text-rose-600"
                    >×</button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Handover Notes</FieldLabel>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={5}
              placeholder="Summary of ward/patient status, ongoing concerns, noteworthy events during shift..."
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Pending Tasks / Follow-ups</Label>
            <Textarea
              value={form.pendingTasks}
              onChange={(e) => setForm({ ...form, pendingTasks: e.target.value })}
              rows={3}
              placeholder="Tasks to be carried over to the next shift..."
            />
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.notes}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {mutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
            Save Handover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HandoverDetail({ handover, onClose }: { handover: any; onClose: () => void }) {
  // Parse patientsToFlag JSON
  let flaggedPatientIds: string[] = [];
  try {
    const arr = handover.patientsToFlag ? JSON.parse(handover.patientsToFlag) : [];
    flaggedPatientIds = Array.isArray(arr) ? arr : [];
  } catch {
    flaggedPatientIds = [];
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-emerald-600" />
            Shift Handover Details
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {handover.facility?.name} • {formatDate(handover.handoverDate, true)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`capitalize ${SHIFT_BADGE[handover.shiftType] || ""}`}>
              {handover.shiftType} shift
            </Badge>
            {handover.department && (
              <Badge variant="outline" className="text-emerald-700 border-emerald-200">{handover.department.name}</Badge>
            )}
            <StatusBadge status={handover.status} />
          </div>

          <DetailBlock label="Handover Notes" value={handover.notes} />
          {handover.pendingTasks && <DetailBlock label="Pending Tasks" value={handover.pendingTasks} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <DetailRow label="Outgoing Staff" value={handover.outgoingStaff ? `${handover.outgoingStaff.firstName} ${handover.outgoingStaff.lastName} (@${handover.outgoingStaff.username})` : "—"} />
            <DetailRow label="Incoming Staff" value={handover.incomingStaff ? `${handover.incomingStaff.firstName} ${handover.incomingStaff.lastName} (@${handover.incomingStaff.username})` : "—"} />
            <DetailRow label="Created" value={formatDate(handover.createdAt, true)} />
            <DetailRow label="Flagged Patients" value={`${flaggedPatientIds.length} patient(s)`} />
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-md p-3 border border-slate-100">
      <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-slate-900 whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <div className="text-sm text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

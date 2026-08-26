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
import { CheckSquare, Search, Plus, Play, Check, X, RefreshCcw, User } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, safeJson, ClearableSearch} from "@/components/ui-helpers"

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

const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function TasksView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (priorityFilter !== "all") params.set("priority", priorityFilter);
  if (assignedToMe) params.set("assignedToMe", "true");
  if (search) params.set("q", search);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tasks", activeFacilityId, statusFilter, priorityFilter, assignedToMe, search],
    queryFn: () => fetchJson(`/api/tasks${qs}`),
  });

  const items = (data?.items || []).filter((t: any) =>
    !search || t.title?.toLowerCase().includes(search.toLowerCase()) || t.description?.toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const statusMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "start" | "complete" | "cancel" }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: (_d, vars) => {
      toast.success(`Task ${vars.action === "start" ? "started" : vars.action === "complete" ? "completed" : "cancelled"}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Tasks</h2>
          <p className="text-sm text-slate-500">Track assignments and follow-ups across teams</p>
        </div>
        {can("task.assign") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New Task
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search tasks by title or description" className="pl-0" />
          </div>
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter || undefined} onValueChange={setPriorityFilter}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={assignedToMe ? "default" : "outline"}
            onClick={() => setAssignedToMe(!assignedToMe)}
            className={`gap-2 ${assignedToMe ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
          >
            <User className="w-4 h-4" /> Assigned to Me
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load tasks" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6">
          <EmptyState
            title="No tasks found"
            description="Create your first task to begin tracking assignments."
            action={can("task.assign") && <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Task</Button>}
          />
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Title</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Assigned To</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Priority</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Due Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    {(can("task.complete") || can("task.assign")) && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((t: any) => {
                    const isAssignedToMe = t.assignedToId === user?.id;
                    const overdue = t.dueAt && new Date(t.dueAt) < new Date() && t.status !== "completed";
                    return (
                      <tr key={t.id} className={`border-b hover:bg-slate-50 ${overdue ? "bg-rose-50" : ""}`}>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{t.title}</div>
                          {t.description && <div className="text-xs text-slate-500 truncate max-w-xs">{t.description}</div>}
                          {t.patient && <div className="text-xs text-emerald-700 mt-0.5">Patient: {t.patient.firstName} {t.patient.lastName}</div>}
                        </td>
                        <td className="p-3">
                          {t.assignedTo ? (
                            <div>
                              <div className="text-slate-900">{t.assignedTo.firstName} {t.assignedTo.lastName}</div>
                              <div className="text-xs text-slate-500">@{t.assignedTo.username}</div>
                            </div>
                          ) : <span className="text-slate-400">Unassigned</span>}
                        </td>
                        <td className="p-3"><StatusBadge status={t.priority} /></td>
                        <td className="p-3">
                          {t.dueAt ? (
                            <div className={overdue ? "text-rose-600 font-medium" : "text-slate-700"}>
                              {formatDate(t.dueAt)}
                            </div>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="p-3"><StatusBadge status={t.status} /></td>
                        <td className="p-3 text-right">
                          {(can("task.complete") || isAssignedToMe) && (
                            <div className="flex items-center justify-end gap-1">
                              {t.status === "pending" && (
                                <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: t.id, action: "start" })} className="h-8 px-2 text-amber-600 hover:bg-amber-50">
                                  <Play className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {(t.status === "pending" || t.status === "in_progress") && (
                                <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: t.id, action: "complete" })} className="h-8 px-2 text-emerald-600 hover:bg-emerald-50">
                                  <Check className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {can("task.assign") && t.status !== "completed" && t.status !== "cancelled" && (
                                <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: t.id, action: "cancel" })} className="h-8 px-2 text-rose-600 hover:bg-rose-50">
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          )}
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

      {showNew && <NewTaskDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "routine",
    assignedToId: "",
    dueAt: "",
    patientId: "",
    encounterId: "",
  });

  const { data: usersData } = useQuery({
    queryKey: ["users-assignable"],
    queryFn: () => fetchJson("/api/users/assignable"),
  });
  const users = usersData?.items || [];

  const [patientSearch, setPatientSearch] = useState("");
  const [searchedPatients, setSearchedPatients] = useState<any[]>([]);
  const searchPatients = async (q: string) => {
    setPatientSearch(q);
    if (q.length < 2) {
      setSearchedPatients([]);
      return;
    }
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}`);
      const d = await safeJson(res);
      setSearchedPatients(d.items || d.patients || []);
    } catch {
      setSearchedPatients([]);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          facilityId: activeFacilityId || undefined,
          assignedToId: form.assignedToId || undefined,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
          patientId: form.patientId || undefined,
          encounterId: form.encounterId || undefined,
        }),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Task created");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>Assign a follow-up task to a team member.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Title</FieldLabel>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Contact patient about lab results" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Add details about the task..." />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={form.priority || undefined} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Due Date</Label>
            <Input type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Assign To</Label>
            <SearchableSelect
              options={users.map((u: any) => ({
                value: u.id,
                label: u.name || `${u.firstName} ${u.lastName}`,
                description: `@${u.username}`,
                secondary: u.professionalRole || u.roles?.[0] || null,
                initials: u.initials,
              }))}
              value={form.assignedToId}
              onValueChange={(v) => setForm({ ...form, assignedToId: v })}
              placeholder="Select user (search by name or role)"
              searchPlaceholder="Search by name, username, or role..."
              emptyText="No users found"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Patient (optional)</Label>
            <SearchableSelect
              options={searchedPatients.map((p: any) => ({
                value: p.id,
                label: `${p.firstName} ${p.lastName}`,
                description: p.phone || undefined,
                secondary: p.patientNumber,
                initials: `${p.firstName?.[0] || ""}${p.lastName?.[0] || ""}`.toUpperCase(),
              }))}
              value={form.patientId}
              onValueChange={(v) => {
                setForm({ ...form, patientId: v });
                const p = searchedPatients.find((p: any) => p.id === v);
                setPatientSearch(p ? `${p.firstName} ${p.lastName} (${p.patientNumber})` : "");
              }}
              onSearch={(q) => searchPatients(q)}
              placeholder="Search patient by name or number..."
              searchPlaceholder="Type to search patients..."
              emptyText={patientSearch.length < 2 ? "Type at least 2 characters to search" : "No patients found"}
            />
            {form.patientId && (
              <Button size="sm" variant="ghost" onClick={() => { setForm({ ...form, patientId: "" }); setPatientSearch(""); }} className="h-7 mt-1 text-xs">
                Clear patient
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.title}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {mutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
            Create Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

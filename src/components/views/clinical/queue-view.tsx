"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, UserCheck, Play, Check, X, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, calculateAge, safeJson} from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function QueueView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["queue", activeFacilityId],
    queryFn: () => fetchJson(`/api/queue?facilityId=${activeFacilityId}`),
    enabled: !!activeFacilityId,
    refetchInterval: 15000,
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: (_d, vars) => {
      toast.success(`Patient ${vars.status.replace(/_/g, " ")}`);
      qc.invalidateQueries({ queryKey: ["queue"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!activeFacilityId) {
    return (
      <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50 border-amber-200">
        Please select an active facility to manage the queue.
      </CardContent></Card>
    );
  }

  const queues: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Queue Management</h2>
          <p className="text-sm text-slate-500">Today&apos;s patient queue per department. Live updating every 15 seconds.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> Add Patient to Queue
        </Button>
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load queue" onRetry={() => refetch()} />
      ) : queues.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="No active queues" description="Add a patient to create today's queue." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {queues.map((q: any) => (
            <Card key={q.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ListOrdered className="w-4 h-4 text-emerald-600" />
                    {q.department?.name || "General"} Queue
                  </CardTitle>
                  <StatusBadge status={q.status} />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {(q.entries || []).length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 text-center">Queue is empty.</div>
                ) : (
                  <div className="divide-y max-h-96 overflow-y-auto">
                    {q.entries.map((entry: any) => (
                      <div key={entry.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                            entry.priority === "emergency" ? "bg-rose-100 text-rose-700" :
                            entry.priority === "urgent" ? "bg-amber-100 text-amber-700" :
                            "bg-emerald-100 text-emerald-700"
                          }`}>
                            {entry.queueNumber}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">
                              {entry.patient?.firstName} {entry.patient?.lastName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {entry.patient?.patientNumber} • {calculateAge(entry.patient?.dateOfBirth)}y
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <StatusBadge status={entry.status} />
                          {entry.status === "waiting" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateEntry.mutate({ id: entry.id, status: "called" })}
                              className="gap-1 h-7 px-2 text-xs"
                            >
                              <UserCheck className="w-3 h-3" /> Call
                            </Button>
                          )}
                          {entry.status === "called" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateEntry.mutate({ id: entry.id, status: "in_progress" })}
                              className="gap-1 h-7 px-2 text-xs"
                            >
                              <Play className="w-3 h-3" /> Start
                            </Button>
                          )}
                          {entry.status === "in_progress" && (
                            <Button
                              size="sm"
                              onClick={() => updateEntry.mutate({ id: entry.id, status: "completed" })}
                              className="gap-1 h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                            >
                              <Check className="w-3 h-3" /> Done
                            </Button>
                          )}
                          {(entry.status === "waiting" || entry.status === "called") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateEntry.mutate({ id: entry.id, status: "cancelled" })}
                              className="h-7 w-7 text-rose-500 p-0"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="p-3 border-t bg-slate-50 flex items-center justify-between text-xs text-slate-600">
                  <span>Total: {q.entries?.length || 0}</span>
                  <span>
                    Waiting: {q.entries?.filter((e: any) => e.status === "waiting").length || 0} •
                    In progress: {q.entries?.filter((e: any) => e.status === "in_progress").length || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddToQueueDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        facilityId={activeFacilityId}
        queues={queues}
        onAdded={() => {
          setShowAdd(false);
          qc.invalidateQueries({ queryKey: ["queue"] });
        }}
      />
    </div>
  );
}

function AddToQueueDialog({ open, onClose, facilityId, queues, onAdded }: { open: boolean; onClose: () => void; facilityId: string | null; queues: any[]; onAdded: () => void }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [queueId, setQueueId] = useState("");
  const [priority, setPriority] = useState("routine");
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  const submit = async () => {
    if (!patientId) {
      toast.error("Please select a patient");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueId: queueId || undefined,
          patientId,
          priority,
          facilityId: facilityId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Patient added to queue");
      setPatientQuery(""); setPatientId(""); setQueueId(""); setPriority("routine");
      onAdded();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Patient to Queue</DialogTitle>
          <DialogDescription>Add a patient to today&apos;s queue.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <Input placeholder="Search patient..." value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => { setPatientId(p.id); setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); }} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label>Queue (department)</Label>
            <Select value={queueId || "new"} onValueChange={(v) => setQueueId(v === "new" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">+ Create new queue</SelectItem>
                {queues.map((q: any) => (
                  <SelectItem key={q.id} value={q.id}>{q.department?.name || "General"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priority || undefined} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Adding..." : "Add to Queue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardCheck, Plus, RefreshCcw, Eye, Stethoscope, Calendar, AlertCircle, Users } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative, calculateAge, safeJson} from "@/components/ui-helpers";

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

export function WardRoundsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [wardFilter, setWardFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);

  // Load wards for filter dropdown
  const { data: wardsData } = useQuery({
    queryKey: ["ward-rounds-wards", activeFacilityId],
    queryFn: () => fetchJson(`/api/wards?facilityId=${activeFacilityId || ""}`),
    enabled: !!activeFacilityId,
  });
  const wards = wardsData?.items || [];

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (wardFilter !== "all") params.set("wardId", wardFilter);
  if (dateFilter) params.set("date", dateFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ward-rounds", activeFacilityId, wardFilter, dateFilter],
    queryFn: () => fetchJson(`/api/ward-rounds${qs}`),
    enabled: !!activeFacilityId,
  });

  const items = data?.items || [];

  // Group by date
  const grouped = items.reduce((acc: Record<string, any[]>, r: any) => {
    const d = new Date(r.roundDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});
  const dateKeys = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-emerald-600" />
            Ward Round Notes
          </h2>
          <p className="text-sm text-slate-500">
            Daily ward round documentation with attending consultant and patient list
          </p>
        </div>
        {can("admission.view") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New Ward Round
          </Button>
        )}
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view ward rounds.</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <Select value={wardFilter || undefined} onValueChange={setWardFilter}>
            <SelectTrigger className="md:w-56"><SelectValue placeholder="All Wards" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Wards</SelectItem>
              {wards.map((w: any) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="md:w-48"
            />
            {dateFilter && (
              <Button size="sm" variant="ghost" onClick={() => setDateFilter("")} className="text-xs">Clear</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load ward rounds" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6">
          <EmptyState
            title="No ward round records"
            description="Document daily ward rounds with attending consultant, patients seen, and plan changes."
            icon={AlertCircle}
            action={can("admission.view") && (
              <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4" /> New Ward Round
              </Button>
            )}
          />
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {dateKeys.map((dateKey) => (
            <div key={dateKey}>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                <Calendar className="w-3 h-3" /> {formatDate(dateKey)} <span className="text-slate-400">({grouped[dateKey].length} round{grouped[dateKey].length > 1 ? "s" : ""})</span>
              </div>
              <div className="space-y-2">
                {grouped[dateKey].map((r: any) => (
                  <Card key={r.id} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setViewing(r)}>
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            {r.ward && <Badge variant="outline" className="text-emerald-700 border-emerald-200">{r.ward.name}</Badge>}
                            <Badge variant="outline" className="text-teal-700 border-teal-200">
                              <Users className="w-3 h-3 mr-1" />{r.patientsSeenIds?.length || 0} patient(s)
                            </Badge>
                            <span className="text-xs text-slate-500">{formatDate(r.roundDate, true)}</span>
                          </div>
                          {r.notes && <p className="text-sm text-slate-700 line-clamp-2">{r.notes}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Stethoscope className="w-3 h-3" /> Consultant: {r.consultant ? `${r.consultant.firstName} ${r.consultant.lastName}` : "—"}
                            </span>
                            {r.planChanges && (
                              <span className="flex items-center gap-1 text-amber-700">
                                <AlertCircle className="w-3 h-3" /> Plan changes
                              </span>
                            )}
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setViewing(r); }} className="h-8 w-8 p-0">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewWardRoundDialog onClose={() => setShowNew(false)} />}
      {viewing && <WardRoundDetail round={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function NewWardRoundDialog({ onClose }: { onClose: () => void }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [form, setForm] = useState({
    facilityId: activeFacilityId || "",
    wardId: "",
    consultantId: "",
    roundDate: "",
    notes: "",
    planChanges: "",
  });
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  // Wards for facility
  const { data: wardsData } = useQuery({
    queryKey: ["ward-round-form-wards", form.facilityId],
    queryFn: () => fetchJson(`/api/wards?facilityId=${form.facilityId}`),
    enabled: !!form.facilityId,
  });
  const wards = wardsData?.items || [];

  // Assignable users (for consultant select)
  const { data: usersData } = useQuery({
    queryKey: ["users-assignable-wardround"],
    queryFn: () => fetchJson("/api/users/assignable"),
  });
  const users = usersData?.items || [];

  // Admitted patients for the selected facility (or ward if chosen)
  const { data: admissionsData, isLoading: loadingAdmissions } = useQuery({
    queryKey: ["ward-round-admissions", form.facilityId],
    queryFn: () => fetchJson(`/api/admissions?facilityId=${form.facilityId}&status=admitted&limit=200`),
    enabled: !!form.facilityId,
  });
  const admissions = (admissionsData?.items || []).filter((a: any) => !form.wardId || a.bedAssignments?.some((ba: any) => ba.wardId === form.wardId));

  const togglePatient = (id: string) => {
    if (selectedPatientIds.includes(id)) {
      setSelectedPatientIds(selectedPatientIds.filter((p) => p !== id));
    } else {
      setSelectedPatientIds([...selectedPatientIds, id]);
    }
  };

  const filteredAdmissions = admissions.filter((a: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.patient?.firstName?.toLowerCase().includes(q) ||
      a.patient?.lastName?.toLowerCase().includes(q) ||
      a.patient?.patientNumber?.toLowerCase().includes(q) ||
      a.admissionNumber?.toLowerCase().includes(q)
    );
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ward-rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId: form.facilityId,
          wardId: form.wardId || undefined,
          consultantId: form.consultantId || undefined,
          roundDate: form.roundDate ? new Date(form.roundDate).toISOString() : undefined,
          patientsSeen: selectedPatientIds,
          notes: form.notes || undefined,
          planChanges: form.planChanges || undefined,
        }),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Ward round recorded");
      qc.invalidateQueries({ queryKey: ["ward-rounds"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-600" /> New Ward Round
          </DialogTitle>
          <DialogDescription>
            Document today&apos;s ward round with attending consultant and patients seen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Facility</FieldLabel>
            <Input value={form.facilityId} disabled placeholder="Active facility" />
          </div>
          <div className="space-y-1.5">
            <Label>Ward</Label>
            <Select value={form.wardId || undefined} onValueChange={(v) => setForm({ ...form, wardId: v === "_none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="All wards / General round" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— All wards / General round —</SelectItem>
                {wards.map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Attending Consultant</Label>
            <SearchableSelect
              options={users.map((u: any) => ({
                value: u.id,
                label: u.name || `${u.firstName} ${u.lastName}`,
                description: `@${u.username}`,
                secondary: u.professionalRole || u.roles?.[0] || null,
                initials: u.initials,
              }))}
              value={form.consultantId}
              onValueChange={(v) => setForm({ ...form, consultantId: v })}
              placeholder="Select consultant"
              searchPlaceholder="Search by name or role..."
              emptyText="No staff found"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Round Date / Time</Label>
            <Input
              type="datetime-local"
              value={form.roundDate}
              onChange={(e) => setForm({ ...form, roundDate: e.target.value })}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Patients Seen</FieldLabel>
            <div className="border rounded-md">
              <div className="p-2 border-b bg-slate-50">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search admitted patients by name, number, or admission..."
                  className="h-9"
                />
                <div className="text-xs text-slate-500 mt-1">
                  {selectedPatientIds.length} patient(s) selected • {filteredAdmissions.length} admitted patient(s) available
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {loadingAdmissions ? (
                  <div className="p-4 text-center text-sm text-slate-500">Loading admitted patients...</div>
                ) : filteredAdmissions.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">No admitted patients found.</div>
                ) : (
                  filteredAdmissions.map((a: any) => {
                    const checked = selectedPatientIds.includes(a.id);
                    const bed = a.bedAssignments?.[0];
                    return (
                      <label
                        key={a.id}
                        className="flex items-center gap-3 p-2 hover:bg-emerald-50 cursor-pointer border-b last:border-0"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => togglePatient(a.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900">
                            {a.patient?.firstName} {a.patient?.lastName}
                            <span className="ml-2 text-xs text-slate-500">{a.patient?.patientNumber}</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            {a.admissionNumber} • {a.patient?.sex || "—"}, {calculateAge(a.patient?.dateOfBirth)}y
                            {bed && ` • ${bed.ward?.name} / Bed ${bed.bed?.bedNumber}`}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Round Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              placeholder="General observations from the round, patient-by-patient updates..."
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Plan Changes</Label>
            <Textarea
              value={form.planChanges}
              onChange={(e) => setForm({ ...form, planChanges: e.target.value })}
              rows={3}
              placeholder="Treatment plan changes, medication adjustments, new orders..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || selectedPatientIds.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {mutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
            Save Ward Round
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WardRoundDetail({ round, onClose }: { round: any; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-600" />
            Ward Round Details
          </DialogTitle>
          <DialogDescription>
            {round.facility?.name} • {formatDate(round.roundDate, true)} ({formatRelative(round.roundDate)})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {round.ward && <Badge variant="outline" className="text-emerald-700 border-emerald-200">{round.ward.name}</Badge>}
            <Badge variant="outline" className="text-teal-700 border-teal-200">
              <Users className="w-3 h-3 mr-1" />{round.patients?.length || 0} patient(s)
            </Badge>
            <StatusBadge status={round.status || "completed"} />
          </div>

          {round.notes && <DetailBlock label="Round Notes" value={round.notes} />}
          {round.planChanges && <DetailBlock label="Plan Changes" value={round.planChanges} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <DetailRow label="Consultant" value={round.consultant ? `${round.consultant.firstName} ${round.consultant.lastName} (@${round.consultant.username})` : "—"} />
            <DetailRow label="Recorded By" value={round.createdBy ? `${round.createdBy.firstName} ${round.createdBy.lastName} (@${round.createdBy.username})` : "—"} />
          </div>

          {round.patients && round.patients.length > 0 && (
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Patients Seen</Label>
              <div className="border rounded-md mt-1 divide-y">
                {round.patients.map((p: any) => (
                  <div key={p.id} className="p-2 text-sm">
                    <div className="font-medium text-slate-900">
                      {p.firstName} {p.lastName}
                      <span className="ml-2 text-xs text-slate-500">{p.patientNumber}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {p.sex || "—"}, {calculateAge(p.dateOfBirth)}y
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
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

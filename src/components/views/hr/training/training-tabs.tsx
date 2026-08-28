"use client";
// =====================================================================
// TRAINING TABS — Programs, Sessions, Enrollments, Certificates, Requests, Settings
// =====================================================================
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Check, X, Award, CalendarDays, Users, Send, Settings,
  GraduationCap, Building2, UserCheck, Clock, Ban, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchJson, usePermissions, ColoredBadge, PROGRAM_STATUSES, SESSION_STATUSES,
  ENROLLMENT_STATUSES, CERTIFICATE_STATUSES, REQUEST_STATUSES, COMPETENCY_LEVELS,
  TRAINING_CATEGORIES, TRAINING_TYPES, DELIVERY_METHODS,
  formatDate, formatDateTime, formatTime, daysUntil,
} from "./training-helpers";
import { EmptyState, LoadingState, ErrorState, ClearableSearch } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";
import { SeedTrainingDefaultsButton } from "./seed-button";

// =====================================================================
// PROGRAMS TAB
// =====================================================================
export function ProgramsTab() {
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [mandatoryOnly, setMandatoryOnly] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (category !== "all") params.set("category", category);
  if (mandatoryOnly) params.set("mandatory", "true");
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["training-programs", category, mandatoryOnly],
    queryFn: () => fetchJson(`/api/training-programs${qs}`),
  });

  const items = (data?.items || []).filter((p: any) =>
    !search || p.title?.toLowerCase().includes(search.toLowerCase()) || p.code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
          <ClearableSearch value={search} onChange={setSearch} placeholder="Search by title or code" className="pl-8" />
        </div>
        <Select value={category || "all"} onValueChange={setCategory}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {TRAINING_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={mandatoryOnly ? "default" : "outline"} onClick={() => setMandatoryOnly(!mandatoryOnly)} className="gap-2">
          <ShieldCheck className="w-4 h-4" /> Mandatory
        </Button>
        {can(["training.create", "training.manage", "shift.manage"]) && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New Program
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load training programs" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No training programs found" description="Create a new training program or seed defaults." icon={GraduationCap} /></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p: any) => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-slate-900 truncate">{p.title}</h4>
                    <div className="text-xs text-slate-500 mt-1">{p.code} • {p.category || "—"}</div>
                  </div>
                  <ColoredBadge status={p.status} list={PROGRAM_STATUSES} />
                </div>
                <div className="text-sm text-slate-600 mb-2 line-clamp-2">{p.description || "—"}</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {p.isMandatory && <Badge variant="destructive">Mandatory</Badge>}
                  {p.durationHours && <Badge variant="outline">{p.durationHours}h</Badge>}
                  {p.cpdPoints && <Badge variant="outline">{p.cpdPoints} CPD</Badge>}
                  {p.validityMonths && <Badge variant="outline">Valid {p.validityMonths}m</Badge>}
                  {p.assessmentRequired && <Badge variant="outline">Assessment</Badge>}
                </div>
                <div className="flex justify-between items-center mt-3 text-xs text-slate-500">
                  <span>{p._count?.sessions || 0} sessions • {p._count?.enrollments || 0} enrolled • {p._count?.certificates || 0} certs</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {showNew && <NewProgramDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewProgramDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [trainingType, setTrainingType] = useState("internal");
  const [deliveryMethod, setDeliveryMethod] = useState("in_person");
  const [isMandatory, setIsMandatory] = useState(false);
  const [durationHours, setDurationHours] = useState("");
  const [cpdPoints, setCpdPoints] = useState("");
  const [validityMonths, setValidityMonths] = useState("");
  const [renewalMonths, setRenewalMonths] = useState("");
  const [assessmentRequired, setAssessmentRequired] = useState(false);
  const [passingScore, setPassingScore] = useState("");
  const [certificateRequired, setCertificateRequired] = useState(true);
  const [cost, setCost] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/training-programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, code, description, category: category || null, trainingType, deliveryMethod,
          isMandatory, durationHours, cpdPoints, validityMonths, renewalMonths,
          assessmentRequired, passingScore, certificateRequired, cost,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Training program created");
      qc.invalidateQueries({ queryKey: ["training-programs"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Training Program</DialogTitle>
          <DialogDescription>Configure a new training program for your organization.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Title</FieldLabel>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Basic Life Support" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Code</FieldLabel>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g., BLS" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category || "__none__"} onValueChange={(v) => setCategory(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {TRAINING_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Training Type</Label>
            <Select value={trainingType} onValueChange={setTrainingType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRAINING_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Delivery Method</Label>
            <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DELIVERY_METHODS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Duration (hours)</Label>
            <Input type="number" step="0.5" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} placeholder="8" />
          </div>
          <div className="space-y-1.5">
            <Label>CPD Points</Label>
            <Input type="number" step="0.5" value={cpdPoints} onChange={(e) => setCpdPoints(e.target.value)} placeholder="8" />
          </div>
          <div className="space-y-1.5">
            <Label>Validity (months)</Label>
            <Input type="number" value={validityMonths} onChange={(e) => setValidityMonths(e.target.value)} placeholder="24" />
          </div>
          <div className="space-y-1.5">
            <Label>Renewal reminder (months before)</Label>
            <Input type="number" value={renewalMonths} onChange={(e) => setRenewalMonths(e.target.value)} placeholder="3" />
          </div>
          <div className="space-y-1.5">
            <Label>Passing Score (%)</Label>
            <Input type="number" value={passingScore} onChange={(e) => setPassingScore(e.target.value)} placeholder="70" />
          </div>
          <div className="space-y-1.5">
            <Label>Cost</Label>
            <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5 md:col-span-2 flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} /> Mandatory
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={assessmentRequired} onChange={(e) => setAssessmentRequired(e.target.checked)} /> Assessment Required
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={certificateRequired} onChange={(e) => setCertificateRequired(e.target.checked)} /> Certificate Required
            </label>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !title || !code} className="bg-emerald-600 hover:bg-emerald-700">
            Create Program
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// SESSIONS TAB
// =====================================================================
export function SessionsTab() {
  const { can } = usePermissions();
  const [status, setStatus] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["training-sessions", status],
    queryFn: () => fetchJson(`/api/training-sessions${qs}`),
  });

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Select value={status || "all"} onValueChange={setStatus}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {SESSION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {can(["training.manage", "shift.manage"]) && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New Session
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load sessions" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No training sessions" description="Schedule sessions for your training programs." icon={CalendarDays} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Program</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Date & Time</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Venue</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Trainer</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Enrolled</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s: any) => (
                    <tr key={s.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 font-medium">{s.program?.title || "—"}</td>
                      <td className="p-3">
                        <div>{formatDate(s.sessionDate)}</div>
                        <div className="text-xs text-slate-500">{formatTime(s.startTime)} → {formatTime(s.endTime)}</div>
                      </td>
                      <td className="p-3 text-xs">{s.venue || s.facility?.name || "—"}</td>
                      <td className="p-3 text-xs">{s.trainer?.name || "—"}</td>
                      <td className="p-3">{s._count?.enrollments || 0} {s.maxCapacity ? `/ ${s.maxCapacity}` : ""}</td>
                      <td className="p-3"><ColoredBadge status={s.status} list={SESSION_STATUSES} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      {showNew && <NewSessionDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewSessionDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [programId, setProgramId] = useState("");
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [venue, setVenue] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("30");
  const [notes, setNotes] = useState("");

  const { data: programsData } = useQuery({
    queryKey: ["programs-for-session"],
    queryFn: () => fetchJson(`/api/training-programs`),
  });
  const programs = programsData?.items || [];

  const { data: trainersData } = useQuery({
    queryKey: ["trainers-for-session"],
    queryFn: () => fetchJson(`/api/trainers`),
  });
  const trainers = trainersData?.items || [];
  const [trainerId, setTrainerId] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/training-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          sessionDate: `${sessionDate}T00:00:00`,
          startTime: new Date(`${sessionDate}T${startTime}`).toISOString(),
          endTime: new Date(`${sessionDate}T${endTime}`).toISOString(),
          venue: venue || null,
          trainerId: trainerId || null,
          maxCapacity: parseInt(maxCapacity, 10) || null,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Session created");
      qc.invalidateQueries({ queryKey: ["training-sessions"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule Training Session</DialogTitle>
          <DialogDescription>Create a new session for a training program.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Program</FieldLabel>
            <Select value={programId || undefined} onValueChange={setProgramId}>
              <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
              <SelectContent>
                {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.title} ({p.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Session Date</FieldLabel>
            <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Trainer</Label>
            <Select value={trainerId || "__none__"} onValueChange={(v) => setTrainerId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select trainer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {trainers.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
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
            <Label>Venue</Label>
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g., Conference Room A" />
          </div>
          <div className="space-y-1.5">
            <Label>Max Capacity</Label>
            <Input type="number" value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} placeholder="30" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !programId} className="bg-emerald-600 hover:bg-emerald-700">
            Create Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// ENROLLMENTS TAB
// =====================================================================
export function EnrollmentsTab() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["training-enrollments", status],
    queryFn: () => fetchJson(`/api/training-enrollments${qs}`),
  });
  const items = data?.items || [];

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/training-enrollments/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Enrollment approved");
      qc.invalidateQueries({ queryKey: ["training-enrollments"] });
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
            {ENROLLMENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {can(["training.enroll", "shift.manage"]) && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Enroll Staff
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load enrollments" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No enrollments" description="Enroll staff in training programs." icon={Users} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Program / Session</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Enrolled</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    {can(["training.approve", "shift.manage"]) && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((e: any) => (
                    <tr key={e.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium">{e.staff?.firstName} {e.staff?.lastName}</div>
                        <div className="text-xs text-slate-500">{e.staff?.staffNumber}</div>
                      </td>
                      <td className="p-3">
                        <div>{e.program?.title || "—"}</div>
                        {e.session && <div className="text-xs text-slate-500">{formatDate(e.session.sessionDate)} • {formatTime(e.session.startTime)}</div>}
                      </td>
                      <td className="p-3 text-xs">{formatDate(e.enrollmentDate)}</td>
                      <td className="p-3"><ColoredBadge status={e.status} list={ENROLLMENT_STATUSES} /></td>
                      {can(["training.approve", "shift.manage"]) && e.status === "pending" && (
                        <td className="p-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => approveMutation.mutate(e.id)} className="text-emerald-600">
                            <Check className="w-3.5 h-3.5" /> Approve
                          </Button>
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
      {showNew && <NewEnrollmentDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewEnrollmentDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [programId, setProgramId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");

  const { data: staffData } = useQuery({ queryKey: ["staff-for-enroll"], queryFn: () => fetchJson(`/api/staff`) });
  const { data: programsData } = useQuery({ queryKey: ["programs-for-enroll"], queryFn: () => fetchJson(`/api/training-programs`) });
  const { data: sessionsData } = useQuery({
    queryKey: ["sessions-for-enroll", programId],
    queryFn: () => fetchJson(`/api/training-sessions?status=scheduled`),
    enabled: !!programId,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/training-enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, programId: programId || null, sessionId: sessionId || null, priority, notes, enrollmentSource: "hr" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Staff enrolled");
      qc.invalidateQueries({ queryKey: ["training-enrollments"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll Staff in Training</DialogTitle>
          <DialogDescription>Select staff and training program/session.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Staff Member</FieldLabel>
            <Select value={staffId || undefined} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {(staffData?.items || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.staffNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Program</FieldLabel>
            <Select value={programId || undefined} onValueChange={(v) => { setProgramId(v); setSessionId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
              <SelectContent>
                {(programsData?.items || []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {programId && (
            <div className="space-y-1.5">
              <Label>Session (optional)</Label>
              <Select value={sessionId || "__none__"} onValueChange={(v) => setSessionId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {(sessionsData?.items || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{formatDate(s.sessionDate)} {formatTime(s.startTime)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
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
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !staffId || !programId} className="bg-emerald-600 hover:bg-emerald-700">
            Enroll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// CERTIFICATES TAB
// =====================================================================
export function CertificatesTab() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["training-certificates", status],
    queryFn: () => fetchJson(`/api/training-certificates${qs}`),
  });
  const items = data?.items || [];

  const revokeMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/training-certificates/${id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Certificate revoked");
      qc.invalidateQueries({ queryKey: ["training-certificates"] });
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
            {CERTIFICATE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {can(["training_certificate.manage", "training.manage", "shift.manage"]) && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Issue Certificate
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load certificates" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No certificates" description="Issue certificates to staff who complete training." icon={Award} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Certificate #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Title</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Issued</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Expires</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    {can(["training_certificate.manage", "shift.manage"]) && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((c: any) => {
                    const days = daysUntil(c.expiryDate);
                    return (
                      <tr key={c.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 font-mono text-xs">{c.certificateNumber}</td>
                        <td className="p-3">
                          <div className="font-medium">{c.staff?.firstName} {c.staff?.lastName}</div>
                          <div className="text-xs text-slate-500">{c.staff?.staffNumber}</div>
                        </td>
                        <td className="p-3">{c.title}</td>
                        <td className="p-3 text-xs">{formatDate(c.issueDate)}</td>
                        <td className="p-3 text-xs">
                          {formatDate(c.expiryDate)}
                          {days !== null && days >= 0 && days <= 30 && c.status === "valid" && <div className="text-amber-700">in {days}d</div>}
                          {days !== null && days < 0 && <div className="text-rose-700">expired</div>}
                        </td>
                        <td className="p-3"><ColoredBadge status={c.status} list={CERTIFICATE_STATUSES} /></td>
                        {can(["training_certificate.manage", "shift.manage"]) && c.status !== "revoked" && (
                          <td className="p-3 text-right">
                            <Button size="sm" variant="ghost" onClick={() => {
                              const reason = prompt("Reason for revoking certificate (required):");
                              if (reason) revokeMutation.mutate({ id: c.id, reason });
                            }} className="text-rose-600">
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
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
      {showNew && <NewCertificateDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewCertificateDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [programId, setProgramId] = useState("");
  const [title, setTitle] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [issuingOrganization, setIssuingOrganization] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");

  const { data: staffData } = useQuery({ queryKey: ["staff-for-cert"], queryFn: () => fetchJson(`/api/staff`) });
  const { data: programsData } = useQuery({ queryKey: ["programs-for-cert"], queryFn: () => fetchJson(`/api/training-programs`) });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/training-certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, programId: programId || null, title, issueDate, expiryDate: expiryDate || null, issuingOrganization, documentUrl: documentUrl || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Certificate issued: ${data.item.certificateNumber}`);
      qc.invalidateQueries({ queryKey: ["training-certificates"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue Training Certificate</DialogTitle>
          <DialogDescription>A unique certificate number and verification code will be auto-generated.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Staff Member</FieldLabel>
            <Select value={staffId || undefined} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {(staffData?.items || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.staffNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Training Program</Label>
            <Select value={programId || "__none__"} onValueChange={(v) => { setProgramId(v === "__none__" ? "" : v); const p = (programsData?.items || []).find((x: any) => x.id === v); if (p) setTitle(p.title); }}>
              <SelectTrigger><SelectValue placeholder="Select program (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {(programsData?.items || []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Certificate Title</FieldLabel>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Basic Life Support Certification" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Issue Date</FieldLabel>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Expiry Date (auto-calculated if program has validity)</Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Issuing Organization</Label>
            <Input value={issuingOrganization} onChange={(e) => setIssuingOrganization(e.target.value)} placeholder="e.g., Joy Emmanuel Hospital" />
          </div>
          <div className="space-y-1.5">
            <Label>Document URL (optional)</Label>
            <Input value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !staffId || !title} className="bg-emerald-600 hover:bg-emerald-700">
            Issue Certificate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// REQUESTS TAB
// =====================================================================
export function RequestsTab() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["training-requests", status],
    queryFn: () => fetchJson(`/api/training-requests${qs}`),
  });
  const items = data?.items || [];

  const approveMutation = useMutation({
    mutationFn: async ({ id, action, comment }: { id: string; action: "approve" | "reject"; comment?: string }) => {
      const res = await fetch(`/api/training-requests/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Request ${vars.action}d`);
      qc.invalidateQueries({ queryKey: ["training-requests"] });
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
            {REQUEST_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Request
        </Button>
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load requests" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No training requests" description="Submit a training request for your department." icon={Send} /></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ColoredBadge status={r.status} list={REQUEST_STATUSES} />
                      <Badge variant="outline" className="capitalize text-xs">{r.priority}</Badge>
                      <span className="text-sm font-medium">{r.requestedTraining}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {r.facility?.name || "—"} • {r.department?.name || "—"} • {r.numberOfStaff} staff • {formatDateTime(r.createdAt)}
                    </div>
                    {r.reason && <div className="text-sm text-slate-700 mt-1">Reason: {r.reason}</div>}
                    {r.reviewComment && <div className="text-xs text-emerald-700 mt-1">Review: {r.reviewComment}</div>}
                  </div>
                  {can(["training.approve", "shift.manage"]) && r.status === "submitted" && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => approveMutation.mutate({ id: r.id, action: "approve" })} className="text-emerald-600">
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        const comment = prompt("Rejection reason:");
                        if (comment) approveMutation.mutate({ id: r.id, action: "reject", comment });
                      }} className="text-rose-600">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {showNew && <NewRequestDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewRequestDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [requestedTraining, setRequestedTraining] = useState("");
  const [reason, setReason] = useState("");
  const [numberOfStaff, setNumberOfStaff] = useState("1");
  const [priority, setPriority] = useState("normal");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/training-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedTraining, reason, numberOfStaff, priority }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Training request submitted");
      qc.invalidateQueries({ queryKey: ["training-requests"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Training Request</DialogTitle>
          <DialogDescription>Request training for your department.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Training Requested</FieldLabel>
            <Input value={requestedTraining} onChange={(e) => setRequestedTraining(e.target.value)} placeholder="e.g., Advanced Cardiac Life Support" />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Number of Staff</Label>
              <Input type="number" value={numberOfStaff} onChange={(e) => setNumberOfStaff(e.target.value)} />
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
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !requestedTraining} className="bg-emerald-600 hover:bg-emerald-700">
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// PROVIDERS & TRAINERS TAB
// =====================================================================
export function ProvidersTrainersTab() {
  const { can } = usePermissions();
  const [subTab, setSubTab] = useState("providers");
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={subTab === "providers" ? "default" : "outline"} onClick={() => { setSubTab("providers"); setShowNew(false); }}>Providers</Button>
        <Button size="sm" variant={subTab === "trainers" ? "default" : "outline"} onClick={() => { setSubTab("trainers"); setShowNew(false); }}>Trainers</Button>
        {can(["training.manage", "shift.manage"]) && (
          <Button size="sm" onClick={() => setShowNew(true)} className="ml-auto bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-3 h-3 mr-1" /> New {subTab === "providers" ? "Provider" : "Trainer"}
          </Button>
        )}
      </div>
      {subTab === "providers" ? <ProvidersList /> : <TrainersList />}
      {showNew && subTab === "providers" && <NewProviderDialog onClose={() => setShowNew(false)} />}
      {showNew && subTab === "trainers" && <NewTrainerDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function ProvidersList() {
  const { data, isLoading } = useQuery({ queryKey: ["training-providers-list"], queryFn: () => fetchJson(`/api/training-providers`) });
  const items = data?.items || [];
  if (isLoading) return <LoadingState rows={4} />;
  if (items.length === 0) return <Card><CardContent className="p-6"><EmptyState title="No training providers" description="Add external training providers." icon={Building2} /></CardContent></Card>;
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="text-left p-3 font-semibold">Name</th>
              <th className="text-left p-3 font-semibold">Type</th>
              <th className="text-left p-3 font-semibold">Contact</th>
              <th className="text-left p-3 font-semibold">Accreditation</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p: any) => (
              <tr key={p.id} className="border-b hover:bg-slate-50">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-xs capitalize">{p.providerType || "—"}</td>
                <td className="p-3 text-xs">{p.email || p.phone || "—"}</td>
                <td className="p-3 text-xs">{p.accreditation || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function TrainersList() {
  const { data, isLoading } = useQuery({ queryKey: ["trainers-list"], queryFn: () => fetchJson(`/api/trainers`) });
  const items = data?.items || [];
  if (isLoading) return <LoadingState rows={4} />;
  if (items.length === 0) return <Card><CardContent className="p-6"><EmptyState title="No trainers" description="Add internal or external trainers." icon={UserCheck} /></CardContent></Card>;
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="text-left p-3 font-semibold">Name</th>
              <th className="text-left p-3 font-semibold">Type</th>
              <th className="text-left p-3 font-semibold">Profession</th>
              <th className="text-left p-3 font-semibold">Contact</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t: any) => (
              <tr key={t.id} className="border-b hover:bg-slate-50">
                <td className="p-3 font-medium">{t.name}</td>
                <td className="p-3"><Badge variant="outline" className="text-xs">{t.isInternal ? "Internal" : "External"}</Badge></td>
                <td className="p-3 text-xs">{t.profession || "—"}</td>
                <td className="p-3 text-xs">{t.email || t.phone || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function NewProviderDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState("external");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [accreditation, setAccreditation] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/training-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, providerType, contactPerson, email, phone, address, website, accreditation, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => { toast.success("Provider created"); qc.invalidateQueries({ queryKey: ["training-providers"] }); qc.invalidateQueries({ queryKey: ["training-providers-list"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Training Provider</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2"><FieldLabel required>Name</FieldLabel><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Type</Label><Select value={providerType} onValueChange={setProviderType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="internal">Internal</SelectItem><SelectItem value="external">External</SelectItem><SelectItem value="academic">Academic</SelectItem><SelectItem value="government">Government</SelectItem><SelectItem value="vendor">Vendor</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Contact Person</Label><Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Website</Label><Input value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Accreditation</Label><Input value={accreditation} onChange={(e) => setAccreditation(e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name} className="bg-emerald-600 hover:bg-emerald-700">Create Provider</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewTrainerDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [isInternal, setIsInternal] = useState(true);
  const [staffId, setStaffId] = useState("");
  const [profession, setProfession] = useState("");
  const [qualification, setQualification] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organization2, setOrganization2] = useState("");
  const [notes, setNotes] = useState("");

  const { data: staffData } = useQuery({ queryKey: ["staff-for-trainer"], queryFn: () => fetchJson(`/api/staff`) });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/trainers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, isInternal, staffId: staffId || null, profession, qualification, specialty, email, phone, organization2, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => { toast.success("Trainer created"); qc.invalidateQueries({ queryKey: ["trainers"] }); qc.invalidateQueries({ queryKey: ["trainers-list"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Trainer</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2"><FieldLabel required>Name</FieldLabel><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} /> Internal staff trainer</label></div>
          {isInternal && (
            <div className="space-y-1.5 md:col-span-2">
              <Label>Link to Staff</Label>
              <Select value={staffId || "__none__"} onValueChange={(v) => setStaffId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select staff (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {(staffData?.items || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.staffNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label>Profession</Label><Input value={profession} onChange={(e) => setProfession(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Qualification</Label><Input value={qualification} onChange={(e) => setQualification(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Specialty</Label><Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} /></div>
          {!isInternal && <div className="space-y-1.5"><Label>Organization</Label><Input value={organization2} onChange={(e) => setOrganization2(e.target.value)} /></div>}
          <div className="space-y-1.5"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name} className="bg-emerald-600 hover:bg-emerald-700">Create Trainer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// SETTINGS TAB
// =====================================================================
export function SettingsTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Training Configuration</CardTitle></CardHeader>
        <CardContent>
          <SeedTrainingDefaultsButton />
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            <div className="p-2 bg-slate-50 rounded">Training Categories: <span className="font-medium">{TRAINING_CATEGORIES.length} configured</span></div>
            <div className="p-2 bg-slate-50 rounded">Training Types: <span className="font-medium">{TRAINING_TYPES.length} available</span></div>
            <div className="p-2 bg-slate-50 rounded">Delivery Methods: <span className="font-medium">{DELIVERY_METHODS.length} available</span></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Training Requirements</CardTitle></CardHeader>
        <CardContent>
          <TrainingRequirementsList />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Competencies</CardTitle></CardHeader>
        <CardContent>
          <CompetenciesList />
        </CardContent>
      </Card>
    </div>
  );
}

function TrainingRequirementsList() {
  const { data, isLoading } = useQuery({ queryKey: ["training-reqs-settings"], queryFn: () => fetchJson(`/api/training-requirements`) });
  const items = data?.items || [];
  if (isLoading) return <LoadingState rows={3} />;
  if (items.length === 0) return <EmptyState title="No training requirements configured" description="Configure mandatory training rules per role/department." icon={Settings} />;
  return (
    <div className="space-y-1">
      {items.map((r: any) => (
        <div key={r.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
          <div>
            <span className="font-medium">{r.program?.title || "—"}</span>
            <span className="text-slate-500 ml-2">• {r.profession || "Any profession"}</span>
            <span className="text-slate-500 ml-2">• {r.department?.name || "Any dept"}</span>
          </div>
          <div className="flex gap-2">
            {r.isMandatory && <Badge variant="destructive" className="text-xs">Mandatory</Badge>}
            {r.frequencyMonths && <Badge variant="outline" className="text-xs">Every {r.frequencyMonths}m</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompetenciesList() {
  const { data, isLoading } = useQuery({ queryKey: ["competencies-settings"], queryFn: () => fetchJson(`/api/training-competencies`) });
  const items = data?.items || [];
  if (isLoading) return <LoadingState rows={3} />;
  if (items.length === 0) return <EmptyState title="No competencies configured" description="Define competencies to track staff skills." icon={ShieldCheck} />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
      {items.map((c: any) => (
        <div key={c.id} className="p-3 border rounded-lg">
          <div className="font-medium">{c.name}</div>
          <div className="text-xs text-slate-500 mt-1">{c.category} • {c._count?.staffCompetencies || 0} staff assessed</div>
        </div>
      ))}
    </div>
  );
}

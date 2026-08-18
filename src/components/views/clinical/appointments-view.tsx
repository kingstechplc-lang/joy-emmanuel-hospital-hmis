"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Calendar, Clock, Phone, User, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate } from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

const APPOINTMENT_TYPES = [
  { value: "new", label: "New" },
  { value: "follow_up", label: "Follow-up" },
  { value: "walk_in", label: "Walk-in" },
  { value: "telemedicine", label: "Telemedicine" },
  { value: "recurring", label: "Recurring" },
];

export function AppointmentsView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [tab, setTab] = useState("today");
  const [showNew, setShowNew] = useState(false);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (activeFacilityId) params.set("facilityId", activeFacilityId);
    const now = new Date();
    if (tab === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      params.set("from", start.toISOString());
      params.set("to", end.toISOString());
    } else if (tab === "week") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      params.set("from", start.toISOString());
      params.set("to", end.toISOString());
    }
    return `?${params.toString()}`;
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["appointments", activeFacilityId, tab],
    queryFn: () => fetchJson(`/api/appointments${buildQuery()}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Appointments</h2>
          <p className="text-sm text-slate-500">Book and manage patient appointments at this facility.</p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Appointment
        </Button>
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50 border-amber-200">
          Please select an active facility from the top bar to view appointments.
        </CardContent></Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">This Week</TabsTrigger>
          <TabsTrigger value="all">All Upcoming</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load appointments" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No appointments found"
              description="Book a new appointment to get started."
              action={<Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4" /> New Appointment
              </Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {data.items.map((a: any) => (
            <AppointmentCard key={a.id} appt={a} onReschedule={(id) => setRescheduleId(id)} onChanged={() => qc.invalidateQueries({ queryKey: ["appointments"] })} />
          ))}
        </div>
      )}

      <NewAppointmentDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => {
          setShowNew(false);
          qc.invalidateQueries({ queryKey: ["appointments"] });
        }}
        defaultFacilityId={activeFacilityId}
      />

      <RescheduleDialog
        id={rescheduleId}
        onClose={() => setRescheduleId(null)}
        onDone={() => {
          setRescheduleId(null);
          qc.invalidateQueries({ queryKey: ["appointments"] });
        }}
      />
    </div>
  );
}

function AppointmentCard({ appt, onReschedule, onChanged }: { appt: any; onReschedule: (id: string) => void; onChanged: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const update = async (status: string) => {
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/appointments/${appt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success(`Appointment ${status.replace(/_/g, " ")}`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-lg bg-emerald-100 flex flex-col items-center justify-center flex-shrink-0">
            <span className="text-[10px] text-emerald-700 font-semibold uppercase">
              {new Date(appt.scheduledStart).toLocaleDateString("en-GB", { month: "short" })}
            </span>
            <span className="text-base font-bold text-emerald-800">
              {new Date(appt.scheduledStart).getDate()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 truncate">
              {appt.patient?.firstName} {appt.patient?.lastName}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {appt.patient?.patientNumber} • {appt.appointmentNumber}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 mt-1">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(appt.scheduledStart).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
              {appt.patient?.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {appt.patient.phone}</span>}
              {appt.appointmentType && <span className="capitalize">• {appt.appointmentType.replace(/_/g, " ")}</span>}
            </div>
            {appt.reason && <div className="text-xs text-slate-500 mt-1 truncate">{appt.reason}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={appt.status} />
          <div className="relative">
            <Button variant="ghost" size="icon" onClick={() => setMenuOpen(!menuOpen)} className="h-8 w-8">
              <MoreVertical className="w-4 h-4" />
            </Button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 w-44 bg-white border rounded shadow-lg">
                {appt.status !== "confirmed" && (
                  <button onClick={() => update("confirmed")} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">Confirm</button>
                )}
                {appt.status !== "checked_in" && (
                  <button onClick={() => update("checked_in")} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">Check In</button>
                )}
                {appt.status !== "completed" && (
                  <button onClick={() => update("completed")} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">Mark Complete</button>
                )}
                {appt.status !== "no_show" && (
                  <button onClick={() => update("no_show")} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">Mark No-Show</button>
                )}
                <button onClick={() => { setMenuOpen(false); onReschedule(appt.id); }} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">Reschedule</button>
                {appt.status !== "cancelled" && (
                  <button onClick={() => update("cancelled")} className="block w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50">Cancel</button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NewAppointmentDialog({ open, onClose, onCreated, defaultFacilityId }: { open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [facilityId, setFacilityId] = useState(defaultFacilityId || "");
  const [staffId, setStaffId] = useState("");
  const [appointmentType, setAppointmentType] = useState("new");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities-list"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });
  const { data: staffData } = useQuery({
    queryKey: ["staff-list", facilityId],
    queryFn: () => fetchJson(`/api/staff?facilityId=${facilityId}`),
    enabled: !!facilityId,
  });

  const create = async () => {
    if (!patientId || !facilityId || !date || !time) {
      toast.error("Patient, facility, date and time are required");
      return;
    }
    const scheduledStart = new Date(`${date}T${time}`);
    if (scheduledStart < new Date()) {
      toast.error("Appointment must be in the future");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId, facilityId, staffId: staffId || undefined,
          appointmentType, scheduledStart, reason,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Appointment booked");
      onCreated();
      // reset
      setPatientQuery(""); setPatientId(""); setStaffId(""); setDate(""); setTime(""); setReason("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Book New Appointment</DialogTitle>
          <DialogDescription>Schedule a patient appointment.</DialogDescription>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Facility</FieldLabel>
              <Select value={facilityId || undefined} onValueChange={setFacilityId}>
                <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                <SelectContent>
                  {(facilitiesData?.items || facilitiesData?.facilities || []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Doctor / Staff</Label>
              <Select value={staffId || "none"} onValueChange={(v) => setStaffId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Any available —</SelectItem>
                  {(staffData?.items || staffData?.staff || []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel required>Date</FieldLabel>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <FieldLabel required>Time</FieldLabel>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={appointmentType || undefined} onValueChange={setAppointmentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for visit" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Calendar className="w-4 h-4" /> {saving ? "Booking..." : "Book Appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RescheduleDialog({ id, onClose, onDone }: { id: string | null; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!id) return;
    if (!date || !time) {
      toast.error("Date and time are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledStart: new Date(`${date}T${time}`).toISOString() }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Appointment rescheduled");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule Appointment</DialogTitle>
          <DialogDescription>Choose a new date and time.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel required>New Date</FieldLabel>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <FieldLabel required>New Time</FieldLabel>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving..." : "Reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

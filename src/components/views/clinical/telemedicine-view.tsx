"use client";

// =====================================================================
// TELEMEDICINE VIEW — staff-side video consultation management
// =====================================================================
// Doctors see:
//   - Scheduled telemedicine appointments for today
//   - Active rooms (patient waiting / in-progress)
//   - "Start Call" button → creates room, gets join URL
//   - "Admit Patient" → moves patient from waiting room to call
//   - "End Call" → ends the call, shows "Create Consultation" button
//   - "Create Consultation" → opens dialog to record the consultation
//     findings → creates Consultation record + Invoice
// =====================================================================
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Video, Phone, PhoneOff, UserPlus, FileText, Loader2, Clock, Users,
  PlayCircle, CheckCircle2, VideoIcon, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, formatDate, safeJson } from "@/components/ui-helpers";
import { VideoCallEmbed } from "@/components/telemedicine/video-call-embed";

async function fetchJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const json = await safeJson(res);
  if (!res.ok) {
    // Include the server's detail field in the error so we can see
    // the actual Prisma/API error in the toast
    const msg = json.error || `Failed: ${res.status}`;
    const detail = json.detail ? ` (${json.detail})` : "";
    throw new Error(msg + detail);
  }
  return json;
}

export function TelemedicineView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [activeRoom, setActiveRoom] = useState<any | null>(null);
  const [consultDialogRoom, setConsultDialogRoom] = useState<any | null>(null);
  // Draft notes the doctor types DURING the call — pre-filled in the
  // post-call consultation dialog so the doctor doesn't lose their notes
  const [draftNotes, setDraftNotes] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Poll for room status updates so the doctor sees when the patient joins
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["telemedicine-rooms", activeFacilityId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeFacilityId) params.set("facilityId", activeFacilityId);
      return fetchJson(`/api/telemedicine/rooms?${params}`);
    },
    // Poll every 5s when we have an active room (to detect patient joining)
    refetchInterval: activeRoom ? 5000 : false,
  });

  // When polling, update the active room's status if it changed
  const rooms: any[] = data?.items || [];
  useEffect(() => {
    if (activeRoom && rooms.length > 0) {
      const updated = rooms.find((r) => r.id === activeRoom.id);
      if (updated && updated.status !== activeRoom.status) {
        setActiveRoom({ ...activeRoom, status: updated.status });
      }
    }
  }, [rooms]);

  // ── Create room ──────────────────────────────────────────────
  const handleCreateRoom = async (params: { appointmentId?: string; patientId: string; facilityId: string }) => {
    setActionLoading("create");
    try {
      const data = await fetchJson("/api/telemedicine/create-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      toast.success("Video room created");
      qc.invalidateQueries({ queryKey: ["telemedicine-rooms"] });
      // Immediately join as doctor
      await handleDoctorJoin(data.room);
    } catch (e: any) {
      toast.error(e.message || "Failed to create room");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Join as doctor — preserves the FULL room object ─────────
  const handleDoctorJoin = async (room: any) => {
    setActionLoading("join-" + room.id);
    try {
      const joinData = await fetchJson(`/api/telemedicine/rooms/${room.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ as: "doctor" }),
      });
      // Spread the ORIGINAL room (preserves id + patient + appointment)
      // then add the join URL + updated status
      setActiveRoom({
        ...room,
        roomUrl: joinData.roomUrl,
        joinToken: joinData.joinToken,
        status: room.status, // keep current status — will update via polling
      });
      setDraftNotes("");
    } catch (e: any) {
      toast.error(e.message || "Failed to join call");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Admit patient ────────────────────────────────────────────
  const handleAdmit = async (roomId: string) => {
    setActionLoading("admit-" + roomId);
    try {
      await fetchJson(`/api/telemedicine/rooms/${roomId}/admit`, { method: "POST" });
      toast.success("Patient admitted — call started");
      setActiveRoom({ ...activeRoom, status: "in_progress" });
      qc.invalidateQueries({ queryKey: ["telemedicine-rooms"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to admit patient");
    } finally {
      setActionLoading(null);
    }
  };

  // ── End call ─────────────────────────────────────────────────
  const handleEndCall = async (roomId: string) => {
    setActionLoading("end-" + roomId);
    try {
      await fetchJson(`/api/telemedicine/rooms/${roomId}/end`, { method: "POST" });
      toast.success("Call ended");
      // Open the consultation dialog with the draft notes pre-filled
      const endedRoom = rooms.find((r) => r.id === roomId) || activeRoom;
      setConsultDialogRoom({ ...endedRoom, _draftNotes: draftNotes });
      setActiveRoom(null);
      setDraftNotes("");
      qc.invalidateQueries({ queryKey: ["telemedicine-rooms"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to end call");
    } finally {
      setActionLoading(null);
    }
  };

  // If we have an active room with a join URL, show the video embed
  if (activeRoom?.roomUrl) {
    const patientName = activeRoom.patient
      ? `${activeRoom.patient.firstName || ""} ${activeRoom.patient.lastName || ""}`.trim()
      : "—";
    const patientNumber = activeRoom.patient?.patientNumber || "—";

    return (
      <div className="space-y-4 fade-in-up">
        {/* Header with patient info */}
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-5 shadow-lg relative overflow-hidden">
          <Video className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
          <h2 className="text-xl font-bold">Video Consultation</h2>
          <p className="text-sm text-white/80 mt-1">
            Patient: <span className="font-medium text-white">{patientName}</span> ({patientNumber})
          </p>
          {activeRoom.appointment?.appointmentNumber && (
            <p className="text-xs text-white/60 mt-0.5">
              Appointment: {activeRoom.appointment.appointmentNumber}
            </p>
          )}
          <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-xs">
            {activeRoom.status === "patient_waiting" && <><Clock className="w-3 h-3 animate-pulse" /> Patient in waiting room</>}
            {activeRoom.status === "in_progress" && <><Video className="w-3 h-3" /> Call in progress</>}
            {activeRoom.status === "created" && <><Clock className="w-3 h-3" /> Waiting for patient to join</>}
          </div>
        </div>

        {/* Video iframe + consultation notes side by side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Video */}
          <div className="lg:col-span-2 rounded-xl overflow-hidden border border-slate-200 shadow-lg" style={{ height: "60vh" }}>
            <VideoCallEmbed roomUrl={activeRoom.roomUrl} />
          </div>

          {/* Consultation notes during call */}
          <div className="lg:col-span-1 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" style={{ height: "60vh" }}>
            <div className="px-4 py-3 border-b bg-slate-50">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600" /> Consultation Notes
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Notes are pre-filled in the consultation form after the call ends.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <Textarea
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                placeholder="Type consultation notes during the call...&#10;&#10;Chief complaint:&#10;History:&#10;Examination:&#10;Assessment:&#10;Plan:"
                className="w-full h-full text-sm border-0 shadow-none resize-none focus-visible:ring-0"
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-center gap-3 flex-wrap">
          {activeRoom.status === "patient_waiting" && (
            <Button
              onClick={() => handleAdmit(activeRoom.id)}
              disabled={actionLoading === "admit-" + activeRoom.id}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
            >
              {actionLoading === "admit-" + activeRoom.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Admit Patient
            </Button>
          )}
          <Button
            onClick={() => handleEndCall(activeRoom.id)}
            disabled={actionLoading === "end-" + activeRoom.id}
            variant="destructive"
            className="gap-2"
          >
            {actionLoading === "end-" + activeRoom.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4" />}
            End Call
          </Button>
        </div>

        {/* Navigation warning */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            <strong>Warning:</strong> Navigating to another module will end the active video call.
            Please end the call first using the button above before navigating away.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-in-up">
      {/* Page header */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-5 shadow-lg relative overflow-hidden">
        <Video className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
        <h2 className="text-xl font-bold">Telemedicine</h2>
        <p className="text-sm text-white/80 mt-1">Manage virtual consultations with your patients.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Active Calls" value={rooms.filter((r) => r.status === "in_progress").length} icon={<Video className="w-4 h-4" />} color="from-emerald-500 to-teal-600" />
        <StatCard label="Waiting" value={rooms.filter((r) => r.status === "patient_waiting").length} icon={<Clock className="w-4 h-4" />} color="from-amber-500 to-orange-600" />
        <StatCard label="Created" value={rooms.filter((r) => r.status === "created").length} icon={<Users className="w-4 h-4" />} color="from-blue-500 to-cyan-600" />
        <StatCard label="Ended Today" value={rooms.filter((r) => r.status === "ended").length} icon={<CheckCircle2 className="w-4 h-4" />} color="from-slate-500 to-slate-600" />
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load telemedicine rooms" onRetry={() => refetch()} />
      ) : rooms.length === 0 ? (
        <Card><CardContent className="p-8">
          <EmptyState
            title="No telemedicine rooms"
            description="Create a room from an appointment to start a virtual consultation."
            icon={Video}
          />
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <Card key={room.id} className="card-hover-lift">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Video className="w-4 h-4 text-indigo-600" />
                      <p className="font-semibold text-slate-900">
                        {room.patient?.firstName} {room.patient?.lastName}
                      </p>
                      <StatusPill status={room.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      MRN: {room.patient?.patientNumber} • Created {formatDate(room.createdAt, true)}
                    </p>
                    {room.appointment && (
                      <p className="text-xs text-slate-500">
                        Appointment: {room.appointment.appointmentNumber} • {formatDate(room.appointment.scheduledStart, true)}
                      </p>
                    )}
                    {room.clinician && (
                      <p className="text-xs text-slate-500">
                        Clinician: Dr. {room.clinician.firstName} {room.clinician.lastName}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {/* Create Room — for pending appointments (no room yet) */}
                    {room._pending && (
                      <Button
                        size="sm"
                        onClick={() => handleCreateRoom({ appointmentId: room.appointmentId, patientId: room.patientId, facilityId: room.facilityId })}
                        disabled={actionLoading === "create"}
                        className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
                      >
                        {actionLoading === "create" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                        Create Room
                      </Button>
                    )}
                    {/* Join as doctor — only for rooms that exist + are not ended */}
                    {!room._pending && room.status !== "ended" && (
                      <Button
                        size="sm"
                        onClick={() => handleDoctorJoin(room)}
                        disabled={actionLoading === "join-" + room.id}
                        className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
                      >
                        {actionLoading === "join-" + room.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                        Join Call
                      </Button>
                    )}
                    {/* Admit patient (from list view) */}
                    {!room._pending && room.status === "patient_waiting" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAdmit(room.id)}
                        disabled={actionLoading === "admit-" + room.id}
                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Admit
                      </Button>
                    )}
                    {/* End call (from list view) */}
                    {!room._pending && room.status === "in_progress" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEndCall(room.id)}
                        disabled={actionLoading === "end-" + room.id}
                        className="border-rose-300 text-rose-700 hover:bg-rose-50 gap-1.5"
                      >
                        <PhoneOff className="w-3.5 h-3.5" /> End
                      </Button>
                    )}
                    {/* Create consultation */}
                    {!room._pending && room.status === "ended" && !room.consultationId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConsultDialogRoom(room)}
                        className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" /> Consultation
                      </Button>
                    )}
                    {room.consultationId && (
                      <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 justify-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Consulted
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Consultation dialog */}
      {consultDialogRoom && (
        <ConsultationDialog
          room={consultDialogRoom}
          onClose={() => setConsultDialogRoom(null)}
          onSuccess={() => {
            setConsultDialogRoom(null);
            qc.invalidateQueries({ queryKey: ["telemedicine-rooms"] });
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${color} text-white p-3 shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white/80">{label}</span>
        <div className="bg-white/20 rounded p-1">{icon}</div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-blue-100 text-blue-700",
    created: "bg-slate-100 text-slate-600",
    patient_waiting: "bg-amber-100 text-amber-700",
    in_progress: "bg-emerald-100 text-emerald-700",
    ended: "bg-slate-100 text-slate-500",
  };
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  const labels: Record<string, string> = {
    pending: "Appointment",
    created: "Room Ready",
    patient_waiting: "Patient Waiting",
    in_progress: "In Progress",
    ended: "Ended",
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{labels[status] || status}</span>;
}

// =====================================================================
// CONSULTATION DIALOG — record findings after the call
// =====================================================================
function ConsultationDialog({ room, onClose, onSuccess }: { room: any; onClose: () => void; onSuccess: () => void }) {
  const qc = useQueryClient();
  // Pre-fill from draft notes taken during the call
  const draftNotes: string = room?._draftNotes || "";
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [history, setHistory] = useState("");
  const [examination, setExamination] = useState("");
  const [assessment, setAssessment] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [patientInstructions, setPatientInstructions] = useState(draftNotes);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/telemedicine/rooms/${room.id}/convert-to-consultation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chiefComplaint,
          historyPresentingIllness: history,
          examination,
          assessment,
          treatmentPlan,
          patientInstructions,
        }),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        toast.error(json.error || "Failed to create consultation");
      } else {
        toast.success("Consultation created + invoice generated");
        qc.invalidateQueries({ queryKey: ["telemedicine-rooms"] });
        onSuccess();
      }
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden sm:max-w-2xl max-h-[90vh]">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-200" />
            Create Consultation from Video Call
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Patient: {room.patient?.firstName} {room.patient?.lastName} ({room.patient?.patientNumber})
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
          <div>
            <Label className="text-sm font-medium">Chief Complaint</Label>
            <Input value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} placeholder="e.g., Fever and headache for 3 days" className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">History of Presenting Illness</Label>
            <Textarea value={history} onChange={(e) => setHistory(e.target.value)} rows={3} placeholder="Onset, duration, severity, associated symptoms..." className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">Physical Examination</Label>
            <Textarea value={examination} onChange={(e) => setExamination(e.target.value)} rows={3} placeholder="Vitals, system examination findings..." className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">Assessment</Label>
            <Textarea value={assessment} onChange={(e) => setAssessment(e.target.value)} rows={2} placeholder="Working diagnosis, differentials..." className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">Treatment Plan</Label>
            <Textarea value={treatmentPlan} onChange={(e) => setTreatmentPlan(e.target.value)} rows={3} placeholder="Medications, procedures, follow-up..." className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">Patient Instructions</Label>
            <Textarea value={patientInstructions} onChange={(e) => setPatientInstructions(e.target.value)} rows={2} placeholder="Home care advice, warning signs..." className="mt-1" />
          </div>
        </div>

        <DialogFooter className="p-4 pt-3 shrink-0 border-t bg-white">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Create Consultation + Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

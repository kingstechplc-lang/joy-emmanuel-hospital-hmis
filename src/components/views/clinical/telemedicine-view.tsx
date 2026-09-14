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
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  PlayCircle, CheckCircle2, VideoIcon,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, formatDate, safeJson } from "@/components/ui-helpers";
import { VideoCallEmbed } from "@/components/telemedicine/video-call-embed";

async function fetchJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json.error || `Failed: ${res.status}`);
  return json;
}

export function TelemedicineView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [activeRoom, setActiveRoom] = useState<any | null>(null);
  [activeRoom, setActiveRoom] as [any, any];
  const [consultDialogRoom, setConsultDialogRoom] = useState<any | null>(null);

  // Fetch rooms
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["telemedicine-rooms", activeFacilityId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeFacilityId) params.set("facilityId", activeFacilityId);
      return fetchJson(`/api/telemedicine/rooms?${params}`);
    },
  });

  const rooms: any[] = data?.items || [];

  // Create room mutation
  const createRoomMut = useMutation({
    mutationFn: (params: { appointmentId?: string; patientId: string; facilityId: string }) =>
      fetchJson("/api/telemedicine/create-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }),
    onSuccess: (data) => {
      toast.success("Video room created");
      qc.invalidateQueries({ queryKey: ["telemedicine-rooms"] });
      setActiveRoom(data.room);
    },
    onError: (e: any) => toast.error(e.message || "Failed to create room"),
  });

  // Join as doctor
  const joinMut = useMutation({
    mutationFn: ({ roomId, as: role }: { roomId: string; as: string }) =>
      fetchJson(`/api/telemedicine/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ as: role }),
      }),
    onSuccess: (data) => {
      setActiveRoom({ ...activeRoom, roomUrl: data.roomUrl, joinToken: data.joinToken });
    },
  });

  // Admit patient
  const admitMut = useMutation({
    mutationFn: (roomId: string) =>
      fetchJson(`/api/telemedicine/rooms/${roomId}/admit`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Patient admitted — call started");
      qc.invalidateQueries({ queryKey: ["telemedicine-rooms"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to admit patient"),
  });

  // End call
  const endCallMut = useMutation({
    mutationFn: (roomId: string) =>
      fetchJson(`/api/telemedicine/rooms/${roomId}/end`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Call ended");
      setActiveRoom(null);
      qc.invalidateQueries({ queryKey: ["telemedicine-rooms"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to end call"),
  });

  // If we have an active room with a join URL, show the video embed
  if (activeRoom?.roomUrl) {
    return (
      <div className="space-y-4 fade-in-up">
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-5 shadow-lg relative overflow-hidden">
          <Video className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
          <h2 className="text-xl font-bold">Video Consultation</h2>
          <p className="text-sm text-white/80 mt-1">
            Patient: {activeRoom.patient?.firstName} {activeRoom.patient?.lastName} ({activeRoom.patient?.patientNumber})
          </p>
        </div>

        <div className="rounded-xl overflow-hidden border border-slate-200 shadow-lg" style={{ height: "60vh" }}>
          <VideoCallEmbed
            roomUrl={activeRoom.roomUrl}
            onLeave={() => {
              // Mark the participant as left
              if (activeRoom.id) joinMut.mutate({ roomId: activeRoom.id, as: "doctor" });
            }}
          />
        </div>

        <div className="flex justify-center gap-3">
          {activeRoom.status === "patient_waiting" && (
            <Button
              onClick={() => admitMut.mutate(activeRoom.id)}
              disabled={admitMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
            >
              {admitMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Admit Patient
            </Button>
          )}
          <Button
            onClick={() => endCallMut.mutate(activeRoom.id)}
            disabled={endCallMut.isPending}
            variant="destructive"
            className="gap-2"
          >
            {endCallMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4" />}
            End Call
          </Button>
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
                    {/* Join as doctor */}
                    {(room.status === "created" || room.status === "patient_waiting" || room.status === "in_progress") && (
                      <Button
                        size="sm"
                        onClick={() => joinMut.mutate({ roomId: room.id, as: "doctor" })}
                        disabled={joinMut.isPending}
                        className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
                      >
                        {joinMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                        Join Call
                      </Button>
                    )}
                    {/* Admit patient */}
                    {room.status === "patient_waiting" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => admitMut.mutate(room.id)}
                        disabled={admitMut.isPending}
                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Admit
                      </Button>
                    )}
                    {/* End call */}
                    {room.status === "in_progress" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => endCallMut.mutate(room.id)}
                        disabled={endCallMut.isPending}
                        className="border-rose-300 text-rose-700 hover:bg-rose-50 gap-1.5"
                      >
                        <PhoneOff className="w-3.5 h-3.5" /> End
                      </Button>
                    )}
                    {/* Create consultation */}
                    {room.status === "ended" && !room.consultationId && (
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
    created: "bg-slate-100 text-slate-600",
    patient_waiting: "bg-amber-100 text-amber-700",
    in_progress: "bg-emerald-100 text-emerald-700",
    ended: "bg-slate-100 text-slate-500",
  };
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  const labels: Record<string, string> = {
    created: "Created",
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
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [history, setHistory] = useState("");
  const [examination, setExamination] = useState("");
  const [assessment, setAssessment] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [patientInstructions, setPatientInstructions] = useState("");
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

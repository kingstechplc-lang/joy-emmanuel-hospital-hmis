"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, Calendar, Clock, Phone, MoreVertical, LayoutDashboard, List,
  CheckCircle2, XCircle, Clock as ClockIcon, Users, TrendingUp, UserCheck,
  CalendarPlus, Eye, AlertCircle, RefreshCw, X, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative, safeJson, PageHeader, MiniStatCard, ClearableSearch} from "@/components/ui-helpers"
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

const APPOINTMENT_TYPES = [
  { value: "new", label: "New" },
  { value: "follow_up", label: "Follow-up" },
  { value: "walk_in", label: "Walk-in" },
  { value: "telemedicine", label: "Telemedicine" },
  { value: "recurring", label: "Recurring" },
];

const STATUS_ACTIONS = [
  { status: "confirmed", label: "Confirm", icon: CheckCircle2, color: "text-emerald-600" },
  { status: "checked_in", label: "Check In", icon: UserCheck, color: "text-blue-600" },
  { status: "completed", label: "Complete", icon: CheckCircle2, color: "text-teal-600" },
  { status: "no_show", label: "No-Show", icon: XCircle, color: "text-amber-600" },
  { status: "cancelled", label: "Cancel", icon: X, color: "text-rose-600" },
];

export function AppointmentsView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [mainTab, setMainTab] = useState("dashboard");
  const [dateTab, setDateTab] = useState("today");
  const [showNew, setShowNew] = useState(false);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [viewApptId, setViewApptId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (activeFacilityId) params.set("facilityId", activeFacilityId);
    if (statusFilter !== "all") params.set("status", statusFilter);
    const now = new Date();
    if (dateTab === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      params.set("from", start.toISOString());
      params.set("to", end.toISOString());
    } else if (dateTab === "week") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      params.set("from", start.toISOString());
      params.set("to", end.toISOString());
    }
    return `?${params.toString()}`;
  };

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["appointments", activeFacilityId, dateTab, statusFilter],
    queryFn: () => fetchJson(`/api/appointments${buildQuery()}`),
  });

  // Dashboard stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["appointment-stats", activeFacilityId],
    queryFn: () => fetchJson(`/api/appointments/stats?facilityId=${activeFacilityId || ""}`),
    enabled: mainTab === "dashboard",
  });

  // Waiting list
  const { data: waitingData } = useQuery({
    queryKey: ["waiting-list", activeFacilityId],
    queryFn: () => fetchJson(`/api/appointments/waiting-list?facilityId=${activeFacilityId || ""}`),
    enabled: mainTab === "dashboard",
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Appointments & Scheduling"
        description="Centralized appointment engine — booking, scheduling, check-in, queue, and analytics"
        icon={Calendar}
        gradient="from-cyan-500 to-cyan-600"
        actions={
          <Button onClick={() => setShowNew(true)} className="bg-white/20 border border-white/30 text-white hover:bg-white/30">
            <Plus className="w-4 h-4 mr-1" /> New Appointment
          </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50 border-amber-200">
          Please select an active facility from the top bar to view appointments.
        </CardContent></Card>
      )}

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="flex w-full overflow-x-auto gap-1 p-1 bg-slate-100 rounded-lg tabs-scroll">
          <TabsTrigger value="dashboard" className="text-xs whitespace-nowrap flex-1 min-w-[80px] gap-1"><LayoutDashboard className="w-3.5 h-3.5" /> Dashboard</TabsTrigger>
          <TabsTrigger value="list" className="text-xs whitespace-nowrap flex-1 min-w-[80px] gap-1"><List className="w-3.5 h-3.5" /> Appointments</TabsTrigger>
        </TabsList>

        {/* ==================== DASHBOARD TAB ==================== */}
        <TabsContent value="dashboard" className="mt-4 space-y-4">
          {statsLoading ? <LoadingState rows={4} /> : statsData ? (
            <>
              {/* Today's KPIs */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Today&apos;s Appointments</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  <MiniStatCard label="Total Today" value={statsData.today?.total || 0} icon={Calendar} gradient="from-cyan-500 to-cyan-600" />
                  <MiniStatCard label="Scheduled" value={statsData.today?.scheduled || 0} icon={Clock} gradient="from-blue-500 to-blue-600" />
                  <MiniStatCard label="Confirmed" value={statsData.today?.confirmed || 0} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
                  <MiniStatCard label="Checked In" value={statsData.today?.checkedIn || 0} icon={UserCheck} gradient="from-teal-500 to-teal-600" />
                  <MiniStatCard label="Completed" value={statsData.today?.completed || 0} icon={CheckCircle2} gradient="from-green-500 to-green-600" />
                  <MiniStatCard label="Cancelled" value={statsData.today?.cancelled || 0} icon={XCircle} gradient="from-rose-500 to-red-600" />
                  <MiniStatCard label="No-Show" value={statsData.today?.noShow || 0} icon={AlertCircle} gradient="from-amber-500 to-orange-600" />
                </div>
              </div>

              {/* Upcoming + Performance */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="pb-2 bg-gradient-to-r from-cyan-50 to-blue-50 border-b border-cyan-200">
                    <CardTitle className="text-sm font-bold text-cyan-800">Upcoming</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Tomorrow</span>
                      <Badge variant="secondary" className="text-base font-bold">{statsData.upcoming?.tomorrow || 0}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">This Week</span>
                      <Badge variant="secondary" className="text-base font-bold">{statsData.upcoming?.thisWeek || 0}</Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="pb-2 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200">
                    <CardTitle className="text-sm font-bold text-emerald-800">Performance</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Completion Rate</span>
                      <span className="text-lg font-bold text-emerald-700">{statsData.performance?.completionRate || 0}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Cancellation Rate</span>
                      <span className="text-lg font-bold text-rose-600">{statsData.performance?.cancellationRate || 0}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">No-Show Rate</span>
                      <span className="text-lg font-bold text-amber-600">{statsData.performance?.noShowRate || 0}%</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="pb-2 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
                    <CardTitle className="text-sm font-bold text-amber-800">Waiting List</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Patients Waiting</span>
                      <span className="text-lg font-bold text-amber-700">{statsData.waitingList || 0}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setMainTab("list")} className="w-full text-amber-700">
                      View Appointments <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Waiting list preview */}
              {waitingData?.items?.length > 0 && (
                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="pb-2 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
                    <CardTitle className="text-sm font-bold text-amber-800 flex items-center gap-2">
                      <Users className="w-4 h-4" /> Waiting List ({waitingData.items.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                      {waitingData.items.slice(0, 10).map((w: any) => (
                        <div key={w.id} className="flex items-center justify-between p-3 hover:bg-slate-50">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900">{w.patient?.firstName} {w.patient?.lastName}</p>
                            <p className="text-xs text-slate-500">
                              {w.patient?.patientNumber}
                              {w.preferredDate && ` • Pref: ${formatDate(w.preferredDate)}`}
                              {w.preferredTime && ` (${w.preferredTime})`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[9px] capitalize ${w.priority === "urgent" ? "border-rose-300 text-rose-700" : w.priority === "high" ? "border-amber-300 text-amber-700" : ""}`}>
                              {w.priority}
                            </Badge>
                            <StatusBadge status={w.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card><CardContent className="p-6"><EmptyState title="Dashboard unavailable" description="Select a facility to view dashboard." icon={LayoutDashboard} /></CardContent></Card>
          )}
        </TabsContent>

        {/* ==================== APPOINTMENTS LIST TAB ==================== */}
        <TabsContent value="list" className="mt-4 space-y-4">
          {/* Sub-tabs for date range */}
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs value={dateTab} onValueChange={setDateTab}>
              <TabsList>
                <TabsTrigger value="today" className="text-xs">Today</TabsTrigger>
                <TabsTrigger value="week" className="text-xs">This Week</TabsTrigger>
                <TabsTrigger value="all" className="text-xs">All Upcoming</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="checked_in">Checked In</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no_show">No-Show</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={isFetching} onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

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
                <AppointmentCard
                  key={a.id}
                  appt={a}
                  onReschedule={(id) => setRescheduleId(id)}
                  onView={(id) => setViewApptId(id)}
                  onChanged={() => {
                    qc.invalidateQueries({ queryKey: ["appointments"] });
                    qc.invalidateQueries({ queryKey: ["appointment-stats"] });
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NewAppointmentDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => {
          setShowNew(false);
          qc.invalidateQueries({ queryKey: ["appointments"] });
          qc.invalidateQueries({ queryKey: ["appointment-stats"] });
        }}
        defaultFacilityId={activeFacilityId}
      />

      <RescheduleDialog
        id={rescheduleId}
        onClose={() => setRescheduleId(null)}
        onDone={() => {
          setRescheduleId(null);
          qc.invalidateQueries({ queryKey: ["appointments"] });
          qc.invalidateQueries({ queryKey: ["appointment-stats"] });
        }}
      />

      {viewApptId && (
        <AppointmentDetailDialog
          id={viewApptId}
          onClose={() => setViewApptId(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["appointments"] });
            qc.invalidateQueries({ queryKey: ["appointment-stats"] });
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// APPOINTMENT CARD — with view + action menu
// =====================================================================
function AppointmentCard({ appt, onReschedule, onView, onChanged }: {
  appt: any; onReschedule: (id: string) => void; onView: (id: string) => void; onChanged: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const update = async (status: string) => {
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/appointments/${appt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const err = await safeJson(res); throw new Error(err.error || "Failed"); }
      toast.success(`Appointment ${status.replace(/_/g, " ")}`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const availableActions = STATUS_ACTIONS.filter((a) => a.status !== appt.status && a.status !== "cancelled");

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => onView(appt.id)}>
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-100 to-blue-100 flex flex-col items-center justify-center flex-shrink-0">
            <span className="text-[10px] text-cyan-700 font-semibold uppercase">
              {new Date(appt.scheduledStart).toLocaleDateString("en-GB", { month: "short" })}
            </span>
            <span className="text-base font-bold text-cyan-800">
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
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onView(appt.id)} title="View Details">
            <Eye className="w-4 h-4" />
          </Button>
          <StatusBadge status={appt.status} />
          <div className="relative">
            <Button variant="ghost" size="icon" onClick={() => setMenuOpen(!menuOpen)} className="h-8 w-8">
              <MoreVertical className="w-4 h-4" />
            </Button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white border rounded shadow-lg">
                {availableActions.map((a) => (
                  <button key={a.status} onClick={() => update(a.status)} className={`block w-full text-left px-3 py-2 text-xs hover:bg-slate-50 ${a.color}`}>
                    {a.label}
                  </button>
                ))}
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

// =====================================================================
// APPOINTMENT DETAIL DIALOG — with timeline + actions
// =====================================================================
function AppointmentDetailDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["appointment-detail", id],
    queryFn: () => fetchJson(`/api/appointments/${id}`),
  });
  const [showReschedule, setShowReschedule] = useState(false);
  const appt = data?.item;

  const update = async (status: string) => {
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const err = await safeJson(res); throw new Error(err.error || "Failed"); }
      toast.success(`Appointment ${status.replace(/_/g, " ")}`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-cyan-600" />
            Appointment Details
          </DialogTitle>
          {appt && (
            <DialogDescription>
              {appt.appointmentNumber} • {formatDate(appt.scheduledStart, true)}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? <LoadingState rows={4} /> : appt ? (
          <div className="space-y-4">
            {/* Patient + Status */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg">
              <div><Label className="text-slate-500">Patient</Label><div className="font-semibold">{appt.patient?.firstName} {appt.patient?.lastName}</div></div>
              <div><Label className="text-slate-500">MRN</Label><div className="font-mono">{appt.patient?.patientNumber}</div></div>
              <div><Label className="text-slate-500">Facility</Label><div>{appt.facility?.name}</div></div>
              <div><Label className="text-slate-500">Department</Label><div>{appt.department?.name || "—"}</div></div>
              <div><Label className="text-slate-500">Type</Label><div className="capitalize">{(appt.appointmentType || "new").replace(/_/g, " ")}</div></div>
              <div><Label className="text-slate-500">Status</Label><div><StatusBadge status={appt.status} /></div></div>
              <div><Label className="text-slate-500">Scheduled</Label><div>{formatDate(appt.scheduledStart, true)}</div></div>
              {appt.scheduledEnd && <div><Label className="text-slate-500">End</Label><div>{formatDate(appt.scheduledEnd, true)}</div></div>}
              {appt.reason && <div className="col-span-2"><Label className="text-slate-500">Reason</Label><div>{appt.reason}</div></div>}
              {appt.notes && <div className="col-span-2"><Label className="text-slate-500">Notes</Label><div className="italic">{appt.notes}</div></div>}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {appt.status !== "confirmed" && appt.status !== "completed" && appt.status !== "cancelled" && (
                <Button size="sm" variant="outline" onClick={() => update("confirmed")} className="text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirm</Button>
              )}
              {appt.status === "confirmed" && (
                <Button size="sm" variant="outline" onClick={() => update("checked_in")} className="text-blue-600"><UserCheck className="w-3.5 h-3.5 mr-1" /> Check In</Button>
              )}
              {appt.status !== "completed" && appt.status !== "cancelled" && (
                <Button size="sm" variant="outline" onClick={() => update("completed")} className="text-teal-600"><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Complete</Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setShowReschedule(true)}><CalendarPlus className="w-3.5 h-3.5 mr-1" /> Reschedule</Button>
              {appt.status !== "no_show" && appt.status !== "cancelled" && (
                <Button size="sm" variant="outline" onClick={() => update("no_show")} className="text-amber-600"><AlertCircle className="w-3.5 h-3.5 mr-1" /> No-Show</Button>
              )}
              {appt.status !== "cancelled" && (
                <Button size="sm" variant="outline" onClick={() => update("cancelled")} className="text-rose-600"><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
              )}
            </div>

            {/* Timeline */}
            {appt.history?.length > 0 && (
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                  <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-slate-600" /> Appointment Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {appt.history.map((h: any, i: number) => {
                      const colors: Record<string, string> = {
                        created: "bg-cyan-500", confirmed: "bg-emerald-500", checked_in: "bg-blue-500",
                        completed: "bg-teal-500", cancelled: "bg-rose-500", no_show: "bg-amber-500",
                        rescheduled: "bg-purple-500", modified: "bg-slate-400",
                      };
                      return (
                        <div key={h.id || i} className="flex items-start gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${colors[h.action] || "bg-slate-400"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium capitalize text-slate-900">{h.action.replace(/_/g, " ")}</span>
                              <span className="text-[10px] text-slate-400">{formatDate(h.changedAt, true)}</span>
                            </div>
                            {(h.fromStatus || h.toStatus) && (
                              <p className="text-xs text-slate-500">
                                {h.fromStatus && <span className="capitalize">{h.fromStatus.replace(/_/g, " ")}</span>}
                                {h.fromStatus && h.toStatus && " → "}
                                {h.toStatus && <span className="capitalize font-medium">{h.toStatus.replace(/_/g, " ")}</span>}
                              </p>
                            )}
                            {h.fromDateTime && h.toDateTime && (
                              <p className="text-xs text-slate-500">
                                {new Date(h.fromDateTime).toLocaleString()} → {new Date(h.toDateTime).toLocaleString()}
                              </p>
                            )}
                            {h.reason && <p className="text-xs text-slate-600 italic mt-0.5">{h.reason}</p>}
                            {h.changedByName && <p className="text-[10px] text-slate-400 mt-0.5">by {h.changedByName}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <EmptyState title="Appointment not found" />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {showReschedule && appt && (
        <RescheduleDialog
          id={id}
          onClose={() => setShowReschedule(false)}
          onDone={() => { setShowReschedule(false); onChanged(); }}
        />
      )}
    </Dialog>
  );
}

// =====================================================================
// NEW APPOINTMENT DIALOG (enhanced with PatientPicker)
// =====================================================================
function NewAppointmentDialog({ open, onClose, onCreated, defaultFacilityId }: {
  open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId: string | null;
}) {
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
    queryKey: ["patient-search-appt", patientQuery],
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
        const err = await safeJson(res);
        throw new Error(err.error || err.detail || "Failed");
      }
      toast.success("Appointment booked");
      onCreated();
      setPatientQuery(""); setPatientId(""); setStaffId(""); setDate(""); setTime(""); setReason("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarPlus className="w-5 h-5 text-cyan-600" /> Book New Appointment</DialogTitle>
          <DialogDescription>Schedule a patient appointment. The system checks for double-booking automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <ClearableSearch value={patientQuery} onChange={setPatientQuery} placeholder="Search patient by name, MRN, phone..." className="" inputClassName="" />
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => { setPatientId(p.id); setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); }} className="w-full text-left p-2 hover:bg-cyan-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="min-w-0">
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
            <div className="min-w-0">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
          <Button onClick={create} disabled={saving} className="gap-2 bg-cyan-600 hover:bg-cyan-700">
            <Calendar className="w-4 h-4" /> {saving ? "Booking..." : "Book Appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// RESCHEDULE DIALOG
// =====================================================================
function RescheduleDialog({ id, onClose, onDone }: { id: string | null; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
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
        body: JSON.stringify({
          scheduledStart: new Date(`${date}T${time}`).toISOString(),
          reason: reason || undefined,
        }),
      });
      if (!res.ok) { const err = await safeJson(res); throw new Error(err.error || "Failed"); }
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
          <DialogTitle className="flex items-center gap-2"><CalendarPlus className="w-5 h-5 text-cyan-600" /> Reschedule Appointment</DialogTitle>
          <DialogDescription>Choose a new date and time. The original slot will be preserved in history.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel required>New Date</FieldLabel>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <FieldLabel required>New Time</FieldLabel>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Reason for Rescheduling</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Patient request, clinician unavailable" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
            {saving ? "Saving..." : "Reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

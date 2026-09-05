"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Truck, Plus, RefreshCw, Loader2, Activity, Search, X,
  AlertTriangle, CheckCircle2, Clock, MapPin, User, Phone,
  Zap, Wrench, ChevronRight, FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge,
  formatDate, calculateAge, safeJson, PageHeader, MiniStatCard,
  ClearableSearch,
} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const REQUEST_TYPES = [
  "emergency", "inter_facility", "hospital_to_home", "home_to_hospital",
  "referral_transport", "non_emergency", "maternity", "discharge", "other",
];

const PRIORITIES = ["critical", "high", "urgent", "routine", "non_emergency"];

const VEHICLE_TYPES = [
  "basic_life_support", "advanced_life_support", "emergency",
  "patient_transport", "maternity", "other",
];

const TRIP_STATUSES = [
  "requested", "dispatched", "en_route_pickup", "at_pickup",
  "patient_on_board", "en_route_destination", "at_destination",
  "handover", "returning", "completed", "cancelled", "no_show", "failed_pickup",
];

const VEHICLE_STATUSES = [
  "available", "dispatched", "on_trip", "returning", "out_of_service", "maintenance", "unavailable",
];

function priorityColor(priority: string): string {
  return priority === "critical" ? "bg-rose-100 text-rose-700 border-rose-200"
    : priority === "high" ? "bg-orange-100 text-orange-700 border-orange-200"
    : priority === "urgent" ? "bg-amber-100 text-amber-700 border-amber-200"
    : priority === "routine" ? "bg-blue-100 text-blue-700 border-blue-200"
    : "bg-slate-100 text-slate-700 border-slate-200";
}

// =====================================================================
// MAIN VIEW
// =====================================================================
export function AmbulanceView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ambulance Services"
        description="Emergency & non-emergency patient transport — dispatch, fleet, trips, and billing integration."
        icon={Truck}
        gradient="from-red-500 to-orange-600"
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to manage ambulance services.</CardContent></Card>
      )}

      {activeFacilityId && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-1.5"><Activity className="w-4 h-4" /> Dashboard</TabsTrigger>
            <TabsTrigger value="requests" className="gap-1.5"><Zap className="w-4 h-4" /> Requests</TabsTrigger>
            <TabsTrigger value="fleet" className="gap-1.5"><Truck className="w-4 h-4" /> Fleet</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <DashboardTab facilityId={activeFacilityId} />
          </TabsContent>
          <TabsContent value="requests" className="space-y-4">
            <RequestsTab facilityId={activeFacilityId} />
          </TabsContent>
          <TabsContent value="fleet" className="space-y-4">
            <FleetTab facilityId={activeFacilityId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab({ facilityId }: { facilityId: string }) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["ambulance-stats", facilityId],
    queryFn: () => fetchJson(`/api/ambulance/stats?facilityId=${facilityId}`),
    refetchInterval: 15000,
  });

  const kpis = data?.kpis || {};

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Activity className="w-4 h-4 text-red-600" />
          Ambulance KPIs
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
            {isFetching ? (
              <><Loader2 className="w-3 h-3 animate-spin text-red-600" /><span className="text-red-700 font-medium">Refreshing…</span></>
            ) : (
              <><RefreshCw className="w-3 h-3 text-slate-400" /><span>Auto-refresh 15s</span></>
            )}
          </span>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MiniStatCard label="Total Vehicles" value={kpis.totalVehicles ?? 0} icon={Truck} gradient="from-blue-500 to-indigo-600" sublabel="In fleet" />
        <MiniStatCard label="Available" value={kpis.availableVehicles ?? 0} icon={CheckCircle2} gradient="from-emerald-500 to-teal-600" sublabel="Ready to dispatch" />
        <MiniStatCard label="On Trip" value={kpis.onTripVehicles ?? 0} icon={Clock} gradient="from-amber-500 to-orange-600" sublabel="Active transport" />
        <MiniStatCard label="Maintenance" value={kpis.maintenanceVehicles ?? 0} icon={Wrench} gradient="from-slate-400 to-slate-500" sublabel="Under service" />
        <MiniStatCard label="Dispatched" value={kpis.dispatchedVehicles ?? 0} icon={Zap} gradient="from-purple-500 to-pink-600" sublabel="En route" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard label="Pending Requests" value={kpis.pendingRequests ?? 0} icon={AlertTriangle} gradient="from-amber-500 to-red-600" sublabel="Awaiting dispatch" />
        <MiniStatCard label="Emergency" value={kpis.emergencyRequests ?? 0} icon={AlertTriangle} gradient="from-rose-500 to-red-600" sublabel="Critical/High priority" />
        <MiniStatCard label="Completed Today" value={kpis.completedToday ?? 0} icon={CheckCircle2} gradient="from-emerald-500 to-green-600" sublabel="Trips finished" />
        <MiniStatCard label="Cancelled Today" value={kpis.cancelledToday ?? 0} icon={X} gradient="from-slate-400 to-slate-500" sublabel="Trips cancelled" />
      </div>

      {/* Status breakdown */}
      {data?.byStatus && Object.keys(data.byStatus).length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-2">
            <FileText className="w-4 h-4 text-red-600" /> Trips by Status
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.byStatus).map(([status, count]) => (
              <Badge key={status} variant="outline" className="text-xs capitalize">
                {status.replace(/_/g, " ")}: {count as number}
              </Badge>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// =====================================================================
// REQUESTS TAB — list + create + dispatch + trip detail
// =====================================================================
function RequestsTab({ facilityId }: { facilityId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [detailTrip, setDetailTrip] = useState<string | null>(null);

  const params = new URLSearchParams();
  params.set("facilityId", facilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (priorityFilter !== "all") params.set("priority", priorityFilter);
  if (search.trim()) params.set("q", search.trim());
  params.set("limit", "200");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["ambulance-trips", facilityId, statusFilter, priorityFilter, search],
    queryFn: () => fetchJson(`/api/ambulance?${params.toString()}`),
    refetchInterval: 15000,
  });

  const items = data?.items || [];
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ambulance-trips"] });
    qc.invalidateQueries({ queryKey: ["ambulance-stats"] });
    qc.invalidateQueries({ queryKey: ["ambulance-vehicles"] });
  };

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search by trip #, patient, location…" className="flex-1" inputClassName="h-9 text-sm" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[150px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {TRIP_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" className="h-9 gap-1.5 bg-red-600 hover:bg-red-700" onClick={() => setShowNew(true)}>
              <Plus className="w-4 h-4" /> New Request
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No ambulance requests" description="Create a new transport request to get started." icon={Truck} /></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((t: any) => (
            <TripCard key={t.id} trip={t} onClick={() => setDetailTrip(t.id)} />
          ))}
        </div>
      )}

      {showNew && (
        <NewRequestDialog facilityId={facilityId} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} />
      )}

      {detailTrip && (
        <TripDetailDialog tripId={detailTrip} facilityId={facilityId} onClose={() => setDetailTrip(null)} onUpdated={invalidate} />
      )}
    </>
  );
}

// =====================================================================
// TRIP CARD
// =====================================================================
function TripCard({ trip: t, onClick }: { trip: any; onClick: () => void }) {
  return (
    <Card className="cursor-pointer hover:shadow-md hover:border-red-300 transition-all" onClick={onClick}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-red-100 text-red-700 border-red-200 font-mono text-[10px]">{t.tripNumber}</Badge>
              <span className="text-sm font-medium text-slate-800">
                {t.patient ? `${t.patient.firstName} ${t.patient.lastName}` : "Unregistered patient"}
              </span>
              <Badge variant="outline" className={`text-[9px] capitalize ${priorityColor(t.priority)}`}>{t.priority}</Badge>
              <StatusBadge status={t.status} />
              <Badge variant="outline" className="text-[9px] capitalize">{t.requestType.replace(/_/g, " ")}</Badge>
            </div>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {t.pickupLocation}</span>
              <span className="flex items-center gap-1"><ChevronRight className="w-3 h-3" /> {t.destinationLocation}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(t.requestedAt, true)}</span>
              {t.vehicle && <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {t.vehicle.vehicleNumber}</span>}
            </div>
            {t.reasonForTransport && <div className="text-xs text-slate-400 mt-1 line-clamp-1">{t.reasonForTransport}</div>}
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// NEW REQUEST DIALOG
// =====================================================================
function NewRequestDialog({ facilityId, onClose, onCreated }: { facilityId: string; onClose: () => void; onCreated: () => void }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [requestType, setRequestType] = useState("emergency");
  const [priority, setPriority] = useState("urgent");
  const [pickupLocation, setPickupLocation] = useState("");
  const [pickupContactName, setPickupContactName] = useState("");
  const [pickupContactPhone, setPickupContactPhone] = useState("");
  const [destinationLocation, setDestinationLocation] = useState("");
  const [destinationContactName, setDestinationContactName] = useState("");
  const [destinationContactPhone, setDestinationContactPhone] = useState("");
  const [reasonForTransport, setReasonForTransport] = useState("");
  const [patientCondition, setPatientCondition] = useState("stable");
  const [mobilityRequirement, setMobilityRequirement] = useState("ambulatory");
  const [oxygenRequired, setOxygenRequired] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  const submit = async () => {
    if (!pickupLocation || !destinationLocation) {
      toast.error("Pickup location and destination are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ambulance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId, patientId: patientId || undefined,
          requestType, priority,
          pickupLocation, pickupContactName, pickupContactPhone,
          destinationLocation, destinationContactName, destinationContactPhone,
          reasonForTransport, patientCondition, mobilityRequirement,
          oxygenRequired, notes,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Ambulance request created: ${data.item?.tripNumber}`);
      onCreated();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2"><Truck className="w-5 h-5 text-red-600" /> New Ambulance Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Patient search (optional for emergencies) */}
          <div>
            <Label>Patient (optional — leave blank for unregistered emergency)</Label>
            <ClearableSearch value={patientQuery} onChange={setPatientQuery} placeholder="Search patient…" className="" inputClassName="h-8 text-sm" />
            {patientsData?.patients?.length > 0 && (
              <div className="mt-1 max-h-24 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => { setPatientId(p.id); setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); }}
                    className="w-full text-left p-2 hover:bg-red-50 text-sm border-b last:border-0">
                    {p.firstName} {p.lastName} <span className="text-xs text-slate-500">{p.patientNumber} · {calculateAge(p.dateOfBirth)}y</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Request Type</FieldLabel>
              <Select value={requestType} onValueChange={setRequestType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{REQUEST_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>Priority</FieldLabel>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Pickup */}
          <div className="p-2 bg-slate-50 border border-slate-200 rounded-md space-y-2">
            <div className="text-xs font-semibold text-slate-600">Pickup Location</div>
            <FieldLabel required>Location</FieldLabel>
            <Input value={pickupLocation} onChange={(e) => setPickupLocation(e.target.value)} placeholder="Address, facility, or scene" className="h-8 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <Input value={pickupContactName} onChange={(e) => setPickupContactName(e.target.value)} placeholder="Contact name" className="h-8 text-sm" />
              <Input value={pickupContactPhone} onChange={(e) => setPickupContactPhone(e.target.value)} placeholder="Contact phone" className="h-8 text-sm" />
            </div>
          </div>

          {/* Destination */}
          <div className="p-2 bg-slate-50 border border-slate-200 rounded-md space-y-2">
            <div className="text-xs font-semibold text-slate-600">Destination</div>
            <FieldLabel required>Location</FieldLabel>
            <Input value={destinationLocation} onChange={(e) => setDestinationLocation(e.target.value)} placeholder="Address or facility" className="h-8 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <Input value={destinationContactName} onChange={(e) => setDestinationContactName(e.target.value)} placeholder="Receiving contact" className="h-8 text-sm" />
              <Input value={destinationContactPhone} onChange={(e) => setDestinationContactPhone(e.target.value)} placeholder="Receiving phone" className="h-8 text-sm" />
            </div>
          </div>

          {/* Clinical */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Patient Condition</Label>
              <Select value={patientCondition} onValueChange={setPatientCondition}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stable">Stable</SelectItem>
                  <SelectItem value="serious">Serious</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="stable_on_oxygen">Stable on oxygen</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mobility</Label>
              <Select value={mobilityRequirement} onValueChange={setMobilityRequirement}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ambulatory">Ambulatory</SelectItem>
                  <SelectItem value="wheelchair">Wheelchair</SelectItem>
                  <SelectItem value="stretcher">Stretcher</SelectItem>
                  <SelectItem value="bed">Bed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Reason for Transport</Label>
            <Input value={reasonForTransport} onChange={(e) => setReasonForTransport(e.target.value)} placeholder="e.g. Inter-facility transfer for specialist care" className="h-8 text-sm" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={oxygenRequired} onChange={(e) => setOxygenRequired(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm font-medium text-slate-700">Oxygen required during transport</span>
          </label>

          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-red-600 hover:bg-red-700">{saving ? "Creating…" : "Create Request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// TRIP DETAIL DIALOG — with dispatch + status timeline
// =====================================================================
function TripDetailDialog({ tripId, facilityId, onClose, onUpdated }: { tripId: string; facilityId: string; onClose: () => void; onUpdated: () => void }) {
  const [actionLoading, setActionLoading] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ambulance-trip-detail", tripId],
    queryFn: () => fetchJson(`/api/ambulance/${tripId}`),
  });

  // Load available vehicles
  const { data: vehiclesData } = useQuery({
    queryKey: ["ambulance-vehicles-available", facilityId],
    queryFn: () => fetchJson(`/api/ambulance/vehicles?facilityId=${facilityId}&status=all`),
  });

  const availableVehicles = (vehiclesData?.items || []).filter((v: any) => v.status === "available" || v.id === data?.item?.vehicleId);

  const patchTrip = async (body: any, msg: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/ambulance/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success(msg);
      refetch();
      onUpdated();
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(false); }
  };

  if (isLoading) {
    return <Dialog open onOpenChange={onClose}><DialogContent className="max-w-2xl"><LoadingState rows={3} /></DialogContent></Dialog>;
  }

  const t = data?.item;
  if (!t) return null;

  const canDispatch = t.status === "requested";
  const canAdvance = ["dispatched", "en_route_pickup", "at_pickup", "patient_on_board", "en_route_destination", "at_destination", "handover", "returning"].includes(t.status);
  const canCancel = !["completed", "cancelled"].includes(t.status);

  const nextStatus: Record<string, string> = {
    requested: "dispatched",
    dispatched: "en_route_pickup",
    en_route_pickup: "at_pickup",
    at_pickup: "patient_on_board",
    patient_on_board: "en_route_destination",
    en_route_destination: "at_destination",
    at_destination: "handover",
    handover: "returning",
    returning: "completed",
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2 flex-wrap">
            <Badge className="bg-red-100 text-red-700 border-red-200 font-mono text-[10px]">{t.tripNumber}</Badge>
            <span>{t.patient ? `${t.patient.firstName} ${t.patient.lastName}` : "Unregistered"}</span>
            <Badge variant="outline" className={`text-[9px] capitalize ${priorityColor(t.priority)}`}>{t.priority}</Badge>
            <StatusBadge status={t.status} />
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {t.requestType.replace(/_/g, " ")} · Requested {formatDate(t.requestedAt, true)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Route info */}
          <Card><CardContent className="p-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Pickup</div>
              <div className="font-medium">{t.pickupLocation}</div>
              {t.pickupContactName && <div className="text-slate-500">{t.pickupContactName} · {t.pickupContactPhone}</div>}
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Destination</div>
              <div className="font-medium">{t.destinationLocation}</div>
              {t.destinationContactName && <div className="text-slate-500">{t.destinationContactName} · {t.destinationContactPhone}</div>}
            </div>
          </CardContent></Card>

          {/* Clinical info */}
          {(t.reasonForTransport || t.patientCondition || t.mobilityRequirement) && (
            <Card><CardContent className="p-3 grid grid-cols-3 gap-2 text-xs">
              {t.reasonForTransport && <div><div className="text-[10px] text-slate-400 uppercase">Reason</div><div>{t.reasonForTransport}</div></div>}
              {t.patientCondition && <div><div className="text-[10px] text-slate-400 uppercase">Condition</div><div className="capitalize">{t.patientCondition.replace(/_/g, " ")}</div></div>}
              {t.mobilityRequirement && <div><div className="text-[10px] text-slate-400 uppercase">Mobility</div><div className="capitalize">{t.mobilityRequirement}</div></div>}
              {t.oxygenRequired && <div><Badge variant="outline" className="text-[9px] text-blue-700">O₂ Required</Badge></div>}
            </CardContent></Card>
          )}

          {/* Vehicle assignment */}
          <Card><CardContent className="p-3 space-y-2">
            <div className="text-[10px] text-slate-400 uppercase">Vehicle Assignment</div>
            {t.vehicle ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">{t.vehicle.vehicleNumber}</span>
                  <span className="text-xs text-slate-500 ml-2">{t.vehicle.registrationNumber} · {t.vehicle.ambulanceType.replace(/_/g, " ")}</span>
                </div>
                <Badge variant="outline" className="text-[9px]">{t.vehicle.status}</Badge>
              </div>
            ) : (
              <Select onValueChange={(v) => patchTrip({ vehicleId: v, status: "dispatched" }, "Ambulance dispatched")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select ambulance to dispatch" /></SelectTrigger>
                <SelectContent>
                  {availableVehicles.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.vehicleNumber} · {v.registrationNumber} · {v.ambulanceType.replace(/_/g, " ")} · {v.status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent></Card>

          {/* Timeline */}
          <Card><CardContent className="p-3">
            <div className="text-[10px] text-slate-400 uppercase mb-2">Trip Timeline</div>
            <div className="space-y-1 text-xs">
              {[
                { label: "Requested", time: t.requestedAt },
                { label: "Dispatched", time: t.dispatchedAt },
                { label: "Departed", time: t.departedAt },
                { label: "Arrived at Pickup", time: t.arrivedAtPickupAt },
                { label: "Patient On Board", time: t.patientOnBoardAt },
                { label: "Departed Pickup", time: t.departedPickupAt },
                { label: "Arrived at Destination", time: t.arrivedAtDestinationAt },
                { label: "Handover", time: t.handoverAt },
                { label: "Returned", time: t.returnedAt },
                { label: "Completed", time: t.completedAt },
              ].filter((e) => e.time).map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span className="text-slate-700">{e.label}</span>
                  <span className="text-slate-400 ml-auto">{formatDate(e.time, true)}</span>
                </div>
              ))}
            </div>
          </CardContent></Card>

          {t.notes && <Card><CardContent className="p-3"><div className="text-[10px] text-slate-400 uppercase mb-1">Notes</div><div className="text-sm">{t.notes}</div></CardContent></Card>}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {canAdvance && nextStatus[t.status] && (
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={actionLoading}
                onClick={() => patchTrip({ status: nextStatus[t.status] }, `Status → ${nextStatus[t.status].replace(/_/g, " ")}`)}>
                <CheckCircle2 className="w-4 h-4" /> Mark {nextStatus[t.status].replace(/_/g, " ")}
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="outline" className="gap-1.5 text-rose-600" disabled={actionLoading}
                onClick={() => {
                  const reason = window.prompt("Cancellation reason:");
                  if (reason) patchTrip({ status: "cancelled", cancellationReason: reason }, "Trip cancelled");
                }}>
                <X className="w-4 h-4" /> Cancel Trip
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// FLEET TAB
// =====================================================================
function FleetTab({ facilityId }: { facilityId: string }) {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["ambulance-vehicles", facilityId],
    queryFn: () => fetchJson(`/api/ambulance/vehicles?facilityId=${facilityId}`),
  });

  const items = data?.items || [];
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ambulance-vehicles"] });
    qc.invalidateQueries({ queryKey: ["ambulance-stats"] });
  };

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3 flex items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700">Ambulance Fleet</p>
            <p className="text-xs text-slate-500">{items.length} vehicle(s) registered</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700" onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4" /> Add Vehicle
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={3} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No ambulances registered" description="Add a vehicle to the fleet." icon={Truck} /></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((v: any) => (
            <Card key={v.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-red-100 text-red-700 border-red-200 font-mono text-[10px]">{v.vehicleNumber}</Badge>
                      <span className="text-sm font-medium">{v.registrationNumber}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 capitalize">
                      {v.ambulanceType?.replace(/_/g, " ") || "—"}
                      {v.make && ` · ${v.make} ${v.model || ""}`}
                      {v.year && ` · ${v.year}`}
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[9px] ${
                    v.status === "available" ? "text-emerald-700 border-emerald-300"
                    : v.status === "maintenance" ? "text-amber-700 border-amber-300"
                    : v.status === "out_of_service" ? "text-rose-700 border-rose-300"
                    : "text-blue-700 border-blue-300"
                  }`}>
                    {v.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500 grid grid-cols-2 gap-1">
                  <div>Capacity: {v.capacity}</div>
                  <div>Trips: {v._count?.trips || 0}</div>
                  {v.currentOdometer != null && <div>Odometer: {v.currentOdometer.toLocaleString()} km</div>}
                  {v.nextServiceDate && <div>Next service: {formatDate(v.nextServiceDate)}</div>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showNew && (
        <NewVehicleDialog facilityId={facilityId} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} />
      )}
    </>
  );
}

// =====================================================================
// NEW VEHICLE DIALOG
// =====================================================================
function NewVehicleDialog({ facilityId, onClose, onCreated }: { facilityId: string; onClose: () => void; onCreated: () => void }) {
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [ambulanceType, setAmbulanceType] = useState("basic_life_support");
  const [capacity, setCapacity] = useState("2");
  const [baseLocation, setBaseLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!vehicleNumber || !registrationNumber) { toast.error("Vehicle number and registration are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/ambulance/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId, vehicleNumber, registrationNumber,
          make, model, year: year ? parseInt(year) : undefined,
          ambulanceType, capacity: parseInt(capacity),
          baseLocation, notes,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Vehicle added to fleet");
      onCreated();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white"><DialogTitle className="text-white flex items-center gap-2"><Truck className="w-5 h-5 text-red-600" /> Add Ambulance</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel required>Fleet Number</FieldLabel><Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="AMB-001" className="h-8 text-sm font-mono" /></div>
            <div><FieldLabel required>Registration</FieldLabel><Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="GR-1234-24" className="h-8 text-sm" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Make</Label><Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" className="h-8 text-sm" /></div>
            <div><Label>Model</Label><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Hilux" className="h-8 text-sm" /></div>
            <div><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2024" className="h-8 text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Type</FieldLabel>
              <Select value={ambulanceType} onValueChange={setAmbulanceType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Capacity</Label><Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="h-8 text-sm" /></div>
          </div>
          <div><Label>Base Location</Label><Input value={baseLocation} onChange={(e) => setBaseLocation(e.target.value)} placeholder="Ambulance bay, main facility" className="h-8 text-sm" /></div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-red-600 hover:bg-red-700">{saving ? "Adding…" : "Add Vehicle"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

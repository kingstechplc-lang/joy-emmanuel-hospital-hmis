"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { BedDouble, RefreshCw, Sparkles, Wrench, Brush, LogOut, ArrowRightLeft, X, Activity, Search, Ban, Shield, History, Plus } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative, calculateAge, safeJson, PageHeader, MiniStatCard} from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500 hover:bg-emerald-600 text-white",
  occupied: "bg-rose-500 hover:bg-rose-600 text-white",
  reserved: "bg-amber-500 hover:bg-amber-600 text-white",
  cleaning: "bg-cyan-500 hover:bg-cyan-600 text-white",
  maintenance: "bg-orange-500 hover:bg-orange-600 text-white",
  out_of_service: "bg-slate-400 hover:bg-slate-500 text-white",
  blocked: "bg-red-700 hover:bg-red-800 text-white",
  isolation: "bg-violet-500 hover:bg-violet-600 text-white",
  temporarily_unavailable: "bg-yellow-600 hover:bg-yellow-700 text-white",
};

const STATUS_FILTERS = [
  { value: "all", label: "All Beds" },
  { value: "available", label: "Available" },
  { value: "occupied", label: "Occupied" },
  { value: "reserved", label: "Reserved" },
  { value: "cleaning", label: "Cleaning" },
  { value: "maintenance", label: "Maintenance" },
  { value: "blocked", label: "Blocked" },
  { value: "isolation", label: "Isolation" },
  { value: "out_of_service", label: "Out of Service" },
  { value: "temporarily_unavailable", label: "Temporarily Unavailable" },
];

export function BedsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [tab, setTab] = useState("board");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedBed, setSelectedBed] = useState<any | null>(null);
  // Management dialogs
  const [showWardDialog, setShowWardDialog] = useState(false);
  const [editingWard, setEditingWard] = useState<any | null>(null);
  const [showRoomDialog, setShowRoomDialog] = useState(false);
  const [editingRoom, setEditingRoom] = useState<any | null>(null);
  const [showBedDialog, setShowBedDialog] = useState(false);
  const [editingBed, setEditingBed] = useState<any | null>(null);
  // Smart search filters
  const [searchBedType, setSearchBedType] = useState("all");
  const [searchGender, setSearchGender] = useState("all");
  const [searchIsolation, setSearchIsolation] = useState(false);
  const [searchOxygen, setSearchOxygen] = useState(false);
  const [searchVentilator, setSearchVentilator] = useState(false);
  const [searchMonitoring, setSearchMonitoring] = useState(false);
  const [searchAccessibility, setSearchAccessibility] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (searchBedType !== "all") params.set("bedType", searchBedType);
  if (searchGender !== "all") params.set("genderRestriction", searchGender);
  if (searchIsolation) params.set("isolationCapable", "true");
  if (searchOxygen) params.set("oxygen", "true");
  if (searchVentilator) params.set("ventilator", "true");
  if (searchMonitoring) params.set("cardiacMonitoring", "true");
  if (searchAccessibility) params.set("accessibility", "true");
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["beds", activeFacilityId, statusFilter, searchBedType, searchGender, searchIsolation, searchOxygen, searchVentilator, searchMonitoring, searchAccessibility],
    queryFn: () => fetchJson(`/api/beds${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["beds"] });
    qc.invalidateQueries({ queryKey: ["wards"] });
    qc.invalidateQueries({ queryKey: ["wards-manage"] });
    qc.invalidateQueries({ queryKey: ["wards-room"] });
    qc.invalidateQueries({ queryKey: ["wards-bed"] });
    qc.invalidateQueries({ queryKey: ["wards-for-transfer"] });
    qc.invalidateQueries({ queryKey: ["wards-for-assign"] });
    qc.invalidateQueries({ queryKey: ["rooms-bed"] });
    qc.invalidateQueries({ queryKey: ["rooms"] });
    qc.invalidateQueries({ queryKey: ["beds-stats"] });
    qc.invalidateQueries({ queryKey: ["admissions-census"] });
  };

  // Stats
  const items: any[] = data?.items || [];
  const stats = items.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bed Management"
        description="Complete bed management — real-time bed board, smart search, cleaning, maintenance, blocking, and occupancy analytics"
        icon={BedDouble}
        gradient="from-blue-500 to-cyan-600"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5"><Activity className="w-4 h-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="board" className="gap-1.5"><BedDouble className="w-4 h-4" /> Bed Board</TabsTrigger>
          <TabsTrigger value="manage" className="gap-1.5"><Plus className="w-4 h-4" /> Manage</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <BedDashboard facilityId={activeFacilityId} />
        </TabsContent>

        <TabsContent value="board" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> Available ({stats.available || 0})</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-500" /> Occupied ({stats.occupied || 0})</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500" /> Reserved ({stats.reserved || 0})</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-cyan-500" /> Cleaning ({stats.cleaning || 0})</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500" /> Maintenance ({stats.maintenance || 0})</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-700" /> Blocked ({stats.blocked || 0})</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowSearch(!showSearch)} className="gap-1.5">
          <Search className="w-3.5 h-3.5" /> Smart Search
        </Button>
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view its beds.</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3 flex flex-wrap gap-3 items-center">
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setShowSearch(!showSearch)} className="gap-1.5">
            <Search className="w-3.5 h-3.5" /> {showSearch ? "Hide Filters" : "Smart Search"}
          </Button>
        </CardContent>
      </Card>

      {showSearch && (
        <Card>
          <CardContent className="p-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Bed Type</Label>
              <Select value={searchBedType} onValueChange={setSearchBedType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="regular">General</SelectItem>
                  <SelectItem value="icu">ICU</SelectItem>
                  <SelectItem value="hdu">HDU</SelectItem>
                  <SelectItem value="maternity">Maternity</SelectItem>
                  <SelectItem value="pediatric">Pediatric</SelectItem>
                  <SelectItem value="neonatal">Neonatal</SelectItem>
                  <SelectItem value="isolation">Isolation</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Gender Restriction</Label>
              <Select value={searchGender} onValueChange={setSearchGender}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={searchIsolation} onCheckedChange={(v) => setSearchIsolation(!!v)} /> Isolation</label>
              <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={searchOxygen} onCheckedChange={(v) => setSearchOxygen(!!v)} /> Oxygen</label>
              <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={searchVentilator} onCheckedChange={(v) => setSearchVentilator(!!v)} /> Ventilator</label>
              <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={searchMonitoring} onCheckedChange={(v) => setSearchMonitoring(!!v)} /> Monitoring</label>
              <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={searchAccessibility} onCheckedChange={(v) => setSearchAccessibility(!!v)} /> Accessible</label>
              <Button variant="ghost" size="sm" onClick={() => { setSearchBedType("all"); setSearchGender("all"); setSearchIsolation(false); setSearchOxygen(false); setSearchVentilator(false); setSearchMonitoring(false); setSearchAccessibility(false); }} className="text-xs">Reset</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load beds" onRetry={() => refetch()} />
      ) : !data?.wards || data.wards.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="No beds found" description="Add wards, rooms, and beds using the Manage tab, or adjust your filters." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.wards.map((wardGroup: any) => {
            const w = wardGroup.ward;
            const beds: any[] = wardGroup.beds || [];
            const occupiedCount = beds.filter((b) => b.status === "occupied").length;
            return (
              <Card key={w.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <BedDouble className="w-4 h-4 text-emerald-600" />
                        {w.name} <span className="text-xs text-slate-500 font-normal">({w.code})</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {w.wardType || "General"} ward • {beds.length} beds • {occupiedCount} occupied • {beds.length - occupiedCount} free
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {beds.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBed(b)}
                        className={`aspect-square rounded-lg border border-slate-200 p-2 flex flex-col items-center justify-center text-center transition ${STATUS_COLORS[b.status] || "bg-slate-200 hover:bg-slate-300"}`}
                        title={`Bed ${b.bedNumber} — ${b.status}`}
                      >
                        <BedDouble className="w-4 h-4 mb-1" />
                        <span className="text-xs font-semibold leading-tight">{b.bedNumber}</span>
                        {b.status === "occupied" && b.bedAssignments?.[0]?.patient && (
                          <span className="text-[9px] mt-0.5 leading-tight line-clamp-1">
                            {b.bedAssignments[0].patient.firstName} {b.bedAssignments[0].patient.lastName?.[0]}.
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedBed && (
        <BedDetailDialog
          bed={selectedBed}
          onClose={() => setSelectedBed(null)}
          onChanged={() => { setSelectedBed(null); invalidate(); }}
          canManage={can("bed.manage")}
        />
      )}
        </TabsContent>

        <TabsContent value="manage" className="space-y-4">
          <ManageTab
            facilityId={activeFacilityId}
            canCreate={can("bed.create") || can("bed.manage")}
            canEdit={can("bed.edit") || can("bed.manage")}
            canRetire={can("bed.retire") || can("bed.manage")}
            onShowWardDialog={() => { setEditingWard(null); setShowWardDialog(true); }}
            onEditWard={(w) => { setEditingWard(w); setShowWardDialog(true); }}
            onShowRoomDialog={() => { setEditingRoom(null); setShowRoomDialog(true); }}
            onEditRoom={(r) => { setEditingRoom(r); setShowRoomDialog(true); }}
            onShowBedDialog={() => { setEditingBed(null); setShowBedDialog(true); }}
            onEditBed={(b) => { setEditingBed(b); setShowBedDialog(true); }}
            onChanged={invalidate}
          />
        </TabsContent>
      </Tabs>

      {showWardDialog && (
        <WardDialog ward={editingWard} facilityId={activeFacilityId} onClose={() => setShowWardDialog(false)} onDone={() => { setShowWardDialog(false); invalidate(); }} />
      )}
      {showRoomDialog && (
        <RoomDialog room={editingRoom} facilityId={activeFacilityId} onClose={() => setShowRoomDialog(false)} onDone={() => { setShowRoomDialog(false); invalidate(); }} />
      )}
      {showBedDialog && (
        <BedMasterDialog bed={editingBed} facilityId={activeFacilityId} onClose={() => setShowBedDialog(false)} onDone={() => { setShowBedDialog(false); invalidate(); }} />
      )}
    </div>
  );
}

// ============================================================
// Bed Detail Dialog — shows current assignment and status actions
// ============================================================
function BedDetailDialog({ bed, onClose, onChanged, canManage }: { bed: any; onClose: () => void; onChanged: () => void; canManage: boolean }) {
  const [transferMode, setTransferMode] = useState(false);
  const [targetWardId, setTargetWardId] = useState("");
  const [targetBedId, setTargetBedId] = useState("");
  const [saving, setSaving] = useState(false);

  const assignment = bed.bedAssignments?.[0];
  const patient = assignment?.patient;
  const admission = assignment?.admission;

  const { data: wardsData } = useQuery({
    queryKey: ["wards-for-transfer", bed.facilityId],
    queryFn: () => fetchJson(`/api/wards?facilityId=${bed.facilityId}`),
    enabled: transferMode,
  });

  const { data: targetBedsData } = useQuery({
    queryKey: ["ward-beds-transfer", targetWardId],
    queryFn: () => fetchJson(`/api/beds?wardId=${targetWardId}&status=available`),
    enabled: transferMode && !!targetWardId,
  });

  const setStatus = async (status: string, label: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/beds/${bed.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success(`Bed marked as ${label}`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const releaseBed = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/beds/${bed.id}/release`, { method: "POST" });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Bed released and marked available");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const transferPatient = async () => {
    if (!targetBedId) { toast.error("Please select a target bed"); return; }
    if (!assignment || !admission) { toast.error("No active assignment to transfer"); return; }
    setSaving(true);
    try {
      // Use the assign endpoint with the new bed; it releases old + occupies new atomically
      const res = await fetch(`/api/beds/${targetBedId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissionId: admission.id,
          patientId: patient.id,
          wardId: targetWardId,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Patient transferred to new bed");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BedDouble className="w-5 h-5 text-emerald-600" />
            Bed {bed.bedNumber}
          </DialogTitle>
          <DialogDescription>
            {bed.ward?.name} {bed.room ? `• Room ${bed.room.roomNumber}` : ""} • {bed.bedType || "Regular bed"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Status:</span>
            <StatusBadge status={bed.status} />
          </div>

          {bed.status === "occupied" && assignment && patient ? (
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Current Patient</span>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{patient.firstName} {patient.lastName}</div>
                  <div className="text-xs text-slate-500">
                    {patient.patientNumber} • {patient.sex || "—"} • {patient.dateOfBirth ? `${calculateAge(patient.dateOfBirth)} yrs` : ""}
                  </div>
                  {patient.phone && <div className="text-xs text-slate-500">Phone: {patient.phone}</div>}
                </div>
                <div className="pt-2 border-t">
                  <div className="text-xs text-slate-500">Admission</div>
                  <div className="text-sm font-mono">{admission?.admissionNumber}</div>
                  <div className="text-xs text-slate-500">
                    Admitted {formatDate(admission?.admittedAt, true)} ({formatRelative(admission?.admittedAt)})
                  </div>
                  {admission?.admittedBy && (
                    <div className="text-xs text-slate-500">
                      Attending: {admission.admittedBy.firstName} {admission.admittedBy.lastName}
                    </div>
                  )}
                  {admission?.admissionDiagnosis && (
                    <div className="text-xs text-slate-700 mt-1">
                      <span className="text-slate-500">Dx:</span> {admission.admissionDiagnosis}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded">
              {bed.status === "available" && "This bed is available for assignment."}
              {bed.status === "reserved" && "This bed is reserved."}
              {bed.status === "cleaning" && "This bed is being cleaned."}
              {bed.status === "maintenance" && "This bed is under maintenance."}
              {bed.status === "out_of_service" && "This bed is out of service."}
              {bed.notes && <div className="text-xs text-slate-500 mt-1">{bed.notes}</div>}
            </div>
          )}

          {canManage && (
            <div className="space-y-2">
              <Label>Actions</Label>
              <div className="flex flex-wrap gap-2">
                {bed.status === "available" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setStatus("reserved", "reserved")} disabled={saving} className="gap-1 h-8">
                      <Sparkles className="w-3 h-3" /> Reserve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus("cleaning", "cleaning")} disabled={saving} className="gap-1 h-8">
                      <Brush className="w-3 h-3" /> Mark Cleaning
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus("maintenance", "under maintenance")} disabled={saving} className="gap-1 h-8">
                      <Wrench className="w-3 h-3" /> Maintenance
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus("out_of_service", "out of service")} disabled={saving} className="gap-1 h-8">
                      <X className="w-3 h-3" /> Out of Service
                    </Button>
                  </>
                )}
                {bed.status === "reserved" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus("available", "available")} disabled={saving} className="gap-1 h-8">
                    <RefreshCw className="w-3 h-3" /> Release Reservation
                  </Button>
                )}
                {bed.status === "cleaning" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus("available", "available")} disabled={saving} className="gap-1 h-8">
                    <RefreshCw className="w-3 h-3" /> Mark Available
                  </Button>
                )}
                {bed.status === "maintenance" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus("available", "available")} disabled={saving} className="gap-1 h-8">
                    <RefreshCw className="w-3 h-3" /> Mark Available
                  </Button>
                )}
                {bed.status === "out_of_service" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus("available", "available")} disabled={saving} className="gap-1 h-8">
                    <RefreshCw className="w-3 h-3" /> Mark Available
                  </Button>
                )}
                {bed.status === "occupied" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setTransferMode(!transferMode)} disabled={saving} className="gap-1 h-8">
                      <ArrowRightLeft className="w-3 h-3" /> Transfer Patient
                    </Button>
                    <Button size="sm" variant="outline" onClick={releaseBed} disabled={saving} className="gap-1 h-8 text-rose-600 hover:text-rose-700">
                      <LogOut className="w-3 h-3" /> Release Bed
                    </Button>
                  </>
                )}
              </div>

              {transferMode && bed.status === "occupied" && (
                <div className="border rounded p-3 space-y-2 bg-slate-50">
                  <Label>Transfer to a new bed</Label>
                  <Select value={targetWardId || undefined} onValueChange={(v) => { setTargetWardId(v); setTargetBedId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select target ward" /></SelectTrigger>
                    <SelectContent>
                      {(wardsData?.items || []).filter((w: any) => w.id !== bed.wardId).map((w: any) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} • {w.bedStats?.available || 0} available
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {targetWardId && (
                    <Select value={targetBedId || undefined} onValueChange={setTargetBedId}>
                      <SelectTrigger><SelectValue placeholder="Select available bed" /></SelectTrigger>
                      <SelectContent>
                        {(targetBedsData?.items || []).length === 0 ? (
                          <SelectItem value="_none" disabled>No available beds in this ward</SelectItem>
                        ) : (
                          (targetBedsData?.items || []).map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>Bed {b.bedNumber}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  <Button size="sm" onClick={transferPatient} disabled={saving || !targetBedId} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                    <ArrowRightLeft className="w-3 h-3" /> Confirm Transfer
                  </Button>
                </div>
              )}
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

// ============================================================
// Bed Dashboard — occupancy analytics
// ============================================================
function BedDashboard({ facilityId }: { facilityId: string | null }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["beds-stats", facilityId],
    queryFn: () => fetchJson(`/api/beds/stats?facilityId=${facilityId || ""}`),
    enabled: !!facilityId,
  });
  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message="Failed to load bed stats" onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MiniStatCard label="Total Beds" value={data.total} icon={BedDouble} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="Operational" value={data.operational} icon={Activity} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Occupied" value={data.occupied} icon={BedDouble} gradient="from-rose-500 to-rose-600" />
        <MiniStatCard label="Available" value={data.available} icon={BedDouble} gradient="from-emerald-500 to-teal-600" />
        <MiniStatCard label="Reserved" value={data.reserved} icon={BedDouble} gradient="from-amber-500 to-amber-600" />
        <MiniStatCard label="Cleaning" value={data.cleaning} icon={Brush} gradient="from-cyan-500 to-cyan-600" />
        <MiniStatCard label="Maintenance" value={data.maintenance} icon={Wrench} gradient="from-orange-500 to-orange-600" />
        <MiniStatCard label="Blocked" value={data.blocked} icon={Ban} gradient="from-red-600 to-red-700" />
        <MiniStatCard label="Out of Service" value={data.outOfService} icon={X} gradient="from-slate-400 to-slate-500" />
        <MiniStatCard label="Occupancy Rate" value={`${data.occupancyRate}%`} icon={Activity} gradient="from-blue-500 to-indigo-600" />
        <MiniStatCard label="Avg LOS (30d)" value={`${data.avgLOS}d`} icon={Activity} gradient="from-violet-500 to-violet-600" />
        <MiniStatCard label="Bed Turnover" value={data.bedTurnover} icon={RefreshCw} gradient="from-emerald-500 to-emerald-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold text-slate-700 mb-2">Special Capabilities</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Isolation Capable</span><Badge>{data.isolationCapable}</Badge></div>
            <div className="flex justify-between"><span>Oxygen Equipped</span><Badge>{data.oxygenCapable}</Badge></div>
            <div className="flex justify-between"><span>Ventilator Capable</span><Badge>{data.ventilatorCapable}</Badge></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold text-slate-700 mb-2">Workflows</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Active Reservations</span><Badge>{data.activeReservations}</Badge></div>
            <div className="flex justify-between"><span>Pending Cleaning</span><Badge>{data.pendingCleaning}</Badge></div>
            <div className="flex justify-between"><span>Active Maintenance</span><Badge>{data.activeMaintenance}</Badge></div>
            <div className="flex justify-between"><span>Active Blocks</span><Badge>{data.activeBlocks}</Badge></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold text-slate-700 mb-2">By Bed Type</div>
          <div className="space-y-1 text-sm">
            {Object.entries(data.byType || {}).map(([type, count]: [string, any]) => (
              <div key={type} className="flex justify-between"><span className="capitalize">{type}</span><Badge>{count}</Badge></div>
            ))}
          </div>
        </CardContent></Card>
      </div>

      {data.wardStats && data.wardStats.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3">Ward Occupancy</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-700">Ward</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Total</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Occupied</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Available</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Reserved</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Cleaning</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Maint.</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Blocked</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Occ. Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.wardStats.map((w: any) => (
                    <tr key={w.id} className="border-b hover:bg-slate-50">
                      <td className="p-2 font-medium text-slate-900">{w.name} <span className="text-xs text-slate-500 font-mono">{w.code}</span></td>
                      <td className="p-2 text-center">{w.totalBeds}</td>
                      <td className="p-2 text-center text-rose-700 font-medium">{w.occupied}</td>
                      <td className="p-2 text-center text-emerald-700 font-medium">{w.available}</td>
                      <td className="p-2 text-center text-amber-700">{w.reserved}</td>
                      <td className="p-2 text-center text-cyan-700">{w.cleaning}</td>
                      <td className="p-2 text-center text-orange-700">{w.maintenance}</td>
                      <td className="p-2 text-center text-red-700">{w.blocked}</td>
                      <td className="p-2 text-center">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded h-4 relative overflow-hidden min-w-[60px]">
                            <div className={`h-full ${w.occupancyRate > 80 ? "bg-rose-500" : w.occupancyRate > 60 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, w.occupancyRate)}%` }} />
                          </div>
                          <span className="text-xs font-medium text-slate-700 w-8">{w.occupancyRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Manage Tab — ward/room/bed CRUD
// ============================================================
function ManageTab(props: any) {
  const { facilityId, canCreate, canEdit, canRetire, onShowWardDialog, onEditWard, onShowRoomDialog, onEditRoom, onShowBedDialog, onChanged } = props;
  const { data: wardsData, isLoading } = useQuery({
    queryKey: ["wards-manage", facilityId],
    queryFn: () => fetchJson(`/api/wards?facilityId=${facilityId || ""}`),
    enabled: !!facilityId,
  });
  const wards = wardsData?.items || [];
  const deleteWard = async (id: string) => {
    if (!confirm("Deactivate this ward?")) return;
    const res = await fetch(`/api/wards/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Ward deactivated"); onChanged(); } else { const e = await safeJson(res); toast.error(e.error || "Failed"); }
  };
  const deleteRoom = async (id: string) => {
    if (!confirm("Deactivate this room?")) return;
    const res = await fetch(`/api/rooms/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Room deactivated"); onChanged(); } else { const e = await safeJson(res); toast.error(e.error || "Failed"); }
  };
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-semibold text-slate-700">Wards ({wards.length})</div>
          {canCreate && <Button size="sm" onClick={onShowWardDialog} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> Add Ward</Button>}
        </div>
        <div className="text-xs text-slate-400 mb-2">Capacity = expected/planned bed count. Actual = number of beds currently created in this ward.</div>
        {isLoading ? <LoadingState rows={3} /> : wards.length === 0 ? <EmptyState title="No wards" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr>
              <th className="text-left p-2 font-semibold text-slate-700">Ward</th><th className="text-left p-2 font-semibold text-slate-700">Type</th>
              <th className="text-center p-2 font-semibold text-slate-700">Rooms</th>
              <th className="text-center p-2 font-semibold text-slate-700">Capacity</th>
              <th className="text-center p-2 font-semibold text-slate-700">Actual Beds</th>
              <th className="text-center p-2 font-semibold text-slate-700">Occupied</th>
              <th className="text-left p-2 font-semibold text-slate-700">Status</th><th className="text-right p-2 font-semibold text-slate-700">Actions</th>
            </tr></thead><tbody>
              {wards.map((w: any) => (
                <tr key={w.id} className="border-b hover:bg-slate-50">
                  <td className="p-2"><div className="font-medium">{w.name}</div><div className="text-xs text-slate-500 font-mono">{w.code}</div></td>
                  <td className="p-2 capitalize">{w.wardType || "—"}</td>
                  <td className="p-2 text-center">{w.rooms?.length || 0}</td>
                  <td className="p-2 text-center text-slate-500">{w.capacity || 0}</td>
                  <td className="p-2 text-center font-medium text-slate-900">{w.bedStats?.total || 0}</td>
                  <td className="p-2 text-center text-rose-700 font-medium">{w.bedStats?.occupied || 0}</td>
                  <td className="p-2"><Badge className={`bg-${w.status === "active" ? "emerald" : "slate"}-100 text-${w.status === "active" ? "emerald" : "slate"}-700`}>{w.status}</Badge></td>
                  <td className="p-2 text-right"><div className="flex justify-end gap-1">
                    {canEdit && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEditWard(w)}><Wrench className="w-3.5 h-3.5" /></Button>}
                    {canRetire && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-600" onClick={() => deleteWard(w.id)}><X className="w-3.5 h-3.5" /></Button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </CardContent></Card>

      {wards.length > 0 && (
        <Card><CardContent className="p-4">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-semibold text-slate-700">Rooms</div>
            {canCreate && <Button size="sm" onClick={onShowRoomDialog} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> Add Room</Button>}
          </div>
          <div className="space-y-2">
            {wards.map((w: any) => (
              <div key={w.id}>
                <div className="text-xs font-semibold text-slate-600 mb-1">{w.name}</div>
                {(!w.rooms || w.rooms.length === 0) ? <div className="text-xs text-slate-400 pl-3">No rooms</div> : (
                  <div className="pl-3 space-y-1">
                    {w.rooms.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between text-sm border rounded p-2 bg-white">
                        <div><span className="font-medium">Room {r.roomNumber}</span><Badge variant="outline" className="ml-2 text-xs">{r.roomType}</Badge></div>
                        <div className="flex gap-1">
                          {canEdit && <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onEditRoom({ ...r, wardName: w.name })}><Wrench className="w-3 h-3" /></Button>}
                          {canRetire && <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-600" onClick={() => deleteRoom(r.id)}><X className="w-3 h-3" /></Button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {canCreate && (
        <Card><CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div className="text-sm font-semibold text-slate-700">Beds</div>
            <Button size="sm" onClick={onShowBedDialog} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> Add Bed</Button>
          </div>
          <div className="text-xs text-slate-500 mt-2">Use the Bed Board tab to view all beds. Click any bed to edit or retire it.</div>
        </CardContent></Card>
      )}
    </div>
  );
}

// ============================================================
// Ward Dialog — create/edit
// ============================================================
function WardDialog({ ward, facilityId, onClose, onDone }: { ward?: any; facilityId: string | null; onClose: () => void; onDone: () => void }) {
  const isEdit = !!ward;
  const [form, setForm] = useState({ name: ward?.name || "", code: ward?.code || "", wardType: ward?.wardType || "general", genderPolicy: ward?.genderPolicy || "mixed", capacity: ward?.capacity || 0, status: ward?.status || "active" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.name || !form.code) { toast.error("Name and code required"); return; }
    setSaving(true);
    try {
      const url = isEdit ? `/api/wards/${ward.id}` : "/api/wards";
      const payload = isEdit ? { ...form, capacity: Number(form.capacity) } : { ...form, facilityId, capacity: Number(form.capacity) };
      const res = await fetch(url, { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success(isEdit ? "Ward updated" : "Ward created"); onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{isEdit ? "Edit Ward" : "Add Ward"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Ward Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Ward Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label><Select value={form.wardType} onValueChange={(v) => setForm({ ...form, wardType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="private">Private</SelectItem><SelectItem value="maternity">Maternity</SelectItem><SelectItem value="icu">ICU</SelectItem><SelectItem value="emergency">Emergency</SelectItem><SelectItem value="paediatric">Paediatric</SelectItem><SelectItem value="surgical">Surgical</SelectItem></SelectContent></Select></div>
          <div><Label>Gender</Label><Select value={form.genderPolicy} onValueChange={(v) => setForm({ ...form, genderPolicy: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mixed">Mixed</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent></Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Capacity (expected beds)</Label>
            <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            <div className="text-[10px] text-slate-400 mt-0.5">Target/expected bed count for planning. Actual beds are managed separately.</div>
          </div>
          <div><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving..." : isEdit ? "Save" : "Create"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// ============================================================
// Room Dialog — create/edit
// ============================================================
function RoomDialog({ room, facilityId, onClose, onDone }: { room?: any; facilityId: string | null; onClose: () => void; onDone: () => void }) {
  const isEdit = !!room;
  const [form, setForm] = useState({ wardId: room?.wardId || "", roomNumber: room?.roomNumber || "", roomType: room?.roomType || "ward", capacity: room?.capacity || 1, status: room?.status || "active" });
  const [saving, setSaving] = useState(false);
  const { data: wardsData } = useQuery({ queryKey: ["wards-room", facilityId], queryFn: () => fetchJson(`/api/wards?facilityId=${facilityId || ""}`), enabled: !!facilityId });
  const wards = wardsData?.items || [];
  // Use wardName passed from the parent (reliable) or look it up from wards list (fallback)
  const selectedWardName = room?.wardName || wards.find((w: any) => w.id === form.wardId)?.name || "—";
  const submit = async () => {
    if (!form.wardId || !form.roomNumber) { toast.error("Ward and room number required"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        // On edit, don't send wardId (ward can't be changed after creation)
        const res = await fetch(`/api/rooms/${room.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomNumber: form.roomNumber, roomType: form.roomType, capacity: Number(form.capacity), status: form.status }) });
        if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      } else {
        const res = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, capacity: Number(form.capacity) }) });
        if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      }
      toast.success(isEdit ? "Room updated" : "Room created"); onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{isEdit ? "Edit Room" : "Add Room"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Ward</Label>
          {isEdit ? (
            <Input value={selectedWardName} disabled className="bg-slate-50 text-slate-500" />
          ) : (
            <Select value={form.wardId || undefined} onValueChange={(v) => setForm({ ...form, wardId: v })}>
              <SelectTrigger><SelectValue placeholder="Select ward" /></SelectTrigger>
              <SelectContent>{wards.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {isEdit && <div className="text-xs text-slate-400 mt-0.5">Ward cannot be changed after room creation</div>}
        </div>
        <div><Label>Room Number</Label><Input value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} placeholder="e.g., 101" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Room Type</Label><Select value={form.roomType} onValueChange={(v) => setForm({ ...form, roomType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ward">Ward</SelectItem><SelectItem value="private">Private</SelectItem><SelectItem value="semi-private">Semi-private</SelectItem></SelectContent></Select></div>
          <div>
            <Label>Capacity (beds)</Label>
            <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            <div className="text-[10px] text-slate-400 mt-0.5">Expected max beds in this room</div>
          </div>
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving..." : isEdit ? "Save" : "Create"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

// ============================================================
// Bed Master Dialog — create/edit bed
// ============================================================
function BedMasterDialog({ bed, facilityId, onClose, onDone }: { bed?: any; facilityId: string | null; onClose: () => void; onDone: () => void }) {
  const isEdit = !!bed;
  const [form, setForm] = useState({
    wardId: bed?.wardId || "", roomId: bed?.roomId || "", bedNumber: bed?.bedNumber || "", bedCode: bed?.bedCode || "",
    bedType: bed?.bedType || "regular", building: bed?.building || "", floor: bed?.floor || "",
    genderRestriction: bed?.genderRestriction || "any", ageRestriction: bed?.ageRestriction || "any",
    isolationCapable: bed?.isolationCapable || false, oxygen: bed?.oxygen || false, ventilator: bed?.ventilator || false,
    cardiacMonitoring: bed?.cardiacMonitoring || false, accessibility: bed?.accessibility || false,
    description: bed?.description || "", notes: bed?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const { data: wardsData } = useQuery({ queryKey: ["wards-bed", facilityId], queryFn: () => fetchJson(`/api/wards?facilityId=${facilityId || ""}`), enabled: !!facilityId });
  const { data: roomsData } = useQuery({ queryKey: ["rooms-bed", form.wardId], queryFn: () => fetchJson(`/api/rooms?wardId=${form.wardId}`), enabled: !!form.wardId });
  const submit = async () => {
    if (!form.wardId || !form.bedNumber) { toast.error("Ward and bed number required"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const res = await fetch(`/api/beds/${bed.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", ...form, roomId: form.roomId || null }) });
        if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
        toast.success("Bed updated");
      } else {
        const res = await fetch("/api/beds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, facilityId, roomId: form.roomId || null }) });
        if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
        toast.success("Bed created");
      }
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b"><DialogTitle>{isEdit ? "Edit Bed" : "Add Bed"}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Ward</Label><Select value={form.wardId || undefined} onValueChange={(v) => setForm({ ...form, wardId: v, roomId: "" })} disabled={isEdit}><SelectTrigger><SelectValue placeholder="Select ward" /></SelectTrigger><SelectContent>{(wardsData?.items || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Room (optional)</Label><Select value={form.roomId || "_none"} onValueChange={(v) => setForm({ ...form, roomId: v === "_none" ? "" : v })}><SelectTrigger><SelectValue placeholder="No room" /></SelectTrigger><SelectContent><SelectItem value="_none">No room</SelectItem>{(roomsData?.items || []).map((r: any) => <SelectItem key={r.id} value={r.id}>Room {r.roomNumber}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Bed Number</Label><Input value={form.bedNumber} onChange={(e) => setForm({ ...form, bedNumber: e.target.value })} placeholder="e.g., 101-A" /></div>
            <div><Label>Bed Code</Label><Input value={form.bedCode} onChange={(e) => setForm({ ...form, bedCode: e.target.value })} placeholder="e.g., GH-JEH-MW-101-A" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Bed Type</Label><Select value={form.bedType} onValueChange={(v) => setForm({ ...form, bedType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="regular">General</SelectItem><SelectItem value="icu">ICU</SelectItem><SelectItem value="hdu">HDU</SelectItem><SelectItem value="maternity">Maternity</SelectItem><SelectItem value="pediatric">Pediatric</SelectItem><SelectItem value="neonatal">Neonatal</SelectItem><SelectItem value="isolation">Isolation</SelectItem><SelectItem value="emergency">Emergency</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent></Select></div>
            <div><Label>Building</Label><Input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} /></div>
            <div><Label>Floor</Label><Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Gender Restriction</Label><Select value={form.genderRestriction} onValueChange={(v) => setForm({ ...form, genderRestriction: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent></Select></div>
            <div><Label>Age Restriction</Label><Select value={form.ageRestriction} onValueChange={(v) => setForm({ ...form, ageRestriction: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any</SelectItem><SelectItem value="neonate">Neonate</SelectItem><SelectItem value="infant">Infant</SelectItem><SelectItem value="child">Child</SelectItem><SelectItem value="adult">Adult</SelectItem><SelectItem value="elderly">Elderly</SelectItem></SelectContent></Select></div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5 text-sm"><Checkbox checked={form.isolationCapable} onCheckedChange={(v) => setForm({ ...form, isolationCapable: !!v })} /> Isolation</label>
            <label className="flex items-center gap-1.5 text-sm"><Checkbox checked={form.oxygen} onCheckedChange={(v) => setForm({ ...form, oxygen: !!v })} /> Oxygen</label>
            <label className="flex items-center gap-1.5 text-sm"><Checkbox checked={form.ventilator} onCheckedChange={(v) => setForm({ ...form, ventilator: !!v })} /> Ventilator</label>
            <label className="flex items-center gap-1.5 text-sm"><Checkbox checked={form.cardiacMonitoring} onCheckedChange={(v) => setForm({ ...form, cardiacMonitoring: !!v })} /> Monitoring</label>
            <label className="flex items-center gap-1.5 text-sm"><Checkbox checked={form.accessibility} onCheckedChange={(v) => setForm({ ...form, accessibility: !!v })} /> Accessible</label>
          </div>
          <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter className="px-6 py-4 shrink-0 border-t bg-white">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2"><Plus className="w-4 h-4" /> {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Bed"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

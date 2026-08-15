"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BedDouble, RefreshCw, Sparkles, Wrench, Brush, LogOut, ArrowRightLeft, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative, calculateAge } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500 hover:bg-emerald-600 text-white",
  occupied: "bg-rose-500 hover:bg-rose-600 text-white",
  reserved: "bg-amber-500 hover:bg-amber-600 text-white",
  cleaning: "bg-cyan-500 hover:bg-cyan-600 text-white",
  maintenance: "bg-orange-500 hover:bg-orange-600 text-white",
  out_of_service: "bg-slate-400 hover:bg-slate-500 text-white",
};

const STATUS_FILTERS = [
  { value: "all", label: "All Beds" },
  { value: "available", label: "Available" },
  { value: "occupied", label: "Occupied" },
  { value: "reserved", label: "Reserved" },
  { value: "cleaning", label: "Cleaning" },
  { value: "maintenance", label: "Maintenance" },
  { value: "out_of_service", label: "Out of Service" },
];

export function BedsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedBed, setSelectedBed] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["beds", activeFacilityId, statusFilter],
    queryFn: () => fetchJson(`/api/beds${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["beds"] });
    qc.invalidateQueries({ queryKey: ["wards"] });
  };

  // Stats
  const items: any[] = data?.items || [];
  const stats = items.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Bed Management</h2>
          <p className="text-sm text-slate-500">Visual ward bed board — click a bed to manage its status, assignment, or transfer the patient</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> Available ({stats.available || 0})</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-500" /> Occupied ({stats.occupied || 0})</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500" /> Reserved ({stats.reserved || 0})</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-cyan-500" /> Cleaning ({stats.cleaning || 0})</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500" /> Maintenance ({stats.maintenance || 0})</span>
        </div>
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view its beds.</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load beds" onRetry={() => refetch()} />
      ) : !data?.wards || data.wards.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="No beds" description="Configure wards and beds via the facility management settings." />
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
        const err = await res.json();
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
        const err = await res.json();
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
        const err = await res.json();
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
                  <Select value={targetWardId} onValueChange={(v) => { setTargetWardId(v); setTargetBedId(""); }}>
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
                    <Select value={targetBedId} onValueChange={setTargetBedId}>
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

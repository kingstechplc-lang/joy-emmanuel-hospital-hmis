"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Plus, Search, Cpu, Wrench, History, Pencil } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatCurrency, safeJson, PageHeader, ClearableSearch, usePagination, Pagination } from "@/components/ui-helpers"

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  { value: "imaging", label: "Imaging" },
  { value: "laboratory", label: "Laboratory" },
  { value: "theatre", label: "Theatre / Surgical" },
  { value: "monitoring", label: "Patient Monitoring" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "it", label: "IT / Office" },
  { value: "other", label: "Other" },
];

const MAINTENANCE_TYPES = [
  { value: "preventive", label: "Preventive" },
  { value: "corrective", label: "Corrective" },
  { value: "calibration", label: "Calibration" },
  { value: "inspection", label: "Inspection" },
];

export function EquipmentView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [viewEq, setViewEq] = useState<any | null>(null);
  const [maintEq, setMaintEq] = useState<any | null>(null);
  const [editEq, setEditEq] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (category !== "all") params.set("category", category);
  if (search) params.set("q", search);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["equipment", activeFacilityId, category, search],
    queryFn: () => fetchJson(`/api/equipment${qs}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["equipment"] });

  const items = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 10);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Equipment"
        description="Manage medical equipment and maintenance schedules"
        icon={Wrench}
        gradient="from-slate-600 to-slate-800"
      
        actions={
                  <Button onClick={() => setShowNew(true)} disabled={!can("inventory.adjust")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Equipment
        </Button>
        }
      />

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search by name, asset #, manufacturer, model, serial" className="pl-0" />
          </div>
          <Select value={category || undefined} onValueChange={setCategory}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load equipment" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No equipment"
              description="Register medical equipment to track maintenance schedules."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("inventory.adjust")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Equipment</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Asset #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Name</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Manufacturer / Model</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Serial</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Location</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Maint.</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((e: any) => (
                    <tr key={e.id} className="border-b hover:bg-emerald-50/40">
                      <td className="p-3 font-mono text-xs text-slate-700">{e.assetNumber}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{e.name}</div>
                        {e.category && <div className="text-xs text-slate-500 capitalize">{e.category}</div>}
                      </td>
                      <td className="p-3 text-xs">
                        <div>{e.manufacturer || "—"}</div>
                        <div className="text-slate-500">{e.model || "—"}</div>
                      </td>
                      <td className="p-3 text-xs font-mono">{e.serialNumber || "—"}</td>
                      <td className="p-3 text-xs">{e.location || e.facility?.name || "—"}</td>
                      <td className="p-3"><StatusBadge status={e.status} /></td>
                      <td className="p-3 text-xs">{e._count?.maintenance ?? 0}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setViewEq(e)} className="gap-1 h-7 text-xs">
                            <History className="w-3 h-3" /> History
                          </Button>
                          {can("inventory.adjust") && (
                            <>
                              <Button size="sm" onClick={() => setMaintEq(e)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                                <Wrench className="w-3 h-3" /> Maintenance
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditEq(e)} className="gap-1 h-7 text-xs">
                                <Pencil className="w-3 h-3" />
                              </Button>
                            </>
                          )}
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

      <EquipmentDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} defaultFacilityId={activeFacilityId || undefined} />
      {editEq && (
        <EquipmentDialog open onClose={() => setEditEq(null)} onCreated={() => { setEditEq(null); invalidate(); }} existing={editEq} defaultFacilityId={activeFacilityId || undefined} />
      )}
      {viewEq && <MaintenanceDialog equipment={viewEq} onClose={() => setViewEq(null)} />}
      {maintEq && <ScheduleMaintenanceDialog equipment={maintEq} onClose={() => setMaintEq(null)} onDone={() => { setMaintEq(null); invalidate(); }} />}
    </div>
  );
}

function EquipmentDialog({ open, onClose, onCreated, existing, defaultFacilityId }: {
  open: boolean; onClose: () => void; onCreated: () => void; existing?: any; defaultFacilityId?: string;
}) {
  const [facilityId, setFacilityId] = useState(existing?.facilityId || defaultFacilityId || "");
  const [assetNumber, setAssetNumber] = useState(existing?.assetNumber || "");
  const [name, setName] = useState(existing?.name || "");
  const [category, setCategory] = useState(existing?.category || "other");
  const [manufacturer, setManufacturer] = useState(existing?.manufacturer || "");
  const [model, setModel] = useState(existing?.model || "");
  const [serialNumber, setSerialNumber] = useState(existing?.serialNumber || "");
  const [purchaseDate, setPurchaseDate] = useState(existing?.purchaseDate ? new Date(existing.purchaseDate).toISOString().slice(0, 10) : "");
  const [purchasePrice, setPurchasePrice] = useState(existing?.purchasePrice ? String(existing.purchasePrice) : "");
  const [warrantyExpiry, setWarrantyExpiry] = useState(existing?.warrantyExpiry ? new Date(existing.warrantyExpiry).toISOString().slice(0, 10) : "");
  const [status, setStatus] = useState(existing?.status || "active");
  const [location, setLocation] = useState(existing?.location || "");
  const [facilities, setFacilities] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchJson("/api/facilities").then((d) => setFacilities(d.facilities || [])).catch(() => {}); }, []);

  const isEdit = !!existing;

  const handleSubmit = async () => {
    if (!assetNumber || !name) return toast.error("Asset # and name required");
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/equipment/${existing.id}` : "/api/equipment";
      const method = isEdit ? "PATCH" : "POST";
      const body: any = {
        facilityId: facilityId || null,
        assetNumber, name, category, manufacturer, model, serialNumber,
        purchaseDate: purchaseDate || null,
        purchasePrice: purchasePrice ? Number(purchasePrice) : null,
        warrantyExpiry: warrantyExpiry || null,
        status, location,
      };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(isEdit ? "Equipment updated" : "Equipment created");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><Cpu className="w-4 h-4" /> {isEdit ? "Edit Equipment" : "New Equipment"}</DialogTitle>
          <DialogDescription className="text-white/80">{isEdit ? "Update equipment information" : "Register a new equipment asset"}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <FieldLabel required className="text-xs">Asset #</FieldLabel>
              <Input value={assetNumber} onChange={(e) => setAssetNumber(e.target.value)} placeholder="AST-001" disabled={isEdit} />
            </div>
            <div>
              <Label className="text-xs">Facility</Label>
              <Select value={facilityId || undefined} onValueChange={setFacilityId}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <FieldLabel required className="text-xs">Name</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="X-Ray Machine" />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={category || undefined} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.filter((c) => c.value !== "all").map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Manufacturer</Label>
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Siemens" />
            </div>
            <div>
              <Label className="text-xs">Model</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Multix Pro" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Serial Number</Label>
              <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Radiology Dept" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Purchase Date</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Purchase Price</Label>
              <Input type="number" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Warranty Expiry</Label>
              <Input type="date" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status || undefined} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Saving..." : (isEdit ? "Save Changes" : "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceDialog({ equipment, onClose }: { equipment: any; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["equipment-maintenance", equipment.id],
    queryFn: () => fetchJson(`/api/equipment/${equipment.id}/maintenance`),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><History className="w-4 h-4" /> Maintenance History</DialogTitle>
          <DialogDescription className="text-white/80">{equipment.name} ({equipment.assetNumber})</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <LoadingState rows={3} />
        ) : isError ? (
          <ErrorState message="Failed to load history" />
        ) : (data?.items || []).length === 0 ? (
          <EmptyState title="No maintenance records" description="Schedule maintenance to begin tracking service history." />
        ) : (
          <div className="space-y-2">
            {data.items.map((m: any) => (
              <Card key={m.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] capitalize">{m.maintenanceType}</Badge>
                        <StatusBadge status={m.status} />
                      </div>
                      <div className="text-sm mt-1">{m.description}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Performed {formatDate(m.performedAt, true)} by {m.performedBy ? `${m.performedBy.firstName} ${m.performedBy.lastName}` : "—"}
                        {m.cost != null && <> · Cost: {formatCurrency(m.cost)}</>}
                        {m.nextDueAt && <> · Next due: {formatDate(m.nextDueAt)}</>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleMaintenanceDialog({ equipment, onClose, onDone }: { equipment: any; onClose: () => void; onDone: () => void }) {
  const [maintenanceType, setMaintenanceType] = useState("preventive");
  const [description, setDescription] = useState("");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().slice(0, 10));
  const [nextDueAt, setNextDueAt] = useState("");
  const [cost, setCost] = useState("");
  const [status, setStatus] = useState("completed");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!description) return toast.error("Description required");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/equipment/${equipment.id}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maintenanceType,
          description,
          performedAt: performedAt ? new Date(performedAt).toISOString() : undefined,
          nextDueAt: nextDueAt ? new Date(nextDueAt).toISOString() : null,
          cost: cost ? Number(cost) : null,
          status,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Maintenance scheduled");
      setDescription(""); setNextDueAt(""); setCost("");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><Wrench className="w-4 h-4" /> Schedule Maintenance</DialogTitle>
          <DialogDescription className="text-white/80">{equipment.name} ({equipment.assetNumber})</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <div>
            <Label className="text-xs">Maintenance Type</Label>
            <Select value={maintenanceType || undefined} onValueChange={setMaintenanceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MAINTENANCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel required className="text-xs">Description</FieldLabel>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="e.g. Annual preventive service, replacement of worn parts" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Performed At</Label>
              <Input type="date" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Next Due</Label>
              <Input type="date" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Cost (GHS)</Label>
              <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status || undefined} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Saving..." : "Save Maintenance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

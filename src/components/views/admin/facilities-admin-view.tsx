"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Building2, Search, Plus, Edit, Network, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, safeJson, ClearableSearch} from "@/components/ui-helpers"
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

const FACILITY_TYPES = [
  { value: "hospital", label: "Hospital" },
  { value: "clinic", label: "Clinic" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "lab", label: "Laboratory" },
  { value: "admin", label: "Administrative Office" },
];

export function FacilitiesAdminView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const setView = useAppStore((s) => s.setView);
  const setActiveFacility = useAppStore((s) => s.setActiveFacility);
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();

  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["facilities-admin", search],
    queryFn: () => fetchJson("/api/facilities"),
  });

  const items = (data?.facilities || []).filter((f: any) =>
    !search || f.name?.toLowerCase().includes(search.toLowerCase()) || f.code?.toLowerCase().includes(search.toLowerCase()) || f.city?.toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["facilities-admin"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/facilities/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Facility deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const goToDepartments = (f: any) => {
    setActiveFacility(f.id);
    setView("settings_departments");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Facilities</h2>
          <p className="text-sm text-slate-500">Manage hospital facilities across the organization</p>
        </div>
        {can("facility.manage") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Add Facility
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search by name, code, or city" className="pl-0" />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load facilities" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No facilities found" description="Add your first facility to begin." /></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((f: any) => (
            <Card key={f.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-emerald-700" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{f.name}</div>
                      <div className="text-xs text-slate-500">{f.code} • {f.facilityType || "hospital"}</div>
                    </div>
                  </div>
                  <StatusBadge status={f.status} />
                </div>

                <div className="space-y-1 text-xs text-slate-600">
                  {f.city && <div>📍 {f.city}{f.region ? `, ${f.region}` : ""}</div>}
                  {f.phone && <div>📞 {f.phone}</div>}
                  {f.email && <div className="truncate">✉️ {f.email}</div>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-center">
                  <div className="bg-slate-50 rounded p-2">
                    <div className="text-lg font-bold text-slate-900">{f._count?.departments || 0}</div>
                    <div className="text-xs text-slate-500">Depts</div>
                  </div>
                  <div className="bg-slate-50 rounded p-2">
                    <div className="text-lg font-bold text-slate-900">{f._count?.beds || 0}</div>
                    <div className="text-xs text-slate-500">Beds</div>
                  </div>
                  <div className="bg-slate-50 rounded p-2">
                    <div className="text-lg font-bold text-slate-900">{f._count?.staffFacilities || 0}</div>
                    <div className="text-xs text-slate-500">Staff</div>
                  </div>
                </div>

                {can("facility.manage") && (
                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => goToDepartments(f)}>
                      <Network className="w-3.5 h-3.5" /> Departments
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(f)} className="w-8 p-0">
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        confirmAction({
                          title: `Delete facility "${f.name}"?`,
                          description: "This will permanently delete the facility and all its departments, wards, beds, and staff assignments. Encounters and clinical records will be preserved but may become orphaned. THIS CANNOT BE UNDONE.",
                          confirmText: "Yes, delete facility",
                          variant: "destructive",
                          requireTextToMatch: f.code,
                          details: (
                            <div>
                              <div><strong>Facility:</strong> {f.name}</div>
                              <div><strong>Code:</strong> {f.code}</div>
                              <div><strong>Type:</strong> {f.facilityType || "—"}</div>
                              <div><strong>Departments:</strong> {f._count?.departments || 0}</div>
                              <div><strong>Beds:</strong> {f._count?.beds || 0}</div>
                              <div><strong>Staff assigned:</strong> {f._count?.staffFacilities || 0}</div>
                              <div className="mt-2 pt-2 border-t border-slate-200 text-rose-700 font-medium">
                                Type the facility code <code className="bg-rose-50 px-1.5 py-0.5 rounded font-mono font-bold">{f.code}</code> to confirm deletion.
                              </div>
                            </div>
                          ),
                          onConfirm: () => deleteMutation.mutate(f.id),
                        });
                      }}
                      className="w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showNew && <FacilityDialog onClose={() => setShowNew(false)} />}
      {editing && <FacilityDialog facility={editing} onClose={() => setEditing(null)} />}
      {confirmDialogEl}
    </div>
  );
}

function FacilityDialog({ facility, onClose }: { facility?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!facility;
  const [form, setForm] = useState({
    name: facility?.name || "",
    code: facility?.code || "",
    facilityType: facility?.facilityType || "hospital",
    address: facility?.address || "",
    city: facility?.city || "",
    region: facility?.region || "",
    country: facility?.country || "Ghana",
    phone: facility?.phone || "",
    email: facility?.email || "",
    status: facility?.status || "active",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/facilities/${facility.id}` : "/api/facilities";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Facility updated" : "Facility created");
      qc.invalidateQueries({ queryKey: ["facilities-admin"] });
      qc.invalidateQueries({ queryKey: ["facilities"] });
      qc.invalidateQueries({ queryKey: ["facilities-for-audit"] });
      qc.invalidateQueries({ queryKey: ["facilities-for-reports"] });
      qc.invalidateQueries({ queryKey: ["facilities-for-shift"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Facility" : "Add New Facility"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update facility information." : "Create a new facility for your organization."}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Code</FieldLabel>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g., JEH-MAIN" />
          </div>
          <div className="space-y-1.5">
            <Label>Facility Type</Label>
            <Select value={form.facilityType || undefined} onValueChange={(v) => setForm({ ...form, facilityType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FACILITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status || undefined} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Region</Label>
            <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Country</Label>
            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name || !form.code}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            <Building2 className="w-4 h-4" />
            {isEdit ? "Save Changes" : "Create Facility"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Pill, Search, Plus, Edit, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState } from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

const DOSAGE_FORMS = [
  { value: "tablet", label: "Tablet" },
  { value: "capsule", label: "Capsule" },
  { value: "syrup", label: "Syrup" },
  { value: "injection", label: "Injection" },
  { value: "cream", label: "Cream" },
  { value: "drops", label: "Drops" },
  { value: "inhaler", label: "Inhaler" },
  { value: "suppository", label: "Suppository" },
  { value: "ointment", label: "Ointment" },
  { value: "gel", label: "Gel" },
  { value: "other", label: "Other" },
];

const ROUTES = [
  { value: "oral", label: "Oral" },
  { value: "iv", label: "IV" },
  { value: "im", label: "IM" },
  { value: "topical", label: "Topical" },
  { value: "sublingual", label: "Sublingual" },
  { value: "inhaled", label: "Inhaled" },
  { value: "ophthalmic", label: "Ophthalmic" },
  { value: "otic", label: "Otic" },
  { value: "rectal", label: "Rectal" },
  { value: "vaginal", label: "Vaginal" },
  { value: "other", label: "Other" },
];

export function MedicationsAdminView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["medications-admin", search, statusFilter],
    queryFn: () => fetchJson(`/api/medications${qs}`),
  });

  const items = data?.items || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["medications-admin"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/medications/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Medication deactivated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Medications</h2>
          <p className="text-sm text-slate-500">Organization-wide medication catalog</p>
        </div>
        {can("settings.manage") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Add Medication
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search by generic or brand name" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load medications" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No medications found" /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Generic Name</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Brand</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Strength</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Form</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Route</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    {can("settings.manage") && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((m: any) => (
                    <tr key={m.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Pill className="w-4 h-4 text-emerald-600" />
                          <span className="font-medium text-slate-900">{m.genericName}</span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-700">{m.brandName || "—"}</td>
                      <td className="p-3 text-slate-700">{m.strength || "—"}</td>
                      <td className="p-3 capitalize">{m.dosageForm || "—"}</td>
                      <td className="p-3 capitalize">{m.route || "—"}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-xs ${
                          m.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}>
                          {m.status}
                        </Badge>
                      </td>
                      {can("settings.manage") && (
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(m)} className="h-8 w-8 p-0">
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`Deactivate medication "${m.genericName}"?`)) deleteMutation.mutate(m.id);
                              }}
                              className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
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

      {showNew && <MedicationDialog onClose={() => setShowNew(false)} />}
      {editing && <MedicationDialog medication={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MedicationDialog({ medication, onClose }: { medication?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!medication;
  const [form, setForm] = useState({
    genericName: medication?.genericName || "",
    brandName: medication?.brandName || "",
    strength: medication?.strength || "",
    dosageForm: medication?.dosageForm || "tablet",
    route: medication?.route || "oral",
    unit: medication?.unit || "",
    description: medication?.description || "",
    status: medication?.status || "active",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/medications/${medication.id}` : "/api/medications";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(isEdit ? "Medication updated" : "Medication created");
      qc.invalidateQueries({ queryKey: ["medications-admin"] });
      qc.invalidateQueries({ queryKey: ["medications"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Medication" : "Add Medication"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update medication details." : "Add a new medication to the catalog."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Generic Name</FieldLabel>
            <Input value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} placeholder="e.g., Paracetamol" />
          </div>
          <div className="space-y-1.5">
            <Label>Brand Name</Label>
            <Input value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} placeholder="e.g., Tylenol" />
          </div>
          <div className="space-y-1.5">
            <Label>Strength</Label>
            <Input value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} placeholder="e.g., 500mg" />
          </div>
          <div className="space-y-1.5">
            <Label>Dosage Form</Label>
            <Select value={form.dosageForm} onValueChange={(v) => setForm({ ...form, dosageForm: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOSAGE_FORMS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Route</Label>
            <Select value={form.route} onValueChange={(v) => setForm({ ...form, route: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROUTES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="e.g., tablet" />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.genericName} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Save className="w-4 h-4" />
            {isEdit ? "Save Changes" : "Create Medication"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

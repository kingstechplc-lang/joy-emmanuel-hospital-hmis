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
import { Building, Search, Plus, Edit, Trash2, Phone, Mail, MapPin, Save } from "lucide-react";
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

export function InsuranceProvidersAdminView() {
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
    queryKey: ["insurance-providers-admin", search, statusFilter],
    queryFn: () => fetchJson(`/api/insurance-providers${qs}`),
  });

  const items = data?.items || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["insurance-providers-admin"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/insurance-providers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Insurance provider deactivated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Insurance Providers</h2>
          <p className="text-sm text-slate-500">Manage insurance companies and providers</p>
        </div>
        {can("settings.manage") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Add Provider
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search by name or code" value={search} onChange={(e) => setSearch(e.target.value)} />
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
        <ErrorState message="Failed to load insurance providers" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No insurance providers found" /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Provider</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Contact</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Patients</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Claims</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    {can("settings.manage") && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((p: any) => (
                    <tr key={p.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                            <Building className="w-4 h-4 text-emerald-700" />
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">{p.name}</div>
                            <div className="text-xs text-slate-500"><code>{p.code}</code></div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="space-y-0.5">
                          {p.phone && <div className="text-xs flex items-center gap-1 text-slate-600"><Phone className="w-3 h-3" />{p.phone}</div>}
                          {p.email && <div className="text-xs flex items-center gap-1 text-slate-600 truncate max-w-xs"><Mail className="w-3 h-3" />{p.email}</div>}
                          {p.address && <div className="text-xs flex items-center gap-1 text-slate-500 truncate max-w-xs"><MapPin className="w-3 h-3" />{p.address}</div>}
                        </div>
                      </td>
                      <td className="p-3 text-right font-medium text-slate-900">{p.patientsCount}</td>
                      <td className="p-3 text-right font-medium text-slate-900">{p.claimsCount}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-xs ${
                          p.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}>
                          {p.status}
                        </Badge>
                      </td>
                      {can("settings.manage") && (
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(p)} className="h-8 w-8 p-0">
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`Deactivate insurance provider "${p.name}"?`)) deleteMutation.mutate(p.id);
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

      {showNew && <ProviderDialog onClose={() => setShowNew(false)} />}
      {editing && <ProviderDialog provider={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProviderDialog({ provider, onClose }: { provider?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!provider;
  const [form, setForm] = useState({
    name: provider?.name || "",
    code: provider?.code || "",
    phone: provider?.phone || "",
    email: provider?.email || "",
    address: provider?.address || "",
    status: provider?.status || "active",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/insurance-providers/${provider.id}` : "/api/insurance-providers";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(isEdit ? "Provider updated" : "Provider created");
      qc.invalidateQueries({ queryKey: ["insurance-providers-admin"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Insurance Provider" : "Add Insurance Provider"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update provider details." : "Add a new insurance provider."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Code</FieldLabel>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name || !form.code} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Save className="w-4 h-4" />
            {isEdit ? "Save Changes" : "Create Provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

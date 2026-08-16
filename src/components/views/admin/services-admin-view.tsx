"use client";
import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DollarSign, Search, Plus, Edit, ChevronDown, ChevronRight, Building2, Save } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, formatCurrency } from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

const CATEGORIES = [
  { value: "consultation", label: "Consultation" },
  { value: "lab", label: "Lab" },
  { value: "imaging", label: "Imaging" },
  { value: "procedure", label: "Procedure" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "admission", label: "Admission" },
  { value: "nursing", label: "Nursing" },
  { value: "other", label: "Other" },
];

export function ServicesAdminView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (category !== "all") params.set("category", category);
  params.set("status", "all");
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["services-admin", search, category],
    queryFn: () => fetchJson(`/api/services${qs}`),
  });

  const items = data?.items || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["services-admin"] });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Services &amp; Pricing</h2>
          <p className="text-sm text-slate-500">Organization-wide billing catalog with optional facility-specific prices</p>
        </div>
        {can("settings.manage") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Add Service
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search services by name or code" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load services" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No services found" /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Service</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Category</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Default Price</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s: any) => {
                    const isExpanded = expandedIds.has(s.id);
                    return (
                      <Fragment key={s.id}>
                        <tr className="border-b hover:bg-slate-50">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {can("settings.manage") && (
                                <button onClick={() => toggleExpand(s.id)} className="text-slate-500 hover:text-emerald-700">
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              )}
                              <div>
                                <div className="font-medium text-slate-900">{s.name}</div>
                                <div className="text-xs text-slate-500"><code>{s.code}</code></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 capitalize">{s.category || "other"}</td>
                          <td className="p-3 text-right font-medium text-slate-900">{formatCurrency(s.defaultPrice)}</td>
                          <td className="p-3 text-right">
                            {can("settings.manage") && (
                              <Button size="sm" variant="ghost" onClick={() => setEditing(s)} className="h-8 w-8 p-0">
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={4} className="p-3 pl-10">
                              <FacilityPricesSection serviceId={s.id} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showNew && <ServiceDialog onClose={() => setShowNew(false)} />}
      {editing && <ServiceDialog service={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function FacilityPricesSection({ serviceId }: { serviceId: string }) {
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["service-facility-prices", serviceId],
    queryFn: () => fetchJson(`/api/services/${serviceId}`),
  });

  if (isLoading) return <div className="text-sm text-slate-500">Loading prices...</div>;

  const prices = data?.item?.facilityPrices || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase text-slate-600">Facility-Specific Prices</div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="gap-1 h-7">
          <Plus className="w-3 h-3" /> Add Price
        </Button>
      </div>

      {prices.length === 0 && !showForm && (
        <div className="text-sm text-slate-500 italic">No facility-specific prices. Default price applies at all facilities.</div>
      )}

      {prices.length > 0 && (
        <div className="space-y-1.5">
          {prices.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between bg-white border rounded p-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-sm font-medium text-slate-900">{p.facility?.name}</span>
                <code className="text-xs text-slate-500">{p.facility?.code}</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-emerald-700">{formatCurrency(p.price)}</span>
                <FacilityPriceEditor serviceId={serviceId} facilityId={p.facilityId} facilityName={p.facility?.name} currentPrice={p.price} onUpdated={() => refetch()} />
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="mt-2">
          <NewFacilityPriceForm serviceId={serviceId} onSaved={() => { setShowForm(false); refetch(); }} onCancel={() => setShowForm(false)} />
        </div>
      )}
    </div>
  );
}

function FacilityPriceEditor({ serviceId, facilityId, facilityName, currentPrice, onUpdated }: {
  serviceId: string;
  facilityId: string;
  facilityName: string;
  currentPrice: number;
  onUpdated: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [price, setPrice] = useState(String(currentPrice));

  const save = async () => {
    const res = await fetch(`/api/services/${serviceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_facility_price", facilityId, price: Number(price) }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error || "Failed");
      return;
    }
    toast.success(`Price for ${facilityName} updated`);
    setEdit(false);
    onUpdated();
  };

  if (!edit) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setEdit(true)} className="h-7 w-7 p-0">
        <Edit className="w-3 h-3" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-24 h-7" />
      <Button size="sm" onClick={save} className="h-7 bg-emerald-600 hover:bg-emerald-700">
        <Save className="w-3 h-3" />
      </Button>
    </div>
  );
}

function NewFacilityPriceForm({ serviceId, onSaved, onCancel }: {
  serviceId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [facilityId, setFacilityId] = useState("");
  const [price, setPrice] = useState("");

  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities-for-prices"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const facilities = facilitiesData?.facilities || [];

  const save = async () => {
    if (!facilityId || !price) {
      toast.error("Select facility and enter price");
      return;
    }
    const res = await fetch(`/api/services/${serviceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_facility_price", facilityId, price: Number(price) }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error || "Failed");
      return;
    }
    toast.success("Price set");
    onSaved();
  };

  return (
    <div className="flex gap-2 bg-white border rounded p-2">
      <Select value={facilityId} onValueChange={setFacilityId}>
        <SelectTrigger className="flex-1 h-7"><SelectValue placeholder="Select facility" /></SelectTrigger>
        <SelectContent>
          {facilities.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" className="w-32 h-7" />
      <Button size="sm" onClick={save} className="h-7 bg-emerald-600 hover:bg-emerald-700">Save</Button>
      <Button size="sm" variant="outline" onClick={onCancel} className="h-7">Cancel</Button>
    </div>
  );
}

function ServiceDialog({ service, onClose }: { service?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!service;
  const [form, setForm] = useState({
    name: service?.name || "",
    code: service?.code || "",
    category: service?.category || "other",
    description: service?.description || "",
    defaultPrice: service?.defaultPrice || 0,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/services/${service.id}` : "/api/services";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, defaultPrice: Number(form.defaultPrice) }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(isEdit ? "Service updated" : "Service created");
      qc.invalidateQueries({ queryKey: ["services-admin"] });
      qc.invalidateQueries({ queryKey: ["services"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Service" : "Add Service"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update service details." : "Add a new billable service to the catalog."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel required>Code</FieldLabel>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Default Price</Label>
              <Input type="number" value={form.defaultPrice} onChange={(e) => setForm({ ...form, defaultPrice: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name || !form.code} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <DollarSign className="w-4 h-4" />
            {isEdit ? "Save Changes" : "Create Service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

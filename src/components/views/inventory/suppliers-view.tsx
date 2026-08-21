"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Truck, Plus, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, safeJson, PageHeader} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function SuppliersView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editSupplier, setEditSupplier] = useState<any | null>(null);

  const qs = search ? `?q=${encodeURIComponent(search)}` : "";
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["suppliers", search],
    queryFn: () => fetchJson(`/api/suppliers${qs}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["suppliers"] });

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Suppliers"
        description="Manage suppliers and vendor relationships"
        icon={Truck}
        gradient="from-cyan-500 to-blue-600"
      
        actions={
                  <Button onClick={() => setShowNew(true)} disabled={!can("procurement.manage")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Supplier
        </Button>
        }
      />

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search by name, code, contact, phone, email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load suppliers" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No suppliers"
              description="Add your first supplier to begin creating purchase orders."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("procurement.manage")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Supplier</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Name</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Code</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Contact</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Phone</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Email</th>
                    <th className="text-left p-3 font-semibold text-slate-700">POs</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s: any) => (
                    <tr key={s.id} className="border-b hover:bg-emerald-50/40">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center">
                            <Truck className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">{s.name}</div>
                            {s.address && <div className="text-xs text-slate-500">{s.address}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs text-slate-700">{s.code}</td>
                      <td className="p-3 text-xs">{s.contactPerson || "—"}</td>
                      <td className="p-3 text-xs">{s.phone || "—"}</td>
                      <td className="p-3 text-xs">{s.email || "—"}</td>
                      <td className="p-3 text-xs text-slate-500">{s._count?.purchaseOrders ?? 0}</td>
                      <td className="p-3"><StatusBadge status={s.status} /></td>
                      <td className="p-3 text-right">
                        {can("procurement.manage") && (
                          <Button size="sm" variant="outline" onClick={() => setEditSupplier(s)} className="gap-1 h-7 text-xs">
                            <Pencil className="w-3 h-3" /> Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <SupplierDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} />
      {editSupplier && (
        <SupplierDialog open onClose={() => setEditSupplier(null)} onCreated={() => { setEditSupplier(null); invalidate(); }} existing={editSupplier} />
      )}
    </div>
  );
}

function SupplierDialog({ open, onClose, onCreated, existing }: {
  open: boolean; onClose: () => void; onCreated: () => void; existing?: any;
}) {
  const [name, setName] = useState(existing?.name || "");
  const [code, setCode] = useState(existing?.code || "");
  const [contactPerson, setContactPerson] = useState(existing?.contactPerson || "");
  const [phone, setPhone] = useState(existing?.phone || "");
  const [email, setEmail] = useState(existing?.email || "");
  const [address, setAddress] = useState(existing?.address || "");
  const [status, setStatus] = useState(existing?.status || "active");
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!existing;

  const handleSubmit = async () => {
    if (!name || !code) return toast.error("Name and code required");
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/suppliers/${existing.id}` : "/api/suppliers";
      const method = isEdit ? "PATCH" : "POST";
      const body: any = { name, code, contactPerson, phone, email, address, status };
      if (isEdit) body.action = "update";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(isEdit ? "Supplier updated" : "Supplier created");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Supplier" : "New Supplier"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update supplier information" : "Create a new supplier record (org-wide)"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <FieldLabel required className="text-xs">Name</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MediSource Ghana Ltd" />
            </div>
            <div>
              <FieldLabel required className="text-xs">Code</FieldLabel>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MS-001" disabled={isEdit} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Contact Person</Label>
              <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="John Mensah" />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233 24 000 0000" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sales@supplier.com" />
          </div>
          <div>
            <Label className="text-xs">Address</Label>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Street, City, Region" />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status || undefined} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Saving..." : (isEdit ? "Save Changes" : "Create Supplier")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

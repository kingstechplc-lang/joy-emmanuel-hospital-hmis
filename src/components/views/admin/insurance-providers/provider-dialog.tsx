"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PROVIDER_TYPES, PROVIDER_STATUSES } from "./shared";
import { safeJson } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

export function ProviderDialog({ provider, onClose }: { provider?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!provider;
  const [form, setForm] = useState<any>({
    name: provider?.name || "",
    code: provider?.code || "",
    legalName: provider?.legalName || "",
    shortName: provider?.shortName || "",
    displayName: provider?.displayName || "",
    providerType: provider?.providerType || "private",
    organizationType: provider?.organizationType || "",
    country: provider?.country || "",
    region: provider?.region || "",
    phone: provider?.phone || "",
    email: provider?.email || "",
    website: provider?.website || "",
    address: provider?.address || "",
    postalAddress: provider?.postalAddress || "",
    contactPerson: provider?.contactPerson || "",
    claimsContact: provider?.claimsContact || "",
    financeContact: provider?.financeContact || "",
    status: provider?.status || "active",
    effectiveDate: provider?.effectiveDate ? new Date(provider.effectiveDate).toISOString().slice(0, 10) : "",
    endDate: provider?.endDate ? new Date(provider.endDate).toISOString().slice(0, 10) : "",
    notes: provider?.notes || "",
  });
  const [duplicates, setDuplicates] = useState<any[] | null>(null);
  const [skipDupCheck, setSkipDupCheck] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/insurance-providers/${provider.id}` : "/api/insurance-providers";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, skipDuplicateCheck: skipDupCheck }),
      });
      if (!res.ok) {
        const e = await safeJson(res);
        if (e.code === "DUPLICATE_DETECTED" && e.duplicates) {
          setDuplicates(e.duplicates);
          throw new Error("DUPLICATE_DETECTED");
        }
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Provider updated" : "Provider created");
      qc.invalidateQueries({ queryKey: ["insurance-providers-admin"] });
      qc.invalidateQueries({ queryKey: ["insurance-provider-detail"] });
      onClose();
    },
    onError: (e: Error) => {
      if (e.message !== "DUPLICATE_DETECTED") toast.error(e.message);
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="large">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">{isEdit ? "Edit Insurance Provider" : "Add Insurance Provider"}</DialogTitle>
          <DialogDescription className="text-white/80">{isEdit ? "Update provider details. Use the details dialog for plans, contacts, and coverage." : "Add a new insurance provider to the master directory."}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {duplicates && duplicates.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded p-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                <AlertTriangle className="w-4 h-4" /> Possible duplicate provider detected
              </div>
              <div className="space-y-1">
                {duplicates.map((d: any) => (
                  <div key={d.id} className="text-xs text-amber-800">
                    <span className="font-medium">{d.name}</span> <code className="ml-1">{d.code}</code> — {d.status}
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-amber-900">
                <input type="checkbox" checked={skipDupCheck} onChange={(e) => setSkipDupCheck(e.target.checked)} className="rounded" />
                Override warning and create anyway (confirm this is a distinct provider)
              </label>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><FieldLabel required>Provider Name</FieldLabel><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., ABC Health Insurance" /></div>
            <div><FieldLabel required>Provider Code</FieldLabel><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g., ABC-HI" /></div>
            <div><Label>Legal Name</Label><Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} placeholder="Registered legal name" /></div>
            <div><Label>Short Name</Label><Input value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} placeholder="e.g., ABC" /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Provider Type</Label>
              <Select value={form.providerType} onValueChange={(v) => setForm({ ...form, providerType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROVIDER_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Organization Type</Label><Input value={form.organizationType} onChange={(e) => setForm({ ...form, organizationType: e.target.value })} placeholder="e.g., Limited, NGO" /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+233 30 123 4567" /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="claims@provider.com" /></div>
            <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." /></div>
          </div>
          <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Ghana" /></div>
            <div><Label>Region</Label><Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></div>
            <div><Label>Postal Address</Label><Input value={form.postalAddress} onChange={(e) => setForm({ ...form, postalAddress: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Contact Person</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
            <div><Label>Claims Contact</Label><Input value={form.claimsContact} onChange={(e) => setForm({ ...form, claimsContact: e.target.value })} /></div>
            <div><Label>Finance Contact</Label><Input value={form.financeContact} onChange={(e) => setForm({ ...form, financeContact: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROVIDER_STATUSES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Effective Date</Label><Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} /></div>
            <div><Label>End Date</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name || !form.code} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Save className="w-4 h-4" /> {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Save, Building2, Phone, Mail, Globe, MapPin, Calendar,
  Layers, Users, FileText, Shield, Hospital,
} from "lucide-react";
import { toast } from "sonner";
import {
  PROVIDER_TYPES, PROVIDER_STATUSES, PLAN_TYPES, CONTACT_TYPES,
  labelOf, statusColor, fetchJson,
} from "./shared";
import { formatDate, safeJson } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

export function ProviderDetailsDialog({ providerId, onClose }: { providerId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["insurance-provider-detail", providerId],
    queryFn: () => fetchJson(`/api/insurance-providers/${providerId}`),
  });
  const p = data?.item;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["insurance-provider-detail", providerId] });
    qc.invalidateQueries({ queryKey: ["insurance-providers-admin"] });
  };

  if (isLoading) return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <div className="p-8 text-center text-slate-500">Loading provider details…</div>
      </DialogContent>
    </Dialog>
  );
  if (isError || !p) return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 gap-0 flex flex-col overflow-hidden">
        <div className="p-8 text-center text-rose-600">Failed to load provider details.</div>
        <div className="flex justify-center pb-4"><Button variant="outline" onClick={() => refetch()}>Retry</Button></div>
      </DialogContent>
    </Dialog>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="text-white flex items-center gap-2 text-xl flex-wrap">
            <Building2 className="w-5 h-5 text-emerald-600" />
            <span>{p.name}</span>
            <Badge variant="outline" className="ml-2 font-mono">{p.code}</Badge>
            <Badge className={`bg-${statusColor(p.status)}-100 text-${statusColor(p.status)}-700`}>{labelOf(PROVIDER_STATUSES, p.status)}</Badge>
            <Badge className="bg-blue-100 text-blue-700">{labelOf(PROVIDER_TYPES, p.providerType)}</Badge>
          </DialogTitle>
          <DialogDescription className="text-white/80 break-words">
            {p.legalName && <span className="mr-2">Legal: {p.legalName}</span>}
            {p.shortName && <span className="mr-2">· Short: {p.shortName}</span>}
            {p.displayName && <span>· Display: {p.displayName}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex flex-wrap h-auto w-full mb-3">
              <TabsTrigger value="overview" className="gap-1.5"><Building2 className="w-4 h-4" /> Overview</TabsTrigger>
              <TabsTrigger value="plans" className="gap-1.5"><Layers className="w-4 h-4" /> Plans ({p.plans?.length || 0})</TabsTrigger>
              <TabsTrigger value="contacts" className="gap-1.5"><Users className="w-4 h-4" /> Contacts ({p.contacts?.length || 0})</TabsTrigger>
              <TabsTrigger value="facilities" className="gap-1.5"><Hospital className="w-4 h-4" /> Facilities</TabsTrigger>
              <TabsTrigger value="claims" className="gap-1.5"><FileText className="w-4 h-4" /> Claims Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-3 mt-3">
              <OverviewTab provider={p} onChanged={invalidateAll} />
            </TabsContent>
            <TabsContent value="plans" className="space-y-3 mt-3">
              <PlansTab providerId={p.id} items={p.plans || []} onChanged={invalidateAll} />
            </TabsContent>
            <TabsContent value="contacts" className="space-y-3 mt-3">
              <ContactsTab providerId={p.id} items={p.contacts || []} onChanged={invalidateAll} />
            </TabsContent>
            <TabsContent value="facilities" className="space-y-3 mt-3">
              <FacilitiesTab providerId={p.id} items={p.facilityRelationships || []} onChanged={invalidateAll} />
            </TabsContent>
            <TabsContent value="claims" className="space-y-3 mt-3">
              <ClaimsSummaryTab provider={p} />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// OVERVIEW TAB — edit provider master fields
// =====================================================================
function OverviewTab({ provider, onChanged }: { provider: any; onChanged: () => void }) {
  const [form, setForm] = useState<any>({
    name: provider.name || "",
    code: provider.code || "",
    legalName: provider.legalName || "",
    shortName: provider.shortName || "",
    displayName: provider.displayName || "",
    providerType: provider.providerType || "private",
    organizationType: provider.organizationType || "",
    country: provider.country || "",
    region: provider.region || "",
    phone: provider.phone || "",
    email: provider.email || "",
    website: provider.website || "",
    address: provider.address || "",
    postalAddress: provider.postalAddress || "",
    contactPerson: provider.contactPerson || "",
    claimsContact: provider.claimsContact || "",
    financeContact: provider.financeContact || "",
    status: provider.status || "active",
    effectiveDate: provider.effectiveDate ? new Date(provider.effectiveDate).toISOString().slice(0, 10) : "",
    endDate: provider.endDate ? new Date(provider.endDate).toISOString().slice(0, 10) : "",
    notes: provider.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/insurance-providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Provider updated");
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Identity</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><FieldLabel required>Provider Name</FieldLabel><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><FieldLabel required>Provider Code</FieldLabel><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>Legal Name</Label><Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} /></div>
            <div><Label>Short Name</Label><Input value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></div>
            <div><Label>Display Name</Label><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
            <div><Label>Provider Type</Label>
              <Select value={form.providerType} onValueChange={(v) => setForm({ ...form, providerType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROVIDER_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Contact Information</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g., +233 30 123 4567" /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g., claims@provider.com" /></div>
            <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="e.g., https://provider.com" /></div>
            <div><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="e.g., Ghana" /></div>
            <div><Label>Region</Label><Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></div>
            <div><Label>Organization Type</Label><Input value={form.organizationType} onChange={(e) => setForm({ ...form, organizationType: e.target.value })} /></div>
          </div>
          <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
          <div><Label>Postal Address</Label><Input value={form.postalAddress} onChange={(e) => setForm({ ...form, postalAddress: e.target.value })} /></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Contact Person</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
            <div><Label>Claims Contact</Label><Input value={form.claimsContact} onChange={(e) => setForm({ ...form, claimsContact: e.target.value })} /></div>
            <div><Label>Finance Contact</Label><Input value={form.financeContact} onChange={(e) => setForm({ ...form, financeContact: e.target.value })} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Status & Dates</div>
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
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || !form.name || !form.code} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

// =====================================================================
// PLANS TAB
// =====================================================================
function PlansTab({ providerId, items, onChanged }: { providerId: string; items: any[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({
    code: "", name: "", shortName: "", description: "", planType: "individual",
    coveragePercentage: "", fixedCopayment: "", deductible: "", annualLimit: "", visitLimit: "",
    authorizationRequired: false, referralRequired: false,
    status: "active", effectiveDate: "", endDate: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!form.code || !form.name) { toast.error("Code and name are required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/insurance-providers/${providerId}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          coveragePercentage: form.coveragePercentage === "" ? null : Number(form.coveragePercentage),
          fixedCopayment: form.fixedCopayment === "" ? null : Number(form.fixedCopayment),
          deductible: form.deductible === "" ? null : Number(form.deductible),
          annualLimit: form.annualLimit === "" ? null : Number(form.annualLimit),
          visitLimit: form.visitLimit === "" ? null : Number(form.visitLimit),
        }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Plan created");
      setForm({ code: "", name: "", shortName: "", description: "", planType: "individual", coveragePercentage: "", fixedCopayment: "", deductible: "", annualLimit: "", visitLimit: "", authorizationRequired: false, referralRequired: false, status: "active", effectiveDate: "", endDate: "", notes: "" });
      setAdding(false);
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-sm font-semibold text-slate-700">Insurance Plans ({items.length})</div>
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Plan</Button>
        </div>
        {adding && (
          <div className="border rounded p-3 space-y-3 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><FieldLabel required>Plan Code</FieldLabel><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g., PREM-001" /></div>
              <div><FieldLabel required>Plan Name</FieldLabel><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Premium Plan" /></div>
              <div><Label>Plan Type</Label>
                <Select value={form.planType} onValueChange={(v) => setForm({ ...form, planType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PLAN_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div><Label>Coverage %</Label><Input type="number" value={form.coveragePercentage} onChange={(e) => setForm({ ...form, coveragePercentage: e.target.value })} placeholder="e.g., 80" /></div>
              <div><Label>Fixed Copay</Label><Input type="number" value={form.fixedCopayment} onChange={(e) => setForm({ ...form, fixedCopayment: e.target.value })} placeholder="e.g., 5.00" /></div>
              <div><Label>Deductible</Label><Input type="number" value={form.deductible} onChange={(e) => setForm({ ...form, deductible: e.target.value })} /></div>
              <div><Label>Annual Limit</Label><Input type="number" value={form.annualLimit} onChange={(e) => setForm({ ...form, annualLimit: e.target.value })} /></div>
              <div><Label>Visit Limit</Label><Input type="number" value={form.visitLimit} onChange={(e) => setForm({ ...form, visitLimit: e.target.value })} /></div>
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
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.authorizationRequired} onCheckedChange={(v) => setForm({ ...form, authorizationRequired: !!v })} /> Authorization Required</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.referralRequired} onCheckedChange={(v) => setForm({ ...form, referralRequired: !!v })} /> Referral Required</label>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={add} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2"><Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Plan"}</Button>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <div className="text-sm text-slate-500 p-3 text-center bg-slate-50 rounded">No plans configured. Add a plan to define coverage rules.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left p-2 font-semibold text-slate-700">Plan</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Coverage</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Copay</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Auth/Referral</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Dates</th>
                </tr>
              </thead>
              <tbody>
                {items.map((plan: any) => (
                  <tr key={plan.id} className="border-b hover:bg-slate-50">
                    <td className="p-2">
                      <div className="font-medium text-slate-900">{plan.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{plan.code}</div>
                    </td>
                    <td className="p-2">{labelOf(PLAN_TYPES, plan.planType)}</td>
                    <td className="p-2 text-xs">{plan.coveragePercentage != null ? `${plan.coveragePercentage}%` : "—"}</td>
                    <td className="p-2 text-xs">{plan.fixedCopayment != null ? `GH¢ ${plan.fixedCopayment}` : "—"}</td>
                    <td className="p-2 text-xs">
                      {plan.authorizationRequired && <Badge className="bg-amber-100 text-amber-700 mr-1">Auth</Badge>}
                      {plan.referralRequired && <Badge className="bg-blue-100 text-blue-700">Referral</Badge>}
                      {!plan.authorizationRequired && !plan.referralRequired && "—"}
                    </td>
                    <td className="p-2"><Badge className={`bg-${statusColor(plan.status)}-100 text-${statusColor(plan.status)}-700`}>{plan.status}</Badge></td>
                    <td className="p-2 text-xs">{formatDate(plan.effectiveDate)} → {formatDate(plan.endDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// CONTACTS TAB
// =====================================================================
function ContactsTab({ providerId, items, onChanged }: { providerId: string; items: any[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ contactType: "general", name: "", position: "", phone: "", email: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!form.name) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/insurance-providers/${providerId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Contact added");
      setForm({ contactType: "general", name: "", position: "", phone: "", email: "", notes: "" });
      setAdding(false);
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const remove = async (contactId: string) => {
    if (!confirm("Remove this contact?")) return;
    const res = await fetch(`/api/insurance-providers/${providerId}/contacts?contactId=${contactId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Removed"); onChanged(); } else { toast.error("Failed"); }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-sm font-semibold text-slate-700">Contacts ({items.length})</div>
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Contact</Button>
        </div>
        {adding && (
          <div className="border rounded p-3 space-y-2 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><FieldLabel required>Name</FieldLabel><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Contact Type</Label>
                <Select value={form.contactType} onValueChange={(v) => setForm({ ...form, contactType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTACT_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Position</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={add} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2"><Save className="w-4 h-4" /> Save</Button>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <div className="text-sm text-slate-500 p-3 text-center bg-slate-50 rounded">No contacts configured.</div>
        ) : (
          <div className="space-y-2">
            {items.map((c: any) => (
              <div key={c.id} className="border rounded p-3 bg-white flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{c.name}</span>
                    <Badge variant="outline">{labelOf(CONTACT_TYPES, c.contactType)}</Badge>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-3">
                    {c.position && <span>{c.position}</span>}
                    {c.phone && <span><Phone className="w-3 h-3 inline mr-1" />{c.phone}</span>}
                    {c.email && <span><Mail className="w-3 h-3 inline mr-1" />{c.email}</span>}
                  </div>
                  {c.notes && <div className="text-xs text-slate-600 mt-1">{c.notes}</div>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(c.id)} className="text-rose-600 hover:bg-rose-50 h-8 w-8 p-0"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// FACILITIES TAB
// =====================================================================
function FacilitiesTab({ providerId, items, onChanged }: { providerId: string; items: any[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ facilityId: "", availability: "available", contractReference: "", effectiveDate: "", endDate: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!form.facilityId) { toast.error("Facility ID is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/insurance-providers/${providerId}/facilities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Facility relationship saved");
      setForm({ facilityId: "", availability: "available", contractReference: "", effectiveDate: "", endDate: "", notes: "" });
      setAdding(false);
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const remove = async (facilityId: string) => {
    if (!confirm("Remove this facility relationship?")) return;
    const res = await fetch(`/api/insurance-providers/${providerId}/facilities?facilityId=${facilityId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Removed"); onChanged(); } else { toast.error("Failed"); }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-sm font-semibold text-slate-700">Facility Relationships ({items.length})</div>
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Facility</Button>
        </div>
        {adding && (
          <div className="border rounded p-3 space-y-2 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><FieldLabel required>Facility ID</FieldLabel><Input value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value })} placeholder="cuid..." /></div>
              <div><Label>Availability</Label>
                <Select value={form.availability} onValueChange={(v) => setForm({ ...form, availability: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="unavailable">Unavailable</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Contract Reference</Label><Input value={form.contractReference} onChange={(e) => setForm({ ...form, contractReference: e.target.value })} /></div>
              <div><Label>Effective Date</Label><Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} /></div>
              <div><Label>End Date</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={add} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2"><Save className="w-4 h-4" /> Save</Button>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <div className="text-sm text-slate-500 p-3 text-center bg-slate-50 rounded">No facility relationships. Provider is available org-wide by default.</div>
        ) : (
          <div className="space-y-2">
            {items.map((f: any) => (
              <div key={f.id} className="border rounded p-3 bg-white flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900">Facility: {f.facilityId}</span>
                  <Badge className={`ml-2 bg-${f.availability === "available" ? "emerald" : "amber"}-100 text-${f.availability === "available" ? "emerald" : "amber"}-700`}>{f.availability}</Badge>
                  {f.contractReference && <span className="ml-2 text-xs text-slate-500">Contract: {f.contractReference}</span>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(f.facilityId)} className="text-rose-600 hover:bg-rose-50 h-8 w-8 p-0"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// CLAIMS SUMMARY TAB
// =====================================================================
function ClaimsSummaryTab({ provider }: { provider: any }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card><CardContent className="p-4 text-center">
        <div className="text-2xl font-bold text-slate-900">{provider._count?.patientInsurance || 0}</div>
        <div className="text-xs text-slate-500">Patients Covered</div>
      </CardContent></Card>
      <Card><CardContent className="p-4 text-center">
        <div className="text-2xl font-bold text-slate-900">{provider._count?.insuranceClaims || 0}</div>
        <div className="text-xs text-slate-500">Total Claims</div>
      </CardContent></Card>
      <Card><CardContent className="p-4 text-center">
        <div className="text-2xl font-bold text-slate-900">{provider._count?.plans || 0}</div>
        <div className="text-xs text-slate-500">Active Plans</div>
      </CardContent></Card>
      <Card><CardContent className="p-4 text-center">
        <div className="text-2xl font-bold text-slate-900">{provider._count?.contacts || 0}</div>
        <div className="text-xs text-slate-500">Contacts</div>
      </CardContent></Card>
    </div>
  );
}

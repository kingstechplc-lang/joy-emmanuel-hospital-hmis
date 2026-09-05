"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Save, FlaskConical, Microscope, AlertTriangle, Activity,
  Layers, Building2, FileClock, Beaker, ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import {
  TEST_CATEGORIES, TEST_TYPES, RESULT_TYPES, PRIORITIES, BILLABLE_AS,
  CLAIMABLE_STATUSES, SEX_OPTIONS, AGE_GROUPS,
  labelOf, statusColor, formatCurrency, tatLabel, fetchJson,
} from "./shared";
import { formatDate, safeJson, ClearableSearch} from "@/components/ui-helpers"
import { FieldLabel } from "@/components/ui/required-label";
import { MasterCombobox } from "./master-combobox";

export function TestDetailsDialog({ testId, onClose }: { testId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["lab-test-detail", testId],
    queryFn: () => fetchJson(`/api/lab-tests/${testId}?detail=full`),
  });
  const t = data?.item;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["lab-test-detail", testId] });
    qc.invalidateQueries({ queryKey: ["lab-tests-admin"] });
    qc.invalidateQueries({ queryKey: ["lab-tests"] });
  };

  if (isLoading) return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-slate-500">Loading test details…</div>
      </DialogContent>
    </Dialog>
  );
  if (isError || !t) return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl flex flex-col p-0 gap-0 overflow-hidden">
        <div className="p-8 text-center text-rose-600">Failed to load test details.</div>
        <div className="flex justify-center pb-4"><Button variant="outline" onClick={() => refetch()}>Retry</Button></div>
      </DialogContent>
    </Dialog>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-purple-600 to-violet-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2 text-xl flex-wrap">
            <FlaskConical className="w-5 h-5 text-emerald-600" />
            <span>{t.name}</span>
            <Badge variant="outline" className="ml-2 font-mono">{t.code}</Badge>
            {t.isPanel && <Badge className="bg-violet-100 text-violet-700">Panel</Badge>}
            {t.isReferralOut && <Badge className="bg-blue-100 text-blue-700">Referral</Badge>}
            <Badge className={`bg-${statusColor(t.status)}-100 text-${statusColor(t.status)}-700`}>{labelOf(TEST_STATUSES_LOCAL, t.status)}</Badge>
          </DialogTitle>
          <DialogDescription className="text-white/80 break-words">
            {t.shortName && <span className="mr-2">Short: {t.shortName}</span>}
            {t.displayName && <span className="mr-2">· Display: {t.displayName}</span>}
            {t.description && <span>· {t.description}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex flex-wrap h-auto w-full mb-3">
              <TabsTrigger value="overview" className="gap-1.5"><Activity className="w-4 h-4" /> Overview</TabsTrigger>
              <TabsTrigger value="specimen" className="gap-1.5"><Microscope className="w-4 h-4" /> Specimen</TabsTrigger>
              <TabsTrigger value="components" className="gap-1.5"><Layers className="w-4 h-4" /> Components</TabsTrigger>
              <TabsTrigger value="ranges" className="gap-1.5"><Beaker className="w-4 h-4" /> Ref Ranges</TabsTrigger>
              <TabsTrigger value="critical" className="gap-1.5"><AlertTriangle className="w-4 h-4" /> Critical</TabsTrigger>
              <TabsTrigger value="options" className="gap-1.5"><ListChecks className="w-4 h-4" /> Result Options</TabsTrigger>
              <TabsTrigger value="facility" className="gap-1.5"><Building2 className="w-4 h-4" /> Facility</TabsTrigger>
              <TabsTrigger value="audit" className="gap-1.5"><FileClock className="w-4 h-4" /> Audit</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-3 mt-3">
              <OverviewTab test={t} onChanged={invalidateAll} />
            </TabsContent>
            <TabsContent value="specimen" className="space-y-3 mt-3">
              <SpecimenTab testId={t.id} items={t.specimenConfigs || []} onChanged={invalidateAll} />
            </TabsContent>
            <TabsContent value="components" className="space-y-3 mt-3">
              <ComponentsTab testId={t.id} items={t.components || []} panelMembers={t.panelMemberships || []} onChanged={invalidateAll} />
            </TabsContent>
            <TabsContent value="ranges" className="space-y-3 mt-3">
              <ReferenceRangesTab testId={t.id} items={t.referenceRanges || []} onChanged={invalidateAll} />
            </TabsContent>
            <TabsContent value="critical" className="space-y-3 mt-3">
              <CriticalValuesTab testId={t.id} items={t.criticalValues || []} onChanged={invalidateAll} />
            </TabsContent>
            <TabsContent value="options" className="space-y-3 mt-3">
              <ResultOptionsTab testId={t.id} items={t.resultOptions || []} onChanged={invalidateAll} />
            </TabsContent>
            <TabsContent value="facility" className="space-y-3 mt-3">
              <FacilityAvailabilityTab testId={t.id} items={t.facilityAvailability || []} onChanged={invalidateAll} />
            </TabsContent>
            <TabsContent value="audit" className="space-y-3 mt-3">
              <AuditTab items={t.catalogAudits || []} />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const TEST_STATUSES_LOCAL = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "temporarily_unavailable", label: "Temporarily Unavailable" },
  { value: "referral_out", label: "Referral Out" },
  { value: "retired", label: "Retired" },
  { value: "archived", label: "Archived" },
];

// =====================================================================
// OVERVIEW TAB — test identity + financial + TAT inline editor
// =====================================================================
function OverviewTab({ test, onChanged }: { test: any; onChanged: () => void }) {
  const [form, setForm] = useState({
    name: test.name || "",
    code: test.code || "",
    shortName: test.shortName || "",
    displayName: test.displayName || "",
    description: test.description || "",
    category: test.category || "other",
    testType: test.testType || "single",
    resultType: test.resultType || "numeric",
    unit: test.unit || "",
    referenceRange: test.referenceRange || "",
    price: test.price || 0,
    status: test.status || "active",
    priority: test.priority || "routine",
    isPanel: !!test.isPanel,
    isReferralOut: !!test.isReferralOut,
    referralLab: test.referralLab || "",
    isBillable: test.isBillable !== false,
    billableAs: test.billableAs || "individual",
    tatMinutes: test.tatMinutes ?? "",
    tatRoutineMin: test.tatRoutineMin ?? "",
    tatUrgentMin: test.tatUrgentMin ?? "",
    tatStatMin: test.tatStatMin ?? "",
    serviceId: test.serviceId || "",
    nhisEligible: !!test.nhisEligible,
    nhisServiceCode: test.nhisServiceCode || "",
    nhisTariffRef: test.nhisTariffRef || "",
    claimableStatus: test.claimableStatus || "not_configured",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-tests/${test.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          price: Number(form.price) || 0,
          tatMinutes: form.tatMinutes === "" ? null : Number(form.tatMinutes),
          tatRoutineMin: form.tatRoutineMin === "" ? null : Number(form.tatRoutineMin),
          tatUrgentMin: form.tatUrgentMin === "" ? null : Number(form.tatUrgentMin),
          tatStatMin: form.tatStatMin === "" ? null : Number(form.tatStatMin),
          serviceId: form.serviceId || null,
        }),
      });
      if (!res.ok) {
        const e = await safeJson(res);
        throw new Error(e.error || "Failed");
      }
      toast.success("Test updated");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Test Name</FieldLabel>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <FieldLabel required>Test Code</FieldLabel>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <Label>Short Name</Label>
              <Input value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} placeholder="e.g., FBC" />
            </div>
            <div>
              <Label>Display Name</Label>
              <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Patient-facing name" />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEST_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Test Type</Label>
              <Select value={form.testType} onValueChange={(v) => setForm({ ...form, testType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEST_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Result Type</Label>
              <Select value={form.resultType} onValueChange={(v) => setForm({ ...form, resultType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESULT_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <MasterCombobox
                label="Unit"
                endpoint="/api/lab-tests/units?status=active"
                value={form.unit}
                onChange={(v) => setForm({ ...form, unit: v })}
                placeholder="Select or type unit…"
                searchPlaceholder="Search units…"
                fieldLabel="unit"
              />
            </div>
            <div>
              <Label>Reference Range (legacy text)</Label>
              <Input value={form.referenceRange} onChange={(e) => setForm({ ...form, referenceRange: e.target.value })} placeholder="e.g., 70-110" />
            </div>
            <div>
              <Label>Default Price (legacy)</Label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Operations</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEST_STATUSES_LOCAL.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>TAT (minutes)</Label>
              <Input type="number" value={form.tatMinutes} onChange={(e) => setForm({ ...form, tatMinutes: e.target.value === "" ? "" : Number(e.target.value) })} />
            </div>
            <div>
              <Label>Referral Lab</Label>
              <Input value={form.referralLab} onChange={(e) => setForm({ ...form, referralLab: e.target.value })} placeholder="External lab name" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>TAT Routine (min)</Label>
              <Input type="number" value={form.tatRoutineMin} onChange={(e) => setForm({ ...form, tatRoutineMin: e.target.value === "" ? "" : Number(e.target.value) })} />
            </div>
            <div>
              <Label>TAT Urgent (min)</Label>
              <Input type="number" value={form.tatUrgentMin} onChange={(e) => setForm({ ...form, tatUrgentMin: e.target.value === "" ? "" : Number(e.target.value) })} />
            </div>
            <div>
              <Label>TAT STAT (min)</Label>
              <Input type="number" value={form.tatStatMin} onChange={(e) => setForm({ ...form, tatStatMin: e.target.value === "" ? "" : Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isPanel} onCheckedChange={(v) => setForm({ ...form, isPanel: !!v })} /> Is Panel / Profile</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isReferralOut} onCheckedChange={(v) => setForm({ ...form, isReferralOut: !!v })} /> Referral / Outsourced</label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Financial & NHIS</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Billable</Label>
              <Switch checked={form.isBillable} onCheckedChange={(v) => setForm({ ...form, isBillable: v })} />
            </div>
            <div>
              <Label>Billable As</Label>
              <Select value={form.billableAs} onValueChange={(v) => setForm({ ...form, billableAs: v })} disabled={!form.isBillable}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLABLE_AS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service ID (Services & Pricing)</Label>
              <Input value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })} placeholder="cuid..." />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.nhisEligible} onCheckedChange={(v) => setForm({ ...form, nhisEligible: !!v })} /> NHIS Eligible</label>
            <div></div>
            <div>
              <Label>NHIS Service Code</Label>
              <Input value={form.nhisServiceCode} onChange={(e) => setForm({ ...form, nhisServiceCode: e.target.value })} placeholder="Authoritative NHIS code only" />
            </div>
            <div>
              <Label>NHIS Tariff Reference</Label>
              <Input value={form.nhisTariffRef} onChange={(e) => setForm({ ...form, nhisTariffRef: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Claimable Status</Label>
            <Select value={form.claimableStatus} onValueChange={(v) => setForm({ ...form, claimableStatus: v })}>
              <SelectTrigger className="md:w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLAIMABLE_STATUSES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
// SPECIMEN TAB
// =====================================================================
function SpecimenTab({ testId, items, onChanged }: { testId: string; items: any[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({
    specimenType: "", isPrimary: false, container: "", minVolume: "",
    collectionRequirements: "", processingRequirements: "", storageRequirements: "",
    transportRequirements: "", stabilityInfo: "", fastingRequired: false,
    timingRequired: "", specialPreparation: "", collectionNotes: "",
  });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!form.specimenType) { toast.error("Specimen type is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-tests/${testId}/specimens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Specimen configuration added");
      setForm({ specimenType: "", isPrimary: false, container: "", minVolume: "", collectionRequirements: "", processingRequirements: "", storageRequirements: "", transportRequirements: "", stabilityInfo: "", fastingRequired: false, timingRequired: "", specialPreparation: "", collectionNotes: "" });
      setAdding(false);
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this specimen configuration?")) return;
    const res = await fetch(`/api/lab-tests/${testId}/specimens?specimenId=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Removed"); onChanged(); } else { toast.error("Failed"); }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-sm font-semibold text-slate-700">Specimen Configurations ({items.length})</div>
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Specimen
          </Button>
        </div>
        {adding && (
          <div className="border rounded p-3 space-y-3 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <MasterCombobox
                  label="Specimen Type"
                  required
                  endpoint="/api/lab-tests/specimen-types?status=active"
                  value={form.specimenType}
                  onChange={(v) => setForm({ ...form, specimenType: v })}
                  placeholder="Select or type specimen…"
                  searchPlaceholder="Search specimens…"
                  fieldLabel="specimen"
                />
              </div>
              <div>
                <Label>Container</Label>
                <Input value={form.container} onChange={(e) => setForm({ ...form, container: e.target.value })} placeholder="e.g., EDTA tube" />
              </div>
              <div>
                <Label>Minimum Volume</Label>
                <Input value={form.minVolume} onChange={(e) => setForm({ ...form, minVolume: e.target.value })} placeholder="e.g., 3 mL" />
              </div>
              <div>
                <Label>Timing</Label>
                <Input value={form.timingRequired} onChange={(e) => setForm({ ...form, timingRequired: e.target.value })} placeholder="e.g., Morning fasting" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label>Collection Requirements</Label><Textarea value={form.collectionRequirements} onChange={(e) => setForm({ ...form, collectionRequirements: e.target.value })} rows={2} /></div>
              <div><Label>Processing Requirements</Label><Textarea value={form.processingRequirements} onChange={(e) => setForm({ ...form, processingRequirements: e.target.value })} rows={2} /></div>
              <div><Label>Storage</Label><Textarea value={form.storageRequirements} onChange={(e) => setForm({ ...form, storageRequirements: e.target.value })} rows={2} /></div>
              <div><Label>Transport</Label><Textarea value={form.transportRequirements} onChange={(e) => setForm({ ...form, transportRequirements: e.target.value })} rows={2} /></div>
              <div><Label>Stability Info</Label><Input value={form.stabilityInfo} onChange={(e) => setForm({ ...form, stabilityInfo: e.target.value })} /></div>
              <div><Label>Special Preparation</Label><Input value={form.specialPreparation} onChange={(e) => setForm({ ...form, specialPreparation: e.target.value })} /></div>
              <div><Label>Collection Notes</Label><Input value={form.collectionNotes} onChange={(e) => setForm({ ...form, collectionNotes: e.target.value })} /></div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.fastingRequired} onCheckedChange={(v) => setForm({ ...form, fastingRequired: !!v })} /> Fasting Required</label>
                <label className="flex items-center gap-2 text-sm ml-4"><Checkbox checked={form.isPrimary} onCheckedChange={(v) => setForm({ ...form, isPrimary: !!v })} /> Primary specimen</label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={add} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <div className="text-sm text-slate-500 p-3 text-center bg-slate-50 rounded">No specimen configurations. Add one to drive collection workflow.</div>
        ) : (
          <div className="space-y-2">
            {items.map((s: any) => (
              <div key={s.id} className="border rounded p-3 bg-white">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{s.specimenType}</span>
                      {s.isPrimary && <Badge className="bg-emerald-100 text-emerald-700">Primary</Badge>}
                      {s.fastingRequired && <Badge className="bg-amber-100 text-amber-700">Fasting</Badge>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 grid grid-cols-2 md:grid-cols-4 gap-2">
                      {s.container && <div>Container: {s.container}</div>}
                      {s.minVolume && <div>Min Vol: {s.minVolume}</div>}
                      {s.timingRequired && <div>Timing: {s.timingRequired}</div>}
                      {s.specialPreparation && <div>Prep: {s.specialPreparation}</div>}
                    </div>
                    {s.collectionRequirements && <div className="text-xs text-slate-600 mt-1">Collection: {s.collectionRequirements}</div>}
                    {s.processingRequirements && <div className="text-xs text-slate-600">Processing: {s.processingRequirements}</div>}
                    {s.storageRequirements && <div className="text-xs text-slate-600">Storage: {s.storageRequirements}</div>}
                    {s.transportRequirements && <div className="text-xs text-slate-600">Transport: {s.transportRequirements}</div>}
                    {s.collectionNotes && <div className="text-xs text-slate-600">Notes: {s.collectionNotes}</div>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => remove(s.id)} className="text-rose-600 hover:bg-rose-50 h-8 w-8 p-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// COMPONENTS TAB — for panel tests, manage inline component definitions
// and panel memberships (component tests)
// =====================================================================
function ComponentsTab({ testId, items, panelMembers, onChanged }: { testId: string; items: any[]; panelMembers: any[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ componentName: "", componentCode: "", resultType: "numeric", unit: "", referenceRange: "", criticalLow: "", criticalHigh: "", decimalPrecision: "", displayOrder: 0 });
  const [saving, setSaving] = useState(false);

  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const add = async () => {
    if (!form.componentName) { toast.error("Component name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-tests/${testId}/components`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          criticalLow: form.criticalLow === "" ? null : Number(form.criticalLow),
          criticalHigh: form.criticalHigh === "" ? null : Number(form.criticalHigh),
          decimalPrecision: form.decimalPrecision === "" ? null : Number(form.decimalPrecision),
          displayOrder: Number(form.displayOrder) || 0,
        }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Component added");
      setForm({ componentName: "", componentCode: "", resultType: "numeric", unit: "", referenceRange: "", criticalLow: "", criticalHigh: "", decimalPrecision: "", displayOrder: 0 });
      setAdding(false);
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  const removeComponent = async (id: string) => {
    if (!confirm("Remove this component?")) return;
    const res = await fetch(`/api/lab-tests/${testId}/components?componentId=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Removed"); onChanged(); } else { toast.error("Failed"); }
  };
  const removeMember = async (componentTestId: string) => {
    const res = await fetch(`/api/lab-tests/${testId}/panel-members?componentTestId=${componentTestId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Removed from panel"); onChanged(); } else { toast.error("Failed"); }
  };

  const searchTests = async () => {
    if (memberSearch.length < 2) return;
    setSearching(true);
    try {
      const data = await fetchJson(`/api/lab-tests?q=${encodeURIComponent(memberSearch)}&status=active`);
      setMemberResults(data.items || []);
    } catch { setMemberResults([]); } finally { setSearching(false); }
  };
  const addMember = async (componentTestId: string) => {
    const res = await fetch(`/api/lab-tests/${testId}/panel-members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ componentTestId }),
    });
    if (res.ok) { toast.success("Added to panel"); setMemberSearch(""); setMemberResults([]); onChanged(); }
    else { const e = await safeJson(res); toast.error(e.error || "Failed"); }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="text-sm font-semibold text-slate-700">Panel Members ({panelMembers.length})</div>
            <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Component Definition
            </Button>
          </div>
          <div className="text-xs text-slate-500">
            Panel members are existing catalog tests linked to this panel. Component definitions are inline sub-result rows for tests like FBC components (Hb, WBC, etc.).
          </div>

          {panelMembers.length === 0 ? (
            <div className="text-sm text-slate-500 p-3 text-center bg-slate-50 rounded">No members. Search and link component tests below.</div>
          ) : (
            <div className="space-y-2">
              {panelMembers.map((m: any) => (
                <div key={m.id} className="border rounded p-2 bg-white flex items-center justify-between">
                  <div>
                    <span className="font-medium text-slate-900">{m.componentTest?.name}</span>
                    <span className="ml-2 text-xs text-slate-500 font-mono">{m.componentTest?.code}</span>
                    {m.componentTest?.unit && <span className="ml-2 text-xs text-slate-500">· {m.componentTest.unit}</span>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removeMember(m.componentTestId)} className="text-rose-600 hover:bg-rose-50 h-8 w-8 p-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <ClearableSearch value={memberSearch} onChange={setMemberSearch} placeholder="Search catalog to link as panel member..." className="flex-1" inputClassName="" />
            <Button variant="outline" size="sm" onClick={searchTests} disabled={searching}>Search</Button>
          </div>
          {memberResults.length > 0 && (
            <div className="border rounded max-h-40 overflow-y-auto bg-white">
              {memberResults.filter((r) => r.id !== testId && !panelMembers.some((m: any) => m.componentTestId === r.id)).slice(0, 10).map((r) => (
                <button key={r.id} onClick={() => addMember(r.id)} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-xs text-slate-500 font-mono">{r.code}</span>
                  {r.category && <span className="ml-2 text-xs text-slate-500">· {r.category}</span>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Inline Component Definitions ({items.length})</div>
          {adding && (
            <div className="border rounded p-3 space-y-3 bg-slate-50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><FieldLabel required>Component Name</FieldLabel><Input value={form.componentName} onChange={(e) => setForm({ ...form, componentName: e.target.value })} /></div>
                <div><Label>Component Code</Label><Input value={form.componentCode} onChange={(e) => setForm({ ...form, componentCode: e.target.value })} /></div>
                <div><Label>Result Type</Label>
                  <Select value={form.resultType} onValueChange={(v) => setForm({ ...form, resultType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RESULT_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Unit</Label><MasterCombobox endpoint="/api/lab-tests/units?status=active" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} placeholder="Select or type…" fieldLabel="unit" /></div>
                <div><Label>Reference Range</Label><Input value={form.referenceRange} onChange={(e) => setForm({ ...form, referenceRange: e.target.value })} /></div>
                <div><Label>Decimal Precision</Label><Input type="number" value={form.decimalPrecision} onChange={(e) => setForm({ ...form, decimalPrecision: e.target.value })} /></div>
                <div><Label>Critical Low</Label><Input type="number" value={form.criticalLow} onChange={(e) => setForm({ ...form, criticalLow: e.target.value })} /></div>
                <div><Label>Critical High</Label><Input type="number" value={form.criticalHigh} onChange={(e) => setForm({ ...form, criticalHigh: e.target.value })} /></div>
                <div><Label>Display Order</Label><Input type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
                <Button onClick={add} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2"><Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Component"}</Button>
              </div>
            </div>
          )}
          {items.length === 0 ? (
            <div className="text-sm text-slate-500 p-3 text-center bg-slate-50 rounded">No inline component definitions.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-700">Component</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Code</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Unit</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Ref Range</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Critical</th>
                    <th className="text-right p-2 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c: any) => (
                    <tr key={c.id} className="border-b hover:bg-slate-50">
                      <td className="p-2 font-medium text-slate-900">{c.componentName}</td>
                      <td className="p-2 text-xs font-mono text-slate-500">{c.componentCode || "—"}</td>
                      <td className="p-2">{labelOf(RESULT_TYPES, c.resultType)}</td>
                      <td className="p-2">{c.unit || "—"}</td>
                      <td className="p-2 text-xs">{c.referenceRange || "—"}</td>
                      <td className="p-2 text-xs">{c.criticalLow != null || c.criticalHigh != null ? `${c.criticalLow ?? "—"} / ${c.criticalHigh ?? "—"}` : "—"}</td>
                      <td className="p-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => removeComponent(c.id)} className="text-rose-600 hover:bg-rose-50 h-8 w-8 p-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// REFERENCE RANGES TAB
// =====================================================================
function ReferenceRangesTab({ testId, items, onChanged }: { testId: string; items: any[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({
    label: "", sex: "all", ageGroup: "all", ageMinDays: "", ageMaxDays: "",
    pregnancyApplicable: false, specimenType: "", facilityId: "",
    lowText: "", highText: "", rangeText: "", unit: "",
    criticalLowText: "", criticalHighText: "", notes: "", supersede: true,
  });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-tests/${testId}/reference-ranges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ageMinDays: form.ageMinDays === "" ? null : Number(form.ageMinDays),
          ageMaxDays: form.ageMaxDays === "" ? null : Number(form.ageMaxDays),
        }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Reference range added (new version)");
      setForm({ label: "", sex: "all", ageGroup: "all", ageMinDays: "", ageMaxDays: "", pregnancyApplicable: false, specimenType: "", facilityId: "", lowText: "", highText: "", rangeText: "", unit: "", criticalLowText: "", criticalHighText: "", notes: "", supersede: true });
      setAdding(false);
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  const retire = async (id: string) => {
    if (!confirm("Retire this reference range? Historical results will retain their applicable configuration.")) return;
    const res = await fetch(`/api/lab-tests/${testId}/reference-ranges?rangeId=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Retired"); onChanged(); } else { toast.error("Failed"); }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm font-semibold text-slate-700">Reference Ranges ({items.length})</div>
            <div className="text-xs text-slate-500">Versioned. Historical results retain the range applicable at the time of result entry.</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Range
          </Button>
        </div>
        {adding && (
          <div className="border rounded p-3 space-y-3 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g., Adult male" /></div>
              <div><Label>Sex</Label>
                <Select value={form.sex} onValueChange={(v) => setForm({ ...form, sex: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SEX_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Age Group</Label>
                <Select value={form.ageGroup} onValueChange={(v) => setForm({ ...form, ageGroup: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AGE_GROUPS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Age Min (days)</Label><Input type="number" value={form.ageMinDays} onChange={(e) => setForm({ ...form, ageMinDays: e.target.value })} /></div>
              <div><Label>Age Max (days)</Label><Input type="number" value={form.ageMaxDays} onChange={(e) => setForm({ ...form, ageMaxDays: e.target.value })} /></div>
              <div><Label>Specimen Type</Label><MasterCombobox endpoint="/api/lab-tests/specimen-types?status=active" value={form.specimenType} onChange={(v) => setForm({ ...form, specimenType: v })} placeholder="Select or type…" fieldLabel="specimen" /></div>
              <div><Label>Low</Label><Input value={form.lowText} onChange={(e) => setForm({ ...form, lowText: e.target.value })} placeholder="13.5" /></div>
              <div><Label>High</Label><Input value={form.highText} onChange={(e) => setForm({ ...form, highText: e.target.value })} placeholder="17.5" /></div>
              <div><Label>Range Text</Label><Input value={form.rangeText} onChange={(e) => setForm({ ...form, rangeText: e.target.value })} placeholder="13.5 - 17.5 g/dL" /></div>
              <div><Label>Unit</Label><MasterCombobox endpoint="/api/lab-tests/units?status=active" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} placeholder="Select or type…" fieldLabel="unit" /></div>
              <div><Label>Critical Low</Label><Input value={form.criticalLowText} onChange={(e) => setForm({ ...form, criticalLowText: e.target.value })} /></div>
              <div><Label>Critical High</Label><Input value={form.criticalHighText} onChange={(e) => setForm({ ...form, criticalHighText: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.pregnancyApplicable} onCheckedChange={(v) => setForm({ ...form, pregnancyApplicable: !!v })} /> Pregnancy-specific</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.supersede} onCheckedChange={(v) => setForm({ ...form, supersede: !!v })} /> Supersede existing active ranges for this slice (recommended)</label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={add} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2"><Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Range"}</Button>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <div className="text-sm text-slate-500 p-3 text-center bg-slate-50 rounded">No reference ranges configured.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left p-2 font-semibold text-slate-700">Label</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Sex</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Age</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Range</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Critical</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Effective</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                  <th className="text-right p-2 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-slate-50">
                    <td className="p-2">{r.label || "—"}</td>
                    <td className="p-2">{r.sex || "all"}</td>
                    <td className="p-2 text-xs">{r.ageGroup || "all"}{r.ageMinDays != null || r.ageMaxDays != null ? ` (${r.ageMinDays ?? "0"}–${r.ageMaxDays ?? "∞"}d)` : ""}</td>
                    <td className="p-2">{r.rangeText || [r.lowText, r.highText].filter(Boolean).join(" - ") || "—"}</td>
                    <td className="p-2 text-xs">{r.criticalLowText || r.criticalHighText ? `${r.criticalLowText || "—"} / ${r.criticalHighText || "—"}` : "—"}</td>
                    <td className="p-2 text-xs">{formatDate(r.effectiveFrom)} {r.effectiveTo ? `→ ${formatDate(r.effectiveTo)}` : ""}</td>
                    <td className="p-2"><Badge className={`bg-${r.status === "active" ? "emerald" : "slate"}-100 text-${r.status === "active" ? "emerald" : "slate"}-700`}>{r.status}</Badge></td>
                    <td className="p-2 text-right">
                      {r.status === "active" && (
                        <Button size="sm" variant="ghost" onClick={() => retire(r.id)} className="text-rose-600 hover:bg-rose-50 h-8 w-8 p-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
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
// CRITICAL VALUES TAB
// =====================================================================
function CriticalValuesTab({ testId, items, onChanged }: { testId: string; items: any[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({
    sex: "all", ageGroup: "all", ageMinDays: "", ageMaxDays: "",
    criticalLow: "", criticalHigh: "", alertType: "numeric", alertValue: "",
    notificationBehavior: "notify_clinician", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-tests/${testId}/critical-values`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ageMinDays: form.ageMinDays === "" ? null : Number(form.ageMinDays),
          ageMaxDays: form.ageMaxDays === "" ? null : Number(form.ageMaxDays),
          criticalLow: form.criticalLow === "" ? null : Number(form.criticalLow),
          criticalHigh: form.criticalHigh === "" ? null : Number(form.criticalHigh),
        }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Critical value threshold added");
      setForm({ sex: "all", ageGroup: "all", ageMinDays: "", ageMaxDays: "", criticalLow: "", criticalHigh: "", alertType: "numeric", alertValue: "", notificationBehavior: "notify_clinician", notes: "" });
      setAdding(false);
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  const retire = async (id: string) => {
    if (!confirm("Retire this critical value threshold?")) return;
    const res = await fetch(`/api/lab-tests/${testId}/critical-values?criticalId=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Retired"); onChanged(); } else { toast.error("Failed"); }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm font-semibold text-slate-700">Critical Values ({items.length})</div>
            <div className="text-xs text-slate-500">Configured thresholds trigger result-flagging and alert escalation. Do not fabricate values — only configure per validated laboratory policy.</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Threshold
          </Button>
        </div>
        {adding && (
          <div className="border rounded p-3 space-y-3 bg-rose-50">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div><Label>Sex</Label>
                <Select value={form.sex} onValueChange={(v) => setForm({ ...form, sex: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SEX_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Age Group</Label>
                <Select value={form.ageGroup} onValueChange={(v) => setForm({ ...form, ageGroup: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AGE_GROUPS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Age Min (days)</Label><Input type="number" value={form.ageMinDays} onChange={(e) => setForm({ ...form, ageMinDays: e.target.value })} /></div>
              <div><Label>Age Max (days)</Label><Input type="number" value={form.ageMaxDays} onChange={(e) => setForm({ ...form, ageMaxDays: e.target.value })} /></div>
              <div><Label>Critical Low</Label><Input type="number" value={form.criticalLow} onChange={(e) => setForm({ ...form, criticalLow: e.target.value })} /></div>
              <div><Label>Critical High</Label><Input type="number" value={form.criticalHigh} onChange={(e) => setForm({ ...form, criticalHigh: e.target.value })} /></div>
              <div><Label>Alert Type</Label>
                <Select value={form.alertType} onValueChange={(v) => setForm({ ...form, alertType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="numeric">Numeric</SelectItem>
                    <SelectItem value="qualitative">Qualitative</SelectItem>
                    <SelectItem value="categorical">Categorical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Alert Value (qualitative)</Label><Input value={form.alertValue} onChange={(e) => setForm({ ...form, alertValue: e.target.value })} /></div>
              <div><Label>Notification</Label>
                <Select value={form.notificationBehavior} onValueChange={(v) => setForm({ ...form, notificationBehavior: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notify_clinician">Notify clinician</SelectItem>
                    <SelectItem value="notify_lab_manager">Notify lab manager</SelectItem>
                    <SelectItem value="escalate">Escalate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={add} disabled={saving} className="bg-rose-600 hover:bg-rose-700 gap-2"><Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Threshold"}</Button>
            </div>
          </div>
        )}
        {items.filter((i: any) => i.status === "active").length === 0 ? (
          <div className="text-sm text-slate-500 p-3 text-center bg-slate-50 rounded">No active critical value thresholds.</div>
        ) : (
          <div className="space-y-2">
            {items.filter((i: any) => i.status === "active").map((c: any) => (
              <div key={c.id} className="border rounded p-2 bg-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <div>
                    <span className="font-medium text-slate-900">
                      {c.alertType === "numeric" ? `${c.criticalLow ?? "—"} / ${c.criticalHigh ?? "—"}` : c.alertValue || "—"}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">{c.sex || "all"} · {c.ageGroup || "all"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{c.notificationBehavior || "—"}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => retire(c.id)} className="text-rose-600 hover:bg-rose-50 h-8 w-8 p-0"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// RESULT OPTIONS TAB
// =====================================================================
function ResultOptionsTab({ testId, items, onChanged }: { testId: string; items: any[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ optionValue: "", optionLabel: "", isCritical: false, displayOrder: 0 });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!form.optionValue) { toast.error("Option value is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-tests/${testId}/result-options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, displayOrder: Number(form.displayOrder) || 0 }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Result option added");
      setForm({ optionValue: "", optionLabel: "", isCritical: false, displayOrder: 0 });
      setAdding(false);
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this result option?")) return;
    const res = await fetch(`/api/lab-tests/${testId}/result-options?optionId=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Removed"); onChanged(); } else { toast.error("Failed"); }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-sm font-semibold text-slate-700">Result Options ({items.filter((i: any) => i.isActive).length})</div>
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Option</Button>
        </div>
        {adding && (
          <div className="border rounded p-3 space-y-2 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div><FieldLabel required>Option Value</FieldLabel><Input value={form.optionValue} onChange={(e) => setForm({ ...form, optionValue: e.target.value })} placeholder="e.g., positive" /></div>
              <div><Label>Display Label</Label><Input value={form.optionLabel} onChange={(e) => setForm({ ...form, optionLabel: e.target.value })} placeholder="e.g., Positive" /></div>
              <div><Label>Display Order</Label><Input type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} /></div>
              <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isCritical} onCheckedChange={(v) => setForm({ ...form, isCritical: !!v })} /> Critical flag</label></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={add} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2"><Save className="w-4 h-4" /> {saving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        )}
        {items.filter((i: any) => i.isActive).length === 0 ? (
          <div className="text-sm text-slate-500 p-3 text-center bg-slate-50 rounded">No result options. Add for qualitative/categorical tests (Positive/Negative, Reactive/Non-reactive, etc.).</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.filter((i: any) => i.isActive).map((o: any) => (
              <div key={o.id} className="border rounded px-3 py-1.5 bg-white flex items-center gap-2">
                <span className="font-medium text-slate-900">{o.optionLabel || o.optionValue}</span>
                {o.isCritical && <Badge className="bg-rose-100 text-rose-700 text-xs">Critical</Badge>}
                <button onClick={() => remove(o.id)} className="text-rose-600 hover:bg-rose-50 rounded p-0.5"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// FACILITY AVAILABILITY TAB
// =====================================================================
function FacilityAvailabilityTab({ testId, items, onChanged }: { testId: string; items: any[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ facilityId: "", availability: "available", performingDepartmentId: "", facilityTatMinutes: "", facilityReferralLab: "", facilityNotes: "" });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!form.facilityId) { toast.error("Facility ID is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-tests/${testId}/facility-availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, facilityTatMinutes: form.facilityTatMinutes === "" ? null : Number(form.facilityTatMinutes) }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Facility availability saved");
      setForm({ facilityId: "", availability: "available", performingDepartmentId: "", facilityTatMinutes: "", facilityReferralLab: "", facilityNotes: "" });
      setAdding(false);
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  const remove = async (facilityId: string) => {
    if (!confirm("Remove this facility override?")) return;
    const res = await fetch(`/api/lab-tests/${testId}/facility-availability?facilityId=${facilityId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Removed"); onChanged(); } else { toast.error("Failed"); }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm font-semibold text-slate-700">Facility Availability ({items.length})</div>
            <div className="text-xs text-slate-500">Multi-facility overrides without duplicating the underlying test.</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Override</Button>
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
                    <SelectItem value="temporarily_unavailable">Temporarily Unavailable</SelectItem>
                    <SelectItem value="unavailable">Unavailable</SelectItem>
                    <SelectItem value="referral_out">Referral Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>TAT (minutes)</Label><Input type="number" value={form.facilityTatMinutes} onChange={(e) => setForm({ ...form, facilityTatMinutes: e.target.value })} /></div>
              <div><Label>Referral Lab</Label><Input value={form.facilityReferralLab} onChange={(e) => setForm({ ...form, facilityReferralLab: e.target.value })} /></div>
              <div><Label>Performing Dept ID</Label><Input value={form.performingDepartmentId} onChange={(e) => setForm({ ...form, performingDepartmentId: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.facilityNotes} onChange={(e) => setForm({ ...form, facilityNotes: e.target.value })} rows={2} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={add} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2"><Save className="w-4 h-4" /> {saving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <div className="text-sm text-slate-500 p-3 text-center bg-slate-50 rounded">No facility overrides. Test is available org-wide by default.</div>
        ) : (
          <div className="space-y-2">
            {items.map((f: any) => (
              <div key={f.id} className="border rounded p-2 bg-white flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900">Facility: {f.facilityId}</span>
                  <span className="ml-2 text-xs"><Badge className={`bg-${f.availability === "available" ? "emerald" : "amber"}-100 text-${f.availability === "available" ? "emerald" : "amber"}-700`}>{f.availability}</Badge></span>
                  {f.facilityTatMinutes && <span className="ml-2 text-xs text-slate-500">TAT: {f.facilityTatMinutes}m</span>}
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
// AUDIT TAB
// =====================================================================
function AuditTab({ items }: { items: any[] }) {
  if (items.length === 0) return <div className="text-sm text-slate-500 p-3 text-center bg-slate-50 rounded">No audit entries.</div>;
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b sticky top-0">
              <tr>
                <th className="text-left p-2 font-semibold text-slate-700">When</th>
                <th className="text-left p-2 font-semibold text-slate-700">Action</th>
                <th className="text-left p-2 font-semibold text-slate-700">By</th>
                <th className="text-left p-2 font-semibold text-slate-700">Previous</th>
                <th className="text-left p-2 font-semibold text-slate-700">New</th>
                <th className="text-left p-2 font-semibold text-slate-700">Reason</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a: any) => (
                <tr key={a.id} className="border-b hover:bg-slate-50">
                  <td className="p-2 text-xs">{formatDate(a.createdAt, true)}</td>
                  <td className="p-2"><Badge variant="outline" className="font-mono text-xs">{a.action}</Badge></td>
                  <td className="p-2 text-xs">{a.userRole || a.userId || "—"}</td>
                  <td className="p-2 text-xs text-slate-500 max-w-xs truncate">{a.previousValue || "—"}</td>
                  <td className="p-2 text-xs text-slate-700 max-w-xs truncate">{a.newValue || "—"}</td>
                  <td className="p-2 text-xs text-slate-500">{a.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

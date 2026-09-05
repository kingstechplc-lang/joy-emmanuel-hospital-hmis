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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  TEST_CATEGORIES, TEST_TYPES, RESULT_TYPES, PRIORITIES, BILLABLE_AS, CLAIMABLE_STATUSES,
} from "./shared";
import { safeJson } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";
import { MasterCombobox } from "./master-combobox";

export function LabTestDialog({ test, onClose }: { test?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!test;
  const [form, setForm] = useState({
    name: test?.name || "",
    code: test?.code || "",
    shortName: test?.shortName || "",
    displayName: test?.displayName || "",
    description: test?.description || "",
    category: test?.category || "other",
    testType: test?.testType || "single",
    resultType: test?.resultType || "numeric",
    specimenType: test?.specimenType || "",
    unit: test?.unit || "",
    referenceRange: test?.referenceRange || "",
    price: test?.price || 0,
    status: test?.status || "active",
    priority: test?.priority || "routine",
    isPanel: !!test?.isPanel,
    isReferralOut: !!test?.isReferralOut,
    referralLab: test?.referralLab || "",
    isBillable: test?.isBillable !== false,
    billableAs: test?.billableAs || "individual",
    tatMinutes: test?.tatMinutes ?? "",
    serviceId: test?.serviceId || "",
    nhisEligible: !!test?.nhisEligible,
    nhisServiceCode: test?.nhisServiceCode || "",
    nhisTariffRef: test?.nhisTariffRef || "",
    claimableStatus: test?.claimableStatus || "not_configured",
    aliasesText: (test?.aliases || []).map((a: any) => a.alias).join(", "),
  });
  const [duplicates, setDuplicates] = useState<any[] | null>(null);
  const [skipDupCheck, setSkipDupCheck] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const aliases = form.aliasesText.split(",").map((s) => s.trim()).filter(Boolean);
      const payload: any = {
        name: form.name, code: form.code,
        shortName: form.shortName || undefined,
        displayName: form.displayName || undefined,
        description: form.description || undefined,
        category: form.category,
        testType: form.testType,
        resultType: form.resultType,
        specimenType: form.specimenType || undefined,
        unit: form.unit || undefined,
        referenceRange: form.referenceRange || undefined,
        price: Number(form.price) || 0,
        status: form.status,
        priority: form.priority,
        isPanel: form.isPanel,
        isReferralOut: form.isReferralOut,
        referralLab: form.referralLab || undefined,
        isBillable: form.isBillable,
        billableAs: form.billableAs,
        tatMinutes: form.tatMinutes === "" ? undefined : Number(form.tatMinutes),
        serviceId: form.serviceId || undefined,
        nhisEligible: form.nhisEligible,
        nhisServiceCode: form.nhisServiceCode || undefined,
        nhisTariffRef: form.nhisTariffRef || undefined,
        claimableStatus: form.claimableStatus,
        aliases,
        skipDuplicateCheck: skipDupCheck,
      };
      const url = isEdit ? `/api/lab-tests/${test.id}` : "/api/lab-tests";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      toast.success(isEdit ? "Lab test updated" : "Lab test created");
      qc.invalidateQueries({ queryKey: ["lab-tests-admin"] });
      qc.invalidateQueries({ queryKey: ["lab-tests"] });
      qc.invalidateQueries({ queryKey: ["lab-test-detail"] });
      onClose();
    },
    onError: (e: Error) => {
      if (e.message !== "DUPLICATE_DETECTED") toast.error(e.message);
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-purple-600 to-violet-700 text-white">
          <DialogTitle className="text-white">{isEdit ? "Edit Lab Test" : "Add Lab Test"}</DialogTitle>
          <DialogDescription className="text-white/80">
            {isEdit ? "Update test details. Use the test details dialog for full configuration (specimen, ranges, critical values, panel)." : "Add a new laboratory test to the central catalog. You can configure specimen, reference ranges, critical values, and panels after creation."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {duplicates && duplicates.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded p-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                <AlertTriangle className="w-4 h-4" /> Possible duplicate detected
              </div>
              <div className="space-y-1">
                {duplicates.map((d: any) => (
                  <div key={d.id} className="text-xs text-amber-800">
                    <span className="font-medium">{d.name}</span> <code className="ml-1">{d.code}</code>
                    {d.reasons && <span className="ml-1">— {d.reasons.join(", ")}</span>}
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-amber-900">
                <Checkbox checked={skipDupCheck} onCheckedChange={(v) => setSkipDupCheck(!!v)} />
                Override warning and create anyway (confirm this is a distinct test definition)
              </label>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Test Name</FieldLabel>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Full Blood Count" />
            </div>
            <div>
              <FieldLabel required>Test Code</FieldLabel>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g., FBC-001" />
            </div>
            <div>
              <Label>Short Name / Abbreviation</Label>
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
          <div>
            <Label>Aliases (comma-separated)</Label>
            <Input value={form.aliasesText} onChange={(e) => setForm({ ...form, aliasesText: e.target.value })} placeholder="e.g., CBC, Complete Blood Count" />
            <div className="text-xs text-slate-500 mt-1">Used for search. Searching any alias will return this test.</div>
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
                label="Specimen Type"
                endpoint="/api/lab-tests/specimen-types?status=active"
                value={form.specimenType}
                onChange={(v) => setForm({ ...form, specimenType: v })}
                placeholder="Select or type specimen…"
                searchPlaceholder="Search specimens…"
                fieldLabel="specimen"
                helperText="Pulls from Specimen Types master; type to add a custom value."
              />
            </div>
            <div>
              <MasterCombobox
                label="Unit"
                endpoint="/api/lab-tests/units?status=active"
                value={form.unit}
                onChange={(v) => setForm({ ...form, unit: v })}
                placeholder="Select or type unit…"
                searchPlaceholder="Search units…"
                fieldLabel="unit"
                helperText="Pulls from Units master; type to add a custom value."
              />
            </div>
            <div>
              <Label>Reference Range (legacy text)</Label>
              <Input value={form.referenceRange} onChange={(e) => setForm({ ...form, referenceRange: e.target.value })} placeholder="e.g., 70-110" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="temporarily_unavailable">Temporarily Unavailable</SelectItem>
                  <SelectItem value="referral_out">Referral Out</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
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
              <Label>Default Price (legacy)</Label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isPanel} onCheckedChange={(v) => setForm({ ...form, isPanel: !!v })} /> Is Panel / Profile</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isReferralOut} onCheckedChange={(v) => setForm({ ...form, isReferralOut: !!v })} /> Referral / Outsourced</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isBillable} onCheckedChange={(v) => setForm({ ...form, isBillable: !!v })} /> Billable</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.nhisEligible} onCheckedChange={(v) => setForm({ ...form, nhisEligible: !!v })} /> NHIS Eligible</label>
          </div>
          {(form.isReferralOut || form.isBillable || form.nhisEligible) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t">
              {form.isReferralOut && (
                <div>
                  <Label>Referral Lab</Label>
                  <Input value={form.referralLab} onChange={(e) => setForm({ ...form, referralLab: e.target.value })} placeholder="External lab name" />
                </div>
              )}
              {form.isBillable && (
                <>
                  <div>
                    <Label>Billable As</Label>
                    <Select value={form.billableAs} onValueChange={(v) => setForm({ ...form, billableAs: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BILLABLE_AS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Service ID (Services & Pricing)</Label>
                    <Input value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })} placeholder="cuid from Services catalog" />
                  </div>
                </>
              )}
              {form.nhisEligible && (
                <>
                  <div>
                    <Label>NHIS Service Code</Label>
                    <Input value={form.nhisServiceCode} onChange={(e) => setForm({ ...form, nhisServiceCode: e.target.value })} placeholder="Authoritative NHIS code only" />
                  </div>
                  <div>
                    <Label>NHIS Tariff Reference</Label>
                    <Input value={form.nhisTariffRef} onChange={(e) => setForm({ ...form, nhisTariffRef: e.target.value })} />
                  </div>
                  <div>
                    <Label>Claimable Status</Label>
                    <Select value={form.claimableStatus} onValueChange={(v) => setForm({ ...form, claimableStatus: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CLAIMABLE_STATUSES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name || !form.code}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            <Save className="w-4 h-4" />
            {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Lab Test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

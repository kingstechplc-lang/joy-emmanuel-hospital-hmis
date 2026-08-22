"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, ShieldCheck, Search, Send, Check, X, DollarSign, RefreshCw, Stethoscope, AlertCircle, CheckCircle2, Download, Layers } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatCurrency, safeJson, PageHeader} from "@/components/ui-helpers";
import { EntitySelect, type EntitySelectValue } from "@/components/ui/entity-select";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "partially_approved", label: "Partially Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "paid", label: "Paid" },
  { value: "resubmitted", label: "Resubmitted" },
];

export function InsuranceClaimsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [partialClaim, setPartialClaim] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  // Export handler — downloads CSV/TSV/JSON from the export API
  const handleExport = async (format: "csv" | "tsv" | "json") => {
    const exportParams = new URLSearchParams();
    exportParams.set("format", format);
    if (activeFacilityId) exportParams.set("facilityId", activeFacilityId);
    if (statusFilter !== "all") exportParams.set("status", statusFilter);
    try {
      const res = await fetch(`/api/insurance-claims/export?${exportParams.toString()}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nhis-claims-${new Date().toISOString().slice(0, 10)}.${format === "tsv" ? "tsv" : format === "json" ? "json" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    }
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["insurance-claims", activeFacilityId, statusFilter],
    queryFn: () => fetchJson(`/api/insurance-claims${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["insurance-claims"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
  };

  const doAction = async (id: string, action: string, successMsg: string, extra?: any) => {
    try {
      const res = await fetch(`/api/insurance-claims/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success(successMsg);
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const items: any[] = data?.items || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Insurance Claims"
        description="Manage NHIS and private insurance claims — bulk generation + multi-format export"
        icon={ShieldCheck}
        gradient="from-indigo-500 to-blue-600"

        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => handleExport("csv")} disabled={!can("insurance.view")} className="gap-2 bg-white/20 border-white/30 text-white hover:bg-white/30">
              <Download className="w-4 h-4" /> CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport("tsv")} disabled={!can("insurance.view")} className="gap-2 bg-white/20 border-white/30 text-white hover:bg-white/30">
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button variant="outline" onClick={() => handleExport("json")} disabled={!can("insurance.view")} className="gap-2 bg-white/20 border-white/30 text-white hover:bg-white/30">
              <Download className="w-4 h-4" /> JSON
            </Button>
            {can("insurance.claim") && (
              <Button onClick={() => setShowBulk(true)} className="gap-2 bg-white/20 border-white/30 text-white hover:bg-white/30">
                <Layers className="w-4 h-4" /> Bulk Generate
              </Button>
            )}
            <Button onClick={() => setShowNew(true)} disabled={!can("insurance.claim")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" /> New Claim
            </Button>
          </div>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view insurance claims.</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3">
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load insurance claims" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No insurance claims"
              description="Create a new claim against an outstanding invoice."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("insurance.claim")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Claim</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Claim #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Provider</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Invoice Total</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Claim Amount</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Approved</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Submitted</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c: any) => (
                    <tr key={c.id} className="border-b hover:bg-emerald-50/40">
                      <td className="p-3 font-mono text-xs text-slate-700">{c.claimNumber}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{c.patient?.firstName} {c.patient?.lastName}</div>
                        <div className="text-xs text-slate-500">{c.patient?.patientNumber}</div>
                      </td>
                      <td className="p-3">
                        <div className="text-sm text-slate-700">{c.insuranceProvider?.name}</div>
                        <div className="text-[10px] text-slate-500">{c.insuranceProvider?.code}</div>
                      </td>
                      <td className="p-3 text-right font-mono text-xs">{formatCurrency(c.invoice?.total)}</td>
                      <td className="p-3 text-right font-mono text-xs font-semibold">{formatCurrency(c.claimAmount)}</td>
                      <td className="p-3 text-right font-mono text-xs text-emerald-700">{formatCurrency(c.approvedAmount)}</td>
                      <td className="p-3"><StatusBadge status={c.status} /></td>
                      <td className="p-3 text-xs text-slate-600">{c.submittedAt ? formatDate(c.submittedAt) : "—"}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {c.status === "draft" && can("insurance.claim") && (
                            <Button size="sm" onClick={() => doAction(c.id, "submit", "Claim submitted to provider")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <Send className="w-3 h-3" /> Submit
                            </Button>
                          )}
                          {c.status === "submitted" && can("insurance.claim") && (
                            <>
                              <Button size="sm" onClick={() => doAction(c.id, "approve", "Claim approved for full amount")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                                <Check className="w-3 h-3" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setPartialClaim(c)} className="gap-1 h-7 text-xs">
                                <DollarSign className="w-3 h-3" /> Partial
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => doAction(c.id, "reject", "Claim rejected", { reason: "Provider rejected claim" })} className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700">
                                <X className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                          {["approved", "partially_approved"].includes(c.status) && can("insurance.claim") && (
                            <Button size="sm" onClick={() => doAction(c.id, "pay", "Claim paid — insurance payment recorded")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <DollarSign className="w-3 h-3" /> Mark Paid
                            </Button>
                          )}
                          {c.status === "rejected" && can("insurance.claim") && (
                            <Button size="sm" variant="outline" onClick={() => doAction(c.id, "resubmit", "Claim resubmitted")} className="gap-1 h-7 text-xs">
                              <RefreshCw className="w-3 h-3" /> Resubmit
                            </Button>
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

      <NewClaimDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} facilityId={activeFacilityId} />

      {showBulk && (
        <BulkClaimsDialog facilityId={activeFacilityId} onClose={() => setShowBulk(false)} onCreated={() => { setShowBulk(false); invalidate(); }} />
      )}

      {partialClaim && (
        <PartialApprovalDialog claim={partialClaim} onClose={() => setPartialClaim(null)} onDone={() => { setPartialClaim(null); invalidate(); }} />
      )}
    </div>
  );
}

function NewClaimDialog({ open, onClose, onCreated, facilityId }: { open: boolean; onClose: () => void; onCreated: () => void; facilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [claimAmount, setClaimAmount] = useState(0);
  const [claimType, setClaimType] = useState("outpatient");
  const [nhisNumber, setNhisNumber] = useState("");
  const [primaryDx, setPrimaryDx] = useState<EntitySelectValue | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search-claim", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  // Get patient's full record to read insurance providers + NHIS number
  const { data: patientData } = useQuery({
    queryKey: ["patient-detail-claim", patientId],
    queryFn: () => fetchJson(`/api/patients/${patientId}`),
    enabled: !!patientId,
  });

  // Get outstanding invoices
  const { data: invoicesData } = useQuery({
    queryKey: ["patient-invoices-claim", patientId, facilityId],
    queryFn: () => fetchJson(`/api/invoices?patientId=${patientId}${facilityId ? `&facilityId=${facilityId}` : ""}`),
    enabled: !!patientId,
  });

  const outstandingInvoices = (invoicesData?.items || []).filter((i: any) => i.balance > 0 && i.status !== "cancelled");
  const insuranceProviders = patientData?.patient?.insurance || [];

  // Detect if selected provider is NHIS
  const selectedProvider = insuranceProviders.find((pi: any) => pi.insuranceProviderId === providerId);
  const isNhisProvider = selectedProvider?.insuranceProvider?.code?.toUpperCase().includes("NHIS") ||
    selectedProvider?.insuranceProvider?.name?.toUpperCase().includes("NHIS") || false;

  // Auto-fill NHIS number from patient's insurance record
  const providerNhishNumber = selectedProvider?.membershipNumber || "";

  // NHIS validation checks
  const nhisValidationIssues: string[] = [];
  if (isNhisProvider) {
    if (!nhisNumber) nhisValidationIssues.push("NHIS membership number required");
    if (!primaryDx?.id) nhisValidationIssues.push("Primary ICD-10 diagnosis required (select from catalog)");
  }
  const isNhisValid = nhisValidationIssues.length === 0;

  const selectPatient = (p: any) => {
    setPatientId(p.id);
    setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
    setInvoiceId(""); setProviderId(""); setClaimAmount(0);
    setNhisNumber(""); setPrimaryDx(null);
  };

  const selectInvoice = (id: string) => {
    const inv = outstandingInvoices.find((i: any) => i.id === id);
    if (inv) {
      setInvoiceId(inv.id);
      setClaimAmount(inv.balance);
    }
  };

  const selectProvider = (id: string) => {
    setProviderId(id);
    // Auto-fill NHIS number if available
    const pi = insuranceProviders.find((p: any) => p.insuranceProviderId === id);
    if (pi?.membershipNumber) setNhisNumber(pi.membershipNumber);
  };

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    if (!invoiceId) { toast.error("Please select an outstanding invoice"); return; }
    if (!providerId) { toast.error("Please select an insurance provider"); return; }
    if (!claimAmount || claimAmount <= 0) { toast.error("Claim amount must be > 0"); return; }
    if (isNhisProvider && !isNhisValid) {
      toast.error("NHIS validation failed: " + nhisValidationIssues.join(", "));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/insurance-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          facilityId,
          insuranceProviderId: providerId,
          invoiceId,
          claimAmount,
          claimType,
          nhisNumber: nhisNumber || undefined,
          primaryDiagnosisCatalogId: primaryDx?.id || undefined,
          primaryDiagnosisCode: primaryDx?.code || undefined,
          primaryDiagnosisName: primaryDx?.label || undefined,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success(isNhisProvider ? "NHIS claim created as draft — validated ✓" : "Claim created as draft");
      setPatientQuery(""); setPatientId(""); setInvoiceId(""); setProviderId(""); setClaimAmount(0);
      setNhisNumber(""); setPrimaryDx(null); setClaimType("outpatient");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-600" /> New Insurance Claim</DialogTitle>
          <DialogDescription>
            File a claim against an outstanding invoice. NHIS claims require ICD-10 diagnosis codes and NHIS membership number per Ghana NHIS policy.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search patient..." value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} className="pl-9" />
            </div>
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => selectPatient(p)} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {patientId && (
            <>
              <div>
                <FieldLabel required>Insurance Provider</FieldLabel>
                {insuranceProviders.length === 0 ? (
                  <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded">This patient has no registered insurance. Add insurance in the patient record first.</div>
                ) : (
                  <Select value={providerId || undefined} onValueChange={selectProvider}>
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>
                      {insuranceProviders.map((pi: any) => (
                        <SelectItem key={pi.id} value={pi.insuranceProviderId}>
                          {pi.insuranceProvider?.name}
                          {pi.insuranceProvider?.code?.toUpperCase().includes("NHIS") && <Badge variant="secondary" className="ml-2 text-[9px]">NHIS</Badge>}
                          {pi.membershipNumber ? ` • ${pi.membershipNumber}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* NHIS fields — shown when NHIS provider is selected */}
              {isNhisProvider && (
                <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50/30 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Ghana NHIS Compliance
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel required>NHIS Membership Number</FieldLabel>
                      <Input value={nhisNumber} onChange={(e) => setNhisNumber(e.target.value)} placeholder="NHIS number or Ghana Card" />
                      {providerNhishNumber && providerNhishNumber !== nhisNumber && (
                        <p className="text-[10px] text-slate-500 mt-1">Auto-filled from patient record</p>
                      )}
                    </div>
                    <div>
                      <FieldLabel required>Claim Type</FieldLabel>
                      <Select value={claimType} onValueChange={setClaimType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="outpatient">Outpatient</SelectItem>
                          <SelectItem value="inpatient">Inpatient</SelectItem>
                          <SelectItem value="day_case">Day Case</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Primary Diagnosis — ICD-10 from catalog */}
                  <EntitySelect
                    label="Primary Diagnosis (ICD-10) — required for NHIS"
                    required
                    endpoint="/api/diagnoses/catalog"
                    queryParam="q"
                    queryParams={{ limit: "20" }}
                    getLabel={(item: any) => item.name}
                    getId={(item: any) => item.id}
                    getSubtitle={(item: any) => {
                      const parts = [item.category, item.nhisGdrgCode ? `G-DRG: ${item.nhisGdrgCode}` : null].filter(Boolean);
                      return parts.length ? parts.join(" · ") : null;
                    }}
                    getCode={(item: any) => item.code}
                    placeholder="Search ICD-10 diagnosis by name or code (e.g., 'I10', 'malaria')..."
                    value={primaryDx}
                    onChange={setPrimaryDx}
                    allowManual
                  />

                  {/* NHIS validation status */}
                  {nhisValidationIssues.length > 0 ? (
                    <div className="flex items-start gap-2 p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">NHIS Validation Issues:</p>
                        <ul className="list-disc list-inside mt-1">
                          {nhisValidationIssues.map((issue, i) => <li key={i}>{issue}</li>)}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" /> NHIS validation passed — ready for CLAIM-it submission
                    </div>
                  )}
                </div>
              )}

              <div>
                <FieldLabel required>Outstanding Invoice</FieldLabel>
                {outstandingInvoices.length === 0 ? (
                  <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded">No outstanding invoices for this patient.</div>
                ) : (
                  <Select value={invoiceId || undefined} onValueChange={selectInvoice}>
                    <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
                    <SelectContent>
                      {outstandingInvoices.map((i: any) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.invoiceNumber} • Total {formatCurrency(i.total)} • Balance {formatCurrency(i.balance)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <FieldLabel required>Claim Amount</FieldLabel>
                <Input type="number" step="0.01" value={claimAmount} onChange={(e) => setClaimAmount(Number(e.target.value))} />
                <p className="text-[10px] text-slate-500 mt-1">Defaulted to invoice balance</p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !patientId || !invoiceId || !providerId || !claimAmount || (isNhisProvider && !isNhisValid)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Creating..." : <><ShieldCheck className="w-4 h-4" /> Create Draft Claim</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartialApprovalDialog({ claim, onClose, onDone }: { claim: any; onClose: () => void; onDone: () => void }) {
  const [approvedAmount, setApprovedAmount] = useState(claim.claimAmount);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!approvedAmount || approvedAmount <= 0) { toast.error("Approved amount must be > 0"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/insurance-claims/${claim.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "partially_approve", approvedAmount }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success(`Claim partially approved for ${formatCurrency(approvedAmount)}`);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-emerald-600" /> Partial Approval</DialogTitle>
          <DialogDescription>
            Claim {claim.claimNumber} • Original claim amount: {formatCurrency(claim.claimAmount)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Approved Amount</FieldLabel>
            <Input type="number" step="0.01" value={approvedAmount} onChange={(e) => setApprovedAmount(Number(e.target.value))} />
            <p className="text-[10px] text-slate-500 mt-1">Must be less than the claim amount ({formatCurrency(claim.claimAmount)})</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Approving..." : "Confirm Partial Approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// BULK CLAIMS DIALOG — generate multiple NHIS claims in batch
// =====================================================================
function BulkClaimsDialog({ facilityId, onClose, onCreated }: { facilityId: string | null; onClose: () => void; onCreated: () => void }) {
  const [providerId, setProviderId] = useState("");
  const [claimType, setClaimType] = useState("outpatient");
  const [defaultDx, setDefaultDx] = useState<EntitySelectValue | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [searchPatient, setSearchPatient] = useState("");
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<any>(null);

  // Fetch all outstanding invoices for the facility
  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ["bulk-invoices", facilityId],
    queryFn: () => fetchJson(`/api/invoices?facilityId=${facilityId || ""}&status=unpaid&limit=200`),
    enabled: !!facilityId,
  });

  // Fetch NHIS insurance providers
  const { data: providersData } = useQuery({
    queryKey: ["nhis-providers"],
    queryFn: () => fetchJson("/api/insurance-providers"),
  });
  const providers = (providersData?.items || providersData?.providers || []).filter((p: any) =>
    p.code?.toUpperCase().includes("NHIS") || p.name?.toUpperCase().includes("NHIS") || true
  );

  // Search patients to filter invoices
  const { data: patientsData } = useQuery({
    queryKey: ["bulk-patient-search", searchPatient],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(searchPatient)}`),
    enabled: searchPatient.length >= 2,
  });

  const allInvoices: any[] = invoicesData?.items || [];
  const outstandingInvoices = allInvoices.filter((i: any) => i.balance > 0 && i.status !== "cancelled");

  // Filter by patient search
  const filteredInvoices = searchPatient.length >= 2 && patientsData?.patients
    ? outstandingInvoices.filter((inv: any) =>
        patientsData.patients.some((p: any) => p.id === inv.patientId))
    : outstandingInvoices;

  const toggleInvoice = (id: string) => {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedInvoices(new Set(filteredInvoices.map((i: any) => i.id)));
  };

  const clearAll = () => {
    setSelectedInvoices(new Set());
  };

  const submit = async () => {
    if (!facilityId) { toast.error("No facility selected"); return; }
    if (!providerId) { toast.error("Please select an insurance provider"); return; }
    if (selectedInvoices.size === 0) { toast.error("Select at least one invoice"); return; }

    setSaving(true);
    setResults(null);
    try {
      const items = Array.from(selectedInvoices).map((invoiceId) => {
        const inv = outstandingInvoices.find((i: any) => i.id === invoiceId);
        return {
          patientId: inv?.patientId,
          invoiceId,
          claimAmount: inv?.balance,
          primaryDiagnosisCatalogId: defaultDx?.id,
          primaryDiagnosisCode: defaultDx?.code,
          primaryDiagnosisName: defaultDx?.label,
        };
      });

      const res = await fetch("/api/insurance-claims/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId,
          insuranceProviderId: providerId,
          claimType,
          items,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Bulk generation failed");
      }
      const data = await safeJson(res);
      setResults(data);
      if (data.summary.failed === 0) {
        toast.success(`Generated ${data.summary.success} claims successfully`);
        onCreated();
      } else {
        toast.warning(`${data.summary.success} created, ${data.summary.failed} failed — see results`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            Bulk NHIS Claim Generation
          </DialogTitle>
          <DialogDescription>
            Select multiple outstanding invoices and generate NHIS claims in a single batch.
            All claims will be created as drafts with the same provider and diagnosis.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          /* Results view */
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">{results.summary.success}</p>
                <p className="text-xs text-emerald-600">Claims Created</p>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-rose-700">{results.summary.failed}</p>
                <p className="text-xs text-rose-600">Failed</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-700">{results.summary.total}</p>
                <p className="text-xs text-slate-600">Total Processed</p>
              </div>
            </div>

            {results.created.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-700">Created Claims ({results.created.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Claim #</th>
                          <th className="text-left p-2">Amount</th>
                          <th className="text-left p-2">Validated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.created.map((c: any) => (
                          <tr key={c.claimId} className="border-b">
                            <td className="p-2 font-mono">{c.claimNumber}</td>
                            <td className="p-2">{formatCurrency(c.claimAmount)}</td>
                            <td className="p-2">{c.isNhisValidated ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {results.failed.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-rose-700">Failed ({results.failed.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-32 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Invoice ID</th>
                          <th className="text-left p-2">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.failed.map((f: any, i: number) => (
                          <tr key={i} className="border-b">
                            <td className="p-2 font-mono text-[10px]">{f.invoiceId?.slice(-8) || "—"}</td>
                            <td className="p-2 text-rose-600">{f.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <DialogFooter>
              <Button onClick={onCreated} className="gap-2 bg-emerald-600 hover:bg-emerald-700">Done</Button>
            </DialogFooter>
          </div>
        ) : (
          /* Setup + selection view */
          <div className="space-y-3">
            {/* Provider + claim type + default diagnosis */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Insurance Provider</FieldLabel>
                <Select value={providerId || undefined} onValueChange={setProviderId}>
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {providers.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.code?.toUpperCase().includes("NHIS") && <Badge variant="secondary" className="ml-2 text-[9px]">NHIS</Badge>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel required>Claim Type</FieldLabel>
                <Select value={claimType} onValueChange={setClaimType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outpatient">Outpatient</SelectItem>
                    <SelectItem value="inpatient">Inpatient</SelectItem>
                    <SelectItem value="day_case">Day Case</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <EntitySelect
              label="Default Primary Diagnosis (applied to all claims) — optional"
              endpoint="/api/diagnoses/catalog"
              queryParam="q"
              queryParams={{ limit: "20" }}
              getLabel={(item: any) => item.name}
              getId={(item: any) => item.id}
              getSubtitle={(item: any) => item.category}
              getCode={(item: any) => item.code}
              placeholder="Search ICD-10 diagnosis to apply to all claims..."
              value={defaultDx}
              onChange={setDefaultDx}
              allowManual
            />

            {/* Patient search filter */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <Input
                placeholder="Filter by patient name or number (optional)..."
                value={searchPatient}
                onChange={(e) => setSearchPatient(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Invoice selection table */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">
                  Outstanding Invoices ({filteredInvoices.length})
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={selectAll} disabled={filteredInvoices.length === 0}>Select All</Button>
                  <Button size="sm" variant="outline" onClick={clearAll} disabled={selectedInvoices.size === 0}>Clear</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? <LoadingState rows={4} /> :
                 filteredInvoices.length === 0 ? <p className="p-4 text-sm text-slate-500 text-center">No outstanding invoices found.</p> :
                 <div className="max-h-64 overflow-y-auto">
                   <table className="w-full text-xs">
                     <thead className="bg-slate-50 sticky top-0">
                       <tr>
                         <th className="p-2 w-8"><input type="checkbox" checked={selectedInvoices.size === filteredInvoices.length && filteredInvoices.length > 0} onChange={(e) => e.target.checked ? selectAll() : clearAll()} /></th>
                         <th className="text-left p-2">Invoice #</th>
                         <th className="text-left p-2">Patient</th>
                         <th className="text-right p-2">Balance</th>
                       </tr>
                     </thead>
                     <tbody>
                       {filteredInvoices.slice(0, 100).map((inv: any) => (
                         <tr key={inv.id} className={`border-b cursor-pointer hover:bg-slate-50 ${selectedInvoices.has(inv.id) ? "bg-emerald-50" : ""}`} onClick={() => toggleInvoice(inv.id)}>
                           <td className="p-2"><input type="checkbox" checked={selectedInvoices.has(inv.id)} onChange={() => toggleInvoice(inv.id)} /></td>
                           <td className="p-2 font-mono">{inv.invoiceNumber}</td>
                           <td className="p-2">{inv.patient?.firstName} {inv.patient?.lastName} <span className="text-slate-400">({inv.patient?.patientNumber})</span></td>
                           <td className="p-2 text-right font-semibold">{formatCurrency(inv.balance)}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                   {filteredInvoices.length > 100 && <p className="p-2 text-center text-xs text-slate-500">Showing first 100 of {filteredInvoices.length}. Refine search to see more.</p>}
                 </div>}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                <strong className="text-indigo-700">{selectedInvoices.size}</strong> invoice{selectedInvoices.size === 1 ? "" : "s"} selected
              </span>
              <span className="text-slate-500">
                Total: {formatCurrency(Array.from(selectedInvoices).reduce((sum, id) => sum + (outstandingInvoices.find((i: any) => i.id === id)?.balance || 0), 0))}
              </span>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={saving || !providerId || selectedInvoices.size === 0} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</> : <><Layers className="w-4 h-4" /> Generate {selectedInvoices.size} Claims</>}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

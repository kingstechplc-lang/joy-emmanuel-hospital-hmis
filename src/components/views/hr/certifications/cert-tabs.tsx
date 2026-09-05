"use client";
// =====================================================================
// CERT RECORDS TAB + SETTINGS TAB
// =====================================================================
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Check, X, Award, ShieldCheck, Ban, RefreshCcw, FileCheck,
  AlertTriangle, Settings, Building2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchJson, usePermissions, ColoredBadge, CERT_STATUSES, VERIFICATION_STATUSES,
  CREDENTIAL_TYPES, CERT_CATEGORIES, VERIFICATION_METHODS,
  formatDate, daysUntil,
} from "./cert-helpers";
import { StaffSearchableSelect } from "@/components/ui/staff-searchable-select";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { EmptyState, LoadingState, ErrorState, ClearableSearch, usePagination, Pagination } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

// =====================================================================
// RECORDS TAB
// =====================================================================
export function CertRecordsTab() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [credentialType, setCredentialType] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [actionDialog, setActionDialog] = useState<{ id: string; action: string; certName: string } | null>(null);

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (credentialType !== "all") params.set("credentialType", credentialType);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["certifications", search, statusFilter, credentialType],
    queryFn: () => fetchJson(`/api/certifications${qs}`),
  });

  const items = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 15);

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, body }: { id: string; action: string; body?: any }) => {
      const res = await fetch(`/api/certifications/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : "{}",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Certification ${vars.action}d`);
      qc.invalidateQueries({ queryKey: ["certifications"] });
      qc.invalidateQueries({ queryKey: ["certification-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleAction = (id: string, action: string, certName: string) => {
    if (action === "verify") {
      setActionDialog({ id, action, certName });
    } else if (action === "approve") {
      actionMutation.mutate({ id, action });
    } else if (action === "suspend" || action === "revoke" || action === "reactivate") {
      const reason = prompt(`Reason for ${action} (required):`);
      if (reason) actionMutation.mutate({ id, action, body: { reason } });
    } else if (action === "renew") {
      setActionDialog({ id, action, certName });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 flex-wrap">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
          <ClearableSearch value={search} onChange={setSearch} placeholder="Search by name, number, issuer..." className="pl-8" />
        </div>
        <Select value={statusFilter || "all"} onValueChange={setStatusFilter}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {CERT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={credentialType || "all"} onValueChange={setCredentialType}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {CREDENTIAL_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }} className="gap-2">
          <RefreshCcw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        {can(["certification.create", "staff.manage", "shift.manage"]) && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> New
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState message="Failed to load certifications" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No certifications found" description="Add a certification or adjust your filters." icon={Award} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Certification</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Number</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Issued</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Expires</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Verification</th>
                    {can(["certification.verify", "certification.approve", "shift.manage"]) && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((c: any) => {
                    const days = daysUntil(c.expiryDate);
                    return (
                      <tr key={c.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{c.staff?.firstName} {c.staff?.lastName}</div>
                          <div className="text-xs text-slate-500">{c.staff?.staffNumber}</div>
                        </td>
                        <td className="p-3">
                          <div>{c.certificationName}</div>
                          <div className="text-xs text-slate-500">{c.issuingBody || "—"}</div>
                        </td>
                        <td className="p-3"><Badge variant="outline" className="text-xs capitalize">{c.credentialType?.replace(/_/g, " ")}</Badge></td>
                        <td className="p-3 text-xs font-mono">{c.certificateNumber || c.licenseNumber || "—"}</td>
                        <td className="p-3 text-xs">{formatDate(c.issueDate)}</td>
                        <td className="p-3 text-xs">
                          {formatDate(c.expiryDate)}
                          {days !== null && days <= 90 && days > 0 && <div className="text-amber-700">in {days}d</div>}
                          {days !== null && days < 0 && <div className="text-rose-700">expired</div>}
                        </td>
                        <td className="p-3"><ColoredBadge status={c.effectiveStatus || c.status} list={CERT_STATUSES} /></td>
                        <td className="p-3"><ColoredBadge status={c.verificationStatus} list={VERIFICATION_STATUSES} /></td>
                        {can(["certification.verify", "certification.approve", "shift.manage"]) && (
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              {c.verificationStatus === "pending" && can(["certification.verify", "shift.manage"]) && (
                                <Button size="sm" variant="ghost" onClick={() => handleAction(c.id, "verify", c.certificationName)} className="h-7 text-xs text-cyan-600" title="Verify">
                                  <FileCheck className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {c.status === "pending_approval" && can(["certification.approve", "shift.manage"]) && (
                                <Button size="sm" variant="ghost" onClick={() => handleAction(c.id, "approve", c.certificationName)} className="h-7 text-xs text-emerald-600" title="Approve">
                                  <Check className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {c.status === "active" && can(["certification.renew", "shift.manage"]) && (
                                <Button size="sm" variant="ghost" onClick={() => handleAction(c.id, "renew", c.certificationName)} className="h-7 text-xs text-blue-600" title="Renew">
                                  <RefreshCcw className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {c.status === "active" && can(["certification.suspend", "shift.manage"]) && (
                                <Button size="sm" variant="ghost" onClick={() => handleAction(c.id, "suspend", c.certificationName)} className="h-7 text-xs text-orange-600" title="Suspend">
                                  <Ban className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {c.status === "active" && can(["certification.revoke", "shift.manage"]) && (
                                <Button size="sm" variant="ghost" onClick={() => handleAction(c.id, "revoke", c.certificationName)} className="h-7 text-xs text-rose-600" title="Revoke">
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {(c.status === "suspended" || c.status === "revoked") && can(["certification.approve", "shift.manage"]) && (
                                <Button size="sm" variant="ghost" onClick={() => handleAction(c.id, "reactivate", c.certificationName)} className="h-7 text-xs text-emerald-600" title="Reactivate">
                                  <Check className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </CardContent>
        </Card>
      )}

      {showNew && <NewCertDialog onClose={() => setShowNew(false)} />}
      {actionDialog && (
        <ActionDialog
          onClose={() => setActionDialog(null)}
          onSubmit={(body) => {
            actionMutation.mutate({ id: actionDialog.id, action: actionDialog.action, body });
            setActionDialog(null);
          }}
          action={actionDialog.action}
          certName={actionDialog.certName}
        />
      )}
    </div>
  );
}

function NewCertDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [certificationName, setCertificationName] = useState("");
  const [certificationTypeId, setCertificationTypeId] = useState("");
  const [credentialType, setCredentialType] = useState("certification");
  const [category, setCategory] = useState("");
  const [issuingBody, setIssuingBody] = useState("");
  const [issuerId, setIssuerId] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [isMandatory, setIsMandatory] = useState(false);
  const [documentUrl, setDocumentUrl] = useState("");
  const [notes, setNotes] = useState("");

  const { data: typesData } = useQuery({ queryKey: ["cert-types-for-new"], queryFn: () => fetchJson(`/api/certification-types`) });
  const { data: issuersData } = useQuery({ queryKey: ["cert-issuers-for-new"], queryFn: () => fetchJson(`/api/certification-issuers`) });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/certifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId, certificationName,
          certificationTypeId: certificationTypeId || undefined,
          credentialType, category: category || undefined,
          issuingBody: issuingBody || undefined,
          issuerId: issuerId || undefined,
          certificateNumber: certificateNumber || undefined,
          issueDate,
          expiryDate: expiryDate || undefined,
          isMandatory,
          documentUrl: documentUrl || undefined,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Certification added");
      qc.invalidateQueries({ queryKey: ["certifications"] });
      qc.invalidateQueries({ queryKey: ["certification-dashboard"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add Certification / Credential</DialogTitle>
          <DialogDescription>Record a staff member's certification, license, or credential.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="md:col-span-2">
            <StaffSearchableSelect value={staffId} onValueChange={setStaffId} label="Staff Member" required />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Certification / License Name</FieldLabel>
            <Input value={certificationName} onChange={(e) => setCertificationName(e.target.value)} placeholder="e.g., Basic Life Support" />
          </div>
          <div className="space-y-1.5">
            <Label>Certification Type</Label>
            <SearchableSelect
              options={[{ value: "__none__", label: "—" }, ...(typesData?.items || []).map((t: any) => ({ value: t.id, label: t.name, description: t.code, secondary: t.category }))]
              }
              value={certificationTypeId || "__none__"}
              onValueChange={(v) => { setCertificationTypeId(v === "__none__" ? "" : v); const t = (typesData?.items || []).find((x: any) => x.id === v); if (t) { setCredentialType(t.credentialType); setCategory(t.category || ""); setCertificationName(t.name); } }}
              placeholder="Search type (optional)..."
              searchPlaceholder="Type name or code..."
              emptyText="No types found. Seed defaults in Settings."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Credential Type</Label>
            <Select value={credentialType} onValueChange={setCredentialType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CREDENTIAL_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category || "__none__"} onValueChange={(v) => setCategory(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {CERT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Issuing Organization</Label>
            <SearchableSelect
              options={[{ value: "__none__", label: "—" }, ...(issuersData?.items || []).map((i: any) => ({ value: i.id, label: i.name, description: i.country, secondary: i.type }))]
              }
              value={issuerId || "__none__"}
              onValueChange={(v) => { setIssuerId(v === "__none__" ? "" : v); const i = (issuersData?.items || []).find((x: any) => x.id === v); if (i) setIssuingBody(i.name); }}
              placeholder="Search issuer (optional)..."
              searchPlaceholder="Type issuer name..."
              emptyText="No issuers found. Seed defaults in Settings."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Issuing Body (free text)</Label>
            <Input value={issuingBody} onChange={(e) => setIssuingBody(e.target.value)} placeholder="e.g., Medical and Dental Council" />
          </div>
          <div className="space-y-1.5">
            <Label>Certificate / License Number</Label>
            <Input value={certificateNumber} onChange={(e) => setCertificateNumber(e.target.value)} placeholder="e.g., MDC/2026/00123" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Issue Date</FieldLabel>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Expiry Date (leave blank if no expiry)</Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Document URL (optional)</Label>
            <Input value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5 flex items-center pt-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} /> Mandatory
            </label>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !staffId || !certificationName || !issueDate} className="bg-emerald-600 hover:bg-emerald-700">
            Add Certification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionDialog({ onClose, onSubmit, action, certName }: { onClose: () => void; onSubmit: (body: any) => void; action: string; certName: string }) {
  const [verificationMethod, setVerificationMethod] = useState("document_review");
  const [verificationReference, setVerificationReference] = useState("");
  const [verificationNotes, setVerificationNotes] = useState("");
  const [newIssueDate, setNewIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [newCertificateNumber, setNewCertificateNumber] = useState("");

  const isVerify = action === "verify";
  const isRenew = action === "renew";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="capitalize">{action} Certification</DialogTitle>
          <DialogDescription>{certName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {isVerify && (
            <>
              <div className="space-y-1.5">
                <Label>Verification Method</Label>
                <Select value={verificationMethod} onValueChange={setVerificationMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VERIFICATION_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reference Number (optional)</Label>
                <Input value={verificationReference} onChange={(e) => setVerificationReference(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Verification Notes</Label>
                <Textarea value={verificationNotes} onChange={(e) => setVerificationNotes(e.target.value)} rows={3} placeholder="e.g., Document reviewed. Valid until 2028." />
              </div>
            </>
          )}
          {isRenew && (
            <>
              <div className="space-y-1.5">
                <FieldLabel required>New Issue Date</FieldLabel>
                <Input type="date" value={newIssueDate} onChange={(e) => setNewIssueDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>New Expiry Date</Label>
                <Input type="date" value={newExpiryDate} onChange={(e) => setNewExpiryDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>New Certificate Number (optional)</Label>
                <Input value={newCertificateNumber} onChange={(e) => setNewCertificateNumber(e.target.value)} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit(isVerify ? { verificationMethod, verificationReference, verificationNotes } : isRenew ? { newIssueDate, newExpiryDate: newExpiryDate || undefined, newCertificateNumber: newCertificateNumber || undefined } : {})} className="bg-emerald-600 hover:bg-emerald-700">
            Confirm {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// SETTINGS TAB
// =====================================================================
export function CertSettingsTab() {
  const [subTab, setSubTab] = useState("types");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={subTab === "types" ? "default" : "outline"} onClick={() => setSubTab("types")}>Certification Types</Button>
        <Button size="sm" variant={subTab === "issuers" ? "default" : "outline"} onClick={() => setSubTab("issuers")}>Issuing Organizations</Button>
        <Button size="sm" variant={subTab === "requirements" ? "default" : "outline"} onClick={() => setSubTab("requirements")}>Requirements</Button>
      </div>
      {subTab === "types" && <CertTypesSettings />}
      {subTab === "issuers" && <CertIssuersSettings />}
      {subTab === "requirements" && <CertRequirementsSettings />}
    </div>
  );
}

function SeedButton() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const seed = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/seed-certification-defaults", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Seeded: ${data.results.typesCreated} types, ${data.results.issuersCreated} issuers`);
      qc.invalidateQueries({ queryKey: ["cert-types"] });
      qc.invalidateQueries({ queryKey: ["cert-issuers"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  return (
    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="text-sm text-blue-900 mb-2">No configuration yet? Seed standard certification types (BLS, ACLS, Medical License, etc.) and issuing organizations with one click.</div>
      <Button size="sm" onClick={seed} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
        <Settings className="w-3 h-3 mr-1" /> {loading ? "Seeding..." : "Seed Defaults"}
      </Button>
    </div>
  );
}

function CertTypesSettings() {
  const { can } = usePermissions();
  const [showNew, setShowNew] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["cert-types-settings"], queryFn: () => fetchJson(`/api/certification-types`) });
  const items = data?.items || [];
  if (isLoading) return <LoadingState rows={4} />;
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Certification Types ({items.length})</CardTitle>
        {can(["certification_requirement.manage", "shift.manage"]) && <Button size="sm" onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-3 h-3 mr-1" /> New</Button>}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState title="No certification types configured" description="Seed defaults or create custom types." icon={Settings} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {items.map((t: any) => (
              <div key={t.id} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t.name}</span>
                  <Badge variant="outline" className="text-xs">{t.code}</Badge>
                </div>
                <div className="text-xs text-slate-500 mt-1">{t.category} • {t.credentialType.replace(/_/g, " ")}{t.isMandatory && " • Mandatory"}{t.defaultValidityMonths && ` • ${t.defaultValidityMonths}m validity`}</div>
              </div>
            ))}
          </div>
        )}
        <SeedButton />
      </CardContent>
      {showNew && <NewCertTypeDialog onClose={() => setShowNew(false)} />}
    </Card>
  );
}

function NewCertTypeDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [credentialType, setCredentialType] = useState("certification");
  const [isMandatory, setIsMandatory] = useState(false);
  const [defaultValidityMonths, setDefaultValidityMonths] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/certification-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, category: category || undefined, credentialType, isMandatory, defaultValidityMonths: defaultValidityMonths || undefined, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => { toast.success("Type created"); qc.invalidateQueries({ queryKey: ["cert-types"] }); qc.invalidateQueries({ queryKey: ["cert-types-settings"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Certification Type</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2"><FieldLabel required>Name</FieldLabel><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Basic Life Support" /></div>
          <div className="space-y-1.5"><FieldLabel required>Code</FieldLabel><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g., BLS" /></div>
          <div className="space-y-1.5"><Label>Category</Label><Select value={category || "__none__"} onValueChange={(v) => setCategory(v === "__none__" ? "" : v)}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="__none__">—</SelectItem>{CERT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Credential Type</Label><Select value={credentialType} onValueChange={setCredentialType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CREDENTIAL_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Validity (months)</Label><Input type="number" value={defaultValidityMonths} onChange={(e) => setDefaultValidityMonths(e.target.value)} placeholder="24" /></div>
          <div className="space-y-1.5 md:col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} /> Mandatory</label></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name || !code} className="bg-emerald-600 hover:bg-emerald-700">Create Type</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CertIssuersSettings() {
  const { can } = usePermissions();
  const { data, isLoading } = useQuery({ queryKey: ["cert-issuers-settings"], queryFn: () => fetchJson(`/api/certification-issuers`) });
  const items = data?.items || [];
  if (isLoading) return <LoadingState rows={4} />;
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">Issuing Organizations ({items.length})</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState title="No issuing organizations configured" description="Seed defaults or add licensing bodies." icon={Building2} />
        ) : (
          <div className="space-y-1">
            {items.map((i: any) => (
              <div key={i.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                <div>
                  <span className="font-medium">{i.name}</span>
                  <span className="text-slate-500 ml-2">{i.type} • {i.country}</span>
                </div>
                {i.verificationUrl && <Badge variant="outline" className="text-xs">Has verification URL</Badge>}
              </div>
            ))}
          </div>
        )}
        <SeedButton />
      </CardContent>
    </Card>
  );
}

function CertRequirementsSettings() {
  const { data, isLoading } = useQuery({ queryKey: ["cert-reqs-settings"], queryFn: () => fetchJson(`/api/certification-requirements`) });
  const items = data?.items || [];
  if (isLoading) return <LoadingState rows={3} />;
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">Certification Requirements ({items.length})</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState title="No certification requirements configured" description="Define which certifications are mandatory for which roles/departments." icon={ShieldCheck} />
        ) : (
          <div className="space-y-1">
            {items.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                <div>
                  <span className="font-medium">{r.certificationName}</span>
                  <span className="text-slate-500 ml-2">• {r.profession || "Any profession"} • {r.department?.name || "Any dept"}</span>
                </div>
                {r.isMandatory && <Badge variant="destructive" className="text-xs">Mandatory</Badge>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

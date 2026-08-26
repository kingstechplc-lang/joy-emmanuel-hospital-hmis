"use client";
import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Receipt, Eye, CreditCard, Ban, Trash2, Search, X } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatCurrency, safeJson, PageHeader, ClearableSearch, usePagination, Pagination } from "@/components/ui-helpers"
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { PrintButton, PrintLayout } from "@/components/print/print-layout";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "issued", label: "Issued" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

export function InvoicesView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<any | null>(null);
  const [payInvoice, setPayInvoice] = useState<any | null>(null);
  const [addItemInvoice, setAddItemInvoice] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["invoices", activeFacilityId, statusFilter],
    queryFn: () => fetchJson(`/api/invoices${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
  };

  const cancel = (id: string) => {
    confirmAction({
      title: "Cancel this invoice?",
      description: "Cancelling marks the invoice as cancelled. This cannot be undone. If payments were already received, they will need to be refunded separately.",
      confirmText: "Yes, cancel invoice",
      variant: "warning",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/invoices/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "cancel" }),
          });
          if (!res.ok) {
            const err = await safeJson(res);
            throw new Error(err.error || "Failed");
          }
          toast.success("Invoice cancelled");
          invalidate();
        } catch (e: any) {
          toast.error(e.message);
        }
      },
    });
  };

  const items: any[] = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 10);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        description="Manage patient invoices and billing"
        icon={Receipt}
        gradient="from-rose-500 to-red-600"
      
        actions={
                  <Button onClick={() => setShowNew(true)} disabled={!can("billing.create")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Invoice
        </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view invoices.</CardContent></Card>
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
        <ErrorState message="Failed to load invoices" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No invoices"
              description="Create a new invoice to bill a patient."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("billing.create")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Invoice</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Invoice #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Total</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Paid</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Balance</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Issued</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((inv: any) => (
                    <tr key={inv.id} className="border-b hover:bg-emerald-50/40">
                      <td className="p-3 font-mono text-xs text-slate-700">{inv.invoiceNumber}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{inv.patient?.firstName} {inv.patient?.lastName}</div>
                        <div className="text-xs text-slate-500">{inv.patient?.patientNumber}</div>
                      </td>
                      <td className="p-3 text-right font-mono text-xs">{formatCurrency(inv.total, inv.currency)}</td>
                      <td className="p-3 text-right font-mono text-xs text-emerald-700">{formatCurrency(inv.amountPaid, inv.currency)}</td>
                      <td className="p-3 text-right font-mono text-xs text-rose-700">{formatCurrency(inv.balance, inv.currency)}</td>
                      <td className="p-3"><StatusBadge status={inv.status} /></td>
                      <td className="p-3 text-xs text-slate-600">{formatDate(inv.issuedAt)}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setViewInvoice(inv)} className="gap-1 h-7 text-xs">
                            <Eye className="w-3 h-3" /> View
                          </Button>
                          {inv.balance > 0 && inv.status !== "cancelled" && can("billing.payment") && (
                            <Button size="sm" onClick={() => setPayInvoice(inv)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <CreditCard className="w-3 h-3" /> Pay
                            </Button>
                          )}
                          {inv.status === "issued" && can("billing.create") && (
                            <Button size="sm" variant="outline" onClick={() => setAddItemInvoice(inv)} className="gap-1 h-7 text-xs">
                              <Plus className="w-3 h-3" /> Add Item
                            </Button>
                          )}
                          {inv.status === "issued" && inv._count?.payments === 0 && can("billing.cancel") && (
                            <Button size="sm" variant="ghost" onClick={() => cancel(inv.id)} className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700">
                              <Ban className="w-3 h-3" /> Cancel
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

      <NewInvoiceDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} facilityId={activeFacilityId} />

      {viewInvoice && (
        <ViewInvoiceDialog invoiceId={viewInvoice.id} onClose={() => setViewInvoice(null)} />
      )}

      {payInvoice && (
        <PaymentDialog invoice={payInvoice} onClose={() => setPayInvoice(null)} onDone={() => { setPayInvoice(null); invalidate(); }} canPay={can("billing.payment")} />
      )}

      {addItemInvoice && (
        <AddItemDialog invoice={addItemInvoice} onClose={() => setAddItemInvoice(null)} onDone={() => { setAddItemInvoice(null); invalidate(); }} facilityId={activeFacilityId} />
      )}
      {confirmDialogEl}
    </div>
  );
}

// ============================================================
// New Invoice Dialog — line items + auto-calc totals
// ============================================================
type LineItem = {
  serviceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
};

function NewInvoiceDialog({ open, onClose, onCreated, facilityId }: { open: boolean; onClose: () => void; onCreated: () => void; facilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [headerDiscount, setHeaderDiscount] = useState(0);
  const [headerTax, setHeaderTax] = useState(0);
  const [items, setItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0, discount: 0, tax: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const itemsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newly added item so user can edit it without scrolling
  useEffect(() => {
    if (items.length > 1 && itemsEndRef.current) {
      itemsEndRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [items.length]);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search-invoice", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters-invoice", patientId, facilityId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}${facilityId ? `&facilityId=${facilityId}` : ""}`),
    enabled: !!patientId,
  });

  const { data: servicesData } = useQuery({
    queryKey: ["services-catalog", facilityId],
    queryFn: () => fetchJson(`/api/services${facilityId ? `?facilityId=${facilityId}` : ""}`),
    enabled: !!facilityId,
  });

  const selectPatient = (p: any) => {
    setPatientId(p.id);
    setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
  };

  const updateItem = (index: number, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const selectService = (index: number, serviceId: string) => {
    const svc = (servicesData?.items || []).find((s: any) => s.id === serviceId);
    if (svc) {
      updateItem(index, {
        serviceId: svc.id,
        description: svc.name,
        unitPrice: Number(svc.unitPrice) || 0,
      });
    }
  };

  const addItem = () => setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0, discount: 0, tax: 0 }]);
  const removeItem = (index: number) => setItems((p) => p.filter((_, i) => i !== index));

  const lineTotal = (it: LineItem) => Math.max(0, (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0) - (Number(it.discount) || 0) + (Number(it.tax) || 0));
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const total = Math.max(0, subtotal - (Number(headerDiscount) || 0) + (Number(headerTax) || 0));

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    if (!facilityId) { toast.error("No active facility"); return; }
    if (items.length === 0 || items.some((it) => !it.description)) { toast.error("All line items need a description"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          encounterId: encounterId || undefined,
          facilityId,
          dueAt: dueAt || undefined,
          discount: Number(headerDiscount) || 0,
          tax: Number(headerTax) || 0,
          items: items.map((it) => ({
            serviceId: it.serviceId || undefined,
            description: it.description,
            quantity: Number(it.quantity) || 1,
            unitPrice: Number(it.unitPrice) || 0,
            discount: Number(it.discount) || 0,
            tax: Number(it.tax) || 0,
          })),
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Invoice issued");
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setDueAt(""); setHeaderDiscount(0); setHeaderTax(0);
      setItems([{ description: "", quantity: 1, unitPrice: 0, discount: 0, tax: 0 }]);
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2"><Receipt className="w-5 h-5 text-emerald-600" /> New Invoice</DialogTitle>
          <DialogDescription>Add line items — selecting a service auto-fills the unit price from the facility price list. Totals are computed automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <ClearableSearch value={patientQuery} onChange={setPatientQuery} placeholder="Search patient..." className="" inputClassName="" />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Encounter (optional)</Label>
                <Select value={encounterId || undefined} onValueChange={setEncounterId}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {(encountersData?.items || []).map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.encounterNumber} • {e.encounterType}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Date (optional)</Label>
                <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <div className="sticky top-0 z-20 bg-white pb-1 mb-1 flex items-center justify-between border-b border-slate-100">
              <Label>Line Items ({items.length})</Label>
              <Button size="sm" variant="outline" onClick={addItem} className="gap-1 h-7 text-xs"><Plus className="w-3 h-3" /> Add Item</Button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="border rounded p-2 space-y-2 bg-slate-50">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 md:col-span-5">
                      <Label className="text-[10px]">Service (auto-fills price)</Label>
                      <Select value={it.serviceId || "_none"} onValueChange={(v) => v !== "_none" && selectService(i, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="— Custom —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">— Custom / Manual —</SelectItem>
                          {(servicesData?.items || []).map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name} • {formatCurrency(s.unitPrice)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-12 md:col-span-7">
                      <FieldLabel required className="text-[10px]">Description</FieldLabel>
                      <Input value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    <div>
                      <Label className="text-[10px]">Qty</Label>
                      <Input type="number" min="1" value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Unit Price</Label>
                      <Input type="number" step="0.01" value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Discount</Label>
                      <Input type="number" step="0.01" value={it.discount} onChange={(e) => updateItem(i, { discount: Number(e.target.value) })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Tax</Label>
                      <Input type="number" step="0.01" value={it.tax} onChange={(e) => updateItem(i, { tax: Number(e.target.value) })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Line Total</Label>
                      <div className="h-8 px-2 flex items-center text-xs font-mono font-semibold text-emerald-700">
                        {formatCurrency(lineTotal(it))}
                      </div>
                    </div>
                  </div>
                  {items.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => removeItem(i)} className="gap-1 h-6 text-xs text-rose-600 hover:text-rose-700">
                      <Trash2 className="w-3 h-3" /> Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div ref={itemsEndRef} />
          </div>

          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Header Discount</Label>
              <Input type="number" step="0.01" value={headerDiscount} onChange={(e) => setHeaderDiscount(Number(e.target.value))} />
            </div>
            <div>
              <Label>Header Tax</Label>
              <Input type="number" step="0.01" value={headerTax} onChange={(e) => setHeaderTax(Number(e.target.value))} />
            </div>
            <div>
              <Label>Invoice Total</Label>
              <div className="h-9 px-2 flex items-center text-lg font-mono font-bold text-emerald-700">{formatCurrency(total)}</div>
            </div>
          </div>
        </div>
        {/* Sticky footer with Add Item button always visible */}
        <div className="shrink-0 border-t pt-3 space-y-3 bg-white">
          <div className="flex items-center justify-between">
            <Button size="sm" variant="outline" onClick={addItem} className="gap-1 h-8 text-xs">
              <Plus className="w-3.5 h-3.5" /> Add Line Item
            </Button>
            <div className="text-sm font-mono font-bold text-emerald-700">
              Total: {formatCurrency(total)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !patientId} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Issuing..." : <><Receipt className="w-4 h-4" /> Issue Invoice</>}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// View Invoice Dialog — shows full invoice with items and payments
// ============================================================
function ViewInvoiceDialog({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["invoice-detail", invoiceId],
    queryFn: () => fetchJson(`/api/invoices/${invoiceId}`),
  });
  const inv = data?.item;

  if (isLoading) return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl"><div className="p-4"><LoadingState rows={4} /></div></DialogContent>
    </Dialog>
  );

  if (!inv) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Receipt className="w-5 h-5 text-emerald-600" /> {inv.invoiceNumber}</DialogTitle>
          <DialogDescription>
            {inv.patient?.firstName} {inv.patient?.lastName} ({inv.patient?.patientNumber}) • {inv.facility?.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <StatusBadge status={inv.status} />
            <span className="text-xs text-slate-500">Issued {formatDate(inv.issuedAt, true)}</span>
            {inv.dueAt && <span className="text-xs text-slate-500">• Due {formatDate(inv.dueAt)}</span>}
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Line Items</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <table className="w-full text-xs">
                <thead className="border-b">
                  <tr>
                    <th className="text-left p-2">Description</th>
                    <th className="text-right p-2">Qty</th>
                    <th className="text-right p-2">Price</th>
                    <th className="text-right p-2">Disc</th>
                    <th className="text-right p-2">Tax</th>
                    <th className="text-right p-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(inv.items || []).map((it: any) => (
                    <tr key={it.id} className="border-b">
                      <td className="p-2">
                        <div className="font-medium">{it.description}</div>
                        {it.service && <div className="text-[10px] text-slate-500">{it.service.code} • {it.service.category}</div>}
                      </td>
                      <td className="p-2 text-right">{it.quantity}</td>
                      <td className="p-2 text-right">{formatCurrency(it.unitPrice, inv.currency)}</td>
                      <td className="p-2 text-right">{formatCurrency(it.discount, inv.currency)}</td>
                      <td className="p-2 text-right">{formatCurrency(it.tax, inv.currency)}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(it.total, inv.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal:</span><span className="font-mono">{formatCurrency(inv.subtotal, inv.currency)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Discount:</span><span className="font-mono text-rose-700">-{formatCurrency(inv.discount, inv.currency)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Tax:</span><span className="font-mono">+{formatCurrency(inv.tax, inv.currency)}</span></div>
              <div className="flex justify-between border-t pt-1"><span className="font-semibold">Total:</span><span className="font-mono font-bold text-emerald-700">{formatCurrency(inv.total, inv.currency)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Paid:</span><span className="font-mono text-emerald-700">{formatCurrency(inv.amountPaid, inv.currency)}</span></div>
              <div className="flex justify-between"><span className="font-semibold">Balance:</span><span className="font-mono font-bold text-rose-700">{formatCurrency(inv.balance, inv.currency)}</span></div>
            </div>
            <div>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Payments</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  {(inv.payments || []).length === 0 ? (
                    <p className="text-xs text-slate-500">No payments recorded yet.</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {(inv.payments || []).map((p: any) => (
                        <div key={p.id} className="text-xs flex justify-between">
                          <span>{p.paymentNumber} • {p.paymentMethod}</span>
                          <span className="font-mono">{formatCurrency(p.amount, inv.currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <PrintButton
            label="Print Invoice"
            renderContent={() => (
              <PrintLayout
                title="Invoice"
                subtitle={inv.facility?.name}
                documentNumber={inv.invoiceNumber}
                facility={inv.facility}
                patient={inv.patient}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginBottom: "16px" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Description</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>Qty</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>Unit Price</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>Disc</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(inv.items || []).map((it: any) => (
                      <tr key={it.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px" }}>{it.description}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{it.quantity}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{formatCurrency(it.unitPrice, inv.currency)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{formatCurrency(it.discount, inv.currency)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{formatCurrency(it.total, inv.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginLeft: "auto", width: "250px", fontSize: "11px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>Subtotal:</span><span>{formatCurrency(inv.subtotal, inv.currency)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>Discount:</span><span>-{formatCurrency(inv.discount, inv.currency)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>Tax:</span><span>{formatCurrency(inv.tax, inv.currency)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "2px solid #059669", marginTop: "4px" }}>
                    <span style={{ fontWeight: 700 }}>Total:</span>
                    <span style={{ fontWeight: 700, color: "#059669" }}>{formatCurrency(inv.total, inv.currency)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>Paid:</span><span style={{ color: "#059669" }}>{formatCurrency(inv.amountPaid, inv.currency)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                    <span style={{ fontWeight: 700 }}>Balance Due:</span>
                    <span style={{ fontWeight: 700, color: "#be123c" }}>{formatCurrency(inv.balance, inv.currency)}</span>
                  </div>
                </div>
                <div style={{ marginTop: "16px", fontSize: "10px", color: "#64748b" }}>
                  <p>Status: <strong>{inv.status}</strong></p>
                  <p>Issued: {formatDate(inv.issuedAt, true)}</p>
                  {inv.dueAt && <p>Due: {formatDate(inv.dueAt)}</p>}
                </div>
              </PrintLayout>
            )}
          />
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Payment Dialog — quick payment on an invoice
// ============================================================
function PaymentDialog({ invoice, onClose, onDone, canPay }: { invoice: any; onClose: () => void; onDone: () => void; canPay: boolean }) {
  const [amount, setAmount] = useState(invoice.balance || 0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [transactionReference, setTransactionReference] = useState("");
  const [saving, setSaving] = useState(false);
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();

  const submit = async () => {
    if (!amount || amount <= 0) { toast.error("Amount must be > 0"); return; }
    if (amount > invoice.balance + 0.01) {
      confirmAction({
        title: "Overpayment Warning",
        description: `The entered amount exceeds the outstanding balance. The excess will be credited to the patient's account.`,
        confirmText: "Yes, accept overpayment",
        variant: "warning",
        details: (
          <div>
            <div><strong>Outstanding balance:</strong> {formatCurrency(invoice.balance, invoice.currency)}</div>
            <div><strong>Payment amount:</strong> {formatCurrency(amount, invoice.currency)}</div>
            <div><strong>Overpayment:</strong> {formatCurrency(amount - invoice.balance, invoice.currency)}</div>
          </div>
        ),
        onConfirm: () => doSubmit(),
      });
      return;
    }
    doSubmit();
  };

  const doSubmit = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          patientId: invoice.patientId,
          facilityId: invoice.facilityId,
          amount,
          paymentMethod,
          transactionReference,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Payment recorded");
      setAmount(0); setTransactionReference("");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-emerald-600" /> Record Payment</DialogTitle>
          <DialogDescription>
            Invoice {invoice.invoiceNumber} • Outstanding {formatCurrency(invoice.balance, invoice.currency)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Amount</FieldLabel>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <p className="text-[10px] text-slate-500 mt-1">Defaulted to outstanding balance</p>
          </div>
          <div>
            <FieldLabel required>Payment Method</FieldLabel>
            <Select value={paymentMethod || undefined} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="mobile_money">Mobile Money</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
                <SelectItem value="insurance">Insurance</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Transaction Reference (optional)</Label>
            <Input value={transactionReference} onChange={(e) => setTransactionReference(e.target.value)} placeholder="Momo ref, cheque #, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !canPay} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Recording..." : <><CreditCard className="w-4 h-4" /> Record Payment</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {confirmDialogEl}
  </>
  );
}

// ============================================================
// Add Item Dialog — append a line item to an issued invoice
// ============================================================
function AddItemDialog({ invoice, onClose, onDone, facilityId }: { invoice: any; onClose: () => void; onDone: () => void; facilityId: string | null }) {
  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [saving, setSaving] = useState(false);

  const { data: servicesData } = useQuery({
    queryKey: ["services-additem", facilityId],
    queryFn: () => fetchJson(`/api/services${facilityId ? `?facilityId=${facilityId}` : ""}`),
  });

  const selectService = (id: string) => {
    const svc = (servicesData?.items || []).find((s: any) => s.id === id);
    if (svc) {
      setServiceId(svc.id);
      setDescription(svc.name);
      setUnitPrice(Number(svc.unitPrice) || 0);
    }
  };

  const submit = async () => {
    if (!description) { toast.error("Description required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_item",
          serviceId: serviceId || undefined,
          description,
          quantity,
          unitPrice,
          discount,
          tax,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Item added to invoice");
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
          <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-emerald-600" /> Add Item to {invoice.invoiceNumber}</DialogTitle>
          <DialogDescription>The invoice totals will be recomputed automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Service (optional)</Label>
            <Select value={serviceId || "_none"} onValueChange={(v) => v !== "_none" && selectService(v)}>
              <SelectTrigger><SelectValue placeholder="— Custom —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Custom / Manual —</SelectItem>
                {(servicesData?.items || []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} • {formatCurrency(s.unitPrice)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel required>Description</FieldLabel>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <Label>Quantity</Label>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </div>
            <div>
              <Label>Unit Price</Label>
              <Input type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} />
            </div>
            <div>
              <Label>Discount</Label>
              <Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
            </div>
            <div>
              <Label>Tax</Label>
              <Input type="number" step="0.01" value={tax} onChange={(e) => setTax(Number(e.target.value))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !description} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Adding..." : <><Plus className="w-4 h-4" /> Add Item</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, RotateCcw, Check, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatCurrency } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "processed", label: "Processed" },
  { value: "rejected", label: "Rejected" },
];

export function RefundsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["refunds", activeFacilityId, statusFilter],
    queryFn: () => fetchJson(`/api/refunds${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["refunds"] });

  const doAction = async (id: string, action: string, successMsg: string, extra?: any) => {
    try {
      const res = await fetch(`/api/refunds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const err = await res.json();
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Refunds</h2>
          <p className="text-sm text-slate-500">Refund workflow: pending → approved → processed. Original payments are never modified.</p>
        </div>
        <Button onClick={() => setShowNew(true)} disabled={!can("billing.refund")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> Request Refund
        </Button>
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view refunds.</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
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
        <ErrorState message="Failed to load refunds" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No refunds"
              description="Request a refund against a payment to begin the workflow."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("billing.refund")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> Request Refund</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Payment #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Invoice</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Refund Amount</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Reason</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Processed</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-emerald-50/40">
                      <td className="p-3 font-mono text-xs text-slate-700">{r.payment?.paymentNumber}</td>
                      <td className="p-3 font-mono text-xs text-slate-700">{r.invoice?.invoiceNumber}</td>
                      <td className="p-3 text-right font-mono font-semibold text-rose-700">{formatCurrency(r.amount)}</td>
                      <td className="p-3 text-xs text-slate-700 max-w-xs truncate" title={r.reason}>{r.reason || "—"}</td>
                      <td className="p-3"><StatusBadge status={r.status} /></td>
                      <td className="p-3 text-xs text-slate-600">
                        {r.processedAt ? formatDate(r.processedAt, true) : "—"}
                        {r.processedBy && <div className="text-[10px] text-slate-400">{r.processedBy.firstName} {r.processedBy.lastName}</div>}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {r.status === "pending" && can("billing.refund") && (
                            <>
                              <Button size="sm" onClick={() => doAction(r.id, "approve", "Refund approved")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                                <Check className="w-3 h-3" /> Approve
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => doAction(r.id, "reject", "Refund rejected")} className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700">
                                <X className="w-3 h-3" /> Reject
                              </Button>
                            </>
                          )}
                          {r.status === "approved" && can("billing.refund") && (
                            <Button size="sm" onClick={() => doAction(r.id, "process", "Refund processed")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <RotateCcw className="w-3 h-3" /> Process
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

      <NewRefundDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} facilityId={activeFacilityId} />
    </div>
  );
}

function NewRefundDialog({ open, onClose, onCreated, facilityId }: { open: boolean; onClose: () => void; onCreated: () => void; facilityId: string | null }) {
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch recent payments to choose from
  const { data: paymentsData } = useQuery({
    queryKey: ["payments-refund", facilityId],
    queryFn: () => fetchJson(`/api/payments${facilityId ? `?facilityId=${facilityId}` : ""}&limit=200`),
    enabled: open && !!facilityId,
  });

  const selectedPayment = (paymentsData?.items || []).find((p: any) => p.id === paymentId);

  const selectPayment = (id: string) => {
    const p = (paymentsData?.items || []).find((p: any) => p.id === id);
    if (p) {
      setPaymentId(p.id);
      setAmount(p.amount);
    }
  };

  const submit = async () => {
    if (!paymentId) { toast.error("Please select a payment"); return; }
    if (!amount || amount <= 0) { toast.error("Amount must be > 0"); return; }
    if (!reason) { toast.error("Reason required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId,
          invoiceId: selectedPayment?.invoiceId,
          amount,
          reason,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Refund requested");
      setPaymentId(""); setAmount(0); setReason("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="w-5 h-5 text-emerald-600" /> Request Refund</DialogTitle>
          <DialogDescription>Select a payment to refund. The original payment record will not be modified — the refund creates its own audit trail.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Payment *</Label>
            <Select value={paymentId} onValueChange={selectPayment}>
              <SelectTrigger><SelectValue placeholder="Select payment" /></SelectTrigger>
              <SelectContent>
                {(paymentsData?.items || []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.paymentNumber} • {p.patient?.firstName} {p.patient?.lastName} • {formatCurrency(p.amount)} • {p.paymentMethod}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPayment && (
            <div className="text-xs bg-slate-50 p-2 rounded">
              <div><span className="text-slate-500">Invoice:</span> <span className="font-mono">{selectedPayment.invoice?.invoiceNumber}</span></div>
              <div><span className="text-slate-500">Original Amount:</span> <span className="font-mono">{formatCurrency(selectedPayment.amount)}</span></div>
            </div>
          )}

          <div>
            <Label>Refund Amount *</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>

          <div>
            <Label>Reason *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason for refund (e.g. duplicate payment, service not rendered, overpayment)" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !paymentId || !amount || !reason} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Requesting..." : "Request Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useEffect, useState } from "react";
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
import { ArrowLeftRight, Plus, CheckCircle2, X, Send, Truck } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, safeJson, PageHeader} from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "requested", label: "Requested" },
  { value: "approved", label: "Approved" },
  { value: "shipped", label: "Shipped" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

export function StockTransfersView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [direction, setDirection] = useState("both");
  const [showNew, setShowNew] = useState(false);
  const [viewTr, setViewTr] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (direction) params.set("direction", direction);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["stock-transfers", activeFacilityId, direction, statusFilter],
    queryFn: () => fetchJson(`/api/stock-transfers${qs}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["stock-transfers"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  const items = data?.items || [];

  const doAction = async (id: string, action: string, successMsg: string) => {
    const res = await fetch(`/api/stock-transfers/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) { toast.success(successMsg); invalidate(); }
    else { const e = await safeJson(res).catch(() => ({})); toast.error(e.error || "Failed"); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Transfers"
        description="Transfer stock between facilities and departments"
        icon={ArrowLeftRight}
        gradient="from-purple-500 to-purple-600"
      
        actions={
                  <Button onClick={() => setShowNew(true)} disabled={!can("inventory.transfer")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Transfer
        </Button>
        }
      />

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-2">
          <Select value={direction || undefined} onValueChange={setDirection}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Both (in/out)</SelectItem>
              <SelectItem value="from">Outgoing (from this facility)</SelectItem>
              <SelectItem value="to">Incoming (to this facility)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load stock transfers" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No stock transfers"
              description="Create a stock transfer to move inventory between facilities."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("inventory.transfer")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Transfer</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Transfer #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Route</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Items</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Requested</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t: any) => (
                    <tr key={t.id} className="border-b hover:bg-emerald-50/40">
                      <td className="p-3 font-mono text-xs text-slate-700">{t.transferNumber}</td>
                      <td className="p-3 text-xs">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{t.fromFacility?.code}</span>
                          <ArrowLeftRight className="w-3 h-3 text-slate-400" />
                          <span className="font-medium">{t.toFacility?.code}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">{t.fromFacility?.name} → {t.toFacility?.name}</div>
                      </td>
                      <td className="p-3 text-xs">{t._count?.items ?? (t.items?.length || 0)}</td>
                      <td className="p-3"><StatusBadge status={t.status} /></td>
                      <td className="p-3 text-xs text-slate-600">{formatDate(t.requestedAt)}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {t.status === "requested" && (
                            <Button size="sm" onClick={() => doAction(t.id, "approve", "Transfer approved")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </Button>
                          )}
                          {t.status === "approved" && (
                            <Button size="sm" onClick={() => doAction(t.id, "ship", "Transfer shipped")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <Send className="w-3 h-3" /> Ship
                            </Button>
                          )}
                          {t.status === "shipped" && (
                            <Button size="sm" onClick={() => doAction(t.id, "receive", "Transfer received")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <Truck className="w-3 h-3" /> Receive
                            </Button>
                          )}
                          {["requested", "approved", "shipped"].includes(t.status) && (
                            <Button size="sm" variant="ghost" onClick={() => doAction(t.id, "cancel", "Transfer cancelled")} className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700">
                              <X className="w-3 h-3" />
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

      <NewTransferDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} defaultFromFacilityId={activeFacilityId || undefined} />
    </div>
  );
}

function NewTransferDialog({ open, onClose, onCreated, defaultFromFacilityId }: {
  open: boolean; onClose: () => void; onCreated: () => void; defaultFromFacilityId?: string;
}) {
  const [fromFacilityId, setFromFacilityId] = useState(defaultFromFacilityId || "");
  const [toFacilityId, setToFacilityId] = useState("");
  const [notes, setNotes] = useState("");
  const [facilities, setFacilities] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchJson("/api/facilities").then((d) => setFacilities(d.facilities || [])).catch(() => {}); }, []);

  useEffect(() => {
    if (!fromFacilityId) return;
    fetchJson(`/api/inventory?facilityId=${fromFacilityId}`).then((d) => setInventory(d.items || [])).catch(() => setInventory([]));
  }, [fromFacilityId]);

  const addItem = (inv: any) => {
    if (items.find((i) => i.inventoryItemId === inv.id)) return;
    setItems([...items, {
      inventoryItemId: inv.id,
      name: inv.name,
      sku: inv.sku,
      currentQuantity: inv.currentQuantity,
      batches: inv.batches || [],
      batchId: "",
      quantity: 1,
    }]);
  };
  const updateItem = (idx: number, field: string, value: any) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!fromFacilityId) return toast.error("Select source facility");
    if (!toFacilityId) return toast.error("Select destination facility");
    if (fromFacilityId === toFacilityId) return toast.error("Source and destination must differ");
    if (items.length === 0) return toast.error("Add at least one item");
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromFacilityId, toFacilityId, notes,
          items: items.map((it) => ({ inventoryItemId: it.inventoryItemId, batchId: it.batchId || null, quantity: Number(it.quantity) })),
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Stock transfer requested");
      setItems([]); setNotes(""); setToFacilityId("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" /> New Stock Transfer</DialogTitle>
          <DialogDescription>Move inventory from one facility to another.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">From Facility</Label>
              <Select value={fromFacilityId || undefined} onValueChange={setFromFacilityId}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">To Facility</Label>
              <Select value={toFacilityId || undefined} onValueChange={setToFacilityId}>
                <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                <SelectContent>
                  {facilities.filter((f) => f.id !== fromFacilityId).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {fromFacilityId && (
            <div>
              <Label className="text-xs">Add items (from source facility stock)</Label>
              {inventory.length === 0 ? (
                <div className="text-xs text-slate-500">No inventory items at source facility.</div>
              ) : (
                <div className="border rounded max-h-48 overflow-y-auto">
                  {inventory.slice(0, 20).map((inv) => (
                    <button key={inv.id} onClick={() => addItem(inv)} className="w-full text-left p-2 hover:bg-emerald-50 border-b last:border-b-0">
                      <div className="text-sm font-medium">{inv.name} <span className="text-xs text-slate-500">({inv.sku})</span></div>
                      <div className="text-[10px] text-slate-500">In stock: {inv.currentQuantity}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((it, idx) => (
                <Card key={idx}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{it.name}</div>
                        <div className="text-xs text-slate-500">{it.sku} · Available: {it.currentQuantity}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="text-rose-600 h-7"><X className="w-3 h-3" /></Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">Batch (optional)</Label>
                        <Select value={it.batchId || undefined} onValueChange={(v) => updateItem(idx, "batchId", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any" /></SelectTrigger>
                          <SelectContent>
                            {(it.batches || []).map((b: any) => (
                              <SelectItem key={b.id} value={b.id}>{b.batchNumber} · {b.quantity} units{b.expiryDate ? ` · exp ${formatDate(b.expiryDate)}` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px]">Quantity</Label>
                        <Input type="number" min={1} max={it.currentQuantity} value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="h-8 text-xs" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Creating..." : "Request Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

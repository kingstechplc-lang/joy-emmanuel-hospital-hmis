"use client";
import { useEffect, useRef, useState } from "react";
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
import { Plus, ShoppingCart, PackageCheck, Send, CheckCircle2, X, Truck, Eye } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatCurrency, safeJson, PageHeader} from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "ordered", label: "Ordered" },
  { value: "partially_received", label: "Partially Received" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

export function PurchaseOrdersView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [viewPo, setViewPo] = useState<any | null>(null);
  const [receivePo, setReceivePo] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["purchase-orders", activeFacilityId, statusFilter],
    queryFn: () => fetchJson(`/api/purchase-orders${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  const items = data?.items || [];

  const doAction = async (id: string, action: string, successMsg: string) => {
    const res = await fetch(`/api/purchase-orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) { toast.success(successMsg); invalidate(); }
    else { const e = await safeJson(res).catch(() => ({})); toast.error(e.error || "Failed"); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchase Orders"
        description="Create and track purchase orders"
        icon={ShoppingCart}
        gradient="from-amber-500 to-orange-600"
      
        actions={
                  <Button onClick={() => setShowNew(true)} disabled={!can("procurement.manage")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New PO
        </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view purchase orders.</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3">
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load purchase orders" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No purchase orders"
              description="Create a new PO to begin procurement."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("procurement.manage")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New PO</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">PO #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Supplier</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Items</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Total</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Created</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p: any) => (
                    <tr key={p.id} className="border-b hover:bg-emerald-50/40">
                      <td className="p-3 font-mono text-xs text-slate-700">{p.purchaseOrderNumber}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{p.supplier?.name}</div>
                        <div className="text-xs text-slate-500">{p.supplier?.code}</div>
                      </td>
                      <td className="p-3 text-xs text-slate-600">{p._count?.items ?? (p.items?.length || 0)}</td>
                      <td className="p-3 text-right font-semibold">{formatCurrency(p.total)}</td>
                      <td className="p-3"><StatusBadge status={p.status} /></td>
                      <td className="p-3 text-xs text-slate-600">{formatDate(p.createdAt)}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setViewPo(p)} className="gap-1 h-7 text-xs">
                            <Eye className="w-3 h-3" /> View
                          </Button>
                          {p.status === "draft" && (
                            <Button size="sm" variant="outline" onClick={() => doAction(p.id, "submit", "PO submitted")} className="gap-1 h-7 text-xs">
                              <Send className="w-3 h-3" /> Submit
                            </Button>
                          )}
                          {p.status === "submitted" && (
                            <Button size="sm" onClick={() => doAction(p.id, "approve", "PO approved")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </Button>
                          )}
                          {p.status === "approved" && (
                            <Button size="sm" onClick={() => doAction(p.id, "order", "PO ordered")} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <Truck className="w-3 h-3" /> Order
                            </Button>
                          )}
                          {["ordered", "partially_received"].includes(p.status) && (
                            <Button size="sm" onClick={() => setReceivePo(p)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <PackageCheck className="w-3 h-3" /> Receive
                            </Button>
                          )}
                          {["draft", "submitted", "approved", "ordered"].includes(p.status) && (
                            <Button size="sm" variant="ghost" onClick={() => doAction(p.id, "cancel", "PO cancelled")} className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700">
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

      <NewPODialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} defaultFacilityId={activeFacilityId || undefined} />
      {viewPo && <ViewPODialog po={viewPo} onClose={() => setViewPo(null)} />}
      {receivePo && <ReceiveDialog po={receivePo} onClose={() => setReceivePo(null)} onDone={() => { setReceivePo(null); invalidate(); }} />}
    </div>
  );
}

function NewPODialog({ open, onClose, onCreated, defaultFacilityId }: {
  open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId?: string;
}) {
  const [facilityId, setFacilityId] = useState(defaultFacilityId || "");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [facilities, setFacilities] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [invQuery, setInvQuery] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const itemsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newly added item
  useEffect(() => {
    if (items.length > 0 && itemsEndRef.current) {
      itemsEndRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [items.length]);

  useEffect(() => { fetchJson("/api/facilities").then((d) => setFacilities(d.facilities || [])).catch(() => {}); }, []);
  useEffect(() => { fetchJson("/api/suppliers").then((d) => setSuppliers(d.items || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (!facilityId) return;
    const q = new URLSearchParams();
    q.set("facilityId", facilityId);
    if (invQuery) q.set("q", invQuery);
    fetchJson(`/api/inventory?${q.toString()}`).then((d) => setInventory(d.items || [])).catch(() => setInventory([]));
  }, [facilityId, invQuery]);

  const addItem = (inv: any) => {
    if (items.find((i) => i.inventoryItemId === inv.id)) return;
    setItems([...items, { inventoryItemId: inv.id, name: inv.name, sku: inv.sku, unit: inv.unit, quantity: 1, unitPrice: 0 }]);
  };
  const updateItem = (idx: number, field: string, value: any) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);

  const handleSubmit = async () => {
    if (!facilityId) return toast.error("Select a facility");
    if (!supplierId) return toast.error("Select a supplier");
    if (items.length === 0) return toast.error("Add at least one item");
    setSubmitting(true);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId, supplierId, notes,
          status: "draft",
          items: items.map((it) => ({ inventoryItemId: it.inventoryItemId, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice) })),
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Purchase order created");
      setItems([]); setNotes(""); setSupplierId("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> New Purchase Order</DialogTitle>
          <DialogDescription>Select facility, supplier, and items to procure.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Facility</Label>
              <Select value={facilityId || undefined} onValueChange={setFacilityId}>
                <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select value={supplierId || undefined} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Add inventory item</Label>
            <Input value={invQuery} onChange={(e) => setInvQuery(e.target.value)} placeholder="Search inventory items by name or SKU" disabled={!facilityId} />
            {inventory.length > 0 && (
              <div className="mt-1 border rounded max-h-40 overflow-y-auto">
                {inventory.slice(0, 10).map((inv) => (
                  <button key={inv.id} onClick={() => addItem(inv)} className="w-full text-left p-2 hover:bg-emerald-50 border-b last:border-b-0">
                    <div className="text-sm">{inv.name} <span className="text-xs text-slate-500">({inv.sku})</span></div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <>
            <div className="border rounded">
              <table className="w-full text-xs">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-2">Item</th>
                    <th className="text-right p-2 w-24">Qty</th>
                    <th className="text-right p-2 w-32">Unit Price</th>
                    <th className="text-right p-2 w-32">Total</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2">
                        <div className="font-medium">{it.name}</div>
                        <div className="text-[10px] text-slate-500">{it.sku}</div>
                      </td>
                      <td className="p-2"><Input type="number" min={1} value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="h-7 text-xs text-right" /></td>
                      <td className="p-2"><Input type="number" min={0} value={it.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} className="h-7 text-xs text-right" /></td>
                      <td className="p-2 text-right font-mono">{formatCurrency(Number(it.quantity) * Number(it.unitPrice))}</td>
                      <td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="text-rose-600 h-7"><X className="w-3 h-3" /></Button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={3} className="p-2 text-right font-semibold">Subtotal</td>
                    <td className="p-2 text-right font-mono font-semibold">{formatCurrency(subtotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div ref={itemsEndRef} />
            </>
          )}

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Creating..." : "Create PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewPODialog({ po, onClose }: { po: any; onClose: () => void }) {
  const [data, setData] = useState<any>(po);
  useEffect(() => {
    fetchJson(`/api/purchase-orders/${po.id}`).then((d) => setData(d.item)).catch(() => {});
  }, [po.id]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> {data?.purchaseOrderNumber}</DialogTitle>
          <DialogDescription>{data?.supplier?.name} · {data?.facility?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Status</div>
              <StatusBadge status={data?.status} />
            </div>
            <div>
              <div className="text-xs text-slate-500">Total</div>
              <div className="font-semibold">{formatCurrency(data?.total)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Ordered at</div>
              <div className="text-xs">{data?.orderedAt ? formatDate(data.orderedAt) : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Created</div>
              <div className="text-xs">{formatDate(data?.createdAt)}</div>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="text-left p-2 font-semibold text-slate-700">Item</th>
                <th className="text-right p-2 font-semibold text-slate-700">Qty</th>
                <th className="text-right p-2 font-semibold text-slate-700">Unit Price</th>
                <th className="text-right p-2 font-semibold text-slate-700">Total</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((it: any) => (
                <tr key={it.id} className="border-b">
                  <td className="p-2">
                    <div className="font-medium">{it.inventoryItem?.name}</div>
                    <div className="text-xs text-slate-500">{it.inventoryItem?.sku}</div>
                  </td>
                  <td className="p-2 text-right">{it.quantity}</td>
                  <td className="p-2 text-right">{formatCurrency(it.unitPrice)}</td>
                  <td className="p-2 text-right font-mono">{formatCurrency(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ po, onClose, onDone }: { po: any; onClose: () => void; onDone: () => void }) {
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [recvMap, setRecvMap] = useState<Record<string, { receivedQuantity: string; batchNumber: string; expiryDate: string; costPrice: string; sellingPrice: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<any>(po);

  useEffect(() => {
    fetchJson(`/api/purchase-orders/${po.id}`).then((d) => setData(d.item)).catch(() => {});
  }, [po.id]);

  const setItem = (itemId: string, field: string, value: string) => {
    setRecvMap((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), receivedQuantity: "", batchNumber: "", expiryDate: "", costPrice: "", sellingPrice: "", [field]: value },
    }));
  };

  const handleSubmit = async () => {
    const items = (data?.items || []).map((it: any) => {
      const cfg = recvMap[it.id];
      const receivedQty = Number(cfg?.receivedQuantity || 0);
      if (receivedQty <= 0) return null;
      return {
        purchaseOrderItemId: it.id,
        receivedQuantity: receivedQty,
        batchNumber: cfg?.batchNumber || `BATCH-${Date.now()}`,
        expiryDate: cfg?.expiryDate || null,
        costPrice: cfg?.costPrice ? Number(cfg.costPrice) : it.unitPrice,
        sellingPrice: cfg?.sellingPrice ? Number(cfg.sellingPrice) : Number(it.unitPrice) * 1.2,
      };
    }).filter(Boolean);

    if (items.length === 0) return toast.error("Enter at least one received quantity");

    setSubmitting(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceNumber, notes, items }),
      });
      const rdata = await safeJson(res);
      if (!res.ok) throw new Error(rdata.error || "Failed");
      toast.success(`Goods received — ${items.length} item(s) stocked`);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackageCheck className="w-4 h-4" /> Receive Goods: {data?.purchaseOrderNumber}</DialogTitle>
          <DialogDescription>{data?.supplier?.name} · {data?.facility?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">GRN / Reference Number</Label>
              <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Optional waybill #" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            {(data?.items || []).map((it: any) => {
              const cfg = recvMap[it.id] || {};
              return (
                <Card key={it.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{it.inventoryItem?.name}</div>
                        <div className="text-xs text-slate-500">Ordered: {it.quantity} · Unit Price {formatCurrency(it.unitPrice)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <div>
                        <Label className="text-[10px]">Received Qty</Label>
                        <Input type="number" min={0} max={it.quantity} value={cfg.receivedQuantity || ""} onChange={(e) => setItem(it.id, "receivedQuantity", e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Batch #</Label>
                        <Input value={cfg.batchNumber || ""} onChange={(e) => setItem(it.id, "batchNumber", e.target.value)} className="h-8 text-xs" placeholder="BATCH-001" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Expiry</Label>
                        <Input type="date" value={cfg.expiryDate || ""} onChange={(e) => setItem(it.id, "expiryDate", e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Cost Price</Label>
                        <Input type="number" step="0.01" value={cfg.costPrice ?? String(it.unitPrice)} onChange={(e) => setItem(it.id, "costPrice", e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Sell Price</Label>
                        <Input type="number" step="0.01" value={cfg.sellingPrice || ""} onChange={(e) => setItem(it.id, "sellingPrice", e.target.value)} className="h-8 text-xs" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Receiving..." : "Receive Goods"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Package, Search, Plus, History, AlertTriangle, Boxes, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate } from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "medication", label: "Medications" },
  { value: "consumable", label: "Consumables" },
  { value: "equipment", label: "Equipment" },
  { value: "supply", label: "Supplies" },
  { value: "other", label: "Other" },
];

// Type-specific categories — each item type has its own category list
const CATEGORIES_BY_TYPE: Record<string, string[]> = {
  medication: [
    "Antibiotics", "Antipyretics", "Analgesics", "Antihypertensives",
    "Antidiabetics", "Antimalarials", "Antihistamines", "Antacids",
    "Vitamins & Supplements", "IV Fluids", "Vaccines", "Dressings",
    "Respiratory", "Cardiovascular", "Gastrointestinal", "Dermatological",
    "Ophthalmic", "Otic", "Other Medications",
  ],
  consumable: [
    "Gloves", "Syringes & Needles", "Cotton & Gauze", "Bandages & Dressings",
    "IV Sets & Cannulas", "Catheters", "Sutures", "Swabs",
    "Tape & Adhesives", "Diagnostic Consumables", "Lab Consumables",
    "Cleaning & Disinfection", "Waste Management", "Other Consumables",
  ],
  equipment: [
    "Diagnostic Equipment", "Monitoring Equipment", "Surgical Equipment",
    "Anesthesia Equipment", "Resuscitation Equipment", "Patient Furniture",
    "Lab Equipment", "Imaging Equipment", "Office Equipment",
    "IT Equipment", "Other Equipment",
  ],
  supply: [
    "Office Supplies", "Stationery", "Printing", "Kitchen Supplies",
    "Housekeeping", "Maintenance", "Safety & PPE", "Fuel & Lubricants",
    "Other Supplies",
  ],
  other: ["General", "Miscellaneous"],
};

// Type-specific unit suggestions
const UNITS_BY_TYPE: Record<string, string[]> = {
  medication: ["tablets", "capsules", "bottles", "vials", "ampoules", "tubes", "sachets", "boxes", "puffs", "ml", "mg"],
  consumable: ["boxes", "packs", "pieces", "rolls", "sets", "pairs", "units"],
  equipment: ["units", "sets", "pieces"],
  supply: ["boxes", "packs", "reams", "litres", "gallons", "pieces"],
  other: ["units", "pieces", "boxes"],
};

// Type-specific placeholder hints
const HINTS_BY_TYPE: Record<string, { name: string; sku: string; reorder: string }> = {
  medication: { name: "e.g., Paracetamol 500mg", sku: "e.g., MED-PARA-500", reorder: "e.g., 50 (minimum stock before reorder)" },
  consumable: { name: "e.g., Examination Gloves (box of 100)", sku: "e.g., CONS-GLOVE-M", reorder: "e.g., 20 boxes" },
  equipment: { name: "e.g., Digital Blood Pressure Monitor", sku: "e.g., EQ-BPM-001", reorder: "e.g., 2 (spares needed)" },
  supply: { name: "e.g., A4 Paper Ream", sku: "e.g., SUP-PAPER-A4", reorder: "e.g., 10 reams" },
  other: { name: "e.g., Item Name", sku: "e.g., OTH-ITEM-001", reorder: "e.g., 5" },
};

const TXN_TYPES = [
  { value: "receive", label: "Receive (+)" },
  { value: "issue", label: "Issue (−)" },
  { value: "return", label: "Return (+)" },
  { value: "adjustment", label: "Adjustment (+/−)" },
  { value: "damage", label: "Damage (−)" },
  { value: "expiry", label: "Expiry (−)" },
];

export function InventoryView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [viewItem, setViewItem] = useState<any | null>(null);
  const [adjustItem, setAdjustItem] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (typeFilter !== "all") params.set("type", typeFilter);
  if (lowStockOnly) params.set("lowStockOnly", "true");
  if (search) params.set("q", search);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory", activeFacilityId, typeFilter, lowStockOnly, search],
    queryFn: () => fetchJson(`/api/inventory${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Inventory</h2>
          <p className="text-sm text-slate-500">Track stock levels, transactions, and inventory adjustments</p>
        </div>
        <Button onClick={() => setShowNew(true)} disabled={!can("inventory.adjust")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Item
        </Button>
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view inventory levels.</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search by name, SKU, description" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={typeFilter || undefined} onValueChange={setTypeFilter}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 px-2 py-1.5 border rounded">
            <Checkbox id="lowstock" checked={lowStockOnly} onCheckedChange={(v) => setLowStockOnly(!!v)} />
            <Label htmlFor="lowstock" className="text-xs cursor-pointer flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500" /> Low/out of stock only
            </Label>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load inventory" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No inventory items"
              description="Add an inventory item to begin tracking stock levels."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("inventory.adjust")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Item</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Item</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Category</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Current</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Min / Max</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => (
                    <tr key={it.id} className={`border-b hover:bg-emerald-50/40 ${it.stockStatus === "out_of_stock" ? "bg-rose-50/40" : it.stockStatus === "low_stock" ? "bg-amber-50/40" : ""}`}>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{it.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{it.sku}</div>
                      </td>
                      <td className="p-3"><span className="text-xs capitalize">{it.itemType}</span></td>
                      <td className="p-3 text-xs text-slate-600">{it.category || "—"}</td>
                      <td className="p-3 text-right">
                        <span className={`font-semibold ${it.stockStatus === "out_of_stock" ? "text-rose-700" : it.stockStatus === "low_stock" ? "text-amber-700" : "text-slate-900"}`}>
                          {it.currentQuantity}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">{it.unit || ""}</span>
                      </td>
                      <td className="p-3 text-right text-xs text-slate-500">{it.minimumQuantity} / {it.maximumQuantity}</td>
                      <td className="p-3">
                        {it.stockStatus === "out_of_stock" ? (
                          <Badge variant="destructive" className="text-[10px]">Out of stock</Badge>
                        ) : it.stockStatus === "low_stock" ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Low stock</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">In stock</Badge>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setViewItem(it)} className="gap-1 h-7 text-xs">
                            <History className="w-3 h-3" /> History
                          </Button>
                          {can("inventory.adjust") && (
                            <Button size="sm" onClick={() => setAdjustItem(it)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <Boxes className="w-3 h-3" /> Adjust
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

      <NewItemDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); invalidate(); }} />
      {viewItem && <HistoryDialog item={viewItem} facilityId={activeFacilityId || undefined} onClose={() => setViewItem(null)} />}
      {adjustItem && <AdjustDialog item={adjustItem} onClose={() => setAdjustItem(null)} onDone={() => { setAdjustItem(null); invalidate(); }} />}
    </div>
  );
}

function NewItemDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [itemType, setItemType] = useState("medication");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Get type-specific options
  const categories = CATEGORIES_BY_TYPE[itemType] || [];
  const units = UNITS_BY_TYPE[itemType] || [];
  const hints = HINTS_BY_TYPE[itemType] || HINTS_BY_TYPE.other;

  const handleTypeChange = (newType: string) => {
    setItemType(newType);
    setCategory(""); // Reset category when type changes
    setUnit(""); // Reset unit when type changes
  };

  const handleSubmit = async () => {
    if (!name || !sku) return toast.error("Name and SKU required");
    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sku, itemType, category, unit, reorderLevel: Number(reorderLevel), description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Inventory item created");
      setName(""); setSku(""); setCategory(""); setUnit(""); setReorderLevel("0"); setDescription("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Inventory Item</DialogTitle>
          <DialogDescription>Create a new inventory catalog item (org-level). Stock levels are tracked per facility.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel required className="text-xs">Name</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={hints.name} />
            </div>
            <div>
              <FieldLabel required className="text-xs">SKU</FieldLabel>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder={hints.sku} />
            </div>
          </div>

          {/* Type selector */}
          <div>
            <FieldLabel required className="text-xs">Item Type</FieldLabel>
            <Select value={itemType} onValueChange={handleTypeChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.filter((t) => t.value !== "all").map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category — type-specific dropdown */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel required className="text-xs">Category</FieldLabel>
              <Select value={category || undefined} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder={`Select ${itemType} category...`} /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel required className="text-xs">Unit of Measure</FieldLabel>
              <Select value={unit || undefined} onValueChange={setUnit}>
                <SelectTrigger><SelectValue placeholder="Select unit..." /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel required className="text-xs">Reorder Level</FieldLabel>
              <Input type="number" min="0" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} placeholder={hints.reorder} />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the item" />
            </div>
          </div>

          {/* Type-specific info banner */}
          {itemType === "medication" && (
            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
              💡 Medication items can be linked to the medication catalog for prescriptions. Use the generic name + strength as the item name.
            </div>
          )}
          {itemType === "equipment" && (
            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
              💡 Equipment items can be tracked with maintenance schedules, warranty info, and asset numbers in the Equipment module.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ item, facilityId, onClose }: { item: any; facilityId?: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["inventory-transactions", item.id, facilityId],
    queryFn: () => fetchJson(`/api/inventory/${item.id}/transactions${facilityId ? `?facilityId=${facilityId}` : ""}`),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4" /> Transaction History
          </DialogTitle>
          <DialogDescription>{item.name} ({item.sku}) · Current stock: {item.currentQuantity} {item.unit || ""}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState rows={4} />
        ) : isError ? (
          <ErrorState message="Failed to load history" />
        ) : (data?.items || []).length === 0 ? (
          <EmptyState title="No transactions" description="No stock movements recorded for this item." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                <th className="text-right p-2 font-semibold text-slate-700">Qty</th>
                <th className="text-left p-2 font-semibold text-slate-700">Batch</th>
                <th className="text-left p-2 font-semibold text-slate-700">By</th>
                <th className="text-left p-2 font-semibold text-slate-700">Date</th>
                <th className="text-left p-2 font-semibold text-slate-700">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t: any) => (
                <tr key={t.id} className="border-b hover:bg-slate-50">
                  <td className="p-2"><span className="text-xs capitalize">{t.transactionType.replace(/_/g, " ")}</span></td>
                  <td className={`p-2 text-right font-mono font-semibold ${t.quantity < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {t.quantity > 0 ? "+" : ""}{t.quantity}
                  </td>
                  <td className="p-2 text-xs">{t.batch?.batchNumber || "—"}</td>
                  <td className="p-2 text-xs">{t.performedBy ? `${t.performedBy.firstName} ${t.performedBy.lastName}` : "—"}</td>
                  <td className="p-2 text-xs">{formatDate(t.transactionAt, true)}</td>
                  <td className="p-2 text-xs text-slate-500">{t.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [transactionType, setTransactionType] = useState("receive");
  const [quantity, setQuantity] = useState("");
  const [batchId, setBatchId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [minimumQuantity, setMinimumQuantity] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!activeFacilityId) return toast.error("No facility selected");
    if (!quantity) return toast.error("Quantity required");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/${item.id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId: activeFacilityId,
          transactionType,
          quantity: Number(quantity),
          batchId: batchId || null,
          reason,
          notes,
          minimumQuantity: minimumQuantity ? Number(minimumQuantity) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Stock adjusted");
      setQuantity(""); setReason(""); setNotes(""); setBatchId("");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="w-4 h-4" /> Adjust Stock: {item.name}
          </DialogTitle>
          <DialogDescription>Current: {item.currentQuantity} {item.unit || ""} · Min: {item.minimumQuantity} · Max: {item.maximumQuantity}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Transaction Type</Label>
            <Select value={transactionType || undefined} onValueChange={setTransactionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TXN_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Quantity</Label>
            <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Enter quantity" />
          </div>
          {(item.batches || []).length > 0 && (
            <div>
              <Label className="text-xs">Batch (optional)</Label>
              <Select value={batchId || undefined} onValueChange={setBatchId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {(item.batches || []).map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batchNumber} · {b.quantity} in stock{b.expiryDate ? ` · exp ${formatDate(b.expiryDate)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Stock count adjustment" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Min Stock Level (optional)</Label>
            <Input type="number" value={minimumQuantity} onChange={(e) => setMinimumQuantity(e.target.value)} placeholder={String(item.minimumQuantity)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Saving..." : "Save Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Boxes,
  Package,
  Plus,
  History,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Download,
  Eye,
  ArrowUpDown,
  ArrowDownCircle,
  ArrowUpCircle,
  Layers,
  FileText,
  CalendarClock,
  ShieldAlert,
  ClipboardCheck,
  Snowflake,
  Skull,
  Flame,
  Sparkles,
  Building2,
  Tag,
  DollarSign,
  PackageCheck,
  PackageX,
  Truck,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState,
  LoadingState,
  ErrorState,
  MiniStatCard,
  formatDate,
  formatRelative,
  safeJson,
  PageHeader,
  ClearableSearch,
  usePagination,
  Pagination,
  ModuleHelp,
} from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";

// =====================================================================
// HELPERS
// =====================================================================
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

// Format money as "GHS X,XXX.XX"
function formatMoney(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return `GHS ${Number(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// =====================================================================
// CONSTANTS
// =====================================================================
const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "medication", label: "Medications" },
  { value: "consumable", label: "Consumables" },
  { value: "equipment", label: "Equipment" },
  { value: "supply", label: "Supplies" },
  { value: "other", label: "Other" },
];

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

const UNITS_BY_TYPE: Record<string, string[]> = {
  medication: ["tablets", "capsules", "bottles", "vials", "ampoules", "tubes", "sachets", "boxes", "puffs", "ml", "mg"],
  consumable: ["boxes", "packs", "pieces", "rolls", "sets", "pairs", "units"],
  equipment: ["units", "sets", "pieces"],
  supply: ["boxes", "packs", "reams", "litres", "gallons", "pieces"],
  other: ["units", "pieces", "boxes"],
};

const HINTS_BY_TYPE: Record<string, { name: string; sku: string }> = {
  medication: { name: "e.g., Paracetamol 500mg", sku: "e.g., MED-PARA-500" },
  consumable: { name: "e.g., Examination Gloves (box of 100)", sku: "e.g., CONS-GLOVE-M" },
  equipment: { name: "e.g., Digital Blood Pressure Monitor", sku: "e.g., EQ-BPM-001" },
  supply: { name: "e.g., A4 Paper Ream", sku: "e.g., SUP-PAPER-A4" },
  other: { name: "e.g., Item Name", sku: "e.g., OTH-ITEM-001" },
};

const TXN_TYPES = [
  { value: "receive", label: "Receive (+)" },
  { value: "issue", label: "Issue (−)" },
  { value: "return", label: "Return (+)" },
  { value: "damage", label: "Damage (−)" },
  { value: "expiry", label: "Expiry (−)" },
];

const ADJUSTMENT_TYPES = [
  { value: "counting_error", label: "Counting Error" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "found", label: "Found" },
  { value: "data_correction", label: "Data Correction" },
  { value: "expired", label: "Expired" },
  { value: "conversion", label: "Conversion" },
  { value: "other", label: "Other" },
];

const BATCH_EXPIRY_FILTERS = [
  { value: "all", label: "All batches" },
  { value: "active", label: "Active" },
  { value: "expiring_soon", label: "Expiring soon (≤30d)" },
  { value: "expired", label: "Expired" },
];

// =====================================================================
// HELPERS — stock status badge
// =====================================================================
function StockStatusBadge({ status }: { status: string }) {
  if (status === "out_of_stock") {
    return <Badge variant="destructive" className="text-[10px]">Out of stock</Badge>;
  }
  if (status === "low_stock") {
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Low stock</Badge>;
  }
  return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">In stock</Badge>;
}

function BatchStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700 border-emerald-200",
    expired: "bg-rose-100 text-rose-700 border-rose-200",
    damaged: "bg-amber-100 text-amber-700 border-amber-200",
    depleted: "bg-slate-100 text-slate-600 border-slate-200",
    quarantined: "bg-violet-100 text-violet-700 border-violet-200",
    recalled: "bg-rose-100 text-rose-700 border-rose-200",
  };
  const cls = map[status] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// =====================================================================
// MAIN VIEW
// =====================================================================
export function InventoryView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canView = can("inventory.view");
  const canAdjust = can("inventory.adjust");
  const canTransfer = can("inventory.transfer");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const [tab, setTab] = useState("dashboard");

  // Dialog state (lifted to root so any tab can open it)
  const [showNew, setShowNew] = useState(false);
  const [viewItemId, setViewItemId] = useState<string | null>(null);
  const [movementItem, setMovementItem] = useState<{ item: any; mode: "adjust" | "receive" | "issue" } | null>(null);
  const [historyItem, setHistoryItem] = useState<any | null>(null);

  const helpSections = [
    {
      title: "Item Master",
      content: `Items are the catalog-level definition of anything you stock — medications, consumables, equipment, supplies, or general items. Each item has a unique SKU within the organization and is shared across facilities.\n\nUse the New Item dialog to capture the full master record: barcode, subcategory, pack size, manufacturer, brand, country of origin, storage conditions, and item flags (controlled, consumable, refrigerated, hazardous, sterile). Stock levels are tracked per facility in the Items tab.`,
    },
    {
      title: "Stock Control",
      content: `Every item carries four stock-control thresholds:\n\n• Minimum stock — the floor; going at or below flags the item as "low stock".\n• Maximum stock — the ceiling for ordering.\n• Reorder quantity — the standard amount to reorder when low.\n• Safety stock — the emergency buffer below minimum.\n\nThe Items tab color-codes current quantity against these thresholds: green = in stock, amber = low, red = out of stock.`,
    },
    {
      title: "Batches & Expiry",
      content: `Stock arrives in batches. Each batch has a number, optional manufacture/expiry date, cost price, supplier, and status (active, expired, damaged, depleted, quarantined, recalled).\n\nThe Batches tab lists every batch across items and lets you filter by expiry status. Batches expiring within 30 days are flagged "expiring soon"; batches past their expiry date are flagged "expired". Use the Adjust action to write off expired stock.`,
    },
    {
      title: "Stock Movements",
      content: `Every change in stock is recorded as an InventoryTransaction — receive, issue, return, damage, expiry, transfer_in, transfer_out, dispense, or adjustment. Each transaction is signed (+/-), captures the balance before and after, optional unit cost / total value, who performed it, and an optional reason.\n\nOpen an item's detail dialog and scroll to "Movement History" to see the last 20 transactions.`,
    },
    {
      title: "Adjustments",
      content: `An adjustment is a controlled change to current stock — for example, after a stock count, when items are damaged/lost/found, when data needs correcting, or when stock expires.\n\nUse the Adjust action to open the Stock Adjustment dialog. You'll pick an adjustment type (counting_error, damaged, lost, found, data_correction, expired, conversion, other), enter the new quantity, and provide a reason. The system records the before/after quantities and creates both a StockAdjustment record and a signed InventoryTransaction.`,
    },
    {
      title: "Reports",
      content: `The Reports tab provides five on-demand analyses:\n\n• Stock Valuation — current quantity × last cost price per item, plus grand total.\n• Low Stock — items at or below minimum stock.\n• Expiry — batches by expiry status.\n• Movement Summary — recent transactions across all items.\n• Dead Stock — items with zero movement in the last 90 days (based on last transaction date).\n\nUse the CSV Export button on the Items tab to download the current item list as a spreadsheet.`,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory"
        description="Manage medical supplies, stock levels, batches, and adjustments"
        icon={Boxes}
        gradient="from-teal-500 to-teal-600"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ModuleHelp title="Inventory" sections={helpSections} />
            <Button
              onClick={() => setShowNew(true)}
              disabled={!canAdjust}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" /> New Item
            </Button>
          </div>
        }
      />

      {!activeFacilityId && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-700 bg-amber-50 rounded-lg">
            Select a facility to view inventory levels and stock movements.
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <Boxes className="w-3.5 h-3.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="items" className="gap-1.5">
            <Package className="w-3.5 h-3.5" />
            Items
          </TabsTrigger>
          <TabsTrigger value="batches" className="gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            Batches
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab
            facilityId={activeFacilityId}
            canView={canView}
            onOpenItem={(id) => setViewItemId(id)}
          />
        </TabsContent>
        <TabsContent value="items">
          <ItemsTab
            facilityId={activeFacilityId}
            canAdjust={canAdjust}
            onView={(it) => setViewItemId(it.id)}
            onAdjust={(it) => setMovementItem({ item: it, mode: "adjust" })}
            onHistory={(it) => setHistoryItem(it)}
            onNew={() => setShowNew(true)}
          />
        </TabsContent>
        <TabsContent value="batches">
          <BatchesTab facilityId={activeFacilityId} />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab facilityId={activeFacilityId} />
        </TabsContent>
      </Tabs>

      {/* Dialogs (rendered once at the root) */}
      <NewItemDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => setShowNew(false)}
      />
      {viewItemId && (
        <ItemDetailDialog
          itemId={viewItemId}
          facilityId={activeFacilityId || undefined}
          canAdjust={canAdjust}
          onClose={() => setViewItemId(null)}
          onAdjust={(it) => {
            setViewItemId(null);
            setMovementItem({ item: it, mode: "adjust" });
          }}
          onReceive={(it) => {
            setViewItemId(null);
            setMovementItem({ item: it, mode: "receive" });
          }}
          onIssue={(it) => {
            setViewItemId(null);
            setMovementItem({ item: it, mode: "issue" });
          }}
        />
      )}
      {movementItem && (
        <StockMovementDialog
          item={movementItem.item}
          mode={movementItem.mode}
          onClose={() => setMovementItem(null)}
          onDone={() => setMovementItem(null)}
        />
      )}
      {historyItem && (
        <HistoryDialog
          item={historyItem}
          facilityId={activeFacilityId || undefined}
          onClose={() => setHistoryItem(null)}
        />
      )}
    </div>
  );
}

// =====================================================================
// TAB 1 — DASHBOARD
// =====================================================================
function DashboardTab({
  facilityId,
  canView,
  onOpenItem,
}: {
  facilityId: string | null;
  canView: boolean;
  onOpenItem: (id: string) => void;
}) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["inventory-stats", facilityId],
    queryFn: () => fetchJson(`/api/inventory/stats?facilityId=${facilityId || ""}`),
    enabled: !!facilityId && canView,
    refetchInterval: 60000,
  });

  if (!facilityId) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-amber-700 bg-amber-50 rounded-lg">
          Select a facility to view the inventory dashboard.
        </CardContent>
      </Card>
    );
  }
  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load inventory stats" onRetry={() => refetch()} />;

  const k = data?.kpis || {};
  const breakdowns = data?.breakdowns || { byItemType: [], byCategory: [] };
  const topItems: any[] = data?.topItemsByValue || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Inventory Overview</h3>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin text-teal-600" : ""}`} />
            {isFetching ? "Refreshing…" : "Auto-refreshes every 60 seconds"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh Now
        </Button>
      </div>

      {/* 12 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <MiniStatCard label="Total Items" value={k.totalItems ?? 0} icon={Boxes} gradient="from-slate-600 to-slate-700" />
        <MiniStatCard label="Active" value={k.activeItems ?? 0} icon={PackageCheck} gradient="from-emerald-500 to-emerald-600" sublabel={`${k.inactiveItems ?? 0} inactive`} />
        <MiniStatCard label="Total Stock Qty" value={k.totalStockQuantity ?? 0} icon={Layers} gradient="from-teal-500 to-teal-600" sublabel="across all facilities" />
        <MiniStatCard label="Stock Value" value={formatMoney(k.totalStockValue)} icon={DollarSign} gradient="from-amber-500 to-orange-500" />
        <MiniStatCard label="Low Stock" value={k.lowStockCount ?? 0} icon={TrendingDown} gradient="from-amber-500 to-orange-500" sublabel="at/below minimum" />
        <MiniStatCard label="Out of Stock" value={k.outOfStockCount ?? 0} icon={PackageX} gradient="from-rose-500 to-red-600" />
        <MiniStatCard label="Expiring Soon" value={k.expiringSoonCount ?? 0} icon={CalendarClock} gradient="from-amber-400 to-yellow-500" sublabel="≤ 30 days" />
        <MiniStatCard label="Expired" value={k.expiredCount ?? 0} icon={Skull} gradient="from-rose-500 to-rose-700" sublabel="active batches" />
        <MiniStatCard label="Pending POs" value={k.pendingPurchaseOrders ?? 0} icon={FileText} gradient="from-blue-500 to-cyan-500" sublabel="purchase orders" />
        <MiniStatCard label="Pending Transfers" value={k.pendingStockTransfers ?? 0} icon={Truck} gradient="from-violet-500 to-purple-500" />
        <MiniStatCard label="Quarantined" value={k.quarantinedStockCount ?? 0} icon={ShieldAlert} gradient="from-violet-500 to-fuchsia-500" sublabel={`${k.quarantinedQuantity ?? 0} units`} />
        <MiniStatCard label="Pending Adjustments" value={k.pendingAdjustments ?? 0} icon={ClipboardCheck} gradient="from-slate-500 to-slate-600" />
      </div>

      {/* By-type breakdown + Top 10 items by value */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Boxes className="w-4 h-4 text-teal-600" /> Breakdown by Item Type
            </CardTitle>
            <CardDescription className="text-xs">
              Catalog item count by type
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(breakdowns.byItemType || []).length === 0 ? (
              <EmptyState title="No items" description="No catalog items found." />
            ) : (
              (breakdowns.byItemType || []).map((b: any) => {
                const total = (breakdowns.byItemType || []).reduce(
                  (s: number, x: any) => s + (x.count || 0),
                  0
                );
                const pct = total > 0 ? Math.round(((b.count || 0) / total) * 100) : 0;
                return (
                  <div key={b.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize text-slate-700 font-medium">{b.label}</span>
                      <span className="text-slate-500">
                        {b.count} <span className="text-slate-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-500 to-teal-600 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-600" /> Top 10 Items by Stock Value
            </CardTitle>
            <CardDescription className="text-xs">
              current quantity × last cost price
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {topItems.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No stock value"
                  description="No items have a non-zero stock value yet."
                  icon={DollarSign}
                />
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-semibold text-slate-700 text-xs">#</th>
                      <th className="text-left p-3 font-semibold text-slate-700 text-xs">Item</th>
                      <th className="text-left p-3 font-semibold text-slate-700 text-xs">Type</th>
                      <th className="text-right p-3 font-semibold text-slate-700 text-xs">Qty</th>
                      <th className="text-right p-3 font-semibold text-slate-700 text-xs">Last Cost</th>
                      <th className="text-right p-3 font-semibold text-slate-700 text-xs">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topItems.map((it, i) => (
                      <tr
                        key={it.id}
                        className="border-b hover:bg-teal-50/40 cursor-pointer"
                        onClick={() => onOpenItem(it.id)}
                      >
                        <td className="p-3 text-xs text-slate-400 font-mono">{i + 1}</td>
                        <td className="p-3">
                          <div className="font-medium text-slate-900 text-xs">{it.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{it.sku}</div>
                        </td>
                        <td className="p-3 text-xs capitalize text-slate-600">{it.itemType}</td>
                        <td className="p-3 text-right text-xs font-mono">{it.currentQuantity}</td>
                        <td className="p-3 text-right text-xs font-mono">{formatMoney(it.lastCostPrice)}</td>
                        <td className="p-3 text-right text-xs font-mono font-semibold text-emerald-700">
                          {formatMoney(it.stockValue)}
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
    </div>
  );
}

// =====================================================================
// TAB 2 — ITEMS
// =====================================================================
function ItemsTab({
  facilityId,
  canAdjust,
  onView,
  onAdjust,
  onHistory,
  onNew,
}: {
  facilityId: string | null;
  canAdjust: boolean;
  onView: (it: any) => void;
  onAdjust: (it: any) => void;
  onHistory: (it: any) => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Build categories from the selected type
  const categories = useMemo(() => {
    if (typeFilter === "all") return [];
    return CATEGORIES_BY_TYPE[typeFilter] || [];
  }, [typeFilter]);

  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  if (typeFilter !== "all") params.set("type", typeFilter);
  if (categoryFilter !== "all") params.set("category", categoryFilter);
  if (lowStockOnly) params.set("lowStockOnly", "true");
  if (search) params.set("q", search);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory", facilityId, typeFilter, categoryFilter, lowStockOnly, search],
    queryFn: () => fetchJson(`/api/inventory${qs}`),
    enabled: !!facilityId,
  });

  const items: any[] = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } =
    usePagination(items, 15);

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportParams = new URLSearchParams();
      if (facilityId) exportParams.set("facilityId", facilityId);
      if (typeFilter !== "all") exportParams.set("type", typeFilter);
      if (categoryFilter !== "all") exportParams.set("category", categoryFilter);
      if (lowStockOnly) exportParams.set("lowStockOnly", "true");
      const url = `/api/inventory/export?${exportParams.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast.success(`Exported ${items.length} items to CSV`);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (!facilityId) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-amber-700 bg-amber-50 rounded-lg">
          Select a facility to view inventory items.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <ClearableSearch
              value={search}
              onChange={setSearch}
              placeholder="Search by name, SKU, or description"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setCategoryFilter("all"); }}>
            <SelectTrigger className="md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {categories.length > 0 && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="md:w-48">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md">
            <Checkbox
              id="lowstock"
              checked={lowStockOnly}
              onCheckedChange={(v) => setLowStockOnly(!!v)}
            />
            <Label htmlFor="lowstock" className="text-xs cursor-pointer flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500" /> Low/out of stock only
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || items.length === 0}
            className="gap-1.5"
          >
            {exporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export CSV
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState message="Failed to load inventory" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No inventory items"
              description="Add an inventory item to begin tracking stock levels."
              icon={Package}
              action={
                canAdjust ? (
                  <Button onClick={onNew} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="w-4 h-4" /> New Item
                  </Button>
                ) : undefined
              }
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
                    <th className="text-left p-3 font-semibold text-slate-700 text-xs">Item</th>
                    <th className="text-left p-3 font-semibold text-slate-700 text-xs">SKU</th>
                    <th className="text-left p-3 font-semibold text-slate-700 text-xs">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700 text-xs">Category</th>
                    <th className="text-right p-3 font-semibold text-slate-700 text-xs">Current Qty</th>
                    <th className="text-right p-3 font-semibold text-slate-700 text-xs">Min / Max</th>
                    <th className="text-left p-3 font-semibold text-slate-700 text-xs">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700 text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((it: any) => (
                    <tr
                      key={it.id}
                      className={`border-b hover:bg-teal-50/40 cursor-pointer ${
                        it.stockStatus === "out_of_stock"
                          ? "bg-rose-50/40"
                          : it.stockStatus === "low_stock"
                            ? "bg-amber-50/40"
                            : ""
                      }`}
                      onClick={() => onView(it)}
                    >
                      <td className="p-3">
                        <div className="font-medium text-slate-900 text-xs">{it.name}</div>
                        {it.brand && (
                          <div className="text-[10px] text-slate-500">{it.brand}</div>
                        )}
                      </td>
                      <td className="p-3 text-[10px] text-slate-500 font-mono">{it.sku}</td>
                      <td className="p-3 text-xs capitalize text-slate-600">{it.itemType}</td>
                      <td className="p-3 text-xs text-slate-600">{it.category || "—"}</td>
                      <td className="p-3 text-right">
                        <span
                          className={`font-semibold font-mono text-sm ${
                            it.stockStatus === "out_of_stock"
                              ? "text-rose-700"
                              : it.stockStatus === "low_stock"
                                ? "text-amber-700"
                                : "text-slate-900"
                          }`}
                        >
                          {it.currentQuantity}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">{it.unit || ""}</span>
                      </td>
                      <td className="p-3 text-right text-xs text-slate-500 font-mono">
                        {it.minimumQuantity} / {it.maximumQuantity}
                      </td>
                      <td className="p-3">
                        <StockStatusBadge status={it.stockStatus} />
                      </td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onView(it)}
                            className="gap-1 h-7 text-xs"
                          >
                            <Eye className="w-3 h-3" /> Detail
                          </Button>
                          {canAdjust && (
                            <Button
                              size="sm"
                              onClick={() => onAdjust(it)}
                              className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                            >
                              <ArrowUpDown className="w-3 h-3" /> Adjust
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onHistory(it)}
                            className="gap-1 h-7 text-xs"
                          >
                            <History className="w-3 h-3" /> History
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              totalItems={totalItems}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// TAB 3 — BATCHES
// =====================================================================
function BatchesTab({ facilityId }: { facilityId: string | null }) {
  const [expiryFilter, setExpiryFilter] = useState("all");

  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory-batches", facilityId],
    queryFn: () => fetchJson(`/api/inventory${qs}`),
    enabled: !!facilityId,
  });

  // Flatten batches across items
  const allBatches: any[] = useMemo(() => {
    const items: any[] = data?.items || [];
    const now = new Date();
    const expiringSoonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return items.flatMap((it) =>
      (it.batches || []).map((b: any) => {
        let expiryStatus = "active";
        if (b.expiryDate) {
          const exp = new Date(b.expiryDate);
          if (exp < now) expiryStatus = "expired";
          else if (exp <= expiringSoonThreshold) expiryStatus = "expiring_soon";
        }
        if (b.status && b.status !== "active") expiryStatus = b.status;
        return {
          ...b,
          itemName: it.name,
          itemSku: it.sku,
          unit: it.unit,
          itemType: it.itemType,
          expiryStatus,
        };
      })
    );
  }, [data]);

  const filteredBatches = useMemo(() => {
    if (expiryFilter === "all") return allBatches;
    if (expiryFilter === "active") return allBatches.filter((b) => b.expiryStatus === "active");
    if (expiryFilter === "expiring_soon")
      return allBatches.filter((b) => b.expiryStatus === "expiring_soon");
    if (expiryFilter === "expired")
      return allBatches.filter((b) => b.expiryStatus === "expired");
    return allBatches;
  }, [allBatches, expiryFilter]);

  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } =
    usePagination(filteredBatches, 15);

  if (!facilityId) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-amber-700 bg-amber-50 rounded-lg">
          Select a facility to view inventory batches.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-600" />
            <span className="text-sm font-medium text-slate-700">All Batches</span>
            <Badge variant="outline" className="text-[10px]">{allBatches.length}</Badge>
          </div>
          <div className="flex-1" />
          <Select value={expiryFilter} onValueChange={setExpiryFilter}>
            <SelectTrigger className="md:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BATCH_EXPIRY_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState message="Failed to load batches" onRetry={() => refetch()} />
      ) : filteredBatches.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No batches"
              description="No stock batches match this filter. Receive stock to create batches."
              icon={Layers}
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
                    <th className="text-left p-3 font-semibold text-slate-700 text-xs">Batch #</th>
                    <th className="text-left p-3 font-semibold text-slate-700 text-xs">Item</th>
                    <th className="text-left p-3 font-semibold text-slate-700 text-xs">Expiry</th>
                    <th className="text-right p-3 font-semibold text-slate-700 text-xs">Qty</th>
                    <th className="text-right p-3 font-semibold text-slate-700 text-xs">Cost</th>
                    <th className="text-left p-3 font-semibold text-slate-700 text-xs">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700 text-xs">Supplier</th>
                    <th className="text-left p-3 font-semibold text-slate-700 text-xs">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((b: any) => (
                    <tr
                      key={b.id}
                      className={`border-b hover:bg-teal-50/40 ${
                        b.expiryStatus === "expired"
                          ? "bg-rose-50/40"
                          : b.expiryStatus === "expiring_soon"
                            ? "bg-amber-50/40"
                            : ""
                      }`}
                    >
                      <td className="p-3 text-xs font-mono text-slate-700">{b.batchNumber}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900 text-xs">{b.itemName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{b.itemSku}</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div className={b.expiryStatus === "expired" ? "text-rose-700 font-medium" : b.expiryStatus === "expiring_soon" ? "text-amber-700 font-medium" : "text-slate-700"}>
                          {b.expiryDate ? formatDate(b.expiryDate) : "—"}
                        </div>
                        {b.expiryDate && (
                          <div className="text-[10px] text-slate-400">{formatRelative(b.expiryDate)}</div>
                        )}
                      </td>
                      <td className="p-3 text-right text-xs font-mono font-semibold">
                        {b.quantity}
                        <span className="text-[10px] text-slate-400 ml-1">{b.unit || ""}</span>
                      </td>
                      <td className="p-3 text-right text-xs font-mono">
                        {b.costPrice ? formatMoney(b.costPrice) : "—"}
                      </td>
                      <td className="p-3">
                        <BatchStatusBadge status={b.status || b.expiryStatus} />
                      </td>
                      <td className="p-3 text-xs text-slate-600">{b.supplier?.name || "—"}</td>
                      <td className="p-3 text-xs text-slate-600">
                        {b.receivedAt ? formatDate(b.receivedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              totalItems={totalItems}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// TAB 4 — REPORTS
// =====================================================================
const REPORT_TYPES = [
  { value: "valuation", label: "Stock Valuation", icon: DollarSign, desc: "Current quantity × last cost price per item" },
  { value: "low_stock", label: "Low Stock", icon: TrendingDown, desc: "Items at or below minimum stock" },
  { value: "expiry", label: "Expiry", icon: CalendarClock, desc: "Batches by expiry status" },
  { value: "movement", label: "Movement Summary", icon: ArrowUpDown, desc: "Recent stock transactions" },
  { value: "dead_stock", label: "Dead Stock", icon: PackageX, desc: "Items with zero recent movement" },
];

function ReportsTab({ facilityId }: { facilityId: string | null }) {
  const [reportType, setReportType] = useState("valuation");

  if (!facilityId) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-amber-700 bg-amber-50 rounded-lg">
          Select a facility to view inventory reports.
        </CardContent>
      </Card>
    );
  }

  const Active = REPORT_TYPES.find((r) => r.value === reportType)!;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {REPORT_TYPES.map((r) => {
              const Icon = r.icon;
              const active = r.value === reportType;
              return (
                <button
                  key={r.value}
                  onClick={() => setReportType(r.value)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    active
                      ? "border-teal-500 bg-teal-50 shadow-sm"
                      : "border-slate-200 hover:border-teal-300 hover:bg-slate-50"
                  }`}
                >
                  <Icon className={`w-4 h-4 mb-1 ${active ? "text-teal-600" : "text-slate-500"}`} />
                  <div className={`text-xs font-semibold ${active ? "text-teal-700" : "text-slate-700"}`}>
                    {r.label}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{r.desc}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Active.icon className="w-4 h-4 text-teal-600" /> {Active.label} Report
          </CardTitle>
          <CardDescription className="text-xs">{Active.desc}</CardDescription>
        </CardHeader>
        <CardContent>
          {reportType === "valuation" && <StockValuationReport facilityId={facilityId} />}
          {reportType === "low_stock" && <LowStockReport facilityId={facilityId} />}
          {reportType === "expiry" && <ExpiryReport facilityId={facilityId} />}
          {reportType === "movement" && <MovementReport facilityId={facilityId} />}
          {reportType === "dead_stock" && <DeadStockReport facilityId={facilityId} />}
        </CardContent>
      </Card>
    </div>
  );
}

function StockValuationReport({ facilityId }: { facilityId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory", facilityId, "valuation"],
    queryFn: () => fetchJson(`/api/inventory?facilityId=${facilityId}`),
  });
  const items: any[] = (data?.items || []).filter((it: any) => it.currentQuantity > 0 || (it.lastCostPrice || 0) > 0);
  const grandTotal = items.reduce((s: number, it: any) => s + (Number(it.stockValue) || 0), 0);

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load valuation" onRetry={() => refetch()} />;
  if (items.length === 0) return <EmptyState title="No valued stock" description="No items with stock or cost data." icon={DollarSign} />;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 sticky top-0">
            <tr>
              <th className="text-left p-3 font-semibold text-slate-700 text-xs">Item</th>
              <th className="text-left p-3 font-semibold text-slate-700 text-xs">Type</th>
              <th className="text-right p-3 font-semibold text-slate-700 text-xs">Qty</th>
              <th className="text-right p-3 font-semibold text-slate-700 text-xs">Last Cost</th>
              <th className="text-right p-3 font-semibold text-slate-700 text-xs">Value</th>
            </tr>
          </thead>
          <tbody>
            {items
              .sort((a: any, b: any) => (b.stockValue || 0) - (a.stockValue || 0))
              .map((it: any) => (
                <tr key={it.id} className="border-b hover:bg-slate-50">
                  <td className="p-3">
                    <div className="font-medium text-slate-900 text-xs">{it.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{it.sku}</div>
                  </td>
                  <td className="p-3 text-xs capitalize text-slate-600">{it.itemType}</td>
                  <td className="p-3 text-right text-xs font-mono">{it.currentQuantity}</td>
                  <td className="p-3 text-right text-xs font-mono">{formatMoney(it.lastCostPrice)}</td>
                  <td className="p-3 text-right text-xs font-mono font-semibold text-emerald-700">
                    {formatMoney(it.stockValue)}
                  </td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr className="bg-teal-50 border-t-2 border-teal-200">
              <td colSpan={4} className="p-3 text-right text-xs font-bold text-slate-800 uppercase">
                Grand Total
              </td>
              <td className="p-3 text-right text-sm font-mono font-extrabold text-teal-700">
                {formatMoney(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function LowStockReport({ facilityId }: { facilityId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory", facilityId, "low_stock_report"],
    queryFn: () => fetchJson(`/api/inventory?facilityId=${facilityId}&lowStockOnly=true`),
  });
  const items: any[] = data?.items || [];

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load low stock report" onRetry={() => refetch()} />;
  if (items.length === 0) return <EmptyState title="No low stock" description="All items are above their minimum stock threshold." icon={TrendingUp} />;

  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="border-b bg-slate-50 sticky top-0">
          <tr>
            <th className="text-left p-3 font-semibold text-slate-700 text-xs">Item</th>
            <th className="text-right p-3 font-semibold text-slate-700 text-xs">Current</th>
            <th className="text-right p-3 font-semibold text-slate-700 text-xs">Minimum</th>
            <th className="text-right p-3 font-semibold text-slate-700 text-xs">Reorder Qty</th>
            <th className="text-left p-3 font-semibold text-slate-700 text-xs">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it: any) => (
            <tr key={it.id} className="border-b hover:bg-amber-50/40">
              <td className="p-3">
                <div className="font-medium text-slate-900 text-xs">{it.name}</div>
                <div className="text-[10px] text-slate-500 font-mono">{it.sku}</div>
              </td>
              <td className="p-3 text-right text-xs font-mono font-semibold text-amber-700">{it.currentQuantity}</td>
              <td className="p-3 text-right text-xs font-mono text-slate-600">{it.minimumQuantity}</td>
              <td className="p-3 text-right text-xs font-mono text-slate-600">{it.reorderQuantity || it.reorderLevel || "—"}</td>
              <td className="p-3"><StockStatusBadge status={it.stockStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpiryReport({ facilityId }: { facilityId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory-batches", facilityId, "expiry_report"],
    queryFn: () => fetchJson(`/api/inventory?facilityId=${facilityId}`),
  });

  const batches: any[] = useMemo(() => {
    const items: any[] = data?.items || [];
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return items.flatMap((it) =>
      (it.batches || []).map((b: any) => {
        let status = "active";
        if (b.expiryDate) {
          const exp = new Date(b.expiryDate);
          if (exp < now) status = "expired";
          else if (exp <= soon) status = "expiring_soon";
        }
        return { ...b, itemName: it.name, itemSku: it.sku, unit: it.unit, expiryStatus: status };
      })
    );
  }, [data]);

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load expiry report" onRetry={() => refetch()} />;
  if (batches.length === 0) return <EmptyState title="No batches" description="No stock batches on record." icon={CalendarClock} />;

  const sorted = [...batches].sort((a, b) => {
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
  });

  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="border-b bg-slate-50 sticky top-0">
          <tr>
            <th className="text-left p-3 font-semibold text-slate-700 text-xs">Item</th>
            <th className="text-left p-3 font-semibold text-slate-700 text-xs">Batch #</th>
            <th className="text-left p-3 font-semibold text-slate-700 text-xs">Expiry</th>
            <th className="text-right p-3 font-semibold text-slate-700 text-xs">Qty</th>
            <th className="text-left p-3 font-semibold text-slate-700 text-xs">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b: any) => (
            <tr
              key={b.id}
              className={`border-b hover:bg-slate-50 ${
                b.expiryStatus === "expired" ? "bg-rose-50/40" : b.expiryStatus === "expiring_soon" ? "bg-amber-50/40" : ""
              }`}
            >
              <td className="p-3">
                <div className="font-medium text-slate-900 text-xs">{b.itemName}</div>
                <div className="text-[10px] text-slate-500 font-mono">{b.itemSku}</div>
              </td>
              <td className="p-3 text-xs font-mono text-slate-700">{b.batchNumber}</td>
              <td className="p-3 text-xs">
                <div className={b.expiryStatus === "expired" ? "text-rose-700 font-medium" : b.expiryStatus === "expiring_soon" ? "text-amber-700 font-medium" : "text-slate-700"}>
                  {b.expiryDate ? formatDate(b.expiryDate) : "—"}
                </div>
              </td>
              <td className="p-3 text-right text-xs font-mono">{b.quantity}</td>
              <td className="p-3"><BatchStatusBadge status={b.expiryStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovementReport({ facilityId }: { facilityId: string }) {
  // We fetch all items, then for each item fetch its recent transactions.
  // To keep this lightweight, we just fetch transactions for the first 30 items.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory", facilityId, "movement_report"],
    queryFn: () => fetchJson(`/api/inventory?facilityId=${facilityId}`),
  });
  const items: any[] = (data?.items || []).slice(0, 30);
  const [movements, setMovements] = useState<any[]>([]);
  const [loadingMov, setLoadingMov] = useState(false);

  const loadMovements = async () => {
    setLoadingMov(true);
    try {
      const results = await Promise.all(
        items.map(async (it) => {
          const r = await fetch(`/api/inventory/${it.id}/transactions?facilityId=${facilityId}`);
          const d = await safeJson(r);
          return (d.items || []).slice(0, 5).map((t: any) => ({
            ...t,
            itemName: it.name,
            itemSku: it.sku,
            unit: it.unit,
          }));
        })
      );
      setMovements(results.flat().sort((a, b) => new Date(b.transactionAt).getTime() - new Date(a.transactionAt).getTime()).slice(0, 100));
    } catch (e: any) {
      toast.error(e.message || "Failed to load movements");
    } finally {
      setLoadingMov(false);
    }
  };

  useEffect(() => {
    if (items.length > 0) loadMovements();
  }, [data]);

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load movement report" onRetry={() => refetch()} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Showing recent movements across the first {items.length} items (max 100 transactions).
        </p>
        <Button variant="outline" size="sm" onClick={loadMovements} disabled={loadingMov} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loadingMov ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      {loadingMov && movements.length === 0 ? (
        <LoadingState rows={6} />
      ) : movements.length === 0 ? (
        <EmptyState title="No movements" description="No stock transactions recorded yet." icon={ArrowUpDown} />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left p-3 font-semibold text-slate-700 text-xs">Date</th>
                <th className="text-left p-3 font-semibold text-slate-700 text-xs">Item</th>
                <th className="text-left p-3 font-semibold text-slate-700 text-xs">Type</th>
                <th className="text-right p-3 font-semibold text-slate-700 text-xs">Qty</th>
                <th className="text-left p-3 font-semibold text-slate-700 text-xs">By</th>
                <th className="text-left p-3 font-semibold text-slate-700 text-xs">Reason</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((t: any) => (
                <tr key={t.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 text-xs text-slate-600">{formatDate(t.transactionAt, true)}</td>
                  <td className="p-3">
                    <div className="font-medium text-slate-900 text-xs">{t.itemName}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{t.itemSku}</div>
                  </td>
                  <td className="p-3 text-xs capitalize text-slate-600">{t.transactionType.replace(/_/g, " ")}</td>
                  <td className={`p-3 text-right text-xs font-mono font-semibold ${t.quantity < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {t.quantity > 0 ? "+" : ""}{t.quantity}
                  </td>
                  <td className="p-3 text-xs text-slate-600">
                    {t.performedBy ? `${t.performedBy.firstName} ${t.performedBy.lastName}` : "—"}
                  </td>
                  <td className="p-3 text-xs text-slate-500">{t.reason || t.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeadStockReport({ facilityId }: { facilityId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory", facilityId, "dead_stock_report"],
    queryFn: () => fetchJson(`/api/inventory?facilityId=${facilityId}`),
  });
  const items: any[] = (data?.items || []).filter((it: any) => it.currentQuantity > 0);
  const [dead, setDead] = useState<any[]>([]);
  const [loadingDead, setLoadingDead] = useState(false);

  const loadDead = async () => {
    setLoadingDead(true);
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const results = await Promise.all(
        items.map(async (it) => {
          const r = await fetch(`/api/inventory/${it.id}/transactions?facilityId=${facilityId}`);
          const d = await safeJson(r);
          const txns: any[] = d.items || [];
          const lastTxn = txns[0];
          const lastDate = lastTxn ? new Date(lastTxn.transactionAt) : null;
          const isDead = !lastDate || lastDate < cutoff;
          return isDead
            ? { ...it, lastTransactionAt: lastTxn?.transactionAt || null, lastTransactionType: lastTxn?.transactionType || null, txnCount: txns.length }
            : null;
        })
      );
      setDead(results.filter(Boolean));
    } catch (e: any) {
      toast.error(e.message || "Failed to load dead stock");
    } finally {
      setLoadingDead(false);
    }
  };

  useEffect(() => {
    if (items.length > 0) loadDead();
  }, [data]);

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load dead stock report" onRetry={() => refetch()} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Items with stock on hand but no movement in the last 90 days.
        </p>
        <Button variant="outline" size="sm" onClick={loadDead} disabled={loadingDead} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loadingDead ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      {loadingDead && dead.length === 0 ? (
        <LoadingState rows={6} />
      ) : dead.length === 0 ? (
        <EmptyState title="No dead stock" description="All stocked items have moved in the last 90 days." icon={TrendingUp} />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left p-3 font-semibold text-slate-700 text-xs">Item</th>
                <th className="text-right p-3 font-semibold text-slate-700 text-xs">Qty</th>
                <th className="text-right p-3 font-semibold text-slate-700 text-xs">Value</th>
                <th className="text-left p-3 font-semibold text-slate-700 text-xs">Last Movement</th>
                <th className="text-right p-3 font-semibold text-slate-700 text-xs">Txns</th>
              </tr>
            </thead>
            <tbody>
              {dead.map((it: any) => (
                <tr key={it.id} className="border-b hover:bg-slate-50">
                  <td className="p-3">
                    <div className="font-medium text-slate-900 text-xs">{it.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{it.sku}</div>
                  </td>
                  <td className="p-3 text-right text-xs font-mono">{it.currentQuantity}</td>
                  <td className="p-3 text-right text-xs font-mono">{formatMoney(it.stockValue)}</td>
                  <td className="p-3 text-xs text-slate-600">
                    {it.lastTransactionAt ? (
                      <>
                        <div>{formatDate(it.lastTransactionAt)}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{it.lastTransactionType?.replace(/_/g, " ")}</div>
                      </>
                    ) : (
                      <span className="text-rose-600">Never moved</span>
                    )}
                  </td>
                  <td className="p-3 text-right text-xs font-mono text-slate-500">{it.txnCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// ITEM DETAIL DIALOG
// =====================================================================
function ItemDetailDialog({
  itemId,
  facilityId,
  canAdjust,
  onClose,
  onAdjust,
  onReceive,
  onIssue,
}: {
  itemId: string;
  facilityId?: string;
  canAdjust: boolean;
  onClose: () => void;
  onAdjust: (it: any) => void;
  onReceive: (it: any) => void;
  onIssue: (it: any) => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory-item", itemId, facilityId],
    queryFn: () =>
      fetchJson(`/api/inventory/${itemId}${facilityId ? `?facilityId=${facilityId}` : ""}`),
  });
  const { data: txnsData } = useQuery({
    queryKey: ["inventory-transactions", itemId, facilityId],
    queryFn: () =>
      fetchJson(`/api/inventory/${itemId}/transactions${facilityId ? `?facilityId=${facilityId}` : ""}`),
  });

  const item: any = data?.item;
  const fi: any = item?.facilityInventory?.[0] || null;
  const batches: any[] = fi?.batches || item?.facilityInventory?.batches || [];
  const txns: any[] = (txnsData?.items || []).slice(0, 20);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="-mx-6 -mt-6 px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Package className="w-5 h-5 text-teal-600" /> Item Detail
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {isLoading ? "Loading…" : item ? `${item.name} · ${item.sku}` : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState rows={6} />
        ) : isError ? (
          <ErrorState message="Failed to load item" onRetry={() => refetch()} />
        ) : !item ? (
          <EmptyState title="Item not found" description="The item you're looking for does not exist." />
        ) : (
          <div className="space-y-4">
            {/* Item info */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg">
              <Info label="Name" value={item.name} />
              <Info label="SKU" value={item.sku} mono />
              <Info label="Barcode" value={item.barcode} mono />
              <Info label="Type" value={item.itemType} capitalize />
              <Info label="Category" value={item.category} />
              <Info label="Subcategory" value={item.subcategory} />
              <Info label="Unit" value={item.unit} />
              <Info label="Pack Size" value={item.packSize} />
              <Info label="Manufacturer" value={item.manufacturer} />
              <Info label="Brand" value={item.brand} />
              <Info label="Country of Origin" value={item.countryOfOrigin} />
              <Info label="Storage Conditions" value={item.storageConditions} />
            </div>

            {/* Flags */}
            <div className="flex flex-wrap gap-2">
              <FlagChip active={item.isControlled} icon={ShieldAlert} label="Controlled" />
              <FlagChip active={item.isConsumable} icon={Package} label="Consumable" />
              <FlagChip active={item.isRefrigerated} icon={Snowflake} label="Refrigerated" />
              <FlagChip active={item.isHazardous} icon={Flame} label="Hazardous" />
              <FlagChip active={item.isSterile} icon={Sparkles} label="Sterile" />
            </div>

            {/* Stock summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StockBox label="Current" value={fi?.currentQuantity ?? 0} unit={item.unit} color="text-slate-900" />
              <StockBox label="Reserved" value={fi?.reservedQuantity ?? 0} unit={item.unit} color="text-violet-700" />
              <StockBox label="Quarantined" value={fi?.quarantinedQuantity ?? 0} unit={item.unit} color="text-fuchsia-700" />
              <StockBox label="Damaged" value={fi?.damagedQuantity ?? 0} unit={item.unit} color="text-amber-700" />
              <StockBox label="Available" value={Math.max(0, (fi?.currentQuantity ?? 0) - (fi?.reservedQuantity ?? 0) - (fi?.quarantinedQuantity ?? 0) - (fi?.damagedQuantity ?? 0))} unit={item.unit} color="text-emerald-700" />
            </div>

            {/* Stock control + cost */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 border rounded-lg">
              <Info label="Min Stock" value={fi?.minimumQuantity ?? item.minimumStock ?? item.reorderLevel ?? 0} />
              <Info label="Max Stock" value={fi?.maximumQuantity ?? item.maximumStock ?? 0} />
              <Info label="Reorder Qty" value={item.reorderQuantity ?? item.reorderLevel ?? 0} />
              <Info label="Safety Stock" value={item.safetyStock ?? 0} />
              <Info label="Last Cost" value={formatMoney(fi?.lastCostPrice ?? 0)} />
              <Info label="Average Cost" value={formatMoney(fi?.averageCost ?? 0)} />
              <Info label="Store" value={fi?.storeName || "—"} />
              <Info label="Bin Location" value={fi?.binLocation || fi?.storageLocation || "—"} />
            </div>

            {/* Batches */}
            <div>
              <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-teal-600" /> Batches ({batches.length})
              </h4>
              {batches.length === 0 ? (
                <EmptyState title="No batches" description="No stock batches for this item." />
              ) : (
                <div className="overflow-x-auto max-h-48 overflow-y-auto rounded border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-semibold text-slate-700">Batch #</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Expiry</th>
                        <th className="text-right p-2 font-semibold text-slate-700">Qty</th>
                        <th className="text-right p-2 font-semibold text-slate-700">Cost</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((b: any) => (
                        <tr key={b.id} className="border-b hover:bg-slate-50">
                          <td className="p-2 font-mono text-slate-700">{b.batchNumber}</td>
                          <td className="p-2 text-slate-600">{b.expiryDate ? formatDate(b.expiryDate) : "—"}</td>
                          <td className="p-2 text-right font-mono">{b.quantity}</td>
                          <td className="p-2 text-right font-mono">{b.costPrice ? formatMoney(b.costPrice) : "—"}</td>
                          <td className="p-2"><BatchStatusBadge status={b.status || "active"} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Movement history */}
            <div>
              <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                <History className="w-4 h-4 text-teal-600" /> Movement History (last 20)
              </h4>
              {txns.length === 0 ? (
                <EmptyState title="No transactions" description="No stock movements recorded." />
              ) : (
                <div className="overflow-x-auto max-h-48 overflow-y-auto rounded border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-semibold text-slate-700">Date</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                        <th className="text-right p-2 font-semibold text-slate-700">Qty</th>
                        <th className="text-right p-2 font-semibold text-slate-700">Before</th>
                        <th className="text-right p-2 font-semibold text-slate-700">After</th>
                        <th className="text-left p-2 font-semibold text-slate-700">By</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txns.map((t: any) => (
                        <tr key={t.id} className="border-b hover:bg-slate-50">
                          <td className="p-2 text-slate-600">{formatDate(t.transactionAt, true)}</td>
                          <td className="p-2 capitalize text-slate-600">{t.transactionType.replace(/_/g, " ")}</td>
                          <td className={`p-2 text-right font-mono font-semibold ${t.quantity < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                            {t.quantity > 0 ? "+" : ""}{t.quantity}
                          </td>
                          <td className="p-2 text-right font-mono text-slate-500">{t.balanceBefore ?? "—"}</td>
                          <td className="p-2 text-right font-mono text-slate-500">{t.balanceAfter ?? "—"}</td>
                          <td className="p-2 text-slate-600">
                            {t.performedBy ? `${t.performedBy.firstName} ${t.performedBy.lastName}` : "—"}
                          </td>
                          <td className="p-2 text-slate-500">{t.reason || t.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {canAdjust && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button onClick={() => onAdjust(item)} className="gap-1.5 bg-teal-600 hover:bg-teal-700">
                  <ArrowUpDown className="w-3.5 h-3.5" /> Adjust
                </Button>
                <Button onClick={() => onReceive(item)} variant="outline" className="gap-1.5">
                  <ArrowDownCircle className="w-3.5 h-3.5" /> Receive
                </Button>
                <Button onClick={() => onIssue(item)} variant="outline" className="gap-1.5">
                  <ArrowUpCircle className="w-3.5 h-3.5" /> Issue
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, mono, capitalize }: { label: string; value: any; mono?: boolean; capitalize?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`text-sm text-slate-900 ${mono ? "font-mono" : ""} ${capitalize ? "capitalize" : ""}`}>
        {value == null || value === "" ? "—" : String(value)}
      </div>
    </div>
  );
}

function StockBox({ label, value, unit, color }: { label: string; value: number; unit?: string; color: string }) {
  return (
    <div className="p-3 border rounded-lg bg-white">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`text-xl font-bold ${color} font-mono`}>
        {value}
        {unit && <span className="text-[10px] text-slate-400 ml-1 font-sans">{unit}</span>}
      </div>
    </div>
  );
}

function FlagChip({ active, icon: Icon, label }: { active: boolean; icon: any; label: string }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-700 text-[10px] font-medium">
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

// =====================================================================
// NEW ITEM DIALOG — with all new schema fields
// =====================================================================
function NewItemDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // Basic fields
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [itemType, setItemType] = useState("medication");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [description, setDescription] = useState("");

  // New schema fields
  const [barcode, setBarcode] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [packSize, setPackSize] = useState("");
  const [minimumStock, setMinimumStock] = useState("0");
  const [maximumStock, setMaximumStock] = useState("0");
  const [reorderQuantity, setReorderQuantity] = useState("0");
  const [safetyStock, setSafetyStock] = useState("0");
  const [manufacturer, setManufacturer] = useState("");
  const [brand, setBrand] = useState("");
  const [countryOfOrigin, setCountryOfOrigin] = useState("");
  const [storageConditions, setStorageConditions] = useState("");
  const [isControlled, setIsControlled] = useState(false);
  const [isConsumable, setIsConsumable] = useState(true);
  const [isRefrigerated, setIsRefrigerated] = useState(false);
  const [isHazardous, setIsHazardous] = useState(false);
  const [isSterile, setIsSterile] = useState(false);
  const [preferredSupplierId, setPreferredSupplierId] = useState("");

  // Suppliers list (for preferred supplier select)
  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => fetchJson("/api/suppliers?status=active"),
    enabled: open,
  });
  const suppliers: any[] = suppliersData?.items || [];

  const categories = CATEGORIES_BY_TYPE[itemType] || [];
  const units = UNITS_BY_TYPE[itemType] || [];
  const hints = HINTS_BY_TYPE[itemType] || HINTS_BY_TYPE.other;

  const handleTypeChange = (newType: string) => {
    setItemType(newType);
    setCategory("");
    setUnit("");
  };

  const reset = () => {
    setName(""); setSku(""); setCategory(""); setUnit(""); setReorderLevel("0"); setDescription("");
    setBarcode(""); setSubcategory(""); setPackSize("");
    setMinimumStock("0"); setMaximumStock("0"); setReorderQuantity("0"); setSafetyStock("0");
    setManufacturer(""); setBrand(""); setCountryOfOrigin(""); setStorageConditions("");
    setIsControlled(false); setIsConsumable(true); setIsRefrigerated(false); setIsHazardous(false); setIsSterile(false);
    setPreferredSupplierId("");
  };

  const handleSubmit = async () => {
    if (!name || !sku || !itemType) return toast.error("Name, SKU, and Item Type are required");
    if (!category) return toast.error("Please select a category");
    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, sku, itemType, category, unit, description,
          reorderLevel: Number(reorderLevel) || 0,
          barcode: barcode || null,
          subcategory: subcategory || null,
          packSize: packSize || null,
          minimumStock: Number(minimumStock) || 0,
          maximumStock: Number(maximumStock) || 0,
          reorderQuantity: Number(reorderQuantity) || 0,
          safetyStock: Number(safetyStock) || 0,
          manufacturer: manufacturer || null,
          brand: brand || null,
          countryOfOrigin: countryOfOrigin || null,
          storageConditions: storageConditions || null,
          isControlled,
          isConsumable,
          isRefrigerated,
          isHazardous,
          isSterile,
          preferredSupplierId: preferredSupplierId || null,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to create item");
      toast.success("Inventory item created");
      reset();
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-stats"] });
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="-mx-6 -mt-6 px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Plus className="w-5 h-5 text-teal-600" /> New Inventory Item
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Create a new catalog item. Stock levels are tracked per facility.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Identity */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Identity
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <FieldLabel required className="text-xs">Name</FieldLabel>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={hints.name} />
              </div>
              <div>
                <FieldLabel required className="text-xs">SKU</FieldLabel>
                <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder={hints.sku} />
              </div>
              <div>
                <Label className="text-xs">Barcode</Label>
                <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="e.g., 5901234123457" />
              </div>
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
                <Label className="text-xs">Subcategory</Label>
                <Input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="e.g., Penicillin group" />
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
              <div>
                <Label className="text-xs">Pack Size</Label>
                <Input value={packSize} onChange={(e) => setPackSize(e.target.value)} placeholder="e.g., Box of 100" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Brief description of the item" />
            </div>
          </section>

          {/* Stock control */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5" /> Stock Control
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Reorder Level</Label>
                <Input type="number" min="0" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Minimum Stock</Label>
                <Input type="number" min="0" value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Maximum Stock</Label>
                <Input type="number" min="0" value={maximumStock} onChange={(e) => setMaximumStock(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Reorder Quantity</Label>
                <Input type="number" min="0" value={reorderQuantity} onChange={(e) => setReorderQuantity(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Safety Stock</Label>
                <Input type="number" min="0" value={safetyStock} onChange={(e) => setSafetyStock(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Provenance */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Provenance
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Manufacturer</Label>
                <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g., GlaxoSmithKline" />
              </div>
              <div>
                <Label className="text-xs">Brand</Label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g., Panadol" />
              </div>
              <div>
                <Label className="text-xs">Country of Origin</Label>
                <Input value={countryOfOrigin} onChange={(e) => setCountryOfOrigin(e.target.value)} placeholder="e.g., Ghana" />
              </div>
              <div>
                <Label className="text-xs">Storage Conditions</Label>
                <Input value={storageConditions} onChange={(e) => setStorageConditions(e.target.value)} placeholder="e.g., Store below 25°C" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Preferred Supplier</Label>
                <Select value={preferredSupplierId || undefined} onValueChange={setPreferredSupplierId}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Flags */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Item Flags
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg">
              <FlagCheckbox id="isControlled" checked={isControlled} onChange={setIsControlled} label="Controlled substance" icon={ShieldAlert} />
              <FlagCheckbox id="isConsumable" checked={isConsumable} onChange={setIsConsumable} label="Consumable" icon={Package} />
              <FlagCheckbox id="isRefrigerated" checked={isRefrigerated} onChange={setIsRefrigerated} label="Refrigerated" icon={Snowflake} />
              <FlagCheckbox id="isHazardous" checked={isHazardous} onChange={setIsHazardous} label="Hazardous" icon={Flame} />
              <FlagCheckbox id="isSterile" checked={isSterile} onChange={setIsSterile} label="Sterile" icon={Sparkles} />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
            {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {submitting ? "Creating..." : "Create Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlagCheckbox({ id, checked, onChange, label, icon: Icon }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; icon: any }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <Icon className="w-3.5 h-3.5 text-slate-500" />
      <span className="text-xs text-slate-700">{label}</span>
    </label>
  );
}

// =====================================================================
// STOCK MOVEMENT DIALOG — handles Adjust / Receive / Issue
// =====================================================================
function StockMovementDialog({
  item,
  mode,
  onClose,
  onDone,
}: {
  item: any;
  mode: "adjust" | "receive" | "issue";
  onClose: () => void;
  onDone: () => void;
}) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  // Shared state
  const [quantity, setQuantity] = useState("");
  const [batchId, setBatchId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Adjust-mode-only state
  const [adjustmentType, setAdjustmentType] = useState("counting_error");
  const [newQuantity, setNewQuantity] = useState("");

  // Receive/Issue transaction type
  const [transactionType, setTransactionType] = useState(mode === "receive" ? "receive" : "issue");

  // Compute before/after preview
  const currentQty = Number(item?.currentQuantity ?? 0);
  let beforeQty = currentQty;
  let afterQty = currentQty;
  let adjustmentQty = 0;
  if (mode === "adjust") {
    afterQty = Number(newQuantity) || 0;
    adjustmentQty = afterQty - beforeQty;
  } else {
    const q = Number(quantity) || 0;
    adjustmentQty = mode === "receive" ? Math.abs(q) : -Math.abs(q);
    afterQty = beforeQty + adjustmentQty;
  }

  const handleSubmit = async () => {
    if (!activeFacilityId) return toast.error("No facility selected");
    if (mode === "adjust") {
      if (newQuantity === "" || Number.isNaN(Number(newQuantity))) return toast.error("New quantity required");
      if (!reason.trim()) return toast.error("Reason is required for adjustments");
    } else {
      if (!quantity || Number.isNaN(Number(quantity)) || Number(quantity) <= 0) {
        return toast.error("Quantity must be a positive number");
      }
    }
    setSubmitting(true);
    try {
      let res: Response;
      if (mode === "adjust") {
        res = await fetch(`/api/inventory/${item.id}/adjustments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            facilityId: activeFacilityId,
            adjustmentType,
            newQuantity: Number(newQuantity),
            batchId: batchId || null,
            reason: reason.trim(),
            notes: notes || null,
            unitCost: unitCost ? Number(unitCost) : undefined,
          }),
        });
      } else {
        res = await fetch(`/api/inventory/${item.id}/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            facilityId: activeFacilityId,
            transactionType,
            quantity: Number(quantity),
            batchId: batchId || null,
            reason: reason.trim() || null,
            notes: notes || null,
          }),
        });
      }
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(mode === "adjust" ? "Stock adjusted" : `Stock ${transactionType}d`);
      // Invalidate everything that touches inventory
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-stats"] });
      qc.invalidateQueries({ queryKey: ["inventory-batches"] });
      qc.invalidateQueries({ queryKey: ["inventory-item"] });
      qc.invalidateQueries({ queryKey: ["inventory-transactions"] });
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "adjust" ? "Adjust Stock" : mode === "receive" ? "Receive Stock" : "Issue Stock";
  const TitleIcon = mode === "adjust" ? ArrowUpDown : mode === "receive" ? ArrowDownCircle : ArrowUpCircle;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="-mx-6 -mt-6 px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <TitleIcon className="w-5 h-5 text-teal-600" /> {title}: {item.name}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            SKU: {item.sku} · Current stock: {currentQty} {item.unit || ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Before / After preview */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg">
            <div className="text-center">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Before</div>
              <div className="text-lg font-mono font-bold text-slate-900">{beforeQty}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Change</div>
              <div className={`text-lg font-mono font-bold ${adjustmentQty < 0 ? "text-rose-600" : adjustmentQty > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                {adjustmentQty > 0 ? "+" : ""}{adjustmentQty}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">After</div>
              <div className="text-lg font-mono font-bold text-teal-700">{afterQty}</div>
            </div>
          </div>

          {/* Mode-specific inputs */}
          {mode === "adjust" ? (
            <>
              <div>
                <FieldLabel required className="text-xs">Adjustment Type</FieldLabel>
                <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ADJUSTMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel required className="text-xs">New Quantity (counted)</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                  placeholder={String(currentQty)}
                />
              </div>
              <div>
                <FieldLabel required className="text-xs">Reason</FieldLabel>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Stock count variance of 5 units" />
              </div>
            </>
          ) : (
            <>
              <div>
                <FieldLabel required className="text-xs">Transaction Type</FieldLabel>
                <Select value={transactionType} onValueChange={setTransactionType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {mode === "receive" && (
                      <>
                        <SelectItem value="receive">Receive (+)</SelectItem>
                        <SelectItem value="return">Return (+)</SelectItem>
                      </>
                    )}
                    {mode === "issue" && (
                      <>
                        <SelectItem value="issue">Issue (−)</SelectItem>
                        <SelectItem value="damage">Damage (−)</SelectItem>
                        <SelectItem value="expiry">Expiry (−)</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel required className="text-xs">Quantity</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Enter quantity"
                />
              </div>
              <div>
                <Label className="text-xs">Reason (optional)</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Ward restock" />
              </div>
            </>
          )}

          {/* Shared inputs */}
          {(item.batches || []).length > 0 && (
            <div>
              <Label className="text-xs">Batch (optional)</Label>
              <Select value={batchId || undefined} onValueChange={setBatchId}>
                <SelectTrigger><SelectValue placeholder="None — adjust facility total" /></SelectTrigger>
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
          {mode === "adjust" && (
            <div>
              <Label className="text-xs">Unit Cost (optional)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="e.g., 2.50"
              />
            </div>
          )}
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional context (optional)" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
            {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <TitleIcon className="w-3.5 h-3.5" />}
            {submitting ? "Saving..." : mode === "adjust" ? "Save Adjustment" : `Confirm ${transactionType}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// HISTORY DIALOG (kept for the History action on the Items tab)
// =====================================================================
function HistoryDialog({ item, facilityId, onClose }: { item: any; facilityId?: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["inventory-transactions", item.id, facilityId],
    queryFn: () => fetchJson(`/api/inventory/${item.id}/transactions${facilityId ? `?facilityId=${facilityId}` : ""}`),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="-mx-6 -mt-6 px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <History className="w-5 h-5 text-teal-600" /> Transaction History
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {item.name} ({item.sku}) · Current stock: {item.currentQuantity} {item.unit || ""}
          </DialogDescription>
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
                <th className="text-left p-2 font-semibold text-slate-700 text-xs">Type</th>
                <th className="text-right p-2 font-semibold text-slate-700 text-xs">Qty</th>
                <th className="text-right p-2 font-semibold text-slate-700 text-xs">Before</th>
                <th className="text-right p-2 font-semibold text-slate-700 text-xs">After</th>
                <th className="text-left p-2 font-semibold text-slate-700 text-xs">Batch</th>
                <th className="text-left p-2 font-semibold text-slate-700 text-xs">By</th>
                <th className="text-left p-2 font-semibold text-slate-700 text-xs">Date</th>
                <th className="text-left p-2 font-semibold text-slate-700 text-xs">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t: any) => (
                <tr key={t.id} className="border-b hover:bg-slate-50">
                  <td className="p-2 text-xs capitalize">{t.transactionType.replace(/_/g, " ")}</td>
                  <td className={`p-2 text-right font-mono font-semibold ${t.quantity < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {t.quantity > 0 ? "+" : ""}{t.quantity}
                  </td>
                  <td className="p-2 text-right text-xs font-mono text-slate-500">{t.balanceBefore ?? "—"}</td>
                  <td className="p-2 text-right text-xs font-mono text-slate-500">{t.balanceAfter ?? "—"}</td>
                  <td className="p-2 text-xs">{t.batch?.batchNumber || "—"}</td>
                  <td className="p-2 text-xs">{t.performedBy ? `${t.performedBy.firstName} ${t.performedBy.lastName}` : "—"}</td>
                  <td className="p-2 text-xs">{formatDate(t.transactionAt, true)}</td>
                  <td className="p-2 text-xs text-slate-500">{t.reason || t.notes || "—"}</td>
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

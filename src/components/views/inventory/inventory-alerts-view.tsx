"use client";

// =====================================================================
// INVENTORY ALERTS VIEW — par-level alerts + expiry tracking + auto-reorder
// =====================================================================
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, TrendingDown, Package, Clock, Loader2,
  ShoppingCart, CheckCircle2, Pill,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, formatDate } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Failed: ${res.status}`);
  return json;
}

export function InventoryAlertsView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [reordering, setReordering] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory-alerts", activeFacilityId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeFacilityId) params.set("facilityId", activeFacilityId);
      return fetchJson(`/api/inventory/alerts?${params}`);
    },
  });

  const summary = data?.summary || {};
  const belowPar: any[] = data?.belowPar || [];
  const critical: any[] = data?.critical || [];
  const expiringSoon: any[] = data?.expiringSoon || [];

  const handleAutoReorder = async () => {
    setReordering(true);
    try {
      const params = new URLSearchParams();
      if (activeFacilityId) params.set("facilityId", activeFacilityId);
      const res = await fetch(`/api/inventory/auto-reorder?${params}`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Generated ${json.summary?.posCreated || 0} purchase order(s) for ${json.summary?.itemsReordered || 0} item(s)`);
        qc.invalidateQueries({ queryKey: ["inventory-alerts"] });
      } else {
        toast.error(json.error || "Failed to generate purchase orders");
      }
    } catch (e: any) {
      toast.error(e.message || "Network error");
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="space-y-4 fade-in-up">
      {/* Page header */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white p-5 shadow-lg relative overflow-hidden">
        <Package className="absolute top-3 right-4 w-16 h-16 text-white/15" strokeWidth={1.5} />
        <h2 className="text-xl font-bold">Inventory Alerts</h2>
        <p className="text-sm text-white/80 mt-1">Par-level alerts, expiry tracking, and auto-reorder.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Below Par Level" value={summary.belowParCount || 0} icon={<TrendingDown className="w-4 h-4" />} color="from-amber-500 to-orange-600" />
        <KpiCard label="Critical (Safety Stock)" value={summary.criticalCount || 0} icon={<AlertTriangle className="w-4 h-4" />} color="from-rose-500 to-red-600" />
        <KpiCard label="Expiring Soon" value={summary.expiringCount || 0} icon={<Clock className="w-4 h-4" />} color="from-violet-500 to-purple-600" />
        <KpiCard label="Total Items Tracked" value={summary.totalItems || 0} icon={<Package className="w-4 h-4" />} color="from-blue-500 to-cyan-600" />
      </div>

      {/* Auto-reorder button */}
      {(belowPar.length > 0 || critical.length > 0) && (
        <div className="flex justify-end">
          <Button
            onClick={handleAutoReorder}
            disabled={reordering}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {reordering ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
            Auto-Generate Purchase Orders
          </Button>
        </div>
      )}

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load inventory alerts" onRetry={() => refetch()} />
      ) : (
        <>
          {/* Critical items (below safety stock) */}
          {critical.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Critical — Below Safety Stock
              </h3>
              <AlertsTable items={critical} severity="critical" />
            </div>
          )}

          {/* Below par level */}
          {belowPar.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4" /> Below Par Level — Reorder Recommended
              </h3>
              <AlertsTable items={belowPar} severity="warning" />
            </div>
          )}

          {/* Expiring soon */}
          {expiringSoon.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-violet-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Expiring Soon (Next 90 Days)
              </h3>
              <ExpiryTable batches={expiringSoon} />
            </div>
          )}

          {/* Empty state */}
          {belowPar.length === 0 && critical.length === 0 && expiringSoon.length === 0 && (
            <Card><CardContent className="p-8">
              <EmptyState
                title="All inventory is healthy"
                description="No items are below par level and no batches are expiring soon."
                icon={CheckCircle2}
              />
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

// =====================================================================
// ALERTS TABLE — items below par / critical
// =====================================================================
function AlertsTable({ items, severity }: { items: any[]; severity: "critical" | "warning" }) {
  const severityColor = severity === "critical" ? "text-rose-700 bg-rose-50" : "text-amber-700 bg-amber-50";
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-xs">
              <tr>
                <th className="text-left p-3 font-medium">Item</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">SKU</th>
                <th className="text-right p-3 font-medium">Current</th>
                <th className="text-right p-3 font-medium hidden sm:table-cell">Reorder At</th>
                <th className="text-right p-3 font-medium hidden md:table-cell">Safety</th>
                <th className="text-right p-3 font-medium">Reorder Qty</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Supplier</th>
                <th className="text-center p-3 font-medium">Stock-Out Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.facilityInventoryId} className="hover:bg-slate-50">
                  <td className="p-3">
                    <div className="text-slate-900 font-medium">{item.itemName}</div>
                    <div className="text-[10px] text-slate-500 capitalize">{item.itemType} {item.category && `• ${item.category}`}</div>
                  </td>
                  <td className="p-3 hidden sm:table-cell font-mono text-xs text-slate-500">{item.sku}</td>
                  <td className={`p-3 text-right font-bold ${item.currentQty <= 0 ? "text-rose-600" : "text-amber-600"}`}>
                    {item.currentQty} <span className="text-[10px] text-slate-400">{item.unit}</span>
                  </td>
                  <td className="p-3 text-right hidden sm:table-cell text-slate-600">{item.reorderLevel}</td>
                  <td className="p-3 text-right hidden md:table-cell text-slate-600">{item.safetyStock}</td>
                  <td className="p-3 text-right font-medium text-emerald-700">{item.reorderQuantity}</td>
                  <td className="p-3 hidden md:table-cell text-slate-600 text-xs">{item.supplierName || "—"}</td>
                  <td className="p-3 text-center">
                    {item.activePrescriptionCount > 0 ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${severityColor}`}>
                        <Pill className="w-3 h-3" />
                        {item.activePrescriptionCount} Rx
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// EXPIRY TABLE — batches expiring soon
// =====================================================================
function ExpiryTable({ batches }: { batches: any[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-xs">
              <tr>
                <th className="text-left p-3 font-medium">Item</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">Batch #</th>
                <th className="text-right p-3 font-medium">Qty</th>
                <th className="text-right p-3 font-medium">Expiry Date</th>
                <th className="text-center p-3 font-medium">Days Left</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {batches.map((batch) => {
                const days = batch.daysUntilExpiry;
                const sevColor = batch.severity === "critical" ? "bg-rose-100 text-rose-700" : batch.severity === "warning" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700";
                return (
                  <tr key={batch.batchId} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="text-slate-900 font-medium">{batch.itemName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{batch.sku}</div>
                    </td>
                    <td className="p-3 hidden sm:table-cell font-mono text-xs text-slate-500">{batch.batchNumber}</td>
                    <td className="p-3 text-right text-slate-700">{batch.quantity} <span className="text-[10px] text-slate-400">{batch.unit}</span></td>
                    <td className="p-3 text-right text-slate-600">{batch.expiryDate ? formatDate(batch.expiryDate) : "—"}</td>
                    <td className="p-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${sevColor}`}>
                        {days !== null ? `${days}d` : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${color} text-white p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white/80">{label}</span>
        <div className="bg-white/20 rounded p-1">{icon}</div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

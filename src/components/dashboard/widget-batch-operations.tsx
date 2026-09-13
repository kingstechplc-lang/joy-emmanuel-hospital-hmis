"use client";

// =====================================================================
// WidgetBatchOperations — Phase 12 Cross-Feature Integration
// =====================================================================
// Dashboard widget that shows pending counts for each batch operation
// (bulk lab results, bulk invoices, batch prescription approval).
// Clicking a count navigates to the relevant module's batch tab.
//
// This widget ties the three Tier 2 features together:
//   Dashboard → Batch Operations → Templates (via consultation)
// =====================================================================

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import {
  FlaskConical, Receipt, Pill, Layers, Loader2, AlertTriangle,
} from "lucide-react";
import { safeJson } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function WidgetBatchOperations({
  stats,
  isLoading,
  config,
}: {
  stats: any;
  isLoading: boolean;
  config: { maxItems?: number };
}) {
  const setView = useAppStore((s) => s.setView);
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const isSuperAdmin = user?.roles?.includes("super_admin");
  const has = (p: string) => isSuperAdmin || perms.includes(p);

  // Fetch batch operations counts
  const { data, isLoading: batchLoading } = useQuery({
    queryKey: ["dashboard-batch-operations"],
    queryFn: () => fetchJson("/api/dashboard/batch-operations"),
    refetchInterval: 60_000,
    refetchOnMount: true,
  });

  const labCount = data?.labResults ?? 0;
  const invoiceCount = data?.bulkInvoices ?? 0;
  const rxCount = data?.pendingPrescriptions ?? 0;
  const totalCount = labCount + invoiceCount + rxCount;

  const items: { label: string; count: number; icon: any; color: string; view: string; perm: string; visible: boolean }[] = [
    {
      label: "Pending Lab Results",
      count: labCount,
      icon: FlaskConical,
      color: "text-cyan-600 bg-cyan-50",
      view: "lab_results",
      perm: "lab_result.bulk_entry",
      visible: has("lab_result.bulk_entry"),
    },
    {
      label: "Eligible for Bulk Invoice",
      count: invoiceCount,
      icon: Receipt,
      color: "text-rose-600 bg-rose-50",
      view: "billing_invoices",
      perm: "invoice.bulk_generate",
      visible: has("invoice.bulk_generate"),
    },
    {
      label: "Pending Prescription Approvals",
      count: rxCount,
      icon: Pill,
      color: "text-pink-600 bg-pink-50",
      view: "prescriptions",
      perm: "prescription.bulk_process",
      visible: has("prescription.bulk_process"),
    },
  ];

  const visibleItems = items.filter((item) => item.visible);

  if (visibleItems.length === 0) return null;

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
          <Layers className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-900">Batch Operations</h3>
          <p className="text-[10px] text-slate-500">Pending items ready for bulk processing</p>
        </div>
        {batchLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
        {totalCount > 0 && !batchLoading && (
          <Badge className="bg-amber-100 text-amber-700 text-[10px] gap-0.5">
            <AlertTriangle className="w-2.5 h-2.5" /> {totalCount} pending
          </Badge>
        )}
      </div>
      <CardContent className="flex-1 p-3 pt-2 space-y-2">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const hasItems = item.count > 0;
          return (
            <button
              key={item.label}
              onClick={() => setView(item.view as any)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition group ${
                hasItems
                  ? "border-slate-200 hover:border-purple-300 hover:bg-purple-50/30"
                  : "border-slate-100 opacity-60"
              }`}
              disabled={!hasItems}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-xs font-medium text-slate-700">{item.label}</p>
                <p className="text-[10px] text-slate-400">
                  {hasItems ? `${item.count} item${item.count !== 1 ? "s" : ""} pending` : "All caught up"}
                </p>
              </div>
              {hasItems && (
                <span className="text-lg font-bold text-slate-800 group-hover:text-purple-600">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

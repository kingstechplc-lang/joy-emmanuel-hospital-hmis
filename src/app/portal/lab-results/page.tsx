"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, FlaskConical, LogOut, ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPortalToken, portalFetchJson, portalLogout } from "@/lib/patient-portal/client";
import { formatDate, EmptyState, LoadingState, ErrorState } from "@/components/ui-helpers";

const STATUS_LABELS: Record<string, string> = {
  ordered: "Ordered",
  collected: "Collected",
  received: "In Progress",
  processing: "Processing",
  resulted: "Results Ready",
  verified: "Verified",
  released: "Released",
  cancelled: "Cancelled",
};

export default function PortalLabResultsPage() {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!getPortalToken()) router.replace("/portal/login");
  }, [router]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-lab-results"],
    queryFn: () => portalFetchJson("/api/portal/lab-results"),
    enabled: !!getPortalToken(),
  });

  const items: any[] = data?.items || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-sky-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/portal/dashboard")}
              className="p-2 -ml-2 rounded-lg hover:bg-slate-100"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700" />
            </button>
            <h1 className="text-lg font-semibold text-slate-900">Lab Results</h1>
          </div>
          <Button onClick={portalLogout} variant="ghost" size="sm" className="text-slate-600">
            <LogOut className="w-4 h-4 mr-1" /> Log Out
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <p className="text-sm text-slate-600 mb-4">
          Results your doctor has reviewed and released to you. If a recent test isn't here, your doctor may still be reviewing it — please check back later.
        </p>

        {isLoading ? (
          <LoadingState rows={3} />
        ) : isError ? (
          <ErrorState message="Failed to load lab results" onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <Card><CardContent className="p-6">
            <EmptyState
              title="No lab results available yet"
              description="Results that your doctor has reviewed and released will appear here."
              icon={FlaskConical}
            />
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {items.map((order: any) => {
              const isExpanded = expanded === order.id;
              const hasItems = (order.items || []).length > 0;
              // Flatten all results across all items for display
              const allResults = (order.items || []).flatMap((item: any) =>
                (item.results || []).map((r: any) => ({ ...r, testName: item.testName }))
              );
              return (
                <Card key={order.id} className="overflow-hidden">
                  <button
                    onClick={() => hasItems && setExpanded(isExpanded ? null : order.id)}
                    className="w-full text-left p-4 hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <FlaskConical className="w-4 h-4 text-purple-600" />
                          <p className="font-medium text-slate-900">
                            Lab Order {order.orderNumber}
                          </p>
                          <StatusPill status={order.status} />
                        </div>
                        <p className="text-xs text-slate-500">
                          Ordered {formatDate(order.orderedAt, true)}
                          {order.orderingClinician && ` by Dr. ${order.orderingClinician.firstName} ${order.orderingClinician.lastName}`}
                          {" • "}
                          Released to you {formatDate(order.releasedToPatientAt, true)}
                        </p>
                        {hasItems && (
                          <p className="text-xs text-slate-500 mt-1">
                            {order.items.length} test{order.items.length === 1 ? "" : "s"}
                            {allResults.length > 0 && ` • ${allResults.length} result${allResults.length === 1 ? "" : "s"}`}
                            {" — "}
                            {isExpanded ? "tap to collapse" : "tap to view"}
                          </p>
                        )}
                      </div>
                      {hasItems && (
                        isExpanded
                          ? <ChevronDown className="w-5 h-5 text-slate-400" />
                          : <ChevronRight className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </button>
                  {isExpanded && hasItems && allResults.length > 0 && (
                    <div className="border-t bg-slate-50">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100 text-slate-600 text-xs">
                            <tr>
                              <th className="text-left p-3 font-medium">Test</th>
                              <th className="text-left p-3 font-medium">Result</th>
                              <th className="text-left p-3 font-medium">Flag</th>
                              <th className="text-left p-3 font-medium">Reference Range</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {allResults.map((result: any, i: number) => {
                              const isCritical = result.criticalFlag;
                              const isAbnormal = result.abnormalFlag && result.abnormalFlag !== "normal";
                              return (
                                <tr
                                  key={result.id || i}
                                  className={
                                    isCritical ? "bg-rose-50" :
                                    isAbnormal ? "bg-amber-50" : "bg-white"
                                  }
                                >
                                  <td className="p-3 text-slate-900">{result.testName}</td>
                                  <td className="p-3 font-medium text-slate-900">
                                    {result.resultValue ? (
                                      <>{result.resultValue} {result.unit && <span className="text-slate-500 text-xs">{result.unit}</span>}</>
                                    ) : result.numericValue != null ? (
                                      <>{result.numericValue} {result.unit && <span className="text-slate-500 text-xs">{result.unit}</span>}</>
                                    ) : (
                                      <span className="text-slate-400 italic">Pending</span>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    {isCritical ? (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-rose-600 text-white">
                                        CRITICAL
                                      </span>
                                    ) : isAbnormal ? (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-200 text-amber-800 uppercase">
                                        {result.abnormalFlag.replace(/_/g, " ")}
                                      </span>
                                    ) : result.resultValue || result.numericValue != null ? (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                        Normal
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="p-3 text-slate-500 text-xs">
                                    {result.referenceRange || "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {(() => {
                        const hasCritical = allResults.some((r: any) => r.criticalFlag);
                        const hasAbnormal = allResults.some((r: any) =>
                          r.abnormalFlag && r.abnormalFlag !== "normal" && !r.criticalFlag
                        );
                        if (!hasCritical && !hasAbnormal) return null;
                        return (
                          <div className={`p-3 text-xs ${hasCritical ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>
                            {hasCritical && (
                              <p className="font-semibold mb-1">
                                ⚠ One or more results are CRITICAL. Please contact your doctor as soon as possible.
                              </p>
                            )}
                            {hasAbnormal && !hasCritical && (
                              <p>
                                Some results are outside the normal range. This may not always indicate a problem — your doctor will explain what these mean for you.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {isExpanded && hasItems && allResults.length === 0 && (
                    <div className="border-t bg-slate-50 p-4 text-center text-sm text-slate-500">
                      Results pending — the lab is still processing this order.
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = STATUS_LABELS[status] || status;
  const colors: Record<string, string> = {
    resulted: "bg-amber-100 text-amber-700",
    verified: "bg-blue-100 text-blue-700",
    released: "bg-emerald-100 text-emerald-700",
  };
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{label}</span>;
}

"use client";

// =====================================================================
// PATIENT PORTAL — Invoices page
// =====================================================================
// Lists visible invoices + shows outstanding balance summary. Patient
// can see invoice totals, status, paid amounts. v1 does NOT include
// online payment — patients must visit the hospital cashier to pay.
// =====================================================================
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Receipt, LogOut, ArrowLeft, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPortalToken, portalFetchJson, portalLogout } from "@/lib/patient-portal/client";
import { formatDate, formatCurrency, EmptyState, LoadingState, ErrorState } from "@/components/ui-helpers";

export default function PortalInvoicesPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"unpaid" | "paid" | "all">("all");

  useEffect(() => {
    if (!getPortalToken()) router.replace("/portal/login");
  }, [router]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-invoices", filter],
    queryFn: () => portalFetchJson(`/api/portal/invoices?status=${filter}`),
    enabled: !!getPortalToken(),
  });

  const items: any[] = data?.items || [];
  const totalOutstanding: number = data?.totalOutstanding || 0;

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
            <h1 className="text-lg font-semibold text-slate-900">Invoices</h1>
          </div>
          <Button onClick={portalLogout} variant="ghost" size="sm" className="text-slate-600">
            <LogOut className="w-4 h-4 mr-1" /> Log Out
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Outstanding balance banner */}
        {totalOutstanding > 0 && (
          <Card className="mb-4 bg-gradient-to-r from-amber-500 to-orange-500 border-0">
            <CardContent className="p-4 text-white flex items-center gap-3">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-white/80">Outstanding Balance</p>
                <p className="text-2xl font-bold">{formatCurrency(totalOutstanding)}</p>
              </div>
              <p className="text-xs text-white/80 max-w-[50%]">
                Please visit the hospital cashier to make a payment. Online payment will be added in a future version.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4 bg-white p-1 rounded-lg border border-slate-200 w-full max-w-xs">
          <FilterTab label="All" value="all" current={filter} onClick={setFilter} />
          <FilterTab label="Unpaid" value="unpaid" current={filter} onClick={setFilter} />
          <FilterTab label="Paid" value="paid" current={filter} onClick={setFilter} />
        </div>

        {isLoading ? (
          <LoadingState rows={3} />
        ) : isError ? (
          <ErrorState message="Failed to load invoices" onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <Card><CardContent className="p-6">
            <EmptyState
              title={filter === "unpaid" ? "No outstanding invoices" : "No invoices found"}
              description={
                filter === "unpaid"
                  ? "You're all caught up — no outstanding balances."
                  : "Try a different filter."
              }
              icon={Receipt}
            />
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {items.map((inv: any) => (
              <Card key={inv.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-semibold text-slate-900">
                          {inv.invoiceNumber}
                        </p>
                        <StatusPill status={inv.status} />
                      </div>
                      <p className="text-xs text-slate-500">
                        Issued {formatDate(inv.createdAt, true)}
                      </p>
                      {inv.facility && (
                        <p className="text-xs text-slate-500">{inv.facility.name}</p>
                      )}
                      <p className="text-xs text-slate-500 capitalize">
                        Type: {inv.invoiceType?.replace(/_/g, " ") || "patient"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Total</p>
                      <p className="font-semibold text-slate-900">
                        {formatCurrency(inv.total)}
                      </p>
                      {inv.balance > 0 && (
                        <div className="mt-1">
                          <p className="text-[10px] text-slate-500">Balance</p>
                          <p className="text-sm font-medium text-rose-600">
                            {formatCurrency(inv.balance)}
                          </p>
                        </div>
                      )}
                      {inv.balance === 0 && (
                        <p className="text-[10px] text-emerald-600 font-medium mt-1">
                          ✓ Paid in full
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="mt-6 bg-slate-50 border-dashed">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500">
              To make a payment, please visit the hospital cashier with your invoice number. Online payment integration is planned for a future release.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function FilterTab({
  label, value, current, onClick,
}: { label: string; value: "unpaid" | "paid" | "all"; current: string; onClick: (v: any) => void; }) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`flex-1 py-1.5 px-2 text-xs font-medium rounded transition-colors ${
        active ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    issued: "bg-blue-100 text-blue-700",
    partially_paid: "bg-amber-100 text-amber-700",
    paid: "bg-emerald-100 text-emerald-700",
    overdue: "bg-rose-100 text-rose-700",
    cancelled: "bg-slate-100 text-slate-600",
    refunded: "bg-violet-100 text-violet-700",
  };
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

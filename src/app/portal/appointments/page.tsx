"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, LogOut, ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPortalToken, portalFetchJson, portalLogout } from "@/lib/patient-portal/client";
import { formatDate, EmptyState, LoadingState, ErrorState } from "@/components/ui-helpers";

export default function PortalAppointmentsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");

  useEffect(() => {
    if (!getPortalToken()) router.replace("/portal/login");
  }, [router]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-appointments", filter],
    queryFn: () => portalFetchJson(`/api/portal/appointments?status=${filter}`),
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
            <h1 className="text-lg font-semibold text-slate-900">Appointments</h1>
          </div>
          <Button onClick={portalLogout} variant="ghost" size="sm" className="text-slate-600">
            <LogOut className="w-4 h-4 mr-1" /> Log Out
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Filter tabs */}
        <div className="flex gap-2 mb-4 bg-white p-1 rounded-lg border border-slate-200 w-full max-w-xs">
          <FilterTab label="Upcoming" value="upcoming" current={filter} onClick={setFilter} />
          <FilterTab label="Past" value="past" current={filter} onClick={setFilter} />
          <FilterTab label="All" value="all" current={filter} onClick={setFilter} />
        </div>

        {isLoading ? (
          <LoadingState rows={3} />
        ) : isError ? (
          <ErrorState message="Failed to load appointments" onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <Card><CardContent className="p-6">
            <EmptyState
              title={filter === "upcoming" ? "No upcoming appointments" : "No appointments found"}
              description={filter === "upcoming"
                ? "To book an appointment, please call the hospital front desk."
                : "Try a different filter."}
              icon={Calendar}
            />
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {items.map((apt: any) => (
              <Card key={apt.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Date block */}
                    <div className="text-center min-w-[64px]">
                      <div className="bg-teal-50 rounded-lg p-2">
                        <p className="text-xs text-teal-700 font-semibold uppercase">
                          {new Date(apt.scheduledStart).toLocaleDateString("en", { month: "short" })}
                        </p>
                        <p className="text-2xl font-bold text-teal-800">
                          {new Date(apt.scheduledStart).getDate()}
                        </p>
                        <p className="text-[10px] text-teal-600">
                          {new Date(apt.scheduledStart).getFullYear()}
                        </p>
                      </div>
                    </div>
                    {/* Details */}
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-slate-900 capitalize">
                          {apt.appointmentType?.replace(/_/g, " ") || "Appointment"}
                        </p>
                        <StatusPill status={apt.status} />
                      </div>
                      <p className="text-sm text-slate-700">
                        {formatDate(apt.scheduledStart, true)}
                      </p>
                      {apt.department && (
                        <p className="text-xs text-slate-500">{apt.department.name}</p>
                      )}
                      {apt.facility && (
                        <p className="text-xs text-slate-500">{apt.facility.name}</p>
                      )}
                      {apt.reason && (
                        <p className="text-xs text-slate-600 mt-2 italic">
                          Reason: {apt.reason}
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
              Need to book or cancel an appointment? Please call the hospital front desk. Online booking will be added in a future version.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function FilterTab({
  label, value, current, onClick,
}: { label: string; value: "upcoming" | "past" | "all"; current: string; onClick: (v: any) => void; }) {
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
    scheduled: "bg-emerald-100 text-emerald-700",
    confirmed: "bg-blue-100 text-blue-700",
    checked_in: "bg-cyan-100 text-cyan-700",
    in_progress: "bg-indigo-100 text-indigo-700",
    completed: "bg-blue-100 text-blue-700",
    cancelled: "bg-rose-100 text-rose-700",
    no_show: "bg-amber-100 text-amber-700",
  };
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

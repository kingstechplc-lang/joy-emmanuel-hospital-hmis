"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Stethoscope, Users, Clock, Activity, UserPlus, ClipboardCheck,
  ListOrdered, Calendar, FlaskConical, Pill, ArrowRight, UserCheck,
} from "lucide-react";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, safeJson, PageHeader, MiniStatCard} from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function OPDView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setView = useAppStore((s) => s.setView);
  const selectPatient = useAppStore((s) => s.selectPatient);

  const f = activeFacilityId ? `?facilityId=${activeFacilityId}` : "";

  // Fetch today's OPD encounters
  const { data: encountersData, isLoading, isError, refetch } = useQuery({
    queryKey: ["opd-encounters", activeFacilityId],
    queryFn: () => fetchJson(`/api/encounters${f}&type=opd&limit=30`),
    refetchInterval: 30000,
  });

  // Fetch queue data
  const { data: queueData } = useQuery({
    queryKey: ["opd-queue", activeFacilityId],
    queryFn: () => fetchJson(`/api/queue${f}`),
    refetchInterval: 15000,
  });

  const encounters = encountersData?.items || [];
  const todayOpdCount = encounters.length;
  const waitingCount = encounters.filter((e: any) => e.status === "open" || e.status === "in_progress").length;
  const completedCount = encounters.filter((e: any) => e.status === "completed").length;

  const queueEntries = (queueData?.items || []).flatMap((q: any) => q.entries || []).filter((e: any) => e.status === "waiting" || e.status === "called");

  return (
    <div className="space-y-6 fade-in-up">
      {/* Header — gradient banner */}
      <PageHeader
        title="Outpatient Department (OPD)"
        description="Manage today's OPD flow — from check-in to consultation to discharge"
        icon={Stethoscope}
        gradient="from-emerald-500 to-teal-600"
        actions={
          <>
            <Button onClick={() => setView("records_desk")} size="sm" className="bg-white/20 border border-white/30 text-white hover:bg-white/30">
              <ClipboardCheck className="w-4 h-4 mr-1" /> Check-in Patient
            </Button>
            <Button onClick={() => setView("patient_new")} size="sm" className="bg-white/20 border border-white/30 text-white hover:bg-white/30">
              <UserPlus className="w-4 h-4 mr-1" /> Register New
            </Button>
          </>
        }
      />

      {/* OPD Flow Stats — colorful gradient cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard label="Waiting / In Progress" value={waitingCount} icon={Clock} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Completed Today" value={completedCount} icon={UserCheck} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Total OPD Today" value={todayOpdCount} icon={Activity} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="In Queue" value={queueEntries.length} icon={ListOrdered} gradient="from-purple-500 to-purple-600" />
      </div>

      {/* OPD Workflow Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">OPD Workflow</CardTitle>
          <CardDescription>Follow the standard outpatient care pathway</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { step: "1. Check-in", desc: "Verify patient & NHIS", view: "records_desk", icon: ClipboardCheck, color: "emerald" },
              { step: "2. Triage", desc: "Vitals & assessment", view: "triage", icon: Activity, color: "blue" },
              { step: "3. Queue", desc: "Wait for doctor", view: "queue", icon: ListOrdered, color: "amber" },
              { step: "4. Consultation", desc: "Doctor examines", view: "consultations", icon: Stethoscope, color: "purple" },
              { step: "5. Lab/Pharmacy", desc: "Tests & meds", view: "lab_orders", icon: FlaskConical, color: "pink" },
              { step: "6. Billing", desc: "Pay & discharge", view: "billing_invoices", icon: Pill, color: "rose" },
            ].map((s) => {
              const Icon = s.icon;
              const colorMap: Record<string, string> = {
                emerald: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
                blue: "bg-blue-50 text-blue-600 hover:bg-blue-100",
                amber: "bg-amber-50 text-amber-600 hover:bg-amber-100",
                purple: "bg-purple-50 text-purple-600 hover:bg-purple-100",
                pink: "bg-pink-50 text-pink-600 hover:bg-pink-100",
                rose: "bg-rose-50 text-rose-600 hover:bg-rose-100",
              };
              return (
                <button
                  key={s.step}
                  onClick={() => setView(s.view as any)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-emerald-300 transition group"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${colorMap[s.color]}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 text-center">{s.step}</span>
                  <span className="text-[10px] text-slate-500 text-center">{s.desc}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Two-column: Today's Patients + Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's OPD Patients */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Today's OPD Patients</CardTitle>
              <CardDescription>Patients seen in OPD today</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setView("encounters")} className="gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingState rows={4} />
            ) : isError ? (
              <ErrorState message="Failed to load" onRetry={() => refetch()} />
            ) : encounters.length === 0 ? (
              <EmptyState title="No OPD patients today" description="Check in patients from the Records Desk." icon={Users} />
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {encounters.slice(0, 15).map((e: any) => (
                  <div
                    key={e.id}
                    onClick={() => { selectPatient(e.patientId); setView("patient_360"); }}
                    className="flex items-center justify-between p-2 rounded border border-slate-100 hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-xs flex items-center justify-center shrink-0">
                        {e.patient?.firstName?.[0]}{e.patient?.lastName?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{e.patient?.firstName} {e.patient?.lastName}</p>
                        <p className="text-xs text-slate-500">{e.encounterNumber} • {formatDate(e.startAt, true)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={e.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Queue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Current Queue</CardTitle>
              <CardDescription>Patients waiting for consultation</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setView("queue")} className="gap-1">
              Manage <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent>
            {queueEntries.length === 0 ? (
              <EmptyState title="Queue is empty" description="No patients waiting." icon={ListOrdered} />
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {queueEntries.slice(0, 15).map((entry: any) => (
                  <div key={entry.id} className="flex items-center justify-between p-2 rounded border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        entry.priority === "emergency" ? "bg-rose-100 text-rose-700" :
                        entry.priority === "urgent" ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        {entry.queueNumber}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{entry.patient?.firstName} {entry.patient?.lastName}</p>
                        <p className="text-xs text-slate-500">{entry.patient?.patientNumber}</p>
                      </div>
                    </div>
                    <StatusBadge status={entry.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";
// =====================================================================
// TRAINING DASHBOARD — Real-time training statistics
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GraduationCap, BookOpen, CalendarDays, Award, AlertTriangle, Users,
  Clock, CheckCircle2, XCircle, TrendingUp, Settings, ShieldCheck,
} from "lucide-react";
import { fetchJson, formatDate, formatTime, ColoredBadge, SESSION_STATUSES } from "./training-helpers";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui-helpers";

export function TrainingDashboard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["training-dashboard"],
    queryFn: () => fetchJson(`/api/training-dashboard`),
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (isError) return <ErrorState message="Failed to load dashboard data" onRetry={() => refetch()} />;

  const stats = data?.stats || {};
  const upcomingSessions = data?.upcomingSessions || [];
  const recentRecords = data?.recentTrainingRecords || [];

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" /> TRAINING STATISTICS
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Total Programs" value={stats.totalPrograms ?? 0} icon={BookOpen} color="from-blue-500 to-blue-600" />
          <StatCard label="Active Programs" value={stats.activePrograms ?? 0} icon={CheckCircle2} color="from-emerald-500 to-emerald-600" />
          <StatCard label="Mandatory" value={stats.mandatoryPrograms ?? 0} icon={ShieldCheck} color="from-rose-500 to-rose-600" />
          <StatCard label="Upcoming Sessions" value={stats.upcomingSessions ?? 0} icon={CalendarDays} color="from-cyan-500 to-cyan-600" />
          <StatCard label="Completed Sessions" value={stats.completedSessions ?? 0} icon={CheckCircle2} color="from-emerald-500 to-emerald-600" />
          <StatCard label="Cancelled" value={stats.cancelledSessions ?? 0} icon={XCircle} color="from-slate-500 to-slate-600" />
          <StatCard label="Total Enrollments" value={stats.totalEnrollments ?? 0} icon={Users} color="from-purple-500 to-purple-600" />
          <StatCard label="Completed" value={stats.completedEnrollments ?? 0} icon={CheckCircle2} color="from-emerald-500 to-emerald-600" />
          <StatCard label="Pending" value={stats.pendingEnrollments ?? 0} icon={Clock} color="from-amber-500 to-amber-600" />
          <StatCard label="Certificates" value={stats.totalCertificates ?? 0} icon={Award} color="from-fuchsia-500 to-fuchsia-600" />
          <StatCard label="Expiring Soon" value={stats.expiringCertificates ?? 0} icon={AlertTriangle} color="from-amber-500 to-amber-600" alert={stats.expiringCertificates > 0} />
          <StatCard label="Expired" value={stats.expiredCertificates ?? 0} icon={XCircle} color="from-rose-500 to-rose-600" alert={stats.expiredCertificates > 0} />
        </div>
      </div>

      {/* Compliance + Provider/Trainer counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Mandatory Compliance</div>
            <div className="text-lg font-bold text-emerald-700">{stats.complianceRate ?? 0}%</div>
            <div className="text-xs text-slate-500">{stats.mandatoryCompliance ?? 0} / {stats.totalMandatoryEnrollments ?? 0} completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Training Providers</div>
            <div className="text-lg font-bold text-slate-900">{stats.totalProviders ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Trainers</div>
            <div className="text-lg font-bold text-slate-900">{stats.totalTrainers ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">CPD Records</div>
            <div className="text-lg font-bold text-slate-900">{stats.totalCPDRecords ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Sessions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-cyan-600" /> UPCOMING SESSIONS ({upcomingSessions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {upcomingSessions.length === 0 ? (
            <EmptyState title="No upcoming sessions" description="Schedule training sessions to see them here." icon={CalendarDays} />
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {upcomingSessions.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">{s.program?.title || "—"}</div>
                    <div className="text-xs text-slate-500">
                      {formatDate(s.sessionDate)} • {formatTime(s.startTime)} → {formatTime(s.endTime)}
                      {s.facility && ` • ${s.facility.name}`}
                      {s.trainer && ` • ${s.trainer.name}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-600">{s._count?.enrollments || 0} enrolled</div>
                    <ColoredBadge status={s.status} list={SESSION_STATUSES} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Training Records (legacy) */}
      {recentRecords.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600" /> RECENT TRAINING RECORDS ({recentRecords.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-60 overflow-y-auto space-y-1">
              {recentRecords.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                  <div>
                    <span className="font-medium">{r.staff?.firstName} {r.staff?.lastName}</span>
                    <span className="text-slate-500 ml-2">— {r.trainingName}</span>
                  </div>
                  <div className="text-xs text-slate-500">{formatDate(r.trainingDate)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, alert }: { label: string; value: string | number; icon: any; color: string; alert?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${color} text-white p-3 shadow-sm ${alert ? "ring-2 ring-rose-300 ring-offset-1" : ""}`}>
      <div className="absolute top-1 right-1 text-white/20">
        <Icon className="w-8 h-8" strokeWidth={1.5} />
      </div>
      <div className="relative">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-white/80 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

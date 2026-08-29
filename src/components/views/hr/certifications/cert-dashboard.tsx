"use client";
// =====================================================================
// CERTIFICATION DASHBOARD — Real-time certification statistics
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, Award, AlertTriangle, XCircle, Clock, FileCheck,
  Ban, CheckCircle2, TrendingUp, Building2,
} from "lucide-react";
import { fetchJson, formatDate, daysUntil, ColoredBadge, CERT_STATUSES } from "./cert-helpers";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui-helpers";

export function CertDashboard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["certification-dashboard"],
    queryFn: () => fetchJson(`/api/certification-dashboard`),
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (isError) return <ErrorState message="Failed to load dashboard" onRetry={() => refetch()} />;

  const stats = data?.stats || {};
  const recentCerts = data?.recentCerts || [];
  const expiringSoon = data?.expiringSoon || [];
  const expiredList = data?.expiredList || [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-orange-600" /> CERTIFICATION STATISTICS
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Total" value={stats.totalCerts ?? 0} icon={Award} color="from-blue-500 to-blue-600" />
          <StatCard label="Active" value={stats.activeCerts ?? 0} icon={CheckCircle2} color="from-emerald-500 to-emerald-600" />
          <StatCard label="Expiring (90d)" value={stats.expiring90 ?? 0} icon={Clock} color="from-amber-500 to-amber-600" alert={stats.expiring90 > 0} />
          <StatCard label="Expired" value={stats.expired ?? 0} icon={XCircle} color="from-rose-500 to-rose-600" alert={stats.expired > 0} />
          <StatCard label="Pending Verification" value={stats.pendingVerification ?? 0} icon={FileCheck} color="from-cyan-500 to-cyan-600" alert={stats.pendingVerification > 0} />
          <StatCard label="Pending Approval" value={stats.pendingApproval ?? 0} icon={Clock} color="from-purple-500 to-purple-600" />
          <StatCard label="Suspended" value={stats.suspended ?? 0} icon={Ban} color="from-orange-500 to-orange-600" />
          <StatCard label="Revoked" value={stats.revoked ?? 0} icon={XCircle} color="from-slate-500 to-slate-600" />
        </div>
      </div>

      {/* Compliance */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Mandatory Compliance</div>
            <div className="text-lg font-bold text-emerald-700">{stats.complianceRate ?? 0}%</div>
            <div className="text-xs text-slate-500">{stats.mandatoryActive ?? 0} / {stats.mandatoryCerts ?? 0} active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Expiring in 30 days</div>
            <div className="text-lg font-bold text-amber-700">{stats.expiring30 ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Expiring in 60 days</div>
            <div className="text-lg font-bold text-amber-700">{stats.expiring60 ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Expiring in 90 days</div>
            <div className="text-lg font-bold text-amber-700">{stats.expiring90 ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Expiring Soon */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> EXPIRING SOON (90 days) — {expiringSoon.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {expiringSoon.length === 0 ? (
            <EmptyState title="No certifications expiring soon" icon={CheckCircle2} />
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {expiringSoon.map((c: any) => {
                const days = daysUntil(c.expiryDate);
                return (
                  <div key={c.id} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg border border-amber-100">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 truncate">{c.staff?.firstName} {c.staff?.lastName}</div>
                      <div className="text-xs text-slate-500">{c.certificationName} • {formatDate(c.expiryDate)}</div>
                    </div>
                    <Badge className={days !== null && days <= 30 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}>
                      {days !== null ? `${days} days` : "—"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Already Expired */}
      {expiredList.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-600" /> ALREADY EXPIRED — {expiredList.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-64 overflow-y-auto space-y-2">
              {expiredList.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-2 bg-rose-50 rounded-lg border border-rose-100">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">{c.staff?.firstName} {c.staff?.lastName}</div>
                    <div className="text-xs text-slate-500">{c.certificationName} • Expired: {formatDate(c.expiryDate)}</div>
                  </div>
                  <ColoredBadge status="expired" list={CERT_STATUSES} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Award className="w-4 h-4 text-blue-600" /> RECENT CERTIFICATIONS — {recentCerts.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recentCerts.length === 0 ? (
            <EmptyState title="No certifications yet" icon={Award} />
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {recentCerts.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">{c.staff?.firstName} {c.staff?.lastName}</div>
                    <div className="text-xs text-slate-500">{c.certificationName} • {c.certificateNumber || "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">{formatDate(c.issueDate)}</div>
                    <ColoredBadge status={c.status} list={CERT_STATUSES} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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

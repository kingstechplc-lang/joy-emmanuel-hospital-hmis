"use client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Shield, Users, Lock, AlertTriangle, ScrollText, FileWarning, KeyRound, Eye } from "lucide-react";
import { EmptyState, LoadingState, ErrorState, formatDate, formatRelative } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export function SecurityView() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["security-dashboard"],
    queryFn: () => fetchJson("/api/security"),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (isError || !data) return <ErrorState message="Failed to load security dashboard" onRetry={() => refetch()} />;

  const stats = data.stats || {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Shield className="w-6 h-6 text-emerald-600" />
          Security Dashboard
        </h2>
        <p className="text-sm text-slate-500">Monitor user sessions, failed logins, locked accounts, and sensitive access events.</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users className="w-5 h-5" />} label="Total Users" value={stats.totalUsers || 0} color="emerald" />
        <StatCard icon={<Users className="w-5 h-5" />} label="Active Users" value={stats.activeUsers || 0} color="emerald" />
        <StatCard icon={<Lock className="w-5 h-5" />} label="Locked Users" value={stats.lockedUsers || 0} color="rose" />
        <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Break-Glass (7d)" value={stats.breakGlassThisWeek || 0} color="amber" />
      </div>

      {/* Recent sessions */}
      <SectionCard
        title="Recent Active Sessions"
        description="Users who logged in within the last 24 hours"
        icon={<Users className="w-4 h-4" />}
        empty={!data.recentSessions || data.recentSessions.length === 0}
        emptyTitle="No recent sessions"
      >
        {data.recentSessions?.slice(0, 8).map((u: any) => (
          <div key={u.id} className="flex items-center justify-between p-2 border-b last:border-b-0 hover:bg-slate-50">
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">{u.firstName?.[0]}{u.lastName?.[0]}</AvatarFallback>
              </Avatar>
              <div>
                <div className="text-sm font-medium text-slate-900">{u.firstName} {u.lastName}</div>
                <div className="text-xs text-slate-500">@{u.username}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-700">{formatRelative(u.lastLoginAt)}</div>
              <div className="text-xs text-slate-500">{u.userRoles?.map((r: any) => r.role?.code).join(", ") || "—"}</div>
            </div>
          </div>
        ))}
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Failed login attempts */}
        <SectionCard
          title="Failed Login Attempts"
          description="Users with one or more failed login attempts"
          icon={<AlertTriangle className="w-4 h-4" />}
          empty={!data.failedAttempts || data.failedAttempts.length === 0}
          emptyTitle="No failed login attempts"
        >
          {data.failedAttempts?.map((u: any) => (
            <div key={u.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
              <div>
                <div className="text-sm font-medium text-slate-900">{u.firstName} {u.lastName}</div>
                <div className="text-xs text-slate-500">@{u.username}</div>
              </div>
              <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
                {u.failedLoginAttempts} attempts
              </Badge>
            </div>
          ))}
        </SectionCard>

        {/* Locked accounts */}
        <SectionCard
          title="Locked Accounts"
          description="Accounts temporarily locked due to repeated failed logins"
          icon={<Lock className="w-4 h-4" />}
          empty={!data.lockedAccounts || data.lockedAccounts.length === 0}
          emptyTitle="No locked accounts"
        >
          {data.lockedAccounts?.map((u: any) => (
            <div key={u.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
              <div>
                <div className="text-sm font-medium text-slate-900">{u.firstName} {u.lastName}</div>
                <div className="text-xs text-slate-500">@{u.username}</div>
              </div>
              <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50">
                Locked until {formatDate(u.lockedUntil, true)}
              </Badge>
            </div>
          ))}
        </SectionCard>
      </div>

      {/* Break-glass events */}
      <SectionCard
        title="Recent Break-Glass Events"
        description="Emergency access to restricted patient records"
        icon={<AlertTriangle className="w-4 h-4" />}
        empty={!data.recentBreakGlass || data.recentBreakGlass.length === 0}
        emptyTitle="No break-glass events"
      >
        {data.recentBreakGlass?.slice(0, 8).map((b: any) => (
          <div key={b.id} className="flex items-start justify-between p-3 border-b last:border-b-0">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50">BREAK-GLASS</Badge>
                <span className="text-sm font-medium text-slate-900">
                  {b.user?.firstName} {b.user?.lastName}
                </span>
                <span className="text-xs text-slate-500">accessed</span>
                <span className="text-sm font-medium text-emerald-700">
                  {b.patient?.firstName} {b.patient?.lastName}
                </span>
              </div>
              {b.reason && <div className="text-xs text-slate-600 mt-1"><span className="font-medium">Reason:</span> {b.reason}</div>}
              {b.facility && <div className="text-xs text-slate-500 mt-0.5">at {b.facility.name}</div>}
            </div>
            <div className="text-xs text-slate-500 whitespace-nowrap">{formatRelative(b.startedAt)}</div>
          </div>
        ))}
      </SectionCard>

      {/* Sensitive patient access logs */}
      <SectionCard
        title="Sensitive Patient Access Logs"
        description="Recent access to patient records"
        icon={<Eye className="w-4 h-4" />}
        empty={!data.recentPatientAccess || data.recentPatientAccess.length === 0}
        emptyTitle="No recent patient access logs"
      >
        {data.recentPatientAccess?.slice(0, 10).map((a: any) => (
          <div key={a.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 capitalize">{a.accessType}</Badge>
              <div>
                <div className="text-sm text-slate-900">
                  <span className="font-medium">{a.user?.firstName} {a.user?.lastName}</span>
                  <span className="text-slate-500 mx-1">→</span>
                  <span className="text-emerald-700">{a.patient?.firstName} {a.patient?.lastName}</span>
                </div>
                {a.reason && <div className="text-xs text-slate-500">{a.reason}</div>}
              </div>
            </div>
            <div className="text-xs text-slate-500">{formatRelative(a.accessedAt)}</div>
          </div>
        ))}
      </SectionCard>

      {/* Permission changes */}
      <SectionCard
        title="Permission Changes"
        description="Recent role and permission modifications"
        icon={<KeyRound className="w-4 h-4" />}
        empty={!data.permissionChanges || data.permissionChanges.length === 0}
        emptyTitle="No recent permission changes"
      >
        {data.permissionChanges?.slice(0, 10).map((l: any) => (
          <div key={l.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50"><code>{l.action}</code></Badge>
              <div>
                <div className="text-sm text-slate-900">
                  {l.user ? `${l.user.firstName} ${l.user.lastName}` : "System"}
                </div>
                {l.resourceType && <div className="text-xs text-slate-500">{l.resourceType}: {l.resourceId}</div>}
              </div>
            </div>
            <div className="text-xs text-slate-500">{formatRelative(l.createdAt)}</div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: any; label: string; value: number; color: "emerald" | "rose" | "amber" }) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${colorMap[color]}`}>
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
          <div className="text-xs text-slate-500">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, description, icon, children, empty, emptyTitle }: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  empty?: boolean;
  emptyTitle?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {empty ? (
          <EmptyState title={emptyTitle || "No data"} description="" />
        ) : (
          <div className="max-h-80 overflow-y-auto">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

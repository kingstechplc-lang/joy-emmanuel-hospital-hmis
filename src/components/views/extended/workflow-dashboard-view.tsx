"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Filter, BellRing, AlertCircle, Activity, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatRelative, formatDate, safeJson, PageHeader, MiniStatCard } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

// Map notification types to readable labels + colors
const TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  lab_order_created: { label: "Lab Order", color: "bg-blue-50 text-blue-700 border-blue-200", icon: "🧪" },
  lab_sample_collected: { label: "Sample Collected", color: "bg-cyan-50 text-cyan-700 border-cyan-200", icon: "🧪" },
  lab_result_entered: { label: "Result Entered", color: "bg-purple-50 text-purple-700 border-purple-200", icon: "🧪" },
  lab_result_verified: { label: "Result Verified", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "🧪" },
  lab_result_released: { label: "Result Released", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "🧪" },
  lab_order_cancelled: { label: "Lab Cancelled", color: "bg-rose-50 text-rose-700 border-rose-200", icon: "🧪" },
  prescription_created: { label: "New Prescription", color: "bg-blue-50 text-blue-700 border-blue-200", icon: "💊" },
  prescription_dispensed: { label: "Dispensed", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "💊" },
  prescription_partially_dispensed: { label: "Partially Dispensed", color: "bg-amber-50 text-amber-700 border-amber-200", icon: "💊" },
  imaging_order_created: { label: "Imaging Request", color: "bg-blue-50 text-blue-700 border-blue-200", icon: "📷" },
  imaging_performed: { label: "Imaging Performed", color: "bg-cyan-50 text-cyan-700 border-cyan-200", icon: "📷" },
  imaging_reported: { label: "Imaging Reported", color: "bg-purple-50 text-purple-700 border-purple-200", icon: "📷" },
  imaging_verified: { label: "Imaging Verified", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "📷" },
  admission_created: { label: "New Admission", color: "bg-blue-50 text-blue-700 border-blue-200", icon: "🛏️" },
  admission_discharged: { label: "Discharged", color: "bg-slate-50 text-slate-700 border-slate-200", icon: "📤" },
  discharge_initiated: { label: "Discharge Initiated", color: "bg-amber-50 text-amber-700 border-amber-200", icon: "📤" },
  referral_made: { label: "Referral", color: "bg-purple-50 text-purple-700 border-purple-200", icon: "🔄" },
  theatre_case_scheduled: { label: "Theatre Case", color: "bg-blue-50 text-blue-700 border-blue-200", icon: "🔪" },
  theatre_case_started: { label: "Surgery Started", color: "bg-amber-50 text-amber-700 border-amber-200", icon: "🔪" },
  theatre_case_completed: { label: "Surgery Completed", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "🔪" },
  critical_care_admitted: { label: "ICU Admission", color: "bg-rose-50 text-rose-700 border-rose-200", icon: "🚨" },
  blood_unit_reserved: { label: "Blood Unit", color: "bg-rose-50 text-rose-700 border-rose-200", icon: "🩸" },
  blood_unit_issued: { label: "Blood Issued", color: "bg-rose-50 text-rose-700 border-rose-200", icon: "🩸" },
  blood_transfusion_started: { label: "Transfusion Started", color: "bg-rose-50 text-rose-700 border-rose-200", icon: "🩸" },
  blood_transfusion_completed: { label: "Transfusion Done", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "🩸" },
  mortuary_admission: { label: "Mortuary", color: "bg-slate-50 text-slate-700 border-slate-200", icon: "🪦" },
  service_request_created: { label: "Service Request", color: "bg-teal-50 text-teal-700 border-teal-200", icon: "📋" },
  service_request_assigned: { label: "Service Assigned", color: "bg-cyan-50 text-cyan-700 border-cyan-200", icon: "📋" },
  service_request_completed: { label: "Service Done", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "📋" },
  patient_feedback_received: { label: "Patient Feedback", color: "bg-blue-50 text-blue-700 border-blue-200", icon: "💬" },
  patient_feedback_resolved: { label: "Feedback Resolved", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "💬" },
  quality_indicator_breach: { label: "Quality Indicator", color: "bg-amber-50 text-amber-700 border-amber-200", icon: "📊" },
  risk_register_updated: { label: "Risk / Legal / Audit", color: "bg-amber-50 text-amber-700 border-amber-200", icon: "⚠️" },
  it_ticket_created: { label: "IT Ticket", color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: "💻" },
  it_ticket_resolved: { label: "IT Resolved", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "💻" },
  home_care_visit_scheduled: { label: "Home Care", color: "bg-amber-50 text-amber-700 border-amber-200", icon: "🏠" },
  community_outreach_scheduled: { label: "Community Outreach", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "🌍" },
};

export function WorkflowDashboardView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const qc = useQueryClient();

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (filter === "unread") params.set("unreadOnly", "true");
  if (typeFilter !== "all") params.set("type", typeFilter);
  params.set("limit", "100");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["workflow-notifications", params.toString()],
    queryFn: () => fetchJson(`/api/notifications?${params.toString()}`),
    refetchInterval: 30000, // refresh every 30s
    staleTime: 0,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAllRead" }),
      });
      if (!res.ok) throw new Error("Failed");
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("All notifications marked as read");
      qc.invalidateQueries({ queryKey: ["workflow-notifications"] });
    },
  });

  const markOneReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/notifications/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed");
      return safeJson(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-notifications"] });
    },
  });

  const notifications: any[] = data?.notifications || [];
  const summary = data?.summary;

  const filteredNotifications = notifications.filter((n) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        n.title?.toLowerCase().includes(q) ||
        n.message?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Get sorted list of types present in user's notifications
  const typeOptions = summary?.byType
    ? Object.entries(summary.byType)
        .filter(([t]) => TYPE_LABELS[t])
        .sort((a, b) => b[1].unread - a[1].unread)
    : [];

  return (
    <div className="space-y-4">
      {/* Header — gradient banner */}
      <PageHeader
        title="Workflow & Notifications"
        description="Hospital-wide notifications — when one department acts, related departments get notified. Auto-refreshes every 30 seconds."
        icon={BellRing}
        gradient="from-rose-500 to-red-600"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Data refreshed", error: "Failed" }); }} disabled={isFetching} className="bg-white/90 border-0 text-slate-700 hover:bg-white">
              <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            {summary && summary.unread > 0 && (
              <Button
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="bg-white/20 border border-white/30 text-white hover:bg-white/30"
              >
                <CheckCheck className="w-4 h-4 mr-1" /> Mark All Read ({summary.unread})
              </Button>
            )}
          </>
        }
      />

      {/* Stats — colorful gradient mini cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStatCard label="Total" value={summary?.total || 0} icon={Bell} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Unread" value={summary?.unread || 0} icon={BellRing} gradient="from-rose-500 to-red-600" />
        <MiniStatCard label="Lab Results" value={(summary?.byType?.lab_order_created?.unread || 0) + (summary?.byType?.lab_result_released?.unread || 0)} icon={Activity} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="Prescriptions" value={summary?.byType?.prescription_created?.unread || 0} icon={Bell} gradient="from-purple-500 to-purple-600" />
        <MiniStatCard label="Critical / ICU" value={(summary?.byType?.critical_care_admitted?.unread || 0) + (summary?.byType?.theatre_case_scheduled?.unread || 0)} icon={AlertCircle} gradient="from-amber-500 to-orange-600" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <div className="flex gap-1 border rounded-md p-0.5">
            <Button
              variant={filter === "all" ? "default" : "ghost"}
              size="sm"
              className="h-7"
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            <Button
              variant={filter === "unread" ? "default" : "ghost"}
              size="sm"
              className="h-7"
              onClick={() => setFilter("unread")}
            >
              Unread Only
            </Button>
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 px-3 border rounded-md text-sm bg-background"
          >
            <option value="all">All Types</option>
            {typeOptions.map(([t, counts]) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]?.icon} {TYPE_LABELS[t]?.label || t} ({counts.unread} unread)
              </option>
            ))}
          </select>
          <Input
            placeholder="Search notifications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardContent>
      </Card>

      {/* Notification List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4" /> Notifications ({filteredNotifications.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState rows={5} />
          ) : isError ? (
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          ) : filteredNotifications.length === 0 ? (
            <EmptyState
              title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
              description={
                filter === "unread"
                  ? "You're all caught up! New hospital workflow events will appear here."
                  : "When clinical or operational events happen across the hospital (lab orders, prescriptions, admissions, etc.), notifications will appear here."
              }
              icon={Bell}
            />
          ) : (
            <div className="space-y-2">
              {filteredNotifications.map((n) => {
                const typeInfo = TYPE_LABELS[n.type] || { label: n.type || "Notification", color: "bg-slate-50 text-slate-700 border-slate-200", icon: "🔔" };
                return (
                  <div
                    key={n.id}
                    className={`border rounded-xl p-3 sm:p-4 transition-all hover:shadow-md card-hover-lift ${
                      n.readAt ? "bg-white border-slate-200" : "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap mb-1">
                          <span className="text-xl sm:text-2xl shrink-0">{typeInfo.icon}</span>
                          <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-md border font-semibold ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                          {!n.readAt && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 uppercase shrink-0">
                              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> New
                            </span>
                          )}
                          <span className="text-[10px] sm:text-xs text-slate-400">{formatRelative(n.createdAt)}</span>
                        </div>
                        <div className="mt-1">
                          <p className={`text-xs sm:text-sm ${n.readAt ? "text-slate-700" : "font-bold text-slate-900"} break-words`}>
                            {n.title}
                          </p>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words">{n.message}</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {!n.readAt && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => markOneReadMutation.mutate(n.id)}
                          >
                            <CheckCheck className="w-3 h-3 mr-1" /> Mark Read
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workflow Examples Info Card */}
      <Card className="bg-slate-50">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-emerald-600" /> How Hospital Workflow Notifications Work
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700">
            <div className="space-y-1">
              <p className="font-semibold">🧪 Laboratory Workflow</p>
              <p className="text-slate-600">
                Doctor orders test → Lab notified → Sample collected → Result entered →
                Result verified → Result released → Doctor notified
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold">💊 Pharmacy Workflow</p>
              <p className="text-slate-600">
                Doctor prescribes → Pharmacy notified → Dispensed → Doctor &amp; patient notified
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold">📷 Radiology Workflow</p>
              <p className="text-slate-600">
                Doctor orders imaging → Radiology notified → Performed → Reported →
                Verified → Doctor notified
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold">🛏️ Admission / Discharge</p>
              <p className="text-slate-600">
                Admission created → Ward staff notified → Discharge initiated →
                Billing &amp; Records notified
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold">🔄 Referrals</p>
              <p className="text-slate-600">
                Referral made → Receiving department/facility notified →
                Accepted → Referred doctor notified
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold">🔪 Theatre &amp; ICU</p>
              <p className="text-slate-600">
                Theatre case scheduled → Theatre staff notified → Started →
                Completed → Recovery &amp; ward notified
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

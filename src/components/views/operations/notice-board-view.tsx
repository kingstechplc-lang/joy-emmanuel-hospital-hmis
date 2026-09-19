"use client";

// =====================================================================
// LIVE NOTICE BOARD — main view (Operations → Live Notice Board)
// =====================================================================
// Real-time notice communication system for facility/org-wide
// announcements. Distinct from the per-user workflow Notification model.
//
// Features:
//   - Beautiful animated gradient header
//   - KPI summary strip (total active, unread, pending ack, critical)
//   - Pinned notices slot (top)
//   - Active notices list with rich filtering + search + pagination
//   - Notice card with priority-based visual treatment (CRITICAL =
//     red banner + icon, HIGH = orange, NORMAL = violet, LOW = slate)
//   - Detail dialog with full body, targeting, ack/pin/cancel actions
//   - Create/edit dialog with targeting builder (Facility / Department /
//     Role / User / Organization scope selectors), scheduling, expiry,
//     acknowledgement requirement, pin
//   - Acknowledgement summary dialog for managers
//   - Real-time: polls /api/notices every 15s + counts endpoint every 15s
//   - Offline: uses isOnline() from existing src/lib/offline.ts; shows
//     amber banner when offline, pauses polling when tab hidden
// =====================================================================
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Bell, Plus, RefreshCw, Loader2, AlertTriangle, CheckCircle2, XCircle,
  Pin, PinOff, Ban, Eye, Clock, Star, Building2, Network, Users, User as UserIcon,
  ShieldAlert, Info, FileText, Wrench, Stethoscope, Cpu, Lock, Calendar,
  ChevronRight, Search, Filter, X, Megaphone, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, safeJson, Pagination,
} from "@/components/ui-helpers";
import { isOnline } from "@/lib/offline";

// ─── Fetch helper ─────────────────────────────────────────────
async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const json = await safeJson(res);
  if (!res.ok) {
    throw new Error(json?.error || `Request failed with status ${res.status}`);
  }
  return json;
}

// ─── Constants ───────────────────────────────────────────────
const NOTICE_TYPES = [
  { value: "GENERAL", label: "General", icon: Info, gradient: "from-slate-500 to-slate-700" },
  { value: "IMPORTANT", label: "Important", icon: Megaphone, gradient: "from-blue-500 to-blue-700" },
  { value: "URGENT", label: "Urgent", icon: AlertTriangle, gradient: "from-orange-500 to-red-700" },
  { value: "EMERGENCY", label: "Emergency", icon: ShieldAlert, gradient: "from-red-600 to-rose-800" },
  { value: "MAINTENANCE", label: "Maintenance", icon: Wrench, gradient: "from-amber-500 to-orange-700" },
  { value: "CLINICAL", label: "Clinical", icon: Stethoscope, gradient: "from-emerald-500 to-teal-700" },
  { value: "ADMINISTRATIVE", label: "Administrative", icon: FileText, gradient: "from-indigo-500 to-blue-700" },
  { value: "IT", label: "IT", icon: Cpu, gradient: "from-violet-500 to-purple-700" },
  { value: "SECURITY", label: "Security", icon: Lock, gradient: "from-slate-700 to-slate-900" },
  { value: "STAFF", label: "Staff", icon: Users, gradient: "from-cyan-500 to-blue-700" },
  { value: "EVENT", label: "Event", icon: Calendar, gradient: "from-fuchsia-500 to-pink-700" },
  { value: "POLICY", label: "Policy", icon: ShieldAlert, gradient: "from-rose-500 to-red-700" },
];

const PRIORITIES = [
  { value: "LOW", label: "Low", color: "text-slate-600 bg-slate-100 border-slate-200", dot: "bg-slate-400" },
  { value: "NORMAL", label: "Normal", color: "text-violet-700 bg-violet-50 border-violet-200", dot: "bg-violet-500" },
  { value: "HIGH", label: "High", color: "text-orange-700 bg-orange-50 border-orange-200", dot: "bg-orange-500" },
  { value: "CRITICAL", label: "Critical", color: "text-rose-700 bg-rose-50 border-rose-200", dot: "bg-rose-500" },
];

const STATUS_OPTIONS = [
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Draft" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CANCELLED", label: "Cancelled" },
];

const VISIBILITY_SCOPES = [
  { value: "FACILITY", label: "Facility-wide", icon: Building2 },
  { value: "DEPARTMENT", label: "Department", icon: Network },
  { value: "ROLE", label: "Role-based", icon: Users },
  { value: "USER", label: "Specific users", icon: UserIcon },
  { value: "ORGANIZATION", label: "Organization-wide", icon: Building2 },
];

const TYPE_MAP = Object.fromEntries(NOTICE_TYPES.map(t => [t.value, t]));
const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map(p => [p.value, p]));

// ─── Helpers ───────────────────────────────────────────────
function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// =====================================================================
// MAIN VIEW
// =====================================================================
export function NoticeBoardView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canManage = user?.roles?.includes("super_admin") || perms.includes("notice.create");
  const canPin = user?.roles?.includes("super_admin") || perms.includes("notice.pin");
  const canPublish = user?.roles?.includes("super_admin") || perms.includes("notice.publish");
  const canCancel = user?.roles?.includes("super_admin") || perms.includes("notice.cancel");
  const canViewAcks = user?.roles?.includes("super_admin") || perms.includes("notice.acknowledgement.view");
  const canViewHistory = user?.roles?.includes("super_admin") || perms.includes("notice.history.view");

  const qc = useQueryClient();
  const queryKey = ["notices", "list"];
  const countsKey = ["notices", "counts"];

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("PUBLISHED");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pendingAckOnly, setPendingAckOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [online, setOnline] = useState(isOnline());

  // Dialogs
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [formDialog, setFormDialog] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [ackDialog, setAckDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);

  // Build query string
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    status: statusFilter,
  });
  if (priorityFilter !== "all") qs.set("priority", priorityFilter);
  if (typeFilter !== "all") qs.set("noticeType", typeFilter);
  if (unreadOnly) qs.set("unreadOnly", "true");
  if (pendingAckOnly) qs.set("pendingAckOnly", "true");
  if (search.trim()) qs.set("search", search.trim());

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [...queryKey, qs.toString()],
    queryFn: () => fetchJson(`/api/notices?${qs.toString()}`),
    refetchInterval: online ? 15_000 : false,           // realtime polling, paused when offline
    refetchIntervalInBackground: false,                  // pause when tab hidden
  });

  // Counts for KPI strip + global indicator
  const { data: counts } = useQuery({
    queryKey: countsKey,
    queryFn: () => fetchJson("/api/notices/counts"),
    refetchInterval: online ? 15_000 : false,
    refetchIntervalInBackground: false,
  });

  // Listen for online/offline
  useEffect(() => {
    const handler = () => setOnline(isOnline());
    window.addEventListener("online", handler);
    window.addEventListener("offline", handler);
    return () => {
      window.removeEventListener("online", handler);
      window.removeEventListener("offline", handler);
    };
  }, []);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notices"] });
  };

  // ── Mutations ──
  const publishMut = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/notices/${id}/publish`, { method: "POST" }),
    onSuccess: () => { toast.success("Notice published"); invalidate(); setDetailDialog({ open: false, id: null }); },
    onError: (e: any) => toast.error(e?.message || "Failed to publish"),
  });
  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      fetchJson(`/api/notices/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => { toast.success("Notice cancelled"); invalidate(); setCancelTarget(null); setDetailDialog({ open: false, id: null }); },
    onError: (e: any) => toast.error(e?.message || "Failed to cancel"),
  });
  const pinMut = useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      fetchJson(`/api/notices/${id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned }),
      }),
    onSuccess: () => { invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Failed to toggle pin"),
  });
  const ackMut = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/notices/${id}/acknowledge`, { method: "POST" }),
    onSuccess: () => { toast.success("Acknowledged"); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Failed to acknowledge"),
  });
  const readMut = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/notices/${id}/read`, { method: "POST" }),
    onError: () => {/* silent — read tracking is non-critical */},
  });

  const items = (data?.items || []) as any[];
  const pinned = items.filter((n: any) => n.isPinned && n.status === "PUBLISHED");
  const nonPinned = items.filter((n: any) => !(n.isPinned && n.status === "PUBLISHED"));

  return (
    <div className="space-y-4 sm:space-y-5 fade-in-up">
      {/* ───────────────────────────────────────────────────────
          ANIMATED GRADIENT HEADER
      ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 via-purple-700 to-fuchsia-700 text-white p-4 sm:p-6 shadow-xl sm:shadow-2xl relative overflow-hidden">
        <div className="ai-desktop-blur absolute top-0 right-0 w-64 h-64 bg-white opacity-10 blur-3xl rounded-full pointer-events-none ai-float-slow" />
        <div className="ai-desktop-blur absolute bottom-0 left-1/3 w-48 h-48 bg-fuchsia-300 opacity-20 blur-3xl rounded-full pointer-events-none ai-float-slower" />
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="ai-shimmer-bg absolute inset-0 pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 sm:gap-4 mb-3">
            <div className="relative shrink-0">
              <div
                className="hidden sm:block absolute inset-0 rounded-xl bg-gradient-to-tr from-white/40 via-transparent to-white/30 ai-spin-slow"
                style={{ animationDuration: "4s" }}
              />
              <div className="relative w-11 h-11 sm:w-12 sm:h-12 bg-white/15 backdrop-blur rounded-xl ring-1 ring-white/30 shadow-lg flex items-center justify-center">
                <Megaphone className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">Live Notice Board</h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-white/15 ring-1 ring-white/30 rounded-full px-2 py-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  Live
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/80 mt-0.5">
                Facility-wide announcements · targeted to your scope
              </p>
            </div>
            {canManage && (
              <Button
                size="sm"
                onClick={() => setFormDialog({ open: true, editing: null })}
                className="bg-white text-violet-700 hover:bg-white/90 gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> New Notice
              </Button>
            )}
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-3">
            <KpiChip label="Active" value={counts?.totalActive ?? 0} icon={Bell} />
            <KpiChip label="Unread" value={counts?.unread ?? 0} icon={Eye} accent="amber" />
            <KpiChip label="Pending Ack" value={counts?.pendingAck ?? 0} icon={CheckCircle2} accent="orange" />
            <KpiChip label="Critical" value={counts?.critical ?? 0} icon={ShieldAlert} accent="rose" />
          </div>
        </div>
      </div>

      {/* Offline banner */}
      {!online && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 ai-enter-up">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>You are offline. Live notices may not be up to date. Reconnect to refresh.</span>
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search title or body..."
            className="pl-8 h-9 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 text-xs w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PUBLISHED">Published</SelectItem>
            <SelectItem value="DRAFT">Drafts</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 text-xs w-[120px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="NORMAL">Normal</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 text-xs w-[120px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {NOTICE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          size="sm" variant={unreadOnly ? "default" : "outline"}
          className="h-9 text-xs"
          onClick={() => { setUnreadOnly(s => !s); setPage(1); }}
        >
          <Eye className="w-3.5 h-3.5" /> Unread
        </Button>
        <Button
          size="sm" variant={pendingAckOnly ? "default" : "outline"}
          className="h-9 text-xs"
          onClick={() => { setPendingAckOnly(s => !s); setPage(1); }}
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Pending ack
        </Button>
        <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load notices" onRetry={() => refetch()} />
      ) : !data ? null : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No notices to show"
              description={
                unreadOnly || pendingAckOnly
                  ? "No notices match your current filters. Try clearing the unread / pending-ack filters."
                  : canManage
                  ? "Create the first facility notice — click 'New Notice' above."
                  : "When your facility posts notices, they will appear here."
              }
              icon={Megaphone}
              action={canManage ? (
                <Button size="sm" onClick={() => setFormDialog({ open: true, editing: null })} className="bg-violet-600 hover:bg-violet-700">
                  <Plus className="w-3.5 h-3.5" /> New Notice
                </Button>
              ) : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Pinned notices */}
          {pinned.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700">
                <Pin className="w-3.5 h-3.5" /> Pinned ({pinned.length})
              </div>
              <div className="space-y-2">
                {pinned.map((n: any) => (
                  <NoticeCard
                    key={n.id}
                    notice={n}
                    canPin={canPin}
                    canCancel={canCancel}
                    canPublish={canPublish}
                    canViewAcks={canViewAcks}
                    isOwner={(n.createdBy?.id === user?.id)}
                    onOpen={(id) => { readMut.mutate(id); setDetailDialog({ open: true, id }); }}
                    onAck={(id) => ackMut.mutate(id)}
                    onPin={(id, p) => pinMut.mutate({ id, isPinned: p })}
                    onCancel={(n) => setCancelTarget(n)}
                    onShowAcks={(id) => setAckDialog({ open: true, id })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Non-pinned notices */}
          {nonPinned.length > 0 && (
            <div className="space-y-2">
              {pinned.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  All notices ({nonPinned.length})
                </div>
              )}
              <div className="space-y-2">
                {nonPinned.map((n: any) => (
                  <NoticeCard
                    key={n.id}
                    notice={n}
                    canPin={canPin}
                    canCancel={canCancel}
                    canPublish={canPublish}
                    canViewAcks={canViewAcks}
                    isOwner={(n.createdBy?.id === user?.id)}
                    onOpen={(id) => { readMut.mutate(id); setDetailDialog({ open: true, id }); }}
                    onAck={(id) => ackMut.mutate(id)}
                    onPin={(id, p) => pinMut.mutate({ id, isPinned: p })}
                    onCancel={(n) => setCancelTarget(n)}
                    onShowAcks={(id) => setAckDialog({ open: true, id })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pagination */}
          {data.totalPages > 1 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              totalPages={data.totalPages}
              totalItems={data.total}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          )}
        </>
      )}

      {/* Detail dialog */}
      {detailDialog.open && detailDialog.id && (
        <NoticeDetailDialog
          id={detailDialog.id}
          canPin={canPin}
          canCancel={canCancel}
          canPublish={canPublish}
          canViewAcks={canViewAcks}
          canViewHistory={canViewHistory}
          canEdit={canManage}
          onClose={() => setDetailDialog({ open: false, id: null })}
          onAck={(id) => ackMut.mutate(id)}
          onPin={(id, p) => pinMut.mutate({ id, isPinned: p })}
          onCancel={(n) => setCancelTarget(n)}
          onPublish={(id) => publishMut.mutate(id)}
          onEdit={(n) => { setDetailDialog({ open: false, id: null }); setFormDialog({ open: true, editing: n }); }}
          onShowAcks={(id) => { setDetailDialog({ open: false, id: null }); setAckDialog({ open: true, id }); }}
          invalidate={invalidate}
        />
      )}

      {/* Create/Edit dialog */}
      {formDialog.open && (
        <NoticeFormDialog
          editing={formDialog.editing}
          canPin={canPin}
          onClose={() => setFormDialog({ open: false, editing: null })}
          onSaved={() => { invalidate(); setFormDialog({ open: false, editing: null }); }}
        />
      )}

      {/* Acknowledgement summary dialog */}
      {ackDialog.open && ackDialog.id && (
        <AcknowledgementDialog
          id={ackDialog.id}
          onClose={() => setAckDialog({ open: false, id: null })}
        />
      )}

      {/* Cancel confirmation */}
      {cancelTarget && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setCancelTarget(null)}
          title="Cancel Notice"
          description="This will mark the notice as CANCELLED — it will immediately stop being visible to staff. The record is preserved for audit. This action cannot be undone (you would need to create a new notice to re-publish)."
          details={
            <div className="space-y-1 text-xs">
              <div><span className="text-slate-500">Title:</span> <span className="font-semibold">{cancelTarget.title}</span></div>
              <div><span className="text-slate-500">Status:</span> <Badge variant="outline" className="ml-1">{cancelTarget.status}</Badge></div>
            </div>
          }
          variant="destructive"
          confirmText="Cancel Notice"
          onConfirm={async () => {
            await cancelMut.mutateAsync({ id: cancelTarget.id });
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// KPI chip (used in the header strip)
// =====================================================================
function KpiChip({ label, value, icon: Icon, accent = "violet" }: {
  label: string;
  value: number;
  icon: LucideIcon;
  accent?: "violet" | "amber" | "orange" | "rose";
}) {
  const accentBg = accent === "amber" ? "bg-amber-500/20 text-amber-100 ring-amber-300/30"
    : accent === "orange" ? "bg-orange-500/20 text-orange-100 ring-orange-300/30"
    : accent === "rose" ? "bg-rose-500/20 text-rose-100 ring-rose-300/30"
    : "bg-white/15 text-white ring-white/30";
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/10 backdrop-blur px-2.5 py-1.5 ring-1 ring-white/20">
      <div className={`w-7 h-7 rounded-md flex items-center justify-center ring-1 ${accentBg}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-white/70 leading-tight">{label}</div>
        <div className="text-base font-bold leading-tight tabular-nums">{value}</div>
      </div>
    </div>
  );
}

// =====================================================================
// NOTICE CARD
// =====================================================================
function NoticeCard({
  notice, canPin, canCancel, canPublish, canViewAcks, isOwner,
  onOpen, onAck, onPin, onCancel, onShowAcks,
}: {
  notice: any;
  canPin: boolean;
  canCancel: boolean;
  canPublish: boolean;
  canViewAcks: boolean;
  isOwner: boolean;
  onOpen: (id: string) => void;
  onAck: (id: string) => void;
  onPin: (id: string, isPinned: boolean) => void;
  onCancel: (n: any) => void;
  onShowAcks: (id: string) => void;
}) {
  const typeMeta = TYPE_MAP[notice.noticeType] || TYPE_MAP.GENERAL;
  const priorityMeta = PRIORITY_MAP[notice.priority] || PRIORITY_MAP.NORMAL;
  const isCritical = notice.priority === "CRITICAL";
  const isUrgent = notice.priority === "HIGH" || isCritical;
  const isExpired = notice.status === "EXPIRED";
  const isCancelled = notice.status === "CANCELLED";

  return (
    <Card
      className={`
        relative overflow-hidden transition-all duration-300 hover:shadow-md cursor-pointer ai-enter-up
        ${isCritical ? "border-rose-300 ring-1 ring-rose-200" : ""}
        ${isUrgent && !isCritical ? "border-orange-200" : ""}
        ${!isUrgent ? "border-slate-200" : ""}
        ${isExpired || isCancelled ? "opacity-60" : ""}
      `}
      onClick={() => onOpen(notice.id)}
    >
      {/* Left accent strip — priority-colored */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${typeMeta.gradient}`} />

      <CardContent className="p-3 sm:p-4 pl-4 sm:pl-5">
        <div className="flex items-start gap-3">
          {/* Type icon chip */}
          <div className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br ${typeMeta.gradient} text-white flex items-center justify-center shadow-sm`}>
            <typeMeta.icon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  {/* Unread dot */}
                  {!notice.isRead && notice.status === "PUBLISHED" && (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-violet-500" title="Unread" />
                  )}
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug truncate">
                    {notice.title}
                  </h3>
                  {notice.isPinned && (
                    <Badge variant="outline" className="shrink-0 text-[9px] bg-amber-50 text-amber-700 border-amber-200 py-0">
                      <Pin className="w-2.5 h-2.5 mr-0.5" /> Pinned
                    </Badge>
                  )}
                </div>
                {/* Meta row */}
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 flex-wrap">
                  <Badge variant="outline" className={`text-[9px] py-0 ${priorityMeta.color}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${priorityMeta.dot}`} />
                    {priorityMeta.label}
                  </Badge>
                  <span className="text-slate-400">·</span>
                  <span className="truncate">{typeMeta.label}</span>
                  <span className="text-slate-400">·</span>
                  <span className="truncate">
                    {notice.createdBy ? `${notice.createdBy.firstName} ${notice.createdBy.lastName}`.trim() : "—"}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="truncate">{timeAgo(notice.publishedAt || notice.createdAt)}</span>
                  {notice.facility && (
                    <>
                      <span className="text-slate-400">·</span>
                      <span className="truncate flex items-center gap-0.5">
                        <Building2 className="w-2.5 h-2.5" /> {notice.facility.name}
                      </span>
                    </>
                  )}
                  {notice.department && (
                    <>
                      <span className="text-slate-400">·</span>
                      <span className="truncate flex items-center gap-0.5">
                        <Network className="w-2.5 h-2.5" /> {notice.department.name}
                      </span>
                    </>
                  )}
                  {notice.expiresAt && (
                    <>
                      <span className="text-slate-400">·</span>
                      <span className="truncate flex items-center gap-0.5 text-amber-700">
                        <Clock className="w-2.5 h-2.5" /> expires {timeAgo(notice.expiresAt)}
                      </span>
                    </>
                  )}
                </div>
                {/* Body preview */}
                <p className="text-xs sm:text-sm text-slate-700 mt-1.5 line-clamp-2">
                  {notice.body}
                </p>
              </div>

              {/* Quick actions */}
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {notice.requiresAcknowledgement && !notice.isAcknowledged && notice.status === "PUBLISHED" && (
                  <Button
                    size="sm" variant="default"
                    className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => onAck(notice.id)}
                  >
                    <CheckCircle2 className="w-3 h-3" /> Ack
                  </Button>
                )}
                {notice.requiresAcknowledgement && notice.isAcknowledged && (
                  <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                    <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Acked
                  </Badge>
                )}
                {canViewAcks && notice.requiresAcknowledgement && (
                  <Button
                    size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                    onClick={() => onShowAcks(notice.id)}
                    title="View acknowledgement summary"
                  >
                    <Users className="w-3 h-3" />
                  </Button>
                )}
                {canPin && notice.status === "PUBLISHED" && (
                  <Button
                    size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                    onClick={() => onPin(notice.id, !notice.isPinned)}
                    title={notice.isPinned ? "Unpin" : "Pin"}
                  >
                    {notice.isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                  </Button>
                )}
                {canCancel && (notice.status === "PUBLISHED" || notice.status === "SCHEDULED") && (isOwner || canCancel) && (
                  <Button
                    size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-rose-600 hover:bg-rose-50"
                    onClick={() => onCancel(notice)}
                    title="Cancel notice"
                  >
                    <Ban className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Critical / Urgent banner */}
        {isCritical && notice.status === "PUBLISHED" && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
            <ShieldAlert className="w-3 h-3" />
            Critical — requires immediate attention
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// NOTICE DETAIL DIALOG
// =====================================================================
function NoticeDetailDialog({
  id, canPin, canCancel, canPublish, canViewAcks, canViewHistory, canEdit,
  onClose, onAck, onPin, onCancel, onPublish, onEdit, onShowAcks, invalidate,
}: {
  id: string;
  canPin: boolean;
  canCancel: boolean;
  canPublish: boolean;
  canViewAcks: boolean;
  canViewHistory: boolean;
  canEdit: boolean;
  onClose: () => void;
  onAck: (id: string) => void;
  onPin: (id: string, isPinned: boolean) => void;
  onCancel: (n: any) => void;
  onPublish: (id: string) => void;
  onEdit: (n: any) => void;
  onShowAcks: (id: string) => void;
  invalidate: () => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notice", id],
    queryFn: () => fetchJson(`/api/notices/${id}`),
    refetchInterval: 30_000, // refresh ack/read state
  });

  if (isLoading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  if (isError || !data?.item) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="p-6">
          <ErrorState message="Failed to load notice" onRetry={() => refetch()} />
        </DialogContent>
      </Dialog>
    );
  }

  const n = data.item;
  const typeMeta = TYPE_MAP[n.noticeType] || TYPE_MAP.GENERAL;
  const priorityMeta = PRIORITY_MAP[n.priority] || PRIORITY_MAP.NORMAL;
  const isCritical = n.priority === "CRITICAL";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="large">
        {/* Gradient header */}
        <DialogHeader className={`px-5 sm:px-6 pt-5 pb-4 shrink-0 border-b bg-gradient-to-r ${typeMeta.gradient} text-white relative overflow-hidden`}>
          <div className="ai-shimmer-bg absolute inset-0 pointer-events-none" />
          <div className="relative flex items-start gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/15 ring-1 ring-white/30 flex items-center justify-center shrink-0">
              <typeMeta.icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge variant="outline" className={`text-[10px] py-0 ${priorityMeta.color} border-0`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${priorityMeta.dot}`} />
                  {priorityMeta.label}
                </Badge>
                <span className="text-[10px] uppercase tracking-wider text-white/80">{typeMeta.label}</span>
                {n.isPinned && (
                  <Badge variant="outline" className="text-[10px] py-0 bg-amber-500/20 text-amber-100 border-amber-300/30">
                    <Pin className="w-2.5 h-2.5 mr-0.5" /> Pinned
                  </Badge>
                )}
                {n.status !== "PUBLISHED" && (
                  <Badge variant="outline" className="text-[10px] py-0 bg-white/15 text-white border-white/30">
                    {n.status}
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-white text-base sm:text-lg font-bold leading-tight">
                {n.title}
              </DialogTitle>
              <DialogDescription className="text-white/80 text-xs mt-1">
                by {n.createdBy ? `${n.createdBy.firstName} ${n.createdBy.lastName}`.trim() : "—"} · {formatDate(n.publishedAt || n.createdAt)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-5 sm:p-6 space-y-4">
          {/* Body */}
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 block">Message</Label>
            <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed rounded-lg bg-slate-50 p-3 border border-slate-100">
              {n.body}
            </div>
          </div>

          {/* Targeting */}
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 block">Target audience</Label>
            <div className="flex flex-wrap gap-1.5">
              {(n.targets || []).map((t: any, i: number) => (
                <Badge key={i} variant="outline" className="text-[10px] py-0.5 bg-violet-50 text-violet-700 border-violet-200">
                  {t.targetType === "ORGANIZATION" && <Building2 className="w-2.5 h-2.5 mr-0.5" />}
                  {t.targetType === "FACILITY" && <Building2 className="w-2.5 h-2.5 mr-0.5" />}
                  {t.targetType === "DEPARTMENT" && <Network className="w-2.5 h-2.5 mr-0.5" />}
                  {t.targetType === "ROLE" && <Users className="w-2.5 h-2.5 mr-0.5" />}
                  {t.targetType === "USER" && <UserIcon className="w-2.5 h-2.5 mr-0.5" />}
                  {t.targetType}: {t.targetId === "*" ? "all" : t.targetId}
                </Badge>
              ))}
              {(!n.targets || n.targets.length === 0) && (
                <span className="text-xs text-slate-400">No targeting rows (orphan notice — please report)</span>
              )}
            </div>
          </div>

          {/* Schedule + expiry */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Meta label="Publish at" value={formatDate(n.publishAt)} />
            <Meta label="Published" value={formatDate(n.publishedAt)} />
            <Meta label="Expires at" value={formatDate(n.expiresAt)} />
            <Meta label="Cancelled" value={formatDate(n.cancelledAt)} />
          </div>

          {/* Acknowledgement status */}
          {n.requiresAcknowledgement && (
            <div className={`rounded-lg p-3 border ${n.isAcknowledged ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
              <div className="flex items-center gap-2">
                {n.isAcknowledged ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                )}
                <span className={`text-sm font-semibold ${n.isAcknowledged ? "text-emerald-800" : "text-amber-800"}`}>
                  {n.isAcknowledged
                    ? `Acknowledged at ${formatDate(n.acknowledgedAt)}`
                    : "Acknowledgement required — click below to confirm you've read and understood this notice."}
                </span>
              </div>
            </div>
          )}

          {/* PHI warning for clinical notices */}
          {(n.noticeType === "CLINICAL" || n.noticeType === "EMERGENCY") && (
            <div className="rounded-lg p-2.5 bg-rose-50 border border-rose-200 text-[11px] text-rose-800 flex items-start gap-2">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>This is a communication notice — do NOT include patient-identifiable information. For clinical documentation, use the EHR.</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <DialogFooter className="p-4 sm:p-5 shrink-0 border-t bg-slate-50/50 flex-wrap gap-2">
          <div className="flex-1" />
          {n.requiresAcknowledgement && !n.isAcknowledged && n.status === "PUBLISHED" && (
            <Button onClick={() => { onAck(n.id); }} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Acknowledge
            </Button>
          )}
          {canViewAcks && n.requiresAcknowledgement && (
            <Button variant="outline" onClick={() => onShowAcks(n.id)} className="gap-1.5">
              <Users className="w-4 h-4" /> View Acknowledgements
            </Button>
          )}
          {canEdit && (n.createdById === n.createdBy?.id || canPublish) && n.status !== "PUBLISHED" && (
            <Button variant="outline" onClick={() => onEdit(n)} className="gap-1.5">
              <FileText className="w-4 h-4" /> Edit
            </Button>
          )}
          {canPublish && n.status === "DRAFT" && (
            <Button variant="default" onClick={() => onPublish(n.id)} className="gap-1.5 bg-violet-600 hover:bg-violet-700">
              <Megaphone className="w-4 h-4" /> Publish Now
            </Button>
          )}
          {canPin && n.status === "PUBLISHED" && (
            <Button variant="outline" onClick={() => onPin(n.id, !n.isPinned)} className="gap-1.5">
              {n.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              {n.isPinned ? "Unpin" : "Pin"}
            </Button>
          )}
          {canCancel && (n.status === "PUBLISHED" || n.status === "SCHEDULED") && (
            <Button variant="outline" onClick={() => onCancel(n)} className="gap-1.5 text-rose-700 hover:bg-rose-50 hover:text-rose-800">
              <Ban className="w-4 h-4" /> Cancel
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wide text-slate-500">{label}</Label>
      <div className="text-xs text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}

// =====================================================================
// NOTICE FORM DIALOG (create / edit)
// =====================================================================
function NoticeFormDialog({
  editing, canPin, onClose, onSaved,
}: {
  editing: any | null;
  canPin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const { activeFacilityId } = useAppStore();

  const [form, setForm] = useState({
    title: editing?.title || "",
    body: editing?.body || "",
    noticeType: editing?.noticeType || "GENERAL",
    priority: editing?.priority || "NORMAL",
    visibilityScope: editing?.visibilityScope || "FACILITY",
    facilityId: editing?.facilityId || activeFacilityId || "",
    departmentId: editing?.departmentId || "",
    publishAt: editing?.publishAt ? new Date(editing.publishAt).toISOString().slice(0, 16) : "",
    expiresAt: editing?.expiresAt ? new Date(editing.expiresAt).toISOString().slice(0, 16) : "",
    requiresAcknowledgement: editing?.requiresAcknowledgement || false,
    isPinned: editing?.isPinned || false,
    targets: (editing?.targets || []) as any[],
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: any) => setForm(s => ({ ...s, [k]: v }));

  // ── Fetch facilities + departments + roles + users for the targeting builder
  const { data: facilitiesData } = useQuery({
    queryKey: ["notice-form-facilities"],
    queryFn: () => fetchJson("/api/facilities"),
    enabled: isEdit || form.visibilityScope === "FACILITY" || form.visibilityScope === "ORGANIZATION",
  });
  const { data: departmentsData } = useQuery({
    queryKey: ["notice-form-departments", form.facilityId],
    queryFn: () => fetchJson(`/api/departments?facilityId=${form.facilityId}`),
    enabled: !!form.facilityId,
  });
  const { data: rolesData } = useQuery({
    queryKey: ["notice-form-roles"],
    queryFn: () => fetchJson("/api/roles"),
  });
  const { data: usersData } = useQuery({
    queryKey: ["notice-form-users", form.facilityId],
    queryFn: () => fetchJson(`/api/staff?facilityId=${form.facilityId}&limit=200`),
    enabled: form.visibilityScope === "USER",
  });

  // ── Targeting helpers ──
  const addTarget = (targetType: string, targetId: string) => {
    if (!targetId) return;
    if (form.targets.some(t => t.targetType === targetType && t.targetId === targetId)) return;
    set("targets", [...form.targets, { targetType, targetId }]);
  };
  const removeTarget = (idx: number) => {
    set("targets", form.targets.filter((_, i) => i !== idx));
  };

  // Auto-add a default target when scope changes
  useEffect(() => {
    if (isEdit) return; // don't override existing targets on edit
    if (form.visibilityScope === "ORGANIZATION") {
      // Org-wide — one ORGANIZATION:* target
      set("targets", [{ targetType: "ORGANIZATION", targetId: "*" }]);
    } else if (form.visibilityScope === "FACILITY" && form.facilityId) {
      set("targets", [{ targetType: "FACILITY", targetId: form.facilityId }]);
    }
  }, [form.visibilityScope, form.facilityId]);

  const submit = async () => {
    // Validate
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (form.title.length > 200) { toast.error("Title must be ≤200 characters"); return; }
    if (!form.body.trim()) { toast.error("Message is required"); return; }
    if (form.body.length > 10000) { toast.error("Message must be ≤10,000 characters"); return; }
    if (form.targets.length === 0) { toast.error("At least one target audience is required"); return; }
    if (form.publishAt && new Date(form.publishAt).getTime() <= Date.now()) {
      toast.error("Publish-at must be in the future");
      return;
    }
    if (form.expiresAt && new Date(form.expiresAt).getTime() <= Date.now()) {
      toast.error("Expiry must be in the future");
      return;
    }
    if (form.publishAt && form.expiresAt && new Date(form.expiresAt) <= new Date(form.publishAt)) {
      toast.error("Expiry must be after publish-at");
      return;
    }
    if (form.isPinned && !canPin) {
      toast.error("You do not have permission to pin notices");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        noticeType: form.noticeType,
        priority: form.priority,
        visibilityScope: form.visibilityScope,
        facilityId: form.facilityId || null,
        departmentId: form.departmentId || null,
        targets: form.targets,
        publishAt: form.publishAt || null,
        expiresAt: form.expiresAt || null,
        requiresAcknowledgement: form.requiresAcknowledgement,
        isPinned: form.isPinned,
      };
      const url = isEdit ? `/api/notices/${editing.id}` : "/api/notices";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error || `Failed: ${res.status}`);
      toast.success(isEdit ? "Notice updated" : "Notice created");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save notice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="large">
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white relative overflow-hidden">
          <div className="ai-shimmer-bg absolute inset-0 pointer-events-none" />
          <DialogTitle className="text-white flex items-center gap-2 relative">
            <Megaphone className="w-5 h-5" /> {isEdit ? "Edit Notice" : "Create Notice"}
          </DialogTitle>
          <DialogDescription className="text-white/80 relative">
            {isEdit ? "Update this notice's content, targeting, or scheduling." : "Compose a facility-wide announcement. Target the right audience and schedule publication."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-5 sm:p-6 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs">Title <span className="text-rose-500">*</span></Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Network maintenance tonight 10 PM – 12 AM"
              maxLength={200}
            />
            <p className="text-[10px] text-slate-500">{form.title.length}/200 characters</p>
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label className="text-xs">Message <span className="text-rose-500">*</span></Label>
            <Textarea
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              rows={5}
              placeholder="Plain text or markdown — no HTML. Be concise; staff scan notices quickly."
              maxLength={10000}
            />
            <p className="text-[10px] text-slate-500">{form.body.length}/10,000 characters</p>
          </div>

          {/* Type + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Notice Type</Label>
              <Select value={form.noticeType} onValueChange={(v) => set("noticeType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOTICE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Scope + Facility + Department */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Visibility Scope</Label>
              <Select value={form.visibilityScope} onValueChange={(v) => set("visibilityScope", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VISIBILITY_SCOPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Facility</Label>
              <Select value={form.facilityId} onValueChange={(v) => set("facilityId", v)}>
                <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                <SelectContent>
                  {(facilitiesData?.items || facilitiesData || []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Department (optional)</Label>
              <Select value={form.departmentId} onValueChange={(v) => set("departmentId", v)}>
                <SelectTrigger><SelectValue placeholder="Any department" /></SelectTrigger>
                <SelectContent>
                  {(departmentsData?.items || departmentsData || []).map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Targeting builder */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-3 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wide text-slate-600">Target audience</Label>
              <Badge variant="outline" className="text-[10px]">{form.targets.length} target(s)</Badge>
            </div>
            <p className="text-[10px] text-slate-500">
              Pick from facilities, departments, roles, or specific users. A notice is visible to a user if they match ANY target.
            </p>

            {/* Quick add controls per scope */}
            {form.visibilityScope === "DEPARTMENT" && departmentsData?.items && (
              <Select onValueChange={(v) => addTarget("DEPARTMENT", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="+ Add department" /></SelectTrigger>
                <SelectContent>
                  {(departmentsData.items || []).map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {form.visibilityScope === "ROLE" && rolesData?.items && (
              <Select onValueChange={(v) => addTarget("ROLE", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="+ Add role" /></SelectTrigger>
                <SelectContent>
                  {(rolesData.items || []).map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {form.visibilityScope === "USER" && usersData?.items && (
              <Select onValueChange={(v) => addTarget("USER", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="+ Add user" /></SelectTrigger>
                <SelectContent>
                  {(usersData.items || []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Targets chips */}
            {form.targets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.targets.map((t, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="text-[10px] py-1 bg-violet-50 text-violet-700 border-violet-200 gap-1"
                  >
                    {t.targetType}: {t.targetId === "*" ? "all" : t.targetId.slice(0, 12)}
                    <button type="button" onClick={() => removeTarget(i)} className="ml-1 hover:text-rose-700">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Scheduling */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Publish at (optional)</Label>
              <Input
                type="datetime-local"
                value={form.publishAt}
                onChange={(e) => set("publishAt", e.target.value)}
              />
              <p className="text-[10px] text-slate-500">Leave blank to publish immediately on submit (DRAFT) or after Publish Now action.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expires at (optional)</Label>
              <Input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => set("expiresAt", e.target.value)}
              />
              <p className="text-[10px] text-slate-500">After this time the notice auto-expires and disappears from active views.</p>
            </div>
          </div>

          {/* Behaviour flags */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={form.requiresAcknowledgement}
                onCheckedChange={(c) => set("requiresAcknowledgement", c === true)}
              />
              <span className="text-sm flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Requires acknowledgement
              </span>
            </label>
            <label className={`flex items-center gap-2 ${canPin ? "cursor-pointer" : "opacity-50"}`}>
              <Checkbox
                checked={form.isPinned}
                onCheckedChange={(c) => canPin && set("isPinned", c === true)}
                disabled={!canPin}
              />
              <span className="text-sm flex items-center gap-1">
                <Pin className="w-3.5 h-3.5 text-amber-600" /> Pin to top
                {!canPin && <span className="text-[10px] text-slate-400">(no permission)</span>}
              </span>
            </label>
          </div>

          {/* PHI warning */}
          {(form.noticeType === "CLINICAL" || form.noticeType === "EMERGENCY") && (
            <div className="rounded-lg p-2.5 bg-rose-50 border border-rose-200 text-[11px] text-rose-800 flex items-start gap-2">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Do NOT include patient-identifiable information in notices. Use targeted USER scope + strict authorization for any patient-specific communication.</span>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 sm:p-5 shrink-0 border-t bg-slate-50/50">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-violet-600 hover:bg-violet-700 gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Notice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// ACKNOWLEDGEMENT SUMMARY DIALOG
// =====================================================================
function AcknowledgementDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notice-acks", id, page],
    queryFn: () => fetchJson(`/api/notices/${id}/acknowledgements?page=${page}&pageSize=25`),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="large">
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-violet-600 to-purple-700 text-white relative overflow-hidden">
          <div className="ai-shimmer-bg absolute inset-0 pointer-events-none" />
          <DialogTitle className="text-white flex items-center gap-2 relative">
            <Users className="w-5 h-5" /> Acknowledgement Summary
          </DialogTitle>
          <DialogDescription className="text-white/80 relative">
            Audience reach + who has acknowledged this notice.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-5 sm:p-6 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
            </div>
          ) : isError ? (
            <ErrorState message="Failed to load acknowledgements" onRetry={() => refetch()} />
          ) : !data ? null : (
            <>
              {/* KPI strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <AckKpi label="Total audience" value={data.total} color="text-slate-900" />
                <AckKpi label="Acknowledged" value={data.acknowledged} color="text-emerald-700" />
                <AckKpi label="Pending" value={data.pending} color="text-amber-700" />
                <AckKpi label="Rate" value={`${data.percentage}%`} color="text-violet-700" />
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                  <span>Acknowledgement progress</span>
                  <span>{data.percentage}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-700"
                    style={{ width: `${data.percentage}%` }}
                  />
                </div>
              </div>

              {/* Audience table */}
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-slate-500 mb-2 block">Audience</Label>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="text-left p-2 font-semibold text-slate-700">Name</th>
                        <th className="text-left p-2 font-semibold text-slate-700 hidden sm:table-cell">Email</th>
                        <th className="text-left p-2 font-semibold text-slate-700 hidden sm:table-cell">Dept</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.audience.length === 0 ? (
                        <tr><td colSpan={4} className="p-4 text-center text-slate-400">No audience in scope</td></tr>
                      ) : data.audience.map((u: any) => (
                        <tr key={u.id} className="border-b last:border-b-0 hover:bg-slate-50">
                          <td className="p-2 font-medium text-slate-900">{u.name}</td>
                          <td className="p-2 text-slate-600 hidden sm:table-cell">{u.email}</td>
                          <td className="p-2 text-slate-600 hidden sm:table-cell">{u.department || "—"}</td>
                          <td className="p-2">
                            {u.acknowledged ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <CheckCircle2 className="w-3 h-3" /> {timeAgo(u.acknowledgedAt)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <Clock className="w-3 h-3" /> pending
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.totalPages > 1 && (
                  <div className="mt-3">
                    <Pagination
                      page={page}
                      pageSize={25}
                      totalPages={data.totalPages}
                      totalItems={data.total}
                      onPageChange={setPage}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="p-4 shrink-0 border-t bg-slate-50/50">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AckKpi({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div className="rounded-lg p-3 bg-slate-50 border border-slate-200">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

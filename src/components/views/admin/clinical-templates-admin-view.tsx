"use client";

// =====================================================================
// ClinicalTemplatesAdminView — Tier 2 Phase 7
// =====================================================================
// Admin UI for browsing, creating, editing, approving, activating, and
// archiving clinical templates and order sets.
//
// Features:
//   - Beautiful gradient header with live stats (total, active, drafts,
//     favorites)
//   - Tabbed interface: All Templates | My Templates | Favorites
//   - Searchable, filterable card grid (by type, status, scope, category)
//   - Create/edit dialog with gradient header (following the existing
//     GradientDialogHeader pattern)
//   - Version history view with lifecycle timeline
//   - Lifecycle action bar (submit for review, approve, activate,
//     deactivate, archive)
//   - Favorite toggle (star icon)
//   - Smooth fade-in animations and hover lift effects
//   - Fully responsive (mobile-friendly card stacking)
//
// Architecture:
//   - Uses existing shadcn/ui components (Card, Dialog, Select, etc.)
//   - Uses GradientDialogHeader for dialog headers
//   - Uses getDialogContentClasses for responsive dialog sizing
//   - Uses existing useQuery/useMutation patterns
//   - Uses existing EmptyState/LoadingState/ErrorState helpers
//   - Uses existing audit-logged API endpoints from Phase 6
// =====================================================================

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Stethoscope, Plus, Search, RefreshCcw, Eye, AlertCircle, Edit, Star,
  FileText, CheckCircle2, Clock, Archive, Send, ToggleLeft, ToggleRight,
  GitBranch, Heart, Filter, X, Loader2, ChevronRight, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, PageHeader, MiniStatCard,
  formatDate, safeJson,
} from "@/components/ui-helpers";
import { GradientDialogHeader } from "@/components/ui/gradient-dialog-header";
import { FieldLabel } from "@/components/ui/required-label";
import { getDialogContentClasses, DIALOG_BODY_SHELL } from "@/lib/ui/dialog-sizes";
import {
  TEMPLATE_TYPES, TEMPLATE_STATUSES, TEMPLATE_SCOPES,
  TEMPLATE_TYPE_BY_VALUE, TEMPLATE_STATUS_BY_VALUE, TEMPLATE_SCOPE_BY_VALUE,
  type TemplateType, type TemplateStatus, type TemplateScope,
} from "@/lib/clinical-templates/template-registry";

// ─── Helpers ─────────────────────────────────────────────────────────

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

async function sendJson(url: string, method: string, body?: any) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

// Status badge color mapping
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  under_review: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  inactive: "bg-orange-100 text-orange-700 border-orange-200",
  archived: "bg-rose-100 text-rose-700 border-rose-200",
};

// Type icon + color mapping
const TYPE_META: Record<string, { icon: any; color: string; gradient: string }> = {
  consultation: { icon: FileText, color: "text-blue-600", gradient: "from-blue-500 to-indigo-600" },
  order_set: { icon: GitBranch, color: "text-purple-600", gradient: "from-purple-500 to-violet-600" },
  lab: { icon: Stethoscope, color: "text-cyan-600", gradient: "from-cyan-500 to-blue-600" },
  imaging: { icon: Eye, color: "text-violet-600", gradient: "from-violet-500 to-purple-600" },
  medication: { icon: Plus, color: "text-emerald-600", gradient: "from-emerald-500 to-teal-600" },
  procedure: { icon: Sparkles, color: "text-amber-600", gradient: "from-amber-500 to-orange-600" },
  care: { icon: Heart, color: "text-rose-600", gradient: "from-rose-500 to-pink-600" },
};

// ─── Main View ───────────────────────────────────────────────────────

export function ClinicalTemplatesAdminView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const canView = can("clinical_template.view");
  const canCreate = can("clinical_template.create");
  const canUpdate = can("clinical_template.update");
  const canApprove = can("clinical_template.approve");
  const canActivate = can("clinical_template.activate");

  const [activeTab, setActiveTab] = useState<"all" | "mine" | "favorites">("all");

  if (!canView) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
          <p className="text-sm text-slate-500">
            You don&apos;t have permission to access the Clinical Templates admin.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 fade-in-up">
      <PageHeader
        title="Clinical Templates & Order Sets"
        description="Reusable clinical templates that reduce repetitive work while preserving clinical judgment. Create, review, approve, and activate order sets, consultation templates, and care plans."
        icon={Stethoscope}
        gradient="from-purple-500 to-indigo-600"
      />

      {/* Stats row */}
      <TemplatesStats />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
        <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")} icon={Filter}>
          All Templates
        </TabButton>
        {canCreate && (
          <TabButton active={activeTab === "mine"} onClick={() => setActiveTab("mine")} icon={FileText}>
            My Templates
          </TabButton>
        )}
        <TabButton active={activeTab === "favorites"} onClick={() => setActiveTab("favorites")} icon={Heart}>
          Favorites
        </TabButton>
      </div>

      {activeTab === "all" && (
        <TemplatesList
          canCreate={canCreate}
          canUpdate={canUpdate}
          canApprove={canApprove}
          canActivate={canActivate}
          showAll={true}
        />
      )}
      {activeTab === "mine" && canCreate && (
        <TemplatesList
          canCreate={canCreate}
          canUpdate={canUpdate}
          canApprove={canApprove}
          canActivate={canActivate}
          showAll={false}
          mineOnly={true}
        />
      )}
      {activeTab === "favorites" && (
        <TemplatesList
          canCreate={canCreate}
          canUpdate={canUpdate}
          canApprove={canApprove}
          canActivate={canActivate}
          showAll={true}
          favoritesOnly={true}
        />
      )}
    </div>
  );
}

// ─── Tab Button ──────────────────────────────────────────────────────

function TabButton({
  active, onClick, icon: Icon, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs whitespace-nowrap px-4 py-2 rounded-md font-medium transition-all duration-200 flex items-center gap-1.5 ${
        active
          ? "bg-white text-purple-700 shadow-sm"
          : "text-slate-600 hover:bg-slate-200"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  );
}

// ─── Stats Row ───────────────────────────────────────────────────────

function TemplatesStats() {
  const { data, isLoading } = useQuery({
    queryKey: ["clinical-templates-stats"],
    queryFn: () => fetchJson("/api/clinical-templates?status=all"),
    staleTime: 30_000,
  });

  const items: any[] = data?.items || [];
  const total = items.length;
  const active = items.filter((t: any) => t.status === "active").length;
  const drafts = items.filter((t: any) => t.status === "draft" || t.status === "under_review").length;
  const favorites = items.filter((t: any) => t.isFavorite).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MiniStatCard label="Total Templates" value={isLoading ? "…" : total} icon={FileText} gradient="from-slate-500 to-slate-600" />
      <MiniStatCard label="Active" value={isLoading ? "…" : active} icon={CheckCircle2} gradient="from-emerald-500 to-teal-600" />
      <MiniStatCard label="Drafts / Review" value={isLoading ? "…" : drafts} icon={Clock} gradient="from-amber-500 to-orange-600" />
      <MiniStatCard label="Favorites" value={isLoading ? "…" : favorites} icon={Heart} gradient="from-rose-500 to-pink-600" />
    </div>
  );
}

// ─── Templates List ──────────────────────────────────────────────────

function TemplatesList({
  canCreate, canUpdate, canApprove, canActivate,
  showAll, mineOnly, favoritesOnly,
}: {
  canCreate: boolean;
  canUpdate: boolean;
  canApprove: boolean;
  canActivate: boolean;
  showAll: boolean;
  mineOnly?: boolean;
  favoritesOnly?: boolean;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [detailItem, setDetailItem] = useState<any>(null);

  // Build query params
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (typeFilter !== "all") params.set("type", typeFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (scopeFilter !== "all") params.set("scope", scopeFilter);
  if (favoritesOnly) params.set("favoriteOnly", "true");
  if (mineOnly) params.set("status", "all"); // show all my templates including drafts

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["clinical-templates", params.toString()],
    queryFn: () => fetchJson(`/api/clinical-templates?${params.toString()}`),
    staleTime: 0,
  });

  const items: any[] = data?.items || [];

  // Filter "mine" client-side (creatorId === session user id)
  const { data: session } = useSession();
  const visibleItems = mineOnly
    ? items.filter((t: any) => t.creator?.id === (session?.user as any)?.id)
    : items;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-purple-50/30 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <Input
              placeholder="Search by name or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TEMPLATE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {TEMPLATE_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scopes</SelectItem>
              {TEMPLATE_SCOPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { toast.promise(refetch(), { loading: "Refreshing...", success: "Refreshed", error: "Failed" }); }}
            disabled={isFetching}
          >
            <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {canCreate && (
            <Button
              size="sm"
              onClick={() => { setEditItem(null); setShowForm(true); }}
              className="gap-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white"
            >
              <Plus className="w-4 h-4" /> New Template
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Content */}
      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState message="Failed to load templates" onRetry={() => refetch()} />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title={favoritesOnly ? "No favorite templates yet" : "No templates found"}
          description={
            favoritesOnly
              ? "Mark templates as favorites by clicking the star icon — they'll appear here for quick access."
              : "Create a new clinical template to get started. Templates reduce repetitive work for common clinical workflows."
          }
          icon={favoritesOnly ? Heart : FileText}
          action={canCreate && !favoritesOnly ? (
            <Button onClick={() => { setEditItem(null); setShowForm(true); }} className="gap-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white">
              <Plus className="w-4 h-4" /> New Template
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleItems.map((t: any, i: number) => (
            <TemplateCard
              key={t.id}
              template={t}
              canUpdate={canUpdate}
              canApprove={canApprove}
              canActivate={canActivate}
              onView={() => setDetailItem(t)}
              onEdit={() => { setEditItem(t); setShowForm(true); }}
              onTransition={() => {
                qc.invalidateQueries({ queryKey: ["clinical-templates"] });
                qc.invalidateQueries({ queryKey: ["clinical-templates-stats"] });
              }}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      {showForm && (
        <TemplateFormDialog
          open={showForm}
          onOpenChange={setShowForm}
          editItem={editItem}
          onSaved={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ["clinical-templates"] });
            qc.invalidateQueries({ queryKey: ["clinical-templates-stats"] });
          }}
        />
      )}

      {/* Detail Dialog */}
      {detailItem && (
        <TemplateDetailDialog
          templateId={detailItem.id}
          canUpdate={canUpdate}
          canApprove={canApprove}
          canActivate={canActivate}
          onClose={() => setDetailItem(null)}
          onTransition={() => {
            qc.invalidateQueries({ queryKey: ["clinical-templates"] });
            qc.invalidateQueries({ queryKey: ["clinical-templates-stats"] });
          }}
        />
      )}
    </div>
  );
}

// ─── Template Card ───────────────────────────────────────────────────

function TemplateCard({
  template: t, canUpdate, canApprove, canActivate, onView, onEdit, onTransition, index,
}: {
  template: any;
  canUpdate: boolean;
  canApprove: boolean;
  canActivate: boolean;
  onView: () => void;
  onEdit: () => void;
  onTransition: () => void;
  index: number;
}) {
  const typeMeta = TYPE_META[t.templateType] || TYPE_META.consultation;
  const statusMeta = TEMPLATE_STATUS_BY_VALUE[t.status] || TEMPLATE_STATUSES[0];
  const scopeMeta = TEMPLATE_SCOPE_BY_VALUE[t.scope] || TEMPLATE_SCOPES[1];
  const Icon = typeMeta.icon;

  const [showTransition, setShowTransition] = useState(false);

  return (
    <Card
      className="group relative shadow-sm border-slate-200 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 overflow-hidden"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Top gradient bar (thin) */}
      <div className={`h-1 bg-gradient-to-r ${typeMeta.gradient}`} />

      <CardContent className="p-4 space-y-3">
        {/* Header row: icon + status badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${typeMeta.gradient} flex items-center justify-center shadow-sm`}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                {TEMPLATE_TYPE_BY_VALUE[t.templateType]?.label || t.templateType}
              </p>
              <p className="text-[10px] text-slate-400">{scopeMeta.label}</p>
            </div>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[t.status] || STATUS_COLORS.draft}`}>
            {statusMeta.label}
          </span>
        </div>

        {/* Name + description */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 line-clamp-1 group-hover:text-purple-700 transition-colors">
            {t.name}
          </h3>
          {t.description && (
            <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{t.description}</p>
          )}
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap gap-1.5">
          {t.category && (
            <Badge variant="outline" className="text-[10px] capitalize">{t.category.replace(/_/g, " ")}</Badge>
          )}
          {t.specialty && (
            <Badge variant="outline" className="text-[10px] capitalize">{t.specialty.replace(/_/g, " ")}</Badge>
          )}
          {t.isFavorite && (
            <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-200 bg-rose-50">
              <Star className="w-3 h-3 mr-0.5 fill-rose-500" /> Favorite
            </Badge>
          )}
        </div>

        {/* Footer: creator + actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="text-[10px] text-slate-400">
            {t.creator ? `${t.creator.firstName} ${t.creator.lastName}` : "Unknown"}
            {" · "}
            {t.versionCount || 1} v{(t.applicationCount || 0) > 0 && ` · ${t.applicationCount} uses`}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={onView} className="flex-1 gap-1 text-xs h-7">
            <Eye className="w-3.5 h-3.5" /> View
          </Button>
          {canUpdate && (
            <Button size="sm" variant="outline" onClick={onEdit} className="gap-1 text-xs h-7">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
          {(canApprove || canActivate) && (t.status === "under_review" || t.status === "approved" || t.status === "active" || t.status === "inactive") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowTransition(true)}
              className="gap-1 text-xs h-7 border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </CardContent>

      {/* Transition quick dialog */}
      {showTransition && (
        <QuickTransitionDialog
          template={t}
          open={showTransition}
          onOpenChange={setShowTransition}
          canApprove={canApprove}
          canActivate={canActivate}
          onDone={() => { setShowTransition(false); onTransition(); }}
        />
      )}
    </Card>
  );
}

// ─── Quick Transition Dialog ────────────────────────────────────────

function QuickTransitionDialog({
  template: t, open, onOpenChange, canApprove, canActivate, onDone,
}: {
  template: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canApprove: boolean;
  canActivate: boolean;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: ({ status, reason }: { status: string; reason?: string }) =>
      sendJson(`/api/clinical-templates/${t.id}/transition`, "POST", { status, reason }),
    onSuccess: (res: any) => {
      toast.success(`Template is now ${res.item.status}`);
      qc.invalidateQueries({ queryKey: ["clinical-templates"] });
      qc.invalidateQueries({ queryKey: ["clinical-templates-stats"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Available transitions based on current status
  const TRANSITIONS: Record<string, { status: string; label: string; icon: any; color: string; perm: string }[]> = {
    draft: [
      { status: "under_review", label: "Submit for Review", icon: Send, color: "amber", perm: "update" },
    ],
    under_review: [
      { status: "approved", label: "Approve", icon: CheckCircle2, color: "blue", perm: "approve" },
    ],
    approved: [
      { status: "active", label: "Activate", icon: ToggleRight, color: "emerald", perm: "activate" },
    ],
    active: [
      { status: "inactive", label: "Deactivate", icon: ToggleLeft, color: "orange", perm: "activate" },
    ],
    inactive: [
      { status: "active", label: "Reactivate", icon: ToggleRight, color: "emerald", perm: "activate" },
    ],
  };

  const actions = TRANSITIONS[t.status] || [];
  const filteredActions = actions.filter((a) => {
    if (a.perm === "approve") return canApprove;
    if (a.perm === "activate") return canActivate;
    return true; // "update" is checked by the API
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={getDialogContentClasses("compact", DIALOG_BODY_SHELL)}>
        <GradientDialogHeader
          icon={ChevronRight}
          title="Lifecycle Transition"
          description={`${t.name} — current: ${t.status}`}
          gradient="purple"
          onClose={() => onOpenChange(false)}
        />
        <div className="p-4 space-y-2">
          {filteredActions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              No transitions available for the current status.
            </p>
          ) : (
            filteredActions.map((a) => {
              const Icon = a.icon;
              return (
                <Button
                  key={a.status}
                  variant="outline"
                  className="w-full justify-start gap-2 h-10"
                  disabled={mut.isPending}
                  onClick={() => mut.mutate({ status: a.status })}
                >
                  <Icon className={`w-4 h-4 text-${a.color}-600`} />
                  {a.label}
                </Button>
              );
            })
          )}
          {/* Archive is always available (except for archived) */}
          {t.status !== "archived" && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2 h-10 text-rose-600 border-rose-200 hover:bg-rose-50"
              disabled={mut.isPending}
              onClick={() => {
                if (confirm("Archive this template? It will be hidden from the picker but existing applications are preserved.")) {
                  mut.mutate({ status: "archived", reason: "Archived from admin UI" });
                }
              }}
            >
              <Archive className="w-4 h-4" /> Archive
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Template Form Dialog (Create/Edit) ──────────────────────────────

function TemplateFormDialog({
  open, onOpenChange, editItem, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem: any;
  onSaved: () => void;
}) {
  const isEdit = !!editItem;
  const [name, setName] = useState(editItem?.name || "");
  const [description, setDescription] = useState(editItem?.description || "");
  const [templateType, setTemplateType] = useState<TemplateType>(editItem?.templateType || "order_set");
  const [category, setCategory] = useState(editItem?.category || "");
  const [specialty, setSpecialty] = useState(editItem?.specialty || "");
  const [scope, setScope] = useState<TemplateScope>(editItem?.scope || "organization");
  const [content, setContent] = useState(editItem?.content || "");
  const [changeSummary, setChangeSummary] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      let parsedContent: any = content;
      if (typeof content === "string" && content.trim()) {
        try {
          parsedContent = JSON.parse(content);
        } catch {
          throw new Error("Content must be valid JSON");
        }
      }
      const body: any = {
        name, description, templateType,
        category: category || undefined,
        specialty: specialty || undefined,
        scope,
        content: parsedContent,
        changeSummary: changeSummary || (isEdit ? "Updated content" : "Initial version"),
      };
      if (isEdit) {
        return sendJson(`/api/clinical-templates/${editItem.id}`, "PUT", body);
      } else {
        return sendJson("/api/clinical-templates", "POST", body);
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Template updated" : "Template created");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={getDialogContentClasses("xl", DIALOG_BODY_SHELL)}>
        <GradientDialogHeader
          icon={isEdit ? Edit : Plus}
          title={isEdit ? "Edit Template" : "New Clinical Template"}
          description={isEdit ? "Update template metadata and content" : "Create a reusable clinical template or order set"}
          gradient="purple"
          onClose={() => onOpenChange(false)}
        />
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <FieldLabel htmlFor="name" required>Template Name</FieldLabel>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Fever Workup, Hypertension Follow-up, Pre-operative Assessment"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <FieldLabel htmlFor="description">Description</FieldLabel>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this template is for, when to use it..."
              rows={2}
            />
          </div>

          {/* Type + Scope row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="templateType" required>Template Type</FieldLabel>
              <Select value={templateType} onValueChange={(v) => setTemplateType(v as TemplateType)}>
                <SelectTrigger id="templateType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex flex-col">
                        <span>{t.label}</span>
                        <span className="text-[10px] text-slate-400">{t.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="scope" required>Scope</FieldLabel>
              <Select value={scope} onValueChange={(v) => setScope(v as TemplateScope)}>
                <SelectTrigger id="scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_SCOPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <div className="flex flex-col">
                        <span>{s.label}</span>
                        <span className="text-[10px] text-slate-400">{s.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category + Specialty row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="category">Category (optional)</FieldLabel>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., fever_workup, antenatal, pre_op"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="specialty">Specialty (optional)</FieldLabel>
              <Input
                id="specialty"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="e.g., general_medicine, cardiology, paediatrics"
              />
            </div>
          </div>

          {/* Content (JSON) */}
          <div className="space-y-1.5">
            <FieldLabel htmlFor="content" required={!isEdit}>Content (JSON)</FieldLabel>
            <Textarea
              id="content"
              value={typeof content === "string" ? content : JSON.stringify(content, null, 2)}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`{\n  "labOrders": [\n    { "laboratoryTestId": "...", "priority": "routine" }\n  ],\n  "instructions": "..."\n}`}
              rows={10}
              className="font-mono text-xs"
            />
            <p className="text-xs text-slate-500">
              The template content as a JSON object. See the template registry for the expected shape per type.
              {isEdit && " Leave blank to keep the existing content."}
            </p>
          </div>

          {/* Change summary (required when editing + changing content) */}
          {isEdit && (
            <div className="space-y-1.5">
              <FieldLabel htmlFor="changeSummary">Change Summary</FieldLabel>
              <Input
                id="changeSummary"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="e.g., Added malaria RDT to the fever workup"
              />
              <p className="text-xs text-slate-500">
                Describes what changed in this version. Required when updating content.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-3 px-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !name.trim()}
            className="gap-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white"
          >
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {isEdit ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Template Detail Dialog ──────────────────────────────────────────

function TemplateDetailDialog({
  templateId, canUpdate, canApprove, canActivate, onClose, onTransition,
}: {
  templateId: string;
  canUpdate: boolean;
  canApprove: boolean;
  canActivate: boolean;
  onClose: () => void;
  onTransition: () => void;
}) {
  const qc = useQueryClient();
  const [showTransition, setShowTransition] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["clinical-template", templateId],
    queryFn: () => fetchJson(`/api/clinical-templates/${templateId}`),
    staleTime: 0,
  });

  const favMut = useMutation({
    mutationFn: ({ action }: { action: string }) =>
      sendJson(`/api/clinical-templates/${templateId}/favorite`, "POST", { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinical-template", templateId] });
      qc.invalidateQueries({ queryKey: ["clinical-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const t = data?.item;
  if (isLoading) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className={getDialogContentClasses("large", DIALOG_BODY_SHELL)}>
          <div className="p-12 text-center">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!t) {
    return null;
  }

  const typeMeta = TYPE_META[t.templateType] || TYPE_META.consultation;
  const Icon = typeMeta.icon;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className={getDialogContentClasses("large", DIALOG_BODY_SHELL)}>
        <GradientDialogHeader
          icon={Icon}
          title={t.name}
          description={t.description || "No description provided"}
          gradient="purple"
          onClose={onClose}
        >
          <span className={`ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[t.status] || STATUS_COLORS.draft}`}>
            {TEMPLATE_STATUS_BY_VALUE[t.status]?.label || t.status}
          </span>
        </GradientDialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DetailField label="Type" value={TEMPLATE_TYPE_BY_VALUE[t.templateType]?.label || t.templateType} />
            <DetailField label="Scope" value={TEMPLATE_SCOPE_BY_VALUE[t.scope]?.label || t.scope} />
            <DetailField label="Category" value={t.category ? t.category.replace(/_/g, " ") : "—"} />
            <DetailField label="Specialty" value={t.specialty ? t.specialty.replace(/_/g, " ") : "—"} />
            <DetailField label="Created by" value={t.creator ? `${t.creator.firstName} ${t.creator.lastName}` : "—"} />
            <DetailField label="Created" value={formatDate(t.createdAt)} />
            <DetailField label="Approved by" value={t.approver ? `${t.approver.firstName} ${t.approver.lastName}` : "—"} />
            <DetailField label="Approved" value={t.approvedAt ? formatDate(t.approvedAt) : "—"} />
          </div>

          {/* Tags */}
          {t.tags && t.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {t.tags.map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
              ))}
            </div>
          )}

          {/* Versions timeline */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <GitBranch className="w-4 h-4 text-purple-600" />
              Version History ({t.versions?.length || 0})
            </h4>
            <div className="space-y-2">
              {(t.versions || []).map((v: any) => (
                <div
                  key={v.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                    v.id === t.currentVersionId
                      ? "border-emerald-200 bg-emerald-50/50"
                      : "border-slate-200 bg-slate-50/50"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                    v{v.versionNumber}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-slate-700">{v.changeSummary || "No change summary"}</p>
                    <p className="text-[10px] text-slate-400">{formatDate(v.createdAt)}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[v.status] || STATUS_COLORS.draft}`}>
                    {TEMPLATE_STATUS_BY_VALUE[v.status]?.label || v.status}
                  </span>
                  {v.id === t.currentVersionId && (
                    <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-200 bg-emerald-50">
                      Current
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Applications count */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            {t.applicationCount || 0} applications
          </div>
        </div>

        <DialogFooter className="border-t pt-3 px-5 flex-wrap gap-2">
          {/* Favorite toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => favMut.mutate({ action: "toggle" })}
            disabled={favMut.isPending}
            className="gap-1.5"
          >
            {t.isFavorite ? (
              <>
                <Star className="w-4 h-4 text-rose-500 fill-rose-500" />
                <span className="text-rose-600">Favorited</span>
              </>
            ) : (
              <>
                <Star className="w-4 h-4" />
                Add to Favorites
              </>
            )}
          </Button>

          <div className="flex-1" />

          {(canApprove || canActivate) && (t.status === "under_review" || t.status === "approved" || t.status === "active" || t.status === "inactive") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTransition(true)}
              className="gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              <ChevronRight className="w-4 h-4" /> Lifecycle
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {showTransition && (
        <QuickTransitionDialog
          template={t}
          open={showTransition}
          onOpenChange={setShowTransition}
          canApprove={canApprove}
          canActivate={canActivate}
          onDone={() => { setShowTransition(false); onTransition(); }}
        />
      )}
    </Dialog>
  );
}

// ─── Detail Field ────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm text-slate-700 mt-0.5">{value}</p>
    </div>
  );
}

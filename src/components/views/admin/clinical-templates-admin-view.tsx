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

import { useState, useMemo, useEffect } from "react";
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
  GitBranch, Heart, Filter, X, Loader2, ChevronRight, Sparkles, Pill,
  FlaskConical, ScanLine, Activity, Trash2, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, PageHeader, MiniStatCard,
  formatDate, safeJson,
} from "@/components/ui-helpers";
import { GradientDialogHeader } from "@/components/ui/gradient-dialog-header";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { EntitySelect, type EntitySelectValue } from "@/components/ui/entity-select";
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

// Status badge color mapping — use full static class strings (not dynamically
// constructed) so Tailwind doesn't purge them.
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  under_review: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  inactive: "bg-orange-100 text-orange-700 border-orange-200",
  archived: "bg-rose-100 text-rose-700 border-rose-200",
};

// Type icon + color mapping — full static class strings.
const TYPE_META: Record<string, { icon: any; gradient: string; bg: string; text: string }> = {
  consultation: { icon: FileText, gradient: "from-blue-500 to-indigo-600", bg: "bg-blue-100", text: "text-blue-700" },
  order_set:    { icon: GitBranch, gradient: "from-purple-500 to-violet-600", bg: "bg-purple-100", text: "text-purple-700" },
  lab:          { icon: Stethoscope, gradient: "from-cyan-500 to-blue-600", bg: "bg-cyan-100", text: "text-cyan-700" },
  imaging:      { icon: Eye, gradient: "from-violet-500 to-purple-600", bg: "bg-violet-100", text: "text-violet-700" },
  medication:    { icon: Pill, gradient: "from-emerald-500 to-teal-600", bg: "bg-emerald-100", text: "text-emerald-700" },
  procedure:     { icon: Sparkles, gradient: "from-amber-500 to-orange-600", bg: "bg-amber-100", text: "text-amber-700" },
  care:          { icon: Heart, gradient: "from-rose-500 to-pink-600", bg: "bg-rose-100", text: "text-rose-700" },
};

// Common clinical template categories (selectable in the form)
const TEMPLATE_CATEGORIES = [
  "fever_workup",
  "hypertension_followup",
  "diabetes_followup",
  "antenatal_review",
  "chest_pain_evaluation",
  "malaria_investigation",
  "preoperative_assessment",
  "postoperative_care",
  "sepsis_protocol",
  "asthma_exacerbation",
  "copd_exacerbation",
  "uti_workup",
  "trauma_assessment",
  "pediatric_assessment",
  "geriatric_assessment",
  "mental_health_screening",
  "well_woman_check",
  "well_man_check",
  "std_screening",
  "tb_screening",
  "hiv_care",
  "renal_function_panel",
  "liver_function_panel",
  "thyroid_panel",
  "cardiac_panel",
  "anaemia_workup",
  "dehydration_management",
  "pain_management",
  "end_of_life_care",
  "discharge_planning",
  "general",
  "other",
];

// Common specialties (selectable in the form)
const TEMPLATE_SPECIALTIES = [
  "general_medicine",
  "general_surgery",
  "paediatrics",
  "obstetrics",
  "gynaecology",
  "internal_medicine",
  "cardiology",
  "dermatology",
  "ent",
  "ophthalmology",
  "orthopaedics",
  "psychiatry",
  "neurology",
  "urology",
  "nephrology",
  "endocrinology",
  "gastroenterology",
  "pulmonology",
  "oncology",
  "haematology",
  "infectious_diseases",
  "emergency_medicine",
  "anaesthesia",
  "radiology",
  "pathology",
  "family_medicine",
  "community_health",
  "nursing",
  "pharmacy",
  "other",
];

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

  // ── Bug fix: "All Templates" tab was only showing ACTIVE templates
  // because the API defaults to status=active when no status param is
  // sent. The statusFilter was "all" (the initial state) which meant
  // the condition `if (statusFilter !== "all")` was FALSE — so no
  // status param was sent, and the API returned only active templates.
  //
  // Fix: When the "All Templates" tab is active (showAll=true), we
  // explicitly send status=all so the API returns ALL templates
  // (including draft, under_review, approved, inactive, archived).
  // ─────────────────────────────────────────────────────────────────
  const effectiveStatusFilter = showAll && statusFilter === "all" ? "all" : statusFilter;

  const [scopeFilter, setScopeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [detailItem, setDetailItem] = useState<any>(null);

  // Build query params
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (typeFilter !== "all") params.set("type", typeFilter);
  // Always send status param: "all" shows all statuses, specific
  // status filters to that status.
  params.set("status", effectiveStatusFilter);
  if (scopeFilter !== "all") params.set("scope", scopeFilter);
  if (favoritesOnly) params.set("favoriteOnly", "true");

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
          {canUpdate && t.status !== "archived" && (
            <Button size="sm" variant="outline" onClick={onEdit} className="gap-1 text-xs h-7">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
          {/* Status switcher (transition) — show for ALL statuses.
              The button is visible to anyone with update, approve, or activate
              permission. The dialog itself filters which transitions are
              available based on the user's specific permissions.
              For archived templates, the dialog shows "Restore to Draft". */}
          {(canUpdate || canApprove || canActivate) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowTransition(true)}
              className="gap-1 text-xs h-7 border-purple-200 text-purple-700 hover:bg-purple-50"
              title="Change status"
            >
              <ChevronRight className="w-3.5 h-3.5" /> Status
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
          canUpdate={canUpdate}
          onDone={() => { setShowTransition(false); onTransition(); }}
        />
      )}
    </Card>
  );
}

// ─── Quick Transition Dialog ────────────────────────────────────────

function QuickTransitionDialog({
  template: t, open, onOpenChange, canApprove, canActivate, canUpdate, onDone,
}: {
  template: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canApprove: boolean;
  canActivate: boolean;
  canUpdate: boolean;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();

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

  // Available transitions based on current status — uses static icon+color
  // (not dynamic construction) so Tailwind doesn't purge the classes.
  const TRANSITIONS: Record<string, { status: string; label: string; icon: any; classes: string; perm: string }[]> = {
    draft: [
      { status: "under_review", label: "Submit for Review", icon: Send, classes: "text-amber-600 border-amber-200 hover:bg-amber-50", perm: "update" },
    ],
    under_review: [
      { status: "approved", label: "Approve", icon: CheckCircle2, classes: "text-blue-600 border-blue-200 hover:bg-blue-50", perm: "approve" },
    ],
    approved: [
      { status: "active", label: "Activate", icon: ToggleRight, classes: "text-emerald-600 border-emerald-200 hover:bg-emerald-50", perm: "activate" },
    ],
    active: [
      { status: "inactive", label: "Deactivate", icon: ToggleLeft, classes: "text-orange-600 border-orange-200 hover:bg-orange-50", perm: "activate" },
    ],
    inactive: [
      { status: "active", label: "Reactivate", icon: ToggleRight, classes: "text-emerald-600 border-emerald-200 hover:bg-emerald-50", perm: "activate" },
    ],
    archived: [
      { status: "draft", label: "Restore to Draft", icon: Archive, classes: "text-slate-600 border-slate-200 hover:bg-slate-50", perm: "update" },
    ],
  };

  const actions = TRANSITIONS[t.status] || [];
  const filteredActions = actions.filter((a) => {
    if (a.perm === "approve") return canApprove;
    if (a.perm === "activate") return canActivate;
    if (a.perm === "update") return canUpdate;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={getDialogContentClasses("compact", DIALOG_BODY_SHELL)} showCloseButton={false}>
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
                  className={`w-full justify-start gap-2 h-10 ${a.classes}`}
                  disabled={mut.isPending}
                  onClick={() => mut.mutate({ status: a.status })}
                >
                  <Icon className="w-4 h-4" />
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
                confirmAction({
                  title: "Archive Template",
                  description: "This template will be hidden from the picker but existing applications are preserved. You can restore it later via 'Restore to Draft'.",
                  confirmText: "Archive",
                  variant: "destructive",
                  onConfirm: () => {
                    mut.mutate({ status: "archived", reason: "Archived from admin UI" });
                  },
                });
              }}
            >
              <Archive className="w-4 h-4" /> Archive
            </Button>
          )}
        </div>
      </DialogContent>
      {confirmDialogEl}
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

  // When editing, fetch the FULL template detail (including the current
  // version's content) — the list endpoint only returns metadata, not
  // the content. Without this, the content editor would start empty
  // and all previously saved items would be lost.
  const { data: fullTemplate, isLoading: loadingTemplate } = useQuery({
    queryKey: ["clinical-template-edit", editItem?.id],
    queryFn: () => fetchJson(`/api/clinical-templates/${editItem.id}`),
    enabled: isEdit && open,
    staleTime: 0,
  });

  // The effective edit item — use the full template (with content) when
  // available, fall back to the list item (metadata only) while loading.
  const effectiveEditItem = fullTemplate?.item || editItem;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateType, setTemplateType] = useState<TemplateType>("order_set");
  const [category, setCategory] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [scope, setScope] = useState<TemplateScope>("organization");
  const [contentState, setContentState] = useState<any>({});
  const [changeSummary, setChangeSummary] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Initialize form fields from the full template once it's loaded
  useEffect(() => {
    if (isEdit && fullTemplate?.item && !initialized) {
      const t = fullTemplate.item;
      setName(t.name || "");
      setDescription(t.description || "");
      setTemplateType(t.templateType || "order_set");
      setCategory(t.category || "");
      setSpecialty(t.specialty || "");
      setScope(t.scope || "organization");

      // Parse the content from the current version
      // The detail endpoint returns versions array; the current version
      // is the one whose id matches currentVersionId, or the first version.
      const currentVersion = t.versions?.find((v: any) => v.id === t.currentVersionId) || t.versions?.[0];
      if (currentVersion?.content) {
        try {
          const parsed = typeof currentVersion.content === "string"
            ? JSON.parse(currentVersion.content)
            : currentVersion.content;
          setContentState(parsed);
        } catch {
          setContentState({});
        }
      }
      setInitialized(true);
    } else if (!isEdit && !initialized) {
      // For new templates, initialize with defaults
      setInitialized(true);
    }
  }, [isEdit, fullTemplate, initialized]);

  // Reset when the dialog closes
  useEffect(() => {
    if (!open) {
      setInitialized(false);
      setName("");
      setDescription("");
      setTemplateType("order_set");
      setCategory("");
      setSpecialty("");
      setScope("organization");
      setContentState({});
      setChangeSummary("");
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: async () => {
      // Build the content from the visual editor state
      const content = contentState;
      const body: any = {
        name, description, templateType,
        category: category || undefined,
        specialty: specialty || undefined,
        scope,
        content,
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
      <DialogContent className={getDialogContentClasses("xl", DIALOG_BODY_SHELL)} showCloseButton={false}>
        <GradientDialogHeader
          icon={isEdit ? Edit : Plus}
          title={isEdit ? "Edit Template" : "New Clinical Template"}
          description={isEdit ? "Update template metadata and content" : "Create a reusable clinical template or order set"}
          gradient="purple"
          onClose={() => onOpenChange(false)}
        />
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isEdit && loadingTemplate && (
            <div className="py-8 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-purple-500" />
              <p className="text-sm text-slate-500 mt-2">Loading template...</p>
            </div>
          )}
          {(!isEdit || !loadingTemplate) && initialized && (
            <>
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

          {/* Category + Specialty row — now SELECTABLE dropdowns */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="category">Category</FieldLabel>
              <Select value={category || "none"} onValueChange={(v) => setCategory(v === "none" ? "" : v)}>
                <SelectTrigger id="category"><SelectValue placeholder="Select a category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="specialty">Specialty</FieldLabel>
              <Select value={specialty || "none"} onValueChange={(v) => setSpecialty(v === "none" ? "" : v)}>
                <SelectTrigger id="specialty"><SelectValue placeholder="Select a specialty" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {TEMPLATE_SPECIALTIES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Content editor — visual, user-friendly, no JSON required */}
          <ContentEditor
            templateType={templateType}
            content={contentState}
            onChange={setContentState}
          />

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
            </>
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

// ─── Content Editor — user-friendly visual editor (no JSON) ──────────
//
// Renders different fields based on the template type:
//   - consultation: text fields (chief complaint, HPI, PE, assessment, plan, etc.)
//   - order_set / lab / imaging / medication / procedure: list-based order
//     editors (add/remove rows, each row has type-specific fields)
//   - care: care plan fields (goals, nursing tasks, vitals monitoring, etc.)
// ────────────────────────────────────────────────────────────────────

function ContentEditor({
  templateType, content, onChange,
}: {
  templateType: TemplateType;
  content: any;
  onChange: (newContent: any) => void;
}) {
  // Helper to update a single field
  const update = (field: string, value: any) => {
    onChange({ ...content, [field]: value });
  };

  // ─── Consultation Template ─────────────────────────────────────────
  if (templateType === "consultation") {
    const fields: { key: string; label: string; placeholder?: string; rows?: number }[] = [
      { key: "chiefComplaint", label: "Chief Complaint", placeholder: "e.g., Fever for 3 days" },
      { key: "historyPresentingIllness", label: "History of Presenting Illness (HPI)", placeholder: "Detailed history of the current complaint...", rows: 3 },
      { key: "pastMedicalHistory", label: "Past Medical History", placeholder: "Relevant past medical conditions...", rows: 2 },
      { key: "pastSurgicalHistory", label: "Past Surgical History", placeholder: "Previous surgeries...", rows: 2 },
      { key: "familyHistory", label: "Family History", placeholder: "Relevant family history...", rows: 2 },
      { key: "socialHistory", label: "Social History", placeholder: "Smoking, alcohol, occupation...", rows: 2 },
      { key: "reviewOfSystems", label: "Review of Systems", placeholder: "ROS findings...", rows: 3 },
      { key: "physicalExamination", label: "Physical Examination", placeholder: "PE findings...", rows: 3 },
      { key: "assessment", label: "Assessment", placeholder: "Clinical assessment / impression...", rows: 3 },
      { key: "treatmentPlan", label: "Treatment Plan", placeholder: "Plan of management...", rows: 3 },
      { key: "followUpPlan", label: "Follow-up Plan", placeholder: "Follow-up instructions...", rows: 2 },
      { key: "disposition", label: "Disposition", placeholder: "e.g., home, admission, referral" },
      { key: "patientInstructions", label: "Patient Instructions", placeholder: "Instructions for the patient...", rows: 3 },
    ];
    return (
      <div className="space-y-3 p-4 rounded-lg border border-slate-200 bg-slate-50/30">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-blue-600" /> Consultation Content
        </p>
        <p className="text-xs text-slate-500">These fields will pre-fill the consultation form when the template is applied. Leave blank any field you don&apos;t want to pre-fill.</p>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs font-medium text-slate-600">{f.label}</Label>
              {f.rows ? (
                <Textarea
                  value={content[f.key] || ""}
                  onChange={(e) => update(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  rows={f.rows}
                />
              ) : (
                <Input
                  value={content[f.key] || ""}
                  onChange={(e) => update(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Order Set / Lab / Imaging / Medication / Procedure ────────────
  if (["order_set", "lab", "imaging", "medication", "procedure"].includes(templateType)) {
    return (
      <div className="space-y-4 p-4 rounded-lg border border-slate-200 bg-slate-50/30">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <GitBranch className="w-4 h-4 text-purple-600" /> Order Set Content
        </p>
        <p className="text-xs text-slate-500">Add the orders that this template will create. Each row becomes an order when the template is applied.</p>

        {/* Lab Orders — show for order_set, lab, medication (medication-only won't have lab, but order_set does) */}
        {(templateType === "order_set" || templateType === "lab") && (
          <OrderListEditor
            title="Lab Orders"
            icon={FlaskConical}
            iconColor="text-cyan-600"
            items={content.labOrders || []}
            onChange={(items) => update("labOrders", items)}
            fields={[
              {
                key: "laboratoryTestId", label: "Lab Test", placeholder: "Search lab tests...",
                required: true, type: "entitySelect",
                entityEndpoint: "/api/lab-tests",
                entityQueryParams: { status: "active" },
                entityGetLabel: (item: any) => item.name || item.code || "",
                entityGetId: (item: any) => item.id,
                entityGetSubtitle: (item: any) => item.code || null,
                entityGetCode: (item: any) => item.code || null,
                entityCopyFields: { testName: "name" },
              },
              { key: "priority", label: "Priority", placeholder: "routine / urgent / stat", type: "select", options: ["routine", "urgent", "stat"] },
              { key: "clinicalNote", label: "Clinical Note", placeholder: "e.g., Fasting sample" },
            ]}
          />
        )}

        {/* Imaging Orders — show for order_set, imaging */}
        {(templateType === "order_set" || templateType === "imaging") && (
          <OrderListEditor
            title="Imaging Orders"
            icon={ScanLine}
            iconColor="text-violet-600"
            items={content.imagingOrders || []}
            onChange={(items) => update("imagingOrders", items)}
            fields={[
              {
                key: "procedureCatalogId", label: "Imaging Procedure", placeholder: "Search imaging procedures...",
                required: true, type: "entitySelect",
                entityEndpoint: "/api/procedures-catalog",
                entityQueryParams: { status: "active", category: "diagnostic" },
                entityGetLabel: (item: any) => item.name || "",
                entityGetId: (item: any) => item.id,
                entityGetSubtitle: (item: any) => item.code || null,
                entityGetCode: (item: any) => item.code || null,
                entityCopyFields: { procedureName: "name" },
              },
              { key: "priority", label: "Priority", placeholder: "routine / urgent / stat", type: "select", options: ["routine", "urgent", "stat"] },
              { key: "clinicalNote", label: "Clinical Note", placeholder: "e.g., Suspected pneumonia" },
            ]}
          />
        )}

        {/* Prescriptions — show for order_set, medication */}
        {(templateType === "order_set" || templateType === "medication") && (
          <OrderListEditor
            title="Prescriptions"
            icon={Pill}
            iconColor="text-emerald-600"
            items={content.prescriptions || []}
            onChange={(items) => update("prescriptions", items)}
            fields={[
              {
                key: "medicationId", label: "Medication", placeholder: "Search medications...",
                required: true, type: "entitySelect",
                entityEndpoint: "/api/medications",
                entityQueryParams: { status: "active" },
                entityGetLabel: (item: any) => `${item.genericName} (${item.brandName || "generic"}) ${item.strength || ""}`.trim(),
                entityGetId: (item: any) => item.id,
                entityGetSubtitle: (item: any) => `${item.dosageForm || ""} ${item.route || ""}`.trim() || null,
                entityGetCode: (item: any) => item.brandName ? null : "generic",
                entityCopyFields: { medicationName: "genericName" },
              },
              { key: "dosage", label: "Dosage", placeholder: "e.g., 500mg", required: true },
              { key: "frequency", label: "Frequency", placeholder: "e.g., TDS (3x daily)", required: true },
              { key: "route", label: "Route", placeholder: "PO / IM / IV", type: "select", options: ["PO", "IM", "IV", "SC", "PR", "SL", "TOP"] },
              { key: "duration", label: "Duration", placeholder: "e.g., 7 days" },
              { key: "quantity", label: "Quantity", placeholder: "e.g., 21", type: "number" },
              { key: "instructions", label: "Instructions", placeholder: "e.g., Take with food" },
            ]}
          />
        )}

        {/* Procedures — show for order_set, procedure */}
        {(templateType === "order_set" || templateType === "procedure") && (
          <OrderListEditor
            title="Procedures"
            icon={Sparkles}
            iconColor="text-amber-600"
            items={content.procedures || []}
            onChange={(items) => update("procedures", items)}
            fields={[
              {
                key: "procedureCatalogId", label: "Procedure", placeholder: "Search procedures...",
                required: true, type: "entitySelect",
                entityEndpoint: "/api/procedures-catalog",
                entityQueryParams: { status: "active" },
                entityGetLabel: (item: any) => item.name || "",
                entityGetId: (item: any) => item.id,
                entityGetSubtitle: (item: any) => item.code || null,
                entityGetCode: (item: any) => item.code || null,
                entityCopyFields: { procedureName: "name" },
              },
              { key: "priority", label: "Priority", placeholder: "routine / urgent / stat", type: "select", options: ["routine", "urgent", "stat"] },
              { key: "clinicalNote", label: "Clinical Note", placeholder: "e.g., Sterile technique" },
            ]}
          />
        )}

        {/* Services — show for order_set only */}
        {templateType === "order_set" && (
          <OrderListEditor
            title="Billable Services"
            icon={Activity}
            iconColor="text-blue-600"
            items={content.services || []}
            onChange={(items) => update("services", items)}
            fields={[
              {
                key: "serviceId", label: "Service", placeholder: "Search services...",
                required: true, type: "entitySelect",
                entityEndpoint: "/api/services",
                entityQueryParams: { status: "active" },
                entityGetLabel: (item: any) => item.name || "",
                entityGetId: (item: any) => item.id,
                entityGetSubtitle: (item: any) => item.code || null,
                entityGetCode: (item: any) => item.code || null,
                entityCopyFields: { serviceName: "name" },
              },
              { key: "quantity", label: "Quantity", placeholder: "1", type: "number" },
            ]}
          />
        )}

        {/* Instructions — shared by all order-set types */}
        <div className="space-y-1.5">
          <FieldLabel htmlFor="instructions">Patient Instructions</FieldLabel>
          <Textarea
            id="instructions"
            value={content.instructions || ""}
            onChange={(e) => update("instructions", e.target.value)}
            placeholder="e.g., Collect samples before antibiotic administration. Patient should fast for 8 hours before blood draw."
            rows={3}
          />
        </div>
      </div>
    );
  }

  // ─── Care Template ─────────────────────────────────────────────────
  if (templateType === "care") {
    return (
      <div className="space-y-4 p-4 rounded-lg border border-slate-200 bg-slate-50/30">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <Heart className="w-4 h-4 text-rose-600" /> Care Plan Content
        </p>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="carePlanGoals">Care Plan Goals</FieldLabel>
          <Textarea
            id="carePlanGoals"
            value={content.carePlanGoals || ""}
            onChange={(e) => update("carePlanGoals", e.target.value)}
            placeholder="e.g., Maintain hydration, monitor vitals q4h, prevent pressure ulcers"
            rows={3}
          />
        </div>

        <OrderListEditor
          title="Nursing Tasks"
          icon={ClipboardList}
          iconColor="text-rose-600"
          items={content.nursingTasks || []}
          onChange={(items) => update("nursingTasks", items)}
          fields={[
            { key: "description", label: "Task", placeholder: "e.g., Turn patient every 2 hours", required: true },
            { key: "frequency", label: "Frequency", placeholder: "e.g., q2h, daily, PRN" },
          ]}
        />

        <OrderListEditor
          title="Vitals Monitoring"
          icon={Activity}
          iconColor="text-emerald-600"
          items={content.vitalsMonitoring || []}
          onChange={(items) => update("vitalsMonitoring", items)}
          fields={[
            { key: "vitalType", label: "Vital Type", placeholder: "e.g., BP, Temp, HR", required: true },
            { key: "frequency", label: "Frequency", placeholder: "e.g., q4h, daily", required: true },
          ]}
        />

        <div className="space-y-1.5">
          <FieldLabel htmlFor="patientEducation">Patient Education</FieldLabel>
          <Textarea
            id="patientEducation"
            value={content.patientEducation || ""}
            onChange={(e) => update("patientEducation", e.target.value)}
            placeholder="Education topics to cover with the patient/family..."
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="dischargeCriteria">Discharge Criteria</FieldLabel>
          <Textarea
            id="dischargeCriteria"
            value={content.dischargeCriteria || ""}
            onChange={(e) => update("dischargeCriteria", e.target.value)}
            placeholder="Criteria that must be met before discharge..."
            rows={2}
          />
        </div>
      </div>
    );
  }

  return null;
}

// ─── Order List Editor — add/remove rows for order items ──────────────
//
// A reusable component for editing a list of items (lab orders,
// prescriptions, nursing tasks, etc.). Each row has the fields defined
// by the `fields` prop. The user can add/remove rows with the +/X buttons.
// ────────────────────────────────────────────────────────────────────

interface EditorField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "number" | "select" | "entitySelect";
  options?: string[];
  // EntitySelect config (when type === "entitySelect")
  entityEndpoint?: string;       // e.g., "/api/lab-tests"
  entityQueryParam?: string;      // default: "q"
  entityQueryParams?: Record<string, string>; // e.g., { status: "active" }
  entityGetLabel?: (item: any) => string;
  entityGetId?: (item: any) => string;
  entityGetSubtitle?: (item: any) => string | null;
  entityGetCode?: (item: any) => string | null;
  // When the entity is selected, also store these fields from the selected item
  // e.g., { testName: "name", testCode: "code" } copies item.name → row.testName
  entityCopyFields?: Record<string, string>;
}

function OrderListEditor({
  title, icon: Icon, iconColor, items, onChange, fields,
}: {
  title: string;
  icon: any;
  iconColor: string;
  items: any[];
  onChange: (items: any[]) => void;
  fields: EditorField[];
}) {
  const addItem = () => {
    const newItem: any = {};
    fields.forEach((f) => { newItem[f.key] = ""; });
    onChange([...items, newItem]);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, key: string, value: any) => {
    const updated = items.map((item, i) =>
      i === index ? { ...item, [key]: value } : item
    );
    onChange(updated);
  };

  // Batch update — updates multiple fields on a single item in one
  // onChange call. This is critical for EntitySelect where we need to
  // set both the ID and the display name simultaneously (calling
  // updateItem twice would lose the first update because both calls
  // start from the same `items` array).
  const updateItemFields = (index: number, fields: Record<string, any>) => {
    const updated = items.map((item, i) =>
      i === index ? { ...item, ...fields } : item
    );
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          {title}
          {items.length > 0 && (
            <Badge variant="secondary" className="text-[10px] ml-1">{items.length}</Badge>
          )}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addItem}
          className="h-7 gap-1 text-xs"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-400 italic py-2 text-center">
          No {title.toLowerCase()} added yet. Click &quot;Add&quot; to create one.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={index}
              className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 relative"
            >
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="absolute top-2 right-2 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                title="Remove this item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-6">
                {fields.map((f) => (
                  <div key={f.key} className={f.type === "entitySelect" ? "space-y-0.5 sm:col-span-2" : "space-y-0.5"}>
                    <Label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                      {f.label}{f.required && <span className="text-rose-500"> *</span>}
                    </Label>
                    {f.type === "entitySelect" ? (
                      <EntitySelect
                        endpoint={f.entityEndpoint!}
                        queryParam={f.entityQueryParam || "q"}
                        queryParams={f.entityQueryParams}
                        getLabel={f.entityGetLabel!}
                        getId={f.entityGetId!}
                        getSubtitle={f.entityGetSubtitle}
                        getCode={f.entityGetCode}
                        value={item[f.key] ? { id: item[f.key], label: item[f.entityCopyFields ? Object.keys(f.entityCopyFields)[0] : "label"] || item[f.key] } as EntitySelectValue : null}
                        onChange={(val) => {
                          if (val) {
                            // Batch update: set both the ID and the display
                            // name in a single onChange call so neither is lost.
                            const fields: Record<string, any> = {};
                            fields[f.key] = val.id;
                            if (f.entityCopyFields) {
                              const copyKey = Object.keys(f.entityCopyFields)[0];
                              fields[copyKey] = val.label;
                            }
                            updateItemFields(index, fields);
                          } else {
                            // Clear both fields
                            const fields: Record<string, any> = {};
                            fields[f.key] = "";
                            if (f.entityCopyFields) {
                              const copyKey = Object.keys(f.entityCopyFields)[0];
                              fields[copyKey] = "";
                            }
                            updateItemFields(index, fields);
                          }
                        }}
                        placeholder={f.placeholder || "Search..."}
                        required={f.required}
                        className=""
                      />
                    ) : f.type === "select" ? (
                      <Select
                        value={item[f.key] || ""}
                        onValueChange={(v) => updateItem(index, f.key, v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={f.placeholder || "Select..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {f.options?.map((opt) => (
                            <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={f.type === "number" ? "number" : "text"}
                        value={item[f.key] || ""}
                        onChange={(e) => updateItem(index, f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="h-8 text-xs"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
        <DialogContent className={getDialogContentClasses("large", DIALOG_BODY_SHELL)} showCloseButton={false}>
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
      <DialogContent className={getDialogContentClasses("large", DIALOG_BODY_SHELL)} showCloseButton={false}>
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

          {/* Lifecycle button — visible for ALL templates (including archived),
              to anyone with update/approve/activate permission. For archived
              templates, the dialog shows "Restore to Draft". */}
          {(canUpdate || canApprove || canActivate) && (
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
          canUpdate={canUpdate}
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

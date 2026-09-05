"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, RefreshCcw, Eye, Pencil, Trash2, AlertCircle, Download, FileSpreadsheet, TrendingUp, Clock, CheckCircle2, XCircle, Activity } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative, safeJson, PageHeader, MiniStatCard } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

// =====================================================================
// GENERIC EXTENDED MODULE VIEW — Full-featured CRUD with stats, export,
// workflow actions, and tabbed detail panel.
// =====================================================================

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "datetime-local" | "textarea" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  full?: boolean;
  hideInList?: boolean;
  hideInForm?: boolean;
  group?: string; // for grouping fields in form
};

export type FilterDef = {
  param: string;
  label: string;
  options: { value: string; label: string }[];
};

export type WorkflowAction = {
  fromStatus: string;
  toStatus: string;
  label: string;
  icon?: any;
  requireNote?: boolean;
};

export type ModuleConfig = {
  viewKey: string;
  title: string;
  description: string;
  icon: any;
  apiPath: string;
  queryKey: string;
  viewPermission: string;
  managePermission: string;
  numberField?: string;
  searchFields: string[];
  filters: FilterDef[];
  fields: FieldDef[];
  auditActionCreate: string;
  auditActionUpdate: string;
  accentColor?: string;
  gradient?: string; // gradient class for header, e.g. "from-rose-500 to-red-600"
  workflowActions?: WorkflowAction[];
  statusField?: string; // which field is the "status" field for workflow
};

export function ExtendedModuleView({ config }: { config: ModuleConfig }) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canManage = can(config.managePermission);
  const canView = can(config.viewPermission);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [viewItem, setViewItem] = useState<any | null>(null);
  const [deleteItem, setDeleteItem] = useState<any | null>(null);
  const [workflowTarget, setWorkflowTarget] = useState<{ item: any; action: WorkflowAction } | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (activeFacilityId) p.set("facilityId", activeFacilityId);
    if (search) p.set("search", search);
    for (const [k, v] of Object.entries(filters)) {
      if (v && v !== "all") p.set(k, v);
    }
    return p.toString();
  }, [activeFacilityId, search, filters]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [config.queryKey, queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/${config.apiPath}?${queryParams}`);
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || `Failed: ${res.status}`);
      }
      return safeJson(res);
    },
    enabled: canView,
    staleTime: 0,
  });

  const handleRefresh = async () => {
    toast.promise(refetch(), {
      loading: "Refreshing...",
      success: "Data refreshed",
      error: "Failed to refresh",
    });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/${config.apiPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Record created successfully");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: [config.queryKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/${config.apiPath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Record updated");
      setEditItem(null);
      setViewItem(null);
      qc.invalidateQueries({ queryKey: [config.queryKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/${config.apiPath}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Record deleted");
      setDeleteItem(null);
      qc.invalidateQueries({ queryKey: [config.queryKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Workflow mutation — advances status
  const workflowMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/${config.apiPath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: (_d, vars) => {
      const action = config.workflowActions?.find((a) => a.toStatus === vars.data[config.statusField || "status"]);
      toast.success(`Status changed to: ${action?.label || vars.data[config.statusField || "status"]}`);
      setWorkflowTarget(null);
      qc.invalidateQueries({ queryKey: [config.queryKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // CSV Export
  const handleExportCSV = () => {
    if (!items.length) {
      toast.error("No data to export");
      return;
    }
    const headers = config.fields.filter((f) => !f.hideInList).map((f) => f.label);
    const keys = config.fields.filter((f) => !f.hideInList).map((f) => f.name);
    if (config.numberField) {
      headers.unshift(config.numberField);
      keys.unshift(config.numberField);
    }
    const rows = items.map((item) => {
      return keys.map((k) => {
        const v = item[k];
        if (v === null || v === undefined) return "";
        if (typeof v === "string" && (v.match(/^\d{4}-\d{2}-\d{2}/) || v.match(/^\d{4}-\d{2}-\d{2}T/))) {
          try { return formatDate(v, true); } catch { return String(v); }
        }
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(",");
    });
    const csv = [headers.map((h) => `"${h}"`).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.viewKey}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${items.length} records to CSV`);
  };

  if (!canView) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
          <p className="text-sm text-slate-500">You don&apos;t have permission to access this module.</p>
        </CardContent>
      </Card>
    );
  }

  const Icon = config.icon;
  const items: any[] = data?.items || [];

  // Compute breakdown stats for each filter
  const breakdowns = config.filters.map((f) => {
    const counts: Record<string, number> = {};
    items.forEach((i) => {
      const v = i[f.param];
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    return { filter: f, counts };
  });

  // Available workflow actions for an item
  const getWorkflowActions = (item: any): WorkflowAction[] => {
    if (!config.workflowActions || !config.statusField) return [];
    const currentStatus = item[config.statusField];
    return config.workflowActions.filter((a) => a.fromStatus === currentStatus);
  };

  return (
    <div className="space-y-4">
      {/* Header — gradient banner */}
      <PageHeader
        title={config.title}
        description={config.description}
        icon={config.icon}
        gradient={config.gradient || "from-rose-500 to-red-600"}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching} className="bg-white/90 border-0 text-slate-700 hover:bg-white">
              <RefreshCcw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!items.length} className="bg-white/90 border-0 text-slate-700 hover:bg-white">
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setShowForm(true)} className="bg-white/20 border border-white/30 text-white hover:bg-white/30">
                <Plus className="w-4 h-4 mr-1" /> New Record
              </Button>
            )}
          </>
        }
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Total Records"
          value={items.length}
          icon={Activity}
          color="slate"
        />
        {breakdowns.slice(0, 4).map(({ filter, counts }) => {
          const topEntry = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
          const totalForFilter = Object.values(counts).reduce((a, b) => a + b, 0);
          return (
            <StatCard
              key={filter.param}
              label={`Top ${filter.label}`}
              value={topEntry ? topEntry[1] : 0}
              subValue={topEntry ? topEntry[0].replace(/_/g, " ") : "—"}
              subLabel={`of ${totalForFilter} categorized`}
              icon={TrendingUp}
              color="amber"
            />
          );
        })}
      </div>

      {/* Filters */}
      {/* Filters — subtle gradient card */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center bg-gradient-to-r from-slate-50/50 to-transparent">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <Input
              placeholder={`Search by ${config.searchFields.join(", ")}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {config.filters.map((f) => (
            <Select
              key={f.param}
              value={filters[f.param] || "all"}
              onValueChange={(v) => setFilters((s) => ({ ...s, [f.param]: v }))}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {f.label}</SelectItem>
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          <div className="ml-auto flex gap-1 border rounded-md p-0.5">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="h-7"
              onClick={() => setViewMode("list")}
            >
              List
            </Button>
            <Button
              variant={viewMode === "cards" ? "default" : "ghost"}
              size="sm"
              className="h-7"
              onClick={() => setViewMode("cards")}
            >
              Cards
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Records — colorful card with gradient header bar */}
      <Card className="overflow-hidden border-slate-200 shadow-md">
        <CardHeader className="pb-3 flex flex-row items-center justify-between bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span className="w-2 h-5 rounded-full bg-gradient-to-b from-rose-500 to-red-600" />
            Records ({items.length})
          </CardTitle>
          {items.length > 0 && (
            <span className="text-xs text-slate-500 font-medium">
              Last updated {formatRelative(items[0].createdAt)}
            </span>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState rows={5} />
          ) : isError ? (
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              title="No records yet"
              description="Create your first record to get started. Records can be linked to patients, encounters, or admissions from other modules."
              icon={Icon}
              action={canManage ? (
                <Button size="sm" onClick={() => setShowForm(true)}>
                  <Plus className="w-4 h-4 mr-1" /> New Record
                </Button>
              ) : undefined}
            />
          ) : viewMode === "list" ? (
            <div className="space-y-2">
              {items.map((item) => (
                <RecordListItem
                  key={item.id}
                  item={item}
                  config={config}
                  canManage={canManage}
                  onView={() => setViewItem(item)}
                  onEdit={() => setEditItem(item)}
                  onDelete={() => setDeleteItem(item)}
                  workflowActions={getWorkflowActions(item)}
                  onWorkflow={(action) => setWorkflowTarget({ item, action })}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((item) => (
                <RecordCard
                  key={item.id}
                  item={item}
                  config={config}
                  canManage={canManage}
                  onView={() => setViewItem(item)}
                  onEdit={() => setEditItem(item)}
                  onDelete={() => setDeleteItem(item)}
                  workflowActions={getWorkflowActions(item)}
                  onWorkflow={(action) => setWorkflowTarget({ item, action })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      {showForm && (
        <RecordForm
          config={config}
          open={showForm}
          onOpenChange={setShowForm}
          onSubmit={(data) => createMutation.mutate(data)}
          loading={createMutation.isPending}
        />
      )}

      {/* Edit Dialog */}
      {editItem && (
        <RecordForm
          config={config}
          open={!!editItem}
          onOpenChange={(o) => !o && setEditItem(null)}
          initialValues={editItem}
          onSubmit={(data) => updateMutation.mutate({ id: editItem.id, data })}
          loading={updateMutation.isPending}
        />
      )}

      {/* View Dialog with tabs */}
      {viewItem && (
        <RecordDetailDialog
          config={config}
          item={viewItem}
          onOpenChange={(o) => !o && setViewItem(null)}
          onEdit={canManage ? () => {
            const itemToEdit = viewItem;
            setViewItem(null);
            setEditItem(itemToEdit);
          } : undefined}
          workflowActions={getWorkflowActions(viewItem)}
          onWorkflow={(action) => {
            const item = viewItem;
            setViewItem(null);
            setWorkflowTarget({ item, action });
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteItem && (
        <Dialog open onOpenChange={(o) => !o && setDeleteItem(null)}>
          <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
            <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
              <DialogTitle className="text-white flex items-center gap-2 text-rose-700">
                <AlertCircle className="w-5 h-5" /> Confirm Delete
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Are you sure you want to delete &quot;{deleteItem[config.fields[0].name]}&quot;? This action cannot be undone and will be recorded in the audit log.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="p-6 pt-4 shrink-0 border-t">
              <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteItem.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Permanently"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Workflow Action Dialog */}
      {workflowTarget && (
        <WorkflowDialog
          config={config}
          target={workflowTarget}
          onOpenChange={(o) => !o && setWorkflowTarget(null)}
          onSubmit={(notes) => {
            const data: any = {};
            if (config.statusField) data[config.statusField] = workflowTarget.action.toStatus;
            if (notes) data.notes = notes;
            workflowMutation.mutate({ id: workflowTarget.item.id, data });
          }}
          loading={workflowMutation.isPending}
        />
      )}
    </div>
  );
}

// =====================================================================
// RECORD LIST ITEM
// =====================================================================
function RecordListItem({
  item, config, canManage, onView, onEdit, onDelete, workflowActions, onWorkflow,
}: {
  item: any;
  config: ModuleConfig;
  canManage: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  workflowActions: WorkflowAction[];
  onWorkflow: (a: WorkflowAction) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  return (
    <div
      className="border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all bg-white card-hover-lift"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {config.numberField && item[config.numberField] && (
              <span className="font-mono text-xs text-white bg-gradient-to-r from-slate-600 to-slate-700 px-2 py-0.5 rounded-md font-semibold">
                {item[config.numberField]}
              </span>
            )}
            {config.fields.slice(0, 1).map((f) => (
              <span key={f.name} className="font-bold text-slate-900 text-base">
                {item[f.name]}
              </span>
            ))}
            {config.filters.map((f) => {
              const v = item[f.param];
              if (!v) return null;
              return <StatusBadge key={f.param} status={v} />;
            })}
          </div>
          <div className="text-xs text-slate-500 mt-1 space-y-0.5">
            {config.fields
              .slice(1, 4)
              .filter((f) => !f.hideInList && item[f.name])
              .map((f) => (
                <div key={f.name}>
                  <span className="text-slate-400">{f.label}:</span>{" "}
                  <span className="text-slate-700">
                    {f.type === "date" || f.type === "datetime-local"
                      ? formatDate(item[f.name], f.type === "datetime-local")
                      : String(item[f.name]).slice(0, 150)}
                  </span>
                </div>
              ))}
            <div className="text-slate-400">Created {formatRelative(item.createdAt)}</div>
          </div>
          {workflowActions.length > 0 && (
            <div className="mt-2 flex gap-1 flex-wrap">
              {workflowActions.map((a) => {
                const ActionIcon = a.icon || CheckCircle2;
                return (
                  <Button
                    key={a.toStatus}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onWorkflow(a)}
                  >
                    <ActionIcon className="w-3 h-3 mr-1" /> {a.label}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onView}>
            <Eye className="w-4 h-4" />
          </Button>
          {canManage && (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="text-rose-600 hover:text-rose-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// RECORD CARD (alternative view)
// =====================================================================
function RecordCard({
  item, config, canManage, onView, onEdit, onDelete, workflowActions, onWorkflow,
}: {
  item: any;
  config: ModuleConfig;
  canManage: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  workflowActions: WorkflowAction[];
  onWorkflow: (a: WorkflowAction) => void;
}) {
  const Icon = config.icon;
  return (
    <div className="border border-slate-200 rounded-xl p-4 hover:shadow-lg hover:border-slate-300 transition-all bg-white card-hover-lift">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${config.gradient || "from-slate-500 to-slate-600"} text-white shadow-sm`}>
            <Icon className="w-4 h-4" />
          </div>
          {config.numberField && item[config.numberField] && (
            <span className="font-mono text-xs text-white bg-gradient-to-r from-slate-600 to-slate-700 px-2 py-0.5 rounded-md font-semibold">{item[config.numberField]}</span>
          )}
        </div>
        <div className="flex gap-1">
          {config.filters.slice(0, 2).map((f) => {
            const v = item[f.param];
            if (!v) return null;
            return <StatusBadge key={f.param} status={v} />;
          })}
        </div>
      </div>
      <h3 className="font-bold text-slate-900 mb-1 truncate text-base">
        {item[config.fields[0].name]}
      </h3>
      <div className="text-xs text-slate-500 space-y-1 mb-3">
        {config.fields.slice(1, 4).filter((f) => !f.hideInList && item[f.name]).map((f) => (
          <div key={f.name} className="truncate">
            <span className="text-slate-400 font-medium">{f.label}:</span>{" "}
            <span className="text-slate-700 font-medium">
              {f.type === "date" || f.type === "datetime-local"
                ? formatDate(item[f.name], f.type === "datetime-local")
                : String(item[f.name]).slice(0, 80)}
            </span>
          </div>
        ))}
      </div>
      {workflowActions.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-2">
          {workflowActions.map((a) => {
            const ActionIcon = a.icon || CheckCircle2;
            return (
              <Button
                key={a.toStatus}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onWorkflow(a)}
              >
                <ActionIcon className="w-3 h-3 mr-1" /> {a.label}
              </Button>
            );
          })}
        </div>
      )}
      <div className="flex justify-between items-center pt-2 border-t border-slate-100">
        <span className="text-[10px] text-slate-400">{formatRelative(item.createdAt)}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onView}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
          {canManage && (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete} className="text-rose-600">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// STAT CARD
// =====================================================================
// STAT CARD — vibrant gradient like the dashboard
// =====================================================================
function StatCard({ label, value, subValue, subLabel, icon: Icon, color }: {
  label: string;
  value: number | string;
  subValue?: string;
  subLabel?: string;
  icon?: any;
  color: string;
}) {
  const gradientMap: Record<string, string> = {
    slate: "from-slate-600 to-slate-800",
    amber: "from-amber-500 to-orange-600",
    emerald: "from-emerald-500 to-emerald-600",
    rose: "from-rose-500 to-red-600",
    blue: "from-blue-500 to-blue-600",
    purple: "from-purple-500 to-purple-600",
    teal: "from-teal-500 to-teal-600",
    cyan: "from-cyan-500 to-cyan-600",
    indigo: "from-indigo-500 to-indigo-600",
    pink: "from-pink-500 to-rose-600",
    orange: "from-orange-500 to-red-600",
    violet: "from-violet-500 to-violet-600",
    green: "from-green-500 to-emerald-600",
    yellow: "from-amber-500 to-orange-600",
  };
  const gradient = gradientMap[color] || gradientMap.slate;

  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${gradient} text-white p-4 shadow-md card-hover-lift`}>
      {Icon && (
        <div className="absolute top-2 right-2 text-white/20 pointer-events-none">
          <Icon className="w-8 h-8" strokeWidth={1.5} />
        </div>
      )}
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/80 mb-1">{label}</p>
      <p className="text-2xl font-extrabold text-white tabular-nums">{value}</p>
      {subValue && <p className="text-[10px] text-white/70 mt-0.5 capitalize truncate">{subValue}</p>}
      {subLabel && <p className="text-[9px] text-white/60 mt-0.5">{subLabel}</p>}
    </div>
  );
}

// =====================================================================
// DETAIL DIALOG with TABS
// =====================================================================
function RecordDetailDialog({
  config, item, onOpenChange, onEdit, workflowActions, onWorkflow,
}: {
  config: ModuleConfig;
  item: any;
  onOpenChange: (o: boolean) => void;
  onEdit?: () => void;
  workflowActions: WorkflowAction[];
  onWorkflow: (a: WorkflowAction) => void;
}) {
  const Icon = config.icon;
  // Group fields by `group` attribute (default to "Details")
  const groups: Record<string, FieldDef[]> = {};
  for (const f of config.fields) {
    const g = f.group || "Details";
    if (!groups[g]) groups[g] = [];
    groups[g].push(f);
  }
  const groupNames = Object.keys(groups);

  // Compute audit/summary info
  const createdDate = item.createdAt ? formatDate(item.createdAt, true) : "—";
  const updatedDate = item.updatedAt ? formatDate(item.updatedAt, true) : "—";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <Icon className={`w-5 h-5 ${config.accentColor || "text-slate-700"}`} />
            {item[config.fields[0].name]}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {config.numberField && item[config.numberField]
              ? `${config.numberField}: ${item[config.numberField]}`
              : `Record details`}
          </DialogDescription>
        </DialogHeader>

        {workflowActions.length > 0 && (
          <div className="flex-1 overflow-y-auto p-6 bg-amber-50 border border-amber-200 rounded-md p-3 mb-3">
            <div className="text-xs font-semibold text-amber-800 mb-2">Workflow Actions:</div>
            <div className="flex gap-2 flex-wrap">
              {workflowActions.map((a) => {
                const ActionIcon = a.icon || CheckCircle2;
                return (
                  <Button
                    key={a.toStatus}
                    size="sm"
                    variant="outline"
                    onClick={() => onWorkflow(a)}
                  >
                    <ActionIcon className="w-4 h-4 mr-1" /> {a.label}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        <Tabs defaultValue={groupNames[0] || "Details"}>
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${Math.min(groupNames.length, 4)}, 1fr)` }}>
            {groupNames.map((g) => (
              <TabsTrigger key={g} value={g} className="text-xs">{g}</TabsTrigger>
            ))}
            <TabsTrigger value="meta" className="text-xs">Meta</TabsTrigger>
          </TabsList>

          {groupNames.map((g) => (
            <TabsContent key={g} value={g}>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {groups[g].map((f) => {
                  if (f.type === "checkbox") {
                    return (
                      <DetailRow key={f.name} label={f.label} value={item[f.name] ? "Yes" : "No"} />
                    );
                  }
                  const v = item[f.name];
                  let display: any = v;
                  if (v && (f.type === "date" || f.type === "datetime-local")) {
                    display = formatDate(v, f.type === "datetime-local");
                  } else if (v !== null && v !== undefined) {
                    display = String(v);
                  }
                  return <DetailRow key={f.name} label={f.label} value={display || "—"} />;
                })}
              </div>
            </TabsContent>
          ))}

          <TabsContent value="meta">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <DetailRow label="Record ID" value={item.id} />
              <DetailRow label="Created At" value={createdDate} />
              <DetailRow label="Last Updated" value={updatedDate} />
              <DetailRow label="Created By" value={item.createdById || "—"} />
              <DetailRow label="Facility ID" value={item.facilityId || "—"} />
              <DetailRow label="Organization ID" value={item.organizationId || "—"} />
            </div>
          </TabsContent>
        </Tabs>

        {onEdit && (
          <DialogFooter className="p-6 pt-4 shrink-0 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={onEdit}>
              <Pencil className="w-4 h-4 mr-1" /> Edit Record
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Label className="text-slate-500">{label}</Label>
      <div className="mt-0.5 text-slate-800 break-words whitespace-pre-wrap">{value}</div>
    </div>
  );
}

// =====================================================================
// WORKFLOW DIALOG
// =====================================================================
function WorkflowDialog({
  config, target, onOpenChange, onSubmit, loading,
}: {
  config: ModuleConfig;
  target: { item: any; action: WorkflowAction };
  onOpenChange: (o: boolean) => void;
  onSubmit: (notes?: string) => void;
  loading: boolean;
}) {
  const [notes, setNotes] = useState("");
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" /> {target.action.label}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Change status from <strong>{target.action.fromStatus.replace(/_/g, " ")}</strong> to{" "}
            <strong>{target.action.toStatus.replace(/_/g, " ")}</strong> for{" "}
            &quot;{target.item[config.fields[0].name]}&quot;?
            {target.action.requireNote && (
              <span className="block mt-2 text-amber-700">A note is required for this action.</span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>Notes {target.action.requireNote && <span className="text-rose-500">*</span>}</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add any notes about this status change..."
          />
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onSubmit(notes || undefined)}
            disabled={loading || (target.action.requireNote && !notes)}
          >
            {loading ? "Processing..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// RECORD FORM (Create / Edit) — grouped by field.group
// =====================================================================
function RecordForm({ config, open, onOpenChange, onSubmit, loading, initialValues }: {
  config: ModuleConfig;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (data: any) => void;
  loading: boolean;
  initialValues?: any;
}) {
  const [form, setForm] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const f of config.fields) {
      if (initialValues) {
        let v = initialValues[f.name];
        if (v && (f.type === "date" || f.type === "datetime-local")) {
          try {
            const d = new Date(v);
            v = d.toISOString().slice(0, f.type === "datetime-local" ? 16 : 10);
          } catch { /* keep v */ }
        }
        init[f.name] = v ?? (f.type === "checkbox" ? false : "");
      } else {
        init[f.name] = f.type === "checkbox" ? false : f.type === "select" ? (f.options?.[0]?.value || "") : "";
      }
    }
    return init;
  });

  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const submit = () => {
    const payload: any = { ...form };
    for (const f of config.fields) {
      if (f.type === "number" && payload[f.name] !== "" && payload[f.name] !== null) {
        payload[f.name] = payload[f.name] === "" ? null : parseFloat(payload[f.name]);
      }
      if ((f.type === "date" || f.type === "datetime-local") && payload[f.name]) {
        try {
          payload[f.name] = new Date(payload[f.name]).toISOString();
        } catch { /* keep */ }
      }
    }
    onSubmit(payload);
  };

  const isEdit = !!initialValues;

  // Group fields by group attribute
  const groups: Record<string, FieldDef[]> = {};
  for (const f of config.fields) {
    if (f.hideInForm) continue;
    const g = f.group || "Details";
    if (!groups[g]) groups[g] = [];
    groups[g].push(f);
  }
  const groupNames = Object.keys(groups);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-teal-600 to-cyan-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <config.icon className="w-5 h-5" /> {isEdit ? "Edit" : "New"} {config.title}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {isEdit ? "Update the record details below." : "Fill in the details to create a new record. Fields marked with * are required."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {groupNames.map((g) => (
            <div key={g} className={groupNames.length > 1 ? "border-t pt-3 first:border-t-0 first:pt-0" : ""}>
              {groupNames.length > 1 && (
                <h4 className="text-sm font-semibold text-slate-700 mb-2">{g}</h4>
              )}
              <div className="grid grid-cols-2 gap-3">
                {groups[g].map((f) => (
                  <div key={f.name} className={f.full || f.type === "textarea" ? "col-span-2" : ""}>
                    {f.type === "checkbox" ? (
                      <div className="flex items-center gap-2 pt-6">
                        <input
                          type="checkbox"
                          checked={!!form[f.name]}
                          onChange={(e) => set(f.name, e.target.checked)}
                          className="rounded"
                        />
                        <Label>{f.label}</Label>
                      </div>
                    ) : (
                      <>
                        {f.required ? (
                          <FieldLabel>{f.label}</FieldLabel>
                        ) : (
                          <Label>{f.label}</Label>
                        )}
                        {f.type === "textarea" ? (
                          <Textarea
                            value={form[f.name] || ""}
                            onChange={(e) => set(f.name, e.target.value)}
                            placeholder={f.placeholder}
                            rows={3}
                          />
                        ) : f.type === "select" ? (
                          <Select value={form[f.name] || ""} onValueChange={(v) => set(f.name, v)}>
                            <SelectTrigger><SelectValue placeholder={f.placeholder || f.label} /></SelectTrigger>
                            <SelectContent>
                              {f.options?.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={f.type}
                            value={form[f.name] || ""}
                            onChange={(e) => set(f.name, e.target.value)}
                            placeholder={f.placeholder}
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Saving..." : isEdit ? "Update Record" : "Create Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Plus, Search, RefreshCcw, Eye, Pencil, Trash2, AlertCircle, Filter } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

// =====================================================================
// GENERIC EXTENDED MODULE VIEW
// =====================================================================
// Reusable component that renders a CRUD interface for any of the
// extended modules (Blood Bank, Theatre, ICU, Specialty, etc.) using
// a config-driven approach.
// =====================================================================

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "datetime-local" | "textarea" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  full?: boolean; // span full width
  hideInList?: boolean;
  hideInForm?: boolean;
};

export type FilterDef = {
  param: string;
  label: string;
  options: { value: string; label: string }[];
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

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (activeFacilityId) p.set("facilityId", activeFacilityId);
    if (search) p.set("search", search);
    for (const [k, v] of Object.entries(filters)) {
      if (v && v !== "all") p.set(k, v);
    }
    return p.toString();
  }, [activeFacilityId, search, filters]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [config.queryKey, queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/${config.apiPath}?${queryParams}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Failed: ${res.status}`);
      }
      return res.json();
    },
    enabled: canView,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/${config.apiPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Record created");
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
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Record updated");
      setEditItem(null);
      qc.invalidateQueries({ queryKey: [config.queryKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/${config.apiPath}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Record deleted");
      setDeleteItem(null);
      qc.invalidateQueries({ queryKey: [config.queryKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Icon className={`w-5 h-5 ${config.accentColor || "text-slate-700"}`} /> {config.title}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{config.description}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCcw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1" /> New Record
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total" value={items.length} color="slate" />
        {config.filters.slice(0, 3).map((f) => {
          const counts: Record<string, number> = {};
          items.forEach((i) => {
            const v = i[f.param];
            if (v) counts[v] = (counts[v] || 0) + 1;
          });
          const topEntry = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
          return (
            <StatCard
              key={f.param}
              label={`Top ${f.label}`}
              value={topEntry ? topEntry[1] : 0}
              subValue={topEntry ? topEntry[0].replace(/_/g, " ") : "—"}
              color="amber"
            />
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
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
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Records ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState rows={5} />
          ) : isError ? (
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              title="No records yet"
              description="Create your first record to get started."
              icon={Icon}
              action={canManage ? (
                <Button size="sm" onClick={() => setShowForm(true)}>
                  <Plus className="w-4 h-4 mr-1" /> New Record
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="border border-slate-200 rounded-md p-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        {config.numberField && item[config.numberField] && (
                          <span className="font-mono text-xs text-slate-500">{item[config.numberField]}</span>
                        )}
                        {config.fields.slice(0, 1).map((f) => (
                          <span key={f.name} className="font-medium text-slate-900">
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
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => setViewItem(item)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      {canManage && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setEditItem(item)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteItem(item)}
                            className="text-rose-600 hover:text-rose-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
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

      {/* View Dialog */}
      {viewItem && (
        <Dialog open onOpenChange={(o) => !o && setViewItem(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Icon className={`w-5 h-5 ${config.accentColor || "text-slate-700"}`} />
                {viewItem[config.fields[0].name]}
              </DialogTitle>
              <DialogDescription>
                {config.numberField && viewItem[config.numberField]
                  ? `${viewItem[config.numberField]}`
                  : `Record details`}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {config.fields.map((f) => {
                if (f.type === "checkbox") {
                  return (
                    <DetailRow key={f.name} label={f.label} value={viewItem[f.name] ? "Yes" : "No"} />
                  );
                }
                const v = viewItem[f.name];
                let display = v;
                if (v && (f.type === "date" || f.type === "datetime-local")) {
                  display = formatDate(v, f.type === "datetime-local");
                } else if (v !== null && v !== undefined) {
                  display = String(v);
                }
                return <DetailRow key={f.name} label={f.label} value={display || "—"} />;
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      {deleteItem && (
        <Dialog open onOpenChange={(o) => !o && setDeleteItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-700">
                <AlertCircle className="w-5 h-5" /> Confirm Delete
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{deleteItem[config.fields[0].name]}&quot;? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteItem.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function StatCard({ label, value, subValue, color }: { label: string; value: number; subValue?: string; color: string }) {
  const colorMap: Record<string, string> = {
    slate: "border-slate-300",
    amber: "border-amber-300",
    emerald: "border-emerald-300",
    rose: "border-rose-300",
    blue: "border-blue-300",
  };
  return (
    <Card className={colorMap[color] ? `border-l-4 ${colorMap[color]}` : ""}>
      <CardContent className="p-3">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        {subValue && <div className="text-xs text-slate-500 capitalize truncate">{subValue}</div>}
      </CardContent>
    </Card>
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
          const d = new Date(v);
          v = d.toISOString().slice(0, f.type === "datetime-local" ? 16 : 10);
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
    // Convert number fields
    for (const f of config.fields) {
      if (f.type === "number" && payload[f.name] !== "") {
        payload[f.name] = payload[f.name] === "" ? null : parseFloat(payload[f.name]);
      }
      if ((f.type === "date" || f.type === "datetime-local") && payload[f.name]) {
        payload[f.name] = new Date(payload[f.name]).toISOString();
      }
    }
    onSubmit(payload);
  };

  const isEdit = !!initialValues;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <config.icon className="w-5 h-5" /> {isEdit ? "Edit" : "New"} {config.title}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the record details below." : "Fill in the details to create a new record."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {config.fields.map((f) => {
            if (f.hideInForm) return null;
            return (
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
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Saving..." : isEdit ? "Update Record" : "Create Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-export the icon for use in form

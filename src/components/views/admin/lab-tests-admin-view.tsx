"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Beaker, Search, Plus, Edit, Trash2, Activity, AlertTriangle, CheckCircle2,
  Upload, BarChart3, Layers, Microscope, Settings2, FileClock, Eye, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, PageHeader, MiniStatCard,
  formatDate, safeJson, ClearableSearch} from "@/components/ui-helpers"
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldLabel } from "@/components/ui/required-label";
import {
  TEST_CATEGORIES, TEST_TYPES, RESULT_TYPES, TEST_STATUSES, statusColor, labelOf,
  formatCurrency, tatLabel, fetchJson,
} from "./lab-tests/shared";
import { LabTestDialog } from "./lab-tests/test-dialog";
import { TestDetailsDialog } from "./lab-tests/test-details";

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "temporarily_unavailable", label: "Temporarily Unavailable" },
  { value: "referral_out", label: "Referral Out" },
  { value: "retired", label: "Retired" },
  { value: "archived", label: "Archived" },
];

const CATEGORY_FILTERS = [{ value: "all", label: "All Categories" }, ...TEST_CATEGORIES];

export function LabTestsAdminView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canManage = can("lab_catalog.manage") || can("settings.manage");
  const canArchive = can("lab_catalog.archive") || can("lab_catalog.manage") || can("settings.manage");
  const canImport = can("lab_catalog.import") || can("lab_catalog.manage") || can("settings.manage");

  const [tab, setTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lab Test Catalog"
        description="Central master catalog for laboratory tests — specimen configuration, reference ranges, critical values, panels, NHIS mapping, and facility availability. Pricing flows through Services & Pricing."
        icon={Beaker}
        gradient="from-emerald-500 to-teal-600"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5"><Activity className="w-4 h-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="catalog" className="gap-1.5"><Beaker className="w-4 h-4" /> Catalog</TabsTrigger>
          <TabsTrigger value="quality" className="gap-1.5"><AlertTriangle className="w-4 h-4" /> Quality Check</TabsTrigger>
          <TabsTrigger value="masters" className="gap-1.5"><Settings2 className="w-4 h-4" /> Masters</TabsTrigger>
          {canImport && <TabsTrigger value="import" className="gap-1.5"><Upload className="w-4 h-4" /> Import</TabsTrigger>}
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="catalog" className="space-y-4">
          <CatalogTab canManage={canManage} canArchive={canArchive} />
        </TabsContent>
        <TabsContent value="quality" className="space-y-4">
          <QualityTab />
        </TabsContent>
        <TabsContent value="masters" className="space-y-4">
          <MastersTab canManage={canManage} />
        </TabsContent>
        {canImport && (
          <TabsContent value="import" className="space-y-4">
            <ImportTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["lab-tests-stats"],
    queryFn: () => fetchJson(`/api/lab-tests?stats=1`),
  });
  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message="Failed to load stats" onRetry={() => refetch()} />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MiniStatCard label="Total Tests" value={data.total} icon={Beaker} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Active" value={data.active} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Inactive" value={data.inactive} icon={Beaker} gradient="from-slate-500 to-slate-600" />
        <MiniStatCard label="Panels" value={data.panels} icon={Layers} gradient="from-violet-500 to-violet-600" />
        <MiniStatCard label="Single Tests" value={data.single} icon={Beaker} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="Referral Out" value={data.referralOut} icon={Microscope} gradient="from-amber-500 to-amber-600" />
        <MiniStatCard label="NHIS-configured" value={data.nhisCount} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Billable" value={data.billableCount} icon={Beaker} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Retired" value={data.retired} icon={Beaker} gradient="from-rose-500 to-rose-600" />
        <MiniStatCard label="Archived" value={data.archived} icon={Beaker} gradient="from-slate-500 to-slate-600" />
        <MiniStatCard label="No Pricing" value={data.withoutService} icon={AlertTriangle} gradient="from-amber-500 to-amber-600" />
        <MiniStatCard label="No Ref Range" value={data.withoutRange} icon={AlertTriangle} gradient="from-amber-500 to-amber-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Tests by Category</div>
            <div className="space-y-2">
              {data.byCategory?.length === 0 ? <div className="text-xs text-slate-500">No data</div> :
                data.byCategory.map((c: any) => (
                  <div key={c.label} className="flex items-center gap-2">
                    <div className="text-xs text-slate-600 w-32 truncate capitalize">{c.label}</div>
                    <div className="flex-1 bg-slate-100 rounded h-5 relative overflow-hidden">
                      <div className="bg-emerald-500 h-full" style={{ width: `${Math.min(100, (c.count / Math.max(1, data.total)) * 100)}%` }} />
                      <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-medium text-slate-700">{c.count}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><Microscope className="w-4 h-4" /> Tests by Specimen</div>
            <div className="space-y-2">
              {data.bySpecimen?.length === 0 ? <div className="text-xs text-slate-500">No data</div> :
                data.bySpecimen.map((c: any) => (
                  <div key={c.label} className="flex items-center gap-2">
                    <div className="text-xs text-slate-600 w-32 truncate">{c.label}</div>
                    <div className="flex-1 bg-slate-100 rounded h-5 relative overflow-hidden">
                      <div className="bg-blue-500 h-full" style={{ width: `${Math.min(100, (c.count / Math.max(1, data.total)) * 100)}%` }} />
                      <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-medium text-slate-700">{c.count}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><Layers className="w-4 h-4" /> Tests by Type</div>
            <div className="space-y-2">
              {data.byTestType?.length === 0 ? <div className="text-xs text-slate-500">No data</div> :
                data.byTestType.map((c: any) => (
                  <div key={c.label} className="flex items-center gap-2">
                    <div className="text-xs text-slate-600 w-32 truncate">{c.label}</div>
                    <div className="flex-1 bg-slate-100 rounded h-5 relative overflow-hidden">
                      <div className="bg-violet-500 h-full" style={{ width: `${Math.min(100, (c.count / Math.max(1, data.total)) * 100)}%` }} />
                      <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-medium text-slate-700">{c.count}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><FileClock className="w-4 h-4" /> Recently Updated</div>
          {data.recent?.length === 0 ? (
            <EmptyState title="No recent changes" />
          ) : (
            <div className="space-y-1">
              {data.recent?.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <Beaker className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-medium text-slate-900">{t.name}</span>
                    <code className="text-xs text-slate-500">{t.code}</code>
                    {t.category && <Badge variant="outline" className="text-xs capitalize">{t.category}</Badge>}
                  </div>
                  <div className="text-xs text-slate-500">{formatDate(t.updatedAt, true)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// CATALOG TAB
// =====================================================================
function CatalogTab({ canManage, canArchive }: { canManage: boolean; canArchive: boolean }) {
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [testType, setTestType] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulk, setShowBulk] = useState(false);

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (category !== "all") params.set("category", category);
  if (status !== "all") params.set("status", status);
  if (testType !== "all") params.set("testType", testType);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["lab-tests-admin", search, category, status, testType],
    queryFn: () => fetchJson(`/api/lab-tests${qs}`),
  });
  const items = data?.items || [];
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lab-tests-admin"] });
    qc.invalidateQueries({ queryKey: ["lab-tests-stats"] });
    qc.invalidateQueries({ queryKey: ["lab-tests"] });
  };

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/lab-tests/${id}`, { method: "DELETE" });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Lab test archived (status set to inactive)");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleSelectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i: any) => i.id)));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm text-slate-500">
          {items.length} test{items.length !== 1 ? "s" : ""} shown
          {selected.size > 0 && <span className="ml-2 text-emerald-700 font-medium">· {selected.size} selected</span>}
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="outline" onClick={() => setShowBulk(true)} className="gap-1.5">
              <Edit className="w-4 h-4" /> Bulk Update ({selected.size})
            </Button>
          )}
          {canManage && (
            <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" /> Add Lab Test
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2 lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search by name, code, alias, short name..." className="pl-0" />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_FILTERS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={testType} onValueChange={setTestType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TEST_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load lab tests" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No lab tests found" description="Adjust filters or add a new test to the catalog." /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0 z-10">
                  <tr>
                    {canManage && (
                      <th className="p-3 w-10">
                        <Checkbox checked={selected.size === items.length && items.length > 0} onCheckedChange={toggleSelectAll} />
                      </th>
                    )}
                    <th className="text-left p-3 font-semibold text-slate-700">Test</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Category</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Specimen</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Unit / Range</th>
                    <th className="text-left p-3 font-semibold text-slate-700">TAT</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t: any) => (
                    <tr key={t.id} className="border-b hover:bg-slate-50">
                      {canManage && (
                        <td className="p-3"><Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} /></td>
                      )}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Beaker className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <div>
                            <div className="font-medium text-slate-900 flex items-center gap-1.5">
                              {t.name}
                              {t.isPanel && <Badge className="bg-violet-100 text-violet-700 text-[10px]">Panel</Badge>}
                              {t.isReferralOut && <Badge className="bg-blue-100 text-blue-700 text-[10px]">Referral</Badge>}
                              {t.nhisEligible && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">NHIS</Badge>}
                            </div>
                            <div className="text-xs text-slate-500"><code>{t.code}</code>{t.shortName && <span> · {t.shortName}</span>}</div>
                            {t.aliases?.length > 0 && (
                              <div className="text-[10px] text-slate-400 mt-0.5">Aliases: {t.aliases.slice(0, 3).map((a: any) => a.alias).join(", ")}{t.aliases.length > 3 ? "…" : ""}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 capitalize text-slate-700">{labelOf(TEST_CATEGORIES, t.category)}</td>
                      <td className="p-3 text-xs text-slate-700">{labelOf(TEST_TYPES, t.testType)} · {labelOf(RESULT_TYPES, t.resultType)}</td>
                      <td className="p-3 text-slate-700 text-xs">{t.specimenType || "—"}</td>
                      <td className="p-3 text-xs">
                        <div className="text-slate-700">{t.unit || "—"}</div>
                        <div className="text-slate-500">{t.referenceRange || "—"}</div>
                      </td>
                      <td className="p-3 text-xs text-slate-600">{tatLabel(t)}</td>
                      <td className="p-3">
                        <Badge className={`bg-${statusColor(t.status)}-100 text-${statusColor(t.status)}-700`}>
                          {labelOf(TEST_STATUSES, t.status)}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setViewing(t.id)} title="View details" className="h-8 w-8 p-0">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {canManage && (
                            <Button size="sm" variant="ghost" onClick={() => setEditing(t)} title="Edit basic fields" className="h-8 w-8 p-0">
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {canArchive && (
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => {
                                confirmAction({
                                  title: `Archive lab test "${t.name}"?`,
                                  description: "This sets the test status to inactive. Historical lab orders and results remain accessible; new orders will not be able to use this test until reactivated.",
                                  confirmText: "Archive",
                                  variant: "warning",
                                  details: (
                                    <div>
                                      <div><strong>Test:</strong> {t.name} ({t.code})</div>
                                      <div><strong>Category:</strong> {labelOf(TEST_CATEGORIES, t.category)}</div>
                                      <div><strong>Status:</strong> {t.status}</div>
                                    </div>
                                  ),
                                  onConfirm: () => archiveMutation.mutate(t.id),
                                });
                              }}
                              title="Archive (set inactive)"
                              className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showNew && <LabTestDialog onClose={() => setShowNew(false)} />}
      {editing && <LabTestDialog test={editing} onClose={() => setEditing(null)} />}
      {viewing && <TestDetailsDialog testId={viewing} onClose={() => setViewing(null)} />}
      {showBulk && selected.size > 0 && (
        <BulkUpdateDialog testIds={Array.from(selected)} onClose={() => { setShowBulk(false); setSelected(new Set()); }} onDone={invalidate} />
      )}
      {confirmDialogEl}
    </div>
  );
}

// =====================================================================
// BULK UPDATE DIALOG
// =====================================================================
function BulkUpdateDialog({ testIds, onClose, onDone }: { testIds: string[]; onClose: () => void; onDone: () => void }) {
  const [updates, setUpdates] = useState<any>({
    category: "", status: "", priority: "", tatMinutes: "", serviceId: "",
    nhisEligible: null, isBillable: null, testType: "",
  });
  const [mode, setMode] = useState<"preview" | "commit">("preview");
  const [preview, setPreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const run = async () => {
    const payload: any = {};
    if (updates.category) payload.category = updates.category;
    if (updates.status) payload.status = updates.status;
    if (updates.priority) payload.priority = updates.priority;
    if (updates.tatMinutes !== "") payload.tatMinutes = Number(updates.tatMinutes);
    if (updates.serviceId) payload.serviceId = updates.serviceId;
    if (updates.testType) payload.testType = updates.testType;
    if (updates.nhisEligible !== null) payload.nhisEligible = updates.nhisEligible;
    if (updates.isBillable !== null) payload.isBillable = updates.isBillable;
    if (Object.keys(payload).length === 0) { toast.error("Select at least one field to update"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-tests/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testIds, updates: payload, mode }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      const data = await safeJson(res);
      if (mode === "preview") {
        setPreview(data);
        setMode("commit");
      } else {
        toast.success(`Updated ${data.updated} test(s)`);
        onDone();
        onClose();
      }
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Update {testIds.length} Test(s)</DialogTitle>
          <DialogDescription>Set fields to update across all selected tests. Empty fields are ignored. A preview runs first.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={updates.category || "skip"} onValueChange={(v) => setUpdates({ ...updates, category: v === "skip" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">— skip —</SelectItem>
                  {TEST_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={updates.status || "skip"} onValueChange={(v) => setUpdates({ ...updates, status: v === "skip" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">— skip —</SelectItem>
                  {TEST_STATUSES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={updates.priority || "skip"} onValueChange={(v) => setUpdates({ ...updates, priority: v === "skip" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">— skip —</SelectItem>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="stat">STAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Test Type</Label>
              <Select value={updates.testType || "skip"} onValueChange={(v) => setUpdates({ ...updates, testType: v === "skip" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">— skip —</SelectItem>
                  {TEST_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>TAT (minutes)</Label>
              <Input type="number" value={updates.tatMinutes} onChange={(e) => setUpdates({ ...updates, tatMinutes: e.target.value })} />
            </div>
            <div>
              <Label>Service ID</Label>
              <Input value={updates.serviceId} onChange={(e) => setUpdates({ ...updates, serviceId: e.target.value })} placeholder="cuid..." />
            </div>
            <div>
              <Label>NHIS Eligible</Label>
              <Select value={updates.nhisEligible === null ? "skip" : updates.nhisEligible ? "true" : "false"} onValueChange={(v) => setUpdates({ ...updates, nhisEligible: v === "skip" ? null : v === "true" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">— skip —</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Billable</Label>
              <Select value={updates.isBillable === null ? "skip" : updates.isBillable ? "true" : "false"} onValueChange={(v) => setUpdates({ ...updates, isBillable: v === "skip" ? null : v === "true" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">— skip —</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {preview && (
            <div className="border rounded p-3 bg-emerald-50 text-sm">
              <div className="font-medium text-emerald-800">Preview:</div>
              <div className="text-xs text-emerald-700 mt-1">Matched {preview.matched} of {preview.requested} requested tests. Click "Apply" to commit.</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={run} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Upload className="w-4 h-4" /> {saving ? "Working..." : mode === "preview" ? "Preview" : "Apply Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// QUALITY CHECK TAB
// =====================================================================
function QualityTab() {
  const [rerunning, setRerunning] = useState(false);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["lab-tests-quality"],
    queryFn: () => fetchJson(`/api/lab-tests/quality-check`),
    // always allow refetch, even if data is fresh
    staleTime: 0,
    refetchOnMount: true,
  });

  const handleRerun = async () => {
    setRerunning(true);
    toast.info("Re-running quality check…");
    try {
      const result = await refetch({ cancelRefetch: true });
      if (result.data) {
        const s = result.data.summary;
        toast.success(`Quality check complete: ${s.errors} errors, ${s.warnings} warnings, ${s.info} info`);
      } else if (result.error) {
        toast.error("Quality check failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Re-run failed");
    } finally {
      setRerunning(false);
    }
  };

  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message="Failed to run quality check" onRetry={() => refetch()} />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <MiniStatCard label="Errors" value={data.summary.errors} icon={AlertTriangle} gradient="from-rose-500 to-rose-600" />
        <MiniStatCard label="Warnings" value={data.summary.warnings} icon={AlertTriangle} gradient="from-amber-500 to-amber-600" />
        <MiniStatCard label="Info" value={data.summary.info} icon={CheckCircle2} gradient="from-blue-500 to-blue-600" />
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-slate-700">Quality Warnings ({data.warnings.length})</div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRerun}
              disabled={rerunning || isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${(rerunning || isFetching) ? "animate-spin" : ""}`} />
              {rerunning || isFetching ? "Running…" : "Re-run"}
            </Button>
          </div>
          {data.warnings.length === 0 ? (
            <EmptyState title="No issues found" description="All tests are properly configured." icon={CheckCircle2} />
          ) : (
            <div className="space-y-2">
              {data.warnings.map((w: any, i: number) => (
                <div key={i} className={`border rounded p-3 flex items-start gap-2 ${
                  w.severity === "error" ? "border-rose-300 bg-rose-50" :
                  w.severity === "warning" ? "border-amber-300 bg-amber-50" : "border-blue-300 bg-blue-50"
                }`}>
                  <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                    w.severity === "error" ? "text-rose-600" :
                    w.severity === "warning" ? "text-amber-600" : "text-blue-600"
                  }`} />
                  <div className="flex-1">
                    <div className="text-sm text-slate-800">{w.message}</div>
                    {w.testNames && <div className="text-xs text-slate-600 mt-1">{w.testNames.join(", ")}</div>}
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">{w.type}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// MASTERS TAB — categories, specimen types, units
// =====================================================================
function MastersTab({ canManage }: { canManage: boolean }) {
  const [section, setSection] = useState<"categories" | "specimens" | "units">("categories");
  return (
    <div className="space-y-3">
      <Tabs value={section} onValueChange={(v) => setSection(v as any)}>
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="specimens">Specimen Types</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
        </TabsList>
        <TabsContent value="categories"><MasterManager endpoint="/api/lab-tests/categories" label="Category" canManage={canManage} /></TabsContent>
        <TabsContent value="specimens"><MasterManager endpoint="/api/lab-tests/specimen-types" label="Specimen Type" canManage={canManage} /></TabsContent>
        <TabsContent value="units"><MasterManager endpoint="/api/lab-tests/units" label="Unit" canManage={canManage} /></TabsContent>
      </Tabs>
    </div>
  );
}

function MasterManager({ endpoint, label, canManage }: { endpoint: string; label: string; canManage: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["lab-tests-master", endpoint],
    queryFn: () => fetchJson(endpoint),
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ name: "", code: "", description: "", sortOrder: 0 });

  // Dynamic placeholders based on master type
  const examples: Record<string, { name: string; code: string; desc: string }> = {
    Category: { name: "e.g., Haematology", code: "e.g., haem", desc: "e.g., Blood-related laboratory tests" },
    "Specimen Type": { name: "e.g., Whole Blood", code: "e.g., whole_blood", desc: "e.g., Collected in EDTA or plain tube" },
    Unit: { name: "e.g., mg/dL", code: "e.g., mg_dl", desc: "e.g., Milligrams per deciliter" },
  };
  const ex = examples[label] || { name: "e.g., Enter name", code: "e.g., enter_code", desc: "e.g., Optional description" };

  const add = async () => {
    if (!form.name || !form.code) { toast.error("name and code required"); return; }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, sortOrder: Number(form.sortOrder) || 0 }),
    });
    if (!res.ok) { const e = await safeJson(res); toast.error(e.error || "Failed"); return; }
    toast.success(`${label} added`);
    setForm({ name: "", code: "", description: "", sortOrder: 0 });
    setAdding(false);
    qc.invalidateQueries({ queryKey: ["lab-tests-master", endpoint] });
  };

  const items = data?.items || [];
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-sm font-semibold text-slate-700">{label}s ({items.length})</div>
          {canManage && <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} className="gap-1.5"><Plus className="w-4 h-4" /> Add {label}</Button>}
        </div>
        {adding && (
          <div className="border rounded p-3 space-y-2 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><FieldLabel required>{label} Name</FieldLabel><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={ex.name} /></div>
              <div><FieldLabel required>{label} Code</FieldLabel><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={ex.code} /></div>
              <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={ex.desc} /></div>
              <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} placeholder="0" /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={add} className="bg-emerald-600 hover:bg-emerald-700">Save</Button>
            </div>
          </div>
        )}
        {isLoading ? <LoadingState rows={3} /> : isError ? <ErrorState message="Failed to load" onRetry={() => refetch()} /> :
          items.length === 0 ? <EmptyState title={`No ${label.toLowerCase()}s configured`} /> :
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left p-2 font-semibold text-slate-700">Name</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Code</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Description</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Order</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m: any) => (
                  <tr key={m.id} className="border-b hover:bg-slate-50">
                    <td className="p-2 font-medium text-slate-900">{m.name}</td>
                    <td className="p-2 text-xs font-mono text-slate-500">{m.code}</td>
                    <td className="p-2 text-xs text-slate-600">{m.description || "—"}</td>
                    <td className="p-2 text-xs">{m.sortOrder}</td>
                    <td className="p-2"><Badge className={`bg-${m.status === "active" ? "emerald" : "slate"}-100 text-${m.status === "active" ? "emerald" : "slate"}-700`}>{m.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </CardContent>
    </Card>
  );
}

// =====================================================================
// IMPORT TAB
// =====================================================================
function ImportTab() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<any>(null);
  const [mode, setMode] = useState<"preview" | "commit">("preview");
  const [busy, setBusy] = useState(false);

  const parse = () => {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Expected array");
      return parsed;
    } catch {
      // Try CSV-ish: name,code,category,specimenType,unit,referenceRange,price
      const lines = text.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) throw new Error("Empty input");
      const header = lines[0].toLowerCase().split(",").map((s) => s.trim());
      return lines.slice(1).map((line) => {
        const cols = line.split(",").map((s) => s.trim());
        const obj: any = {};
        header.forEach((h, i) => { obj[h] = cols[i] || ""; });
        if (obj.price) obj.price = Number(obj.price) || 0;
        if (obj.tatMinutes) obj.tatMinutes = Number(obj.tatMinutes) || undefined;
        if (obj.aliases) obj.aliases = obj.aliases.split("|").map((s: string) => s.trim()).filter(Boolean);
        return obj;
      });
    }
  };

  const run = async () => {
    let tests: any[];
    try { tests = parse(); } catch (e: any) { toast.error(e.message); return; }
    if (tests.length === 0) { toast.error("No tests to import"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/lab-tests/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tests, mode }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      const data = await safeJson(res);
      setResult(data);
      if (mode === "commit") {
        toast.success(`Imported ${data.created} test(s); skipped ${data.skipped}; ${data.errors.length} invalid`);
        if (data.created > 0) setMode("preview");
      } else {
        setMode("commit");
      }
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Bulk Import Lab Tests</div>
          <div className="text-xs text-slate-500">
            Paste JSON array or CSV (header row: name,code,category,specimenType,unit,referenceRange,price,tatMinutes,nhisEligible,aliases).
            Aliases in CSV are pipe-separated (e.g., CBC|Complete Blood Count). Validation runs first; nothing is committed until you confirm.
          </div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={`name,code,category,specimenType,unit,referenceRange,price\nRandom Blood Sugar,RBS-001,chemistry,Whole Blood,mg/dL,70-110,5.00\nFull Blood Count,FBC-001,haematology,Whole Blood,/µL,,12.00`} className="font-mono text-xs" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setText(""); setResult(null); setMode("preview"); }}>Clear</Button>
            <Button onClick={run} disabled={busy || !text.trim()} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              <Upload className="w-4 h-4" /> {busy ? "Working..." : mode === "preview" ? "Validate (Preview)" : "Commit Import"}
            </Button>
          </div>
        </CardContent>
      </Card>
      {result && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-700">{result.mode === "commit" ? "Import Result" : "Validation Preview"}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniStatCard label="Total" value={result.total} icon={Beaker} gradient="from-blue-500 to-blue-600" />
              <MiniStatCard label={result.mode === "commit" ? "Created" : "Valid"} value={result.mode === "commit" ? result.created : result.valid} icon={CheckCircle2} gradient="from-emerald-500 to-emerald-600" />
              <MiniStatCard label="Skipped/Invalid" value={result.mode === "commit" ? result.skipped : result.invalid} icon={AlertTriangle} gradient="from-amber-500 to-amber-600" />
              {result.mode === "commit" && <MiniStatCard label="Errors" value={result.errors?.length || 0} icon={AlertTriangle} gradient="from-rose-500 to-rose-600" />}
            </div>
            {result.errors?.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-rose-700 mb-1">Errors ({result.errors.length})</div>
                <div className="max-h-40 overflow-y-auto border rounded bg-rose-50 p-2 text-xs space-y-1">
                  {result.errors.map((e: any, i: number) => (
                    <div key={i}><strong>Row {e.row}</strong>{e.code ? ` [${e.code}]` : ""}{e.name ? ` ${e.name}:` : ""} {e.errors?.join("; ") || JSON.stringify(e)}</div>
                  ))}
                </div>
              </div>
            )}
            {result.warnings?.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-amber-700 mb-1">Warnings ({result.warnings.length})</div>
                <div className="max-h-32 overflow-y-auto border rounded bg-amber-50 p-2 text-xs space-y-1">
                  {result.warnings.map((w: any, i: number) => (
                    <div key={i}><strong>Row {w.row}</strong> {w.message}</div>
                  ))}
                </div>
              </div>
            )}
            {result.mode === "preview" && result.valid > 0 && (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
                {result.valid} test(s) ready to import. Click "Commit Import" to create them.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

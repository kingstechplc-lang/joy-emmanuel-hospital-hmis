"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Network, Search, Plus, Edit, ChevronDown, ChevronRight, Trash2, Boxes,
  Archive, RotateCcw, MapPin, Phone, Clock, User, FileText, Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatCurrency, safeJson, ClearableSearch, usePagination, Pagination } from "@/components/ui-helpers"
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

// ─── Department categories (initial list per spec) ─────────────────
const DEPARTMENT_CATEGORIES = [
  "Clinical",
  "Diagnostic",
  "Pharmaceutical & Supply",
  "Nursing & Patient Care",
  "Finance & Administration",
  "Medical Records & Information",
  "Technical & Support",
  "Management",
];

export function DepartmentsAdminView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setActiveFacility = useAppStore((s) => s.setActiveFacility);
  const setView = useAppStore((s) => s.setView);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const facilitiesQ = useQuery({
    queryKey: ["facilities-for-departments"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const facilities = facilitiesQ.data?.facilities || [];

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (categoryFilter !== "all") params.set("category", categoryFilter);
  if (includeArchived) params.set("includeArchived", "true");
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["departments-admin", activeFacilityId, categoryFilter, includeArchived],
    queryFn: () => fetchJson(`/api/departments${qs}`),
  });

  const items = (data?.items || []).filter((d: any) =>
    !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.code?.toLowerCase().includes(search.toLowerCase())
  );
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 10);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["departments-admin"] });
    qc.invalidateQueries({ queryKey: ["department-dashboard"] });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Summary counts for the header strip
  const totalCount = data?.items?.length || 0;
  const archivedCount = (data?.items || []).filter((d: any) => d.status === "archived").length;
  const activeCount = (data?.items || []).filter((d: any) => d.status === "active").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Departments</h2>
          <p className="text-sm text-slate-500">Manage departments and units per facility</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {activeCount} active
            </span>
            <span className="inline-flex items-center gap-1 text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> {totalCount} total
            </span>
            {includeArchived && archivedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <Archive className="w-3 h-3" /> {archivedCount} archived
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setView("department_dashboard")} className="gap-2">
            <Network className="w-4 h-4" /> Dashboard
          </Button>
          {can("department.manage") && (
            <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={!activeFacilityId}>
              <Plus className="w-4 h-4" /> Add Department
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search departments by name or code" className="pl-0" />
          </div>
          <Select value={categoryFilter || undefined} onValueChange={(v) => setCategoryFilter(v || "all")}>
            <SelectTrigger className="md:w-64">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {DEPARTMENT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activeFacilityId || undefined} onValueChange={(v) => setActiveFacility(v === "__none__" ? null : v)}>
            <SelectTrigger className="md:w-72"><SelectValue placeholder="All facilities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">All Facilities</SelectItem>
              {facilities.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-slate-700 px-3 py-2 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
            <Checkbox
              checked={includeArchived}
              onCheckedChange={(v) => setIncludeArchived(!!v)}
            />
            <span className="select-none">Include Archived</span>
          </label>
        </CardContent>
      </Card>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to manage its departments.</CardContent></Card>
      )}

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load departments" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No departments found" description="Adjust filters or add a department to begin organizing units." icon={Network} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {pagedItems.map((d: any) => (
                <DepartmentRow
                  key={d.id}
                  dept={d}
                  isExpanded={expandedIds.has(d.id)}
                  onToggle={() => toggleExpand(d.id)}
                  onEdit={() => setEditing(d)}
                  canManage={can("department.manage")}
                  onInvalidate={invalidate}
                />
              ))}
            </div>
            <Pagination page={page} pageSize={pageSize} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </CardContent>
        </Card>
      )}

      {showNew && <DepartmentDialog facilityId={activeFacilityId || undefined} onClose={() => setShowNew(false)} />}
      {editing && <DepartmentDialog department={editing} facilityId={editing.facilityId} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DepartmentRow({ dept, isExpanded, onToggle, onEdit, canManage, onInvalidate }: {
  dept: any;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  canManage: boolean;
  onInvalidate: () => void;
}) {
  const { data: detail } = useQuery({
    queryKey: ["department-detail", dept.id, isExpanded],
    queryFn: () => fetchJson(`/api/departments/${dept.id}`),
    enabled: isExpanded,
  });

  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();

  const units = detail?.item?.units || [];
  const services = detail?.item?.services || [];
  const isArchived = dept.status === "archived";
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any | null>(null);

  const deleteUnit = async (unitId: string, unitName: string) => {
    confirmAction({
      title: `Delete unit "${unitName}"?`,
      description: "This will permanently archive the unit from this department. Any staff assigned to this unit may need to be reassigned.",
      confirmText: "Yes, delete unit",
      variant: "destructive",
      details: (
        <div>
          <div><strong>Unit:</strong> {unitName}</div>
          <div><strong>Department:</strong> {dept.name}</div>
        </div>
      ),
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/departments/${dept.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete_unit", unit: { id: unitId } }),
          });
          if (!res.ok) {
            const e = await safeJson(res).catch(() => ({}));
            throw new Error(e.error || "Failed");
          }
          toast.success("Unit archived");
          onInvalidate();
        } catch (e: any) {
          toast.error(e.message);
        }
      },
    });
  };

  const archiveDept = async () => {
    confirmAction({
      title: `Archive department "${dept.name}"?`,
      description: "Archiving hides this department from active lists. Linked units, services, and historical data are preserved. You can restore it later from the archived list.",
      confirmText: "Yes, archive department",
      variant: "warning",
      details: (
        <div>
          <div><strong>Department:</strong> {dept.name} ({dept.code})</div>
          <div><strong>Facility:</strong> {dept.facility?.name || "—"}</div>
          {dept.unitsCount > 0 && <div><strong>Units affected:</strong> {dept.unitsCount}</div>}
        </div>
      ),
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/departments/${dept.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "archive" }),
          });
          if (!res.ok) {
            const e = await safeJson(res).catch(() => ({}));
            throw new Error(e.error || "Failed");
          }
          toast.success("Department archived");
          onInvalidate();
        } catch (e: any) {
          toast.error(e.message);
        }
      },
    });
  };

  const restoreDept = async () => {
    confirmAction({
      title: `Restore department "${dept.name}"?`,
      description: "Restoring will mark this department as active again, making it visible in active lists and available for new assignments.",
      confirmText: "Yes, restore department",
      variant: "info",
      details: (
        <div>
          <div><strong>Department:</strong> {dept.name} ({dept.code})</div>
          <div><strong>Facility:</strong> {dept.facility?.name || "—"}</div>
        </div>
      ),
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/departments/${dept.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "restore" }),
          });
          if (!res.ok) {
            const e = await safeJson(res).catch(() => ({}));
            throw new Error(e.error || "Failed");
          }
          toast.success("Department restored");
          onInvalidate();
        } catch (e: any) {
          toast.error(e.message);
        }
      },
    });
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={() => {}}>
      <div className={`flex items-center justify-between p-3 hover:bg-slate-50 ${isArchived ? "opacity-75 bg-amber-50/30" : ""}`}>
        <div className="flex items-center gap-2 flex-1">
          <CollapsibleTrigger asChild>
            <button onClick={onToggle} className="text-slate-500 hover:text-emerald-700">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </CollapsibleTrigger>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Network className="w-4 h-4 text-emerald-600" />
              <span className="font-medium text-slate-900">{dept.name}</span>
              <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{dept.code}</code>
              {dept.category && (
                <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
                  {dept.category}
                </Badge>
              )}
              <StatusBadge status={dept.status} />
            </div>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{dept.facility?.name}</span>
              <span>•</span>
              <span>{dept.unitsCount} units</span>
              <span>•</span>
              <span>{dept.staffCount} staff</span>
              {dept.servicesCount > 0 && (
                <>
                  <span>•</span>
                  <span>{dept.servicesCount} services</span>
                </>
              )}
              {dept.location && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {dept.location}</span>
                </>
              )}
            </div>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-1">
            {isExpanded && !isArchived && (
              <Button size="sm" variant="ghost" onClick={() => setShowUnitForm(true)} className="gap-1 text-emerald-700">
                <Plus className="w-3.5 h-3.5" /> Unit
              </Button>
            )}
            {isArchived ? (
              <Button size="sm" variant="ghost" onClick={restoreDept} className="gap-1 text-emerald-700 hover:bg-emerald-50">
                <RotateCcw className="w-3.5 h-3.5" /> Restore
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={archiveDept} className="gap-1 text-amber-700 hover:bg-amber-50">
                <Archive className="w-3.5 h-3.5" /> Archive
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onEdit} className="w-8 p-0">
              <Edit className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
      <CollapsibleContent>
        <div className="bg-slate-50/50 p-3 pl-12 space-y-3">
          {/* Department meta details */}
          {(dept.headStaffId || dept.contactExtension || dept.operatingHours || dept.description) && (
            <div className="bg-white border rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {dept.headStaffId && (
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-slate-500">Head:</span>
                  <span className="font-medium text-slate-900">{dept.headStaffId}</span>
                </div>
              )}
              {dept.contactExtension && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-slate-500">Extension:</span>
                  <span className="font-medium text-slate-900">{dept.contactExtension}</span>
                </div>
              )}
              {dept.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-slate-500">Location:</span>
                  <span className="font-medium text-slate-900">{dept.location}</span>
                </div>
              )}
              {dept.operatingHours && (
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-slate-500">Hours:</span>
                  <span className="font-medium text-slate-900">{dept.operatingHours}</span>
                </div>
              )}
              {dept.description && (
                <div className="md:col-span-2 text-slate-600 pt-1 border-t border-slate-100">
                  {dept.description}
                </div>
              )}
            </div>
          )}

          {/* Units section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5" /> Units ({units.length})
              </h4>
              {canManage && !isArchived && (
                <Button size="sm" variant="outline" onClick={() => setShowUnitForm(true)} className="h-7 gap-1 text-xs">
                  <Plus className="w-3 h-3" /> Add Unit
                </Button>
              )}
            </div>
            {units.length === 0 ? (
              <div className="text-sm text-slate-500 py-2">No units in this department yet.</div>
            ) : (
              <div className="space-y-1.5">
                {units.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between bg-white border rounded p-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Boxes className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-sm font-medium text-slate-900">{u.name}</span>
                      <code className="text-xs text-slate-500">{u.code}</code>
                      {u.headStaffId && (
                        <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                          <User className="w-3 h-3" /> {u.headStaffId}
                        </span>
                      )}
                      {u.room && (
                        <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {u.room}
                        </span>
                      )}
                      {u.status !== "active" && <StatusBadge status={u.status} />}
                    </div>
                    {canManage && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => setEditingUnit(u)} className="w-7 p-0 h-7">
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteUnit(u.id, u.name)} className="w-7 p-0 h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Services section */}
          {services.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5" /> Linked Services ({services.length})
              </h4>
              <div className="space-y-1.5">
                {services.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between bg-white border rounded p-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Stethoscope className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-sm font-medium text-slate-900">{s.name}</span>
                      {s.code && <code className="text-xs text-slate-500">{s.code}</code>}
                      {s.status && s.status !== "active" && <StatusBadge status={s.status} />}
                    </div>
                    {s.defaultPrice != null && (
                      <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
                        {formatCurrency(s.defaultPrice)}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>

      {showUnitForm && (
        <UnitDialog
          departmentId={dept.id}
          onClose={() => setShowUnitForm(false)}
          onSaved={onInvalidate}
        />
      )}
      {editingUnit && (
        <UnitDialog
          departmentId={dept.id}
          unit={editingUnit}
          onClose={() => setEditingUnit(null)}
          onSaved={onInvalidate}
        />
      )}
      {confirmDialogEl}
    </Collapsible>
  );
}

function DepartmentDialog({ department, facilityId, onClose }: { department?: any; facilityId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!department;
  const [form, setForm] = useState({
    name: department?.name || "",
    code: department?.code || "",
    description: department?.description || "",
    facilityId: department?.facilityId || facilityId || "__none__",
    status: department?.status || "active",
    category: department?.category || "Clinical",
    headStaffId: department?.headStaffId || "",
    location: department?.location || "",
    contactExtension: department?.contactExtension || "",
    operatingHours: department?.operatingHours || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/departments/${department.id}` : "/api/departments";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          facilityId: form.facilityId === "__none__" ? undefined : form.facilityId,
        }),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Department updated" : "Department created");
      qc.invalidateQueries({ queryKey: ["departments-admin"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["department-dashboard"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Department" : "Add Department"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update department details." : "Create a new department within a facility."}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Emergency Department" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Code</FieldLabel>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g., ED" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Category</FieldLabel>
            <Select value={form.category || undefined} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {DEPARTMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Status</FieldLabel>
            <Select value={form.status || undefined} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Department Head (Staff ID)</FieldLabel>
            <Input
              value={form.headStaffId}
              onChange={(e) => setForm({ ...form, headStaffId: e.target.value })}
              placeholder="e.g., STAFF-001"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Contact Extension</FieldLabel>
            <Input
              value={form.contactExtension}
              onChange={(e) => setForm({ ...form, contactExtension: e.target.value })}
              placeholder="e.g., 1234"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Location</FieldLabel>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g., Block A, Floor 2"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Operating Hours</FieldLabel>
            <Input
              value={form.operatingHours}
              onChange={(e) => setForm({ ...form, operatingHours: e.target.value })}
              placeholder="e.g., Mon-Fri 08:00-17:00"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description of the department" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name || !form.code}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isEdit ? "Save Changes" : "Create Department"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnitDialog({ departmentId, unit, onClose, onSaved }: {
  departmentId: string;
  unit?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!unit;
  const [form, setForm] = useState({
    name: unit?.name || "",
    code: unit?.code || "",
    description: unit?.description || "",
    status: unit?.status || "active",
    headStaffId: unit?.headStaffId || "",
    location: unit?.location || "",
    room: unit?.room || "",
    operatingHours: unit?.operatingHours || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body = isEdit
        ? { action: "update_unit", unit: { id: unit.id, ...form } }
        : { action: "add_unit", unit: form };
      const res = await fetch(`/api/departments/${departmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Unit updated" : "Unit added");
      qc.invalidateQueries({ queryKey: ["department-detail", departmentId, true] });
      qc.invalidateQueries({ queryKey: ["departments-admin"] });
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Unit" : "Add Unit"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update unit details." : "Create a new unit within this department."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., ICU" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Code</FieldLabel>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g., ICU" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Status</FieldLabel>
            <Select value={form.status || undefined} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Unit Head (Staff ID)</FieldLabel>
            <Input
              value={form.headStaffId}
              onChange={(e) => setForm({ ...form, headStaffId: e.target.value })}
              placeholder="e.g., STAFF-002"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Location</FieldLabel>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g., Block B, Floor 1"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Room</FieldLabel>
            <Input
              value={form.room}
              onChange={(e) => setForm({ ...form, room: e.target.value })}
              placeholder="e.g., Room 204"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel>Operating Hours</FieldLabel>
            <Input
              value={form.operatingHours}
              onChange={(e) => setForm({ ...form, operatingHours: e.target.value })}
              placeholder="e.g., 24/7 or Mon-Sun 00:00-23:59"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name || !form.code}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isEdit ? "Save Changes" : "Add Unit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

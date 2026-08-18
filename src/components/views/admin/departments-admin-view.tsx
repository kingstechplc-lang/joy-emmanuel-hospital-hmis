"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Network, Search, Plus, Edit, ChevronDown, ChevronRight, Trash2, Boxes } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge } from "@/components/ui-helpers";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

export function DepartmentsAdminView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
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
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["departments-admin", activeFacilityId],
    queryFn: () => fetchJson(`/api/departments${qs}`),
  });

  const items = (data?.items || []).filter((d: any) =>
    !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.code?.toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["departments-admin"] });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Departments</h2>
          <p className="text-sm text-slate-500">Manage departments and units per facility</p>
        </div>
        {can("department.manage") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={!activeFacilityId}>
            <Plus className="w-4 h-4" /> Add Department
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search departments by name or code" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={activeFacilityId || undefined} onValueChange={(v) => useAppStore.getState().setActiveFacility(v || null)}>
            <SelectTrigger className="md:w-72"><SelectValue placeholder="All facilities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">All Facilities</SelectItem>
              {facilities.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
        <Card><CardContent className="p-6"><EmptyState title="No departments found" description="Add a department to begin organizing units." /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {items.map((d: any) => (
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
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any | null>(null);

  const deleteUnit = async (unitId: string, unitName: string) => {
    confirmAction({
      title: `Delete unit "${unitName}"?`,
      description: "This will permanently remove the unit from this department. Any staff assigned to this unit may need to be reassigned.",
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
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error || "Failed");
          }
          toast.success("Unit deleted");
          onInvalidate();
        } catch (e: any) {
          toast.error(e.message);
        }
      },
    });
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={() => {}}>
      <div className="flex items-center justify-between p-3 hover:bg-slate-50">
        <div className="flex items-center gap-2 flex-1">
          <CollapsibleTrigger asChild>
            <button onClick={onToggle} className="text-slate-500 hover:text-emerald-700">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </CollapsibleTrigger>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-emerald-600" />
              <span className="font-medium text-slate-900">{dept.name}</span>
              <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{dept.code}</code>
              <StatusBadge status={dept.status} />
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {dept.facility?.name} • {dept.unitsCount} units • {dept.staffCount} staff
            </div>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-1">
            {isExpanded && (
              <Button size="sm" variant="ghost" onClick={() => setShowUnitForm(true)} className="gap-1 text-emerald-700">
                <Plus className="w-3.5 h-3.5" /> Unit
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onEdit} className="w-8 p-0">
              <Edit className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
      <CollapsibleContent>
        <div className="bg-slate-50/50 p-3 pl-12">
          {units.length === 0 ? (
            <div className="text-sm text-slate-500 py-2">No units in this department yet.</div>
          ) : (
            <div className="space-y-1.5">
              {units.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between bg-white border rounded p-2">
                  <div className="flex items-center gap-2">
                    <Boxes className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-sm font-medium text-slate-900">{u.name}</span>
                    <code className="text-xs text-slate-500">{u.code}</code>
                    {u.status !== "active" && <StatusBadge status={u.status} />}
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
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
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/departments/${department.id}` : "/api/departments";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, facilityId: form.facilityId === "__none__" ? undefined : form.facilityId }) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(isEdit ? "Department updated" : "Department created");
      qc.invalidateQueries({ queryKey: ["departments-admin"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Department" : "Add Department"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update department details." : "Create a new department within a facility."}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Emergency Department" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Code</FieldLabel>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g., ED" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status || undefined} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
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
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Unit" : "Add Unit"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Code</FieldLabel>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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

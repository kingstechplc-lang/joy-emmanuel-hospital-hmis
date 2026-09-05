"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { BadgeCheck, Search, Plus, Edit, Trash2, KeyRound, Shield, Save } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, safeJson, ClearableSearch, usePagination, Pagination } from "@/components/ui-helpers"
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

export function RolesAdminView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["roles-admin", search],
    queryFn: () => fetchJson("/api/roles"),
  });

  const items = (data?.items || []).filter((r: any) =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.code?.toLowerCase().includes(search.toLowerCase())
  );
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 10);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["roles-admin"] });

  const { confirm: confirmDelete, dialog: deleteDialog } = useConfirmDialog();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/roles/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Role deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Roles</h2>
          <p className="text-sm text-slate-500">Manage role definitions and permission assignments</p>
        </div>
        {can("role.create") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Add Role
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search roles by name or code" className="pl-0" />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load roles" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No roles found" /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Role</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Description</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Permissions</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Users</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <BadgeCheck className="w-4 h-4 text-emerald-600" />
                          <div>
                            <div className="font-medium text-slate-900">{r.name}</div>
                            <div className="text-xs text-slate-500">{r.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600 max-w-md truncate">{r.description || "—"}</td>
                      <td className="p-3">
                        {r.isSystemRole ? (
                          <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">System</Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-600 border-slate-200 bg-slate-50">Custom</Badge>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-medium text-slate-900">{r.permissionsCount}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-medium text-slate-900">{r.usersCount}</span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {can("role.edit") && (
                            <Button size="sm" variant="ghost" onClick={() => setEditing(r)} className="h-8 w-8 p-0" title="Manage permissions">
                              <KeyRound className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {can("role.edit") && !r.isSystemRole && r.usersCount === 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                confirmDelete({
                                  title: `Delete role "${r.name}"?`,
                                  description: "This will permanently remove the role and its permission assignments. This action cannot be undone.",
                                  confirmText: "Delete role",
                                  variant: "destructive",
                                  details: (
                                    <div>
                                      <div><strong>Role:</strong> {r.name} ({r.code})</div>
                                      <div><strong>Permissions assigned:</strong> {r.permissionsCount || 0}</div>
                                    </div>
                                  ),
                                  onConfirm: () => deleteMutation.mutate(r.id),
                                })
                              }
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

      {showNew && <RoleDialog onClose={() => setShowNew(false)} />}
      {editing && <RoleDialog role={editing} onClose={() => setEditing(null)} />}
      {deleteDialog}
    </div>
  );
}

function RoleDialog({ role, onClose }: { role?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!role;
  const [form, setForm] = useState({
    name: role?.name || "",
    code: role?.code || "",
    description: role?.description || "",
  });
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(
    new Set(role?.permissions?.map((p: any) => p.code) || [])
  );

  const { data: permsData } = useQuery({
    queryKey: ["permissions-for-role-dialog"],
    queryFn: () => fetchJson("/api/permissions"),
  });
  const allPerms = permsData?.items || [];

  // Group permissions by module
  const groupedPerms = allPerms.reduce((acc: Record<string, any[]>, p: any) => {
    const mod = p.module || "general";
    if (!acc[mod]) acc[mod] = [];
    acc[mod].push(p);
    return acc;
  }, {});

  const togglePerm = (code: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleModule = (mod: string, perms: any[]) => {
    const allSelected = perms.every((p) => selectedPerms.has(p.code));
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        perms.forEach((p) => next.delete(p.code));
      } else {
        perms.forEach((p) => next.add(p.code));
      }
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/roles/${role.id}` : "/api/roles";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit
        ? { ...form, permissionCodes: Array.from(selectedPerms) }
        : { ...form, permissionCodes: Array.from(selectedPerms) };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Role updated" : "Role created");
      qc.invalidateQueries({ queryKey: ["roles-admin"] });
      qc.invalidateQueries({ queryKey: ["roles-for-user-dialog"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="text-white">{isEdit ? "Edit Role & Permissions" : "Add New Role"}</DialogTitle>
          <DialogDescription className="text-white/80">
            {isEdit
              ? "Update role details and select which permissions this role grants."
              : "Create a new role and select which permissions it grants."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-2 shrink-0 border-y">
          <div className="space-y-1.5">
            <FieldLabel required>Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={role?.isSystemRole} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Code</FieldLabel>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={role?.isSystemRole} />
          </div>
          <div className="space-y-1.5">
            <Label>Selected Perms</Label>
            <div className="text-sm font-medium text-emerald-700 mt-1.5 flex items-center gap-1.5">
              <Shield className="w-4 h-4" />
              {selectedPerms.size} / {allPerms.length}
            </div>
          </div>
        </div>

        <div className="space-y-1.5 py-2 shrink-0">
          <Label>Description</Label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description of this role" />
        </div>

        {/* Permissions grid — scrolls independently inside the dialog */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <Label className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-600" /> Permissions</Label>
            {isEdit && role?.isSystemRole && (
              <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">System role</Badge>
            )}
          </div>

          {allPerms.length === 0 ? (
            <div className="text-sm text-slate-500 italic p-4 text-center">
              No permissions are seeded in the database yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto flex-1 pr-1">
              {Object.entries(groupedPerms).map(([mod, perms]: [string, any]) => {
                const permsArr = perms as any[];
                const allSelected = permsArr.every((p) => selectedPerms.has(p.code));
                const someSelected = permsArr.some((p) => selectedPerms.has(p.code)) && !allSelected;
                return (
                  <div key={mod} className="border rounded-md p-3 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase text-slate-700 tracking-wide">{mod}</span>
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={() => toggleModule(mod, permsArr)}
                      />
                    </div>
                    <div className="space-y-1">
                      {permsArr.map((p) => (
                        <label key={p.id} className="flex items-start gap-2 cursor-pointer text-sm hover:bg-white p-1.5 rounded transition">
                          <Checkbox
                            checked={selectedPerms.has(p.code)}
                            onCheckedChange={() => togglePerm(p.code)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 text-xs"><code className="bg-emerald-50 text-emerald-700 px-1 py-0.5 rounded">{p.code}</code></div>
                            {p.description && <div className="text-xs text-slate-500 mt-0.5">{p.description}</div>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (!isEdit && (!form.name || !form.code))}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            <Save className="w-4 h-4" />
            {isEdit ? "Save Changes" : "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { UserCircle, Search, Plus, Edit, Ban, CheckCircle2, KeyRound, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatRelative, formatDate } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

export function UsersAdminView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["users-admin", search, statusFilter],
    queryFn: () => fetchJson(`/api/users${qs}`),
  });

  const items = data?.items || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users-admin"] });

  const statusMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "enable" | "disable" | "unlock" }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (_d, vars) => {
      toast.success(`User ${vars.action === "enable" ? "enabled" : vars.action === "disable" ? "disabled" : "unlocked"}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Users</h2>
          <p className="text-sm text-slate-500">Manage user accounts, roles, and access permissions</p>
        </div>
        {can("user.create") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Add User
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search by name, username, email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
              <SelectItem value="locked">Locked</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState message="Failed to load users" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No users found" /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">User</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Roles</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Last Login</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((u: any) => {
                    const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                    return (
                      <tr key={u.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-9 h-9">
                              <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
                                {u.firstName?.[0]}{u.lastName?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-slate-900">{u.firstName} {u.lastName}</div>
                              <div className="text-xs text-slate-500">@{u.username} • {u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {u.roles?.length === 0 && <span className="text-xs text-slate-400">No roles</span>}
                            {u.roles?.map((r: any, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                {r.code}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={u.status} />
                            {isLocked && (
                              <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 text-xs w-fit">
                                <Lock className="w-3 h-3 mr-1" />
                                Locked until {formatDate(u.lockedUntil, true)}
                              </Badge>
                            )}
                            {u.failedLoginAttempts > 0 && (
                              <span className="text-xs text-amber-700">{u.failedLoginAttempts} failed attempts</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-xs text-slate-600">
                          {u.lastLoginAt ? formatRelative(u.lastLoginAt) : <span className="text-slate-400">Never</span>}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {can("user.edit") && (
                              <Button size="sm" variant="ghost" onClick={() => setEditing(u)} className="h-8 w-8 p-0">
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {can("user.disable") && (
                              <>
                                {isLocked && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => statusMutation.mutate({ id: u.id, action: "unlock" })}
                                    disabled={statusMutation.isPending}
                                    className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50"
                                    title="Unlock account"
                                  >
                                    <KeyRound className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {u.status === "active" ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => statusMutation.mutate({ id: u.id, action: "disable" })}
                                    disabled={statusMutation.isPending || u.id === user?.id}
                                    className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                                    title="Disable user"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => statusMutation.mutate({ id: u.id, action: "enable" })}
                                    disabled={statusMutation.isPending}
                                    className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50"
                                    title="Enable user"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showNew && <UserDialog onClose={() => setShowNew(false)} />}
      {editing && <UserDialog user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserDialog({ user: existingUser, onClose }: { user?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!existingUser;
  const [form, setForm] = useState({
    username: existingUser?.username || "",
    password: "",
    firstName: existingUser?.firstName || "",
    middleName: existingUser?.middleName || "",
    lastName: existingUser?.lastName || "",
    email: existingUser?.email || "",
    phone: existingUser?.phone || "",
    status: existingUser?.status || "active",
  });
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<any[]>(
    existingUser?.roles?.map((r: any) => ({
      roleId: r.roleId || r.id,
      facilityId: r.facilityId || "",
    })) || []
  );

  // Load roles + facilities
  const { data: rolesData } = useQuery({
    queryKey: ["roles-for-user-dialog"],
    queryFn: () => fetchJson("/api/roles"),
  });
  const roles = rolesData?.items || [];

  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities-for-user-dialog"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const facilities = facilitiesData?.facilities || [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/users/${existingUser.id}` : "/api/users";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit
        ? {
            ...form,
            roles: selectedRoles,
          }
        : {
            ...form,
            roles: selectedRoles,
          };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(isEdit ? "User updated" : "User created");
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPwdMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${existingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_password", newPassword }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Password reset");
      setShowResetPwd(false);
      setNewPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addRole = () => {
    if (roles.length === 0) return;
    setSelectedRoles([...selectedRoles, { roleId: roles[0].id, facilityId: "" }]);
  };

  const updateRole = (index: number, key: "roleId" | "facilityId", value: string) => {
    const next = [...selectedRoles];
    next[index] = { ...next[index], [key]: value };
    setSelectedRoles(next);
  };

  const removeRole = (index: number) => {
    setSelectedRoles(selectedRoles.filter((_, i) => i !== index));
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User" : "Add New User"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update user info and role assignments." : "Create a new user account and assign roles."}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          {!isEdit && (
            <>
              <div className="space-y-1.5">
                <Label>Username *</Label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Password *</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>First Name *</Label>
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Last Name *</Label>
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Middle Name</Label>
            <Input value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Role assignment */}
          <div className="md:col-span-2 mt-3">
            <div className="flex items-center justify-between mb-2">
              <Label>Roles & Facility Scope</Label>
              <Button type="button" size="sm" variant="outline" onClick={addRole} className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Role
              </Button>
            </div>
            <div className="space-y-2">
              {selectedRoles.length === 0 && (
                <div className="text-sm text-slate-500 italic">No roles assigned. User will have basic access only.</div>
              )}
              {selectedRoles.map((r, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select value={r.roleId} onValueChange={(v) => updateRole(i, "roleId", v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      {roles.map((role: any) => <SelectItem key={role.id} value={role.id}>{role.name} ({role.code})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={r.facilityId} onValueChange={(v) => updateRole(i, "facilityId", v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="All facilities" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Facilities</SelectItem>
                      {facilities.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeRole(i)} className="text-rose-600">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Reset password (edit mode) */}
          {isEdit && (
            <div className="md:col-span-2 mt-3 border-t pt-3">
              {!showResetPwd ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowResetPwd(true)} className="gap-2">
                  <KeyRound className="w-4 h-4" /> Reset Password
                </Button>
              ) : (
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="flex gap-2">
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password (min 6 chars)" />
                    <Button type="button" onClick={() => resetPwdMutation.mutate()} disabled={resetPwdMutation.isPending || newPassword.length < 6}>
                      Reset
                    </Button>
                    <Button type="button" variant="outline" onClick={() => { setShowResetPwd(false); setNewPassword(""); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || (!isEdit && (!form.username || !form.password || !form.firstName || !form.lastName || !form.email))}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            <UserCircle className="w-4 h-4" />
            {isEdit ? "Save Changes" : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

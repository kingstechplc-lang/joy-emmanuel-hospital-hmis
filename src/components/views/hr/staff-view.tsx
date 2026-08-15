"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UserCog, Search, Plus, Building2, Phone, Mail, Ban, CheckCircle2, Edit, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed: ${res.status}`);
  }
  return res.json();
}

const PROFESSIONAL_ROLES = [
  "doctor",
  "nurse",
  "pharmacist",
  "lab_scientist",
  "radiographer",
  "records_officer",
  "receptionist",
  "cashier",
  "accountant",
  "inventory_officer",
  "administrator",
  "cleaner",
  "security",
  "other",
];

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "locum", label: "Locum" },
];

export function StaffView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const facilitiesQ = useQuery({
    queryKey: ["facilities"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const facilities = facilitiesQ.data?.facilities || [];

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (facilityFilter !== "all") params.set("facilityId", facilityFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["staff", search, facilityFilter, statusFilter],
    queryFn: () => fetchJson(`/api/staff${qs}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["staff"] });

  const items = data?.items || [];

  const disableMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "disable" | "enable" }) => {
      const res = await fetch(`/api/staff/${id}`, {
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
      toast.success(vars.action === "disable" ? "Staff member disabled" : "Staff member enabled");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Staff</h2>
          <p className="text-sm text-slate-500">Manage staff members, professional roles, and facility assignments</p>
        </div>
        {can("staff.manage") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Add Staff
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search by name, staff number, role, email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={facilityFilter} onValueChange={setFacilityFilter}>
            <SelectTrigger className="md:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Facilities</SelectItem>
              {facilities.map((f: any) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_leave">On Leave</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load staff" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6">
          <EmptyState
            title="No staff members found"
            description="Add your first staff member to begin managing HR records."
            action={can("staff.manage") && <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> Add Staff</Button>}
          />
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Professional Role</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Facility / Dept</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Contact</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s: any) => {
                    const initials = `${s.firstName?.[0] || ""}${s.lastName?.[0] || ""}`.toUpperCase();
                    const isActive = s.employmentStatus === "active";
                    return (
                      <tr key={s.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-9 h-9 bg-emerald-100">
                              <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-slate-900">{s.firstName} {s.lastName}</div>
                              <div className="text-xs text-slate-500">{s.user?.email || s.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{s.staffNumber}</code></td>
                        <td className="p-3">
                          <span className="text-slate-700 capitalize">{s.professionalRole?.replace(/_/g, " ") || "—"}</span>
                          {s.professionalRegistrationNumber && (
                            <div className="text-xs text-slate-500">Reg: {s.professionalRegistrationNumber}</div>
                          )}
                        </td>
                        <td className="p-3">
                          {s.primaryFacility ? (
                            <div>
                              <div className="flex items-center gap-1 text-slate-700"><Building2 className="w-3 h-3" /> {s.primaryFacility.facility?.name}</div>
                              {s.primaryFacility.department && (
                                <div className="text-xs text-slate-500">{s.primaryFacility.department.name}</div>
                              )}
                            </div>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="p-3">
                          {s.phone && <div className="text-xs flex items-center gap-1 text-slate-600"><Phone className="w-3 h-3" />{s.phone}</div>}
                          {s.user?.email && <div className="text-xs flex items-center gap-1 text-slate-600"><Mail className="w-3 h-3" />{s.user.email}</div>}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={s.employmentStatus} />
                            <StatusBadge status={s.user?.status || "active"} />
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {can("staff.manage") && (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => setEditing(s)} className="h-8 w-8 p-0">
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                {isActive ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => disableMutation.mutate({ id: s.id, action: "disable" })}
                                    disabled={disableMutation.isPending}
                                    className="h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => disableMutation.mutate({ id: s.id, action: "enable" })}
                                    disabled={disableMutation.isPending}
                                    className="h-8 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
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

      {showNew && <StaffDialog onClose={() => setShowNew(false)} facilities={facilities} />}
      {editing && <StaffDialog staff={editing} onClose={() => setEditing(null)} facilities={facilities} />}
    </div>
  );
}

function StaffDialog({ staff, onClose, facilities }: { staff?: any; onClose: () => void; facilities: any[] }) {
  const qc = useQueryClient();
  const isEdit = !!staff;
  const [form, setForm] = useState({
    username: staff?.user?.username || "",
    password: "",
    firstName: staff?.firstName || "",
    middleName: staff?.middleName || "",
    lastName: staff?.lastName || "",
    email: staff?.email || staff?.user?.email || "",
    phone: staff?.phone || staff?.user?.phone || "",
    professionalRole: staff?.professionalRole || "doctor",
    professionalRegistrationNumber: staff?.professionalRegistrationNumber || "",
    employmentType: staff?.employmentType || "full_time",
    hireDate: staff?.hireDate ? new Date(staff.hireDate).toISOString().slice(0, 10) : "",
    primaryFacilityId: staff?.primaryFacility?.facilityId || (facilities[0]?.id ?? ""),
    departmentId: staff?.primaryFacility?.departmentId || "",
    position: staff?.primaryFacility?.position || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/staff/${staff.id}` : "/api/staff";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit
        ? {
            firstName: form.firstName,
            middleName: form.middleName,
            lastName: form.lastName,
            email: form.email,
            phone: form.phone,
            userEmail: form.email,
            userPhone: form.phone,
            professionalRole: form.professionalRole,
            professionalRegistrationNumber: form.professionalRegistrationNumber,
            employmentType: form.employmentType,
            hireDate: form.hireDate || undefined,
            facilityId: form.primaryFacilityId || undefined,
            departmentId: form.departmentId || undefined,
            position: form.position || undefined,
            action: "add_facility",
          }
        : form;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(isEdit ? "Staff updated" : "Staff created");
      qc.invalidateQueries({ queryKey: ["staff"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Load departments for selected facility on mount
  const [departments, setDepartments] = useState<any[]>([]);
  useEffect(() => {
    if (form.primaryFacilityId) {
      fetch(`/api/departments?facilityId=${form.primaryFacilityId}`)
        .then((r) => r.json())
        .then((d) => setDepartments(d.items || []))
        .catch(() => setDepartments([]));
    }
  }, [form.primaryFacilityId]);
  // Refresh departments when facility changes
  const loadDepartments = async (facilityId: string) => {
    setForm((f) => ({ ...f, primaryFacilityId: facilityId, departmentId: "" }));
    if (!facilityId) {
      setDepartments([]);
      return;
    }
    try {
      const res = await fetch(`/api/departments?facilityId=${facilityId}`);
      const d = await res.json();
      setDepartments(d.items || []);
    } catch {
      setDepartments([]);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Staff Member" : "Add New Staff Member"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update staff information. Changes will also update the linked user account."
              : "A new user account will be created along with the staff record. You can assign roles later via Users Admin."}
          </DialogDescription>
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
          <div className="space-y-1.5">
            <Label>Professional Role</Label>
            <Select value={form.professionalRole} onValueChange={(v) => setForm({ ...form, professionalRole: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROFESSIONAL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Professional Registration #</Label>
            <Input value={form.professionalRegistrationNumber} onChange={(e) => setForm({ ...form, professionalRegistrationNumber: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Employment Type</Label>
            <Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Hire Date</Label>
            <Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Primary Facility</Label>
            <Select value={form.primaryFacilityId} onValueChange={loadDepartments}>
              <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
              <SelectContent>
                {facilities.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={form.departmentId} onValueChange={(v) => setForm({ ...form, departmentId: v })}>
              <SelectTrigger><SelectValue placeholder="Select department (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">—</SelectItem>
                {departments.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Position / Title</Label>
            <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="e.g., Senior Medical Officer" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (!isEdit && (!form.username || !form.password || !form.firstName || !form.lastName || !form.email))}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {mutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
            {isEdit ? "Save Changes" : "Create Staff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

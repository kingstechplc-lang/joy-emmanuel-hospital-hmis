"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Award,
  Plus,
  Search,
  RefreshCcw,
  ShieldCheck,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {EmptyState,
  LoadingState,
  ErrorState,
  formatDate, safeJson, ClearableSearch, usePagination, Pagination} from "@/components/ui-helpers"
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

const STATUS_FILTERS = [
  { value: "all", label: "All Certifications" },
  { value: "active", label: "Active" },
  { value: "expiring", label: "Expiring Soon (90 days)" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

export function CertificationsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canManage =
    user?.roles?.includes("super_admin") ||
    perms.includes("staff.manage") ||
    perms.includes("shift.manage");

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (staffFilter !== "all") params.set("staffId", staffFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["certifications", search, statusFilter, staffFilter],
    queryFn: () => fetchJson(`/api/certifications${qs}`),
  });

  const staffQ = useQuery({
    queryKey: ["staff-for-certifications"],
    queryFn: () => fetchJson("/api/staff"),
  });

  const items = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 10);
  const staffList = staffQ.data?.items || [];

  // Stats
  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((i: any) => i.effectiveStatus === "active" && !i.isExpiringSoon).length;
    const expiring = items.filter((i: any) => i.isExpiringSoon).length;
    const expired = items.filter((i: any) => i.isExpired).length;
    return { total, active, expiring, expired };
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Professional Certifications</h2>
          <p className="text-sm text-slate-500">
            Track staff certifications and licenses with expiry monitoring
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => setShowNew(true)}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" /> Add Certification
          </Button>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total"
          value={stats.total}
          icon={<Award className="w-5 h-5" />}
          color="emerald"
        />
        <StatCard
          label="Active"
          value={stats.active}
          icon={<ShieldCheck className="w-5 h-5" />}
          color="teal"
        />
        <StatCard
          label="Expiring Soon"
          value={stats.expiring}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="amber"
        />
        <StatCard
          label="Expired"
          value={stats.expired}
          icon={<XCircle className="w-5 h-5" />}
          color="rose"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <ClearableSearch value={search} onChange={setSearch} placeholder="Search certification name, issuing body, certificate #" className="pl-0" />
          </div>
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={staffFilter || undefined} onValueChange={setStaffFilter}>
            <SelectTrigger className="md:w-56">
              <SelectValue placeholder="All Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staffList.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.firstName} {s.lastName} — {s.staffNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* List */}
      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load certifications" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No certifications found"
              description="Add staff professional certifications to track expiry and renewal dates."
              icon={Award}
              action={
                canManage && (
                  <Button
                    onClick={() => setShowNew(true)}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Plus className="w-4 h-4" /> Add Certification
                  </Button>
                )
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Certification</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Issuing Body</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Issue Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Expiry Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((c: any) => {
                    const rowClass = c.isExpired
                      ? "bg-rose-50/40 hover:bg-rose-50"
                      : c.isExpiringSoon
                      ? "bg-amber-50/40 hover:bg-amber-50"
                      : "hover:bg-slate-50";
                    return (
                      <tr key={c.id} className={`border-b ${rowClass}`}>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">
                            {c.staff?.firstName} {c.staff?.lastName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {c.staff?.staffNumber} • {c.staff?.professionalRole?.replace(/_/g, " ") || "—"}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{c.certificationName}</div>
                          {c.certificateNumber && (
                            <div className="text-xs text-slate-500">{c.certificateNumber}</div>
                          )}
                        </td>
                        <td className="p-3 text-slate-700">
                          {c.issuingBody || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="p-3">{formatDate(c.issueDate)}</td>
                        <td className="p-3">
                          {c.expiryDate ? (
                            <div>
                              <div className="text-slate-700">{formatDate(c.expiryDate)}</div>
                              {c.daysToExpiry != null && (
                                <div
                                  className={`text-xs ${
                                    c.isExpired
                                      ? "text-rose-600"
                                      : c.isExpiringSoon
                                      ? "text-amber-600"
                                      : "text-slate-500"
                                  }`}
                                >
                                  {c.isExpired
                                    ? `${Math.abs(c.daysToExpiry)} days ago`
                                    : `in ${c.daysToExpiry} days`}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">No expiry</span>
                          )}
                        </td>
                        <td className="p-3">
                          <CertStatusBadge
                            isExpired={c.isExpired}
                            isExpiringSoon={c.isExpiringSoon}
                            status={c.status}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </CardContent>
        </Card>
      )}

      {showNew && <NewCertificationDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function CertStatusBadge({
  isExpired,
  isExpiringSoon,
  status,
}: {
  isExpired: boolean;
  isExpiringSoon: boolean;
  status: string;
}) {
  if (status === "revoked") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-rose-100 text-rose-700 border-rose-200">
        revoked
      </span>
    );
  }
  if (isExpired) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-rose-100 text-rose-700 border-rose-200">
        expired
      </span>
    );
  }
  if (isExpiringSoon) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-amber-100 text-amber-700 border-amber-200">
        expiring soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">
      active
    </span>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: "emerald" | "teal" | "amber" | "rose";
}) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center border ${colorMap[color]}`}
        >
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
          <div className="text-xs text-slate-500">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function NewCertificationDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    staffId: "",
    certificationName: "",
    issuingBody: "",
    issueDate: new Date().toISOString().slice(0, 10),
    expiryDate: "",
    certificateNumber: "",
    status: "active",
    notes: "",
  });

  const { data: staffData } = useQuery({
    queryKey: ["staff-for-cert-dialog"],
    queryFn: () => fetchJson("/api/staff"),
  });
  const staffList = staffData?.items || [];

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/certifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: form.staffId,
          certificationName: form.certificationName,
          issuingBody: form.issuingBody || undefined,
          issueDate: `${form.issueDate}T00:00:00`,
          expiryDate: form.expiryDate ? `${form.expiryDate}T00:00:00` : undefined,
          certificateNumber: form.certificateNumber || undefined,
          status: form.status,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Certification added successfully");
      qc.invalidateQueries({ queryKey: ["certifications"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <Award className="w-5 h-5 inline mr-2" />
            Add Professional Certification
          </DialogTitle>
          <DialogDescription>
            Record a staff member&apos;s professional certification or license.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Staff Member</FieldLabel>
            <Select
              value={form.staffId || undefined}
              onValueChange={(v) => setForm({ ...form, staffId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {staffList.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} — {s.staffNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Certification Name</FieldLabel>
            <Input
              value={form.certificationName}
              onChange={(e) => setForm({ ...form, certificationName: e.target.value })}
              placeholder="e.g., Registered Nurse (RN) License"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Issuing Body</Label>
            <Input
              value={form.issuingBody}
              onChange={(e) => setForm({ ...form, issuingBody: e.target.value })}
              placeholder="e.g., Nursing and Midwifery Council of Ghana"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Certificate Number</Label>
            <Input
              value={form.certificateNumber}
              onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })}
              placeholder="e.g., NMC-2024-001234"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Issue Date</FieldLabel>
            <Input
              type="date"
              value={form.issueDate}
              onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Expiry Date</Label>
            <Input
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Status</Label>
            <Select
              value={form.status || undefined}
              onValueChange={(v) => setForm({ ...form, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="Optional notes about this certification..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              !form.staffId ||
              !form.certificationName ||
              !form.issueDate
            }
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {mutation.isPending ? (
              <RefreshCcw className="w-4 h-4 animate-spin" />
            ) : (
              <Award className="w-4 h-4" />
            )}
            Add Certification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

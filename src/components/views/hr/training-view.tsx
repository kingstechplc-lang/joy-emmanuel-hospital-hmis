"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  GraduationCap,
  Plus,
  Search,
  Award,
  Clock,
  RefreshCcw,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState,
  LoadingState,
  ErrorState,
  StatusBadge,
  formatDate,
} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

export function TrainingView() {
  const [tab, setTab] = useState("all");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Training Records</h2>
        <p className="text-sm text-slate-500">
          Track staff training programs, courses, and certifications issued
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All Training</TabsTrigger>
          <TabsTrigger value="by_staff">By Staff</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          <AllTrainingTab />
        </TabsContent>
        <TabsContent value="by_staff" className="mt-4">
          <ByStaffTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AllTrainingTab() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canManage =
    user?.roles?.includes("super_admin") ||
    perms.includes("staff.manage") ||
    perms.includes("shift.manage");

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showNew, setShowNew] = useState(false);

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (staffFilter !== "all") params.set("staffId", staffFilter);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["training", search, staffFilter, dateFrom, dateTo],
    queryFn: () => fetchJson(`/api/training${qs}`),
  });

  const staffQ = useQuery({
    queryKey: ["staff-for-training"],
    queryFn: () => fetchJson("/api/staff"),
  });

  const items = data?.items || [];
  const staffList = staffQ.data?.items || [];

  // Stats
  const stats = useMemo(() => {
    const total = items.length;
    const withCert = items.filter((i: any) => i.certificateIssued).length;
    const totalHours = items.reduce(
      (sum: number, i: any) => sum + (i.durationHours || 0),
      0
    );
    const uniqueStaff = new Set(items.map((i: any) => i.staffId)).size;
    return { total, withCert, totalHours, uniqueStaff };
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Trainings" value={stats.total} icon={<GraduationCap className="w-5 h-5" />} color="emerald" />
        <StatCard label="Certificates Issued" value={stats.withCert} icon={<Award className="w-5 h-5" />} color="teal" />
        <StatCard label="Total Hours" value={stats.totalHours} icon={<Clock className="w-5 h-5" />} color="amber" />
        <StatCard label="Staff Trained" value={stats.uniqueStaff} icon={<CalendarDays className="w-5 h-5" />} color="slate" />
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input
              className="pl-8"
              placeholder="Search training name, provider, certificate #"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="md:w-40"
            placeholder="From"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="md:w-40"
            placeholder="To"
          />
          {canManage && (
            <Button
              onClick={() => setShowNew(true)}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" /> Record Training
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load training records" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No training records found"
              description="Record your first staff training to begin tracking professional development."
              icon={GraduationCap}
              action={
                canManage && (
                  <Button
                    onClick={() => setShowNew(true)}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Plus className="w-4 h-4" /> Record Training
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
                    <th className="text-left p-3 font-semibold text-slate-700">Training</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Provider</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Hours</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Certificate</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t: any) => (
                    <tr key={t.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-900">
                          {t.staff?.firstName} {t.staff?.lastName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {t.staff?.staffNumber} • {t.staff?.professionalRole?.replace(/_/g, " ") || "—"}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-slate-900 font-medium">{t.trainingName}</div>
                        {t.notes && (
                          <div className="text-xs text-slate-500 truncate max-w-xs" title={t.notes}>
                            {t.notes}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-slate-700">{t.provider || <span className="text-slate-400">—</span>}</td>
                      <td className="p-3">{formatDate(t.trainingDate)}</td>
                      <td className="p-3 text-slate-700">
                        {t.durationHours != null ? `${t.durationHours}h` : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="p-3">
                        {t.certificateIssued ? (
                          <div className="flex flex-col gap-0.5">
                            <StatusBadge status="issued" />
                            {t.certificateNumber && (
                              <span className="text-xs text-slate-500">{t.certificateNumber}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No</span>
                        )}
                      </td>
                      <td className="p-3">
                        {t.expiryDate ? formatDate(t.expiryDate) : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showNew && <NewTrainingDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function ByStaffTab() {
  const [staffId, setStaffId] = useState("");

  const { data: staffData } = useQuery({
    queryKey: ["staff-for-training-by-staff"],
    queryFn: () => fetchJson("/api/staff"),
  });
  const staffList = staffData?.items || [];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["training", "by_staff", staffId],
    queryFn: () => fetchJson(`/api/training?staffId=${staffId}`),
    enabled: !!staffId,
  });

  const items = data?.items || [];
  const selectedStaff = staffList.find((s: any) => s.id === staffId);

  const totalHours = items.reduce(
    (sum: number, i: any) => sum + (i.durationHours || 0),
    0
  );
  const certCount = items.filter((i: any) => i.certificateIssued).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3">
          <Select value={staffId || undefined} onValueChange={setStaffId}>
            <SelectTrigger className="md:w-80">
              <SelectValue placeholder="Select staff member to view training history" />
            </SelectTrigger>
            <SelectContent>
              {staffList.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.firstName} {s.lastName} — {s.staffNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!staffId ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="Select a staff member"
              description="Choose a staff member from the dropdown to view their training history."
              icon={GraduationCap}
            />
          </CardContent>
        </Card>
      ) : isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load training records" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No training records"
              description={`${selectedStaff?.firstName} ${selectedStaff?.lastName} has no recorded training yet.`}
              icon={GraduationCap}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-slate-500">Total Trainings</div>
                <div className="text-2xl font-bold text-slate-900">{items.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-slate-500">Total Hours</div>
                <div className="text-2xl font-bold text-emerald-700">{totalHours}h</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-slate-500">Certificates</div>
                <div className="text-2xl font-bold text-teal-700">{certCount}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-600">
                Training history for {selectedStaff?.firstName} {selectedStaff?.lastName}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr>
                      <th className="text-left p-3 font-semibold text-slate-700">Training</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Provider</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Hours</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Certificate</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((t: any) => (
                      <tr key={t.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{t.trainingName}</div>
                          {t.notes && (
                            <div className="text-xs text-slate-500 truncate max-w-xs" title={t.notes}>
                              {t.notes}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-slate-700">{t.provider || <span className="text-slate-400">—</span>}</td>
                        <td className="p-3">{formatDate(t.trainingDate)}</td>
                        <td className="p-3 text-slate-700">
                          {t.durationHours != null ? `${t.durationHours}h` : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="p-3">
                          {t.certificateIssued ? (
                            <div className="flex flex-col gap-0.5">
                              <StatusBadge status="issued" />
                              {t.certificateNumber && (
                                <span className="text-xs text-slate-500">{t.certificateNumber}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">No</span>
                          )}
                        </td>
                        <td className="p-3">
                          {t.expiryDate ? formatDate(t.expiryDate) : <span className="text-slate-400">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
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
  color: "emerald" | "teal" | "amber" | "slate";
}) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
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

function NewTrainingDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    staffId: "",
    trainingName: "",
    provider: "",
    trainingDate: new Date().toISOString().slice(0, 10),
    durationHours: "",
    certificateIssued: false,
    certificateNumber: "",
    expiryDate: "",
    notes: "",
  });

  const { data: staffData } = useQuery({
    queryKey: ["staff-for-training-dialog"],
    queryFn: () => fetchJson("/api/staff"),
  });
  const staffList = staffData?.items || [];

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: form.staffId,
          trainingName: form.trainingName,
          provider: form.provider || undefined,
          trainingDate: `${form.trainingDate}T00:00:00`,
          durationHours: form.durationHours ? Number(form.durationHours) : undefined,
          certificateIssued: form.certificateIssued,
          certificateNumber: form.certificateNumber || undefined,
          expiryDate: form.expiryDate ? `${form.expiryDate}T00:00:00` : undefined,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Training recorded successfully");
      qc.invalidateQueries({ queryKey: ["training"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <GraduationCap className="w-5 h-5 inline mr-2" />
            Record Training
          </DialogTitle>
          <DialogDescription>
            Record a training program or course completed by a staff member.
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
            <FieldLabel required>Training Name</FieldLabel>
            <Input
              value={form.trainingName}
              onChange={(e) => setForm({ ...form, trainingName: e.target.value })}
              placeholder="e.g., Basic Life Support (BLS) Certification"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Provider / Institution</Label>
            <Input
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              placeholder="e.g., Ghana Health Service"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Training Date</FieldLabel>
            <Input
              type="date"
              value={form.trainingDate}
              onChange={(e) => setForm({ ...form, trainingDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Duration (hours)</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={form.durationHours}
              onChange={(e) => setForm({ ...form, durationHours: e.target.value })}
              placeholder="e.g., 8"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Certificate Expiry Date</Label>
            <Input
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
              <div>
                <Label>Certificate Issued</Label>
                <p className="text-xs text-slate-500">
                  Was a certificate issued upon completion?
                </p>
              </div>
              <Switch
                checked={form.certificateIssued}
                onCheckedChange={(v) => setForm({ ...form, certificateIssued: v })}
              />
            </div>
          </div>
          {form.certificateIssued && (
            <div className="space-y-1.5 md:col-span-2">
              <Label>Certificate Number</Label>
              <Input
                value={form.certificateNumber}
                onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })}
                placeholder="e.g., BLS-2024-001234"
              />
            </div>
          )}
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="Optional notes about the training..."
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
              mutation.isPending || !form.staffId || !form.trainingName || !form.trainingDate
            }
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {mutation.isPending ? (
              <RefreshCcw className="w-4 h-4 animate-spin" />
            ) : (
              <GraduationCap className="w-4 h-4" />
            )}
            Record Training
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

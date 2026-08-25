"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Building2, Search, Plus, Edit, Trash2, Eye, Activity, Layers, Users,
  ShieldCheck, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, PageHeader, MiniStatCard,
  formatDate, safeJson,
} from "@/components/ui-helpers";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  PROVIDER_TYPES, PROVIDER_STATUSES, statusColor, labelOf, fetchJson,
} from "./insurance-providers/shared";
import { ProviderDialog } from "./insurance-providers/provider-dialog";
import { ProviderDetailsDialog } from "./insurance-providers/provider-details";

const STATUS_FILTERS = [{ value: "all", label: "All Statuses" }, ...PROVIDER_STATUSES.map((s) => ({ value: s.value, label: s.label }))];
const TYPE_FILTERS = [{ value: "all", label: "All Types" }, ...PROVIDER_TYPES.map((t) => ({ value: t.value, label: t.label }))];

export function InsuranceProvidersAdminView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canManage = can("insurance_provider.manage") || can("settings.manage");
  const canArchive = can("insurance_provider.archive") || can("insurance_provider.manage") || can("settings.manage");

  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();
  const [tab, setTab] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Insurance Providers"
        description="Central master directory for insurance companies, NHIS, corporate payers, and third-party payers. Manage providers, plans, coverage, eligibility, and authorizations."
        icon={Building2}
        gradient="from-blue-500 to-indigo-600"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5"><Activity className="w-4 h-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="providers" className="gap-1.5"><Building2 className="w-4 h-4" /> Providers</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="providers" className="space-y-4">
          <ProvidersTab
            canManage={canManage}
            canArchive={canArchive}
            search={search} setSearch={setSearch}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            typeFilter={typeFilter} setTypeFilter={setTypeFilter}
            showNew={showNew} setShowNew={setShowNew}
            editing={editing} setEditing={setEditing}
            viewing={viewing} setViewing={setViewing}
            confirmAction={confirmAction}
            confirmDialogEl={confirmDialogEl}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// DASHBOARD TAB
// =====================================================================
function DashboardTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["insurance-providers-stats"],
    queryFn: () => fetchJson(`/api/insurance-providers?stats=1`),
  });
  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message="Failed to load stats" onRetry={() => refetch()} />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MiniStatCard label="Total Providers" value={data.total} icon={Building2} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="Active" value={data.active} icon={ShieldCheck} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Inactive" value={data.inactive} icon={Building2} gradient="from-slate-500 to-slate-600" />
        <MiniStatCard label="Suspended" value={data.suspended} icon={AlertTriangle} gradient="from-amber-500 to-amber-600" />
        <MiniStatCard label="NHIS Providers" value={data.nhisCount} icon={Building2} gradient="from-emerald-500 to-teal-600" />
        <MiniStatCard label="Private Providers" value={data.privateCount} icon={Building2} gradient="from-blue-500 to-indigo-600" />
        <MiniStatCard label="Total Plans" value={data.totalPlans} icon={Layers} gradient="from-violet-500 to-violet-600" />
        <MiniStatCard label="Active Plans" value={data.activePlans} icon={Layers} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Expiring Plans" value={data.expiringPlans} icon={AlertTriangle} gradient="from-amber-500 to-amber-600" />
        <MiniStatCard label="Patients Covered" value={data.patientsCovered} icon={Users} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="Pending Eligibility" value={data.pendingEligibility} icon={Activity} gradient="from-amber-500 to-amber-600" />
        <MiniStatCard label="Pending Auths" value={data.pendingAuths} icon={ShieldCheck} gradient="from-rose-500 to-rose-600" />
      </div>
    </div>
  );
}

// =====================================================================
// PROVIDERS TAB
// =====================================================================
function ProvidersTab(props: any) {
  const { canManage, canArchive, search, setSearch, statusFilter, setStatusFilter, typeFilter, setTypeFilter, showNew, setShowNew, editing, setEditing, viewing, setViewing, confirmAction, confirmDialogEl } = props;

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (typeFilter !== "all") params.set("providerType", typeFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["insurance-providers-admin", search, statusFilter, typeFilter],
    queryFn: () => fetchJson(`/api/insurance-providers${qs}`),
  });
  const items = data?.items || [];

  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["insurance-providers-admin"] });
    qc.invalidateQueries({ queryKey: ["insurance-providers-stats"] });
  };

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/insurance-providers/${id}`, { method: "DELETE" });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success("Provider deactivated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm text-slate-500">{items.length} provider(s) shown</div>
        {canManage && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Add Provider
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2 lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search by name, code, legal name, email, phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_FILTERS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TYPE_FILTERS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load providers" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No insurance providers found" description="Adjust filters or add a new provider." /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Provider</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Contact</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Plans</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patients</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Claims</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p: any) => (
                    <tr key={p.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          <div>
                            <div className="font-medium text-slate-900">{p.name}</div>
                            <div className="text-xs text-slate-500"><code>{p.code}</code>{p.shortName && <span> · {p.shortName}</span>}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3"><Badge variant="outline">{labelOf(PROVIDER_TYPES, p.providerType)}</Badge></td>
                      <td className="p-3 text-xs">
                        {p.phone && <div>{p.phone}</div>}
                        {p.email && <div className="text-slate-500">{p.email}</div>}
                        {!p.phone && !p.email && "—"}
                      </td>
                      <td className="p-3 text-center">{p._count?.plans || 0}</td>
                      <td className="p-3 text-center">{p._count?.patientInsurance || 0}</td>
                      <td className="p-3 text-center">{p._count?.insuranceClaims || 0}</td>
                      <td className="p-3">
                        <Badge className={`bg-${statusColor(p.status)}-100 text-${statusColor(p.status)}-700`}>
                          {labelOf(PROVIDER_STATUSES, p.status)}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setViewing(p.id)} title="View details" className="h-8 w-8 p-0">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {canManage && (
                            <Button size="sm" variant="ghost" onClick={() => setEditing(p)} title="Edit" className="h-8 w-8 p-0">
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {canArchive && (
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => {
                                confirmAction({
                                  title: `Deactivate "${p.name}"?`,
                                  description: "This sets the provider status to inactive. Historical claims and patient insurance remain accessible.",
                                  confirmText: "Deactivate",
                                  variant: "warning",
                                  details: (
                                    <div>
                                      <div><strong>Provider:</strong> {p.name} ({p.code})</div>
                                      <div><strong>Type:</strong> {labelOf(PROVIDER_TYPES, p.providerType)}</div>
                                      <div><strong>Patients:</strong> {p._count?.patientInsurance || 0}</div>
                                      <div><strong>Claims:</strong> {p._count?.insuranceClaims || 0}</div>
                                    </div>
                                  ),
                                  onConfirm: () => archiveMutation.mutate(p.id),
                                });
                              }}
                              title="Deactivate"
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

      {showNew && <ProviderDialog onClose={() => setShowNew(false)} />}
      {editing && <ProviderDialog provider={editing} onClose={() => setEditing(null)} />}
      {viewing && <ProviderDetailsDialog providerId={viewing} onClose={() => setViewing(null)} />}
      {confirmDialogEl}
    </div>
  );
}

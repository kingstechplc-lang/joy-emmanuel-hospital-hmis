"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Truck,
  Plus,
  Pencil,
  Eye,
  CheckCircle2,
  Ban,
  Power,
  Star,
  StarOff,
  ShieldCheck,
  Download,
  FileText,
  BarChart3,
  ClipboardList,
  AlertTriangle,
  Calendar,
  Phone,
  Mail,
  Globe,
  MapPin,
  Building2,
  CreditCard,
  Wallet,
  Package,
  ClipboardCheck,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState,
  LoadingState,
  ErrorState,
  StatusBadge,
  formatDate,
  formatRelative,
  safeJson,
  PageHeader,
  MiniStatCard,
  ClearableSearch,
  usePagination,
  Pagination,
  ModuleHelp,
} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

// =====================================================================
// Constants
// =====================================================================
const SUPPLIER_TYPES: { value: string; label: string }[] = [
  { value: "manufacturer", label: "Manufacturer" },
  { value: "distributor", label: "Distributor" },
  { value: "wholesaler", label: "Wholesaler" },
  { value: "retailer", label: "Retailer" },
  { value: "importer", label: "Importer" },
  { value: "local_supplier", label: "Local Supplier" },
  { value: "service_provider", label: "Service Provider" },
  { value: "equipment_vendor", label: "Equipment Vendor" },
  { value: "contractor", label: "Contractor" },
  { value: "other", label: "Other" },
];

const CATEGORIES: { value: string; label: string }[] = [
  { value: "pharmaceutical", label: "Pharmaceutical" },
  { value: "medical_supplies", label: "Medical Supplies" },
  { value: "laboratory", label: "Laboratory" },
  { value: "reagents", label: "Reagents" },
  { value: "medical_equipment", label: "Medical Equipment" },
  { value: "surgical", label: "Surgical" },
  { value: "ppe", label: "PPE" },
  { value: "cleaning", label: "Cleaning" },
  { value: "office_supplies", label: "Office Supplies" },
  { value: "it", label: "IT" },
  { value: "maintenance", label: "Maintenance" },
  { value: "furniture", label: "Furniture" },
  { value: "ambulance", label: "Ambulance" },
  { value: "mortuary", label: "Mortuary" },
  { value: "imaging", label: "Imaging" },
  { value: "blood_bank", label: "Blood Bank" },
  { value: "catering", label: "Catering" },
  { value: "security", label: "Security" },
  { value: "facility_services", label: "Facility Services" },
  { value: "other", label: "Other" },
];

const PAYMENT_TERMS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "immediate", label: "Immediate" },
  { value: "7_days", label: "7 Days" },
  { value: "15_days", label: "15 Days" },
  { value: "30_days", label: "30 Days" },
  { value: "45_days", label: "45 Days" },
  { value: "60_days", label: "60 Days" },
  { value: "90_days", label: "90 Days" },
  { value: "custom", label: "Custom" },
];

const VAT_STATUSES = [
  { value: "registered", label: "Registered" },
  { value: "not_registered", label: "Not Registered" },
  { value: "exempt", label: "Exempt" },
];

const COMPLIANCE_STATUSES = [
  { value: "compliant", label: "Compliant" },
  { value: "partially_compliant", label: "Partially Compliant" },
  { value: "non_compliant", label: "Non-Compliant" },
  { value: "under_review", label: "Under Review" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "pending_verification", label: "Pending Verification" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
];

function labelFor(list: { value: string; label: string }[], value?: string | null): string {
  if (!value) return "—";
  const found = list.find((x) => x.value === value);
  return found ? found.label : value.replace(/_/g, " ");
}

function formatGHS(amount: number | null | undefined): string {
  if (amount == null) return "GHS —";
  return `GHS ${Number(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Status pill color mapping for compliance / preferred
function SupplierStatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700 border-emerald-200",
    pending_verification: "bg-amber-100 text-amber-700 border-amber-200",
    suspended: "bg-rose-100 text-rose-700 border-rose-200",
    inactive: "bg-slate-100 text-slate-600 border-slate-200",
  };
  const cls = map[status] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function CompliancePill({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  const map: Record<string, string> = {
    compliant: "bg-emerald-100 text-emerald-700 border-emerald-200",
    partially_compliant: "bg-amber-100 text-amber-700 border-amber-200",
    non_compliant: "bg-rose-100 text-rose-700 border-rose-200",
    under_review: "bg-blue-100 text-blue-700 border-blue-200",
  };
  const cls = map[status] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function PreferredBadge({ preferred }: { preferred?: boolean | null }) {
  if (!preferred) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">
      <Star className="w-3 h-3" /> Preferred
    </span>
  );
}

// =====================================================================
// Fetch helpers
// =====================================================================
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

// =====================================================================
// Main view
// =====================================================================
export function SuppliersView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canView = can("inventory.view");
  const canManage = can("procurement.manage");

  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");

  // ---- All Suppliers tab state ----
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [preferredFilter, setPreferredFilter] = useState("all");
  const [complianceFilter, setComplianceFilter] = useState("all");

  // ---- Dialogs ----
  const [showNew, setShowNew] = useState(false);
  const [editSupplier, setEditSupplier] = useState<any | null>(null);
  const [detailSupplierId, setDetailSupplierId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    qc.invalidateQueries({ queryKey: ["supplier-stats"] });
  };

  // ---- List query (with filters) ----
  const listQueryStr = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);
    if (typeFilter && typeFilter !== "all") params.set("supplierType", typeFilter);
    if (preferredFilter && preferredFilter !== "all") params.set("isPreferred", preferredFilter);
    if (complianceFilter && complianceFilter !== "all") params.set("complianceStatus", complianceFilter);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [search, statusFilter, categoryFilter, typeFilter, preferredFilter, complianceFilter]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["suppliers", listQueryStr],
    queryFn: () => fetchJson(`/api/suppliers${listQueryStr}`),
    enabled: canView,
  });

  const items = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } =
    usePagination(items, 15);

  const handleExport = () => {
    window.open(`/api/suppliers/export${listQueryStr}`, "_blank");
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setTypeFilter("all");
    setPreferredFilter("all");
    setComplianceFilter("all");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Suppliers"
        description="Manage vendor relationships, approvals, compliance & procurement performance."
        icon={Truck}
        gradient="from-blue-500 to-indigo-600"
        actions={
          <>
            <ModuleHelp
              title="Suppliers"
              buttonLabel="Help"
              sections={[
                {
                  title: "Supplier Lifecycle",
                  content:
                    "Every supplier moves through a defined lifecycle:\n" +
                    "  1. pending_verification — newly created, awaiting review\n" +
                    "  2. active — approved & available for purchase orders\n" +
                    "  3. suspended — temporarily blocked (requires a reason)\n" +
                    "  4. inactive — deactivated (e.g. ceased trading)\n\n" +
                    "Use the lifecycle actions (Approve, Suspend, Activate, Deactivate, Verify) to transition suppliers. All actions are gated by the procurement.manage permission and are audit-logged.",
                },
                {
                  title: "Categories & Types",
                  content:
                    "Each supplier is classified by:\n" +
                    "  • Category — what they supply (pharmaceutical, medical_supplies, laboratory, surgical, ppe, imaging, blood_bank, etc.)\n" +
                    "  • Type — their business model (manufacturer, distributor, wholesaler, retailer, importer, local_supplier, service_provider, equipment_vendor, contractor)\n\n" +
                    "Use these consistently for filtering and reporting. A local distributor of pharmaceuticals would be Type=distributor, Category=pharmaceutical.",
                },
                {
                  title: "Onboarding & Approval",
                  content:
                    "New suppliers default to 'pending_verification'. Before approving:\n" +
                    "  • Verify their business registration number (Registrar General's Department)\n" +
                    "  • Confirm their Ghana TIN (Tax Identification Number)\n" +
                    "  • Check VAT status (registered / not_registered / exempt)\n" +
                    "  • Validate their GhanaPost digital address\n" +
                    "  • Upload supporting documents (registration certificate, tax clearance, VAT certificate, ISO, insurance)\n\n" +
                    "Click 'Verify' to mark a supplier as compliance-verified, then 'Approve' to make them active.",
                },
                {
                  title: "Products & Pricing",
                  content:
                    "The Products tab inside each supplier record tracks:\n" +
                    "  • Supplier's item code / SKU (for cross-referencing on their invoices)\n" +
                    "  • Negotiated purchase price\n" +
                    "  • Minimum order quantity (MOQ)\n" +
                    "  • Lead time in days\n" +
                    "  • Last purchase price & date (for trend analysis)\n\n" +
                    "Mark a supplier as 'preferred' for a specific item so the procurement system suggests them first when stock is low.",
                },
                {
                  title: "Performance & Compliance",
                  content:
                    "Track supplier quality through:\n" +
                    "  • Performance rating (0–100)\n" +
                    "  • Periodic evaluations (per quarter/year) with criteria: quality, delivery, pricing, responsiveness, overall\n" +
                    "  • Complaints (with severity: low/medium/high/critical) tied to specific purchase orders\n" +
                    "  • Compliance status (compliant / partially_compliant / non_compliant / under_review)\n\n" +
                    "Expiring documents (e.g. licenses, insurance) surface in the Dashboard so you can chase renewals before they lapse.",
                },
                {
                  title: "Procurement Integration",
                  content:
                    "Suppliers integrate with the Purchase Orders module:\n" +
                    "  • Each PO references exactly one supplier\n" +
                    "  • Total spend & order counts are aggregated automatically\n" +
                    "  • The last 10 POs are visible inside the supplier's detail view\n" +
                    "  • Pending POs and pending deliveries are surfaced in the Dashboard\n\n" +
                    "Use the Reports tab to export a Supplier Directory, analyse spend by supplier, identify expiring documents, summarise performance, and review compliance status.",
                },
              ]}
            />
            <Button
              onClick={() => setShowNew(true)}
              disabled={!canManage}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" /> New Supplier
            </Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5">
            <Truck className="w-3.5 h-3.5" /> All Suppliers
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Reports
          </TabsTrigger>
        </TabsList>

        {/* ============= TAB 1: DASHBOARD ============= */}
        <TabsContent value="dashboard">
          <DashboardTab onNavigateToSuppliers={() => setActiveTab("list")} />
        </TabsContent>

        {/* ============= TAB 2: ALL SUPPLIERS ============= */}
        <TabsContent value="list">
          <Card>
            <CardContent className="p-4 space-y-3">
              {/* Search + filter row */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="lg:col-span-2">
                  <ClearableSearch
                    value={search}
                    onChange={setSearch}
                    placeholder="Search by name, code, contact, phone, email, TIN, registration #, city…"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {SUPPLIER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={preferredFilter} onValueChange={setPreferredFilter}>
                  <SelectTrigger><SelectValue placeholder="Preferred" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    <SelectItem value="true">Preferred Only</SelectItem>
                    <SelectItem value="false">Non-Preferred</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={complianceFilter} onValueChange={setComplianceFilter}>
                  <SelectTrigger><SelectValue placeholder="Compliance" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Compliance</SelectItem>
                    {COMPLIANCE_STATUSES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={clearFilters} className="flex-1">
                    Clear
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExport}
                    className="flex-1 gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </Button>
                </div>
              </div>

              {/* Table */}
              {isLoading ? (
                <LoadingState rows={6} />
              ) : isError ? (
                <ErrorState message="Failed to load suppliers" onRetry={() => refetch()} />
              ) : items.length === 0 ? (
                <EmptyState
                  title="No suppliers found"
                  description="Try adjusting your filters or add a new supplier to begin."
                  icon={Truck}
                  action={
                    <Button
                      onClick={() => setShowNew(true)}
                      disabled={!canManage}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Plus className="w-4 h-4" /> New Supplier
                    </Button>
                  }
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Name</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Code</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Category</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Contact</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Phone</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Preferred</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Compliance</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedItems.map((s: any) => (
                        <tr key={s.id} className="border-b hover:bg-blue-50/40">
                          <td className="p-3">
                            <button
                              onClick={() => setDetailSupplierId(s.id)}
                              className="flex items-center gap-2 text-left hover:underline"
                            >
                              <div className="w-7 h-7 rounded bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                                <Truck className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className="font-medium text-slate-900">{s.name}</div>
                                {s.city && (
                                  <div className="text-xs text-slate-500">{s.city}</div>
                                )}
                              </div>
                            </button>
                          </td>
                          <td className="p-3 font-mono text-xs text-slate-700">{s.code}</td>
                          <td className="p-3 text-xs">{labelFor(CATEGORIES, s.category)}</td>
                          <td className="p-3 text-xs">{labelFor(SUPPLIER_TYPES, s.supplierType)}</td>
                          <td className="p-3 text-xs">{s.contactPerson || "—"}</td>
                          <td className="p-3 text-xs">{s.phone || "—"}</td>
                          <td className="p-3"><SupplierStatusPill status={s.status} /></td>
                          <td className="p-3"><PreferredBadge preferred={s.isPreferred} /></td>
                          <td className="p-3"><CompliancePill status={s.complianceStatus} /></td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setDetailSupplierId(s.id)}
                                title="View"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              {canManage && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => setEditSupplier(s)}
                                    title="Edit"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <LifecycleMenu supplier={s} onDone={invalidate} />
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {items.length > 0 && (
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============= TAB 3: REPORTS ============= */}
        <TabsContent value="reports">
          <ReportsTab onPickSupplier={(id) => setDetailSupplierId(id)} />
        </TabsContent>
      </Tabs>

      {/* ============= New / Edit Supplier Dialog ============= */}
      <SupplierDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => {
          setShowNew(false);
          invalidate();
        }}
      />
      {editSupplier && (
        <SupplierDialog
          open
          onClose={() => setEditSupplier(null)}
          onCreated={() => {
            setEditSupplier(null);
            invalidate();
          }}
          existing={editSupplier}
        />
      )}

      {/* ============= Supplier Detail Dialog ============= */}
      {detailSupplierId && (
        <SupplierDetailDialog
          supplierId={detailSupplierId}
          onClose={() => setDetailSupplierId(null)}
          onEdit={(s) => {
            setDetailSupplierId(null);
            setEditSupplier(s);
          }}
          onExport={handleExport}
          onChanged={invalidate}
        />
      )}
    </div>
  );
}

// =====================================================================
// TAB 1: DASHBOARD
// =====================================================================
function DashboardTab({ onNavigateToSuppliers }: { onNavigateToSuppliers: () => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["supplier-stats"],
    queryFn: () => fetchJson("/api/suppliers/stats"),
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError)
    return <ErrorState message="Failed to load supplier statistics" onRetry={() => refetch()} />;

  const stats = data || {};
  const byStatus = stats.byStatus || {};
  const byCategory: { key: string; count: number }[] = stats.byCategory || [];

  return (
    <div className="space-y-4">
      {/* Row 1: top-line numbers */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MiniStatCard
          label="Total Suppliers"
          value={stats.totalSuppliers ?? 0}
          icon={Truck}
          gradient="from-blue-500 to-indigo-600"
        />
        <MiniStatCard
          label="Active"
          value={byStatus.active ?? 0}
          icon={CheckCircle2}
          gradient="from-emerald-500 to-green-600"
        />
        <MiniStatCard
          label="Pending Verification"
          value={byStatus.pending_verification ?? 0}
          icon={ShieldCheck}
          gradient="from-amber-500 to-orange-600"
        />
        <MiniStatCard
          label="Suspended"
          value={byStatus.suspended ?? 0}
          icon={Ban}
          gradient="from-rose-500 to-red-600"
        />
        <MiniStatCard
          label="Preferred"
          value={stats.preferred ?? 0}
          icon={Star}
          gradient="from-emerald-500 to-teal-600"
        />
      </div>

      {/* Row 2: spend & procurement */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MiniStatCard
          label="Total Spend"
          value={formatGHS(stats.totalSpend ?? 0)}
          icon={Wallet}
          gradient="from-purple-500 to-fuchsia-600"
        />
        <MiniStatCard
          label="Pending POs"
          value={stats.pendingPOs ?? 0}
          icon={ClipboardList}
          gradient="from-cyan-500 to-blue-600"
        />
        <MiniStatCard
          label="Pending Deliveries"
          value={stats.pendingDeliveries ?? 0}
          icon={Package}
          gradient="from-blue-500 to-indigo-600"
        />
        <MiniStatCard
          label="Expiring Documents"
          value={stats.expiringDocs ?? 0}
          icon={Calendar}
          gradient="from-amber-500 to-yellow-600"
          sublabel="within 30 days"
        />
        <MiniStatCard
          label="Expired Documents"
          value={stats.expiredDocs ?? 0}
          icon={AlertTriangle}
          gradient="from-rose-500 to-red-600"
        />
      </div>

      {/* Row 3: by category breakdown (10th card as a table) */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" /> Suppliers by Category
            </h3>
            <Button size="sm" variant="outline" onClick={onNavigateToSuppliers} className="gap-1.5">
              <Truck className="w-3.5 h-3.5" /> View All Suppliers
            </Button>
          </div>
          {byCategory.length === 0 ? (
            <EmptyState
              title="No category data"
              description="Categorize your suppliers to see a breakdown here."
              icon={BarChart3}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {byCategory
                .sort((a, b) => b.count - a.count)
                .slice(0, 12)
                .map((c) => {
                  const total = stats.totalSuppliers ?? 1;
                  const pct = Math.round((c.count / total) * 100);
                  return (
                    <div
                      key={c.key}
                      className="flex items-center justify-between p-2 rounded-md border border-slate-200 bg-slate-50"
                    >
                      <div className="text-xs font-medium text-slate-700 capitalize">
                        {labelFor(CATEGORIES, c.key)}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-900 tabular-nums">
                          {c.count}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// Lifecycle action menu (inline)
// =====================================================================
function LifecycleMenu({ supplier, onDone }: { supplier: any; onDone: () => void }) {
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const mutation = useMutation({
    mutationFn: async (vars: { action: string; reason?: string }) => {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Action failed");
      return data;
    },
    onSuccess: (_data, vars) => {
      const labels: Record<string, string> = {
        approve: "Supplier approved",
        suspend: "Supplier suspended",
        activate: "Supplier activated",
        deactivate: "Supplier deactivated",
        mark_preferred: "Marked as preferred",
        remove_preferred: "Removed preferred",
        verify: "Supplier verified",
      };
      toast.success(labels[vars.action] || "Action completed");
      setSuspendOpen(false);
      setReason("");
      onDone();
    },
    onError: (e: any) => toast.error(e.message || "Action failed"),
    onSettled: () => setBusy(false),
  });

  const run = (action: string) => {
    if (action === "suspend") {
      setSuspendOpen(true);
      return;
    }
    setBusy(true);
    mutation.mutate({ action });
  };

  const confirmSuspend = () => {
    if (!reason.trim()) return toast.error("A suspension reason is required");
    setBusy(true);
    mutation.mutate({ action: "suspend", reason });
  };

  const actions: { action: string; label: string; icon: any; show: boolean; color: string }[] = [
    { action: "approve", label: "Approve", icon: CheckCircle2, show: supplier.status === "pending_verification", color: "text-emerald-600 hover:bg-emerald-50" },
    { action: "verify", label: "Verify", icon: ShieldCheck, show: !supplier.verifiedAt, color: "text-blue-600 hover:bg-blue-50" },
    { action: "suspend", label: "Suspend", icon: Ban, show: supplier.status === "active", color: "text-rose-600 hover:bg-rose-50" },
    { action: "activate", label: "Activate", icon: Power, show: supplier.status === "suspended" || supplier.status === "inactive", color: "text-emerald-600 hover:bg-emerald-50" },
    { action: "deactivate", label: "Deactivate", icon: Power, show: supplier.status === "active" || supplier.status === "suspended", color: "text-slate-600 hover:bg-slate-100" },
    { action: supplier.isPreferred ? "remove_preferred" : "mark_preferred", label: supplier.isPreferred ? "Unprefer" : "Prefer", icon: supplier.isPreferred ? StarOff : Star, show: true, color: "text-amber-600 hover:bg-amber-50" },
  ];

  const visible = actions.filter((a) => a.show);

  return (
    <>
      <div className="flex items-center gap-0.5">
        {visible.map((a) => (
          <Button
            key={a.action}
            size="sm"
            variant="ghost"
            disabled={busy}
            className={`h-7 w-7 p-0 ${a.color}`}
            onClick={() => run(a.action)}
            title={a.label}
          >
            <a.icon className="w-3.5 h-3.5" />
          </Button>
        ))}
      </div>

      <Dialog open={suspendOpen} onOpenChange={(o) => setSuspendOpen(o)}>
        <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
            <DialogTitle className="text-white flex items-center gap-2">
              <Ban className="w-4 h-4" /> Suspend Supplier
            </DialogTitle>
            <DialogDescription className="text-white/80">
              Suspend <span className="font-medium text-slate-900">{supplier.name}</span>? They will be
              blocked from new purchase orders until reactivated.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-2">
            <FieldLabel required className="text-xs">Reason for suspension</FieldLabel>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Failed to deliver on PO-2026-000045; quality issues with last batch"
            />
          </div>
          <DialogFooter className="p-6 pt-4 shrink-0 border-t">
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>Cancel</Button>
            <Button
              onClick={confirmSuspend}
              disabled={busy}
              className="bg-rose-600 hover:bg-rose-700 gap-1.5"
            >
              <Ban className="w-3.5 h-3.5" /> {busy ? "Suspending…" : "Confirm Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =====================================================================
// Supplier Detail Dialog (6 sub-tabs)
// =====================================================================
function SupplierDetailDialog({
  supplierId,
  onClose,
  onEdit,
  onExport,
  onChanged,
}: {
  supplierId: string;
  onClose: () => void;
  onEdit: (s: any) => void;
  onExport: () => void;
  onChanged: () => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["supplier-detail", supplierId],
    queryFn: () => fetchJson(`/api/suppliers/${supplierId}`),
    enabled: !!supplierId,
  });

  const supplier = data?.item;
  const metrics = data?.metrics;
  const [subTab, setSubTab] = useState("overview");

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-gradient-to-r from-blue-500 to-indigo-600 text-white shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white">
                  {supplier?.name || "Loading…"}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {supplier && <span className="text-xs font-mono text-white/80">{supplier.code}</span>}
                  {supplier && <SupplierStatusPill status={supplier.status} />}
                  {supplier && <PreferredBadge preferred={supplier.isPreferred} />}
                  {supplier && <CompliancePill status={supplier.complianceStatus} />}
                  {supplier?.category && (
                    <span className="text-xs px-2 py-0.5 rounded bg-white/15 text-white">
                      {labelFor(CATEGORIES, supplier.category)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-white hover:bg-white/15"
                onClick={onExport}
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-white hover:bg-white/15"
                onClick={() => supplier && onEdit(supplier)}
                disabled={!supplier}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="p-6"><LoadingState rows={5} /></div>
          ) : isError ? (
            <div className="p-6"><ErrorState message="Failed to load supplier" onRetry={() => refetch()} /></div>
          ) : !supplier ? (
            <div className="p-6"><EmptyState title="Supplier not found" /></div>
          ) : (
            <>
              <div className="px-4 pt-3 shrink-0">
                <Tabs value={subTab} onValueChange={setSubTab}>
                  <TabsList className="w-full justify-start overflow-x-auto">
                    <TabsTrigger value="overview" className="gap-1.5 text-xs"><Building2 className="w-3.5 h-3.5" /> Overview</TabsTrigger>
                    <TabsTrigger value="products" className="gap-1.5 text-xs"><Package className="w-3.5 h-3.5" /> Products</TabsTrigger>
                    <TabsTrigger value="purchase-orders" className="gap-1.5 text-xs"><ClipboardList className="w-3.5 h-3.5" /> Purchase Orders</TabsTrigger>
                    <TabsTrigger value="documents" className="gap-1.5 text-xs"><FileText className="w-3.5 h-3.5" /> Documents</TabsTrigger>
                    <TabsTrigger value="performance" className="gap-1.5 text-xs"><Scale className="w-3.5 h-3.5" /> Performance</TabsTrigger>
                    <TabsTrigger value="audit" className="gap-1.5 text-xs"><ClipboardCheck className="w-3.5 h-3.5" /> Audit Timeline</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {subTab === "overview" && <OverviewTab supplier={supplier} metrics={metrics} />}
                {subTab === "products" && <ProductsTab supplier={supplier} />}
                {subTab === "purchase-orders" && <PurchaseOrdersTab supplier={supplier} metrics={metrics} />}
                {subTab === "documents" && <DocumentsTab supplier={supplier} />}
                {subTab === "performance" && <PerformanceTab supplier={supplier} />}
                {subTab === "audit" && <AuditTab supplier={supplier} />}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        {supplier && (
          <DetailFooter supplier={supplier} onChanged={() => { onChanged(); refetch(); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- Overview sub-tab ----
function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
        <div className="text-sm text-slate-800 break-words">{value || "—"}</div>
      </div>
    </div>
  );
}

function OverviewTab({ supplier, metrics }: { supplier: any; metrics?: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-blue-600" /> Contact Information
          </h4>
          <InfoRow icon={Building2} label="Contact Person" value={supplier.contactPerson} />
          <InfoRow icon={Phone} label="Phone" value={supplier.phone} />
          <InfoRow icon={Phone} label="Alternate Phone" value={supplier.alternatePhone} />
          <InfoRow icon={Mail} label="Email" value={supplier.email} />
          <InfoRow icon={Globe} label="Website" value={supplier.website} />
          <InfoRow icon={MapPin} label="Address" value={supplier.address} />
          <InfoRow icon={MapPin} label="City / Region" value={[supplier.city, supplier.region].filter(Boolean).join(", ")} />
          <InfoRow icon={MapPin} label="Country" value={supplier.country} />
          <InfoRow icon={MapPin} label="Postal Address" value={supplier.postalAddress} />
          <InfoRow icon={MapPin} label="Digital Address (GhanaPost)" value={supplier.digitalAddress} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-600" /> Business Information
            </h4>
            <InfoRow icon={Building2} label="Legal Business Name" value={supplier.legalBusinessName} />
            <InfoRow icon={Building2} label="Trading Name" value={supplier.tradingName} />
            <InfoRow icon={Building2} label="Vendor ID" value={supplier.vendorId} />
            <InfoRow icon={FileText} label="Registration Number" value={supplier.registrationNumber} />
            <InfoRow icon={FileText} label="TIN (Tax ID)" value={supplier.taxIdNumber} />
            <InfoRow icon={FileText} label="VAT Status" value={labelFor(VAT_STATUSES, supplier.vatStatus)} />
            <InfoRow icon={Truck} label="Supplier Type" value={labelFor(SUPPLIER_TYPES, supplier.supplierType)} />
            <InfoRow icon={Package} label="Category" value={labelFor(CATEGORIES, supplier.category)} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Banking & Payment Terms
            </h4>
            <InfoRow icon={Wallet} label="Payment Terms" value={labelFor(PAYMENT_TERMS, supplier.paymentTerms)} />
            <InfoRow icon={Wallet} label="Credit Limit" value={formatGHS(supplier.creditLimit)} />
            <InfoRow icon={CreditCard} label="Bank Name" value={supplier.bankName} />
            <InfoRow icon={CreditCard} label="Account Name" value={supplier.bankAccountName} />
            <InfoRow icon={CreditCard} label="Account Number" value={supplier.bankAccountNumber} />
            <InfoRow icon={CreditCard} label="Bank Branch" value={supplier.bankBranch} />
            <InfoRow icon={CreditCard} label="SWIFT Code" value={supplier.swiftCode} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- Products sub-tab ----
function ProductsTab({ supplier }: { supplier: any }) {
  const products = supplier.supplierProducts || [];
  if (products.length === 0)
    return <EmptyState title="No products linked" description="Add supplier-specific product pricing and lead times." icon={Package} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="border-b bg-slate-50">
          <tr>
            <th className="text-left p-2 font-semibold text-slate-700">Item</th>
            <th className="text-left p-2 font-semibold text-slate-700">Supplier Code</th>
            <th className="text-left p-2 font-semibold text-slate-700">SKU</th>
            <th className="text-right p-2 font-semibold text-slate-700">Purchase Price</th>
            <th className="text-right p-2 font-semibold text-slate-700">MOQ</th>
            <th className="text-right p-2 font-semibold text-slate-700">Lead Time</th>
            <th className="text-left p-2 font-semibold text-slate-700">Preferred</th>
            <th className="text-right p-2 font-semibold text-slate-700">Last Purchase</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p: any) => (
            <tr key={p.id} className="border-b hover:bg-blue-50/40">
              <td className="p-2">
                <div className="font-medium text-slate-900">{p.inventoryItem?.name || "—"}</div>
                <div className="text-[10px] text-slate-500 uppercase">{p.inventoryItem?.itemType}</div>
              </td>
              <td className="p-2 font-mono text-xs">{p.supplierItemCode || "—"}</td>
              <td className="p-2 font-mono text-xs">{p.supplierSku || p.inventoryItem?.sku || "—"}</td>
              <td className="p-2 text-right font-medium tabular-nums">{formatGHS(p.purchasePrice)}</td>
              <td className="p-2 text-right tabular-nums">{p.minimumOrderQuantity}</td>
              <td className="p-2 text-right">{p.leadTimeDays}d</td>
              <td className="p-2">
                {p.isPreferred ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Yes</Badge>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
              <td className="p-2 text-right">
                <div className="text-xs tabular-nums">{formatGHS(p.lastPurchasePrice)}</div>
                <div className="text-[10px] text-slate-500">{formatDate(p.lastPurchaseDate)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Purchase Orders sub-tab ----
function PurchaseOrdersTab({ supplier, metrics }: { supplier: any; metrics?: any }) {
  const pos = supplier.purchaseOrders || [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MiniStatCard label="Total Orders" value={metrics?.totalOrders ?? 0} icon={ClipboardList} gradient="from-blue-500 to-indigo-600" />
        <MiniStatCard label="Total Spend" value={formatGHS(metrics?.totalSpend ?? 0)} icon={Wallet} gradient="from-purple-500 to-fuchsia-600" />
        <MiniStatCard label="Stored Orders" value={supplier.totalOrders ?? 0} icon={ClipboardCheck} gradient="from-cyan-500 to-blue-600" />
        <MiniStatCard label="Stored Spend" value={formatGHS(supplier.totalSpend ?? 0)} icon={Wallet} gradient="from-emerald-500 to-teal-600" />
      </div>
      {pos.length === 0 ? (
        <EmptyState title="No purchase orders" description="This supplier has no purchase orders yet." icon={ClipboardList} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="text-left p-2 font-semibold text-slate-700">PO Number</th>
                <th className="text-left p-2 font-semibold text-slate-700">Facility</th>
                <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                <th className="text-right p-2 font-semibold text-slate-700">Total</th>
                <th className="text-left p-2 font-semibold text-slate-700">Ordered</th>
                <th className="text-left p-2 font-semibold text-slate-700">Approved</th>
                <th className="text-left p-2 font-semibold text-slate-700">Created</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po: any) => (
                <tr key={po.id} className="border-b hover:bg-blue-50/40">
                  <td className="p-2 font-mono text-xs font-medium">{po.purchaseOrderNumber}</td>
                  <td className="p-2 text-xs">{po.facility?.name || "—"}</td>
                  <td className="p-2"><StatusBadge status={po.status} /></td>
                  <td className="p-2 text-right font-medium tabular-nums">{formatGHS(po.total)}</td>
                  <td className="p-2 text-xs">{formatDate(po.orderedAt)}</td>
                  <td className="p-2 text-xs">{formatDate(po.approvedAt)}</td>
                  <td className="p-2 text-xs text-slate-500">{formatRelative(po.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Documents sub-tab ----
function DocumentsTab({ supplier }: { supplier: any }) {
  const docs = supplier.documents || [];
  if (docs.length === 0)
    return <EmptyState title="No documents" description="Upload registration certificates, tax clearance, VAT, ISO, insurance, etc." icon={FileText} />;
  const now = new Date();
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="border-b bg-slate-50">
          <tr>
            <th className="text-left p-2 font-semibold text-slate-700">Document</th>
            <th className="text-left p-2 font-semibold text-slate-700">Type</th>
            <th className="text-left p-2 font-semibold text-slate-700">Issued</th>
            <th className="text-left p-2 font-semibold text-slate-700">Expiry</th>
            <th className="text-left p-2 font-semibold text-slate-700">Status</th>
            <th className="text-left p-2 font-semibold text-slate-700">Verified By</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d: any) => {
            const expired = d.expiryDate && new Date(d.expiryDate) < now;
            const expiringSoon =
              d.expiryDate &&
              new Date(d.expiryDate) >= now &&
              new Date(d.expiryDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            return (
              <tr key={d.id} className="border-b hover:bg-blue-50/40">
                <td className="p-2">
                  <div className="font-medium text-slate-900">{d.documentName}</div>
                  {d.notes && <div className="text-[10px] text-slate-500">{d.notes}</div>}
                </td>
                <td className="p-2 text-xs capitalize">{d.documentType.replace(/_/g, " ")}</td>
                <td className="p-2 text-xs">{formatDate(d.issueDate)}</td>
                <td className="p-2 text-xs">
                  <span className={expired ? "text-rose-600 font-semibold" : expiringSoon ? "text-amber-600 font-semibold" : ""}>
                    {formatDate(d.expiryDate)}
                    {expired && " (expired)"}
                    {expiringSoon && " (soon)"}
                  </span>
                </td>
                <td className="p-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                      d.verificationStatus === "verified"
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                        : d.verificationStatus === "rejected"
                        ? "bg-rose-100 text-rose-700 border-rose-200"
                        : d.verificationStatus === "expired"
                        ? "bg-rose-100 text-rose-700 border-rose-200"
                        : "bg-amber-100 text-amber-700 border-amber-200"
                    }`}
                  >
                    {d.verificationStatus}
                  </span>
                </td>
                <td className="p-2 text-xs">
                  {d.verifiedBy ? `${d.verifiedBy.firstName} ${d.verifiedBy.lastName}` : "—"}
                  {d.verifiedAt && <div className="text-[10px] text-slate-500">{formatDate(d.verifiedAt)}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- Performance sub-tab ----
function PerformanceTab({ supplier }: { supplier: any }) {
  const evaluations = supplier.evaluations || [];
  const complaints = supplier.complaints || [];
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-blue-600" /> Performance Rating
            </h4>
            <span className="text-2xl font-extrabold text-blue-600 tabular-nums">
              {supplier.performanceRating != null ? supplier.performanceRating.toFixed(1) : "—"}
              <span className="text-sm text-slate-400">/100</span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5 text-blue-600" /> Evaluations ({evaluations.length})
          </h4>
          {evaluations.length === 0 ? (
            <EmptyState title="No evaluations recorded" description="Add periodic evaluations for quality, delivery, pricing, responsiveness." icon={ClipboardCheck} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-700">Period</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Criteria</th>
                    <th className="text-right p-2 font-semibold text-slate-700">Score</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Comments</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Evaluated By</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((e: any) => (
                    <tr key={e.id} className="border-b hover:bg-blue-50/40">
                      <td className="p-2 font-mono text-xs">{e.evaluationPeriod}</td>
                      <td className="p-2 text-xs capitalize">{e.criteria}</td>
                      <td className="p-2 text-right font-bold tabular-nums">{e.score.toFixed(1)}</td>
                      <td className="p-2 text-xs">{e.comments || "—"}</td>
                      <td className="p-2 text-xs">
                        {e.evaluatedBy ? `${e.evaluatedBy.firstName} ${e.evaluatedBy.lastName}` : "—"}
                      </td>
                      <td className="p-2 text-xs text-slate-500">{formatDate(e.evaluatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Complaints ({complaints.length})
          </h4>
          {complaints.length === 0 ? (
            <EmptyState title="No complaints" description="Quality, delivery, pricing & communication complaints will appear here." icon={AlertTriangle} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-700">Subject</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Severity</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.map((c: any) => (
                    <tr key={c.id} className="border-b hover:bg-blue-50/40">
                      <td className="p-2">
                        <div className="font-medium text-slate-900">{c.subject}</div>
                        {c.description && <div className="text-[10px] text-slate-500 line-clamp-2">{c.description}</div>}
                      </td>
                      <td className="p-2 text-xs capitalize">{c.complaintType}</td>
                      <td className="p-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            c.severity === "critical"
                              ? "bg-rose-100 text-rose-700 border-rose-200"
                              : c.severity === "high"
                              ? "bg-orange-100 text-orange-700 border-orange-200"
                              : c.severity === "medium"
                              ? "bg-amber-100 text-amber-700 border-amber-200"
                              : "bg-emerald-100 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {c.severity}
                        </span>
                      </td>
                      <td className="p-2"><StatusBadge status={c.status} /></td>
                      <td className="p-2 text-xs">{formatDate(c.resolvedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Audit sub-tab ----
function AuditTab({ supplier }: { supplier: any }) {
  const events: { label: string; date: string | null; user?: string | null }[] = [
    { label: "Created", date: supplier.createdAt, user: supplier.createdBy ? `${supplier.createdBy.firstName} ${supplier.createdBy.lastName}` : null },
    { label: "Approved", date: supplier.approvedAt, user: supplier.approvedBy ? `${supplier.approvedBy.firstName} ${supplier.approvedBy.lastName}` : null },
    { label: "Verified", date: supplier.verifiedAt, user: supplier.verifiedBy ? `${supplier.verifiedBy.firstName} ${supplier.verifiedBy.lastName}` : null },
    { label: "Suspended", date: supplier.suspendedAt, user: supplier.suspendedBy ? `${supplier.suspendedBy.firstName} ${supplier.suspendedBy.lastName}` : null },
  ];
  const valid = events.filter((e) => e.date);

  return (
    <div className="space-y-3">
      {supplier.suspensionReason && (
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-rose-700 mb-1 flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5" /> Suspension Reason
            </div>
            <div className="text-sm text-slate-800">{supplier.suspensionReason}</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5 text-blue-600" /> Lifecycle Timeline
          </h4>
          {valid.length === 0 ? (
            <EmptyState title="No lifecycle events" description="Approvals, verifications and suspensions will appear here." icon={ClipboardCheck} />
          ) : (
            <ol className="relative border-l-2 border-blue-200 ml-2 space-y-3">
              {valid
                .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
                .map((e, i) => (
                  <li key={i} className="ml-4">
                    <div className="absolute w-3 h-3 bg-blue-500 rounded-full -left-[7px] mt-1.5 ring-4 ring-white" />
                    <div className="text-sm font-semibold text-slate-900">{e.label}</div>
                    <div className="text-xs text-slate-500">
                      {formatDate(e.date, true)}
                      {e.user && <span className="ml-2">by {e.user}</span>}
                    </div>
                  </li>
                ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Detail footer with lifecycle actions ----
function DetailFooter({ supplier, onChanged }: { supplier: any; onChanged: () => void }) {
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const mutation = useMutation({
    mutationFn: async (vars: { action: string; reason?: string }) => {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Action failed");
      return data;
    },
    onSuccess: (_d, vars) => {
      const labels: Record<string, string> = {
        approve: "Supplier approved",
        suspend: "Supplier suspended",
        activate: "Supplier activated",
        deactivate: "Supplier deactivated",
        mark_preferred: "Marked as preferred",
        remove_preferred: "Removed preferred",
        verify: "Supplier verified",
      };
      toast.success(labels[vars.action] || "Action completed");
      setSuspendOpen(false);
      setReason("");
      onChanged();
    },
    onError: (e: any) => toast.error(e.message || "Action failed"),
    onSettled: () => setBusy(false),
  });

  const run = (action: string) => {
    if (action === "suspend") {
      setSuspendOpen(true);
      return;
    }
    setBusy(true);
    mutation.mutate({ action });
  };

  return (
    <div className="px-4 py-3 border-t bg-slate-50 shrink-0 flex flex-wrap items-center justify-end gap-2">
      {supplier.status === "pending_verification" && (
        <Button size="sm" disabled={busy} onClick={() => run("approve")} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
        </Button>
      )}
      {!supplier.verifiedAt && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run("verify")} className="gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Verify
        </Button>
      )}
      {supplier.status === "active" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run("suspend")} className="gap-1.5 text-rose-600 hover:bg-rose-50">
          <Ban className="w-3.5 h-3.5" /> Suspend
        </Button>
      )}
      {(supplier.status === "suspended" || supplier.status === "inactive") && (
        <Button size="sm" disabled={busy} onClick={() => run("activate")} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
          <Power className="w-3.5 h-3.5" /> Activate
        </Button>
      )}
      {supplier.status === "active" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run("deactivate")} className="gap-1.5">
          <Power className="w-3.5 h-3.5" /> Deactivate
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => run(supplier.isPreferred ? "remove_preferred" : "mark_preferred")}
        className="gap-1.5 text-amber-600 hover:bg-amber-50"
      >
        {supplier.isPreferred ? <StarOff className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />}
        {supplier.isPreferred ? "Remove Preferred" : "Mark Preferred"}
      </Button>

      <Dialog open={suspendOpen} onOpenChange={(o) => setSuspendOpen(o)}>
        <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
            <DialogTitle className="text-white flex items-center gap-2">
              <Ban className="w-4 h-4" /> Suspend Supplier
            </DialogTitle>
            <DialogDescription className="text-white/80">
              Suspend <span className="font-medium text-slate-900">{supplier.name}</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-2">
            <FieldLabel required className="text-xs">Reason for suspension</FieldLabel>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Required — explain why this supplier is being suspended." />
          </div>
          <DialogFooter className="p-6 pt-4 shrink-0 border-t">
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (!reason.trim()) return toast.error("A suspension reason is required"); setBusy(true); mutation.mutate({ action: "suspend", reason }); }} disabled={busy} className="bg-rose-600 hover:bg-rose-700 gap-1.5">
              <Ban className="w-3.5 h-3.5" /> {busy ? "Suspending…" : "Confirm Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =====================================================================
// TAB 4: REPORTS
// =====================================================================
function ReportsTab({ onPickSupplier }: { onPickSupplier: (id: string) => void }) {
  const [reportType, setReportType] = useState("directory");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["suppliers-for-reports"],
    queryFn: () => fetchJson(`/api/suppliers?status=all`),
  });
  const suppliers: any[] = data?.items || [];

  const reports = [
    { value: "directory", label: "Supplier Directory", icon: Truck },
    { value: "spend", label: "Spend by Supplier", icon: Wallet },
    { value: "expiring_docs", label: "Expiring Documents", icon: Calendar },
    { value: "performance", label: "Performance Summary", icon: Scale },
    { value: "compliance", label: "Compliance Report", icon: ShieldCheck },
  ];

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 mr-1">Report:</span>
          <div className="flex flex-wrap gap-1">
            {reports.map((r) => (
              <Button
                key={r.value}
                size="sm"
                variant={reportType === r.value ? "default" : "outline"}
                onClick={() => setReportType(r.value)}
                className={`gap-1.5 ${reportType === r.value ? "bg-blue-600 hover:bg-blue-700" : ""}`}
              >
                <r.icon className="w-3.5 h-3.5" /> {r.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingState rows={5} />
        ) : isError ? (
          <ErrorState message="Failed to load report data" onRetry={() => refetch()} />
        ) : suppliers.length === 0 ? (
          <EmptyState title="No suppliers available" description="Add suppliers to generate reports." icon={FileText} />
        ) : reportType === "directory" ? (
          <DirectoryReport suppliers={suppliers} onPick={onPickSupplier} />
        ) : reportType === "spend" ? (
          <SpendReport suppliers={suppliers} onPick={onPickSupplier} />
        ) : reportType === "expiring_docs" ? (
          <ExpiringDocsReport suppliers={suppliers} onPick={onPickSupplier} />
        ) : reportType === "performance" ? (
          <PerformanceReport suppliers={suppliers} onPick={onPickSupplier} />
        ) : (
          <ComplianceReport suppliers={suppliers} onPick={onPickSupplier} />
        )}
      </CardContent>
    </Card>
  );
}

function DirectoryReport({ suppliers, onPick }: { suppliers: any[]; onPick: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="border-b bg-slate-50">
          <tr>
            <th className="text-left p-2 font-semibold text-slate-700">Name</th>
            <th className="text-left p-2 font-semibold text-slate-700">Code</th>
            <th className="text-left p-2 font-semibold text-slate-700">Category</th>
            <th className="text-left p-2 font-semibold text-slate-700">Type</th>
            <th className="text-left p-2 font-semibold text-slate-700">Contact</th>
            <th className="text-left p-2 font-semibold text-slate-700">City</th>
            <th className="text-left p-2 font-semibold text-slate-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} className="border-b hover:bg-blue-50/40 cursor-pointer" onClick={() => onPick(s.id)}>
              <td className="p-2 font-medium text-slate-900">{s.name}</td>
              <td className="p-2 font-mono text-xs">{s.code}</td>
              <td className="p-2 text-xs">{labelFor(CATEGORIES, s.category)}</td>
              <td className="p-2 text-xs">{labelFor(SUPPLIER_TYPES, s.supplierType)}</td>
              <td className="p-2 text-xs">{s.contactPerson || "—"}</td>
              <td className="p-2 text-xs">{s.city || "—"}</td>
              <td className="p-2"><SupplierStatusPill status={s.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpendReport({ suppliers, onPick }: { suppliers: any[]; onPick: (id: string) => void }) {
  const sorted = [...suppliers].sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0));
  const total = sorted.reduce((sum, s) => sum + (s.totalSpend || 0), 0);
  if (total === 0 && sorted.every((s) => !s.totalSpend))
    return <EmptyState title="No spend data" description="Once purchase orders are linked to suppliers, spend will appear here." icon={Wallet} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="border-b bg-slate-50">
          <tr>
            <th className="text-left p-2 font-semibold text-slate-700">Supplier</th>
            <th className="text-left p-2 font-semibold text-slate-700">Code</th>
            <th className="text-right p-2 font-semibold text-slate-700">Total Orders</th>
            <th className="text-right p-2 font-semibold text-slate-700">Total Spend</th>
            <th className="text-left p-2 font-semibold text-slate-700">Share</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 50).map((s) => {
            const pct = total > 0 ? ((s.totalSpend || 0) / total) * 100 : 0;
            return (
              <tr key={s.id} className="border-b hover:bg-blue-50/40 cursor-pointer" onClick={() => onPick(s.id)}>
                <td className="p-2 font-medium text-slate-900">{s.name}</td>
                <td className="p-2 font-mono text-xs">{s.code}</td>
                <td className="p-2 text-right tabular-nums">{s.totalOrders ?? 0}</td>
                <td className="p-2 text-right font-medium tabular-nums">{formatGHS(s.totalSpend)}</td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 tabular-nums">{pct.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExpiringDocsReport({ suppliers, onPick }: { suppliers: any[]; onPick: (id: string) => void }) {
  const now = new Date();
  const in30 = new Date();
  in30.setDate(now.getDate() + 30);
  const rows: { supplier: any; doc: any }[] = [];
  for (const s of suppliers) {
    for (const d of s.documents || []) {
      if (!d.expiryDate) continue;
      const exp = new Date(d.expiryDate);
      if (exp < now || exp <= in30) rows.push({ supplier: s, doc: d });
    }
  }
  rows.sort((a, b) => new Date(a.doc.expiryDate).getTime() - new Date(b.doc.expiryDate).getTime());
  if (rows.length === 0)
    return <EmptyState title="No expiring documents" description="Documents expiring within 30 days (or already expired) will appear here." icon={Calendar} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="border-b bg-slate-50">
          <tr>
            <th className="text-left p-2 font-semibold text-slate-700">Supplier</th>
            <th className="text-left p-2 font-semibold text-slate-700">Document</th>
            <th className="text-left p-2 font-semibold text-slate-700">Type</th>
            <th className="text-left p-2 font-semibold text-slate-700">Expiry</th>
            <th className="text-left p-2 font-semibold text-slate-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ supplier, doc }) => {
            const expired = new Date(doc.expiryDate) < now;
            return (
              <tr key={doc.id} className="border-b hover:bg-blue-50/40 cursor-pointer" onClick={() => onPick(supplier.id)}>
                <td className="p-2 font-medium text-slate-900">{supplier.name}</td>
                <td className="p-2 text-xs">{doc.documentName}</td>
                <td className="p-2 text-xs capitalize">{doc.documentType.replace(/_/g, " ")}</td>
                <td className="p-2 text-xs">
                  <span className={expired ? "text-rose-600 font-semibold" : "text-amber-600 font-semibold"}>
                    {formatDate(doc.expiryDate)}
                  </span>
                </td>
                <td className="p-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${expired ? "bg-rose-100 text-rose-700 border-rose-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                    {expired ? "Expired" : "Expiring Soon"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PerformanceReport({ suppliers, onPick }: { suppliers: any[]; onPick: (id: string) => void }) {
  const withRating = suppliers.filter((s) => s.performanceRating != null);
  if (withRating.length === 0)
    return <EmptyState title="No performance data" description="Once you record supplier evaluations, performance ratings will appear here." icon={Scale} />;
  const sorted = [...withRating].sort((a, b) => (b.performanceRating || 0) - (a.performanceRating || 0));
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="border-b bg-slate-50">
          <tr>
            <th className="text-left p-2 font-semibold text-slate-700">Supplier</th>
            <th className="text-left p-2 font-semibold text-slate-700">Code</th>
            <th className="text-right p-2 font-semibold text-slate-700">Rating</th>
            <th className="text-left p-2 font-semibold text-slate-700">Compliance</th>
            <th className="text-right p-2 font-semibold text-slate-700">Total Orders</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const rating = s.performanceRating;
            const pct = Math.min(100, Math.max(0, rating));
            return (
              <tr key={s.id} className="border-b hover:bg-blue-50/40 cursor-pointer" onClick={() => onPick(s.id)}>
                <td className="p-2 font-medium text-slate-900">{s.name}</td>
                <td className="p-2 font-mono text-xs">{s.code}</td>
                <td className="p-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${rating >= 80 ? "bg-emerald-500" : rating >= 60 ? "bg-amber-500" : "bg-rose-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums">{rating.toFixed(1)}</span>
                  </div>
                </td>
                <td className="p-2"><CompliancePill status={s.complianceStatus} /></td>
                <td className="p-2 text-right tabular-nums">{s.totalOrders ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComplianceReport({ suppliers, onPick }: { suppliers: any[]; onPick: (id: string) => void }) {
  const grouped: Record<string, any[]> = {};
  for (const s of suppliers) {
    const key = s.complianceStatus || "unspecified";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }
  const order = ["compliant", "partially_compliant", "non_compliant", "under_review", "unspecified"];
  return (
    <div className="space-y-3">
      {order
        .filter((k) => grouped[k]?.length)
        .map((k) => (
          <div key={k} className="rounded-lg border border-slate-200 overflow-hidden">
            <div
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider ${
                k === "compliant"
                  ? "bg-emerald-50 text-emerald-700"
                  : k === "partially_compliant"
                  ? "bg-amber-50 text-amber-700"
                  : k === "non_compliant"
                  ? "bg-rose-50 text-rose-700"
                  : k === "under_review"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {k.replace(/_/g, " ")} — {grouped[k].length}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {grouped[k].map((s) => (
                  <tr key={s.id} className="border-b last:border-b-0 hover:bg-blue-50/40 cursor-pointer" onClick={() => onPick(s.id)}>
                    <td className="p-2 font-medium text-slate-900">{s.name}</td>
                    <td className="p-2 font-mono text-xs">{s.code}</td>
                    <td className="p-2 text-xs">{labelFor(CATEGORIES, s.category)}</td>
                    <td className="p-2"><SupplierStatusPill status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

// =====================================================================
// New / Edit Supplier Dialog — full Ghana-ready form
// =====================================================================
function SupplierDialog({
  open,
  onClose,
  onCreated,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  existing?: any;
}) {
  const isEdit = !!existing;
  const [form, setForm] = useState<any>(() => ({
    name: existing?.name || "",
    code: existing?.code || "",
    contactPerson: existing?.contactPerson || "",
    phone: existing?.phone || "",
    email: existing?.email || "",
    address: existing?.address || "",
    status: existing?.status || "pending_verification",
    supplierType: existing?.supplierType || "",
    category: existing?.category || "",
    legalBusinessName: existing?.legalBusinessName || "",
    tradingName: existing?.tradingName || "",
    vendorId: existing?.vendorId || "",
    registrationNumber: existing?.registrationNumber || "",
    taxIdNumber: existing?.taxIdNumber || "",
    vatStatus: existing?.vatStatus || "",
    website: existing?.website || "",
    alternatePhone: existing?.alternatePhone || "",
    postalAddress: existing?.postalAddress || "",
    city: existing?.city || "",
    region: existing?.region || "",
    country: existing?.country || "Ghana",
    digitalAddress: existing?.digitalAddress || "",
    paymentTerms: existing?.paymentTerms || "",
    creditLimit: existing?.creditLimit || 0,
    bankName: existing?.bankName || "",
    bankAccountName: existing?.bankAccountName || "",
    bankAccountNumber: existing?.bankAccountNumber || "",
    bankBranch: existing?.bankBranch || "",
    swiftCode: existing?.swiftCode || "",
    isPreferred: existing?.isPreferred || false,
    complianceStatus: existing?.complianceStatus || "",
    performanceRating: existing?.performanceRating || "",
  }));
  const [submitting, setSubmitting] = useState(false);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name || !form.code) return toast.error("Name and code required");
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/suppliers/${existing.id}` : "/api/suppliers";
      const method = isEdit ? "PATCH" : "POST";
      const body: any = { ...form };
      // Convert types
      if (body.creditLimit !== "") body.creditLimit = Number(body.creditLimit) || 0;
      if (body.performanceRating === "") delete body.performanceRating;
      if (body.isPreferred === "true") body.isPreferred = true;
      if (body.isPreferred === "false") body.isPreferred = false;
      // Don't send status on edit (use lifecycle actions instead) unless explicitly provided
      if (isEdit) delete body.status;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(isEdit ? "Supplier updated" : "Supplier created");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b bg-gradient-to-r from-blue-500 to-indigo-600 text-white shrink-0">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Truck className="w-5 h-5" /> {isEdit ? "Edit Supplier" : "New Supplier"}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {isEdit ? "Update supplier information" : "Onboard a new supplier — defaults to pending_verification"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Identity */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Identity & Classification</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <FieldLabel required className="text-xs">Name</FieldLabel>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="MediSource Ghana Ltd" />
              </div>
              <div>
                <FieldLabel required className="text-xs">Code</FieldLabel>
                <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="MS-001" disabled={isEdit} />
              </div>
              <div>
                <Label className="text-xs">Supplier Type</Label>
                <Select value={form.supplierType || undefined} onValueChange={(v) => set("supplierType", v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {SUPPLIER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={form.category || undefined} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!isEdit && (
                <div>
                  <Label className="text-xs">Initial Status</Label>
                  <Select value={form.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </section>

          {/* Business identity */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Business Identity (Ghana-ready)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Legal Business Name</Label>
                <Input value={form.legalBusinessName} onChange={(e) => set("legalBusinessName", e.target.value)} placeholder="MediSource Ghana Limited" />
              </div>
              <div>
                <Label className="text-xs">Trading Name</Label>
                <Input value={form.tradingName} onChange={(e) => set("tradingName", e.target.value)} placeholder="MediSource" />
              </div>
              <div>
                <Label className="text-xs">Vendor ID</Label>
                <Input value={form.vendorId} onChange={(e) => set("vendorId", e.target.value)} placeholder="V-001234" />
              </div>
              <div>
                <Label className="text-xs">Registration # (RGD)</Label>
                <Input value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} placeholder="CS1234562024" />
              </div>
              <div>
                <Label className="text-xs">TIN (Tax ID Number)</Label>
                <Input value={form.taxIdNumber} onChange={(e) => set("taxIdNumber", e.target.value)} placeholder="P123456789X" />
              </div>
              <div>
                <Label className="text-xs">VAT Status</Label>
                <Select value={form.vatStatus || undefined} onValueChange={(v) => set("vatStatus", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {VAT_STATUSES.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Contact details */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Contact Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Contact Person</Label>
                <Input value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} placeholder="John Mensah" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+233 24 000 0000" />
              </div>
              <div>
                <Label className="text-xs">Alternate Phone</Label>
                <Input value={form.alternatePhone} onChange={(e) => set("alternatePhone", e.target.value)} placeholder="+233 20 000 0000" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="sales@supplier.com" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Website</Label>
                <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://supplier.com" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Street Address</Label>
                <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} placeholder="Street, suburb" />
              </div>
              <div>
                <Label className="text-xs">City</Label>
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Accra" />
              </div>
              <div>
                <Label className="text-xs">Region</Label>
                <Input value={form.region} onChange={(e) => set("region", e.target.value)} placeholder="Greater Accra" />
              </div>
              <div>
                <Label className="text-xs">Country</Label>
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Ghana" />
              </div>
              <div>
                <Label className="text-xs">Digital Address (GhanaPost)</Label>
                <Input value={form.digitalAddress} onChange={(e) => set("digitalAddress", e.target.value)} placeholder="GA-123-4567" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Postal Address</Label>
                <Input value={form.postalAddress} onChange={(e) => set("postalAddress", e.target.value)} placeholder="P.O. Box 12345, Accra" />
              </div>
            </div>
          </section>

          {/* Payment & banking */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Payment & Banking</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Payment Terms</Label>
                <Select value={form.paymentTerms || undefined} onValueChange={(v) => set("paymentTerms", v)}>
                  <SelectTrigger><SelectValue placeholder="Select terms" /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Credit Limit (GHS)</Label>
                <Input type="number" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label className="text-xs">Bank Name</Label>
                <Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} placeholder="GCB Bank" />
              </div>
              <div>
                <Label className="text-xs">Account Name</Label>
                <Input value={form.bankAccountName} onChange={(e) => set("bankAccountName", e.target.value)} placeholder="MediSource Ghana Ltd" />
              </div>
              <div>
                <Label className="text-xs">Account Number</Label>
                <Input value={form.bankAccountNumber} onChange={(e) => set("bankAccountNumber", e.target.value)} placeholder="1234567890123" />
              </div>
              <div>
                <Label className="text-xs">Bank Branch</Label>
                <Input value={form.bankBranch} onChange={(e) => set("bankBranch", e.target.value)} placeholder="Accra Main" />
              </div>
              <div>
                <Label className="text-xs">SWIFT Code</Label>
                <Input value={form.swiftCode} onChange={(e) => set("swiftCode", e.target.value)} placeholder="GHCBACCA" />
              </div>
            </div>
          </section>

          {/* Compliance & preferences */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Compliance & Preferences</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Compliance Status</Label>
                <Select value={form.complianceStatus || undefined} onValueChange={(v) => set("complianceStatus", v)}>
                  <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    {COMPLIANCE_STATUSES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Performance Rating (0–100)</Label>
                <Input type="number" min="0" max="100" value={form.performanceRating} onChange={(e) => set("performanceRating", e.target.value)} placeholder="—" />
              </div>
              <div className="md:col-span-2 flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isPreferred"
                  checked={!!form.isPreferred}
                  onChange={(e) => set("isPreferred", e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <Label htmlFor="isPreferred" className="text-xs">Mark as preferred supplier</Label>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="px-5 py-3 border-t bg-slate-50 shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Create Supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

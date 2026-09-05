"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users, UserPlus, Search, Building2, Phone, Mail, Edit, RefreshCcw,
  Eye, ArrowRightLeft, TrendingUp, Ban, CheckCircle2, LogOut, Link2,
  Award, FileText, ClipboardList, Download, BarChart3, FileBarChart,
  Stethoscope, ShieldAlert, CalendarClock, UserCheck, UserX, GraduationCap,
  Briefcase, Banknote, Home, MapPin, AlertCircle, IdCard, BadgeCheck, Clock, History,
} from "lucide-react";
import { toast } from "sonner";
import {
  EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative,
  calculateAge, safeJson, PageHeader, MiniStatCard, ClearableSearch, usePagination,
  Pagination, ModuleHelp,
} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";

// =====================================================================
// Helpers
// =====================================================================
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await safeJson(res).catch(() => ({}));
    throw new Error(err.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

async function patchStaff(id: string, body: any) {
  const res = await fetch(`/api/staff/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || "Failed");
  }
  return safeJson(res);
}

// =====================================================================
// Constants
// =====================================================================
const EMPLOYMENT_TYPES: { value: string; label: string }[] = [
  { value: "permanent", label: "Permanent" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "casual", label: "Casual" },
  { value: "part_time", label: "Part Time" },
  { value: "full_time", label: "Full Time" },
  { value: "intern", label: "Intern" },
  { value: "volunteer", label: "Volunteer" },
  { value: "locum", label: "Locum" },
  { value: "consultant", label: "Consultant" },
  { value: "agency", label: "Agency" },
];

const EMPLOYMENT_STATUSES: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "probation", label: "Probation" },
  { value: "on_leave", label: "On Leave" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
  { value: "resigned", label: "Resigned" },
  { value: "terminated", label: "Terminated" },
  { value: "retired", label: "Retired" },
  { value: "deceased", label: "Deceased" },
  { value: "contract_expired", label: "Contract Expired" },
];

const LICENSE_STATUSES: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "suspended", label: "Suspended" },
  { value: "revoked", label: "Revoked" },
];

const STAFF_CATEGORIES: { value: string; label: string }[] = [
  { value: "clinical", label: "Clinical" },
  { value: "administrative", label: "Administrative" },
  { value: "support_services", label: "Support Services" },
];

const GENDERS: { value: string; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const PROFESSIONS: { value: string; label: string }[] = [
  { value: "doctor", label: "Doctor / Physician" },
  { value: "nurse", label: "Nurse" },
  { value: "midwife", label: "Midwife" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "lab_scientist", label: "Laboratory Scientist" },
  { value: "radiographer", label: "Radiographer" },
  { value: "records_officer", label: "Records Officer" },
  { value: "receptionist", label: "Receptionist" },
  { value: "cashier", label: "Cashier" },
  { value: "accountant", label: "Accountant" },
  { value: "inventory_officer", label: "Inventory Officer" },
  { value: "administrator", label: "Administrator" },
  { value: "cleaner", label: "Cleaner" },
  { value: "security", label: "Security" },
  { value: "driver", label: "Driver" },
  { value: "other", label: "Other" },
];

const CREDENTIAL_TYPES: { value: string; label: string }[] = [
  { value: "license", label: "License" },
  { value: "certification", label: "Certification" },
  { value: "qualification", label: "Qualification" },
  { value: "registration", label: "Registration" },
  { value: "training", label: "Training" },
];

const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: "contract", label: "Contract" },
  { value: "id_card", label: "ID Card" },
  { value: "cv", label: "CV / Resume" },
  { value: "certificate", label: "Certificate" },
  { value: "medical", label: "Medical Record" },
  { value: "nda", label: "NDA" },
  { value: "offer_letter", label: "Offer Letter" },
  { value: "other", label: "Other" },
];

const ASSIGNMENT_TYPES: { value: string; label: string }[] = [
  { value: "assignment", label: "Assignment" },
  { value: "transfer", label: "Transfer" },
  { value: "promotion", label: "Promotion" },
  { value: "secondment", label: "Secondment" },
  { value: "acting", label: "Acting" },
];

const SEPARATION_TYPES: { value: string; label: string }[] = [
  { value: "resignation", label: "Resignation" },
  { value: "termination", label: "Termination" },
  { value: "retirement", label: "Retirement" },
  { value: "contract_expiry", label: "Contract Expiry" },
  { value: "transfer_out", label: "Transfer Out" },
  { value: "other", label: "Other" },
];

const STATUS_COLOR_MAP: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  probation: "bg-amber-100 text-amber-700 border-amber-200",
  on_leave: "bg-blue-100 text-blue-700 border-blue-200",
  suspended: "bg-rose-100 text-rose-700 border-rose-200",
  inactive: "bg-slate-100 text-slate-600 border-slate-200",
  resigned: "bg-slate-100 text-slate-600 border-slate-200",
  terminated: "bg-rose-100 text-rose-700 border-rose-200",
  retired: "bg-slate-100 text-slate-600 border-slate-200",
  deceased: "bg-slate-100 text-slate-600 border-slate-200",
  contract_expired: "bg-amber-100 text-amber-700 border-amber-200",
};

const LICENSE_STATUS_COLOR_MAP: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  expired: "bg-rose-100 text-rose-700 border-rose-200",
  suspended: "bg-amber-100 text-amber-700 border-amber-200",
  revoked: "bg-rose-100 text-rose-700 border-rose-200",
};

function StaffStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cls = STATUS_COLOR_MAP[status] || "bg-slate-100 text-slate-600 border-slate-200";
  const label = EMPLOYMENT_STATUSES.find((s) => s.value === status)?.label || status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${cls}`}>
      {label}
    </span>
  );
}

function LicenseStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cls = LICENSE_STATUS_COLOR_MAP[status] || "bg-slate-100 text-slate-600 border-slate-200";
  const label = LICENSE_STATUSES.find((s) => s.value === status)?.label || status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${cls}`}>
      {label}
    </span>
  );
}

const HELP_SECTIONS = [
  {
    title: "Staff Lifecycle",
    content: `Every staff member moves through a lifecycle: Recruitment → Onboarding (probation) → Confirmation → Active Service → Transfer/Promotion → Separation (resignation, retirement, termination, contract expiry).

Each lifecycle event is recorded: status changes are logged in Status History; transfers and promotions create Assignment records; separations populate separationType, separationReason and separationDate.

Use the lifecycle actions (Transfer, Promote, Suspend, Activate, Separate) rather than free-form edits so that the audit trail and related records stay consistent.`,
  },
  {
    title: "Employment Types & Status",
    content: `Employment Type describes the contract structure: permanent, contract, temporary, casual, part_time, full_time, intern, volunteer, locum, consultant, agency.

Employment Status describes the current state of the staff member: active, probation, on_leave, suspended, inactive, resigned, terminated, retired, deceased, contract_expired.

Status changes are tracked historically — when you change a status via "Change Status" or any lifecycle action, a StaffStatusHistory record is automatically created with the previous status, new status, effective date, reason, and authorizer.`,
  },
  {
    title: "Professional Information",
    content: `Professional fields capture the staff member's clinical identity:

• Profession (doctor, nurse, pharmacist, lab scientist, etc.)
• Specialty & Secondary Specialty (e.g., Pediatrics, Internal Medicine)
• Position / Title (e.g., Senior Medical Officer)
• Job Grade & Job Level (HR classification)
• License Number, Licensing Authority, License Expiry, License Status
• isClinical flag — separates clinical from non-clinical staff
• canPrescribe flag — controls prescription authority

License expiry is monitored — staff with licenses expiring in 30 days appear in the Dashboard and Reports tabs.`,
  },
  {
    title: "Assignments & Transfers",
    content: `A Staff Assignment is a record of where a staff member is working at a given time:

• facilityId, departmentId, position, supervisorId
• startDate, endDate
• assignmentType: assignment | transfer | promotion | secondment | acting
• status: active | completed | revoked | superseded

When you Transfer or Promote a staff member, the previous active assignment is automatically end-dated and superseded, and a new assignment is created. The Assignment History tab in the Staff Detail shows the full timeline of where a staff member has worked.`,
  },
  {
    title: "Credentials & Compliance",
    content: `Credentials are professional qualifications, licenses, certifications and registrations:

• credentialType: license | certification | qualification | registration | training
• credentialName, issuingInstitution
• issueDate, expiryDate
• verificationStatus: pending | verified | rejected | expired
• licenseNumber, notes

Documents are HR paperwork: contracts, ID cards, CVs, certificates, medical records, NDAs, offer letters.

Both Credentials and Documents support expiry tracking — items expiring within 30 days are flagged in the dashboard and reports.`,
  },
  {
    title: "Reports & Analytics",
    content: `The Reports tab provides 5 standard HR reports:

1. Staff Register — full list of all staff with key fields
2. By Facility — headcount distribution across facilities
3. By Profession — headcount distribution across professional roles
4. License Expiry — staff with licenses expiring soon or already expired
5. Contract Expiry — staff with contracts expiring soon

The Dashboard tab provides at-a-glance metrics: total staff, breakdowns by status/type/category/facility/department/profession, and compliance alerts.

CSV Export downloads a flat spreadsheet of all staff for offline analysis or import into payroll systems.`,
  },
];

// =====================================================================
// MAIN VIEW
// =====================================================================
export function StaffView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canView = can("staff.view") || can("hr.view");
  const canManage = can("staff.manage") || can("hr.manage");

  const [activeTab, setActiveTab] = useState("dashboard");
  const [detailStaffId, setDetailStaffId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<{ staff: any; type: string } | null>(null);

  const openDetail = (staffId: string) => {
    setDetailStaffId(staffId);
    setDetailOpen(true);
  };

  if (!canView) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState title="Access denied" description="You do not have permission to view the Staff module." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff Management"
        description="Manage hospital staff, employment lifecycle, credentials and assignments"
        icon={Users}
        gradient="from-blue-500 to-indigo-600"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <ModuleHelp title="Staff Management" sections={HELP_SECTIONS} />
            {canManage && (
              <Button onClick={() => setShowNew(true)} className="bg-white/20 border border-white/30 text-white hover:bg-white/30">
                <UserPlus className="w-4 h-4 mr-1" /> Add Staff
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="dashboard" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Dashboard</TabsTrigger>
          <TabsTrigger value="staff" className="gap-1.5"><Users className="w-3.5 h-3.5" /> All Staff</TabsTrigger>
          <TabsTrigger value="detail" className="gap-1.5"><Eye className="w-3.5 h-3.5" /> Staff Detail</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><FileBarChart className="w-3.5 h-3.5" /> Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="staff">
          <AllStaffTab
            canManage={canManage}
            onView={(s) => openDetail(s.id)}
            onEdit={(s) => setEditingStaff(s)}
            onLifecycle={(staff, type) => setLifecycleAction({ staff, type })}
            onSwitchToDetail={(id) => {
              setActiveTab("detail");
              setDetailStaffId(id);
              setDetailOpen(true);
            }}
          />
        </TabsContent>
        <TabsContent value="detail">
          <DetailTab
            onPickStaff={(id) => {
              setDetailStaffId(id);
              setDetailOpen(true);
            }}
          />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>
      </Tabs>

      {showNew && canManage && (
        <StaffDialog mode="create" onClose={() => setShowNew(false)} />
      )}
      {editingStaff && canManage && (
        <StaffDialog mode="edit" staff={editingStaff} onClose={() => setEditingStaff(null)} />
      )}
      {detailOpen && detailStaffId && (
        <StaffDetailDialog
          staffId={detailStaffId}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          canManage={canManage}
          onEdit={(s) => {
            setDetailOpen(false);
            setEditingStaff(s);
          }}
          onLifecycle={(staff, type) => {
            setDetailOpen(false);
            setLifecycleAction({ staff, type });
          }}
        />
      )}
      {lifecycleAction && canManage && (
        <LifecycleActionDialog
          staff={lifecycleAction.staff}
          type={lifecycleAction.type}
          onClose={() => setLifecycleAction(null)}
        />
      )}
    </div>
  );
}

// =====================================================================
// TAB 1: DASHBOARD
// =====================================================================
function DashboardTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["staff-stats"],
    queryFn: () => fetchJson("/api/staff/stats"),
  });

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) return <ErrorState message="Failed to load staff stats" onRetry={() => refetch()} />;

  const t = data?.totals || {};
  const byFacility: any[] = data?.byFacility || [];
  const byDepartment: any[] = data?.byDepartment || [];
  const byProfession: any[] = data?.byProfession || [];

  const stats = [
    { label: "Total Staff", value: t.total || 0, icon: Users, gradient: "from-blue-500 to-indigo-600" },
    { label: "Active", value: t.active || 0, icon: CheckCircle2, gradient: "from-emerald-500 to-green-600" },
    { label: "Probation", value: t.probation || 0, icon: Clock, gradient: "from-amber-500 to-orange-600" },
    { label: "On Leave", value: t.on_leave || 0, icon: CalendarClock, gradient: "from-sky-500 to-blue-600" },
    { label: "Suspended", value: t.suspended || 0, icon: Ban, gradient: "from-rose-500 to-red-600" },
    { label: "Inactive", value: t.inactive || 0, icon: UserX, gradient: "from-slate-500 to-slate-600" },
    { label: "Clinical", value: t.clinical || 0, icon: Stethoscope, gradient: "from-teal-500 to-cyan-600" },
    { label: "Non-Clinical", value: t.nonClinical || 0, icon: Briefcase, gradient: "from-violet-500 to-purple-600" },
    { label: "Expiring Licenses", value: t.expiringLicenses || 0, icon: AlertCircle, gradient: "from-amber-500 to-yellow-600", sublabel: "Next 30 days" },
    { label: "Expired Licenses", value: t.expiredLicenses || 0, icon: ShieldAlert, gradient: "from-rose-500 to-pink-600" },
    { label: "New This Month", value: t.newThisMonth || 0, icon: UserPlus, gradient: "from-emerald-500 to-teal-600" },
    { label: "Departed This Month", value: t.departedThisMonth || 0, icon: LogOut, gradient: "from-slate-500 to-slate-700" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {stats.map((s) => (
          <MiniStatCard key={s.label} label={s.label} value={s.value} icon={s.icon} gradient={s.gradient} sublabel={s.sublabel} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-blue-600" /> By Facility
            </h3>
            {byFacility.length === 0 ? (
              <EmptyState title="No data" description="No facility assignments yet." />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {byFacility.map((f: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 truncate">{f.name}</span>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{f.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-indigo-600" /> By Department
            </h3>
            {byDepartment.length === 0 ? (
              <EmptyState title="No data" description="No department assignments yet." />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {byDepartment.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 truncate">{d.name}</span>
                    <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">{d.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-purple-600" /> By Profession
            </h3>
            {byProfession.length === 0 ? (
              <EmptyState title="No data" description="No profession data yet." />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {byProfession.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 capitalize truncate">{(p.profession || "unknown").replace(/_/g, " ")}</span>
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">{p.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =====================================================================
// TAB 2: ALL STAFF
// =====================================================================
function AllStaffTab({
  canManage,
  onView,
  onEdit,
  onLifecycle,
  onSwitchToDetail,
}: {
  canManage: boolean;
  onView: (s: any) => void;
  onEdit: (s: any) => void;
  onLifecycle: (staff: any, type: string) => void;
  onSwitchToDetail: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState("all");
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState("all");
  const [professionFilter, setProfessionFilter] = useState("all");
  const [departments, setDepartments] = useState<any[]>([]);

  const facilitiesQ = useQuery({
    queryKey: ["facilities"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const facilities = facilitiesQ.data?.facilities || facilitiesQ.data?.items || [];

  // Load departments when facility changes
  useEffect(() => {
    if (facilityFilter !== "all") {
      fetch(`/api/departments?facilityId=${facilityFilter}`)
        .then((r) => safeJson(r))
        .then((d) => setDepartments(d.items || []))
        .catch(() => setDepartments([]));
    } else {
      setDepartments([]);
    }
  }, [facilityFilter]);

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (facilityFilter !== "all") params.set("facilityId", facilityFilter);
  if (departmentFilter !== "all") params.set("departmentId", departmentFilter);
  if (employmentTypeFilter !== "all") params.set("employmentType", employmentTypeFilter);
  if (employmentStatusFilter !== "all") params.set("employmentStatus", employmentStatusFilter);
  if (professionFilter !== "all") params.set("profession", professionFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["staff", search, facilityFilter, departmentFilter, employmentTypeFilter, employmentStatusFilter, professionFilter],
    queryFn: () => fetchJson(`/api/staff${qs}`),
  });

  const items = data?.items || [];
  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, 15);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `staff-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success("CSV exported"),
    onError: (e: Error) => toast.error(e.message),
  });

  const clearFilters = () => {
    setSearch("");
    setFacilityFilter("all");
    setDepartmentFilter("all");
    setEmploymentTypeFilter("all");
    setEmploymentStatusFilter("all");
    setProfessionFilter("all");
  };

  const hasFilters = search || facilityFilter !== "all" || departmentFilter !== "all" || employmentTypeFilter !== "all" || employmentStatusFilter !== "all" || professionFilter !== "all";

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <ClearableSearch value={search} onChange={setSearch} placeholder="Search by name, staff #, employee #, phone, email, license..." />
            </div>
            <Button variant="outline" size="sm" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending} className="gap-1.5">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500">Clear filters</Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Select value={facilityFilter || undefined} onValueChange={setFacilityFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="All Facilities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Facilities</SelectItem>
                {facilities.map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={departmentFilter || undefined} onValueChange={setDepartmentFilter} disabled={facilityFilter === "all"}>
              <SelectTrigger className="w-full"><SelectValue placeholder="All Departments" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={employmentTypeFilter || undefined} onValueChange={setEmploymentTypeFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {EMPLOYMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={employmentStatusFilter || undefined} onValueChange={setEmploymentStatusFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {EMPLOYMENT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={professionFilter || undefined} onValueChange={setProfessionFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="All Professions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Professions</SelectItem>
                {PROFESSIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState message="Failed to load staff" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No staff members found"
              description={hasFilters ? "Try adjusting or clearing your filters." : "Add your first staff member to begin managing HR records."}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Name</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Staff #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Position</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Profession</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Department</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Facility</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((s: any) => {
                    const initials = `${s.firstName?.[0] || ""}${s.lastName?.[0] || ""}`.toUpperCase();
                    const isActive = s.employmentStatus === "active";
                    const isSeparated = ["resigned", "terminated", "retired", "deceased", "contract_expired"].includes(s.employmentStatus);
                    return (
                      <tr key={s.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-9 h-9 bg-blue-100">
                              <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-slate-900">{s.firstName} {s.lastName}</div>
                              <div className="text-xs text-slate-500">{s.email || s.user?.email || "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{s.staffNumber}</code>
                          {s.employeeNumber && <div className="text-xs text-slate-500 mt-0.5">EMP: {s.employeeNumber}</div>}
                        </td>
                        <td className="p-3 text-slate-700">{s.position || "—"}</td>
                        <td className="p-3 text-slate-700 capitalize">{(s.profession || s.professionalRole || "—").replace(/_/g, " ")}</td>
                        <td className="p-3 text-slate-700">{s.department?.name || s.primaryFacility?.department?.name || "—"}</td>
                        <td className="p-3 text-slate-700">{s.facility?.name || s.primaryFacility?.facility?.name || "—"}</td>
                        <td className="p-3 capitalize text-slate-700">{(s.employmentType || "—").replace(/_/g, " ")}</td>
                        <td className="p-3"><StaffStatusBadge status={s.employmentStatus} /></td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <Button size="sm" variant="ghost" onClick={() => onView(s)} className="h-8 w-8 p-0" title="View">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {canManage && (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => onEdit(s)} className="h-8 w-8 p-0" title="Edit">
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => onLifecycle(s, "transfer")} className="h-8 w-8 p-0 text-blue-600" title="Transfer">
                                  <ArrowRightLeft className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => onLifecycle(s, "promote")} className="h-8 w-8 p-0 text-purple-600" title="Promote">
                                  <TrendingUp className="w-3.5 h-3.5" />
                                </Button>
                                {isActive && (
                                  <Button size="sm" variant="ghost" onClick={() => onLifecycle(s, "suspend")} className="h-8 w-8 p-0 text-rose-600" title="Suspend">
                                    <Ban className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {!isActive && !isSeparated && (
                                  <Button size="sm" variant="ghost" onClick={() => onLifecycle(s, "activate")} className="h-8 w-8 p-0 text-emerald-600" title="Activate">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {!isSeparated && (
                                  <Button size="sm" variant="ghost" onClick={() => onLifecycle(s, "separate")} className="h-8 w-8 p-0 text-slate-600" title="Separate">
                                    <LogOut className="w-3.5 h-3.5" />
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
            <Pagination
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              totalItems={totalItems}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// TAB 3: STAFF DETAIL (picker + opens dialog)
// =====================================================================
function DetailTab({
  onPickStaff,
}: {
  onPickStaff: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["staff-for-detail", search],
    queryFn: () => fetchJson(`/api/staff?q=${encodeURIComponent(search)}`),
  });
  const items = data?.items || [];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-800">Select a staff member to view full details</h3>
        </div>
        <ClearableSearch value={search} onChange={setSearch} placeholder="Search staff..." />
        {isLoading ? (
          <LoadingState rows={4} />
        ) : items.length === 0 ? (
          <EmptyState title="No staff found" description="Search for a staff member by name, staff # or employee #." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
            {items.slice(0, 60).map((s: any) => {
              const initials = `${s.firstName?.[0] || ""}${s.lastName?.[0] || ""}`.toUpperCase();
              return (
                <button
                  key={s.id}
                  onClick={() => onPickStaff(s.id)}
                  className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
                >
                  <Avatar className="w-8 h-8 bg-blue-100">
                    <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate">{s.firstName} {s.lastName}</div>
                    <div className="text-xs text-slate-500 truncate">{s.position || s.profession || s.staffNumber}</div>
                  </div>
                  <StaffStatusBadge status={s.employmentStatus} />
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// STAFF DETAIL DIALOG
// =====================================================================
function StaffDetailDialog({
  staffId,
  open,
  onOpenChange,
  canManage,
  onEdit,
  onLifecycle,
}: {
  staffId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canManage: boolean;
  onEdit: (s: any) => void;
  onLifecycle: (staff: any, type: string) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["staff-detail", staffId],
    queryFn: () => fetchJson(`/api/staff/${staffId}`),
    enabled: !!staffId && open,
  });
  const s: any = data?.item;
  const [innerTab, setInnerTab] = useState("overview");

  useEffect(() => {
    if (open) setInnerTab("overview");
  }, [open, staffId]);

  const initials = s ? `${s.firstName?.[0] || ""}${s.lastName?.[0] || ""}`.toUpperCase() : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" /> Staff Detail
          </DialogTitle>
          <DialogDescription className="text-white/80">Comprehensive view of a staff member's record, history and compliance.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState rows={4} />
        ) : isError ? (
          <ErrorState message="Failed to load staff" onRetry={() => refetch()} />
        ) : !s ? (
          <EmptyState title="Staff not found" />
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row gap-3 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
              <Avatar className="w-16 h-16 bg-blue-200">
                {s.photoUrl ? (
                  <img src={s.photoUrl} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <AvatarFallback className="bg-blue-200 text-blue-800 text-xl font-bold">{initials}</AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold text-slate-900">{s.firstName} {s.middleName || ""} {s.lastName}</h3>
                  <StaffStatusBadge status={s.employmentStatus} />
                  {s.user?.status && (
                    <span className={`text-xs px-2 py-0.5 rounded border ${s.user.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                      User: {s.user.status}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-600 mt-1 space-y-0.5">
                  <div className="flex items-center gap-1"><IdCard className="w-3.5 h-3.5" /> <code className="bg-white px-1.5 py-0.5 rounded text-xs">{s.staffNumber}</code>{s.employeeNumber && <span className="text-slate-500">· EMP {s.employeeNumber}</span>}</div>
                  <div className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> {s.position || "—"} · <span className="capitalize">{(s.profession || s.professionalRole || "—").replace(/_/g, " ")}</span></div>
                  <div className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {s.department?.name || "—"} · {s.facility?.name || "—"}</div>
                  {s.user && (
                    <div className="flex items-center gap-1 text-xs"><Link2 className="w-3.5 h-3.5" /> User: {s.user.username || s.user.email || "—"} · Last login {formatRelative(s.user.lastLoginAt)}</div>
                  )}
                </div>
                {typeof s.profileCompletion === "number" && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-slate-600">Profile completion</span>
                    <div className="flex-1 max-w-xs bg-white rounded-full h-1.5 overflow-hidden border border-blue-100">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${s.profileCompletion}%` }} />
                    </div>
                    <span className="font-semibold text-slate-700">{s.profileCompletion}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            {canManage && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => onEdit(s)} className="gap-1.5"><Edit className="w-3.5 h-3.5" /> Edit</Button>
                <Button size="sm" variant="outline" onClick={() => onLifecycle(s, "transfer")} className="gap-1.5 text-blue-600"><ArrowRightLeft className="w-3.5 h-3.5" /> Transfer</Button>
                <Button size="sm" variant="outline" onClick={() => onLifecycle(s, "promote")} className="gap-1.5 text-purple-600"><TrendingUp className="w-3.5 h-3.5" /> Promote</Button>
                {s.employmentStatus === "active" && (
                  <Button size="sm" variant="outline" onClick={() => onLifecycle(s, "suspend")} className="gap-1.5 text-rose-600"><Ban className="w-3.5 h-3.5" /> Suspend</Button>
                )}
                {s.employmentStatus !== "active" && !["resigned", "terminated", "retired", "deceased", "contract_expired"].includes(s.employmentStatus) && (
                  <Button size="sm" variant="outline" onClick={() => onLifecycle(s, "activate")} className="gap-1.5 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Activate</Button>
                )}
                {!["resigned", "terminated", "retired", "deceased", "contract_expired"].includes(s.employmentStatus) && (
                  <Button size="sm" variant="outline" onClick={() => onLifecycle(s, "separate")} className="gap-1.5"><LogOut className="w-3.5 h-3.5" /> Separate</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => onLifecycle(s, "link_user")} className="gap-1.5"><Link2 className="w-3.5 h-3.5" /> Link User</Button>
                <Button size="sm" variant="outline" onClick={() => onLifecycle(s, "change_status")} className="gap-1.5"><RefreshCcw className="w-3.5 h-3.5" /> Change Status</Button>
                <Button size="sm" variant="outline" onClick={() => onLifecycle(s, "add_credential")} className="gap-1.5"><Award className="w-3.5 h-3.5" /> Add Credential</Button>
                <Button size="sm" variant="outline" onClick={() => onLifecycle(s, "add_document")} className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Add Document</Button>
                <Button size="sm" variant="outline" onClick={() => onLifecycle(s, "add_assignment")} className="gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Add Assignment</Button>
              </div>
            )}

            {/* Inner tabs */}
            <Tabs value={innerTab} onValueChange={setInnerTab}>
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="professional">Professional</TabsTrigger>
                <TabsTrigger value="credentials">Credentials ({s.staffCredentials?.length || 0})</TabsTrigger>
                <TabsTrigger value="assignments">Assignments ({s.staffAssignments?.length || 0})</TabsTrigger>
                <TabsTrigger value="documents">Documents ({s.staffDocuments?.length || 0})</TabsTrigger>
                <TabsTrigger value="status-history">Status History ({s.staffStatusHistory?.length || 0})</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <DetailOverviewTab s={s} />
              </TabsContent>
              <TabsContent value="professional">
                <DetailProfessionalTab s={s} />
              </TabsContent>
              <TabsContent value="credentials">
                <DetailCredentialsTab credentials={s.staffCredentials || []} />
              </TabsContent>
              <TabsContent value="assignments">
                <DetailAssignmentsTab assignments={s.staffAssignments || []} />
              </TabsContent>
              <TabsContent value="documents">
                <DetailDocumentsTab documents={s.staffDocuments || []} />
              </TabsContent>
              <TabsContent value="status-history">
                <DetailStatusHistoryTab history={s.staffStatusHistory || []} />
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value, icon: Icon }: { label: string; value: any; icon?: any }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
      {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-sm text-slate-800 break-words">{value || "—"}</div>
      </div>
    </div>
  );
}

function DetailOverviewTab({ s }: { s: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><Users className="w-4 h-4 text-blue-600" /> Personal Information</h4>
          <DetailRow label="Preferred Name" value={s.preferredName} icon={UserCheck} />
          <DetailRow label="Gender" value={s.gender ? <span className="capitalize">{s.gender.replace(/_/g, " ")}</span> : null} icon={Users} />
          <DetailRow label="Date of Birth" value={s.dateOfBirth ? `${formatDate(s.dateOfBirth)} (${calculateAge(s.dateOfBirth)} yrs)` : null} icon={CalendarClock} />
          <DetailRow label="National ID" value={s.nationalId} icon={IdCard} />
          <DetailRow label="Tax ID" value={s.taxIdNumber} icon={IdCard} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><Phone className="w-4 h-4 text-blue-600" /> Contact</h4>
          <DetailRow label="Phone" value={s.phone} icon={Phone} />
          <DetailRow label="Alt Phone" value={s.alternativePhone} icon={Phone} />
          <DetailRow label="Personal Email" value={s.email} icon={Mail} />
          <DetailRow label="Work Email" value={s.workEmail} icon={Mail} />
          <DetailRow label="Address" value={[s.address, s.city, s.region, s.country].filter(Boolean).join(", ")} icon={MapPin} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-rose-600" /> Emergency Contact</h4>
          <DetailRow label="Name" value={s.emergencyContactName} icon={Users} />
          <DetailRow label="Relationship" value={s.emergencyContactRelationship} icon={UserCheck} />
          <DetailRow label="Phone" value={s.emergencyContactPhone} icon={Phone} />
          <DetailRow label="Alt Phone" value={s.emergencyContactAltPhone} icon={Phone} />
          <DetailRow label="Address" value={s.emergencyContactAddress} icon={MapPin} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-purple-600" /> Employment Dates</h4>
          <DetailRow label="Hire Date" value={formatDate(s.hireDate)} icon={CalendarClock} />
          <DetailRow label="Employment Start" value={formatDate(s.employmentStartDate)} icon={CalendarClock} />
          <DetailRow label="Probation Start" value={formatDate(s.probationStartDate)} icon={Clock} />
          <DetailRow label="Probation End" value={formatDate(s.probationEndDate)} icon={Clock} />
          <DetailRow label="Confirmation Date" value={formatDate(s.confirmationDate)} icon={BadgeCheck} />
          <DetailRow label="Termination Date" value={formatDate(s.terminationDate)} icon={UserX} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><FileText className="w-4 h-4 text-amber-600" /> Contract Information</h4>
          <DetailRow label="Employment Type" value={s.employmentType ? <span className="capitalize">{s.employmentType.replace(/_/g, " ")}</span> : null} icon={Briefcase} />
          <DetailRow label="Contract Start" value={formatDate(s.contractStartDate)} icon={CalendarClock} />
          <DetailRow label="Contract End" value={formatDate(s.contractEndDate)} icon={CalendarClock} />
          <DetailRow label="Pay Grade" value={s.payGrade} icon={Banknote} />
          <DetailRow label="Payroll ID" value={s.payrollId} icon={IdCard} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><Banknote className="w-4 h-4 text-emerald-600" /> Banking</h4>
          <DetailRow label="Bank Name" value={s.bankName} icon={Building2} />
          <DetailRow label="Account Name" value={s.bankAccountName} icon={Users} />
          <DetailRow label="Account Number" value={s.bankAccountNumber} icon={IdCard} />
        </CardContent>
      </Card>
      {s.notes && (
        <Card className="md:col-span-2">
          <CardContent className="p-4">
            <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><FileText className="w-4 h-4 text-slate-500" /> Notes</h4>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{s.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailProfessionalTab({ s }: { s: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><Stethoscope className="w-4 h-4 text-teal-600" /> Profession</h4>
          <DetailRow label="Profession" value={s.profession ? <span className="capitalize">{s.profession.replace(/_/g, " ")}</span> : null} icon={GraduationCap} />
          <DetailRow label="Specialty" value={s.specialty} icon={Stethoscope} />
          <DetailRow label="Secondary Specialty" value={s.secondarySpecialty} icon={Stethoscope} />
          <DetailRow label="Position / Title" value={s.position} icon={Briefcase} />
          <DetailRow label="Job Grade" value={s.jobGrade} icon={Briefcase} />
          <DetailRow label="Job Level" value={s.jobLevel} icon={Briefcase} />
          <DetailRow label="Professional Role" value={s.professionalRole ? <span className="capitalize">{s.professionalRole.replace(/_/g, " ")}</span> : null} icon={Briefcase} />
          <DetailRow label="Registration #" value={s.professionalRegistrationNumber} icon={IdCard} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><Award className="w-4 h-4 text-amber-600" /> License Information</h4>
          <DetailRow label="License Number" value={s.licenseNumber} icon={IdCard} />
          <DetailRow label="Licensing Authority" value={s.licensingAuthority} icon={ShieldAlert} />
          <DetailRow label="License Expiry" value={formatDate(s.licenseExpiryDate)} icon={CalendarClock} />
          <div className="py-1.5 border-b border-slate-100 last:border-0 flex items-start gap-2">
            <BadgeCheck className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs text-slate-500">License Status</div>
              <LicenseStatusBadge status={s.licenseStatus} />
            </div>
          </div>
          <div className="py-1.5 border-b border-slate-100 last:border-0 flex items-start gap-2">
            <Stethoscope className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs text-slate-500">Is Clinical</div>
              <div className="text-sm text-slate-800">{s.isClinical ? "Yes" : "No"}</div>
            </div>
          </div>
          <div className="py-1.5 flex items-start gap-2">
            <BadgeCheck className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs text-slate-500">Can Prescribe</div>
              <div className="text-sm text-slate-800">{s.canPrescribe ? "Yes" : "No"}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailCredentialsTab({ credentials }: { credentials: any[] }) {
  if (!credentials.length) {
    return <EmptyState title="No credentials recorded" description="Use 'Add Credential' to record licenses, certifications or qualifications." icon={Award} />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left p-2 font-semibold text-slate-700">Credential</th>
            <th className="text-left p-2 font-semibold text-slate-700">Type</th>
            <th className="text-left p-2 font-semibold text-slate-700">Issuer</th>
            <th className="text-left p-2 font-semibold text-slate-700">Issued</th>
            <th className="text-left p-2 font-semibold text-slate-700">Expiry</th>
            <th className="text-left p-2 font-semibold text-slate-700">License #</th>
            <th className="text-left p-2 font-semibold text-slate-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {credentials.map((c: any, i: number) => {
            const isExpired = c.expiryDate && new Date(c.expiryDate) < new Date();
            const expiringSoon = c.expiryDate && new Date(c.expiryDate) < new Date(Date.now() + 30 * 86400000) && !isExpired;
            return (
              <tr key={i} className="border-t hover:bg-slate-50">
                <td className="p-2 font-medium text-slate-800">{c.credentialName}</td>
                <td className="p-2 text-slate-600 capitalize">{(c.credentialType || "—").replace(/_/g, " ")}</td>
                <td className="p-2 text-slate-600">{c.issuingInstitution || "—"}</td>
                <td className="p-2 text-slate-600">{formatDate(c.issueDate)}</td>
                <td className="p-2">
                  <span className={isExpired ? "text-rose-600 font-medium" : expiringSoon ? "text-amber-600 font-medium" : "text-slate-600"}>
                    {formatDate(c.expiryDate)}
                    {isExpired && " (expired)"}
                    {expiringSoon && " (soon)"}
                  </span>
                </td>
                <td className="p-2 text-slate-600">{c.licenseNumber || "—"}</td>
                <td className="p-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${c.verificationStatus === "verified" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : c.verificationStatus === "rejected" || isExpired ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    {c.verificationStatus}
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

function DetailAssignmentsTab({ assignments }: { assignments: any[] }) {
  if (!assignments.length) {
    return <EmptyState title="No assignment history" description="Transfers and promotions will appear here." icon={ClipboardList} />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left p-2 font-semibold text-slate-700">Type</th>
            <th className="text-left p-2 font-semibold text-slate-700">Facility</th>
            <th className="text-left p-2 font-semibold text-slate-700">Department</th>
            <th className="text-left p-2 font-semibold text-slate-700">Position</th>
            <th className="text-left p-2 font-semibold text-slate-700">Start</th>
            <th className="text-left p-2 font-semibold text-slate-700">End</th>
            <th className="text-left p-2 font-semibold text-slate-700">Status</th>
            <th className="text-left p-2 font-semibold text-slate-700">Reason</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a: any, i: number) => (
            <tr key={i} className="border-t hover:bg-slate-50">
              <td className="p-2 capitalize"><Badge variant="outline" className="capitalize">{(a.assignmentType || "assignment").replace(/_/g, " ")}</Badge></td>
              <td className="p-2 text-slate-700">{a.facility?.name || "—"}</td>
              <td className="p-2 text-slate-700">{a.department?.name || "—"}</td>
              <td className="p-2 text-slate-700">{a.position || "—"}</td>
              <td className="p-2 text-slate-600">{formatDate(a.startDate)}</td>
              <td className="p-2 text-slate-600">{a.endDate ? formatDate(a.endDate) : "—"}</td>
              <td className="p-2"><span className={`text-xs px-2 py-0.5 rounded border ${a.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>{a.status}</span></td>
              <td className="p-2 text-slate-600 text-xs">{a.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailDocumentsTab({ documents }: { documents: any[] }) {
  if (!documents.length) {
    return <EmptyState title="No documents recorded" description="Use 'Add Document' to attach contracts, certificates, ID cards." icon={FileText} />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left p-2 font-semibold text-slate-700">Document</th>
            <th className="text-left p-2 font-semibold text-slate-700">Type</th>
            <th className="text-left p-2 font-semibold text-slate-700">Issued</th>
            <th className="text-left p-2 font-semibold text-slate-700">Expiry</th>
            <th className="text-left p-2 font-semibold text-slate-700">Status</th>
            <th className="text-left p-2 font-semibold text-slate-700">Notes</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d: any, i: number) => {
            const isExpired = d.expiryDate && new Date(d.expiryDate) < new Date();
            const expiringSoon = d.expiryDate && new Date(d.expiryDate) < new Date(Date.now() + 30 * 86400000) && !isExpired;
            return (
              <tr key={i} className="border-t hover:bg-slate-50">
                <td className="p-2 font-medium text-slate-800">{d.documentName}</td>
                <td className="p-2 text-slate-600 capitalize">{(d.documentType || "—").replace(/_/g, " ")}</td>
                <td className="p-2 text-slate-600">{formatDate(d.issueDate)}</td>
                <td className="p-2">
                  <span className={isExpired ? "text-rose-600 font-medium" : expiringSoon ? "text-amber-600 font-medium" : "text-slate-600"}>
                    {formatDate(d.expiryDate)}
                    {isExpired && " (expired)"}
                    {expiringSoon && " (soon)"}
                  </span>
                </td>
                <td className="p-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${d.verificationStatus === "verified" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : d.verificationStatus === "rejected" || isExpired ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    {d.verificationStatus}
                  </span>
                </td>
                <td className="p-2 text-slate-600 text-xs">{d.notes || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailStatusHistoryTab({ history }: { history: any[] }) {
  if (!history.length) {
    return <EmptyState title="No status history" description="Status changes will be tracked here." icon={History} />;
  }
  return (
    <div className="space-y-2">
      {history.map((h: any, i: number) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200">
          <div className="mt-0.5">
            <div className={`w-2.5 h-2.5 rounded-full ${i === 0 ? "bg-blue-500" : "bg-slate-300"}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <StaffStatusBadge status={h.previousStatus} />
              <span className="text-slate-400">→</span>
              <StaffStatusBadge status={h.newStatus} />
              <span className="text-xs text-slate-500">{formatDate(h.effectiveDate, true)}</span>
            </div>
            {h.reason && <div className="text-sm text-slate-700 mt-1"><span className="text-slate-500">Reason:</span> {h.reason}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// TAB 4: REPORTS
// =====================================================================
function ReportsTab() {
  const [reportType, setReportType] = useState("register");

  const { data: staffData, isLoading: staffLoading } = useQuery({
    queryKey: ["staff-all-for-reports"],
    queryFn: () => fetchJson("/api/staff?limit=500"),
  });
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["staff-stats-for-reports"],
    queryFn: () => fetchJson("/api/staff/stats"),
  });

  const staff: any[] = staffData?.items || [];
  const isLoading = staffLoading || statsLoading;

  const renderReport = () => {
    if (isLoading) return <LoadingState rows={5} />;
    if (reportType === "register") return <StaffRegisterReport staff={staff} />;
    if (reportType === "facility") return <ByFacilityReport data={statsData?.byFacility || []} />;
    if (reportType === "profession") return <ByProfessionReport data={statsData?.byProfession || []} />;
    if (reportType === "license") return <LicenseExpiryReport staff={staff} />;
    if (reportType === "contract") return <ContractExpiryReport staff={staff} />;
    return null;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <FileBarChart className="w-4 h-4 text-blue-600" /> Report Type
          </div>
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="md:w-80"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="register">Staff Register</SelectItem>
              <SelectItem value="facility">By Facility</SelectItem>
              <SelectItem value="profession">By Profession</SelectItem>
              <SelectItem value="license">License Expiry</SelectItem>
              <SelectItem value="contract">Contract Expiry</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            const res = window.open("/api/staff/export", "_blank");
            if (!res) toast.error("Popup blocked — please allow popups for CSV download");
          }}>
            <Download className="w-4 h-4" /> Download CSV
          </Button>
        </CardContent>
      </Card>
      {renderReport()}
    </div>
  );
}

function StaffRegisterReport({ staff }: { staff: any[] }) {
  if (!staff.length) return <Card><CardContent className="p-6"><EmptyState title="No staff" description="No staff records to display." /></CardContent></Card>;
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left p-2 font-semibold text-slate-700">Staff #</th>
                <th className="text-left p-2 font-semibold text-slate-700">Name</th>
                <th className="text-left p-2 font-semibold text-slate-700">Position</th>
                <th className="text-left p-2 font-semibold text-slate-700">Profession</th>
                <th className="text-left p-2 font-semibold text-slate-700">Facility</th>
                <th className="text-left p-2 font-semibold text-slate-700">Status</th>
                <th className="text-left p-2 font-semibold text-slate-700">Hired</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s: any) => (
                <tr key={s.id} className="border-t hover:bg-slate-50">
                  <td className="p-2"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{s.staffNumber}</code></td>
                  <td className="p-2 font-medium text-slate-800">{s.firstName} {s.lastName}</td>
                  <td className="p-2 text-slate-700">{s.position || "—"}</td>
                  <td className="p-2 text-slate-700 capitalize">{(s.profession || s.professionalRole || "—").replace(/_/g, " ")}</td>
                  <td className="p-2 text-slate-700">{s.facility?.name || s.primaryFacility?.facility?.name || "—"}</td>
                  <td className="p-2"><StaffStatusBadge status={s.employmentStatus} /></td>
                  <td className="p-2 text-slate-600">{formatDate(s.hireDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ByFacilityReport({ data }: { data: any[] }) {
  if (!data.length) return <Card><CardContent className="p-6"><EmptyState title="No data" description="No facility assignments to report." /></CardContent></Card>;
  const total = data.reduce((a, b) => a + b.count, 0);
  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-3 border-b bg-slate-50 text-sm font-semibold text-slate-700">Total: {total} staff across {data.length} facilities</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2 font-semibold text-slate-700">Facility</th>
                <th className="text-left p-2 font-semibold text-slate-700">Code</th>
                <th className="text-right p-2 font-semibold text-slate-700">Headcount</th>
                <th className="text-left p-2 font-semibold text-slate-700 w-1/3">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.map((f: any, i: number) => (
                <tr key={i} className="border-t hover:bg-slate-50">
                  <td className="p-2 font-medium text-slate-800">{f.name}</td>
                  <td className="p-2 text-slate-600">{f.code || "—"}</td>
                  <td className="p-2 text-right font-semibold text-slate-800">{f.count}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${(f.count / total) * 100}%` }} />
                      </div>
                      <span className="text-xs text-slate-600 w-12 text-right">{((f.count / total) * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ByProfessionReport({ data }: { data: any[] }) {
  if (!data.length) return <Card><CardContent className="p-6"><EmptyState title="No data" description="No profession data to report." /></CardContent></Card>;
  const total = data.reduce((a, b) => a + b.count, 0);
  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-3 border-b bg-slate-50 text-sm font-semibold text-slate-700">Total: {total} staff across {data.length} professions</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2 font-semibold text-slate-700">Profession</th>
                <th className="text-right p-2 font-semibold text-slate-700">Headcount</th>
                <th className="text-left p-2 font-semibold text-slate-700 w-1/3">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p: any, i: number) => (
                <tr key={i} className="border-t hover:bg-slate-50">
                  <td className="p-2 font-medium text-slate-800 capitalize">{(p.profession || "unknown").replace(/_/g, " ")}</td>
                  <td className="p-2 text-right font-semibold text-slate-800">{p.count}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-violet-500" style={{ width: `${(p.count / total) * 100}%` }} />
                      </div>
                      <span className="text-xs text-slate-600 w-12 text-right">{((p.count / total) * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function LicenseExpiryReport({ staff }: { staff: any[] }) {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const expired = staff.filter((s) => s.licenseExpiryDate && new Date(s.licenseExpiryDate) < now);
  const expiring = staff.filter((s) => s.licenseExpiryDate && new Date(s.licenseExpiryDate) >= now && new Date(s.licenseExpiryDate) <= in30);
  const valid = staff.filter((s) => s.licenseExpiryDate && new Date(s.licenseExpiryDate) > in30);
  const noLicense = staff.filter((s) => !s.licenseExpiryDate);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStatCard label="Expired" value={expired.length} icon={ShieldAlert} gradient="from-rose-500 to-pink-600" />
        <MiniStatCard label="Expiring ≤30d" value={expiring.length} icon={AlertCircle} gradient="from-amber-500 to-yellow-600" />
        <MiniStatCard label="Valid" value={valid.length} icon={BadgeCheck} gradient="from-emerald-500 to-green-600" />
        <MiniStatCard label="No License Date" value={noLicense.length} icon={IdCard} gradient="from-slate-500 to-slate-600" />
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="p-3 border-b bg-rose-50 text-sm font-semibold text-rose-700">Expired &amp; Expiring Licenses</div>
          <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-semibold text-slate-700">Staff</th>
                  <th className="text-left p-2 font-semibold text-slate-700">License #</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Profession</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Facility</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Expiry</th>
                  <th className="text-left p-2 font-semibold text-slate-700">State</th>
                </tr>
              </thead>
              <tbody>
                {[...expired, ...expiring].length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-slate-500 text-xs">No expiring or expired licenses.</td></tr>
                ) : (
                  [...expired, ...expiring].map((s: any) => {
                    const isExpired = new Date(s.licenseExpiryDate) < now;
                    return (
                      <tr key={s.id} className="border-t hover:bg-slate-50">
                        <td className="p-2 font-medium text-slate-800">{s.firstName} {s.lastName}</td>
                        <td className="p-2 text-slate-600">{s.licenseNumber || "—"}</td>
                        <td className="p-2 text-slate-700 capitalize">{(s.profession || s.professionalRole || "—").replace(/_/g, " ")}</td>
                        <td className="p-2 text-slate-700">{s.facility?.name || "—"}</td>
                        <td className="p-2 text-slate-600">{formatDate(s.licenseExpiryDate)}</td>
                        <td className="p-2">
                          <span className={`text-xs px-2 py-0.5 rounded border ${isExpired ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                            {isExpired ? "Expired" : "Expiring"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ContractExpiryReport({ staff }: { staff: any[] }) {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const expiring = staff.filter((s) => s.contractEndDate && new Date(s.contractEndDate) >= now && new Date(s.contractEndDate) <= in30);
  const expired = staff.filter((s) => s.contractEndDate && new Date(s.contractEndDate) < now);
  const valid = staff.filter((s) => s.contractEndDate && new Date(s.contractEndDate) > in30);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <MiniStatCard label="Expired" value={expired.length} icon={UserX} gradient="from-rose-500 to-pink-600" />
        <MiniStatCard label="Expiring ≤30d" value={expiring.length} icon={AlertCircle} gradient="from-amber-500 to-yellow-600" />
        <MiniStatCard label="Active" value={valid.length} icon={BadgeCheck} gradient="from-emerald-500 to-green-600" />
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="p-3 border-b bg-amber-50 text-sm font-semibold text-amber-700">Expiring &amp; Expired Contracts</div>
          <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-semibold text-slate-700">Staff</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Type</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Facility</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Contract End</th>
                  <th className="text-left p-2 font-semibold text-slate-700">State</th>
                </tr>
              </thead>
              <tbody>
                {[...expiring, ...expired].length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-500 text-xs">No expiring or expired contracts.</td></tr>
                ) : (
                  [...expiring, ...expired].map((s: any) => {
                    const isExpired = new Date(s.contractEndDate) < now;
                    return (
                      <tr key={s.id} className="border-t hover:bg-slate-50">
                        <td className="p-2 font-medium text-slate-800">{s.firstName} {s.lastName}</td>
                        <td className="p-2 text-slate-700 capitalize">{(s.employmentType || "—").replace(/_/g, " ")}</td>
                        <td className="p-2 text-slate-700">{s.facility?.name || "—"}</td>
                        <td className="p-2 text-slate-600">{formatDate(s.contractEndDate)}</td>
                        <td className="p-2">
                          <span className={`text-xs px-2 py-0.5 rounded border ${isExpired ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                            {isExpired ? "Expired" : "Expiring"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// NEW / EDIT STAFF DIALOG
// =====================================================================
function StaffDialog({ mode, staff, onClose }: { mode: "create" | "edit"; staff?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = mode === "edit";

  const [form, setForm] = useState<any>({
    // User account
    username: staff?.user?.username || "",
    password: "",
    // Personal
    firstName: staff?.firstName || "",
    middleName: staff?.middleName || "",
    lastName: staff?.lastName || "",
    preferredName: staff?.preferredName || "",
    gender: staff?.gender || "",
    dateOfBirth: staff?.dateOfBirth ? new Date(staff.dateOfBirth).toISOString().slice(0, 10) : "",
    photoUrl: staff?.photoUrl || "",
    employeeNumber: staff?.employeeNumber || "",
    // Contact
    email: staff?.email || staff?.user?.email || "",
    phone: staff?.phone || staff?.user?.phone || "",
    alternativePhone: staff?.alternativePhone || "",
    workEmail: staff?.workEmail || "",
    address: staff?.address || "",
    city: staff?.city || "",
    region: staff?.region || "",
    country: staff?.country || "",
    // Emergency contact
    emergencyContactName: staff?.emergencyContactName || "",
    emergencyContactRelationship: staff?.emergencyContactRelationship || "",
    emergencyContactPhone: staff?.emergencyContactPhone || "",
    emergencyContactAltPhone: staff?.emergencyContactAltPhone || "",
    emergencyContactAddress: staff?.emergencyContactAddress || "",
    // Professional
    professionalRole: staff?.professionalRole || "",
    professionalRegistrationNumber: staff?.professionalRegistrationNumber || "",
    profession: staff?.profession || "",
    specialty: staff?.specialty || "",
    secondarySpecialty: staff?.secondarySpecialty || "",
    position: staff?.position || "",
    jobGrade: staff?.jobGrade || "",
    jobLevel: staff?.jobLevel || "",
    // Employment
    employmentType: staff?.employmentType || "permanent",
    employmentStatus: staff?.employmentStatus || "active",
    staffCategory: staff?.staffCategory || "clinical",
    isClinical: staff?.isClinical ?? true,
    canPrescribe: staff?.canPrescribe ?? false,
    hireDate: staff?.hireDate ? new Date(staff.hireDate).toISOString().slice(0, 10) : "",
    employmentStartDate: staff?.employmentStartDate ? new Date(staff.employmentStartDate).toISOString().slice(0, 10) : "",
    probationStartDate: staff?.probationStartDate ? new Date(staff.probationStartDate).toISOString().slice(0, 10) : "",
    probationEndDate: staff?.probationEndDate ? new Date(staff.probationEndDate).toISOString().slice(0, 10) : "",
    confirmationDate: staff?.confirmationDate ? new Date(staff.confirmationDate).toISOString().slice(0, 10) : "",
    contractStartDate: staff?.contractStartDate ? new Date(staff.contractStartDate).toISOString().slice(0, 10) : "",
    contractEndDate: staff?.contractEndDate ? new Date(staff.contractEndDate).toISOString().slice(0, 10) : "",
    // License
    licenseNumber: staff?.licenseNumber || "",
    licensingAuthority: staff?.licensingAuthority || "",
    licenseExpiryDate: staff?.licenseExpiryDate ? new Date(staff.licenseExpiryDate).toISOString().slice(0, 10) : "",
    licenseStatus: staff?.licenseStatus || "active",
    // Identity & payroll
    nationalId: staff?.nationalId || "",
    taxIdNumber: staff?.taxIdNumber || "",
    bankName: staff?.bankName || "",
    bankAccountNumber: staff?.bankAccountNumber || "",
    bankAccountName: staff?.bankAccountName || "",
    payGrade: staff?.payGrade || "",
    payrollId: staff?.payrollId || "",
    // Assignment
    primaryFacilityId: staff?.facilityId || staff?.primaryFacility?.facilityId || "",
    departmentId: staff?.departmentId || staff?.primaryFacility?.departmentId || "",
    supervisorId: staff?.supervisorId || "",
    // Notes
    notes: staff?.notes || "",
  });

  const [departments, setDepartments] = useState<any[]>([]);

  const facilitiesQ = useQuery({
    queryKey: ["facilities"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const facilities = facilitiesQ.data?.facilities || facilitiesQ.data?.items || [];

  useEffect(() => {
    if (form.primaryFacilityId) {
      fetch(`/api/departments?facilityId=${form.primaryFacilityId}`)
        .then((r) => safeJson(r))
        .then((d) => setDepartments(d.items || []))
        .catch(() => setDepartments([]));
    } else {
      setDepartments([]);
    }
  }, [form.primaryFacilityId]);

  const loadDepartments = async (facilityId: string) => {
    setForm((f: any) => ({ ...f, primaryFacilityId: facilityId, departmentId: "" }));
    if (!facilityId) {
      setDepartments([]);
      return;
    }
    try {
      const d = await fetchJson(`/api/departments?facilityId=${facilityId}`);
      setDepartments(d.items || []);
    } catch {
      setDepartments([]);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        return patchStaff(staff.id, { action: "update", ...form });
      }
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const e = await safeJson(res).catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return safeJson(res);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Staff updated" : "Staff created");
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["staff-stats"] });
      qc.invalidateQueries({ queryKey: ["staff-detail"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const requiredMet = form.firstName && form.lastName && (isEdit || (!form.username || (form.username && form.password)));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white">{isEdit ? "Edit Staff Member" : "Add New Staff Member"}</DialogTitle>
          <DialogDescription className="text-white/80">
            {isEdit
              ? "Update staff information. Changes will also update the linked user account where applicable."
              : "Provide the staff member's details. A user account will be created if username and password are supplied; otherwise a placeholder account is generated."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* User account */}
          {!isEdit && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">User Account (optional)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="Leave blank to auto-generate" />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Leave blank to auto-generate" />
                </div>
              </div>
            </div>
          )}

          {/* Personal */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Personal Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <FieldLabel required>First Name</FieldLabel>
                <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Middle Name</Label>
                <Input value={form.middleName} onChange={(e) => set("middleName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <FieldLabel required>Last Name</FieldLabel>
                <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Preferred Name</Label>
                <Input value={form.preferredName} onChange={(e) => set("preferredName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={form.gender || undefined} onValueChange={(v) => set("gender", v)}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <Input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Employee Number</Label>
                <Input value={form.employeeNumber} onChange={(e) => set("employeeNumber", e.target.value)} placeholder="Org-specific employee ID" />
              </div>
              <div className="space-y-1.5">
                <Label>National ID</Label>
                <Input value={form.nationalId} onChange={(e) => set("nationalId", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tax ID / SSN</Label>
                <Input value={form.taxIdNumber} onChange={(e) => set("taxIdNumber", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Contact</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Alternative Phone</Label>
                <Input value={form.alternativePhone} onChange={(e) => set("alternativePhone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Work Email</Label>
                <Input type="email" value={form.workEmail} onChange={(e) => set("workEmail", e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Address</Label>
                <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Region / State</Label>
                <Input value={form.region} onChange={(e) => set("region", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Emergency contact */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Emergency Contact</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Relationship</Label>
                <Input value={form.emergencyContactRelationship} onChange={(e) => set("emergencyContactRelationship", e.target.value)} placeholder="e.g., Spouse, Parent" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Alt Phone</Label>
                <Input value={form.emergencyContactAltPhone} onChange={(e) => set("emergencyContactAltPhone", e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Address</Label>
                <Input value={form.emergencyContactAddress} onChange={(e) => set("emergencyContactAddress", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Employment */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Employment</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Employment Type</Label>
                <Select value={form.employmentType || undefined} onValueChange={(v) => set("employmentType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Employment Status</Label>
                <Select value={form.employmentStatus || undefined} onValueChange={(v) => set("employmentStatus", v)} disabled={isEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Staff Category</Label>
                <Select value={form.staffCategory || undefined} onValueChange={(v) => set("staffCategory", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAFF_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Hire Date</Label>
                <Input type="date" value={form.hireDate} onChange={(e) => set("hireDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Employment Start</Label>
                <Input type="date" value={form.employmentStartDate} onChange={(e) => set("employmentStartDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Probation Start</Label>
                <Input type="date" value={form.probationStartDate} onChange={(e) => set("probationStartDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Probation End</Label>
                <Input type="date" value={form.probationEndDate} onChange={(e) => set("probationEndDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmation Date</Label>
                <Input type="date" value={form.confirmationDate} onChange={(e) => set("confirmationDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contract Start</Label>
                <Input type="date" value={form.contractStartDate} onChange={(e) => set("contractStartDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contract End</Label>
                <Input type="date" value={form.contractEndDate} onChange={(e) => set("contractEndDate", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Professional */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Professional</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Profession</Label>
                <Select value={form.profession || undefined} onValueChange={(v) => set("profession", v)}>
                  <SelectTrigger><SelectValue placeholder="Select profession" /></SelectTrigger>
                  <SelectContent>
                    {PROFESSIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Specialty</Label>
                <Input value={form.specialty} onChange={(e) => set("specialty", e.target.value)} placeholder="e.g., Pediatrics" />
              </div>
              <div className="space-y-1.5">
                <Label>Secondary Specialty</Label>
                <Input value={form.secondarySpecialty} onChange={(e) => set("secondarySpecialty", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Position / Title</Label>
                <Input value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="e.g., Senior Medical Officer" />
              </div>
              <div className="space-y-1.5">
                <Label>Job Grade</Label>
                <Input value={form.jobGrade} onChange={(e) => set("jobGrade", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Job Level</Label>
                <Input value={form.jobLevel} onChange={(e) => set("jobLevel", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Professional Role</Label>
                <Select value={form.professionalRole || undefined} onValueChange={(v) => set("professionalRole", v)}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {PROFESSIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Registration #</Label>
                <Input value={form.professionalRegistrationNumber} onChange={(e) => set("professionalRegistrationNumber", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>License Number</Label>
                <Input value={form.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Licensing Authority</Label>
                <Input value={form.licensingAuthority} onChange={(e) => set("licensingAuthority", e.target.value)} placeholder="e.g., Medical & Dental Council" />
              </div>
              <div className="space-y-1.5">
                <Label>License Expiry</Label>
                <Input type="date" value={form.licenseExpiryDate} onChange={(e) => set("licenseExpiryDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>License Status</Label>
                <Select value={form.licenseStatus || undefined} onValueChange={(v) => set("licenseStatus", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LICENSE_STATUSES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 md:col-span-3 pt-1">
                <Checkbox id="isClinical" checked={form.isClinical} onCheckedChange={(v) => set("isClinical", v === true)} />
                <Label htmlFor="isClinical">Is Clinical Staff</Label>
                <Checkbox id="canPrescribe" checked={form.canPrescribe} onCheckedChange={(v) => set("canPrescribe", v === true)} className="ml-4" />
                <Label htmlFor="canPrescribe">Can Prescribe</Label>
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Facility / Department Assignment</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Facility</Label>
                <Select value={form.primaryFacilityId || undefined} onValueChange={loadDepartments}>
                  <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                  <SelectContent>
                    {facilities.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={form.departmentId || "__none__"} onValueChange={(v) => set("departmentId", v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Supervisor Staff ID</Label>
                <Input value={form.supervisorId} onChange={(e) => set("supervisorId", e.target.value)} placeholder="Staff ID of supervisor (optional)" />
              </div>
            </div>
          </div>

          {/* Banking */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Banking & Payroll</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Bank Name</Label>
                <Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Account Name</Label>
                <Input value={form.bankAccountName} onChange={(e) => set("bankAccountName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Account Number</Label>
                <Input value={form.bankAccountNumber} onChange={(e) => set("bankAccountNumber", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Pay Grade</Label>
                <Input value={form.payGrade} onChange={(e) => set("payGrade", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Payroll ID</Label>
                <Input value={form.payrollId} onChange={(e) => set("payrollId", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Notes</h4>
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Internal HR notes (optional)" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !requiredMet}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {mutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {isEdit ? "Save Changes" : "Create Staff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// LIFECYCLE ACTION DIALOG (transfer / promote / suspend / etc.)
// =====================================================================
function LifecycleActionDialog({ staff, type, onClose }: { staff: any; type: string; onClose: () => void }) {
  const qc = useQueryClient();
  const facilitiesQ = useQuery({
    queryKey: ["facilities"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const facilities = facilitiesQ.data?.facilities || facilitiesQ.data?.items || [];
  const [departments, setDepartments] = useState<any[]>([]);

  const [form, setForm] = useState<any>({});
  useEffect(() => {
    // Default values per action
    if (type === "transfer") {
      setForm({ facilityId: staff?.facilityId || "", departmentId: staff?.departmentId || "", position: staff?.position || "", supervisorId: staff?.supervisorId || "", reason: "", startDate: new Date().toISOString().slice(0, 10) });
    } else if (type === "promote") {
      setForm({ position: staff?.position || "", jobGrade: staff?.jobGrade || "", jobLevel: staff?.jobLevel || "", supervisorId: staff?.supervisorId || "", reason: "", effectiveDate: new Date().toISOString().slice(0, 10) });
    } else if (type === "suspend") {
      setForm({ reason: "", effectiveDate: new Date().toISOString().slice(0, 10) });
    } else if (type === "activate") {
      setForm({ reason: "", effectiveDate: new Date().toISOString().slice(0, 10) });
    } else if (type === "separate") {
      setForm({ separationType: "", separationReason: "", separationDate: new Date().toISOString().slice(0, 10) });
    } else if (type === "change_status") {
      setForm({ newStatus: "", reason: "", effectiveDate: new Date().toISOString().slice(0, 10) });
    } else if (type === "link_user") {
      setForm({ userId: "" });
    } else if (type === "add_credential") {
      setForm({ credentialType: "license", credentialName: "", issuingInstitution: "", issueDate: "", expiryDate: "", licenseNumber: "", notes: "", verificationStatus: "pending" });
    } else if (type === "add_document") {
      setForm({ documentType: "contract", documentName: "", issueDate: "", expiryDate: "", notes: "", verificationStatus: "pending" });
    } else if (type === "add_assignment") {
      setForm({ facilityId: staff?.facilityId || "", departmentId: staff?.departmentId || "", position: staff?.position || "", supervisorId: staff?.supervisorId || "", startDate: new Date().toISOString().slice(0, 10), endDate: "", assignmentType: "assignment", status: "active", reason: "" });
    } else {
      setForm({});
    }
  }, [type, staff]);

  // Load departments when facilityId changes
  useEffect(() => {
    if (form.facilityId) {
      fetch(`/api/departments?facilityId=${form.facilityId}`)
        .then((r) => safeJson(r))
        .then((d) => setDepartments(d.items || []))
        .catch(() => setDepartments([]));
    } else {
      setDepartments([]);
    }
  }, [form.facilityId]);

  const usersQ = useQuery({
    queryKey: ["users-for-link"],
    queryFn: () => fetchJson("/api/users?limit=200"),
    enabled: type === "link_user",
  });

  const titles: Record<string, { title: string; description: string; icon: any }> = {
    transfer: { title: "Transfer Staff", description: "Move this staff member to a different facility, department, or position.", icon: ArrowRightLeft },
    promote: { title: "Promote Staff", description: "Change position, job grade or job level.", icon: TrendingUp },
    suspend: { title: "Suspend Staff", description: "Suspend this staff member. A reason is required.", icon: Ban },
    activate: { title: "Activate Staff", description: "Set this staff member's status to active.", icon: CheckCircle2 },
    separate: { title: "Separate Staff", description: "Record a resignation, termination, retirement or contract expiry.", icon: LogOut },
    change_status: { title: "Change Status", description: "Change the staff member's employment status.", icon: RefreshCcw },
    link_user: { title: "Link User Account", description: "Link this staff record to an existing user account.", icon: Link2 },
    add_credential: { title: "Add Credential", description: "Add a license, certification or qualification.", icon: Award },
    add_document: { title: "Add Document", description: "Add an HR document (contract, ID card, etc.).", icon: FileText },
    add_assignment: { title: "Add Assignment", description: "Manually add an assignment record to the staff's history.", icon: ClipboardList },
  };
  const meta = titles[type] || titles.change_status;
  const Icon = meta.icon;

  const mutation = useMutation({
    mutationFn: async () => {
      return patchStaff(staff.id, { action: type, ...form });
    },
    onSuccess: () => {
      toast.success(`${meta.title} completed`);
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["staff-detail"] });
      qc.invalidateQueries({ queryKey: ["staff-stats"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const renderForm = () => {
    if (type === "transfer") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>New Facility</Label>
            <Select value={form.facilityId || undefined} onValueChange={(v) => set("facilityId", v)}>
              <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
              <SelectContent>
                {facilities.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>New Department</Label>
            <Select value={form.departmentId || "__none__"} onValueChange={(v) => set("departmentId", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>New Position</Label>
            <Input value={form.position} onChange={(e) => set("position", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Effective Date</Label>
            <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Reason</Label>
            <Textarea rows={2} value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Reason for transfer (optional)" />
          </div>
        </div>
      );
    }
    if (type === "promote") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>New Position</Label>
            <Input value={form.position} onChange={(e) => set("position", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>New Job Grade</Label>
            <Input value={form.jobGrade} onChange={(e) => set("jobGrade", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>New Job Level</Label>
            <Input value={form.jobLevel} onChange={(e) => set("jobLevel", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Effective Date</Label>
            <Input type="date" value={form.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Reason</Label>
            <Textarea rows={2} value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Reason for promotion (optional)" />
          </div>
        </div>
      );
    }
    if (type === "suspend" || type === "activate") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Effective Date</Label>
            <Input type="date" value={form.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required={type === "suspend"}>Reason</FieldLabel>
            <Textarea rows={2} value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder={type === "suspend" ? "Reason for suspension" : "Reason (optional)"} />
          </div>
        </div>
      );
    }
    if (type === "separate") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel required>Separation Type</FieldLabel>
            <Select value={form.separationType || undefined} onValueChange={(v) => set("separationType", v)}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {SEPARATION_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Separation Date</FieldLabel>
            <Input type="date" value={form.separationDate} onChange={(e) => set("separationDate", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Reason</FieldLabel>
            <Textarea rows={2} value={form.separationReason} onChange={(e) => set("separationReason", e.target.value)} placeholder="Detailed reason for separation" />
          </div>
        </div>
      );
    }
    if (type === "change_status") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel required>New Status</FieldLabel>
            <Select value={form.newStatus || undefined} onValueChange={(v) => set("newStatus", v)}>
              <SelectTrigger><SelectValue placeholder="Select new status" /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Effective Date</Label>
            <Input type="date" value={form.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Reason</Label>
            <Textarea rows={2} value={form.reason} onChange={(e) => set("reason", e.target.value)} />
          </div>
        </div>
      );
    }
    if (type === "link_user") {
      const users: any[] = usersQ.data?.users || usersQ.data?.items || [];
      return (
        <div className="space-y-1.5">
          <FieldLabel required>User Account</FieldLabel>
          <Select value={form.userId || undefined} onValueChange={(v) => set("userId", v)}>
            <SelectTrigger><SelectValue placeholder="Select user account" /></SelectTrigger>
            <SelectContent>
              {users.map((u: any) => (
                <SelectItem key={u.id} value={u.id}>{u.username} ({u.email})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {usersQ.isLoading && <p className="text-xs text-slate-500">Loading users…</p>}
        </div>
      );
    }
    if (type === "add_credential") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel required>Credential Name</FieldLabel>
            <Input value={form.credentialName} onChange={(e) => set("credentialName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.credentialType || undefined} onValueChange={(v) => set("credentialType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CREDENTIAL_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Issuing Institution</Label>
            <Input value={form.issuingInstitution} onChange={(e) => set("issuingInstitution", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>License Number</Label>
            <Input value={form.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Issue Date</Label>
            <Input type="date" value={form.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Expiry Date</Label>
            <Input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Verification Status</Label>
            <Select value={form.verificationStatus || undefined} onValueChange={(v) => set("verificationStatus", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
      );
    }
    if (type === "add_document") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel required>Document Name</FieldLabel>
            <Input value={form.documentName} onChange={(e) => set("documentName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.documentType || undefined} onValueChange={(v) => set("documentType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Issue Date</Label>
            <Input type="date" value={form.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Expiry Date</Label>
            <Input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Verification Status</Label>
            <Select value={form.verificationStatus || undefined} onValueChange={(v) => set("verificationStatus", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
      );
    }
    if (type === "add_assignment") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Facility</Label>
            <Select value={form.facilityId || undefined} onValueChange={(v) => set("facilityId", v)}>
              <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
              <SelectContent>
                {facilities.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={form.departmentId || "__none__"} onValueChange={(v) => set("departmentId", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Position</Label>
            <Input value={form.position} onChange={(e) => set("position", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Assignment Type</Label>
            <Select value={form.assignmentType || undefined} onValueChange={(v) => set("assignmentType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNMENT_TYPES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Start Date</Label>
            <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>End Date</Label>
            <Input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Reason</Label>
            <Textarea rows={2} value={form.reason} onChange={(e) => set("reason", e.target.value)} />
          </div>
        </div>
      );
    }
    return null;
  };

  const isRequiredMet = () => {
    if (type === "suspend") return !!form.reason;
    if (type === "separate") return !!form.separationType && !!form.separationReason;
    if (type === "change_status") return !!form.newStatus;
    if (type === "link_user") return !!form.userId;
    if (type === "add_credential") return !!form.credentialName;
    if (type === "add_document") return !!form.documentName;
    return true;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <DialogTitle className="text-white flex items-center gap-2"><Icon className="w-5 h-5 text-blue-600" /> {meta.title}</DialogTitle>
          <DialogDescription className="text-white/80">{meta.description}</DialogDescription>
        </DialogHeader>

        <div className="py-2 flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
          <Avatar className="w-8 h-8 bg-blue-100">
            <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">{`${staff?.firstName?.[0] || ""}${staff?.lastName?.[0] || ""}`.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm font-medium text-slate-900">{staff?.firstName} {staff?.lastName}</div>
            <div className="text-xs text-slate-500">{staff?.position || staff?.profession || staff?.staffNumber}</div>
          </div>
        </div>

        {renderForm()}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !isRequiredMet()}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {mutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

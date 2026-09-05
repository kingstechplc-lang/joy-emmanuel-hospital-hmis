"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollText, Search, Download, ChevronLeft, ChevronRight, FileJson } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, formatDate, safeJson, ClearableSearch} from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

const PAGE_SIZE = 50;

const ACTION_PREFIXES = [
  { value: "", label: "All Actions" },
  { value: "PATIENT", label: "Patient" },
  { value: "ENCOUNTER", label: "Encounter" },
  { value: "LAB", label: "Lab" },
  { value: "IMAGING", label: "Imaging" },
  { value: "PHARMACY", label: "Pharmacy" },
  { value: "INVOICE", label: "Invoice" },
  { value: "PAYMENT", label: "Payment" },
  { value: "USER", label: "User" },
  { value: "ROLE", label: "Role" },
  { value: "PERMISSION", label: "Permission" },
  { value: "FACILITY", label: "Facility" },
  { value: "DEPARTMENT", label: "Department" },
  { value: "STAFF", label: "Staff" },
  { value: "SHIFT", label: "Shift" },
  { value: "LEAVE", label: "Leave" },
  { value: "DOCUMENT", label: "Document" },
  { value: "TASK", label: "Task" },
  { value: "SETTINGS", label: "Settings" },
];

const RESOURCE_TYPES = [
  "patient",
  "encounter",
  "appointment",
  "consultation",
  "diagnosis",
  "lab_order",
  "lab_result",
  "imaging_order",
  "prescription",
  "invoice",
  "payment",
  "refund",
  "insurance_claim",
  "user",
  "role",
  "permission",
  "facility",
  "department",
  "unit",
  "staff",
  "staff_shift",
  "leave_record",
  "document",
  "task",
  "service",
  "medication",
  "laboratory_test",
  "insurance_provider",
  "system_setting",
  "inventory_item",
  "purchase_order",
  "supplier",
];

export function AuditLogsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const canExport = user?.roles?.includes("super_admin") || (user?.permissions || []).includes("audit.export");

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(0);
  const [viewing, setViewing] = useState<any | null>(null);

  const facilitiesQ = useQuery({
    queryKey: ["facilities-for-audit"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const facilities = facilitiesQ.data?.facilities || [];

  const usersQ = useQuery({
    queryKey: ["users-for-audit"],
    queryFn: () => fetchJson("/api/users"),
  });
  const users = usersQ.data?.items || [];

  const params = new URLSearchParams();
  params.set("offset", String(page * PAGE_SIZE));
  params.set("limit", String(PAGE_SIZE));
  if (search) params.set("q", search);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (action) params.set("action", action);
  if (resourceType) params.set("resourceType", resourceType);
  if (facilityId) params.set("facilityId", facilityId);
  if (userId) params.set("userId", userId);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["audit-logs", search, dateFrom, dateTo, action, resourceType, facilityId, userId, page],
    queryFn: () => fetchJson(`/api/audit-logs?${params.toString()}`),
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportCsv = () => {
    if (!items.length) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Timestamp", "User", "Action", "Resource Type", "Resource ID", "Facility", "IP Address", "Reason"];
    const rows = items.map((l: any) => [
      new Date(l.createdAt).toISOString(),
      l.user ? `${l.user.firstName} ${l.user.lastName} (@${l.user.username})` : "—",
      l.action,
      l.resourceType || "",
      l.resourceId || "",
      l.facility?.name || "",
      l.ipAddress || "",
      (l.reason || "").replace(/"/g, '""'),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c)}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${items.length} log entries`);
  };

  const resetFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setAction("");
    setResourceType("");
    setFacilityId("");
    setUserId("");
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Audit Logs</h2>
          <p className="text-sm text-slate-500">Searchable record of all system actions. Read-only.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetFilters} className="gap-2">
            <Search className="w-4 h-4" /> Reset Filters
          </Button>
          {canExport && (
            <Button onClick={exportCsv} className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={!items.length}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5 md:col-span-1">
            <Label className="text-xs">Free-text Search</Label>
            <ClearableSearch value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Action, resource ID, reason..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Action</Label>
            <Select value={action || undefined} onValueChange={(v) => { setAction(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_PREFIXES.map((a) => <SelectItem key={a.value || "all"} value={a.value || "all"}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Resource Type</Label>
            <Select value={resourceType || undefined} onValueChange={(v) => { setResourceType(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resource Types</SelectItem>
                {RESOURCE_TYPES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Facility</Label>
            <Select value={facilityId || undefined} onValueChange={(v) => { setFacilityId(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Facilities</SelectItem>
                {facilities.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">User</Label>
            <Select value={userId || undefined} onValueChange={(v) => { setUserId(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName} (@{u.username})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Date From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Date To</Label>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={PAGE_SIZE} />
      ) : isError ? (
        <ErrorState message="Failed to load audit logs" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No audit logs found" description="Try adjusting filters or date range." /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Timestamp</th>
                    <th className="text-left p-3 font-semibold text-slate-700">User</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Action</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Resource</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Facility</th>
                    <th className="text-left p-3 font-semibold text-slate-700">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((l: any) => (
                    <tr key={l.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => setViewing(l)}>
                      <td className="p-3 whitespace-nowrap text-slate-700">{formatDate(l.createdAt, true)}</td>
                      <td className="p-3">
                        {l.user ? (
                          <div>
                            <div className="text-slate-900">{l.user.firstName} {l.user.lastName}</div>
                            <div className="text-xs text-slate-500">@{l.user.username}</div>
                          </div>
                        ) : <span className="text-slate-400">System</span>}
                      </td>
                      <td className="p-3"><code className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{l.action}</code></td>
                      <td className="p-3">
                        {l.resourceType ? (
                          <div>
                            <div className="text-slate-900">{l.resourceType}</div>
                            {l.resourceId && <div className="text-xs text-slate-500 font-mono truncate max-w-[200px]">{l.resourceId}</div>}
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="p-3 text-slate-700">{l.facility?.name || "—"}</td>
                      <td className="p-3 text-xs text-slate-500">{l.ipAddress || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {(total > 0 || page > 0) && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">
            Showing <span className="font-medium">{page * PAGE_SIZE + 1}</span>–<span className="font-medium">{Math.min((page + 1) * PAGE_SIZE, total)}</span> of <span className="font-medium">{total}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-3 py-1.5 text-sm">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={!data?.hasMore} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {viewing && <LogDetailDialog log={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function LogDetailDialog({ log, onClose }: { log: any; onClose: () => void }) {
  const oldValues = log.oldValues ? safeParseJson(log.oldValues) : null;
  const newValues = log.newValues ? safeParseJson(log.newValues) : null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-emerald-600" />
            Audit Log Detail
          </DialogTitle>
          <DialogDescription className="text-white/80">
            <code className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{log.action}</code> on <code className="bg-slate-100 px-1.5 py-0.5 rounded">{log.resourceType || "—"}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <DetailItem label="Timestamp" value={formatDate(log.createdAt, true)} />
          <DetailItem label="User" value={log.user ? `${log.user.firstName} ${log.user.lastName} (@${log.user.username})` : "System"} />
          <DetailItem label="Facility" value={log.facility?.name || "—"} />
          <DetailItem label="Resource ID" value={log.resourceId || "—"} />
          <DetailItem label="IP Address" value={log.ipAddress || "—"} />
          <DetailItem label="User Agent" value={<span className="text-xs">{log.userAgent || "—"}</span>} />
          {log.reason && <DetailItem label="Reason" value={log.reason} />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Old Values</Label>
            <pre className="bg-rose-50 border border-rose-100 rounded p-3 text-xs overflow-x-auto max-h-72">
              {oldValues ? JSON.stringify(oldValues, null, 2) : <span className="text-slate-400">—</span>}
            </pre>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">New Values</Label>
            <pre className="bg-emerald-50 border border-emerald-100 rounded p-3 text-xs overflow-x-auto max-h-72">
              {newValues ? JSON.stringify(newValues, null, 2) : <span className="text-slate-400">—</span>}
            </pre>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}><FileJson className="w-4 h-4 mr-2" /> Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <div className="text-sm text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

function safeParseJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

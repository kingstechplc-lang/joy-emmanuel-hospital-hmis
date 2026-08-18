"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Plus, Search, RefreshCcw, AlertCircle, Eye, MapPin, Users, Activity } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative } from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

const INCIDENT_TYPES = [
  { value: "all", label: "All Types" },
  { value: "clinical", label: "Clinical" },
  { value: "safety", label: "Safety" },
  { value: "security", label: "Security" },
  { value: "equipment", label: "Equipment" },
  { value: "other", label: "Other" },
];

const SEVERITY_OPTIONS = [
  { value: "all", label: "All Severities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "reported", label: "Reported" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
];

// Map severity to color classes for visual emphasis
const SEVERITY_COLOR: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
};

const INCIDENT_TYPE_COLOR: Record<string, string> = {
  clinical: "text-emerald-700",
  safety: "text-amber-700",
  security: "text-orange-700",
  equipment: "text-teal-700",
  other: "text-slate-700",
};

export function IncidentReportsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (typeFilter !== "all") params.set("incidentType", typeFilter);
  if (severityFilter !== "all") params.set("severity", severityFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["incidents", activeFacilityId, typeFilter, severityFilter, statusFilter],
    queryFn: () => fetchJson(`/api/incidents${qs}`),
  });

  const items = (data?.items || []).filter((i: any) =>
    !search ||
    i.description?.toLowerCase().includes(search.toLowerCase()) ||
    i.location?.toLowerCase().includes(search.toLowerCase()) ||
    i.peopleInvolved?.toLowerCase().includes(search.toLowerCase())
  );

  // Stats
  const stats = (data?.items || []).reduce(
    (acc: any, i: any) => {
      acc.total += 1;
      acc.byStatus[i.status] = (acc.byStatus[i.status] || 0) + 1;
      if (i.severity === "critical") acc.critical += 1;
      if (i.severity === "high") acc.high += 1;
      return acc;
    },
    { total: 0, byStatus: {}, critical: 0, high: 0 }
  );

  const advanceMutation = useMutation({
    mutationFn: async ({ id, status, resolution }: { id: string; status: string; resolution?: string }) => {
      const res = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolution }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (_d, vars) => {
      toast.success(`Incident marked as ${vars.status}`);
      qc.invalidateQueries({ queryKey: ["incidents"] });
      setViewing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            Incident Reports
          </h2>
          <p className="text-sm text-slate-500">
            Document and track clinical, safety, security, and equipment incidents
          </p>
        </div>
        {can("task.assign") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Report Incident
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Total</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Reported</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{stats.byStatus["reported"] || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Investigating</div>
            <div className="text-2xl font-bold text-orange-600 mt-1">{stats.byStatus["investigating"] || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">High / Critical</div>
            <div className="text-2xl font-bold text-rose-600 mt-1">{stats.high + stats.critical}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input
              className="pl-8"
              placeholder="Search by description, location, or people involved"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={typeFilter || undefined} onValueChange={setTypeFilter}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {INCIDENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={severityFilter || undefined} onValueChange={setSeverityFilter}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEVERITY_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load incident reports" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6">
          <EmptyState
            title="No incidents found"
            description="Document clinical, safety, security, or equipment incidents to keep track of corrective actions."
            icon={AlertCircle}
            action={can("task.assign") && (
              <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4" /> Report Incident
              </Button>
            )}
          />
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Description</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Severity</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Location</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Reported By</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Reported</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i: any) => (
                    <tr
                      key={i.id}
                      className="border-b hover:bg-slate-50 cursor-pointer"
                      onClick={() => setViewing(i)}
                    >
                      <td className="p-3 max-w-md">
                        <div className="font-medium text-slate-900 line-clamp-2">{i.description}</div>
                        {i.facility && <div className="text-xs text-slate-500 mt-0.5">{i.facility.name}</div>}
                      </td>
                      <td className="p-3">
                        <span className={`font-medium capitalize ${INCIDENT_TYPE_COLOR[i.incidentType] || "text-slate-700"}`}>
                          {i.incidentType}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${SEVERITY_COLOR[i.severity] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                          {i.severity}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700">
                        {i.location ? (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[120px]">{i.location}</span>
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="p-3">
                        {i.reportedBy ? (
                          <div>
                            <div className="text-slate-900">{i.reportedBy.firstName} {i.reportedBy.lastName}</div>
                            <div className="text-xs text-slate-500">@{i.reportedBy.username}</div>
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="p-3">
                        <div className="text-slate-900">{formatRelative(i.createdAt)}</div>
                        <div className="text-xs text-slate-500">{formatDate(i.createdAt, true)}</div>
                      </td>
                      <td className="p-3"><StatusBadge status={i.status} /></td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => setViewing(i)} className="h-8 w-8 p-0">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showNew && <NewIncidentDialog onClose={() => setShowNew(false)} />}
      {viewing && (
        <IncidentDetail
          incident={viewing}
          onClose={() => setViewing(null)}
          canManage={can("task.assign")}
          onAdvance={(status, resolution) => advanceMutation.mutate({ id: viewing.id, status, resolution })}
          advancing={advanceMutation.isPending}
        />
      )}
    </div>
  );
}

function NewIncidentDialog({ onClose }: { onClose: () => void }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [form, setForm] = useState({
    incidentType: "clinical",
    severity: "medium",
    description: "",
    location: "",
    peopleInvolved: "",
    immediateAction: "",
    facilityId: activeFacilityId || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentType: form.incidentType,
          severity: form.severity,
          description: form.description,
          location: form.location || undefined,
          peopleInvolved: form.peopleInvolved || undefined,
          immediateAction: form.immediateAction || undefined,
          facilityId: form.facilityId || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Incident report created");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" /> Report Incident
          </DialogTitle>
          <DialogDescription>
            Document an adverse event, near-miss, or operational incident for follow-up and corrective action.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Incident Type</FieldLabel>
            <Select value={form.incidentType || undefined} onValueChange={(v) => setForm({ ...form, incidentType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INCIDENT_TYPES.filter((t) => t.value !== "all").map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Severity</FieldLabel>
            <Select value={form.severity || undefined} onValueChange={(v) => setForm({ ...form, severity: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.filter((s) => s.value !== "all").map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>Description</FieldLabel>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              placeholder="Describe what happened, when, and the sequence of events..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g., Ward 2B, Pharmacy, ER Triage"
            />
          </div>
          <div className="space-y-1.5">
            <Label>People Involved</Label>
            <Input
              value={form.peopleInvolved}
              onChange={(e) => setForm({ ...form, peopleInvolved: e.target.value })}
              placeholder="Patient, staff, witnesses (comma-separated)"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Immediate Action Taken</Label>
            <Textarea
              value={form.immediateAction}
              onChange={(e) => setForm({ ...form, immediateAction: e.target.value })}
              rows={3}
              placeholder="First aid, isolation, equipment removed, supervisor notified..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.description}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {mutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            Submit Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncidentDetail({
  incident,
  onClose,
  canManage,
  onAdvance,
  advancing,
}: {
  incident: any;
  onClose: () => void;
  canManage: boolean;
  onAdvance: (status: string, resolution?: string) => void;
  advancing: boolean;
}) {
  const [resolution, setResolution] = useState(incident.resolution || "");

  const nextStatus = incident.status === "reported" ? "investigating" : incident.status === "investigating" ? "resolved" : null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Incident Report
          </DialogTitle>
          <DialogDescription>
            Filed {formatDate(incident.createdAt, true)} ({formatRelative(incident.createdAt)})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={incident.incidentType} />
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${SEVERITY_COLOR[incident.severity] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
              {incident.severity} severity
            </span>
            <StatusBadge status={incident.status} />
          </div>

          <DetailBlock label="Description" icon={AlertCircle} value={incident.description} />
          {incident.location && (
            <DetailBlock label="Location" icon={MapPin} value={incident.location} />
          )}
          {incident.peopleInvolved && (
            <DetailBlock label="People Involved" icon={Users} value={incident.peopleInvolved} />
          )}
          {incident.immediateAction && (
            <DetailBlock label="Immediate Action Taken" icon={Activity} value={incident.immediateAction} />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <DetailRow label="Facility" value={incident.facility?.name || "—"} />
            <DetailRow label="Reported By" value={incident.reportedBy ? `${incident.reportedBy.firstName} ${incident.reportedBy.lastName} (@${incident.reportedBy.username})` : "—"} />
          </div>

          {incident.status === "resolved" && incident.resolution && (
            <DetailBlock label="Resolution" icon={Activity} value={incident.resolution} />
          )}

          {canManage && nextStatus && (
            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs text-slate-500">Resolution notes {nextStatus === "resolved" && "(required)"}</Label>
              <Textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={3}
                placeholder={nextStatus === "resolved" ? "Describe root cause, corrective and preventive actions taken..." : "Investigation findings, assigned investigator, scope..."}
                disabled={advancing}
              />
              <Button
                onClick={() => onAdvance(nextStatus, resolution || undefined)}
                disabled={advancing || (nextStatus === "resolved" && !resolution.trim())}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {advancing ? <RefreshCcw className="w-4 h-4 animate-spin" /> : null}
                Mark as {nextStatus}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailBlock({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="bg-slate-50 rounded-md p-3 border border-slate-100">
      <div className="text-xs text-slate-500 font-medium uppercase tracking-wide flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-sm text-slate-900 whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <div className="text-sm text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

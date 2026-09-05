"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, BedDouble, LogOut, Search, XCircle, Stethoscope, Eye, Activity, CheckCircle2, Bed, FileText, UserCheck, Calendar } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative, safeJson, PageHeader, MiniStatCard, ClearableSearch} from "@/components/ui-helpers"
import { DiagnosisPicker } from "@/components/ui/diagnosis-picker";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "requested", label: "Requested" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "awaiting_bed", label: "Awaiting Bed" },
  { value: "bed_assigned", label: "Bed Assigned" },
  { value: "admitted", label: "Admitted" },
  { value: "discharge_planned", label: "Discharge Planned" },
  { value: "discharged", label: "Discharged" },
  { value: "transferred", label: "Transferred" },
  { value: "cancelled", label: "Cancelled" },
  { value: "declined", label: "Declined" },
  { value: "ama", label: "Left AMA" },
  { value: "deceased", label: "Deceased" },
];

const ADMISSION_TYPES = [
  { value: "emergency", label: "Emergency" },
  { value: "elective", label: "Elective" },
  { value: "urgent", label: "Urgent" },
  { value: "planned", label: "Planned" },
  { value: "transfer_in", label: "Transfer-in" },
  { value: "post_operative", label: "Post-operative" },
  { value: "maternity", label: "Maternity" },
  { value: "newborn", label: "Newborn" },
  { value: "observation", label: "Observation" },
  { value: "day_case", label: "Day Case" },
  { value: "other", label: "Other" },
];

const ADMISSION_SOURCES = [
  { value: "emergency", label: "Emergency" },
  { value: "consultation", label: "Consultation" },
  { value: "opd", label: "OPD" },
  { value: "specialty_clinic", label: "Specialty Clinic" },
  { value: "maternity", label: "Maternity" },
  { value: "referral", label: "Referral" },
  { value: "transfer_in", label: "Transfer-in" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "stat", label: "STAT" },
];

const DISCHARGE_READINESS = [
  { value: "not_ready", label: "Not Ready" },
  { value: "pending_investigations", label: "Pending Investigations" },
  { value: "pending_medications", label: "Pending Medications" },
  { value: "pending_consult", label: "Pending Consult" },
  { value: "ready", label: "Ready" },
  { value: "cleared", label: "Cleared" },
];

function statusColor(s?: string): string {
  const map: Record<string, string> = {
    requested: "blue", pending_approval: "amber", approved: "emerald",
    awaiting_bed: "amber", bed_assigned: "blue", admitted: "emerald",
    discharge_planned: "violet", discharged: "slate", transferred: "blue",
    cancelled: "rose", declined: "rose", ama: "amber", deceased: "rose",
  };
  return map[s || ""] || "slate";
}

function calcLOS(admittedAt?: string | Date | null, dischargedAt?: string | Date | null): string {
  if (!admittedAt) return "—";
  const end = dischargedAt ? new Date(dischargedAt) : new Date();
  const start = new Date(admittedAt);
  const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
  return `${days}d`;
}

export function AdmissionsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [tab, setTab] = useState("list");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [dischargeAdmission, setDischargeAdmission] = useState<any | null>(null);
  const [diagnosisAdmission, setDiagnosisAdmission] = useState<any | null>(null);
  const [actionAdmission, setActionAdmission] = useState<any | null>(null);
  const [actionType, setActionType] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admissions", activeFacilityId, statusFilter],
    queryFn: () => fetchJson(`/api/admissions${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admissions"] });
    qc.invalidateQueries({ queryKey: ["admissions-census"] });
    qc.invalidateQueries({ queryKey: ["beds"] });
    qc.invalidateQueries({ queryKey: ["wards"] });
    qc.invalidateQueries({ queryKey: ["wards-manage"] });
    qc.invalidateQueries({ queryKey: ["wards-for-assign"] });
    qc.invalidateQueries({ queryKey: ["beds-stats"] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admissions"
        description="Complete inpatient management — admission requests, bed assignment, transfers, discharge planning, and progress notes"
        icon={BedDouble}
        gradient="from-amber-500 to-orange-600"
        actions={
          <Button onClick={() => setShowNew(true)} disabled={!can("admission.create") && !can("admission.request")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Admission
        </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view admissions.</CardContent></Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5"><Activity className="w-4 h-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5"><BedDouble className="w-4 h-4" /> Admissions</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <DashboardTab facilityId={activeFacilityId} />
        </TabsContent>

        <TabsContent value="list" className="space-y-4">
      <Card>
        <CardContent className="p-3">
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load admissions" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No admissions"
              description="Create a new admission to assign a patient to a bed."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("admission.create")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Admission</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Admission #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Ward / Bed</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Admitted</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">LOS</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a: any) => {
                    const ba = a.bedAssignments?.[0];
                    return (
                      <tr key={a.id} className="border-b hover:bg-emerald-50/40">
                        <td className="p-3 font-mono text-xs text-slate-700">{a.admissionNumber}</td>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{a.patient?.firstName} {a.patient?.lastName}</div>
                          <div className="text-xs text-slate-500">{a.patient?.patientNumber}</div>
                        </td>
                        <td className="p-3">
                          {ba ? (
                            <div>
                              <div className="text-sm font-medium text-slate-900">{ba.ward?.name}</div>
                              <div className="text-xs text-slate-500">Bed {ba.bed?.bedNumber}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">No active bed</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px] capitalize">{a.admissionType || "—"}</Badge>
                        </td>
                        <td className="p-3 text-xs text-slate-600">
                          <div>{formatDate(a.admittedAt)}</div>
                          <div className="text-[10px] text-slate-400">{formatRelative(a.admittedAt)}</div>
                        </td>
                        <td className="p-3">
                          <Badge className={`bg-${statusColor(a.status)}-100 text-${statusColor(a.status)}-700`}>{a.status.replace(/_/g, " ")}</Badge>
                        </td>
                        <td className="p-3 text-xs text-slate-600">{calcLOS(a.admittedAt, a.dischargedAt)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Status-specific action buttons */}
                            {(a.status === "requested" || a.status === "pending_approval") && can("admission.approve") && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600" onClick={() => { setActionAdmission(a); setActionType("approve"); }} title="Approve / Decline">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {(a.status === "approved" || a.status === "awaiting_bed") && can("admission.bed_assign") && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600" onClick={() => { setActionAdmission(a); setActionType("assign_bed"); }} title="Assign Bed">
                                <Bed className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {a.status === "bed_assigned" && can("admission.confirm") && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600" onClick={() => { setActionAdmission(a); setActionType("confirm"); }} title="Confirm Arrival">
                                <UserCheck className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {a.status === "admitted" && can("admission.progress_note") && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-indigo-600" onClick={() => { setActionAdmission(a); setActionType("progress_note"); }} title="Add Progress Note">
                                <FileText className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {a.status === "admitted" && can("admission.discharge_plan") && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-violet-600" onClick={() => { setActionAdmission(a); setActionType("discharge_plan"); }} title="Plan Discharge">
                                <Calendar className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-indigo-600 hover:text-indigo-700" onClick={() => setDiagnosisAdmission(a)} title="View / Manage Diagnoses">
                              <Stethoscope className="w-3.5 h-3.5" />
                            </Button>
                            {(a.status === "admitted" || a.status === "discharge_planned") && can("admission.discharge") && (
                              <Button size="sm" onClick={() => setDischargeAdmission(a)} className="gap-1 h-7 text-xs bg-rose-600 hover:bg-rose-700">
                                <LogOut className="w-3 h-3" /> Discharge
                              </Button>
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

      <NewAdmissionDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); invalidate(); }}
        facilityId={activeFacilityId}
      />

      {dischargeAdmission && (
        <DischargeDialog
          admission={dischargeAdmission}
          onClose={() => setDischargeAdmission(null)}
          onDone={() => { setDischargeAdmission(null); invalidate(); }}
        />
      )}

      {diagnosisAdmission && (
        <DiagnosisDialog
          admission={diagnosisAdmission}
          canManage={can("diagnosis.create")}
          onClose={() => setDiagnosisAdmission(null)}
        />
      )}

      {actionAdmission && actionType && (
        <AdmissionActionDialog
          admission={actionAdmission}
          actionType={actionType}
          onClose={() => { setActionAdmission(null); setActionType(null); }}
          onDone={() => { setActionAdmission(null); setActionType(null); invalidate(); }}
        />
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Dashboard Tab — inpatient census + stats
// ============================================================
function DashboardTab({ facilityId }: { facilityId: string | null }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admissions-census", facilityId],
    queryFn: () => fetchJson(`/api/admissions/census?facilityId=${facilityId || ""}`),
    enabled: !!facilityId,
  });
  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message="Failed to load census" onRetry={() => refetch()} />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MiniStatCard label="Current Inpatients" value={data.currentInpatients} icon={BedDouble} gradient="from-emerald-500 to-emerald-600" />
        <MiniStatCard label="Today's Admissions" value={data.todayAdmissions} icon={Plus} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="Pending Requests" value={data.pendingRequests} icon={FileText} gradient="from-amber-500 to-amber-600" />
        <MiniStatCard label="Awaiting Beds" value={data.awaitingBeds} icon={Bed} gradient="from-amber-500 to-orange-600" />
        <MiniStatCard label="Planned Discharges" value={data.plannedDischarges} icon={Calendar} gradient="from-violet-500 to-violet-600" />
        <MiniStatCard label="Today's Discharges" value={data.todayDischarges} icon={LogOut} gradient="from-slate-500 to-slate-600" />
        <MiniStatCard label="Transfers Today" value={data.transfersToday} icon={UserCheck} gradient="from-blue-500 to-indigo-600" />
        <MiniStatCard label="Cancelled Today" value={data.cancelledToday} icon={XCircle} gradient="from-rose-500 to-rose-600" />
        <MiniStatCard label="Available Beds" value={data.bedStats?.available || 0} icon={Bed} gradient="from-emerald-500 to-teal-600" />
        <MiniStatCard label="Occupied Beds" value={data.bedStats?.occupied || 0} icon={BedDouble} gradient="from-amber-500 to-amber-600" />
        <MiniStatCard label="Occupancy Rate" value={`${data.occupancyRate || 0}%`} icon={Activity} gradient="from-blue-500 to-blue-600" />
        <MiniStatCard label="Avg LOS (30d)" value={`${data.avgLOS || 0}d`} icon={Calendar} gradient="from-violet-500 to-violet-600" />
      </div>

      {data.wardCensus && data.wardCensus.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3">Ward Census</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-700">Ward</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Total Beds</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Occupied</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Available</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Reserved</th>
                    <th className="text-center p-2 font-semibold text-slate-700">Occupancy</th>
                  </tr>
                </thead>
                <tbody>
                  {data.wardCensus.map((w: any) => (
                    <tr key={w.id} className="border-b hover:bg-slate-50">
                      <td className="p-2 font-medium text-slate-900">{w.name} <span className="text-xs text-slate-500 font-mono">{w.code}</span></td>
                      <td className="p-2 text-center">{w.totalBeds}</td>
                      <td className="p-2 text-center text-amber-700 font-medium">{w.occupied}</td>
                      <td className="p-2 text-center text-emerald-700 font-medium">{w.available}</td>
                      <td className="p-2 text-center text-blue-700">{w.reserved}</td>
                      <td className="p-2 text-center">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded h-4 relative overflow-hidden">
                            <div className={`h-full ${w.occupancyRate > 80 ? "bg-rose-500" : w.occupancyRate > 60 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, w.occupancyRate)}%` }} />
                          </div>
                          <span className="text-xs font-medium text-slate-700 w-8">{w.occupancyRate}%</span>
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

      {data.byType && data.byType.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3">Current Inpatients by Type</div>
            <div className="flex flex-wrap gap-2">
              {data.byType.map((t: any) => (
                <Badge key={t.label} variant="outline" className="capitalize">{t.label}: {t.count}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Admission Action Dialog — handles approve, assign-bed, confirm, discharge-plan, progress-note
// ============================================================
function AdmissionActionDialog({ admission, actionType, onClose, onDone }: { admission: any; actionType: string; onClose: () => void; onDone: () => void }) {
  const titleMap: Record<string, string> = {
    approve: "Approve / Decline Admission",
    assign_bed: "Assign Bed",
    confirm: "Confirm Patient Arrival",
    discharge_plan: "Plan Discharge",
    progress_note: "Add Progress Note",
  };
  const title = titleMap[actionType] || "Action";

  if (actionType === "approve") return <ApproveDialog admission={admission} onClose={onClose} onDone={onDone} />;
  if (actionType === "assign_bed") return <AssignBedDialog admission={admission} onClose={onClose} onDone={onDone} />;
  if (actionType === "confirm") return <ConfirmDialog admission={admission} onClose={onClose} onDone={onDone} />;
  if (actionType === "discharge_plan") return <DischargePlanDialog admission={admission} onClose={onClose} onDone={onDone} />;
  if (actionType === "progress_note") return <ProgressNoteDialog admission={admission} onClose={onClose} onDone={onDone} />;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden"><div className="p-4">{title}</div></DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ admission, onClose, onDone }: { admission: any; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState("approved");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admissions/${admission.id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success(decision === "approved" ? "Admission approved" : "Admission declined");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle>Approve Admission Request</DialogTitle>
        <DialogDescription className="text-white/80">{admission.admissionNumber} — {admission.patient?.firstName} {admission.patient?.lastName}</DialogDescription></DialogHeader>
        <div className="p-6 space-y-3">
          <div>
            <FieldLabel required>Decision</FieldLabel>
            <Select value={decision} onValueChange={setDecision}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approve</SelectItem>
                <SelectItem value="declined">Decline</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Approval/decline notes..." /></div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className={`gap-2 ${decision === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
            {saving ? "Saving..." : decision === "approved" ? "Approve" : "Decline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignBedDialog({ admission, onClose, onDone }: { admission: any; onClose: () => void; onDone: () => void }) {
  const [wardId, setWardId] = useState(admission.requestedWardId || "");
  const [bedId, setBedId] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: wardsData } = useQuery({
    queryKey: ["wards-for-assign", admission.facilityId],
    queryFn: () => fetchJson(`/api/wards?facilityId=${admission.facilityId}`),
  });
  const { data: bedsData } = useQuery({
    queryKey: ["beds-for-assign", wardId],
    queryFn: () => fetchJson(`/api/beds?facilityId=${admission.facilityId}`),
    enabled: !!wardId,
  });
  const availableBeds = (bedsData?.wards || []).flatMap((w: any) => w.beds || []).filter((b: any) => b.status === "available" && (!wardId || b.wardId === wardId));

  const submit = async () => {
    if (!wardId || !bedId) { toast.error("Select ward and bed"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admissions/${admission.id}/assign-bed`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wardId, bedId }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Bed assigned — bed is now reserved");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle>Assign Bed</DialogTitle>
        <DialogDescription className="text-white/80">{admission.admissionNumber} — {admission.patient?.firstName} {admission.patient?.lastName}</DialogDescription></DialogHeader>
        <div className="p-6 space-y-3">
          <div><FieldLabel required>Ward</FieldLabel>
            <Select value={wardId || undefined} onValueChange={(v) => { setWardId(v); setBedId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select ward" /></SelectTrigger>
              <SelectContent>
                {(wardsData?.wards || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><FieldLabel required>Bed</FieldLabel>
            <Select value={bedId || undefined} onValueChange={setBedId}>
              <SelectTrigger><SelectValue placeholder="Select available bed" /></SelectTrigger>
              <SelectContent>
                {availableBeds.length === 0 ? <SelectItem value="_none" disabled>No available beds</SelectItem> :
                  availableBeds.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bedNumber} ({b.bedType || "regular"})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            The bed will be reserved until the patient arrives. Use "Confirm Arrival" to mark the patient as admitted.
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !wardId || !bedId} className="gap-2 bg-emerald-600 hover:bg-emerald-700">{saving ? "Assigning..." : "Assign Bed"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({ admission, onClose, onDone }: { admission: any; onClose: () => void; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admissions/${admission.id}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Patient admitted — bed marked occupied");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle>Confirm Patient Arrival</DialogTitle>
        <DialogDescription className="text-white/80">{admission.admissionNumber} — {admission.patient?.firstName} {admission.patient?.lastName}</DialogDescription></DialogHeader>
        <div className="p-6 space-y-3">
          <div><Label>Condition on Arrival / Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Patient's condition on arrival..." /></div>
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
            This will mark the admission as "Admitted" and the bed as "Occupied".
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">{saving ? "Confirming..." : "Confirm Arrival"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DischargePlanDialog({ admission, onClose, onDone }: { admission: any; onClose: () => void; onDone: () => void }) {
  const [expectedDischargeDate, setExpectedDischargeDate] = useState(admission.expectedDischargeDate ? new Date(admission.expectedDischargeDate).toISOString().slice(0, 10) : "");
  const [dischargeReadiness, setDischargeReadiness] = useState(admission.dischargeReadiness || "not_ready");
  const [pendingItems, setPendingItems] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admissions/${admission.id}/discharge-plan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedDischargeDate: expectedDischargeDate || null,
          dischargeReadiness,
          pendingItems: pendingItems ? pendingItems.split("\n").filter(Boolean) : [],
        }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Discharge plan saved");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white"><DialogTitle>Plan Discharge</DialogTitle>
        <DialogDescription className="text-white/80">{admission.admissionNumber} — {admission.patient?.firstName} {admission.patient?.lastName}</DialogDescription></DialogHeader>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Expected Discharge Date</Label><Input type="date" value={expectedDischargeDate} onChange={(e) => setExpectedDischargeDate(e.target.value)} /></div>
            <div><Label>Discharge Readiness</Label>
              <Select value={dischargeReadiness} onValueChange={setDischargeReadiness}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DISCHARGE_READINESS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Pending Items (one per line)</Label><Textarea value={pendingItems} onChange={(e) => setPendingItems(e.target.value)} rows={3} placeholder="e.g., Await lab results&#10;Pharmacy clearance&#10;Specialist consult" /></div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-violet-600 hover:bg-violet-700">{saving ? "Saving..." : "Save Plan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgressNoteDialog({ admission, onClose, onDone }: { admission: any; onClose: () => void; onDone: () => void }) {
  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [diagnosisRef, setDiagnosisRef] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admissions/${admission.id}/progress-notes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjective, objective, assessment, plan, diagnosisRef, noteType: "doctor" }),
      });
      if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || "Failed"); }
      toast.success("Progress note saved");
      setSubjective(""); setObjective(""); setAssessment(""); setPlan(""); setDiagnosisRef("");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
          <DialogTitle>Doctor Progress Note (SOAP)</DialogTitle>
          <DialogDescription className="text-white/80">{admission.admissionNumber} — {admission.patient?.firstName} {admission.patient?.lastName}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div><Label>S — Subjective</Label><Textarea value={subjective} onChange={(e) => setSubjective(e.target.value)} rows={2} placeholder="Patient's complaint, history..." /></div>
          <div><Label>O — Objective</Label><Textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={2} placeholder="Examination findings, vitals..." /></div>
          <div><Label>A — Assessment</Label><Textarea value={assessment} onChange={(e) => setAssessment(e.target.value)} rows={2} placeholder="Clinical assessment, diagnosis..." /></div>
          <div><Label>P — Plan</Label><Textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={2} placeholder="Treatment plan, orders..." /></div>
          <div><Label>Diagnosis Reference</Label><Input value={diagnosisRef} onChange={(e) => setDiagnosisRef(e.target.value)} placeholder="ICD-10 code or diagnosis name" /></div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving..." : "Save Note"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// New Admission Dialog — transactional create (admission + bed assignment)
// ============================================================
function NewAdmissionDialog({ open, onClose, onCreated, facilityId }: { open: boolean; onClose: () => void; onCreated: () => void; facilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [wardId, setWardId] = useState("");
  const [bedId, setBedId] = useState("");
  const [admissionType, setAdmissionType] = useState("elective");
  const [admissionReason, setAdmissionReason] = useState("");
  const [admissionDiagnosis, setAdmissionDiagnosis] = useState("");
  const [attendingClinicianId, setAttendingClinicianId] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });

  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters", patientId, facilityId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}&facilityId=${facilityId || ""}`),
    enabled: !!patientId && !!facilityId,
  });

  const { data: wardsData } = useQuery({
    queryKey: ["wards", facilityId],
    queryFn: () => fetchJson(`/api/wards?facilityId=${facilityId}`),
    enabled: !!facilityId,
  });

  // Fetch available beds in the selected ward
  const { data: bedsData } = useQuery({
    queryKey: ["ward-beds", wardId],
    queryFn: () => fetchJson(`/api/beds?wardId=${wardId}&status=available`),
    enabled: !!wardId,
  });

  const selectPatient = (p: any) => {
    setPatientId(p.id);
    setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
  };

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    if (!facilityId) { toast.error("No active facility selected"); return; }
    if (!wardId) { toast.error("Please select a ward"); return; }
    if (!bedId) { toast.error("Please select an available bed"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          encounterId: encounterId || undefined,
          facilityId,
          wardId,
          bedId,
          admissionType,
          admissionReason,
          admissionDiagnosis,
          attendingClinicianId: attendingClinicianId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed to create admission");
      }
      toast.success("Admission created and bed assigned");
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setWardId(""); setBedId(""); setAdmissionReason(""); setAdmissionDiagnosis("");
      setAttendingClinicianId("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><BedDouble className="w-5 h-5" /> New Admission</DialogTitle>
          <DialogDescription className="text-white/80">Admit a patient and assign a bed. The admission and bed assignment are created atomically — if the bed is unavailable, the operation is rolled back.</DialogDescription>
        </DialogHeader>
        <div className="p-6 space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <ClearableSearch value={patientQuery} onChange={setPatientQuery} placeholder="Search by name, number, phone, Ghana Card..." className="" inputClassName="" />
            </div>
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => selectPatient(p)} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {patientId && (
            <div>
              <Label>Encounter (optional — auto-creates an inpatient encounter if blank)</Label>
              <Select value={encounterId || undefined} onValueChange={setEncounterId}>
                <SelectTrigger><SelectValue placeholder="Auto-create inpatient encounter" /></SelectTrigger>
                <SelectContent>
                  {(encountersData?.items || []).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.encounterNumber} • {e.encounterType} • {formatDate(e.startAt, true)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <FieldLabel required>Ward</FieldLabel>
            <Select value={wardId || undefined} onValueChange={(v) => { setWardId(v); setBedId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select ward" /></SelectTrigger>
              <SelectContent>
                {(wardsData?.items || []).map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} {w.code ? `(${w.code})` : ""} • {w.bedStats?.available || 0} available / {w.bedStats?.total || 0}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {wardId && (
            <div>
              <FieldLabel required>Bed (only available beds shown)</FieldLabel>
              <Select value={bedId || undefined} onValueChange={setBedId}>
                <SelectTrigger><SelectValue placeholder="Select an available bed" /></SelectTrigger>
                <SelectContent>
                  {(bedsData?.items || []).length === 0 ? (
                    <SelectItem value="_none" disabled>No available beds in this ward</SelectItem>
                  ) : (
                    (bedsData?.items || []).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        Bed {b.bedNumber} {b.bedType ? `• ${b.bedType}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Admission Type</Label>
              <Select value={admissionType || undefined} onValueChange={setAdmissionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ADMISSION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Attending Clinician ID (optional)</Label>
              <Input value={attendingClinicianId} onChange={(e) => setAttendingClinicianId(e.target.value)} placeholder="Defaults to current user" />
            </div>
          </div>

          <div>
            <Label>Admission Reason</Label>
            <Textarea value={admissionReason} onChange={(e) => setAdmissionReason(e.target.value)} rows={2} placeholder="Reason for admission (e.g. severe abdominal pain)" />
          </div>

          <div>
            <Label>Admission Diagnosis</Label>
            <Textarea value={admissionDiagnosis} onChange={(e) => setAdmissionDiagnosis(e.target.value)} rows={2} placeholder="Provisional diagnosis at admission" />
          </div>
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !patientId || !wardId || !bedId} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Creating..." : <><BedDouble className="w-4 h-4" /> Admit & Assign Bed</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Discharge Dialog — captures discharge details then submits via PATCH /api/admissions/[id]?action=discharge
// ============================================================
function DischargeDialog({ admission, onClose, onDone }: { admission: any; onClose: () => void; onDone: () => void }) {
  const [dischargeSummary, setDischargeSummary] = useState("");
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [procedures, setProcedures] = useState("");
  const [medications, setMedications] = useState("");
  const [followUpPlan, setFollowUpPlan] = useState("");
  const [disposition, setDisposition] = useState("home");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!disposition) { toast.error("Disposition required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admissions/${admission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "discharge",
          dischargeSummary, finalDiagnosis, procedures, medications, followUpPlan, disposition,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed to discharge");
      }
      toast.success("Patient discharged. Bed released and encounter closed.");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const ba = admission.bedAssignments?.[0];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><LogOut className="w-5 h-5" /> Discharge Patient</DialogTitle>
          <DialogDescription className="text-white/80">
            {admission.patient?.firstName} {admission.patient?.lastName} ({admission.patient?.patientNumber}) •
            Admission {admission.admissionNumber}
            {ba ? ` • Bed ${ba.bed?.bedNumber} (${ba.ward?.name})` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="p-6 space-y-3">
          <div>
            <Label>Discharge Summary</Label>
            <Textarea value={dischargeSummary} onChange={(e) => setDischargeSummary(e.target.value)} rows={3} placeholder="Course of treatment during admission..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Final Diagnosis</Label>
              <Input value={finalDiagnosis} onChange={(e) => setFinalDiagnosis(e.target.value)} placeholder="Final diagnosis at discharge" />
            </div>
            <div>
              <Label>Disposition</Label>
              <Select value={disposition || undefined} onValueChange={setDisposition}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="transferred">Transferred</SelectItem>
                  <SelectItem value="referred">Referred</SelectItem>
                  <SelectItem value="deceased">Deceased</SelectItem>
                  <SelectItem value="ama">Left Against Medical Advice</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Procedures Performed</Label>
            <Textarea value={procedures} onChange={(e) => setProcedures(e.target.value)} rows={2} placeholder="Procedures performed during admission (one per line)" />
          </div>
          <div>
            <Label>Medications on Discharge</Label>
            <Textarea value={medications} onChange={(e) => setMedications(e.target.value)} rows={2} placeholder="Discharge medications (one per line)" />
          </div>
          <div>
            <Label>Follow-up Plan</Label>
            <Textarea value={followUpPlan} onChange={(e) => setFollowUpPlan(e.target.value)} rows={2} placeholder="Follow-up instructions, appointment date, etc." />
          </div>

          {/* Discharge Diagnoses — Centralized Diagnosis Engine */}
          {admission.patientId && admission.encounterId && (
            <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50/30 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                <Stethoscope className="w-3.5 h-3.5" /> Discharge Diagnoses (Structured)
              </p>
              <p className="text-[10px] text-slate-500">
                Record structured discharge diagnoses (principal, final, secondary) from the centralized catalog. These appear in the patient's diagnosis history.
              </p>
              <DiagnosisPicker
                patientId={admission.patientId}
                encounterId={admission.encounterId}
                canManage={true}
              />
            </div>
          )}
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-rose-600 hover:bg-rose-700">
            {saving ? "Discharging..." : <><XCircle className="w-4 h-4" /> Confirm Discharge</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Diagnosis Dialog — view/manage diagnoses for an admission's encounter
// ============================================================
function DiagnosisDialog({ admission, canManage, onClose }: { admission: any; canManage: boolean; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Stethoscope className="w-5 h-5" />
            Diagnoses — {admission.patient?.firstName} {admission.patient?.lastName}
          </DialogTitle>
          <DialogDescription className="text-white/80">
            Admission {admission.admissionNumber} • {admission.encounter?.encounterNumber || "Encounter linked"}
            {admission.admissionDiagnosis && ` • Admission Dx: ${admission.admissionDiagnosis}`}
          </DialogDescription>
        </DialogHeader>
        <div className="p-6 space-y-3">
          {admission.patientId && admission.encounterId ? (
            <DiagnosisPicker
              patientId={admission.patientId}
              encounterId={admission.encounterId}
              canManage={canManage}
            />
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">
              This admission has no linked encounter. Diagnoses require an encounter to attach to.
            </p>
          )}
        </div>
        <DialogFooter className="p-6 pt-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

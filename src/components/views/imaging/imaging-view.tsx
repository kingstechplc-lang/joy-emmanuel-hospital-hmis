"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, ScanLine, Search, CalendarClock, Stethoscope, FileText, CheckCircle2, Send, X } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, safeJson, PageHeader} from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "ordered", label: "Ordered" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "verified", label: "Verified" },
  { value: "released", label: "Released" },
  { value: "cancelled", label: "Cancelled" },
];

const PROCEDURE_TYPES = [
  { value: "X-Ray", label: "X-Ray" },
  { value: "Ultrasound", label: "Ultrasound (US)" },
  { value: "CT Scan", label: "CT Scan" },
  { value: "MRI", label: "MRI" },
  { value: "Other", label: "Other" },
];

export function ImagingView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [actionOrder, setActionOrder] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["imaging", activeFacilityId, statusFilter],
    queryFn: () => fetchJson(`/api/imaging${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["imaging"] });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Radiology & Imaging"
        description="Manage imaging requests, reports, and verification"
        icon={ScanLine}
        gradient="from-blue-500 to-indigo-600"
        actions={
          <Button onClick={() => setShowNew(true)} disabled={!can("imaging.order")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Imaging Order
        </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view imaging orders.</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-2">
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load imaging orders" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No imaging orders"
              description="Create a new imaging order to begin the radiology workflow."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("imaging.order")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Imaging Order</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Procedure</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Priority</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Ordered</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Scheduled</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((o: any) => (
                    <tr key={o.id} className="border-b hover:bg-emerald-50/40">
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{o.patient?.firstName} {o.patient?.lastName}</div>
                        <div className="text-xs text-slate-500">{o.patient?.patientNumber}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{o.procedureName}</div>
                        {o.procedureCode && <div className="text-xs text-slate-500 font-mono">{o.procedureCode}</div>}
                      </td>
                      <td className="p-3">
                        {o.priority === "stat" ? (
                          <Badge variant="destructive" className="text-[10px]">STAT</Badge>
                        ) : o.priority === "urgent" ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">URGENT</Badge>
                        ) : (
                          <span className="text-xs text-slate-500 capitalize">{o.priority}</span>
                        )}
                      </td>
                      <td className="p-3"><StatusBadge status={o.status} /></td>
                      <td className="p-3 text-xs text-slate-600">{formatDate(o.orderedAt, true)}</td>
                      <td className="p-3 text-xs text-slate-600">{formatDate(o.scheduledAt, true)}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {o.status === "ordered" && can("imaging.perform") && (
                            <Button size="sm" variant="outline" onClick={() => setActionOrder(o)} className="gap-1 h-7 text-xs">
                              <CalendarClock className="w-3 h-3" /> Schedule
                            </Button>
                          )}
                          {o.status === "scheduled" && can("imaging.perform") && (
                            <Button size="sm" onClick={() => setActionOrder(o)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <Stethoscope className="w-3 h-3" /> Perform
                            </Button>
                          )}
                          {o.status === "in_progress" && can("imaging.report") && (
                            <Button size="sm" onClick={() => setActionOrder(o)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <FileText className="w-3 h-3" /> Enter Report
                            </Button>
                          )}
                          {o.status === "completed" && can("imaging.verify") && (
                            <Button size="sm" onClick={() => setActionOrder(o)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <CheckCircle2 className="w-3 h-3" /> Verify
                            </Button>
                          )}
                          {o.status === "verified" && can("imaging.verify") && (
                            <Button size="sm" onClick={() => doAction(o.id, "release", "Report released", invalidate)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <Send className="w-3 h-3" /> Release
                            </Button>
                          )}
                          {(o.status === "ordered" || o.status === "scheduled") && can("imaging.order") && (
                            <Button size="sm" variant="ghost" onClick={() => doAction(o.id, "cancel", "Order cancelled", invalidate)} className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700">
                              <X className="w-3 h-3" />
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

      <NewImagingOrderDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); invalidate(); }}
        defaultFacilityId={activeFacilityId}
      />

      {actionOrder && (
        <ActionDialog
          order={actionOrder}
          onClose={() => setActionOrder(null)}
          onChanged={() => { setActionOrder(null); invalidate(); }}
        />
      )}
    </div>
  );
}

async function doAction(id: string, action: string, successMsg: string, onDone: () => void) {
  try {
    const res = await fetch(`/api/imaging/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err.error || "Failed");
    }
    toast.success(successMsg);
    onDone();
  } catch (e: any) {
    toast.error(e.message);
  }
}

function NewImagingOrderDialog({ open, onClose, onCreated, defaultFacilityId }: { open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [procedureType, setProcedureType] = useState("X-Ray");
  const [procedureName, setProcedureName] = useState("");
  const [procedureCode, setProcedureCode] = useState("");
  const [priority, setPriority] = useState("routine");
  const [indication, setIndication] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });
  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters", patientId, defaultFacilityId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}&facilityId=${defaultFacilityId || ""}`),
    enabled: !!patientId,
  });

  const submit = async () => {
    if (!patientId) { toast.error("Please select a patient"); return; }
    const name = procedureName || procedureType;
    if (!name) { toast.error("Procedure name required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/imaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId, encounterId: encounterId || undefined, facilityId: defaultFacilityId,
          procedureName: name, procedureCode, priority, indication,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Imaging order created");
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setProcedureType("X-Ray"); setProcedureName(""); setProcedureCode("");
      setPriority("routine"); setIndication("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="w-5 h-5 text-emerald-600" /> New Imaging Order</DialogTitle>
          <DialogDescription>Schedule a radiology study for a patient.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search patient..." value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} className="pl-9" />
            </div>
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => { setPatientId(p.id); setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); }} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {patientId && (
            <div>
              <Label>Encounter</Label>
              <Select value={encounterId || undefined} onValueChange={setEncounterId}>
                <SelectTrigger><SelectValue placeholder="Auto-create an imaging encounter" /></SelectTrigger>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Procedure Type</Label>
              <Select value={procedureType || undefined} onValueChange={(v) => { setProcedureType(v); if (!procedureName) setProcedureName(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROCEDURE_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Procedure Code</Label>
              <Input value={procedureCode} onChange={(e) => setProcedureCode(e.target.value)} placeholder="e.g. XR-CHST-001" />
            </div>
          </div>
          <div>
            <Label>Procedure Name</Label>
            <Input value={procedureName} onChange={(e) => setProcedureName(e.target.value)} placeholder="e.g. Chest X-Ray PA view" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority || undefined} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="stat">STAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Indication</Label>
            <Textarea value={indication} onChange={(e) => setIndication(e.target.value)} rows={2} placeholder="Clinical reason for the study" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Creating..." : "Create Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  if (order.status === "ordered") return <ScheduleDialog order={order} onClose={onClose} onChanged={onChanged} />;
  if (order.status === "scheduled") return <PerformDialog order={order} onClose={onClose} onChanged={onChanged} />;
  if (order.status === "in_progress") return <ReportDialog order={order} onClose={onClose} onChanged={onChanged} />;
  if (order.status === "completed") return <VerifyDialog order={order} onClose={onClose} onChanged={onChanged} />;
  return null;
}

function ScheduleDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const defaultSchedule = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
  const [scheduledAt, setScheduledAt] = useState(defaultSchedule);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/imaging/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule", scheduledAt }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Imaging scheduled");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5 text-emerald-600" /> Schedule Imaging</DialogTitle>
          <DialogDescription>{order.procedureName} • {order.patient?.firstName} {order.patient?.lastName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Scheduled At</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Scheduling..." : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PerformDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/imaging/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "perform" }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Imaging in progress");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Stethoscope className="w-5 h-5 text-emerald-600" /> Perform Imaging</DialogTitle>
          <DialogDescription>Confirm the imaging procedure has begun. {order.procedureName}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Starting..." : "Mark In Progress"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const initialFindings = (order.report?.findings || "").replace(/^Indication:[^\n]*\n?/i, "").trim();
  const [findings, setFindings] = useState(initialFindings);
  const [impression, setImpression] = useState(order.report?.impression || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/imaging/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "report", findings, impression }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Report entered");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-600" /> Imaging Report</DialogTitle>
          <DialogDescription>{order.procedureName} • {order.patient?.firstName} {order.patient?.lastName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {order.report?.findings?.startsWith("Indication:") && (
            <div className="bg-slate-50 p-3 rounded text-sm">
              <span className="text-slate-500">Indication: </span>
              <span className="font-medium text-slate-900">{order.report.findings.replace(/^Indication:\s*/, "").trim()}</span>
            </div>
          )}
          <div>
            <Label>Findings</Label>
            <Textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={8} placeholder="Describe imaging findings in detail..." />
          </div>
          <div>
            <Label>Impression</Label>
            <Textarea value={impression} onChange={(e) => setImpression(e.target.value)} rows={4} placeholder="Radiologist's impression / conclusion..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving..." : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerifyDialog({ order, onClose, onChanged }: { order: any; onClose: () => void; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/imaging/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Report verified");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Verify Report</DialogTitle>
          <DialogDescription>Confirm the imaging report is verified. {order.procedureName}</DialogDescription>
        </DialogHeader>
        {order.report && (
          <div className="bg-slate-50 p-3 rounded text-sm space-y-1">
            <div className="font-medium text-slate-900">Findings:</div>
            <div className="text-xs text-slate-700 whitespace-pre-wrap">{order.report.findings || "—"}</div>
            {order.report.impression && (
              <>
                <div className="font-medium text-slate-900 mt-2">Impression:</div>
                <div className="text-xs text-slate-700 whitespace-pre-wrap">{order.report.impression}</div>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Verifying..." : "Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

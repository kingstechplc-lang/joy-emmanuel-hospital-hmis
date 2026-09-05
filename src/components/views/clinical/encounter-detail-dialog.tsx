"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Stethoscope, FileText, Pill, Receipt, FlaskConical, Activity, ShieldCheck,
  CheckCircle2, XCircle, Clock, User, Building2, Calendar, ArrowRight,
  ClipboardList, ScanLine, Scissors, FileCode2, AlertTriangle, Loader2,
} from "lucide-react";
import { StatusBadge, formatDate, formatRelative, formatCurrency, safeJson } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const TERMINAL_STATUSES = ["completed", "cancelled", "discharged"];

export function EncounterDetailDialog({
  encounter: initialEncounter,
  canClose,
  canEdit,
  onClose,
  onNavigate,
  onClosed,
  onCancelled,
}: {
  encounter: any;
  canClose: boolean;
  canEdit: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onClosed: (id: string) => void;
  onCancelled: (encounter: any) => void;
}) {
  // Fetch full encounter details
  const { data, isLoading } = useQuery({
    queryKey: ["encounter-detail", initialEncounter.id],
    queryFn: () => fetchJson(`/api/encounters/${initialEncounter.id}`),
    enabled: !!initialEncounter.id,
  });

  const enc = data?.item || initialEncounter;
  const isTerminal = TERMINAL_STATUSES.includes(enc.status);
  const duration = enc.startAt ? formatDuration(enc.startAt, enc.endAt) : "—";

  // Build timeline from actual DB records
  const timeline = buildTimeline(enc);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Activity className="w-5 h-5" />
            Encounter {enc.encounterNumber}
            <StatusBadge status={enc.status} />
          </DialogTitle>
          <DialogDescription className="text-white/80">
            {enc.patient ? `${enc.patient.firstName} ${enc.patient.lastName} (${enc.patient.patientNumber})` : "—"}
            {" • "}
            {enc.facility?.name || "—"}
            {" • "}
            {formatDate(enc.startAt, true)}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              </div>
            ) : (
              <>
                {/* Encounter Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SummaryCard label="Type" value={enc.encounterType} icon={ClipboardList} />
                  <SummaryCard label="Source" value={enc.source || "walkin"} icon={User} />
                  <SummaryCard label="Priority" value={<StatusBadge status={enc.priority} />} icon={AlertTriangle} />
                  <SummaryCard label="Duration" value={duration} icon={Clock} />
                  <SummaryCard label="Facility" value={enc.facility?.name} icon={Building2} />
                  <SummaryCard label="Department" value={enc.department?.name || "—"} icon={Building2} />
                  <SummaryCard label="Check In" value={enc.checkInAt ? formatDate(enc.checkInAt, true) : formatDate(enc.startAt, true)} icon={Calendar} />
                  <SummaryCard label="Check Out" value={enc.checkOutAt || enc.endAt ? formatDate(enc.checkOutAt || enc.endAt, true) : "—"} icon={Calendar} />
                </div>

                {/* Patient Allergies (safety-critical) */}
                {enc.patient?.allergies?.length > 0 && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                    <p className="text-xs font-bold text-rose-700 mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Allergies
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {enc.patient.allergies.map((a: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px] bg-white border-rose-300 text-rose-700">
                          {a.allergen} ({a.severity})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2">
                  <QuickAction label="Triage" icon={Stethoscope} color="amber" onClick={() => onNavigate("triage")} />
                  <QuickAction label="Consultation" icon={FileText} color="blue" onClick={() => onNavigate("consultations")} />
                  <QuickAction label="Prescribe" icon={Pill} color="teal" onClick={() => onNavigate("prescriptions")} />
                  <QuickAction label="Lab" icon={FlaskConical} color="indigo" onClick={() => onNavigate("lab_orders")} />
                  <QuickAction label="Imaging" icon={ScanLine} color="cyan" onClick={() => onNavigate("imaging")} />
                  <QuickAction label="Procedures" icon={Scissors} color="violet" onClick={() => onNavigate("procedures")} />
                  <QuickAction label="Billing" icon={Receipt} color="emerald" onClick={() => onNavigate("billing_invoices")} />
                  <QuickAction label="NHIS Workflow" icon={ShieldCheck} color="violet" onClick={() => onNavigate("nhis_workflow")} />
                  <QuickAction label="Insurance Claims" icon={FileText} color="emerald" onClick={() => onNavigate("insurance_claims")} />
                  <QuickAction label="NHIA CLAIM-it" icon={FileCode2} color="indigo" onClick={() => onNavigate("nhia_claims")} />
                  <QuickAction label="Patient 360" icon={User} color="slate" onClick={() => onNavigate("patient_360")} />
                  {canClose && !isTerminal && (
                    <QuickAction label="Close" icon={CheckCircle2} color="slate" onClick={() => onClosed(enc.id)} />
                  )}
                  {canClose && !isTerminal && (
                    <QuickAction label="Cancel" icon={XCircle} color="rose" onClick={() => onCancelled(enc)} />
                  )}
                </div>

                {/* Clinical Summary */}
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <ClinicalCard title="Diagnoses" count={enc.diagnoses?.length} items={enc.diagnoses?.map((d: any) => ({
                      label: `${d.diagnosisCode || "—"} — ${d.diagnosisName}`,
                      sub: d.isPrimary ? "Primary" : "Secondary",
                    }))} />
                    <ClinicalCard title="Consultations" count={enc.consultations?.length} items={enc.consultations?.map((c: any) => ({
                      label: c.chiefComplaint || "No chief complaint",
                      sub: c.clinician ? `Dr. ${c.clinician.firstName} ${c.clinician.lastName}` : "—",
                    }))} />
                    <ClinicalCard title="Triage Records" count={enc.triageRecords?.length} items={enc.triageRecords?.map((t: any) => ({
                      label: `Category: ${t.triageCategory}`,
                      sub: formatDate(t.recordedAt, true),
                    }))} />
                  </div>
                  <div className="space-y-2">
                    <ClinicalCard title="Prescriptions" count={enc.prescriptions?.length} items={enc.prescriptions?.map((p: any) => ({
                      label: p.prescriptionNumber,
                      sub: `${p.items?.length || 0} item(s) — ${p.status}`,
                    }))} />
                    <ClinicalCard title="Lab Orders" count={enc.labOrders?.length} items={enc.labOrders?.map((l: any) => ({
                      label: l.orderNumber,
                      sub: `${l.items?.length || 0} test(s) — ${l.status}`,
                    }))} />
                    <ClinicalCard title="Invoices" count={enc.invoices?.length} items={enc.invoices?.map((i: any) => ({
                      label: i.invoiceNumber,
                      sub: `${formatCurrency(i.total)} — ${i.status}`,
                    }))} />
                  </div>
                </div>

                {/* Insurance/Coverage */}
                {enc.encounterCoverage && (
                  <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg">
                    <p className="text-xs font-bold text-violet-700 mb-1 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Coverage
                    </p>
                    <div className="text-xs text-slate-700">
                      Payer: <b className="uppercase">{enc.encounterCoverage.payerType}</b>
                      {" • "}Status: <StatusBadge status={enc.encounterCoverage.status} />
                    </div>
                  </div>
                )}

                {/* Timeline */}
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Clock className="w-4 h-4" /> Timeline ({timeline.length} events)
                  </h4>
                  {timeline.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No timeline events recorded.</p>
                  ) : (
                    <div className="space-y-1.5 border-l-2 border-slate-200 pl-3">
                      {timeline.map((event, i) => (
                        <div key={i} className="text-xs flex items-start gap-2">
                          <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${event.color}`} />
                          <div className="flex-1">
                            <span className="font-semibold text-slate-700">{event.label}</span>
                            <span className="text-slate-400 ml-1">{formatRelative(event.timestamp)}</span>
                            {event.actor && <span className="text-slate-400"> • {event.actor}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cancellation info */}
                {enc.cancelledAt && (
                  <div className="p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700">
                    Cancelled on {formatDate(enc.cancelledAt, true)} — Reason: {enc.cancelReason || "Not specified"}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// --- Helper Components ---

function SummaryCard({ label, value, icon: Icon }: { label: string; value: any; icon: any }) {
  return (
    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
      <div className="flex items-center gap-1 mb-1">
        <Icon className="w-3 h-3 text-slate-400" />
        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
      </div>
      <p className="text-sm font-semibold text-slate-800 capitalize">{value || "—"}</p>
    </div>
  );
}

function QuickAction({ label, icon: Icon, color, onClick }: { label: string; icon: any; color: string; onClick: () => void }) {
  const colorMap: Record<string, string> = {
    amber: "text-amber-600 hover:bg-amber-50 border-amber-200",
    blue: "text-blue-600 hover:bg-blue-50 border-blue-200",
    teal: "text-teal-600 hover:bg-teal-50 border-teal-200",
    indigo: "text-indigo-600 hover:bg-indigo-50 border-indigo-200",
    cyan: "text-cyan-600 hover:bg-cyan-50 border-cyan-200",
    violet: "text-violet-600 hover:bg-violet-50 border-violet-200",
    emerald: "text-emerald-600 hover:bg-emerald-50 border-emerald-200",
    rose: "text-rose-600 hover:bg-rose-50 border-rose-200",
    slate: "text-slate-600 hover:bg-slate-100 border-slate-200",
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${colorMap[color] || colorMap.slate}`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function ClinicalCard({ title, count, items }: { title: string; count?: number; items?: any[] }) {
  return (
    <div className="p-3 border border-slate-200 rounded-lg">
      <p className="text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
        {title}
        {count !== undefined && count > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1">{count}</Badge>}
      </p>
      {!items || items.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No records</p>
      ) : (
        <div className="space-y-1">
          {items.slice(0, 5).map((item, i) => (
            <div key={i} className="text-xs">
              <span className="text-slate-700 font-medium">{item.label}</span>
              {item.sub && <span className="text-slate-400 ml-1">— {item.sub}</span>}
            </div>
          ))}
          {items.length > 5 && <p className="text-[10px] text-slate-400">+ {items.length - 5} more...</p>}
        </div>
      )}
    </div>
  );
}

// --- Timeline Builder ---
function buildTimeline(enc: any): Array<{ label: string; timestamp: Date; actor?: string; color: string }> {
  const events: Array<{ label: string; timestamp: Date; actor?: string; color: string }> = [];
  const bgBlue = "bg-blue-500";
  const bgGreen = "bg-emerald-500";
  const bgAmber = "bg-amber-500";
  const bgRose = "bg-rose-500";
  const bgViolet = "bg-violet-500";
  const bgSlate = "bg-slate-400";

  if (enc.startAt) events.push({ label: "Encounter created", timestamp: new Date(enc.startAt), color: bgBlue });
  if (enc.checkInAt) events.push({ label: "Patient checked in", timestamp: new Date(enc.checkInAt), color: bgGreen });

  (enc.triageRecords || []).forEach((t: any) => {
    events.push({ label: `Triage completed (Category ${t.triageCategory})`, timestamp: new Date(t.recordedAt), actor: t.recordedByName, color: bgAmber });
  });
  (enc.consultations || []).forEach((c: any) => {
    events.push({ label: `Consultation: ${c.chiefComplaint || "—"}`, timestamp: new Date(c.createdAt), actor: c.clinician?.firstName, color: bgBlue });
  });
  (enc.diagnoses || []).forEach((d: any) => {
    events.push({ label: `Diagnosis recorded: ${d.diagnosisCode || d.diagnosisName}`, timestamp: new Date(d.diagnosedAt), color: bgViolet });
  });
  (enc.prescriptions || []).forEach((p: any) => {
    events.push({ label: `Prescription: ${p.prescriptionNumber}`, timestamp: new Date(p.prescribedAt), color: bgAmber });
  });
  (enc.labOrders || []).forEach((l: any) => {
    events.push({ label: `Lab order: ${l.orderNumber}`, timestamp: new Date(l.orderedAt), color: bgSlate });
  });
  (enc.procedures || []).forEach((p: any) => {
    if (p.performedAt) events.push({ label: `Procedure: ${p.procedureName}`, timestamp: new Date(p.performedAt), color: bgViolet });
  });
  (enc.invoices || []).forEach((i: any) => {
    events.push({ label: `Invoice: ${i.invoiceNumber} (${i.total.toFixed(2)})`, timestamp: new Date(i.createdAt), color: bgGreen });
  });
  if (enc.endAt) events.push({ label: `Encounter ${enc.status}`, timestamp: new Date(enc.endAt), color: enc.status === "cancelled" ? bgRose : bgSlate });
  if (enc.cancelledAt) events.push({ label: `Cancelled: ${enc.cancelReason || "—"}`, timestamp: new Date(enc.cancelledAt), color: bgRose });

  // Sort newest first
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events;
}

function formatDuration(start: string | Date, end: string | Date | null): string {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const diffMs = endMs - startMs;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

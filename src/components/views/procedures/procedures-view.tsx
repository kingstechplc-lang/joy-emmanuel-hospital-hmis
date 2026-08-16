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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Scissors, Search, Save, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate } from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export function ProceduresView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [viewProc, setViewProc] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["procedures", activeFacilityId],
    queryFn: () => fetchJson(`/api/procedures${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["procedures"] });

  const extractConsent = (notes?: string | null) => {
    if (!notes) return null;
    const m = notes.match(/^CONSENT: (taken|not_taken)/i);
    return m ? m[1].toLowerCase() : null;
  };
  const stripConsent = (notes?: string | null) => (notes || "").replace(/^CONSENT: (taken|not_taken)\n?/i, "").trim();

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Procedures</h2>
          <p className="text-sm text-slate-500">Procedures performed on patients during encounters.</p>
        </div>
        <Button onClick={() => setShowNew(true)} disabled={!can("procedure.perform")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Procedure
        </Button>
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view procedures.</CardContent></Card>
      )}

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load procedures" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No procedures recorded"
              description="Record a procedure performed on a patient."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("procedure.perform")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Procedure</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Performer</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Performed At</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Consent</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p: any) => {
                    const consent = extractConsent(p.notes);
                    return (
                      <tr key={p.id} className="border-b hover:bg-emerald-50/40 cursor-pointer" onClick={() => setViewProc(p)}>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{p.patient?.firstName} {p.patient?.lastName}</div>
                          <div className="text-xs text-slate-500">{p.patient?.patientNumber}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{p.procedureName}</div>
                          {p.procedureCode && <div className="text-xs text-slate-500 font-mono">{p.procedureCode}</div>}
                        </td>
                        <td className="p-3 text-slate-700">
                          {p.performedBy ? `Dr. ${p.performedBy.firstName} ${p.performedBy.lastName}` : "—"}
                        </td>
                        <td className="p-3 text-xs text-slate-600">{formatDate(p.performedAt, true)}</td>
                        <td className="p-3">
                          {consent === "taken" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">Taken</span>
                          ) : consent === "not_taken" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-rose-100 text-rose-700 border-rose-200">Not Taken</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3"><StatusBadge status={p.status} /></td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setViewProc(p); }} className="gap-1 h-7 text-xs">
                            View
                          </Button>
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

      <NewProcedureDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); invalidate(); }}
        defaultFacilityId={activeFacilityId}
      />

      {viewProc && (
        <ViewProcedureDialog
          procedure={viewProc}
          extractConsent={extractConsent}
          stripConsent={stripConsent}
          onClose={() => setViewProc(null)}
          onChanged={() => { setViewProc(null); invalidate(); }}
        />
      )}
    </div>
  );
}

function NewProcedureDialog({ open, onClose, onCreated, defaultFacilityId }: { open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [procedureCode, setProcedureCode] = useState("");
  const [performedById, setPerformedById] = useState("");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().slice(0, 16));
  const [indication, setIndication] = useState("");
  const [findings, setFindings] = useState("");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [consentStatus, setConsentStatus] = useState("taken");
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
    if (!procedureName) { toast.error("Procedure name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/procedures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId, encounterId: encounterId || undefined, facilityId: defaultFacilityId,
          procedureName, procedureCode,
          performedById: performedById || undefined, performedAt,
          indication, findings, outcome, notes,
          consentStatus,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Procedure recorded");
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setProcedureName(""); setProcedureCode(""); setPerformedById("");
      setIndication(""); setFindings(""); setOutcome(""); setNotes("");
      setConsentStatus("taken");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Scissors className="w-5 h-5 text-emerald-600" /> New Procedure Record</DialogTitle>
          <DialogDescription>Record a procedure performed on a patient.</DialogDescription>
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
              <Select value={encounterId} onValueChange={setEncounterId}>
                <SelectTrigger><SelectValue placeholder="Auto-create a procedure encounter" /></SelectTrigger>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Procedure Name</FieldLabel>
              <Input value={procedureName} onChange={(e) => setProcedureName(e.target.value)} placeholder="e.g. Appendectomy" />
            </div>
            <div>
              <Label>Procedure Code</Label>
              <Input value={procedureCode} onChange={(e) => setProcedureCode(e.target.value)} placeholder="e.g. ICD-9-CM 47.01" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Performer (User ID, optional)</Label>
              <Input value={performedById} onChange={(e) => setPerformedById(e.target.value)} placeholder="Defaults to current user" />
            </div>
            <div>
              <Label>Performed At</Label>
              <Input type="datetime-local" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Indication</Label>
            <Textarea value={indication} onChange={(e) => setIndication(e.target.value)} rows={2} placeholder="Why the procedure was performed" />
          </div>
          <div>
            <Label>Findings</Label>
            <Textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={3} placeholder="Procedure findings" />
          </div>
          <div>
            <Label>Outcome</Label>
            <Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2} placeholder="Result / outcome" />
          </div>

          <div>
            <Label>Consent Status</Label>
            <RadioGroup value={consentStatus} onValueChange={setConsentStatus} className="flex gap-6 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="taken" id="consent-taken" />
                <span className="text-sm">Consent Taken</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="not_taken" id="consent-not" />
                <span className="text-sm">Not Taken</span>
              </label>
            </RadioGroup>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional notes..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving..." : "Save Procedure"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewProcedureDialog({ procedure, extractConsent, stripConsent, onClose, onChanged }: {
  procedure: any;
  extractConsent: (n?: string | null) => string | null;
  stripConsent: (n?: string | null) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editable, setEditable] = useState<any>(procedure);
  const [saving, setSaving] = useState(false);
  const setField = (k: string, v: any) => setEditable((p: any) => ({ ...p, [k]: v }));

  const consent = extractConsent(procedure.notes);
  const [consentStatus, setConsentStatus] = useState(consent || "taken");
  const [notesBody, setNotesBody] = useState(stripConsent(procedure.notes));

  const update = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/procedures/${procedure.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          procedureName: editable.procedureName,
          procedureCode: editable.procedureCode,
          indication: editable.indication,
          findings: editable.findings,
          outcome: editable.outcome,
          notes: notesBody,
          consentStatus,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Procedure updated");
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
          <DialogTitle className="flex items-center gap-2"><Scissors className="w-5 h-5 text-emerald-600" /> Procedure Record <StatusBadge status={editable.status} /></DialogTitle>
          <DialogDescription>
            {procedure.patient?.firstName} {procedure.patient?.lastName} • {procedure.encounter?.encounterNumber || "—"} • Performed {formatDate(procedure.performedAt, true)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Procedure Name</Label>
              <Input value={editable.procedureName || ""} onChange={(e) => setField("procedureName", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Procedure Code</Label>
              <Input value={editable.procedureCode || ""} onChange={(e) => setField("procedureCode", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Indication</Label>
            <Textarea value={editable.indication || ""} onChange={(e) => setField("indication", e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Findings</Label>
            <Textarea value={editable.findings || ""} onChange={(e) => setField("findings", e.target.value)} rows={4} />
          </div>
          <div>
            <Label className="text-xs">Outcome</Label>
            <Textarea value={editable.outcome || ""} onChange={(e) => setField("outcome", e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Consent Status</Label>
            <RadioGroup value={consentStatus} onValueChange={setConsentStatus} className="flex gap-6 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="taken" id="edit-consent-taken" />
                <span className="text-sm">Taken</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="not_taken" id="edit-consent-not" />
                <span className="text-sm">Not Taken</span>
              </label>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notesBody} onChange={(e) => setNotesBody(e.target.value)} rows={2} />
          </div>
          <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded">
            Performed by: {procedure.performedBy ? `Dr. ${procedure.performedBy.firstName} ${procedure.performedBy.lastName}` : "—"} • Facility: {procedure.facility?.name || "—"}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="gap-1"><X className="w-4 h-4" /> Close</Button>
          <Button onClick={update} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Save className="w-4 h-4 animate-pulse" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

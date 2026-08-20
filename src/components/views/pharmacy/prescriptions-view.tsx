"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, CheckCircle2, X, Pill, Search, Eye, Activity, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, calculateAge, safeJson} from "@/components/ui-helpers";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "partially_dispensed", label: "Partially Dispensed" },
  { value: "dispensed", label: "Dispensed" },
  { value: "cancelled", label: "Cancelled" },
];

const FREQUENCIES = ["OD", "BD", "TDS", "QDS", "Q4H", "Q6H", "Q8H", "PRN", "STAT", "Once weekly"];
const ROUTES = ["oral", "iv", "im", "topical", "sublingual", "inhaled", "rectal", "ophthalmic", "otic"];

export function PrescriptionsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();
  const [statusFilter, setStatusFilter] = useState("all");
  const [patientSearch, setPatientSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [viewRx, setViewRx] = useState<any | null>(null);
  const [dispenseItem, setDispenseItem] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (patientSearch) params.set("patientSearch", patientSearch);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["prescriptions", activeFacilityId, statusFilter],
    queryFn: () => fetchJson(`/api/prescriptions${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["prescriptions"] });
    qc.invalidateQueries({ queryKey: ["dispense-queue"] });
  };

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Prescriptions</h2>
          <p className="text-sm text-slate-500">Manage patient prescriptions and pharmacy approval workflow</p>
        </div>
        <Button onClick={() => setShowNew(true)} disabled={!can("pharmacy.prescribe")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Prescription
        </Button>
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view prescriptions.</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-2">
          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load prescriptions" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No prescriptions"
              description="Create a new prescription to begin."
              action={<Button onClick={() => setShowNew(true)} disabled={!can("pharmacy.prescribe")} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Prescription</Button>}
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
                    <th className="text-left p-3 font-semibold text-slate-700">Rx #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Prescriber</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Items</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Prescribed</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((o: any) => (
                    <tr key={o.id} className="border-b hover:bg-emerald-50/40">
                      <td className="p-3 font-mono text-xs text-slate-700">{o.prescriptionNumber}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{o.patient?.firstName} {o.patient?.lastName}</div>
                        <div className="text-xs text-slate-500">{o.patient?.patientNumber} · {calculateAge(o.patient?.dateOfBirth)}y</div>
                      </td>
                      <td className="p-3 text-xs text-slate-600">{o.prescriber ? `${o.prescriber.firstName} ${o.prescriber.lastName}` : "—"}</td>
                      <td className="p-3 text-xs text-slate-600">{o._count?.items ?? (o.items?.length || 0)}</td>
                      <td className="p-3"><StatusBadge status={o.status} /></td>
                      <td className="p-3 text-xs text-slate-600">{formatDate(o.prescribedAt, true)}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setViewRx(o)} className="gap-1 h-7 text-xs">
                            <Eye className="w-3 h-3" /> View
                          </Button>
                          {o.status === "pending" && can("pharmacy.dispense") && (
                            <Button size="sm" onClick={async () => {
                              const res = await fetch(`/api/prescriptions/${o.id}`, {
                                method: "PATCH", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "approve" }),
                              });
                              if (res.ok) { toast.success("Prescription approved"); invalidate(); }
                              else { const e = await safeJson(res).catch(() => ({})); toast.error(e.error || "Failed"); }
                            }} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </Button>
                          )}
                          {["approved", "partially_dispensed"].includes(o.status) && can("pharmacy.dispense") && (
                            <Button size="sm" onClick={() => setDispenseItem(o)} className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
                              <Pill className="w-3 h-3" /> Dispense
                            </Button>
                          )}
                          {["pending", "approved", "partially_dispensed"].includes(o.status) && can("pharmacy.prescribe") && (
                            <Button size="sm" variant="ghost" onClick={() => {
                              confirmAction({
                                title: "Cancel this prescription?",
                                description: "Cancelling will mark the prescription as cancelled. Already-dispensed items will remain dispensed.",
                                confirmText: "Yes, cancel",
                                variant: "warning",
                                onConfirm: async () => {
                                  const res = await fetch(`/api/prescriptions/${o.id}`, {
                                    method: "PATCH", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "cancel" }),
                                  });
                                  if (res.ok) { toast.success("Prescription cancelled"); invalidate(); }
                                  else { const e = await safeJson(res).catch(() => ({})); toast.error(e.error || "Failed"); }
                                },
                              });
                            }} className="gap-1 h-7 text-xs text-rose-600 hover:text-rose-700">
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

      <NewPrescriptionDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); invalidate(); }}
        defaultFacilityId={activeFacilityId || undefined}
        defaultPrescriberId={user?.id}
      />

      {viewRx && (
        <ViewPrescriptionDialog
          prescription={viewRx}
          onClose={() => setViewRx(null)}
        />
      )}

      {dispenseItem && (
        <DispenseDialog
          prescription={dispenseItem}
          onClose={() => setDispenseItem(null)}
          onDone={() => { setDispenseItem(null); invalidate(); }}
        />
      )}
      {confirmDialogEl}
    </div>
  );
}

// =====================================================================
// New Prescription Dialog
// =====================================================================
function NewPrescriptionDialog({ open, onClose, onCreated, defaultFacilityId, defaultPrescriberId }: {
  open: boolean; onClose: () => void; onCreated: () => void;
  defaultFacilityId?: string; defaultPrescriberId?: string;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patients, setPatients] = useState<any[]>([]);
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [encounters, setEncounters] = useState<any[]>([]);
  const [facilityId, setFacilityId] = useState(defaultFacilityId || "");
  const [facilities, setFacilities] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [meds, setMeds] = useState<any[]>([]);
  const [medQuery, setMedQuery] = useState("");
  const [medDropdown, setMedDropdown] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Load facilities
  useEffect(() => {
    fetchJson("/api/facilities").then((d) => setFacilities(d.facilities || [])).catch(() => {});
  }, []);

  // Patient search (debounced)
  useEffect(() => {
    if (!patientQuery || patientId) return;
    const t = setTimeout(() => {
      fetch(`/api/patients?q=${encodeURIComponent(patientQuery)}&limit=10`)
        .then((r) => r.json())
        .then((d) => setPatients(d.patients || []))
        .catch(() => setPatients([]));
    }, 350);
    return () => clearTimeout(t);
  }, [patientQuery, patientId]);

  // Load encounters for the selected patient
  useEffect(() => {
    if (!patientId) { setEncounters([]); return; }
    fetchJson(`/api/encounters?patientId=${patientId}&limit=20`)
      .then((d) => setEncounters(d.items || []))
      .catch(() => setEncounters([]));
  }, [patientId]);

  // Medication search
  useEffect(() => {
    if (!medQuery) { setMeds([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/medications?q=${encodeURIComponent(medQuery)}&limit=20`)
        .then((r) => r.json())
        .then((d) => setMeds(d.items || []))
        .catch(() => setMeds([]));
    }, 250);
    return () => clearTimeout(t);
  }, [medQuery]);

  const addItem = (med: any) => {
    setItems((prev) => [
      ...prev,
      {
        medicationId: med.id,
        medicationName: `${med.genericName}${med.brandName ? ` (${med.brandName})` : ""}`,
        strength: med.strength || "",
        dosageForm: med.dosageForm || "",
        route: med.route || "oral",
        dose: "",
        frequency: "BD",
        duration: "5 days",
        quantity: 0,
        instructions: "",
      },
    ]);
    setMedQuery("");
    setMeds([]);
    setMedDropdown(false);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setPatientQuery(""); setPatients([]); setPatientId("");
    setEncounterId(""); setEncounters([]);
    setNotes(""); setItems([]); setMedQuery(""); setMeds([]);
  };

  const handleSubmit = async () => {
    if (!patientId) return toast.error("Select a patient");
    if (!encounterId) return toast.error("Select an encounter (or create one first)");
    if (!facilityId) return toast.error("Select a facility");
    if (items.length === 0) return toast.error("Add at least one medication");

    setSubmitting(true);
    try {
      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId, encounterId, facilityId,
          prescriberId: defaultPrescriberId,
          notes,
          items: items.map((it) => ({
            medicationId: it.medicationId,
            dose: it.dose, frequency: it.frequency, route: it.route,
            duration: it.duration, quantity: Number(it.quantity), instructions: it.instructions,
          })),
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Prescription created");
      reset();
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Prescription</DialogTitle>
          <DialogDescription>Create a new prescription for a patient. Status will be set to pending for pharmacist review.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Patient + Encounter + Facility */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Patient</Label>
              {!patientId ? (
                <div className="relative">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
                    <Input
                      className="pl-8"
                      placeholder="Search patient name / number / phone"
                      value={patientQuery}
                      onChange={(e) => setPatientQuery(e.target.value)}
                    />
                  </div>
                  {patients.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full bg-white border rounded shadow max-h-60 overflow-y-auto">
                      {patients.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setPatientId(p.id); setPatients([]); setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); }}
                          className="w-full text-left p-2 hover:bg-emerald-50 border-b last:border-b-0"
                        >
                          <div className="text-sm font-medium">{p.firstName} {p.lastName}</div>
                          <div className="text-xs text-slate-500">{p.patientNumber} · {p.phone || "no phone"}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input value={patientQuery} disabled className="bg-slate-50 text-xs" />
                  <Button size="sm" variant="ghost" onClick={() => { setPatientId(""); setPatientQuery(""); setEncounterId(""); }}>Change</Button>
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Encounter</Label>
              <Select value={encounterId || undefined} onValueChange={setEncounterId} disabled={!patientId || encounters.length === 0}>
                <SelectTrigger><SelectValue placeholder={patientId ? (encounters.length ? "Select encounter" : "No encounters") : "Select patient first"} /></SelectTrigger>
                <SelectContent>
                  {encounters.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.encounterNumber} · {e.encounterType} · {formatDate(e.startAt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Facility</Label>
              <Select value={facilityId || undefined} onValueChange={setFacilityId}>
                <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Add medication item */}
          <div>
            <Label className="text-xs">Add medication</Label>
            <div className="relative">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
                <Input
                  className="pl-8"
                  placeholder="Search medication by generic / brand name"
                  value={medQuery}
                  onChange={(e) => { setMedQuery(e.target.value); setMedDropdown(true); }}
                  onFocus={() => setMedDropdown(true)}
                />
              </div>
              {medDropdown && meds.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border rounded shadow max-h-60 overflow-y-auto">
                  {meds.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => addItem(m)}
                      className="w-full text-left p-2 hover:bg-emerald-50 border-b last:border-b-0"
                    >
                      <div className="text-sm font-medium">{m.genericName} {m.brandName ? `(${m.brandName})` : ""}</div>
                      <div className="text-xs text-slate-500">{m.strength || "—"} · {m.dosageForm || "—"} · {m.route || "—"}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Prescription Items ({items.length})</Label>
              {items.map((it, idx) => (
                <Card key={idx}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm">{it.medicationName}</span>
                        <span className="ml-2 text-xs text-slate-500">{it.strength} · {it.dosageForm}</span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="text-rose-600 h-7">
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                      <div>
                        <Label className="text-[10px]">Dose</Label>
                        <Input value={it.dose} onChange={(e) => updateItem(idx, "dose", e.target.value)} placeholder="e.g. 500mg" className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Frequency</Label>
                        <Select value={it.frequency || undefined} onValueChange={(v) => updateItem(idx, "frequency", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px]">Route</Label>
                        <Select value={it.route || undefined} onValueChange={(v) => updateItem(idx, "route", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROUTES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px]">Duration</Label>
                        <Input value={it.duration} onChange={(e) => updateItem(idx, "duration", e.target.value)} placeholder="5 days" className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Quantity</Label>
                        <Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} placeholder="0" className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Instructions</Label>
                        <Input value={it.instructions} onChange={(e) => updateItem(idx, "instructions", e.target.value)} placeholder="After meals" className="h-8 text-xs" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes for the pharmacist..." className="text-sm" rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? "Creating..." : "Create Prescription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// View Prescription Dialog (with items + dispense history)
// =====================================================================
function ViewPrescriptionDialog({ prescription, onClose }: { prescription: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["prescription", prescription.id],
    queryFn: () => fetchJson(`/api/prescriptions/${prescription.id}`),
  });
  const full = data?.item || prescription;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" /> Prescription {full?.prescriptionNumber}
          </DialogTitle>
          <DialogDescription>
            Prescribed {formatDate(full?.prescribedAt, true)} by {full?.prescriber ? `${full.prescriber.firstName} ${full.prescriber.lastName}` : "—"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState rows={3} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">Patient</div>
                <div className="font-medium">{full?.patient?.firstName} {full?.patient?.lastName}</div>
                <div className="text-xs text-slate-500">{full?.patient?.patientNumber}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Status</div>
                <StatusBadge status={full?.status} />
              </div>
              <div>
                <div className="text-xs text-slate-500">Encounter</div>
                <div className="text-xs">{full?.encounter?.encounterNumber}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Facility</div>
                <div className="text-xs">{full?.facility?.name}</div>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Items</Label>
              <div className="space-y-2 mt-1">
                {(full?.items || []).map((it: any) => (
                  <Card key={it.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{it.medication?.genericName} {it.medication?.brandName ? `(${it.medication.brandName})` : ""}</div>
                          <div className="text-xs text-slate-500">
                            {it.medication?.strength} · {it.medication?.dosageForm}
                          </div>
                        </div>
                        <StatusBadge status={it.status} />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
                        <div><span className="text-slate-500">Dose:</span> {it.dose || "—"}</div>
                        <div><span className="text-slate-500">Frequency:</span> {it.frequency || "—"}</div>
                        <div><span className="text-slate-500">Route:</span> {it.route || "—"}</div>
                        <div><span className="text-slate-500">Duration:</span> {it.duration || "—"}</div>
                        <div><span className="text-slate-500">Quantity:</span> {it.quantity}</div>
                        <div><span className="text-slate-500">Dispensed:</span> {it.dispensedQuantity}/{it.quantity}</div>
                      </div>
                      {it.instructions && (
                        <div className="mt-2 text-xs bg-slate-50 rounded p-2"><span className="text-slate-500">Instructions:</span> {it.instructions}</div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {full?.notes && (
              <div className="text-sm bg-amber-50 border border-amber-200 rounded p-3">
                <div className="text-xs text-amber-700 font-semibold">Notes</div>
                <div className="text-xs text-amber-800 mt-1">{full.notes}</div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Dispense Dialog (per-item batch dispense)
// =====================================================================
function DispenseDialog({ prescription, onClose, onDone }: { prescription: any; onClose: () => void; onDone: () => void }) {
  const [full, setFull] = useState<any>(prescription);
  const [loading, setLoading] = useState(true);
  const [dispensing, setDispensing] = useState(false);
  const [dispenseMap, setDispenseMap] = useState<Record<string, { batchId: string; quantity: number; createInvoice: boolean }>>({});
  const [batchesByItem, setBatchesByItem] = useState<Record<string, any[]>>({});

  useEffect(() => {
    let active = true;
    fetchJson(`/api/prescriptions/${prescription.id}`)
      .then(async (d) => {
        if (!active) return;
        setFull(d.item);
        // For each item, load available batches at the prescription's facility
        const facilityId = d.item?.facilityId;
        if (!facilityId) return;
        const newBatches: Record<string, any[]> = {};
        for (const it of d.item?.items || []) {
          // Look up facility inventory for this medication's inventory item
          const res = await fetch(`/api/inventory?facilityId=${facilityId}&type=medication&q=${encodeURIComponent(it.medication?.genericName || "")}`);
          if (res.ok) {
            const inv = await safeJson(res);
            // Find the matching inventory item (by medication link or name)
            const match = (inv.items || []).find((i: any) => i.medication?.id === it.medicationId || i.name.toLowerCase().includes((it.medication?.genericName || "").toLowerCase()));
            newBatches[it.id] = match?.batches || [];
          }
        }
        if (active) setBatchesByItem(newBatches);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [prescription.id]);

  const setItem = (itemId: string, field: "batchId" | "quantity" | "createInvoice", value: any) => {
    setDispenseMap((prev) => ({
      ...prev,
      [itemId]: { batchId: field === "batchId" ? value : prev[itemId]?.batchId || "", quantity: field === "quantity" ? Number(value) : prev[itemId]?.quantity || 0, createInvoice: field === "createInvoice" ? value : prev[itemId]?.createInvoice ?? true },
    }));
  };

  const handleDispense = async (item: any) => {
    const cfg = dispenseMap[item.id];
    if (!cfg || !cfg.batchId) return toast.error("Select a batch");
    if (!cfg.quantity || cfg.quantity <= 0) return toast.error("Enter a quantity");
    const remaining = item.quantity - item.dispensedQuantity;
    if (cfg.quantity > remaining) return toast.error(`Cannot dispense more than ${remaining} remaining`);

    setDispensing(true);
    try {
      const res = await fetch("/api/dispense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prescriptionItemId: item.id,
          batchId: cfg.batchId,
          quantity: cfg.quantity,
          createInvoice: cfg.createInvoice,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Dispensed ${cfg.quantity} units${data.invoice ? " (invoice updated)" : ""}`);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDispensing(false);
    }
  };

  const allergyBanner = full?.patient && (full.patient as any).allergies?.length > 0;
  // patient on the prescription list item doesn't include allergies; load them.
  useEffect(() => {
    if (!full?.patient?.id) return;
    fetchJson(`/api/patients/${full.patient.id}`)
      .then((d) => {
        const al = d.patient?.allergies || [];
        if (al.length > 0) {
          setFull((prev: any) => ({ ...prev, patient: { ...prev.patient, allergies: al } }));
        }
      })
      .catch(() => {});
  }, [full?.patient?.id]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="w-4 h-4" /> Dispense: {full?.prescriptionNumber}
          </DialogTitle>
          <DialogDescription>
            Patient: {full?.patient?.firstName} {full?.patient?.lastName} ({full?.patient?.patientNumber})
          </DialogDescription>
        </DialogHeader>

        {allergyBanner && (
          <div className="bg-rose-50 border border-rose-300 rounded p-3 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-rose-800">Allergy Warning</div>
              <div className="text-xs text-rose-700 mt-1">
                This patient has {full?.patient?.allergies?.length} active allergen(s):
                {" "}{(full?.patient?.allergies || []).map((a: any) => `${a.allergen}${a.severity ? ` (${a.severity})` : ""}`).join(", ")}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <LoadingState rows={3} />
        ) : (
          <div className="space-y-2">
            {(full?.items || []).filter((it: any) => it.status !== "dispensed" && it.status !== "cancelled").map((it: any) => {
              const remaining = it.quantity - it.dispensedQuantity;
              const batches = batchesByItem[it.id] || [];
              return (
                <Card key={it.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{it.medication?.genericName} {it.medication?.brandName ? `(${it.medication.brandName})` : ""}</div>
                        <div className="text-xs text-slate-500">
                          {it.medication?.strength} · Qty {it.quantity} · Dispensed {it.dispensedQuantity}/{it.quantity} · Remaining {remaining}
                        </div>
                      </div>
                      <StatusBadge status={it.status} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                      <div className="md:col-span-2">
                        <Label className="text-[10px]">Select Batch</Label>
                        <Select value={dispenseMap[it.id]?.batchId || undefined} onValueChange={(v) => setItem(it.id, "batchId", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={batches.length === 0 ? "No batches available" : "Select batch"} /></SelectTrigger>
                          <SelectContent>
                            {batches.filter((b: any) => b.quantity > 0).map((b: any) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.batchNumber} · {b.quantity} in stock{b.expiryDate ? ` · exp ${formatDate(b.expiryDate)}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px]">Dispense Qty</Label>
                        <Input type="number" min={1} max={remaining} value={dispenseMap[it.id]?.quantity || ""} onChange={(e) => setItem(it.id, "quantity", e.target.value)} placeholder={`max ${remaining}`} className="h-8 text-xs" />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleDispense(it)}
                        disabled={dispensing}
                        className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs"
                      >
                        <Activity className="w-3 h-3 mr-1" /> Dispense
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`inv-${it.id}`}
                        checked={dispenseMap[it.id]?.createInvoice ?? true}
                        onCheckedChange={(v) => setItem(it.id, "createInvoice", !!v)}
                      />
                      <Label htmlFor={`inv-${it.id}`} className="text-xs text-slate-600 cursor-pointer">Add to patient invoice (auto-bill)</Label>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {(full?.items || []).filter((it: any) => it.status === "dispensed").length > 0 && (
              <div className="text-xs text-slate-500 mt-2">
                Already dispensed: {(full?.items || []).filter((it: any) => it.status === "dispensed").map((it: any) => it.medication?.genericName).join(", ")}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

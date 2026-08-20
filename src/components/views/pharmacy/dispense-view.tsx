"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Pill, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, calculateAge, safeJson} from "@/components/ui-helpers";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function DispenseView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [dispensing, setDispensing] = useState<Record<string, boolean>>({});

  const qs = activeFacilityId ? `?facilityId=${activeFacilityId}&dispenseQueue=true` : "?dispenseQueue=true";
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dispense-queue", activeFacilityId],
    queryFn: () => fetchJson(`/api/prescriptions${qs}`),
    enabled: !!activeFacilityId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dispense-queue"] });
    qc.invalidateQueries({ queryKey: ["prescriptions"] });
  };

  // Group prescriptions by patient
  const items = data?.items || [];
  const byPatient: Record<string, { patient: any; rxs: any[] }> = {};
  for (const rx of items) {
    const pid = rx.patient?.id || "unknown";
    if (!byPatient[pid]) byPatient[pid] = { patient: rx.patient, rxs: [] };
    byPatient[pid].rxs.push(rx);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Pharmacy Dispensing Queue</h2>
        <p className="text-sm text-slate-500">All prescriptions pending dispense, grouped by patient</p>
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view the dispense queue.</CardContent></Card>
      )}

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load dispense queue" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState title="Queue is empty" description="No prescriptions are currently pending dispense." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(byPatient).map(([pid, group]) => (
            <PatientDispenseCard
              key={pid}
              patient={group.patient}
              prescriptions={group.rxs}
              onDone={invalidate}
              dispensing={dispensing}
              setDispensing={setDispensing}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PatientDispenseCard({ patient, prescriptions, onDone, dispensing, setDispensing }: {
  patient: any;
  prescriptions: any[];
  onDone: () => void;
  dispensing: Record<string, boolean>;
  setDispensing: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const [allergies, setAllergies] = useState<any[]>([]);

  useEffect(() => {
    if (!patient?.id) return;
    fetchJson(`/api/patients/${patient.id}`)
      .then((d) => setAllergies(d.patient?.allergies || []))
      .catch(() => setAllergies([]));
  }, [patient?.id]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              {patient?.firstName} {patient?.lastName}
              <span className="text-xs font-normal text-slate-500">· {patient?.patientNumber}</span>
              <span className="text-xs font-normal text-slate-400">· {calculateAge(patient?.dateOfBirth)}y · {patient?.sex}</span>
            </CardTitle>
            <div className="text-xs text-slate-500 mt-1">{prescriptions.length} prescription(s) pending</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {allergies.length > 0 && (
          <div className="bg-rose-50 border border-rose-300 rounded p-3 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-rose-800">Allergy Warning</div>
              <div className="text-xs text-rose-700 mt-1">
                {allergies.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 mr-2">
                    <Badge>{a.allergen}</Badge>
                    {a.severity && <span className="text-rose-500">({a.severity})</span>}
                    {a.reaction && <span className="text-rose-400">— {a.reaction}</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {prescriptions.map((rx) => (
          <PrescriptionDispenseRow key={rx.id} rx={rx} allergies={allergies} onDone={onDone} dispensing={dispensing} setDispensing={setDispensing} />
        ))}
      </CardContent>
    </Card>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700 border border-rose-200">{children}</span>;
}

function PrescriptionDispenseRow({ rx, allergies, onDone, dispensing, setDispensing }: {
  rx: any;
  allergies: any[];
  onDone: () => void;
  dispensing: Record<string, boolean>;
  setDispensing: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const [batchesByItem, setBatchesByItem] = useState<Record<string, any[]>>({});
  const [dispenseMap, setDispenseMap] = useState<Record<string, { batchId: string; quantity: number; createInvoice: boolean }>>({});
  const [loadingBatches, setLoadingBatches] = useState(true);
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();

  useEffect(() => {
    let active = true;
    (async () => {
      const newBatches: Record<string, any[]> = {};
      for (const it of rx.items || []) {
        // search inventory for this medication
        const res = await fetch(`/api/inventory?facilityId=${rx.facilityId}&type=medication&q=${encodeURIComponent(it.medication?.genericName || "")}`);
        if (res.ok) {
          const inv = await safeJson(res);
          const match = (inv.items || []).find((i: any) =>
            i.medication?.id === it.medicationId ||
            i.name?.toLowerCase().includes((it.medication?.genericName || "").toLowerCase())
          );
          newBatches[it.id] = match?.batches || [];
        }
      }
      if (active) {
        setBatchesByItem(newBatches);
        setLoadingBatches(false);
      }
    })();
    return () => { active = false; };
  }, [rx.id, rx.facilityId, rx.items]);

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

    // Check allergy interaction — if allergy matches, show custom danger dialog
    const medName = item.medication?.genericName?.toLowerCase() || "";
    const matchedAllergies = allergies.filter((a) => medName.includes(a.allergen?.toLowerCase() || "___"));
    if (matchedAllergies.length > 0) {
      confirmAction({
        title: "⚠ Allergy Warning — Proceed with Caution",
        description: `This patient has a documented allergy that may interact with ${item.medication?.genericName}. Proceed only if a clinician has authorized override.`,
        confirmText: "Yes, dispense anyway",
        variant: "danger",
        details: (
          <div className="space-y-1">
            <div><strong>Patient:</strong> {rx.patient.firstName} {rx.patient.lastName}</div>
            <div><strong>Medication:</strong> {item.medication?.genericName} ({item.medication?.brandName})</div>
            <div className="pt-2 border-t border-slate-200 mt-2">
              <div className="font-semibold text-rose-700 mb-1">Documented Allergies:</div>
              {matchedAllergies.map((a, i) => (
                <div key={i} className="text-xs">
                  • {a.allergen} — <em>{a.reaction || "reaction unknown"}</em> ({a.severity || "unspecified"})
                </div>
              ))}
            </div>
          </div>
        ),
        onConfirm: () => doDispense(item, cfg),
      });
      return;
    }

    doDispense(item, cfg);
  };

  const doDispense = async (item: any, cfg: any) => {
    setDispensing((p) => ({ ...p, [item.id]: true }));
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
      toast.success(`Dispensed ${cfg.quantity} units${data.invoice ? " — invoice updated" : ""}`);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDispensing((p) => ({ ...p, [item.id]: false }));
    }
  };

  return (
    <div className="border rounded p-3 bg-slate-50/40">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-mono text-xs text-slate-700">{rx.prescriptionNumber}</div>
          <div className="text-xs text-slate-500">Prescribed {formatDate(rx.prescribedAt, true)} by {rx.prescriber ? `${rx.prescriber.firstName} ${rx.prescriber.lastName}` : "—"}</div>
        </div>
        <StatusBadge status={rx.status} />
      </div>

      <div className="space-y-2">
        {loadingBatches ? (
          <div className="text-xs text-slate-500">Loading batches…</div>
        ) : (
          (rx.items || [])
            .filter((it: any) => it.status !== "dispensed" && it.status !== "cancelled")
            .map((it: any) => {
              const remaining = it.quantity - it.dispensedQuantity;
              const batches = batchesByItem[it.id] || [];
              const availableBatches = batches.filter((b: any) => b.quantity > 0);
              const medName = (it.medication?.genericName || "").toLowerCase();
              const hasAllergy = allergies.some((a) => medName.includes(a.allergen?.toLowerCase() || "___"));

              return (
                <div key={it.id} className={`border rounded p-2 bg-white ${hasAllergy ? "border-rose-300" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium">
                        {it.medication?.genericName} {it.medication?.brandName ? `(${it.medication.brandName})` : ""}
                        {hasAllergy && <Badge>⚠ Allergy</Badge>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {it.medication?.strength} · {it.medication?.dosageForm} · {it.dose} {it.frequency} · {it.route} · for {it.duration}
                      </div>
                      <div className="text-xs text-slate-500">
                        Qty {it.quantity} · Dispensed {it.dispensedQuantity}/{it.quantity} · Remaining {remaining}
                      </div>
                    </div>
                    <StatusBadge status={it.status} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                    <div className="md:col-span-2">
                      <Label className="text-[10px]">Batch</Label>
                      <Select value={dispenseMap[it.id]?.batchId || undefined} onValueChange={(v) => setItem(it.id, "batchId", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={availableBatches.length === 0 ? "No batches" : "Select batch"} /></SelectTrigger>
                        <SelectContent>
                          {availableBatches.map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.batchNumber} · {b.quantity} units{b.expiryDate ? ` · exp ${formatDate(b.expiryDate)}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px]">Qty</Label>
                      <Input type="number" min={1} max={remaining} value={dispenseMap[it.id]?.quantity || ""} onChange={(e) => setItem(it.id, "quantity", e.target.value)} placeholder={`max ${remaining}`} className="h-8 text-xs" />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleDispense(it)}
                      disabled={!!dispensing[it.id] || availableBatches.length === 0}
                      className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs gap-1"
                    >
                      {dispensing[it.id] ? <Activity className="w-3 h-3 animate-pulse" /> : <CheckCircle2 className="w-3 h-3" />}
                      {dispensing[it.id] ? "Dispensing…" : "Dispense"}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Checkbox
                      id={`inv-${it.id}`}
                      checked={dispenseMap[it.id]?.createInvoice ?? true}
                      onCheckedChange={(v) => setItem(it.id, "createInvoice", !!v)}
                    />
                    <Label htmlFor={`inv-${it.id}`} className="text-xs text-slate-600 cursor-pointer">Bill to invoice</Label>
                  </div>
                </div>
              );
            })
        )}
        {(rx.items || []).every((it: any) => it.status === "dispensed") && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> All items dispensed.
          </div>
        )}
      </div>
      {confirmDialogEl}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Baby, Save } from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, calculateAge, safeJson, PageHeader} from "@/components/ui-helpers";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function MaternityView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["maternity", activeFacilityId],
    queryFn: () => fetchJson(`/api/maternity?facilityId=${activeFacilityId}`),
    enabled: !!activeFacilityId,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Maternity"
        description="Manage antenatal, delivery, and postnatal records"
        icon={Baby}
        gradient="from-pink-500 to-rose-600"
        actions={
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Maternity Record
        </Button>
        }
      />

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view maternity records.</CardContent></Card>
      )}

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load maternity records" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No maternity records"
              description="Record the first maternity case at this facility."
              action={<Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Maternity Record</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.items.map((m: any) => (
            <Card key={m.id}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">
                      {m.patient?.firstName} {m.patient?.lastName}
                      <span className="text-xs text-slate-500 ml-2">{m.patient?.patientNumber} • {calculateAge(m.patient?.dateOfBirth)}y</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3">
                      <span>Gravida: <strong>{m.gravida ?? "—"}</strong></span>
                      <span>Para: <strong>{m.para ?? "—"}</strong></span>
                      <span>EDD: {m.expectedDeliveryDate ? formatDate(m.expectedDeliveryDate) : "—"}</span>
                      <span>{m.facility?.name || "—"}</span>
                      <span>Created {formatDate(m.createdAt, true)}</span>
                    </div>
                    {m.antenatalNotes && (
                      <div className="text-sm text-slate-700 mt-2 line-clamp-2 p-2 bg-slate-50 rounded">
                        {m.antenatalNotes}
                      </div>
                    )}
                    {m.newborns && m.newborns.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="text-xs font-semibold text-slate-700 mr-1">Newborns:</span>
                        {m.newborns.map((nb: any) => (
                          <Badge key={nb.id} variant="outline" className="text-xs bg-emerald-50 border-emerald-200 text-emerald-700">
                            {nb.sex === "male" ? "M" : nb.sex === "female" ? "F" : "?"} • {nb.birthWeight ? `${nb.birthWeight}kg` : "wt?"} • APGAR {nb.apgar1 ?? "?"}/{nb.apgar5 ?? "?"}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <StatusBadge status={m.pregnancyStatus} />
                    {m.deliveryType && <Badge variant="outline" className="capitalize">{m.deliveryType}</Badge>}
                    {m.birthOutcome && <Badge variant="outline" className="capitalize">{m.birthOutcome.replace(/_/g, " ")}</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewMaternityDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); qc.invalidateQueries({ queryKey: ["maternity"] }); }}
        defaultFacilityId={activeFacilityId}
      />
    </div>
  );
}

function NewMaternityDialog({ open, onClose, onCreated, defaultFacilityId }: { open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [facilityId, setFacilityId] = useState(defaultFacilityId || "");
  const [encounterId, setEncounterId] = useState("");
  const [gravida, setGravida] = useState("");
  const [para, setPara] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [pregnancyStatus, setPregnancyStatus] = useState("active");
  const [antenatalNotes, setAntenatalNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}&status=all`),
    enabled: patientQuery.length >= 2,
  });
  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities-list"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters", patientId, facilityId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}&facilityId=${facilityId}`),
    enabled: !!patientId && !!facilityId,
  });

  const submit = async () => {
    if (!patientId || !facilityId) {
      toast.error("Patient and facility are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/maternity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId, facilityId,
          encounterId: encounterId || undefined,
          gravida: gravida ? parseInt(gravida) : undefined,
          para: para ? parseInt(para) : undefined,
          expectedDeliveryDate: expectedDeliveryDate || undefined,
          pregnancyStatus,
          antenatalNotes,
        }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || "Failed");
      }
      toast.success("Maternity record created");
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setGravida(""); setPara(""); setExpectedDeliveryDate(""); setAntenatalNotes("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Maternity Record</DialogTitle>
          <DialogDescription>Open an antenatal record for the patient.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Patient</FieldLabel>
            <Input placeholder="Search patient..." value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
            {patientsData?.patients && patientsData.patients.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded bg-white">
                {patientsData.patients.map((p: any) => (
                  <button key={p.id} onClick={() => { setPatientId(p.id); setPatientQuery(`${p.firstName} ${p.lastName} (${p.patientNumber})`); }} className="w-full text-left p-2 hover:bg-emerald-50 text-sm border-b last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.patientNumber} • {calculateAge(p.dateOfBirth)}y</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Facility</FieldLabel>
              <Select value={facilityId || undefined} onValueChange={setFacilityId}>
                <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                <SelectContent>
                  {(facilitiesData?.items || facilitiesData?.facilities || []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Encounter</Label>
              <Select value={encounterId || "none"} onValueChange={(v) => setEncounterId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {(encountersData?.items || []).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.encounterNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label>Gravida</Label>
              <Input type="number" min="0" value={gravida} onChange={(e) => setGravida(e.target.value)} placeholder="e.g. 1" />
            </div>
            <div>
              <Label>Para</Label>
              <Input type="number" min="0" value={para} onChange={(e) => setPara(e.target.value)} placeholder="e.g. 0" />
            </div>
            <div>
              <Label>Expected Delivery Date</Label>
              <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Pregnancy Status</Label>
            <Select value={pregnancyStatus || undefined} onValueChange={setPregnancyStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active (Antenatal)</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="miscarried">Miscarried</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Antenatal Notes</Label>
            <Textarea value={antenatalNotes} onChange={(e) => setAntenatalNotes(e.target.value)} rows={4} placeholder="LMP, EDD, ultrasound findings, complications..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Save className="w-4 h-4 animate-pulse" /> : <Baby className="w-4 h-4" />}
            {saving ? "Saving..." : "Create Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

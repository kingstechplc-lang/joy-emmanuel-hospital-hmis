"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Share2, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, StatusBadge, formatDate } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export function ReferralsView() {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();
  const [tab, setTab] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["referrals", activeFacilityId, tab],
    queryFn: () => fetchJson(`/api/referrals?facilityId=${activeFacilityId}&direction=${tab}`),
    enabled: !!activeFacilityId,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Referrals</h2>
          <p className="text-sm text-slate-500">Incoming and outgoing patient referrals.</p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> New Referral
        </Button>
      </div>

      {!activeFacilityId && (
        <Card><CardContent className="p-4 text-sm text-amber-700 bg-amber-50">Select a facility to view referrals.</CardContent></Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all" className="gap-1"><Share2 className="w-3.5 h-3.5" /> All</TabsTrigger>
          <TabsTrigger value="outgoing" className="gap-1"><ArrowRight className="w-3.5 h-3.5" /> Outgoing</TabsTrigger>
          <TabsTrigger value="incoming" className="gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Incoming</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState message="Failed to load referrals" onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No referrals found"
              description="Create a new referral to transfer a patient to another facility."
              action={<Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Referral</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.items.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">
                      {r.patient?.firstName} {r.patient?.lastName}
                      <span className="text-xs text-slate-500 ml-2">{r.patient?.patientNumber}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3">
                      <span className="flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" /> From: {r.referringFacility?.name || "—"}
                      </span>
                      <span className="flex items-center gap-1">
                        <ArrowLeft className="w-3 h-3" /> To: {r.receivingFacility?.name || "—"}
                      </span>
                      <span>{formatDate(r.referredAt, true)}</span>
                    </div>
                    {r.reason && <div className="text-sm text-slate-700 mt-1 line-clamp-1">{r.reason}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={r.urgency} />
                    <StatusBadge status={r.status} />
                  </div>
                </div>
                {r.clinicalSummary && (
                  <div className="mt-2 p-2 bg-slate-50 rounded text-xs text-slate-700">
                    {r.clinicalSummary}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewReferralDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); qc.invalidateQueries({ queryKey: ["referrals"] }); }}
        defaultFacilityId={activeFacilityId}
      />
    </div>
  );
}

function NewReferralDialog({ open, onClose, onCreated, defaultFacilityId }: { open: boolean; onClose: () => void; onCreated: () => void; defaultFacilityId: string | null }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [referringFacilityId, setReferringFacilityId] = useState(defaultFacilityId || "");
  const [receivingFacilityId, setReceivingFacilityId] = useState("");
  const [reason, setReason] = useState("");
  const [clinicalSummary, setClinicalSummary] = useState("");
  const [urgency, setUrgency] = useState("routine");
  const [saving, setSaving] = useState(false);

  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities-list"],
    queryFn: () => fetchJson("/api/facilities"),
  });
  const { data: patientsData } = useQuery({
    queryKey: ["patient-search", patientQuery],
    queryFn: () => fetchJson(`/api/patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: patientQuery.length >= 2,
  });
  const { data: encountersData } = useQuery({
    queryKey: ["patient-encounters", patientId],
    queryFn: () => fetchJson(`/api/encounters?patientId=${patientId}&facilityId=${referringFacilityId}`),
    enabled: !!patientId && !!referringFacilityId,
  });

  const submit = async () => {
    if (!patientId || !encounterId || !referringFacilityId) {
      toast.error("Patient, encounter, and referring facility are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientIdFrom: patientId, encounterId,
          referringFacilityId, receivingFacilityId: receivingFacilityId || undefined,
          reason, clinicalSummary, urgency,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Referral created");
      setPatientQuery(""); setPatientId(""); setEncounterId("");
      setReceivingFacilityId(""); setReason(""); setClinicalSummary("");
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
          <DialogTitle>New Patient Referral</DialogTitle>
          <DialogDescription>Refer patient to another facility for specialized care.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Patient *</Label>
            <Input placeholder="Search patient..." value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Referring Facility (Current) *</Label>
              <Select value={referringFacilityId} onValueChange={setReferringFacilityId}>
                <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                <SelectContent>
                  {(facilitiesData?.items || facilitiesData?.facilities || []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Receiving Facility</Label>
              <Select value={receivingFacilityId || "none"} onValueChange={(v) => setReceivingFacilityId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Any / External —</SelectItem>
                  {(facilitiesData?.items || facilitiesData?.facilities || []).filter((f: any) => f.id !== referringFacilityId).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {patientId && referringFacilityId && (
            <div>
              <Label>Encounter *</Label>
              <Select value={encounterId} onValueChange={setEncounterId}>
                <SelectTrigger><SelectValue placeholder="Select encounter" /></SelectTrigger>
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
            <Label>Reason for Referral</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. needs specialized cardiology consult" />
          </div>

          <div>
            <Label>Clinical Summary</Label>
            <Textarea value={clinicalSummary} onChange={(e) => setClinicalSummary(e.target.value)} placeholder="Brief clinical background and current management..." rows={4} />
          </div>

          <div>
            <Label>Urgency</Label>
            <Select value={urgency} onValueChange={setUrgency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Submitting..." : "Create Referral"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

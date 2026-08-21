"use client";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  ClipboardCheck, Search, UserPlus, ShieldCheck, ShieldX, ShieldAlert, Clock,
  Users, Activity, FileText, CheckCircle2, AlertCircle, Loader2, Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, calculateAge, safeJson} from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";
import { SearchableSelect } from "@/components/ui/searchable-select";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

// ─── Eligibility badge component ─────────────────────────────────
function EligibilityBadge({ eligibility }: { eligibility: string }) {
  const map: Record<string, { label: string; className: string; icon: any }> = {
    valid: { label: "NHIS Valid", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: ShieldCheck },
    expired: { label: "NHIS Expired", className: "bg-rose-100 text-rose-700 border-rose-200", icon: ShieldX },
    unvalidated: { label: "NHIS Unvalidated", className: "bg-amber-100 text-amber-700 border-amber-200", icon: ShieldAlert },
    self_pay: { label: "Self-Pay", className: "bg-slate-100 text-slate-700 border-slate-200", icon: ShieldX },
  };
  const cfg = map[eligibility] || map.self_pay;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${cfg.className}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

export function RecordsDeskView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setView = useAppStore((s) => s.setView);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const qc = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkInPatient, setCheckInPatient] = useState<any | null>(null);
  const [encounterType, setEncounterType] = useState("opd");
  const [priority, setPriority] = useState("routine");

  const facilityParam = activeFacilityId ? `?facilityId=${activeFacilityId}` : "";

  // Fetch records stats
  const { data: stats, isLoading, isError, refetch } = useQuery({
    queryKey: ["records-stats", activeFacilityId],
    queryFn: () => fetchJson(`/api/records/stats${facilityParam}`),
    refetchInterval: 30000,
  });

  // Patient search
  const searchPatients = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}&limit=20`);
      const d = await safeJson(res);
      setSearchResults(d.patients || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: async () => {
      // Pre-validate: ensure facility is selected
      if (!activeFacilityId) {
        throw new Error("No facility selected. Please select a facility from the top bar before checking in.");
      }
      if (!checkInPatient?.id) {
        throw new Error("No patient selected for check-in.");
      }

      let res: Response;
      try {
        res = await fetch("/api/records/check-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: checkInPatient.id,
            facilityId: activeFacilityId,
            encounterType,
            priority,
            addToQueue: true,
          }),
        });
      } catch (fetchErr: any) {
        throw new Error(`Network error: ${fetchErr?.message || "Could not reach the server. Please check your connection and try again."}`);
      }

      // Safely parse the response body
      let data: any = {};
      try {
        const text = await res.text();
        if (text && text.trim() !== "") {
          data = JSON.parse(text);
        }
      } catch {
        // Body wasn't valid JSON
      }

      if (!res.ok) {
        const errMsg = data?.error || `Check-in failed (HTTP ${res.status}). Please try again.`;
        throw new Error(errMsg);
      }

      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Patient checked in successfully");
      qc.invalidateQueries({ queryKey: ["records-stats"] });
      qc.invalidateQueries({ queryKey: ["encounters"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
      setCheckInPatient(null);
      // Navigate to patient 360
      selectPatient(data.patient.id);
      setView("patient_360");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openPatient360 = (patientId: string) => {
    selectPatient(patientId);
    setView("patient_360");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-emerald-600" />
            Records Desk
          </h2>
          <p className="text-sm text-slate-500">
            First point of entry — verify patient, check NHIS eligibility, open encounter
          </p>
        </div>
        <Button onClick={() => setView("patient_new")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <UserPlus className="w-4 h-4" /> Register New Patient
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatMini label="Today's Check-ins" value={stats?.todayCheckIns ?? "—"} icon={Clock} color="emerald" />
        <StatMini label="Active Encounters" value={stats?.activeEncounters ?? "—"} icon={Activity} color="blue" />
        <StatMini label="New Patients Today" value={stats?.todayNewPatients ?? "—"} icon={UserPlus} color="purple" />
        <StatMini label="NHIS Valid" value={stats?.insuranceBreakdown?.nhisValid ?? "—"} icon={ShieldCheck} color="emerald" />
        <StatMini label="Self-Pay" value={stats?.insuranceBreakdown?.selfPay ?? "—"} icon={ShieldX} color="slate" />
        <StatMini label="NHIS Expired" value={stats?.insuranceBreakdown?.expired ?? "—"} icon={ShieldAlert} color="rose" />
      </div>

      {/* Patient Search + Check-in */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-5 h-5 text-emerald-600" />
            Find & Check-in Patient
          </CardTitle>
          <CardDescription>
            Search by patient number, name, phone, or Ghana Card. Then verify NHIS and open encounter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SearchableSelect
            options={searchResults.map((p) => ({
              value: p.id,
              label: `${p.firstName} ${p.lastName}`,
              description: p.phone || undefined,
              secondary: p.patientNumber,
              initials: `${p.firstName?.[0] || ""}${p.lastName?.[0] || ""}`.toUpperCase(),
            }))}
            value=""
            onValueChange={(v) => {
              const p = searchResults.find((p) => p.id === v);
              if (p) setCheckInPatient(p);
            }}
            onSearch={(q) => searchPatients(q)}
            placeholder="Search patient by name, number, phone, or Ghana Card..."
            searchPlaceholder="Type at least 2 characters to search..."
            emptyText="No patients found"
            label="Search Existing Patient"
            required
          />
          {searching && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching...
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setView("patients")} className="gap-1.5">
              <Users className="w-4 h-4" /> Browse All Patients
            </Button>
            <Button variant="outline" size="sm" onClick={() => setView("patient_new")} className="gap-1.5">
              <UserPlus className="w-4 h-4" /> Can&apos;t find? Register
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Check-ins */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Today&apos;s Check-ins</CardTitle>
            <CardDescription>Patients who checked in today at this facility</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setView("encounters")} className="gap-1">
            View All Encounters
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState rows={5} />
          ) : isError ? (
            <ErrorState message="Failed to load check-ins" onRetry={() => refetch()} />
          ) : !stats?.recentCheckIns?.length ? (
            <EmptyState
              title="No check-ins today"
              description="Use the search above to find and check in a patient."
              icon={Clock}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Encounter #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Eligibility</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Time</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentCheckIns.map((enc: any) => (
                    <tr key={enc.id} className="border-b hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-xs shrink-0">
                            {enc.patient.firstName?.[0]}{enc.patient.lastName?.[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate">
                              {enc.patient.firstName} {enc.patient.lastName}
                            </div>
                            <div className="text-xs text-slate-500">{enc.patient.patientNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-xs font-mono text-slate-600">{enc.encounterNumber}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">{enc.encounterType}</Badge>
                      </td>
                      <td className="p-3">
                        <EligibilityBadge eligibility={enc.patient.eligibility} />
                      </td>
                      <td className="p-3"><StatusBadge status={enc.status} /></td>
                      <td className="p-3 text-xs text-slate-500">
                        {new Date(enc.startAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openPatient360(enc.patient.id)}
                          className="h-7 text-xs"
                        >
                          Open Record →
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Check-in Dialog */}
      {checkInPatient && (
        <CheckInDialog
          patient={checkInPatient}
          encounterType={encounterType}
          setEncounterType={setEncounterType}
          priority={priority}
          setPriority={setPriority}
          onClose={() => setCheckInPatient(null)}
          onConfirm={() => checkInMutation.mutate()}
          loading={checkInMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Check-in Dialog ─────────────────────────────────────────────
function CheckInDialog({
  patient,
  encounterType,
  setEncounterType,
  priority,
  setPriority,
  onClose,
  onConfirm,
  loading,
}: {
  patient: any;
  encounterType: string;
  setEncounterType: (v: string) => void;
  priority: string;
  setPriority: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const age = calculateAge(patient.dateOfBirth);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-600" />
            Check-in Patient
          </DialogTitle>
          <DialogDescription>Verify patient details and NHIS eligibility before opening encounter.</DialogDescription>
        </DialogHeader>

        {/* Patient summary card */}
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-lg shrink-0">
              {patient.firstName?.[0]}{patient.lastName?.[0]}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900">{patient.firstName} {patient.lastName}</div>
              <div className="text-xs text-slate-500">
                {patient.patientNumber} • {age} years • {patient.sex || "—"} • {patient.bloodGroup ? `Blood: ${patient.bloodGroup}` : "Blood: —"}
              </div>
              <div className="text-xs text-slate-500">{patient.phone || "No phone"}</div>
            </div>
          </div>
        </div>

        {/* NHIS / Insurance eligibility check */}
        <div className="p-3 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Insurance Eligibility</span>
            <span className="text-xs text-slate-500">Auto-checked</span>
          </div>
          <div className="space-y-1.5 text-sm">
            {patient.insurance && patient.insurance.length > 0 ? (
              patient.insurance.map((ins: any, i: number) => {
                const now = new Date();
                const isExpired = ins.coverageEnd && new Date(ins.coverageEnd) < now;
                const isVerified = ins.verificationStatus === "verified";
                const status = isExpired ? "expired" : !isVerified ? "unvalidated" : "valid";

                return (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{ins.insuranceProvider?.name || "Unknown"}</span>
                      <span className="text-xs text-slate-500 ml-2">#{ins.membershipNumber}</span>
                    </div>
                    <EligibilityBadge eligibility={status} />
                  </div>
                );
              })
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-slate-600">No active insurance</span>
                <EligibilityBadge eligibility="self_pay" />
              </div>
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-200 text-xs">
            <span className="font-semibold text-slate-700">Payer Type: </span>
            {patient.insurance?.some((ins: any) =>
              ins.verificationStatus === "verified" &&
              ins.coverageEnd &&
              new Date(ins.coverageEnd) >= new Date()
            ) ? (
              <span className="text-emerald-700 font-semibold">NHIS-insured (subsidized care)</span>
            ) : (
              <span className="text-slate-700 font-semibold">Self-Pay (full cost for all services)</span>
            )}
          </div>
        </div>

        {/* Encounter type + priority */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel required>Encounter Type</FieldLabel>
            <Select value={encounterType || undefined} onValueChange={setEncounterType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="opd">OPD</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="laboratory">Laboratory Only</SelectItem>
                <SelectItem value="pharmacy">Pharmacy Only</SelectItem>
                <SelectItem value="imaging">Imaging Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Priority</FieldLabel>
            <Select value={priority || undefined} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="p-2 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Patient will be added to the OPD queue automatically after check-in.</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {loading ? "Checking in..." : "Confirm Check-in"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mini stat card ──────────────────────────────────────────────
function StatMini({ label, value, icon: Icon, color }: { label: string; value: React.ReactNode; icon: any; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    purple: "bg-purple-50 text-purple-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <Card className="hover:shadow-md transition">
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[color]} shrink-0`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold text-slate-900 tabular-nums">{value}</p>
          <p className="text-[10px] text-slate-500 font-medium truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

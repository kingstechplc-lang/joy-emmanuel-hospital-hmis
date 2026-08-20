"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Skull, Plus, Search, RefreshCcw, Eye, DoorOpen, UserX, Building2, Phone, FileText, AlertCircle, Download } from "lucide-react";
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

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "admitted", label: "Admitted" },
  { value: "stored", label: "In Storage" },
  { value: "released", label: "Released" },
  { value: "transferred_out", label: "Transferred Out" },
];

const PLACE_OF_DEATH = [
  { value: "facility", label: "This Facility" },
  { value: "home", label: "Home" },
  { value: "roadside", label: "Roadside" },
  { value: "other_facility", label: "Another Facility" },
  { value: "unknown", label: "Unknown" },
];

export function MortuaryView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);
  const canManage = can("mortuary.manage");
  const canView = can("mortuary.view");

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showRelease, setShowRelease] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<any | null>(null);

  const queryParams = new URLSearchParams({
    ...(activeFacilityId ? { facilityId: activeFacilityId } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(search ? { search } : {}),
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["mortuary", queryParams.toString()],
    queryFn: () => fetchJson(`/api/mortuary?${queryParams.toString()}`),
    enabled: canView,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/mortuary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Deceased person admitted to mortuary");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["mortuary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const releaseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/mortuary/${id}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Body released to family / undertaker");
      setShowRelease(null);
      qc.invalidateQueries({ queryKey: ["mortuary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
          <p className="text-sm text-slate-500">You don&apos;t have permission to access the mortuary.</p>
        </CardContent>
      </Card>
    );
  }

  const items: any[] = data?.items || [];

  // CSV Export for mortuary records
  const handleExportCSV = () => {
    if (!items.length) {
      toast.error("No records to export");
      return;
    }
    const headers = ["Admission #", "Body Tag", "Deceased Name", "Age", "Sex", "Date of Death", "Place of Death", "Cause", "Status", "Admitted At", "Released At", "Released To", "Next of Kin", "Source Facility"];
    const rows = items.map((it) => [
      it.admissionNumber || "",
      it.bodyTag || "",
      it.deceasedName || "",
      it.deceasedAge || "",
      it.deceasedSex || "",
      it.dateOfDeath ? new Date(it.dateOfDeath).toISOString() : "",
      it.placeOfDeath || "",
      (it.causeOfDeath || "").replace(/"/g, '""'),
      it.admissionStatus || "",
      it.admittedAt ? new Date(it.admittedAt).toISOString() : "",
      it.releasedAt ? new Date(it.releasedAt).toISOString() : "",
      (it.releasedTo || "").replace(/"/g, '""'),
      (it.nextOfKinName || "").replace(/"/g, '""'),
      (it.sourceFacility || "").replace(/"/g, '""'),
    ].map((v) => `"${v}"`).join(","));
    const csv = [headers.map((h) => `"${h}"`).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mortuary-records-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${items.length} records to CSV`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Skull className="w-5 h-5 text-slate-700" /> Mortuary Services
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage deceased persons including those not recorded from this facility. Track body intake, cold storage, and release.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCcw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!items.length}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1" /> Admit Deceased
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Admissions" value={items.length} color="slate" />
        <StatCard label="In Storage" value={items.filter((i) => i.admissionStatus === "stored" || i.admissionStatus === "admitted").length} color="amber" />
        <StatCard label="Released" value={items.filter((i) => i.admissionStatus === "released").length} color="emerald" />
        <StatCard label="Brought-in (Not Facility)" value={items.filter((i) => i.placeOfDeath !== "facility").length} color="rose" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <Input
              placeholder="Search by name, body tag, ID, next of kin..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Deceased Records ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState rows={5} />
          ) : isError ? (
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              title="No deceased records"
              description="Admitted deceased persons will appear here. You can record bodies brought in from outside the facility too."
              icon={Skull}
              action={canManage ? (
                <Button size="sm" onClick={() => setShowForm(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Admit First Record
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="border border-slate-200 rounded-md p-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900">{item.deceasedName}</span>
                        {item.deceasedAge && <span className="text-xs text-slate-500">· {item.deceasedAge}y · {item.deceasedSex}</span>}
                        <StatusBadge status={item.admissionStatus} />
                        {item.placeOfDeath && item.placeOfDeath !== "facility" && (
                          <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50">
                            Brought-in
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                        <div>Admission #: <span className="font-mono">{item.admissionNumber}</span> · Body Tag: <span className="font-mono">{item.bodyTag || "—"}</span></div>
                        <div>Date of death: {formatDate(item.dateOfDeath, true)} · Admitted: {formatRelative(item.admittedAt)}</div>
                        {item.causeOfDeath && <div>Cause: {item.causeOfDeath}</div>}
                        {item.nextOfKinName && (
                          <div className="flex items-center gap-1">
                            <UserX className="w-3 h-3" /> Next of kin: {item.nextOfKinName} ({item.nextOfKinRelation || "—"})
                            {item.nextOfKinPhone && <span className="flex items-center gap-0.5"><Phone className="w-3 h-3 ml-2" />{item.nextOfKinPhone}</span>}
                          </div>
                        )}
                        {item.storageLocation && <div>Storage: {item.storageLocation}</div>}
                        {item.sourceFacility && <div className="flex items-center gap-1"><Building2 className="w-3 h-3" /> Source: {item.sourceFacility}</div>}
                        {item.releasedAt && (
                          <div className="text-emerald-700 mt-1">
                            Released: {formatDate(item.releasedAt, true)} to {item.releasedTo}
                            {item.undertakingCompany ? ` · ${item.undertakingCompany}` : ""}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => setViewItem(item)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      {canManage && item.admissionStatus !== "released" && (
                        <Button size="sm" variant="outline" onClick={() => setShowRelease(item.id)}>
                          <DoorOpen className="w-4 h-4 mr-1" /> Release
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      {showForm && (
        <MortuaryForm
          open={showForm}
          onOpenChange={setShowForm}
          onSubmit={(data) => createMutation.mutate(data)}
          loading={createMutation.isPending}
        />
      )}

      {/* Release Dialog */}
      {showRelease && (
        <ReleaseForm
          open={!!showRelease}
          onOpenChange={(o) => !o && setShowRelease(null)}
          onSubmit={(data) => releaseMutation.mutate({ id: showRelease, data })}
          loading={releaseMutation.isPending}
        />
      )}

      {/* View Dialog */}
      {viewItem && (
        <Dialog open onOpenChange={(o) => !o && setViewItem(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Skull className="w-5 h-5" /> {viewItem.deceasedName}
              </DialogTitle>
              <DialogDescription>Mortuary Admission — {viewItem.admissionNumber}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <DetailRow label="Body Tag" value={viewItem.bodyTag} />
              <DetailRow label="Age / Sex" value={`${viewItem.deceasedAge || "—"}y / ${viewItem.deceasedSex || "—"}`} />
              <DetailRow label="Date of Death" value={formatDate(viewItem.dateOfDeath, true)} />
              <DetailRow label="Place of Death" value={viewItem.placeOfDeath || "—"} />
              <DetailRow label="Cause of Death" value={viewItem.causeOfDeath || "—"} />
              <DetailRow label="Death Certificate #" value={viewItem.deathCertificateNo || "—"} />
              <DetailRow label="National ID" value={viewItem.nationalId || "—"} />
              <DetailRow label="Source Facility" value={viewItem.sourceFacility || "—"} />
              <DetailRow label="Brought By" value={viewItem.broughtBy || "—"} />
              <DetailRow label="Brought By Phone" value={viewItem.broughtByPhone || "—"} />
              <DetailRow label="Storage Location" value={viewItem.storageLocation || "—"} />
              <DetailRow label="Status" value={<StatusBadge status={viewItem.admissionStatus} />} />
              <DetailRow label="Next of Kin" value={viewItem.nextOfKinName || "—"} />
              <DetailRow label="Next of Kin Phone" value={viewItem.nextOfKinPhone || "—"} />
              <DetailRow label="Relationship" value={viewItem.nextOfKinRelation || "—"} />
              <DetailRow label="Admitted At" value={formatDate(viewItem.admittedAt, true)} />
              {viewItem.releasedAt && (
                <>
                  <DetailRow label="Released At" value={formatDate(viewItem.releasedAt, true)} />
                  <DetailRow label="Released To" value={viewItem.releasedTo || "—"} />
                  <DetailRow label="Released To Phone" value={viewItem.releasedToPhone || "—"} />
                  <DetailRow label="ID Type" value={viewItem.releasedToIdType || "—"} />
                  <DetailRow label="ID Number" value={viewItem.releasedToIdNo || "—"} />
                  <DetailRow label="Undertaking Company" value={viewItem.undertakingCompany || "—"} />
                </>
              )}
              {viewItem.sourceNotes && (
                <div className="col-span-2">
                  <Label className="text-slate-500">Source Notes</Label>
                  <p className="mt-1 text-slate-700">{viewItem.sourceNotes}</p>
                </div>
              )}
              {viewItem.releaseNotes && (
                <div className="col-span-2">
                  <Label className="text-slate-500">Release Notes</Label>
                  <p className="mt-1 text-slate-700">{viewItem.releaseNotes}</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <Card>
      <CardContent className={`p-3 border-l-4 ${colorMap[color]}`}>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Label className="text-slate-500">{label}</Label>
      <div className="mt-0.5 text-slate-800">{value}</div>
    </div>
  );
}

function MortuaryForm({ open, onOpenChange, onSubmit, loading }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<any>({
    deceasedName: "",
    deceasedAge: "",
    deceasedSex: "male",
    deceasedDob: "",
    nationalId: "",
    nextOfKinName: "",
    nextOfKinPhone: "",
    nextOfKinRelation: "",
    dateOfDeath: "",
    placeOfDeath: "facility",
    causeOfDeath: "",
    deathCertificateNo: "",
    broughtBy: "",
    broughtByPhone: "",
    sourceFacility: "",
    sourceNotes: "",
    storageLocation: "",
    bodyTag: "",
  });

  const set = (k: string, v: any) => setForm((s: any) => ({ ...s, [k]: v }));

  const submit = () => {
    const payload = { ...form };
    if (payload.deceasedAge) payload.deceasedAge = parseInt(payload.deceasedAge);
    if (!payload.deceasedDob) delete payload.deceasedDob;
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Skull className="w-5 h-5" /> Admit Deceased Person</DialogTitle>
          <DialogDescription>
            Record a deceased person. Works for both facility deaths and bodies brought in from outside.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Deceased Name</FieldLabel>
              <Input value={form.deceasedName} onChange={(e) => set("deceasedName", e.target.value)} />
            </div>
            <div>
              <FieldLabel>Age</FieldLabel>
              <Input type="number" value={form.deceasedAge} onChange={(e) => set("deceasedAge", e.target.value)} />
            </div>
            <div>
              <Label>Sex</Label>
              <Select value={form.deceasedSex} onValueChange={(v) => set("deceasedSex", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input type="date" value={form.deceasedDob} onChange={(e) => set("deceasedDob", e.target.value)} />
            </div>
            <div>
              <Label>National ID</Label>
              <Input value={form.nationalId} onChange={(e) => set("nationalId", e.target.value)} />
            </div>
            <div>
              <FieldLabel>Date & Time of Death</FieldLabel>
              <Input type="datetime-local" value={form.dateOfDeath} onChange={(e) => set("dateOfDeath", e.target.value)} />
            </div>
            <div>
              <Label>Place of Death</Label>
              <Select value={form.placeOfDeath} onValueChange={(v) => set("placeOfDeath", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLACE_OF_DEATH.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cause of Death</Label>
              <Input value={form.causeOfDeath} onChange={(e) => set("causeOfDeath", e.target.value)} />
            </div>
            <div>
              <Label>Death Certificate #</Label>
              <Input value={form.deathCertificateNo} onChange={(e) => set("deathCertificateNo", e.target.value)} />
            </div>
            {form.placeOfDeath === "other_facility" && (
              <div>
                <Label>Source Facility</Label>
                <Input value={form.sourceFacility} onChange={(e) => set("sourceFacility", e.target.value)} placeholder="Name of referring facility" />
              </div>
            )}
            <div>
              <Label>Brought By</Label>
              <Input value={form.broughtBy} onChange={(e) => set("broughtBy", e.target.value)} placeholder="Person who brought body" />
            </div>
            <div>
              <Label>Brought By Phone</Label>
              <Input value={form.broughtByPhone} onChange={(e) => set("broughtByPhone", e.target.value)} />
            </div>
          </div>

          <div className="border-t pt-3">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Next of Kin</h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Name</Label>
                <Input value={form.nextOfKinName} onChange={(e) => set("nextOfKinName", e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.nextOfKinPhone} onChange={(e) => set("nextOfKinPhone", e.target.value)} />
              </div>
              <div>
                <Label>Relationship</Label>
                <Input value={form.nextOfKinRelation} onChange={(e) => set("nextOfKinRelation", e.target.value)} placeholder="Spouse / Son / ..." />
              </div>
            </div>
          </div>

          <div className="border-t pt-3">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Storage</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Storage Location</Label>
                <Input value={form.storageLocation} onChange={(e) => set("storageLocation", e.target.value)} placeholder="Chamber A / Freezer 3 / ..." />
              </div>
              <div>
                <Label>Body Tag (auto if blank)</Label>
                <Input value={form.bodyTag} onChange={(e) => set("bodyTag", e.target.value)} placeholder="Auto-generated" />
              </div>
            </div>
          </div>

          <div>
            <Label>Source Notes</Label>
            <Textarea
              value={form.sourceNotes}
              onChange={(e) => set("sourceNotes", e.target.value)}
              placeholder="Any additional notes about where the body came from or special circumstances..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={loading || !form.deceasedName || !form.dateOfDeath}>
            {loading ? "Admitting..." : "Admit to Mortuary"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseForm({ open, onOpenChange, onSubmit, loading }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<any>({
    releasedTo: "",
    releasedToPhone: "",
    releasedToIdType: "national_id",
    releasedToIdNo: "",
    undertakingCompany: "",
    releaseNotes: "",
  });

  const set = (k: string, v: any) => setForm((s: any) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><DoorOpen className="w-5 h-5" /> Release Body</DialogTitle>
          <DialogDescription>Record the handover of the body to family or undertaker.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel>Released To (Name)</FieldLabel>
            <Input value={form.releasedTo} onChange={(e) => set("releasedTo", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input value={form.releasedToPhone} onChange={(e) => set("releasedToPhone", e.target.value)} />
            </div>
            <div>
              <Label>ID Type</Label>
              <Select value={form.releasedToIdType} onValueChange={(v) => set("releasedToIdType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="national_id">National ID</SelectItem>
                  <SelectItem value="driving">Driving License</SelectItem>
                  <SelectItem value="passport">Passport</SelectItem>
                  <SelectItem value="voter">Voter Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>ID Number</Label>
            <Input value={form.releasedToIdNo} onChange={(e) => set("releasedToIdNo", e.target.value)} />
          </div>
          <div>
            <Label>Funeral Home / Undertaking Company</Label>
            <Input value={form.undertakingCompany} onChange={(e) => set("undertakingCompany", e.target.value)} />
          </div>
          <div>
            <Label>Release Notes</Label>
            <Textarea
              value={form.releaseNotes}
              onChange={(e) => set("releaseNotes", e.target.value)}
              rows={2}
              placeholder="Any notes about the handover..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onSubmit(form)}
            disabled={loading || !form.releasedTo}
          >
            {loading ? "Releasing..." : "Confirm Release"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

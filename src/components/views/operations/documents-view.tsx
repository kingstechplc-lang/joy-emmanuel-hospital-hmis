"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FolderOpen, Search, Plus, FileText, ExternalLink, Eye, X } from "lucide-react";
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

const DOC_TYPES = [
  { value: "all", label: "All Types" },
  { value: "referral_letter", label: "Referral Letter" },
  { value: "medical_report", label: "Medical Report" },
  { value: "consent_form", label: "Consent Form" },
  { value: "discharge_summary", label: "Discharge Summary" },
  { value: "lab_report", label: "Lab Report" },
  { value: "imaging_report", label: "Imaging Report" },
  { value: "other", label: "Other" },
];

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public" },
  { value: "facility", label: "Facility" },
  { value: "department", label: "Department" },
  { value: "restricted", label: "Restricted" },
];

export function DocumentsView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [docType, setDocType] = useState("all");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (activeFacilityId) params.set("facilityId", activeFacilityId);
  if (docType !== "all") params.set("documentType", docType);
  if (search) params.set("q", search);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["documents", activeFacilityId, docType, search],
    queryFn: () => fetchJson(`/api/documents${qs}`),
  });

  const items = data?.items || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["documents"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Document deleted");
      invalidate();
      setViewing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Documents</h2>
          <p className="text-sm text-slate-500">Manage patient and operational documents across facilities</p>
        </div>
        {can("document.upload") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Upload Document
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search by file name" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="md:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load documents" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6">
          <EmptyState
            title="No documents found"
            description="Upload documents to keep patient records and operational files organized."
            action={can("document.upload") && <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> Upload Document</Button>}
          />
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">File Name</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Uploaded By</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Visibility</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Uploaded</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d: any) => (
                    <tr
                      key={d.id}
                      className="border-b hover:bg-slate-50 cursor-pointer"
                      onClick={() => setViewing(d)}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-emerald-600" />
                          <div>
                            <div className="font-medium text-slate-900">{d.fileName}</div>
                            <div className="text-xs text-slate-500">{d.facility?.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 capitalize">{(d.documentType || "other").replace(/_/g, " ")}</td>
                      <td className="p-3">
                        {d.patient ? (
                          <div>
                            <div className="text-slate-900">{d.patient.firstName} {d.patient.lastName}</div>
                            <div className="text-xs text-slate-500">{d.patient.patientNumber}</div>
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="p-3">
                        {d.uploadedBy ? (
                          <div>
                            <div className="text-slate-900">{d.uploadedBy.firstName} {d.uploadedBy.lastName}</div>
                            <div className="text-xs text-slate-500">@{d.uploadedBy.username}</div>
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="p-3 capitalize">{d.visibility}</td>
                      <td className="p-3">
                        <div className="text-slate-900">{formatRelative(d.uploadedAt)}</div>
                        <div className="text-xs text-slate-500">{formatDate(d.uploadedAt, true)}</div>
                      </td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => setViewing(d)} className="h-8 w-8 p-0">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showNew && <UploadDialog onClose={() => setShowNew(false)} />}
      {viewing && (
        <DocumentDetail
          doc={viewing}
          onClose={() => setViewing(null)}
          onDelete={can("document.delete") ? () => deleteMutation.mutate(viewing.id) : undefined}
          deleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

function UploadDialog({ onClose }: { onClose: () => void }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [form, setForm] = useState({
    patientId: "",
    encounterId: "",
    facilityId: activeFacilityId || "",
    documentType: "medical_report",
    fileName: "",
    fileUrl: "",
    mimeType: "",
    fileSize: "",
    visibility: "facility",
  });

  const [patientSearch, setPatientSearch] = useState("");
  const [searchedPatients, setSearchedPatients] = useState<any[]>([]);

  const searchPatients = async (q: string) => {
    setPatientSearch(q);
    if (q.length < 2) {
      setSearchedPatients([]);
      return;
    }
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}`);
      const d = await res.json();
      setSearchedPatients(d.items || d.patients || []);
    } catch {
      setSearchedPatients([]);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          patientId: form.patientId || undefined,
          encounterId: form.encounterId || undefined,
          facilityId: form.facilityId || undefined,
          fileSize: form.fileSize ? Number(form.fileSize) : undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      qc.invalidateQueries({ queryKey: ["documents"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>Record document metadata. For this demo, the file URL is a text input rather than an actual file upload.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Document Type</Label>
            <Select value={form.documentType} onValueChange={(v) => setForm({ ...form, documentType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.filter((t) => t.value !== "all").map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>File Name</FieldLabel>
            <Input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} placeholder="e.g., Referral_Letter_JohnDoe.pdf" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel required>File URL</FieldLabel>
            <Input value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="https://... or /uploads/..." />
          </div>
          <div className="space-y-1.5">
            <Label>MIME Type</Label>
            <Input value={form.mimeType} onChange={(e) => setForm({ ...form, mimeType: e.target.value })} placeholder="application/pdf" />
          </div>
          <div className="space-y-1.5">
            <Label>File Size (bytes)</Label>
            <Input type="number" value={form.fileSize} onChange={(e) => setForm({ ...form, fileSize: e.target.value })} placeholder="1024" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Patient (optional)</Label>
            <Input value={patientSearch} onChange={(e) => searchPatients(e.target.value)} placeholder="Search patient by name or number..." />
            {searchedPatients.length > 0 && (
              <div className="border rounded mt-1 max-h-40 overflow-y-auto">
                {searchedPatients.slice(0, 8).map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setForm({ ...form, patientId: p.id });
                      setPatientSearch(`${p.firstName} ${p.lastName} (${p.patientNumber})`);
                      setSearchedPatients([]);
                    }}
                    className="w-full text-left p-2 hover:bg-slate-50 text-sm"
                  >
                    {p.firstName} {p.lastName} — {p.patientNumber}
                  </button>
                ))}
              </div>
            )}
            {form.patientId && (
              <Button size="sm" variant="ghost" onClick={() => { setForm({ ...form, patientId: "" }); setPatientSearch(""); }} className="h-7 mt-1 text-xs">
                Clear patient
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.fileName || !form.fileUrl}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            <FolderOpen className="w-4 h-4" /> Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentDetail({ doc, onClose, onDelete, deleting }: { doc: any; onClose: () => void; onDelete?: () => void; deleting: boolean }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            {doc.fileName}
          </DialogTitle>
          <DialogDescription>Document details</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2 text-sm">
          <DetailRow label="Type" value={<span className="capitalize">{(doc.documentType || "other").replace(/_/g, " ")}</span>} />
          <DetailRow label="Visibility" value={<span className="capitalize">{doc.visibility}</span>} />
          <DetailRow label="Patient" value={doc.patient ? `${doc.patient.firstName} ${doc.patient.lastName} (${doc.patient.patientNumber})` : "—"} />
          <DetailRow label="Facility" value={doc.facility?.name || "—"} />
          <DetailRow label="Uploaded By" value={doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName} (@${doc.uploadedBy.username})` : "—"} />
          <DetailRow label="Uploaded At" value={formatDate(doc.uploadedAt, true)} />
          <DetailRow label="MIME Type" value={doc.mimeType || "—"} />
          <DetailRow label="Size" value={doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : "—"} />
          <div className="col-span-2">
            <Label className="text-xs text-slate-500">File URL</Label>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 text-xs bg-slate-100 px-2 py-1.5 rounded truncate">{doc.fileUrl}</code>
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline flex items-center gap-1 text-xs">
                <ExternalLink className="w-3 h-3" /> Open
              </a>
            </div>
          </div>
        </div>

        <DialogFooter>
          {onDelete && (
            <Button variant="destructive" onClick={onDelete} disabled={deleting} className="mr-auto gap-2">
              <X className="w-4 h-4" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <div className="text-sm text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

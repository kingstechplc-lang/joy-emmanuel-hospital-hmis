"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Beaker, Search, Plus, Edit, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, ErrorState, formatCurrency } from "@/components/ui-helpers";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

import { FieldLabel } from "@/components/ui/required-label";
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "haematology", label: "Haematology" },
  { value: "chemistry", label: "Chemistry" },
  { value: "microbiology", label: "Microbiology" },
  { value: "serology", label: "Serology" },
  { value: "endocrinology", label: "Endocrinology" },
  { value: "parasitology", label: "Parasitology" },
  { value: "urinalysis", label: "Urinalysis" },
  { value: "other", label: "Other" },
];

export function LabTestsAdminView() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const can = (p: string) => user?.roles?.includes("super_admin") || perms.includes(p);

  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialogEl } = useConfirmDialog();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (category !== "all") params.set("category", category);
  params.set("status", "all");
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["lab-tests-admin", search, category],
    queryFn: () => fetchJson(`/api/lab-tests${qs}`),
  });

  const items = data?.items || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["lab-tests-admin"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/lab-tests/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Lab test deactivated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Lab Test Catalog</h2>
          <p className="text-sm text-slate-500">Organization-wide laboratory test catalog</p>
        </div>
        {can("settings.manage") && (
          <Button onClick={() => setShowNew(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Add Lab Test
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search tests by name or code" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={category || undefined} onValueChange={setCategory}>
            <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load lab tests" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6"><EmptyState title="No lab tests found" /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Test</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Category</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Specimen</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Unit</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Reference Range</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Price</th>
                    {can("settings.manage") && <th className="text-right p-3 font-semibold text-slate-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((t: any) => (
                    <tr key={t.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Beaker className="w-4 h-4 text-emerald-600" />
                          <div>
                            <div className="font-medium text-slate-900">{t.name}</div>
                            <div className="text-xs text-slate-500"><code>{t.code}</code></div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 capitalize">{t.category || "—"}</td>
                      <td className="p-3 text-slate-700">{t.specimenType || "—"}</td>
                      <td className="p-3 text-slate-700">{t.unit || "—"}</td>
                      <td className="p-3 text-slate-700 text-xs">{t.referenceRange || "—"}</td>
                      <td className="p-3 text-right font-medium text-slate-900">{formatCurrency(t.price)}</td>
                      {can("settings.manage") && (
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(t)} className="h-8 w-8 p-0">
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                confirmAction({
                                  title: `Deactivate lab test "${t.name}"?`,
                                  description: "This will mark the lab test as inactive. Existing lab orders referencing it will be preserved but new orders cannot use it until reactivated.",
                                  confirmText: "Yes, deactivate",
                                  variant: "warning",
                                  details: (
                                    <div>
                                      <div><strong>Test:</strong> {t.name} ({t.code})</div>
                                      <div><strong>Category:</strong> {t.category || "—"}</div>
                                      <div><strong>Price:</strong> {formatCurrency(t.price)}</div>
                                    </div>
                                  ),
                                  onConfirm: () => deleteMutation.mutate(t.id),
                                });
                              }}
                              className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showNew && <LabTestDialog onClose={() => setShowNew(false)} />}
      {editing && <LabTestDialog test={editing} onClose={() => setEditing(null)} />}
      {confirmDialogEl}
    </div>
  );
}

function LabTestDialog({ test, onClose }: { test?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!test;
  const [form, setForm] = useState({
    name: test?.name || "",
    code: test?.code || "",
    category: test?.category || "other",
    specimenType: test?.specimenType || "",
    unit: test?.unit || "",
    referenceRange: test?.referenceRange || "",
    price: test?.price || 0,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/lab-tests/${test.id}` : "/api/lab-tests";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price: Number(form.price) }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(isEdit ? "Lab test updated" : "Lab test created");
      qc.invalidateQueries({ queryKey: ["lab-tests-admin"] });
      qc.invalidateQueries({ queryKey: ["lab-tests"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Lab Test" : "Add Lab Test"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update test details." : "Add a new laboratory test to the catalog."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-2">
          <div className="space-y-1.5">
            <FieldLabel required>Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel required>Code</FieldLabel>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Price</Label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category || undefined} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.filter((c) => c.value !== "all").map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Specimen Type</Label>
              <Input value={form.specimenType} onChange={(e) => setForm({ ...form, specimenType: e.target.value })} placeholder="e.g., Whole blood" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="e.g., mg/dL" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reference Range</Label>
            <Input value={form.referenceRange} onChange={(e) => setForm({ ...form, referenceRange: e.target.value })} placeholder="e.g., 70-110 mg/dL" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name || !form.code} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Save className="w-4 h-4" />
            {isEdit ? "Save Changes" : "Create Lab Test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

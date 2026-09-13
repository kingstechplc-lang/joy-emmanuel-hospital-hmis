"use client";

// =====================================================================
// ApplyTemplateDialog — Phase 8
// =====================================================================
// Dialog that lets a clinician browse active clinical templates,
// preview what the template would create, modify the proposed items,
// and confirm to create the actual orders.
//
// Workflow:
//   1. Open dialog → fetch active templates
//   2. Select a template → call /apply to preview
//   3. Review proposed items (lab, imaging, Rx, procedures)
//   4. Toggle items on/off, edit details
//   5. Click "Apply" → call /apply/confirm → creates orders
//   6. Show success summary
//
// Props:
//   open / onOpenChange — dialog open state
//   encounterId, patientId — the encounter context
//   onApplied — callback after successful application (refresh data)
// =====================================================================

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Stethoscope, Plus, Search, RefreshCcw, Eye, AlertCircle,
  CheckCircle2, FlaskConical, ScanLine, Pill, Sparkles, Activity,
  FileText, GitBranch, Heart, X, Loader2, ChevronRight,
  AlertTriangle, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { safeJson } from "@/components/ui-helpers";
import { GradientDialogHeader } from "@/components/ui/gradient-dialog-header";
import { getDialogContentClasses, DIALOG_BODY_SHELL } from "@/lib/ui/dialog-sizes";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { WIDGET_BY_ID } from "@/lib/dashboard/widget-registry";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

async function sendJson(url: string, method: string, body?: any) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

const TYPE_META: Record<string, { icon: any; gradient: string }> = {
  consultation: { icon: FileText, gradient: "from-blue-500 to-indigo-600" },
  order_set: { icon: GitBranch, gradient: "from-purple-500 to-violet-600" },
  lab: { icon: FlaskConical, gradient: "from-cyan-500 to-blue-600" },
  imaging: { icon: ScanLine, gradient: "from-violet-500 to-purple-600" },
  medication: { icon: Pill, gradient: "from-emerald-500 to-teal-600" },
  procedure: { icon: Sparkles, gradient: "from-amber-500 to-orange-600" },
  care: { icon: Heart, gradient: "from-rose-500 to-pink-600" },
};

export function ApplyTemplateDialog({
  open, onOpenChange, encounterId, patientId, onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: string;
  patientId: string;
  onApplied?: () => void;
}) {
  const [step, setStep] = useState<"browse" | "preview" | "result">("browse");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [modifiedItems, setModifiedItems] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  // ── Browse: list active templates ─────────────────────────────────
  const params = new URLSearchParams({ status: "active" });
  if (search) params.set("search", search);
  if (typeFilter !== "all") params.set("type", typeFilter);

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["clinical-templates-apply", params.toString()],
    queryFn: () => fetchJson(`/api/clinical-templates?${params.toString()}`),
    enabled: open && step === "browse",
    staleTime: 0,
  });

  // ── Preview mutation ──────────────────────────────────────────────
  const previewMut = useMutation({
    mutationFn: (templateId: string) =>
      sendJson(`/api/clinical-templates/${templateId}/apply`, "POST", { encounterId, patientId }),
    onSuccess: (data) => {
      setPreviewData(data);
      // Initialize modified items from preview (all items selected by default)
      setModifiedItems({
        labOrders: (data.proposedItems.labOrders || []).map((o: any) => ({ ...o, skip: false })),
        imagingOrders: (data.proposedItems.imagingOrders || []).map((o: any) => ({ ...o, skip: false })),
        prescriptions: (data.proposedItems.prescriptions || []).map((o: any) => ({ ...o, skip: false })),
        procedures: (data.proposedItems.procedures || []).map((o: any) => ({ ...o, skip: false })),
      });
      setStep("preview");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Confirm mutation ─────────────────────────────────────────────
  const confirmMut = useMutation({
    mutationFn: () => {
      if (!selectedTemplate || !previewData) throw new Error("No template selected");
      const wasModified = JSON.stringify(modifiedItems) !== JSON.stringify({
        labOrders: (previewData.proposedItems.labOrders || []).map((o: any) => ({ ...o, skip: false })),
        imagingOrders: (previewData.proposedItems.imagingOrders || []).map((o: any) => ({ ...o, skip: false })),
        prescriptions: (previewData.proposedItems.prescriptions || []).map((o: any) => ({ ...o, skip: false })),
        procedures: (previewData.proposedItems.procedures || []).map((o: any) => ({ ...o, skip: false })),
      });
      return sendJson(`/api/clinical-templates/${selectedTemplate.id}/apply/confirm`, "POST", {
        encounterId, patientId,
        versionId: previewData.template.versionId,
        modified: wasModified,
        items: modifiedItems,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("result");
      toast.success(`Template applied: ${data.created.labOrders || 0} lab, ${data.created.prescriptions || 0} Rx, ${data.created.imagingOrders || 0} imaging, ${data.created.procedures || 0} procedures`);
      if (onApplied) onApplied();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = () => {
    setStep("browse");
    setSelectedTemplate(null);
    setPreviewData(null);
    setModifiedItems(null);
    setResult(null);
    setSearch("");
    setTypeFilter("all");
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(reset, 300); // reset after dialog closes
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={getDialogContentClasses("xl", DIALOG_BODY_SHELL)} showCloseButton={false}>
        <GradientDialogHeader
          icon={Stethoscope}
          title="Apply Clinical Template"
          description="Select a template to pre-fill orders — review and confirm before creating"
          gradient="purple"
          onClose={handleClose}
        />

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {step === "browse" && (
            <BrowseStep
              templates={templatesData?.items || []}
              isLoading={templatesLoading}
              search={search}
              setSearch={setSearch}
              typeFilter={typeFilter}
              setTypeFilter={setTypeFilter}
              onSelect={(t) => {
                setSelectedTemplate(t);
                previewMut.mutate(t.id);
              }}
              previewLoading={previewMut.isPending}
            />
          )}

          {step === "preview" && previewData && (
            <PreviewStep
              template={selectedTemplate}
              preview={previewData}
              modifiedItems={modifiedItems}
              setModifiedItems={setModifiedItems}
            />
          )}

          {step === "result" && result && (
            <ResultStep result={result} template={selectedTemplate} />
          )}
        </div>

        <DialogFooter className="border-t pt-3 px-5">
          {step === "browse" && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("browse")}>
                Back
              </Button>
              <Button
                onClick={() => confirmMut.mutate()}
                disabled={confirmMut.isPending || !modifiedItems}
                className="gap-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white"
              >
                {confirmMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Apply Template
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={handleClose} className="gap-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
              <CheckCircle2 className="w-4 h-4" /> Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Browse Step ─────────────────────────────────────────────────────

function BrowseStep({
  templates, isLoading, search, setSearch, typeFilter, setTypeFilter, onSelect, previewLoading,
}: {
  templates: any[];
  isLoading: boolean;
  search: string;
  setSearch: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  onSelect: (t: any) => void;
  previewLoading: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-md border border-slate-200 px-2 text-sm"
        >
          <option value="all">All Types</option>
          <option value="consultation">Consultation</option>
          <option value="order_set">Order Set</option>
          <option value="lab">Lab</option>
          <option value="imaging">Imaging</option>
          <option value="medication">Medication</option>
          <option value="procedure">Procedure</option>
          <option value="care">Care</option>
        </select>
      </div>

      {/* Template list */}
      {isLoading ? (
        <div className="py-8 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" />
          <p className="text-sm text-slate-500 mt-2">Loading templates...</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="py-8 text-center">
          <Stethoscope className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No active templates found</p>
          <p className="text-xs text-slate-500 mt-1">Create and activate templates in the Clinical Templates admin.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {templates.map((t) => {
            const meta = TYPE_META[t.templateType] || TYPE_META.order_set;
            const Icon = meta.icon;
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t)}
                disabled={previewLoading}
                className="text-left p-3 rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50/30 transition group disabled:opacity-50"
              >
                <div className="flex items-start gap-2">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${meta.gradient} flex items-center justify-center shrink-0`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-purple-700 truncate">{t.name}</p>
                    {t.description && <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{t.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="outline" className="text-[10px]">{t.templateType.replace(/_/g, " ")}</Badge>
                      {t.category && <Badge variant="outline" className="text-[10px] capitalize">{t.category.replace(/_/g, " ")}</Badge>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}
      {previewLoading && (
        <div className="py-4 text-center">
          <Loader2 className="w-5 h-5 mx-auto animate-spin text-purple-500" />
          <p className="text-xs text-slate-500 mt-1">Loading preview...</p>
        </div>
      )}
    </div>
  );
}

// ─── Preview Step ────────────────────────────────────────────────────

function PreviewStep({
  template, preview, modifiedItems, setModifiedItems,
}: {
  template: any;
  preview: any;
  modifiedItems: any;
  setModifiedItems: any;
}) {
  const toggleSkip = (category: string, index: number) => {
    const updated = { ...modifiedItems };
    updated[category][index].skip = !updated[category][index].skip;
    setModifiedItems(updated);
  };

  const totalItems = (modifiedItems?.labOrders?.length || 0) + (modifiedItems?.imagingOrders?.length || 0) + (modifiedItems?.prescriptions?.length || 0) + (modifiedItems?.procedures?.length || 0);
  const skippedItems = [
    ...(modifiedItems?.labOrders || []),
    ...(modifiedItems?.imagingOrders || []),
    ...(modifiedItems?.prescriptions || []),
    ...(modifiedItems?.procedures || []),
  ].filter((o: any) => o.skip).length;

  return (
    <div className="space-y-4">
      {/* Template header */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-50/50 border border-purple-200">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${TYPE_META[template?.templateType]?.gradient || "from-purple-500 to-indigo-600"} flex items-center justify-center`}>
          {(() => { const Icon = TYPE_META[template?.templateType]?.icon || GitBranch; return <Icon className="w-5 h-5 text-white" />; })()}
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{template?.name}</p>
          <p className="text-xs text-slate-500">v{preview.template.versionNumber} · {template?.templateType.replace(/_/g, " ")}</p>
        </div>
      </div>

      {/* Duplicate warnings */}
      {preview.duplicateWarnings?.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Duplicate Warnings
          </p>
          {preview.duplicateWarnings.map((w: string, i: number) => (
            <p key={i} className="text-xs text-amber-600 ml-5">• {w}</p>
          ))}
        </div>
      )}

      {/* Proposed items */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">
          Proposed Items ({totalItems} total, {skippedItems} skipped)
        </p>

        {/* Lab Orders */}
        {modifiedItems?.labOrders?.length > 0 && (
          <ItemSection
            title="Lab Orders"
            icon={FlaskConical}
            iconColor="text-cyan-600"
            items={modifiedItems.labOrders}
            onToggle={(i) => toggleSkip("labOrders", i)}
            renderRow={(item) => (
              <>
                <span className="text-sm font-medium">{item.testName}</span>
                <Badge variant="outline" className="text-[10px] ml-1">{item.priority}</Badge>
                {item.duplicate && <Badge variant="destructive" className="text-[10px] ml-1">Duplicate</Badge>}
              </>
            )}
          />
        )}

        {/* Imaging Orders */}
        {modifiedItems?.imagingOrders?.length > 0 && (
          <ItemSection
            title="Imaging Orders"
            icon={ScanLine}
            iconColor="text-violet-600"
            items={modifiedItems.imagingOrders}
            onToggle={(i) => toggleSkip("imagingOrders", i)}
            renderRow={(item) => (
              <>
                <span className="text-sm font-medium">{item.procedureName}</span>
                <Badge variant="outline" className="text-[10px] ml-1">{item.priority}</Badge>
              </>
            )}
          />
        )}

        {/* Prescriptions */}
        {modifiedItems?.prescriptions?.length > 0 && (
          <ItemSection
            title="Prescriptions"
            icon={Pill}
            iconColor="text-emerald-600"
            items={modifiedItems.prescriptions}
            onToggle={(i) => toggleSkip("prescriptions", i)}
            renderRow={(item) => (
              <div className="flex-1">
                <span className="text-sm font-medium">{item.medicationName}</span>
                <span className="text-xs text-slate-500 ml-2">{item.dosage} · {item.frequency} · {item.duration || ""}</span>
              </div>
            )}
          />
        )}

        {/* Procedures */}
        {modifiedItems?.procedures?.length > 0 && (
          <ItemSection
            title="Procedures"
            icon={Sparkles}
            iconColor="text-amber-600"
            items={modifiedItems.procedures}
            onToggle={(i) => toggleSkip("procedures", i)}
            renderRow={(item) => (
              <>
                <span className="text-sm font-medium">{item.procedureName}</span>
                <Badge variant="outline" className="text-[10px] ml-1">{item.priority}</Badge>
              </>
            )}
          />
        )}

        {/* Instructions */}
        {preview.proposedItems.instructions && (
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/30">
            <p className="text-xs font-semibold text-slate-600 mb-1">Patient Instructions</p>
            <p className="text-sm text-slate-700">{preview.proposedItems.instructions}</p>
          </div>
        )}

        {/* Consultation fields (for consultation templates) */}
        {preview.consultationFields && (
          <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/30">
            <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> Consultation Pre-fill
            </p>
            <div className="space-y-1 text-xs text-slate-600">
              {preview.consultationFields.chiefComplaint && <p><strong>Chief Complaint:</strong> {preview.consultationFields.chiefComplaint}</p>}
              {preview.consultationFields.assessment && <p><strong>Assessment:</strong> {preview.consultationFields.assessment.slice(0, 100)}...</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Item Section ───────────────────────────────────────────────────

function ItemSection({
  title, icon: Icon, iconColor, items, onToggle, renderRow,
}: {
  title: string;
  icon: any;
  iconColor: string;
  items: any[];
  onToggle: (index: number) => void;
  renderRow: (item: any) => React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} /> {title} ({items.filter((i: any) => !i.skip).length}/{items.length})
      </p>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 p-2.5 rounded-lg border transition ${
              item.skip
                ? "border-slate-100 bg-slate-50/50 opacity-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <Checkbox
              checked={!item.skip}
              onCheckedChange={() => onToggle(i)}
            />
            {renderRow(item)}
            {item.skip && (
              <Badge variant="outline" className="text-[10px] text-slate-400">Skipped</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Result Step ────────────────────────────────────────────────────

function ResultStep({ result, template }: { result: any; template: any }) {
  const total = (result.created.labOrders || 0) + (result.created.imagingOrders || 0) + (result.created.prescriptions || 0) + (result.created.procedures || 0);

  return (
    <div className="space-y-4 py-4">
      {/* Success banner */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Template Applied Successfully</h3>
        <p className="text-sm text-slate-500 mt-1">
          "{template?.name}" — {total} order{total !== 1 ? "s" : ""} created
        </p>
      </div>

      {/* Created summary */}
      <div className="grid grid-cols-2 gap-3">
        {result.created.labOrders > 0 && (
          <div className="p-3 rounded-lg border border-cyan-200 bg-cyan-50/30">
            <FlaskConical className="w-5 h-5 text-cyan-600 mb-1" />
            <p className="text-lg font-bold text-slate-900">{result.created.labOrders}</p>
            <p className="text-xs text-slate-500">Lab Orders</p>
          </div>
        )}
        {result.created.prescriptions > 0 && (
          <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/30">
            <Pill className="w-5 h-5 text-emerald-600 mb-1" />
            <p className="text-lg font-bold text-slate-900">{result.created.prescriptions}</p>
            <p className="text-xs text-slate-500">Prescriptions</p>
          </div>
        )}
        {result.created.imagingOrders > 0 && (
          <div className="p-3 rounded-lg border border-violet-200 bg-violet-50/30">
            <ScanLine className="w-5 h-5 text-violet-600 mb-1" />
            <p className="text-lg font-bold text-slate-900">{result.created.imagingOrders}</p>
            <p className="text-xs text-slate-500">Imaging Orders</p>
          </div>
        )}
        {result.created.procedures > 0 && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/30">
            <Sparkles className="w-5 h-5 text-amber-600 mb-1" />
            <p className="text-lg font-bold text-slate-900">{result.created.procedures}</p>
            <p className="text-xs text-slate-500">Procedures</p>
          </div>
        )}
      </div>

      {/* Errors */}
      {result.errors?.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 space-y-1">
          <p className="text-xs font-semibold text-rose-700 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> Some items failed
          </p>
          {result.errors.map((e: string, i: number) => (
            <p key={i} className="text-xs text-rose-600 ml-5">• {e}</p>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500 text-center">
        Orders have been created through the existing clinical workflows.
        Navigate to Lab Orders, Pharmacy, or Imaging to review them.
      </p>
    </div>
  );
}

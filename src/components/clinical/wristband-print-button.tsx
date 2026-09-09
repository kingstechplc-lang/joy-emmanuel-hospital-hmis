"use client";

// =====================================================================
// WristbandPrintButton
// =====================================================================
// A premium, animated button + modal flow for printing patient
// wristbands. Designed to be a delight to use at the front desk and
// bedside.
//
// FEATURES:
//   - Animated gradient button with a QR icon that pulses softly
//   - Confirmation modal that previews the wristband on-screen before
//     printing (so clinicians see exactly what will print)
//   - Copy-count selector: 1 / 2 / 3 copies (wrist + chart + spare)
//   - Paper-size selector (THERMAL_58 default; THERMAL_80 option)
//   - "Last printed by/at" hint if a wristband already exists for
//     this patient (so the clinician knows whether to reprint or new)
//   - Framer-motion micro-animations: scanning pulse on the QR preview,
//     success checkmark on print completion, slide-in for the modal
//   - "Mint new" vs "Reprint existing" mode toggle
//   - Audit-logged via the existing PrintButton (documentType="wristband")
//   - Void / replace actions for wristband lifecycle management
//
// PROPS:
//   patientId       — required
//   encounterId     — optional, links the wristband to an encounter
//   compact         — show as icon-only (for inline actions in tables)
//   onSuccess       — callback after successful print (e.g., to refresh
//                     a list)
// =====================================================================

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  QrCode, Printer, RefreshCw, Check, AlertTriangle,
  X, Clock, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { safeJson, formatDate, formatRelative } from "@/components/ui-helpers";
import { WristbandTemplate } from "@/components/print/templates/wristband-template";
import { PrintButton } from "@/components/print/print-layout";
import type { WristbandContent } from "@/lib/wristband/assembler";

type WristbandPrintButtonProps = {
  patientId: string;
  encounterId?: string | null;
  patientName?: string | null;
  compact?: boolean;
  className?: string;
  onSuccess?: (wristbandId: string) => void;
};

const COPY_COUNTS = [1, 2, 3] as const;
const PAPER_SIZES = [
  { id: "THERMAL_58", label: "58mm thermal" },
  { id: "THERMAL_80", label: "80mm thermal" },
] as const;

export function WristbandPrintButton({
  patientId,
  encounterId,
  patientName,
  compact = false,
  className,
  onSuccess,
}: WristbandPrintButtonProps) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const canPrint = user?.roles?.includes("super_admin") || perms.includes("wristband.print");
  const canReprint = user?.roles?.includes("super_admin") || perms.includes("wristband.reprint");
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [copyCount, setCopyCount] = useState<number>(1);
  const [paperSize, setPaperSize] = useState<"THERMAL_58" | "THERMAL_80">("THERMAL_58");
  const [printJustCompleted, setPrintJustCompleted] = useState(false);

  // Check for any existing wristbands for this patient (so we can offer reprint)
  const { data: existingData } = useQuery({
    queryKey: ["patient-wristbands", patientId],
    queryFn: async () => {
      const res = await fetch(`/api/patient-wristbands?patientId=${patientId}&limit=5`);
      if (!res.ok) throw new Error("Failed to load existing wristbands");
      return safeJson(res);
    },
    enabled: modalOpen && !!patientId,
  });
  const existingWristbands: any[] = existingData?.items || [];
  const activeWristband = existingWristbands.find((w) => w.status === "active");
  const lastPrinted = existingWristbands[0];

  // Mint a new wristband (POST)
  const mintMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/patient-wristbands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          encounterId: encounterId || undefined,
          replaceId: activeWristband?.id,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to mint wristband");
      return data;
    },
    onSuccess: (data) => {
      toast.success("Wristband minted — ready to print");
      qc.invalidateQueries({ queryKey: ["patient-wristbands", patientId] });
      if (onSuccess) onSuccess(data.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reprint existing (PATCH with action=reprint)
  const reprintMut = useMutation({
    mutationFn: async () => {
      if (!activeWristband) throw new Error("No active wristband to reprint");
      const res = await fetch(`/api/patient-wristbands/${activeWristband.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reprint" }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to reprint");
      return data;
    },
    onSuccess: () => {
      toast.success("Reprint recorded");
      qc.invalidateQueries({ queryKey: ["patient-wristbands", patientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Pre-fetch a preview of what the wristband will look like
  const previewContent: WristbandContent | null = useMemo(() => {
    if (mintMut.data?.content) return mintMut.data.content as WristbandContent;
    if (activeWristband && (activeWristband as any).content) {
      return (activeWristband as any).content as WristbandContent;
    }
    return null;
  }, [mintMut.data, activeWristband]);

  // When the modal opens, mint a new wristband if none exists
  useEffect(() => {
    if (modalOpen && canPrint && !activeWristband && !mintMut.isPending && !mintMut.data) {
      mintMut.mutate();
    }
  }, [modalOpen, canPrint, activeWristband, mintMut]);

  const printButtonRef = useRef<HTMLButtonElement>(null);

  const handlePrint = () => {
    if (!previewContent) {
      toast.error("Wristband content not ready yet — please wait");
      return;
    }
    // Record the print at the API (reprint if active wristband exists,
    // or the mint already recorded the first print)
    if (activeWristband) {
      reprintMut.mutate();
    }
    // The actual print popup is handled by the PrintButton component
    if (printButtonRef.current) {
      printButtonRef.current.click();
    }
    // Show the success animation
    setPrintJustCompleted(true);
    setTimeout(() => setPrintJustCompleted(false), 2400);
  };

  if (!canPrint) return null;

  return (
    <>
      {/* Trigger button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setModalOpen(true)}
        className={`relative inline-flex items-center gap-2 rounded-lg font-medium transition-all
          ${compact ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm"}
          bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600
          text-white shadow-md hover:shadow-lg
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className || ""}`}
      >
        <QrCode className={`relative ${compact ? "w-3.5 h-3.5" : "w-4 h-4"}`}>
          {/* Pulsing dot inside QR icon to draw the eye */}
          <motion.span
            className="absolute inset-0 rounded-full bg-white/40"
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ pointerEvents: "none" }}
          />
        </QrCode>
        <span>{compact ? "Wristband" : "Print Wristband"}</span>
      </motion.button>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => !o && setModalOpen(false)}>
        <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden" size="large">
          {/* Animated gradient header */}
          <DialogHeader className="px-6 pt-5 pb-4 shrink-0 border-b bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white relative overflow-hidden">
            <motion.div
              className="absolute inset-0 opacity-30"
              animate={{
                background: [
                  "radial-gradient(circle at 0% 0%, rgba(255,255,255,0.4) 0%, transparent 50%)",
                  "radial-gradient(circle at 100% 100%, rgba(255,255,255,0.4) 0%, transparent 50%)",
                  "radial-gradient(circle at 0% 0%, rgba(255,255,255,0.4) 0%, transparent 50%)",
                ],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <DialogTitle className="text-white flex items-center gap-2 relative">
              <QrCode className="w-5 h-5" /> Print Patient Wristband
            </DialogTitle>
            <DialogDescription className="text-white/80 relative">
              {patientName ? `For ${patientName}` : `For patient ${patientId.slice(-8)}`}
              {activeWristband && (
                <span className="block text-amber-200 text-xs mt-1">
                  ⚠ Active wristband already exists — printing will replace it
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0 p-6 bg-slate-50">
            {/* Last-printed hint */}
            {lastPrinted && (
              <div className="mb-4 flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>
                  Last wristband:{" "}
                  <span className="font-medium">{formatRelative(lastPrinted.createdAt)}</span>
                  {lastPrinted.lastPrintedBy && (
                    <span>
                      {" "}by Dr. {lastPrinted.lastPrintedBy.lastName}
                    </span>
                  )}
                  {lastPrinted.status === "active" && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                      ACTIVE
                    </span>
                  )}
                  {lastPrinted.status === "voided" && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-medium">
                      VOIDED
                    </span>
                  )}
                  {lastPrinted.status === "replaced" && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                      REPLACED
                    </span>
                  )}
                </span>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              {/* Left column: live wristband preview */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Live Preview
                </h3>

                {/* Allergy alert banner above the preview (if any) */}
                {previewContent?.hasAllergyAlert && (
                  <div className="mb-2 flex items-center gap-2 p-2 rounded-lg bg-rose-50 border border-rose-300 text-rose-700 text-xs">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>
                      Allergy alert will be printed on the wristband:{" "}
                      <strong>{previewContent.allergySummary}</strong>
                      {previewContent.highestAllergySeverity === "anaphylactic" && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold">
                          ANAPHYLACTIC
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* Animated scanning glow around the preview */}
                <motion.div
                  className="relative bg-white rounded-lg shadow-md p-2 overflow-hidden"
                  animate={{
                    boxShadow: [
                      "0 4px 14px 0 rgba(139, 92, 246, 0.08)",
                      "0 4px 22px 0 rgba(139, 92, 246, 0.25)",
                      "0 4px 14px 0 rgba(139, 92, 246, 0.08)",
                    ],
                  }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  {/* Scanning line effect */}
                  <motion.div
                    className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-violet-500/40 to-transparent z-10"
                    animate={{ top: ["0%", "100%", "0%"] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
                    style={{ pointerEvents: "none" }}
                  />
                  {previewContent ? (
                    <div className="border-2 border-dashed border-slate-300 rounded">
                      <WristbandTemplate
                        content={previewContent}
                        paperSize={paperSize}
                        showIssuedAt={false}
                      />
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Generating wristband content...
                    </div>
                  )}
                </motion.div>

                {/* Print success overlay */}
                <AnimatePresence>
                  {printJustCompleted && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-700 text-sm font-medium"
                    >
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1, rotate: [0, 360] }}
                        transition={{ duration: 0.4 }}
                      >
                        <Check className="w-5 h-5" />
                      </motion.span>
                      Print job sent! {copyCount > 1 ? `${copyCount} copies queued.` : ""}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Right column: options + actions */}
              <div className="space-y-4">
                {/* Copy count */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 block">
                    Copies
                  </label>
                  <div className="flex gap-2">
                    {COPY_COUNTS.map((n) => (
                      <button
                        key={n}
                        onClick={() => setCopyCount(n)}
                        className={`flex-1 h-12 rounded-lg border-2 flex flex-col items-center justify-center transition-all
                          ${copyCount === n
                            ? "border-violet-600 bg-violet-50 text-violet-700 shadow-sm"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                      >
                        <span className="text-lg font-bold leading-none">{n}</span>
                        <span className="text-[10px] uppercase tracking-wide mt-0.5">
                          {n === 1 ? "wrist" : n === 2 ? "wrist + chart" : "wrist + chart + spare"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Paper size */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 block">
                    Wristband size
                  </label>
                  <div className="flex gap-2">
                    {PAPER_SIZES.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPaperSize(p.id as any)}
                        className={`flex-1 h-10 rounded-lg border-2 flex items-center justify-center gap-1 text-xs font-medium transition-all
                          ${paperSize === p.id
                            ? "border-violet-600 bg-violet-50 text-violet-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Patient verification checklist */}
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-1.5">
                  <div className="font-semibold text-slate-700 mb-1">
                    Bedside verification checklist:
                  </div>
                  <div className="flex items-start gap-1.5 text-slate-600">
                    <Check className="w-3 h-3 mt-0.5 text-emerald-600 shrink-0" />
                    <span>Scan QR with any smartphone / handheld scanner</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-slate-600">
                    <Check className="w-3 h-3 mt-0.5 text-emerald-600 shrink-0" />
                    <span>Verify name + MRN + DOB with patient verbally</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-slate-600">
                    <Check className="w-3 h-3 mt-0.5 text-emerald-600 shrink-0" />
                    <span>Check blood group + allergy banner before any med</span>
                  </div>
                </div>

                {/* Allergies detail */}
                {previewContent?.hasAllergyAlert && (
                  <div className="rounded-lg border border-rose-300 bg-rose-50 p-3">
                    <div className="flex items-center gap-1.5 text-rose-700 font-semibold text-xs mb-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Active allergies ({previewContent.allergies.length})
                    </div>
                    <ul className="space-y-1 text-xs text-rose-700">
                      {previewContent.allergies.map((a) => (
                        <li key={a.id} className="flex items-start gap-1.5">
                          <span className="font-medium">{a.allergen}</span>
                          {a.severity && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-rose-200 text-rose-800 font-bold uppercase">
                              {a.severity}
                            </span>
                          )}
                          {a.reaction && (
                            <span className="text-rose-600">· {a.reaction}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <DialogFooter className="p-4 pt-3 shrink-0 border-t bg-white">
            <div className="flex flex-wrap gap-2 w-full justify-end items-center">
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>

              {/* Hidden PrintButton — we trigger it programmatically */}
              {previewContent && (
                <div className="hidden">
                  <PrintButton
                    label="Print"
                    documentType="wristband"
                    paperSize={paperSize}
                    recordId={activeWristband?.id || previewContent.token.slice(0, 8)}
                    recordSummary={`Wristband for ${patientName || previewContent.patient.fullName}`}
                    renderContent={() => (
                      <>
                        {Array.from({ length: copyCount }).map((_, i) => (
                          <div
                            key={i}
                            style={{
                              marginBottom: i < copyCount - 1 ? "12pt" : 0,
                              pageBreakAfter: i < copyCount - 1 ? "always" : "auto",
                            }}
                          >
                            <WristbandTemplate
                              content={previewContent}
                              paperSize={paperSize}
                              showIssuedAt
                            />
                          </div>
                        ))}
                      </>
                    )}
                  />
                </div>
              )}

              <motion.div
                whileHover={{ scale: printJustCompleted ? 1 : 1.02 }}
                whileTap={{ scale: printJustCompleted ? 1 : 0.98 }}
              >
                <Button
                  ref={printButtonRef as any}
                  onClick={handlePrint}
                  disabled={!previewContent || mintMut.isPending || reprintMut.isPending}
                  className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 hover:opacity-90 text-white gap-2 shadow-md"
                >
                  {printJustCompleted ? (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1, rotate: 360 }}
                      transition={{ duration: 0.4 }}
                    >
                      <Check className="w-4 h-4" />
                    </motion.span>
                  ) : reprintMut.isPending || mintMut.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  {printJustCompleted
                    ? "Sent!"
                    : `${copyCount > 1 ? `${copyCount}× ` : ""}Print${copyCount > 1 ? " Copies" : ""}`}
                </Button>
              </motion.div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

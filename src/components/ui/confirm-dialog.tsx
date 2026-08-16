"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Trash2, XCircle, AlertOctagon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfirmVariant = "destructive" | "warning" | "danger" | "info";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  /** Additional context to show in a highlighted box (e.g., patient name, item name) */
  details?: React.ReactNode;
  /** Requires the user to type this exact text to confirm (for very destructive actions) */
  requireTextToMatch?: string;
  onConfirm?: () => void | Promise<void>;
}

const variantConfig: Record<
  ConfirmVariant,
  { icon: any; iconBg: string; iconColor: string; buttonClass: string; ring: string }
> = {
  destructive: {
    icon: Trash2,
    iconBg: "bg-rose-50",
    iconColor: "text-rose-600",
    buttonClass: "bg-rose-600 hover:bg-rose-700 text-white",
    ring: "ring-rose-200",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    buttonClass: "bg-amber-600 hover:bg-amber-700 text-white",
    ring: "ring-amber-200",
  },
  danger: {
    icon: AlertOctagon,
    iconBg: "bg-red-50",
    iconColor: "text-red-700",
    buttonClass: "bg-red-700 hover:bg-red-800 text-white",
    ring: "ring-red-200",
  },
  info: {
    icon: XCircle,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    buttonClass: "bg-blue-600 hover:bg-blue-700 text-white",
    ring: "ring-blue-200",
  },
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "destructive",
  details,
  requireTextToMatch,
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [matchInput, setMatchInput] = React.useState("");
  const cfg = variantConfig[variant];
  const Icon = cfg.icon;

  const canConfirm = !requireTextToMatch || matchInput === requireTextToMatch;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setLoading(true);
    try {
      if (onConfirm) await onConfirm();
      onOpenChange(false);
    } catch (e) {
      console.error("ConfirmDialog error:", e);
    } finally {
      setLoading(false);
      setMatchInput("");
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!loading) {
          setMatchInput("");
          onOpenChange(o);
        }
      }}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ring-1",
                cfg.iconBg,
                cfg.ring
              )}
            >
              <Icon className={cn("w-6 h-6", cfg.iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
              <AlertDialogTitle className="text-lg font-semibold text-slate-900 pr-6">
                {title}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-slate-600 mt-1 leading-relaxed">
                {description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {details && (
          <div className="my-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
            {details}
          </div>
        )}

        {requireTextToMatch && (
          <div className="my-2 space-y-1.5">
            <p className="text-xs text-slate-600">
              Type <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-900 font-semibold">{requireTextToMatch}</code> to confirm:
            </p>
            <input
              type="text"
              value={matchInput}
              onChange={(e) => setMatchInput(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
              autoFocus
              autoComplete="off"
            />
          </div>
        )}

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={loading} className="mt-0">
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={loading || !canConfirm}
            className={cn(cfg.buttonClass, "disabled:opacity-50 disabled:cursor-not-allowed")}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {loading ? "Working..." : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Convenience hook for using the dialog
export function useConfirmDialog() {
  const [state, setState] = React.useState<{
    open: boolean;
    title: string;
    description: string;
    confirmText?: string;
    variant?: ConfirmVariant;
    details?: React.ReactNode;
    requireTextToMatch?: string;
    onConfirm?: () => void | Promise<void>;
  }>({ open: false, title: "", description: "" });

  const confirm = React.useCallback(
    (opts: Omit<ConfirmDialogProps, "open" | "onOpenChange">) => {
      setState({ ...opts, open: true });
    },
    []
  );

  const dialog = (
    <ConfirmDialog
      {...state}
      onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}
    />
  );

  return { confirm, dialog };
}

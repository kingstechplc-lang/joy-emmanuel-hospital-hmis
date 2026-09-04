"use client";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// =====================================================================
// GradientDialogHeader — a reusable colorful dialog header component.
// Provides a gradient background, white text, icon, title, description,
// and an optional close button — matching the Encounter Detail Dialog
// pattern that the user likes.
//
// Usage:
//   <GradientDialogHeader
//     icon={Activity}
//     title="New Encounter"
//     description="Create a new clinical encounter"
//     gradient="from-blue-600 to-indigo-700"
//   >
//     <StatusBadge status="open" />
//   </GradientDialogHeader>
//
// Predefined gradient presets (matching each module's color):
//   blue: from-blue-600 to-indigo-700     (Clinical/Encounters)
//   purple: from-purple-600 to-violet-700 (Lab)
//   cyan: from-cyan-600 to-blue-700       (Lab Results)
//   emerald: from-emerald-600 to-teal-700  (Pharmacy/Success)
//   amber: from-amber-500 to-orange-600    (Triage/Warning)
//   rose: from-rose-600 to-pink-700        (Emergency/Danger)
//   slate: from-slate-700 to-slate-800     (Neutral/Default)
//   indigo: from-indigo-600 to-purple-700 (Insurance)
//   teal: from-teal-600 to-cyan-700       (Procedures)
//   violet: from-violet-600 to-purple-700 (Imaging)
// =====================================================================

const GRADIENT_PRESETS: Record<string, string> = {
  blue: "from-blue-600 to-indigo-700",
  purple: "from-purple-600 to-violet-700",
  cyan: "from-cyan-600 to-blue-700",
  emerald: "from-emerald-600 to-teal-700",
  amber: "from-amber-500 to-orange-600",
  rose: "from-rose-600 to-pink-700",
  slate: "from-slate-700 to-slate-800",
  indigo: "from-indigo-600 to-purple-700",
  teal: "from-teal-600 to-cyan-700",
  violet: "from-violet-600 to-purple-700",
};

export function GradientDialogHeader({
  icon: Icon,
  title,
  description,
  gradient = "blue",
  children,
  onClose,
  className,
}: {
  icon?: any;
  title: ReactNode;
  description?: ReactNode;
  gradient?: string;
  children?: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const gradientClass = GRADIENT_PRESETS[gradient] || GRADIENT_PRESETS.blue;

  return (
    <DialogHeader
      className={cn(
        "px-6 pt-5 pb-3 shrink-0 border-b bg-gradient-to-r text-white relative",
        gradientClass,
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <DialogTitle className="flex items-center gap-2 text-white">
            {Icon && <Icon className="w-5 h-5 shrink-0" />}
            {title}
            {children}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-white/80 mt-1">
              {description}
            </DialogDescription>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg border border-white/30 hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        )}
      </div>
    </DialogHeader>
  );
}

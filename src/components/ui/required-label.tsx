"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * RequiredLabel — a Label with a red asterisk (*) indicating a required field.
 *
 * Usage:
 *   <RequiredLabel htmlFor="firstName">First Name</RequiredLabel>
 *
 * Renders as:
 *   <label>First Name <span class="text-rose-500">*</span></label>
 *
 * The asterisk is automatically red (rose-500) — it's a hospital/medical
 * convention that required fields are visually distinct.
 *
 * Optional `className` and other props pass through to the underlying <label>.
 */
interface RequiredLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
  /** Hide the asterisk (e.g., for accessibility-required-but-not-shown fields). Default: false */
  hideAsterisk?: boolean;
}

export function RequiredLabel({
  children,
  hideAsterisk = false,
  className,
  ...props
}: RequiredLabelProps) {
  return (
    <label
      className={cn(
        "flex items-center gap-1.5 text-sm leading-none font-medium select-none text-slate-700",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {!hideAsterisk && (
        <span className="text-rose-500 font-bold" aria-hidden="true">
          *
        </span>
      )}
      {(props as any).required !== undefined && !hideAsterisk && (
        <span className="sr-only">(required)</span>
      )}
    </label>
  );
}

/**
 * Helper to render a label with an optional red asterisk.
 * Pass `required` to show the asterisk.
 *
 * Usage:
 *   <FieldLabel required>First Name</FieldLabel>
 *   <FieldLabel>Middle Name</FieldLabel>  // optional, no asterisk
 */
export function FieldLabel({
  children,
  required,
  className,
  htmlFor,
}: {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "flex items-center gap-1.5 text-sm leading-none font-medium select-none text-slate-700 mb-1.5",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
    >
      {children}
      {required && (
        <span className="text-rose-500 font-bold" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

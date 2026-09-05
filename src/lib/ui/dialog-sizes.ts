// =====================================================================
// dialog-sizes.ts
//
// Centralized responsive dialog sizing system for the HMIS.
//
// Design principle (per spec):
//   "USE THE MAXIMUM PRACTICAL SPACE AVAILABLE FOR THE CONTENT,
//    BASED ON THE CURRENT VIEWPORT AND DEVICE, WITHOUT MAKING THE
//    INTERFACE UNNECESSARILY LARGE."
//
// Architecture:
//   - Each `DialogContent` accepts an optional `size` prop that maps to
//     a preset width tier.
//   - Widths use Tailwind's existing `max-w-*` scale so they compose
//     with the existing CSS.  The preset picks the right `max-w-*`
//     at the right breakpoint via responsive prefixes (sm:, md:, lg:).
//   - Heights are viewport-relative via `max-h-[NNvh]`.
//   - Mobile: every non-compact dialog becomes near-fullscreen below
//     the `sm` breakpoint (640px).  This matches the spec's "phone =
//     near-fullscreen/fullscreen" requirement.
//   - Safe viewport margins are preserved via the existing
//     `max-w-[calc(100%-2rem)]` base class on the dialog primitive.
//     Our `maxW` strings use `sm:`/`md:`/`lg:` prefixes so they only
//     apply at those breakpoints — on mobile, the base class wins
//     and the dialog stays within `calc(100%-2rem)`.
// =====================================================================

import { cn } from "@/lib/utils";

export type DialogSize =
  | "compact"
  | "medium"
  | "large"
  | "xl"
  | "wide"
  | "2xl"
  | "full";

// ─── Width classes ─────────────────────────────────────────────────
//
// We use sm:/md:/lg: prefixes so that on mobile (<640px) the base
// dialog.tsx `max-w-[calc(100%-2rem)]` wins (1rem margin each side),
// and only at the named breakpoint does the preset's wider max-w apply.
//
// Tailwind max-w scale (reminders):
//   max-w-md  = 28rem (448px)
//   max-w-lg  = 32rem (512px)
//   max-w-xl  = 36rem (576px)
//   max-w-2xl = 42rem (672px)
//   max-w-3xl = 48rem (768px)
//   max-w-4xl = 56rem (896px)
//   max-w-5xl = 64rem (1024px)
//   max-w-6xl = 72rem (1152px)
//   max-w-7xl = 80rem (1280px)
// =====================================================================

const WIDTH_CLASSES: Record<DialogSize, string> = {
  // Compact: small confirmation dialogs (destructive confirm, type-to-confirm).
  // Stays narrow at all breakpoints.  Mobile inherits base max-w-[calc(100%-2rem)].
  compact: "sm:max-w-md",

  // Medium: ordinary forms with a single column of inputs.
  // Default for confirm-dialog, basic create/edit dialogs.
  medium: "sm:max-w-md md:max-w-lg",

  // Large: standard multi-field forms (registration, role, etc.)
  // Caps at md (48rem) so it doesn't sprawl on large monitors.
  large: "sm:max-w-lg md:max-w-2xl",

  // XL: complex forms with multi-column grids, embedded selects, etc.
  xl: "sm:max-w-2xl md:max-w-3xl lg:max-w-4xl",

  // Wide: tables, detailed records, multi-tab detail dialogs.
  // Caps at lg (64rem) — the most common "wide" width in the codebase.
  wide: "sm:max-w-3xl md:max-w-4xl lg:max-w-5xl",

  // 2XL: complex clinical/diagnostic/financial detail views with
  // wide tables + multi-column info.  Caps at xl (80rem).
  "2xl": "sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl",

  // Full: near-fullscreen for very large tables, reports, multi-step
  // workflows.  On md+ uses calc(100vw - safe-margin) so it never
  // overflows the viewport but always uses most of it.
  full: "sm:max-w-[calc(100vw-2rem)] md:max-w-[calc(100vw-3rem)] lg:max-w-[calc(100vw-4rem)]",
};

// ─── Height classes ────────────────────────────────────────────────

const HEIGHT_CLASSES: Record<DialogSize, string> = {
  // Compact: no max-h — content is short, dialog grows naturally.
  compact: "",

  // Medium: cap at 90vh so the dialog never overflows on small laptops.
  medium: "max-h-[90vh]",

  // Large: same 90vh cap.
  large: "max-h-[90vh]",

  // XL: 92vh — slightly more aggressive for complex forms.
  xl: "max-h-[92vh]",

  // Wide: 92vh — same as XL, but typically contains a table body that
  // scrolls internally.
  wide: "max-h-[92vh]",

  // 2XL: 94vh — for very wide detail dialogs that take most of the screen.
  "2xl": "max-h-[94vh]",

  // Full: 96vh — leaves a small breathing margin top + bottom so the
  // dialog doesn't visually touch the screen edges on desktop.
  full: "max-h-[96vh]",
};

// ─── Mobile-fullscreen behavior ────────────────────────────────────
//
// On screens below the `sm` breakpoint (640px), every non-compact dialog
// becomes near-fullscreen.  We achieve this by adding mobile-only
// classes that override the default rounded centered dialog shape:
//
//   - `max-w-none sm:max-w-[calc(100%-2rem)]` — full width on mobile,
//      then return to safe-margin width at sm+.
//   - `h-[100dvh] sm:h-auto` — full viewport height on mobile, auto
//     on desktop (where max-h takes over).
//   - `top-0 left-0 sm:top-[50%] sm:left-[50%]` — anchor top-left on
//     mobile, return to center on sm+.
//   - `translate-x-0 translate-y-0 sm:translate-x-[-50%] sm:translate-y-[-50%]`
//     — no horizontal/vertical centering offset on mobile.
//   - `rounded-none sm:rounded-lg` — sharp corners on mobile (looks
//     more "app-like" when the dialog fills the screen).
//
// These mobile-only classes are applied by `getDialogContentClasses()`
// below for every preset EXCEPT `compact` (small confirmations stay
// small and centered even on mobile, per spec §47 "Small confirmation
// dialogs should remain small").
// =====================================================================

const MOBILE_FULLSCREEN_CLASSES = [
  "max-w-none sm:max-w-[calc(100%-2rem)]",
  "h-[100dvh] sm:h-auto",
  "top-0 left-0 sm:top-[50%] sm:left-[50%]",
  "translate-x-0 translate-y-0 sm:translate-x-[-50%] sm:translate-y-[-50%]",
  "rounded-none sm:rounded-lg",
].join(" ");

// ─── Body scroll architecture classes ──────────────────────────────
//
// The canonical scroll pattern is:
//   DialogContent (flex flex-col, overflow-hidden, max-h-[NNvh])
//     ├── DialogHeader (shrink-0)        ← stays visible
//     ├── Body div (flex-1, overflow-y-auto, min-h-0)  ← scrolls
//     └── DialogFooter (shrink-0)        ← stays visible
//
// We expose this as `DIALOG_BODY_SHELL` so callers don't have to
// remember the exact class string.  Use it like:
//   <DialogContent size="wide" className={DIALOG_BODY_SHELL}>
//     <DialogHeader className="shrink-0 ...">...</DialogHeader>
//     <div className="flex-1 overflow-y-auto min-h-0 p-6">...</div>
//     <DialogFooter className="shrink-0 ...">...</DialogFooter>
//   </DialogContent>
// =====================================================================

export const DIALOG_BODY_SHELL =
  "flex flex-col p-0 gap-0 overflow-hidden";

// ─── Main entry point ──────────────────────────────────────────────
//
// `getDialogContentClasses(size, extraClassName)` returns the full
// className string to apply to a `<DialogContent>`.  It:
//   - Adds the width tier (with sm:/md:/lg: prefixes so mobile inherits
//     the base max-w-[calc(100%-2rem)]).
//   - Adds the height cap.
//   - Adds the mobile-fullscreen classes (unless `compact`).
//   - Appends any caller-supplied extra classes (e.g. `DIALOG_BODY_SHELL`
//     or a custom `bg-slate-50`).
//   - De-duplicates redundant tokens via `cn()` so we don't end up with
//     `flex flex-col p-0 gap-0 overflow-hidden flex flex-col overflow-hidden`
//     (which currently exists in 4 dialogs per the audit).
// =====================================================================

export function getDialogContentClasses(
  size: DialogSize = "medium",
  extraClassName?: string
): string {
  const width = WIDTH_CLASSES[size];
  const height = HEIGHT_CLASSES[size];
  const mobile = size === "compact" ? "" : MOBILE_FULLSCREEN_CLASSES;

  return cn(width, height, mobile, extraClassName);
}

// ─── Default size per dialog purpose (per spec Section 22) ─────────
//
// Convenience map: callers can pass `size="auto"` (the default) and
// the Dialog primitive will look up a sensible size based on the
// presence of certain content markers.  For now we keep this simple —
// every DialogContent defaults to `medium` unless explicitly told
// otherwise.  The spec calls for content-aware defaults but we
// intentionally keep the API explicit: the caller picks the size
// based on what they're putting in the dialog.  This avoids surprises.
//
// For guidance, the recommended sizes per dialog type are:
//   Confirmation / destructive confirm   → compact
//   Simple form (1-3 fields)             → medium
//   Standard form (4-10 fields)         → large
//   Complex form (multi-column, tabs)    → xl
//   Table dialog                         → wide
//   Clinical detail / lab report          → 2xl
//   Patient 360 / multi-tab detail       → 2xl
//   Report preview / audit log review    → full
// =====================================================================

export const DEFAULT_DIALOG_SIZE: DialogSize = "medium";

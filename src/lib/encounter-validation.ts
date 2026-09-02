// =====================================================================
// Encounter Validation Schemas (Zod v4)
// =====================================================================
// Shared validation schemas for the Encounters module.
// Used by both API routes and (optionally) the UI.
// =====================================================================

import { z } from "zod";

// --- Constants ---

export const ENCOUNTER_STATUSES = [
  "open",
  "in_progress",
  "completed",
  "cancelled",
  "admitted",
  "discharged",
] as const;

export const ENCOUNTER_TYPES = [
  "opd",
  "emergency",
  "inpatient",
  "follow_up",
  "laboratory",
  "pharmacy",
  "imaging",
  "procedure",
  "maternity",
  "other",
] as const;

export const ENCOUNTER_PRIORITIES = [
  "routine",
  "urgent",
  "emergency",
] as const;

export const ENCOUNTER_SOURCES = [
  "walkin",
  "appointment",
  "referral",
  "emergency",
  "telemedicine",
] as const;

export const TERMINAL_STATUSES = ["completed", "cancelled", "discharged"] as const;

// Valid status transitions (from → [allowed next states])
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "cancelled", "completed", "admitted"],
  in_progress: ["completed", "cancelled", "admitted", "discharged"],
  admitted: ["discharged", "in_progress", "cancelled"],
  discharged: ["completed", "cancelled"],
  completed: [], // terminal
  cancelled: [], // terminal
};

// --- Zod Schemas ---

export const createEncounterSchema = z.object({
  patientId: z.string().min(1, "patientId is required"),
  facilityId: z.string().min(1, "facilityId is required"),
  departmentId: z.string().optional().nullable(),
  encounterType: z.enum(ENCOUNTER_TYPES).default("opd"),
  priority: z.enum(ENCOUNTER_PRIORITIES).default("routine"),
  attendingStaffId: z.string().optional().nullable(),
  source: z.enum(ENCOUNTER_SOURCES).default("walkin"),
  externalId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateEncounterSchema = z.object({
  status: z.enum(ENCOUNTER_STATUSES).optional(),
  priority: z.enum(ENCOUNTER_PRIORITIES).optional(),
  attendingStaffId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const cancelEncounterSchema = z.object({
  reason: z.string().min(1, "Cancellation reason is required").max(500, "Reason too long"),
});

export const closeEncounterSchema = z.object({
  notes: z.string().optional().nullable(),
});

// --- Validation helpers ---

/**
 * Check if a status transition is valid.
 * Returns true if the transition is allowed, false otherwise.
 */
export function isValidTransition(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === toStatus) return true; // same status is always valid (no-op)
  const allowed = STATUS_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

/**
 * Check if a status is terminal (no further transitions allowed).
 */
export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status as any);
}

/**
 * Check if changing status requires the ENCOUNTER_CLOSE permission.
 */
export function requiresClosePermission(fromStatus: string, toStatus: string): boolean {
  return TERMINAL_STATUSES.includes(toStatus as any);
}

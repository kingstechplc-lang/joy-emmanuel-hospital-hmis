// =====================================================================
// REFERRAL LIFECYCLE HELPERS
// =====================================================================
// Shared utilities for the Referrals module:
//   - nextReferralNumber()  → REF-YYYY-000001 generator
//   - STATUS_TRANSITIONS    → allowed status-transition map
//   - validateTransition()  → guard against illegal jumps
//   - recordEvent()         → append a ReferralEvent timeline entry
//   - statusTimestampField()→ which DateTime field to stamp for a status
// =====================================================================
import { db } from "./db";

/**
 * Generate the next human-readable referral number in the format
 * REF-{year}-{000001}. Mirrors the SpecialtyReferral numbering pattern.
 * Counts existing referrals in the org for the current year and pads.
 */
export async function nextReferralNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.referral.count({
    where: {
      referralNumber: { startsWith: `REF-${year}-` },
    },
  });
  return `REF-${year}-${String(count + 1).padStart(6, "0")}`;
}

/**
 * Allowed status transitions for the Referral lifecycle.
 * Keys are the "from" status; values are the set of "to" statuses that
 * are legal from that state. Used by validateTransition() to reject
 * illegal jumps (e.g., completed → pending).
 *
 * Note: `cancelled` and `expired` are terminal — once a referral is
 * cancelled or expired, no further transitions are allowed (the record
 * remains for history).
 */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["authorized", "sent", "cancelled"],
  authorized: ["sent", "cancelled"],
  sent: ["acknowledged", "accepted", "rejected", "cancelled", "no_response", "redirected"],
  acknowledged: ["accepted", "rejected", "cancelled", "no_response"],
  accepted: ["scheduled", "in_transit", "arrived", "under_care", "completed", "cancelled", "unable_to_attend"],
  rejected: ["closed"], // rejected referrals can be closed but not resurrected
  scheduled: ["in_transit", "arrived", "under_care", "completed", "cancelled", "unable_to_attend", "no_response"],
  in_transit: ["arrived", "under_care", "cancelled", "unable_to_attend"],
  arrived: ["under_care", "completed", "cancelled"],
  under_care: ["completed", "feedback_received", "cancelled"],
  completed: ["feedback_received", "follow_up", "closed"],
  feedback_received: ["follow_up", "closed", "reviewed"],
  follow_up: ["closed", "completed"],
  returned: ["closed", "accepted"],
  redirected: ["acknowledged", "accepted", "rejected", "cancelled", "no_response"],
  no_response: ["closed", "cancelled"],
  unable_to_attend: ["closed", "cancelled"],
  // Terminal — no outgoing transitions
  closed: [],
  cancelled: [],
  expired: [],
  reviewed: ["closed", "follow_up"],
};

/**
 * Validate that a status transition is allowed. Returns { ok: true } if
 * valid, or { ok: false, error: string } explaining why not.
 */
export function validateTransition(
  fromStatus: string,
  toStatus: string
): { ok: true } | { ok: false; error: string } {
  if (fromStatus === toStatus) {
    return { ok: true }; // no-op transition (e.g., editing notes without changing status)
  }
  const allowed = STATUS_TRANSITIONS[fromStatus];
  if (!allowed) {
    return {
      ok: false,
      error: `Unknown source status "${fromStatus}". No transitions are defined from this state.`,
    };
  }
  if (allowed.length === 0) {
    return {
      ok: false,
      error: `Referral is in terminal status "${fromStatus}" and cannot be transitioned to "${toStatus}".`,
    };
  }
  if (!allowed.includes(toStatus)) {
    return {
      ok: false,
      error: `Cannot transition referral from "${fromStatus}" to "${toStatus}". Allowed transitions from "${fromStatus}": ${allowed.join(", ")}.`,
    };
  }
  return { ok: true };
}

/**
 * Map a status to the DateTime field that should be stamped when
 * entering that status. Returns null if the status has no dedicated
 * timestamp field.
 */
export function statusTimestampField(status: string): string | null {
  const map: Record<string, string> = {
    submitted: "submittedAt",
    sent: "sentAt",
    acknowledged: "acknowledgedAt",
    accepted: "acceptedAt",
    rejected: "rejectedAt",
    arrived: "arrivedAt",
    completed: "completedAt",
    feedback_received: "feedbackReceivedAt",
    cancelled: "cancelledAt",
    closed: "closedAt",
  };
  return map[status] || null;
}

/**
 * Append a ReferralEvent timeline entry. This is the single source of
 * truth for the referral timeline — every status change and notable
 * event should call this. Never throws; logs errors silently.
 */
export async function recordEvent(opts: {
  referralId: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: string;
  facilityId?: string | null;
  title: string;
  description?: string;
  metadata?: any;
}): Promise<void> {
  try {
    await db.referralEvent.create({
      data: {
        referralId: opts.referralId,
        eventType: opts.eventType,
        fromStatus: opts.fromStatus || null,
        toStatus: opts.toStatus || null,
        actorUserId: opts.actorUserId || null,
        facilityId: opts.facilityId || null,
        title: opts.title,
        description: opts.description || null,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
      },
    });
  } catch (e) {
    console.error("recordEvent failed:", e);
  }
}

/**
 * Determine if a referral is "overdue" based on its current status and
 * the time elapsed since the last status change. Returns an object with
 * isOverdue flag and a human-readable reason.
 *
 * Note: these thresholds are intentionally conservative and based on
 * common clinical expectations. They are NOT configurable yet — adjust
 * here if business rules change.
 */
export function getOverdueStatus(referral: {
  status: string;
  sentAt?: Date | null;
  acknowledgedAt?: Date | null;
  acceptedAt?: Date | null;
  feedbackStatus?: string;
  completedAt?: Date | null;
}): { isOverdue: boolean; reason?: string; daysOverdue?: number } {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  // Sent but not acknowledged within 2 days
  if (referral.status === "sent" && referral.sentAt) {
    const elapsed = now - new Date(referral.sentAt).getTime();
    if (elapsed > 2 * DAY) {
      return {
        isOverdue: true,
        reason: "Not acknowledged within 2 days of being sent",
        daysOverdue: Math.floor(elapsed / DAY) - 2,
      };
    }
  }

  // Accepted but no appointment scheduled within 7 days
  if (referral.status === "accepted" && referral.acceptedAt) {
    const elapsed = now - new Date(referral.acceptedAt).getTime();
    if (elapsed > 7 * DAY) {
      return {
        isOverdue: true,
        reason: "No appointment scheduled within 7 days of acceptance",
        daysOverdue: Math.floor(elapsed / DAY) - 7,
      };
    }
  }

  // Completed but feedback not received within 14 days
  if (
    referral.status === "completed" &&
    referral.completedAt &&
    referral.feedbackStatus === "awaiting"
  ) {
    const elapsed = now - new Date(referral.completedAt).getTime();
    if (elapsed > 14 * DAY) {
      return {
        isOverdue: true,
        reason: "Feedback not received within 14 days of completion",
        daysOverdue: Math.floor(elapsed / DAY) - 14,
      };
    }
  }

  return { isOverdue: false };
}

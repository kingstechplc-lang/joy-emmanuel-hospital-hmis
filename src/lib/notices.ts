// =====================================================================
// NOTICE BOARD — lifecycle helper
// =====================================================================
// Lazy auto-promotion + auto-expiry. Called at the top of every
// visibility-affecting GET endpoint so SCHEDULED notices become
// PUBLISHED automatically when their publishAt time arrives, and
// PUBLISHED notices become EXPIRED when their expiresAt passes.
//
// This is "lazy" — it only fires when someone queries the notices
// API. Combined with the 15s polling cadence on the Notice Board
// UI + dashboard widget, this means a scheduled notice publishes
// within 15 seconds of its publishAt time, without needing a
// background cron job.
//
// All updates are atomic (updateMany by id list) and write audit
// log entries with source="notice_board_auto" so an admin can
// distinguish auto-promotions from manual ones.
// =====================================================================
import { db } from "@/lib/db";
import { auditLog } from "@/lib/session";

export async function autoPromoteAndExpireNotices(
  organizationId: string,
  userId: string,
  now: Date = new Date()
): Promise<{ promoted: number; expired: number }> {
  // ── 1. Promote SCHEDULED → PUBLISHED ──────────────────────────
  // A SCHEDULED notice is "ready to publish" when publishAt <= now.
  const toPromote = await db.notice.findMany({
    where: {
      organizationId,
      status: "SCHEDULED",
      publishAt: { lte: now },
    },
    select: { id: true, facilityId: true, title: true },
  });

  let promoted = 0;
  if (toPromote.length > 0) {
    const res = await db.notice.updateMany({
      where: { id: { in: toPromote.map(n => n.id) } },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
      },
    });
    promoted = res.count;

    // Audit log each promotion — fire in parallel so they don't block
    // the request. Failures are non-fatal (audit log writes already
    // swallow errors internally).
    await Promise.all(toPromote.map(n =>
      auditLog({
        userId,
        organizationId,
        facilityId: n.facilityId || undefined,
        action: "NOTICE_PUBLISHED",
        actionCategory: "OPERATIONS",
        severity: "notice",
        source: "notice_board_auto",
        resourceType: "notice",
        resourceId: n.id,
        oldValues: { status: "SCHEDULED" },
        newValues: { status: "PUBLISHED", publishedAt: now, autoPromoted: true },
        reason: `Auto-promotion: publishAt reached at ${now.toISOString()}`,
      })
    ));
  }

  // ── 2. Expire PUBLISHED → EXPIRED ─────────────────────────────
  // A PUBLISHED notice is "expired" when expiresAt < now. Null
  // expiresAt means "never expires" — skip those.
  const toExpire = await db.notice.findMany({
    where: {
      organizationId,
      status: "PUBLISHED",
      expiresAt: { lt: now },
    },
    select: { id: true, facilityId: true, title: true },
  });

  let expired = 0;
  if (toExpire.length > 0) {
    const res = await db.notice.updateMany({
      where: { id: { in: toExpire.map(n => n.id) } },
      data: { status: "EXPIRED" },
    });
    expired = res.count;

    await Promise.all(toExpire.map(n =>
      auditLog({
        userId,
        organizationId,
        facilityId: n.facilityId || undefined,
        action: "NOTICE_EXPIRED",
        actionCategory: "OPERATIONS",
        severity: "notice",
        source: "notice_board_auto",
        resourceType: "notice",
        resourceId: n.id,
        oldValues: { status: "PUBLISHED" },
        newValues: { status: "EXPIRED", autoExpired: true },
        reason: `Auto-expiry: expiresAt passed at ${now.toISOString()}`,
      })
    ));

    // Also unpin expired notices so they don't pollute the pinned slot
    if (expired > 0) {
      await db.notice.updateMany({
        where: { id: { in: toExpire.map(n => n.id) }, isPinned: true },
        data: { isPinned: false },
      });
    }
  }

  return { promoted, expired };
}

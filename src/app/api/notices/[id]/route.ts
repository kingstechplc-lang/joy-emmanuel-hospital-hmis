// =====================================================================
// API: /api/notices/[id]
//   GET   — get notice details (with visibility check)
//   PATCH — update notice (state-machine validated)
//   Permission:
//     GET   — notice.view + must be in target scope
//     PATCH — notice.update (creators can edit their own drafts/scheduled)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_TYPES = ["GENERAL","IMPORTANT","URGENT","EMERGENCY","MAINTENANCE","CLINICAL","ADMINISTRATIVE","IT","SECURITY","STAFF","EVENT","POLICY"];
const VALID_PRIORITIES = ["LOW","NORMAL","HIGH","CRITICAL"];
const VALID_STATUSES = ["DRAFT","SCHEDULED","PUBLISHED","EXPIRED","CANCELLED"];

// Helper — does the user match this notice's target scope?
async function userCanSeeNotice(session: any, noticeId: string): Promise<boolean> {
  const targets = await db.noticeTarget.findMany({ where: { noticeId } });
  for (const t of targets) {
    if (t.targetType === "ORGANIZATION" && (t.targetId === session.user.organizationId || t.targetId === "*")) return true;
    if (t.targetType === "FACILITY" && session.user.facilityId && (t.targetId === session.user.facilityId || t.targetId === "*")) return true;
    if (t.targetType === "DEPARTMENT" && session.user.departmentId && (t.targetId === session.user.departmentId || t.targetId === "*")) return true;
    if (t.targetType === "ROLE" && session.user.roles?.includes(t.targetId)) return true;
    if (t.targetType === "ROLE" && t.targetId === "*") return true;
    if (t.targetType === "USER" && t.targetId === session.user.id) return true;
  }
  return false;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NOTICE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const notice = await db.notice.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      cancelledBy: { select: { id: true, firstName: true, lastName: true } },
      updatedBy: { select: { id: true, firstName: true, lastName: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      targets: { select: { targetType: true, targetId: true } },
    },
  });
  if (!notice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Tenant isolation
  if (notice.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Visibility check — admins with notice.create can see their own drafts;
  // everyone else must be in target scope AND the notice must be live
  const canManage = hasPermission(session, PERMISSIONS.NOTICE_CREATE);
  const isOwner = notice.createdById === session.user.id;
  const now = new Date();
  const isLive = notice.status === "PUBLISHED"
    && (!notice.publishAt || notice.publishAt <= now)
    && (!notice.expiresAt || notice.expiresAt > now);

  if (!isLive && !(canManage && isOwner)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isLive && !await userCanSeeNotice(session, id) && !(canManage && isOwner)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Mark as read (idempotent — unique constraint prevents dupes)
  try {
    await db.noticeRead.upsert({
      where: { noticeId_userId: { noticeId: id, userId: session.user.id } },
      create: { noticeId: id, userId: session.user.id },
      update: {},
    });
  } catch (e) {
    // Non-fatal — a duplicate-key race just means it was already marked read
  }

  // Pull per-user read/ack state
  const read = await db.noticeRead.findUnique({
    where: { noticeId_userId: { noticeId: id, userId: session.user.id } },
  });
  const ack = await db.noticeAcknowledgement.findUnique({
    where: { noticeId_userId: { noticeId: id, userId: session.user.id } },
  });

  return NextResponse.json({
    item: {
      ...notice,
      isRead: !!read,
      readAt: read?.readAt || null,
      isAcknowledged: !!ack,
      acknowledgedAt: ack?.acknowledgedAt || null,
    },
  });
}

// =====================================================================
// PATCH — update notice fields (state-machine validated)
//   Body may include: title, body, noticeType, priority, visibilityScope,
//   facilityId, departmentId, targets[], publishAt, expiresAt,
//   requiresAcknowledgement, isPinned
// =====================================================================
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NOTICE_UPDATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const existing = await db.notice.findUnique({
    where: { id },
    include: { targets: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Tenant isolation
  if (existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Creators can edit their own; org/facility admins can edit any
  const isOwner = existing.createdById === session.user.id;
  const isOrgAdmin = hasPermission(session, PERMISSIONS.NOTICE_PUBLISH);
  if (!isOwner && !isOrgAdmin) {
    return NextResponse.json({ error: "You can only edit your own notices" }, { status: 403 });
  }

  // State machine — only DRAFT and SCHEDULED notices can be fully edited.
  // PUBLISHED notices can be edited (creating a version snapshot) but
  // the edit is recorded for audit. CANCELLED/EXPIRED notices cannot be edited.
  if (existing.status === "CANCELLED" || existing.status === "EXPIRED") {
    return NextResponse.json({ error: `Cannot edit a ${existing.status} notice` }, { status: 400 });
  }

  const {
    title, body: message, noticeType, priority, visibilityScope,
    facilityId, departmentId, targets, publishAt, expiresAt,
    requiresAcknowledgement, isPinned,
  } = body;

  const updateData: any = {};
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim() || title.length > 200) {
      return NextResponse.json({ error: "title must be 1-200 characters" }, { status: 400 });
    }
    updateData.title = title.trim();
  }
  if (message !== undefined) {
    if (typeof message !== "string" || !message.trim() || message.length > 10_000) {
      return NextResponse.json({ error: "body must be 1-10,000 characters" }, { status: 400 });
    }
    updateData.body = message.trim();
  }
  if (noticeType !== undefined && VALID_TYPES.includes(noticeType)) updateData.noticeType = noticeType;
  if (priority !== undefined && VALID_PRIORITIES.includes(priority)) updateData.priority = priority;
  if (visibilityScope !== undefined) updateData.visibilityScope = visibilityScope;
  if (facilityId !== undefined) updateData.facilityId = facilityId || null;
  if (departmentId !== undefined) updateData.departmentId = departmentId || null;
  if (publishAt !== undefined) updateData.publishAt = publishAt ? new Date(publishAt) : null;
  if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (requiresAcknowledgement !== undefined) updateData.requiresAcknowledgement = !!requiresAcknowledgement;

  // Pin permission check
  if (isPinned !== undefined) {
    if (!hasPermission(session, PERMISSIONS.NOTICE_PIN)) {
      return NextResponse.json({ error: "You do not have permission to pin notices" }, { status: 403 });
    }
    updateData.isPinned = !!isPinned;
  }

  // Validate publish/expires ordering
  const newPublishAt = updateData.publishAt !== undefined ? updateData.publishAt : existing.publishAt;
  const newExpiresAt = updateData.expiresAt !== undefined ? updateData.expiresAt : existing.expiresAt;
  if (newPublishAt && newExpiresAt && newExpiresAt <= newPublishAt) {
    return NextResponse.json({ error: "expiresAt must be after publishAt" }, { status: 400 });
  }

  // Validate facility/department scope
  if (updateData.facilityId) {
    const fac = await db.facility.findUnique({ where: { id: updateData.facilityId }, select: { organizationId: true } });
    if (!fac || fac.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "facilityId not in your organization" }, { status: 400 });
    }
  }
  if (updateData.departmentId) {
    const dep = await db.department.findUnique({ where: { id: updateData.departmentId }, select: { facility: { select: { organizationId: true } } } });
    if (!dep || dep.facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "departmentId not in your organization" }, { status: 400 });
    }
  }

  // If notice is being updated, snapshot the prior version to history
  // (only when title or body is actually changing on a PUBLISHED notice)
  const shouldSnapshot = existing.status === "PUBLISHED" && (
    (updateData.title && updateData.title !== existing.title) ||
    (updateData.body && updateData.body !== existing.body)
  );

  // Targets replacement (if provided)
  const txs: any[] = [];
  if (Array.isArray(targets)) {
    // Validate
    for (const t of targets) {
      if (!["FACILITY","DEPARTMENT","ROLE","USER","ORGANIZATION"].includes(t.targetType)) {
        return NextResponse.json({ error: `Invalid targetType: ${t.targetType}` }, { status: 400 });
      }
      if (!t.targetId) {
        return NextResponse.json({ error: "Each target requires a targetId" }, { status: 400 });
      }
    }
    txs.push(db.noticeTarget.deleteMany({ where: { noticeId: id } }));
    if (targets.length > 0) {
      txs.push(db.noticeTarget.createMany({
        data: targets.map((t: any) => ({ noticeId: id, targetType: t.targetType, targetId: t.targetId })),
      }));
    }
  }

  // Snapshot before update
  if (shouldSnapshot) {
    txs.push(db.noticeVersionHistory.create({
      data: {
        noticeId: id,
        version: existing.version,
        title: existing.title,
        body: existing.body,
        changedById: session.user.id,
      },
    }));
    updateData.version = existing.version + 1;
  }

  updateData.updatedById = session.user.id;
  txs.push(db.notice.update({ where: { id }, data: updateData }));

  await db.$transaction(txs);

  const updated = await db.notice.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      targets: { select: { targetType: true, targetId: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "NOTICE_UPDATED",
    actionCategory: "OPERATIONS",
    severity: "notice",
    source: "notice_board",
    resourceType: "notice",
    resourceId: id,
    oldValues: {
      title: existing.title,
      body: existing.body,
      noticeType: existing.noticeType,
      priority: existing.priority,
      requiresAcknowledgement: existing.requiresAcknowledgement,
      isPinned: existing.isPinned,
      publishAt: existing.publishAt,
      expiresAt: existing.expiresAt,
    },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

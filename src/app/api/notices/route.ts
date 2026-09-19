// =====================================================================
// API: /api/notices
//   GET    — list notices visible to the current user (server-side
//            scoping by org/facility/department/role/user + status +
//            publishAt/expiresAt + target rows)
//   POST   — create a notice (DRAFT or SCHEDULED)
//   Permission:
//     GET  — any authenticated user (notice.view auto-granted to staff)
//     POST — notice.create
// =====================================================================
// Query params (GET):
//   ?status=PUBLISHED          — filter by status (default: PUBLISHED for
//                                normal users; admins can pass DRAFT /
//                                SCHEDULED / CANCELLED / EXPIRED)
//   ?priority=HIGH             — filter by priority
//   ?noticeType=CLINICAL       — filter by type
//   ?facilityId=...            — filter by facility (must be in user's org)
//   ?departmentId=...          — filter by department (must be in user's facility)
//   ?unreadOnly=true           — only notices the user hasn't opened
//   ?pendingAckOnly=true       — only notices requiring ack the user hasn't acked
//   ?pinnedOnly=true           — only pinned notices
//   ?search=keyword           — title/body ILIKE search (server-side)
//   ?page=1&pageSize=25        — server-side pagination
//
// Visibility logic (server-side enforced):
//   A notice is visible to user U if:
//     1. notice.organizationId == U.organizationId  (tenant isolation)
//     2. notice.status == PUBLISHED AND now >= publishAt AND
//        (expiresAt IS NULL OR now < expiresAt)
//     3. The user matches at least one NoticeTarget row:
//        - targetType=ORGANIZATION  → targetId == U.organizationId OR "*"
//        - targetType=FACILITY      → targetId == U.facilityId  OR "*"
//        - targetType=DEPARTMENT    → targetId == U.departmentId OR "*"
//        - targetType=ROLE          → targetId in U.roles        OR "*"
//        - targetType=USER          → targetId == U.id
//   Users with notice.create/publish can also see their own DRAFT/SCHEDULED/
//   CANCELLED notices.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_TYPES = ["GENERAL","IMPORTANT","URGENT","EMERGENCY","MAINTENANCE","CLINICAL","ADMINISTRATIVE","IT","SECURITY","STAFF","EVENT","POLICY"];
const VALID_PRIORITIES = ["LOW","NORMAL","HIGH","CRITICAL"];
const VALID_STATUSES = ["DRAFT","SCHEDULED","PUBLISHED","EXPIRED","CANCELLED"];
const VALID_SCOPES = ["FACILITY","DEPARTMENT","ROLE","USER","ORGANIZATION"];
const VALID_TARGET_TYPES = ["FACILITY","DEPARTMENT","ROLE","USER","ORGANIZATION"];

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NOTICE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") || "PUBLISHED";
  const priority = url.searchParams.get("priority");
  const noticeType = url.searchParams.get("noticeType");
  const facilityId = url.searchParams.get("facilityId");
  const departmentId = url.searchParams.get("departmentId");
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const pendingAckOnly = url.searchParams.get("pendingAckOnly") === "true";
  const pinnedOnly = url.searchParams.get("pinnedOnly") === "true";
  const search = url.searchParams.get("search")?.trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "25", 10)));

  const now = new Date();
  const canManage = hasPermission(session, PERMISSIONS.NOTICE_CREATE);

  // Build base where clause — tenant isolation ALWAYS applied
  const where: any = {
    organizationId: session.user.organizationId,
  };

  // Status filtering — normal users only see PUBLISHED + active
  if (statusFilter === "PUBLISHED") {
    where.status = "PUBLISHED";
    where.publishAt = { lte: now };
    where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }];
  } else if (canManage && VALID_STATUSES.includes(statusFilter)) {
    where.status = statusFilter;
  } else {
    where.status = "PUBLISHED";
    where.publishAt = { lte: now };
    where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }];
  }

  if (priority && VALID_PRIORITIES.includes(priority)) where.priority = priority;
  if (noticeType && VALID_TYPES.includes(noticeType)) where.noticeType = noticeType;
  if (pinnedOnly) where.isPinned = true;

  // Facility/department filters — verify scope
  if (facilityId) {
    // Must be in user's org
    const fac = await db.facility.findUnique({ where: { id: facilityId }, select: { organizationId: true } });
    if (!fac || fac.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Facility not in your organization" }, { status: 403 });
    }
    where.facilityId = facilityId;
  }
  if (departmentId) {
    const dep = await db.department.findUnique({ where: { id: departmentId }, select: { facility: { select: { organizationId: true } } } });
    if (!dep || dep.facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Department not in your organization" }, { status: 403 });
    }
    where.departmentId = departmentId;
  }

  if (search) {
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { body: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  // Build the targeting OR clause — the user must match at least one
  // NoticeTarget row. Admins with notice.create can also see their own
  // drafts + scheduled notices regardless of targeting.
  const targetClauses: any[] = [
    // ORGANIZATION scope reaches the whole org
    { targets: { some: { targetType: "ORGANIZATION", targetId: { in: [session.user.organizationId, "*"] } } } },
  ];
  if (session.user.facilityId) {
    targetClauses.push({ targets: { some: { targetType: "FACILITY", targetId: { in: [session.user.facilityId, "*"] } } } });
  }
  if (session.user.departmentId) {
    targetClauses.push({ targets: { some: { targetType: "DEPARTMENT", targetId: { in: [session.user.departmentId, "*"] } } } });
  }
  if (session.user.roles?.length) {
    targetClauses.push({ targets: { some: { targetType: "ROLE", targetId: { in: [...session.user.roles, "*"] } } } });
  }
  targetClauses.push({ targets: { some: { targetType: "USER", targetId: session.user.id } } });

  // For managers, also include their own drafts/scheduled/cancelled
  if (canManage) {
    targetClauses.push({ createdById: session.user.id });
  }

  // Combine target clauses with the AND filters above
  where.AND = [
    ...(where.AND || []),
    { OR: targetClauses },
  ];

  // Count + paginated fetch in parallel
  const [total, items] = await Promise.all([
    db.notice.count({ where }),
    db.notice.findMany({
      where,
      orderBy: [
        { isPinned: "desc" },        // pinned first
        { priority: "desc" },        // CRITICAL > HIGH > NORMAL > LOW (alphabetical works since CRITICAL > HIGH > LOW > NORMAL... wait, it doesn't)
        { publishedAt: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        facility: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        targets: { select: { targetType: true, targetId: true } },
        _count: {
          select: {
            reads: { where: { userId: session.user.id } },
            acknowledgements: { where: { userId: session.user.id } },
          },
        },
      },
    }),
  ]);

  // Build response with per-user read/ack state
  const rows = items.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    noticeType: n.noticeType,
    priority: n.priority,
    status: n.status,
    visibilityScope: n.visibilityScope,
    publishAt: n.publishAt,
    expiresAt: n.expiresAt,
    publishedAt: n.publishedAt,
    cancelledAt: n.cancelledAt,
    requiresAcknowledgement: n.requiresAcknowledgement,
    isPinned: n.isPinned,
    version: n.version,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    createdBy: n.createdBy,
    facility: n.facility,
    department: n.department,
    targets: n.targets,
    isRead: (n as any)._count?.reads > 0,
    isAcknowledged: (n as any)._count?.acknowledgements > 0,
  }));

  // Sort priority manually (CRITICAL > HIGH > NORMAL > LOW)
  const priorityOrder: Record<string, number> = { CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
  rows.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const p = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    if (p !== 0) return p;
    return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime();
  });

  // Filter unread/pendingAck post-fetch (since they depend on per-user state)
  const filtered = rows.filter((r) => {
    if (unreadOnly && r.isRead) return false;
    if (pendingAckOnly && (!r.requiresAcknowledgement || r.isAcknowledged)) return false;
    return true;
  });

  return NextResponse.json({
    items: filtered,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    generatedAt: now.toISOString(),
  });
}

// =====================================================================
// POST — create notice (DRAFT or SCHEDULED)
// =====================================================================
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NOTICE_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const {
    title, body: message, noticeType, priority, visibilityScope,
    facilityId, departmentId, targets, publishAt, expiresAt,
    requiresAcknowledgement, isPinned,
  } = body;

  // ── Validate required fields ──────────────────────────────────
  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ error: "title must be 200 characters or less" }, { status: 400 });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (message.length > 10_000) {
    return NextResponse.json({ error: "body must be 10,000 characters or less" }, { status: 400 });
  }

  // Sanitize enum fields
  const finalType = VALID_TYPES.includes(noticeType) ? noticeType : "GENERAL";
  const finalPriority = VALID_PRIORITIES.includes(priority) ? priority : "NORMAL";
  const finalScope = VALID_SCOPES.includes(visibilityScope) ? visibilityScope : "FACILITY";

  // Facility/department scoping — must be in user's org
  let finalFacilityId: string | null = facilityId || session.user.facilityId || null;
  let finalDepartmentId: string | null = departmentId || null;
  if (finalFacilityId) {
    const fac = await db.facility.findUnique({ where: { id: finalFacilityId }, select: { organizationId: true } });
    if (!fac || fac.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "facilityId is not in your organization" }, { status: 400 });
    }
  }
  if (finalDepartmentId) {
    const dep = await db.department.findUnique({ where: { id: finalDepartmentId }, select: { facilityId: true, facility: { select: { organizationId: true } } } });
    if (!dep || dep.facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "departmentId is not in your organization" }, { status: 400 });
    }
    finalFacilityId = dep.facilityId;
  }

  // ── Validate targets ───────────────────────────────────────────
  if (!Array.isArray(targets) || targets.length === 0) {
    return NextResponse.json({ error: "At least one target is required" }, { status: 400 });
  }
  for (const t of targets) {
    if (!VALID_TARGET_TYPES.includes(t.targetType)) {
      return NextResponse.json({ error: `Invalid targetType: ${t.targetType}` }, { status: 400 });
    }
    if (!t.targetId || typeof t.targetId !== "string") {
      return NextResponse.json({ error: "Each target requires a targetId" }, { status: 400 });
    }
  }

  // ── Schedule validation ───────────────────────────────────────
  let finalPublishAt: Date | null = null;
  let status: "DRAFT" | "SCHEDULED" = "DRAFT";
  if (publishAt) {
    const d = new Date(publishAt);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "publishAt is not a valid date" }, { status: 400 });
    }
    if (d.getTime() <= Date.now()) {
      return NextResponse.json({ error: "publishAt must be in the future for a scheduled notice" }, { status: 400 });
    }
    finalPublishAt = d;
    status = "SCHEDULED";
  }

  let finalExpiresAt: Date | null = null;
  if (expiresAt) {
    const d = new Date(expiresAt);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "expiresAt is not a valid date" }, { status: 400 });
    }
    if (d.getTime() <= Date.now()) {
      return NextResponse.json({ error: "expiresAt must be in the future" }, { status: 400 });
    }
    finalExpiresAt = d;
  }
  if (finalPublishAt && finalExpiresAt && finalExpiresAt <= finalPublishAt) {
    return NextResponse.json({ error: "expiresAt must be after publishAt" }, { status: 400 });
  }

  // Pin permission check
  const finalIsPinned = isPinned === true;
  if (finalIsPinned && !hasPermission(session, PERMISSIONS.NOTICE_PIN)) {
    return NextResponse.json({ error: "You do not have permission to pin notices" }, { status: 403 });
  }

  // ── Create notice + targets in a transaction ──────────────────
  const notice = await db.$transaction(async (tx) => {
    const n = await tx.notice.create({
      data: {
        organizationId: session.user.organizationId,
        facilityId: finalFacilityId,
        departmentId: finalDepartmentId,
        createdById: session.user.id,
        title: title.trim(),
        body: message.trim(),
        noticeType: finalType,
        priority: finalPriority,
        status,
        visibilityScope: finalScope,
        publishAt: finalPublishAt,
        expiresAt: finalExpiresAt,
        requiresAcknowledgement: !!requiresAcknowledgement,
        isPinned: finalIsPinned,
      },
    });
    // Create target rows
    await tx.noticeTarget.createMany({
      data: targets.map((t: any) => ({
        noticeId: n.id,
        targetType: t.targetType,
        targetId: t.targetId,
      })),
    });
    return n;
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: finalFacilityId || undefined,
    action: status === "SCHEDULED" ? "NOTICE_SCHEDULED" : "NOTICE_CREATED",
    actionCategory: "OPERATIONS",
    severity: status === "SCHEDULED" ? "notice" : "info",
    source: "notice_board",
    resourceType: "notice",
    resourceId: notice.id,
    newValues: {
      title: notice.title,
      noticeType: notice.noticeType,
      priority: notice.priority,
      status: notice.status,
      visibilityScope: notice.visibilityScope,
      publishAt: notice.publishAt,
      expiresAt: notice.expiresAt,
      requiresAcknowledgement: notice.requiresAcknowledgement,
      isPinned: notice.isPinned,
      targetCount: targets.length,
    },
  });

  return NextResponse.json({ item: notice }, { status: 201 });
}

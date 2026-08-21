// =====================================================================
// API: /api/it-tickets/[id]/comments
//   GET  — list comments for a ticket
//   POST — add a comment (public or internal)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const ticket = await db.iTTicket.findUnique({ where: { id } });
  if (!ticket || ticket.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Non-IT staff can only see public comments
  const canSeeInternal = hasPermission(session, PERMISSIONS.IT_MANAGE);
  const where: any = { ticketId: id };
  if (!canSeeInternal) where.commentType = "public";

  const comments = await db.iTTicketComment.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ items: comments, count: comments.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { body: commentBody, commentType = "public" } = body;
  if (!commentBody) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }

  // Internal notes require IT_MANAGE permission
  if (commentType === "internal" && !hasPermission(session, PERMISSIONS.IT_MANAGE)) {
    return NextResponse.json({ error: "Only IT staff can add internal notes" }, { status: 403 });
  }

  const ticket = await db.iTTicket.findUnique({ where: { id } });
  if (!ticket || ticket.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const comment = await db.iTTicketComment.create({
    data: {
      ticketId: id,
      commentType,
      body: commentBody,
      authorId: session.user.id,
      authorName: session.user.name || session.user.username,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: ticket.facilityId || undefined,
    action: "IT_TICKET_COMMENT_ADDED",
    resourceType: "it_ticket",
    resourceId: id,
    newValues: { commentType, bodyLength: commentBody.length },
  });

  return NextResponse.json({ item: comment }, { status: 201 });
}

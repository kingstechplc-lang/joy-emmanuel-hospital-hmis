// =====================================================================
// API: /api/knowledge-base/[id]
//   GET    — fetch single article (increments view count)
//   PATCH  — update article (IT_MANAGE)
//   DELETE — delete article (IT_MANAGE)
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
  const { id } = await params;
  const article = await db.knowledgeBaseArticle.findUnique({ where: { id } });
  if (!article || article.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Increment view count
  await db.knowledgeBaseArticle.update({ where: { id }, data: { viewCount: { increment: 1 } } });
  return NextResponse.json({ item: article });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const existing = await db.knowledgeBaseArticle.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, authorId: _a, authorName: _an, viewCount: _v, ...updateData } = body;
  const updated = await db.knowledgeBaseArticle.update({ where: { id }, data: updateData });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "KB_ARTICLE_UPDATED",
    resourceType: "knowledge_base_article",
    resourceId: id,
  });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.knowledgeBaseArticle.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.knowledgeBaseArticle.delete({ where: { id } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "KB_ARTICLE_DELETED",
    resourceType: "knowledge_base_article",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}

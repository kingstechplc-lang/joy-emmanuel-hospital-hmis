// =====================================================================
// API: /api/knowledge-base
//   GET  — list/search articles
//   POST — create article (IT_MANAGE)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // All authenticated users can view published articles
  const url = new URL(req.url);
  const search = url.searchParams.get("search");
  const category = url.searchParams.get("category");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = {
    organizationId: session.user.organizationId,
    status: "published",
  };
  if (category && category !== "all") where.category = category;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
      { keywords: { contains: search, mode: "insensitive" } },
    ];
  }

  const articles = await db.knowledgeBaseArticle.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ items: articles, count: articles.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden — IT manage permission required" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, category, content, keywords, status } = body;
  if (!title || !content) {
    return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
  }

  const article = await db.knowledgeBaseArticle.create({
    data: {
      organizationId: session.user.organizationId,
      title,
      category: category || "general",
      content,
      keywords: keywords || null,
      status: status || "published",
      authorId: session.user.id,
      authorName: session.user.name || session.user.username,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "KB_ARTICLE_CREATED",
    resourceType: "knowledge_base_article",
    resourceId: article.id,
    newValues: { title, category },
  });

  return NextResponse.json({ item: article }, { status: 201 });
}

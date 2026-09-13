// =====================================================================
// API: /api/clinical-templates/[id]/favorite
//   POST   — toggle favorite status (add/remove from user's favorites)
//   PATCH  — update favorite (pin/unpin)
//   DELETE — remove from favorites (same as POST with action="remove")
//
// PERMISSIONS:
//   All require clinical_template.view
//
// BODY (POST): { action?: "add" | "remove" | "toggle" (default), pinned?: boolean }
// BODY (PATCH): { pinned: boolean }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// ─── POST /api/clinical-templates/[id]/favorite ──────────────────────
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_TEMPLATE_VIEW)) {
    return NextResponse.json({ error: "Forbidden — requires clinical_template.view" }, { status: 403 });
  }

  const { id } = await params;

  let body: any = {};
  try {
    const text = await req.text();
    if (text && text.trim() !== "") body = JSON.parse(text);
  } catch {
    // Empty body is fine — default action is "toggle"
  }

  const action = body.action || "toggle";
  const userId = session.user.id;

  try {
    // Verify the template exists and is in the user's org
    const template = await db.clinicalTemplate.findUnique({
      where: { id },
      select: { organizationId: true, status: true },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // IDOR: org check
    if (template.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Check if already favorited
    const existing = await db.clinicalTemplateFavorite.findUnique({
      where: { userId_templateId: { userId, templateId: id } },
    });

    let isFavorite: boolean;

    if (action === "add") {
      if (!existing) {
        await db.clinicalTemplateFavorite.create({
          data: { userId, templateId: id, pinned: false },
        });
      }
      isFavorite = true;
    } else if (action === "remove") {
      if (existing) {
        await db.clinicalTemplateFavorite.delete({
          where: { userId_templateId: { userId, templateId: id } },
        });
      }
      isFavorite = false;
    } else {
      // toggle
      if (existing) {
        await db.clinicalTemplateFavorite.delete({
          where: { userId_templateId: { userId, templateId: id } },
        });
        isFavorite = false;
      } else {
        await db.clinicalTemplateFavorite.create({
          data: { userId, templateId: id, pinned: false },
        });
        isFavorite = true;
      }
    }

    await auditLog({
      userId,
      organizationId: session.user.organizationId,
      action: isFavorite ? "CLINICAL_TEMPLATE_FAVORITED" : "CLINICAL_TEMPLATE_UNFAVORITED",
      resourceType: "clinical_template",
      resourceId: id,
    });

    return NextResponse.json({ isFavorite, templateId: id });
  } catch (e: any) {
    console.error("[POST /api/clinical-templates/[id]/favorite]", e);
    return NextResponse.json(
      { error: e.message || "Failed to toggle favorite" },
      { status: 500 }
    );
  }
}

// ─── PATCH /api/clinical-templates/[id]/favorite ───────────────────────
// Body: { pinned: boolean }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_TEMPLATE_VIEW)) {
    return NextResponse.json({ error: "Forbidden — requires clinical_template.view" }, { status: 403 });
  }

  const { id } = await params;

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { pinned } = body;
  const userId = session.user.id;

  try {
    const existing = await db.clinicalTemplateFavorite.findUnique({
      where: { userId_templateId: { userId, templateId: id } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Template is not favorited" }, { status: 404 });
    }

    const updated = await db.clinicalTemplateFavorite.update({
      where: { userId_templateId: { userId, templateId: id } },
      data: { pinned: !!pinned },
    });

    return NextResponse.json({ pinned: updated.pinned, templateId: id });
  } catch (e: any) {
    console.error("[PATCH /api/clinical-templates/[id]/favorite]", e);
    return NextResponse.json(
      { error: e.message || "Failed to update favorite" },
      { status: 500 }
    );
  }
}

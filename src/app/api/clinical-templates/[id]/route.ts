// =====================================================================
// API: /api/clinical-templates/[id]
//   GET    — fetch a single template (with its current version + history)
//   PUT    — update template metadata (name, description, category, etc.)
//            + create a new version if content is provided
//   DELETE — soft-delete (set status to "archived") — never hard-delete
//
// PERMISSIONS:
//   GET    requires  clinical_template.view  (or super_admin)
//   PUT    requires  clinical_template.update (or super_admin)
//          + the user must be the creator OR an admin (IDOR protection)
//   DELETE requires  clinical_template.update (archive)
//          + the user must be the creator OR an admin (IDOR protection)
//
// IDOR PROTECTION:
//   The server always validates that:
//     - The template belongs to the user's organization
//     - The user can access the template (scope visibility check)
//     - For PUT/DELETE: the user is the creator OR an admin
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  TEMPLATE_TYPES,
  TEMPLATE_SCOPES,
  isValidTransition,
  validateTemplateContent,
  buildTemplateVisibilityWhere,
  type TemplateType,
  type TemplateScope,
  type TemplateStatus,
} from "@/lib/clinical-templates/template-registry";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// ─── GET /api/clinical-templates/[id] ────────────────────────────────
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_TEMPLATE_VIEW)) {
    return NextResponse.json({ error: "Forbidden — requires clinical_template.view" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const template = await db.clinicalTemplate.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        approver: { select: { id: true, firstName: true, lastName: true } },
        facility: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        versions: {
          orderBy: { versionNumber: "desc" },
          select: {
            id: true, versionNumber: true, status: true,
            changeSummary: true, approvedAt: true, createdAt: true,
            effectiveDate: true,
          },
        },
        favorites: {
          where: { userId: session.user.id },
          select: { id: true, pinned: true, lastUsedAt: true },
        },
        _count: {
          select: { applications: true },
        },
      },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // IDOR: verify the template is in the user's organization
    if (template.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Visibility check — non-admins can only see templates in their visible scope
    const isSuperAdmin = session.user.roles.includes("super_admin");
    const isAdmin =
      isSuperAdmin ||
      session.user.roles.includes("organization_admin") ||
      session.user.roles.includes("facility_admin");
    if (!isAdmin && template.status !== "active") {
      // Non-admins can only see active templates
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    if (!isAdmin) {
      const visibleWhere = buildTemplateVisibilityWhere(session, true);
      const isVisible = await db.clinicalTemplate.count({
        where: { id, ...visibleWhere },
      });
      if (isVisible === 0) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }
    }

    return NextResponse.json({
      item: {
        ...template,
        tags: template.tags ? JSON.parse(template.tags) : [],
        isFavorite: template.favorites.length > 0,
        favoritePinned: template.favorites[0]?.pinned || false,
        lastUsedAt: template.favorites[0]?.lastUsedAt || null,
        applicationCount: template._count.applications,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/clinical-templates/[id]]", e);
    return NextResponse.json(
      { error: e.message || "Failed to load template" },
      { status: 500 }
    );
  }
}

// ─── PUT /api/clinical-templates/[id] ────────────────────────────────
// Body: {
//   name?, description?, category?, specialty?, tags?: string[],
//   content? (if provided, creates a new version with this content),
//   changeSummary? (required if content is provided — describes the change)
// }
// Returns: { item: { id, name, ..., newVersionId?, newVersionNumber? } }
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_TEMPLATE_UPDATE)) {
    return NextResponse.json({ error: "Forbidden — requires clinical_template.update" }, { status: 403 });
  }

  const { id } = await params;

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { name, description, category, specialty, tags, content, changeSummary } = body;

  try {
    const existing = await db.clinicalTemplate.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // IDOR: org check
    if (existing.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // IDOR: only the creator or admins can update
    const isSuperAdmin = session.user.roles.includes("super_admin");
    const isOrgAdmin = session.user.roles.includes("organization_admin");
    const isFacilityAdmin = session.user.roles.includes("facility_admin");
    if (
      !isSuperAdmin &&
      !isOrgAdmin &&
      !(isFacilityAdmin && existing.facilityId === session.user.facilityId) &&
      existing.creatorId !== session.user.id
    ) {
      return NextResponse.json(
        { error: "Forbidden — you can only update templates you created or that are in your facility" },
        { status: 403 }
      );
    }

    // Cannot update an archived template
    if (existing.status === "archived") {
      return NextResponse.json(
        { error: "Cannot update an archived template. Restore it to draft first." },
        { status: 400 }
      );
    }

    // ── Validate new content if provided ─────────────────────────────
    let newVersion: any = null;
    if (content) {
      if (!changeSummary || changeSummary.trim().length === 0) {
        return NextResponse.json(
          { error: "changeSummary is required when updating content (describes what changed)" },
          { status: 400 }
        );
      }

      const { valid, errors: contentErrors } = validateTemplateContent(
        existing.templateType as TemplateType,
        content
      );
      if (!valid) {
        return NextResponse.json(
          { error: "Invalid template content", errors: contentErrors },
          { status: 400 }
        );
      }

      // Create a new version (vN+1, draft status)
      const nextVersionNumber = (existing.versions[0]?.versionNumber || 0) + 1;
      newVersion = await db.clinicalTemplateVersion.create({
        data: {
          templateId: id,
          versionNumber: nextVersionNumber,
          content: JSON.stringify(content),
          status: "draft",
          changeSummary: changeSummary.trim(),
        },
      });
    }

    // ── Update template metadata ────────────────────────────────────
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (category !== undefined) updateData.category = category?.trim() || null;
    if (specialty !== undefined) updateData.specialty = specialty?.trim() || null;
    if (tags !== undefined) updateData.tags = tags ? JSON.stringify(tags) : null;

    let updated: any = existing;
    if (Object.keys(updateData).length > 0) {
      updated = await db.clinicalTemplate.update({
        where: { id },
        data: updateData,
      });
    }

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "CLINICAL_TEMPLATE_UPDATED",
      resourceType: "clinical_template",
      resourceId: id,
      oldValues: {
        name: existing.name,
        description: existing.description,
        category: existing.category,
        specialty: existing.specialty,
      },
      newValues: {
        name: updated.name,
        description: updated.description,
        category: updated.category,
        specialty: updated.specialty,
        newVersionId: newVersion?.id,
        newVersionNumber: newVersion?.versionNumber,
      },
    });

    return NextResponse.json({
      item: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        templateType: updated.templateType,
        scope: updated.scope,
        status: updated.status,
        currentVersionId: updated.currentVersionId,
        updatedAt: updated.updatedAt,
      },
      newVersion: newVersion
        ? { id: newVersion.id, versionNumber: newVersion.versionNumber, status: newVersion.status }
        : null,
    });
  } catch (e: any) {
    console.error("[PUT /api/clinical-templates/[id]]", e);
    return NextResponse.json(
      { error: e.message || "Failed to update template" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/clinical-templates/[id] ─────────────────────────────
// Soft-delete: sets status to "archived". Never hard-deletes — preserves
// the audit trail and historical applications.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_TEMPLATE_UPDATE)) {
    return NextResponse.json({ error: "Forbidden — requires clinical_template.update" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const existing = await db.clinicalTemplate.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // IDOR: org check
    if (existing.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // IDOR: only the creator or admins can delete
    const isSuperAdmin = session.user.roles.includes("super_admin");
    const isOrgAdmin = session.user.roles.includes("organization_admin");
    const isFacilityAdmin = session.user.roles.includes("facility_admin");
    if (
      !isSuperAdmin &&
      !isOrgAdmin &&
      !(isFacilityAdmin && existing.facilityId === session.user.facilityId) &&
      existing.creatorId !== session.user.id
    ) {
      return NextResponse.json(
        { error: "Forbidden — you can only delete templates you created or that are in your facility" },
        { status: 403 }
      );
    }

    // Soft-delete: archive the template
    const archived = await db.clinicalTemplate.update({
      where: { id },
      data: { status: "archived" as TemplateStatus },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "CLINICAL_TEMPLATE_ARCHIVED",
      resourceType: "clinical_template",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "archived" },
    });

    return NextResponse.json({
      archived: true,
      id: archived.id,
      status: archived.status,
    });
  } catch (e: any) {
    console.error("[DELETE /api/clinical-templates/[id]]", e);
    return NextResponse.json(
      { error: e.message || "Failed to archive template" },
      { status: 500 }
    );
  }
}

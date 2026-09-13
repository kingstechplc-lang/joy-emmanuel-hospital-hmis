// =====================================================================
// API: /api/clinical-templates
//   GET  — list templates visible to the user (filtered by scope + perms)
//   POST — create a new template (status: "draft")
//
// PERMISSIONS:
//   GET  requires  clinical_template.view  (or super_admin)
//   POST requires  clinical_template.create (or super_admin)
//
// ORGANIZATION ISOLATION:
//   Templates are always scoped to the session user's organizationId.
//   The buildTemplateVisibilityWhere() helper enforces scope visibility.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  TEMPLATE_TYPES,
  TEMPLATE_STATUSES,
  TEMPLATE_SCOPES,
  validateTemplateContent,
  buildTemplateVisibilityWhere,
  type TemplateType,
  type TemplateScope,
  type TemplateStatus,
} from "@/lib/clinical-templates/template-registry";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// ─── GET /api/clinical-templates ────────────────────────────────────
// Query params:
//   status     — filter by status (default: active; admins can pass "all")
//   type       — filter by template type
//   category   — filter by category
//   specialty  — filter by specialty
//   search     — search name + description
//   scope      — filter by scope
//   favoriteOnly — if "true", only return templates favorited by the user
//
// Returns: { items: [...], count: number }
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_TEMPLATE_VIEW)) {
    return NextResponse.json({ error: "Forbidden — requires clinical_template.view" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "active";
  const type = url.searchParams.get("type");
  const category = url.searchParams.get("category");
  const specialty = url.searchParams.get("specialty");
  const search = url.searchParams.get("search")?.trim();
  const scope = url.searchParams.get("scope");
  const favoriteOnly = url.searchParams.get("favoriteOnly") === "true";
  const includeInactive = status === "all";

  try {
    const baseWhere = buildTemplateVisibilityWhere(session, includeInactive);
    const where: any = { ...baseWhere };

    if (status !== "all") {
      where.status = status as TemplateStatus;
    }
    if (type) where.templateType = type as TemplateType;
    if (category) where.category = category;
    if (specialty) where.specialty = specialty;
    if (scope) where.scope = scope as TemplateScope;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }
    if (favoriteOnly) {
      where.favorites = { some: { userId: session.user.id } };
    }

    const templates = await db.clinicalTemplate.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        approver: { select: { id: true, firstName: true, lastName: true } },
        facility: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        _count: {
          select: {
            favorites: { where: { userId: session.user.id } },
            applications: true,
            versions: true,
          },
        },
      },
      take: 200,
    });

    return NextResponse.json({
      items: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        templateType: t.templateType,
        category: t.category,
        specialty: t.specialty,
        scope: t.scope,
        status: t.status,
        facility: t.facility,
        department: t.department,
        creator: t.creator,
        approver: t.approver,
        approvedAt: t.approvedAt,
        currentVersionId: t.currentVersionId,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        isFavorite: t._count.favorites > 0,
        applicationCount: t._count.applications,
        versionCount: t._count.versions,
      })),
      count: templates.length,
    });
  } catch (e: any) {
    console.error("[GET /api/clinical-templates]", e);
    return NextResponse.json(
      { error: e.message || "Failed to load templates" },
      { status: 500 }
    );
  }
}

// ─── POST /api/clinical-templates ───────────────────────────────────
// Body: {
//   name, description?, templateType, category?, specialty?,
//   scope (default: "organization"), facilityId?, departmentId?,
//   tags?: string[], content (JSON — the template items),
//   changeSummary? (description for the first version)
// }
// Returns: { item: { id, name, ... } } with 201 status
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_TEMPLATE_CREATE)) {
    return NextResponse.json({ error: "Forbidden — requires clinical_template.create" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const {
    name,
    description,
    templateType,
    category,
    specialty,
    scope = "organization",
    facilityId,
    departmentId,
    tags,
    content,
    changeSummary,
  } = body;

  // ── Validation ────────────────────────────────────────────────────
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!templateType || !TEMPLATE_TYPES.some((t) => t.value === templateType)) {
    return NextResponse.json(
      { error: `Invalid templateType. Valid: ${TEMPLATE_TYPES.map((t) => t.value).join(", ")}` },
      { status: 400 }
    );
  }
  if (!scope || !TEMPLATE_SCOPES.some((s) => s.value === scope)) {
    return NextResponse.json(
      { error: `Invalid scope. Valid: ${TEMPLATE_SCOPES.map((s) => s.value).join(", ")}` },
      { status: 400 }
    );
  }
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Validate content shape
  const { valid, errors: contentErrors } = validateTemplateContent(templateType as TemplateType, content);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid template content", errors: contentErrors },
      { status: 400 }
    );
  }

  // Scope validation:
  // - "personal" scope: always allowed (user's own private template)
  // - "department" scope: requires departmentId
  // - "facility" scope: requires facilityId
  // - "organization" scope: facilityId and departmentId must be null
  // - "system" scope: only super_admin can create (rarely used)
  const organizationId = session.user.organizationId;
  const userId = session.user.id;

  if (scope === "system" && !session.user.roles.includes("super_admin")) {
    return NextResponse.json(
      { error: "Only super_admin can create system-scoped templates" },
      { status: 403 }
    );
  }
  if (scope === "department" && !departmentId) {
    return NextResponse.json(
      { error: "departmentId is required for department-scoped templates" },
      { status: 400 }
    );
  }
  if (scope === "facility" && !facilityId) {
    // Default to user's active facility if not provided
    if (session.user.facilityId) {
      body.facilityId = session.user.facilityId;
    } else {
      return NextResponse.json(
        { error: "facilityId is required for facility-scoped templates (and you have no active facility)" },
        { status: 400 }
      );
    }
  }
  if (scope === "organization") {
    // Force facilityId and departmentId to null for org-scoped templates
    body.facilityId = null;
    body.departmentId = null;
  }

  // Facility access check — the user must have access to the specified facility
  if (body.facilityId) {
    const userFacilityIds = await db.user.findFirst({
      where: { id: userId },
      select: { userRoles: { select: { facilityId: true } } },
    });
    const assignedFacilityIds = userFacilityIds?.userRoles
      .map((r: any) => r.facilityId)
      .filter(Boolean) as string[];
    const isSuperAdmin = session.user.roles.includes("super_admin");
    const isOrgAdmin = session.user.roles.includes("organization_admin");
    if (
      !isSuperAdmin &&
      !isOrgAdmin &&
      assignedFacilityIds.length > 0 &&
      !assignedFacilityIds.includes(body.facilityId)
    ) {
      return NextResponse.json(
        { error: "You do not have access to the specified facility" },
        { status: 403 }
      );
    }
  }

  try {
    // Create template + first version in a transaction
    const template = await db.$transaction(async (tx) => {
      const created = await tx.clinicalTemplate.create({
        data: {
          organizationId,
          facilityId: body.facilityId || null,
          departmentId: body.departmentId || null,
          creatorId: userId,
          name: name.trim(),
          description: description?.trim() || null,
          templateType,
          category: category?.trim() || null,
          specialty: specialty?.trim() || null,
          scope: scope as TemplateScope,
          status: "draft",
          tags: tags ? JSON.stringify(tags) : null,
        },
      });

      // Create the first version (v1, draft status)
      const version = await tx.clinicalTemplateVersion.create({
        data: {
          templateId: created.id,
          versionNumber: 1,
          content: JSON.stringify(content),
          status: "draft",
          changeSummary: changeSummary || "Initial version",
        },
      });

      return { template: created, version };
    });

    await auditLog({
      userId,
      organizationId,
      action: "CLINICAL_TEMPLATE_CREATED",
      resourceType: "clinical_template",
      resourceId: template.template.id,
      newValues: {
        name,
        templateType,
        scope,
        versionId: template.version.id,
        versionNumber: 1,
      },
    });

    return NextResponse.json(
      {
        item: {
          id: template.template.id,
          name: template.template.name,
          description: template.template.description,
          templateType: template.template.templateType,
          scope: template.template.scope,
          status: template.template.status,
          currentVersionId: template.template.currentVersionId,
          createdAt: template.template.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("[POST /api/clinical-templates]", e);
    return NextResponse.json(
      { error: e.message || "Failed to create template" },
      { status: 500 }
    );
  }
}

// =====================================================================
// API: /api/clinical-templates/[id]/versions
//   GET  — list all versions of a template (metadata only — no content)
//   POST — create a new version of an existing template
//
// PERMISSIONS:
//   GET  requires  clinical_template.view
//   POST requires  clinical_template.update (creator or admin)
//
// VERSION CONTENT:
//   The full content JSON is only returned for a specific version via
//   GET /api/clinical-templates/[id]/versions/[versionId]. The list
//   endpoint returns only metadata (versionNumber, status, changeSummary,
//   approvedAt, createdAt) to keep the response small.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  validateTemplateContent,
  type TemplateType,
} from "@/lib/clinical-templates/template-registry";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// ─── GET /api/clinical-templates/[id]/versions ───────────────────────
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
      select: { organizationId: true, scope: true, status: true, creatorId: true, facilityId: true, currentVersionId: true },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // IDOR: org check
    if (template.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Non-admins can only see versions of active templates
    const isSuperAdmin = session.user.roles.includes("super_admin");
    const isAdmin =
      isSuperAdmin ||
      session.user.roles.includes("organization_admin") ||
      session.user.roles.includes("facility_admin");
    if (!isAdmin && template.status !== "active") {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const versions = await db.clinicalTemplateVersion.findMany({
      where: { templateId: id },
      orderBy: { versionNumber: "desc" },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        changeSummary: true,
        approvedAt: true,
        effectiveDate: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      items: versions,
      count: versions.length,
      currentVersionId: template.currentVersionId || null,
    });
  } catch (e: any) {
    console.error("[GET /api/clinical-templates/[id]/versions]", e);
    return NextResponse.json(
      { error: e.message || "Failed to load versions" },
      { status: 500 }
    );
  }
}

// ─── POST /api/clinical-templates/[id]/versions ──────────────────────
// Body: { content (JSON), changeSummary (string) }
// Returns: { item: { id, versionNumber, status, ... } } with 201
export async function POST(
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

  const { content, changeSummary } = body;

  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  if (!changeSummary || changeSummary.trim().length === 0) {
    return NextResponse.json({ error: "changeSummary is required (describes what changed)" }, { status: 400 });
  }

  try {
    const template = await db.clinicalTemplate.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // IDOR: org check
    if (template.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // IDOR: only the creator or admins can create new versions
    const isSuperAdmin = session.user.roles.includes("super_admin");
    const isOrgAdmin = session.user.roles.includes("organization_admin");
    const isFacilityAdmin = session.user.roles.includes("facility_admin");
    if (
      !isSuperAdmin &&
      !isOrgAdmin &&
      !(isFacilityAdmin && template.facilityId === session.user.facilityId) &&
      template.creatorId !== session.user.id
    ) {
      return NextResponse.json(
        { error: "Forbidden — you can only update templates you created or that are in your facility" },
        { status: 403 }
      );
    }

    // Cannot add versions to an archived template
    if (template.status === "archived") {
      return NextResponse.json(
        { error: "Cannot add versions to an archived template. Restore it to draft first." },
        { status: 400 }
      );
    }

    // Validate the new content
    const { valid, errors: contentErrors } = validateTemplateContent(
      template.templateType as TemplateType,
      content
    );
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid template content", errors: contentErrors },
        { status: 400 }
      );
    }

    // Create the new version (vN+1, draft status)
    const nextVersionNumber = (template.versions[0]?.versionNumber || 0) + 1;
    const version = await db.clinicalTemplateVersion.create({
      data: {
        templateId: id,
        versionNumber: nextVersionNumber,
        content: JSON.stringify(content),
        status: "draft",
        changeSummary: changeSummary.trim(),
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "CLINICAL_TEMPLATE_VERSION_CREATED",
      resourceType: "clinical_template",
      resourceId: id,
      newValues: {
        versionId: version.id,
        versionNumber: nextVersionNumber,
        changeSummary: changeSummary.trim(),
      },
    });

    return NextResponse.json(
      {
        item: {
          id: version.id,
          versionNumber: version.versionNumber,
          status: version.status,
          changeSummary: version.changeSummary,
          createdAt: version.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("[POST /api/clinical-templates/[id]/versions]", e);
    return NextResponse.json(
      { error: e.message || "Failed to create version" },
      { status: 500 }
    );
  }
}

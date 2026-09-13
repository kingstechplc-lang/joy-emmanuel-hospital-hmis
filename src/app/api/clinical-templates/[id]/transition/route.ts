// =====================================================================
// API: /api/clinical-templates/[id]/transition
//   POST — change the template's lifecycle status (draft → under_review →
//          approved → active → inactive → archived)
//
// This endpoint enforces the VALID_TRANSITIONS rules from the template
// registry. Only valid transitions are allowed; the server returns 400
// for invalid transitions with a helpful error message.
//
// PERMISSIONS:
//   POST (transition to "under_review", "inactive", "archived"):
//     requires clinical_template.update (creator or admin)
//   POST (transition to "approved"):
//     requires clinical_template.approve (admin only)
//   POST (transition to "active"):
//     requires clinical_template.activate (admin only)
//
// BODY:
//   { status: "draft" | "under_review" | "approved" | "active" | "inactive" | "archived",
//     reason?: string, versionId?: string (for approve/activate — which version) }
//
// WHEN APPROVING / ACTIVATING:
//   - The version specified by versionId (or the latest draft version) is
//     marked as approved/active.
//   - The template's currentVersionId is updated to point to this version.
//   - All other versions are marked as "archived" (preserved for history).
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  isValidTransition,
  TEMPLATE_STATUSES,
  VALID_TRANSITIONS,
  type TemplateStatus,
} from "@/lib/clinical-templates/template-registry";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Map target status → required permission
const STATUS_PERMISSIONS: Record<string, string> = {
  draft: PERMISSIONS.CLINICAL_TEMPLATE_UPDATE,
  under_review: PERMISSIONS.CLINICAL_TEMPLATE_UPDATE,
  approved: PERMISSIONS.CLINICAL_TEMPLATE_APPROVE,
  active: PERMISSIONS.CLINICAL_TEMPLATE_ACTIVATE,
  inactive: PERMISSIONS.CLINICAL_TEMPLATE_ACTIVATE,
  archived: PERMISSIONS.CLINICAL_TEMPLATE_UPDATE,
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { status: targetStatus, reason, versionId } = body;

  if (!targetStatus || !TEMPLATE_STATUSES.some((s) => s.value === targetStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Valid: ${TEMPLATE_STATUSES.map((s) => s.value).join(", ")}` },
      { status: 400 }
    );
  }

  // ── Permission check based on target status ────────────────────────
  const requiredPerm = STATUS_PERMISSIONS[targetStatus];
  if (!requiredPerm || !hasPermission(session, requiredPerm as any)) {
    return NextResponse.json(
      { error: `Forbidden — transitioning to '${targetStatus}' requires permission: ${requiredPerm}` },
      { status: 403 }
    );
  }

  try {
    const existing = await db.clinicalTemplate.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 5,
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // IDOR: org check
    if (existing.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // IDOR: only the creator or admins can transition (except approve/activate
    // which are admin-only by permission check above)
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
        { error: "Forbidden — you can only transition templates you created or that are in your facility" },
        { status: 403 }
      );
    }

    // ── Validate the transition ──────────────────────────────────────
    const currentStatus = existing.status as TemplateStatus;
    const target = targetStatus as TemplateStatus;
    if (!isValidTransition(currentStatus, target)) {
      return NextResponse.json(
        {
          error: `Invalid transition: '${currentStatus}' → '${target}'. Valid transitions: ${VALID_TRANSITIONS[currentStatus]?.join(", ") || "none"}`,
          currentStatus,
          targetStatus: target,
          validTransitions: VALID_TRANSITIONS[currentStatus] || [],
        },
        { status: 400 }
      );
    }

    // ── Perform the transition ───────────────────────────────────────
    let updateData: any = { status: target };
    let versionUpdate: any = null;

    // When transitioning to "approved" or "active", mark a version as approved/active
    if (target === "approved" || target === "active") {
      // Find the version to approve/activate
      let versionToApprove = versionId
        ? existing.versions.find((v: any) => v.id === versionId)
        : existing.versions.find((v: any) => v.status === "draft") || existing.versions[0];

      if (!versionToApprove) {
        return NextResponse.json(
          { error: "No version found to approve/activate. Create a version first." },
          { status: 400 }
        );
      }

      // Update the version status
      versionUpdate = await db.clinicalTemplateVersion.update({
        where: { id: (versionToApprove as any).id },
        data: {
          status: target,
          approvedAt: new Date(),
          approvedById: session.user.id,
        },
      });

      // Update the template's currentVersionId + approval metadata
      updateData.currentVersionId = (versionToApprove as any).id;
      if (target === "approved") {
        updateData.approverId = session.user.id;
        updateData.approvedAt = new Date();
      }
    }

    const updated = await db.clinicalTemplate.update({
      where: { id },
      data: updateData,
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: `CLINICAL_TEMPLATE_${target.toUpperCase()}`,
      resourceType: "clinical_template",
      resourceId: id,
      oldValues: { status: currentStatus },
      newValues: {
        status: target,
        reason: reason || null,
        versionId: versionUpdate?.id || null,
      },
    });

    return NextResponse.json({
      item: {
        id: updated.id,
        status: updated.status,
        currentVersionId: updated.currentVersionId,
        approverId: updated.approverId,
        approvedAt: updated.approvedAt,
      },
      version: versionUpdate
        ? { id: versionUpdate.id, status: versionUpdate.status, approvedAt: versionUpdate.approvedAt }
        : null,
    });
  } catch (e: any) {
    console.error("[POST /api/clinical-templates/[id]/transition]", e);
    return NextResponse.json(
      { error: e.message || "Failed to transition template" },
      { status: 500 }
    );
  }
}

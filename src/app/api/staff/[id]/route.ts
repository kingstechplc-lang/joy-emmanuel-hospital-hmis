// =====================================================================
// API: /api/staff/[id]
//   GET   — fetch a single staff record (with related entities)
//   PATCH — supports many lifecycle actions via body.action
//           update | change_status | transfer | promote | suspend |
//           activate | separate | link_user | add_credential |
//           add_document | add_assignment | disable | enable | add_facility
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function safeDate(v: any): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

function pickStr(v: any): string | undefined {
  if (typeof v !== "string") return undefined;
  return v;
}

function pickStrOrNull(v: any): string | null | undefined {
  if (v === undefined) return undefined; // do not change
  if (v === null || v === "") return null;
  return String(v);
}

const STAFF_INCLUDE = {
  user: {
    select: {
      id: true,
      username: true,
      email: true,
      phone: true,
      status: true,
      lastLoginAt: true,
    },
  },
  facility: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true } },
  supervisor: { select: { id: true, firstName: true, lastName: true, staffNumber: true, position: true } },
  staffFacilities: {
    include: {
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  },
  staffAssignments: {
    orderBy: { startDate: "desc" as const },
    include: {
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
    take: 50,
  },
  staffCredentials: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
  },
  staffStatusHistory: {
    orderBy: { effectiveDate: "desc" as const },
    take: 50,
  },
  staffDocuments: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
  },
};

function computeProfileCompletion(s: any): number {
  if (!s) return 0;
  const groups: { name: string; fields: any[]; weight: number }[] = [
    { name: "personal", fields: [s.firstName, s.lastName, s.dateOfBirth, s.gender], weight: 20 },
    { name: "contact", fields: [s.phone, s.email, s.address, s.city], weight: 15 },
    { name: "emergency", fields: [s.emergencyContactName, s.emergencyContactPhone], weight: 10 },
    { name: "employment", fields: [s.employmentType, s.employmentStartDate, s.hireDate, s.position, s.jobGrade], weight: 20 },
    { name: "professional", fields: [s.profession, s.specialty, s.licenseNumber, s.licenseExpiryDate], weight: 20 },
    { name: "assignment", fields: [s.facilityId, s.departmentId], weight: 15 },
  ];
  let pct = 0;
  for (const g of groups) {
    const filled = g.fields.filter((v) => v !== null && v !== undefined && v !== "").length;
    pct += (filled / g.fields.length) * g.weight;
  }
  return Math.round(pct);
}

// ---------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const staff = await db.staff.findUnique({
      where: { id },
      include: STAFF_INCLUDE,
    });

    if (!staff) return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    // Org scope check
    const user = await db.user.findUnique({ where: { id: staff.userId }, select: { organizationId: true } });
    if (!user || user.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    // Compute and persist profile completion if changed
    const completion = computeProfileCompletion(staff);
    if (completion !== staff.profileCompletion) {
      try {
        await db.staff.update({ where: { id }, data: { profileCompletion: completion } });
      } catch {
        /* non-fatal */
      }
    }

    // Privacy: Filter sensitive bank/tax fields unless caller has payroll permissions
    const canViewPayrollDetails = hasPermission(session, PERMISSIONS.PAYROLL_VIEW) || hasPermission(session, PERMISSIONS.COMPENSATION_MANAGE) || session.user.roles?.includes("super_admin");
    const staffData: any = { ...staff, profileCompletion: completion };
    if (!canViewPayrollDetails) {
      delete staffData.bankName;
      delete staffData.bankAccountNumber;
      delete staffData.bankAccountName;
      delete staffData.taxIdNumber;
      delete staffData.nationalId;
      delete staffData.payGrade;
      delete staffData.payrollId;
    }

    return NextResponse.json({ item: staffData });
  } catch (e: any) {
    console.error("[GET /api/staff/[id]] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to load staff" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_MANAGE)) {
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
  const action: string = body.action || "update";

  try {
    const existing = await db.staff.findUnique({ where: { id }, include: { user: true } });
    if (!existing) return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    if (existing.user.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    // ============================ update ============================
    if (action === "update") {
      const staffUpdate: any = {};
      const stringFields: (keyof typeof existing)[] = [
        "firstName", "middleName", "lastName", "preferredName", "gender",
        "email", "phone", "alternativePhone", "workEmail", "photoUrl",
        "professionalRole", "professionalRegistrationNumber", "profession",
        "specialty", "secondarySpecialty", "position", "jobGrade", "jobLevel",
        "licenseNumber", "licensingAuthority", "licenseStatus",
        "nationalId", "taxIdNumber", "bankName", "bankAccountNumber", "bankAccountName",
        "payGrade", "payrollId", "employeeNumber",
        "address", "city", "region", "country",
        "emergencyContactName", "emergencyContactRelationship", "emergencyContactPhone",
        "emergencyContactAltPhone", "emergencyContactAddress",
        "notes", "supervisorId", "facilityId", "departmentId",
        "employmentType", "staffCategory",
      ];
      for (const f of stringFields) {
        if (body[f] !== undefined) {
          // @ts-ignore — dynamic assignment
          staffUpdate[f] = pickStrOrNull(body[f]);
        }
      }
      // Status update via the "update" action is allowed but does not create history.
      // For audited status changes, use change_status action.
      if (typeof body.employmentStatus === "string") staffUpdate.employmentStatus = body.employmentStatus;

      const dateFields = [
        "dateOfBirth", "hireDate", "employmentStartDate", "probationStartDate", "probationEndDate",
        "confirmationDate", "contractStartDate", "contractEndDate", "licenseExpiryDate",
        "terminationDate", "resignationDate", "retirementDate", "separationDate",
      ];
      for (const f of dateFields) {
        if (body[f] !== undefined) {
          const d = safeDate(body[f]);
          staffUpdate[f] = d || null;
        }
      }

      if (typeof body.isClinical === "boolean") staffUpdate.isClinical = body.isClinical;
      if (typeof body.canPrescribe === "boolean") staffUpdate.canPrescribe = body.canPrescribe;

      // Employee number uniqueness check
      if (staffUpdate.employeeNumber && staffUpdate.employeeNumber !== existing.employeeNumber) {
        const clash = await db.staff.findFirst({
          where: { employeeNumber: staffUpdate.employeeNumber, NOT: { id } },
        });
        if (clash) {
          return NextResponse.json({ error: "Employee number already in use" }, { status: 409 });
        }
      }

      if (Object.keys(staffUpdate).length > 0) {
        await db.staff.update({ where: { id }, data: staffUpdate });
      }

      // Update linked user info too (firstName/lastName/email/phone)
      const userUpdate: any = {};
      if (typeof body.firstName === "string") userUpdate.firstName = body.firstName;
      if (typeof body.middleName === "string") userUpdate.middleName = body.middleName || null;
      if (typeof body.lastName === "string") userUpdate.lastName = body.lastName;
      if (typeof body.email === "string" && body.email && body.email !== existing.user.email) {
        const emailOwner = await db.user.findUnique({ where: { email: body.email } });
        if (emailOwner && emailOwner.id !== existing.userId) {
          return NextResponse.json({ error: "Email already in use" }, { status: 409 });
        }
        userUpdate.email = body.email;
      }
      if (typeof body.phone === "string") userUpdate.phone = body.phone || null;
      if (Object.keys(userUpdate).length > 0) {
        await db.user.update({ where: { id: existing.userId }, data: userUpdate });
      }

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: session.user.facilityId || existing.facilityId || undefined,
        action: "STAFF_UPDATED",
        resourceType: "staff",
        resourceId: id,
        oldValues: {
          firstName: existing.firstName,
          lastName: existing.lastName,
          professionalRole: existing.professionalRole,
          employmentStatus: existing.employmentStatus,
        },
        newValues: staffUpdate,
      });

      const updated = await db.staff.findUnique({ where: { id }, include: STAFF_INCLUDE });
      const completion = updated ? computeProfileCompletion(updated) : 0;
      if (updated && completion !== updated.profileCompletion) {
        await db.staff.update({ where: { id }, data: { profileCompletion: completion } });
      }
      return NextResponse.json({ item: updated ? { ...updated, profileCompletion: completion } : null });
    }

    // ====================== change_status ==========================
    if (action === "change_status") {
      const newStatus = pickStr(body.newStatus || body.employmentStatus);
      const reason = pickStr(body.reason);
      if (!newStatus) {
        return NextResponse.json({ error: "newStatus is required" }, { status: 400 });
      }
      const effectiveDate = safeDate(body.effectiveDate) || new Date();

      await db.$transaction(async (tx) => {
        await tx.staff.update({ where: { id }, data: { employmentStatus: newStatus } });
        await tx.staffStatusHistory.create({
          data: {
            staffId: id,
            previousStatus: existing.employmentStatus,
            newStatus,
            effectiveDate,
            reason: reason || null,
            authorizedById: id, // self-ref as placeholder authorizer
            authorizedAt: new Date(),
          },
        });
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: session.user.facilityId || existing.facilityId || undefined,
        action: "STAFF_STATUS_CHANGED",
        resourceType: "staff",
        resourceId: id,
        oldValues: { employmentStatus: existing.employmentStatus },
        newValues: { employmentStatus: newStatus, reason, effectiveDate },
        reason: reason || undefined,
      });

      const updated = await db.staff.findUnique({ where: { id }, include: STAFF_INCLUDE });
      return NextResponse.json({ item: updated });
    }

    // ============================ transfer ==========================
    if (action === "transfer") {
      const { facilityId, departmentId, position, supervisorId } = body;
      const reason = pickStr(body.reason);
      const startDate = safeDate(body.startDate) || new Date();

      // End-date any currently active assignment(s)
      await db.staffAssignment.updateMany({
        where: { staffId: id, status: "active" },
        data: { status: "completed", endDate: startDate },
      });

      // Update primary staff fields
      const staffUpdate: any = {};
      if (facilityId !== undefined) staffUpdate.facilityId = facilityId || null;
      if (departmentId !== undefined) staffUpdate.departmentId = departmentId || null;
      if (position !== undefined) staffUpdate.position = position || null;
      if (supervisorId !== undefined) staffUpdate.supervisorId = supervisorId || null;
      if (Object.keys(staffUpdate).length > 0) {
        await db.staff.update({ where: { id }, data: staffUpdate });
      }

      // Create new assignment record
      const assignment = await db.staffAssignment.create({
        data: {
          staffId: id,
          facilityId: facilityId || null,
          departmentId: departmentId || null,
          position: position || null,
          supervisorId: supervisorId || null,
          startDate,
          endDate: null,
          assignmentType: "transfer",
          status: "active",
          reason: reason || null,
          authorizedById: id,
        },
      });

      // Optionally update primary staff-facility link
      if (facilityId) {
        const existingLink = await db.staffFacility.findUnique({
          where: { staffId_facilityId: { staffId: id, facilityId } },
        });
        if (!existingLink) {
          await db.staffFacility.create({
            data: {
              staffId: id,
              facilityId,
              departmentId: departmentId || null,
              position: position || null,
              isPrimary: true,
              startDate,
              status: "active",
            },
          });
        } else {
          await db.staffFacility.update({
            where: { id: existingLink.id },
            data: {
              departmentId: departmentId || null,
              position: position || null,
              isPrimary: true,
              status: "active",
            },
          });
        }
      }

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: facilityId || session.user.facilityId || existing.facilityId || undefined,
        action: "STAFF_TRANSFERRED",
        resourceType: "staff",
        resourceId: id,
        oldValues: {
          facilityId: existing.facilityId,
          departmentId: existing.departmentId,
          position: existing.position,
        },
        newValues: { facilityId, departmentId, position, supervisorId, reason },
        reason: reason || undefined,
      });

      const updated = await db.staff.findUnique({ where: { id }, include: STAFF_INCLUDE });
      return NextResponse.json({ item: updated, assignment });
    }

    // ============================ promote ==========================
    if (action === "promote") {
      const { position, jobGrade, jobLevel, supervisorId } = body;
      const reason = pickStr(body.reason);
      const effectiveDate = safeDate(body.effectiveDate) || new Date();

      const staffUpdate: any = {};
      if (position !== undefined) staffUpdate.position = position || null;
      if (jobGrade !== undefined) staffUpdate.jobGrade = jobGrade || null;
      if (jobLevel !== undefined) staffUpdate.jobLevel = jobLevel || null;
      if (supervisorId !== undefined) staffUpdate.supervisorId = supervisorId || null;

      // End previous active assignment(s)
      await db.staffAssignment.updateMany({
        where: { staffId: id, status: "active" },
        data: { status: "superseded", endDate: effectiveDate },
      });

      if (Object.keys(staffUpdate).length > 0) {
        await db.staff.update({ where: { id }, data: staffUpdate });
      }

      const assignment = await db.staffAssignment.create({
        data: {
          staffId: id,
          facilityId: existing.facilityId,
          departmentId: existing.departmentId,
          position: position || existing.position || null,
          supervisorId: supervisorId || existing.supervisorId || null,
          startDate: effectiveDate,
          assignmentType: "promotion",
          status: "active",
          reason: reason || null,
          authorizedById: id,
        },
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId || session.user.facilityId || undefined,
        action: "STAFF_PROMOTED",
        resourceType: "staff",
        resourceId: id,
        oldValues: {
          position: existing.position,
          jobGrade: existing.jobGrade,
          jobLevel: existing.jobLevel,
        },
        newValues: { position, jobGrade, jobLevel, supervisorId, reason },
        reason: reason || undefined,
      });

      const updated = await db.staff.findUnique({ where: { id }, include: STAFF_INCLUDE });
      return NextResponse.json({ item: updated, assignment });
    }

    // ============================ suspend ==========================
    if (action === "suspend") {
      const reason = pickStr(body.reason);
      if (!reason) {
        return NextResponse.json({ error: "reason is required to suspend a staff member" }, { status: 400 });
      }
      const effectiveDate = safeDate(body.effectiveDate) || new Date();

      await db.$transaction(async (tx) => {
        await tx.staff.update({
          where: { id },
          data: {
            employmentStatus: "suspended",
            // Reflect on user account too so login is blocked
          },
        });
        await tx.staffStatusHistory.create({
          data: {
            staffId: id,
            previousStatus: existing.employmentStatus,
            newStatus: "suspended",
            effectiveDate,
            reason,
            authorizedById: id,
            authorizedAt: new Date(),
          },
        });
      });

      // Suspend the linked user account as well
      if (existing.userId) {
        await db.user.update({ where: { id: existing.userId }, data: { status: "disabled" } }).catch(() => {});
      }

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId || session.user.facilityId || undefined,
        action: "STAFF_SUSPENDED",
        resourceType: "staff",
        resourceId: id,
        oldValues: { employmentStatus: existing.employmentStatus },
        newValues: { employmentStatus: "suspended", reason },
        reason,
      });

      const updated = await db.staff.findUnique({ where: { id }, include: STAFF_INCLUDE });
      return NextResponse.json({ item: updated });
    }

    // ============================ activate ==========================
    if (action === "activate") {
      const reason = pickStr(body.reason);
      const effectiveDate = safeDate(body.effectiveDate) || new Date();

      await db.$transaction(async (tx) => {
        await tx.staff.update({ where: { id }, data: { employmentStatus: "active" } });
        await tx.staffStatusHistory.create({
          data: {
            staffId: id,
            previousStatus: existing.employmentStatus,
            newStatus: "active",
            effectiveDate,
            reason: reason || "Activated",
            authorizedById: id,
            authorizedAt: new Date(),
          },
        });
      });

      if (existing.userId) {
        await db.user.update({ where: { id: existing.userId }, data: { status: "active" } }).catch(() => {});
      }

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId || session.user.facilityId || undefined,
        action: "STAFF_ACTIVATED",
        resourceType: "staff",
        resourceId: id,
        oldValues: { employmentStatus: existing.employmentStatus },
        newValues: { employmentStatus: "active", reason },
        reason,
      });

      const updated = await db.staff.findUnique({ where: { id }, include: STAFF_INCLUDE });
      return NextResponse.json({ item: updated });
    }

    // ============================ separate =========================
    if (action === "separate") {
      const separationType = pickStr(body.separationType);
      const separationReason = pickStr(body.separationReason || body.reason);
      const separationDate = safeDate(body.separationDate) || new Date();
      if (!separationType || !separationReason) {
        return NextResponse.json(
          { error: "separationType and separationReason are required" },
          { status: 400 }
        );
      }

      // Determine new employment status based on separation type
      const statusMap: Record<string, string> = {
        resignation: "resigned",
        termination: "terminated",
        retirement: "retired",
        contract_expiry: "contract_expired",
        transfer_out: "inactive",
        other: "inactive",
      };
      const newStatus = statusMap[separationType] || "inactive";

      const staffUpdate: any = {
        employmentStatus: newStatus,
        separationType,
        separationReason,
        separationDate,
      };
      if (separationType === "resignation") staffUpdate.resignationDate = separationDate;
      if (separationType === "termination") staffUpdate.terminationDate = separationDate;
      if (separationType === "retirement") staffUpdate.retirementDate = separationDate;

      await db.$transaction(async (tx) => {
        await tx.staff.update({ where: { id }, data: staffUpdate });
        // End any active assignments
        await tx.staffAssignment.updateMany({
          where: { staffId: id, status: "active" },
          data: { status: "completed", endDate: separationDate },
        });
        await tx.staffStatusHistory.create({
          data: {
            staffId: id,
            previousStatus: existing.employmentStatus,
            newStatus,
            effectiveDate: separationDate,
            reason: separationReason,
            authorizedById: id,
            authorizedAt: new Date(),
          },
        });
      });

      // Disable the user account as well
      if (existing.userId) {
        await db.user.update({ where: { id: existing.userId }, data: { status: "disabled" } }).catch(() => {});
      }

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId || session.user.facilityId || undefined,
        action: "STAFF_SEPARATED",
        resourceType: "staff",
        resourceId: id,
        oldValues: { employmentStatus: existing.employmentStatus },
        newValues: { separationType, separationReason, separationDate, newStatus },
        reason: separationReason,
      });

      const updated = await db.staff.findUnique({ where: { id }, include: STAFF_INCLUDE });
      return NextResponse.json({ item: updated });
    }

    // ============================ link_user ========================
    if (action === "link_user") {
      const userId = pickStr(body.userId);
      if (!userId) {
        return NextResponse.json({ error: "userId is required" }, { status: 400 });
      }
      const targetUser = await db.user.findUnique({ where: { id: userId } });
      if (!targetUser || targetUser.organizationId !== session.user.organizationId) {
        return NextResponse.json({ error: "User not found in this organization" }, { status: 404 });
      }
      // Make sure this user doesn't already have a staff record
      const existingStaffForUser = await db.staff.findUnique({ where: { userId } });
      if (existingStaffForUser && existingStaffForUser.id !== id) {
        return NextResponse.json({ error: "This user is already linked to another staff record" }, { status: 409 });
      }

      // Swap userId: detach old user, attach new (we keep the old user row in place)
      // Prisma requires Staff.userId to be unique, so we set it directly.
      await db.staff.update({ where: { id }, data: { userId } });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId || session.user.facilityId || undefined,
        action: "STAFF_USER_LINKED",
        resourceType: "staff",
        resourceId: id,
        oldValues: { userId: existing.userId },
        newValues: { userId },
      });

      const updated = await db.staff.findUnique({ where: { id }, include: STAFF_INCLUDE });
      return NextResponse.json({ item: updated });
    }

    // ========================= add_credential ======================
    if (action === "add_credential") {
      const { credentialType, credentialName, issuingInstitution, issueDate, expiryDate, licenseNumber, notes, verificationStatus } = body;
      if (!credentialName) {
        return NextResponse.json({ error: "credentialName is required" }, { status: 400 });
      }
      const cred = await db.staffCredential.create({
        data: {
          staffId: id,
          credentialType: credentialType || null,
          credentialName,
          issuingInstitution: issuingInstitution || null,
          issueDate: safeDate(issueDate) || null,
          expiryDate: safeDate(expiryDate) || null,
          licenseNumber: licenseNumber || null,
          notes: notes || null,
          verificationStatus: verificationStatus || "pending",
          verifiedById: id,
          verifiedAt: verificationStatus === "verified" ? new Date() : null,
        },
      });
      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId || session.user.facilityId || undefined,
        action: "STAFF_CREDENTIAL_ADDED",
        resourceType: "staff_credential",
        resourceId: cred.id,
        newValues: { staffId: id, credentialType, credentialName, expiryDate },
      });
      const updated = await db.staff.findUnique({ where: { id }, include: STAFF_INCLUDE });
      return NextResponse.json({ item: updated, credential: cred }, { status: 201 });
    }

    // ========================= add_document ========================
    if (action === "add_document") {
      const { documentType, documentName, issueDate, expiryDate, notes, verificationStatus } = body;
      if (!documentName) {
        return NextResponse.json({ error: "documentName is required" }, { status: 400 });
      }
      const doc = await db.staffDocument.create({
        data: {
          staffId: id,
          documentType: documentType || null,
          documentName,
          issueDate: safeDate(issueDate) || null,
          expiryDate: safeDate(expiryDate) || null,
          notes: notes || null,
          verificationStatus: verificationStatus || "pending",
          verifiedById: id,
          verifiedAt: verificationStatus === "verified" ? new Date() : null,
        },
      });
      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId || session.user.facilityId || undefined,
        action: "STAFF_DOCUMENT_ADDED",
        resourceType: "staff_document",
        resourceId: doc.id,
        newValues: { staffId: id, documentType, documentName, expiryDate },
      });
      const updated = await db.staff.findUnique({ where: { id }, include: STAFF_INCLUDE });
      return NextResponse.json({ item: updated, document: doc }, { status: 201 });
    }

    // ========================= add_assignment ======================
    if (action === "add_assignment") {
      const { facilityId, departmentId, position, supervisorId, startDate, endDate, assignmentType, status, reason } = body;
      const startDateObj = safeDate(startDate) || new Date();
      // End currently active assignments if this is a new active one
      if (!status || status === "active") {
        await db.staffAssignment.updateMany({
          where: { staffId: id, status: "active" },
          data: { status: "superseded", endDate: startDateObj },
        });
      }
      const assignment = await db.staffAssignment.create({
        data: {
          staffId: id,
          facilityId: facilityId || existing.facilityId || null,
          departmentId: departmentId || existing.departmentId || null,
          position: position || existing.position || null,
          supervisorId: supervisorId || existing.supervisorId || null,
          startDate: startDateObj,
          endDate: safeDate(endDate) || null,
          assignmentType: assignmentType || "assignment",
          status: status || "active",
          reason: reason || null,
          authorizedById: id,
        },
      });
      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: facilityId || existing.facilityId || session.user.facilityId || undefined,
        action: "STAFF_ASSIGNMENT_ADDED",
        resourceType: "staff_assignment",
        resourceId: assignment.id,
        newValues: { staffId: id, facilityId, departmentId, position, assignmentType },
      });
      const updated = await db.staff.findUnique({ where: { id }, include: STAFF_INCLUDE });
      return NextResponse.json({ item: updated, assignment }, { status: 201 });
    }

    // ============== legacy: disable | enable | add_facility ==========
    if (action === "disable" || action === "enable") {
      const newStatus = action === "disable" ? "disabled" : "active";
      await db.user.update({
        where: { id: existing.userId },
        data: { status: newStatus },
      });
      if (action === "disable") {
        await db.staff.update({
          where: { id },
          data: { employmentStatus: "suspended", terminationDate: new Date() },
        });
        await db.staffStatusHistory.create({
          data: {
            staffId: id,
            previousStatus: existing.employmentStatus,
            newStatus: "suspended",
            effectiveDate: new Date(),
            reason: "Account disabled by admin",
            authorizedById: id,
          },
        });
      } else {
        await db.staff.update({
          where: { id },
          data: { employmentStatus: "active", terminationDate: null },
        });
        await db.staffStatusHistory.create({
          data: {
            staffId: id,
            previousStatus: existing.employmentStatus,
            newStatus: "active",
            effectiveDate: new Date(),
            reason: "Account enabled by admin",
            authorizedById: id,
          },
        });
      }
      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: session.user.facilityId || existing.facilityId || undefined,
        action: action === "disable" ? "STAFF_DISABLED" : "STAFF_ENABLED",
        resourceType: "staff",
        resourceId: id,
        oldValues: { employmentStatus: existing.employmentStatus },
        newValues: { employmentStatus: action === "disable" ? "suspended" : "active" },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "add_facility" && body.facilityId) {
      const link = await db.staffFacility.create({
        data: {
          staffId: id,
          facilityId: body.facilityId,
          departmentId: body.departmentId || null,
          position: body.position || null,
          isPrimary: body.isPrimary || false,
          status: "active",
          startDate: new Date(),
        },
      }).catch(() => null);
      if (!link) {
        // Already linked — fall through to update of position/department
        await db.staffFacility.updateMany({
          where: { staffId: id, facilityId: body.facilityId },
          data: {
            departmentId: body.departmentId || null,
            position: body.position || null,
            isPrimary: body.isPrimary || false,
          },
        });
      }
      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: body.facilityId,
        action: "STAFF_FACILITY_ADDED",
        resourceType: "staff_facility",
        resourceId: link?.id || id,
        newValues: { staffId: id, facilityId: body.facilityId, departmentId: body.departmentId, position: body.position },
      });
      const updated = await db.staff.findUnique({ where: { id }, include: STAFF_INCLUDE });
      return NextResponse.json({ item: updated }, { status: 201 });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e: any) {
    console.error("[PATCH /api/staff/[id]] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to update staff" }, { status: 500 });
  }
}

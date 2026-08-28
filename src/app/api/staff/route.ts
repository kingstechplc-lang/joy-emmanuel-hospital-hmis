// =====================================================================
// API: /api/staff
//   GET  — list staff (org-scoped) with extensive filters and search
//   POST — create user + staff + staff_facility link (transactional)
//          now accepts all expanded Staff fields
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import bcrypt from "bcryptjs";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// ---------------------------------------------------------------------
// Helpers — keep the route resilient to bad input
// ---------------------------------------------------------------------
function toBool(v: string | null | undefined): boolean | undefined {
  if (v === null || v === undefined) return undefined;
  const t = v.toLowerCase();
  if (t === "true" || t === "1" || t === "yes") return true;
  if (t === "false" || t === "0" || t === "no") return false;
  return undefined;
}

function safeDate(v: string | null | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") || "";
    const facilityId = url.searchParams.get("facilityId") || undefined;
    const departmentId = url.searchParams.get("departmentId") || undefined;
    const employmentType = url.searchParams.get("employmentType") || undefined;
    const employmentStatus = url.searchParams.get("employmentStatus") || url.searchParams.get("status") || undefined;
    const profession = url.searchParams.get("profession") || undefined;
    const staffCategory = url.searchParams.get("staffCategory") || undefined;
    const isClinicalParam = url.searchParams.get("isClinical");
    const isClinical = toBool(isClinicalParam);
    const limit = Math.min(Number(url.searchParams.get("limit") || 200), 500);

    // Scope to user's org via User.organizationId
    const orgUsers = await db.user.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true },
    });
    const userIds = orgUsers.map((u) => u.id);

    const where: any = { userId: { in: userIds } };
    if (employmentStatus) where.employmentStatus = employmentStatus;
    if (employmentType) where.employmentType = employmentType;
    if (profession) where.profession = profession;
    if (staffCategory) where.staffCategory = staffCategory;
    if (typeof isClinical === "boolean") where.isClinical = isClinical;
    if (facilityId) where.facilityId = facilityId;
    if (departmentId) where.departmentId = departmentId;

    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { preferredName: { contains: q, mode: "insensitive" } },
        { staffNumber: { contains: q, mode: "insensitive" } },
        { employeeNumber: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { alternativePhone: { contains: q } },
        { email: { contains: q, mode: "insensitive" } },
        { workEmail: { contains: q, mode: "insensitive" } },
        { licenseNumber: { contains: q, mode: "insensitive" } },
        { professionalRole: { contains: q, mode: "insensitive" } },
        { profession: { contains: q, mode: "insensitive" } },
        { specialty: { contains: q, mode: "insensitive" } },
        { position: { contains: q, mode: "insensitive" } },
      ];
    }

    const staff = await db.staff.findMany({
      where,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: limit,
      include: {
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
        supervisor: { select: { id: true, firstName: true, lastName: true, staffNumber: true } },
        staffFacilities: {
          include: {
            facility: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
          },
        },
        _count: {
          select: {
            staffCredentials: true,
            staffAssignments: true,
            staffDocuments: true,
          },
        },
      },
    });

    const items = staff.map((s) => {
      const primary = s.staffFacilities.find((f) => f.isPrimary) || s.staffFacilities[0] || null;
      return {
        id: s.id,
        staffNumber: s.staffNumber,
        employeeNumber: s.employeeNumber,
        firstName: s.firstName,
        middleName: s.middleName,
        lastName: s.lastName,
        preferredName: s.preferredName,
        gender: s.gender,
        dateOfBirth: s.dateOfBirth,
        photoUrl: s.photoUrl,
        email: s.email,
        phone: s.phone,
        alternativePhone: s.alternativePhone,
        workEmail: s.workEmail,
        professionalRole: s.professionalRole,
        professionalRegistrationNumber: s.professionalRegistrationNumber,
        profession: s.profession,
        specialty: s.specialty,
        secondarySpecialty: s.secondarySpecialty,
        position: s.position,
        jobGrade: s.jobGrade,
        jobLevel: s.jobLevel,
        employmentStatus: s.employmentStatus,
        employmentType: s.employmentType,
        staffCategory: s.staffCategory,
        isClinical: s.isClinical,
        canPrescribe: s.canPrescribe,
        licenseNumber: s.licenseNumber,
        licensingAuthority: s.licensingAuthority,
        licenseExpiryDate: s.licenseExpiryDate,
        licenseStatus: s.licenseStatus,
        hireDate: s.hireDate,
        employmentStartDate: s.employmentStartDate,
        contractStartDate: s.contractStartDate,
        contractEndDate: s.contractEndDate,
        probationStartDate: s.probationStartDate,
        probationEndDate: s.probationEndDate,
        confirmationDate: s.confirmationDate,
        facilityId: s.facilityId,
        departmentId: s.departmentId,
        supervisorId: s.supervisorId,
        profileCompletion: s.profileCompletion,
        userId: s.userId,
        user: s.user,
        facility: s.facility,
        department: s.department,
        supervisor: s.supervisor,
        primaryFacility: primary
          ? {
              facilityId: primary.facilityId,
              facility: primary.facility,
              department: primary.department,
              position: primary.position,
            }
          : null,
        facilities: s.staffFacilities.map((sf) => ({
          id: sf.id,
          facilityId: sf.facilityId,
          facility: sf.facility,
          department: sf.department,
          position: sf.position,
          isPrimary: sf.isPrimary,
          status: sf.status,
        })),
        counts: s._count,
      };
    });

    return NextResponse.json({ items, count: items.length });
  } catch (e: any) {
    console.error("[GET /api/staff] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to load staff" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_MANAGE)) {
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
    // User-account fields (optional — staff record can exist without a login)
    username,
    password,
    // Personal info
    firstName,
    middleName,
    lastName,
    preferredName,
    gender,
    dateOfBirth,
    photoUrl,
    email,
    phone,
    alternativePhone,
    workEmail,
    // Professional
    professionalRole,
    professionalRegistrationNumber,
    profession,
    specialty,
    secondarySpecialty,
    position,
    jobGrade,
    jobLevel,
    // Employment
    employmentType,
    employmentStatus,
    staffCategory,
    isClinical,
    canPrescribe,
    hireDate,
    employmentStartDate,
    probationStartDate,
    probationEndDate,
    confirmationDate,
    contractStartDate,
    contractEndDate,
    // License
    licenseNumber,
    licensingAuthority,
    licenseExpiryDate,
    licenseStatus,
    // Identity & payroll
    nationalId,
    taxIdNumber,
    bankName,
    bankAccountNumber,
    bankAccountName,
    payGrade,
    payrollId,
    employeeNumber,
    // Address
    address,
    city,
    region,
    country,
    // Emergency contact
    emergencyContactName,
    emergencyContactRelationship,
    emergencyContactPhone,
    emergencyContactAltPhone,
    emergencyContactAddress,
    // Notes
    notes,
    // Assignment
    primaryFacilityId,
    departmentId,
    facilityId,
    supervisorId,
  } = body;

  if (!firstName || !lastName) {
    return NextResponse.json(
      { error: "firstName and lastName are required" },
      { status: 400 }
    );
  }

  // If a user account is requested, we need username + password + email
  const needsUserAccount = !!username || !!password;
  if (needsUserAccount) {
    if (!username || !password || !email) {
      return NextResponse.json(
        { error: "username, password and email are required when creating a user account" },
        { status: 400 }
      );
    }
  }

  const orgId = session.user.organizationId;

  // Validate facility belongs to org
  if (primaryFacilityId) {
    const facility = await db.facility.findUnique({ where: { id: primaryFacilityId } });
    if (!facility || facility.organizationId !== orgId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }
  if (facilityId) {
    const facility = await db.facility.findUnique({ where: { id: facilityId } });
    if (!facility || facility.organizationId !== orgId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  // Uniqueness checks
  if (username && (await db.user.findUnique({ where: { username } }))) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }
  if (email && (await db.user.findUnique({ where: { email } }))) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }
  if (employeeNumber) {
    const clash = await db.staff.findFirst({ where: { employeeNumber } });
    if (clash) {
      return NextResponse.json({ error: "Employee number already in use" }, { status: 409 });
    }
  }

  const passwordHash = needsUserAccount ? await bcrypt.hash(password, 10) : null;

  // Generate staff number if not provided: STF-YYYY-000001
  const year = new Date().getFullYear();
  const staffCount = await db.staff.count();
  const generatedStaffNumber = `STF-${year}-${String(staffCount + 1).padStart(6, "0")}`;
  const finalStaffNumber = body.staffNumber || generatedStaffNumber;

  try {
    const result = await db.$transaction(async (tx) => {
      let userId: string | undefined = undefined;
      if (needsUserAccount && passwordHash && username) {
        const user = await tx.user.create({
          data: {
            organizationId: orgId,
            username,
            email,
            passwordHash,
            firstName,
            middleName: middleName || null,
            lastName,
            phone: phone || null,
            status: "active",
            passwordChangedAt: new Date(),
          },
        });
        userId = user.id;
      } else if (email) {
        // Try to link to an existing user by email if present
        const existingUser = await tx.user.findUnique({ where: { email } });
        if (existingUser && existingUser.organizationId === orgId) {
          // Make sure this user doesn't already have a staff record
          const existingStaff = await tx.staff.findUnique({ where: { userId: existingUser.id } });
          if (!existingStaff) userId = existingUser.id;
        }
      }

      if (!userId) {
        // No user account could be linked/created — create a placeholder user
        // so we satisfy the Staff.userId @unique constraint (HMIS allows staff
        // without login but our schema requires a User row).
        const placeholderUsername = `staff_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const placeholderEmail = email || `${placeholderUsername}@staff.local`;
        const placeholderHash = await bcrypt.hash(Math.random().toString(36).slice(2), 10);
        const u = await tx.user.create({
          data: {
            organizationId: orgId,
            username: placeholderUsername,
            email: placeholderEmail,
            passwordHash: placeholderHash,
            firstName,
            middleName: middleName || null,
            lastName,
            phone: phone || null,
            status: "active",
            passwordChangedAt: new Date(),
          },
        });
        userId = u.id;
      }

      const staff = await tx.staff.create({
        data: {
          userId: userId!,
          staffNumber: finalStaffNumber,
          firstName,
          middleName: middleName || null,
          lastName,
          preferredName: preferredName || null,
          gender: gender || null,
          dateOfBirth: safeDate(dateOfBirth) || null,
          photoUrl: photoUrl || null,
          email: email || null,
          phone: phone || null,
          alternativePhone: alternativePhone || null,
          workEmail: workEmail || null,
          professionalRole: professionalRole || null,
          professionalRegistrationNumber: professionalRegistrationNumber || null,
          profession: profession || null,
          specialty: specialty || null,
          secondarySpecialty: secondarySpecialty || null,
          position: position || null,
          jobGrade: jobGrade || null,
          jobLevel: jobLevel || null,
          employmentStatus: employmentStatus || "active",
          employmentType: employmentType || "permanent",
          staffCategory: staffCategory || "clinical",
          isClinical: typeof isClinical === "boolean" ? isClinical : (staffCategory || "clinical") === "clinical",
          canPrescribe: typeof canPrescribe === "boolean" ? canPrescribe : false,
          hireDate: safeDate(hireDate) || (needsUserAccount ? new Date() : null),
          employmentStartDate: safeDate(employmentStartDate) || null,
          probationStartDate: safeDate(probationStartDate) || null,
          probationEndDate: safeDate(probationEndDate) || null,
          confirmationDate: safeDate(confirmationDate) || null,
          contractStartDate: safeDate(contractStartDate) || null,
          contractEndDate: safeDate(contractEndDate) || null,
          licenseNumber: licenseNumber || null,
          licensingAuthority: licensingAuthority || null,
          licenseExpiryDate: safeDate(licenseExpiryDate) || null,
          licenseStatus: licenseStatus || "active",
          nationalId: nationalId || null,
          taxIdNumber: taxIdNumber || null,
          bankName: bankName || null,
          bankAccountNumber: bankAccountNumber || null,
          bankAccountName: bankAccountName || null,
          payGrade: payGrade || null,
          payrollId: payrollId || null,
          employeeNumber: employeeNumber || null,
          address: address || null,
          city: city || null,
          region: region || null,
          country: country || null,
          emergencyContactName: emergencyContactName || null,
          emergencyContactRelationship: emergencyContactRelationship || null,
          emergencyContactPhone: emergencyContactPhone || null,
          emergencyContactAltPhone: emergencyContactAltPhone || null,
          emergencyContactAddress: emergencyContactAddress || null,
          notes: notes || null,
          createdById: session.user.id,
          facilityId: primaryFacilityId || facilityId || null,
          departmentId: departmentId || null,
          supervisorId: supervisorId || null,
        },
      });

      // Primary staff-facility link
      const facId = primaryFacilityId || facilityId;
      if (facId) {
        await tx.staffFacility.create({
          data: {
            staffId: staff.id,
            facilityId: facId,
            departmentId: departmentId || null,
            position: position || null,
            isPrimary: true,
            startDate: safeDate(hireDate) || new Date(),
            status: "active",
          },
        });
      }

      // Initial assignment record
      if (facId || departmentId || position) {
        await tx.staffAssignment.create({
          data: {
            staffId: staff.id,
            facilityId: facId || null,
            departmentId: departmentId || null,
            position: position || null,
            supervisorId: supervisorId || null,
            startDate: safeDate(hireDate) || new Date(),
            assignmentType: "assignment",
            status: "active",
            authorizedById: staff.id, // self-reference as authorizer placeholder
          },
        });
      }

      // Initial status history record
      await tx.staffStatusHistory.create({
        data: {
          staffId: staff.id,
          previousStatus: null,
          newStatus: employmentStatus || "active",
          effectiveDate: new Date(),
          reason: "Initial employment",
          authorizedById: staff.id,
        },
      });

      return { staff };
    });

    await auditLog({
      userId: session.user.id,
      organizationId: orgId,
      facilityId: primaryFacilityId || facilityId || session.user.facilityId || undefined,
      action: "STAFF_CREATED",
      resourceType: "staff",
      resourceId: result.staff.id,
      newValues: {
        firstName,
        lastName,
        email,
        professionalRole,
        profession,
        position,
        staffNumber: finalStaffNumber,
        employeeNumber,
        primaryFacilityId: primaryFacilityId || facilityId,
        departmentId,
        employmentType: employmentType || "permanent",
        employmentStatus: employmentStatus || "active",
      },
    });

    return NextResponse.json({ item: result.staff }, { status: 201 });
  } catch (e: any) {
    console.error("[POST /api/staff] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to create staff" }, { status: 400 });
  }
}

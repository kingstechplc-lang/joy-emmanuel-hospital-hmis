// =====================================================================
// API: /api/staff
//   GET  — list staff (org-scoped) with search by name, staff number, role
//   POST — create user + staff + staff_facility link (transactional)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import bcrypt from "bcryptjs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const facilityId = url.searchParams.get("facilityId") || undefined;
  const status = url.searchParams.get("status") || "";

  // Scope to user's org
  const orgUsers = await db.user.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const userIds = orgUsers.map((u) => u.id);

  const where: any = { userId: { in: userIds } };
  if (status) where.employmentStatus = status;
  if (q) {
    where.OR = [
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { staffNumber: { contains: q } },
      { professionalRole: { contains: q } },
      { email: { contains: q } },
    ];
  }
  if (facilityId) {
    where.staffFacilities = { some: { facilityId } };
  }

  const staff = await db.staff.findMany({
    where,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 200,
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
      staffFacilities: {
        include: {
          facility: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });

  const items = staff.map((s) => {
    const primary = s.staffFacilities.find((f) => f.isPrimary) || s.staffFacilities[0] || null;
    return {
      id: s.id,
      staffNumber: s.staffNumber,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      phone: s.phone,
      professionalRole: s.professionalRole,
      professionalRegistrationNumber: s.professionalRegistrationNumber,
      employmentStatus: s.employmentStatus,
      employmentType: s.employmentType,
      hireDate: s.hireDate,
      userId: s.userId,
      user: s.user,
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
    };
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    username,
    password,
    firstName,
    lastName,
    middleName,
    email,
    phone,
    professionalRole,
    professionalRegistrationNumber,
    employmentType,
    hireDate,
    primaryFacilityId,
    departmentId,
    position,
  } = body;

  if (!username || !password || !firstName || !lastName || !email) {
    return NextResponse.json(
      { error: "username, password, firstName, lastName, email are required" },
      { status: 400 }
    );
  }

  // Validate facility belongs to org
  if (primaryFacilityId) {
    const facility = await db.facility.findUnique({ where: { id: primaryFacilityId } });
    if (!facility || facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  // Uniqueness
  if (await db.user.findUnique({ where: { username } })) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }
  if (await db.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const orgId = session.user.organizationId;

  // Generate staff number: STF-YYYY-000001
  const year = new Date().getFullYear();
  const staffCount = await db.staff.count();
  const staffNumber = `STF-${year}-${String(staffCount + 1).padStart(6, "0")}`;

  try {
    const result = await db.$transaction(async (tx) => {
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

      const staff = await tx.staff.create({
        data: {
          userId: user.id,
          staffNumber,
          firstName,
          middleName: middleName || null,
          lastName,
          phone: phone || null,
          email,
          professionalRole: professionalRole || null,
          professionalRegistrationNumber: professionalRegistrationNumber || null,
          employmentStatus: "active",
          employmentType: employmentType || "full_time",
          hireDate: hireDate ? new Date(hireDate) : new Date(),
        },
      });

      if (primaryFacilityId) {
        await tx.staffFacility.create({
          data: {
            staffId: staff.id,
            facilityId: primaryFacilityId,
            departmentId: departmentId || null,
            position: position || null,
            isPrimary: true,
            startDate: hireDate ? new Date(hireDate) : new Date(),
            status: "active",
          },
        });
      }

      return { user, staff };
    });

    await auditLog({
      userId: session.user.id,
      organizationId: orgId,
      facilityId: primaryFacilityId || session.user.facilityId || undefined,
      action: "STAFF_CREATED",
      resourceType: "staff",
      resourceId: result.staff.id,
      newValues: {
        username,
        firstName,
        lastName,
        email,
        professionalRole,
        staffNumber,
        primaryFacilityId,
        departmentId,
        position,
      },
    });

    return NextResponse.json({ item: result.staff }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create staff" }, { status: 400 });
  }
}

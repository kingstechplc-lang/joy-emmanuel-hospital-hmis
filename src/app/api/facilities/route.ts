import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const facilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { departments: true, beds: true, staffFacilities: true } } },
  });

  return NextResponse.json({ facilities, items: facilities });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.FACILITY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, code, facilityType, address, city, region, country, phone, email, status } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  }

  const orgId = session.user.organizationId;

  // Check uniqueness within org
  const existing = await db.facility.findUnique({
    where: { organizationId_code: { organizationId: orgId, code } },
  });
  if (existing) {
    return NextResponse.json({ error: "Facility with this code already exists" }, { status: 409 });
  }

  try {
    const facility = await db.facility.create({
      data: {
        organizationId: orgId,
        name,
        code,
        facilityType: facilityType || "hospital",
        address: address || null,
        city: city || null,
        region: region || null,
        country: country || null,
        phone: phone || null,
        email: email || null,
        status: status || "active",
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: orgId,
      facilityId: facility.id,
      action: "FACILITY_CREATED",
      resourceType: "facility",
      resourceId: facility.id,
      newValues: { name, code, facilityType, city, status },
    });

    return NextResponse.json({ item: facility, facility }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create facility" }, { status: 400 });
  }
}

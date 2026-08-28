// =====================================================================
// API: /api/staff/export
//   GET — CSV export of staff records (org-scoped)
//   Columns: Staff Number, Employee Number, Name, Gender, Profession,
//            Position, Department, Facility, Employment Type,
//            Employment Status, Phone, Email, Hire Date, License Number,
//            License Expiry
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

function csvEscape(value: any): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const orgUsers = await db.user.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true },
    });
    const userIds = orgUsers.map((u) => u.id);

    const staff = await db.staff.findMany({
      where: { userId: { in: userIds } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: {
        facility: { select: { name: true } },
        department: { select: { name: true } },
      },
    });

    const headers = [
      "Staff Number",
      "Employee Number",
      "Name",
      "Gender",
      "Profession",
      "Position",
      "Department",
      "Facility",
      "Employment Type",
      "Employment Status",
      "Phone",
      "Email",
      "Hire Date",
      "License Number",
      "License Expiry",
    ];

    const rows = staff.map((s) => [
      s.staffNumber,
      s.employeeNumber,
      [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" "),
      s.gender,
      s.profession || s.professionalRole,
      s.position,
      s.department?.name,
      s.facility?.name,
      s.employmentType,
      s.employmentStatus,
      s.phone,
      s.email,
      formatDate(s.hireDate),
      s.licenseNumber,
      formatDate(s.licenseExpiryDate),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="staff-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/staff/export] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to export staff" },
      { status: 500 }
    );
  }
}

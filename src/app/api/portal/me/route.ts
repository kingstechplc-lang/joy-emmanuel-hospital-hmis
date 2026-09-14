// =====================================================================
// API: /api/portal/me
//   GET — returns the authenticated patient's profile
//
// Authorization: Bearer <portal-jwt>  (issued by /api/portal/auth/verify-otp)
//
// Returns:
//   {
//     account: { id, phone, status, lastLoginAt, ... },
//     patient: { id, patientNumber, firstName, lastName, sex, dateOfBirth, ... } | null,
//     needsIdentity: boolean   // true if account.patientId is null
//   }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalSessionFromRequest } from "@/lib/patient-portal/jwt";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getPortalSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Account + patient info
  const account = await db.patientPortalAccount.findUnique({
    where: { id: session.accountId },
    select: {
      id: true,
      phone: true,
      status: true,
      patientId: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  let patient = null;
  if (account.patientId) {
    patient = await db.patient.findUnique({
      where: { id: account.patientId },
      select: {
        id: true,
        patientNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        sex: true,
        dateOfBirth: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        // Explicitly exclude insuranceNumber, NHIS details, etc. — the
        // portal shouldn't expose staff-only fields
      },
    });
  }

  return NextResponse.json({
    account: {
      ...account,
      needsIdentity: account.patientId === null,
    },
    patient,
  });
}

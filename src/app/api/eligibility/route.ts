// =====================================================================
// API: /api/eligibility
//   GET  — list eligibility verifications (filter by patient, status)
//   POST — create a new eligibility verification (manual check)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = { organizationId: session.user.organizationId };
  if (patientId) where.patientId = patientId;
  if (status) where.verificationStatus = status;

  const items = await db.eligibilityVerification.findMany({
    where,
    orderBy: { verificationDate: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, phone: true } },
    },
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_CLAIM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { patientId, insuranceProviderId, membershipNumber, verificationStatus, coverageStatus, coverageStart, coverageEnd, verificationSource, verificationReference, notes } = body;

  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  const item = await db.eligibilityVerification.create({
    data: {
      organizationId: session.user.organizationId,
      patientId,
      insuranceProviderId: insuranceProviderId || null,
      membershipNumber: membershipNumber || null,
      verificationStatus: verificationStatus || "verified",
      coverageStatus: coverageStatus || null,
      coverageStart: coverageStart ? new Date(coverageStart) : null,
      coverageEnd: coverageEnd ? new Date(coverageEnd) : null,
      verificationSource: verificationSource || "manual",
      verificationReference: verificationReference || null,
      verifiedById: session.user.id,
      verifiedByName: session.user.name || undefined,
      notes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "ELIGIBILITY_VERIFIED",
    resourceType: "eligibilityVerification",
    resourceId: item.id,
    newValues: { patientId, verificationStatus, membershipNumber },
  });

  return NextResponse.json({ item }, { status: 201 });
}

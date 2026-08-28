// API: /api/training-certificates — GET (list) + POST (create with auto cert number)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { randomBytes } from "crypto";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

function generateCertNumber(orgId: string): string {
  const year = new Date().getFullYear();
  const random = randomBytes(4).toString("hex").toUpperCase();
  return `CERT-${year}-${random}`;
}

function generateVerificationCode(): string {
  return randomBytes(8).toString("hex").toUpperCase();
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_VIEW) && !hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const staffId = url.searchParams.get("staffId");
  const programId = url.searchParams.get("programId");
  const status = url.searchParams.get("status");
  const where: any = { organizationId: session.user.organizationId };
  if (staffId) where.staffId = staffId;
  if (programId) where.programId = programId;
  if (status) where.status = status;
  const items = await db.trainingCertificate.findMany({
    where,
    orderBy: { issueDate: "desc" },
    take: 500,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
      program: { select: { id: true, title: true, code: true } },
    },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_CERTIFICATE_MANAGE) && !hasPermission(session, PERMISSIONS.TRAINING_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { staffId, programId, enrollmentId, title, issueDate, expiryDate, issuingOrganization, documentUrl } = body;
  if (!staffId || !title) return NextResponse.json({ error: "staffId, title are required" }, { status: 400 });

  // Validate staff belongs to org
  const staff = await db.staff.findUnique({ where: { id: staffId }, include: { user: { select: { organizationId: true } } } });
  if (!staff || staff.user.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Invalid staff member" }, { status: 400 });

  // Generate unique certificate number
  let certNumber = generateCertNumber(session.user.organizationId);
  let attempts = 0;
  while (await db.trainingCertificate.findUnique({ where: { certificateNumber: certNumber } }) && attempts < 10) {
    certNumber = generateCertNumber(session.user.organizationId);
    attempts++;
  }

  // Generate unique verification code
  let verificationCode = generateVerificationCode();
  let vAttempts = 0;
  while (await db.trainingCertificate.findUnique({ where: { verificationCode } }) && vAttempts < 10) {
    verificationCode = generateVerificationCode();
    vAttempts++;
  }

  // Calculate expiry from program validity if not provided
  let calculatedExpiry = expiryDate ? new Date(expiryDate) : null;
  if (!calculatedExpiry && programId) {
    const program = await db.trainingProgram.findUnique({ where: { id: programId } });
    if (program?.validityMonths) {
      calculatedExpiry = new Date();
      calculatedExpiry.setMonth(calculatedExpiry.getMonth() + program.validityMonths);
    }
  }

  const item = await db.trainingCertificate.create({
    data: {
      organizationId: session.user.organizationId,
      certificateNumber: certNumber,
      verificationCode,
      staffId,
      programId: programId || null,
      enrollmentId: enrollmentId || null,
      title,
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      expiryDate: calculatedExpiry,
      issuingOrganization: issuingOrganization || null,
      documentUrl: documentUrl || null,
      status: "valid",
    },
  });

  // If there's an enrollment, mark it as completed
  if (enrollmentId) {
    await db.trainingEnrollment.update({ where: { id: enrollmentId }, data: { status: "completed" } }).catch(() => {});
  }

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "TRAINING_CERTIFICATE_ISSUED", resourceType: "training_certificate", resourceId: item.id, newValues: { staffId, title, certificateNumber: certNumber } });
  return NextResponse.json({ item }, { status: 201 });
}
